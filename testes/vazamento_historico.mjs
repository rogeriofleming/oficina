// O CONTEUDO do historico — a metade do criterio 14 que nunca foi varrida.
//
// A regressao confere os arquivos que o git rastreia HOJE (`git ls-files`) e, do
// historico, apenas o autor e a mensagem dos commits. Falta a parte mais perigosa: o
// CONTEUDO dos arquivos como eles foram em cada commit.
//
// O cenario que isto pega, e que nenhum outro criterio pegava: alguem comita um `.env`,
// um log com caminho de maquina, um dump com nome de pessoa — percebe, apaga no commit
// seguinte, e fica tranquilo. O arquivo sumiu do `ls-files`; o BLOB continua no
// repositorio para sempre e vai junto no `git clone`. Apagar depois nao desfaz nada.
//
// ⚠️ `git log --name-only` NAO serve para isto — ele omite os arquivos dos commits de
// MERGE, e por causa disso esta casa ja afirmou que um arquivo "nunca tinha sido
// commitado" quando ele entrara por um merge. Quem enxerga a historia inteira e
// `git rev-list --all --objects`.
//
// Uso:  node testes/vazamento_historico.mjs [caminho do repositorio]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

import { conferirTexto } from '../scripts/vazamento.mjs'

const REPO = process.argv[2] || path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// O arquivo que DEFINE as regras contem os padroes por definicao — no historico
// tambem. E o unico ponto cego, e ele so pode conter regras.
// ⚠️ Vem de scripts/vazamento.mjs, e nao de uma copia local.
//
// Este arquivo tinha a propria constante, e a lista de binarios daqui tinha `.svg`
// enquanto a da regressao nao tinha -- foi essa divergencia que deixou o criterio 14
// vermelho por semanas sem ninguem ver. Duas copias da mesma verdade divergem; a
// pergunta nao e "se", e "quando".
import { ehArquivoDoDetector, EXTENSOES_BINARIAS } from '../scripts/vazamento.mjs'

// Binario nao se le como texto, e um `.png` grande so gastaria tempo.
// A lista mora em scripts/vazamento.mjs — ver o porque de nao haver copia aqui.
const BINARIO = EXTENSOES_BINARIAS

const t0 = Date.now()

