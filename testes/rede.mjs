// O que a OFICINA fala com a rede quando alguém a abre.
//
// O critério 4 do plano promete, com estas palavras: *"telemetria desligada,
// verificado por rede: zero chamada a `*.visualstudio.com`/vortex durante a fumaça"*.
// Até hoje isso era conferido lendo `enableTelemetry: false` no `product.json` — ou
// seja, a INTENÇÃO gravada em disco, nunca o tráfego. É o mesmo salto que o ciclo já
// corrigiu na identidade do executável (intenção × fato); aqui ele ainda estava de pé.
//
// ⚠️ O QUE ESTE TESTE NÃO VÊ — declarado, para não virar falsa tranquilidade:
// ele observa as requisições das JANELAS (o processo de interface). Chamadas feitas
// pelo processo principal do Electron ou pelo processo compartilhado, em Node puro,
// NÃO passam por aqui. Um verde daqui quer dizer "a janela não falou com ninguém que
// não devia", e não "o programa inteiro não falou".
//
// Uso: node testes/rede.mjs [caminho do exe]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { carregarElectron, acharExe, ambienteLimpo, argumentosDeTeste, lerCarimbo, esconderJanela, fecharApp } from './comum.mjs'

// Quem NÃO pode ser contatado, e o porquê de cada um.
const PROIBIDOS = [
  { re: /(^|\.)visualstudio\.com$/i, oque: 'serviço da Microsoft (telemetria/marketplace)' },
  { re: /vortex\..*\.microsoft\.com$/i, oque: 'coletor de telemetria da Microsoft' },
  { re: /(^|\.)dc\.services\.visualstudio\.com$/i, oque: 'Application Insights' },
  { re: /(^|\.)marketplace\.visualstudio\.com$/i, oque: 'loja da Microsoft (não podemos usar)' },
  { re: /(^|\.)update\.code\.visualstudio\.com$/i, oque: 'canal de atualização da Microsoft' },
  { re: /(^|\.)microsoft\.com$/i, oque: 'domínio da Microsoft' }
]

const exe = acharExe(process.argv[2])
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel compilado'); process.exit(1) }
const carimbo = lerCarimbo(exe)
console.log('executavel: ' + exe + (carimbo ? `  (${carimbo.modo} ${carimbo.tag})` : '  (SEM CARIMBO)'))

const _electron = await carregarElectron()
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-rede-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'alvo.txt'), 'arquivo qualquer\n')

const hosts = new Map()   // host -> quantas vezes
const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 220) + ')' : ''}`)
}
const respirar = (ms) => new Promise(r => setTimeout(r, ms))

let app
try {
  app = await _electron.launch({
    executablePath: exe, env: ambienteLimpo(),
    args: argumentosDeTeste(projeto, area), timeout: 120000
  })

  // Escutar TODAS as páginas do aplicativo, inclusive as que nascerem depois.
  const anotarPedido = (req) => {
    let host = ''
    try { host = new URL(req.url()).host } catch { return }
    if (!host) return                       // vscode-file:// e afins não têm host
    hosts.set(host, (hosts.get(host) || 0) + 1)
  }
  const ctx = app.context()
  ctx.on('request', anotarPedido)
  ctx.on('page', p => p.on('request', anotarPedido))
  for (const p of ctx.pages()) p.on('request', anotarPedido)

  const win = await app.firstWindow({ timeout: 60000 })

  await esconderJanela(app)
  win.on('request', anotarPedido)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })

  // Uso normal: abrir um arquivo e abrir o terminal. É o que a fumaça faz — a
  // pergunta aqui é com quem o programa fala enquanto isso acontece.
  await win.waitForSelector('.explorer-folders-view', { timeout: 30000 })
  await win.locator('.explorer-item .label-name', { hasText: 'alvo.txt' }).first().dblclick()
  await win.waitForSelector('.monaco-editor', { timeout: 30000 })
  await win.keyboard.press('Control+Shift+`')
  await win.waitForSelector('.terminal-wrapper, .xterm-screen', { timeout: 45000 }).catch(() => {})

  // Telemetria costuma sair em lote, não no primeiro segundo. Esperar um pouco é
  // parte da medição, não enrolação.
  await respirar(20000)

  await fecharApp(app)
  app = null
} catch (e) {
  if (app) { try { await fecharApp(app) } catch { /* segue */ } }
  checar('execucao sem excecao', false, String(e).split('\n')[0])
}

const contatados = [...hosts.entries()].sort((a, b) => b[1] - a[1])
console.log('\nhosts contatados pela janela: ' + (contatados.length ? '' : '(nenhum)'))
for (const [h, n] of contatados) console.log(`  ${String(n).padStart(4)}x  ${h}`)

const sujos = contatados
  .map(([h]) => ({ host: h, regra: PROIBIDOS.find(p => p.re.test(h)) }))
  .filter(x => x.regra)

// ⚠️ CONTROLE POSITIVO — sem ele, "zero violacao" e indistinguivel de "zero medicao".
//
// Se os ouvintes de `request` nao engatarem (contexto do Electron diferente, pagina
// nascida fora do `ctx`, app que morre cedo), `contatados` fica VAZIO e o criterio que
// carrega a promessa do plano — "nenhuma chamada a Microsoft, medido por REDE" — sai
// verde tendo medido NADA. O teste declarava honestamente o que nao ve (o processo
// principal); nao declarava que podia nao ver coisa nenhuma.
//
// A ancora e natural: um editor que abre sempre carrega algo por `vscode-app`. Se nem
// isso apareceu, o instrumento e que nao funcionou — e isso e vermelho, nao verde.
// Achado por revisor independente em 05/09/2026.
checar('o instrumento de rede realmente mediu alguma coisa (controle positivo)',
  contatados.length > 0,
  contatados.length ? `${contatados.length} host(s) observado(s)` : 'NENHUM host observado — o teste nao mediu nada')

checar('nenhuma chamada a servico da Microsoft durante o uso', sujos.length === 0,
  sujos.map(x => `${x.host} — ${x.regra.oque}`).join(' | '))

try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* some no proximo boot */ }

const falhas = resultados.filter(r => !r.ok)
console.log('\n' + JSON.stringify({
  passou: falhas.length === 0,
  hosts: Object.fromEntries(contatados),
  observacao: 'so cobre o processo de janela; o processo principal nao passa por aqui',
  falhas: falhas.map(f => f.nome)
}, null, 2))
process.exit(falhas.length ? 1 : 0)
