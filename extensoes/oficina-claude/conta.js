// A CONTA (V26) — em qual conta do Claude o programa está, e como sair dela para entrar em outra.
// Sem `vscode`: `testes/conta.mjs` prova o texto e os estados em node puro.
//
// > *"como é que eu deslogo a minha conta do Claude no oficina? Para poder logar em outra conta. Eu
// > tenho que ter algum botão para isso também."* — ele, 24/09/2026
//
// ⚠️ A OFICINA NUNCA GUARDOU CREDENCIAL, e esta tela não pode fingir que apaga alguma coisa. Quem
// guarda o login é o CLI do Claude, no perfil da pessoa. O que esta tela faz é MOSTRAR o que está
// valendo e chamar quem de fato desconecta.
//
// ⚠️ O DADO VEM DO `claude auth status`, que responde JSON — medido em 24/09/2026 no CLI 2.1.261:
// `loggedIn`, `authMethod`, `apiProvider`, `email`, `orgName`, `subscriptionType`, e mais. 340 ms.
// É o único dos caminhos medidos que responde em formato de máquina (o `mcp list`, por comparação,
// só tem texto), então aqui não há parse de texto para envelhecer.
//
// ⛔ O QUE ESTAVA ERRADO ANTES, E POR QUÊ — o achado que abriu esta versão. O "Sair" que existia
// mandava a pessoa digitar `claude /logout` num terminal. Medido no CLI que vem DENTRO do produto:
//
//     claude auth --help
//       login    Sign in to your Anthropic account
//       logout   Log out from your Anthropic account
//       status   Show authentication status
//
// O comando é `claude auth logout`. O `/logout` é de uma versão anterior do CLI: a instrução
// envelheceu junto com a ferramenta, sem ninguém editar nada — a regra 31 batendo num texto que o
// produto MOSTRA para quem usa.
//
// ⚠️ E existe caminho melhor que terminal nenhum: a extensão oficial do Claude (2.1.278, que é a
// porta da conversa desde a V23) registra o comando `claude-vscode.logout`. Medido no código dela:
// ele desloga e avisa se conseguiu ("Successfully logged out from Claude") ou não ("Failed to logout
// completely. Some credentials may remain."). É o caminho oficial, dentro da tela que a pessoa usa —
// e o terminal fica como plano B, para o computador onde a extensão oficial não estiver instalada.
//
// ⚠️ NÃO MEDIDO, e declarado: como o `auth status` responde com a pessoa DESLOGADA. Não se testa
// isso deslogando a conta de alguém no meio do trabalho. O código trata `loggedIn: false` e trata
// resposta que não é JSON — mas o formato exato do caso deslogado segue por medir, e quem ler esta
// tela naquele estado é quem vai descobrir.

'use strict'

const M = require('./mcps.js')

/** Como a pessoa entrou, em português. O que não for conhecido aparece como veio. */
const METODOS = {
  'claude.ai': 'conta do claude.ai',
  'console.anthropic.com': 'conta do console da Anthropic',
  'apiKey': 'chave de API',
  'bedrock': 'Amazon Bedrock',
  'vertex': 'Google Vertex',
}

/** O plano, em português. */
const PLANOS = {
  max: 'Max',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
  free: 'gratuito',
}

/**
 * O JSON do `auth status` virado no que a tela mostra.
 *
 * Três saídas possíveis, e elas NÃO se confundem:
 *   - `{ situacao: 'dentro' }`  — está logado, e o resto dos campos diz em quê;
 *   - `{ situacao: 'fora' }`    — o CLI respondeu que não há login;
 *   - `{ situacao: 'naoSei' }`  — não deu para ler (texto que não é JSON, campo faltando, erro).
 *
 * A terceira existe por causa da lição do mostrador de tokens da V24: "não consegui medir" tem que
 * ser dizível, senão a tela inventa um "desconectado" que ninguém verificou.
 */
/**
 * O primeiro objeto JSON de um texto que pode ter lixo em volta, ou `null`.
 *
 * ⛔ POR QUE NÃO É SÓ `JSON.parse(texto)`. Quem roda o CLI junta o que saiu na saída normal e o que
 * saiu na saída de erro — de propósito, porque no `mcp list` o erro de um servidor é informação. Mas
 * aqui isso significa que **uma única linha de aviso** (versão nova, deprecação do node, proxy) faz
 * o `JSON.parse` estourar e a tela da conta dizer "não consegui ler" para sempre. Um revisor
 * independente provou isso com um processo que imprime a ficha certa e um `Warning:` no stderr.
 *
 * Degradar honesto é melhor que mentir, mas melhor ainda é não degradar à toa: a ficha está ali, no
 * meio do texto, e pegá-la é contar chaves.
 */
