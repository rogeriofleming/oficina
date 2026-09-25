// VER A PÁGINA / VER O CÓDIGO (V27) — em node puro, com o editor de mentira.
//
// O que precisa ser verdade:
//   1. `.html` e `.htm` de disco contam; outros arquivos e outros esquemas não;
//   2. "ver a página" abre o MESMO arquivo no editor do navegador do núcleo, ao lado;
//   3. "ver o código" abre o mesmo arquivo no editor de texto, ao lado;
//   4. da aba do navegador, "ver o código" acha o arquivo de origem — pela aba ou, se ela não disser,
//      pelo último aberto como página;
//   5. arquivo que não é `.html` não abre nada e diz por quê (nunca falha calado);
//   6. o manifesto põe os dois botões nos lugares certos (arquivo `.html` / aba do navegador).
//
// ⚠️ O que isto NÃO prova: que o núcleo abre o editor `workbench.editor.browser` com esse comando, e a
// forma do `input` da aba do navegador na API de abas. As duas coisas são TELA, e ficam para o gate.
//
// Uso:  node testes/ver_html.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const V = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'verHtml.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const arq = p => ({ scheme: 'file', fsPath: p, path: p })
function editor({ ativo = null, abaInput = null } = {}) {
  const feito = { comandos: [], avisos: [] }
  return {
    feito,
    ViewColumn: { Beside: -2 },
    commands: { executeCommand: (...a) => { feito.comandos.push(a); return Promise.resolve() } },
    window: {
      activeTextEditor: ativo ? { document: { uri: ativo } } : undefined,
      tabGroups: { activeTabGroup: { activeTab: abaInput ? { input: abaInput } : undefined } },
      showInformationMessage: m => { feito.avisos.push(m); return Promise.resolve() },
    },
  }
}

// ── 1 ──
checar('1a. .html e .htm de disco contam', V.ehHtml(arq('d:/a/b.html')) && V.ehHtml(arq('d:/a/B.HTM')))
checar('1b. outros arquivos nao', !V.ehHtml(arq('d:/a/b.md')) && !V.ehHtml(arq('d:/a/html')) && !V.ehHtml(null))
checar('1c. outro esquema nao (o nucleo so abre file: como pagina)', !V.ehHtml({ scheme: 'untitled', fsPath: 'x.html' }))

// ── 2 ──
{
  const vs = editor({ ativo: arq('d:/p/painel.html') })
  const h = V.criarVerHtml(vs)
  const r = await h.verPagina()
  const c = vs.feito.comandos[0] || []
  checar('2. ver a pagina: o mesmo arquivo no editor do navegador do nucleo, ao lado',
    r === 'abriu' && c[0] === 'vscode.openWith' && c[1].fsPath === 'd:/p/painel.html' && c[2] === V.EDITOR_DO_NAVEGADOR && c[3] === -2,
    JSON.stringify(c))
  checar('2b. o id do editor e o que o nucleo registra', V.EDITOR_DO_NAVEGADOR === 'workbench.editor.browser')
}
// ── 3 ──
{
  const vs = editor({ ativo: arq('d:/p/painel.html') })
  await V.criarVerHtml(vs).verCodigo()
  const c = vs.feito.comandos[0] || []
  checar('3. ver o codigo: o mesmo arquivo no editor de texto, ao lado',
    c[0] === 'vscode.openWith' && c[1].fsPath === 'd:/p/painel.html' && c[2] === 'default' && c[3] === -2, JSON.stringify(c))
}
// ── 4 ──
{
  const vs = editor({ abaInput: { uri: arq('d:/p/da-aba.html') } })
  await V.criarVerHtml(vs).verCodigo()
  checar('4a. da aba do navegador, acha o arquivo pela aba', (vs.feito.comandos[0] || [])[1]?.fsPath === 'd:/p/da-aba.html')

  const vs2 = editor({ ativo: arq('d:/p/antes.html') })
  const h = V.criarVerHtml(vs2)
  await h.verPagina()
  vs2.window.activeTextEditor = undefined // agora o foco e a aba do navegador, que nao diz o arquivo pela API
  vs2.window.tabGroups.activeTabGroup.activeTab = { label: 'antes.html', input: undefined }
  await h.verCodigo()
  checar('4b. aba do navegador sem arquivo na API, mas com o NOME dele: usa o ultimo aberto como pagina',
    (vs2.feito.comandos[1] || [])[1]?.fsPath === 'd:/p/antes.html', JSON.stringify(vs2.feito.comandos))
  // achado de revisao: numa aba de OUTRO arquivo, abria o codigo do ultimo — errado
  vs2.window.tabGroups.activeTabGroup.activeTab = { label: 'outro.html', input: undefined }
  const antes = vs2.feito.comandos.length
  const r = await h.verCodigo()
  checar('4c. aba de OUTRO arquivo: nao abre o codigo do ultimo — avisa', r === 'semArquivo' && vs2.feito.comandos.length === antes && vs2.feito.avisos.length === 1,
    JSON.stringify({ r, avisos: vs2.feito.avisos }))
}
// ── 5 ──
{
  const vs = editor({ ativo: arq('d:/p/notas.md') })
  const r = await V.criarVerHtml(vs).verPagina()
  checar('5a. arquivo que nao e .html: nao abre nada', r === 'naoEhHtml' && !vs.feito.comandos.length)
  checar('5b. e diz por que (nunca falha calado)', vs.feito.avisos.length === 1, JSON.stringify(vs.feito.avisos))
  const vs2 = editor()
  const r2 = await V.criarVerHtml(vs2).verCodigo()
  checar('5c. sem arquivo nenhum: ver o codigo tambem avisa', r2 === 'semArquivo' && vs2.feito.avisos.length === 1)
}
// ── 6 ──
{
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const cmds = pkg.contributes.commands.map(c => c.command)
  checar('6a. os dois comandos existem no manifesto, com icone',
    ['oficina.html.verPagina', 'oficina.html.verCodigo'].every(c => cmds.includes(c) && pkg.contributes.commands.find(x => x.command === c).icon))
  const titulo = pkg.contributes.menus['editor/title']
  const pag = titulo.find(m => m.command === 'oficina.html.verPagina')
  const cod = titulo.find(m => m.command === 'oficina.html.verCodigo')
  checar('6b. "ver a pagina" aparece em arquivo .html (e nao dentro da propria pagina)',
    pag && /resourceExtname =~ \/\^\\\.html\?\$\/i/.test(pag.when) && /activeEditor != workbench\.editor\.browser/.test(pag.when), pag && pag.when)
  checar('6c. "ver o codigo" aparece na aba do navegador', cod && cod.when === 'activeEditor == workbench.editor.browser', cod && cod.when)
  const ctx = pkg.contributes.menus['explorer/context'] || []
  checar('6d. e os dois no botao direito do explorador, so para .html',
    ['oficina.html.verPagina', 'oficina.html.verCodigo'].every(c => ctx.some(m => m.command === c && /html/.test(m.when))))
}

