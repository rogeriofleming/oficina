// O MEDIDOR DE TOKENS DA CONVERSA — a barra e a vista "Tokens" (V10).
//
// Três números, porque são três perguntas diferentes:
//   - CONTEXTO AGORA: quanto o modelo leu na última resposta. É o tamanho da conversa hoje.
//   - PROCESSADO: tudo que já passou pelo modelo nesta conversa. A mesma conversa é relida a cada
//     resposta, então este número cresce muito mais depressa que o de cima — e é ele que custa.
//   - CUSTO ESTIMADO: o processado pela tabela de preços da API (`precos.js`, fonte única). Em
//     assinatura ninguém paga por token: o número responde "quanto custaria", e diz que é estimativa.
// E, no detalhe, quanto cada SUBAGENTE gastou (cada um grava arquivo próprio) e quais SKILLS a
// conversa carregou (só a lista: skill entra no contexto da conversa, não tem gasto separado).
//
// ⚠️ AS REGRAS DO ARQUIVO DA CONVERSA. Três delas foram MEDIDAS sobre arquivos reais — não mudar sem
// medir de novo:
//   1. a mesma resposta aparece em várias linhas do arquivo (uma por bloco de conteúdo), e nos
//      subagentes essas linhas trazem a saída PARCIAL crescendo: fica a de maior saída, uma vez;
//   2. o subagente grava em `<conversa>/subagents/agent-<id>.jsonl`, e o gasto dele não aparece em
//      lugar nenhum do arquivo principal;
//   3. resposta com modelo `<synthetic>` é aviso interno do programa, não chamada ao modelo.
// O que mudou na porta: o preço sai de `precos.js` (com modo rápido e cache de 1 hora, que a tabela
// antiga não tinha), e o arquivo é achado pelo id da conversa, que a OFICINA conhece — não por
// palpite de "o mais recente desta pasta".
//
// ⚠️ LEITURA INCREMENTAL. Arquivo de conversa longa passa de dezenas de MB. Cada leitura pega só o
// que foi escrito desde a anterior; trocar o arquivo por outro (mesmo nome) recomeça do zero.
//
// Nada aqui usa `require('vscode')`: `testes/tokens.mjs` prova o motor em node puro.

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { StringDecoder } = require('string_decoder')
const precos = require('./precos')
const { RelogioDoCache } = require('./relogioCache')

const BLOCO_BYTES = 1024 * 1024

/** Onde o programa do Claude guarda as conversas (respeita `CLAUDE_CONFIG_DIR`, como ele). */
function diretorioDeProjetos(env = process.env) {
  const base = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(base, 'projects')
}

/** O arquivo da conversa pelo id dela — o id é único, então basta achar `<id>.jsonl`. */
function acharTranscrito(sessaoId, raiz = diretorioDeProjetos()) {
  if (!sessaoId || !/^[0-9a-f-]{8,}$/i.test(sessaoId)) return null
  let pastas
  try { pastas = fs.readdirSync(raiz, { withFileTypes: true }) } catch { return null }
  for (const p of pastas) {
    if (!p.isDirectory()) continue
    const candidato = path.join(raiz, p.name, sessaoId + '.jsonl')
    try { if (fs.statSync(candidato).isFile()) return candidato } catch { }
  }
  return null
}

function arquivosDeSubagente(transcrito) {
  const pasta = path.join(path.dirname(transcrito), path.basename(transcrito, '.jsonl'), 'subagents')
  try {
    return fs.readdirSync(pasta).filter(n => n.endsWith('.jsonl')).map(n => path.join(pasta, n))
  } catch {
    return []
  }
}

