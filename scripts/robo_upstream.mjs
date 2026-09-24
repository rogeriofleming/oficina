// O ROBÔ DA SUBIDA DE VERSÃO — pega a tag estável nova do núcleo, sobe, testa e PREPARA a versão.
//
// ⚠️ NADA PUBLICA SOZINHO. É a regra que define este arquivo, e ela tem três pedaços:
//   1. a Release do GitHub nasce em RASCUNHO, e `garantirRascunho` recusa qualquer chamada ao `gh`
//      que não seja criar ou anexar a um rascunho;
//   2. este robô NUNCA chama `liberar.mjs` nem fala com o armazenamento do canal de atualização:
//      é o manifesto que está lá que faz as instalações se atualizarem, então subir o manifesto
//      JÁ É publicar;
//   3. tag só estável (X.Y.Z). Nome de branch, `main`, pré-lançamento: recusado.
// Quem publica é uma pessoa: publica o rascunho e roda o `liberar.mjs`.
//
// ⚠️ O QUE ELE FAZ QUANDO UM PATCH NÃO APLICA: para, e escreve um relatório com o nome do patch,
// o porquê dele (o `.md` ao lado), os arquivos que conflitaram e o trecho do patch sobre cada um.
// Os três formatos de erro reconhecidos foram MEDIDOS no `git apply --3way` (12/09/2026), num
// repositório descartável: conflito de conteúdo, arquivo que sumiu, e patch que não aplica.
//
// Uso:
//   node scripts/robo_upstream.mjs --planejar            só lê: a tag de hoje, a tag nova, o plano
//   node scripts/robo_upstream.mjs --executar [--tag X]  sobe, compila, testa, empacota, rascunho
//
// `--executar` compila: é para o ambiente de integração contínua (ver `.github/workflows/`) ou
// para um checkpoint de build declarado. Nunca no meio de uma versão.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const UPSTREAM = 'https://github.com/microsoft/vscode.git'

// ─────────────────────────────────────────────────────────────────────────────
// A TAG
// ─────────────────────────────────────────────────────────────────────────────

const ESTAVEL = /^(\d+)\.(\d+)\.(\d+)$/

export function ehEstavel(tag) {
  return ESTAVEL.test(String(tag || ''))
}

