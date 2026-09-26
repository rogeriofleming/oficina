// O MOSTRADOR DE TOKENS NA BARRA (V20, t196) — em node puro, com tudo injetado.
//
// O que precisa ser verdade:
//   1. sem pasta aberta não há conversa, e a barra não mostra nada;
//   2. com conversa e arquivo, publica os números;
//   3. nome DERIVADO da pasta não vai para a barra; nome ESCOLHIDO vai;
//   4. trocar de conversa recomeça a medição (senão somaria duas conversas num número só);
//   5. publica só quando o texto muda;
//   6. medidor que lança não derruba o mostrador;
//   7. a dica avisa que o custo é estimativa;
//   8. descartar para o relógio.
//
// Uso:  node testes/mostrador_de_tokens.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const M = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'mostradorDeTokens.js'))



/*
  ⚠️ V30 — A CHAVE LEVA JSON. Ate a V29 ela levava UM texto; agora leva { degraus, botoes }, porque
  quem escolhe qual degrau cabe passou a ser o nucleo, que sabe a largura (patch 0030). Os criterios
  abaixo continuam perguntando "o que a barra desenharia?", e a resposta e o degrau MAIS COMPLETO —
  por isso o leitor mora num lugar so, em vez de cada criterio parsear do seu jeito.
*/
function saiu(vs) {
  const cru = vs.chaves[M.CHAVE_DO_TEXTO]
  if (typeof cru !== 'string' || !cru) return ''
  try {
    const o = JSON.parse(cru)
    return (o && Array.isArray(o.degraus) && o.degraus[0]) || ''
  } catch {
    return cru
  }
}
const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

function editorFalso() {
  const chaves = {}
  return {
    chaves,
    commands: { executeCommand: (c, k, v) => { if (c === 'setContext') { chaves[k] = v } return Promise.resolve() } },
    workspace: { workspaceFolders: [{ uri: { fsPath: 'd:/projeto' } }] },
  }
}

const resumoDe = (contexto, tokens, custo) => ({
  contextoAgora: contexto, tokens, custoUsd: custo, faltouPreco: false, modelos: [], respostas: 1,
})

/** Monta o mostrador com tudo de mentira; `cfg` troca o que o teste precisa. */
function montar(cfg = {}) {
  const vs = editorFalso()
  const criados = []
  const m = M.criarMostradorDeTokens(vs, { hostPid: null,
    agendar: () => 1, desagendar: () => { },
    pastaDoProjeto: cfg.pasta === undefined ? (() => 'd:/projeto') : cfg.pasta,
    acharSessao: cfg.acharSessao || (() => ({ id: 'aaaaaaaa-1111', nome: 'pasta-1f', nomeEscolhido: false })),
    acharTranscrito: cfg.acharTranscrito || (id => `d:/conversas/${id}.jsonl`),
    lerTitulo: cfg.lerTitulo || (() => null),
    criarMedidor: cfg.criarMedidor || (t => {
      criados.push(t)
      return { atualizar() { }, resumo: () => resumoDe(117000, 2000000, 2.5) }
    }),
  })
  return { vs, m, criados }
}

// ── 1 ──
{
  const { vs, m } = montar({ pasta: () => null })
  m.tique()
  /*
    ⚠️ SUCESSOR DE: "sem pasta aberta a barra nao mostra nada" (V20 — V23).

    Aquele criterio gravava como ESPERADO exatamente o que ele mandou inverter em 24/09/2026:
    *"ele tem que estar ligado ali o tempo inteiro naquela mesma linha"*. Feito o conserto, ele
    ficaria vermelho e o vermelho pareceria regressao sendo acerto — por isso a pergunta muda em
    vez de o criterio sumir.

    O que continua sendo cobrado, e importa tanto quanto: sem pasta NAO se cria medidor. O
    mostrador aparece, mas nao sai lendo disco atras de conversa que nao existe.
  */
  checar('1. sem pasta aberta o mostrador CONTINUA na barra, no estado vazio',
    vs.chaves[M.CHAVE_DE_MOSTRAR] === true, JSON.stringify(vs.chaves))
  checar('1b. e o texto e o do estado vazio, sem inventar medida',
    String(saiu(vs) || '').startsWith(M.SEM_CONVERSA),
    JSON.stringify(saiu(vs)))
  checar('1c. e sem pasta nao se cria medidor (nao sai lendo disco a toa)', !m.temMedidor)
}

// ── 2, 3a, 7 ──
{
  const { vs, m } = montar()
  m.tique()
  const texto = saiu(vs) || ''
  const primeiraLinha = texto.split('\n')[0]
  checar('2. com conversa e arquivo, publica os números',
    vs.chaves[M.CHAVE_DE_MOSTRAR] === true && primeiraLinha === '$2.50  117k/2.0M',
    primeiraLinha)
  checar('3a. sem nome no arquivo da conversa, a barra mostra só os números',
    // V27: a linha começa pelo custo (`$`), como no painel — antes começava pelo contexto.
    !primeiraLinha.includes('pasta-1f') && /^\$\d/.test(primeiraLinha), primeiraLinha)
  checar('7. a dica avisa que o custo é estimativa',
    /estimativa/i.test(texto), texto)
}

