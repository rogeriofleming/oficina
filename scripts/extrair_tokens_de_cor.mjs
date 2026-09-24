// Extrai do clone a lista de TODAS as cores que o VS Code registra, para
// identidade/tokens_oficiais.txt — a lista que testes/temas.mjs cobra.
//
// ⚠️ Por que node e nao grep: a primeira versao desta lista saiu de
// `grep -E "registerColor\(\s*'..."` e veio com 843 ids. O certo eram 954. O grep
// trabalha LINHA A LINHA, entao toda chamada em que o id cai na linha de baixo
// (`registerColor(` + quebra + `'editor.foo',`) ficou de fora — 111 cores, 13% do
// total, que teriam nascido com o valor da Microsoft dentro do nosso tema. Aqui o
// arquivo e lido inteiro, e \s atravessa a quebra de linha.
//
// Uso: node scripts/extrair_tokens_de_cor.mjs [clone] > identidade/tokens_oficiais.txt
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const clone = process.argv[2] || path.join(RAIZ, 'vscode')
const alvo = path.join(clone, 'src', 'vs')
if (!fs.existsSync(alvo)) {
  console.error(`nao achei o fonte do clone em ${alvo}. Passe o caminho: node scripts/extrair_tokens_de_cor.mjs <clone>`)
  process.exit(1)
}

const ids = new Set()
const re = /registerColor\(\s*'([a-zA-Z0-9_.]+)'/g
const andar = (dir) => {
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, it.name)
    if (it.isDirectory()) andar(p)
    else if (it.name.endsWith('.ts')) {
      const txt = fs.readFileSync(p, 'utf8')
      let m
      while ((m = re.exec(txt))) ids.add(m[1])
    }
  }
}
andar(alvo)
process.stdout.write([...ids].sort().join('\n') + '\n')
console.error(`${ids.size} tokens de cor`)
