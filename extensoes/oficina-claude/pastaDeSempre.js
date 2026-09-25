// A PASTA DE SEMPRE — a OFICINA não começa conversa sem pasta (V27, item 3 dos pedidos de 25/09).
//
// ⚠️ POR QUE ISTO EXISTE. Sem pasta aberta, a extensão oficial abre a conversa na pasta PESSOAL
// (`workspaceFolders?.[0] ?? os.homedir()`, lido no código dela). Ali não são carregadas as
// instruções, skills e regras que moram DENTRO da pasta do projeto — medido em 25/09/2026 na máquina do
// dono: 10 skills contra 80, nenhum CLAUDE.md do projeto e nenhuma das travas do projeto (as pessoais,
// do settings do usuário, continuam valendo). Ele perdeu uma skill essencial assim — *"um erro gravíssimo"*.
//
// E a própria OFICINA empurrava para isso: com a tela vazia, a abertura abre uma conversa SOZINHA. Numa
// janela sem pasta, essa conversa nascia fora do projeto. A V1 recusava conversa sem pasta
// (`exigirPastaAberta`); quando a conversa passou a ser a da extensão oficial (V23), a recusa ficou sem
// efeito.
//
// ⚠️ POR QUE UMA CONFIGURAÇÃO, E NÃO O CAMINHO NO INSTALADOR. Um atalho apontando para a pasta resolveu
// na máquina dele em 25/09 — e some na reinstalação. Gravar o caminho no instalador também não serve: a
// pasta muda de máquina para máquina e de pessoa para pessoa. `oficina.pastaDeSempre` mora nos DADOS da
// pessoa, com escopo `machine`. (Que a reinstalação preserva os dados é o esperado — não medido aqui.)
//
// ⚠️ QUANDO ABRE SOZINHA, E QUANDO SÓ PERGUNTA — a primeira versão abria sempre, e a revisão de fora
// (25/09/2026) mostrou, no código do núcleo, dois estragos:
//   - JANELA NOVA (Ctrl+Shift+N): com a pasta de sempre já aberta noutra janela, `vscode.openFolder`
//     só dá foco à outra (`windowsMainService.ts`) — a janela nova ficava vazia e inútil, atrás;
//   - ARQUIVO ABERTO SEM PASTA (duplo clique num .html): a janela era trocada, e o arquivo sumia.
// Por isso: abre sozinha SÓ na primeira janela desta execução do programa, e só se ela estiver vazia.
// Janela nova, e o Ctrl+T sem pasta, PERGUNTAM. Janela com arquivo aberto não é mexida — o aviso
// `⚠ sem pasta` da barra de cima continua dizendo o estado.

'use strict'

const fs = require('fs')
const path = require('path')

const CHAVE = 'pastaDeSempre'
/** Qual execução do programa já abriu a pasta de sempre (o PID do processo principal). */
const CHAVE_EXECUCAO = 'oficina.pastaDeSempre.execucao'

/**
 * A pasta existe, e é pasta? Assíncrono e com prazo: um disco de rede desconectado deixava o `statSync`
 * da primeira versão pendurado no host de extensões (achado de revisão). Nunca lança.
 */
function existePasta(p, { prazoMs = 2000 } = {}) {
  if (!p) return Promise.resolve(false)
  return Promise.race([
    fs.promises.stat(p).then(s => s.isDirectory(), () => false),
    new Promise(r => setTimeout(() => r(false), prazoMs)),
  ])
}

/**
 * A decisão, pura: o que fazer.
 *   { acao: 'nada' }                        a janela já tem pasta
 *   { acao: 'calar' }                       sem pasta, mas com arquivo aberto: não mexe (a barra avisa)
 *   { acao: 'abrir', pasta }                primeira janela, vazia, com pasta de sempre: abre
 *   { acao: 'perguntar', pasta?, faltando? } o resto: pergunta, oferecendo a pasta de sempre se houver
 */
function decidir({ temPasta, pastaDeSempre, existe, primeiraJanela, abas = 0, perguntar = false }) {
  if (temPasta) return { acao: 'nada' }
  if (!perguntar && abas > 0) return { acao: 'calar' }
  const p = typeof pastaDeSempre === 'string' ? pastaDeSempre.trim() : ''
  if (p && existe) {
    if (primeiraJanela && !perguntar) return { acao: 'abrir', pasta: p }
    return { acao: 'perguntar', pasta: p }
  }
  return p ? { acao: 'perguntar', faltando: p } : { acao: 'perguntar' }
}

const BOTAO_ESCOLHER = 'Escolher a pasta de sempre…'
const BOTAO_SO_AGORA = 'Abrir uma pasta só agora…'
const BOTAO_SEGUIR = 'Agora não'
const botaoAbrir = pasta => `Abrir ${path.basename(pasta) || pasta}`

