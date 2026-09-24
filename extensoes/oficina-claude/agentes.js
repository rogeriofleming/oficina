// OS AGENTES EM PARALELO DA CONVERSA — o botão "N agentes" do pé e o mapa (V16).
//
// Duas fontes, uma só tela:
//   - AO VIVO, os eventos do agente (SDK 0.3.261): `task_started` (nasce), `task_progress` (tokens, ferramentas,
//     o que está fazendo), `task_updated` (muda de estado), `task_notification` (termina, com o resumo final) e
//     `background_tasks_changed` (a lista INTEIRA das tarefas vivas em segundo plano, a cada mudança). Nenhum
//     deles é gravado no arquivo da conversa: só existem enquanto o processo do agente vive.
//   - DO DISCO, o que `tokens.js` lê de cada `subagents/agent-<id>.jsonl` + `.meta.json`: é o que sobra de uma
//     conversa retomada (o processo novo não sabe nada dos agentes do anterior).
// As duas se encontram pelo id: o `task_id` de um agente É o id do arquivo dele (medido numa sonda ao vivo, e em
// notificações gravadas de conversas reais).
//
// ⚠️ O QUE A SONDA AO VIVO MEDIU (18/09/2026, duas mensagens em Haiku) E QUE ESTE ARQUIVO SEGUE:
//   1. `task_type` é `local_agent` para agente e `local_bash` para comando em segundo plano — que também entra
//      em `background_tasks_changed` e nos `task_*`. Comando não é agente: fica de fora.
//   2. Um agente em PRIMEIRO plano (`is_backgrounded: false`) NUNCA aparece em `background_tasks_changed`. Por isso
//      a contagem não pode vir só dessa lista: primeiro plano conta pelo estado dos eventos.
//   3. A lista chega ANTES do `task_started` do mesmo agente (e antes do fim dele): um id novo na lista cria o
//      agente, e o `task_started` completa.
//   4. O segundo nível chega com `spawn_depth: 2` e SEM pai no evento. O pai se descobre pela mensagem do agente
//      de dentro: a chamada `Agent` do filho vem numa mensagem com `parent_tool_use_id` = a chamada do pai.
//   5. `task_progress.description` muda para o que o agente está fazendo AGORA ("Running …"): é a atividade, e
//      nunca pode tomar o lugar do nome.
//
// Nada aqui usa `require('vscode')`: `testes/rodar.mjs` prova em node puro.

'use strict'

const F = require('./formato.js')

const ESTADOS = ['rodando', 'pausado', 'terminou', 'falhou', 'parado']
const ROTULOS_DO_ESTADO = { rodando: 'rodando', pausado: 'em pausa', terminou: 'terminou', falhou: 'falhou', parado: 'parado' }
const VIVOS = new Set(['rodando', 'pausado'])
/** O resumo que o agente devolve no fim é o texto inteiro dele: a tela mostra o começo. */
const TETO_DO_RESUMO = 600

/** `task_updated.patch.status` e `task_notification.status` → o estado que a tela conhece. */
function estadoDoSdk(status) {
  switch (status) {
    case 'pending': case 'running': return 'rodando'
    case 'paused': return 'pausado'
    case 'completed': return 'terminou'
    case 'failed': return 'falhou'
    case 'killed': case 'stopped': return 'parado'
    default: return null
  }
}

function texto(v) { return typeof v === 'string' && v.trim() ? v.trim() : null }
function resumir(v) {
  const t = texto(v)
  return t && t.length > TETO_DO_RESUMO ? t.slice(0, TETO_DO_RESUMO - 1) + '…' : t
}
/** É agente, e não comando em segundo plano? Sem `task_type` (produtor antigo), o tipo de subagente decide. */
function ehAgente(m) {
  if (m.task_type) return m.task_type === 'local_agent'
  return !!m.subagent_type
}

/** Os agentes AO VIVO de uma conversa (um processo do agente). */
class AgentesDaConversa {
  constructor({ agora = Date.now } = {}) {
    this.agora = agora
    this.zerar()
  }

  /** O processo do agente (re)começou: a lista de antes não vale mais (a doc do SDK manda zerar). */
  zerar() {
    this.agentes = new Map()          // task_id -> agente
    this.paiDaChamada = new Map()     // chamada do filho -> chamada do pai (pelas mensagens de dentro)
    this.vivosEmSegundoPlano = new Set()
  }

