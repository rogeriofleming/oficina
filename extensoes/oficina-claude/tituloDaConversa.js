// O NOME DA CONVERSA — o que a pessoa escreveu quando renomeou (V20, t196).
//
// ⚠️ POR QUE ESTE ARQUIVO PRECISOU EXISTIR, E O ERRO QUE ELE CONSERTA.
//
// A primeira versão do mostrador da barra tirava o nome do registro de sessões
// (`~/.claude/sessions/<pid>.json`, campo `name`). Só que ali o nome quase sempre é DERIVADO da
// pasta (`nameSource: 'derived'`) — e, como derivado não serve para anunciar como título, o nome
// simplesmente nunca aparecia. Eu cheguei a escrever isso como "limitação declarada". Estava
// errado: ele renomeia a conversa, e o nome que ele deu TEM de aparecer. Não era limitação, era
// trabalho meu inacabado.
//
// ⚠️ ONDE O NOME MORA DE VERDADE — medido no pacote da extensão oficial e nos arquivos desta
// máquina. O comando de renomear dela grava no TRANSCRITO, não no registro de sessões (o código
// dela lê `sessionTitleOnDisk` e avisa "no readable transcript" quando não consegue). No arquivo,
// o nome é uma linha própria:
//
//   {"type":"ai-title","aiTitle":"<o nome>","sessionId":"<id>"}
//
// Renomear ACRESCENTA outra linha dessas; por isso vale a ÚLTIMA, não a primeira.
//
// ⚠️ E A LEITURA É PELA CAUDA. Arquivo de conversa longa passa de dezenas de MB, e este módulo é
// consultado de poucos em poucos segundos. Ler tudo a cada vez seria pagar o arquivo inteiro para
// buscar uma linha curta. A cauda resolve o caso comum (renomear grava no fim); quando não acha, há
// UMA varredura completa por arquivo, guardada em cache, para o caso do título antigo lá no começo.

'use strict'

const fs = require('fs')

/** Quanto se lê do fim do arquivo na primeira tentativa. */
const CAUDA_BYTES = 256 * 1024

const MARCA = '"type":"ai-title"'

/**
 * O nome dentro de um pedaço de texto: a ÚLTIMA linha `ai-title` que der para ler.
 *
 * ⚠️ Nunca lança. Um pedaço cortado no meio de uma linha é o caso NORMAL aqui (a cauda começa onde
 * o byte calhou), e linha meio lida é descartada, não é erro.
 */
function doTexto(texto) {
  if (typeof texto !== 'string' || !texto) return null
  let achado = null
  let i = texto.indexOf(MARCA)
  while (i !== -1) {
    const comeco = texto.lastIndexOf('\n', i) + 1
    let fim = texto.indexOf('\n', i)
    if (fim === -1) fim = texto.length
    try {
      const d = JSON.parse(texto.slice(comeco, fim))
      if (d && typeof d.aiTitle === 'string' && d.aiTitle.trim()) achado = d.aiTitle.trim()
    } catch { /* linha cortada pela borda da cauda: segue */ }
    i = texto.indexOf(MARCA, i + 1)
  }
  return achado
}

/** Um cache por arquivo, para não repetir a varredura completa. `null` guardado também conta. */
const jaVarridos = new Map()

/**
 * O nome da conversa daquele transcrito, ou `null` quando não há nenhum.
 *
 * `null` quer dizer "esta conversa não tem nome" — e quem desenha mostra só os números, em vez de
 * inventar um título.
 */
function doTranscrito(caminho, { lerCauda = lerCaudaDoDisco, lerTudo = lerTudoDoDisco } = {}) {
  if (!caminho) return null
  const naCauda = doTexto(lerCauda(caminho))
  if (naCauda) return naCauda

  // ⚠️ UMA varredura completa por arquivo, e só quando a cauda não respondeu.
  if (jaVarridos.has(caminho)) return jaVarridos.get(caminho)
  const noArquivo = doTexto(lerTudo(caminho))
  jaVarridos.set(caminho, noArquivo)
  return noArquivo
}

/** Lê o fim do arquivo, sem nunca lançar. */
function lerCaudaDoDisco(caminho, bytes = CAUDA_BYTES) {
  let fd = null
  try {
    const tamanho = fs.statSync(caminho).size
    const quanto = Math.min(bytes, tamanho)
    const buffer = Buffer.allocUnsafe(quanto)
    fd = fs.openSync(caminho, 'r')
    fs.readSync(fd, buffer, 0, quanto, tamanho - quanto)
    return buffer.toString('utf8')
  } catch { return '' }
  finally { if (fd !== null) { try { fs.closeSync(fd) } catch { /* já fechado */ } } }
}

/** Lê o arquivo inteiro, sem nunca lançar. */
function lerTudoDoDisco(caminho) {
  try { return fs.readFileSync(caminho, 'utf8') } catch { return '' }
}

/** Esquece o que foi varrido — existe para o teste, e para quando um arquivo é trocado. */
function limparCache() { jaVarridos.clear() }

module.exports = { doTranscrito, doTexto, lerCaudaDoDisco, lerTudoDoDisco, limparCache, MARCA, CAUDA_BYTES }
