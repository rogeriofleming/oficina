// O MOSTRADOR DE TOKENS NA BARRA DE CIMA (V20, t196 · formato do painel na V27).
//
// Pedido dele, com a referência pronta na mão: *"tokens tem que ficar assim. entre a barra de
// pesquisa e os botões de minimizar, maximizar e fechar janela"* — numa linha só, o nome da
// sessão, o custo e o contexto.
//
// ⚠️ V27: O MESMO QUE O PAINEL DE TOKENS. Ele usava o painel flutuante de tokens (ferramenta à parte, fora deste repositório)
// e estranhou a barra: *"pq o contador do oficina é diferente do painel de tokens (...)? eu queria o
// msm"* — *"unica diferença msm é que um é sobreposto e outro embutido"*. Antes de copiar o formato,
// os dois MOTORES foram comparados nas mesmas 6 conversas (25/09/2026): custo, contexto e processado
// saíram idênticos nas seis. A diferença era só de apresentação — e é ela que muda aqui:
//
//   antes (V20–V26):  Catálogo de skills · 195k · 13,3M · US$ 13,79* · cache 4m
//   agora (V27):      Catálogo de skills  $13.79  195k/13.3M
//   com mais de uma:  [Catálogo de skills  $13.79  195k/13.3M]  +3  │  $32.10  560k/40.2M
//
// ⚠️ O QUE NÃO FICOU IGUAL, E POR QUÊ — para ele decidir, não para passar calado:
//   - o painel põe TODAS as conversas lado a lado; a barra de cima não tem essa largura (o painel
//     chega a 5 conversas, ~1.000 px). Aqui vai a conversa em uso e as outras viram `+N`, com o
//     total ao lado e cada uma, por extenso, na dica do mouse. O clique abre a vista Tokens, que é o
//     `▾` do painel;
//   - o relógio do cache SAIU da linha (fica só na dica): ele pediu o relógio no rodapé do chat, ao
//     lado do modelo, onde a extensão oficial já o mostra — ver o comentário em `montarTexto`.
//
// ⚠️ QUAIS CONVERSAS SÃO "DESTA JANELA" (V27). Até a V26 a conversa era achada pela PASTA — e a mesma
// pasta aberta no VS Code e na OFICINA dava conversas indistinguíveis. Agora é pelo processo: na
// extensão oficial 2.1.278, nesta máquina (medido em 25/09/2026, 6 conversas da OFICINA + 1 do VS
// Code), a conversa é filha do host de extensões da janela — o processo em que esta extensão roda
// (`paisDosProcessos.js`). ⚠️ Isso é medido numa versão, não uma lei: se outra versão lançar a
// conversa por um processo intermediário, nenhuma será "filha" — e aí a busca volta a ser pela pasta,
// em vez de afirmar "nenhuma conversa". A pasta também é o piso enquanto o sistema não respondeu.
//
// ⚠️ NOME DE PASTA NÃO É TÍTULO. O nome que vai para a barra é o que ele deu à conversa (linha
// `ai-title` do arquivo — `tituloDaConversa.js`). Sem nome dado, vão só os números.
//
// ⚠️ O CUSTO É ESTIMATIVA, E A TELA PRECISA DIZER. Em assinatura ninguém paga por token; o número
// responde "quanto isto custaria pela tabela da API". O painel não marca isso na linha, e a barra
// passou a não marcar também (o `*` saiu); a dica diz por extenso. Preço FALTANDO continua marcado
// com `+`: aí o número está incompleto, e isso não é formato, é verdade sobre o dado.

'use strict'

const os = require('os')
const T = require('./tokens')
const S = require('./sessaoAtiva')
const R = require('./relogioCache')
const TIT = require('./tituloDaConversa')
const P = require('./paisDosProcessos')

