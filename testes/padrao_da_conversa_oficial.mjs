// O PADRÃO DE FÁBRICA QUE A CONVERSA OFICIAL NÃO ENXERGA — em node puro, mais a prova no PACOTE REAL.
//
// ⚠️ POR QUE ESTA SUÍTE EXISTE. Um revisor independente abriu o build 1 em perfil limpo, três
// vezes, e leu **"Auto"** no seletor da caixa de escrever — enquanto o produto declarava o modo
// que pula aprovação como padrão de fábrica, e o README avisava quem instala que é assim. A causa
// estava no pacote dela: a chave é lida com `inspect().globalValue`, que só enxerga o arquivo de
// configuração de quem usa. O padrão de um produto cai em `defaultValue` e é descartado ali.
//
// O que precisa ser verdade:
//   1. produto declara e a pessoa não tem → escreve (uma vez);
//   2. a pessoa já tem → NÃO sobrescreve, nem quando o valor dela contraria o produto;
//   3. o produto não declara → não escreve nada;
//   4. escrever que falha não derruba a abertura;
//   5. ⚠️ PACOTE REAL: a extensão oficial instalada lê mesmo essa chave por `inspect().globalValue`
//      — se um dia ela passar a ler com `get` normal, esta suíte fica vermelha e a escrita no
//      arquivo de quem usa deixa de ter motivo (e deve sair);
//   6. ⚠️ PACOTE REAL (controle): a outra chave do bypass é lida por `get` normal — é por isso que
//      ela NÃO está na lista, e é o controle que mostra que a lista não é chute;
//   7. o produto declara mesmo o modo que a decisão dele mandou.
//
// Uso:  node testes/padrao_da_conversa_oficial.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const P = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'padraoDaConversaOficial.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

/** Um editor de mentira: guarda o que foi escrito e em qual camada. */
function configuracaoFalsa(visoes) {
  const escritas = []
  return {
    escritas,
    inspecionar: (secao, chave) => visoes[`${secao}.${chave}`],
    escrever: async (secao, chave, valor) => { escritas.push({ secao, chave, valor }) },
  }
}

// ── 1. o caso que o revisor pegou: máquina nova ──
{
  const c = configuracaoFalsa({ 'claudeCode.initialPermissionMode': { defaultValue: 'bypassPermissions', globalValue: undefined } })
  const escritas = await P.propagar(c.inspecionar, c.escrever)
  checar('1. produto declara e a pessoa não tem → escreve o padrão do produto',
    escritas.length === 1 && c.escritas.length === 1
    && c.escritas[0].secao === 'claudeCode' && c.escritas[0].chave === 'initialPermissionMode'
    && c.escritas[0].valor === 'bypassPermissions', JSON.stringify(c.escritas))
}

// ── 2. a escolha de quem usa é intocável ──
{
  const c = configuracaoFalsa({ 'claudeCode.initialPermissionMode': { defaultValue: 'bypassPermissions', globalValue: 'default' } })
  await P.propagar(c.inspecionar, c.escrever)
  checar('2. a pessoa já escolheu → NÃO sobrescreve, nem contrariando o produto',
    c.escritas.length === 0, JSON.stringify(c.escritas))

  // e o caso mais fácil de errar: ela escolheu exatamente o que o produto quer
  const c2 = configuracaoFalsa({ 'claudeCode.initialPermissionMode': { defaultValue: 'bypassPermissions', globalValue: 'bypassPermissions' } })
  await P.propagar(c2.inspecionar, c2.escrever)
  checar('2b. nem reescreve por cima de um valor igual (o arquivo dela não é tocado à toa)',
    c2.escritas.length === 0, JSON.stringify(c2.escritas))
}

