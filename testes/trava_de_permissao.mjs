// AS REGRAS DE PERMISSAO DO PROJETO VALEM DENTRO DA OFICINA — o coração 2 do plano.
//
// A pergunta, nas palavras do plano: *"o hook de trava dispara em comando proibido
// lançado de dentro da OFICINA?"*. Se a resposta for não, o editor vira um jeito de
// contornar as regras da casa sem querer — alguém pede algo em português, o agente
// executa, e a regra que existia para proteger a máquina não valeu.
//
// ⚠️ O QUE ESTE TESTE CUSTA, declarado: ele manda DUAS mensagens curtas ("oi"), uma por
// pasta, na conta de quem roda. Não é desperdício nem descuido — é o mínimo medido para
// a pergunta ser respondível, e a alternativa era não ter o critério.
//
// Por que não dá para fazer de graça: `initializationResult()` é um canal de controle
// que responde sem consumir a fila (traz conta, modelos, comandos, modo) — mas
// **não traz `tools`**, conferido campo a campo em 10/09/2026. E, em modo de entrada
// contínua, o SDK não emite NADA antes da primeira mensagem: testado com uma fila que
// nunca entrega, 20 s, zero mensagens. Sem mandar uma, não há lista de ferramentas.
//
// Por que a pergunta é essa e não "peça um comando proibido e veja se ele roda": aquilo
// dependeria de o MODELO decidir usar a ferramenta, o que muda a cada corrida. O que se
// mede aqui é anterior e mais forte — a ferramenta negada **some da lista que o SDK
// anuncia**, e ferramenta fora da lista não é oferecida ao modelo. Não há o que decidir.
//
// ⚠️ E O PAR É OBRIGATÓRIO. "A ferramenta não apareceu" não prova nada sozinho: pode
// nunca ter aparecido. Este teste abre DUAS pastas — uma com `deny`, uma limpa — e só
// dá verde se a ferramenta **sumiu de uma e está na outra**. É a lição mais cara deste
// projeto: no V0.5 a mesma medição deu "verde" duas vezes usando um marcador que já
// estava fora antes de qualquer `deny` existir.
//
// ⚠️ UMA CORRIDA POR VEZ: este teste abre o editor duas vezes.
//
// Uso:  node testes/trava_de_permissao.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const exe = acharExe(process.argv[2])
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

/** A ferramenta usada como marcador. `Bash` é a que as regras de permissao do projeto costumam governar. */
const MARCADOR = 'Bash'

/*
  ⚠️ O QUE ESTE TESTE MEDE É PRESENÇA, NÃO CONTAGEM — e vale dizer por quê, porque os
  números que ele imprime parecem estranhos e a próxima pessoa vai reparar.

  Medido em 10/09/2026, na mesma corrida: pasta limpa **33** ferramentas, pasta com
  `deny` **51**, e com `bypassPermissions` ligado **151**. Ou seja: a pasta com uma
  regra a MAIS chegou a anunciar mais ferramentas que a pasta sem regra nenhuma.

  ⚠️ **Não sei explicar essas contagens.** A hipótese razoável é que a lista inclua
  coisas que variam por sessão (servidores MCP, plugins, skills carregadas), mas isso
  **não foi medido** e não vou registrar como se fosse.

  O que importa: o critério nunca compara TAMANHO de lista. Ele pergunta se o marcador
  está DENTRO — e essa pergunta é imune à variação acima. Se um dia alguém trocar isto
  por uma comparação de contagem, o teste passa a medir o barulho em vez do sinal.
*/

/**
 * Monta uma pasta de projeto descartável.
 * Com `negar`, ela ganha o `.claude/settings.json` que nega o marcador — o mesmo
 * mecanismo padrao de `permissions.deny` (`permissions.deny`).
 */
function montarProjeto(nome, { negar }) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), `oficina-trava-${nome}-`))
  fs.writeFileSync(path.join(p, 'leiame.txt'), 'projeto de teste\n', 'utf8')
  if (negar) {
    fs.mkdirSync(path.join(p, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(p, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { deny: [MARCADOR] } }, null, 2), 'utf8')
  }
  return p
}

/**
 * Abre a OFICINA na pasta e devolve a lista de ferramentas que o agente recebeu.
 *
 * `modo` liga um modo de permissão ANTES da primeira mensagem — é o que permite medir
 * o cruzamento com `bypassPermissions`, apontado pela revisao de seguranca em 10/09/2026.
 */
