// CONFERE OS TIPOS DE UM PATCH DO NÚCLEO — sem compilar, sem abrir nada e sem tocar no clone.
//
// Construir o núcleo leva minutos e é trabalho de checkpoint. Mas a pergunta "este patch ao menos
// compila?" tem resposta em segundos: pega os arquivos que o patch toca como eles estão na TAG do
// clone, aplica o patch numa cópia descartável, e roda o verificador de tipos do próprio clone com
// esses arquivos servidos da memória. O resto do núcleo é lido do clone, normalmente.
//
// ⚠️ O que isto prova, e o que não prova: prova que o TypeScript aceita o código (tipos, nomes,
// assinaturas, imports). NÃO prova comportamento — isso continua sendo do build e do teste.
//
// ⚠️ Controle positivo embutido: `--controle` estraga de propósito uma linha do primeiro arquivo e
// exige que o verificador acuse. Sem ele, "0 erros" também seria a resposta de um verificador que
// não olhou nada.
//
// Uso:  node scripts/conferir_tipos_do_patch.mjs <arquivo.patch> [--controle]
//       (o clone vem de OFICINA_BUILD, padrão <disco do sistema>\oficina-build\vscode)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const patch = process.argv[2]
if (!patch || !fs.existsSync(patch)) {
  console.error('Uso: node scripts/conferir_tipos_do_patch.mjs <arquivo.patch> [--controle]')
  process.exit(2)
}
const RAIZ = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const CLONE = path.join(RAIZ, 'vscode')
const requerer = createRequire(path.join(CLONE, 'package.json'))
let ts
try { ts = requerer('typescript') } catch {
  console.error(`Não achei o TypeScript do clone em ${CLONE}. O clone precisa ter as dependências instaladas.`)
  process.exit(2)
}

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const textoDoPatch = fs.readFileSync(patch, 'utf8')
const tocados = [...new Set([...textoDoPatch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m => m[1].trim()))].filter(f => f.endsWith('.ts'))
if (!tocados.length) { console.error('O patch não toca em nenhum arquivo .ts.'); process.exit(2) }

// A cópia descartável: os arquivos como estão na tag (em LF, como o repositório os guarda).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-tipos-'))
const conteudos = new Map()
try {
  execFileSync('git', ['init', '-q', tmp])
  git(tmp, 'config', 'core.autocrlf', 'false')
  for (const f of tocados) {
    let original = ''
    try { original = git(CLONE, 'show', `HEAD:${f}`) } catch { /* arquivo novo do patch */ }
    fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true })
    fs.writeFileSync(path.join(tmp, f), original)
  }
  git(tmp, 'apply', path.resolve(patch))
  for (const f of tocados) conteudos.set(path.resolve(CLONE, f).toLowerCase(), fs.readFileSync(path.join(tmp, f), 'utf8'))
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

if (process.argv.includes('--controle')) {
  const [chave, texto] = [...conteudos][0]
  conteudos.set(chave, texto + '\nconst __controle_positivo: number = "isto nao e numero";\n')
}

const cfgPath = path.join(CLONE, 'src', 'tsconfig.json')
const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(cfgPath))
const opcoes = { ...parsed.options, noEmit: true, incremental: false, composite: false, tsBuildInfoFile: undefined }
const host = ts.createCompilerHost(opcoes, true)
const daMemoria = f => conteudos.get(path.resolve(f).toLowerCase())
const lerOriginal = host.readFile.bind(host)
const fonteOriginal = host.getSourceFile.bind(host)
const existeOriginal = host.fileExists.bind(host)
host.readFile = f => daMemoria(f) ?? lerOriginal(f)
host.fileExists = f => daMemoria(f) !== undefined || existeOriginal(f)
host.getSourceFile = (f, lang, onErr, novo) => {
  const t = daMemoria(f)
  return t !== undefined ? ts.createSourceFile(f, t, lang, true) : fonteOriginal(f, lang, onErr, novo)
}
host.writeFile = () => { throw new Error('esta conferência não grava nada') }

const t0 = Date.now()
const raizes = tocados.map(f => path.resolve(CLONE, f))
const programa = ts.createProgram({ rootNames: raizes, options: opcoes, host })
const erros = []
for (const r of raizes) {
  const fonte = programa.getSourceFile(r)
  if (!fonte) { erros.push(`${r}: o programa não carregou o arquivo`); continue }
  for (const d of [...programa.getSyntacticDiagnostics(fonte), ...programa.getSemanticDiagnostics(fonte)]) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start)
    erros.push(`${path.relative(CLONE, d.file.fileName)}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)
  }
}
for (const e of erros.slice(0, 30)) console.log('  ' + e)
console.log(JSON.stringify({ arquivos: tocados, typescript: ts.version, noPrograma: programa.getSourceFiles().length, erros: erros.length, segundos: Math.round((Date.now() - t0) / 1000), controle: process.argv.includes('--controle') }))
process.exit(erros.length ? 1 : 0)
