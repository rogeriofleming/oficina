// VER A PÁGINA / VER O CÓDIGO — as duas opções de um `.html` (V27, item 1 dos pedidos de 25/09).
//
// Pedido dele: *"Tem que ter as duas opções"* — ver a página e ver o código. O caso: um link para um
// `.html` no chat que não abriu NADA.
//
// ⚠️ POR QUE O LINK NÃO ABRIU — lido no código da extensão oficial (2.1.278, `openFile`), e não
// suposto: caminho relativo é resolvido a partir da pasta da conversa; sem pasta aberta essa pasta é
// a pessoal, o arquivo não existe lá, a busca no projeto não tem projeto onde buscar, e ela chama
// `showTextDocument` num arquivo inexistente SEM tratar o erro — nada acontece. A causa raiz é a
// conversa sem pasta, e é `pastaDeSempre.js` que a fecha. E mesmo com a pasta certa ela abre SEMPRE
// como texto (`showTextDocument`): a página nunca, por aquele caminho. Por isso as duas opções moram
// aqui, na OFICINA, e não no link.
//
// ⚠️ O NÚCLEO JÁ SABE MOSTRAR A PÁGINA. Ele registra o editor `workbench.editor.browser` ("Integrated
// Browser") como OPÇÃO para `file:/**/*.html` e `*.htm` (`browserView.contribution.ts`), guardando o
// arquivo de origem (`associatedResource`) — e recarrega a página quando o arquivo muda
// (`browserAutoReloadFeatures.ts`). Então "ver a página" e "ver o código" são o MESMO arquivo em dois
// editores, e ir de um para o outro é trocar de editor, não copiar endereço. Nada disso exige núcleo novo.

'use strict'

/** O editor do navegador integrado, como o núcleo o registra (`BrowserViewEditorId`). */
const EDITOR_DO_NAVEGADOR = 'workbench.editor.browser'

/** É um `.html`/`.htm` de disco? Só esses o núcleo abre como página. */
function ehHtml(uri) {
  return !!(uri && uri.scheme === 'file' && /\.html?$/i.test(uri.fsPath || uri.path || ''))
}

/**
 * O arquivo em foco: o do argumento (menu de contexto), senão o do editor de texto ativo, senão o da
 * aba ativa (a aba do navegador expõe o arquivo de origem — ⚠️ NÃO MEDIDO: a forma do `input` da aba
 * do navegador na API de abas ainda precisa ser vista num build; por isso há o registro abaixo).
 */
function arquivoEmFoco(vscode, uri, { ultimoAberto = null } = {}) {
  if (uri && uri.scheme) return uri
  const ed = vscode.window.activeTextEditor
  if (ed && ed.document && ed.document.uri) return ed.document.uri
  const grupo = vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup
  const aba = grupo && grupo.activeTab
  const entrada = aba && aba.input
  if (entrada && entrada.uri && entrada.uri.scheme === 'file') return entrada.uri
  /*
    ⚠️ A ABA DO NAVEGADOR NÃO DIZ O ARQUIVO PELA API — conferido no núcleo pela revisão de 25/09/2026
    (`mainThreadEditorTabs.ts` não tem tipo para o editor do navegador: o `input` chega vazio). O que ela
    diz é o NOME: o rótulo da aba é o nome do arquivo de origem (`browserEditorInput.getName`). Então o
    último `.html` aberto como página só é usado se o nome da aba BATER com ele — a primeira versão o
    usava sempre, e numa aba de outro arquivo abria o código errado.
  */
  if (ultimoAberto && aba && typeof aba.label === 'string') {
    const nome = String(ultimoAberto.fsPath || ultimoAberto.path || '').split(/[\\/]/).pop()
    if (nome && aba.label === nome) return ultimoAberto
  }
  return null
}

function criarVerHtml(vscode, { anotar = () => { } } = {}) {
  /** O último `.html` aberto como página — o caminho de volta quando a aba não diz de onde veio. */
  let ultimoAberto = null

  async function verPagina(uri) {
    const alvo = arquivoEmFoco(vscode, uri)
    if (!ehHtml(alvo)) {
      vscode.window.showInformationMessage('Clique na aba de um arquivo .html salvo no computador e peça de novo — ou use o botão direito no .html, no explorador.')
      return 'naoEhHtml'
    }
    ultimoAberto = alvo
    anotar('html.verPagina')
    // Ao LADO: quem pediu a página quase sempre está no código e quer os dois à vista.
    await vscode.commands.executeCommand('vscode.openWith', alvo, EDITOR_DO_NAVEGADOR, vscode.ViewColumn.Beside)
    return 'abriu'
  }

  async function verCodigo(uri) {
    const alvo = arquivoEmFoco(vscode, uri, { ultimoAberto })
    if (!ehHtml(alvo)) {
      vscode.window.showInformationMessage('Não consegui saber de qual arquivo esta página veio (ou ela é um endereço da internet, sem arquivo). ' +
        'No explorador, clique com o botão direito no .html e escolha "Ver o código".')
      return 'semArquivo'
    }
    anotar('html.verCodigo')
    await vscode.commands.executeCommand('vscode.openWith', alvo, 'default', vscode.ViewColumn.Beside)
    return 'abriu'
  }

  return { verPagina, verCodigo, get ultimoAberto() { return ultimoAberto } }
}

module.exports = { criarVerHtml, ehHtml, arquivoEmFoco, EDITOR_DO_NAVEGADOR }
