// O PADRÃO DE FÁBRICA QUE A CONVERSA OFICIAL NÃO ENXERGA — e como entregá-lo a ela (V20).
//
// ⚠️ O DEFEITO, ACHADO POR REVISOR INDEPENDENTE NA TELA DO BUILD 1, E CONFIRMADO NO PACOTE DELA.
//
// O dono do produto decidiu, em 21/09/2026, que o modo que pula aprovação fica ligado de fábrica
// para todo mundo que instalar — com estas palavras: *"o modo de sobreposição ali, o bypass, vai
// continuar para todo mundo que instalar. Beleza, super bem."* O produto declara isso, como
// declara qualquer outro padrão seu.
//
// Só que a extensão oficial lê essa chave assim:
//
//     getInitialPermissionMode() {
//       let J = workspace.getConfiguration("claudeCode").inspect("initialPermissionMode")?.globalValue
//
// `inspect().globalValue` é **somente** a camada do arquivo de configuração de quem usa. O padrão
// que um produto declara cai em `defaultValue`, e é descartado ali. Resultado medido três vezes na
// tela, em perfil limpo: o seletor da caixa de escrever dizia **"Auto"**, e a conversa ainda
// mostrava o cartão *"Auto mode is now Claude Code's default permission mode"*. Funcionava só na
// máquina de quem já tinha escrito a chave à mão.
//
// Pior que não funcionar: o README e o registro de versões **avisam quem instala** que o programa
// age sem pedir aprovação. Um aviso que não corresponde ao que o programa faz é pior que aviso
// nenhum — e há critério na regressão cobrando que esse aviso exista.
//
// ⚠️ O QUE ESTE ARQUIVO FAZ, E O QUE ELE NÃO FAZ.
//
// Faz: na abertura, para cada chave desta lista, se o produto declara um padrão e a camada de quem
// usa está VAZIA, escreve o padrão do produto nessa camada. Uma vez.
//
// Não faz: nunca sobrescreve escolha de ninguém. `globalValue` preenchido — mesmo que seja
// exatamente o contrário do que o produto pediria — é decisão de quem usa, e fica.
//
// ⚠️ DECISÃO DELE, 21/09/2026, com o custo declarado na pergunta (*"o programa passa a escrever
// num arquivo que é seu, uma vez"*): **sim, escrever**. A alternativa oferecida era tirar o aviso
// e deixar de ser de fábrica.
//
// Nada aqui importa `vscode`: o motor recebe um leitor/escritor e é provado em node puro.

'use strict'

/**
 * As chaves cujo padrão o produto declara mas a extensão oficial só lê da camada de quem usa.
 *
 * ⚠️ NÃO É "TODAS AS CHAVES DELA". Cada uma aqui foi conferida no pacote: `initialPermissionMode`
 * é lida com `inspect().globalValue` e precisa disto; `allowDangerouslySkipPermissions` é lida com
 * um `get` normal (que enxerga o padrão do produto) e por isso NÃO entra — propagá-la seria
 * escrever no arquivo de quem usa sem necessidade nenhuma.
 */
const CHAVES = ['claudeCode.initialPermissionMode']

/** Separa `secao.chave` no que a interface de configuração do editor espera. */
function partir(caminho) {
  const i = String(caminho).indexOf('.')
  if (i <= 0) return null
  return { secao: caminho.slice(0, i), chave: caminho.slice(i + 1) }
}

/**
 * Decide o que precisa ser escrito, sem escrever nada.
 *
 * `inspecionar(secao, chave)` devolve `{ defaultValue, globalValue }` — a mesma forma que o editor
 * entrega. Devolve a lista do que falta: `[{ secao, chave, valor }]`.
 */
function oQueFalta(inspecionar, chaves = CHAVES) {
  const falta = []
  for (const caminho of chaves) {
    const p = partir(caminho)
    if (!p) continue
    let visao = null
    try { visao = inspecionar(p.secao, p.chave) } catch { visao = null }
    if (!visao || typeof visao !== 'object') continue
    // O produto não declara padrão para esta chave: não há o que propagar.
    if (visao.defaultValue === undefined || visao.defaultValue === null) continue
    // Quem usa já decidiu: a decisão fica, mesmo contrária à do produto.
    if (visao.globalValue !== undefined) continue
    falta.push({ ...p, valor: visao.defaultValue })
  }
  return falta
}

/**
 * Propaga os padrões que faltam.
 *
 * `escrever(secao, chave, valor)` grava na camada de quem usa (no editor, `ConfigurationTarget.Global`).
 * Nunca lança: um perfil somente-leitura, ou uma pasta sem permissão, não pode derrubar a abertura
 * do programa — no pior caso o modo continua sendo o da extensão, que é o que acontece hoje.
 *
 * Devolve o que foi escrito, para quem chama anotar no registro.
 */
async function propagar(inspecionar, escrever, chaves = CHAVES) {
  const falta = oQueFalta(inspecionar, chaves)
  const escritas = []
  for (const item of falta) {
    try {
      await escrever(item.secao, item.chave, item.valor)
      escritas.push(item)
    } catch { /* ver acima: não derruba a abertura */ }
  }
  return escritas
}

module.exports = { CHAVES, partir, oQueFalta, propagar }
