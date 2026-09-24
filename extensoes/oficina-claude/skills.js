// O PAINEL DE SKILLS (V12) — a lista, a ordem, as favoritas e as ocultas. Sem `vscode`: `testes/skills.mjs`
// prova tudo em node puro.
//
// ⚠️ DE ONDE VEM A LISTA. Do próprio agente: `initializationResult().commands` na abertura da conversa, e
// `system/commands_changed` quando uma skill aparece no meio do trabalho (o SDK manda SUBSTITUIR a lista,
// não somar). Não lemos pasta de skill no disco: a lista do agente é a que ele de fato consegue usar, e
// inclui o que nenhuma pasta nossa conhece (as skills que vêm com o programa, as de plugin).
//
// ⚠️ NENHUM CAMPO DIZ SE É SKILL OU COMANDO EMBUTIDO. Medido em 13/09/2026, no SDK 0.3.261: os campos são
// `name`, `description`, `argumentHint` e `aliases`. O único sinal é o FIM da descrição — ` (user)` para
// skill da pessoa, ` (project)` para skill e comando da pasta aberta. O que vem sem sufixo mistura as
// skills do programa com comandos que não fazem sentido clicar (`/clear`, `/model`). Por isso dois
// grupos, e o do programa nasce recolhido.
//
// ⚠️ MEDIDO EM 18/09/2026, numa conversa real com uma conta de verdade (74 itens): há um terceiro sufixo,
// ` (claude.ai sync)`, nas skills que vêm DA CONTA da pessoa no claude.ai — inclusive as que ela mesma
// escreveu lá. Sem ele na lista abaixo, a skill que a pessoa criou ia parar no grupo recolhido do
// programa. Custo, declarado: as skills padrão que ela ligou na conta (docx, pdf…) sobem junto.
// E nenhuma skill de plugin (nome com `:`) veio na lista do agente nessa conta — o sufixo delas segue
// não medido; sem sufixo conhecido, cai no grupo do programa (aparece, só que num lugar pior).
//
// ⚠️ O NOME VIRA TEXTO NA CONVERSA. Clicar manda `/nome` como mensagem, e o nome vem de arquivo de
// alguém (o `SKILL.md` de uma pasta qualquer). Nome com espaço, quebra de linha ou símbolo fora do
// padrão NÃO entra na lista: senão um nome montado de propósito escreveria uma instrução inteira na
// conversa com um clique.
//
// ⚠️ A ORDEM É DA PESSOA, E A LISTA É DA PASTA. Ordem, favoritas e ocultas valem no perfil inteiro (o
// pedido: "preferência da pessoa"). A lista guardada vale só na pasta onde foi lida — skill de projeto
// de uma pasta não pode aparecer, clicável, dentro de outra.

'use strict'

const CHAVE_DA_LISTA = 'oficina.skills.lista'
const CHAVE_DAS_PREFERENCIAS = 'oficina.skills.preferencias'
const NOME_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/

const SUFIXOS = [
  [' (user)', 'pessoa'],
  [' (project)', 'projeto'],
  [' (claude.ai sync)', 'conta'],
]

/** Um item do SDK no formato da tela, ou `null` se não pode entrar na lista. */
function classificar(comando) {
  if (!comando || typeof comando.name !== 'string') return null
  const nome = comando.name.trim()
  // `__nome` é interno do programa (medido: `__remote-workflow`).
  if (nome.startsWith('__') || !NOME_VALIDO.test(nome)) return null
  let descricao = typeof comando.description === 'string' ? comando.description.trim() : ''
  let origem = 'programa'
  for (const [sufixo, qual] of SUFIXOS) {
    if (descricao.endsWith(sufixo)) {
      descricao = descricao.slice(0, -sufixo.length).trim()
      origem = qual
      break
    }
  }
  const argumentos = typeof comando.argumentHint === 'string' ? comando.argumentHint.trim() : ''
  return { nome, descricao, origem, argumentos }
}

/** A lista inteira, sem repetidos (o primeiro nome vence). */
function classificarTodos(comandos) {
  const vistos = new Set()
  const lista = []
  for (const c of Array.isArray(comandos) ? comandos : []) {
    const item = classificar(c)
    if (!item || vistos.has(item.nome)) continue
    vistos.add(item.nome)
    lista.push(item)
  }
  return lista
}