/** As chaves que a barra de cima lê — as mesmas duas do patch 0016 (texto vivo e sim/não). */
const CHAVE_DO_TEXTO = 'oficina.tokens'
const CHAVE_DE_MOSTRAR = 'oficina.tokens.aMostrar'

/**
 * O que a barra mostra quando NÃO há conversa aberta (t202).
 *
 * `–` no lugar do contexto e `0` no lugar do processado: o traço diz que não há o que medir, o
 * zero diz que nada passou pelo modelo. Ordem dele: *"ele tem que estar ligado ali o tempo inteiro
 * naquela mesma linha"* — e, sem conversa, *"marca só um risquinho e zero tokens"*.
 */
const SEM_CONVERSA = '– · 0'

/**
 * O que a barra mostra quando HÁ conversa e o medidor FALHOU (t202).
 *
 * ⚠️ ESTE ESTADO EXISTE PARA NÃO MENTIR. `0` é uma MEDIDA: diz "nada passou pelo modelo". Um medidor
 * que lançou exceção não sabe se passou muito ou pouco. Medida que ninguém fez não vira número na
 * tela; vira `?`.
 */
const SEM_MEDIDA = '– · ?'

/**
 * O aviso de conversa SEM PASTA (V27, item 3 dos pedidos de 25/09/2026).
 *
 * ⚠️ É O ESTADO MAIS PERIGOSO QUE A BARRA MOSTRA. Sem pasta aberta, a extensão oficial abre a conversa
 * na pasta pessoal — e ali não valem as regras do projeto: medido em 25/09/2026, 10 skills contra 80,
 * nenhum CLAUDE.md do projeto e nenhuma das travas DO PROJETO (as do settings da pessoa continuam valendo
 * em qualquer pasta — uma revisão pegou que eu tinha escrito "nenhuma trava"). Ele perdeu uma skill
 * essencial assim (*"um erro gravíssimo"*). O
 * conserto do mostrador sem pasta (V26) passou a mostrar números normais nesse estado — a barra
 * parecia saudável justamente quando não estava. Este aviso fecha isso.
 */
const AVISO_SEM_PASTA = '⚠ sem pasta'

/** A mesma cadência da vista de tokens da V10: a leitura é incremental, só o que cresceu. */
const INTERVALO_MS = 3000

// ── O formato do painel flutuante de tokens, copiado de propósito ─────

/** Um formato só, sempre com duas casas — igual ao painel. */
function dinheiro(v) { return '$' + (v || 0).toFixed(2) }

/** Tokens como o painel: `69.6k`, `195k`, `1.0M`. */
function tokens(n) {
  const v = n || 0
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'k'
}

/**
 * Nome curto, com a regra do painel: corta na palavra, nunca no meio, e tira palavra vazia
 * ("app", "de", "para"...) antes de cortar — o que distingue costuma estar no fim.
 */
function nomeCurto(n) {
  const limpo = (n || '').trim()
  if (limpo.length <= 20) return limpo
  const partes = limpo.split(/[\s/\-–—]+/).filter(Boolean)
  const uteis = partes.filter(p => !/^(app|de|da|do|the|e|em|para|pra|com|um|uma|projetos?)$/i.test(p))
  const base = (uteis.length ? uteis : partes).join(' ')
  if (base.length <= 20) return base
  let saida = ''
  for (const p of base.split(' ')) {
    if ((saida + ' ' + p).trim().length > 20) break
    saida = (saida + ' ' + p).trim()
  }
  return (saida || base.slice(0, 19)) + '…'
}

/** Custo como o painel, com `+` só quando falta preço de algum modelo (número incompleto). */
function custoDe(resumo) {
  if (!resumo) return null
  // ⚠️ Sem preço NENHUM conhecido, o custo não some calado (achado de revisão): vira `$?`.
  if (resumo.custoUsd == null) return '$?'
  return dinheiro(resumo.custoUsd) + (resumo.faltouPreco ? '+' : '')
}