// ── 7 ── os leitores de documento embutidos (V27, item 1b)
{
  const ler = f => fs.readFileSync(path.join(REPO, 'extensoes', f), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const embutidas = ler('embutidas-da-loja.txt')
  const daLoja = ler('lista.txt')
  checar('7a. os leitores de PDF e de escritorio vao dentro do instalador',
    embutidas.includes('tomoki1207.pdf') && embutidas.includes('cweijan.vscode-office'), embutidas.join())
  checar('7b. toda embutida esta tambem na lista da loja (e de la que vem o .vsix conferido)',
    embutidas.every(id => daLoja.includes(id)), embutidas.filter(id => !daLoja.includes(id)).join())
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const assoc = (pkg.contributes.configurationDefaults || {})['workbench.editorAssociations'] || {}
  checar('7c. .md, .csv e .svg continuam abrindo como TEXTO (decisao dele): o leitor de escritorio nao os toma',
    ['*.md', '*.markdown', '*.csv', '*.svg'].every(g => assoc[g] === 'default'), JSON.stringify(assoc))
  const copiar = fs.readFileSync(path.join(REPO, 'scripts', 'copiar_extensoes.mjs'), 'utf8')
  checar('7d. quem monta o instalador le a lista das embutidas', copiar.includes('embutidas-da-loja.txt'))
}

// ── 8 ── celular e computador lado a lado (V27, item 1c)
{
  const N = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'navegador.js'))
  const abertas = []
  const enviados = new Map()
  const vs = {
    ViewColumn: { Beside: -2 },
    EventEmitter: class { constructor() { this.event = () => { } } fire() { } },
    TreeItem: class { constructor(l) { this.label = l } },
    ThemeIcon: class { },
    TreeItemCollapsibleState: { None: 0, Expanded: 2 },
    window: {
      activeTextEditor: { document: { uri: { scheme: 'file', fsPath: 'd:/p/pagina.html', toString: () => 'file:///d%3A/p/pagina.html' } } },
      openBrowserTab: (url, op) => {
        const aba = {
          url, op,
          // Um CDP de mentira que RESPONDE como o de verdade: sem resposta, a conexão espera 10 s e
          // desiste — e o critério mediria o tempo limite, não o aparelho.
          startCDPSession: () => {
            let ouvinte = () => { }
            const respostas = { 'Target.getTargets': { targetInfos: [{ type: 'page', targetId: 't' }] }, 'Target.attachToTarget': { sessionId: 's' } }
            return Promise.resolve({
              sendMessage: m => {
                if (!enviados.has(aba)) enviados.set(aba, [])
                enviados.get(aba).push(m)
                setTimeout(() => ouvinte({ id: m.id, result: respostas[m.method] || {} }), 0)
                return Promise.resolve()
              },
              onDidReceiveMessage: f => { ouvinte = f; return { dispose() { } } },
              onDidClose: () => ({ dispose() { } }), close() { },
            })
          },
        }
        abertas.push(aba)
        return Promise.resolve(aba)
      },
      showErrorMessage: () => { }, showInputBox: () => Promise.resolve(''),
    },
  }
  const nav = N.criarNavegador(vs)
  const r = await nav.ladoALado()
  checar('8a. abre a MESMA pagina duas vezes, ao lado', abertas.length === 2 && abertas.every(a => a.url === 'file:///d%3A/p/pagina.html' && a.op.viewColumn === -2),
    JSON.stringify(abertas.map(a => a.url)))
  const larguras = abertas.map(a => JSON.stringify(enviados.get(a) || []).match(/"width":(\d+)/))
  checar('8b. uma aba como Notebook (1366) e a outra como iPhone 15 (393), cada uma na sua conexao',
    larguras[0] && larguras[0][1] === '1366' && larguras[1] && larguras[1][1] === '393', JSON.stringify(larguras))
  checar('8c. sem erro ao aplicar os aparelhos', r && r.erros.length === 0, JSON.stringify(r && r.erros))
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  checar('8d. o botao aparece em todo .html aberto', pkg.contributes.menus['editor/title'].some(m => m.command === 'oficina.navegador.ladoALado' && /html/.test(m.when)))
}

const falhas = resultados.filter(r => !r.ok)
console.log(`\n  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
