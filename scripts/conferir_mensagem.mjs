#!/usr/bin/env node
// A MENSAGEM DO COMMIT passa pelas mesmas regras que os arquivos.
//
// ⚠️ POR QUE ISTO EXISTE (12/09/2026). A varredura de vazamento lê os ARQUIVOS da árvore.
// A mensagem do commit não é um arquivo — e ninguém a olhava. Resultado medido: um commit
// entrou com o caminho de uma máquina no texto da mensagem, e ficou na história. A árvore
// estava limpa o tempo todo; o varredor dizia "0 achados" e estava certo sobre o que ele vê.
//
// A mensagem é pior que o arquivo, porque arquivo se conserta com uma edição e mensagem só
// se conserta reescrevendo a história — que é destrutivo e é decisão do dono do projeto.
// Por isso a conferência tem de ser ANTES, e não numa regressão que roda depois.
//
// Uso:
//   node scripts/conferir_mensagem.mjs <arquivo>     confere o texto de um arquivo (é o que o
//                                                    gancho `commit-msg` do git entrega)
//   node scripts/conferir_mensagem.mjs --commit <sha>  confere a mensagem de um commit já feito
//   ... | node scripts/conferir_mensagem.mjs          confere o que vier pela entrada padrão
//
// Sai 0 se estiver limpa; 1 com a lista do que casou.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { conferirTexto } from './vazamento.mjs'

const args = process.argv.slice(2)
let texto = ''
let de = ''

if (args[0] === '--commit') {
  const sha = args[1]
  if (!sha) { console.error('uso: --commit <sha>'); process.exit(2) }
  texto = execFileSync('git', ['log', '-1', '--format=%B', sha], { encoding: 'utf8' })
  de = `a mensagem do commit ${sha}`
} else if (args[0] && args[0] !== '-') {
  texto = fs.readFileSync(args[0], 'utf8')
  de = `a mensagem em ${args[0]}`
} else {
  texto = fs.readFileSync(0, 'utf8')
  de = 'a mensagem recebida'
}

// ⚠️ As linhas que o git já ignora não contam: o modelo de mensagem dele começa com um
// bloco de comentários que fala do repositório, e acusá-lo seria alarme permanente.
const limpo = texto.split('\n').filter(l => !l.startsWith('#')).join('\n')

const achados = conferirTexto(limpo)
if (!achados.length) {
  console.log(`ok: ${de} não casou com nenhuma regra (${JSON.stringify({ limpo: true, achados: 0 })})`)
  process.exit(0)
}
console.error(`RECUSADA: ${de} casou com ${achados.length} regra(s):`)
for (const a of achados) console.error('  - ' + a)
console.error('')
console.error('Mensagem de commit vira HISTORIA: consertar depois exige reescrever o historico,')
console.error('que e destrutivo e e decisao do dono do projeto. Reescreva a mensagem agora.')
process.exit(1)