async function ferramentasDaPasta(_electron, projeto, modo = null) {
  const app = await abrirOficina(_electron, { exe, projeto, area: projeto })
  try {
    const pagina = await app.firstWindow({ timeout: 60000 })
    await esconderJanela(app)
    await pagina.waitForLoadState('domcontentloaded')

    // Achar o frame do painel pelo elemento que só ele tem.
    const fim = Date.now() + 60000
    let frame = null
    while (Date.now() < fim && !frame) {
      for (const f of pagina.frames()) {
        try { if (await f.evaluate(() => !!document.getElementById('entrada'))) { frame = f; break } }
        catch { }
      }
      if (!frame) await respirar(500)
    }
    if (!frame) return { erro: 'o painel não abriu' }

    // ⚠️ ESPERAR A CONVERSA FICAR PRONTA ANTES DE MANDAR QUALQUER COISA.
    //
    // Sem isto o teste é uma corrida, e foi: em corridas idênticas ele mediu 53, 33 e
    // **0** ferramentas (10/09/2026). A causa era clicar em "Enviar" enquanto a
    // conversa ainda abria — a mensagem era recusada, o `init` que traz a lista nunca
    // chegava, e o controle positivo caía com o produto certo.
    //
    // O produto também foi consertado (agora toda recusa volta para a tela, em vez de
    // sumir), mas isso não dispensa a espera aqui: um teste que corre com o programa
    // mede o relógio, não o comportamento.
    const ficouPronta = await frame.evaluate(async () => {
      const inicio = Date.now()
      while (Date.now() - inicio < 90000) {
        const e = document.getElementById('ponto')?.dataset?.estado
        if (e && e !== 'abrindo') return e
        await new Promise(r => setTimeout(r, 200))
      }
      return document.getElementById('ponto')?.dataset?.estado || '(sem ponto)'
    })
    if (ficouPronta === 'abrindo' || ficouPronta === '(sem ponto)') {
      return { erro: `a conversa nao ficou pronta em 90 s (estado: ${ficouPronta})` }
    }

    // Ligar o modo pedido ANTES da primeira mensagem, pelo mesmo seletor que a pessoa
    // usa — não por um atalho de teste. O que se mede é o caminho real.
    //
    // ⚠️ E CONFERIR QUE O MODO LIGOU. Até 10/09/2026 este bloco trocava o seletor, esperava
    // 2 s e seguia — nunca perguntava se a troca tinha valido. O retrato daquela noite
    // mostrou que a troca para `bypassPermissions` FALHA (o SDK exige
    // `allowDangerouslySkipPermissions`, que o produto não passa), e o seletor volta
    // sozinho para "pergunta sempre". Ou seja: o critério do pior caso ficava verde
    // medindo o modo PADRÃO. Sem a confirmação do host, não há pior caso medido.
    if (modo) {
      const resposta = await frame.evaluate(async m => {
        delete document.body.dataset.respostaDoModo
        const sel = document.getElementById('modo')
        sel.value = m
        sel.dispatchEvent(new Event('change', { bubbles: true }))
        const inicio = Date.now()
        while (Date.now() - inicio < 15000) {
          const r = document.body.dataset.respostaDoModo
          if (r) return r
          await new Promise(x => setTimeout(x, 200))
        }
        return '(o host nao respondeu em 15 s)'
      }, modo)
      if (resposta !== `${modo}|ok`) {
        return { erro: `o modo ${modo} NAO ligou (${resposta}) — o pior caso nao foi medido` }
      }
    }

    // ⚠️ MANDAR UMA MENSAGEM. É o gasto declarado no cabeçalho, e é o único caminho:
    // a lista de ferramentas só existe no `system/init`, que só chega depois que a
    // primeira mensagem entra na fila.
    await frame.evaluate(() => {
      const ent = document.getElementById('entrada')
      ent.value = 'oi'
      ent.dispatchEvent(new Event('input', { bubbles: true }))
      document.getElementById('enviar').click()
    })

    // Esperar o `init` chegar — é ele que traz a lista.
    const lista = await frame.evaluate(async () => {
      const inicio = Date.now()
      while (Date.now() - inicio < 90000) {
        const f = document.body.dataset.ferramentas
        if (f) return f
        await new Promise(r => setTimeout(r, 300))
      }
      return document.body.dataset.ferramentas || ''
    })
    return { lista: lista ? lista.split(',').filter(Boolean) : [] }
  } finally {
    await fecharApp(app)
  }
}

const _electron = await carregarElectron()
const pastaLimpa = montarProjeto('limpa', { negar: false })
const pastaComDeny = montarProjeto('deny', { negar: true })