function primeiroObjetoJson(texto) {
  const s = String(texto || '')
  const inicio = s.indexOf('{')
  if (inicio < 0) return null
  let nivel = 0
  let dentroDeTexto = false
  let escapando = false
  for (let i = inicio; i < s.length; i++) {
    const c = s[i]
    if (dentroDeTexto) {
      if (escapando) escapando = false
      else if (c === '\\') escapando = true
      else if (c === '"') dentroDeTexto = false
      continue
    }
    if (c === '"') dentroDeTexto = true
    else if (c === '{') nivel++
    else if (c === '}') {
      nivel--
      if (nivel === 0) return s.slice(inicio, i + 1)
    }
  }
  return null
}

function analisarConta(saida) {
  let d = null
  const bloco = primeiroObjetoJson(saida)
  try {
    d = JSON.parse(bloco !== null ? bloco : String(saida || '').trim())
  } catch {
    return { situacao: 'naoSei', motivo: 'o Claude respondeu uma coisa que não é JSON', cru: String(saida || '').slice(0, 400) }
  }
  if (!d || typeof d !== 'object') {
    return { situacao: 'naoSei', motivo: 'o Claude respondeu um JSON que não é uma ficha de conta', cru: String(saida || '').slice(0, 400) }
  }
  if (typeof d.loggedIn !== 'boolean') {
    return { situacao: 'naoSei', motivo: 'a resposta não disse se há login', cru: JSON.stringify(d).slice(0, 400) }
  }
  if (!d.loggedIn) return { situacao: 'fora' }

  const texto = v => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const metodo = texto(d.authMethod)
  const plano = texto(d.subscriptionType)
  return {
    situacao: 'dentro',
    email: texto(d.email),
    organizacao: texto(d.orgName),
    // ⚠️ O que não conhecemos aparece COMO VEIO, em vez de virar "desconhecido": o nome cru diz mais
    // à pessoa do que uma palavra nossa que apagou a informação.
    metodo: metodo ? (METODOS[metodo] || metodo) : null,
    plano: plano ? (PLANOS[plano] || plano) : null,
    porApi: d.apiProvider === 'firstParty' ? null : texto(d.apiProvider),
  }
}

/** Uma linha só, para o resumo da vista. */
function resumoDaConta(conta) {
  if (!conta) return 'não consegui ler'
  if (conta.situacao === 'fora') return 'fora da conta'
  if (conta.situacao === 'naoSei') return 'não consegui ler'
  return conta.email || conta.organizacao || 'dentro da conta'
}

/**
 * Os argumentos da leitura.
 *
 * ⚠️ `--json` VAI ESCRITO, mesmo sendo o padrão de hoje. Medido no 2.1.261, depois de um revisor
 * independente olhar a ajuda: `claude auth status --help` mostra `--json  Output as JSON (default)`
 * e `--text  Output as human-readable text`. Um padrão declarado assim é exatamente o tipo de coisa
 * que inverte numa versão nova — e aí esta tela ficaria em "não consegui ler" para sempre, sem
 * ninguém entender por quê. Uma palavra a mais compra a garantia.
 */
const ARGUMENTOS_DA_LEITURA = ['auth', 'status', '--json']

/** Lê a conta agora. Erro vira `naoSei` COM O MOTIVO — a tela nunca recebe um silêncio. */
async function lerConta({ exe, cwd, teto = M.TETO_CURTO_MS, rodarComando = M.rodar } = {}) {
  try {
    const r = await rodarComando(exe, ARGUMENTOS_DA_LEITURA, { cwd, teto })
    const texto = typeof r === 'string' ? r : (r && r.texto)
    return { ...analisarConta(texto), lidoEm: Date.now() }
  } catch (e) {
    return { situacao: 'naoSei', motivo: e && e.message ? e.message : String(e), lidoEm: Date.now() }
  }
}

/** Os argumentos de sair e de entrar — para quem for abrir um terminal com eles. */
const ARGUMENTOS_PARA_SAIR = ['auth', 'logout']
const ARGUMENTOS_PARA_ENTRAR = ['auth', 'login']

/** O comando da extensão oficial que desloga de verdade (o caminho preferido). */
const COMANDO_OFICIAL_DE_SAIR = 'claude-vscode.logout'

module.exports = {
  METODOS, PLANOS, ARGUMENTOS_PARA_SAIR, ARGUMENTOS_PARA_ENTRAR, ARGUMENTOS_DA_LEITURA,
  COMANDO_OFICIAL_DE_SAIR,
  analisarConta, resumoDaConta, lerConta, primeiroObjetoJson,
}
