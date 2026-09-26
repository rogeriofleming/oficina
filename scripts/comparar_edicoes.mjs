// COMPARAR EDIÇÕES — a edição equipe feita por `virar_equipe.mjs` é a MESMA que um build equipe?
//
// É a prova que decide se a transformação pode substituir o segundo build. Compara duas pastas de
// saída arquivo a arquivo. Tudo tem de ser byte a byte igual, com três exceções, cada uma com o motivo:
//   - `node_modules.asar`: o build empacota os arquivos em ordem que varia de uma corrida para outra
//     (medido em 25/09/2026: mesmos 6531 arquivos, mesmo conteúdo, deslocamentos diferentes no
//     cabeçalho). Aqui é comparado pelo CONTEÚDO de cada arquivo de dentro.
//   - `*.js.map`: os mapas de código não são reescritos pela transformação (custo declarado: só
//     servem para depurar, e a linha do produto fica deslocada no mapa). Ficam fora, CONTADOS.
//   - `oficina-build.json`: o carimbo diz de propósito quando e como aquela saída nasceu.
//
// Uso:  node scripts/comparar_edicoes.mjs <pasta A> <pasta B>
// Saída: código 0 se equivalentes, 1 se não.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const [A, B] = process.argv.slice(2)
if (!A || !B) { console.error('uso: comparar_edicoes.mjs <A> <B>'); process.exit(2) }
const listar = raiz => {
  const out = []
  ;(function r(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) r(p); else out.push(path.relative(raiz, p).replace(/\\/g, '/'))
    }
  })(raiz)
  return out.sort()
}
const la = listar(A), lb = listar(B)
const sa = new Set(la), sb = new Set(lb)
const soA = la.filter(f => !sb.has(f)), soB = lb.filter(f => !sa.has(f))
const difere = [], mapas = [], ignorados = []
let asarOk = null

const requerer = createRequire(import.meta.url)
let asar = null
for (const p of [process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')]) {
  try { asar = requerer(path.join(p, 'vscode', 'build', 'node_modules', '@electron', 'asar')); break } catch { }
}

for (const f of la) {
  if (!sb.has(f)) continue
  if (f === 'oficina-build.json') { ignorados.push(f); continue }
  if (f.endsWith('.js.map')) { if (!fs.readFileSync(path.join(A, f)).equals(fs.readFileSync(path.join(B, f)))) mapas.push(f); continue }
  if (f.endsWith('node_modules.asar')) {
    if (!asar) { difere.push(f + ' (sem @electron/asar para comparar o conteudo)'); continue }
    const pa = path.join(A, f), pb = path.join(B, f)
    // Como CONJUNTO: a ordem da lista é justamente o que varia entre dois builds (primeira prova,
    // 25/09/2026 — a comparação por posição acusou "lista diferente" com os mesmos arquivos).
    const xa = asar.listPackage(pa).slice().sort(), xb = asar.listPackage(pb).slice().sort()
    let ok = xa.length === xb.length && xa.every((x, i) => x === xb[i])
    if (ok) {
      for (const x of xa) {
        const rel = x.replace(/^[\\/]/, '')
        let ca, cb
        try { ca = asar.extractFile(pa, rel); cb = asar.extractFile(pb, rel) } catch { continue } // pastas
        if (!ca.equals(cb)) { ok = false; difere.push(`${f} -> ${rel}`); break }
      }
    }
    asarOk = ok
    if (!ok && !difere.some(d => d.startsWith(f))) difere.push(f + ' (lista de arquivos diferente)')
    continue
  }
  const a = fs.statSync(path.join(A, f)), b = fs.statSync(path.join(B, f))
  if (a.size !== b.size || !fs.readFileSync(path.join(A, f)).equals(fs.readFileSync(path.join(B, f)))) difere.push(f)
}

console.log(`arquivos: ${la.length} / ${lb.length}`)
console.log(`so em A: ${soA.length ? soA.join(', ') : 'nenhum'}`)
console.log(`so em B: ${soB.length ? soB.join(', ') : 'nenhum'}`)
console.log(`asar pelo conteudo: ${asarOk === null ? 'nao havia' : asarOk ? 'IGUAL' : 'DIFERENTE'}`)
console.log(`mapas de codigo diferentes (fora da comparacao, declarado): ${mapas.length}`)
console.log(`DIFERENTES: ${difere.length}`)
for (const d of difere.slice(0, 40)) console.log('  ' + d)
const ok = !soA.length && !soB.length && !difere.length
console.log(JSON.stringify({ equivalentes: ok, diferentes: difere.length, soEmA: soA.length, soEmB: soB.length, mapas: mapas.length }))
process.exit(ok ? 0 : 1)
