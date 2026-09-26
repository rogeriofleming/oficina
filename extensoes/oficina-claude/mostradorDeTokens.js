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
//   com mais de uma (V29):  Catálogo skills  $13.79  195k │ teste  $0.07  48.1k │ $13.86
//
// ⚠️ O QUE NÃO FICOU IGUAL, E POR QUÊ — para ele decidir, não para passar calado:
//   - o painel põe TODAS as conversas lado a lado, e desde a V29 a barra também (até a V28
//     era a em uso e `+N`). Mas a barra de cima tem ~410 px na tela dele, e o painel chega a
//     ~1.000 px com 5 conversas: quando não cabe, a linha encolhe em degraus (`DEGRAUS`) e o nome é
//     o último a ceder. Cada uma, por extenso, fica na dica do mouse. O clique abre a vista Tokens;
//   - as CORES do painel vêm do núcleo (patch 0029), que corta esta linha nos separadores;
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

/**
 * Quanto tempo uma conversa pode ficar PARADA antes de sair da linha (V30).
 *
 * Ordem dele, 26/09/2026: *"depois de 5 minutos de uma conversa estar inativa ele tira aquela
 * conversa do mostrador do painel"*.
 *
 * ⚠️ "PARADA" É A ÚLTIMA ESCRITA NO ARQUIVO DA CONVERSA, e não o `updatedAt` do registro de sessões.
 * O motivo está medido em `sessaoAtiva.js`: o registro de uma sessão ficou 20 minutos sem ser
 * reescrito ENQUANTO ela trabalhava. Quem é escrito a cada turno é o transcrito.
 *
 * ⚠️ NÃO SE APAGA O MEDIDOR de quem sai da linha, só se deixa de desenhá-la. O medidor é incremental
 * (lê só o que cresceu); jogá-lo fora faria a conversa ser relida INTEIRA — dezenas de MB — toda vez
 * que ela voltasse a ser usada.
 */
const INATIVA_MS = 5 * 60 * 1000

/**
 * Os botões que a faixa desenha ao lado do painel (V30, pedido dele em 26/09/2026): *"pode ter um
 * botãozinho para expandir as informações de tokens da conversa (...) e também pode ter o botão do
 * mapa de agentes"*.
 *
 * ⚠️ ELES EXISTEM SEMPRE, mesmo sem conversa e sem agente — decisão dele, na mesma conversa: *"se
 * não tiver nenhuma conversa rodando e também não tiver nenhum subagente ligado (...) não vai
 * mostrar nada, né? Mas ele existe"*. Isso INVERTE, só nesta linha, a regra de 24/09 ("onde não há o
 * que fazer, não há botão"): um botão que some não ensina ninguém onde a coisa mora. Quem abre um
 * vazio é avisado por QUEM ABRE, nunca pelo botão desaparecer.
 *
 * ⚠️ O ÍCONE É UM NOME DE CODICON, e o núcleo recusa qualquer coisa que não seja
 * `[a-z0-9-]+` — o que vai daqui vira classe de CSS lá.
 */
const BOTOES_DA_FAIXA = [
  { comando: 'oficina.tokens.abrir', icone: 'graph', dica: 'Detalhe dos tokens: modelos, subagentes e skills' },
  { comando: 'oficina.agentes.mapa', icone: 'type-hierarchy-sub', dica: 'Mapa dos agentes desta janela' },
]

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
function nomeCurto(n, teto = 20) {
  const limpo = (n || '').trim()
  if (limpo.length <= teto) return limpo
  const partes = limpo.split(/[\s/\-–—]+/).filter(Boolean)
  const uteis = partes.filter(p => !/^(app|de|da|do|the|e|em|para|pra|com|um|uma|projetos?)$/i.test(p))
  const base = (uteis.length ? uteis : partes).join(' ')
  if (base.length <= teto) return base
  let saida = ''
  for (const p of base.split(' ')) {
    if ((saida + ' ' + p).trim().length > teto) break
    saida = (saida + ' ' + p).trim()
  }
  return (saida || base.slice(0, teto - 1)) + '…'
}