export function compararVersao(a, b) {
  const pa = String(a).match(ESTAVEL).slice(1).map(Number)
  const pb = String(b).match(ESTAVEL).slice(1).map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** As tags estáveis da saída de `git ls-remote --tags`, da mais nova para a mais velha. */
export function tagsEstaveis(saidaLsRemote) {
  const vistas = new Set()
  for (const linha of String(saidaLsRemote || '').split(/\r?\n/)) {
    const m = linha.match(/\trefs\/tags\/([^\s^]+)(\^\{\})?$/)
    if (m && ehEstavel(m[1])) vistas.add(m[1])
  }
  return [...vistas].sort((a, b) => compararVersao(b, a))
}

/**
 * Qual tag subir. Devolve `{ tag }`, `{ nada: motivo }` ou `{ erro: motivo }`.
 * ⚠️ `pedida` passa pelas MESMAS travas da automática: o botão "subir agora" não é atalho para
 * compilar `main`.
 */
export function escolherTag({ atual, tags, pedida }) {
  if (!ehEstavel(atual)) return { erro: `a tag de hoje em produto/TAG.txt não é estável: "${atual}"` }
  if (pedida !== undefined && pedida !== null && pedida !== '') {
    if (!ehEstavel(pedida)) return { erro: `"${pedida}" não é tag estável (X.Y.Z). Branch e pré-lançamento não sobem.` }
    if (Array.isArray(tags) && !tags.includes(pedida)) return { erro: `a tag ${pedida} não existe no núcleo de origem` }
    if (compararVersao(pedida, atual) <= 0) return { erro: `a tag ${pedida} não é mais nova que a de hoje (${atual})` }
    return { tag: pedida }
  }
  const nova = (tags || []).find(t => compararVersao(t, atual) > 0)
  return nova ? { tag: nova } : { nada: `a tag de hoje (${atual}) já é a estável mais nova` }
}

// ─────────────────────────────────────────────────────────────────────────────
// O CONFLITO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lê o log do `construir.bat` e diz qual patch parou e em quais arquivos.
 * O patch é o ÚLTIMO anunciado antes do erro (o build aplica um por vez, em ordem).
 */
export function lerConflito(log) {
  const linhas = String(log || '').split(/\r?\n/)
  let patch = null
  let viabilidade = false
  let indiceDoPatch = -1
  linhas.forEach((l, i) => {
    const m = l.match(/(viabilidade|patch):\s+(\S+\.patch)\s*$/)
    if (m) { patch = m[2]; viabilidade = m[1] === 'viabilidade'; indiceDoPatch = i }
  })
  const depois = indiceDoPatch >= 0 ? linhas.slice(indiceDoPatch + 1) : linhas
  const arquivos = new Map()   // arquivo -> motivo
  for (const l of depois) {
    let m
    if ((m = l.match(/^Applied patch to '(.+)' with conflicts\.$/))) arquivos.set(m[1], 'conflito de conteúdo: o núcleo mudou o mesmo trecho')
    else if ((m = l.match(/^error: (.+): does not exist in index$/))) arquivos.set(m[1], 'o arquivo não existe mais no núcleo (foi apagado ou movido)')
    else if ((m = l.match(/^error: patch failed: (.+):(\d+)$/))) { if (!arquivos.has(m[1])) arquivos.set(m[1], `o patch não encaixa a partir da linha ${m[2]}`) }
    else if ((m = l.match(/^error: (.+): patch does not apply$/))) { if (!arquivos.has(m[1])) arquivos.set(m[1], 'o patch não encaixa') }
  }
  return { patch, viabilidade, arquivos: [...arquivos].map(([arquivo, motivo]) => ({ arquivo, motivo })) }
}

/** O pedaço do patch que mexe em `arquivo` (do `diff --git` dele até o próximo). */
export function trechoDoPatch(textoDoPatch, arquivo) {
  const blocos = String(textoDoPatch || '').split(/^(?=diff --git )/m)
  const alvo = blocos.find(b => b.startsWith('diff --git ') && (b.includes(` a/${arquivo}`) || b.includes(` b/${arquivo}`)))
  return alvo ? alvo.trimEnd() : null
}

// ─────────────────────────────────────────────────────────────────────────────
// O RELATÓRIO
// ─────────────────────────────────────────────────────────────────────────────

/** A primeira seção de texto do `.md` do patch: é onde está o porquê. */
function porqueDoPatch(textoMd) {
  const linhas = String(textoMd || '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
  return linhas.slice(0, 6).join('\n')
}

export function montarRelatorio({ atual, nova, etapas, conflito, patchTexto, patchMd, rascunho }) {
  const saida = []
  saida.push(`# Subida de versão do núcleo: ${atual} → ${nova}`)
  saida.push('')
  saida.push('| etapa | resultado |')
  saida.push('|---|---|')
  for (const e of etapas) saida.push(`| ${e.nome} | ${e.ok ? 'ok' : 'PAROU'}${e.detalhe ? ` — ${e.detalhe}` : ''} |`)
  saida.push('')
  if (conflito && conflito.patch) {
    saida.push(`## O patch que não aplicou: \`${conflito.patch}\`${conflito.viabilidade ? ' (viabilidade)' : ''}`)
    saida.push('')
    saida.push('Isto não é defeito do build: o núcleo novo mexeu num trecho que este projeto altera.')
    saida.push('O conserto é refazer o patch sobre a tag nova. A tag antiga continua valendo até lá.')
    saida.push('')
    if (patchMd) { saida.push('**Por que o patch existe:**'); saida.push(''); saida.push(porqueDoPatch(patchMd)); saida.push('') }
    if (!conflito.arquivos.length) saida.push('Não achei no log qual arquivo conflitou. O log inteiro vai anexado.')
    for (const a of conflito.arquivos) {
      saida.push(`### \`${a.arquivo}\``)
      saida.push('')
      saida.push(a.motivo + '.')
      const trecho = trechoDoPatch(patchTexto, a.arquivo)
      if (trecho) { saida.push(''); saida.push('```diff'); saida.push(trecho); saida.push('```') }
      saida.push('')
    }
  } else if (conflito) {
    saida.push('## Parou num patch, mas não achei qual no log')
    saida.push('')
    saida.push('O log inteiro vai anexado.')
    saida.push('')
  }
  if (rascunho) {
    saida.push(`## Rascunho pronto: \`${rascunho}\``)
    saida.push('')
    saida.push('**Nada foi publicado.** Para soltar a versão: revisar o rascunho no GitHub, publicar, e só')
    saida.push(`então rodar \`liberar.mjs\` com \`OFICINA_RELEASE_TAG=${rascunho}\` (é ele que muda o canal de`)
    saida.push('atualização, e com a variável ele publica o instalador DESTA Release, conferido pelo hash).')
  }
  return saida.join('\n') + '\n'
}

// ─────────────────────────────────────────────────────────────────────────────
// O RASCUNHO — a única coisa que este robô faz fora da máquina
// ─────────────────────────────────────────────────────────────────────────────

export function nomeDoRascunho(tag) {
  return `oficina-${tag}`
}

/** Os argumentos do `gh` para o rascunho. Passam por `garantirRascunho` antes de rodar. */
export function argumentosDoRascunho({ tag, arquivos, notas, repo }) {
  return ['release', 'create', nomeDoRascunho(tag), ...arquivos, '--repo', repo, '--draft', '--target', nomeDaBranch(tag),
    '--title', `OFICINA ${tag} (rascunho do robô)`, '--notes-file', notas]
}

/**
 * Recusa tudo que não seja criar um RASCUNHO: de Release ou de PR. Lança: não há caminho "quase".
 * `gh release upload` também fica de fora: anexar a uma Release que alguém JÁ publicou mudaria o
 * que está no ar.
 */
export function garantirRascunho(args) {
  const a = (args || []).map(String)
  if (!['release', 'pr'].includes(a[0])) throw new Error(`"gh ${a[0]}" não é permitido ao robô`)
  if (a[1] !== 'create') throw new Error(`"gh ${a[0]} ${a[1]}" não é permitido ao robô`)
  if (a.some(x => /^--draft=(false|0)$/i.test(x) || /^--latest(=|$)/.test(x))) throw new Error('o robô não desliga o rascunho')
  if (!a.includes('--draft')) throw new Error(`${a[0]} sem --draft seria PUBLICAR`)
  return a
}

export function nomeDaBranch(tag) {
  return `subida/${tag}`
}

/** O PR em rascunho que guarda a tag nova (TAG.txt e SHA.txt) — sem ele a subida some com a máquina do CI. */
export function argumentosDoPr({ tag, notas, repo }) {
  return ['pr', 'create', '--repo', repo, '--draft', '--head', nomeDaBranch(tag),
    '--title', `Subida do núcleo para ${tag}`, '--body-file', notas]
}

// ─────────────────────────────────────────────────────────────────────────────
// A EXECUÇÃO (compila: integração contínua ou checkpoint)
// ─────────────────────────────────────────────────────────────────────────────

function argumento(nome) {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function lerTagsDoUpstream() {
  return tagsEstaveis(execFileSync('git', ['ls-remote', '--tags', UPSTREAM], { encoding: 'utf8', timeout: 120000 }))
}

function rodarBat(nome, args) {
  // `cmd` com `/d /c` e os argumentos em array: o node não passa pelo MSYS, e o `/c` chega inteiro.
  const r = spawnSync('cmd.exe', ['/d', '/c', path.join(REPO, 'scripts', nome), ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  process.stdout.write(r.stdout || '')
  process.stderr.write(r.stderr || '')
  return { codigo: r.status, saida: String(r.stdout || '') }
}

function rodarNode(arquivo, args = []) {
  const r = spawnSync(process.execPath, [path.join(REPO, arquivo), ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  process.stdout.write(r.stdout || '')
  return { codigo: r.status, saida: String(r.stdout || '') }
}

function gravarRelatorio(texto, nova, { resumo = true } = {}) {
  const raiz = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
  const pasta = path.join(raiz, 'log')
  fs.mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, `relatorio_subida_${nova}.md`)
  fs.writeFileSync(arquivo, texto)
  // No GitHub Actions o relatório vira o resumo da execução, na página dela.
  if (resumo && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto)
  console.log('relatório: ' + arquivo)
  return arquivo
}

async function principal() {
  const atual = fs.readFileSync(path.join(REPO, 'produto', 'TAG.txt'), 'utf8').trim()
  const tags = lerTagsDoUpstream()
  const escolha = escolherTag({ atual, tags, pedida: argumento('--tag') })
  console.log(JSON.stringify({ atual, maisNova: tags[0] || null, escolha }))
  if (escolha.erro) process.exit(2)
  if (escolha.nada || process.argv.includes('--planejar')) process.exit(0)
  if (!process.argv.includes('--executar')) { console.log('nada a fazer sem --executar'); process.exit(0) }

  const nova = escolha.tag
  const etapas = []

  // O núcleo exige uma versão EXATA de Node, e ela muda de tag para tag.
  const nvmrc = await fetch(`https://raw.githubusercontent.com/microsoft/vscode/${nova}/.nvmrc`)
  const versaoDoNode = nvmrc.ok ? (await nvmrc.text()).trim() : ''
  if (!/^\d+\.\d+\.\d+$/.test(versaoDoNode)) {
    etapas.push({ nome: 'ler a versão do Node da tag', ok: false, detalhe: `HTTP ${nvmrc.status}, conteúdo "${versaoDoNode.slice(0, 20)}"` })
    gravarRelatorio(montarRelatorio({ atual, nova, etapas }), nova)
    process.exit(7)
  }
  const node = rodarBat('preparar_node.bat', [versaoDoNode])
  etapas.push({ nome: `preparar o Node ${versaoDoNode}`, ok: node.codigo === 0 })
  if (node.codigo !== 0) { gravarRelatorio(montarRelatorio({ atual, nova, etapas }), nova); process.exit(7) }

  const subida = rodarBat('subir_upstream.bat', [nova])
  if (subida.codigo === 3) {
    etapas.push({ nome: 'aplicar os patches', ok: false })
    const mLog = subida.saida.match(/Log:\s*(.+\.txt)\s*$/m)
    const log = mLog && fs.existsSync(mLog[1].trim()) ? fs.readFileSync(mLog[1].trim(), 'utf8') : ''
    const conflito = lerConflito(log)
    const base = conflito.patch ? path.join(REPO, 'patches', conflito.viabilidade ? 'viabilidade' : '', conflito.patch) : null
    const ler = p => (p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')
    gravarRelatorio(montarRelatorio({ atual, nova, etapas, conflito, patchTexto: ler(base), patchMd: ler(base && base.replace(/\.patch$/, '.md')) }), nova)
    process.exit(3)
  }
  etapas.push({ nome: 'subir, compilar e fumaça', ok: subida.codigo === 0, detalhe: subida.codigo === 0 ? null : `código ${subida.codigo}` })
  if (subida.codigo !== 0) { gravarRelatorio(montarRelatorio({ atual, nova, etapas }), nova); process.exit(subida.codigo || 1) }

  const regressao = rodarNode('testes/regressao.mjs')
  etapas.push({ nome: 'regressão', ok: regressao.codigo === 0 })
  if (regressao.codigo !== 0) { gravarRelatorio(montarRelatorio({ atual, nova, etapas }), nova); process.exit(4) }

  const pacote = rodarBat('empacotar.bat', [])
  etapas.push({ nome: 'empacotar', ok: pacote.codigo === 0 })
  if (pacote.codigo !== 0) { gravarRelatorio(montarRelatorio({ atual, nova, etapas }), nova); process.exit(5) }

  const raiz = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
  const exe = path.join(raiz, 'dist', 'OficinaSetup.exe')
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo) {
    etapas.push({ nome: 'rascunho da Release', ok: false, detalhe: 'sem GITHUB_REPOSITORY: nada foi criado' })
    gravarRelatorio(montarRelatorio({ atual, nova, etapas }), nova)
    process.exit(6)
  }
  /*
    ⚠️ "RASCUNHO PRONTO" SÓ DEPOIS DE ELE EXISTIR (revisão de código, 16/09/2026). O relatório era gravado com
    a seção do rascunho ANTES do push e do `gh`, e ia inteiro para o resumo da execução: se o push fosse
    recusado (a branch da subida já existe, numa segunda tentativa) a página dizia "Rascunho pronto" com a
    execução vermelha. O texto das notas do PR e da Release precisa existir antes (o `gh` o lê do arquivo),
    então ele é gravado sem ir para o resumo; o resumo sai no fim, com o que de fato aconteceu.
  */
  const notas = gravarRelatorio(montarRelatorio({ atual, nova, etapas, rascunho: nomeDoRascunho(nova) }), nova, { resumo: false })
  // A tag nova vive numa branch própria; o `main` não muda sem alguém aceitar o PR.
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { stdio: 'inherit' })
  const passo = (nome, fn) => {
    try { fn(); etapas.push({ nome, ok: true }); return true } catch (e) {
      etapas.push({ nome, ok: false, detalhe: String((e && e.message) || e).split('\n')[0].slice(0, 200) })
      gravarRelatorio(montarRelatorio({ atual, nova, etapas }), nova)
      return false
    }
  }
  if (!passo('branch da subida', () => {
    git('checkout', '-b', nomeDaBranch(nova))
    git('add', 'produto/TAG.txt', 'produto/SHA.txt')
    git('commit', '-m', `Subida do núcleo para ${nova}`)
    git('push', 'origin', nomeDaBranch(nova))
  })) process.exit(6)
  if (!passo('PR em rascunho', () => execFileSync('gh', garantirRascunho(argumentosDoPr({ tag: nova, notas, repo })), { stdio: 'inherit' }))) process.exit(6)
  // O carimbo do build vai junto: é ele que diz de qual commit e de qual tag o instalador saiu, e o
  // `liberar.mjs` o lê DA RELEASE para publicar exatamente o que foi revisado.
  const carimbo = path.join(raiz, 'VSCode-win32-x64', 'oficina-build.json')
  const args = garantirRascunho(argumentosDoRascunho({ tag: nova, arquivos: [exe, exe + '.sha256.json', carimbo], notas, repo }))
  if (!passo('Release em rascunho', () => execFileSync('gh', args, { stdio: 'inherit' }))) process.exit(6)
  gravarRelatorio(montarRelatorio({ atual, nova, etapas, rascunho: nomeDoRascunho(nova) }), nova)
  console.log(`rascunho ${nomeDoRascunho(nova)} criado. NADA foi publicado.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal().catch(e => { console.error(e && e.stack || e); process.exit(1) })
}