// ── 3b ──
  // ⚠️ O NOME VEM DO ARQUIVO DA CONVERSA (linha `ai-title`), e não do registro de sessões. A
  // primeira versão lia o registro, onde o nome é quase sempre derivado da pasta — e por isso o
  // nome NUNCA aparecia. Eu cheguei a declarar isso como limitação; era defeito meu.
  const { vs, m } = montar({ lerTitulo: () => 'Meu Projeto' })
  m.tique()
  const primeiraLinha = (saiu(vs) || '').split('\n')[0]
  checar('3b. o nome que ELE deu à conversa vai para a barra, na frente dos números',
    primeiraLinha.startsWith('Meu Projeto  $2.50  '), primeiraLinha)

// ── 4 ──
{
  let id = 'aaaaaaaa-1111'
  const { m, criados } = montar({ acharSessao: () => ({ id, nome: 'x', nomeEscolhido: false }) })
  m.tique()
  m.tique()
  checar('4a. a mesma conversa não recria o medidor', criados.length === 1, String(criados.length))
  id = 'cccccccc-3333'
  m.tique()
  checar('4b. trocar de conversa recomeça a medição',
    criados.length === 2 && criados[1].includes('cccccccc-3333'), JSON.stringify(criados))
}

// ── 5 ──
{
  const { m } = montar()
  m.tique()
  const n = m.publicacoes.length
  m.tique(); m.tique()
  checar('5. texto igual não é republicado', m.publicacoes.length === n, `${n} -> ${m.publicacoes.length}`)
}

// ── 6 ──
{
  const { vs, m } = montar({
    criarMedidor: () => ({ atualizar() { throw new Error('arquivo sumiu') }, resumo: () => resumoDe(1, 1, 1) }),
  })
  m.tique()
  /*
    ⚠️ SUCESSOR DE: "medidor que lanca nao derruba: a barra SOME, sem erro" (V20 — V23).

    A ordem dele foi "nao pode sumir". O caminho curto seria mandar este caso para o mesmo `– · 0`
    de quando nao ha conversa — e seria MENTIRA: `0` afirma que nada passou pelo modelo, e um
    medidor que lancou excecao nao sabe se passou muito ou pouco. A conversa pode estar comendo o
    plano dele enquanto a barra anuncia zero.

    Por isso sao TRES estados, e este criterio prova o terceiro: ha conversa, a medicao falhou, e a
    barra diz `?` no lugar do numero.
  */
  checar('6a. medidor que lanca: a barra CONTINUA, dizendo que nao mediu',
    vs.chaves[M.CHAVE_DE_MOSTRAR] === true, JSON.stringify(vs.chaves))
  checar('6a-bis. e o texto e `?`, nunca `0` (zero seria medida que ninguem fez)',
    String(saiu(vs) || '').startsWith(M.SEM_MEDIDA),
    JSON.stringify(saiu(vs)))

  const { vs: vs2, m: m2 } = montar({ criarMedidor: () => { throw new Error('nao abriu') } })
  m2.tique()
  checar('6b. medidor que nem nasce: a barra continua, tambem dizendo que nao mediu',
    vs2.chaves[M.CHAVE_DE_MOSTRAR] === true && String(saiu(vs2) || '').startsWith(M.SEM_MEDIDA),
    JSON.stringify(saiu(vs2)))

  const { vs: vs3, m: m3 } = montar({ acharTranscrito: () => null })
  m3.tique()
  /*
    ⚠️ E ESTE NÃO E FALHA, E A DIFERENCA E O PONTO. A sessao e registrada ANTES do `.jsonl`, entao
    "conversa sem arquivo" e o estado normal do primeiro instante de toda conversa — nao um
    medidor quebrado. Vai para `– · 0` (nada processado ainda), nunca para `– · ?`.

    Sem este criterio, mandar tudo que nao mede para o mesmo texto passaria despercebido.
  */
  checar('6c. conversa sem arquivo ainda: estado VAZIO, nao estado de falha',
    vs3.chaves[M.CHAVE_DE_MOSTRAR] === true && String(saiu(vs3) || '').startsWith(M.SEM_CONVERSA),
    JSON.stringify(saiu(vs3)))
}

// ── 8 ──
{
  let parou = false
  const vs = editorFalso()
  const m = M.criarMostradorDeTokens(vs, { hostPid: null,
    agendar: () => 7, desagendar: id => { parou = id === 7 },
    pastaDoProjeto: () => 'd:/projeto',
    acharSessao: () => ({ id: 'aaaaaaaa-1111', nome: 'x', nomeEscolhido: false }),
    acharTranscrito: () => 'd:/c.jsonl',
    criarMedidor: () => ({ atualizar() { }, resumo: () => resumoDe(1, 2, 3) }),
  })
  m.ligar()
  const tinha = m.temRelogio
  m.descartar()
  checar('8. ligar marca o relógio e descartar o para', tinha === true && parou === true && m.temRelogio === false)
}