/*
  V16 — A FICHA DO SUBAGENTE NO DISCO: `agent-<id>.meta.json`, ao lado do `agent-<id>.jsonl`.

  ⚠️ O DEFEITO QUE ELA CONSERTA (medido em 18/09/2026: 8 de 11 subagentes de uma conversa real sem nome). O nome
  vinha só do arquivo PRINCIPAL: a chamada `Agent` (descrição) + o resultado dela (`agentId:`). O subagente de
  SEGUNDO nível é chamado de dentro de outro subagente — nenhuma das duas linhas existe no arquivo principal, e ele
  aparecia como "subagente xxxxxx". A ficha tem tudo, em qualquer nível: `description`, `agentType`, `toolUseId`,
  `parentAgentId` (só do segundo nível em diante), `spawnDepth` e `stoppedByUser` (só quando a pessoa parou).
  Conferido em 470 fichas desta máquina e numa sonda ao vivo (SDK 0.3.261). Sem ficha (conversa antiga), fica o
  caminho de antes.
*/
function lerFichaDoSubagente(arquivoJsonl) {
  try {
    const o = JSON.parse(fs.readFileSync(arquivoJsonl.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
    if (!o || typeof o !== 'object') return null
    const texto = v => (typeof v === 'string' && v ? v : null)
    return {
      nome: texto(o.description),
      tipo: texto(o.agentType),
      chamada: texto(o.toolUseId),
      pai: texto(o.parentAgentId),
      profundidade: Number.isFinite(o.spawnDepth) ? o.spawnDepth : null,
      parado: o.stoppedByUser === true,
    }
  } catch {
    return null
  }
}

/** A hora de uma linha sem abrir o JSON de novo (só nos arquivos de subagente, para o começo e o fim). */
const HORA_DA_LINHA = /"timestamp":"([^"]+)"/

/** Lê só o que foi escrito desde a última vez. */
class ArquivoIncremental {
  constructor(arquivo) {
    this.arquivo = arquivo
    this._reiniciar()
    this.reiniciou = false
    this.assinatura = null
  }

  _reiniciar() {
    // Quem mede precisa saber: o que ele somou deste arquivo não vale mais.
    this.reiniciou = true
    this.offset = 0
    this.parcial = ''
    this.decodificador = new StringDecoder('utf8')
  }

  /** As linhas COMPLETAS novas. A última, se ainda está sendo escrita, espera a próxima leitura. */
  linhasNovas() {
    let st
    try { st = fs.statSync(this.arquivo) } catch { return [] }
    const assinatura = `${st.ino}|${st.birthtimeMs}`
    if (this.assinatura !== null && assinatura !== this.assinatura) this._reiniciar()
    this.assinatura = assinatura
    if (st.size < this.offset) this._reiniciar()
    if (st.size === this.offset) return []

    const linhas = []
    let fd
    try {
      fd = fs.openSync(this.arquivo, 'r')
      const buf = Buffer.alloc(BLOCO_BYTES)
      while (this.offset < st.size) {
        const lidos = fs.readSync(fd, buf, 0, Math.min(BLOCO_BYTES, st.size - this.offset), this.offset)
        if (lidos <= 0) break
        this.offset += lidos
        const partes = (this.parcial + this.decodificador.write(buf.subarray(0, lidos))).split('\n')
        this.parcial = partes.pop()
        linhas.push(...partes)
      }
    } catch {
      // arquivo sumiu no meio: devolve o que deu para ler
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd) } catch { }
    }
    // Arquivo que termina sem quebra de linha: a última linha só vale se já for JSON inteiro.
    if (this.parcial) {
      try { JSON.parse(this.parcial); linhas.push(this.parcial); this.parcial = '' } catch { }
    }
    return linhas
  }
}