function mensagem({ faltando, pasta } = {}) {
  return (faltando
    ? `A pasta de sempre (${faltando}) não foi encontrada neste computador (disco desconectado?). `
    : 'Esta janela está sem pasta aberta. ') +
    'Sem pasta, a conversa rodaria na sua pasta pessoal, e as instruções, skills e regras que ficam dentro ' +
    'da pasta do seu projeto (como o CLAUDE.md) não seriam carregadas. Por isso a OFICINA não abre conversa ' +
    'sem pasta.' + (pasta ? '' : ' Escolha a pasta de sempre para ela abrir sozinha da próxima vez.')
}

async function abrirPasta(vscode, uri, { anotar }) {
  try {
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceReuseWindow: true })
    return true
  } catch (e) {
    anotar('pastaDeSempre.naoAbriu', { mensagem: String((e && e.message) || e) })
    // Nunca calado: a pessoa ficaria numa janela sem pasta e sem conversa sem saber por quê.
    vscode.window.showWarningMessage(`Não consegui abrir a pasta ${uri.fsPath || ''}: ${(e && e.message) || e}`)
    return false
  }
}

/**
 * Roda na abertura (e no Ctrl+T sem pasta, com `perguntar: true`). Devolve `true` quando a janela está
 * (ou vai continuar) SEM pasta — e aí quem chama NÃO abre conversa. Devolve `false` quando há pasta.
 *
 * ⚠️ A pergunta NÃO é esperada: a ativação não fica presa numa notificação ignorada por uma hora.
 */
async function aoAbrir(vscode, {
  anotar = () => { }, existe = existePasta, estado = null, pidDoPrograma = process.ppid, perguntar = false,
} = {}) {
  const pastas = vscode.workspace.workspaceFolders
  if (pastas && pastas.length) return false
  const config = vscode.workspace.getConfiguration('oficina')
  const pastaDeSempre = config.get(CHAVE, '')
  const abas = ((vscode.window.tabGroups && vscode.window.tabGroups.all) || []).reduce((n, g) => n + ((g.tabs || []).length), 0)
  // A primeira janela desta execução do programa: o PID do processo principal ainda não foi marcado.
  const jaMarcado = estado ? estado.get(CHAVE_EXECUCAO, null) : null
  const primeiraJanela = !!estado && jaMarcado !== pidDoPrograma
  const d = decidir({
    temPasta: false, pastaDeSempre, existe: pastaDeSempre ? await existe(pastaDeSempre) : false,
    primeiraJanela, abas, perguntar,
  })
  if (d.acao === 'calar') { anotar('pastaDeSempre.calou', { abas }); return true }

  if (d.acao === 'abrir') {
    anotar('pastaDeSempre.abriu')
    if (estado) await estado.update(CHAVE_EXECUCAO, pidDoPrograma)
    await abrirPasta(vscode, vscode.Uri.file(d.pasta), { anotar })
    return true
  }

  anotar('pastaDeSempre.perguntou', { ...(d.faltando ? { faltando: true } : {}), ...(perguntar ? { porta: true } : {}) })
  const botoes = d.pasta ? [botaoAbrir(d.pasta), BOTAO_SO_AGORA, BOTAO_SEGUIR] : [BOTAO_ESCOLHER, BOTAO_SO_AGORA, BOTAO_SEGUIR]
  Promise.resolve(vscode.window.showWarningMessage(mensagem(d), ...botoes))
    .then(escolha => responder(vscode, escolha, { anotar, pasta: d.pasta }))
    .catch(() => { })
  return true
}

/** O que cada botão faz. Separado para ser provado sem editor. */
async function responder(vscode, escolha, { anotar = () => { }, pasta = null } = {}) {
  if (pasta && escolha === botaoAbrir(pasta)) {
    await abrirPasta(vscode, vscode.Uri.file(pasta), { anotar })
    return 'abriuASempre'
  }
  if (escolha === BOTAO_ESCOLHER) {
    const r = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
      openLabel: 'Usar como pasta de sempre',
      title: 'A pasta que a OFICINA abre sempre que começar sem pasta',
    })
    if (!r || !r.length) return 'cancelou'
    await vscode.workspace.getConfiguration('oficina').update(CHAVE, r[0].fsPath, vscode.ConfigurationTarget.Global)
    anotar('pastaDeSempre.escolhida')
    await abrirPasta(vscode, r[0], { anotar })
    return 'escolheu'
  }
  if (escolha === BOTAO_SO_AGORA) {
    await vscode.commands.executeCommand('workbench.action.files.openFolder')
    return 'soAgora'
  }
  anotar('pastaDeSempre.agoraNao')
  return 'semPasta'
}

module.exports = { decidir, aoAbrir, responder, existePasta, mensagem, botaoAbrir, CHAVE, CHAVE_EXECUCAO, BOTAO_ESCOLHER, BOTAO_SO_AGORA, BOTAO_SEGUIR }
