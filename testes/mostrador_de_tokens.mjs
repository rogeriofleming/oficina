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
    workspace: { workspaceFolders: undefined },
  }
}

const resumoDe = (contexto, tokens, custo) => ({
  contextoAgora: contexto, tokens, custoUsd: custo, faltouPreco: false, modelos: [], respostas: 1,
})

/** Monta o mostrador com tudo de mentira; `cfg` troca o que o teste precisa. */
function montar(cfg = {}) {
  const vs = editorFalso()
  const criados = []
  const m = M.criarMostradorDeTokens(vs, {
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
    String(vs.chaves[M.CHAVE_DO_TEXTO] || '').startsWith(M.SEM_CONVERSA),
    JSON.stringify(vs.chaves[M.CHAVE_DO_TEXTO]))
  checar('1c. e sem pasta nao se cria medidor (nao sai lendo disco a toa)', !m.temMedidor)
}

// ── 2, 3a, 7 ──
{
  const { vs, m } = montar()
  m.tique()
  const texto = vs.chaves[M.CHAVE_DO_TEXTO] || ''
  const primeiraLinha = texto.split('\n')[0]
  checar('2. com conversa e arquivo, publica os números',
    vs.chaves[M.CHAVE_DE_MOSTRAR] === true && /117k/.test(primeiraLinha) && /2,0M/.test(primeiraLinha),
    primeiraLinha)
  checar('3a. sem nome no arquivo da conversa, a barra mostra só os números',
    !primeiraLinha.includes('pasta-1f') && /^[\d.,]/.test(primeiraLinha), primeiraLinha)
  checar('7. a dica avisa que o custo é estimativa',
    /estimativa/i.test(texto), texto)
}

// ── 3b ──
  // ⚠️ O NOME VEM DO ARQUIVO DA CONVERSA (linha `ai-title`), e não do registro de sessões. A
  // primeira versão lia o registro, onde o nome é quase sempre derivado da pasta — e por isso o
  // nome NUNCA aparecia. Eu cheguei a declarar isso como limitação; era defeito meu.
  const { vs, m } = montar({ lerTitulo: () => 'Meu Projeto' })
  m.tique()
  const primeiraLinha = (vs.chaves[M.CHAVE_DO_TEXTO] || '').split('\n')[0]
  checar('3b. o nome que ELE deu à conversa vai para a barra, na frente dos números',
    primeiraLinha.startsWith('Meu Projeto · '), primeiraLinha)

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
    String(vs.chaves[M.CHAVE_DO_TEXTO] || '').startsWith(M.SEM_MEDIDA),
    JSON.stringify(vs.chaves[M.CHAVE_DO_TEXTO]))

  const { vs: vs2, m: m2 } = montar({ criarMedidor: () => { throw new Error('nao abriu') } })
  m2.tique()
  checar('6b. medidor que nem nasce: a barra continua, tambem dizendo que nao mediu',
    vs2.chaves[M.CHAVE_DE_MOSTRAR] === true && String(vs2.chaves[M.CHAVE_DO_TEXTO] || '').startsWith(M.SEM_MEDIDA),
    JSON.stringify(vs2.chaves[M.CHAVE_DO_TEXTO]))

  const { vs: vs3, m: m3 } = montar({ acharTranscrito: () => null })
  m3.tique()
  /*
    ⚠️ E ESTE NÃO E FALHA, E A DIFERENCA E O PONTO. A sessao e registrada ANTES do `.jsonl`, entao
    "conversa sem arquivo" e o estado normal do primeiro instante de toda conversa — nao um
    medidor quebrado. Vai para `– · 0` (nada processado ainda), nunca para `– · ?`.

    Sem este criterio, mandar tudo que nao mede para o mesmo texto passaria despercebido.
  */
  checar('6c. conversa sem arquivo ainda: estado VAZIO, nao estado de falha',
    vs3.chaves[M.CHAVE_DE_MOSTRAR] === true && String(vs3.chaves[M.CHAVE_DO_TEXTO] || '').startsWith(M.SEM_CONVERSA),
    JSON.stringify(vs3.chaves[M.CHAVE_DO_TEXTO]))
}

// ── 8 ──
{
  let parou = false
  const vs = editorFalso()
  const m = M.criarMostradorDeTokens(vs, {
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
    const m = M.criarMostradorDeTokens(vs, {
      agendar: () => 1, desagendar: () => { },
      pastaDoProjeto: () => 'd:/qualquer',
      acharSessao: () => ({ id: sessaoReal, nome: 'x', nomeEscolhido: false }),
      acharTranscrito: () => transcrito.p,
      // ⚠️ SEM `criarMedidor` INJETADO: usa o padrão, que é `new T.MedidorDaConversa(...)`.
    })
    m.tique()
    const texto = String(vs.chaves[M.CHAVE_DO_TEXTO] || '')
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
    checar('SEM DUBLÊ 3. o relógio do cache aparece na barra quando a conversa tem cache (t201)',
      !temCache || /cache/.test(primeira),
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
    const m = M.criarMostradorDeTokens(vs, {
      agendar: () => 1, desagendar: () => { },
      pastaDoProjeto: () => 'd:/qualquer',
      acharSessao: () => ({ id: 'aaaaaaaa-1111', nome: 'x', nomeEscolhido: false }),
      acharTranscrito: () => (existe ? 'd:/c.jsonl' : null),
      criarMedidor: () => { criados++; return { atualizar() { }, resumo: () => resumoDe(10, 20, 0.5) } },
    })
    m.tique()
    checar('SEM DUBLE 4a. conversa sem arquivo ainda: mostra o estado vazio, e nao cria medidor',
      vs.chaves[M.CHAVE_DE_MOSTRAR] === true
      && String(vs.chaves[M.CHAVE_DO_TEXTO] || '').startsWith(M.SEM_CONVERSA)
      && criados === 0,
      `texto=${JSON.stringify(vs.chaves[M.CHAVE_DO_TEXTO])} criados=${criados}`)
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
    const m = M.criarMostradorDeTokens(vs, {
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
      String(vs.chaves[M.CHAVE_DO_TEXTO] || '').startsWith('Novo Nome · '),
      String(vs.chaves[M.CHAVE_DO_TEXTO] || '').split('\n')[0])
  }
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
