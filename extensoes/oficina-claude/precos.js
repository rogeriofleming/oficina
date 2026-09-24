// A tabela de preços dos modelos, e a conta que transforma tokens em dólares.
//
// ⚠️ POR QUE ISTO EXISTE, e por que o número que ele produz é uma ESTIMATIVA.
//
// O arquivo de uma sessão guarda `usage` por resposta (tokens de entrada, de saída, de
// escrita e de leitura de cache) — medido em 12/09/2026, campo a campo, num arquivo real
// de 742 mensagens. O que ele NÃO guarda é dinheiro: não há `total_cost_usd`, nem
// `costUSD`, em lugar nenhum do arquivo. O valor em dólar que o SDK entrega durante uma
// conversa viva (`result.total_cost_usd`) existe só enquanto ela está aberta e não é
// escrito no arquivo.
//
// Logo, para uma conversa de outro dia só há dois caminhos honestos: mostrar tokens, ou
// multiplicar os tokens por uma tabela de preços. Este arquivo é o segundo — e por isso
// tudo que sai daqui viaja marcado como estimativa, para a tela poder dizer isso à pessoa.
//
// ⚠️ E há uma razão a mais para não chamar isto de "o custo": quem usa uma assinatura não
// paga por token nenhum. O valor abaixo responde "quanto isto custaria pela tabela da
// API", que é uma pergunta útil — e é outra pergunta.
//
// ⚠️ A TABELA ENVELHECE. Preço de modelo muda e modelo novo aparece. A data da fonte está
// em `ATUALIZADA_EM`, viaja junto com o resultado e a tela mostra. Modelo que não estiver
// aqui não vira dinheiro chutado: vira `null`, e a tela mostra os tokens.

'use strict'

/** Quando esta tabela foi conferida na documentação da API. */
const ATUALIZADA_EM = '2026-09-12'

/**
 * Dólares por milhão de tokens, por modelo (tabela da API própria da Anthropic).
 *
 * A chave é comparada por PREFIXO contra o id que vem na resposta, porque o id pode trazer
 * sufixo de data (`claude-opus-5-20260401` casa com a linha do `claude-opus-5`). Um id de modelo
 * que não esteja na tabela — inclusive um antigo, como `claude-opus-4-5-...` — devolve `null` de
 * propósito, e a tela mostra tokens em vez de um preço chutado.
 *
 * ⚠️ E os prefixos mais LONGOS são testados primeiro (ver `precoDoModelo`). O par real que exige
 * isto está aqui na tabela: `claude-fable-5` é prefixo de `claude-fable-5-1`. Testando do mais
 * curto, o id `claude-fable-5-1` casaria com a linha do `claude-fable-5` e seria cobrado como o
 * modelo errado. Hoje os dois custam igual, e é justamente por isso que o erro passaria calado até
 * o dia em que não custassem — que é quando ninguém estaria olhando para cá.
 * (A explicação anterior citava `claude-opus-4`, que nem existe na tabela, e repetia o mesmo id
 * dos dois lados da frase. Reescrita depois de uma revisão independente, em 12/09/2026.)
 */
const TABELA = {
  'claude-fable-5-1': { entrada: 10, saida: 50 },
  'claude-fable-5': { entrada: 10, saida: 50 },
  'claude-mythos-5-1': { entrada: 10, saida: 50 },
  'claude-opus-5': { entrada: 5, saida: 25 },
  'claude-opus-4-8': { entrada: 5, saida: 25 },
  'claude-opus-4-7': { entrada: 5, saida: 25 },
  'claude-opus-4-6': { entrada: 5, saida: 25 },
  'claude-sonnet-5': { entrada: 2, saida: 10 },
  'claude-sonnet-4-6': { entrada: 3, saida: 15 },
  'claude-haiku-4-5': { entrada: 1, saida: 5 },
}

/**
 * O modo rápido do Opus 5 é o MESMO modelo cobrado a outro preço — e a resposta diz qual
 * foi, em `usage.speed`. Sem isto, uma conversa inteira em modo rápido sairia pela metade
 * do preço, e o erro seria invisível.
 */
const PRECO_RAPIDO = {
  'claude-opus-5': { entrada: 10, saida: 50 },
  'claude-opus-4-8': { entrada: 10, saida: 50 },
}