// ── 3. sem padrão declarado, nada acontece ──
{
  const c = configuracaoFalsa({ 'claudeCode.initialPermissionMode': { defaultValue: undefined, globalValue: undefined } })
  await P.propagar(c.inspecionar, c.escrever)
  checar('3. produto não declara → não escreve nada', c.escritas.length === 0, JSON.stringify(c.escritas))

  const c2 = configuracaoFalsa({})
  await P.propagar(c2.inspecionar, c2.escrever)
  checar('3b. chave que o editor não conhece → não escreve, e não lança', c2.escritas.length === 0)
}

// ── 4. falhar não pode derrubar a abertura ──
{
  const c = configuracaoFalsa({ 'claudeCode.initialPermissionMode': { defaultValue: 'bypassPermissions', globalValue: undefined } })
  const escritas = await P.propagar(c.inspecionar, async () => { throw new Error('perfil somente-leitura') })
  checar('4. escrita que falha volta vazia, sem lançar', Array.isArray(escritas) && escritas.length === 0)

  const escritas2 = await P.propagar(() => { throw new Error('editor fechando') }, c.escrever)
  checar('4b. leitura que lança também não derruba nada', Array.isArray(escritas2) && escritas2.length === 0)
}

// ── 5 e 6. O PACOTE REAL — é aqui que se prova que isto tem motivo ──
{
  const candidatas = [
    path.join(os.homedir(), '.oficina', 'extensions'),
    path.join(os.homedir(), '.vscode', 'extensions'),
  ]
  let pacote = null
  for (const base of candidatas) {
    let nomes = []
    try { nomes = fs.readdirSync(base) } catch { continue }
    for (const n of nomes.filter(n => n.startsWith('anthropic.claude-code')).sort()) {
      const js = path.join(base, n, 'extension.js')
      if (fs.existsSync(js)) pacote = { nome: n, js }
    }
    if (pacote) break
  }

  if (!pacote) {
    checar('5. PACOTE REAL: a extensão oficial está instalada para conferir como ela lê a chave',
      false, 'não achei a extensão oficial instalada; sem ela este critério não prova nada')
  } else {
    const fonte = fs.readFileSync(pacote.js, 'utf8')
    console.log(`       (conferido contra ${pacote.nome})`)
    // Busca literal: no pacote minificado a chamada aparece como `inspect("initialPermissionMode")`.
    const porInspect = fonte.includes('inspect("initialPermissionMode")') || fonte.includes("inspect('initialPermissionMode')")
    checar('5. PACOTE REAL: ela lê o modo inicial por `inspect(...).globalValue` — por isso o padrão do produto não basta',
      porInspect, 'não achei a chamada; se ela mudou de jeito, reavaliar se ainda vale escrever no arquivo de quem usa')

    // Controle: a chave irmã é lida de um jeito que JÁ enxerga o padrão do produto.
    const irmaPorInspect = fonte.includes('inspect("allowDangerouslySkipPermissions")') || fonte.includes("inspect('allowDangerouslySkipPermissions')")
    checar('6. PACOTE REAL (controle): a chave irmã NÃO é lida por inspect — e por isso não está na lista',
      !irmaPorInspect && !P.CHAVES.includes('claudeCode.allowDangerouslySkipPermissions'),
      JSON.stringify({ irmaPorInspect, lista: P.CHAVES }))
  }
}

// ── 7. o produto declara o que a decisão dele mandou ──
{
  const produto = JSON.parse(fs.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
  const padroes = produto.configurationDefaults || {}
  checar('7. o produto declara o modo que ele decidiu (bypass de fábrica, 21/09/2026)',
    padroes['claudeCode.initialPermissionMode'] === 'bypassPermissions'
    && padroes['claudeCode.allowDangerouslySkipPermissions'] === true,
    JSON.stringify({
      modo: padroes['claudeCode.initialPermissionMode'],
      permite: padroes['claudeCode.allowDangerouslySkipPermissions'],
    }))
  checar('7b. e a chave que precisa de propagação é exatamente a que o produto declara',
    P.CHAVES.length === 1 && P.CHAVES[0] === 'claudeCode.initialPermissionMode', JSON.stringify(P.CHAVES))
}

const falhas = resultados.filter(r => !r.ok)
console.log(`
  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
