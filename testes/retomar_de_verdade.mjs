// RETOMAR UMA CONVERSA — contra a API DE VERDADE.
//
// Este é o critério de PRONTO da versão das conversas: *retomar uma conversa de outro dia
// continua o contexto*. Ele mora num arquivo separado de `testes/sessoes.mjs` por um motivo
// só: aqui a conta de quem roda é debitada. Lá, o SDK é dublê e a corrida é de graça.
//
// ⚠️ POR QUE UM DUBLÊ NÃO SERVE PARA ESTE CRITÉRIO. O dublê prova que a OFICINA MANDA
// `resume` ao SDK — e isso `sessoes.js` já prova. O que ninguém pode provar com dublê é que
// o outro lado, ao receber `resume`, realmente devolve o histórico daquela conversa. Um
// teste que só confere o que ele mesmo mandou é a definição de verde que aparece sozinho.
//
// ⚠️ O CONTROLE NEGATIVO É OBRIGATÓRIO AQUI. "O agente lembrou da palavra" não prova nada
// sozinho — poderia ser sorte, ou a palavra poderia estar vazando por outro caminho. Por
// isso a mesma pergunta é feita numa conversa NOVA, sem retomada: ali ele TEM que não
// saber. Sem esse par, este arquivo seria decoração cara.
//
// ⚠️ NÃO ESCREVE EM CONVERSA DE NINGUÉM. O teste cria a conversa dele, usa e pronto. Para a
// parte "de outro dia" ele pega uma conversa antiga REAL do disco e a retoma com
// `forkSession`, que faz o SDK gravar num id novo — a conversa original fica intacta.
//
// Uso:  node testes/retomar_de_verdade.mjs
//       (precisa de login do Claude nesta máquina, e GASTA a conta)
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const CAMINHO = f => path.join(REPO, 'extensoes', 'oficina-claude', f)
const { Conversa, ESTADO } = requerer(CAMINHO('agente.js'))
const { Sessoes, textoDaMensagem } = requerer(CAMINHO('sessoes.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok, detalhe: detalhe ?? '' })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`)
}

const esperar = ms => new Promise(r => setTimeout(r, ms))
async function ate(condicao, tetoMs) {
  const fim = Date.now() + tetoMs
  while (Date.now() < fim) {
    if (condicao()) return true
    await esperar(200)
  }
  return condicao()
}

/**
 * Abre uma conversa, manda UMA frase, espera a resposta inteira e encerra.
 * Devolve o texto que voltou e o id da conversa.
 */
async function umaRodada({ frase, retomar = null, bifurcar = false, cwd, tetoMs = 240000 }) {
  let texto = ''
  let sessao = null
  let erro = null
  let acabou = false

  const conversa = new Conversa({
    cwd,
    retomar,
    bifurcar,
    aoEvento: e => {
      if (e.tipo === 'texto') texto += e.texto
      if (e.tipo === 'pronto' && e.sessao) sessao = e.sessao
      if (e.tipo === 'erro') { erro = e.mensagem; acabou = true }
      // O turno acaba quando o motor volta a ficar ocioso depois de ter trabalhado.
      if (e.tipo === 'estado' && e.estado === ESTADO.OCIOSA && texto) acabou = true
      if (e.tipo === 'fim' || e.tipo === 'resultado') acabou = true
    },
  })

  await conversa.iniciar()
  if (conversa.estado === ESTADO.ERRO) {
    await conversa.encerrar().catch(() => { })
    return { texto: '', sessao: null, erro: 'não abriu a conversa' }
  }
  await conversa.enviar(frase)
  await ate(() => acabou || !!erro, tetoMs)
  // Uma folga curta para o último pedaço do texto chegar antes de fechar.
  await esperar(1500)
  sessao = sessao || conversa.sessaoId
  await conversa.encerrar().catch(() => { })
  return { texto, sessao, erro }
}

async function principal() {
  const cwd = process.cwd()
  // Uma marca que não existe em lugar nenhum do mundo, para o "ele lembrou" não ter como
  // ser coincidência nem conhecimento de fora.
  const MARCA = 'ZORVAX-' + Math.random().toString(36).slice(2, 8).toUpperCase()
  console.log('marca desta corrida:', MARCA, '\n')

  // ── 1. Uma conversa nova recebe um fato que só existe nela ──────────────────
  const primeira = await umaRodada({
    cwd,
    frase: `Guarde esta informação para depois: o código do armário é ${MARCA}. ` +
      `Responda apenas "guardado", sem mais nada.`,
  })
  checar('a conversa de origem abriu e respondeu', !primeira.erro && !!primeira.sessao,
    primeira.erro || primeira.sessao)
  if (!primeira.sessao) {
    console.log('\nsem conversa de origem não há o que retomar — parando aqui.')
    return terminar()
  }

  // ── 2. A MESMA conversa, retomada do disco, ainda sabe o fato ───────────────
  const retomada = await umaRodada({
    cwd,
    retomar: primeira.sessao,
    frase: 'Qual é o código do armário que eu te dei? Responda só o código.',
  })
  const lembrou = retomada.texto.includes(MARCA)
  checar('RETOMAR CONTINUA O CONTEXTO: o agente sabe o que foi dito na conversa anterior',
    lembrou, lembrou ? MARCA : JSON.stringify(retomada.texto.slice(0, 160)))
  checar('e a retomada continua na MESMA conversa (não nasce uma nova)',
    retomada.sessao === primeira.sessao, `${primeira.sessao} → ${retomada.sessao}`)

  // ── 3. ⛔ CONTROLE: sem retomada, o mesmo agente NÃO pode saber ─────────────
  const nova = await umaRodada({
    cwd,
    frase: 'Qual é o código do armário que eu te dei? Responda só o código, ou "não sei".',
  })
  const naoSabe = !nova.texto.includes(MARCA)
  checar('⛔ CONTROLE: conversa NOVA não sabe o código (senão o teste acima não provaria nada)',
    naoSabe, naoSabe ? 'não sabia, como esperado' : 'A MARCA VAZOU: ' + nova.texto.slice(0, 160))
  checar('⛔ CONTROLE: e a conversa nova é mesmo outra', nova.sessao !== primeira.sessao,
    `${nova.sessao}`)

  // ── 4. "DE OUTRO DIA": uma conversa antiga REAL, do disco ───────────────────
  // A conversa de origem acima nasceu nesta corrida. Este passo usa uma que já estava
  // gravada antes de hoje — que é o caso que o critério nomeia.
  //
  // ⚠️ ESTE PASSO ERROU DUAS VEZES ANTES DE MEDIR O QUE DIZ MEDIR, e as duas por causa da
  // PERGUNTA, não do produto. Fica registrado porque a armadilha é sutil:
  //
  //   1ª: perguntava "sobre o que nós conversamos antes?" e reprovava com "SEM HISTORICO".
  //       A conversa antiga desta pasta tem duas linhas ("responda apenas: vivo" → "vivo"):
  //       assunto nenhum. O agente respondeu o que era razoável, e o teste chamou de defeito.
  //       Ele media a INTERPRETAÇÃO do modelo sobre o que conta como "conversar".
  //   2ª: pedia a frase literal E oferecia a saída "responda SEM HISTORICO se não recebeu
  //       histórico". O agente pegou a saída — com o histórico na mão. Medido logo depois,
  //       sem essa saída, a MESMA conversa de 6,3 dias respondeu "vivo": o texto estava lá o
  //       tempo todo. Uma alternativa oferecida na pergunta é uma resposta sugerida.
  //
  // Agora a pergunta é fechada e o alvo é um fato do arquivo: repetir o que ele mesmo
  // respondeu. Ou a palavra volta, ou não volta.
  const arquivo = new Sessoes({ cwd })
  let antigas = []
  try { antigas = await arquivo.listar() } catch (e) { console.log('não li a lista:', e.message) }

  // ⚠️ Por caminho, e não pelo nome do pacote: o SDK está instalado dentro da pasta da
  // extensão, não na raiz do repositório — `import('@anthropic-ai/...')` daqui não acha.
  const sdk = await import(pathToFileURL(
    path.join(REPO, 'extensoes', 'oficina-claude', 'node_modules', '@anthropic-ai',
      'claude-agent-sdk', 'sdk.mjs')).href)
  const dirNormal = cwd.replace(/\\/g, '/')

  // A melhor candidata é a conversa antiga cuja ÚLTIMA resposta do agente seja curta: uma
  // resposta curta se repete inteira, e a comparação não depende de o modelo reproduzir
  // parágrafos palavra por palavra.
  let escolhida = null
  let ultimaResposta = ''
  for (const c of antigas) {
    if (!c.modificadaEm || c.id === primeira.sessao) continue
    if ((Date.now() - c.modificadaEm) / 86400000 < 1) continue
    let msgs = []
    try { msgs = await sdk.getSessionMessages(c.id, { dir: dirNormal }) } catch { continue }
    const respostas = msgs.filter(m => m && m.type === 'assistant')
      .map(m => textoDaMensagem(m).trim()).filter(t => t.length >= 3 && t.length <= 200)
    if (!respostas.length) continue
    const ultima = respostas[respostas.length - 1]
    if (!escolhida || ultima.length < ultimaResposta.length) { escolhida = c; ultimaResposta = ultima }
  }

  if (!escolhida) {
    checar('havia uma conversa de outro dia, com resposta curta, para retomar', false,
      'não achei nenhuma com mais de 1 dia e resposta aproveitável — este critério NÃO foi medido')
  } else {
    const idade = ((Date.now() - escolhida.modificadaEm) / 86400000).toFixed(1)
    // ⚠️ Pergunta fechada e SEM alternativa de fuga. Ver o bloco acima.
    const PERGUNTA = 'Sem usar ferramenta nenhuma e sem explicar nada: repita exatamente o que ' +
      'você já me respondeu nesta conversa.'
    const velha = await umaRodada({
      cwd,
      retomar: escolhida.id,
      // ⚠️ EM CÓPIA. Esta é uma conversa real de quem usa o computador: o teste lê o
      // histórico dela e grava o que disser num id novo. A original não é tocada.
      bifurcar: true,
      frase: PERGUNTA,
    })

    const simplificar = t => String(t).toLowerCase().replace(/[^a-z0-9à-ÿ ]/gi, ' ').replace(/\s+/g, ' ').trim()
    const alvo = simplificar(ultimaResposta)
    const repetiu = simplificar(velha.texto).includes(alvo)
    checar(`CONVERSA DE OUTRO DIA (${idade} dias): o agente repete o que só existe no histórico dela`,
      repetiu, repetiu ? JSON.stringify(ultimaResposta.slice(0, 80)) : 'esperava ' +
        JSON.stringify(ultimaResposta.slice(0, 60)) + ', veio ' + JSON.stringify(velha.texto.slice(0, 120)))

    // ⛔ CONTROLE: a mesma pergunta SEM retomada não pode acertar.
    const semNada = await umaRodada({ cwd, frase: PERGUNTA })
    const naoAcertou = !simplificar(semNada.texto).includes(alvo)
    checar('⛔ CONTROLE: sem retomada, o agente NÃO sabe o que foi dito na conversa antiga',
      naoAcertou, naoAcertou ? 'não sabia, como esperado' : 'VAZOU: ' + semNada.texto.slice(0, 120))

    // A prova que não depende de nenhuma palavra do modelo: a cópia contém, no próprio
    // arquivo, as mensagens da conversa de origem.
    let copiaTem = false
    if (velha.sessao && velha.sessao !== escolhida.id) {
      try {
        const msgsCopia = await sdk.getSessionMessages(velha.sessao, { dir: dirNormal })
        copiaTem = msgsCopia.some(m => simplificar(textoDaMensagem(m)) === alvo)
      } catch { }
    }
    checar('a cópia da retomada carrega as mensagens da conversa original', copiaTem,
      `${escolhida.id} → ${velha.sessao}`)

    // E a original ficou intocada: o teste não escreveu na conversa de ninguém.
    let originalIntacta = false
    try {
      const depois = await sdk.getSessionMessages(escolhida.id, { dir: dirNormal })
      originalIntacta = !depois.some(m => textoDaMensagem(m).includes('repita exatamente'))
    } catch { }
    checar('e a conversa ORIGINAL não foi tocada pelo teste', originalIntacta)
  }

  terminar()
}

function terminar() {
  const falhas = resultados.filter(r => !r.ok)
  console.log('\n' + JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
  process.exit(falhas.length ? 1 : 0)
}

principal().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1) })
