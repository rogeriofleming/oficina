// Carimba a pasta de saída com o que ela É.
//
// ⚠️ Sem isto, NADA liga o executável ao build que acabou de rodar. A pasta de saída
// tem nome fixo (`VSCode-win32-x64`, do gulp do upstream) e recebe tanto o `--puro`
// quanto a OFICINA. Se um build falha antes do empacotamento, o binário ANTERIOR
// continua ali — e a fumaça seguinte roda nele e sai verde. Pior: o
// `subir_upstream.bat` grava a tag nova em `TAG.txt` confiando nessa fumaça, então
// o gate do coração 1 podia ser certificado com evidência de outro binário.
//
// Achado por uma revisao independente no ciclo da V0, em 05/09/2026.
//
// Uso: node scripts/carimbar_build.mjs <pasta de saida> <modo> <tag> <pasta do clone>

import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { edicaoDoProduto, pastaDeDados } from './edicao.mjs'

const [saida, modo, tag, clone] = process.argv.slice(2)
if (!saida || !modo || !tag) {
  console.error('uso: node scripts/carimbar_build.mjs <pasta de saida> <modo> <tag> [clone]')
  process.exit(2)
}
if (!existsSync(saida)) {
  console.error('nao achei a pasta de saida: ' + saida)
  process.exit(3)
}

let sha = ''
try {
  sha = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch { /* sem git, o carimbo sai sem sha e diz isso */ }

// ⛔ A EDIÇÃO é derivada do ARTEFATO, não do que quem chamou disse que estava fazendo.
//
// Uma revisão independente (12/09/2026) mostrou o buraco: `empacotar.bat --equipe` sobre uma
// pasta de saída que tem a build NEUTRA gerava um instalador com nome de equipe e **sem canal
// de atualização nenhum**, calado — e `liberar.bat --equipe` publicava isso no canal privado.
// A flag dizia uma coisa e o binário era outra, e nada comparava as duas.
//
// Quem só tem `updateUrl` é a camada privada (o produto genérico não traz esse campo de
// propósito). Guardamos o FATO (tem ou não tem), nunca o endereço.
function lerProdutoDoBuild(pasta) {
  try {
    return JSON.parse(readFileSync(join(pasta, 'resources', 'app', 'product.json'), 'utf8'))
  } catch {
    return null
  }
}

// O nome do produto vem do product.json que FOI PARA DENTRO do build — não do que
// está no repositório agora. É o que responde "este exe é de que produto?".
const p = lerProdutoDoBuild(saida)
const produto = p
  ? `${p.nameLong || '?'} / ${p.nameShort || '?'} / applicationName=${p.applicationName || '?'}`
  : '(nao consegui ler o product.json do build)'

// ⚠️ `temCanalDeUpdate` sai do product.json DO BUILD, que é o único lugar que não mente sobre
// o que o executável vai fazer. O `quality` também: é ele que decide meia dúzia de
// comportamentos do núcleo, e já houve uma versão em que ele saiu do valor esperado sem ninguém
// notar por 20 minutos de build.
const carimbo = {
  modo,                     // 'puro' (linha de base) ou 'oficina'
  tag,
  sha: sha || '(sem sha)',
  produto,
  edicao: p ? edicaoDoProduto(p) : '(indeterminada)',
  temCanalDeUpdate: p ? !!p.updateUrl : null,
  // A pasta de %APPDATA% desta edicao (patch 0015). Fica no carimbo pelo mesmo motivo que a edicao:
  // e a unica coisa que responde "este exe vai escrever ONDE?" sem abrir o programa. Se as duas
  // edicoes carimbarem a mesma pasta, elas dividem o `canal-privado.txt` - e `conferir_edicao.mjs`
  // recusa empacotar nesse estado.
  pastaDeDados: p ? pastaDeDados(p) : '(indeterminada)',
  quality: p ? (p.quality || '(sem quality)') : '(indeterminado)',
  quando: new Date().toISOString(),
  carimbadoPor: 'scripts/carimbar_build.mjs'
}

const destino = join(saida, 'oficina-build.json')
writeFileSync(destino, JSON.stringify(carimbo, null, 2))
console.log(`carimbo: modo=${modo} tag=${tag} sha=${(sha || '').slice(0, 12)} edicao=${carimbo.edicao} pastaDeDados=${carimbo.pastaDeDados} quality=${carimbo.quality} -> ${destino}`)
