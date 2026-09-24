// Confere que todo módulo nativo do núcleo foi REALMENTE compilado — e, se pedido,
// reconstrói os que ficaram pela metade.
//
// Por que existe (05/09/2026): quando o `npm install` falha no meio — por exemplo
// por falta das bibliotecas Spectre —, alguns módulos nativos ficam com a pasta
// `build/Release` criada e os objetos dentro, mas **sem o `.node` final**. Os
// `npm install` seguintes olham o pacote, veem que ele está "instalado", e não
// reconstroem nada. O build inteiro passa, empacota, gera o executável — e o app
// morre no primeiro segundo, com um erro que fala de "bindings file" e não diz uma
// palavra sobre o install de duas horas antes.
//
// Foi exatamente isso com o `@vscode/policy-watcher`: 12 outros módulos nativos
// compilados, esse um faltando, e o sintoma aparecendo no lugar mais distante
// possível da causa. Um `npm rebuild` resolveu em segundos.
//
// A regra que este arquivo aplica: **erro descoberto na hora custa segundos; o mesmo
// erro descoberto no fim custa o build inteiro.**
//
// Uso:  node scripts/conferir_nativos.mjs <pasta do clone> [--consertar]

import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const clone = process.argv[2]
const CONSERTAR = process.argv.includes('--consertar')

if (!clone || !existsSync(path.join(clone, 'node_modules'))) {
  console.error('Uso: node scripts/conferir_nativos.mjs <pasta do clone> [--consertar]')
  process.exit(2)
}

