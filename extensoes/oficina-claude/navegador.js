// O NAVEGADOR COM TAMANHOS DE TELA (V17) — a vista "Navegador" da barra lateral.
//
// ⚠️ É O NAVEGADOR DO PRÓPRIO EDITOR, e não um iframe numa webview. O editor já traz um navegador de
// verdade (uma página do Chromium, no processo principal) com emulação de aparelho: tela, densidade,
// agente do navegador e toque. Esta vista só escolhe O QUE emular. O caminho é a API proposta `browser`
// (abrir a aba e abrir uma sessão do protocolo de depuração do Chromium, o CDP): os comandos de emulação
// que chegam por ela são convertidos pelo núcleo no mesmo perfil de aparelho que o botão dele usa
// (`browserViewEmulator.ts`, `_intercept`). Nada disso exige núcleo novo — só a declaração
// `enabledApiProposals: ["browser"]` no `package.json`, que o editor aceita de extensão embutida.
//
// ⚠️ iOS E ANDROID SÃO IMITAÇÃO. O motor é sempre o Chromium do editor: o que muda é a tela, a densidade,
// o toque e o agente do navegador que a página lê. O motor do Safari (WebKit) não existe aqui — um defeito
// que só o Safari tem não aparece. A vista diz isso na tela.
//
// ⚠️ O `vscode` chega por parâmetro, como em `telaSkills.js`: a lista de aparelhos e a vista inteira se
// provam em node puro (`testes/ponte.mjs`).

'use strict'

// ── Os aparelhos ─────────────────────────────────────────────────────────────
//
// FONTE DE CADA NÚMERO (conferível nesta máquina, sem internet):
//  - largura, altura (px CSS) e densidade dos celulares e tablets: os descritores de aparelho do Playwright
//    (`playwright-core/lib/server/deviceDescriptorsSource.json`, 1.61), citados PELO NOME em `descritor`.
//  - ⚠️ A ALTURA É A DA PÁGINA (`viewport`), não a da tela (`screen`). A página não tem a tela inteira: a barra
//    do navegador e a do sistema comem parte dela, e é pela área da página que se julga o que fica "acima da
//    dobra". Onde o descritor separa as duas (iPhone 15: tela 393×852, página 393×659), a tela vai em `tela`
//    e a dica mostra os dois números. Em paisagem vale o descritor de paisagem (`paisagem`), que tem outra
//    área: a barra não gira junto. Onde o descritor só traz a área, ela é a tela inteira que ele conhece.
//  - polegadas e pixels físicos: de memória, NÃO conferidos na ficha do fabricante — a tela diz isso. O que a
//    ponte cobra é a coerência: tela × densidade = pixels físicos (tolerância de 3 px).
//  - desktop e widescreen: resoluções comuns de monitor, densidade 1 (monitor sem escala do sistema).
//  - agente do navegador: o formato do Safari do iPhone é o mesmo que o núcleo usa nos presets dele
//    (`browserEditorEmulationFeatures.ts:779-796`); Android e Windows no formato reduzido do Chrome
//    (versão `NNN.0.0.0`), com a versão do Chromium DESTE editor — a página vê o motor que roda de fato.
//  - iPad: o Safari do iPadOS pede o site "de computador" por padrão, com agente de Mac. É esse que vai;
//    a página o distingue de um Mac pelo toque, como no aparelho.

const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const SAFARI_IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

