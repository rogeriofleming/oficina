// COMO UM NÚMERO DA CONVERSA APARECE PARA A PESSOA — um lugar só.
//
// Nasceu dentro da tela das conversas (V5). Na V10 a vista de tokens passou a falar dos mesmos
// números, e o jeito de escrever "1,2 mi de tokens" ou "aprox. US$ 3,45" não pode ter duas versões:
// a primeira que mudar faz as duas telas discordarem sobre a mesma conversa.
//
// Sem `require('vscode')`: é texto, e se testa em node.

'use strict'

/** Um número de tokens do jeito que se lê, não do jeito que se conta. */
function tokens(n) {
  if (!Number.isFinite(n) || n <= 0) return null
  // O arredondamento decide a faixa: 999.600 viraria "1000 mil tokens", e é "1,0 mi de tokens".
  if (Math.round(n / 1000) >= 1000) return (n / 1e6).toFixed(1).replace('.', ',') + ' mi de tokens'
  if (n >= 1000) return Math.round(n / 1000) + ' mil tokens'
  return n + ' tokens'
}

/**
 * O custo, sempre marcado como estimativa.
 *
 * ⚠️ A palavra "aprox." não é modéstia: o arquivo da conversa não guarda dinheiro, e este
 * valor é tokens multiplicados por uma tabela de preços (o porquê está em `precos.js`).
 * Apresentar isso como custo fechado seria apresentar uma conta que ninguém emitiu.
 */
function dinheiro(usd) {
  if (usd == null) return null
  if (usd < 0.01) return 'aprox. menos de US$ 0,01'
  return 'aprox. US$ ' + usd.toFixed(2).replace('.', ',')
}

/** O nome curto do modelo — `claude-opus-5` vira `Opus 5`. */
function nomeDoModelo(id) {
  if (!id) return null
  const m = /^claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d+))?/.exec(id)
  if (!m) return id
  const familia = m[1][0].toUpperCase() + m[1].slice(1)
  return `${familia} ${m[2]}${m[3] ? '.' + m[3] : ''}`
}

module.exports = { tokens, dinheiro, nomeDoModelo }