/** Uma linha do arquivo, no que interessa ao medidor. */
function interpretarLinha(linha) {
  if (!linha || !linha.trim()) return null
  let o
  try { o = JSON.parse(linha) } catch { return null }

  // V29 — o NOME, com a mesma regra do painel flutuante de tokens (ferramenta à parte,
  // fora deste repositório): o título que ele deu, o automático, o último pedido. Sem a terceira, conversa sem
  // título ("teste", "oi") aparecia só com os números, e ele não sabia qual era qual.
  if (o.type === 'custom-title' && o.customTitle) return { rotulo: { custom: String(o.customTitle) } }
  if (o.type === 'ai-title' && o.aiTitle) return { rotulo: { automatico: String(o.aiTitle) } }
  if (o.type === 'last-prompt' && o.lastPrompt) return { rotulo: { ultimoPedido: String(o.lastPrompt) } }

  /*
    ⚠️ SKILL CHAMADA POR `/nome` NÃO PASSA PELA FERRAMENTA `Skill` (revisão de código, 16/09/2026). É o caminho
    do clique no painel de skills, e de quem digita o comando. O arquivo grava duas falas da pessoa: uma com
    `<command-name>/nome</command-name>` e, logo depois, o conteúdo da skill, que começa com "Base directory
    for this skill". Comando embutido (`/model`, `/clear`) grava a primeira e NÃO a segunda — medido em 465
    conversas gravadas: 50 skills com a segunda fala, 80 comandos embutidos sem ela. Por isso a skill só conta
    quando as duas aparecem em sequência.
  */
  if (o.type === 'user' && o.message) {
    const c = o.message.content
    const texto = typeof c === 'string' ? c
      : Array.isArray(c) ? c.map(b => (b && b.type === 'text' && b.text) || '').join('\n') : ''
    const comando = /<command-name>\/([^<\s]+)<\/command-name>/.exec(texto)
    if (comando) return { comando: comando[1] }
    if (/^\s*Base directory for this skill/.test(texto)) return { cargaDeSkill: o.uuid || null }
  }

  // O resultado da chamada de subagente traz o id dele, o mesmo do nome do arquivo `agent-<id>.jsonl`.
  if (o.type === 'user' && o.message && Array.isArray(o.message.content)) {
    for (const bloco of o.message.content) {
      if (!bloco || bloco.type !== 'tool_result') continue
      const texto = typeof bloco.content === 'string' ? bloco.content
        : Array.isArray(bloco.content) ? bloco.content.map(p => (p && p.text) || '').join(' ') : ''
      const achado = /agentId:\s*([a-z0-9]+)/i.exec(texto)
      if (achado) return { ligacao: { chamada: bloco.tool_use_id, agente: achado[1] } }
    }
    return null
  }

  if (o.type !== 'assistant' || !o.message || !o.message.id) return null
  const msg = o.message
  const acoes = []
  // V16 — todas as ferramentas da linha (nome e id): nos subagentes, é a contagem e a última ferramenta do mapa.
  const ferramentas = []
  for (const bloco of Array.isArray(msg.content) ? msg.content : []) {
    if (!bloco || bloco.type !== 'tool_use') continue
    ferramentas.push({ id: bloco.id || null, nome: String(bloco.name || '') })
    const entrada = bloco.input || {}
    if (bloco.name === 'Skill' && entrada.skill) acoes.push({ tipo: 'skill', id: bloco.id, nome: String(entrada.skill) })
    else if (bloco.name === 'Agent' || bloco.name === 'Task') {
      acoes.push({ tipo: 'agente', id: bloco.id, nome: String(entrada.description || entrada.subagent_type || 'subagente') })
    }
  }
  if (msg.model === '<synthetic>' || !msg.usage) return acoes.length || ferramentas.length ? { acoes, ferramentas } : null
  return { resposta: { id: msg.id, modelo: msg.model || null, uso: msg.usage, veloz: msg.usage.speed === 'fast', timestamp: o.timestamp || null }, acoes, ferramentas }
}

/** Mede UMA conversa: o arquivo principal e os dos subagentes. */
class MedidorDaConversa {
  constructor(transcrito, { listarSubagentes = arquivosDeSubagente, agora = Date.now } = {}) {
    this.transcrito = transcrito
    this.listarSubagentes = listarSubagentes
    this.arquivos = new Map([[transcrito, new ArquivoIncremental(transcrito)]])
    this.respostas = new Map()       // id da resposta -> { arquivo, modelo, uso, veloz }
    this.skills = new Map()          // nome -> vezes
    this.skillsVistas = new Set()    // id do bloco, para a mesma chamada não contar duas vezes
    this.nomesDeAgente = new Map()   // id da chamada -> descrição
    this.ligacoes = new Map()        // id da chamada -> id do arquivo do subagente
    this.contextoAgora = 0
    this.rotulo = {}                 // { custom, automatico, ultimoPedido } — a última linha de cada tipo
    // V14 — o relógio do cache: só a conversa PRINCIPAL (subagente tem cache e relógio próprios).
    this.relogio = new RelogioDoCache({ agora })
    // V16 — por arquivo de subagente: a ficha (`.meta.json`) e o que o mapa dos agentes mostra de uma conversa
    // que não está viva (começo, fim, ferramentas, a última delas, a última resposta).
    this.fichas = new Map()          // arquivo -> ficha, ou null enquanto ela não aparece
    this.andamento = new Map()       // arquivo -> { inicioMs, fimMs, ferramentas: Set, ultimaFerramenta, ultimaResposta }
  }