function versaoDoChromium() {
  const v = (process.versions && process.versions.chrome) || ''
  const principal = /^(\d+)/.exec(v)
  return principal ? principal[1] : '140'
}
const chromeAndroid = modelo => `Mozilla/5.0 (Linux; Android 14; ${modelo}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${versaoDoChromium()}.0.0.0 Mobile Safari/537.36`
const chromeAndroidTablet = modelo => `Mozilla/5.0 (Linux; Android 14; ${modelo}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${versaoDoChromium()}.0.0.0 Safari/537.36`
const chromeWindows = () => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${versaoDoChromium()}.0.0.0 Safari/537.36`

const fontePw = descritor => `aparelho "${descritor}" do Playwright 1.61 (área da página, tela e densidade); ` +
  'polegadas e pixels físicos: de memória, não conferidos'
const FONTE_MONITOR = 'resolução comum de monitor, densidade 1 (sem escala do sistema)'

const GRUPOS = [
  { id: 'desktop', rotulo: 'Desktop' },
  { id: 'widescreen', rotulo: 'Widescreen' },
  { id: 'tablet', rotulo: 'Tablet' },
  { id: 'ios', rotulo: 'iOS (imitação)' },
  { id: 'android', rotulo: 'Android (imitação)' },
]

function aparelhos() {
  return comFonte([
    { id: 'desktop-1366', grupo: 'desktop', nome: 'Notebook', sistema: 'Windows', largura: 1366, altura: 768, densidade: 1, movel: false, agente: chromeWindows(), fonte: FONTE_MONITOR },
    { id: 'desktop-1920', grupo: 'desktop', nome: 'Full HD', sistema: 'Windows', largura: 1920, altura: 1080, densidade: 1, movel: false, agente: chromeWindows(), fonte: FONTE_MONITOR },
    { id: 'wide-2560', grupo: 'widescreen', nome: 'Ultrawide', sistema: 'Windows', largura: 2560, altura: 1080, densidade: 1, movel: false, agente: chromeWindows(), fonte: FONTE_MONITOR },
    { id: 'wide-3440', grupo: 'widescreen', nome: 'Ultrawide QHD', sistema: 'Windows', largura: 3440, altura: 1440, densidade: 1, movel: false, agente: chromeWindows(), fonte: FONTE_MONITOR },
    { id: 'ipad-mini', grupo: 'tablet', nome: 'iPad mini', sistema: 'iPadOS', polegadas: 7.9, pixels: [1536, 2048], largura: 768, altura: 1024, paisagem: [1024, 768], densidade: 2, movel: true, agente: SAFARI_IPAD, descritor: 'iPad Mini' },
    { id: 'ipad-pro-11', grupo: 'tablet', nome: 'iPad Pro 11', sistema: 'iPadOS', polegadas: 11, pixels: [1668, 2388], largura: 834, altura: 1194, paisagem: [1194, 834], densidade: 2, movel: true, agente: SAFARI_IPAD, descritor: 'iPad Pro 11' },
    { id: 'galaxy-tab-s9', grupo: 'tablet', nome: 'Galaxy Tab S9', sistema: 'Android', polegadas: 11, pixels: [1600, 2560], largura: 640, altura: 1024, paisagem: [1024, 640], densidade: 2.5, movel: true, agente: chromeAndroidTablet('SM-X710'), descritor: 'Galaxy Tab S9' },
    { id: 'iphone-se', grupo: 'ios', nome: 'iPhone SE (2ª/3ª geração)', sistema: 'iOS', polegadas: 4.7, pixels: [750, 1334], largura: 375, altura: 667, paisagem: [667, 375], densidade: 2, movel: true, agente: SAFARI_IPHONE, descritor: 'iPhone SE (3rd gen)' },
    { id: 'iphone-15', grupo: 'ios', nome: 'iPhone 15', sistema: 'iOS', polegadas: 6.1, pixels: [1179, 2556], largura: 393, altura: 659, tela: [393, 852], paisagem: [734, 343], densidade: 3, movel: true, agente: SAFARI_IPHONE, descritor: 'iPhone 15' },
    { id: 'iphone-15-pro-max', grupo: 'ios', nome: 'iPhone 15 Pro Max', sistema: 'iOS', polegadas: 6.7, pixels: [1290, 2796], largura: 430, altura: 739, tela: [430, 932], paisagem: [814, 380], densidade: 3, movel: true, agente: SAFARI_IPHONE, descritor: 'iPhone 15 Pro Max' },
    { id: 'galaxy-s24', grupo: 'android', nome: 'Galaxy S24', sistema: 'Android', polegadas: 6.2, pixels: [1080, 2340], largura: 360, altura: 780, paisagem: [780, 360], densidade: 3, movel: true, agente: chromeAndroid('SM-S921U'), descritor: 'Galaxy S24' },
    { id: 'pixel-8', grupo: 'android', nome: 'Pixel 8', sistema: 'Android', polegadas: 6.2, pixels: [1080, 2400], largura: 412, altura: 839, tela: [412, 915], paisagem: [863, 360], densidade: 2.625, movel: true, agente: chromeAndroid('Pixel 8'), descritor: 'Pixel 8' },
    { id: 'galaxy-a55', grupo: 'android', nome: 'Galaxy A55', sistema: 'Android', polegadas: 6.6, pixels: [1080, 2340], largura: 480, altura: 1040, paisagem: [1040, 480], densidade: 2.25, movel: true, agente: chromeAndroid('SM-A556B'), descritor: 'Galaxy A55' },
    { id: 'pixel-8-pro', grupo: 'android', nome: 'Pixel 8 Pro', sistema: 'Android', polegadas: 6.7, pixels: [1344, 2992], largura: 448, altura: 921, tela: [448, 997], paisagem: [945, 396], densidade: 3, movel: true, agente: chromeAndroid('Pixel 8 Pro'), descritor: 'Pixel 8 Pro' },
  ])
}

/** A fonte que a dica mostra: a dos celulares e tablets sai do nome do descritor, para não haver duas cópias. */
function comFonte(lista) {
  return lista.map(a => a.descritor ? { ...a, fonte: fontePw(a.descritor) } : a)
}

const polegadas = n => String(n).replace('.', ',') + '"'
const densidade = n => String(n).replace('.', ',') + 'x'

/** O que aparece ao lado do nome: polegadas (celular e tablet), tela em px CSS, densidade. */
function descricao(a, paisagem) {
  const [l, h] = medidas(a, paisagem)
  return [a.polegadas ? polegadas(a.polegadas) : null, `${l}×${h}`, densidade(a.densidade)].filter(Boolean).join(' · ')
}

/** Largura e altura da PÁGINA que valem agora: celular e tablet giram (com a área de paisagem do descritor); monitor não. */
function medidas(a, paisagem) {
  if (!(paisagem && a.movel)) return [a.largura, a.altura]
  return Array.isArray(a.paisagem) ? a.paisagem : [a.altura, a.largura]
}

/** Os comandos do CDP que aplicam um aparelho (o núcleo converte os dois primeiros no perfil dele). */
function comandosDoAparelho(a, paisagem) {
  const [width, height] = medidas(a, paisagem)
  return [
    { method: 'Emulation.setDeviceMetricsOverride', params: { width, height, deviceScaleFactor: a.densidade, mobile: a.movel } },
    { method: 'Emulation.setUserAgentOverride', params: { userAgent: a.agente } },
    { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: a.movel, maxTouchPoints: a.movel ? 5 : 1 } },
    // O agente novo só vale na próxima navegação: recarregar faz a página ler o aparelho inteiro de uma vez.
    { method: 'Page.reload', params: {} },
  ]
}

/** Os comandos que devolvem a página ao tamanho do painel, sem aparelho. */
function comandosSemAparelho() {
  return [
    { method: 'Emulation.clearDeviceMetricsOverride', params: {} },
    { method: 'Emulation.setUserAgentOverride', params: { userAgent: '' } },
    { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: false } },
    { method: 'Page.reload', params: {} },
  ]
}

/** Endereço digitado → endereço navegável. Sem esquema: `localhost`/IP vão por http, o resto por https. */
function normalizarEndereco(texto) {
  const t = String(texto || '').trim()
  if (!t) return null
  // ⚠️ `localhost:8080` PARECE ter esquema (`localhost:`). O endereço local é conferido antes; esquema só
  // vale com `//` depois, ou nos três que não levam (`about:`, `data:`, `file:`).
  if (/^(localhost|127(\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(t)) return 'http://' + t
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) || /^(about|data|file):/i.test(t)) return t
  return 'https://' + t
}