  _novo(id, { nome = null, inicioMs = null } = {}) {
    const a = {
      id, chamada: null, nome, tipo: null, profundidade: null, segundoPlano: null,
      estado: 'rodando', inicioMs: inicioMs == null ? this.agora() : inicioMs, fimMs: null,
      tokens: null, ferramentas: null, duracaoMs: null, ultimaFerramenta: null, atividade: null,
      resumo: null, erro: null, parando: false,
    }
    this.agentes.set(id, a)
    return a
  }

  /**
   * Uma mensagem do agente. Devolve `true` se algo do mapa mudou. O que não é daqui é ignorado.
   * Recebe TAMBÉM as mensagens `assistant`: é por elas que o segundo nível acha o pai (item 4 do topo).
   */
  receber(m) {
    if (!m || typeof m !== 'object') return false
    if (m.type === 'assistant') return this._ligarFilhos(m)
    if (m.type !== 'system') return false
    switch (m.subtype) {
      case 'task_started': return this._comecou(m)
      case 'task_progress': return this._andou(m)
      case 'task_updated': return this._mudou(m)
      case 'task_notification': return this._terminou(m)
      case 'background_tasks_changed': return this._lista(m)
      default: return false
    }
  }

  _ligarFilhos(m) {
    const pai = m.parent_tool_use_id
    if (!pai || !m.message || !Array.isArray(m.message.content)) return false
    let mudou = false
    for (const b of m.message.content) {
      if (!b || b.type !== 'tool_use' || !b.id || (b.name !== 'Agent' && b.name !== 'Task')) continue
      if (this.paiDaChamada.get(b.id) !== pai) { this.paiDaChamada.set(b.id, pai); mudou = true }
    }
    return mudou
  }

  _comecou(m) {
    if (!m.task_id || !ehAgente(m) || m.ambient) return false
    const a = this.agentes.get(m.task_id) || this._novo(m.task_id)
    a.chamada = m.tool_use_id || a.chamada
    a.nome = texto(m.description) || a.nome
    a.tipo = texto(m.subagent_type) || a.tipo
    if (Number.isFinite(m.spawn_depth)) a.profundidade = m.spawn_depth
    if (typeof m.is_backgrounded === 'boolean') a.segundoPlano = m.is_backgrounded
    return true
  }

  _andou(m) {
    const a = this.agentes.get(m.task_id)
    if (!a) return false
    const u = m.usage || {}
    if (Number.isFinite(u.total_tokens)) a.tokens = u.total_tokens
    if (Number.isFinite(u.tool_uses)) a.ferramentas = u.tool_uses
    if (Number.isFinite(u.duration_ms)) a.duracaoMs = u.duration_ms
    if (texto(m.last_tool_name)) a.ultimaFerramenta = texto(m.last_tool_name)
    // A descrição do progresso é o que ele faz agora (medido: "Running Sleep for 40 seconds"), não o nome.
    const d = texto(m.description)
    if (d && d !== a.nome) a.atividade = d
    if (texto(m.summary)) a.resumo = resumir(m.summary)
    if (!a.nome && d) a.nome = d
    if (!a.chamada && m.tool_use_id) a.chamada = m.tool_use_id
    return true
  }

  _mudou(m) {
    const a = this.agentes.get(m.task_id)
    const p = m.patch || {}
    if (!a) return false
    const estado = estadoDoSdk(p.status)
    if (estado) a.estado = estado
    if (Number.isFinite(p.end_time)) a.fimMs = p.end_time
    if (texto(p.error)) a.erro = resumir(p.error)
    if (typeof p.is_backgrounded === 'boolean') a.segundoPlano = p.is_backgrounded
    if (texto(p.description) && !a.nome) a.nome = texto(p.description)
    if (!VIVOS.has(a.estado)) { a.parando = false; a.atividade = null; if (a.fimMs == null) a.fimMs = this.agora() }
    return true
  }

  _terminou(m) {
    const a = this.agentes.get(m.task_id)
    if (!a) return false
    a.estado = estadoDoSdk(m.status) || 'terminou'
    const u = m.usage || {}
    if (Number.isFinite(u.total_tokens)) a.tokens = u.total_tokens
    if (Number.isFinite(u.tool_uses)) a.ferramentas = u.tool_uses
    if (Number.isFinite(u.duration_ms)) a.duracaoMs = u.duration_ms
    if (texto(m.summary)) a.resumo = resumir(m.summary)
    if (a.fimMs == null) a.fimMs = this.agora()
    a.parando = false
    a.atividade = null
    return true
  }