checar('cadência: 3 s, a mesma da vista de tokens da V10', M.INTERVALO_MS === 3000, String(M.INTERVALO_MS))

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ SEM DUBLÊ NENHUM — o caso que faltava, e que custou o t196 inteiro
//
// A primeira versão deste arquivo tinha 13 casos, todos verdes, e o mostrador NÃO FUNCIONAVA: o
// código chamava `medidor.ler()`, método que `MedidorDaConversa` não tem (ele expõe `atualizar`).
// O `TypeError` caía num `catch`, o texto virava `null`, e o item da barra nunca aparecia. Os 13
// casos não pegaram porque o duplo injetado TINHA `ler()` — o teste inventou o método que a classe
// real não tem, e passou a medir a si mesmo.
//
// ⚠️ REGRA QUE FICA: todo componente precisa de PELO MENOS UM caso com o objeto de verdade. Duplo
// serve para forçar caminho difícil (erro, borda, tempo), nunca para ser a única prova de que a
// costura entre duas peças nossas existe.
// ─────────────────────────────────────────────────────────────────────────────
{
  const requerer2 = createRequire(import.meta.url)
  const T = requerer2(path.join(REPO, 'extensoes', 'oficina-claude', 'tokens.js'))
  const S = requerer2(path.join(REPO, 'extensoes', 'oficina-claude', 'sessaoAtiva.js'))

  // 1. a classe real tem o método que o mostrador chama?
  const metodos = Object.getOwnPropertyNames(T.MedidorDaConversa.prototype)
  const fonte = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'mostradorDeTokens.js'), 'utf8')
  // ⚠️ Sem os comentários: o próprio comentário que explica o defeito cita `medidor.ler()`, e
  // sem tirar comentário o critério acusaria a explicação em vez do código.
  const soCodigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  const chamados = [...soCodigo.matchAll(/medidor\.([a-zA-Z]+)\(/g)].map(m => m[1])
  const faltando = [...new Set(chamados)].filter(m => !metodos.includes(m))
  checar('SEM DUBLÊ 1. todo método que o mostrador chama existe em MedidorDaConversa',
    chamados.length > 0 && faltando.length === 0,
    `chama: ${chamados.join(',')} | tem: ${metodos.join(',')} | falta: ${faltando.join(',') || 'nada'}`)

  // 2. ponta a ponta, com o medidor REAL, sobre uma conversa de verdade desta máquina
  const raiz = T.diretorioDeProjetos()
  let transcrito = null
  let sessaoReal = null
  try {
    for (const pasta of fs.readdirSync(raiz)) {
      const dir = path.join(raiz, pasta)
      if (!fs.statSync(dir).isDirectory()) continue
      const arq = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
        .map(f => ({ f, p: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0]
      if (arq && (!transcrito || arq.t > transcrito.t)) { transcrito = arq; sessaoReal = arq.f.replace('.jsonl', '') }
    }
  } catch { /* sem conversas nesta máquina: o caso abaixo se declara pulado */ }

  if (transcrito) {
    const vs = editorFalso()
    const m = M.criarMostradorDeTokens(vs, { hostPid: null,
      agendar: () => 1, desagendar: () => { },
      pastaDoProjeto: () => 'd:/qualquer',
      acharSessao: () => ({ id: sessaoReal, nome: 'x', nomeEscolhido: false }),
      acharTranscrito: () => transcrito.p,
      // ⚠️ SEM `criarMedidor` INJETADO: usa o padrão, que é `new T.MedidorDaConversa(...)`.
    })
    m.tique()
    const texto = String(saiu(vs) || '')
    const primeira = texto.split('\n')[0]
    checar('SEM DUBLÊ 2. com o medidor REAL e uma conversa real, a barra publica número',
      vs.chaves[M.CHAVE_DE_MOSTRAR] === true && /\d/.test(primeira),
      `aMostrar=${vs.chaves[M.CHAVE_DE_MOSTRAR]} | "${primeira}"`)
    console.log(`       (medido agora, sem duplo: "${primeira}")`)

    // 3. o relógio do cache (t201) — o item que a V20 afirmou entregar e não entregava
    const R = requerer2(path.join(REPO, 'extensoes', 'oficina-claude', 'relogioCache.js'))
    const med = new T.MedidorDaConversa(transcrito.p)
    med.atualizar()
    const temCache = !!med.resumo().cache
    // ⚠️ SUCESSOR (V27) de "o relógio do cache aparece na barra": ele mandou o relógio para o rodapé do
    // chat, ao lado do modelo — onde a extensão oficial já o mostra. Na barra ele ficaria duplicado.
    // O relógio continua na DICA (quem passa o mouse vê), e é isso que se cobra agora.
    checar('SEM DUBLÊ 3. o relógio do cache NÃO fica na linha da barra (mora no rodapé do chat), só na dica',
      !/cache \d+m|cache vencido/.test(primeira) && (!temCache || /cache/i.test(texto.split('\n').slice(1).join('\n'))),
      `resumo.cache=${temCache} | "${primeira}"`)
    checar('SEM DUBLÊ 3b. e o mostrador consome mesmo o relógio (não é texto solto)',
      /relogioCache/.test(fonte) && /estadoDoRelogio/.test(fonte),
      'o mostrador não importa o relógio')
  } else {
    checar('SEM DUBLÊ 2. com o medidor REAL e uma conversa real, a barra publica número', false,
      'nenhuma conversa encontrada nesta máquina para exercitar o caminho real')
  }

  // 4. conversa recém-criada: a sessão aparece ANTES do arquivo existir. O medidor tem de se
  //    recuperar quando o arquivo chegar — a primeira versão ficava `null` para sempre.
  {
    const vs = editorFalso()
    let existe = false
    let criados = 0
    const m = M.criarMostradorDeTokens(vs, { hostPid: null,
      agendar: () => 1, desagendar: () => { },
      pastaDoProjeto: () => 'd:/qualquer',
      acharSessao: () => ({ id: 'aaaaaaaa-1111', nome: 'x', nomeEscolhido: false }),
      acharTranscrito: () => (existe ? 'd:/c.jsonl' : null),
      criarMedidor: () => { criados++; return { atualizar() { }, resumo: () => resumoDe(10, 20, 0.5) } },
    })
    m.tique()
    checar('SEM DUBLE 4a. conversa sem arquivo ainda: mostra o estado vazio, e nao cria medidor',
      vs.chaves[M.CHAVE_DE_MOSTRAR] === true
      && String(saiu(vs) || '').startsWith(M.SEM_CONVERSA)
      && criados === 0,
      `texto=${JSON.stringify(saiu(vs))} criados=${criados}`)
    existe = true
    m.tique()
    checar('SEM DUBLÊ 4b. quando o arquivo aparece, o medidor SE RECUPERA (mesmo id)',
      criados === 1 && vs.chaves[M.CHAVE_DE_MOSTRAR] === true,
      `criados=${criados} aMostrar=${vs.chaves[M.CHAVE_DE_MOSTRAR]}`)
  }

  // 5. renomear a conversa muda o nome na barra (o nome é metade do t196)
  {
    const vs = editorFalso()
    let titulo = 'Antigo'
    const m = M.criarMostradorDeTokens(vs, { hostPid: null,
      agendar: () => 1, desagendar: () => { },
      pastaDoProjeto: () => 'd:/qualquer',
      acharSessao: () => ({ id: 'bbbbbbbb-2222' }),
      acharTranscrito: () => 'd:/c.jsonl',
      lerTitulo: () => titulo,
      criarMedidor: () => ({ atualizar() { }, resumo: () => resumoDe(10, 20, 0.5) }),
    })
    m.tique()
    titulo = 'Novo Nome'
    m.tique()
    checar('SEM DUBLÊ 5. renomear a conversa muda o nome na barra, sem trocar de id',
      String(saiu(vs) || '').startsWith('Novo Nome  '),
      String(saiu(vs) || '').split('\n')[0])
  }
}

// ── 9 ── sem pasta aberta, procura na pasta PESSOAL (onde a extensão oficial abre a conversa)
{
  /*
    ⚠️ Pago em 25/09/2026: a OFICINA sem pasta aberta, conversa "Catálogo de skills" trabalhando
    com o `cwd` igual à pasta pessoal, e a barra marcando `– · 0`. A extensão oficial usa
    `workspaceFolders?.[0] ?? os.homedir()`; o mostrador tem de procurar no mesmo lugar.
    Este bloco NÃO injeta `pastaDoProjeto` — é o padrão de verdade que está sendo cobrado.
  */
  const os = requerer('os')
  const pedidas = []
  const montarPadrao = pastas => {
    const vs = editorFalso()
    vs.workspace.workspaceFolders = pastas
    const m = M.criarMostradorDeTokens(vs, { hostPid: null,
      agendar: () => 1, desagendar: () => { },
      acharSessao: p => { pedidas.push(p); return { id: 'cccccccc-3333' } },
      acharTranscrito: () => 'd:/c.jsonl',
      lerTitulo: () => null,
      criarMedidor: () => ({ atualizar() { }, resumo: () => resumoDe(69600, 1000000, 1.24) }),
    })
    m.tique()
    return vs
  }
  const vs = montarPadrao(undefined)
  checar('9a. sem pasta aberta, a conversa e procurada na pasta pessoal',
    pedidas[0] === os.homedir(), JSON.stringify(pedidas))
  // ⚠️ SUCESSOR (V27) de "9b. e a barra mostra os numeros": mostrar SÓ os números nesse estado fazia a
  // barra parecer saudável numa conversa sem as regras do projeto. Os números continuam; o aviso vem na frente.
  checar('9b. sem pasta e com conversa: numeros E o aviso `⚠ sem pasta` na frente',
    String(saiu(vs) || '').split('\n')[0] === `${M.AVISO_SEM_PASTA}  $1.24  69.6k/1.0M`,
    String(saiu(vs) || '').split('\n')[0])
  // A frase não promete demais (revisão, 25/09): o que fica de fora é o que mora DENTRO da pasta do
  // projeto; o que é pessoal continua valendo — e sem o jargão "travas".
  checar('9b-bis. e a dica diz o que fica de fora (o que mora na pasta do projeto), o que continua, e o que fazer',
    /CLAUDE\.md/.test(saiu(vs)) && /pessoais, continuam/.test(saiu(vs)) &&
    /Abrir Pasta/.test(saiu(vs)) && !/travas/.test(saiu(vs)))
  const vsComPasta = montarPadrao([{ uri: { fsPath: 'd:/aberta' } }])
  checar('9c. com pasta aberta, continua sendo a pasta aberta', pedidas[1] === 'd:/aberta', JSON.stringify(pedidas))
  checar('9d. com pasta aberta, nenhum aviso', !String(saiu(vsComPasta)).includes(M.AVISO_SEM_PASTA))
}

// ── 10 ── o formato do PAINEL de tokens (V27): "eu queria o msm"
{
  /*
    Os valores esperados saíram do painel flutuante de tokens, e não daqui:
    o print dele em 25/09/2026 mostrava `$1.24  69.6k/1.0M` para 69,6 mil de contexto e 1,0 milhão
    processado — é o caso 10a.
  */
  checar('10a. o item do painel: `nome  $1.24  69.6k/1.0M`',
    M.itemDoPainel('Catálogo skills', resumoDe(69600, 1000000, 1.24)) === 'Catálogo skills  $1.24  69.6k/1.0M',
    M.itemDoPainel('Catálogo skills', resumoDe(69600, 1000000, 1.24)))
  checar('10b. tokens como o painel: 195k sem casa, 69.6k com uma, 13.3M',
    M.tokens(194810) === '195k' && M.tokens(69600) === '69.6k' && M.tokens(13342664) === '13.3M',
    [M.tokens(194810), M.tokens(69600), M.tokens(13342664)].join(' '))
  checar('10c. nome comprido corta na palavra, como o painel',
    M.nomeCurto('Catálogo de skills com auditoria de uso') === 'Catálogo skills…',
    M.nomeCurto('Catálogo de skills com auditoria de uso'))
  checar('10d. preço faltando continua marcado (`+`): número incompleto não passa por inteiro',
    M.itemDoPainel(null, { ...resumoDe(1000, 2000, 1), faltouPreco: true }) === '$1.00+  1.0k/2.0k',
    M.itemDoPainel(null, { ...resumoDe(1000, 2000, 1), faltouPreco: true }))
}

// ── 11 ── as conversas DESTA JANELA, pelo processo pai (V27)
{
  const S = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'sessaoAtiva.js'))
  const reg = (pid, id, extra = {}) => ({ pid, sessionId: id, entrypoint: 'claude-vscode', cwd: 'd:/x', status: 'idle', updatedAt: 1, ...extra })
  const sessoes = [reg(10, 'a-oficina', { status: 'busy' }), reg(11, 'b-oficina'), reg(20, 'c-vscode'), reg(30, 'd-sdk', { entrypoint: 'sdk-ts' })]
  const pais = { 10: 500, 11: 500, 20: 700, 30: 500 }
  const r = S.conversasDaJanela(500, s => pais[s.pid], { sessoes, vivo: () => true, escritaEm: () => null })
  checar('11a. so as filhas do host desta janela; a do VS Code na mesma pasta fica de fora',
    r && r.conversas.map(c => c.id).join() === 'a-oficina,b-oficina', JSON.stringify(r))
  checar('11b. a que esta trabalhando e a em uso', r && r.emUso === 'a-oficina', JSON.stringify(r))
  checar('11c. pai ainda nao conhecido de ninguem: devolve null (cai no criterio da pasta, nao em lista vazia)',
    S.conversasDaJanela(500, () => undefined, { sessoes, vivo: () => true }) === null)

  // O mostrador inteiro, com duas conversas na janela
  const vs = editorFalso()
  const m = M.criarMostradorDeTokens(vs, {
    agendar: () => 1, desagendar: () => { }, hostPid: 500,
    pais: { atualizar() { }, paiDe: s => pais[s.pid] },
    lerSessoes: () => sessoes,
    listarDaJanela: (host, paiDe, ss) => S.conversasDaJanela(host, paiDe, { sessoes: ss, vivo: () => true, escritaEm: () => null }),
    acharTranscrito: id => `d:/c/${id}.jsonl`,
    lerTitulo: t => (t.includes('a-oficina') ? 'Catálogo skills' : 'Outra'),
    criarMedidor: t => ({ atualizar() { }, resumo: () => (t.includes('a-oficina') ? resumoDe(69600, 1000000, 1.24) : resumoDe(30400, 500000, 0.76)) }),
  })
  m.tique()
  /*
    ⚠️ V30 — A CHAVE LEVA JSON, E ISSO E O CONSERTO. Ate a V29 ia UM texto, escolhido aqui por um
    limite de caracteres chutado contra uma largura que esta extensao nao ve. Agora vao TODOS os
    degraus e os botoes; quem mede e escolhe e o nucleo (patch 0030), que sabe a largura.
  */
  const publicado = JSON.parse(String(vs.chaves[M.CHAVE_DO_TEXTO] || '{}'))
  const degraus = publicado.degraus || []
  const texto = String(degraus[0] || '')
  checar('11d. o degrau mais completo: TODAS pelo nome INTEIRO, os DOIS numeros, e a soma no fim',
    texto.split('\n')[0] === 'Catálogo skills  $1.24  69.6k/1.0M │ Outra  $0.76  30.4k/500k │ $2.00  100k/1.5M',
    texto.split('\n')[0])
  checar('11d-b. e os degraus saem do mais completo ao mais apertado, sem repetir',
    degraus.length >= 3 && new Set(degraus.map(d => d.split('\n')[0])).size === degraus.length &&
    degraus[0].split('\n')[0].length > degraus[degraus.length - 1].length,
    `${degraus.length} degraus`)
  checar('11d-c. so o PRIMEIRO carrega a dica (repeti-la em todos seria publicar ~9 KB a cada tique)',
    degraus[0].includes('\n') && degraus.slice(1).every(d => !d.includes('\n')), String(degraus.length))
  checar('11d2. cabendo, vai o formato inteiro do painel',
    M.degrausDasConversas([{ nome: 'A', resumo: resumoDe(1000, 2000, 1) }, { nome: 'B', resumo: resumoDe(3000, 4000, 2) }],
      { custo: 3, contexto: 4000, tokens: 6000, marca: '' })[0] === 'A  $1.00  1.0k/2.0k │ B  $2.00  3.0k/4.0k │ $3.00  4.0k/6.0k')
  {
    const quatro = ['Hotmart pagamentos recalculado', 'V29 design inconsistências', 'teste', 'Catálogo de skills com auditoria']
      .map((nome, i) => ({ nome, resumo: resumoDe(197000 + i, 9300000 + i, 7.17 + i) }))
    const ds = M.degrausDasConversas(quatro, { custo: 40, contexto: 800000, tokens: 37000000, marca: '' })
    // ⚠️ O QUE SE COBRA MUDOU, E DE PROPOSITO: antes era "cabe em N caracteres" (o chute). Agora e que
    // o degrau mais completo NAO CORTA NADA — nome inteiro e os dois numeros — porque a linha propria
    // tem espaco, e que exista uma escada ate um degrau bem curto para a janela estreita.
    checar('11d3. quatro conversas de nome comprido: o degrau 0 traz o nome INTEIRO e os dois numeros',
      quatro.every(c => ds[0].includes(c.nome)) && ds[0].split(' │ ').slice(0, 4).every(p => /\d+k\/\d/.test(p)), ds[0])
    checar('11d4. e ha uma escada de verdade: o ultimo degrau e bem menor que o primeiro',
      ds.length >= 4 && ds[ds.length - 1].length < ds[0].length * 0.6, `${ds[0].length} -> ${ds[ds.length - 1].length}`)
  }
  checar('11d5. os BOTOES vao publicados junto (V30): expandir os tokens e o mapa dos agentes',
    Array.isArray(publicado.botoes) && publicado.botoes.length === 2 &&
    publicado.botoes[0].comando === 'oficina.tokens.abrir' && publicado.botoes[1].comando === 'oficina.agentes.mapa' &&
    publicado.botoes.every(b => /^[a-z0-9-]+$/.test(b.icone)),
    JSON.stringify(publicado.botoes))
  checar('11e. e a dica lista cada conversa, marcando a em uso',
    /▸ Catálogo skills: \$1\.24/.test(texto) && /  Outra: \$0\.76/.test(texto), texto)
}

