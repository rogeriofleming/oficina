// Poe a logo da OFICINA no lugar da do upstream, dentro do codigo-fonte, antes de
// compilar.
//
// Por que e um script e nao "copiar os arquivos uma vez": a pasta do fonte e
// recriada a cada subida de tag (`subir_upstream.bat`), e a arte voltaria a ser a
// do Code-OSS sem ninguem perceber — o tipo de regressao que so aparece quando o
// executavel ja esta pronto. Aqui a copia acontece em toda compilacao, e o build
// PARA se um destino esperado nao existir mais.
//
// ⚠️ Ele nao gera nada: as imagens vem prontas de `identidade/gerados/`, produzidas
// por `scripts/gerar_icones.py`. Duas ferramentas com uma responsabilidade cada.
//
// Uso:  node scripts/aplicar_icones.mjs <pasta do fonte do vscode>

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const GERADOS = path.resolve(AQUI, '..', 'identidade', 'gerados')

const fonte = process.argv[2]
if (!fonte) {
  console.error('uso: node scripts/aplicar_icones.mjs <pasta do fonte do vscode>')
  process.exit(1)
}
if (!fs.existsSync(fonte)) {
  console.error('nao achei a pasta do fonte: ' + fonte)
  process.exit(1)
}
if (!fs.existsSync(GERADOS)) {
  console.error('nao achei as imagens geradas em ' + GERADOS +
    '\nRode antes: python scripts/gerar_icones.py')
  process.exit(1)
}

/**
 * De onde, para onde. Os destinos sao os nomes do upstream — nao dá para renomear:
 * `build/gulpfile.vscode.ts` e `gulpfile.vscode.win32.ts` procuram por estes
 * caminhos literais (conferidos no fonte da tag 1.136.1, linhas 459, 485-486 e 151).
 *
 * `obrigatorio: false` é para o que pode não existir em toda plataforma/tag — some
 * sem derrubar o build, mas aparece no relatório.
 */
const MAPA = [
  // O ícone do executável, do atalho e da barra de tarefas. O que mais se vê.
  { de: 'oficina.ico', para: 'resources/win32/code.ico', obrigatorio: true },
  // Os tiles do menu Iniciar do Windows.
  { de: 'oficina_70x70.png', para: 'resources/win32/code_70x70.png', obrigatorio: true },
  { de: 'oficina_150x150.png', para: 'resources/win32/code_150x150.png', obrigatorio: true },
  // Linux e o servidor web: não são o alvo de hoje, mas ficar com duas identidades
  // no mesmo repositório é como um dado desatualizado — uma hora alguém usa a errada.
  { de: 'oficina_512.png', para: 'resources/linux/code.png', obrigatorio: false },
  { de: 'oficina_192.png', para: 'resources/server/code-192.png', obrigatorio: false },
  { de: 'oficina_512.png', para: 'resources/server/code-512.png', obrigatorio: false },
  { de: 'oficina.ico', para: 'resources/server/favicon.ico', obrigatorio: false },
  // ⚠️ O UNICO icone que a pessoa ve enquanto TRABALHA — o do canto superior esquerdo
  // da janela aberta. Ele nao vem do .exe: o workbench o desenha por CSS a partir
  // deste SVG (`titlebarpart.css:293`, na classe `.window-appicon`).
  //
  // Ficou de fora da lista ate 06/09/2026, e o efeito era desconcertante: barra de
  // tarefas, instalador e "Sobre" com a logo certa, e o desenho azul do VS Code
  // dentro do produto. Quem viu foi o dono, olhando a tela — nenhum teste olhava.
  // Obrigatorio de proposito: se o upstream mover este arquivo, o build tem que
  // PARAR, e nao voltar a mostrar a marca de outro produto em silencio.
  { de: 'oficina.svg', para: 'src/vs/workbench/browser/media/code-icon.svg', obrigatorio: true }
]

const feitos = []
const faltando = []

for (const item of MAPA) {
  const origem = path.join(GERADOS, item.de)
  const destino = path.join(fonte, item.para)

  if (!fs.existsSync(origem)) {
    console.error(`ERRO: a imagem gerada nao existe: ${item.de}`)
    process.exit(1)
  }
  // ⚠️ O destino tem que EXISTIR. Se o upstream renomeou o arquivo, copiar para o
  // caminho antigo criaria um arquivo orfao e o build sairia com a arte do Code-OSS
  // — verde, e errado. Melhor parar aqui do que descobrir no executavel.
  if (!fs.existsSync(destino)) {
    if (item.obrigatorio) {
      console.error(`ERRO: o destino nao existe no fonte: ${item.para}\n` +
        'O upstream pode ter renomeado o arquivo. Conferir antes de compilar.')
      process.exit(1)
    }
    faltando.push(item.para)
    continue
  }

  fs.copyFileSync(origem, destino)
  const tamanho = fs.statSync(destino).size
  feitos.push(`${item.para}  <- ${item.de} (${(tamanho / 1024).toFixed(1)} KB)`)
}

console.log(`[icones] ${feitos.length} arquivo(s) trocado(s) no fonte:`)
for (const f of feitos) console.log('  ' + f)
if (faltando.length) {
  console.log(`[icones] ${faltando.length} destino(s) opcional(is) nao existem nesta tag:`)
  for (const f of faltando) console.log('  ' + f)
}