const AVISO = 'iOS e Android imitam tela, densidade, toque e agente do navegador. O motor é o Chromium, não o Safari.'

/**
 * Uma sessão CDP de uma aba. A sessão da API é do "navegador" inteiro: primeiro se prende à página
 * (`Target.attachToTarget`, `flatten`) e os comandos seguintes levam o `sessionId` dela.
 */
function criarConexao(sessao) {
  let proximo = 1
  const pendentes = new Map()
  let fechada = false
  const inscricoes = [
    sessao.onDidReceiveMessage(m => {
      if (!m || typeof m.id !== 'number' || !pendentes.has(m.id)) return
      const { resolver, rejeitar } = pendentes.get(m.id)
      pendentes.delete(m.id)
      if (m.error) rejeitar(new Error(m.error.message || 'erro do CDP'))
      else resolver(m.result || {})
    }),
    sessao.onDidClose(() => {
      fechada = true
      for (const { rejeitar } of pendentes.values()) rejeitar(new Error('a sessão do navegador fechou'))
      pendentes.clear()
    }),
  ]
  function enviar(method, params, sessionId) {
    if (fechada) return Promise.reject(new Error('a sessão do navegador fechou'))
    const id = proximo++
    return new Promise((resolver, rejeitar) => {
      pendentes.set(id, { resolver, rejeitar })
      const msg = { id, method, params: params || {} }
      if (sessionId) msg.sessionId = sessionId
      Promise.resolve(sessao.sendMessage(msg)).catch(e => { pendentes.delete(id); rejeitar(e) })
      setTimeout(() => { if (pendentes.has(id)) { pendentes.delete(id); rejeitar(new Error(`o navegador não respondeu a ${method}`)) } }, 10000)
    })
  }
  let pagina = null
  async function sessaoDaPagina() {
    if (pagina) return pagina
    const { targetInfos = [] } = await enviar('Target.getTargets')
    const alvo = targetInfos.find(t => t.type === 'page') || targetInfos[0]
    if (!alvo) throw new Error('a aba não tem página')
    const { sessionId } = await enviar('Target.attachToTarget', { targetId: alvo.targetId, flatten: true })
    pagina = sessionId
    return pagina
  }
  return {
    get fechada() { return fechada },
    async rodar(comandos) {
      const sid = await sessaoDaPagina()
      for (const c of comandos) await enviar(c.method, c.params, sid)
    },
    fechar() {
      fechada = true
      for (const i of inscricoes) try { i.dispose() } catch { /* nada */ }
      try { sessao.close() } catch { /* nada */ }
    },
  }
}