  /** Lê o que é novo em todos os arquivos. Devolve `true` se algum número mudou. */
  atualizar() {
    for (const a of this.listarSubagentes(this.transcrito)) {
      if (!this.arquivos.has(a)) this.arquivos.set(a, new ArquivoIncremental(a))
    }
    let mudou = false
    for (const [arquivo, leitor] of this.arquivos) {
      const principal = arquivo === this.transcrito
      // A ficha nasce junto com o subagente; enquanto não aparece, tenta de novo a cada leitura.
      if (!principal && !this.fichas.get(arquivo)) {
        const ficha = lerFichaDoSubagente(arquivo)
        this.fichas.set(arquivo, ficha)
        if (ficha) mudou = true
      }
      const linhas = leitor.linhasNovas()
      // ⚠️ ARQUIVO TROCADO: sem apagar o que veio dele, o total somaria o arquivo velho e o novo.
      if (leitor.reiniciou) {
        leitor.reiniciou = false
        for (const [id, r] of this.respostas) if (r.arquivo === arquivo) this.respostas.delete(id)
        if (principal) { this.contextoAgora = 0; this.skills.clear(); this.skillsVistas.clear(); this.relogio.zerar(); this.rotulo = {} }
        else this.andamento.delete(arquivo)
        mudou = true
      }
      let and = null
      if (!principal) {
        and = this.andamento.get(arquivo)
        if (!and) { and = { inicioMs: null, fimMs: null, ferramentas: new Set(), ultimaFerramenta: null, ultimaResposta: null }; this.andamento.set(arquivo, and) }
      }
      for (const linha of linhas) {
        if (and) {
          const hora = HORA_DA_LINHA.exec(linha)
          const ms = hora ? Date.parse(hora[1]) : NaN
          if (Number.isFinite(ms)) {
            if (and.inicioMs === null || ms < and.inicioMs) and.inicioMs = ms
            if (and.fimMs === null || ms > and.fimMs) and.fimMs = ms
          }
        }
        const r = interpretarLinha(linha)
        if (!r) continue
        if (and) {
          for (const f of r.ferramentas || []) {
            if (f.id && and.ferramentas.has(f.id)) continue
            and.ferramentas.add(f.id || `sem-id:${and.ferramentas.size}`)
            and.ultimaFerramenta = f.nome || and.ultimaFerramenta
            mudou = true
          }
          if (r.resposta && !this.respostas.has(r.resposta.id)) and.ultimaResposta = r.resposta.id
        }
        // Renomear ACRESCENTA outra linha: vale a última de cada tipo (igual ao painel).
        if (r.rotulo) { if (principal) { Object.assign(this.rotulo, r.rotulo); mudou = true } continue }
        if (r.ligacao) { if (principal) this.ligacoes.set(r.ligacao.chamada, r.ligacao.agente); mudou = true; continue }
        // Skill por `/nome`: o comando fica pendente até a carga da skill chegar (ver `interpretarLinha`).
        if (r.comando !== undefined) { if (principal) this.comandoPendente = r.comando; continue }
        if (r.cargaDeSkill !== undefined) {
          if (principal && this.comandoPendente) {
            const id = 'comando:' + (r.cargaDeSkill || this.skills.size + ':' + this.comandoPendente)
            if (!this.skillsVistas.has(id)) {
              this.skillsVistas.add(id)
              this.skills.set(this.comandoPendente, (this.skills.get(this.comandoPendente) || 0) + 1)
              mudou = true
            }
          }
          if (principal) this.comandoPendente = null
          continue
        }
        if (principal && r.resposta) this.comandoPendente = null
        // As ações são colhidas ANTES de descartar a linha repetida: a linha que traz a chamada da
        // skill costuma ser justamente uma das repetidas.
        if (principal) {
          for (const acao of r.acoes || []) {
            if (acao.tipo === 'skill' && !this.skillsVistas.has(acao.id)) {
              this.skillsVistas.add(acao.id)
              this.skills.set(acao.nome, (this.skills.get(acao.nome) || 0) + 1)
              mudou = true
            } else if (acao.tipo === 'agente') {
              this.nomesDeAgente.set(acao.id, acao.nome)
            }
          }
        }
        if (!r.resposta) continue
        const u = r.resposta.uso
        if (principal) {
          const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
          if (ctx > 0 && ctx !== this.contextoAgora) { this.contextoAgora = ctx; mudou = true }
          // Antes do descarte da linha repetida: a primeira linha da resposta dá a hora, e qualquer uma dá o TTL.
          this.relogio.resposta(r.resposta.id, u, r.resposta.timestamp)
        }
        const anterior = this.respostas.get(r.resposta.id)
        if (anterior && (u.output_tokens || 0) <= (anterior.uso.output_tokens || 0)) continue
        this.respostas.set(r.resposta.id, { ...r.resposta, arquivo })
        mudou = true
      }
    }
    return mudou
  }

