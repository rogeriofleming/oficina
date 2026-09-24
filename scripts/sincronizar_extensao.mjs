// Copia a extensão do REPOSITÓRIO para dentro de um executável já compilado.
//
// ⚠️ POR QUE ISTO EXISTE. O build completo leva horas; entre um checkpoint e outro, o executável de
// teste é um HÍBRIDO — o build da última vez com a extensão de agora copiada por cima. Isso é
// legítimo (e está declarado no registro do projeto), mas a cópia à mão já custou caro:
//
//   ⚠️ NUNCA monte o caminho do executável dentro de um `node -e`. Já aconteceu neste projeto: uma
//   barra invertida a mais foi comida entre o shell e o JS, e o caminho da pasta de build virou um
//   caminho RELATIVO AO DRIVE. A cópia foi parar noutra pasta, o critério de sincronia conferiu
//   essa pasta e devolveu `[]` — verde falso, com o executável rodando a extensão de três horas
//   antes. Aqui o caminho sai do `acharExe()`, e o resultado é PROVADO pelo mesmo critério que a
//   regressão usa.
//
// ⚠️ Copia o que o GIT RASTREIA — arquivo novo precisa de `git add` antes, senão ele não viaja (e o
// critério de sincronia vai acusar a falta, que é o comportamento certo).
//
// Uso: node scripts/sincronizar_extensao.mjs [caminho do exe]   (OFICINA_BUILD no ambiente)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { acharExe, extensaoForaDeSincronia } from '../testes/comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const exe = acharExe(process.argv[2])
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ ok: false, erro: 'nao achei o executavel compilado' }))
  process.exit(1)
}

const copiadas = []
for (const pasta of ['oficina-claude', 'oficina-temas']) {
  const origem = path.join(REPO, 'extensoes', pasta)
  if (!fs.existsSync(origem)) continue
  const destino = path.join(path.dirname(exe), 'resources', 'app', 'extensions', pasta)
  if (!fs.existsSync(destino)) { console.log(`pulando ${pasta}: não está dentro do executável`); continue }
  const rastreados = execFileSync('git', ['-C', REPO, 'ls-files', `extensoes/${pasta}`], { encoding: 'utf8' })
    .split('\n').map(l => l.trim()).filter(Boolean)
  let n = 0
  for (const rel of rastreados) {
    const sub = rel.slice(`extensoes/${pasta}/`.length)
    const de = path.join(origem, sub)
    const para = path.join(destino, sub)
    if (!fs.existsSync(de)) continue
    fs.mkdirSync(path.dirname(para), { recursive: true })
    fs.copyFileSync(de, para)
    n++
  }
  copiadas.push({ pasta, arquivos: n, destino })
}

// A prova: o mesmo critério da regressão, contra o executável de verdade.
const fora = extensaoForaDeSincronia(exe, REPO)
console.log(JSON.stringify({ ok: fora.length === 0, exe, copiadas, fora }, null, 2))
process.exit(fora.length === 0 ? 0 : 1)