/**
 * @param vscode a API do editor
 * @param {{ anotar?: (evento: string, dados?: object) => void }} [opcoes]
 */
function criarNavegador(vscode, opcoes = {}) {
  const anotar = opcoes.anotar || (() => { })
  const lista = aparelhos()
  const aoMudar = new vscode.EventEmitter()
  const conexoes = new Map() // aba -> conexão
  let atual = null           // id do aparelho aplicado por último
  let paisagem = false
  let ultimaAba = null
  let ultimoEndereco = ''

  const apiDisponivel = () => !!(vscode.window && typeof vscode.window.openBrowserTab === 'function')

  function explicarSemApi() {
    vscode.window.showErrorMessage('O navegador integrado não está disponível nesta instalação: a extensão da OFICINA não recebeu a API do navegador do editor.')
  }

  function abaAlvo() {
    const w = vscode.window
    if (w.activeBrowserTab) return w.activeBrowserTab
    const abertas = w.browserTabs || []
    if (ultimaAba && abertas.includes(ultimaAba)) return ultimaAba
    return abertas.length ? abertas[abertas.length - 1] : null
  }

  async function conexaoDa(aba) {
    const existente = conexoes.get(aba)
    if (existente && !existente.fechada) return existente
    const c = criarConexao(await aba.startCDPSession())
    conexoes.set(aba, c)
    return c
  }

  async function aplicarNa(aba) {
    const a = lista.find(x => x.id === atual)
    const c = await conexaoDa(aba)
    await c.rodar(a ? comandosDoAparelho(a, paisagem) : comandosSemAparelho())
  }

  async function abrir(url) {
    if (!apiDisponivel()) { explicarSemApi(); return null }
    const aba = await vscode.window.openBrowserTab(url, { viewColumn: vscode.ViewColumn.Beside })
    ultimaAba = aba
    ultimoEndereco = url
    anotar('navegador.abrir')
    // Aparelho já escolhido vale para a página nova: quem escolheu "iPhone 15" quer ver a próxima também nele.
    if (atual) await aplicarNa(aba).catch(e => anotar('navegador.erro', { etapa: 'abrir', erro: String(e && e.message) }))
    return aba
  }

  async function abrirEndereco(endereco) {
    let texto = typeof endereco === 'string' ? endereco : await vscode.window.showInputBox({
      title: 'Abrir no navegador',
      prompt: 'Endereço da página (ex.: localhost:5173 ou exemplo.com.br)',
      value: ultimoEndereco || 'http://localhost:',
    })
    const url = normalizarEndereco(texto)
    if (!url) return null
    return abrir(url)
  }

  async function abrirHtmlDoEditor() {
    const ed = vscode.window.activeTextEditor
    const doc = ed && ed.document
    const ehHtml = doc && doc.uri && doc.uri.scheme === 'file' && (doc.languageId === 'html' || /\.html?$/i.test(doc.uri.fsPath || ''))
    if (!ehHtml) {
      vscode.window.showInformationMessage('Abra um arquivo .html no editor e clique de novo: ele abre no navegador ao lado.')
      return null
    }
    return abrir(doc.uri.toString())
  }

  async function emular(id) {
    const a = lista.find(x => x.id === id)
    if (!a && id !== null) return false
    if (!apiDisponivel()) { explicarSemApi(); return false }
    let aba = abaAlvo()
    if (!aba) {
      atual = id
      aoMudar.fire()
      aba = await abrirEndereco()
      return !!aba
    }
    const anterior = atual
    atual = id
    try {
      await aplicarNa(aba)
      ultimaAba = aba
      anotar('navegador.emular', { aparelho: id || 'janela', paisagem })
      aoMudar.fire()
      return true
    } catch (e) {
      atual = anterior
      anotar('navegador.erro', { etapa: 'emular', erro: String(e && e.message) })
      vscode.window.showErrorMessage(`Não consegui aplicar o aparelho: ${e && e.message}`)
      return false
    }
  }

  /**
   * V27 — CELULAR E COMPUTADOR LADO A LADO (item 1c dos pedidos de 25/09).
   *
   * Pedido dele: *"visualizador nativo que imite o mobile pra ver como ta ficando um codigo pra versão
   * desktop e mobile"*. Até aqui era UMA aba com UM aparelho: para comparar, trocava-se o aparelho e
   * a página de antes sumia. Aqui são duas abas da mesma página, cada uma com a SUA conexão e o SEU
   * aparelho — a conexão já era por aba (`conexoes`), então nada no resto da vista muda.
   *
   * O que abre: o `.html` do editor, se houver; senão o último endereço; senão pergunta. Os aparelhos
   * padrão são os de uso mais comum aqui (iPhone 15 e Notebook); outros continuam a um clique na vista.
   */
  async function ladoALado({ celular = 'iphone-15', computador = 'desktop-1366' } = {}) {
    if (!apiDisponivel()) { explicarSemApi(); return null }
    const ed = vscode.window.activeTextEditor
    const doc = ed && ed.document
    const html = doc && doc.uri && doc.uri.scheme === 'file' && /\.html?$/i.test(doc.uri.fsPath || '') ? doc.uri.toString() : null
    const url = html || ultimoEndereco || normalizarEndereco(await vscode.window.showInputBox({
      title: 'Celular e computador lado a lado',
      prompt: 'Endereço da página (ex.: localhost:5173 ou exemplo.com.br)',
      value: 'http://localhost:',
    }))
    if (!url) return null
    const [aCel, aPc] = [lista.find(x => x.id === celular), lista.find(x => x.id === computador)]
    if (!aCel || !aPc) return null
    // O computador ao lado do editor, e o celular ao lado DELE: três colunas — código, computador, celular.
    const abaPc = await vscode.window.openBrowserTab(url, { viewColumn: vscode.ViewColumn.Beside })
    const abaCel = await vscode.window.openBrowserTab(url, { viewColumn: vscode.ViewColumn.Beside })
    ultimoEndereco = url
    ultimaAba = abaCel
    const erros = []
    for (const [aba, a] of [[abaPc, aPc], [abaCel, aCel]]) {
      try { await (await conexaoDa(aba)).rodar(comandosDoAparelho(a, false)) }
      catch (e) { erros.push(`${a.nome}: ${e && e.message}`) }
    }
    anotar('navegador.ladoALado', { celular, computador, erros: erros.length })
    // Falha em aplicar um aparelho não fica calada: a aba estaria no tamanho do painel fingindo ser o aparelho.
    if (erros.length) vscode.window.showErrorMessage('Não consegui aplicar o aparelho em: ' + erros.join(' · '))
    return { abaPc, abaCel, erros }
  }

  async function girar() {
    paisagem = !paisagem
    aoMudar.fire()
    const a = lista.find(x => x.id === atual)
    if (a && a.movel && abaAlvo()) return emular(atual)
    return true
  }

  // ── a vista ──

  function acao(id, rotulo, icone, comando, dica, args) {
    const t = new vscode.TreeItem(rotulo, vscode.TreeItemCollapsibleState.None)
    t.id = 'acao:' + id
    t.iconPath = new vscode.ThemeIcon(icone)
    t.tooltip = dica
    t.command = { command: comando, title: rotulo, arguments: args || [] }
    t.filhos = []
    return t
  }

  function itemDoAparelho(a) {
    const t = new vscode.TreeItem(a.nome, vscode.TreeItemCollapsibleState.None)
    t.id = 'aparelho:' + a.id
    const ativo = a.id === atual
    t.description = descricao(a, paisagem) + (ativo ? ' — em uso' : '')
    t.iconPath = new vscode.ThemeIcon(ativo ? 'check' : a.grupo === 'desktop' || a.grupo === 'widescreen' ? 'device-desktop' : 'device-mobile')
    const [l, h] = medidas(a, paisagem)
    t.tooltip = [
      `${a.nome} (${a.sistema})`,
      `${l}×${h} px CSS para a página · densidade ${densidade(a.densidade)}${a.pixels ? ` · ${a.pixels[0]}×${a.pixels[1]} px físicos` : ''}`,
      ...(Array.isArray(a.tela) ? [`A tela inteira tem ${paisagem ? a.tela[1] + '×' + a.tela[0] : a.tela.join('×')} px CSS; o resto fica com as barras do navegador e do sistema.`] : []),
      a.movel ? 'Toque ligado' : 'Mouse (sem toque)',
      '', `Fonte: ${a.fonte}`,
    ].join('\n')
    t.command = { command: 'oficina.navegador.emular', title: 'Imitar este aparelho', arguments: [a.id] }
    t.filhos = []
    return t
  }

  function raiz() {
    const itens = [
      acao('endereco', 'Abrir endereço…', 'globe', 'oficina.navegador.abrirEndereco', 'Abre uma página no navegador integrado, ao lado do editor.'),
      acao('html', 'Abrir o HTML do editor', 'file-code', 'oficina.navegador.abrirHtml', 'Abre no navegador o arquivo .html que está aberto no editor.'),
      acao('ladoALado', 'Celular e computador lado a lado', 'split-horizontal', 'oficina.navegador.ladoALado', 'Abre a mesma página duas vezes: uma como Notebook e outra como iPhone 15, lado a lado. O celular é imitação: tela, densidade e toque do iPhone, no motor do Chrome — não é o Safari.'),
      acao('janela', atual ? 'Tamanho do painel (sem aparelho)' : 'Tamanho do painel — em uso', atual ? 'screen-full' : 'check', 'oficina.navegador.emular', 'Volta a página ao tamanho do painel, com o agente do navegador de sempre.', [null]),
      acao('girar', paisagem ? 'Girar para retrato' : 'Girar para paisagem', 'sync', 'oficina.navegador.girar', 'Troca largura e altura de celulares e tablets.'),
    ]
    for (const g of GRUPOS) {
      const t = new vscode.TreeItem(g.rotulo, vscode.TreeItemCollapsibleState.Expanded)
      t.id = 'grupo:' + g.id
      t.filhos = lista.filter(a => a.grupo === g.id).map(itemDoAparelho)
      itens.push(t)
    }
    return itens
  }

  const provedor = {
    onDidChangeTreeData: aoMudar.event,
    getTreeItem: t => t,
    getChildren: t => (t ? t.filhos || [] : raiz()),
  }

  function descartar() {
    for (const c of conexoes.values()) c.fechar()
    conexoes.clear()
  }

  function esquecerAba(aba) {
    const c = conexoes.get(aba)
    if (c) c.fechar()
    conexoes.delete(aba)
    if (ultimaAba === aba) ultimaAba = null
  }

  return {
    provedor, aparelhos: lista, emular, girar, abrirEndereco, abrirHtmlDoEditor, ladoALado, esquecerAba, descartar,
    get atual() { return atual }, get paisagem() { return paisagem },
  }
}

module.exports = { criarNavegador, aparelhos, comandosDoAparelho, comandosSemAparelho, normalizarEndereco, descricao, medidas, GRUPOS, AVISO }
