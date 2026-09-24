// Instala no build as extensões que estão no cache local (baixadas por
// scripts/baixar_extensoes.mjs), usando a linha de comando do próprio editor.
//
// Por que existe: o caso-teste 4 do "coração 1" do plano é *"a extensão do Claude
// Code instalada da Open VSX roda dentro da OFICINA"* — a linha de base de que a
// OFICINA não pode ser pior que o VS Code + extensão. Até agora nada instalava
// nada: o cache era baixado e ficava parado. Buraco apontado por uma revisão
// independente no ciclo da V0, em 05/09/2026.
//
// Instala a partir do ARQUIVO em cache, nunca da loja: assim a versão instalada é
// exatamente a que foi conferida, e o teste não depende da rede nem do dia.
//
// Uso:  node scripts/instalar_extensoes.mjs [pasta do build]

import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const CACHE = join(BUILD, 'extensoes-cache')

// A pasta do build: passada por argumento, ou a primeira *-win32-x64 encontrada.
const pastaBuild = process.argv[2] || (() => {
  if (!existsSync(BUILD)) return null
  const d = readdirSync(BUILD).find(x => /win32-x64$/.test(x) && statSync(join(BUILD, x)).isDirectory())
  return d ? join(BUILD, d) : null
})()

if (!pastaBuild || !existsSync(pastaBuild)) {
  console.error('Nao achei a pasta do build. Compile antes, ou passe o caminho como argumento.')
  process.exit(2)
}

// O nome do executável de linha de comando vem do product.json do PRÓPRIO build —
// nunca chutado. No build de linha de base ele é o do upstream; no da OFICINA, o nosso.
// ⚠️ O CLI vem do applicationName do product.json DO BUILD, nao do primeiro .cmd
// que aparecer na pasta. Se um dia houver dois, "o primeiro" instalaria por um CLI
// de outro produto — e como o destino das extensoes vem do dataFolderName daquele
// product.json, elas iriam para outro perfil e o teste seguinte diria "nao instalada"
// logo depois de um "10 de 10 instaladas".
const cli = (() => {
  try {
    const nome = JSON.parse(
      readFileSync(join(pastaBuild, 'resources', 'app', 'product.json'), 'utf8')).applicationName
    const caminho = join(pastaBuild, 'bin', nome + '.cmd')
    return existsSync(caminho) ? caminho : null
  } catch { return null }
})()

if (!cli) {
  console.error(`Nao achei o executavel de linha de comando em ${join(pastaBuild, 'bin')}.`)
  process.exit(3)
}

const vsix = existsSync(CACHE) ? readdirSync(CACHE).filter(f => f.endsWith('.vsix')) : []
if (!vsix.length) {
  console.error(`Cache vazio em ${CACHE}. Rode antes: node scripts/baixar_extensoes.mjs`)
  process.exit(4)
}

console.log(`instalando ${vsix.length} extensao(oes) com ${path.basename(cli)}\n`)

const falhas = []
for (const f of vsix) {
  try {
    // `cmd /c` com argumentos SEPARADOS, nunca `shell: true`: com shell o Node
    // concatena os argumentos sem aspas e qualquer espaco no caminho quebra o
    // comando de um jeito ilegivel. Sem shell nenhum, o Node 24 recusa .cmd (EINVAL).
    execFileSync('cmd', ['/c', cli, '--install-extension', join(CACHE, f), '--force'],
      { encoding: 'utf8', timeout: 180000, stdio: 'pipe' })
    console.log(`  OK      ${f}`)
  } catch (e) {
    // A saída do editor vai junto: "falhou" sem o motivo não serve para nada.
    const motivo = (e.stdout || '') + (e.stderr || '') || e.message
    console.log(`  FALHOU  ${f}`)
    falhas.push({ f, motivo: motivo.trim().split('\n').slice(-3).join(' | ') })
  }
}

if (falhas.length) {
  console.log('\nO que falhou, e por quê:')
  for (const { f, motivo } of falhas) console.log(`  ${f}\n    ${motivo}`)
}
console.log(`\n${vsix.length - falhas.length} de ${vsix.length} instaladas.`)
process.exit(falhas.length ? 1 : 0)