try {
  // ── O CONTROLE POSITIVO PRIMEIRO ────────────────────────────────────────────
  // Se a ferramenta não estiver na pasta limpa, nada abaixo significa coisa alguma —
  // e o teste diz isso em vez de dar um verde vazio.
  const limpa = await ferramentasDaPasta(_electron, pastaLimpa)
  const temNaLimpa = !limpa.erro && limpa.lista.includes(MARCADOR)
  checar(`CONTROLE POSITIVO: numa pasta sem regra, ${MARCADOR} ESTA na lista`, temNaLimpa,
    limpa.erro || `${limpa.lista.length} ferramentas${temNaLimpa ? '' : ' — e ' + MARCADOR + ' nao esta entre elas'}`)

  // ── E AGORA O QUE INTERESSA ─────────────────────────────────────────────────
  const comDeny = await ferramentasDaPasta(_electron, pastaComDeny)
  const sumiu = !comDeny.erro && !comDeny.lista.includes(MARCADOR)

  checar(`criterio 7: com o deny do projeto, ${MARCADOR} SOME da lista dentro da OFICINA`,
    temNaLimpa && sumiu,
    comDeny.erro || (temNaLimpa
      ? `${comDeny.lista.length} ferramentas, ${MARCADOR} ${sumiu ? 'ausente' : 'PRESENTE'}`
      : 'sem o controle positivo, este criterio nao prova nada'))

  // A lista tem que continuar existindo: se ela viesse VAZIA nos dois casos, o
  // critério acima ficaria verde por um defeito (o agente sem ferramenta nenhuma).
  checar('a lista de ferramentas nao veio vazia (o verde acima nao e por defeito)',
    !comDeny.erro && comDeny.lista.length > 5,
    comDeny.erro || `${comDeny.lista.length} ferramentas com o deny aplicado`)

  // ── O CRUZAMENTO QUE FALTAVA: bypassPermissions × regra de permissao do projeto ────────────
  //
  // ⚠️ ESTE CENÁRIO NASCEU DE UM ACHADO DO CYBER-REVISOR (10/09/2026), e o achado era
  // sobre uma frase minha: o comentário do `trocarModo` em `agente.js` AFIRMA que
  // "isto não desliga as regras de permissao do projeto… o modo decide se NÓS perguntamos, não se a
  // regra da casa vale". Era verdade pela leitura do código — e **nunca tinha sido
  // medido**, porque todos os cenários rodavam no modo padrão.
  //
  // É a classe de erro exata pela qual a revisao final reprovou a V1 três vezes: documento
  // (ou comentário) afirmando o que a medição não sustenta. A diferença é que aqui a
  // afirmação estava certa — mas isso só se sabe DEPOIS de medir.
  //
  // Por que este é o cenário mais perigoso: `bypassPermissions` existe justamente para
  // pular o `canUseTool`. Se a filtragem por `settingSources` dependesse do modo, a
  // trava furaria no exato lugar em que ninguém está olhando.
  //
  // ⚠️ O modo só existe com `oficina.permitirPularAprovacao` ligada (a saída escolhida em
  // 10/09/2026, igual à extensão oficial). Liga-se no perfil DESCARTÁVEL deste teste — o
  // `--user-data-dir` fica dentro da pasta de teste —, nunca no de quem usa a máquina.
  {
    const arq = path.join(pastaComDeny, 'dados', 'User', 'settings.json')
    fs.mkdirSync(path.dirname(arq), { recursive: true })
    let atual = {}
    try { atual = JSON.parse(fs.readFileSync(arq, 'utf8')) } catch { }
    fs.writeFileSync(arq, JSON.stringify({ ...atual, 'oficina.permitirPularAprovacao': true }, null, 2), 'utf8')
  }
  const bypass = await ferramentasDaPasta(_electron, pastaComDeny, 'bypassPermissions')
  const sumiuNoBypass = !bypass.erro && !bypass.lista.includes(MARCADOR)
  checar(`criterio 7 no pior caso: com bypassPermissions LIGADO, ${MARCADOR} continua fora`,
    temNaLimpa && sumiuNoBypass,
    bypass.erro || `${bypass.lista.length} ferramentas, ${MARCADOR} ${sumiuNoBypass ? 'ausente' : 'PRESENTE — A TRAVA FUROU'}`)

} catch (e) {
  checar('o teste rodou ate o fim', false, String((e && e.stack) || e))
} finally {
  for (const p of [pastaLimpa, pastaComDeny]) {
    try { fs.rmSync(p, { recursive: true, force: true }) } catch { }
  }
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou, total: resultados.length,
  falhas: resultados.filter(r => !r.ok).map(r => r.nome),
}))
process.exit(passou ? 0 : 1)