/** Preferências lidas do perfil, sempre no formato certo (o que vier torto vira vazio). */
function normalizarPreferencias(p) {
  const nomes = v => (Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string'))] : [])
  return { ordem: nomes(p && p.ordem), favoritas: nomes(p && p.favoritas), ocultas: nomes(p && p.ocultas) }
}

/**
 * A lista na ordem da tela, em dois grupos.
 *
 * Dentro de cada grupo: favoritas no topo, depois as normais, e as ocultas no fim. Em cada faixa manda a
 * ordem que a pessoa arrastou; o que ela nunca arrastou fica na ordem em que o agente mandou, depois.
 *
 * ⚠️ FAVORITA SOBE PARA O GRUPO DE CIMA, venha de onde vier. O grupo do programa nasce recolhido — uma
 * favorita que ficasse lá dentro não estaria "em cima", estaria escondida.
 */
function organizar(itens, preferencias) {
  const p = normalizarPreferencias(preferencias)
  const favorita = new Set(p.favoritas)
  const oculta = new Set(p.ocultas)
  const posicao = new Map(p.ordem.map((nome, i) => [nome, i]))
  const chegada = new Map(itens.map((item, i) => [item.nome, i]))
  const faixa = item => (oculta.has(item.nome) ? 2 : favorita.has(item.nome) ? 0 : 1)
  const comparar = (a, b) => {
    const f = faixa(a) - faixa(b)
    if (f) return f
    const pa = posicao.has(a.nome) ? posicao.get(a.nome) : Infinity
    const pb = posicao.has(b.nome) ? posicao.get(b.nome) : Infinity
    if (pa !== pb) return pa - pb
    return chegada.get(a.nome) - chegada.get(b.nome)
  }
  const marcar = item => ({ ...item, favorita: favorita.has(item.nome), oculta: oculta.has(item.nome) })
  const daPessoa = itens.filter(i => i.origem !== 'programa' || (favorita.has(i.nome) && !oculta.has(i.nome)))
  const doPrograma = itens.filter(i => !daPessoa.includes(i))
  return {
    daPessoa: daPessoa.sort(comparar).map(marcar),
    doPrograma: doPrograma.sort(comparar).map(marcar),
  }
}

/** Liga ou desliga um nome numa das listas. Ocultar tira de favorita, e favoritar tira de oculta. */
function alternar(preferencias, nome, qual) {
  const p = normalizarPreferencias(preferencias)
  const outra = qual === 'favoritas' ? 'ocultas' : 'favoritas'
  if (p[qual].includes(nome)) p[qual] = p[qual].filter(n => n !== nome)
  else {
    p[qual].push(nome)
    p[outra] = p[outra].filter(n => n !== nome)
  }
  return p
}

/**
 * Arrastar: os `nomes` passam a ficar logo ANTES de `alvo` (ou no fim, sem alvo).
 *
 * ⚠️ `visiveis` é a ordem que a pessoa está VENDO. A ordem guardada só tem quem já foi arrastado, e
 * mover em cima dela sozinha poria o item no lugar errado: o alvo que nunca foi arrastado não está nela.
 * Por isso a ordem inteira da tela vira a ordem guardada no primeiro arraste.
 */
function mover(preferencias, visiveis, nomes, alvo) {
  const p = normalizarPreferencias(preferencias)
  const movidos = nomes.filter(n => visiveis.includes(n))
  if (!movidos.length || movidos.includes(alvo)) return p
  const resto = [...new Set([...visiveis, ...p.ordem])].filter(n => !movidos.includes(n))
  const i = alvo ? resto.indexOf(alvo) : -1
  if (i < 0) resto.push(...movidos)
  else resto.splice(i, 0, ...movidos)
  p.ordem = resto
  return p
}

/** O texto que um clique manda para a conversa. */
function pedidoDaSkill(nome) {
  return NOME_VALIDO.test(String(nome || '')) ? '/' + nome : null
}

module.exports = {
  CHAVE_DA_LISTA, CHAVE_DAS_PREFERENCIAS, NOME_VALIDO,
  classificar, classificarTodos, normalizarPreferencias, organizar, alternar, mover, pedidoDaSkill,
}