/** Todo pacote que tem binding.gyp promete um .node. Inclui os de escopo (@x/y). */
function pacotesNativos(raiz) {
  const achados = []
  const olhar = (dir, nome) => {
    if (existsSync(path.join(dir, 'binding.gyp'))) achados.push({ nome, dir })
  }
  for (const e of readdirSync(raiz, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const p = path.join(raiz, e.name)
    if (e.name.startsWith('@')) {
      for (const s of readdirSync(p, { withFileTypes: true })) {
        if (s.isDirectory()) olhar(path.join(p, s.name), `${e.name}/${s.name}`)
      }
    } else if (!e.name.startsWith('.')) {
      olhar(p, e.name)
    }
  }
  return achados
}

/** Procura o .node em qualquer lugar plausível dentro do pacote. */
function temBinario(dir) {
  const pilha = [dir]
  let visitados = 0
  while (pilha.length && visitados < 4000) {
    const atual = pilha.pop()
    visitados++
    let itens
    try { itens = readdirSync(atual, { withFileTypes: true }) } catch { continue }
    for (const it of itens) {
      if (it.isFile() && it.name.endsWith('.node')) return path.join(atual, it.name)
      // não desce em node_modules aninhado: ali moram as dependências, não o binário do pacote
      if (it.isDirectory() && it.name !== 'node_modules' && it.name !== 'src') {
        pilha.push(path.join(atual, it.name))
      }
    }
  }
  return null
}

// ⚠️ NEM TODO pacote com binding.gyp promete um .node NESTA plataforma. Cobrar de
// quem não prometeu é alarme falso — e alarme que toca à toa ensina todo mundo a
// ignorar o alarme, que é justamente o oposto do que este script existe para fazer.
// Dois casos reais, achados em 05/09/2026 ao ligar a conferência:
//   · @vscode/fs-copyfile — o binding.gyp dele é `OS=='mac'` e, fora do mac,
//     `"type": "none"`: ele NÃO gera binário no Windows, de propósito.
//   · cpu-features — é optionalDependency do ssh2; falta dele não quebra nada.
// Os dois são detectados por regra, não por lista fixa: lista fixa envelhece calada.

/** O binding.gyp tem um caminho declarado de "não compilar" para outra plataforma? */
function soDeOutraPlataforma(dir) {
  let gyp
  try { gyp = readFileSync(path.join(dir, 'binding.gyp'), 'utf8') } catch { return null }
  if (!/["']type["']\s*:\s*["']none["']/.test(gyp)) return null
  const osCitado = [...gyp.matchAll(/OS\s*[=!]=\s*["']([a-z]+)["']/g)].map(m => m[1])
  if (!osCitado.length) return null
  const nosso = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  return osCitado.some(o => o.startsWith(nosso)) ? null : `so compila em ${[...new Set(osCitado)].join('/')}`
}

/**
 * O pacote é importado em algum lugar do código-fonte do núcleo?
 *
 * ⚠️ Esta pergunta existe porque "opcional no package.json" NÃO quer dizer
 * "dispensável no Windows". A única `optionalDependencies` do núcleo na 1.136.1 é
 * `windows-foreground-love` — e ela é carregada em
 * `src/vs/code/electron-main/main.ts` (o foco da janela quando se abre um arquivo com
 * o editor já aberto), com teste de integração próprio no upstream. Dispensá-la fazia
 * o script dar verde exatamente no cenário que ele foi criado para pegar: o install
 * que morre no meio e deixa o `.node` faltando. Achado por uma revisao independente/REGRESSÃO no
 * ciclo da V0, em 05/09/2026.
 */
function ehUsadoNoFonte(nomeAlvo) {
  const src = path.join(clone, 'src')
  if (!existsSync(src)) return true   // sem fonte para conferir, o seguro é COBRAR
  const alvo = `'${nomeAlvo}'`
  const alvoAspasDuplas = `"${nomeAlvo}"`
  const procurar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (procurar(p)) return true; continue }
      if (!/\.(ts|js|mts|mjs)$/.test(e.name)) continue
      let txt
      try { txt = readFileSync(p, 'utf8') } catch { continue }
      if (txt.includes(alvo) || txt.includes(alvoAspasDuplas)) return true
    }
    return false
  }
  try { return procurar(src) } catch { return true }
}

/** Alguém o declara como dependência opcional, e ninguém como obrigatória? */
function ehOpcional(nomeAlvo, raizModules) {
  let opcional = false, obrigatorio = false
  const olhar = (pkgDir) => {
    let d
    try { d = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) } catch { return }
    if (d.optionalDependencies?.[nomeAlvo]) opcional = true
    if (d.dependencies?.[nomeAlvo]) obrigatorio = true
  }
  olhar(clone)
  for (const e of readdirSync(raizModules, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    const p = path.join(raizModules, e.name)
    if (e.name.startsWith('@')) {
      for (const s of readdirSync(p, { withFileTypes: true })) if (s.isDirectory()) olhar(path.join(p, s.name))
    } else olhar(p)
  }
  return opcional && !obrigatorio
}

const raizModules = path.join(clone, 'node_modules')
const nativos = pacotesNativos(raizModules)
const faltando = []
const dispensados = []

for (const { nome, dir } of nativos) {
  const bin = temBinario(dir)
  if (bin) {
    const kb = Math.round(statSync(bin).size / 1024)
    console.log(`  OK        ${nome.padEnd(34)} ${kb} KB`)
    continue
  }
  const outraPlataforma = soDeOutraPlataforma(dir)
  if (outraPlataforma) {
    console.log(`  NAO CABE  ${nome.padEnd(34)} ${outraPlataforma}`)
    dispensados.push(nome)
  } else if (ehOpcional(nome, raizModules) && !ehUsadoNoFonte(nome)) {
    console.log(`  OPCIONAL  ${nome.padEnd(34)} so em optionalDependencies E nao usado no fonte`)
    dispensados.push(nome)
  } else {
    console.log(`  FALTA     ${nome.padEnd(34)} sem .node compilado`)
    faltando.push(nome)
  }
}

const obrigatorios = nativos.length - dispensados.length
console.log(`\n${obrigatorios - faltando.length} de ${obrigatorios} modulos nativos OBRIGATORIOS compilados` +
  (dispensados.length ? ` (${dispensados.length} nao se aplicam aqui: ${dispensados.join(', ')})` : '') + '.')

if (!faltando.length) process.exit(0)

if (!CONSERTAR) {
  console.error('\nFaltam modulos nativos. Rode de novo com --consertar, ou:')
  for (const n of faltando) console.error(`  npm rebuild ${n}`)
  process.exit(1)
}

console.log('\nreconstruindo os que faltam...')
let restaram = []
for (const nome of faltando) {
  try {
    execFileSync('npm', ['rebuild', nome], { cwd: clone, stdio: 'pipe', encoding: 'utf8', shell: true, timeout: 600000 })
    const alvo = nativos.find(n => n.nome === nome)
    if (temBinario(alvo.dir)) console.log(`  RECONSTRUIDO  ${nome}`)
    else { console.log(`  AINDA FALTA   ${nome}`); restaram.push(nome) }
  } catch (e) {
    console.log(`  FALHOU        ${nome}: ${String(e.message).split('\n')[0]}`)
    restaram.push(nome)
  }
}
process.exit(restaram.length ? 1 : 0)
