// VIRAR EQUIPE — transforma a saída de um build NEUTRO na edição EQUIPE, sem compilar de novo.
//
// ⚠️ POR QUE ISTO EXISTE (25/09/2026). Cada edição custava um build inteiro (~20 min + empacotar),
// porque o núcleo copia o `product.json` para DENTRO do código compilado. Medido comparando duas
// instalações do mesmo build: a diferença entre as edições é o produto mesclado (hoje, duas chaves:
// `updateUrl` entra, `userDataFolderName` muda), os `checksums` que o `product.json` guarda dos
// arquivos principais, e os arquivos da camada privada (a marca). Tirando isso, byte a byte igual.
// Então a edição equipe pode sair da neutra: trocar o produto embutido, recalcular os checksums,
// copiar a camada, carimbar. E o empacotamento continua o de sempre.
//
// ⚠️ ESTRITO DE PROPÓSITO. Só sabe fazer duas coisas com o produto: ACRESCENTAR chave de texto
// (entra antes de `version:"`, que é onde o build a deixa) e TROCAR valor de texto de chave que
// já existe. Qualquer outra diferença entre as edições (número, objeto, chave removida) ABORTA:
// seria um caso novo, e o caminho seguro é o build. Toda substituição tem de acontecer EXATAMENTE
// uma vez por arquivo; zero ou duas abortam.
//
// Uso:  node scripts/virar_equipe.mjs <pasta de saída do build> <repo> <camada privada>
// A saída tem de ser de um build NEUTRO (carimbo `edicao: neutra`). Ela é alterada no lugar.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { edicaoDoProduto, aplicarBlocoDaEdicao } from './edicao.mjs'

const [saida, repo, camada] = process.argv.slice(2)
const parar = m => { console.error('ERRO: ' + m); process.exit(1) }
if (!saida || !repo || !camada) parar('uso: virar_equipe.mjs <saida> <repo> <camada>')

const app = path.join(saida, 'resources', 'app')
const arqProduto = path.join(app, 'product.json')
const arqCarimbo = path.join(saida, 'oficina-build.json')
for (const f of [arqProduto, arqCarimbo]) if (!fs.existsSync(f)) parar('falta ' + f)

const carimbo = JSON.parse(fs.readFileSync(arqCarimbo, 'utf8'))
const textoProduto = fs.readFileSync(arqProduto, 'utf8')
const neutro = JSON.parse(textoProduto)
if (carimbo.edicao !== 'neutra' || edicaoDoProduto(neutro) !== 'neutra') parar(`a saida nao e neutra (carimbo: ${carimbo.edicao})`)

// 1. O produto da equipe, pela MESMA regra do build (aplicar_produto.mjs): camada privada por cima,
//    depois o bloco `__equipe` do produto do repositório, sem sobrescrever o que a camada disse.
const over = JSON.parse(fs.readFileSync(path.join(camada, 'product.override.json'), 'utf8'))
if (over.__remover) parar('a camada remove chaves (__remover): caso nao coberto, use o build')
const equipe = { ...neutro, ...over }
const blocoDaEquipe = JSON.parse(fs.readFileSync(path.join(repo, 'produto', 'product.json'), 'utf8')).__equipe || null
aplicarBlocoDaEdicao(equipe, blocoDaEquipe, Object.keys(over))
if (edicaoDoProduto(equipe) !== 'equipe') parar('a camada nao produz a edicao equipe (sem updateUrl)')

const mudancas = []
for (const k of Object.keys(equipe)) {
  if (JSON.stringify(equipe[k]) === JSON.stringify(neutro[k])) continue
  if (typeof equipe[k] !== 'string' || (k in neutro && typeof neutro[k] !== 'string')) parar(`a chave ${k} muda para algo que nao e texto: caso nao coberto, use o build`)
  mudancas.push({ chave: k, de: k in neutro ? neutro[k] : null, para: equipe[k] })
}
for (const k of Object.keys(neutro)) if (!(k in equipe)) parar(`a chave ${k} some na equipe: caso nao coberto, use o build`)
if (!mudancas.length) parar('nenhuma diferenca entre as edicoes — nada a fazer?')
console.log('mudancas no produto: ' + mudancas.map(m => `${m.chave}${m.de === null ? ' (nova)' : ''}`).join(', '))

// 1b. A conta dos checksums (a do build, gulpfile.vscode.ts: sha256, base64, sem `=`) tem de
//     REPRODUZIR os da saída neutra ANTES de qualquer arquivo mudar — senão a conta não é a do build
//     e o programa acusaria "instalação corrompida".
const soma = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(app, 'out', f))).digest('base64').replace(/=+$/, '')
const listaDeChecksums = Object.entries(neutro.checksums || {})
if (!listaDeChecksums.length) parar('a saida neutra nao tem checksums no product.json')
for (const [f, v] of listaDeChecksums) if (soma(f) !== v) parar(`checksum de ${f} nao reproduz o do build — a conta nao e a dele`)
console.log(`conta dos checksums conferida contra a saida neutra (${listaDeChecksums.length} arquivos)`)

