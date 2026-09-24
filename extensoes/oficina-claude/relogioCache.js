// O RELÓGIO DO CACHE — quanto tempo falta para a conversa esfriar (V14).
//
// A conversa inteira fica guardada no cache do modelo depois de cada resposta. Enquanto o cache está
// quente, a próxima mensagem só LÊ o que já estava lá (barato). Quando ele vence, a próxima mensagem
// relê a conversa inteira como se fosse nova, e isso custa bem mais. O relógio responde "quanto tempo
// eu tenho antes de a próxima mensagem sair cara?".
//
// ⚠️ DE ONDE VEM CADA NÚMERO (medido nos arquivos de conversa desta máquina, não suposto):
//   - O TEMPO DE VIDA (TTL) vem do próprio uso da resposta: `cache_creation.ephemeral_1h_input_tokens`
//     ou `ephemeral_5m_input_tokens`, o que recebeu escrita. Na conversa principal, medido: 1 h.
//   - Resposta que só LEU do cache (nenhuma escrita) também renova o relógio, mas não diz de quanto é o
//     cache: vale o último TTL visto na conversa. Nenhum visto ainda → 60 min, e a dica diz que é
//     suposição.
//   - Escrita nos dois (1 h e 5 min na mesma resposta): vale o MENOR. A parte de 5 min fica no fim da
//     conversa (a API exige o mais longo antes do mais curto), e é ela que vence primeiro — daí a
//     próxima mensagem já relê um pedaço, e custa mais.
//   - O COMEÇO é a hora da última resposta da conversa principal, pelo `timestamp` da primeira linha
//     dela no arquivo (a mesma resposta ocupa várias linhas, segundos apart). Serve igual para a
//     conversa ao vivo e para a retomada. Sem `timestamp`, a hora em que a resposta foi lida.
//   - Subagente tem cache próprio, com relógio próprio (5 min): não entra aqui.
//
// Nada aqui usa `vscode` nem DOM: `testes/relogio_cache.mjs` prova tudo em node puro.

'use strict'

const MINUTO_MS = 60 * 1000
const TTL_1H_MS = 60 * MINUTO_MS
const TTL_5M_MS = 5 * MINUTO_MS
/** Sem nenhum dado do cache, o relógio supõe 1 h — o padrão medido da conversa principal. */
const TTL_SUPOSTO_MS = TTL_1H_MS

/** O TTL que o uso de UMA resposta revela, ou `null` quando ela não escreveu no cache. */
function ttlDoUso(uso) {
  const c = uso && uso.cache_creation
  if (!c || typeof c !== 'object') return null
  const h = Number(c.ephemeral_1h_input_tokens) || 0
  const m = Number(c.ephemeral_5m_input_tokens) || 0
  if (m > 0) return TTL_5M_MS
  if (h > 0) return TTL_1H_MS
  return null
}

/** A resposta escreveu nos DOIS caches (1 h e 5 min)? Então o que vence primeiro é só o fim da conversa. */
function mistoDoUso(uso) {
  const c = uso && uso.cache_creation
  if (!c || typeof c !== 'object') return false
  return (Number(c.ephemeral_1h_input_tokens) || 0) > 0 && (Number(c.ephemeral_5m_input_tokens) || 0) > 0
}

