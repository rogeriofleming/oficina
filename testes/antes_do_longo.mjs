// ANTES DO LONGO — tudo o que se prova em SEGUNDOS, antes de gastar uma regressão ou um empacotamento.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE (26/09/2026). Numa mesma tarde a regressão inteira rodou TRÊS vezes, e
// as duas repetições foram por erros que este arquivo pega em segundos:
//   1. um arquivo da extensão editado DEPOIS de sincronizar — a regressão acusou "a extensão dentro do
//      executável difere da do repositório" em todas as suítes de tela;
//   2. uma troca de texto no programa compilado que perdeu as barras de uma expressão regular — o
//      arquivo principal da interface ficou com erro de sintaxe e nenhuma janela abriu;
//   e, de carona, contagens de critério desatualizadas e uma sonda nova fora da lista.
// Processo longo só roda quando o que dá para conferir antes já foi conferido. O que só aparece
// rodando é o trabalho DELE; o resto é trabalho deste arquivo.
//
// Se tudo passar, grava um CARIMBO com a impressão digital (data e tamanho) de cada arquivo conferido.
// A trava do ambiente de trabalho pode exigir esse carimbo antes de deixar a regressão rodar, e recusa
// se algum arquivo mudou depois dele.
//
// Uso:  node testes/antes_do_longo.mjs [exe]      (OFICINA_BUILD no ambiente, como os outros testes)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { acharExe, extensaoForaDeSincronia } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const CARIMBO = path.join(os.tmpdir(), 'oficina_antes_do_longo.json')
const PASTAS = ['extensoes', 'testes', 'scripts', 'patches']

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

/** Os arquivos do repositório que contam: versionados E novos ainda não adicionados (um teste novo conta). */
function arquivosDoRepositorio() {
  return execFileSync('git', ['-C', REPO, 'ls-files', '-co', '--exclude-standard', ...PASTAS], { encoding: 'utf8' })
    .split('\n').map(l => l.trim()).filter(Boolean)
}

/** `node --check` em paralelo. Como MÓDULO quando é `.mjs`, ou quando o conteúdo tem `import`/`export`. */
async function checarSintaxe(arquivos) {
  const ruins = []
  const fila = [...arquivos]
  const um = async () => {
    for (let f = fila.shift(); f; f = fila.shift()) {
      await new Promise(resolve => {
        const p = spawn(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] })
        let erro = ''
        p.stderr.on('data', d => { erro += d })
        p.on('close', codigo => {
          if (codigo !== 0) ruins.push(`${path.relative(REPO, f) || f}: ${(erro.split('\n').map(l => l.trim()).find(l => /^\w*Error:/.test(l)) || 'erro').slice(0, 160)}`)
          resolve()
        })
      })
    }
  }
  await Promise.all(Array.from({ length: Math.max(2, Math.min(8, os.cpus().length)) }, um))
  return ruins
}

const sha = buf => crypto.createHash('sha256').update(buf).digest('base64').replace(/=+$/, '')

// ── o executável que o processo longo vai usar ──
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado (defina OFICINA_BUILD ou passe o caminho)' }))
  process.exit(1)
}
console.log('executavel: ' + exe)
const app = path.join(path.dirname(exe), 'resources', 'app')
const t0 = Date.now()

// 1. sintaxe de todo fonte JavaScript do repositório
const doRepo = arquivosDoRepositorio()
const fontes = doRepo.filter(f => /\.(m|c)?js$/.test(f)).map(f => path.join(REPO, f)).filter(f => fs.existsSync(f))
const ruinsRepo = await checarSintaxe(fontes)
checar(`sintaxe: ${fontes.length} arquivos .js/.mjs/.cjs do repositório`, ruinsRepo.length === 0, ruinsRepo.join(' | '))

// 2 e 3. o produto compilado: checksums batem, e os JS com checksum são JavaScript válido
let produto = null
try { produto = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8')) } catch { /* abaixo */ }
checar('o product.json do executável é legível', !!produto)
const comChecksum = produto && produto.checksums ? Object.keys(produto.checksums) : []
const divergentes = comChecksum.filter(rel => {
  try { return sha(fs.readFileSync(path.join(app, 'out', ...rel.split('/')))) !== produto.checksums[rel] } catch { return true }
})
checar(`checksums: os ${comChecksum.length} arquivos protegidos batem com o product.json (senão: "instalação corrompida")`,
  divergentes.length === 0, divergentes.join(', '))
const copias = []
for (const rel of comChecksum.filter(r => r.endsWith('.js'))) {
  const copia = path.join(os.tmpdir(), `oficina_sintaxe_${process.pid}_${copias.length}.mjs`)
  try { fs.copyFileSync(path.join(app, 'out', ...rel.split('/')), copia); copias.push(copia) } catch { /* ja acusado acima */ }
}
const ruinsExe = await checarSintaxe(copias)
for (const c of copias) { try { fs.unlinkSync(c) } catch { } }
checar(`sintaxe: os ${copias.length} JavaScript protegidos do executável`, ruinsExe.length === 0, ruinsExe.join(' | '))

// 4. a extensão dentro do executável é a do repositório (o mesmo critério da regressão)
const fora = extensaoForaDeSincronia(exe, REPO)
checar('a extensão dentro do executável é a do repositório', fora.length === 0,
  fora.join(', ') + ' — rode: node scripts/sincronizar_extensao.mjs')

// 5. os testes rápidos (inclui as contagens de critério e as suítes órfãs)
const rapidos = spawnSync(process.execPath, [path.join(REPO, 'testes', 'rapidos.mjs')], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const placar = (rapidos.stdout || '').split('\n').reverse().find(l => l.startsWith('{')) || ''
checar('os testes rápidos (testes/rapidos.mjs)', rapidos.status === 0, placar.slice(0, 300))

const passou = resultados.every(r => r.ok)
if (passou) {
  const impressao = {}
  for (const rel of doRepo) {
    try { const st = fs.statSync(path.join(REPO, rel)); impressao[rel.replace(/\\/g, '/')] = [Math.round(st.mtimeMs), st.size] } catch { }
  }
  for (const rel of ['product.json', ...comChecksum.map(r => 'out/' + r)]) {
    try { const st = fs.statSync(path.join(app, ...rel.split('/'))); impressao['@exe/' + rel] = [Math.round(st.mtimeMs), st.size] } catch { }
  }
  fs.writeFileSync(CARIMBO, JSON.stringify({ passou, quando: Date.now(), repo: REPO, exe, app, impressao }, null, 1))
} else {
  try { fs.unlinkSync(CARIMBO) } catch { }
}
console.log(JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome), segundos: Math.round((Date.now() - t0) / 1000), carimbo: passou ? CARIMBO : null }))
process.exit(passou ? 0 : 1)