/*
 ⚠️ O LIMITE POR CARACTERES MORREU NA V30 — e a morte dele é o conserto.

 Até a V29 havia aqui um `LIMITE_DA_LINHA = 78`: quantos caracteres eu ACHAVA que caberiam, contados
 contra uma largura que este arquivo não pode ver (o teto de `30vw` do patch 0023, 413 px na tela
 dele). Um palpite desses erra dos dois lados e envelhece sozinho — e foi o que ele viu: *"está
 escondendo a informação de metade do token (...) corta o nome das conversas"*. Medido em
 26/09/2026: com DUAS conversas o texto já pede 511 px contra 413 de teto, e aí o degrau 2 tirava o
 total processado de toda a linha.

 Agora a divisão é outra, e cada lado fica com o que ele sabe: **este arquivo publica TODOS os
 degraus**, do mais completo ao mais apertado (a política: o que cede primeiro é o total processado,
 depois a soma, e o nome é o último), e **o núcleo mede e escolhe** o mais completo que couber na
 largura real (patch 0030, `oficinaRotuloVivo.ts`). Nenhum dos dois precisa saber a metade do outro,
 e não há número para envelhecer.
*/

/**
 * Os degraus, do formato inteiro do painel ao mais apertado. O NOME é o último a ceder: foi o que
 * ele pediu (*"tem que ter o nome da sessão junto do lado"*). Antes dele saem o total processado
 * de cada conversa e os tokens da soma — os dois continuam, por extenso, na dica do mouse.
 */
//
// A SOMA sai antes do tamanho de cada conversa: o que ele quer ler é quanto CADA sessão gasta, e a
// soma ele faz de cabeça (e ela está na dica).
//
// ⚠️ O CUSTO, MEDIDO NO TESTE (11d3): com QUATRO conversas de nome comprido, cabe nome encurtado e
// o custo de cada uma, sem tamanho e sem soma. Para caber mais, o espaço tem de vir de outro lugar
// da barra (medidores, pesquisa): decisão dele, não deste arquivo.
const DEGRAUS = [
  // ⚠️ V30 — O PRIMEIRO DEGRAU NÃO CORTA O NOME. Até a V29 o degrau mais completo já entrava com
  // teto de 20 caracteres, porque na barra de cima nunca houve espaço para mais: `Comparar
  // pagamentos Hotmart` saía `Comparar pagamentos…` mesmo no melhor caso. Com a linha própria
  // (~1350 px) o nome inteiro cabe, e ele pediu o nome — este degrau existe para que o caso bom
  // seja de fato o caso bom.
  { teto: Infinity, porItem: 'ambos', total: 'ambos' },
  { teto: 20, porItem: 'ambos', total: 'ambos' },
  { teto: 20, porItem: 'contexto', total: 'ambos' },
  { teto: 20, porItem: 'contexto', total: 'custo' },
  { teto: 14, porItem: 'contexto', total: 'custo' },
  { teto: 14, porItem: 'contexto', total: 'nada' },
  { teto: 10, porItem: 'contexto', total: 'nada' },
  { teto: 14, porItem: 'nada', total: 'nada' },
  { teto: 10, porItem: 'nada', total: 'nada' },
  { teto: 7, porItem: 'nada', total: 'nada' },
]

/**
 * Os DEGRAUS da linha com todas as conversas da janela, do mais completo ao mais apertado — como o
 * painel flutuante: cada conversa com nome, custo e tamanho, separadas por ` │ `, e a soma no fim.
 * O separador e os dois espaços entre as partes são o contrato com o núcleo (patch 0029), que
 * colore cada parte pelo formato; a lista é o contrato com o patch 0030, que escolhe qual cabe.
 *
 * ⚠️ DEDUPLICADO, E ISSO IMPORTA. Com uma conversa só de nome curto, vários degraus produzem o
 * texto idêntico, e o núcleo mediria o mesmo texto nove vezes a cada layout para nada.
 *
 * `itens`: [{ nome, resumo, falhou }], na ordem da janela (estável: não pula quando se troca de aba).
 */
