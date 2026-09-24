// VARRE o repositório procurando o que não pode ser publicado — e DIZ o que achou.
//
// ⚠️ POR QUE ESTE ARQUIVO PRECISOU EXISTIR (12/09/2026).
//
// `scripts/vazamento.mjs` é um módulo de REGRAS: ele exporta a lista de padrões e a função
// que confere um texto. Não varre nada, e não tem como varrer — não é o trabalho dele.
//
// Só que a instrução escrita em mais de um lugar era *"conferir antes de commitar, com
// `scripts/vazamento.mjs`"*. Quem obedece ao pé da letra roda `node scripts/vazamento.mjs`,
// vê **saída vazia e código de saída 0**, e conclui que está limpo. Ele sai 0 SEMPRE —
// inclusive com vazamento em cima da mesa.
//
// Foi o que aconteceu nesta data: rodei o comando, li o silêncio como aprovação e commitei
// dois vazamentos — um caminho desta máquina num comentário e uma palavra do vocabulário
// interno dentro de um teste. Quem os achou foi a regressão inteira, minutos depois, e só
// porque o critério 14 faz a varredura por conta própria.
//
// É o mesmo defeito que a versão das conversas achou em outro lugar no mesmo dia: um
// instrumento que fica calado quando não tem o que dizer é indistinguível de um instrumento
// que fica calado porque não mediu nada. Aqui o silêncio é quebrado: este arquivo sempre
// diz quantos arquivos leu.
//
// Uso:  node scripts/varrer_vazamento.mjs
//       (saída 1 se achou alguma coisa — serve em gancho de commit)

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { conferirTexto, ehArquivoDoDetector, EXTENSOES_BINARIAS } from './vazamento.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// ⚠️ O que se publica é o que o GIT RASTREIA — nunca a pasta. Varrer o disco acusaria
// arquivo que o `.gitignore` já tira (e deixaria o alarme tocando à toa), e deixaria de
// fora nada. A contrapartida, que é a armadilha do dia: arquivo NOVO ainda não adicionado
// ao git não é varrido — por isso a contagem de não rastreados aparece no fim.
const rastreados = execFileSync('git', ['-C', REPO, 'ls-files'], { encoding: 'utf8' })
  .split('\n').map(l => l.trim()).filter(Boolean)

const achados = []
let lidos = 0
for (const rel of rastreados) {
  if (EXTENSOES_BINARIAS.test(rel)) continue
  // O arquivo que DEFINE as regras contém, por natureza, exemplos de tudo que elas pegam.
  if (ehArquivoDoDetector(rel)) continue
  let txt
  try { txt = fs.readFileSync(path.join(REPO, rel), 'utf8') } catch { continue }
  lidos++
  for (const oque of conferirTexto(txt)) achados.push(`${rel}: ${oque}`)
}

for (const a of achados) console.log('  VAZA  ' + a)

// ⚠️ O aviso que fecha o buraco pelo qual isto tudo passou: arquivo de código que o git
// ainda não conhece NÃO foi varrido — e é justamente o arquivo recém-escrito que tem mais
// chance de trazer um caminho de máquina colado de um terminal.
const novos = execFileSync('git', ['-C', REPO, 'ls-files', '--others', '--exclude-standard'],
  { encoding: 'utf8' }).split('\n').map(l => l.trim()).filter(Boolean)
  .filter(f => !EXTENSOES_BINARIAS.test(f))

/*
  ⚠️ O ARQUIVO NOVO TAMBEM E VARRIDO — nao apenas contado.

  A primeira versao deste script so AVISAVA que havia arquivo nao rastreado, e saia 0. Ou seja:
  usado como gancho automatico (que olha o codigo de saida, nao o texto), um arquivo recem-escrito
  com vazamento passava limpo — exatamente o cenario que motivou o script a existir, e exatamente o
  arquivo com mais chance de trazer um caminho colado de um terminal.
  Achado por uma revisao independente em 12/09/2026.

  Agora eles sao lidos como os outros. O aviso continua, porque nao ser rastreado tambem significa
  nao ir para o build — mas ele deixou de ser a unica coisa que acontece.
*/
const achadosNovos = []
for (const rel of novos) {
  if (ehArquivoDoDetector(rel)) continue
  let txt
  try { txt = fs.readFileSync(path.join(REPO, rel), 'utf8') } catch { continue }
  lidos++
  for (const oque of conferirTexto(txt)) achadosNovos.push(`${rel}: ${oque} [ainda nao rastreado]`)
}
for (const a of achadosNovos) console.log('  VAZA  ' + a)

if (novos.length) {
  console.log('')
  console.log(`  ⚠️  ${novos.length} arquivo(s) ainda NAO rastreado(s) — varridos aqui, mas fora do build:`)
  for (const n of novos.slice(0, 20)) console.log('       ' + n)
  if (novos.length > 20) console.log(`       (e mais ${novos.length - 20})`)
  console.log('       Adicione ao git (`git add`): sem isso eles nao vao para o executavel, e a')
  console.log('       extensao pode morrer na ativacao por falta de um modulo que ela exige.')
}

const total = achados.length + achadosNovos.length
console.log('')
console.log(JSON.stringify({
  limpo: total === 0,
  arquivosLidos: lidos,
  achados: total,
  achadosEmNaoRastreados: achadosNovos.length,
  naoRastreados: novos.length,
}))
process.exit(total ? 1 : 0)