// ── 13 ── achados da revisao de honestidade da tela (25/09/2026)
{
  const S = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'sessaoAtiva.js'))
  const reg = (pid, id, extra = {}) => ({ pid, sessionId: id, entrypoint: 'claude-vscode', cwd: 'd:/x', status: 'idle', updatedAt: 1, ...extra })
  const montarJanela = ({ sessoes, transcritos, resumos, falha = () => false }) => {
    const vs = editorFalso()
    const m = M.criarMostradorDeTokens(vs, {
      agendar: () => 1, desagendar: () => { }, hostPid: 500,
      pais: { atualizar() { }, paiDe: () => 500 },
      lerSessoes: () => sessoes,
      listarDaJanela: (host, paiDe, ss) => S.conversasDaJanela(host, paiDe, { sessoes: ss, vivo: () => true, escritaEm: () => null }),
      acharTranscrito: id => transcritos[id] || null,
      lerTitulo: t => (t.includes('velha') ? 'Velha' : 'Nova'),
      criarMedidor: t => ({ atualizar() { if (falha(t)) throw new Error('x') }, resumo: () => resumos[t] }),
    })
    m.tique()
    return String(saiu(vs) || '')
  }
  // 13a — a conversa NOVA em uso (sem arquivo ainda) ao lado de uma de $30: nada de "nenhuma conversa"
  const t = montarJanela({
    sessoes: [reg(1, 'velha'), reg(2, 'nova', { status: 'busy' })],
    transcritos: { velha: 'd:/velha.jsonl' },
    resumos: { 'd:/velha.jsonl': resumoDe(100000, 5000000, 30) },
  })
  checar('13a. conversa nova ao lado de uma medida: a barra NAO diz "nenhuma conversa" e mostra a soma',
    t.split('\n')[0] === 'Velha  $30.00  100k/5.0M │ conversa nova  – │ $30.00  100k/5.0M' && !/nenhuma conversa/.test(t), t.split('\n')[0])
  // 13b — conversa registrada sem arquivo, sozinha: estado vazio, mas a dica NAO diz "nenhuma conversa"
  const t2 = montarJanela({ sessoes: [reg(2, 'nova')], transcritos: {}, resumos: {} })
  checar('13b. conversa que acabou de nascer: `– · 0`, e a dica diz que ela comecou (nao "nenhuma conversa")',
    t2.startsWith(M.SEM_CONVERSA) && /começou/.test(t2) && !/nenhuma conversa/.test(t2), t2)
  // 13c — sem preco conhecido: `$?`, nunca custo sumido
  checar('13c. sem preco nenhum conhecido, o custo vira `$?` (nao some)',
    M.itemDoPainel(null, { contextoAgora: 1000, tokens: 2000, custoUsd: null }) === '$?  1.0k/2.0k')
  // 13d — o total marca o que nao soma
  const t3 = montarJanela({
    sessoes: [reg(1, 'velha', { status: 'busy' }), reg(2, 'nova')],
    transcritos: { velha: 'd:/velha.jsonl', nova: 'd:/nova.jsonl' },
    resumos: { 'd:/velha.jsonl': resumoDe(100000, 5000000, 30), 'd:/nova.jsonl': resumoDe(1, 1, 1) },
    falha: tr => tr.includes('nova'),
  })
  checar('13d. uma conversa falhou: o total leva `?` (a soma esta incompleta)', /│ \$30\.00\?( |$)/.test(t3.split('\n')[0]), t3.split('\n')[0])
}