  /**
   * O nome da conversa, na ordem do painel flutuante: o título dado por ele, o automático, o último
   * pedido (cortado em 60) e, sem nada disso, o começo do id. `null` só antes da primeira leitura.
   */
  get nome() {
    if (this.rotulo.custom) return this.rotulo.custom
    if (this.rotulo.automatico) return this.rotulo.automatico
    if (this.rotulo.ultimoPedido) {
      const p = this.rotulo.ultimoPedido.replace(/\s+/g, ' ').trim()
      if (p) return p.length > 60 ? p.slice(0, 60) + '…' : p
    }
    return path.basename(this.transcrito, '.jsonl').slice(0, 8)
  }

  /** Os números, prontos para a tela. */
  resumo() {
    const somar = lista => {
      const porPreco = new Map()
      const uso = precos.usoZerado()
      for (const r of lista) {
        precos.somarUso(uso, r.uso)
        const chave = (r.modelo || '?') + (r.veloz ? '|rapido' : '')
        const g = porPreco.get(chave) || { modelo: r.modelo, veloz: r.veloz, uso: precos.usoZerado(), respostas: 0 }
        precos.somarUso(g.uso, r.uso)
        g.respostas++
        porPreco.set(chave, g)
      }
      let custoUsd = null
      let faltouPreco = false
      const modelos = []
      for (const g of porPreco.values()) {
        const parcela = g.modelo ? precos.custoDoUso(g.uso, g.modelo, g.veloz) : null
        if (parcela == null) faltouPreco = true
        else custoUsd = (custoUsd || 0) + parcela
        modelos.push({ modelo: g.modelo, veloz: g.veloz, tokens: precos.totalDeTokens(g.uso), custoUsd: parcela, respostas: g.respostas })
      }
      modelos.sort((a, b) => b.tokens - a.tokens)
      return { tokens: precos.totalDeTokens(uso), custoUsd, faltouPreco, modelos, respostas: lista.length }
    }

    const todas = [...this.respostas.values()]
    const geral = somar(todas)

    const porArquivo = new Map()
    for (const r of todas) {
      if (r.arquivo === this.transcrito) continue
      if (!porArquivo.has(r.arquivo)) porArquivo.set(r.arquivo, [])
      porArquivo.get(r.arquivo).push(r)
    }
    const idDoArquivo = arq => path.basename(arq, '.jsonl').replace(/^agent-/, '')
    const nomePorAgente = new Map()
    for (const [chamada, nome] of this.nomesDeAgente) {
      const id = this.ligacoes.get(chamada)
      if (id) nomePorAgente.set(id, nome)
    }
    const chamadaPorAgente = new Map([...this.ligacoes].map(([chamada, id]) => [id, chamada]))
    const subagentes = [...porArquivo].map(([arquivo, lista]) => {
      const s = somar(lista)
      const id = idDoArquivo(arquivo)
      const ficha = this.fichas.get(arquivo) || null
      const and = this.andamento.get(arquivo) || null
      const ultima = and && and.ultimaResposta ? this.respostas.get(and.ultimaResposta) : null
      return {
        // V16: a ficha primeiro (vale em qualquer nível); o arquivo principal só alcança o primeiro.
        nome: (ficha && ficha.nome) || nomePorAgente.get(id) || `subagente ${id.slice(0, 6)}`,
        tokens: s.tokens, custoUsd: s.custoUsd, respostas: s.respostas,
        // V16 — o que o mapa dos agentes mostra quando a conversa não está viva (ou o agente acabou antes de a
        // tela abrir). `tokensNoFim` é a mesma conta do agente ("total_tokens"): o contexto da última resposta
        // mais a saída dela — medido contra 12 subagentes reais (igual em 6; nos outros 6, a conta do disco fica de 0,24% a 0,79% abaixo).
        id,
        chamada: (ficha && ficha.chamada) || chamadaPorAgente.get(id) || null,
        pai: (ficha && ficha.pai) || null,
        profundidade: ficha && ficha.profundidade != null ? ficha.profundidade : (ficha && ficha.pai ? 2 : 1),
        tipo: (ficha && ficha.tipo) || null,
        parado: !!(ficha && ficha.parado),
        inicioMs: and ? and.inicioMs : null,
        fimMs: and ? and.fimMs : null,
        ferramentas: and ? and.ferramentas.size : 0,
        ultimaFerramenta: and ? and.ultimaFerramenta : null,
        tokensNoFim: ultima ? (ultima.uso.input_tokens || 0) + (ultima.uso.cache_read_input_tokens || 0) +
          (ultima.uso.cache_creation_input_tokens || 0) + (ultima.uso.output_tokens || 0) : null,
      }
    }).sort((a, b) => b.tokens - a.tokens)

    return {
      contextoAgora: this.contextoAgora,
      tokens: geral.tokens,
      custoUsd: geral.custoUsd,
      estimado: true,
      faltouPreco: geral.faltouPreco,
      respostas: geral.respostas,
      modelos: geral.modelos,
      subagentes,
      skills: [...this.skills].map(([nome, vezes]) => ({ nome, vezes })).sort((a, b) => b.vezes - a.vezes || a.nome.localeCompare(b.nome)),
      tabelaDe: precos.ATUALIZADA_EM,
      // V14 — de onde o relógio do cache parte e de quanto ele é (`relogioCache.js`); `null` antes da primeira resposta.
      cache: this.relogio.dados(),
    }
  }
}