let objetos
try {
  objetos = execFileSync('git', ['-C', REPO, 'rev-list', '--all', '--objects'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
} catch (e) {
  console.log(JSON.stringify({ passou: false, erro: 'nao consegui listar o historico: ' + String(e).split('\n')[0] }))
  process.exit(1)
}

// Cada linha e "<sha> <caminho>"; commits e arvores vem sem caminho.
const candidatos = []
const vistos = new Set()
for (const linha of objetos.split('\n')) {
  const esp = linha.indexOf(' ')
  if (esp < 0) continue
  const sha = linha.slice(0, esp)
  const arquivo = linha.slice(esp + 1).trim()
  if (!arquivo || BINARIO.test(arquivo)) continue
  if (ehArquivoDoDetector(arquivo)) continue
  if (vistos.has(sha)) continue   // o mesmo blob aparece em cada commit que o manteve
  vistos.add(sha)
  candidatos.push({ sha, arquivo })
}

// `cat-file --batch` numa chamada so: abrir um processo por blob levaria minutos num
// historico de algumas centenas de commits.
// ⚠️ Sem `encoding`: a saida tem que vir como Buffer. O cabecalho de cada blob declara
// o tamanho em BYTES, e so da para avancar pelo lote contando bytes — pedir string aqui
// desalinha a leitura no primeiro acento, que num repositorio em portugues chega cedo.
const entrada = Buffer.from(candidatos.map(c => c.sha).join('\n') + '\n', 'utf8')
const lote = spawnSync('git', ['-C', REPO, 'cat-file', '--batch'],
  { input: entrada, maxBuffer: 512 * 1024 * 1024 })
if (lote.status !== 0) {
  console.log(JSON.stringify({ passou: false, erro: 'git cat-file --batch falhou' }))
  process.exit(1)
}

// A saida e "<sha> <tipo> <tamanho>\n<conteudo>\n" repetido. Percorrida por BYTES: o
// tamanho no cabecalho conta bytes, e ler como texto desalinharia tudo no primeiro
// acento — que num repositorio em portugues e a primeira linha.
const buf = lote.stdout
const porSha = new Map(candidatos.map(c => [c.sha, c.arquivo]))
const achados = []
let lidos = 0
let pos = 0
while (pos < buf.length) {
  const fimCabecalho = buf.indexOf('\n', pos)
  if (fimCabecalho < 0) break
  const cabecalho = buf.toString('utf8', pos, fimCabecalho).trim().split(' ')
  const [sha, tipo, tamanhoTxt] = cabecalho
  if (tipo !== 'blob') { pos = fimCabecalho + 1; continue }
  const tamanho = parseInt(tamanhoTxt, 10)
  const inicio = fimCabecalho + 1
  const conteudo = buf.toString('utf8', inicio, inicio + tamanho)
  pos = inicio + tamanho + 1
  lidos++
  const arquivo = porSha.get(sha) || '(desconhecido)'
  for (const oque of conferirTexto(conteudo)) {
    achados.push(`${sha.slice(0, 8)} ${arquivo}: ${oque}`)
  }
}

// ⚠️ A LINHA DE BASE — o que ja estava no historico quando foi medido.
//
// Limpar o historico exige reescreve-lo, e isso e decisao do dono do projeto. Enquanto
// ela nao vem, este criterio fica vermelho — e um vermelho que nao se conserta sem
// decisao esconde qualquer vazamento NOVO do mesmo tipo atras dele. A revisao final da
// V2 achou exatamente isso nas mensagens de commit, e aqui era igual: 13 achados na V1,
// 74 na V2, e a diferenca nao aparecia porque o criterio ja estava vermelho antes.
//
// Entao o resultado sai em duas listas: os blobs que ja estavam acusados quando foram
// medidos (so saem reescrevendo) e os NOVOS (tem que ser zero, sempre). O arquivo da
// linha de base e o ESCOPO da decisao pendente, nao isencao — os herdados continuam
// acusados, contados a parte.
//
// Formato do arquivo: uma linha por blob, com os 8 primeiros caracteres do SHA. Linha
// que nao seja exatamente isso e ignorada, inclusive as de explicacao no topo. Nao ha
// sintaxe de comentario para errar: ha so o formato do SHA.
const ARQUIVO_DA_BASE = path.join(REPO, 'testes', 'historico_ja_medido.txt')
let base = new Set()
try {
  base = new Set(fs.readFileSync(ARQUIVO_DA_BASE, 'utf8').split(/\r?\n/)
    .map(l => l.trim()).filter(l => /^[0-9a-f]{8}$/.test(l)))
} catch { /* sem arquivo, tudo e novo — que e o lado seguro */ }
const herdados = achados.filter(a => base.has(a.slice(0, 8)))
const novos = achados.filter(a => !base.has(a.slice(0, 8)))
const existentes = new Set(candidatos.map(c => c.sha.slice(0, 8)))
const sumidosDaBase = [...base].filter(s => !existentes.has(s))

const segundos = +((Date.now() - t0) / 1000).toFixed(1)
const passou = achados.length === 0

// ⚠️ `lidos` e o numero de blobs, e nao `candidatos`. O `rev-list --objects` da caminho
// tambem para ARVORES (e para tags anotadas), e elas entram na lista de candidatos e sao
// puladas no `cat-file`. Ate 10/09/2026 esta linha chamava os candidatos de "blobs de
// texto" — medido naquele dia: 530 candidatos, 327 blobs, e o resto era 202 arvores e 1
// tag. Nao havia blob sem ler; havia um numero dizendo que media outra coisa.
console.log(`historico: ${lidos} blob(s) de texto lido(s) — de ${candidatos.length} objeto(s) ` +
  `com caminho; arvores e tags entram nessa lista e sao puladas — ${segundos}s`)
if (novos.length) {
  console.log(`\nNOVOS — ${novos.length} achado(s) em blob que nao estava na linha de base ` +
    '(o blob continua no repositorio mesmo que o arquivo tenha sido apagado depois):')
  for (const a of novos.slice(0, 20)) console.log('  - ' + a)
  if (novos.length > 20) console.log(`  ... e mais ${novos.length - 20}`)
}
if (herdados.length) {
  console.log(`\nHERDADOS — ${herdados.length} achado(s) em blobs ja medidos, sob a decisao de ` +
    'reescrever o historico.')
}
if (sumidosDaBase.length) {
  console.log(`\nnota: ${sumidosDaBase.length} SHA(s) da linha de base nao existem mais no historico — ` +
    'se ele foi reescrito, enxugar o arquivo.')
}
if (!passou) {
  console.log('\n⚠️ Apagar o arquivo agora NAO resolve: o historico viaja no clone. ' +
    'Limpar exige reescrever a historia, que e destrutivo e e decisao do dono do projeto.')
}
console.log('\n' + JSON.stringify({
  passou,
  blobs: lidos,
  objetosComCaminho: candidatos.length,
  segundos,
  achados: achados.length,
  novos: novos.length,
  herdados: herdados.length,
  listaNovos: novos,
  oQueIstoMede: 'o conteudo de cada versao de cada arquivo que ja existiu — nao so o estado de hoje'
}))
process.exit(passou ? 0 : 1)