  /**
   * ⚠️ A LISTA SUBSTITUI, NÃO SOMA (a doc do SDK: "swap your set for this payload"). É o sinal de NÍVEL: um
   * fim perdido (`task_notification` que não chegou) não pode deixar um agente "rodando" para sempre. Então o
   * agente em segundo plano que SAIU da lista deixa de rodar aqui — a notificação, se vier depois, só diz como
   * ele acabou. O de primeiro plano não passa por esta lista (item 2 do topo) e não é tocado.
   */
  _lista(m) {
    const vivos = new Set()
    let mudou = false
    for (const t of Array.isArray(m.tasks) ? m.tasks : []) {
      if (!t || !t.task_id || t.ambient || !ehAgente(t)) continue
      vivos.add(t.task_id)
      let a = this.agentes.get(t.task_id)
      if (!a) { a = this._novo(t.task_id, { nome: texto(t.description) }); mudou = true }
      if (a.segundoPlano !== true) { a.segundoPlano = true; mudou = true }
    }
    for (const a of this.agentes.values()) {
      if (a.segundoPlano === true && VIVOS.has(a.estado) && !vivos.has(a.id)) {
        a.estado = 'terminou'
        if (a.fimMs == null) a.fimMs = this.agora()
        a.parando = false
        a.atividade = null
        mudou = true
      }
    }
    this.vivosEmSegundoPlano = vivos
    return mudou
  }

  /**
   * O processo do agente acabou (fechou, caiu). Os agentes dele acabaram junto: quem ainda aparecia vivo passa a
   * "parado", com o motivo. Devolve `true` se mudou alguém. O próximo processo zera a lista (`zerar`).
   */
  processoAcabou() {
    let mudou = false
    for (const a of this.agentes.values()) {
      if (!VIVOS.has(a.estado)) continue
      a.estado = 'parado'
      a.erro = a.erro || 'a conversa terminou com ele rodando'
      if (a.fimMs == null) a.fimMs = this.agora()
      a.parando = false
      a.atividade = null
      mudou = true
    }
    return mudou
  }

  /** Quantos estão vivos agora (rodando ou em pausa), em qualquer nível. */
  get rodando() {
    let n = 0
    for (const a of this.agentes.values()) if (VIVOS.has(a.estado)) n++
    return n
  }

  /** Dá para pedir parada a este agente? Só a um agente vivo, desta conversa, que ainda não está parando. */
  podeParar(id) {
    const a = this.agentes.get(id)
    return !!a && VIVOS.has(a.estado) && !a.parando
  }

  marcarParando(id) {
    const a = this.agentes.get(id)
    if (a) a.parando = true
  }

  /** O agente pediu para parar e o fim ainda não chegou? */
  estaParando(id) {
    const a = this.agentes.get(id)
    return !!a && a.parando === true
  }

  desmarcarParando(id) {
    const a = this.agentes.get(id)
    if (a) a.parando = false
  }

  /** A lista ao vivo, com o pai resolvido (pela chamada), pronta para juntar com o disco. */
  lista() {
    const porChamada = new Map()
    for (const a of this.agentes.values()) if (a.chamada) porChamada.set(a.chamada, a.id)
    return [...this.agentes.values()].map(a => {
      const chamadaDoPai = a.chamada ? this.paiDaChamada.get(a.chamada) : null
      return { ...a, pai: (chamadaDoPai && porChamada.get(chamadaDoPai)) || null }
    })
  }
}

/**
 * Junta o ao vivo com o disco. O ao vivo vale para estado, tokens e tempo; o disco completa o que falta (nome,
 * tipo, pai) e é a ÚNICA fonte dos agentes de uma conversa retomada. Do disco não se sabe se um agente falhou:
 * o que a ficha não diz que foi parado aparece como "terminou".
 */