// ── 12 ── a consulta dos pais nao grava "sem pai" por causa de uma falha
{
  const P = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'paisDosProcessos.js'))
  let respostas = [null, new Map([[10, { pai: 500, inicio: '134348326646694120' }]])]
  let relogio = 0
  const pp = P.criarPaisDosProcessos({ consultar: () => Promise.resolve(respostas.shift()), agora: () => relogio })
  const s = { pid: 10, procStart: '134348326646694129' }
  await pp.atualizar([s])
  checar('12a. consulta que falhou nao grava nada', pp.paiDe(s) === undefined && pp.tamanho === 0)
  await pp.atualizar([s])
  checar('12a-bis. e depois de falhar ESPERA o recuo (nao dispara um PowerShell a cada 3 s)', pp.paiDe(s) === undefined && respostas.length === 1)
  relogio += P.RECUO_MS + 1
  await pp.atualizar([s])
  checar('12b. passado o recuo, a seguinte grava o pai (horas batendo ate o microssegundo)', pp.paiDe(s) === 500)
  checar('12c. PID reaproveitado (outro procStart) nao herda o pai do antigo', pp.paiDe({ pid: 10, procStart: '2' }) === undefined)
  const semShell = await P.consultarPais([10], { executar: (c, a, o, cb) => cb(new Error('x')) })
  checar('12d. erro do sistema devolve null (nao sei), nao mapa vazio (ninguem existe)', semShell === null)
  let comando = ''
  await P.consultarPais([10, 'x; rm', -1, 2.5, 11, 1e21, 4294967296], { plataforma: 'win32', executar: (c, a, o, cb) => { comando = a.join(' '); cb(null, '') } })
  checar('12e. so PID inteiro de 1 a 2^32-1 entra no comando (1e21 e 2^32 derrubavam a consulta inteira)',
    comando.includes('ProcessId=10 OR ProcessId=11') && !/rm|-1|2\.5|e\+21|4294967296/.test(comando), comando)
  // PID reaproveitado de VERDADE: o sistema responde, mas o processo nasceu em outra hora
  const outro = P.criarPaisDosProcessos({ consultar: () => Promise.resolve(new Map([[20, { pai: 500, inicio: '134348322108105552' }]])) })
  const velho = { pid: 20, procStart: '134342384786371546' } // registro de dias antes
  await outro.atualizar([velho])
  checar('12f. registro velho cujo PID hoje e de OUTRO processo (hora de criacao diferente): sem pai', outro.paiDe(velho) === null)
  checar('12g. horas iguais ate 1 ms contam como o mesmo processo', P.mesmoProcesso('134348326646694129', '134348326646694120') && !P.mesmoProcesso('134348326646694129', '134348326646794129'))
  const ext = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'paisDosProcessos.js'), 'utf8')
  checar('12h. o PowerShell vem por caminho absoluto, com as duas barras (sem virar "C:Windows")',
    ext.includes("'C:\\\\Windows', 'System32', 'WindowsPowerShell'"), 'caminho do powershell')
}