/**
 * Multiplicadores do cache sobre o preço de entrada.
 *
 * ⚠️ Escrever no cache de 1 HORA custa o DOBRO da entrada, e o de 5 minutos, 1,25×. A
 * distinção importa de verdade: no arquivo medido em 12/09/2026, 100% da escrita de cache
 * era de 1 hora (`cache_creation.ephemeral_1h_input_tokens`) e ela era o maior item da
 * conta. Tratar tudo como 1,25× subestimaria a sessão inteira.
 */
const CACHE = { escrita5min: 1.25, escrita1h: 2, leitura: 0.1 }

/** O preço deste modelo, ou `null` se ele não está na tabela. `veloz` vem de `usage.speed`. */
function precoDoModelo(modelo, veloz = false) {
  if (!modelo || typeof modelo !== 'string') return null
  const chaves = Object.keys(veloz ? PRECO_RAPIDO : TABELA).sort((a, b) => b.length - a.length)
  const achou = chaves.find(k => modelo.startsWith(k))
  if (!achou) return veloz ? precoDoModelo(modelo, false) : null
  return (veloz ? PRECO_RAPIDO : TABELA)[achou]
}

/**
 * Soma os tokens de um `usage` num acumulador. Devolve o próprio acumulador.
 *
 * ⚠️ `cache_creation_input_tokens` e `cache_creation.*` contam A MESMA COISA — o primeiro é
 * o total, o segundo é ele repartido por duração. Somar os dois cobraria a escrita duas
 * vezes. Aqui manda o repartido quando ele existe, e o total só cobre o que sobrar.
 */
function somarUso(acumulador, uso) {
  const a = acumulador
  if (!uso || typeof uso !== 'object') return a
  const n = v => (Number.isFinite(v) ? v : 0)
  a.entrada += n(uso.input_tokens)
  a.saida += n(uso.output_tokens)
  a.leituraDeCache += n(uso.cache_read_input_tokens)
  a.pensamento += n(uso.output_tokens_details && uso.output_tokens_details.thinking_tokens)

  const total = n(uso.cache_creation_input_tokens)
  const c = uso.cache_creation || {}
  const umaHora = n(c.ephemeral_1h_input_tokens)
  const cincoMin = n(c.ephemeral_5m_input_tokens)
  if (umaHora || cincoMin) {
    a.escritaDeCache1h += umaHora
    a.escritaDeCache5min += cincoMin
    // O que o total tem a mais do que o repartido (versão antiga do campo, ou duração nova
    // que ainda não conhecemos) entra como 5 min, que é o preço mais barato dos dois — para
    // uma estimativa, errar para baixo é mais honesto do que inflar.
    const sobra = total - umaHora - cincoMin
    if (sobra > 0) a.escritaDeCache5min += sobra
  } else {
    a.escritaDeCache5min += total
  }
  return a
}

/** Um acumulador zerado. */
function usoZerado() {
  return {
    entrada: 0, saida: 0, leituraDeCache: 0,
    escritaDeCache5min: 0, escritaDeCache1h: 0, pensamento: 0,
  }
}

/**
 * Quanto custariam estes tokens neste modelo, em dólares — ou `null` se o modelo não está
 * na tabela (e aí quem chama mostra tokens, não um número inventado).
 */
function custoDoUso(uso, modelo, veloz = false) {
  const p = precoDoModelo(modelo, veloz)
  if (!p) return null
  const porMilhao = t => t / 1e6
  return (
    porMilhao(uso.entrada) * p.entrada +
    porMilhao(uso.saida) * p.saida +
    porMilhao(uso.leituraDeCache) * p.entrada * CACHE.leitura +
    porMilhao(uso.escritaDeCache5min) * p.entrada * CACHE.escrita5min +
    porMilhao(uso.escritaDeCache1h) * p.entrada * CACHE.escrita1h
  )
}

/** Todos os tokens que a pessoa vê como "tamanho" da conversa. */
function totalDeTokens(uso) {
  return uso.entrada + uso.saida + uso.leituraDeCache + uso.escritaDeCache5min + uso.escritaDeCache1h
}

module.exports = {
  ATUALIZADA_EM, TABELA, PRECO_RAPIDO, CACHE,
  precoDoModelo, somarUso, usoZerado, custoDoUso, totalDeTokens,
}