/** 584 → "584", 12_300 → "12k", 1_234_567 → "1,2M", 156_000_000 → "156M". */
function formatarTokens(n) {
  const v = Number(n) || 0
  if (v < 1000) return String(Math.round(v))
  // O arredondamento decide a faixa, não o número cru: 999.600 arredonda para 1000k, que é "1,0M".
  if (Math.round(v / 1e3) < 1000) return Math.round(v / 1e3) + 'k'
  const m = v / 1e6
  return (m < 10 ? m.toFixed(1).replace('.', ',') : String(Math.round(m))) + 'M'
}

function formatarDolar(v) {
  if (v == null) return null
  return 'US$ ' + v.toFixed(2).replace('.', ',')
}

/*
  O texto da barra: contexto agora · processado · custo estimado. `null` só quando não há números.

  ⚠️ NÃO HÁ MODO QUE ESCONDA (V14, pedido do dono: "painel de tokens integrado automaticamente sem opção
  de desligar"). Até a V13 havia a configuração `oficina.tokens.mostrar`, com "só tokens", "só custo" e
  "esconder"; saiu inteira, e os números sempre aparecem juntos, na barra e no pé da conversa.
*/
function textoDaBarra(resumo) {
  if (!resumo) return null
  const tokens = `${formatarTokens(resumo.contextoAgora)} · ${formatarTokens(resumo.tokens)}`
  // Sem preço conhecido, o custo não vira zero: some, e o asterisco não aparece.
  const custo = resumo.custoUsd == null ? null : formatarDolar(resumo.custoUsd) + (resumo.faltouPreco ? '+' : '') + '*'
  return custo ? `${tokens} · ${custo}` : tokens
}

module.exports = {
  diretorioDeProjetos, acharTranscrito, arquivosDeSubagente, lerFichaDoSubagente, interpretarLinha,
  ArquivoIncremental, MedidorDaConversa, formatarTokens, formatarDolar, textoDaBarra,
}