// ── 14 ── V30: a conversa PARADA ha mais de 5 minutos sai da linha
{
  const S14 = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'sessaoAtiva.js'))
  const reg = (pid, id) => ({ pid, sessionId: id, entrypoint: 'claude-vscode', cwd: 'd:/x', status: 'idle', updatedAt: 1 })
  const sessoes = [reg(10, 'viva'), reg(11, 'parada'), reg(12, 'emuso')]
  const pais = { 10: 500, 11: 500, 12: 500 }
  const AGORA = 1_000_000_000
  // `emuso` e a que trabalha; `viva` escreveu ha 1 min; `parada` ha 30 min.
  const escritas = { viva: AGORA - 60_000, parada: AGORA - 30 * 60_000, emuso: AGORA - 10 * 60_000 }

  const montar = extra => {
    const vs = editorFalso()
    const m = M.criarMostradorDeTokens(vs, {
      agendar: () => 1, desagendar: () => { }, hostPid: 500,
      pais: { atualizar() { }, paiDe: s => pais[s.pid] },
      lerSessoes: () => sessoes,
      listarDaJanela: (host, paiDe, ss) => ({ conversas: ss.filter(x => pais[x.pid] === host).map(x => ({ id: x.sessionId })), emUso: 'emuso' }),
      acharTranscrito: id => `d:/c/${id}.jsonl`,
      lerTitulo: t => (t.includes('viva') ? 'Conversa viva' : t.includes('parada') ? 'Conversa parada' : 'Em uso'),
      criarMedidor: t => ({ atualizar() { }, resumo: () => resumoDe(1000, 2000, 1) }),
      agora: () => AGORA,
      escritaEm: id => escritas[id] ?? null,
      ...extra,
    })
    m.tique()
    return { vs, m }
  }

  const { vs } = montar()
  const linha = saiu(vs).split('\n')[0]
  checar('14a. a conversa parada ha 30 min SAI da linha', !/Conversa parada/.test(linha), linha)
  checar('14b. a que escreveu ha 1 min FICA', /Conversa viva/.test(linha), linha)
  checar('14c. e a EM USO fica, mesmo parada ha 10 min (ele pode estar lendo a resposta)',
    /Em uso/.test(linha), linha)
  checar('14d. a dica CONTA o que saiu, em vez de esconder calado',
    /1 conversa parada há mais de 5 minutos não aparece/.test(saiu(vs)), saiu(vs).split('\n').slice(-3).join(' | '))

  // ⚠️ O MEDIDOR DE QUEM SAIU NAO E JOGADO FORA: releria o arquivo inteiro ao voltar.
  checar('14e. quem saiu da linha continua MEDIDO (o medidor nao e descartado)',
    montar().m.conversas.includes('parada'), montar().m.conversas.join())

  // Sem saber a hora, nao se esconde: a falha cai para o lado de mostrar.
  const semHora = montar({ escritaEm: () => null })
  checar('14f. transcrito que nao da para ler NAO esconde a conversa (falha para o lado de mostrar)',
    /Conversa parada/.test(saiu(semHora.vs).split('\n')[0]), saiu(semHora.vs).split('\n')[0])

  checar('14g. o limite e o que ele pediu: 5 minutos', M.INATIVA_MS === 5 * 60 * 1000, String(M.INATIVA_MS))
}