/** Uma conversa no formato do painel: `nome  $1.24  69.6k/1.0M`. Sem nome, só os números. */
function itemDoPainel(nome, resumo) {
  const custo = custoDe(resumo)
  const partes = [nome ? nomeCurto(nome) : null, custo, `${tokens(resumo.contextoAgora)}/${tokens(resumo.tokens)}`]
  return partes.filter(Boolean).join('  ')
}

function criarMostradorDeTokens(vscode, {
  agendar = setInterval,
  desagendar = clearInterval,
  /*
    ⚠️ SEM PASTA ABERTA, A PASTA É A PESSOAL — PORQUE É ONDE A EXTENSÃO OFICIAL ABRE A CONVERSA (V26).
    A regra está no código da extensão oficial instalada (2.1.278):
    `workspaceFolders?.[0]?.uri.fsPath ?? os.homedir()`. É o piso de quando o pai dos processos ainda
    não é conhecido.
  */
  pastaDoProjeto = () => {
    const p = vscode.workspace.workspaceFolders
    return p && p.length ? p[0].uri.fsPath : os.homedir()
  },
  /** A janela está sem pasta? É o que liga o aviso `⚠ sem pasta`. */
  semPasta = () => {
    const p = vscode.workspace.workspaceFolders
    return !(p && p.length)
  },
  acharSessao = S.sessaoDaPasta,
  acharTranscrito = T.acharTranscrito,
  criarMedidor = transcrito => new T.MedidorDaConversa(transcrito),
  lerTitulo = TIT.doTranscrito,
  /** O processo em que esta extensão roda — o pai das conversas desta janela. `null` desliga. */
  hostPid = process.pid,
  pais = hostPid ? P.criarPaisDosProcessos() : null,
  lerSessoes = () => S.lerTodas(),
  listarDaJanela = (host, paiDe, sessoes) => S.conversasDaJanela(host, paiDe, { sessoes }),
} = {}) {
  /** id → { transcrito, medidor, falhou, resumo } — uma entrada por conversa desta janela. */
  const medidas = new Map()
  /** A lista da passada atual: [{ id }] e qual está em uso. */
  let conversas = []
  let emUso = null
  let relogio = null
  let publicado = { mostrar: null, texto: null }
  let descartado = false
  const publicacoes = []
  const TETO_DAS_PUBLICACOES = 50

  const definir = (chave, valor) => {
    try { Promise.resolve(vscode.commands.executeCommand('setContext', chave, valor)).catch(() => { }) }
    catch { /* fora do editor não há chave: o mostrador não derruba a ativação */ }
  }

  /**
   * Quais conversas são desta janela, e qual está em uso.
   *
   * Caminho principal: pelo processo pai (V27). Enquanto o sistema não respondeu quem é o pai de
   * cada conversa, cai no caminho da V26 — uma conversa, achada pela pasta.
   */
  function descobrirConversas() {
    if (pais) {
      let sessoes = []
      try { sessoes = lerSessoes() } catch { sessoes = [] }
      // Só as conversas de EDITOR entram na consulta (revisão): as de terminal e as do SDK nunca são desta
      // barra, e cada PID a mais é uma linha a mais na pergunta ao sistema.
      try { pais.atualizar(sessoes.filter(s => S.ENTRADAS_DO_EDITOR.includes(s.entrypoint))) } catch { /* consulta que falha não derruba o tique */ }
      const r = listarDaJanela(hostPid, s => pais.paiDe(s), sessoes)
      // Lista VAZIA não é "nenhuma conversa": pode ser uma versão da extensão oficial que lança a
      // conversa por um processo intermediário. Cai para a pasta antes de afirmar o negativo.
      if (r && r.conversas.length) return { ids: r.conversas.map(c => c.id), emUso: r.emUso }
    }
    const pasta = pastaDoProjeto()
    const sessao = pasta ? acharSessao(pasta) : null
    return sessao ? { ids: [sessao.id], emUso: sessao.id } : { ids: [], emUso: null }
  }

  /**
   * Garante um medidor por conversa, e só por conversa que ainda existe.
   *
   * ⚠️ UM MEDIDOR POR CONVERSA, NUNCA TROCADO DE ARQUIVO. O medidor é incremental (lê só o que
   * cresceu); apontá-lo para outro arquivo somaria duas conversas num número só.
   *
   * ⚠️ O ARQUIVO É PROCURADO DE NOVO ENQUANTO NÃO EXISTIR. A sessão é registrada antes do `.jsonl`;
   * uma conversa recém-aberta não pode ficar sem medidor para sempre por ter sido vista cedo demais.
   * E arquivo ainda não escrito NÃO é falha de medição: vai para `– · 0`, nunca para `– · ?`.
   */
  function conferirMedidores() {
    const r = descobrirConversas()
    conversas = r.ids
    emUso = r.emUso
    for (const id of [...medidas.keys()]) if (!conversas.includes(id)) medidas.delete(id)
    for (const id of conversas) {
      let m = medidas.get(id)
      if (!m) { m = { transcrito: null, medidor: null, falhou: false, resumo: null }; medidas.set(id, m) }
      if (m.medidor) continue
      const transcrito = acharTranscrito(id)
      if (!transcrito) { m.falhou = false; continue }
      m.transcrito = transcrito
      try { m.medidor = criarMedidor(transcrito); m.falhou = false } catch { m.medidor = null; m.falhou = true }
    }
  }

  /** Mede todas. `atualizar`, NÃO `ler` — a V20 chamou um método que não existia e calou-se. */
  function medirTodas() {
    for (const id of conversas) {
      const m = medidas.get(id)
      if (!m || !m.medidor) { if (m) m.resumo = null; continue }
      try { m.medidor.atualizar(); m.resumo = m.medidor.resumo(); m.falhou = false }
      catch { m.resumo = null; m.falhou = true }
    }
  }

  /** O relógio do cache da conversa em uso (t201): `cache 4m`, `cache 4m?` ou `cache vencido`. */
  function relogioDe(resumo) {
    const rel = resumo && resumo.cache ? R.estadoDoRelogio(resumo.cache, Date.now()) : null
    if (!rel) return { texto: null, rel: null }
    return { rel, texto: rel.vencido ? 'cache vencido' : `cache ${rel.minutos}m${rel.suposto ? '?' : ''}` }
  }

  /**
   * O que a barra desenha: a primeira linha é o que se lê; o resto é a dica do mouse (patch 0016).
   */
  function montarTexto() {
    const nomeDe = id => { const x = medidas.get(id); return x && x.transcrito ? lerTitulo(x.transcrito) : null }
    const sem = semPasta() && conversas.length ? AVISO_SEM_PASTA + '  ' : ''

    // Nenhuma conversa nesta janela: o estado vazio do t202 ("um risquinho e zero tokens").
    if (!conversas.length) {
      return `${SEM_CONVERSA}\n${[
        'Tokens: nenhuma conversa aberta nesta janela agora.',
        'O contador fica na barra o tempo todo; ele se enche quando uma conversa começar.',
        '– = não há conversa para medir · 0 = nada processado ainda.',
      ].join('\n')}`
    }

    const principal = emUso && conversas.includes(emUso) ? emUso : conversas[0]
    const m = medidas.get(principal)
    const outras = conversas.filter(id => id !== principal)
    const medidas_ = conversas.map(id => medidas.get(id)).filter(x => x && x.resumo)

    /*
      ⚠️ NADA MEDIDO AINDA — e isto é diferente de "nenhuma conversa" (achado de revisão, 25/09/2026).
      A primeira versão da V27 caía no estado vazio sempre que a conversa EM USO não tinha números: uma
      conversa nova aberta ao lado de outra de $30 fazia a barra dizer "nenhuma conversa aberta", e as
      medidas da outra sumiam. Agora: há conversa e nada foi medido → os estados do t202, com a dica
      certa; há ALGUMA medida → ela aparece.
    */
    if (!medidas_.length) {
      const falhou = conversas.some(id => { const x = medidas.get(id); return x && x.falhou })
      const dica = falhou ? [
        'Tokens: há uma conversa, mas a medição falhou nesta passada.',
        'O ? está no lugar do número de propósito: dizer 0 seria afirmar que nada foi processado,',
        'e ninguém mediu isso. A próxima passada tenta de novo, a cada 3 segundos.',
      ] : [
        'Tokens: a conversa começou; os números aparecem na primeira resposta.',
        '– = ainda não há tamanho de conversa para medir · 0 = nada processado ainda.',
      ]
      if (sem) dica.push('', ...DICA_SEM_PASTA)
      return `${sem}${falhou ? SEM_MEDIDA : SEM_CONVERSA}\n${dica.join('\n')}`
    }

    const nomePrincipal = nomeDe(principal)
    let linha = m && m.resumo
      ? itemDoPainel(nomePrincipal, m.resumo)
      // A conversa em uso ainda sem número (acabou de nascer, ou falhou): o nome e um marcador honesto.
      : [nomePrincipal ? nomeCurto(nomePrincipal) : 'conversa nova', m && m.falhou ? '?' : '–'].join('  ')
    const rel = m && m.resumo ? relogioDe(m.resumo).rel : null
    if (outras.length) {
      // Com mais de uma, o painel marca a do foco e soma todas. O total SÓ aparece com mais de uma:
      // com uma, repetiria o mesmo número ao lado dele mesmo (regra do painel).
      const soma = medidas_.reduce((a, x) => ({
        custo: a.custo + (x.resumo.custoUsd || 0),
        contexto: a.contexto + (x.resumo.contextoAgora || 0),
        tokens: a.tokens + (x.resumo.tokens || 0),
      }), { custo: 0, contexto: 0, tokens: 0 })
      // O total marca o que ele NÃO soma: `?` se alguma conversa falhou na medição; `+` se falta preço
      // em alguma (a soma do custo está incompleta).
      const algumaFalhou = conversas.some(id => { const x = medidas.get(id); return x && x.falhou })
      const faltaPreco = medidas_.some(x => x.resumo.faltouPreco || x.resumo.custoUsd == null)
      const marca = algumaFalhou ? '?' : faltaPreco ? '+' : ''
      linha = `[${linha}]  +${outras.length}  │  ${dinheiro(soma.custo)}${marca}  ${tokens(soma.contexto)}/${tokens(soma.tokens)}`
    }
    /*
      ⚠️ V27: O RELÓGIO DO CACHE SAIU DA LINHA (continua na dica do mouse). Ordem dele, 25/09/2026:
      *"é embaixo, no chat do claude code, ao lado do modelo"*. E ele já está lá: a extensão oficial
      (2.1.278) mostra *"Prompt cache warm, about N min left."* no rodapé do chat, ao lado do modelo —
      lido no pacote dela. A barra de cima repetia o mesmo número num segundo lugar. O `t201` nasceu
      quando a conversa era o painel próprio, que tinha o relógio no pé; o pé do painel próprio continua
      com o dele.
    */
    const porConversa = conversas.map(id => {
      const x = medidas.get(id)
      const nome = nomeDe(id) || 'conversa sem nome'
      const marca = id === principal && outras.length ? '▸ ' : '  '
      if (!x || !x.resumo) return `${marca}${nome}: ${x && x.falhou ? 'a medição falhou' : 'ainda sem números'}`
      return `${marca}${nome}: ${custoDe(x.resumo)} · agora ${(x.resumo.contextoAgora || 0).toLocaleString('pt-BR')} tokens · processado ${(x.resumo.tokens || 0).toLocaleString('pt-BR')}`
    })
    const algumPrecoFaltando = medidas_.some(x => x.resumo.faltouPreco || x.resumo.custoUsd == null)
    const dica = [
      outras.length ? `Tokens das ${conversas.length} conversas desta janela (▸ = a que está em uso):` : 'Tokens desta conversa.',
      ...porConversa,
      '',
      outras.length
        ? 'Na barra: [a conversa em uso]  +N = quantas outras  │  a soma de todas.'
        : 'Na barra: o nome da conversa, o custo e os dois tamanhos.',
      '$ = custo em dólares (US$), uma estimativa: quanto isto custaria para quem paga por uso, pela tabela de',
      'preços da Anthropic. Na assinatura você não paga por token — o número serve para comparar o peso das conversas.',
      '195k/13.3M = o tamanho da conversa agora / tudo que já passou pelo modelo (k = mil, M = milhões).',
      'O segundo é o que pesa: a conversa inteira volta ao modelo a cada resposta.',
      ...(algumPrecoFaltando ? ['$? = nenhum preço conhecido para o modelo · + depois do custo = falta o preço de algum modelo, o número está incompleto.'] : []),
      ...(rel ? ['', R.dicaDoRelogio(rel), '(O relógio do cache fica no rodapé do chat, ao lado do modelo.)'] : []),
      ...(sem ? ['', ...DICA_SEM_PASTA] : []),
    ]
    return `${sem}${linha}\n${dica.join('\n')}`
  }

  function publicar() {
    if (descartado) return
    medirTodas()
    const texto = montarTexto()
    const mostrar = texto !== null
    if (publicado.mostrar !== mostrar) { definir(CHAVE_DE_MOSTRAR, mostrar); publicado.mostrar = mostrar }
    if (publicado.texto !== texto) {
      definir(CHAVE_DO_TEXTO, texto || '')
      publicado.texto = texto
      publicacoes.push({ mostrar, texto })
      if (publicacoes.length > TETO_DAS_PUBLICACOES) publicacoes.splice(0, publicacoes.length - TETO_DAS_PUBLICACOES)
    }
  }

  /** Uma passada: confere quais conversas são, mede e publica. Nunca lança. */
  function tique() {
    if (descartado) return
    try { conferirMedidores() } catch { /* registro ilegível: fica o que estava */ }
    publicar()
  }

  function ligar() {
    tique()
    if (!relogio) relogio = agendar(tique, INTERVALO_MS)
  }

  function descartar() {
    descartado = true
    if (relogio) { desagendar(relogio); relogio = null }
    medidas.clear()
  }

  return {
    ligar, descartar, tique, publicar,
    get idAtual() { return emUso },
    get conversas() { return conversas.slice() },
    get temMedidor() { return [...medidas.values()].some(m => m.medidor) },
    get temRelogio() { return relogio !== null },
    get publicacoes() { return publicacoes },
    get ultima() { return publicacoes[publicacoes.length - 1] || null },
  }
}

/** O que a dica diz no estado sem pasta. Uma lista só, para as duas saídas não divergirem. */
const DICA_SEM_PASTA = [
  '⚠ ESTA JANELA ESTÁ SEM PASTA ABERTA.',
  'A conversa roda na sua pasta pessoal: as instruções, skills e regras que ficam DENTRO da pasta do',
  'seu projeto (como o CLAUDE.md e a pasta .claude) não são carregadas. As suas, pessoais, continuam valendo.',
  'Abra a pasta do projeto (Arquivo → Abrir Pasta) e comece a conversa de novo lá.',
]

module.exports = {
  criarMostradorDeTokens, CHAVE_DO_TEXTO, CHAVE_DE_MOSTRAR, INTERVALO_MS, SEM_CONVERSA, SEM_MEDIDA,
  AVISO_SEM_PASTA, dinheiro, tokens, nomeCurto, itemDoPainel,
}
