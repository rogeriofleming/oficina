// Confere se a EDIÇÃO que está compilada na pasta de saída é a que quem chamou pediu.
//
// ⛔ POR QUE ISTO EXISTE — achado de uma revisão independente em 12/09/2026:
// `empacotar.bat --equipe` não comparava nada. Rodado sobre uma pasta de saída que tinha a
// build NEUTRA, ele gerava um instalador com o nome da edição da equipe e **sem canal de
// atualização nenhum**, sem um aviso; e o passo seguinte publicava isso no canal privado. A
// flag dizia uma coisa, o binário era outra, e o erro só apareceria quando alguém reparasse que
// a máquina nunca atualiza — ou seja, possivelmente nunca.
//
// A edição não vem da flag: vem do `product.json` que FOI PARA DENTRO do build, lido pelo
// `carimbar_build.mjs` (campo `edicao` do `oficina-build.json`).
//
// Uso: node conferir_edicao.mjs <pasta de saida> <equipe|neutra>
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pastaDeDados } from './edicao.mjs'

const [saida, esperada] = process.argv.slice(2)
if (!saida || !['equipe', 'neutra'].includes(esperada || '')) {
	console.error('uso: node conferir_edicao.mjs <pasta de saida> <equipe|neutra>')
	process.exit(2)
}

const carimboPath = join(saida, 'oficina-build.json')
if (!existsSync(carimboPath)) {
	console.error(`ERRO: nao achei ${carimboPath}. A pasta de saida nao foi carimbada - sem isso`)
	console.error('ninguem responde de que build ela e. Rode construir.bat.')
	process.exit(3)
}

const carimbo = JSON.parse(readFileSync(carimboPath, 'utf8'))

if (carimbo.edicao === undefined || carimbo.edicao === '(indeterminada)') {
	console.error('ERRO: o carimbo nao diz a edicao (carimbo antigo, ou product.json do build')
	console.error('ilegivel). Reconstrua: a edicao e derivada do product.json que foi para dentro')
	console.error('do build, e nao da flag da linha de comando.')
	process.exit(4)
}

if (carimbo.edicao !== esperada) {
	console.error(`ERRO: voce pediu a edicao "${esperada}", mas o que esta compilado na pasta de`)
	console.error(`saida e a edicao "${carimbo.edicao}" (carimbada em ${carimbo.quando}).`)
	console.error('')
	console.error('Isto abortou de proposito. Seguir adiante geraria um instalador com o nome de uma')
	console.error('edicao e o conteudo da outra - inclusive, no caso da equipe, um instalador SEM')
	console.error('canal de atualizacao, que so se descobre quando a maquina nunca atualiza.')
	console.error('')
	console.error(esperada === 'equipe'
		? 'Rode: construir.bat --equipe  (e depois empacotar.bat --equipe)'
		: 'Rode: construir.bat           (e depois empacotar.bat)')
	process.exit(5)
}

// ⛔ E A PASTA DE DADOS? O carimbo diz uma coisa; quem manda e o product.json que foi para DENTRO do
// build. Se as duas discordarem, o carimbo esta mentindo sobre onde este exe vai escrever - e e a
// pasta onde o `canal-privado.txt` mora (patch 0015). Conferido no artefato, como a edicao.
const produtoDoBuild = (() => {
	try { return JSON.parse(readFileSync(join(saida, 'resources', 'app', 'product.json'), 'utf8')) } catch { return null }
})()
const pastaNoProduto = pastaDeDados(produtoDoBuild)
if (!carimbo.pastaDeDados || carimbo.pastaDeDados === '(indeterminada)') {
	console.error('ERRO: o carimbo nao diz a pasta de dados desta edicao (carimbo antigo). Reconstrua.')
	process.exit(6)
}
if (!pastaNoProduto) {
	console.error('ERRO: nao consegui ler a pasta de dados do product.json que foi para dentro do build.')
	console.error('Sem isso ninguem responde onde este exe vai escrever - inclusive o segredo do canal.')
	process.exit(7)
}
if (carimbo.pastaDeDados !== pastaNoProduto) {
	console.error(`ERRO: o carimbo diz que a pasta de dados e "${carimbo.pastaDeDados}", mas o product.json`)
	console.error(`que esta dentro do build diz "${pastaNoProduto}". Um dos dois esta velho; reconstrua.`)
	process.exit(8)
}

console.log(`edicao confere: ${carimbo.edicao} (carimbo de ${carimbo.quando}, quality=${carimbo.quality || '?'}, pasta de dados %APPDATA%\\${pastaNoProduto})`)
