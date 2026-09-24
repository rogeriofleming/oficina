// V15 — MODELO E ESFORÇO: o que a barra da conversa mostra e o que o painel de escolha oferece.
//
// Sem `require('vscode')`: é regra e texto, e se testa em node (`testes/rodar.mjs`).
//
// O QUE FOI MEDIDO ANTES DE ESCREVER (SDK 0.3.261, 18/09/2026, com e sem conta):
//   - `initializationResult().models` e `supportedModels()` devolvem a MESMA lista, antes de qualquer
//     mensagem, com `value`, `resolvedModel`, `displayName`, `description`, `supportsEffort` e
//     `supportedEffortLevels`. O primeiro item é `default` ("Default (recommended)"), e dois itens
//     podem apontar para o MESMO modelo (`default` e `opus[1m]` → `claude-opus-5[1m]`).
//   - O que está EM USO vem de `getSettings().applied` (`{ model, effort }`), também antes da primeira
//     mensagem, e acompanha `setModel` e `applyFlagSettings({ effortLevel })` na hora.
//   - `system/init` NÃO traz `effort` no uso local (o campo só existe na ponte remota).
//   - Modelo sem `supportsEffort` (Haiku 4.5): `applied.effort` é `null`, e pedir um nível é ACEITO
//     em silêncio e ignorado — por isso a recusa é daqui, antes de chegar ao SDK.
//   - Trocar de modelo com o cache quente: o próprio agente estimou `contexto × preço de escrita de
//     cache do modelo novo` (1 h = 2× a entrada), e a conta bateu com a de `custoDaTroca` no centavo.

'use strict'

const F = require('./formato')
const P = require('./precos')
const R = require('./relogioCache')

/** Os níveis na ordem do controle, do menor para o maior. */
const NIVEIS = ['low', 'medium', 'high', 'xhigh', 'max']

/** Os rótulos em português. A ordem é a de `NIVEIS`. */
const ROTULOS = { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'extra-alto', max: 'máximo' }

/** O nível que o agente usa quando ninguém escolheu (documentado no tipo `Options.effort`). */
const NIVEL_PADRAO = 'high'

/** O nome que o agente dá a cada item, traduzido só onde a frase é nossa conhecida. */
const NOMES_CONHECIDOS = { 'Default (recommended)': 'Padrão (recomendado)' }

/**
 * A lista de modelos como a tela usa. Item sem `value` sai (não há o que pedir ao agente com ele).
 * Os níveis ficam na ordem de `NIVEIS`, qualquer que seja a ordem em que vieram.
 */
function listaDeModelos(infos) {
  if (!Array.isArray(infos)) return []
  const lista = []
  for (const i of infos) {
    if (!i || typeof i.value !== 'string' || !i.value) continue
    const esforcos = Array.isArray(i.supportedEffortLevels)
      ? NIVEIS.filter(n => i.supportedEffortLevels.includes(n)) : []
    const nome = typeof i.displayName === 'string' && i.displayName ? i.displayName : i.value
    lista.push({
      valor: i.value,
      resolvido: typeof i.resolvedModel === 'string' && i.resolvedModel ? i.resolvedModel : null,
      nome: NOMES_CONHECIDOS[nome] || nome,
      descricao: typeof i.description === 'string' ? i.description : '',
      aceitaEsforco: i.supportsEffort === true && esforcos.length > 0,
      esforcos: i.supportsEffort === true ? esforcos : [],
    })
  }
  return lista
}

/**
 * O nome do modelo em uso como a pessoa lê: `claude-opus-5[1m]` → `Opus 5 (1M)`,
 * `claude-haiku-4-5-20251001` → `Haiku 4.5`. O id técnico vai na dica da tela.
 */
function nomeDoModelo(id) {
  if (!id || typeof id !== 'string') return null
  const base = F.nomeDoModelo(id.replace(/\[1m\]$/i, ''))
  return base + (/\[1m\]$/i.test(id) ? ' (1M)' : '')
}

/**
 * Qual item da lista está em uso — é ele que leva o ✓.
 *
 * ⚠️ Dois itens podem apontar para o MESMO modelo (medido: `default` e `opus[1m]`). Por isso vale,
 * primeiro, o item que a pessoa ESCOLHEU nesta conversa — se ele ainda resolve para o modelo em uso.
 * Sem escolha (a conversa acabou de abrir), o primeiro item cujo modelo é o em uso. Nenhum → `null`:
 * a tela não marca nada, em vez de marcar o primeiro da lista (que era o defeito da abertura).
 */
function itemEmUso(lista, modeloEmUso, escolha) {
  if (!Array.isArray(lista) || !modeloEmUso) return null
  const resolve = i => i.resolvido || i.valor
  if (escolha) {
    const e = lista.find(i => i.valor === escolha)
    if (e && resolve(e) === modeloEmUso) return e
  }
  return lista.find(i => resolve(i) === modeloEmUso) || null
}

/**
 * O esforço mostrado. `aplicado` é o que o agente disse (`getSettings().applied.effort`).
 * - o agente disse → é ele, `suposto: false`;
 * - não disse, e o modelo aceita esforço → o padrão do agente (`alto`), marcado `suposto: true`;
 * - o modelo não aceita esforço → `null` (o botão mostra só o modelo, e o painel diz por quê).
 */