// ── 15 ── V30: o mapa dos agentes (o pop-up da faixa)
{
  const MAPA = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'mapaDosAgentes.js'))
  const vazio = MAPA.montarMapaDaJanela([{ id: 'c1', nome: 'sem agentes', subagentes: [] }])
  checar('15a. conversa sem agente nenhum nao vira secao no mapa', vazio.length === 0, JSON.stringify(vazio))
  checar('15b. e a TELA vazia diz o que e, em vez de ficar em branco (o botao existe sempre)',
    MAPA.htmlDoMapa(vazio).includes(MAPA.SEM_AGENTES), 'estado vazio')

  const mapas = MAPA.montarMapaDaJanela([{
    id: 'c1', nome: 'Comparar pagamentos', emUso: true, contexto: 1000, subagentes: [
      { id: 'a1', nome: 'revisor', tipo: 'general-purpose', tokensNoFim: 120000, inicioMs: 1000, fimMs: 95000, ferramentas: 12 },
      { id: 'a2', nome: 'filho do revisor', tipo: 'Explore', pai: 'a1', tokensNoFim: 30000, inicioMs: 2000, fimMs: 40000 },
    ],
  }])
  checar('15c. os agentes da conversa entram no mapa', mapas.length === 1 && mapas[0].quantos === 2, JSON.stringify(mapas.map(m => m.quantos)))
  const html = MAPA.htmlDoMapa(mapas)
  checar('15d. a ARVORE e desenhada: o filho fica DENTRO do ramo do pai (o "bloco derivando")',
    /revisor[\s\S]*?mapa-ramos[\s\S]*?filho do revisor/.test(html), 'arvore')
  checar('15e. o nome do agente e ESCAPADO (ele vem de fora, e vai para dentro de HTML)',
    MAPA.htmlDoMapa(MAPA.montarMapaDaJanela([{ id: 'c', nome: 'x', subagentes: [{ id: 'a', nome: '<script>alerta()</script>' }] }]))
      .includes('&lt;script&gt;') === true, 'escapado')
  checar('15f. a tela DIZ que o instante nao esta ali (a fonte e o disco), em vez de deixar supor',
    html.includes('NESTE instante'), 'ressalva presente')
  checar('15g. duracao em palavra de gente', MAPA.duracaoCurta(94000) === '1min 34s' && MAPA.duracaoCurta(45000) === '45s',
    MAPA.duracaoCurta(94000))
}

const falhas = resultados.filter(r => !r.ok)
console.log(`
  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
// ⚠️ O PLACAR EM JSON, na última linha: é por ele que a bateria (`rapidos.mjs`) e a regressão leem
// o resultado e conferem o piso. Sem esta linha, a suíte roda, passa, e a bateria a marca como
// "sem placar" — ou seja, não protege nada. Foi o que aconteceu com as seis suítes da V20.
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