// 2. O produto EMBUTIDO no código compilado: literal de objeto minificado (`chave:"valor"`). Acha-se
//    pelos arquivos que carregam o `commit:"<sha>",date:"` do build, que só existe ali.
const ancora = `version:"${neutro.version}",commit:"${neutro.commit}",date:"${neutro.date}"`
const lit = v => JSON.stringify(v)
const js = []
;(function varrer(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'extensions') varrer(p) }
    else if (e.name.endsWith('.js')) js.push(p)
  }
})(path.join(app, 'out'))
const tocados = []
for (const f of js) {
  let s = fs.readFileSync(f, 'utf8')
  const n = s.split(ancora).length - 1
  if (n === 0) continue
  if (n !== 1) parar(`${path.relative(app, f)}: o produto embutido aparece ${n} vezes`)
  for (const m of mudancas) {
    if (m.de === null) {
      s = s.replace(ancora, `${m.chave}:${lit(m.para)},${ancora}`)
    } else {
      const antes = `${m.chave}:${lit(m.de)}`
      const c = s.split(antes).length - 1
      if (c !== 1) parar(`${path.relative(app, f)}: "${antes}" aparece ${c} vezes (esperado 1)`)
      s = s.replace(antes, `${m.chave}:${lit(m.para)}`)
    }
  }
  fs.writeFileSync(f, s, 'utf8')
  tocados.push(path.relative(app, f).replace(/\\/g, '/'))
}
if (!tocados.length) parar('nenhum arquivo compilado carrega o produto — a ancora mudou?')
console.log(`produto embutido trocado em ${tocados.length} arquivo(s): ${tocados.join(', ')}`)

// 3. O `product.json` em disco, editado como TEXTO. Reescrever com `JSON.stringify` mudava o formato
//    (o build grava `[{` na mesma linha) — medido na primeira prova, 25/09/2026. Chave nova entra antes
//    de `"commit"`, a primeira que o build carimba no arquivo (no código compilado é antes de `version:`).
const trocarUmaVez = (texto, de, para, onde) => {
  const c = texto.split(de).length - 1
  if (c !== 1) parar(`${onde}: "${de.slice(0, 80)}" aparece ${c} vezes (esperado 1)`)
  return texto.replace(de, para)
}
let novo = textoProduto
const quebra = textoProduto.includes('\r\n') ? '\r\n' : '\n'
const recuo = (textoProduto.match(/\n([\t ]+)"/) || [null, '\t'])[1]
for (const m of mudancas) {
  if (m.de === null) {
    const ancoraCommit = `${quebra}${recuo}"commit":`
    novo = trocarUmaVez(novo, ancoraCommit, `${quebra}${recuo}${JSON.stringify(m.chave)}: ${JSON.stringify(m.para)},${ancoraCommit}`, 'product.json')
  } else {
    novo = trocarUmaVez(novo, `${JSON.stringify(m.chave)}: ${JSON.stringify(m.de)}`, `${JSON.stringify(m.chave)}: ${JSON.stringify(m.para)}`, 'product.json')
  }
}
// 4. Os checksums dos arquivos, agora com o produto trocado — cada valor trocado no próprio lugar.
let recalculados = 0
for (const [f, velho] of listaDeChecksums) {
  const atual = soma(f)
  if (atual !== velho) { novo = trocarUmaVez(novo, JSON.stringify(velho), JSON.stringify(atual), 'product.json (checksum de ' + f + ')'); recalculados++ }
}
// Conferência: o texto novo tem de ser o produto da equipe, com os checksums atuais.
const conferido = JSON.parse(novo)
for (const k of Object.keys(equipe)) if (k !== 'checksums' && JSON.stringify(conferido[k]) !== JSON.stringify(equipe[k])) parar('product.json reescrito nao bate na chave ' + k)
for (const [f] of listaDeChecksums) if (conferido.checksums[f] !== soma(f)) parar('checksum de ' + f + ' nao bate depois da troca')
fs.writeFileSync(arqProduto, novo, 'utf8')
console.log(`product.json editado; checksums trocados: ${recalculados} de ${listaDeChecksums.length}`)

// 5. A camada privada: os arquivos dela por cima das extensões, como o `copiar_extensoes.mjs` faz.
const extCamada = path.join(camada, 'extensoes')
let copiados = 0
if (fs.existsSync(extCamada)) {
  ;(function copiar(de, para) {
    for (const e of fs.readdirSync(de, { withFileTypes: true })) {
      const a = path.join(de, e.name), b = path.join(para, e.name)
      if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copiar(a, b) }
      else { fs.copyFileSync(a, b); copiados++ }
    }
  })(extCamada, path.join(app, 'extensions'))
}
console.log(`camada privada: ${copiados} arquivo(s) copiado(s)`)

// 6. O carimbo diz a verdade: equipe, derivada da neutra por este script.
carimbo.edicao = 'equipe'
carimbo.temCanalDeUpdate = true
carimbo.pastaDeDados = equipe.userDataFolderName || carimbo.pastaDeDados
carimbo.derivadaDaNeutra = 'scripts/virar_equipe.mjs'
fs.writeFileSync(arqCarimbo, JSON.stringify(carimbo, null, 2) + '\n', 'utf8')
console.log('VIRADA OK: a saida agora e a edicao equipe')
