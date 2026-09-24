// Calcula o sha256 de um arquivo e grava um ".sha256.json" ao lado.
//
// Por que existe: o manifesto de update (5 campos do IUpdate — ver
// src/vs/platform/update/common/update.ts no nucleo) exige "sha256hash" - e ele tem que
// ser o hash do ARQUIVO QUE REALMENTE SAIU do empacotamento, nunca um valor copiado de
// outra rodada. empacotar.bat chama isto logo depois de copiar o instalador para dist\, e
// liberar.bat le o .sha256.json (nunca recalcula por conta propria, para os dois nunca
// discordarem).
//
// Uso: node gerar_sha256.mjs <arquivo>
import { createHash } from 'node:crypto'
import { createReadStream, statSync, writeFileSync } from 'node:fs'

const [arquivo] = process.argv.slice(2)
if (!arquivo) {
  console.error('uso: node gerar_sha256.mjs <arquivo>')
  process.exit(2)
}

const tamanho = statSync(arquivo).size
const hash = createHash('sha256')
const fluxo = createReadStream(arquivo)

fluxo.on('data', (pedaco) => hash.update(pedaco))
fluxo.on('error', (e) => { console.error('erro lendo o arquivo: ' + e.message); process.exit(3) })
fluxo.on('end', () => {
  const sha256 = hash.digest('hex')
  const saida = {
    arquivo: arquivo.replace(/\\/g, '/').split('/').pop(),
    tamanho,
    sha256,
    calculadoEm: new Date().toISOString()
  }
  writeFileSync(arquivo + '.sha256.json', JSON.stringify(saida, null, 2))
  console.log(`sha256=${sha256} tamanho=${tamanho} -> ${arquivo}.sha256.json`)
})