function esforcoMostrado(aplicado, item) {
  if (item && !item.aceitaEsforco) return { nivel: null, suposto: false }
  if (NIVEIS.includes(aplicado)) return { nivel: aplicado, suposto: false }
  if (!item) return { nivel: null, suposto: false }
  return { nivel: NIVEL_PADRAO, suposto: true }
}

/**
 * O texto do botão da barra em partes: modelo, contexto longo e esforço — "Opus 5", " (1M)", " · alto".
 * Em partes porque o pé estreito tira o " (1M)" (medido: a 506 px, com ele, a linha estourava 55 px);
 * juntas, são o `rotulo`. Sem esforço, só o modelo.
 */
function partesDoBotao(nome, nivel) {
  if (!nome) return []
  const m = /^(.*?)( \(1M\))?$/.exec(nome)
  const partes = [{ parte: 'nome', texto: m[1] }]
  if (m[2]) partes.push({ parte: 'contexto', texto: m[2] })
  if (nivel) partes.push({ parte: 'esforco', texto: ` · ${ROTULOS[nivel]}` })
  return partes
}

/** O texto do botão da barra: "Opus 5 (1M) · alto". Sem esforço, só o modelo. */
function rotuloDoBotao(nome, nivel) {
  return partesDoBotao(nome, nivel).map(p => p.texto).join('')
}

/**
 * Quanto custa reescrever o cache da conversa no modelo novo — a MESMA conta que o agente faz depois
 * da troca (hook `PostModelSwitch`, `estimated_cache_write_usd`): os tokens de contexto ao preço de
 * ESCRITA de cache do modelo de destino (1 h = 2× a entrada; 5 min = 1,25×).
 * `usd: null` quando o destino não tem preço na tabela (a tela mostra os tokens, não um número inventado).
 */
function custoDaTroca({ contexto, ttlMs, destino }) {
  const tokens = Number.isFinite(contexto) && contexto > 0 ? contexto : 0
  const p = P.precoDoModelo(String(destino || '').replace(/\[1m\]$/i, ''))
  const umaHora = !(ttlMs > 0) || ttlMs >= 60 * 60 * 1000
  const fator = umaHora ? P.CACHE.escrita1h : P.CACHE.escrita5min
  return { tokens, usd: p ? tokens / 1e6 * p.entrada * fator : null }
}

/**
 * O aviso ANTES de trocar de modelo, ou `null` quando não há o que avisar.
 *
 * ⚠️ POR QUE A CONTA É NOSSA, E NÃO A DO AGENTE: o agente só dá a estimativa DEPOIS da troca (o hook
 * dispara ~5 ms depois do `setModel`, medido), quando não há mais como desistir. Aqui se usa o que a
 * OFICINA já sabe: o relógio do cache (V14) diz se ele está quente, e o medidor de tokens diz o
 * contexto. Sem aviso quando: o cache já venceu (a próxima mensagem vai reler de qualquer jeito), a
 * conversa ainda não respondeu nada, ou o destino é o MESMO modelo por outro nome (`default` ↔
 * `opus[1m]`: o cache é do modelo, e ele não muda).
 *
 * `resumo` é o do medidor de tokens (`contextoAgora`, `cache`).
 */
function avisoDaTroca({ lista, emUso, valor, resumo, agoraMs = Date.now() }) {
  if (!resumo || !resumo.cache || !emUso) return null
  const destino = (Array.isArray(lista) ? lista : []).find(i => i.valor === valor)
  if (!destino) return null
  const modeloDestino = destino.resolvido || destino.valor
  if (modeloDestino === emUso) return null
  const relogio = R.estadoDoRelogio(resumo.cache, agoraMs)
  if (!relogio || relogio.vencido) return null
  const { tokens, usd } = custoDaTroca({ contexto: resumo.contextoAgora, ttlMs: resumo.cache.ttlMs, destino: modeloDestino })
  if (!tokens) return null
  const para = nomeDoModelo(modeloDestino) || destino.nome
  const de = nomeDoModelo(emUso) || emUso
  // O dinheiro é ESTIMADO pelo preço normal do modelo de destino: um preço diferente para contexto longo não foi
  // verificado, e a conta bateu com a do agente num caso só. A frase não promete mais do que isso.
  const quanto = usd == null ? `cerca de ${F.tokens(tokens)}` : `cerca de ${F.tokens(tokens)}, ${F.dinheiro(usd)} (estimado pelo preço normal do modelo)`
  return {
    valor, minutos: relogio.minutos, tokens, usd, de, para,
    texto: `O cache desta conversa ainda vale por ${relogio.minutos} min. Trocar para ${para} faz a próxima ` +
      `mensagem reler a conversa inteira no modelo novo: ${quanto}.`,
  }
}

module.exports = {
  NIVEIS, ROTULOS, NIVEL_PADRAO,
  listaDeModelos, nomeDoModelo, itemEmUso, esforcoMostrado, partesDoBotao, rotuloDoBotao, custoDaTroca, avisoDaTroca,
}