function degrausDasConversas(itens, soma) {
  const montar = d => {
    const partes = itens.map(({ nome, resumo, falhou }) => {
      const n = nome ? nomeCurto(nome, d.teto) : null
      if (!resumo) return [n || 'conversa nova', falhou ? '?' : '–'].join('  ')
      const tam = d.porItem === 'ambos' ? `${tokens(resumo.contextoAgora)}/${tokens(resumo.tokens)}`
        : d.porItem === 'contexto' ? tokens(resumo.contextoAgora) : null
      return [n, custoDe(resumo), tam].filter(Boolean).join('  ')
    })
    if (d.total === 'nada') return partes.join(' │ ')
    const total = `${dinheiro(soma.custo)}${soma.marca}` +
      (d.total === 'ambos' ? `  ${tokens(soma.contexto)}/${tokens(soma.tokens)}` : '')
    return [...partes, total].join(' │ ')
  }
  const vistos = new Set()
  const degraus = []
  for (const d of DEGRAUS) {
    const linha = montar(d)
    if (vistos.has(linha)) continue
    vistos.add(linha)
    degraus.push(linha)
  }
  // Nem o mais apertado cabendo, o núcleo desenha o último e corta com `…` — e a dica tem tudo.
  return degraus
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
  /** Quando o arquivo da conversa foi escrito pela última vez (ms), ou `null` se não dá para saber. */
  escritaEm = S.escritaDoTranscrito,
  /** O relógio, injetável — sem isto, provar "passou dos 5 minutos" custaria 5 minutos de teste. */
  agora = Date.now,
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
   * As conversas que a linha DESENHA: as que trabalharam nos últimos `INATIVA_MS`.
   *
   * ⚠️ A CONVERSA EM USO NUNCA SAI, e esta exceção é decisão minha, declarada. Ele pediu para tirar a
   * conversa parada; ler uma resposta longa por seis minutos sem escrever nada TAMBÉM é ficar parado,
   * e sem esta linha a conversa que ele está olhando sumiria da tela — com uma conversa só aberta, o
   * mostrador cairia no estado "nenhuma conversa aberta", que seria falso. O que ele quer fora são as
   * abandonadas, não a da frente dele.
   *
   * ⚠️ SEM SABER A HORA, NÃO SE ESCONDE. Transcrito que não dá para ler devolve `null`, e aí a
   * conversa FICA: a falha tem de cair para o lado de mostrar a mais, nunca para o de esconder um
   * gasto que existe.
   */
  function peneirarAsParadas() {
    const limite = agora() - INATIVA_MS
    const vivas = conversas.filter(id => {
      if (id === emUso) return true
      let quando = null
      try { quando = escritaEm(id) } catch { quando = null }
      if (typeof quando !== 'number') return true
      return quando >= limite
    })
    // Não sobrou nenhuma: desenha todas, em vez de afirmar que não há conversa.
    return vivas.length ? vivas : conversas
  }

  /**
   * O que a barra desenha: a primeira linha é o que se lê; o resto é a dica do mouse (patch 0016).
   */
  function montarTexto() {
    // V30: `aMostrar` é o que se desenha; `conversas` continua sendo TUDO que se mede.
    const aMostrar = peneirarAsParadas()
    const paradas = conversas.length - aMostrar.length
    // V29: o nome vem do MEDIDOR, que lê o arquivo inteiro e aplica a regra do painel (o
    // título dado, o automático, o último pedido, o começo do id). Antes vinha só do `ai-title`, e
    // conversa sem título ("teste") aparecia sem nome. `lerTitulo` fica como piso.
    const nomeDe = id => {
      const x = medidas.get(id)
      if (!x) return null
      const doMedidor = x.medidor && typeof x.medidor.nome === 'string' ? x.medidor.nome : null
      return doMedidor || (x.transcrito ? lerTitulo(x.transcrito) : null)
    }
    const sem = semPasta() && aMostrar.length ? AVISO_SEM_PASTA + '  ' : ''

    // Nenhuma conversa nesta janela: o estado vazio do t202 ("um risquinho e zero tokens").
    if (!aMostrar.length) {
      return `${SEM_CONVERSA}\n${[
        'Tokens: nenhuma conversa aberta nesta janela agora.',
        'O contador fica na barra o tempo todo; ele se enche quando uma conversa começar.',
        '– = não há conversa para medir · 0 = nada processado ainda.',
      ].join('\n')}`
    }

    const principal = emUso && aMostrar.includes(emUso) ? emUso : aMostrar[0]
    const m = medidas.get(principal)
    const outras = aMostrar.filter(id => id !== principal)
    const medidas_ = aMostrar.map(id => medidas.get(id)).filter(x => x && x.resumo)

    /*
      ⚠️ NADA MEDIDO AINDA — e isto é diferente de "nenhuma conversa" (achado de revisão, 25/09/2026).
      A primeira versão da V27 caía no estado vazio sempre que a conversa EM USO não tinha números: uma
      conversa nova aberta ao lado de outra de $30 fazia a barra dizer "nenhuma conversa aberta", e as
      medidas da outra sumiam. Agora: há conversa e nada foi medido → os estados do t202, com a dica
      certa; há ALGUMA medida → ela aparece.
    */
    if (!medidas_.length) {
      const falhou = aMostrar.some(id => { const x = medidas.get(id); return x && x.falhou })
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
    // V30: `degraus` fica nulo com uma conversa so — ai a lista tem um item, montado no fim.
    let degraus = null
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
      const algumaFalhou = aMostrar.some(id => { const x = medidas.get(id); return x && x.falhou })
      const faltaPreco = medidas_.some(x => x.resumo.faltouPreco || x.resumo.custoUsd == null)
      const marca = algumaFalhou ? '?' : faltaPreco ? '+' : ''
      // V29: TODAS pelo nome, como o painel — antes era a em uso e `+N`. Ele: *"e se eu
      // tiver com quatro sessões abertas? (...) tem que ter o nome da sessão junto do lado"*.
      degraus = degrausDasConversas(aMostrar.map(id => {
        const x = medidas.get(id)
        return { nome: nomeDe(id), resumo: x && x.resumo, falhou: !!(x && x.falhou) }
      }), { ...soma, marca })
      linha = degraus[0]
    }
    /*
      ⚠️ V27: O RELÓGIO DO CACHE SAIU DA LINHA (continua na dica do mouse). Ordem dele, 25/09/2026:
      *"é embaixo, no chat do claude code, ao lado do modelo"*. E ele já está lá: a extensão oficial
      (2.1.278) mostra *"Prompt cache warm, about N min left."* no rodapé do chat, ao lado do modelo —
      lido no pacote dela. A barra de cima repetia o mesmo número num segundo lugar. O `t201` nasceu
      quando a conversa era o painel próprio, que tinha o relógio no pé; o pé do painel próprio continua
      com o dele.
    */
    const porConversa = aMostrar.map(id => {
      const x = medidas.get(id)
      const nome = nomeDe(id) || 'conversa sem nome'
      const marca = id === principal && outras.length ? '▸ ' : '  '
      if (!x || !x.resumo) return `${marca}${nome}: ${x && x.falhou ? 'a medição falhou' : 'ainda sem números'}`
      return `${marca}${nome}: ${custoDe(x.resumo)} · agora ${(x.resumo.contextoAgora || 0).toLocaleString('pt-BR')} tokens · processado ${(x.resumo.tokens || 0).toLocaleString('pt-BR')}`
    })
    const algumPrecoFaltando = medidas_.some(x => x.resumo.faltouPreco || x.resumo.custoUsd == null)
    const dica = [
      outras.length ? `Tokens das ${aMostrar.length} conversas desta janela (▸ = a que está em uso):` : 'Tokens desta conversa.',
      ...porConversa,
      '',
      outras.length
        ? 'Na barra: cada conversa desta janela (nome, custo, tamanho)  │  no fim, a soma de todas. Sem espaço, o total processado sai da linha e os nomes encurtam; aqui fica tudo.'
        : 'Na barra: o nome da conversa, o custo e os dois tamanhos.',
      '$ = custo em dólares (US$), uma estimativa: quanto isto custaria para quem paga por uso, pela tabela de',
      'preços da Anthropic. Na assinatura você não paga por token — o número serve para comparar o peso das conversas.',
      '195k/13.3M = o tamanho da conversa agora / tudo que já passou pelo modelo (k = mil, M = milhões).',
      'O segundo é o que pesa: a conversa inteira volta ao modelo a cada resposta.',
      ...(algumPrecoFaltando ? ['$? = nenhum preço conhecido para o modelo · + depois do custo = falta o preço de algum modelo, o número está incompleto.'] : []),
      // ⚠️ O QUE SAIU DA LINHA É DITO AQUI. Esconder conversa sem avisar seria a mesma classe de
      // defeito que esta versão conserta: número que some calado.
      ...(paradas > 0 ? ['', `${paradas} conversa${paradas > 1 ? 's' : ''} parada${paradas > 1 ? 's' : ''} há mais de 5 minutos não aparece${paradas > 1 ? 'm' : ''} na linha (continuam medidas; voltam quando você escrever nelas).`] : []),
      ...(rel ? ['', R.dicaDoRelogio(rel), '(O relógio do cache fica no rodapé do chat, ao lado do modelo.)'] : []),
      ...(sem ? ['', ...DICA_SEM_PASTA] : []),
    ]
    /*
      ⚠️ V30: SAI UMA LISTA, E NÃO UM TEXTO. O primeiro é o degrau mais completo e leva a dica
      inteira (o núcleo tira o `title` das linhas depois da primeira); os outros são só a linha,
      porque repetir a dica nove vezes seria publicar ~9 KB a cada poucos segundos, sem ninguém ler.
    */
    const linhas = (degraus && degraus.length ? degraus : [linha])
    return [`${sem}${linhas[0]}\n${dica.join('\n')}`, ...linhas.slice(1).map(l => `${sem}${l}`)]
  }

  function publicar() {
    if (descartado) return
    medirTodas()
    const degraus = montarTexto()
    const mostrar = degraus !== null
    // ⚠️ SEMPRE JSON (array), mesmo com um degrau só: assim há UM formato para o núcleo ler, e não
    // dois caminhos a manter. O `oficinaLerDegraus` ainda aceita texto puro — para um produto antigo,
    // não para este.
    // ⚠️ OS ESTADOS VAZIOS (`– · 0`, `– · ?`, a conversa que acabou de nascer) saem de `montarTexto`
    // como UM texto, e não como escada: não há o que encolher neles. Normaliza-se aqui, num lugar só,
    // para o núcleo ver sempre a mesma forma — e para os botões existirem TAMBÉM nesses estados, que
    // é o que ele pediu (o botão existe mesmo sem ter o que mostrar).
    const lista = degraus === null ? null : (Array.isArray(degraus) ? degraus : [degraus])
    const texto = lista === null ? null : JSON.stringify({ degraus: lista, botoes: BOTOES_DA_FAIXA })
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
    /*
      V30 — O QUE O MAPA DOS AGENTES LÊ. O mostrador já mede TODAS as conversas desta janela, e cada
      medidor já traz os subagentes do disco (fichas `.meta.json` + `agent-<id>.jsonl`). Expor isto
      evita um segundo leitor do mesmo disco — e é o que permite o mapa existir na conversa da
      extensão OFICIAL, onde os eventos ao vivo do SDK não chegam à OFICINA.

      ⚠️ AQUI NÃO SE PENEIRA POR INATIVIDADE. A peneira dos 5 minutos é do que se DESENHA na linha;
      o mapa mostra os agentes das conversas da janela, e uma conversa parada pode ter deixado
      agentes que ele quer ver.
    */
    get agentesPorConversa() {
      return conversas.map(id => {
        const x = medidas.get(id)
        const r = x && x.resumo
        return {
          id,
          nome: (x && x.medidor && typeof x.medidor.nome === 'string' ? x.medidor.nome : null) || null,
          emUso: id === emUso,
          contexto: r ? (r.contextoAgora || 0) : 0,
          subagentes: r && Array.isArray(r.subagentes) ? r.subagentes : [],
        }
      })
    },
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
  AVISO_SEM_PASTA, dinheiro, tokens, nomeCurto, itemDoPainel, degrausDasConversas, INATIVA_MS, BOTOES_DA_FAIXA,
}