function juntarComODisco(vivos = [], doDisco = []) {
  const porId = new Map()
  for (const d of Array.isArray(doDisco) ? doDisco : []) {
    if (!d || !d.id) continue
    porId.set(d.id, {
      id: d.id, chamada: d.chamada || null, nome: d.nome || null, tipo: d.tipo || null,
      profundidade: d.profundidade || null, pai: d.pai || null, segundoPlano: null,
      estado: d.parado ? 'parado' : 'terminou', inicioMs: d.inicioMs ?? null, fimMs: d.fimMs ?? null,
      tokens: d.tokensNoFim ?? null, ferramentas: d.ferramentas ?? null,
      duracaoMs: d.inicioMs != null && d.fimMs != null ? d.fimMs - d.inicioMs : null,
      ultimaFerramenta: d.ultimaFerramenta || null, atividade: null, resumo: null, erro: null, parando: false,
      doDisco: true,
    })
  }
  for (const v of Array.isArray(vivos) ? vivos : []) {
    const d = porId.get(v.id)
    porId.set(v.id, {
      ...v,
      nome: v.nome || (d && d.nome) || null,
      tipo: v.tipo || (d && d.tipo) || null,
      pai: v.pai || (d && d.pai) || null,
      profundidade: v.profundidade || (d && d.profundidade) || null,
      chamada: v.chamada || (d && d.chamada) || null,
      tokens: v.tokens ?? (d && d.tokens) ?? null,
      ferramentas: v.ferramentas ?? (d && d.ferramentas) ?? null,
      ultimaFerramenta: v.ultimaFerramenta || (d && d.ultimaFerramenta) || null,
      doDisco: false,
    })
  }
  return [...porId.values()]
}

/** "1 agente", "2 agentes", "0 agentes". */
function rotuloDoBotao(n) {
  return `${n} ${n === 1 ? 'agente' : 'agentes'}`
}

/**
 * O que a tela recebe (`{tipo:'agentes'}`): tudo pronto para desenhar, nada para calcular além do relógio.
 * A tela só faz a conta do tempo de quem ainda roda (`agoraMs - inicioMs`), uma vez por segundo, com o mapa aberto.
 */
function montarMapa({ vivos = [], doDisco = [], sessao = {}, podeParar = () => false } = {}) {
  const juntos = juntarComODisco(vivos, doDisco)
  const ids = new Set(juntos.map(a => a.id))
  const filhos = new Map()
  for (const a of juntos) {
    if (a.pai && ids.has(a.pai) && a.pai !== a.id) {
      if (!filhos.has(a.pai)) filhos.set(a.pai, [])
      filhos.get(a.pai).push(a.id)
    }
  }
  const ordem = (x, y) => (x.inicioMs ?? Infinity) - (y.inicioMs ?? Infinity) || String(x.id).localeCompare(String(y.id))
  juntos.sort(ordem)
  const agentes = juntos.map(a => {
    const vivo = VIVOS.has(a.estado)
    const duracaoMs = vivo ? null
      : a.duracaoMs != null ? a.duracaoMs
        : a.inicioMs != null && a.fimMs != null ? Math.max(0, a.fimMs - a.inicioMs) : null
    return {
      id: a.id,
      nome: a.nome || `agente ${String(a.id).slice(0, 6)}`,
      tipo: a.tipo,
      estado: a.estado,
      rotuloDoEstado: ROTULOS_DO_ESTADO[a.estado] || a.estado,
      vivo,
      profundidade: a.profundidade || (a.pai ? 2 : 1),
      // Pai que não está na lista (o de fora sumiu do disco): o filho sobe para a primeira coluna.
      pai: a.pai && ids.has(a.pai) && a.pai !== a.id ? a.pai : null,
      filhos: (filhos.get(a.id) || []),
      inicioMs: a.inicioMs,
      duracaoMs,
      tokens: a.tokens,
      tokensTexto: F.tokens(a.tokens),
      ferramentas: a.ferramentas,
      ultimaFerramenta: a.ultimaFerramenta,
      atividade: vivo ? a.atividade : null,
      resumo: a.resumo,
      erro: a.erro,
      parando: !!a.parando,
      podeParar: vivo && !a.doDisco && !a.parando && !!podeParar(a.id),
      doDisco: !!a.doDisco,
    }
  })
  const rodando = agentes.filter(a => a.vivo).length
  return {
    rodando,
    total: agentes.length,
    rotulo: rotuloDoBotao(rodando),
    sessao: {
      titulo: texto(sessao.titulo) || 'Esta conversa',
      viva: !!sessao.viva,
      linha: [texto(sessao.modelo), sessao.contexto ? `${F.tokens(sessao.contexto)} no contexto` : null].filter(Boolean).join(' · '),
    },
    agentes,
  }
}

module.exports = { AgentesDaConversa, juntarComODisco, montarMapa, rotuloDoBotao, estadoDoSdk, ESTADOS, ROTULOS_DO_ESTADO }
