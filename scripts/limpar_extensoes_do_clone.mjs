// Tira do clone as extensões que NÃO são do upstream.
//
// ## Por que existe (achado por revisor independente em 05/09/2026)
//
// O build começa com `git checkout -f` + `git reset --hard`, e todo mundo lê isso
// como "o clone voltou ao upstream". **Não voltou.** Os dois comandos governam apenas
// o que o git RASTREIA — e as extensões que nós copiamos para `<clone>/extensions/`
// nunca foram rastreadas por ele. Elas ficam lá para sempre.
//
// Medido no clone, com dois builds `--equipe` de diferença:
//
//     $ git status --porcelain extensions/
//     ?? extensions/medidor-tokens/
//     ?? extensions/oficina-claude/
//
// E o empacotamento enumera a pasta por vidro fosco — `build/lib/extensions.ts`
// varre `extensions/*/package.json` e leva o que estiver lá, rastreado ou não.
//
// **Três consequências, todas medidas:**
//
// 1. **`construir.bat --puro` embarcava as nossas extensões.** Pular o passo `[4/6]`
//    não desfaz o que a rodada anterior deixou no disco. A "linha de base" contra a
//    qual tudo neste projeto é comparado tinha deixado de ser o upstream.
// 2. **Um build sem `--equipe` embarcava a camada privada** (`medidor-tokens`), que é
//    da edição da equipe. A V8 publica instalador; isso sairia junto.
// 3. **Extensão nossa aposentada nunca saía.** Tirar a pasta de `extensoes/` não tira
//    do clone: o produto seguiria embarcando a versão velha, indefinidamente.
//
// É o irmão de sinal invertido da armadilha já conhecida ("`git reset --hard` não
// restaura `node_modules`"): a mesma causa — o git só governa o que rastreia.
//
// ⚠️ Por isso este script roda em TODOS os modos, `--puro` inclusive, e ANTES de
// copiar as extensões da rodada. Ele não é limpeza cosmética: é o que faz a linha de
// base ser a linha de base.
//
// ⚠️ E ele NÃO usa `git clean -xfd`, que resolveria isto numa linha e apagaria também
// `node_modules` e `.build` — matando o build incremental, que é caso-teste do
// projeto (está escrito no `construir.bat`, e continua valendo).
//
// Uso: node scripts/limpar_extensoes_do_clone.mjs <clone>

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const clone = process.argv[2]
if (!clone || !fs.existsSync(clone)) {
  console.log('uso: node scripts/limpar_extensoes_do_clone.mjs <clone>')
  process.exit(1)
}

const pastaExtensoes = path.join(clone, 'extensions')
if (!fs.existsSync(pastaExtensoes)) {
  console.log('ERRO: nao achei ' + pastaExtensoes)
  process.exit(1)
}

// A lista do que o upstream RASTREIA. É a única fonte de verdade sobre o que é dele:
// não dá para deduzir por nome, e a pasta no disco não sabe de quem é.
let rastreadas
try {
  const saida = execFileSync('git', ['-C', clone, 'ls-files', 'extensions/'], { encoding: 'utf8' })
  rastreadas = new Set(
    saida.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.split('/')[1])      // extensions/<nome>/...
      .filter(Boolean)
  )
} catch (e) {
  console.log('ERRO: nao consegui perguntar ao git o que e do upstream: ' + e.message)
  process.exit(1)
}

// ⚠️ Se a lista vier vazia, alguma coisa está errada com o clone — e apagar tudo
// seria a pior reação possível. Parar é a única resposta segura.
if (rastreadas.size === 0) {
  console.log('ERRO: o git nao listou extensao nenhuma como rastreada em ' + clone +
    '\nO clone parece quebrado. Nao vou apagar nada com base numa lista vazia.')
  process.exit(1)
}

// ⚠️ Nem toda pasta dentro de `extensions/` é uma extensão.
//
// `extensions/node_modules` é dependência do build — o `postinstall.ts` do upstream
// roda `npm install` dentro de `extensions/` como se fosse um pacote. Ela é
// gitignored, então NÃO aparece em `git ls-files` e a primeira versão deste script a
// tratou como órfã e apagou. Peguei porque testei antes de ligar no build; se tivesse
// confiado no código, o próximo build morreria em `npm list --production`, que é
// exatamente o sétimo bloqueio de hoje, de novo.
//
// A regra é por NOME, e curta de propósito: o que não é extensão aqui tem nome fixo.
const NAO_SAO_EXTENSAO = new Set(['node_modules'])

const noDisco = fs.readdirSync(pastaExtensoes, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(nome => !NAO_SAO_EXTENSAO.has(nome) && !nome.startsWith('.'))

const orfas = noDisco.filter(nome => !rastreadas.has(nome))

for (const nome of orfas) {
  fs.rmSync(path.join(pastaExtensoes, nome), { recursive: true, force: true })
  console.log(`  fora do clone: extensions/${nome}  (nao e do upstream)`)
}

// Conferir o resultado, e não confiar no que o laço acha que fez.
const aindaLa = fs.readdirSync(pastaExtensoes, { withFileTypes: true })
  .filter(d => d.isDirectory() && !NAO_SAO_EXTENSAO.has(d.name) && !d.name.startsWith('.'))
  .filter(d => !rastreadas.has(d.name))
  .map(d => d.name)
if (aindaLa.length) {
  console.log('ERRO: sobraram extensoes que nao sao do upstream: ' + aindaLa.join(', '))
  process.exit(1)
}

console.log(orfas.length === 0
  ? `  nenhuma extensao estranha no clone (${rastreadas.size} do upstream)`
  : `  ${orfas.length} removida(s); sobraram ${rastreadas.size} do upstream`)