/** `"2026-09-18T12:00:00.000Z"` → milissegundos, ou `null`. */
function horaDaLinha(timestamp) {
  if (typeof timestamp !== 'string' || !timestamp) return null
  const ms = Date.parse(timestamp)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Acompanha as respostas da conversa PRINCIPAL, na ordem do arquivo, e sabe de onde o relógio parte.
 * `agora` é injetável: o teste controla o tempo.
 */
class RelogioDoCache {
  constructor({ agora = Date.now } = {}) {
    this.agora = agora
    this.zerar()
  }

  zerar() {
    this.ultimaId = null
    this.desdeMs = null
    this.ttlMs = null        // o TTL em vigor (o da última resposta que escreveu)
    this.ttlDaUltima = null  // a última resposta já disse o TTL dela?
    this.misto = false       // a última escrita foi nos dois caches (1 h e 5 min)?
  }

  /** Uma resposta da conversa principal. `true` se o relógio mudou. */
  resposta(id, uso, timestamp) {
    const ttl = ttlDoUso(uso)
    if (id !== this.ultimaId) {
      this.ultimaId = id
      this.desdeMs = horaDaLinha(timestamp) ?? this.agora()
      this.ttlDaUltima = ttl
      if (ttl) { this.ttlMs = ttl; this.misto = mistoDoUso(uso) }
      return true
    }
    // A mesma resposta em outra linha: só completa o TTL, se a primeira linha não trazia.
    if (ttl && !this.ttlDaUltima) { this.ttlDaUltima = ttl; this.ttlMs = ttl; this.misto = mistoDoUso(uso); return true }
    return false
  }

  /** O que a tela precisa, ou `null` antes da primeira resposta. */
  dados() {
    if (this.desdeMs == null) return null
    return { desdeMs: this.desdeMs, ttlMs: this.ttlMs || TTL_SUPOSTO_MS, suposto: !this.ttlMs, misto: this.misto === true }
  }
}

/**
 * O relógio num instante: minutos que faltam, o anel (fração), vencido ou não, e quando o número muda.
 *
 * ⚠️ ANEL E MINUTOS SAEM DA MESMA CONTA. A tela só é redesenhada quando o número de minutos muda, então
 * o anel é `minutos / minutos do TTL` — e não o tempo exato —, senão o desenho de um minuto atrás e o
 * número de agora discordariam. "60m" é o anel cheio; "1m" é a última fatia.
 */
function estadoDoRelogio(dados, agoraMs) {
  if (!dados) return null
  const ttlMin = Math.round(dados.ttlMs / MINUTO_MS)
  // Relógio da máquina atrasado em relação ao arquivo: não passa do cheio.
  const restanteMs = Math.min(dados.ttlMs, dados.desdeMs + dados.ttlMs - agoraMs)
  if (restanteMs <= 0) {
    // Escrita nos dois caches: venceu só o de 5 min (o fim da conversa), enquanto o de 1 h ainda vale.
    const soOFim = dados.misto === true && agoraMs < dados.desdeMs + TTL_1H_MS
    return { vencido: true, minutos: 0, ttlMinutos: ttlMin, fracao: 0, suposto: dados.suposto, venceEmMs: dados.desdeMs + dados.ttlMs, proximaMudancaMs: null, soOFim }
  }
  const minutos = Math.ceil(restanteMs / MINUTO_MS)
  // O número cai para `minutos - 1` quando o restante chega a `(minutos - 1)` minutos exatos.
  const proximaMudancaMs = restanteMs - (minutos - 1) * MINUTO_MS
  return { vencido: false, minutos, ttlMinutos: ttlMin, fracao: minutos / ttlMin, suposto: dados.suposto, venceEmMs: dados.desdeMs + dados.ttlMs, proximaMudancaMs }
}

function horaCurta(ms) {
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/** A dica (o texto de passar o mouse) do relógio. */
function dicaDoRelogio(e) {
  if (!e) return ''
  if (e.vencido) {
    if (e.soOFim) return 'A parte de 5 min do cache venceu: a próxima mensagem relê essa parte (o fim da conversa) e custa mais.'
    return 'O cache venceu: a próxima mensagem relê a conversa inteira e custa mais.' +
      (e.suposto ? '\nO tempo de 60 min foi suposição: a conversa não disse de quanto era o cache dela.' : '')
  }
  const linhas = [
    `Cache quente por mais ${e.minutos} min (vence às ${horaCurta(e.venceEmMs)}).`,
    'Enquanto ele vale, a próxima mensagem sai mais barata. Cada resposta recomeça o relógio.',
  ]
  if (e.suposto) linhas.push(`O tempo de ${e.ttlMinutos} min é suposição: a conversa ainda não disse de quanto é o cache dela.`)
  else linhas.push(`Cache de ${e.ttlMinutos === 60 ? '1 hora' : e.ttlMinutos + ' min'}, lido da última resposta.`)
  return linhas.join('\n')
}

module.exports = {
  MINUTO_MS, TTL_1H_MS, TTL_5M_MS, TTL_SUPOSTO_MS,
  ttlDoUso, horaDaLinha, RelogioDoCache, estadoDoRelogio, dicaDoRelogio,
}
