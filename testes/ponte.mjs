// A PONTE — o roteamento entre a tela e o motor, testado em node puro.
//
// ⚠️ ESTE ARQUIVO EXISTE POR CAUSA DE UM DEFEITO GRAVE QUE PASSOU POR TUDO.
//
// A V2 tinha 43 critérios de motor (`rodar.mjs`, que para em `agente.js`) e 12 de tela
// (`painel.mjs`, que para no DOM). **Ninguém testava a costura**: o `switch` de
// `onDidReceiveMessage` em `extensao.js`, que liga um lado ao outro.
//
// E era justamente lá que estava o pior defeito da versão: o `case 'modo'` NÃO EXISTIA.
// A pessoa escolhia "faz tudo sem perguntar", o seletor mudava, o aviso permanente
// aparecia na conversa — e o agente continuava perguntando, em `default`. A tela mentia
// sobre a única coisa que ela precisa acertar. Dois revisores independentes acharam o
// mesmo defeito em 10/09/2026 (duas revisões independentes); nenhum dos 55 critérios
// verdes o pegou, e o critério que dizia cobrir o modo só fazia `grep` do nome de um
// método dentro do motor — comportamento ausente, critério aprovado.
//
// A lição, que vale além deste arquivo: **testar as duas pontas não testa o fio.**
//
// ⚠️ Como isto roda sem o editor: `extensao.js` faz `require('vscode')`, que só existe
// dentro do Electron. Aqui o módulo é interceptado no carregador do Node e substituído
// por um dublê — a mesma ideia do dublê do SDK em `rodar.mjs`. Assim a ponte inteira é
// exercitada em milissegundos, e a camada mais barata de testar deixa de ser a única
// sem teste.
//
// Uso:  node testes/ponte.mjs
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import Module from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
// V19 — carregar um modulo da extensao pelo caminho, sem o duble do editor no meio.
const requererPonteDoLimite = caminho => requerer(caminho)

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 180) + ')' : ''}`)
}
const esperar = ms => new Promise(r => setTimeout(r, ms))
async function ate(condicao, tetoMs = 2000) {
  const fim = Date.now() + tetoMs
  while (Date.now() < fim) { if (condicao()) return true; await esperar(10) }
  return condicao()
}

// ── O dublê do `vscode` ───────────────────────────────────────────────────────
const registro = {
  comandos: new Map(),
  rodados: [],
  mensagensParaTela: [],
  aviso: null,
  statusBar: [],
  painelCriado: null,
  config: {},
  contextos: [],
  // V3 — a revisão no editor
  diffs: [],            // os `vscode.diff` pedidos (argumentos)
  mostrados: [],        // os `showTextDocument` pedidos (o arquivo real, antes de o SDK gravar)
  provedores: {},       // esquema -> provedor registrado
  codelens: null,       // o provedor de CodeLens (os botões de cada trecho)
  documentos: [],       // os `workspace.textDocuments` (o teste diz qual está aberto e se está sujo)
  edicoes: [],          // os `applyEdit` recebidos
  abasFechadas: 0,
  // V4 — o terminal dos comandos
  terminais: [],        // cada `createTerminal` (nome, pty, se foi mostrado)
  escritoNoTerminal: '',// tudo que o pseudoterminal escreveu, junto
  // V8 — socorro e login
  erros: [],
  itensDoSocorro: null,
  escolhaDoSocorro: null,
  aoFecharTerminal: [],
  // V10
  barras: [],
  arvores: {},
  // V11
  filaDeEscolhas: [],
  caixaDeTexto: null,
  respostaDoTexto: undefined,
  avisosDeCuidado: [],
  respostaDoCuidado: undefined,
  estadoGlobal: {},
  // V12
  visoes: {},
  decoracoes: [],
  aoFocar: [],
  estadoDaPasta: {},
  // V13
  informacoes: [],
  filaDeInformacoes: [],
  pedidosDeSessao: [],
  sessaoDoGithub: null,       // a sessão que já existe (entrada silenciosa)
  entradaDoGithub: null,      // o que a entrada com fluxo devolve: sessão, ou um Error para lançar
  // V17
  objetosDaVista: {},
}

let aoReceberDaTela = null

/** Um painel de mentira: o criado pela abertura e o devolvido pelo serializer são iguais. */
function painelFalso(titulo) {
  return {
    title: titulo,
    webview: {
      html: '',
      options: {},
      cspSource: 'vscode-resource:',
      asWebviewUri: u => ({ toString: () => 'vscode-resource://' + u.fsPath }),
      postMessage: m => { registro.mensagensParaTela.push(m); return Promise.resolve(true) },
      onDidReceiveMessage: fn => { aoReceberDaTela = fn; return { dispose() { } } },
    },
    // V8 — `dispose` avisa quem ouve, como o editor faz: é o que o "Reabrir a conversa" do socorro espera.
    _aoFechar: [],
    onDidDispose(fn) { this._aoFechar.push(fn); return { dispose() { } } },
    dispose() { for (const fn of this._aoFechar) fn() },
    reveal: () => { },
    viewColumn: 1,
    iconPath: null,
  }
}

const fsDaPonte = requerer('fs')
const vscodeFalso = {
  Uri: {
    file: p => ({ fsPath: p, toString: () => 'file://' + p, scheme: 'file' }),
    from: ({ scheme, path: caminho }) => ({ scheme, path: caminho, toString: () => scheme + ':' + caminho }),
  },
  ViewColumn: { One: 1, Beside: -2 },
  Position: class { constructor(l, c) { this.line = l; this.character = c } },
  Selection: class { constructor(a, b) { this.anchor = a; this.active = b } },
  Range: class { constructor(a, b) { this.start = a; this.end = b } },
  TextEditorRevealType: { InCenter: 2 },
  // V3 — o que a revisão no editor usa
  EventEmitter: class {
    constructor() { this._ouvintes = []; this.event = fn => { this._ouvintes.push(fn); return { dispose() { } } } }
    fire(x) { for (const f of this._ouvintes) f(x) }
    dispose() { }
  },
  Disposable: class { constructor(f) { this._f = f } dispose() { if (this._f) this._f() } },
  FileType: { File: 1 },
  EndOfLine: { LF: 1, CRLF: 2 },
  FileChangeType: { Changed: 1 },
  FileSystemError: { NoPermissions: m => new Error(m) },
  CodeLens: class { constructor(range, command) { this.range = range; this.command = command } },
  ThemeIcon: class { constructor(id) { this.id = id } },
  // V10 — a tela de tokens
  StatusBarAlignment: { Left: 1, Right: 2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class { constructor(label, estado) { this.label = label; this.collapsibleState = estado } },
  // V12 — as skills
  ThemeColor: class { constructor(id) { this.id = id } },
  DataTransferItem: class { constructor(v) { this.value = v } },
  // V11 — os layouts
  QuickPickItemKind: { Separator: -1, Default: 0 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  // O `applyEdit` falso GRAVA no disco o texto da troca — faz o papel do editor que aplica e salva.
  WorkspaceEdit: class { constructor() { this.trocas = [] } replace(uri, faixa, texto) { this.trocas.push({ uri, faixa, texto }) } },
  // V13 — a conta do GitHub. `silent` só consulta; `createIfNone` é o fluxo de entrada (o código de dispositivo).
  authentication: {
    getSession: async (provedor, escopos, opcoes = {}) => {
      registro.pedidosDeSessao.push({ provedor, escopos: [...escopos], opcoes })
      if (opcoes.silent) return registro.sessaoDoGithub
      if (registro.entradaDoGithub instanceof Error) throw registro.entradaDoGithub
      return registro.entradaDoGithub
    },
  },
  languages: { registerCodeLensProvider: (seletor, provedor) => { registro.codelens = provedor; return { dispose() { } } } },
  commands: {
    registerCommand: (nome, fn) => { registro.comandos.set(nome, fn); return { dispose() { } } },
    executeCommand: async (nome, ...args) => {
      registro.rodados.push(nome)
      if (nome === 'setContext') registro.contextos.push(args)
      if (nome === 'vscode.diff') registro.diffs.push(args)
      if (nome === 'claude-vscode.editor.open') throw new Error('nao instalada')
      return undefined
    },
  },
  window: {
    createWebviewPanel: (tipo, titulo) => {
      const painel = painelFalso(titulo)
      registro.painelCriado = painel
      return painel
    },
    // V13: as informações ficam guardadas com os argumentos (a explicação do GitHub é modal), e a resposta
    // sai de uma fila — vazia, devolve `undefined`, que é o que a pessoa que fecha a janela devolve.
    showInformationMessage: async (msg, ...resto) => {
      registro.aviso = msg
      registro.informacoes.push({ msg, resto })
      return registro.filaDeInformacoes.length ? registro.filaDeInformacoes.shift() : undefined
    },
    showErrorMessage: async (msg) => { registro.erros.push(msg); return undefined },
    // V8 — o socorro. O teste escolhe o item pelo id antes de chamar.
    // V11: uma FILA de escolhas, para os fluxos que abrem duas listas seguidas (excluir: qual? e confirma).
    showQuickPick: async (itens) => {
      registro.itensDoSocorro = itens
      const alvo = registro.filaDeEscolhas.length ? registro.filaDeEscolhas.shift() : registro.escolhaDoSocorro
      return itens.find(i => i.id === alvo || i.label === alvo)
    },
    showInputBox: async (opcoes) => { registro.caixaDeTexto = opcoes; return registro.respostaDoTexto },
    showWarningMessage: async (msg, ...resto) => { registro.avisosDeCuidado.push(msg); return registro.respostaDoCuidado },
    onDidCloseTerminal: fn => { registro.aoFecharTerminal.push(fn); return { dispose() { registro.aoFecharTerminal = registro.aoFecharTerminal.filter(f => f !== fn) } } },
    setStatusBarMessage: (m) => { registro.statusBar.push(m) },
    /*
      V4 — o terminal dos comandos. O dublê não finge o pseudoterminal: ele LIGA o `onDidWrite` num
      acumulador, e é assim que a ponte consegue medir o que a pessoa veria na tela do terminal —
      a linha do comando, a saída e o rodapé — sem abrir o editor.
    */
    createTerminal: opcoes => {
      const t = { nome: opcoes && opcoes.name, pty: opcoes && opcoes.pty, shellPath: opcoes && opcoes.shellPath, mostrado: 0, descartado: 0 }
      registro.terminais.push(t)
      if (t.pty && t.pty.onDidWrite) t.pty.onDidWrite(texto => { registro.escritoNoTerminal += texto })
      /*
        ⚠️ O `open()` vem DEPOIS, e isso não é capricho do dublê: é o comportamento do editor de
        verdade, medido em 11/09/2026. Abrir um terminal é assíncrono, e até o editor abrir não há
        ninguém ouvindo o `onDidWrite` — a linha do comando, escrita logo depois do
        `createTerminal`, caía no vazio e o terminal mostrava a saída sem dizer QUE COMANDO rodou.
        Um dublê que abre na hora deixa esse defeito invisível, que foi exatamente o que aconteceu:
        a ponte estava verde e o editor de verdade, vermelho.
      */
      if (t.pty && t.pty.open) setTimeout(() => t.pty.open(), 30)
      t.objeto = { show() { t.mostrado++ }, sendText() { }, dispose() { t.descartado++ } }
      return t.objeto
    },
    registerWebviewPanelSerializer: (tipo, s) => { registro.serializador = s; return { dispose() { } } },
    createStatusBarItem: () => {
      const b = { text: '', tooltip: '', visivel: false, show() { this.visivel = true }, hide() { this.visivel = false }, dispose() { } }
      registro.barras.push(b)
      return b
    },
    registerTreeDataProvider: (id, provedor) => { registro.arvores[id] = provedor; return { dispose() { } } },
    // V17: o objeto da vista fica guardado — é nele que a extensão escreve a frase do topo (`message`).
    createTreeView: (id, opcoes) => { registro.arvores[id] = opcoes.treeDataProvider; registro.visoes[id] = opcoes
      // A vista Tokens nasce ESCONDIDA, como no executável: medido no build 1 da V18, em perfil limpo a barra
      // secundária abre com o contêiner do chat do núcleo ativo e a aba Tokens sem selecionar.
      const vista = { dispose() { }, visible: id !== 'oficina.tokens', ouvintes: [], revelados: [],
        onDidChangeVisibility: fn => { vista.ouvintes.push(fn); return { dispose() { } } },
        reveal: async (elemento, opcoesDoReveal) => { vista.revelados.push({ elemento, opcoes: opcoesDoReveal }); vista.visible = true } }
      registro.objetosDaVista[id] = vista; return vista },
    registerFileDecorationProvider: provedor => { registro.decoracoes.push(provedor); return { dispose() { } } },
    onDidChangeWindowState: fn => { registro.aoFocar.push(fn); return { dispose() { } } },
    showTextDocument: async (uri, opcoes) => { registro.mostrados.push({ uri, opcoes })
      return { selection: null, revealRange() { } } },
    tabGroups: { all: [], activeTabGroup: null, close: async () => { registro.abasFechadas++; return true } },
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: REPO } }],
    // A configuração do produto, controlável pelo teste (padrão: tudo desligado).
    getConfiguration: () => ({
      get: (chave, padrao) => (chave in registro.config ? registro.config[chave] : padrao),
      inspect: chave => ({ globalValue: registro.config[chave] }),
      update: async (chave, valor) => { if (valor === undefined) delete registro.config[chave]; else registro.config[chave] = valor },
    }),
    // Um documento de mentira que lê o disco — o suficiente para a revisão medir e salvar.
    openTextDocument: async uri => {
      const caminho = uri && uri.fsPath
      const texto = () => { try { return fsDaPonte.readFileSync(caminho, 'utf8') } catch { return '' } }
      return { uri, getText: texto, positionAt: i => new vscodeFalso.Position(0, i), save: async () => true,
        eol: /\r\n/.test(texto()) ? 2 : 1 }
    },
    get textDocuments() { return registro.documentos },
    applyEdit: async edicao => {
      registro.edicoes.push(edicao)
      for (const t of edicao.trocas || []) fsDaPonte.writeFileSync(t.uri.fsPath, t.texto)
      return true
    },
    registerTextDocumentContentProvider: (esquema, p) => { registro.provedores[esquema] = p; return { dispose() { } } },
    registerFileSystemProvider: (esquema, p) => { registro.provedores[esquema] = p; return { dispose() { } } },
    onDidChangeConfiguration: () => ({ dispose() { } }),
  },
}

// Intercepta `require('vscode')` — e SÓ ele.
const carregarOriginal = Module._load
Module._load = function (pedido, pai, ehPrincipal) {
  if (pedido === 'vscode') return vscodeFalso
  return carregarOriginal.apply(this, arguments)
}

const extensao = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'))

// ── Ligar a extensão com um contexto de mentira ───────────────────────────────
// V8 — o registro em disco da ativação vai para uma pasta descartável.
const PASTA_DO_REGISTRO = fsDaPonte.mkdtempSync(path.join(requerer('os').tmpdir(), 'oficina-ponte-registro-'))
const contexto = {
  logUri: { fsPath: PASTA_DO_REGISTRO },
  globalState: { get: k => registro.estadoGlobal[k], update: async (k, v) => { registro.estadoGlobal[k] = v } },
  workspaceState: { get: k => registro.estadoDaPasta[k], update: async (k, v) => { registro.estadoDaPasta[k] = v } },
  subscriptions: [],
  extension: { id: 'oficina.oficina-claude' },
  extensionPath: path.join(REPO, 'extensoes', 'oficina-claude'),
}
/*
  ⚠️ A CONVERSA NA BARRA DA DIREITA, ANTES DA ATIVACAO (V24).

  Este valor e posto de proposito para exercitar `forcarConversaNoCentro()`. Ele imita o estado
  real da maquina dele: a extensao oficial GRAVA `preferredLocation: "sidebar"` sozinha — o
  comando `claude-vscode.sidebar.open` comeca com `setPreferredLocation("sidebar")`, e e ele que
  roda ao CLICAR no icone dela. Um clique sem intencao nenhuma virava padrao permanente, e o
  padrao do produto (`panel`, no product.json) nunca mais valia, porque padrao de produto perde
  para a camada de quem usa.
*/
registro.config['preferredLocation'] = 'sidebar'

await extensao.activate(contexto)

checar('a extensao ativa sem erro fora do editor', true)
checar('⛔ V24: a conversa VOLTA para o centro — `preferredLocation` sai de "sidebar" e vira "panel"',
  registro.config['preferredLocation'] === 'panel', String(registro.config['preferredLocation']))
/*
  E O INVERSO, que e o que impede a funcao de sujar o arquivo de quem usa a cada abertura: ela so
  escreve quando ha o que desfazer.

  ⚠️ ESTE CRITERIO LE O CORPO DA FUNCAO, e isso e mais fraco que medir comportamento — esta
  declarado aqui para ninguem confundir os dois. Medir de verdade exigiria uma SEGUNDA ativacao com
  outro estado de configuracao, e esta ponte ativa a extensao uma vez so, de proposito (a ativacao
  registra comandos e vistas, e ativar duas vezes mediria um mundo que nao existe). O que se cobra
  e a guarda: sem ela, toda abertura escreveria `panel` por cima de `panel`.
*/
const fonteDaExtensao = fsDaPonte.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'), 'utf8')
const corpoDoCentro = fonteDaExtensao.slice(fonteDaExtensao.indexOf('function forcarConversaNoCentro()'))
/*
  ⚠️ E A BARRA DA DIREITA FECHA NA ABERTURA (t204).

  O padrao `secondarySideBar.defaultVisibility: hidden` so vale enquanto o perfil nao tem layout
  salvo; depois que ela abre uma vez, o layout salvo manda e ela volta em toda abertura. Foi o que
  ele viu depois de instalar a V24, com a conversa ocupando a direita da tela.

  O criterio cobra o COMANDO, que e o que a extensao controla — nao o pixel, que so a tela prova.
  Ha criterio de tela para isso em `tela_toggle_da_barra.mjs` ("a barra da DIREITA continua
  fechada"), e la ele ja passa.
*/
/*
  ⚠️ O DETALHE DIZ POR QUAL CAMINHO O CRITERIO PASSOU, e isso importa: ha dois, e eles provam
  coisas diferentes. Se a ponte registra os comandos EXECUTADOS, o criterio mede comportamento; se
  nao registra, ele cai em ler o codigo — que e mais fraco, e tem de aparecer escrito. Um verde que
  diz "o comando foi chamado" sem ter visto chamada nenhuma e do mesmo tipo do que ja foi pago
  nesta sessao: o OK que vinha com a frase do caso ruim ao lado.
*/
const comandosExecutados = registro.comandosChamados || registro.executados || null
const fechouADireita = comandosExecutados
  ? comandosExecutados.includes('workbench.action.closeAuxiliaryBar')
  : /closeAuxiliaryBar/.test(fonteDaExtensao)
checar('⛔ V24: a abertura fecha a barra da direita (ele nao quer essa aba)', fechouADireita,
  comandosExecutados ? 'medido: o comando foi EXECUTADO na ativacao'
    : 'lido no codigo (esta ponte nao registra comandos executados) — a tela prova em tela_toggle_da_barra')

checar('⛔ V24: e so escreve quando ha o que desfazer (nao suja o arquivo de quem usa a toa)',
  /globalValue === 'sidebar'/.test(corpoDoCentro.slice(0, 900)),
  corpoDoCentro.slice(0, 200).replace(/\s+/g, ' '))

checar('o comando da conversa foi registrado', registro.comandos.has('oficina.abrirConversaOuExplicar'))
checar('o comando de parar o agente foi registrado', registro.comandos.has('oficina.pararAgente'))
checar('o caminho de volta para a extensao oficial foi registrado',
  registro.comandos.has('oficina.abrirConversaOficial'))
checar('o comando de nova conversa foi registrado', registro.comandos.has('oficina.novaConversa'))

// ── O painel abre, e a tela recebe HTML de verdade ───────────────────────────
await registro.comandos.get('oficina.abrirPainel')()
const painel = registro.painelCriado
checar('abrir a conversa cria o painel', !!painel)
checar('o HTML do painel foi montado', !!painel && painel.webview.html.includes('<!DOCTYPE html>'))
checar('a CSP entrou no HTML com nonce',
  !!painel && /script-src 'nonce-[A-Za-z0-9+/=]+'/.test(painel.webview.html))
checar('nenhum marcador ficou por substituir no HTML',
  !!painel && !/__CSP__|__CSS__|__JS__|__NONCE__/.test(painel.webview.html),
  painel && (painel.webview.html.match(/__[A-Z]+__/) || ['limpo'])[0])
checar('a tela recebe o ouvinte de mensagens', typeof aoReceberDaTela === 'function')

// ── ⛔ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR ───────────────────────────
//
// A tela manda `{tipo:'modo'}`. Se o host não tratar, nada acontece e a tela fica
// mostrando um modo que o motor não tem.
{
  registro.mensagensParaTela.length = 0
  await aoReceberDaTela({ tipo: 'modo', modo: 'plan' })
  await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'modo'), 3000)
  const resposta = registro.mensagensParaTela.filter(m => m.tipo === 'modo').pop()

  checar('⛔ trocar o modo CHEGA ao host (o `case` existe)', !!resposta,
    resposta ? `respondeu ${resposta.modo}` : 'o host ENGOLIU a mensagem: a tela mente sobre o modo')

  // ⚠️ E a resposta tem que dizer o que está VALENDO, não o que foi pedido — senão a
  // tela desenha o pedido e diverge do motor no primeiro erro.
  checar('a resposta do modo traz o estado real (campo `modo`)',
    !!resposta && typeof resposta.modo === 'string', resposta && String(resposta.modo))
  checar('a resposta do modo diz se deu certo (campo `ok`)',
    !!resposta && typeof resposta.ok === 'boolean', resposta && String(resposta.ok))
}

// ── As outras mensagens da tela não podem sumir em silêncio ──────────────────
//
// ⚠️ Este critério é o guarda-chuva do defeito acima: ele lista o que a TELA manda e
// exige que o host conheça cada um. Um `case` novo esquecido no futuro cai aqui.
/*
  ⚠️ ESTE CRITÉRIO JÁ FUROU POR QUATRO CAMINHOS, e a revisao final mostrou cada um
  (10/09/2026). A primeira versão casava `postMessage({ tipo: '<literal>'` e lia só
  `painel.js` × `extensao.js`. Os furos:

    (a) TIPO DINÂMICO. `painel.js` manda `{ tipo: (acao && acao.tipo) || 'tentarDeNovo' }`.
        O regex não casava, então `tentarDeNovo` e `abrirPasta` ficavam FORA da conta —
        o critério dizia "7 tipos" quando a tela manda 9.
    (b) HOST→TELA NÃO ERA COBERTO. O critério lia os eventos só de `agente.js`, e o
        `extensao.js` manda `semPasta` e `naoEnviei` direto para a tela. Evento nascido
        no host escapava inteiro — os dois estavam desenhados por sorte.
    (c) VERDE POR ACIDENTE. O lado da tela contava TODO `case '…'` do arquivo. Hoje há
        um `switch` só; um segundo (por estado, digamos) passaria a "cobrir" eventos
        que ninguém desenha.
    (d) Só `painel.js` era lido — um segundo script na pasta `painel/` não seria visto.

  O conserto: extrair TODOS os literais de string que aparecem na expressão do `tipo:`
  (não só quando ela é um literal puro), varrer a pasta `painel/` inteira, e ler os dois
  lados do host — `agente.js` E `extensao.js`.
*/
{
  const fs = requerer('node:fs')
  const semComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  // (d) a pasta inteira, não um arquivo.
  const pastaPainel = path.join(REPO, 'extensoes', 'oficina-claude', 'painel')
  const tela = fs.readdirSync(pastaPainel).filter(f => f.endsWith('.js'))
    .map(f => semComentarios(fs.readFileSync(path.join(pastaPainel, f), 'utf8'))).join('\n')

  /** (a) todos os literais dentro da expressão do `tipo:`, seja ela qual for. */
  const tiposDe = (texto, chamada) => {
    const achados = new Set()
    const re = new RegExp(chamada + '\\(\\s*\\{[\\s\\S]{0,400}?\\btipo:\\s*([^,\\n}]+)', 'g')
    for (const m of texto.matchAll(re)) {
      for (const lit of m[1].matchAll(/'([a-zA-Z_]+)'/g)) achados.add(lit[1])
    }
    return [...achados]
  }

  /*
    ⚠️ NA TELA, TODO `tipo:` É MENSAGEM PARA O HOST — então o extrator lê o arquivo
    inteiro, e não só o que está dentro de um `postMessage`.

    O furo que isto fecha (a revisao final apontou, e a primeira correção não bastou):
    `abrirPasta` é passado como ARGUMENTO — `mostrarErro(msg, { tipo: 'abrirPasta' })` —
    e só vira `postMessage` lá dentro, numa expressão. Nenhum regex ancorado no
    `postMessage` jamais o veria. Ler todo `tipo:` do arquivo pega os dois casos.

    A troca: se um dia existir aqui um `tipo:` que NÃO seja mensagem para o host, ele
    entra na conta e o critério cobra um `case` que não precisa existir. É o erro
    barato: cobra a mais, nunca a menos.
  */
  //
  // ⚠️ A UNIÃO DOS DOIS EXTRATORES, e não um ou outro — cada um pega o que o outro
  // perde, e trocar um pelo outro só move o furo de lugar:
  //   `tipo: 'x'` no arquivo   → pega `abrirPasta`, que viaja como ARGUMENTO
  //   expressão do postMessage → pega `tentarDeNovo`, que vive num `|| 'literal'`
  // Trocar o primeiro pelo segundo fez `tentarDeNovo` sumir da conta na hora (medido).
  const mandados = [...new Set([
    ...[...tela.matchAll(/\btipo:\s*'([a-zA-Z_]+)'/g)].map(m => m[1]),
    ...tiposDe(tela, 'vscode\\.postMessage'),
  ])]
  const host = semComentarios(fs.readFileSync(
    path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'), 'utf8'))
  const motor = semComentarios(fs.readFileSync(
    path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'), 'utf8'))

  // (c) só o `switch` que trata mensagem da tela, e não todo `case` do arquivo.
  //
  // ⚠️ O BLOCO VAI ATÉ A CHAVE QUE O FECHA, e não 4 000 caracteres. A janela fixa cortou o `switch` da
  // tela quando a V3 acrescentou um `case` (11/09/2026): `nota`, `modo` e `opcoes` saíram da janela e o
  // critério acusou a tela de ignorar o que ela sempre desenhou. Aumentar o número só adiaria o mesmo
  // falso vermelho para o próximo `case`.
  const blocoDoSwitch = (texto, marca) => {
    const i = texto.indexOf(marca)
    if (i < 0) return ''
    const abre = texto.indexOf('{', i)
    if (abre < 0) return ''
    let profundidade = 0
    for (let k = abre; k < texto.length; k++) {
      if (texto[k] === '{') profundidade++
      else if (texto[k] === '}' && --profundidade === 0) return texto.slice(i, k + 1)
    }
    return texto.slice(i)
  }
  const tratados = [...blocoDoSwitch(host, 'onDidReceiveMessage').matchAll(/case '([a-zA-Z_]+)':/g)]
    .map(m => m[1])

  const orfaos = mandados.filter(t => !tratados.includes(t))
  checar('toda mensagem que a TELA manda tem `case` no host', orfaos.length === 0,
    orfaos.length ? 'sem tratamento: ' + orfaos.join(', ') : `${mandados.length} tipos, todos tratados`)
  // ⚠️ Guarda contra o critério encolher em silêncio: se o extrator parar de achar os
  // tipos, "0 órfãos" ficaria verde sem medir nada.
  checar('o extrator de tipos ainda enxerga a tela (nao virou lista vazia)',
    mandados.length >= 9, `${mandados.length} tipos: ${mandados.join(', ')}`)

  // (b) o inverso, dos DOIS lados do host: motor E extensão.
  const emitidos = [...new Set([
    ...tiposDe(motor, 'this\\.aoEvento'),
    ...tiposDe(host, 'painel\\.webview\\.postMessage'),
    ...tiposDe(host, 'enviarParaTela'),
  ])]
  const desenhados = [...blocoDoSwitch(tela, "switch (m.tipo)").matchAll(/case '([a-zA-Z_]+)':/g)]
    .map(m => m[1])
  // `aviso` é de propósito só do host (vai para o log, não para a tela). `comandos` (V12) também: é a lista
  // da vista "Skills", e o host a desvia antes da tela — o critério V12 lá embaixo prova que ela não chega.
  // `limite` (V19) é o terceiro: o limite é da CONTA, não desta conversa, e quem o desenha é a barra de
  // cima. O critério V19 lá embaixo prova que ele não chega à tela da conversa.
  const SO_DO_HOST = ['aviso', 'comandos', 'limite']
  const ignorados = emitidos.filter(t => !desenhados.includes(t) && !SO_DO_HOST.includes(t))
  checar('todo evento que o HOST manda (motor E extensao) a tela sabe desenhar',
    ignorados.length === 0,
    ignorados.length ? 'a tela ignora: ' + ignorados.join(', ') : `${emitidos.length} eventos cobertos`)
  checar('o extrator de eventos ainda enxerga o host (nao virou lista vazia)',
    emitidos.length >= 10, `${emitidos.length} eventos: ${emitidos.join(', ')}`)
}

// ── A recusa de envio VOLTA para a tela — o terceiro caso do mesmo defeito ────
//
// ⚠️ Este critério nasceu de a revisao final apontar que o conserto entrou sem trava
// (`grep -rl naoEnviei testes/` devolvia nada). Foi a TERCEIRA vez nesta versão em que
// uma mensagem sumia sem ninguém ser avisado — e nada impedia a quarta.
{
  registro.mensagensParaTela.length = 0
  // O painel foi criado agora e a conversa ainda não recebeu `pronto`: `enviar()`
  // recusa, e é exatamente esse caminho que precisa responder.
  await aoReceberDaTela({ tipo: 'enviar', texto: 'uma frase que nao pode sumir' })
  await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'naoEnviei'), 2000)
  const recusa = registro.mensagensParaTela.filter(m => m.tipo === 'naoEnviei').pop()
  checar('envio recusado VOLTA para a tela (nao some em silencio)', !!recusa,
    recusa ? `estado ${recusa.estado}` : 'o host engoliu a recusa')
  checar('a recusa devolve o TEXTO, para a pessoa nao reescrever',
    !!recusa && recusa.texto === 'uma frase que nao pode sumir', recusa && recusa.texto)
}

// ── O NOME DA CONVERSA NA ABA, e a NOVA CONVERSA — o desenho que ele ditou ────
//
// ⚠️ Pedido dele em 05/09/2026, com a OFICINA aberta: "o nome da conversa fica no lugar
// do nome ... sem uma segunda barra ... e a ÚNICA coisa nessa barra além da guia da
// conversa, é o ícone ... pra gerar nova conversa". A V2 foi construída sem isto e
// nenhum critério cobrava: o requisito e a tela nunca tinham sido postos lado a lado.
//
// Para exercitar o envio ACEITO sem abrir o SDK, o `enviar` da conversa é trocado por
// um que aceita — o mesmo módulo que a extensão carregou, pelo cache do `require`.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))

  // O bloco anterior mandou um envio que foi RECUSADO.
  checar('a aba nasce "Nova conversa", e envio recusado nao da nome a ela',
    painel.title === 'Nova conversa', painel.title)

  const enviarOriginal = Conversa.prototype.enviar
  const aceitas = []
  Conversa.prototype.enviar = function () { aceitas.push(this); return true }
  try {
    await aoReceberDaTela({ tipo: 'enviar', texto: '\n   Arrume   o README\nsegunda linha' })
    checar('a primeira mensagem ACEITA da nome a aba (primeira linha, espacos colapsados)',
      painel.title === 'Arrume o README', painel.title)
    await aoReceberDaTela({ tipo: 'enviar', texto: 'outra coisa' })
    checar('a segunda mensagem nao renomeia a aba', painel.title === 'Arrume o README', painel.title)

    const velha = aceitas[0]
    registro.mensagensParaTela.length = 0
    await registro.comandos.get('oficina.novaConversa')()
    checar('nova conversa: a aba volta a "Nova conversa"', painel.title === 'Nova conversa', painel.title)
    checar('nova conversa: a tela recebe a ordem de limpar',
      registro.mensagensParaTela.some(m => m.tipo === 'limpar'))

    // O fantasma: um evento atrasado da conversa encerrada não pode chegar à tela.
    registro.mensagensParaTela.length = 0
    velha.aoEvento({ tipo: 'texto', texto: 'fantasma' })
    checar('evento da conversa ANTERIOR nao chega a tela depois da nova',
      !registro.mensagensParaTela.some(m => m.texto === 'fantasma'))

    // CONTROLE POSITIVO: sem ele, um filtro que bloqueasse TUDO passaria no de cima.
    await aoReceberDaTela({ tipo: 'enviar', texto: 'x'.repeat(80) })
    const nova = aceitas[aceitas.length - 1]
    nova.aoEvento({ tipo: 'texto', texto: 'de verdade' })
    checar('CONTROLE POSITIVO: evento da conversa NOVA chega a tela',
      nova !== velha && registro.mensagensParaTela.some(m => m.texto === 'de verdade'))
    checar('nome longo e cortado com reticencias (ate 40 caracteres)',
      painel.title.length <= 40 && painel.title.endsWith('…'), `${painel.title.length}: ${painel.title}`)
  } finally {
    Conversa.prototype.enviar = enviarOriginal
  }

  // O botão mora na barra da ABA, e só quando a aba ativa é a conversa.
  const fs = requerer('node:fs')
  const manifesto = JSON.parse(fs.readFileSync(
    path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const naAba = ((manifesto.contributes.menus || {})['editor/title'] || [])
    .find(e => e.command === 'oficina.novaConversa')
  checar('o botao de nova conversa esta na barra da aba, so com a conversa ativa',
    !!naAba && /activeWebviewPanelId == 'oficina\.conversa'/.test(naAba.when || ''),
    naAba ? naAba.when : 'nao esta em menus/editor/title')
}

// ── O modo que pula aprovação só existe com a configuração ligada ─────────────
//
// ⚠️ Medido em 10/09/2026, noite: o seletor oferecia `bypassPermissions` e o produto não
// conseguia ligá-lo. A saída escolhida é a da extensão oficial — a opção só aparece com a
// configuração ligada de propósito. Aqui se prova o fio: o host lê a configuração, conta
// à tela, e a conversa nasce com a chave certa. O `iniciar` é trocado por um que não
// abre o SDK — o que se testa é o roteamento, não o agente.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  Conversa.prototype.iniciar = async function () { }
  try {
    registro.config = {}
    await registro.comandos.get('oficina.novaConversa')()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    const desligada = registro.mensagensParaTela.filter(m => m.tipo === 'opcoes').pop()
    checar('sem a configuracao, o host diz a tela que NAO ha modo que pula aprovacao',
      !!desligada && desligada.pularAprovacao === false, JSON.stringify(desligada || 'nenhuma mensagem de opcoes'))

    // CONTROLE POSITIVO: com a configuração ligada, a conversa NOVA nasce liberada.
    registro.config = { permitirPularAprovacao: true }
    await registro.comandos.get('oficina.novaConversa')()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    const ligada = registro.mensagensParaTela.filter(m => m.tipo === 'opcoes').pop()
    checar('CONTROLE POSITIVO: com a configuracao ligada, a conversa nova oferece o modo',
      !!ligada && ligada.pularAprovacao === true, JSON.stringify(ligada || 'nenhuma mensagem de opcoes'))
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    registro.config = {}
  }
}

// ── O padrão que transforma caminho citado em link não pode travar a tela ─────
//
// ⚠️ Medido em 10/09/2026, noite (a revisão de segurança travou um benchmark nele): sem
// teto nas repetições, 40 mil caracteres de `a/a/a…` sem extensão custavam 3,3 s — com a
// webview parada. O padrão mora na tela (`painel.js`); aqui ele é extraído do fonte e
// cronometrado contra as entradas que o travavam. CONTROLE POSITIVO: os caminhos bons
// continuam virando link — um padrão que não casasse nada passaria no tempo.
{
  const fs = requerer('node:fs')
  const src = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'painel', 'painel.js'), 'utf8')
  const ini = src.indexOf('const PADRAO_CAMINHO')
  const fim = src.indexOf("'gu')", ini) + 5
  let padrao = null
  try { padrao = (0, eval)('(' + src.slice(ini, fim).replace('const PADRAO_CAMINHO =', '') + ')') } catch { }
  checar('o padrao de caminho foi achado e compilado a partir da tela', padrao instanceof RegExp)
  if (padrao instanceof RegExp) {
    const B = String.fromCharCode(92)
    const adversos = [
      'a/'.repeat(20000) + 'b', 'a' + '.'.repeat(40000), '-/'.repeat(20000),
      'C:' + B + 'a.'.repeat(20000), 'a'.repeat(40000),
    ]
    let pior = 0
    for (const txt of adversos) {
      const t0 = Date.now(); padrao.lastIndex = 0; let c = 0
      while (padrao.exec(txt) && c < 5) c++
      pior = Math.max(pior, Date.now() - t0)
    }
    checar('40 mil caracteres adversos nao travam a tela (pior caso < 1 s)', pior < 1000, `${pior} ms`)
    const bons = {
      ['abri D:' + B + 'Meus Projetos' + B + 'x.md e segui']: 'D:' + B + 'Meus Projetos' + B + 'x.md',
      'veja src/painel/painel.js:12': 'src/painel/painel.js',
      './docs/relatório.md': './docs/relatório.md',
      'pasta🚀/x.md': 'pasta🚀/x.md',
      'baixe x/pacote.tar.gz': 'x/pacote.tar.gz',
    }
    const errados = Object.entries(bons).filter(([t, esperado]) => {
      padrao.lastIndex = 0; const m = padrao.exec(t); return !m || m[0] !== esperado
    }).map(([t]) => t)
    checar('CONTROLE POSITIVO: os caminhos bons continuam virando link', errados.length === 0,
      errados.length ? 'nao casou: ' + errados.join(' | ') : `${Object.keys(bons).length} casos`)
  }
}

// ── Abrir arquivo citado: o código de segurança novo da V2 ───────────────────
{
  registro.statusBar.length = 0
  await aoReceberDaTela({ tipo: 'abrirArquivo', caminho: '../../Windows/System32/config/SAM' })
  const recusou = registro.statusBar.some(m => /sai da pasta/i.test(m))
  checar('caminho relativo que SAI da pasta e recusado', recusou,
    registro.statusBar.join(' | ') || 'nada na barra de status')

  // CONTROLE POSITIVO: um caminho relativo legítimo, dentro da pasta, não é recusado
  // pelo mesmo motivo. Sem isto, "recusou" ficaria verde com uma função que recusa tudo.
  registro.statusBar.length = 0
  await aoReceberDaTela({ tipo: 'abrirArquivo', caminho: 'package.json' })
  const recusouLegitimo = registro.statusBar.some(m => /sai da pasta/i.test(m))
  checar('CONTROLE POSITIVO: caminho dentro da pasta NAO e recusado por "sair da pasta"',
    !recusouLegitimo, registro.statusBar.join(' | ') || 'nada na barra de status')
}

// ── Mensagem desconhecida não pode derrubar o host ───────────────────────────
{
  let explodiu = false
  try { await aoReceberDaTela({ tipo: 'coisaQueNaoExiste' }) } catch { explodiu = true }
  try { await aoReceberDaTela(null) } catch { explodiu = true }
  try { await aoReceberDaTela({}) } catch { explodiu = true }
  checar('mensagem estranha da tela nao derruba o host', !explodiu)
}

// ── Permissão: a resposta vale só para a conversa que fez o pedido ───────────
//
// ⚠️ Achado pela revisão de segurança (10/09/2026, noite), medido em node: cada conversa
// numerava os pedidos a partir de `p1`, e o host entregava a resposta da tela à conversa
// CORRENTE. Um "Permitir" em trânsito do cartão da conversa encerrada podia aprovar um
// pedido DIFERENTE, que ninguém viu, da conversa nova com o mesmo id.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this) }
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const a = abertas[abertas.length - 1]
    // ⚠️ `Read`, e nao `Bash`: desde a V4 um comando aprovado RODA DE VERDADE (pelo terminal), e
    // este criterio e sobre a identidade do pedido entre conversas — nao sobre executar nada.
    const promessaA = a._pedirPermissao('Read', { file_path: path.join(REPO, 'README.md') }, {})
    const idA = [...a._permissoes.keys()][0]

    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const b = abertas[abertas.length - 1]
    await promessaA
    let respostaB = null
    const promessaB = b._pedirPermissao('Read', { file_path: path.join(REPO, 'LICENSE') }, {}).then(r => (respostaB = r))
    const idB = [...b._permissoes.keys()][0]
    checar('permissao: o id do pedido nao se repete entre conversas', !!a && !!b && a !== b && idA !== idB,
      `A=${idA} B=${idB}`)

    await aoReceberDaTela({ tipo: 'permissao', id: idA, decisao: 'permitir' })
    await esperar(50)
    checar('⛔ permissao: a resposta ao cartao da conversa ANTERIOR nao aprova o pedido da nova',
      respostaB === null && b._permissoes.has(idB), JSON.stringify(respostaB))

    // CONTROLE POSITIVO: a resposta com o id DELA aprova — sem isto, um host que não
    // entregasse resposta nenhuma passaria no de cima.
    await aoReceberDaTela({ tipo: 'permissao', id: idB, decisao: 'permitir' })
    await Promise.race([promessaB, esperar(500)])
    checar('CONTROLE POSITIVO: a resposta ao cartao da conversa corrente aprova',
      !!respostaB && respostaB.behavior === 'allow', JSON.stringify(respostaB))
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
  }
}

// ── Permissão: resposta que não é uma das três NEGA (falha fechada) ──────────
//
// ⚠️ Revisão de segurança (10/09/2026, noite): o `else` aprovava QUALQUER valor —
// `undefined`, `""`, `"NEGAR"` maiúsculo. Hoje os três botões mandam valores fixos; o
// padrão seguro é negar o que não se reconhece, para o próximo botão ou atalho errado.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const c = new Conversa({ cwd: REPO, aoEvento: () => { } })
  const responder = async decisao => {
    const p = c._pedirPermissao('Bash', { command: 'x' }, {})
    c.responderPermissao([...c._permissoes.keys()].pop(), decisao)
    return (await p).behavior
  }
  const estranhas = [undefined, null, '', 'NEGAR', 'nao', 'permitirTudo', 0, {}]
  const aprovadas = []
  for (const d of estranhas) if (await responder(d) !== 'deny') aprovadas.push(JSON.stringify(d) ?? 'undefined')
  checar('permissao: resposta desconhecida NEGA (falha fechada)', aprovadas.length === 0,
    aprovadas.length ? 'aprovou: ' + aprovadas.join(', ') : `${estranhas.length} casos negados`)

  // CONTROLE POSITIVO: os três botões de verdade continuam valendo.
  const r = { permitir: await responder('permitir'), permitir_sempre: await responder('permitir_sempre'), negar: await responder('negar') }
  checar('CONTROLE POSITIVO: Permitir, Sempre permitir e Nao continuam valendo',
    r.permitir === 'allow' && r.permitir_sempre === 'allow' && r.negar === 'deny', JSON.stringify(r))
}

// ── Abrir arquivo citado: caminho de REDE não é tocado ───────────────────────
//
// ⚠️ Revisão de segurança (10/09/2026, noite): `path.isAbsolute` é verdadeiro para
// `\\servidor\pasta\x.md`, e o `statSync` tentaria alcançar o servidor — no Windows isso
// pode negociar SMB e entregar o hash da senha (NTLM). Hoje o padrão da tela não gera link
// de rede; a função que abre é que não pode depender disso. `.invalid` é reservado: nenhum
// servidor de verdade é procurado por este teste.
{
  const B = String.fromCharCode(92)
  const ler = () => registro.statusBar.join(' | ') || 'nada na barra de status'
  registro.statusBar.length = 0
  const t0 = Date.now()
  await aoReceberDaTela({ tipo: 'abrirArquivo', caminho: B + B + 'oficina-teste.invalid' + B + 'pasta' + B + 'x.md' })
  checar('caminho de REDE citado e recusado sem ser tocado', registro.statusBar.some(m => /rede/i.test(m)),
    `${Date.now() - t0} ms; ${ler()}`)

  registro.statusBar.length = 0
  await aoReceberDaTela({ tipo: 'abrirArquivo', caminho: '//oficina-teste.invalid/pasta/x.md' })
  checar('caminho de rede com barra normal tambem e recusado', registro.statusBar.some(m => /rede/i.test(m)), ler())

  // CONTROLE POSITIVO: absoluto LOCAL continua abrindo (decisão registrada: o agente cita
  // caminho absoluto o tempo todo em trabalho de verdade).
  registro.statusBar.length = 0
  let abriu = null
  const abrirOriginal = vscodeFalso.workspace.openTextDocument
  vscodeFalso.workspace.openTextDocument = async u => { abriu = u && u.fsPath; return {} }
  try {
    await aoReceberDaTela({ tipo: 'abrirArquivo', caminho: path.join(REPO, 'package.json') })
  } finally {
    vscodeFalso.workspace.openTextDocument = abrirOriginal
  }
  checar('CONTROLE POSITIVO: caminho absoluto LOCAL continua abrindo', !!abriu && /package\.json$/.test(abriu),
    abriu || ler())
}

// ── A tela RECARREGADA com a conversa viva: o host conta o modo que vale ─────
//
// ⚠️ Revisão de código (10/09/2026, noite), medido em node: quando a webview recarrega sem o
// painel morrer (o editor descarta e recria a tela), o script roda de novo e o seletor volta
// a "pergunta sempre" — mas a conversa do host é a MESMA, no modo que a pessoa escolheu. O
// host respondia ao `pronto` só com `opcoes`: a tela mentia, e para o lado perigoso.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  try {
    await registro.comandos.get('oficina.novaConversa')()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    const c = abertas[abertas.length - 1]
    // CONTROLE: na abertura normal, a conversa abre e ninguém fala em recarga.
    checar('CONTROLE: na abertura, a conversa abre e o host nao fala em recarga',
      !!c && !registro.mensagensParaTela.some(m => m.tipo === 'nota' && /recarreg/i.test(m.texto)),
      registro.mensagensParaTela.map(m => m.tipo).join(', '))

    c.modo = 'acceptEdits'
    const quantas = abertas.length
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })   // a tela recarregou; a conversa é a mesma
    const tipos = registro.mensagensParaTela.map(m => m.tipo).join(', ')
    const pronto = registro.mensagensParaTela.filter(m => m.tipo === 'pronto').pop()
    const est = registro.mensagensParaTela.filter(m => m.tipo === 'estado').pop()
    checar('⛔ tela recarregada: o host reenvia o modo QUE VALE', !!pronto && pronto.modo === 'acceptEdits', tipos)
    checar('tela recarregada: o host reenvia o estado da conversa', !!est && est.estado === 'ociosa', tipos)
    checar('tela recarregada: a conversa NAO e reaberta', abertas.length === quantas, `${abertas.length - quantas} abertura(s) a mais`)
    checar('tela recarregada: a tela e avisada de que o historico nao aparece',
      registro.mensagensParaTela.some(m => m.tipo === 'nota' && /recarreg/i.test(m.texto)), tipos)
    checar('tela recarregada (controle): conversa com login nao ganha o cartao de entrar',
      !registro.mensagensParaTela.some(m => m.tipo === 'semLogin'), tipos)

    // ⚠️ Revisão de código (16/09/2026): sem login, a tela recarregada nascia sem o cartão, e a próxima
    // fala voltava sem texto, sem erro e sem botão.
    c.semLogin = true
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    checar('⛔ tela recarregada sem login: o host redesenha o cartao de entrar na conta',
      registro.mensagensParaTela.some(m => m.tipo === 'semLogin'), registro.mensagensParaTela.map(m => m.tipo).join(', '))
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
  }
}

// ── "Tentar de novo" depois de conversar: o agente recomeçou do zero, e a tela diz ──
//
// ⚠️ Revisão de código (10/09/2026, noite), medido em node: o processo do agente cai no meio
// da conversa → "Tentar de novo" → uma sessão NOVA e vazia nasce debaixo das falas antigas, e
// nada na tela diz que o agente não lembra de nada. A mesma mentira da aba restaurada, por
// outra porta. As falas FICAM (podem ser úteis para reler); o que entra é a linha que conta.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const enviarOriginal = Conversa.prototype.enviar
  const abertas = []
  Conversa.prototype.iniciar = async function () {
    if (this.estado !== 'parada' && this.estado !== 'erro') return
    abertas.push(this); this.estado = 'ociosa'
  }
  Conversa.prototype.enviar = function () { return true }
  const recomecou = () => registro.mensagensParaTela.some(m => m.tipo === 'nota' && /do zero/i.test(m.texto))
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const c = abertas[abertas.length - 1]

    // CONTROLE: erro na ABERTURA (ninguém conversou ainda) — reabrir não é recomeço.
    c.estado = 'erro'
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'tentarDeNovo' })
    checar('CONTROLE: tentar de novo antes de qualquer mensagem nao fala em recomeco', !recomecou())

    await aoReceberDaTela({ tipo: 'enviar', texto: 'Arrume o README' })
    c.estado = 'erro'
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'tentarDeNovo' })
    checar('⛔ tentar de novo depois de conversar: a tela e avisada de que o agente recomecou do zero', recomecou(),
      registro.mensagensParaTela.map(m => m.tipo + (m.texto ? ':' + m.texto.slice(0, 40) : '')).join(' | ') || 'nada')

    // E se NADA recomeçou (a conversa estava viva), não há recomeço para anunciar.
    await aoReceberDaTela({ tipo: 'enviar', texto: 'outra coisa' })
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'tentarDeNovo' })
    checar('tentar de novo com a conversa viva nao anuncia recomeco (nada recomecou)', !recomecou())
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.enviar = enviarOriginal
  }
}

// ── Resposta de permissão que o host recusa VOLTA para a tela ────────────────
//
// ⚠️ Revisão de código (10/09/2026, noite): a tela marca o cartão ("Permitido.") ANTES de o
// host responder; se o pedido já tinha sido retirado, o `false` do motor era ignorado e o
// cartão ficava dizendo "Permitido." sobre uma ação negada. Toda recusa volta para a tela.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const c = abertas[abertas.length - 1]

    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'permissao', id: 'c999-p9', decisao: 'permitir' })
    checar('resposta de permissao que o host recusa volta para a tela',
      registro.mensagensParaTela.some(m => m.tipo === 'permissaoNaoValeu' && m.id === 'c999-p9'),
      registro.mensagensParaTela.map(m => m.tipo).join(', ') || 'nada')

    // CONTROLE POSITIVO: a resposta que VALE não gera o aviso.
    const p = c._pedirPermissao('Bash', { command: 'x' }, {})
    const id = [...c._permissoes.keys()].pop()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'permissao', id, decisao: 'negar' })
    await Promise.race([p, esperar(500)])
    checar('CONTROLE POSITIVO: a resposta que vale nao gera o aviso',
      !registro.mensagensParaTela.some(m => m.tipo === 'permissaoNaoValeu'), registro.mensagensParaTela.map(m => m.tipo).join(', '))
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
  }
}

// ── O logo da edição da equipe no "Nova conversa" — sem mexer na neutra ──────
//
// O botão de nova conversa usa o logo do Claude na edição da equipe (uso próprio). O logo é
// marca de terceiro e este repositório vira público: o ARQUIVO mora só na camada da equipe,
// que sobrepõe `painel/marca-equipe.svg`. A extensão liga uma chave de contexto se o arquivo
// existir, e o menu da aba mostra um botão ou o outro. A neutra continua com o `$(add)`.
{
  const fs = requerer('node:fs')
  const manifesto = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const equipe = manifesto.contributes.commands.find(c => c.command === 'oficina.novaConversaEquipe')
  const naAba = manifesto.contributes.menus['editor/title'] || []
  const neutra = naAba.find(e => e.command === 'oficina.novaConversa')
  const daEquipe = naAba.find(e => e.command === 'oficina.novaConversaEquipe')
  checar('logo: existe o comando da equipe, com o icone do arquivo',
    !!equipe && JSON.stringify(equipe.icon || '').includes('marca-equipe.svg'), JSON.stringify(equipe && equipe.icon))
  checar('logo: na aba, o botao da neutra so SEM a marca, e o da equipe so COM ela',
    !!neutra && /!oficina\.marcaDaEquipe/.test(neutra.when || '') &&
    !!daEquipe && /oficina\.marcaDaEquipe/.test(daEquipe.when || '') && !/!oficina\.marcaDaEquipe/.test(daEquipe.when || ''),
    `${neutra && neutra.when} | ${daEquipe && daEquipe.when}`)
  checar('logo: o comando da equipe nao aparece duplicado na paleta',
    ((manifesto.contributes.menus.commandPalette || []).find(e => e.command === 'oficina.novaConversaEquipe') || {}).when === 'false')
  checar('logo: o comando da equipe foi registrado', registro.comandos.has('oficina.novaConversaEquipe'))
  checar('logo: o ARQUIVO do logo NAO esta no repositorio publico',
    !fs.existsSync(path.join(REPO, 'extensoes', 'oficina-claude', 'painel', 'marca-equipe.svg')))
  const chave = registro.contextos.find(c => c[0] === 'oficina.marcaDaEquipe')
  checar('logo: sem o arquivo (edicao neutra), a chave de contexto e FALSA', !!chave && chave[1] === false, JSON.stringify(chave))
}

// ── Tela recarregada com um pedido de permissão PENDENTE: o cartão volta ─────
//
// ⚠️ Revisão final (11/09/2026): a recarga reenviava modo, estado e conta, mas não os pedidos
// pendentes — a caixa dizia "Há uma decisão esperando por você" e não havia cartão; o agente
// ficava parado num pedido que ninguém via.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  const tipos = () => registro.mensagensParaTela.map(m => m.tipo).join(', ') || 'nada'
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const c = abertas[abertas.length - 1]

    // CONTROLE: sem pedido pendente, a recarga não inventa cartão.
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    checar('CONTROLE: tela recarregada sem pedido pendente nao ganha cartao',
      !registro.mensagensParaTela.some(m => m.tipo === 'permissao'), tipos())

    const p = c._pedirPermissao('Write', { file_path: 'a.txt' }, {})
    const id = [...c._permissoes.keys()].pop()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    checar('⛔ tela recarregada com pedido pendente: o cartao volta',
      registro.mensagensParaTela.some(m => m.tipo === 'permissao' && m.pedido && m.pedido.id === id), tipos())
    c.responderPermissao(id, 'negar')
    await Promise.race([p, esperar(300)])
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
  }
}

// ── V3: a proposta vai para o EDITOR, a tela recebe o resumo, e a decisão volta ao motor ──
//
// O fio inteiro em node: o motor de verdade (com o SDK desligado), a revisão de verdade, o `vscode`
// de mentira. Os casos do PROMPTS §V3 que são do editor: arquivo sujo e o que cada botão faz.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  const pasta = fsDaPonte.mkdtempSync(path.join(process.env.TEMP || REPO, 'oficina-ponte-v3-'))
  const arq = path.join(pasta, 'r.txt')
  const pedidoNaTela = () => registro.mensagensParaTela.filter(m => m.tipo === 'permissao').pop()
  const resolvido = p => Promise.race([p, esperar(1500).then(() => null)])
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const c = abertas[abertas.length - 1]

    // 1. A proposta abre o diff, e a tela recebe o RESUMO.
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.mensagensParaTela.length = 0; registro.diffs.length = 0
    const p1 = c._pedirPermissao('Edit', { file_path: arq, old_string: 'b', new_string: 'B' }, {})
    await ate(() => registro.diffs.length > 0)
    const cartao1 = pedidoNaTela()
    checar('V3 ponte: a proposta abre o DIFF no editor', registro.diffs.length === 1, JSON.stringify(registro.diffs.map(d => d[2])))
    checar('V3 ponte: a tela recebe o resumo, SEM o conteudo do arquivo',
      !!cartao1 && cartao1.pedido.proposta && cartao1.pedido.proposta.trechos === 1 && !('antes' in cartao1.pedido.proposta) &&
      !('new_string' in cartao1.pedido.entrada), JSON.stringify(cartao1 && cartao1.pedido))

    // 2. Os botões do trecho: um trecho pendente → "Aceitar trecho" e "Rejeitar trecho".
    const botoes = registro.codelens.provideCodeLenses({ uri: registro.diffs[0][1], lineCount: 3 })
    checar('V3 ponte: o trecho pendente tem os dois botoes', botoes.length === 2 &&
      botoes[0].command.command === 'oficina.aceitarTrecho' && botoes[1].command.command === 'oficina.rejeitarTrecho',
      botoes.map(l => l.command.title).join(' | '))

    // 3. "Rejeitar tudo" no cartão → deny, o arquivo não muda, a tela ouve a decisão.
    await aoReceberDaTela({ tipo: 'proposta', id: cartao1.pedido.id, decisao: 'nada' })
    const r1 = await resolvido(p1)
    checar('⛔ V3 ponte: "Rejeitar tudo" nega, e o arquivo fica igual (criterio 8)',
      !!r1 && r1.behavior === 'deny' && fsDaPonte.readFileSync(arq, 'utf8') === 'a\nb\nc\n', JSON.stringify(r1))
    checar('V3 ponte: a tela ouve a decisao (propostaDecidida: nada)',
      registro.mensagensParaTela.some(m => m.tipo === 'propostaDecidida' && m.classe === 'nada' && m.id === cartao1.pedido.id))

    // 4. "Aceitar tudo" → allow com a entrada ORIGINAL (quem grava é o SDK).
    registro.diffs.length = 0
    const entrada2 = { file_path: arq, old_string: 'c', new_string: 'C' }
    const p2 = c._pedirPermissao('Edit', entrada2, {})
    await ate(() => registro.diffs.length > 0)
    await aoReceberDaTela({ tipo: 'proposta', id: pedidoNaTela().pedido.id, decisao: 'tudo' })
    const r2 = await resolvido(p2)
    checar('⛔ V3 ponte: "Aceitar tudo" permite com a entrada ORIGINAL',
      !!r2 && r2.behavior === 'allow' && JSON.stringify(r2.updatedInput) === JSON.stringify(entrada2), JSON.stringify(r2))

    // 5. Parcial pelos botões do diff: aceita o 1º trecho, rejeita o 2º → o editor grava só o 1º, e o
    //    agente ouve a verdade.
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\nd\ne\n')
    registro.diffs.length = 0; registro.edicoes.length = 0
    const p3 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\nd\nE\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id3 = pedidoNaTela().pedido.id
    await registro.comandos.get('oficina.aceitarTrecho')(id3, 1)
    await registro.comandos.get('oficina.rejeitarTrecho')(id3, 2)
    const r3 = await resolvido(p3)
    checar('⛔ V3 ponte: parcial grava SO o trecho aceito, pelo editor',
      registro.edicoes.length === 1 && fsDaPonte.readFileSync(arq, 'utf8') === 'a\nB\nc\nd\ne\n', fsDaPonte.readFileSync(arq, 'utf8'))
    checar('V3 ponte: parcial - o agente ouve "1 de 2, ja gravado" num deny',
      !!r3 && r3.behavior === 'deny' && /1 de 2/.test(r3.message) && /JÁ ESTÃO GRAVADOS/.test(r3.message), JSON.stringify(r3))

    // 6. Arquivo aberto e SUJO: recusa na hora, sem diff, e avisa.
    registro.documentos.push({ uri: { scheme: 'file', fsPath: arq }, isDirty: true })
    registro.mensagensParaTela.length = 0; registro.diffs.length = 0
    const r4 = await resolvido(c._pedirPermissao('Edit', { file_path: arq, old_string: 'd', new_string: 'D' }, {}))
    checar('⛔ V3 ponte: arquivo SUJO recusa sem abrir diff, e a tela avisa',
      !!r4 && r4.behavior === 'deny' && /não salvas/.test(r4.message) && registro.diffs.length === 0 &&
      registro.mensagensParaTela.some(m => m.tipo === 'nota' && /não salvas/.test(m.texto)), JSON.stringify(r4))
    registro.documentos.length = 0

    // CONTROLE: o mesmo arquivo aberto e LIMPO abre o diff. E o Parar retira a revisão.
    registro.documentos.push({ uri: { scheme: 'file', fsPath: arq }, isDirty: false })
    registro.diffs.length = 0
    const p5 = c._pedirPermissao('Edit', { file_path: arq, old_string: 'd', new_string: 'D' }, {})
    await ate(() => registro.diffs.length > 0)
    checar('CONTROLE: aberto e limpo, o diff abre', registro.diffs.length === 1)
    const id5 = pedidoNaTela().pedido.id
    c.cancelar()
    const r5 = await resolvido(p5)
    registro.diffs.length = 0
    await aoReceberDaTela({ tipo: 'mostrarProposta', id: id5 })
    checar('V3 ponte: Parar com a revisao aberta nega, e a revisao some (mostrar nao reabre)',
      !!r5 && r5.behavior === 'deny' && registro.diffs.length === 0, JSON.stringify(r5))
    // O que o agente OUVE no Parar diz o que houve e pede para nao repetir sozinho: a sessao do SDK
    // continua viva e a mensagem e o unico lugar em que a OFICINA fala com ele (revisao funcional da V3).
    checar('V3 ponte: a recusa do Parar diz que a PESSOA parou e pede para nao repetir',
      !!r5 && /Parar/.test(r5.message || '') && /repita/i.test(r5.message || ''), JSON.stringify(r5 && r5.message))
    registro.documentos.length = 0

    // 7. Parcial num arquivo CRLF: as linhas que ninguém tocou continuam CRLF (revisão de suposições).
    fsDaPonte.writeFileSync(arq, 'a\r\nb\r\nc\r\nd\r\ne\r\n')
    registro.diffs.length = 0
    const p7 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\nd\nE\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id7 = pedidoNaTela().pedido.id
    await registro.comandos.get('oficina.aceitarTrecho')(id7, 1)
    await registro.comandos.get('oficina.rejeitarTrecho')(id7, 2)
    await resolvido(p7)
    const bytes7 = fsDaPonte.readFileSync(arq, 'utf8')
    checar('⛔ V3 ponte: parcial num arquivo CRLF mantem o CRLF em todas as linhas', bytes7 === 'a\r\nB\r\nc\r\nd\r\ne\r\n', JSON.stringify(bytes7))

    // 8. O arquivo muda NO DISCO enquanto a pessoa revisa (git, outra janela, um script): nada é gravado
    //    por cima — o que ela viu não é mais o que seria gravado.
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0
    const p8 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id8 = pedidoNaTela().pedido.id
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\nMUDANCA DE FORA\n')
    await aoReceberDaTela({ tipo: 'proposta', id: id8, decisao: 'tudo' })
    const r8 = await resolvido(p8)
    checar('⛔ V3 ponte: arquivo que mudou no disco durante a revisao e recusado, e a mudanca de fora fica',
      !!r8 && r8.behavior === 'deny' && /mudou/.test(r8.message) &&
      fsDaPonte.readFileSync(arq, 'utf8') === 'a\nb\nc\nMUDANCA DE FORA\n', JSON.stringify(r8))

    // 9. O arquivo sujo aberto por OUTRO caminho (uma junção de pasta) continua sendo o mesmo arquivo.
    const real = path.join(pasta, 'real')
    fsDaPonte.mkdirSync(real)
    const juncao = path.join(pasta, 'juncao')
    fsDaPonte.symlinkSync(real, juncao, 'junction')
    const arqReal = path.join(real, 'j.txt')
    fsDaPonte.writeFileSync(arqReal, 'x\ny\n')
    registro.documentos.push({ uri: { scheme: 'file', fsPath: path.join(juncao, 'j.txt') }, isDirty: true })
    registro.diffs.length = 0
    const r9 = await resolvido(c._pedirPermissao('Edit', { file_path: arqReal, old_string: 'y', new_string: 'Y' }, {}))
    checar('V3 ponte: arquivo sujo aberto pela JUNCAO e reconhecido (recusa sem diff)',
      !!r9 && r9.behavior === 'deny' && /não salvas/.test(r9.message) && registro.diffs.length === 0, JSON.stringify(r9))
    registro.documentos.length = 0

    // 10. CYBER: "Aceitar tudo" chamado SEM argumento (paleta, outra extensão, link `command:`) não decide
    //     nada — nem pela aba ativa. Só o botão da barra de abas, que passa a uri da proposta.
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0
    const p10 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const uri10 = registro.diffs[0][1]
    vscodeFalso.window.tabGroups.activeTabGroup = { activeTab: { input: { modified: uri10 } } }
    await registro.comandos.get('oficina.aceitarTudo')()
    const r10a = await Promise.race([p10, esperar(400).then(() => null)])
    checar('⛔ cyber: "Aceitar tudo" SEM argumento nao aprova (nem pela aba ativa)', r10a === null, JSON.stringify(r10a))
    await registro.comandos.get('oficina.aceitarTudo')(uri10)
    const r10b = await resolvido(p10)
    checar('CONTROLE: com a uri da proposta (o botao da barra de abas), decide', !!r10b && r10b.behavior === 'allow', JSON.stringify(r10b))
    vscodeFalso.window.tabGroups.activeTabGroup = null

    // 11. Parar NO MEIO da conclusão de um parcial: nada é gravado depois que o pedido morreu (revisão de
    //     código da V3 — o agente ouvia "você cancelou" com o arquivo já gravado).
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\nd\ne\n')
    registro.diffs.length = 0; registro.edicoes.length = 0
    const p11 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\nd\nE\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id11 = pedidoNaTela().pedido.id
    await registro.comandos.get('oficina.aceitarTrecho')(id11, 1)
    const concluindo11 = registro.comandos.get('oficina.rejeitarTrecho')(id11, 2)   // a última decisão: conclui
    c.cancelar()                                                                     // e a pessoa aperta Parar
    await concluindo11
    const r11 = await resolvido(p11)
    checar('⛔ codigo: Parar durante a conclusao de um parcial NAO grava depois que o pedido morreu',
      !!r11 && fsDaPonte.readFileSync(arq, 'utf8') === 'a\nb\nc\nd\ne\n' && registro.edicoes.length === 0,
      JSON.stringify({ r11, disco: fsDaPonte.readFileSync(arq, 'utf8'), edicoes: registro.edicoes.length }))

    // 12. "Rejeitar tudo" no CARTÃO enquanto o diff já conclui um parcial: o que o agente ouve tem que bater
    //     com o disco (antes: "não permitiu", com o editor gravando).
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\nd\ne\n')
    registro.diffs.length = 0
    const p12 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\nd\nE\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id12 = pedidoNaTela().pedido.id
    await registro.comandos.get('oficina.aceitarTrecho')(id12, 1)
    const concluindo12 = registro.comandos.get('oficina.rejeitarTrecho')(id12, 2)
    await aoReceberDaTela({ tipo: 'proposta', id: id12, decisao: 'nada' })
    await concluindo12
    const r12 = await resolvido(p12)
    const disco12 = fsDaPonte.readFileSync(arq, 'utf8')
    const coerente12 = !!r12 && (
      (/JÁ ESTÃO GRAVADOS/.test(r12.message || '') && disco12 === 'a\nB\nc\nd\ne\n') ||
      (r12.behavior === 'deny' && !/GRAVADOS/.test(r12.message || '') && disco12 === 'a\nb\nc\nd\ne\n'))
    checar('⛔ codigo: cartao e diff decidindo ao mesmo tempo - o que o agente ouve bate com o disco', coerente12,
      JSON.stringify({ r12, disco12 }))

    // 13. "Sempre permitir" num cartão de proposta com o arquivo SUJO não passa (a checagem valia só para
    //     os botões da revisão).
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0
    const p13 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    registro.documentos.push({ uri: { scheme: 'file', fsPath: arq }, isDirty: true })   // sujou DEPOIS de abrir
    await aoReceberDaTela({ tipo: 'permissao', id: pedidoNaTela().pedido.id, decisao: 'permitir_sempre' })
    const r13 = await resolvido(p13)
    registro.documentos.length = 0
    checar('⛔ codigo: "Sempre permitir" com o arquivo SUJO e recusado (nao sobrescreve)',
      !!r13 && r13.behavior === 'deny' && /não salvas/.test(r13.message || ''), JSON.stringify(r13))

    // 14. A aba do diff FECHA quando o pedido é retirado (antes o dublê não tinha aba nenhuma para fechar).
    fsDaPonte.writeFileSync(arq, 'a\nb\n')
    registro.diffs.length = 0
    const p14 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\n' }, {})
    await ate(() => registro.diffs.length > 0)
    vscodeFalso.window.tabGroups.all = [{ tabs: [{ input: { modified: registro.diffs[0][1] } }] }]
    const fechadasAntes = registro.abasFechadas
    c.cancelar()
    await resolvido(p14)
    await ate(() => registro.abasFechadas > fechadasAntes)
    checar('V3 ponte: a aba do diff fecha quando o pedido e retirado (Parar)', registro.abasFechadas === fechadasAntes + 1,
      `${registro.abasFechadas - fechadasAntes} aba(s) fechada(s)`)
    vscodeFalso.window.tabGroups.all = []

    // 15. O MESMO arquivo em duas propostas: a primeira, aceita em parte, muda o disco; a segunda, feita sobre
    //     o "antes" antigo, é recusada — em vez de apagar a primeira.
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\nd\ne\n')
    registro.diffs.length = 0; registro.mensagensParaTela.length = 0
    const pA = c._pedirPermissao('Write', { file_path: arq, content: 'A\nb\nc\nd\nX\n' }, {})
    const pB = c._pedirPermissao('Write', { file_path: arq, content: 'a\nb\nc\nd\nE\n' }, {})
    await ate(() => registro.diffs.length >= 2)
    const [idA, idB] = registro.mensagensParaTela.filter(m => m.tipo === 'permissao').map(m => m.pedido.id)
    await registro.comandos.get('oficina.aceitarTrecho')(idA, 1)
    await registro.comandos.get('oficina.rejeitarTrecho')(idA, 2)
    await resolvido(pA)
    await aoReceberDaTela({ tipo: 'proposta', id: idB, decisao: 'tudo' })
    const rB = await resolvido(pB)
    checar('V3 ponte: a segunda proposta do MESMO arquivo e recusada, e a primeira fica gravada',
      !!rB && rB.behavior === 'deny' && /mudou/.test(rB.message || '') && fsDaPonte.readFileSync(arq, 'utf8') === 'A\nb\nc\nd\ne\n',
      JSON.stringify({ rB, disco: fsDaPonte.readFileSync(arq, 'utf8') }))

    // 16. CONTROLE de seguranca do "Sempre permitir": com o arquivo LIMPO ele continua liberando (o
    //     conserto do 13 nao pode ter virado "recusa sempre").
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0
    const p16 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    await aoReceberDaTela({ tipo: 'permissao', id: pedidoNaTela().pedido.id, decisao: 'permitir_sempre' })
    const r16 = await resolvido(p16)
    checar('CONTROLE: "Sempre permitir" com o arquivo limpo continua liberando (quem grava e o SDK)',
      !!r16 && r16.behavior === 'allow', JSON.stringify(r16))

    // 17. A ficha do cartao com o diff JA ABERTO traz a aba que existe, na coluna dela — nao abre um
    //     segundo diff da mesma proposta (revisao funcional da V3; `Beside` e "ao lado da ativa").
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0
    const p17 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id17 = pedidoNaTela().pedido.id
    const uri17 = registro.diffs[0][1]
    checar('a primeira abertura do diff vai para o lado (Beside)',
      (registro.diffs[0][3] || {}).viewColumn === vscodeFalso.ViewColumn.Beside, JSON.stringify(registro.diffs[0][3]))
    vscodeFalso.window.tabGroups.all = [{ viewColumn: 3, tabs: [{ input: { modified: uri17 } }] }]
    await aoReceberDaTela({ tipo: 'mostrarProposta', id: id17 })
    checar('⛔ funcional: a ficha do cartao traz a aba que ja existe (coluna dela), nao abre outro diff',
      registro.diffs.length === 2 && (registro.diffs[1][3] || {}).viewColumn === 3,
      JSON.stringify({ aberturas: registro.diffs.length, opcoes: registro.diffs[1] && registro.diffs[1][3] }))
    vscodeFalso.window.tabGroups.all = []
    await aoReceberDaTela({ tipo: 'proposta', id: id17, decisao: 'nada' })
    await resolvido(p17)

    // 18. O arquivo real é aberto SEM pré-visualização: a aba do primeiro arquivo tem que sobreviver ao
    //     segundo, senão o Ctrl+Z da M1 só vale para o último de uma refatoração (achado da revisão final da V3).
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0; registro.mostrados.length = 0
    const p18 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    await aoReceberDaTela({ tipo: 'proposta', id: pedidoNaTela().pedido.id, decisao: 'tudo' })
    await resolvido(p18)
    const mostrado = registro.mostrados.find(m => m.uri && m.uri.fsPath === arq)
    checar('⛔ o arquivo real abre SEM pre-visualizacao (a aba nao e substituida pela proxima)',
      !!mostrado && mostrado.opcoes && mostrado.opcoes.preview === false, JSON.stringify(mostrado && mostrado.opcoes))

    // 19. "Sempre permitir" recusado por arquivo sujo: a tela precisa saber que o "sempre" NAO pegou.
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0; registro.mensagensParaTela.length = 0
    const p19 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    registro.documentos.push({ uri: { scheme: 'file', fsPath: arq }, isDirty: true })
    await aoReceberDaTela({ tipo: 'permissao', id: pedidoNaTela().pedido.id, decisao: 'permitir_sempre' })
    await resolvido(p19)
    registro.documentos.length = 0
    const decidida = registro.mensagensParaTela.filter(m => m.tipo === 'propostaDecidida').pop()
    checar('⛔ "Sempre permitir" recusado avisa a tela que o sempre NAO pegou',
      !!decidida && decidida.classe === 'suja' && decidida.sempre === true, JSON.stringify(decidida))

    // 20. O pedido JA foi respondido por outra porta quando o "Sempre permitir" chega: a tela tem que
    //     ouvir `perdida` E continuar sabendo que o "sempre" nao pegou (os dois ramos da mesma funcao
    //     dizem a mesma coisa — revisao final da V3, 3a rodada).
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0; registro.mensagensParaTela.length = 0
    const p20 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id20 = pedidoNaTela().pedido.id
    registro.documentos.push({ uri: { scheme: 'file', fsPath: arq }, isDirty: true })
    c.responderPermissao(id20, 'negar')          // o motor perde o pedido por outra porta
    await resolvido(p20)
    await aoReceberDaTela({ tipo: 'permissao', id: id20, decisao: 'permitir_sempre' })
    registro.documentos.length = 0
    const perdida = registro.mensagensParaTela.filter(m => m.tipo === 'propostaDecidida').pop()
    checar('⛔ pedido ja respondido: a tela ouve `perdida` E que o "sempre" nao pegou',
      !!perdida && perdida.classe === 'perdida' && perdida.sempre === true, JSON.stringify(perdida))

    // 21. O irmao do 20, pelo OUTRO ramo: arquivo limpo, mas o DISCO mudou durante a revisao. O 20 so
    //     passa pelo ramo do arquivo sujo; tirar o aviso do "sempre" do ramo do disco ficava verde
    //     (medido por mutacao na revisao final da V3, 4a rodada).
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\n')
    registro.diffs.length = 0; registro.mensagensParaTela.length = 0
    const p21 = c._pedirPermissao('Write', { file_path: arq, content: 'a\nB\nc\n' }, {})
    await ate(() => registro.diffs.length > 0)
    const id21 = pedidoNaTela().pedido.id
    fsDaPonte.writeFileSync(arq, 'a\nb\nc\nMUDANCA DE FORA\n')
    c.responderPermissao(id21, 'negar')          // o motor perde o pedido por outra porta
    await resolvido(p21)
    await aoReceberDaTela({ tipo: 'permissao', id: id21, decisao: 'permitir_sempre' })
    const perdida21 = registro.mensagensParaTela.filter(m => m.tipo === 'propostaDecidida').pop()
    checar('⛔ pedido ja respondido com o disco mudado: a tela ouve `perdida` E que o "sempre" nao pegou',
      !!perdida21 && perdida21.classe === 'perdida' && perdida21.sempre === true, JSON.stringify(perdida21))
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    fsDaPonte.rmSync(pasta, { recursive: true, force: true })
  }
}

// ── A aba RESTAURADA não pode mentir sobre o que tem dentro ──────────────────
//
// ⚠️ Achado pela revisão funcional (10/09/2026) e medido no executável: depois de
// fechar e reabrir o editor, a aba voltava com o nome da conversa antiga ("Crie um
// arquivo chamado nota.txt nesta…") e o conteúdo de uma conversa NOVA e vazia. O VS Code
// restaura o título e o estado da tela; a conversa do host é nova — retomar a antiga é a
// V5. E como o nome já não era "Nova conversa", o primeiro pedido novo nem renomeava a
// aba: ela mentia até alguém apertar o botão.
//
// Fica no FIM do arquivo: o painel restaurado passa a ser o aberto e toma o ouvinte.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  checar('o serializer do painel foi registrado',
    !!(registro.serializador && registro.serializador.deserializeWebviewPanel))

  const iniciarOriginal = Conversa.prototype.iniciar
  const enviarOriginal = Conversa.prototype.enviar
  let aberturas = 0
  Conversa.prototype.iniciar = async function () { aberturas++ }
  Conversa.prototype.enviar = function () { return true }
  try {
    const restaurado = painelFalso('Crie um arquivo chamado nota.txt nesta…')
    await registro.serializador.deserializeWebviewPanel(restaurado, { falas: [], custoUsd: 0.0184 })
    checar('aba restaurada: o nome volta a "Nova conversa" (a conversa dentro dela e nova)',
      restaurado.title === 'Nova conversa', restaurado.title)

    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    checar('aba restaurada: o primeiro pronto manda a tela LIMPAR (sai o custo da conversa antiga)',
      registro.mensagensParaTela.some(m => m.tipo === 'limpar'),
      registro.mensagensParaTela.map(m => m.tipo).join(', ') || 'nada')
    checar('aba restaurada: a conversa nao abre antes de a tela limpar', aberturas === 0, `${aberturas} abertura(s)`)

    // CONTROLE POSITIVO: o `pronto` que a tela manda depois de limpar ABRE a conversa —
    // e não limpa de novo. Sem isto, um host que limpasse sempre passaria acima (e a tela
    // ficaria num laço de limpar e pedir de novo).
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    checar('CONTROLE POSITIVO: o pronto seguinte abre a conversa, sem limpar de novo',
      aberturas === 1 && !registro.mensagensParaTela.some(m => m.tipo === 'limpar'),
      `${aberturas} abertura(s); ${registro.mensagensParaTela.map(m => m.tipo).join(', ')}`)

    await aoReceberDaTela({ tipo: 'enviar', texto: 'Refaça o teste' })
    checar('aba restaurada: o primeiro pedido novo da nome a aba',
      restaurado.title === 'Refaça o teste', restaurado.title)
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.enviar = enviarOriginal
  }
}

// ── V4: O COMANDO, do cartão ao terminal, pela costura inteira ───────────────
//
// ⚠️ Aqui o comando roda DE VERDADE — e é de propósito. Este é o único teste que exercita, de uma
// vez, o `case` do host, o terminal do editor, o processo e a volta ao agente, sem abrir o editor.
// Os comandos são inócuos (`echo`) e a pasta é a do repositório.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const C = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'comando.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this) }

  const ferramenta = process.platform === 'win32' ? 'PowerShell' : 'Bash'
  const eco = process.platform === 'win32' ? 'Write-Output "ponte-alfa"' : 'echo ponte-alfa'
  const temInterpretador = !!C.acharInterpretador(ferramenta)

  // ⛔ O defeito que o editor de verdade achou, isolado num critério: escrever ANTES de o terminal
  // abrir não pode perder o texto. Sem a fila, esta linha some — e some justo a linha do comando.
  {
    const { TerminalDoAgente } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'terminal.js'))
    const t = new TerminalDoAgente()
    registro.escritoNoTerminal = ''
    t._linha('marca-antes-de-abrir')   // ninguém está ouvindo ainda
    t.mostrar(false)                   // cria o terminal; o dublê abre 30 ms depois, como o editor
    await ate(() => /marca-antes-de-abrir/.test(registro.escritoNoTerminal), 3000)
    checar('⛔ V4: o que a OFICINA escreve ANTES de o terminal abrir não se perde',
      /marca-antes-de-abrir/.test(registro.escritoNoTerminal),
      JSON.stringify(registro.escritoNoTerminal.slice(0, 160)))

    /*
      ⛔ A PESSOA FECHOU A ABA DO TERMINAL. Achado por um revisor independente em 11/09/2026: sem
      ouvir o fechamento, a referência ficava pendurada numa aba morta, `_garantir()` devolvia o
      cadáver, e o comando seguinte rodava INVISÍVEL — a promessa que dá nome à versão quebrando em
      silêncio, com a saída presa numa fila que crescia sem teto. O dublê nunca chamava `close()`;
      agora chama, que é o que o editor faz quando a pessoa clica no X.
    */
    const criadosAntes = registro.terminais.length
    registro.terminais.at(-1).pty.close()
    registro.escritoNoTerminal = ''
    t._linha('depois-de-fechar')
    t.mostrar(false)
    await ate(() => /depois-de-fechar/.test(registro.escritoNoTerminal), 3000)
    checar('⛔ V4: fechar a aba do terminal não o perde — o próximo comando cria outro e aparece',
      registro.terminais.length === criadosAntes + 1 && /depois-de-fechar/.test(registro.escritoNoTerminal),
      `terminais: ${registro.terminais.length} (antes ${criadosAntes}) · escrito: ${JSON.stringify(registro.escritoNoTerminal.slice(0, 90))}`)
    t.descartar()
  }

  try {
    // ⚠️ Sem interpretador não há como medir NADA disto — e um teste que se pula sozinho em
    // silêncio é a forma mais quieta de perder cobertura (lição da V1, criterio 5).
    checar('V4: esta máquina tem o interpretador para medir a costura do comando', temInterpretador,
      temInterpretador ? String(ferramenta) : 'sem interpretador: os critérios abaixo NÃO foram verificados')

    if (temInterpretador) {
      await registro.comandos.get('oficina.novaConversa')()
      await aoReceberDaTela({ tipo: 'pronto' })
      const c = abertas[abertas.length - 1]
      registro.mensagensParaTela.length = 0
      registro.escritoNoTerminal = ''
      const terminaisAntes = registro.terminais.length

      let resposta = null
      c._pedirPermissao(ferramenta, { command: eco, description: 'diz alfa' }, {}).then(r => (resposta = r))
      await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'permissao'))
      const cartao = registro.mensagensParaTela.filter(m => m.tipo === 'permissao').pop()
      checar('⛔ V4: o cartão que chega à TELA traz o comando (é o que ela mostra para aprovar)',
        !!cartao && !!cartao.pedido.comando && cartao.pedido.comando.linha === eco,
        JSON.stringify(cartao && cartao.pedido.comando))

      const id = [...c._permissoes.keys()][0]
      await aoReceberDaTela({ tipo: 'permissao', id, decisao: 'permitir' })
      await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'comando_fim'), 30000)

      checar('⛔ V4: aprovar pela TELA cria o terminal do editor e o traz para a frente',
        registro.terminais.length === terminaisAntes + 1 && registro.terminais.at(-1).mostrado > 0,
        `terminais ${registro.terminais.length}, mostrado ${registro.terminais.at(-1) && registro.terminais.at(-1).mostrado}`)
      checar('V4: o terminal tem nome próprio (a pessoa o acha na lista de terminais)',
        /OFICINA/.test(String(registro.terminais.at(-1).nome)), String(registro.terminais.at(-1).nome))
      checar('⛔ V4: o terminal mostra a LINHA do comando e a SAÍDA dele',
        registro.escritoNoTerminal.includes(eco) && /ponte-alfa/.test(registro.escritoNoTerminal),
        JSON.stringify(registro.escritoNoTerminal.slice(-160)))
      checar('V4: o terminal escreve o rodapé do resultado, em português',
        /terminou bem/.test(registro.escritoNoTerminal), JSON.stringify(registro.escritoNoTerminal.slice(-90)))

      // ⚠️ `\n` sozinho num pseudoterminal desce a linha sem voltar ao começo: a saída sai em
      // escada. É o defeito clássico da peça, e ele é invisível em qualquer teste que só olhe texto.
      const escadas = registro.escritoNoTerminal.match(/[^\r]\n/g) || []
      checar('⛔ V4: nada é escrito com `\\n` solto (senão a saída sai em escada no terminal)',
        escadas.length === 0, `${escadas.length} quebra(s) sem o retorno`)

      const inicio = registro.mensagensParaTela.filter(m => m.tipo === 'comando_inicio').pop()
      const fim = registro.mensagensParaTela.filter(m => m.tipo === 'comando_fim').pop()
      checar('V4: a tela recebe o começo e o fim da execução, com o mesmo id do cartão',
        !!inicio && !!fim && inicio.id === id && fim.id === id && fim.codigo === 0,
        JSON.stringify({ inicio: !!inicio, codigo: fim && fim.codigo }))
      await ate(() => resposta !== null)
      checar('⛔ V4: o agente ouve a saída de verdade que o processo escreveu',
        !!resposta && resposta.behavior === 'deny' && /ponte-alfa/.test(resposta.message),
        resposta && resposta.message.slice(0, 100))

      // O botão "Parar este comando" de um comando que já acabou: a tela tem de saber.
      registro.mensagensParaTela.length = 0
      await aoReceberDaTela({ tipo: 'pararComando', id })
      checar('⛔ V4: parar um comando que já terminou volta para a tela (o botão não fica preso)',
        registro.mensagensParaTela.some(m => m.tipo === 'comandoNaoParou' && m.id === id),
        JSON.stringify(registro.mensagensParaTela.map(m => m.tipo)))

      // A porta do terminal pela tela e pela paleta.
      const mostradoAntes = registro.terminais.at(-1).mostrado
      await aoReceberDaTela({ tipo: 'mostrarTerminal' })
      checar('V4: a tela consegue trazer o terminal para a frente',
        registro.terminais.at(-1).mostrado > mostradoAntes)
      const pelaPaleta = registro.terminais.at(-1).mostrado
      await registro.comandos.get('oficina.mostrarTerminal')()
      checar('V4: e a paleta também (quem fechou a aba tem caminho de volta)',
        registro.terminais.at(-1).mostrado > pelaPaleta)

      // ── O Ctrl+C do próprio terminal para o comando que está rodando.
      /*
        ⚠️ O COMANDO DURA 300 s E O PRAZO É DE 10 s — e isso separa "não matou" de "matou devagar". Antes o
        comando durava 30 s e o prazo também era 30 s: se o Ctrl+C não matasse, a resposta chegava perto dos
        30 s, do lado errado do prazo, e os dois critérios caíam juntos sem dizer por quê (visto uma vez numa
        corrida sob carga). Também são cobrados os dois passos que eram ignorados: a execução ter começado e o
        Ctrl+C ter achado um comando vivo no terminal.
      */
      const dormir = process.platform === 'win32' ? 'Start-Sleep -Seconds 300' : 'sleep 300'
      registro.mensagensParaTela.length = 0
      let resposta2 = null
      c._pedirPermissao(ferramenta, { command: dormir }, {}).then(r => (resposta2 = r))
      const cartaoChegou = await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'permissao'), 10000)
      const id2 = [...c._permissoes.keys()][0]
      await aoReceberDaTela({ tipo: 'permissao', id: id2, decisao: 'permitir' })
      const comecou = await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'comando_inicio'), 20000)
      const pty = registro.terminais.at(-1).pty
      registro.escritoNoTerminal = ''
      const tCtrlC = Date.now()
      pty.handleInput('\x03')
      const achouVivo = /\^C — parando/.test(registro.escritoNoTerminal)
      const parou = await ate(() => resposta2 !== null, 10000)
      const levou = Date.now() - tCtrlC
      // Quando NÃO para (1 vez em 6 corridas, sob carga, sem causa achada), o detalhe diz em que pé ficou a execução:
      // o PID, se o processo ainda existe, se o cancelamento foi pedido e o que a chamada de morte respondeu.
      let diagnostico = ''
      if (!parou) {
        const ex = (c._comandos.get(id2) || {}).execucao || {}
        let vivo = null
        try { process.kill(ex.pid, 0); vivo = true } catch (e) { vivo = e && e.code === 'EPERM' ? true : false }
        diagnostico = ' · ' + JSON.stringify({ pid: ex.pid, processoVivo: vivo, cancelado: ex.cancelado, terminou: !!ex.terminou, falhasAoParar: ex.falhasAoParar })
      }
      const fim2 = registro.mensagensParaTela.filter(m => m.tipo === 'comando_fim').pop()
      checar('V4: o Ctrl+C chega com o comando rodando e acha a execução viva no terminal',
        cartaoChegou && comecou && achouVivo,
        JSON.stringify({ cartaoChegou, comecou, achouVivo, escrito: registro.escritoNoTerminal.slice(0, 60) }))
      checar('⛔ V4: o Ctrl+C do terminal para o comando (a mão de quem usa terminal já sabe essa tecla)',
        parou && !!resposta2 && /A PESSOA parou/.test(resposta2.message),
        parou ? `parou em ${levou} ms; ${resposta2 && resposta2.message.slice(0, 60)}`
          : `NÃO MATOU: sem resposta em ${levou} ms (o comando dura 300 s)${diagnostico}`)
      checar('V4: e a tela é avisada de que ESSE comando foi parado',
        !!fim2 && fim2.id === id2 && fim2.cancelado === true, JSON.stringify(fim2))
      if (!parou) { try { await aoReceberDaTela({ tipo: 'pararComando', id: id2 }) } catch { } await ate(() => resposta2 !== null, 15000) }
      checar('CONTROLE: uma tecla qualquer no terminal não faz nada (não há shell do outro lado)',
        pty.handleInput('x') === undefined)
      registro.escritoNoTerminal = ''
      pty.handleInput('\x03')
      checar('V4: Ctrl+C sem comando rodando diz isso no terminal (não fica mudo)',
        /não há comando rodando/.test(registro.escritoNoTerminal), JSON.stringify(registro.escritoNoTerminal.slice(0, 80)))

      await c.encerrar()
    }
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V8 — O SOCORRO e O LOGIN, pela ponte (o editor de mentira, a extensão de verdade)
// ─────────────────────────────────────────────────────────────────────────────
{
  const arquivoDoRegistro = path.join(PASTA_DO_REGISTRO, 'oficina.log')
  const eventosDoRegistro = () => {
    try { return fsDaPonte.readFileSync(arquivoDoRegistro, 'utf8').trim().split('\n').map(l => JSON.parse(l).evento) } catch { return [] }
  }
  const socorro = registro.comandos.get('oficina.socorro')
  checar('V8: o socorro é um comando da paleta', typeof socorro === 'function')
  checar('V8: a ativação deixa a primeira linha no registro', eventosDoRegistro()[0] === 'ativou', eventosDoRegistro().slice(0, 3).join(','))

  // As ações: separadas, e nenhuma alterna.
  registro.escolhaDoSocorro = null
  await socorro()
  const ids = (registro.itensDoSocorro || []).map(i => i.id)
  checar('V8: o socorro oferece quatro ações separadas', ids.join(',') === 'reabrir,registro,pasta,recarregar', ids.join(','))
  checar('V8: cada ação diz o que faz (nenhum item sem explicação)', (registro.itensDoSocorro || []).every(i => i.detail && i.detail.length > 10))

  registro.escolhaDoSocorro = 'registro'
  await socorro()
  const mostrado = registro.mostrados[registro.mostrados.length - 1]
  checar('V8: "Abrir o registro" abre o arquivo do registro', !!mostrado && mostrado.uri.fsPath === arquivoDoRegistro, mostrado && mostrado.uri.fsPath)

  registro.escolhaDoSocorro = 'pasta'
  await socorro()
  checar('V8: "Mostrar a pasta" pede ao editor para mostrar o arquivo no sistema', registro.rodados.includes('revealFileInOS'))

  registro.escolhaDoSocorro = 'recarregar'
  await socorro()
  checar('V8: "Recarregar a janela" recarrega', registro.rodados.includes('workbench.action.reloadWindow'))

  // Reabrir MONTA DE NOVO — e só quando a aba antiga avisou que fechou.
  await registro.comandos.get('oficina.abrirPainel')()
  const antes = registro.painelCriado
  registro.escolhaDoSocorro = 'reabrir'
  await socorro()
  checar('⛔ V8: "Reabrir a conversa" cria um painel NOVO, e não só traz o velho para a frente',
    !!registro.painelCriado && registro.painelCriado !== antes)
  const ev = eventosDoRegistro()
  checar('V8: o registro conta a troca (fechou, depois abriu)',
    ev.includes('painel.fechado') && ev.lastIndexOf('painel.fechado') < ev.lastIndexOf('painel.aberto'), ev.slice(-4).join(','))

  // Controle: aba que não avisa que fechou — nada de abrir outra por cima.
  const teimoso = registro.painelCriado
  teimoso.dispose = () => { }
  const errosAntes = registro.erros.length
  await socorro()
  checar('V8 (controle): aba que não fecha NÃO ganha outra por cima', registro.painelCriado === teimoso)
  checar('V8 (controle): e a pessoa fica sabendo o que fazer',
    registro.erros.length === errosAntes + 1 && /Feche-a pelo X/.test(registro.erros[registro.erros.length - 1]))

  // A tela chama o socorro pelo botão do erro.
  const abertosAntes = eventosDoRegistro().filter(e => e === 'socorro.aberto').length
  registro.escolhaDoSocorro = null
  await aoReceberDaTela({ tipo: 'socorro' })
  checar('V8: o botão "Socorro" da tela chega ao host', eventosDoRegistro().filter(e => e === 'socorro.aberto').length === abertosAntes + 1)

  // O login: o terminal roda o executável que vem DENTRO da extensão, e fechar recomeça a conversa.
  const terminaisAntes = registro.terminais.length
  await aoReceberDaTela({ tipo: 'entrarNaConta' })
  const tLogin = registro.terminais[terminaisAntes]
  checar('V8: "Entrar na minha conta" abre um terminal', !!tLogin && tLogin.mostrado === 1)
  checar('V8: o terminal roda o claude EMBUTIDO, não o do PATH',
    !!tLogin && typeof tLogin.shellPath === 'string' && /claude-agent-sdk-[a-z0-9]+-[a-z0-9]+[\\/]claude(\.exe)?$/.test(tLogin.shellPath), tLogin && tLogin.shellPath)
  checar('V8: o executável embutido existe no disco', !!tLogin && !!tLogin.shellPath && fsDaPonte.existsSync(tLogin.shellPath))

  // Controle primeiro: fechar OUTRO terminal não recomeça nada.
  registro.mensagensParaTela.length = 0
  for (const fn of [...registro.aoFecharTerminal]) fn({ outro: true })
  await esperar(50)
  checar('V8 (controle): fechar outro terminal não recomeça a conversa', !registro.mensagensParaTela.some(m => m.tipo === 'limpar'))
  for (const fn of [...registro.aoFecharTerminal]) fn(tLogin && tLogin.objeto)
  await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'limpar'), 3000)
  checar('⛔ V8: fechar o terminal do login recomeça a conversa (é a abertura que lê a conta)', registro.mensagensParaTela.some(m => m.tipo === 'limpar'))
  checar('V8: o registro anota o login aberto e fechado', eventosDoRegistro().includes('login.aberto') && eventosDoRegistro().includes('login.fechado'))
}
// ─────────────────────────────────────────────────────────────────────────────
// V10 — A TELA DE TOKENS, ligada à extensão de verdade
// ─────────────────────────────────────────────────────────────────────────────
{
  const vista = registro.arvores['oficina.tokens']
  checar('V10: a vista "Tokens da conversa" é registrada na ativação', !!vista && typeof vista.getChildren === 'function')
  checar('V10: o comando que abre a vista existe', registro.comandos.has('oficina.tokens.abrir'))
  checar('V10: a barra de status de tokens nasce escondida (sem conversa, sem número)', registro.barras.length >= 1 && registro.barras.every(b => !b.visivel))
  await registro.comandos.get('oficina.tokens.abrir')()
  checar('V10: abrir a vista chama o contêiner dela', registro.rodados.includes('workbench.view.extension.oficinaTokens'))
  const rotulos = () => (vista.getChildren() || []).map(i => i.label)
  checar('V10: a vista responde, e diz o estado em vez de ficar vazia', rotulos().length >= 1, rotulos().join(' | '))
  /*
    ⚠️ MUDOU NA V20 (t197), E A MUDANÇA É ORDEM DELE.

    Até a V19 estes critérios cobravam o contrário: a vista Tokens tinha de ser REVELADA sozinha na
    ativação e VOLTAR sozinha se fosse fechada ("sempre à vista", decisão dele na época).

    Na leva de 21/09/2026 ele olhou essa mesma barra e disse: *"esse negócio inteiro na direita não
    faz sentido, não quero ele assim"* — e sobre a vista, *"nem arruma pq tokens vai SAIR daqui"*.
    O produto passou a nascer com a barra direita fechada; a extensão, porém, continuava revelando a
    vista meio segundo depois e desfazendo o fechamento de quem a fechasse. Ou seja: o produto
    mandava fechar e a nossa extensão reabria — e o que reabria era a vista sem conversa nenhuma,
    que é exatamente o print que ele mandou. Um revisor independente pegou.

    Agora o que se cobra é o oposto, e com a mesma dureza: a vista NÃO se revela sozinha, nem na
    ativação nem depois de fechada. Ela continua existindo e alcançável pelo comando.
  */
  const objetoTokens = registro.objetosDaVista['oficina.tokens']
  // Uma folga generosa: o defeito que isto persegue era um `setTimeout` de 500 ms.
  await new Promise(r => setTimeout(r, 1200))
  checar('⛔ V20: a vista Tokens NÃO é revelada sozinha na ativação (t197)',
    !objetoTokens || objetoTokens.revelados.length === 0,
    JSON.stringify(objetoTokens ? objetoTokens.revelados : 'a vista não é uma árvore com visibilidade'))

  if (objetoTokens) {
    objetoTokens.visible = false
    for (const fn of objetoTokens.ouvintes) fn({ visible: false })
    await new Promise(r => setTimeout(r, 1200))
  }
  checar('⛔ V20: fechada por quem usa, a vista NÃO volta sozinha (o produto não desfaz a decisão dele)',
    !objetoTokens || objetoTokens.revelados.length === 0,
    JSON.stringify(objetoTokens ? objetoTokens.revelados : 'sem objeto'))
  checar('V20: e a vista continua alcançável pelo comando, que é o caminho que sobrou',
    registro.comandos.has('oficina.tokens.abrir'))

  checar('e o provedor da vista tem `getParent` (sem ele o editor recusa o reveal)',
    !!vista && typeof vista.getParent === 'function')
}

// ─────────────────────────────────────────────────────────────────────────────
// V11 — O BOTÃO "LAYOUT", pela extensão de verdade (o núcleo de mentira não tem o patch 0011)
// ─────────────────────────────────────────────────────────────────────────────
{
  const manifesto = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  checar('V11: o comando "Layout da tela" existe', registro.comandos.has('oficina.layout'))
  /*
    ⛔ A COMPOSIÇÃO DA BARRA DE CIMA É DELE, ITEM A ITEM ("…só isso"). Esta lista é fechada: nada
    entra sem ordem dele, e quem acrescentar um item sem ordem dele deixa este critério vermelho.

    ⚠️ MUDOU NA V20, E A MUDANÇA É ORDEM DELE — não é critério afrouxado. Até a V19 eram QUATRO
    itens (Arquivos, Conversa, Layout, e o mostrador do limite). Na a leva de 21/09/2026 (21/09/2026):
      - `t188` — sobre os três botões: *"nao entendi esses itens aqui nao quero eles"*; e,
        perguntado se o mostrador do limite saía junto, escolheu **"tira os 3 e o limite também"**;
      - `t196` — o que entra no lugar: *"tokens tem que ficar assim. entre a barra de pesquisa e os
        botões de minimizar, maximizar e fechar janela"*.
    O limite não sumiu do produto: virou a FAIXA de medidores (t199, patch 0017), com barra que
    enche, que é onde ele pediu que ficasse.
  */
  checar('⛔ V11/V20: a barra de cima tem exatamente o item autorizado, e só ele',
    manifesto.contributes.menus.titleBar.map(m => m.command).join() === 'oficina.tokensNaBarra',
    manifesto.contributes.menus.titleBar.map(m => m.command).join())
  checar('⛔ V20: os três botões da V11 saíram da barra (t188), mas os comandos continuam existindo',
    !manifesto.contributes.menus.titleBar.some(m => ['oficina.abrirArquivos', 'oficina.abrirConversa', 'oficina.layout'].includes(m.command)) &&
    ['oficina.abrirArquivos', 'oficina.abrirConversa', 'oficina.layout'].every(c => registro.comandos.has(c)),
    manifesto.contributes.menus.titleBar.map(m => m.command).join())
  /*
    V19 — O MOSTRADOR DO LIMITE: a costura entre o manifesto e o patch do núcleo.

    ⚠️ ESTA COSTURA FALHA EM SILÊNCIO. O item só aparece se o `when` do manifesto citar exatamente
    o nome do context key que o patch cria; um nome diferente nos dois lados não quebra build, não
    quebra tipo, não quebra teste nenhum — o item simplesmente nunca aparece, e a pessoa acha que
    a funcionalidade não foi feita. Por isso o nome é lido dos DOIS arquivos e comparado.
  */
  {
    // ⚠️ V20: quem mora na barra agora é o mostrador de TOKENS (t196). A costura continua sendo a
    // mesma do patch 0016, e continua falhando em silêncio se os nomes divergirem — por isso os
    // critérios abaixo trocaram de ALVO, não de rigor.
    const doTokens = (manifesto.contributes.commands || []).find(c => c.command === 'oficina.tokensNaBarra')
    const naBarra = manifesto.contributes.menus.titleBar.find(m => m.command === 'oficina.tokensNaBarra')
    // ⚠️ DECLARADO **E** REGISTRADO. A V19 cobrava as duas coisas para o item do limite; a primeira
    // versão da V20 trocou por um critério que só olhava o manifesto — e o comando ficou declarado
    // em três lugares sem nenhum `registerCommand`. Clicar no item daria "command not found", e
    // nada ficava vermelho. Um revisor independente pegou.
    checar('⛔ V20: o comando do mostrador de tokens existe no manifesto E está registrado',
      !!doTokens && registro.comandos.has('oficina.tokensNaBarra'),
      JSON.stringify({ noManifesto: !!doTokens, registrado: registro.comandos.has('oficina.tokensNaBarra') }))
    // ⛔ A regra geral, que pega a classe inteira deste erro em vez do caso: TODO comando declarado
    // tem de ser registrado, menos os que a própria extensão delega a outra (o `claude-vscode.*`).
    {
      const declarados = (manifesto.contributes.commands || []).map(c => c.command)
      const semRegistro = declarados.filter(c => !c.startsWith('claude-vscode.') && !registro.comandos.has(c))
      checar('⛔ V20: todo comando declarado no manifesto está registrado na extensão',
        semRegistro.length === 0, semRegistro.join(', ') || 'nenhum faltando')
    }
    checar('⛔ V20: o texto vivo mora no título CURTO — o título é nome de gente, para a paleta e os atalhos',
      !!doTokens && /\$\{/.test(String(doTokens.shortTitle || '')) && !/\$\{/.test(String(doTokens.title || '')),
      JSON.stringify(doTokens))
    checar('⛔ V20: o item NÃO tem ícone — com ícone o editor desenha o ícone e o texto some',
      !!doTokens && !doTokens.icon, JSON.stringify(doTokens && doTokens.icon))
    checar('⛔ V20: o mostrador não polui a paleta (quem abre a vista é `oficina.tokens.abrir`)',
      (manifesto.contributes.menus.commandPalette || []).some(m => m.command === 'oficina.tokensNaBarra' && m.when === 'false'))
    // ⚠️ E O LIMITE SAIU DA BARRA: o comando continua, sem título vivo, porque agora ele ABRE o
    // detalhe do consumo em vez de desenhar número na barra (t188 + t199).
    const doLimite = (manifesto.contributes.commands || []).find(c => c.command === 'oficina.limite')
    checar('⛔ V20: o limite não tem mais título vivo, e não está na barra (ordem dele no t188)',
      !!doLimite && !doLimite.shortTitle && !manifesto.contributes.menus.titleBar.some(m => m.command === 'oficina.limite'),
      JSON.stringify(doLimite))
    // Guarda: sem o patch, estes critérios têm de ficar VERMELHOS, não derrubar a suíte inteira.
    let patch = ''
    try { patch = fsDaPonte.readFileSync(path.join(REPO, 'patches', '0016-barra-de-titulo-aceita-rotulo-vivo.patch'), 'utf8') } catch { patch = '' }
    const doPatch = (patch.match(/OFICINA_ROTULO_VIVO = '([^']+)'/) || [])[1] || null
    const doWhen = (String(naBarra && naBarra.when).match(/^([A-Za-z][A-Za-z0-9_]*)/) || [])[1] || null
    checar('⛔ V20: a chave que o editor cria e a que o manifesto pede no `when` são a MESMA',
      !!doPatch && doPatch === doWhen, `patch: ${doPatch} · manifesto: ${doWhen}`)
    checar('⛔ V20: o item só aparece quando o editor sabe desenhar texto vivo E há o que mostrar',
      !!naBarra && naBarra.when === 'titleBarLiveLabel && oficina.tokens.aMostrar', String(naBarra && naBarra.when))
    const mostrador = requererPonteDoLimite(path.join(REPO, 'extensoes', 'oficina-claude', 'mostradorDeTokens.js'))
    checar('⛔ V20: a chave que o mostrador escreve é a que o manifesto lê (um nome só, dos dois lados)',
      mostrador.CHAVE_DO_TEXTO === 'oficina.tokens' && `titleBarLiveLabel && ${mostrador.CHAVE_DE_MOSTRAR}` === String(naBarra && naBarra.when),
      `${mostrador.CHAVE_DO_TEXTO} / ${mostrador.CHAVE_DE_MOSTRAR}`)
    checar('V19: o patch toca a barra de título do editor, e só ela',
      /\+\+\+ b\/src\/vs\/workbench\/browser\/parts\/titlebar\/titlebarPart\.ts/.test(patch) &&
      (patch.match(/^\+\+\+ b\//gm) || []).length === 1,
      String((patch.match(/^\+\+\+ b\//gm) || []).length) + ' arquivo(s)')
  }

  // ⛔ Revisão visual de 18/09/2026: o produto esconde a barra de atividades e a de status
  // (decisão de produto), e era nelas que moravam os ícones de Tokens e Skills. As duas barras que
  // sobram têm composição definida pelo dono, item a item: a de CIMA ("…só isso") e a do título do
  // painel da conversa ("a ÚNICA coisa nessa barra além da guia da conversa é o ícone … de nova
  // conversa"). Nenhuma recebe botão novo POR INICIATIVA DE QUEM CONSTRÓI: o caminho é o custo no pé
  // e o guia de boas-vindas. O que entra ali entra por ordem dele, e fica escrito no critério acima.
  const doPainel = (manifesto.contributes.menus['editor/title'] || [])
    .filter(m => /activeWebviewPanelId == 'oficina\.conversa'/.test(m.when || '')).map(m => m.command)
  // V19: ele decidiu que ali ficam a guia e o ícone de nova conversa, e nada mais — o botão do histórico
  // ("Conversas desta pasta", da V5) saiu da barra. Os dois comandos abaixo são o MESMO botão: um aparece com a
  // marca da equipe e o outro sem ela (`when` mutuamente exclusivo), então o que se vê na barra é um botão só.
  const PERMITIDOS_NO_PAINEL = ['oficina.novaConversa', 'oficina.novaConversaEquipe']
  const intrusos = doPainel.filter(c => !PERMITIDOS_NO_PAINEL.includes(c))
  checar('⛔ o título do painel da conversa só tem o ícone de nova conversa (composição definida)', intrusos.length === 0,
    intrusos.join() || doPainel.join())
  // ⛔ Tirar um botão não pode apagar a função: a lista de conversas tem de continuar alcançável por outro
  // caminho. São dois, e os dois são cobrados aqui — a paleta e o atalho.
  const comandosDoManifesto = new Set((manifesto.contributes.commands || []).map(c => c.command))
  const escondidosDaPaleta = new Set((manifesto.contributes.menus.commandPalette || [])
    .filter(m => String(m.when).trim() === 'false').map(m => m.command))
  const atalhosDoHistorico = (manifesto.contributes.keybindings || []).filter(k => k.command === 'oficina.conversas')
  checar('⛔ sem o botão, a lista de conversas continua na paleta de comandos',
    comandosDoManifesto.has('oficina.conversas') && !escondidosDaPaleta.has('oficina.conversas') && registro.comandos.has('oficina.conversas'),
    JSON.stringify({ noManifesto: comandosDoManifesto.has('oficina.conversas'), escondidoDaPaleta: escondidosDaPaleta.has('oficina.conversas'), registrado: registro.comandos.has('oficina.conversas') }))
  checar('⛔ e continua no atalho de teclado (Ctrl+Shift+H)',
    atalhosDoHistorico.some(k => /ctrl\+shift\+h/i.test(k.key || '')), JSON.stringify(atalhosDoHistorico))
  // ⚠️ V20: este critério dizia "a barra de cima continua só com Arquivos, Conversa e Layout" e
  // proibia `tokens` ali. Ele MANDOU o contrário na leva de 21/09/2026: os três saíram (t188) e o mostrador
  // de tokens entrou (t196). O que continua valendo é a parte que nunca foi negociada — a vista de
  // SKILLS não vira botão na barra de cima; ela mora na barra lateral.
  checar('e a barra de cima não ganhou a vista de Skills',
    !manifesto.contributes.menus.titleBar.some(m => /skills/.test(m.command)),
    manifesto.contributes.menus.titleBar.map(m => m.command).join())
  // O núcleo tem um botão próprio na barra de cima: o globo do navegador integrado ("Browser"), que aparece
  // sozinho enquanto houver uma página aberta nele. A barra de cima tem composição definida pelo dono ("…só
  // isso") e o globo não está nela. A porta do navegador é o comando "Navegador" da paleta (e o atalho do núcleo).
  const padroesDoProduto = (JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8')).configurationDefaults) || {}
  checar('⛔ o globo do navegador do núcleo não entra na barra de cima (composição definida)',
    padroesDoProduto['workbench.browser.showInTitleBar'] === false, String(padroesDoProduto['workbench.browser.showInTitleBar']))
  const passos = ((manifesto.contributes.walkthroughs || [])[0] || {}).steps || []
  const noGuia = passos.map(p => p.description || '').join(' ')
  checar('⛔ o guia de boas-vindas leva às vistas de Tokens e de Skills (Tokens não nasce na barra lateral)',
    noGuia.includes('command:oficina.tokens.abrir') && noGuia.includes('command:oficina.skills.abrir'))
  const layout = registro.comandos.get('oficina.layout')

  registro.filaDeEscolhas = ['personalizar']
  await layout()
  checar('V11: "Personalizar a tela" abre a personalização do próprio editor', registro.rodados.includes('workbench.action.customizeLayout'))

  // Salvar, com o dublê SEM o patch do núcleo: a tela tem que dizer que salvou só metade.
  registro.config['workbench.statusBar.visible'] = false
  registro.filaDeEscolhas = ['salvar']
  registro.respostaDoTexto = 'Tela boa'
  await layout()
  checar('V11: a caixa do nome recusa nome vazio, com o motivo', !!registro.caixaDeTexto && typeof registro.caixaDeTexto.validateInput === 'function' && !!registro.caixaDeTexto.validateInput('  '))
  const guardados = registro.estadoGlobal['oficina.layout.presets'] || {}
  checar('V11: o layout foi salvo no perfil com o nome', !!guardados['Tela boa'] && guardados['Tela boa'].config['workbench.statusBar.visible'] === false)
  checar('⛔ V11: sem o patch do núcleo, a tela DIZ que salvou só as configurações', /salvo só com as configurações/.test(registro.aviso || ''), registro.aviso)

  // Nome que já existe: pergunta antes de substituir; sem confirmar, nada muda.
  const salvoAntes = guardados['Tela boa'].salvoEm
  registro.filaDeEscolhas = ['salvar']
  registro.respostaDoCuidado = undefined
  await new Promise(r => setTimeout(r, 5))
  await layout()
  checar('V11: nome repetido pergunta antes de substituir', registro.avisosDeCuidado.some(a => /Já existe um layout "Tela boa"/.test(a)))
  checar('V11 (controle): sem confirmar, o layout antigo continua', registro.estadoGlobal['oficina.layout.presets']['Tela boa'].salvoEm === salvoAntes)

  // Aplicar: devolve a configuração e avisa que foi só em parte.
  registro.config['workbench.statusBar.visible'] = true
  registro.filaDeEscolhas = ['aplicar']
  await layout()
  checar('V11: aplicar devolve a configuração salva', registro.config['workbench.statusBar.visible'] === false)
  checar('⛔ V11: aplicar um layout sem o núcleo avisa que foi só em parte', registro.avisosDeCuidado.some(a => /aplicado só em parte/.test(a)), registro.avisosDeCuidado.slice(-1)[0])

  // Excluir: escolhe qual, confirma.
  registro.filaDeEscolhas = ['excluir', 'Tela boa']
  registro.respostaDoCuidado = 'Excluir'
  await layout()
  checar('V11: excluir pede confirmação e tira o layout', registro.avisosDeCuidado.some(a => /Excluir o layout "Tela boa"/.test(a)) && !registro.estadoGlobal['oficina.layout.presets']['Tela boa'])
  registro.respostaDoCuidado = undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// V12 — A VISTA DE SKILLS, pela extensão de verdade: a lista chega do motor e o clique vira pedido
// ─────────────────────────────────────────────────────────────────────────────
{
  const manifesto = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const c = manifesto.contributes
  checar('V12: a vista "Skills" tem contêiner próprio na barra lateral',
    c.viewsContainers.activitybar.some(v => v.id === 'oficinaSkills') && (c.views.oficinaSkills || []).some(v => v.id === 'oficina.skills'))
  // ⚠️ Botão de menu que aponta para comando não registrado aparece na tela e não faz nada.
  const doMenu = [...c.menus['view/item/context'], ...c.menus['view/title']].map(m => m.command)
  const faltam = doMenu.filter(n => !registro.comandos.has(n))
  checar('V12: todo botão da vista aponta para um comando registrado', doMenu.length >= 5 && faltam.length === 0, faltam.join(', ') || `${doMenu.length} botões`)
  const opcoes = registro.visoes['oficina.skills']
  checar('V12: a vista é registrada com o arrastar e com escolha de várias', !!opcoes && !!opcoes.dragAndDropController && opcoes.canSelectMany === true)
  checar('V12: a decoração que pinta a oculta de cinza é registrada', registro.decoracoes.some(d => typeof d.provideFileDecoration === 'function'))

  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const enviarOriginal = Conversa.prototype.enviar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  Conversa.prototype.enviar = function () { return true }
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const conversa = abertas[abertas.length - 1]
    registro.mensagensParaTela.length = 0
    conversa.aoEvento({ tipo: 'comandos', conversa: conversa.id, lista: [
      { name: 'minha-skill', description: 'Faz a coisa (user)', argumentHint: '' },
      { name: 'clear', description: 'Clear', argumentHint: '' },
    ] })
    await ate(() => (registro.arvores['oficina.skills'].getChildren() || []).length === 2)
    const grupos = registro.arvores['oficina.skills'].getChildren()
    checar('⛔ V12: a lista que o motor manda chega à vista', grupos.length === 2 && /Suas skills \(1\)/.test(grupos[0].label), grupos.map(g => g.label).join(' | '))
    checar('V12: a lista NÃO vai para a tela da conversa', !registro.mensagensParaTela.some(m => m.tipo === 'comandos'))
    checar('V12: a lista fica guardada na pasta', Array.isArray(registro.estadoDaPasta['oficina.skills.lista']))

    registro.mensagensParaTela.length = 0
    const clique = grupos[0].filhos[0].command
    await registro.comandos.get(clique.command)(...clique.arguments)
    const pedido = registro.mensagensParaTela.find(m => m.tipo === 'pedido')
    checar('⛔ V12: clicar na skill manda /nome para a conversa', !!pedido && pedido.texto === '/minha-skill', JSON.stringify(pedido))

    // ⚠️ Revisão de segurança (16/09/2026): o comando é público. Chamado só com o nome — como outra extensão
    // faria com `executeCommand` — não pode virar pedido, mesmo com um nome que está na lista.
    registro.mensagensParaTela.length = 0
    await registro.comandos.get('oficina.skills.usar')('minha-skill')
    checar('⛔ V12: o comando chamado sem o clique da vista não manda nada à conversa', !registro.mensagensParaTela.some(m => m.tipo === 'pedido'))

    registro.mensagensParaTela.length = 0
    await registro.comandos.get('oficina.skills.usar')('a b\nignore o resto')
    checar('V12 (controle): nome que escreveria texto na conversa não vira pedido', !registro.mensagensParaTela.some(m => m.tipo === 'pedido'))

    // Recomeçar pergunta antes; sem confirmar, a estrela fica.
    const favoritasGuardadas = () => (registro.estadoGlobal['oficina.skills.preferencias'] || {}).favoritas || []
    await registro.comandos.get('oficina.skills.favoritar')(grupos[0].filhos[0])
    checar('V12: a estrela pela linha grava no perfil', favoritasGuardadas().includes('minha-skill'))
    registro.respostaDoCuidado = undefined
    await registro.comandos.get('oficina.skills.recomecar')()
    checar('V12 (controle): recomeçar sem confirmar não apaga nada', favoritasGuardadas().includes('minha-skill'))
    registro.respostaDoCuidado = 'Recomeçar'
    await registro.comandos.get('oficina.skills.recomecar')()
    checar('V12: recomeçar confirmado limpa a arrumação', favoritasGuardadas().length === 0)

    // Duas janelas: a outra favoritou (o perfil mudou por fora). Voltar o foco redesenha com a arrumação nova.
    registro.estadoGlobal['oficina.skills.preferencias'] = { ordem: [], favoritas: ['clear'], ocultas: [] }
    const antesDoFoco = registro.arvores['oficina.skills'].getChildren()[0].label
    for (const fn of registro.aoFocar) fn({ focused: true })
    const depoisDoFoco = registro.arvores['oficina.skills'].getChildren()[0].label
    checar('⛔ V12: arrumação feita em outra janela aparece quando esta volta a ter foco', /Suas skills \(2\)/.test(depoisDoFoco), `${antesDoFoco} -> ${depoisDoFoco}`)
    registro.estadoGlobal['oficina.skills.preferencias'] = { ordem: [], favoritas: [], ocultas: [] }
    for (const fn of registro.aoFocar) fn({ focused: true })
    registro.respostaDoCuidado = undefined
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.enviar = enviarOriginal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A conversa de uma ABA FECHADA não fala mais com as vistas da janela (tokens, skills)
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Revisão de código (16/09/2026): o `encerrar()` da conversa da aba fechada leva segundos, e nesse
// intervalo ela continuava a "corrente" dentro de `ligar` — um `pronto` atrasado dela punha os números dela
// na barra, uma lista atrasada trocava as skills.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const encerrarOriginal = Conversa.prototype.encerrar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  Conversa.prototype.encerrar = async function () { }
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const velha = abertas[abertas.length - 1]
    const vistaSkills = registro.arvores['oficina.skills']
    const nomesDasSkills = () => (vistaSkills.getChildren() || []).flatMap(g => (g.filhos || []).map(i => i.label)).join()

    // CONTROLE: com a aba viva, a lista dela chega.
    velha.aoEvento({ tipo: 'comandos', conversa: velha.id, lista: [{ name: 'da-aba-viva', description: 'x (user)' }] })
    await ate(() => nomesDasSkills() === 'da-aba-viva')
    checar('aba fechada (controle): com a aba viva, a lista dela chega à vista', nomesDasSkills() === 'da-aba-viva', nomesDasSkills())

    // Os ouvintes do fechamento direto: o `dispose` desta aba foi trocado por um que não fecha, no controle do socorro (V8).
    for (const fn of registro.painelCriado._aoFechar) fn()
    await esperar(20)
    velha.aoEvento({ tipo: 'comandos', conversa: velha.id, lista: [{ name: 'da-aba-fechada', description: 'x (user)' }] })
    velha.aoEvento({ tipo: 'pronto', conversa: velha.id, sessao: 'aaaaaaaa-0000-0000-0000-000000000009' })
    await esperar(30)
    checar('⛔ aba fechada: a lista atrasada da conversa dela não troca as skills', nomesDasSkills() === 'da-aba-viva', nomesDasSkills())
    const rotulosDosTokens = (registro.arvores['oficina.tokens'].getChildren() || []).map(i => i.label).join()
    checar('⛔ aba fechada: o "pronto" atrasado dela não põe uma conversa na vista de tokens', rotulosDosTokens === 'Nenhuma conversa aberta', rotulosDosTokens)
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.encerrar = encerrarOriginal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V13 — A BARRA LATERAL VOLTA, com três botões de fábrica, e o Git conectado por dentro
// ─────────────────────────────────────────────────────────────────────────────
// A barra lateral nascia oculta pelo produto. O pedido novo pede botões nela: Arquivos (com as cores do
// Git), Git e Skills. Os outros ícones de fábrica nascem SOLTOS por uma lista no produto, que o patch
// 0012 do núcleo lê. O comportamento na tela depende do núcleo compilado (`tela_lateral.mjs`); aqui se
// prova o fio entre as três peças que não precisam dele: o produto, o manifesto e os dois patches.
{
  const produto = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
  const padroes = produto.configurationDefaults || {}
  const lugar = padroes['workbench.activityBar.location']
  // ⚠️ V20 (t198): ele mandou os ícones da lateral para CIMA — *"esses negócio ao invés de lateral,
  // eu quero em cima, na horizontal, entre a logo na esquerda e a barra de pesquisa no centro"*.
  // `top` é posição, não sumiço: o que este critério sempre protegeu — que a barra não nasça
  // ESCONDIDA — continua protegido, e `hidden` segue reprovando.
  checar('⛔ V13/V20: o produto não esconde a barra lateral (e na V20 ela nasce no topo)',
    lugar === undefined || lugar === 'default' || lugar === 'top', String(lugar))
  const soltos = produto.defaultUnpinnedViewContainers
  const deFabricaSoltos = ['workbench.view.search', 'workbench.view.debug', 'workbench.view.extensions']
  const osTresPedidos = ['workbench.view.explorer', 'workbench.view.scm', 'workbench.view.extension.oficinaSkills']
  checar('⛔ V13: Pesquisa, Depurar e Extensões nascem soltos', Array.isArray(soltos) && deFabricaSoltos.every(id => soltos.includes(id)),
    JSON.stringify(soltos))
  checar('⛔ V13: Arquivos, Git e Skills NÃO estão na lista dos soltos', Array.isArray(soltos) && !osTresPedidos.some(id => soltos.includes(id)))
  // Um contêiner nosso renomeado no manifesto deixaria o id velho na lista, e o ícone novo nasceria fixado.
  const manifesto = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const nossos = (manifesto.contributes.viewsContainers.activitybar || []).map(v => 'workbench.view.extension.' + v.id)
  const nossosNaLista = (soltos || []).filter(id => /^workbench\.view\.extension\.oficina/.test(id))
  // ⚠️ MUDOU NA V20, POR ORDEM DELE (t197). Até a V19 este critério exigia que a barra secundária
  // nascesse ABERTA, para a vista Tokens estar sempre à vista. Na a leva de 21/09/2026, olhando essa mesma
  // barra: *"esse negócio inteiro na direita não faz sentido, não quero ele assim"* — e sobre a
  // vista em si, *"nem arruma pq tokens vai SAIR daqui"*.
  // Os números não sumiram: subiram para a barra de cima (t196). A vista continua existindo e
  // alcançável; o que mudou é que a barra não se abre sozinha.
  const secundaria = manifesto.contributes.viewsContainers.secondarySidebar || []
  /*
    ⚠️ SUCESSOR DE: "a barra secundaria NAO nasce aberta (t197), E A VISTA TOKENS CONTINUA
    EXISTINDO [la]" (V20 — V23).

    Aquele criterio exigia que `oficinaTokens` ficasse na barra da direita. Ele era a metade do
    pedido: em 21/09/2026 o dono disse das duas coisas — da barra, *"esse negocio inteiro na
    direita nao faz sentido, nao quero ele assim"*, e da vista, *"nem arruma pq tokens vai SAIR
    daqui"*. O "nao nasce aberta" foi entregue; o "vai SAIR" nao, e o criterio gravou a metade
    entregue como se fosse o pedido inteiro.

    Em 24/09/2026, vendo a barra de volta na tela: *"eu ja falei que era para ter removido, eu nao
    quero essa aba da direita (...) ele abre aqui no centro um chat que ocupa praticamente a tela
    inteira e e isso, e acabou"*.

    A pergunta agora e a oposta, e por isso o criterio foi SUBSTITUIDO em vez de apagado: nenhum
    conteiner nosso pode estar na barra da direita. O `defaultVisibility: hidden` continua cobrado
    — ele e o que impede a barra de nascer aberta por causa de conteiner de OUTRA extensao, que
    nao esta sob nosso controle.
  */
  checar('⛔ V24: NENHUM conteiner nosso na barra da direita (ele nao quer essa aba)',
    secundaria.length === 0 && padroes['workbench.secondarySideBar.defaultVisibility'] === 'hidden',
    JSON.stringify({ secundaria: secundaria.map(c => c.id), visibilidade: padroes['workbench.secondarySideBar.defaultVisibility'] }))
  checar('⛔ V24: e a vista Tokens NÃO sumiu do produto — mudou de lugar, para a barra de cima',
    (manifesto.contributes.viewsContainers.activitybar || []).some(c => c.id === 'oficinaTokens')
    && !(soltos || []).includes('workbench.view.extension.oficinaTokens'),
    JSON.stringify((manifesto.contributes.viewsContainers.activitybar || []).map(c => c.id)))
  checar('⛔ V20: e os números foram para a barra de cima, não sumiram (t196)',
    manifesto.contributes.menus.titleBar.some(m => m.command === 'oficina.tokensNaBarra') &&
    (manifesto.contributes.commands || []).some(c => c.command === 'oficina.tokens.abrir'),
    manifesto.contributes.menus.titleBar.map(m => m.command).join())
  checar('V13: todo contêiner nosso na lista existe no manifesto', nossosNaLista.length > 0 && nossosNaLista.every(id => nossos.includes(id)), nossosNaLista.join(', '))
  // A chave do produto é a mesma que o núcleo declara (0001) e lê (0012): um nome trocado de um lado só
  // compila, mescla e abre com os sete ícones — sem erro nenhum.
  const pasta = path.join(REPO, 'patches')
  const texto = nome => fsDaPonte.readFileSync(path.join(pasta, fsDaPonte.readdirSync(pasta).find(f => f.startsWith(nome) && f.endsWith('.patch'))), 'utf8')
  checar('⛔ V13: a chave do produto é a que o núcleo declara e lê', Object.keys(produto).includes('defaultUnpinnedViewContainers') &&
    /readonly defaultUnpinnedViewContainers\?:/.test(texto('0001-')) && /product\.defaultUnpinnedViewContainers\b/.test(texto('0012-')))
  // A barra lateral fica SÓ com Arquivos, Git e Skills (decisão do dono): Contas e Gerenciar, os dois ícones globais do
  // pé da barra, saem por uma chave do produto que o patch 0014 declara e lê (não há configuração para os dois).
  checar('⛔ a barra lateral não mostra Contas nem Gerenciar: a chave do produto é a que o núcleo declara e lê',
    produto.hideActivityBarGlobalActions === true && /readonly hideActivityBarGlobalActions\?:/.test(texto('0014-')) &&
    /this\.productService\.hideActivityBarGlobalActions/.test(texto('0014-')), String(produto.hideActivityBarGlobalActions))

  // O comando de conectar ao GitHub: existe, tem botão na barra do Git, e está no guia de boas-vindas.
  checar('V13: o comando "Conectar ao GitHub" é registrado', registro.comandos.has('oficina.conectarGithub'))
  checar('V13: ele tem botão no título da vista do Git', ((manifesto.contributes.menus['scm/title']) || []).some(m => m.command === 'oficina.conectarGithub'))
  const passoDaLateral = (manifesto.contributes.walkthroughs[0].steps || []).find(p => p.id === 'arquivos') || {}
  checar('V13: o guia de boas-vindas apresenta os botões da barra e leva ao Git e ao GitHub',
    /Arquivos/.test(passoDaLateral.description) && /Skills/.test(passoDaLateral.description) &&
    /command:workbench\.view\.scm/.test(passoDaLateral.description) && /command:oficina\.conectarGithub/.test(passoDaLateral.description))
  // O guia cita os ícones que a barra mostra de fábrica — calculados, não copiados: Arquivos e Git (do núcleo; os
  // outros do núcleo estão na lista de soltos) mais cada contêiner nosso que NÃO está na lista de soltos. Quando
  // um ícone novo foi fixado (o Navegador), o guia continuou dizendo "três" e nenhum teste percebeu.
  const fixadosDeFabrica = ['Arquivos', 'Git', ...(manifesto.contributes.viewsContainers.activitybar || [])
    .filter(c => !(soltos || []).includes('workbench.view.extension.' + c.id)).map(c => c.title)]
  const PALAVRA = { 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis' }
  const midiaDaLateral = ((passoDaLateral.media || {}).altText) || ''
  const arquivoDaLateral = fsDaPonte.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'boas-vindas', 'arquivos.md'), 'utf8')
  const contagemDita = texto => { const m = /\b(dois|três|quatro|cinco|seis) botões/i.exec(texto); return m ? m[1].toLowerCase() : null }
  checar('⛔ o guia cita TODOS os ícones fixados de fábrica, e o número que ele diz é o número deles',
    fixadosDeFabrica.length >= 3 && fixadosDeFabrica.every(n => passoDaLateral.description.includes(n) && arquivoDaLateral.includes(n)) &&
    [passoDaLateral.description, midiaDaLateral].every(t => contagemDita(t) === null || contagemDita(t) === PALAVRA[fixadosDeFabrica.length]),
    `fixados: ${fixadosDeFabrica.join(', ')} · o guia diz: ${contagemDita(passoDaLateral.description)} / ${contagemDita(midiaDaLateral)}`)
  /*
    ⚠️ V20: O GUIA DEIXOU DE FALAR DO MAPA DE AGENTES, E ISSO É CONSEQUÊNCIA, NÃO DESCUIDO.

    O mapa ("N agentes") é do painel PRÓPRIO, que a decisão do `t187` tirou do caminho principal:
    quem abre o programa cai na conversa da extensão oficial, onde ele não existe. Ensinar no guia
    de primeiros passos um botão que a pessoa não vai encontrar é pior que não ensinar.

    O que este critério protegia continua valendo, e agora vale para o guia INTEIRO: ele não pode
    prometer "quanto gastou" em dinheiro onde a tela mostra tokens. Se algum passo voltar a falar de
    agentes, volta a ter de falar em tokens.
  */
  {
    const passos = manifesto.contributes.walkthroughs[0].steps || []
    const falamDeAgentes = passos.filter(p => /agentes/i.test(p.description || ''))
    const textoDoGuia = passos.map(p => p.description || '').join('\n')
    checar('o guia não promete gasto em dinheiro onde a tela mostra tokens',
      !/quanto (gastou|custou)/i.test(textoDoGuia), textoDoGuia.slice(0, 160))
    checar('e, se algum passo falar do mapa de agentes, ele o descreve por tokens',
      falamDeAgentes.every(p => /tokens/i.test(p.description)),
      `passos que falam de agentes: ${falamDeAgentes.length}`)
  }

  const conectar = registro.comandos.get('oficina.conectarGithub')
  const zerar = () => { registro.informacoes.length = 0; registro.filaDeInformacoes.length = 0; registro.pedidosDeSessao.length = 0
    registro.erros.length = 0; registro.rodados.length = 0; registro.sessaoDoGithub = null; registro.entradaDoGithub = null }
  const ESCOPOS = ['repo', 'workflow', 'user:email', 'read:user']

  // Sem conta, a pessoa fecha a explicação: o fluxo de entrada NÃO começa.
  zerar()
  let r = await conectar()
  const explicacao = registro.informacoes[0] || { resto: [] }
  checar('⛔ V13: antes de entrar, a explicação vem numa janela modal e fala do código', !!explicacao.resto[0] && explicacao.resto[0].modal === true &&
    /código/.test(explicacao.resto[0].detail || ''), (explicacao.resto[0] || {}).detail)
  checar('⛔ V13: fechar a explicação não começa a entrada', r.resultado === 'desistiu' && !registro.pedidosDeSessao.some(p => p.opcoes.createIfNone))

  // Continuar: a entrada é pedida ao provedor do GitHub, com os escopos que clonar e publicar reaproveitam.
  zerar()
  registro.filaDeInformacoes.push('Continuar', 'Abrir o Git')
  registro.entradaDoGithub = { account: { label: 'pessoa-teste' } }
  r = await conectar()
  const entrada = registro.pedidosDeSessao.find(p => p.opcoes.createIfNone) || {}
  checar('⛔ V13: "Continuar" pede a entrada ao provedor do GitHub', entrada.provedor === 'github', JSON.stringify(entrada))
  checar('V13: com os escopos que clonar e publicar reaproveitam', JSON.stringify(entrada.escopos) === JSON.stringify(ESCOPOS), JSON.stringify(entrada.escopos))
  checar('V13: conectado, a tela diz com qual conta', r.resultado === 'conectado' && registro.informacoes.some(i => /Conectado ao GitHub como pessoa-teste/.test(i.msg)))
  checar('V13: "Abrir o Git" abre a vista do Git', registro.rodados.includes('workbench.view.scm'))

  // Já conectado: não pede entrada de novo.
  zerar()
  registro.sessaoDoGithub = { account: { label: 'pessoa-teste' } }
  r = await conectar()
  checar('V13: já conectado, não abre a entrada de novo', r.resultado === 'ja-conectado' && !registro.pedidosDeSessao.some(p => p.opcoes.createIfNone) &&
    registro.informacoes.some(i => /Já conectado ao GitHub como pessoa-teste/.test(i.msg)))

  // Cancelar no meio não é erro; faltar o módulo de conta é, e diz o porquê.
  zerar()
  registro.filaDeInformacoes.push('Continuar')
  registro.entradaDoGithub = new Error('User Cancelled')
  r = await conectar()
  checar('V13: cancelar a entrada avisa sem janela de erro', r.resultado === 'cancelou' && registro.erros.length === 0 &&
    registro.informacoes.some(i => /cancelada/.test(i.msg)))
  zerar()
  registro.filaDeInformacoes.push('Continuar')
  registro.entradaDoGithub = new Error("No authentication provider 'github' is currently registered.")
  r = await conectar()
  checar('V13: sem o módulo de conta, o erro diz o porquê em português', r.resultado === 'falhou' && registro.erros.some(e => /módulo de conta do GitHub/.test(e)), registro.erros.join(' | '))
  // Depois do nosso "Continuar", o NÚCLEO mostra outra janela, dele e em inglês ("…wants to sign in using GitHub",
  // botão Allow). Recusar essa janela lança este erro exato (`mainThreadAuthentication.ts`) — é desistência, não falha.
  zerar()
  registro.filaDeInformacoes.push('Continuar')
  registro.entradaDoGithub = new Error('User did not consent to login.')
  r = await conectar()
  checar('⛔ V13: recusar a janela do editor ("Allow") é cancelar, e não erro em inglês', r.resultado === 'cancelou' && registro.erros.length === 0 &&
    registro.informacoes.some(i => /cancelada/.test(i.msg)), `${r.resultado} | ${registro.erros.join(' | ')}`)
  // O que a pessoa vai ver depois da nossa janela, dito antes e em português: a pergunta do editor (Allow) e o
  // segundo caminho que o módulo de conta oferece quando o código falha ou é cancelado (o token pessoal).
  const detalheDoGithub = (explicacao.resto[0] || {}).detail || ''
  checar('V13: a explicação avisa da pergunta do editor em inglês e explica o token pessoal, em português',
    /Allow/.test(detalheDoGithub) && /token de acesso pessoal/.test(detalheDoGithub) && /senha/.test(detalheDoGithub), detalheDoGithub.slice(0, 200))
  zerar()
}

// ─────────────────────────────────────────────────────────────────────────────
// V14 — OS TOKENS E O RELÓGIO DO CACHE NO PÉ DA CONVERSA, pela extensão de verdade
// ─────────────────────────────────────────────────────────────────────────────
// A tela de tokens publica; o host repassa ao pé da aba viva, e o `pronto` de uma página que (re)subiu
// recebe o estado de agora. Arquivo de conversa de verdade, numa pasta de configuração descartável.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const encerrarOriginal = Conversa.prototype.encerrar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  Conversa.prototype.encerrar = async function () { }
  const configAntes = process.env.CLAUDE_CONFIG_DIR
  const configDir = fsDaPonte.mkdtempSync(path.join(requerer('os').tmpdir(), 'oficina-ponte-v14-'))
  try {
    const ID = 'ffffffff-0000-0000-0000-000000000014'
    const pastaProj = path.join(configDir, 'projects', 'D--pasta')
    fsDaPonte.mkdirSync(pastaProj, { recursive: true })
    fsDaPonte.writeFileSync(path.join(pastaProj, ID + '.jsonl'), JSON.stringify({
      type: 'assistant', timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      message: { id: 'v14a', model: 'claude-opus-5', content: [], usage: { input_tokens: 5, output_tokens: 50, cache_read_input_tokens: 90000, cache_creation_input_tokens: 2000,
        cache_creation: { ephemeral_1h_input_tokens: 2000, ephemeral_5m_input_tokens: 0 } } },
    }) + '\n')
    process.env.CLAUDE_CONFIG_DIR = configDir

    await registro.comandos.get('oficina.abrirPainel')()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    const conversa = abertas[abertas.length - 1]
    const doPe = () => registro.mensagensParaTela.filter(m => m.tipo === 'tokens')
    checar('V14: a página que sobe recebe o pé no `pronto` (sem conversa: vazio)', doPe().length >= 1 && doPe()[0].texto === null, JSON.stringify(doPe()[0]))

    conversa.aoEvento({ tipo: 'pronto', conversa: conversa.id, sessao: ID })
    await ate(() => doPe().some(m => m.texto))
    const pe = doPe().filter(m => m.texto).pop()
    checar('⛔ V14: os tokens da conversa chegam ao pé (contexto · processado · custo)', !!pe && /^92k · 92k · US\$ [\d,]+\*$/.test(pe.texto), pe && pe.texto)
    checar('⛔ V14: o relógio do cache chega junto: 1 h lida da resposta, 10 min passados', !!pe && !!pe.relogio && pe.relogio.minutos === 50 && pe.relogio.suposto === false && pe.relogio.vencido === false,
      pe && JSON.stringify(pe.relogio))

    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    checar('⛔ V14: a página que recarregou com a conversa viva recebe os números e o relógio de novo', doPe().some(m => m.texto && m.relogio), JSON.stringify(doPe()))
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.encerrar = encerrarOriginal
    if (configAntes === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = configAntes
    fsDaPonte.rmSync(configDir, { recursive: true, force: true })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V15 — MODELO E ESFORÇO pelo painel de escolha: a tela pede, o host decide se avisa o custo, o motor troca
// ─────────────────────────────────────────────────────────────────────────────
// O agente é um dublê só nas três chamadas que importam (`setModel`, `applyFlagSettings`, `getSettings`);
// o resto é a extensão de verdade. O cache quente vem de um arquivo de conversa real, como no bloco V14.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const { listaDeModelos } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'modelos.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const encerrarOriginal = Conversa.prototype.encerrar
  const abertas = []
  const chamadas = { setModel: [], applyFlagSettings: [] }
  const LISTA = [
    { value: 'default', resolvedModel: 'claude-opus-5[1m]', displayName: 'Default (recommended)', description: 'Opus 5', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Sonnet 5', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku', description: 'Haiku 4.5' },
  ]
  Conversa.prototype.iniciar = async function () {
    abertas.push(this)
    this.estado = 'ociosa'
    const st = { model: 'claude-opus-5[1m]', effort: 'high' }
    this._consulta = {
      async setModel(v) { chamadas.setModel.push(v); const i = LISTA.find(x => x.value === (v === undefined ? 'default' : v)); st.model = i.resolvedModel; st.effort = i.supportsEffort ? 'high' : null },
      async applyFlagSettings(s) { chamadas.applyFlagSettings.push(s); st.effort = s.effortLevel },
      async getSettings() { return { applied: { model: st.model, effort: st.effort } } },
    }
    this.modelos = listaDeModelos(LISTA)
    this.modelo = st.model
    this.esforco = st.effort
  }
  Conversa.prototype.encerrar = async function () { }
  const configAntes = process.env.CLAUDE_CONFIG_DIR
  const configDir = fsDaPonte.mkdtempSync(path.join(requerer('os').tmpdir(), 'oficina-ponte-v15-'))
  try {
    // A aba do bloco anterior fecha (como o editor avisa), e esta abre com uma conversa nova.
    for (const fn of registro.painelCriado._aoFechar) fn()
    await esperar(20)
    await registro.comandos.get('oficina.abrirPainel')()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    const conversa = abertas[abertas.length - 1]
    const doTipo = tipo => registro.mensagensParaTela.filter(m => m.tipo === tipo)

    // Cache frio (nenhuma resposta ainda): a troca vai direto ao agente.
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'trocarEsforco', nivel: 'low' })
    let volta = doTipo('modelo').pop()
    checar('⛔ V15: o esforço pedido pela tela chega ao agente como `applyFlagSettings({ effortLevel })`',
      JSON.stringify(chamadas.applyFlagSettings) === '[{"effortLevel":"low"}]', JSON.stringify(chamadas.applyFlagSettings))
    checar('⛔ V15: e a tela recebe de volta o estado em uso ("Opus 5 (1M) · baixo")', !!volta && volta.rotulo === 'Opus 5 (1M) · baixo' && volta.ok === true, volta && volta.rotulo)
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'trocarModelo', valor: 'haiku' })
    volta = doTipo('modelo').pop()
    checar('⛔ V15: sem cache quente, o modelo pedido pela tela troca direto (`setModel`), sem pergunta',
      chamadas.setModel.join() === 'haiku' && doTipo('confirmarModelo').length === 0 && !!volta && volta.rotulo === 'Haiku 4.5', JSON.stringify(chamadas.setModel))

    // Cache quente: uma resposta de 10 min atrás, cache de 1 h, 92 mil tokens de contexto.
    const ID = 'ffffffff-0000-0000-0000-000000000015'
    const pastaProj = path.join(configDir, 'projects', 'D--pasta')
    fsDaPonte.mkdirSync(pastaProj, { recursive: true })
    fsDaPonte.writeFileSync(path.join(pastaProj, ID + '.jsonl'), JSON.stringify({
      type: 'assistant', timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      message: { id: 'v15a', model: 'claude-haiku-4-5-20251001', content: [], usage: { input_tokens: 5, output_tokens: 50, cache_read_input_tokens: 90000, cache_creation_input_tokens: 2000,
        cache_creation: { ephemeral_1h_input_tokens: 2000, ephemeral_5m_input_tokens: 0 } } },
    }) + '\n')
    process.env.CLAUDE_CONFIG_DIR = configDir
    conversa.aoEvento({ tipo: 'pronto', conversa: conversa.id, sessao: ID })
    await ate(() => doTipo('tokens').some(m => m.relogio && !m.relogio.vencido))
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'trocarModelo', valor: 'sonnet' })
    const pergunta = doTipo('confirmarModelo').pop()
    checar('⛔ V15: com o cache quente, a primeira escolha volta como PERGUNTA com o custo, e o agente não é chamado',
      !!pergunta && pergunta.valor === 'sonnet' && /50 min/.test(pergunta.texto) && /92 mil tokens/.test(pergunta.texto) && /US\$/.test(pergunta.texto) &&
      chamadas.setModel.join() === 'haiku', pergunta && pergunta.texto)
    await aoReceberDaTela({ tipo: 'trocarModelo', valor: 'sonnet', confirmado: true })
    volta = doTipo('modelo').pop()
    checar('⛔ V15: confirmada, a troca chega ao agente', chamadas.setModel.join() === 'haiku,sonnet' && !!volta && volta.emUso === 'sonnet', JSON.stringify(chamadas.setModel))

    // A tela que recarregou com a conversa viva recebe o botão e o painel de novo.
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    const deNovo = doTipo('modelo').pop()
    checar('⛔ V15: a página que recarregou com a conversa viva recebe o modelo e o esforço em uso',
      !!deNovo && deNovo.rotulo === 'Sonnet 5 · alto' && Array.isArray(deNovo.modelos) && deNovo.modelos.length === 3, deNovo && deNovo.rotulo)
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.encerrar = encerrarOriginal
    if (configAntes === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = configAntes
    fsDaPonte.rmSync(configDir, { recursive: true, force: true })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V16 — OS AGENTES EM PARALELO: do motor (ao vivo) e do disco (conversa retomada) até o mapa da tela
// ─────────────────────────────────────────────────────────────────────────────
// O motor é o de verdade (`_traduzir` recebe as mensagens no formato medido na sonda); só o `stopTask` do agente é
// dublê. O disco é uma pasta de configuração descartável com a conversa, os arquivos e as fichas dos subagentes.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const encerrarOriginal = Conversa.prototype.encerrar
  const abertas = []
  const paradas = []
  let pararFalha = false
  Conversa.prototype.iniciar = async function () {
    abertas.push(this)
    this.estado = 'ociosa'
    this._consulta = { async stopTask(id) { paradas.push(id); if (pararFalha) throw new Error('no such task') } }
  }
  Conversa.prototype.encerrar = async function () { }
  const configAntes = process.env.CLAUDE_CONFIG_DIR
  const configDir = fsDaPonte.mkdtempSync(path.join(requerer('os').tmpdir(), 'oficina-ponte-v16-'))
  const sis = (subtype, extra) => ({ type: 'system', subtype, session_id: 's', uuid: 'u', ...extra })
  try {
    for (const fn of registro.painelCriado._aoFechar) fn()
    await esperar(20)
    await registro.comandos.get('oficina.abrirPainel')()
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    const conversa = abertas[abertas.length - 1]
    const doTipo = tipo => registro.mensagensParaTela.filter(m => m.tipo === tipo)
    // O último mapa que a tela recebeu (vazio se nenhum: o critério fica vermelho em vez de derrubar a suíte).
    const ultimoMapaDaTela = () => doTipo('agentes').pop() || { agentes: [], sessao: {} }
    const cartao = (m, id) => (m.agentes || []).find(a => a.id === id) || {}

    // 1. Ao vivo: um agente nasce no motor → a tela recebe o MAPA pronto (não a lista crua do motor).
    registro.mensagensParaTela.length = 0
    conversa._traduzir(sis('background_tasks_changed', { tasks: [{ task_id: 'a1', task_type: 'local_agent', description: 'revisar o motor' }] }))
    conversa._traduzir(sis('task_started', { task_id: 'a1', tool_use_id: 'tu1', description: 'revisar o motor', subagent_type: 'general-purpose', is_backgrounded: true, spawn_depth: 1, task_type: 'local_agent' }))
    let mapa = ultimoMapaDaTela()
    checar('⛔ V16: o agente que nasce no motor chega à tela como MAPA pronto (quantos rodam, o cartão, a sessão)',
      !!mapa && mapa.rodando === 1 && mapa.total === 1 && mapa.rotulo === '1 agente' && mapa.agentes[0].nome === 'revisar o motor' && mapa.agentes[0].podeParar === true &&
      !!mapa.sessao && typeof mapa.sessao.titulo === 'string' && mapa.vivos === undefined, JSON.stringify(mapa))
    // Os mesmos dados de novo não mandam outro mapa (o progresso chega a cada ferramenta de cada agente).
    const antes = doTipo('agentes').length
    conversa._traduzir(sis('task_updated', { task_id: 'a1', patch: { status: 'running' } }))
    checar('V16: mapa igual ao último não é mandado de novo', doTipo('agentes').length === antes, `${antes} -> ${doTipo('agentes').length}`)

    // 2. Parar pela tela: chega ao `stopTask` do agente; recusa volta para a tela.
    await aoReceberDaTela({ tipo: 'pararAgente', id: 'a1' })
    checar('⛔ V16: "parar" pedido pela tela chega ao agente como `stopTask(id)`, e o cartão passa a "parando"',
      JSON.stringify(paradas) === '["a1"]' && cartao(ultimoMapaDaTela(), 'a1').parando === true && doTipo('agenteNaoParou').length === 0, JSON.stringify(paradas))
    await aoReceberDaTela({ tipo: 'pararAgente', id: 'nao-existe' })
    checar('⛔ V16: parada que não vale (agente que não existe) volta para a tela como `agenteNaoParou`, sem chegar ao agente',
      doTipo('agenteNaoParou').some(m => m.id === 'nao-existe') && paradas.length === 1, JSON.stringify(doTipo('agenteNaoParou')))
    conversa._traduzir(sis('task_notification', { task_id: 'a1', status: 'stopped', output_file: '', summary: '' }))
    mapa = ultimoMapaDaTela()
    checar('V16: o fim (`stopped`) chega à tela: parado, e o botão volta a "0 agentes"', mapa.rodando === 0 && mapa.rotulo === '0 agentes' && cartao(mapa, 'a1').estado === 'parado', JSON.stringify(cartao(mapa, 'a1')))

    // 3. A página que recarregou com a conversa viva recebe o mapa de novo, mesmo igual.
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pronto' })
    checar('⛔ V16: a página que recarregou com a conversa viva recebe o mapa dos agentes de novo', doTipo('agentes').some(m => m.total === 1), JSON.stringify(doTipo('agentes')))

    // 4. Do disco (a conversa retomada): fichas e arquivos dos subagentes, com um de segundo nível.
    const ID = 'ffffffff-0000-0000-0000-000000000016'
    const pastaProj = path.join(configDir, 'projects', 'D--pasta')
    const sub = path.join(pastaProj, ID, 'subagents')
    fsDaPonte.mkdirSync(sub, { recursive: true })
    const linha = (id, hora, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: hora, message: { id, model: 'claude-opus-5', content: [], usage: { input_tokens: 5, output_tokens: 5, ...extra } } }) + '\n'
    fsDaPonte.writeFileSync(path.join(pastaProj, ID + '.jsonl'), linha('p1', new Date().toISOString(), { cache_read_input_tokens: 1000 }))
    fsDaPonte.writeFileSync(path.join(sub, 'agent-d1.jsonl'), linha('x1', '2026-09-18T10:00:00.000Z') + linha('x2', '2026-09-18T10:05:00.000Z'))
    fsDaPonte.writeFileSync(path.join(sub, 'agent-d1.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'da abertura anterior', toolUseId: 'tud1', spawnDepth: 1 }))
    fsDaPonte.writeFileSync(path.join(sub, 'agent-d2.jsonl'), linha('y1', '2026-09-18T10:01:00.000Z'))
    fsDaPonte.writeFileSync(path.join(sub, 'agent-d2.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'lançado pelo d1', toolUseId: 'tud2', parentAgentId: 'd1', spawnDepth: 2 }))
    process.env.CLAUDE_CONFIG_DIR = configDir
    registro.mensagensParaTela.length = 0
    conversa.aoEvento({ tipo: 'pronto', conversa: conversa.id, sessao: ID })
    await ate(() => doTipo('agentes').some(m => m.agentes.some(a => a.id === 'd2')))
    mapa = ultimoMapaDaTela()
    const d1 = (mapa && mapa.agentes.find(a => a.id === 'd1')) || {}
    const d2 = (mapa && mapa.agentes.find(a => a.id === 'd2')) || {}
    checar('⛔ V16: conversa retomada — os agentes do disco chegam ao mapa, terminados, com o nome da ficha e a duração',
      d1.nome === 'da abertura anterior' && d1.estado === 'terminou' && d1.doDisco === true && d1.duracaoMs === 5 * 60 * 1000 && d1.podeParar === false, JSON.stringify(d1))
    checar('⛔ V16: o de segundo nível do disco fica DENTRO do pai (pela ficha), com o nome dele', d2.nome === 'lançado pelo d1' && d2.pai === 'd1' && JSON.stringify(d1.filhos) === '["d2"]',
      JSON.stringify({ d2, filhos: d1.filhos }))
    checar('V16: o cartão da sessão traz o contexto lido do disco', !!mapa && /no contexto/.test(mapa.sessao.linha), mapa && mapa.sessao.linha)

    // 5. Uma parada que o agente recusa (ele já tinha acabado entre o clique e o pedido).
    pararFalha = true
    conversa._traduzir(sis('task_started', { task_id: 'a2', tool_use_id: 'tu2', description: 'outro', task_type: 'local_agent', is_backgrounded: true, spawn_depth: 1 }))
    registro.mensagensParaTela.length = 0
    await aoReceberDaTela({ tipo: 'pararAgente', id: 'a2' })
    checar('V16: `stopTask` que falha → a tela recebe `agenteNaoParou`, e o cartão volta a poder ser parado',
      doTipo('agenteNaoParou').some(m => m.id === 'a2') && cartao(ultimoMapaDaTela(), 'a2').podeParar === true)
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.encerrar = encerrarOriginal
    if (configAntes === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = configAntes
    fsDaPonte.rmSync(configDir, { recursive: true, force: true })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V17 — O NAVEGADOR COM TAMANHOS DE TELA: a lista de aparelhos, o botão da lateral e o que vai ao navegador
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ O navegador do editor é de mentira aqui: uma aba que grava cada mensagem CDP recebida. O que se prova
// é o que a extensão MANDA (aparelho, sessão da página, ordem); o que o navegador FAZ com isso se prova de
// dentro da página, em `tela_navegador.mjs`.
{
  const manifesto = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const produto = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
  const c = manifesto.contributes
  const cont = (c.viewsContainers.activitybar || []).find(v => v.id === 'oficinaNavegador')
  checar('⛔ V17: a vista "Navegador" tem contêiner próprio, com ícone que existe',
    !!cont && (c.views.oficinaNavegador || []).some(v => v.id === 'oficina.navegador') &&
    fsDaPonte.existsSync(path.join(REPO, 'extensoes', 'oficina-claude', cont.icon)))
  // O Navegador saiu da barra lateral (decisão do dono): nasce SOLTO, e abre pelo comando "Navegador" da paleta.
  checar('⛔ o Navegador nasce SOLTO (fora da barra lateral) e abre pelo comando da paleta',
    !!cont && Array.isArray(produto.defaultUnpinnedViewContainers) &&
    produto.defaultUnpinnedViewContainers.includes('workbench.view.extension.oficinaNavegador') &&
    c.commands.some(x => x.command === 'oficina.navegador.abrir') &&
    !((c.menus.commandPalette || []).some(m => m.command === 'oficina.navegador.abrir' && m.when === 'false')), JSON.stringify(produto.defaultUnpinnedViewContainers))
  checar('⛔ V17: a extensão declara a API proposta do navegador', Array.isArray(manifesto.enabledApiProposals) && manifesto.enabledApiProposals.includes('browser'))
  const comandosDoManifesto = c.commands.map(x => x.command).filter(n => n.startsWith('oficina.navegador.'))
  const doMenu = c.menus['view/title'].filter(m => /oficina\.navegador/.test(m.when || '')).map(m => m.command)
  const soltos = [...comandosDoManifesto, ...doMenu].filter(n => !registro.comandos.has(n))
  checar('V17: todo comando e botão do navegador aponta para um comando registrado', comandosDoManifesto.length >= 5 && soltos.length === 0,
    soltos.join(', ') || `${comandosDoManifesto.length} comandos, ${doMenu.length} botões`)
  const vista = registro.objetosDaVista['oficina.navegador']
  checar('⛔ V17: a vista diz, na tela, que iOS e Android são imitação e o motor é o Chromium',
    !!vista && /Chromium/.test(vista.message || '') && /não o Safari/.test(vista.message || ''), vista && vista.message)

  // ── A lista de aparelhos: completa e coerente ──
  let N = null
  try { N = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'navegador.js')) } catch { /* ausente: tudo abaixo fica vermelho */ }
  const lista = N ? N.aparelhos() : []
  const doGrupo = g => lista.filter(a => a.grupo === g)
  const tem = (g, l, h) => doGrupo(g).some(a => a.largura === l && a.altura === h)
  checar('⛔ V17: desktop 1366×768 e 1920×1080; widescreen 2560×1080 e 3440×1440',
    tem('desktop', 1366, 768) && tem('desktop', 1920, 1080) && tem('widescreen', 2560, 1080) && tem('widescreen', 3440, 1440))
  const polegadasDe = g => new Set(doGrupo(g).map(a => a.polegadas))
  checar('⛔ V17: iOS e Android separados, cada um com celulares de pelo menos três polegadas diferentes',
    polegadasDe('ios').size >= 3 && polegadasDe('android').size >= 3 && doGrupo('tablet').length >= 2,
    `iOS ${[...polegadasDe('ios')].join('/')} · Android ${[...polegadasDe('android')].join('/')}`)
  const incompletos = lista.filter(a => !(a.id && a.nome && a.fonte && a.largura > 0 && a.altura > 0 && a.densidade > 0 && typeof a.agente === 'string' && a.agente.startsWith('Mozilla/5.0 ')))
  checar('⛔ V17: todo aparelho tem largura, altura, densidade > 0, agente e fonte', lista.length >= 12 && incompletos.length === 0, incompletos.map(a => a.id).join(', '))
  checar('V17: os ids não se repetem', lista.length > 0 && new Set(lista.map(a => a.id)).size === lista.length)
  const coerente = a => {
    if (a.sistema === 'iOS') return /\(iPhone; CPU iPhone OS \d+_\d+ like Mac OS X\)/.test(a.agente) && /Mobile\/\w+ Safari\//.test(a.agente) && !/Android|Chrome/.test(a.agente)
    if (a.sistema === 'iPadOS') return /Macintosh|iPad/.test(a.agente) && /Safari\//.test(a.agente) && !/Android|Chrome/.test(a.agente)
    if (a.sistema === 'Android') return /\(Linux; Android \d+/.test(a.agente) && /Chrome\/\d+/.test(a.agente) && (a.grupo === 'tablet' || /Mobile Safari/.test(a.agente))
    if (a.sistema === 'Windows') return /\(Windows NT 10\.0; Win64; x64\)/.test(a.agente) && /Chrome\/\d+/.test(a.agente) && !/Mobile/.test(a.agente)
    return false
  }
  const incoerentes = lista.filter(a => !coerente(a))
  checar('⛔ V17: o agente do navegador é coerente com o sistema de cada aparelho', lista.length > 0 && incoerentes.length === 0, incoerentes.map(a => a.id).join(', '))
  const grupoCerto = a => ({ ios: 'iOS', android: 'Android' })[a.grupo] ? ({ ios: 'iOS', android: 'Android' })[a.grupo] === a.sistema : true
  checar('V17: cada celular está no grupo do sistema dele', lista.length > 0 && lista.every(grupoCerto))
  const toqueErrado = lista.filter(a => a.movel !== !['desktop', 'widescreen'].includes(a.grupo))
  checar('V17: celular e tablet com toque; monitor sem', lista.length > 0 && toqueErrado.length === 0, toqueErrado.map(a => a.id).join(', '))
  // A conta que amarra os números: TELA em px CSS × densidade = pixels físicos (a tela, não a área da página).
  const telaDe = a => Array.isArray(a.tela) ? a.tela : [a.largura, a.altura]
  const semConta = lista.filter(a => a.movel && !(Array.isArray(a.pixels) && a.polegadas > 0 &&
    Math.abs(telaDe(a)[0] * a.densidade - a.pixels[0]) <= 3 && Math.abs(telaDe(a)[1] * a.densidade - a.pixels[1]) <= 3))
  checar('⛔ V17: celular e tablet — tela × densidade = pixels físicos (±3 px), com polegadas', lista.length > 0 && semConta.length === 0, semConta.map(a => a.id).join(', '))
  // A página não tem a tela inteira: a barra do navegador e a do sistema comem parte dela. Onde o descritor do
  // Playwright separa as duas, a altura mandada é a da PÁGINA — senão a análise "acima da dobra" sai otimista.
  const comTela = lista.filter(a => Array.isArray(a.tela))
  checar('⛔ V17: onde a tela e a área da página diferem, o aparelho usa a área da página (iPhone 15: 393×659, tela 852)',
    comTela.length >= 4 && comTela.every(a => a.altura < a.tela[1] && a.largura === a.tela[0]) &&
    lista.some(a => a.id === 'iphone-15' && a.altura === 659 && a.tela[1] === 852), comTela.map(a => `${a.id} ${a.largura}×${a.altura} (tela ${a.tela && a.tela.join('×')})`).join(', '))
  // A fonte que a tela mostra tem de ser verdade: o descritor citado pelo nome (o "iPhone SE" do Playwright é o de
  // 4 polegadas; o de 375×667 é o "(3rd gen)"), sem "ficha do fabricante" que não foi consultada, e sem "pedida".
  const fonteErrada = lista.filter(a => /ficha do fabricante|pedida/i.test(a.fonte || '') ||
    (a.movel && !(a.descritor && (a.fonte || '').includes(`"${a.descritor}"`))))
  checar('⛔ V17: a fonte de cada aparelho é verdade (descritor pelo nome; nada de ficha que não foi consultada)',
    lista.length > 0 && fonteErrada.length === 0 && lista.some(a => a.id === 'iphone-se' && a.descritor === 'iPhone SE (3rd gen)'),
    fonteErrada.map(a => a.id + ': ' + a.fonte).join(' | ').slice(0, 300))

  // ── A árvore da vista ──
  const provedor = registro.arvores['oficina.navegador']
  const raiz = provedor ? provedor.getChildren() : []
  const rotulos = raiz.map(t => t.label)
  checar('⛔ V17: a vista tem abrir endereço, abrir o HTML do editor e os cinco grupos',
    ['Abrir endereço…', 'Abrir o HTML do editor', 'Desktop', 'Widescreen', 'Tablet', 'iOS (imitação)', 'Android (imitação)'].every(r => rotulos.includes(r)), rotulos.join(' | '))
  const folhas = raiz.flatMap(t => provedor.getChildren(t))
  const semClique = folhas.filter(f => !(f.command && f.command.command === 'oficina.navegador.emular' && lista.some(a => a.id === f.command.arguments[0])))
  checar('V17: cada aparelho da vista é clicável e aponta para o aparelho certo', lista.length > 0 && folhas.length === lista.length && semClique.length === 0, `${folhas.length} folhas`)

  // ── O navegador de mentira: a aba grava o que recebe ──
  const abas = []
  function abaFalsa(url) {
    const aba = { url, recebidas: [], sessoesAbertas: 0 }
    aba.startCDPSession = async () => {
      aba.sessoesAbertas++
      const ouvintes = []
      return {
        onDidReceiveMessage: fn => { ouvintes.push(fn); return { dispose() { } } },
        onDidClose: () => ({ dispose() { } }),
        close: async () => { },
        sendMessage: async m => {
          aba.recebidas.push(m)
          const r = m.method === 'Target.getTargets' ? { targetInfos: [{ targetId: 'T1', type: 'page' }] }
            : m.method === 'Target.attachToTarget' ? { sessionId: 'S1' } : {}
          setTimeout(() => ouvintes.forEach(f => f({ id: m.id, result: r })), 1)
        },
      }
    }
    return aba
  }
  const janela = vscodeFalso.window
  janela.browserTabs = []
  janela.activeBrowserTab = undefined
  janela.openBrowserTab = async (url, opcoes) => { const a = abaFalsa(url); a.opcoes = opcoes; abas.push(a); janela.browserTabs = [...abas]; return a }
  const emular = registro.comandos.get('oficina.navegador.emular')
  const girar = registro.comandos.get('oficina.navegador.girar')
  const doMetodo = (aba, m) => aba.recebidas.filter(x => x.method === m)
  const ultimo = (aba, m) => doMetodo(aba, m).pop()

  if (emular && girar) {
    // 1. Sem aba aberta: escolher o aparelho pede o endereço, abre e aplica.
    registro.respostaDoTexto = 'localhost:8080'
    await emular('iphone-15')
    const aba = abas[0]
    checar('⛔ V17: sem página aberta, escolher o aparelho pede o endereço e abre no navegador do editor', !!aba && aba.url === 'http://localhost:8080', aba && aba.url)
    const metr = aba && ultimo(aba, 'Emulation.setDeviceMetricsOverride')
    checar('⛔ V17: iPhone 15 → 393×659 (a área da página), densidade 3, móvel, na sessão da PÁGINA',
      !!metr && metr.params.width === 393 && metr.params.height === 659 && metr.params.deviceScaleFactor === 3 && metr.params.mobile === true && metr.sessionId === 'S1', JSON.stringify(metr))
    const ag = aba && ultimo(aba, 'Emulation.setUserAgentOverride')
    const toque = aba && ultimo(aba, 'Emulation.setTouchEmulationEnabled')
    checar('⛔ V17: iPhone 15 → agente do Safari do iPhone e toque ligado, e a página recarrega',
      !!ag && /iPhone OS/.test(ag.params.userAgent) && !!toque && toque.params.enabled === true && doMetodo(aba, 'Page.reload').length === 1)
    checar('V17: a página é achada e presa antes da emulação (getTargets → attachToTarget com flatten)',
      !!aba && aba.recebidas[0].method === 'Target.getTargets' && aba.recebidas[1].method === 'Target.attachToTarget' && aba.recebidas[1].params.flatten === true)
    registro.respostaDoTexto = undefined

    // 2. Com a aba aberta: trocar de aparelho não abre outra, e reaproveita a sessão.
    janela.activeBrowserTab = aba
    await emular('desktop-1920')
    const d = ultimo(aba, 'Emulation.setDeviceMetricsOverride')
    checar('⛔ V17: Full HD → 1920×1080, densidade 1, sem móvel e sem toque, na mesma aba e sessão',
      d.params.width === 1920 && d.params.height === 1080 && d.params.deviceScaleFactor === 1 && d.params.mobile === false &&
      ultimo(aba, 'Emulation.setTouchEmulationEnabled').params.enabled === false && abas.length === 1 && aba.sessoesAbertas === 1)
    checar('V17: a vista marca o aparelho em uso', provedor.getChildren(provedor.getChildren().find(t => t.label === 'Desktop')).some(f => f.label === 'Full HD' && /em uso/.test(f.description)))

    // 3. Girar: o celular em uso passa a paisagem; o monitor não gira.
    await emular('pixel-8')
    await girar()
    const g = ultimo(aba, 'Emulation.setDeviceMetricsOverride')
    checar('⛔ V17: girar o Pixel 8 vai à área da página em paisagem (863×360, do descritor de paisagem)', g.params.width === 863 && g.params.height === 360, JSON.stringify(g.params))
    await emular('wide-3440')
    const w = ultimo(aba, 'Emulation.setDeviceMetricsOverride')
    checar('V17: em paisagem, monitor continua como é (3440×1440)', w.params.width === 3440 && w.params.height === 1440)
    await girar()

    // 4. Tamanho do painel: tira o aparelho.
    const antes = aba.recebidas.length
    await emular(null)
    const depois = aba.recebidas.slice(antes).map(m => m.method)
    checar('⛔ V17: "Tamanho do painel" desfaz o aparelho (limpa a tela, devolve o agente, desliga o toque)',
      depois.includes('Emulation.clearDeviceMetricsOverride') && ultimo(aba, 'Emulation.setUserAgentOverride').params.userAgent === '' &&
      ultimo(aba, 'Emulation.setTouchEmulationEnabled').params.enabled === false, depois.join(', '))

    // 5. Id desconhecido (chamada de fora, sem o clique) não manda nada.
    const n = aba.recebidas.length
    await emular('nao-existe')
    checar('V17 (controle): aparelho desconhecido não manda nada ao navegador', aba.recebidas.length === n)

    // 6. Página nova com aparelho escolhido já nasce nele.
    await emular('galaxy-s24')
    janela.activeBrowserTab = undefined
    await registro.comandos.get('oficina.navegador.abrirEndereco')('exemplo.com.br')
    const nova = abas[abas.length - 1]
    const nm = nova && ultimo(nova, 'Emulation.setDeviceMetricsOverride')
    checar('V17: página nova abre com o aparelho em uso (Galaxy S24 360×780) e endereço sem esquema vira https',
      abas.length === 2 && nova.url === 'https://exemplo.com.br' && !!nm && nm.params.width === 360 && nm.params.height === 780, JSON.stringify({ url: nova && nova.url, nm }))

    // 7. O HTML do editor: sem .html aberto, explica; com, abre o arquivo.
    registro.informacoes.length = 0
    janela.activeTextEditor = undefined
    await registro.comandos.get('oficina.navegador.abrirHtml')()
    checar('V17: "Abrir o HTML do editor" sem .html aberto explica o que fazer', registro.informacoes.some(i => /\.html/.test(i.msg)) && abas.length === 2)
    janela.activeTextEditor = { document: { languageId: 'html', uri: { scheme: 'file', fsPath: 'C:\\p\\index.html', toString: () => 'file:///c%3A/p/index.html' } } }
    await registro.comandos.get('oficina.navegador.abrirHtml')()
    checar('⛔ V17: "Abrir o HTML do editor" abre o arquivo no navegador do editor', abas.length === 3 && abas[2].url === 'file:///c%3A/p/index.html', abas[2] && abas[2].url)
    delete janela.activeTextEditor

    // 8. Sem a API do navegador (editor que não a entrega): erro que diz o porquê, e nada quebra.
    const abrirAntes = janela.openBrowserTab
    delete janela.openBrowserTab
    registro.erros.length = 0
    await emular('iphone-se')
    checar('V17: sem a API do navegador, a pessoa lê o porquê', registro.erros.some(e => /navegador integrado/.test(e)), registro.erros.join(' | '))
    janela.openBrowserTab = abrirAntes
  } else {
    checar('⛔ V17: os comandos do navegador foram registrados', false)
  }
  if (N) {
    checar('V17: endereço digitado vira endereço navegável', N.normalizarEndereco('localhost:3000') === 'http://localhost:3000' &&
      N.normalizarEndereco('127.0.0.1:8080/x') === 'http://127.0.0.1:8080/x' && N.normalizarEndereco('exemplo.com') === 'https://exemplo.com' &&
      N.normalizarEndereco('file:///c:/a.html') === 'file:///c:/a.html' && N.normalizarEndereco('  ') === null)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V18 — O LAYOUT LIVRE: a altura da caixa de escrever guardada sozinha, e "Voltar ao layout padrão"
// ─────────────────────────────────────────────────────────────────────────────
// Pela extensão de verdade. O núcleo de mentira NÃO tem os patches 0011 e 0013: a frase do resultado tem de
// dizer o que não voltou. Duas abas de conversa (a segunda pelo serializador) para provar que a mudança de
// uma chega à outra, e não volta como eco para quem mudou.
{
  const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const encerrarOriginal = Conversa.prototype.encerrar
  Conversa.prototype.iniciar = async function () { this.estado = 'ociosa' }
  Conversa.prototype.encerrar = async function () { }
  try {
    // A barra de cima continua Arquivos, Conversa e Layout: quem cobra é o bloco da V11 (o item novo mora no menu).
    for (const fn of registro.painelCriado._aoFechar) fn()
    await esperar(20)
    delete registro.estadoGlobal['oficina.layout.tamanhos']
    await registro.comandos.get('oficina.abrirPainel')()
    const telaA = aoReceberDaTela
    // A caixa de mensagens da aba A separada também: abas de blocos anteriores, nunca fechadas, ouvem os tamanhos.
    const recebidasA = []
    const painelA = registro.painelCriado
    const postarOriginal = painelA.webview.postMessage
    painelA.webview.postMessage = m => { recebidasA.push(m); return postarOriginal(m) }
    registro.mensagensParaTela.length = 0
    await telaA({ tipo: 'pronto' })
    const tamanhosDaTela = () => registro.mensagensParaTela.filter(m => m.tipo === 'tamanhos')
    // Sem a feature, nada é guardado: o critério fica vermelho em vez de derrubar a suíte.
    const guardadoAgora = () => registro.estadoGlobal['oficina.layout.tamanhos'] || {}
    checar('⛔ V18: a página que sobe recebe os tamanhos guardados no `pronto` (nada guardado: automático)',
      tamanhosDaTela().length === 1 && tamanhosDaTela()[0].caixa === null, JSON.stringify(tamanhosDaTela()))

    // A segunda aba, com a caixa de mensagens dela separada.
    const recebidasB = []
    const painelB = painelFalso('Conversa B')
    painelB.webview.postMessage = m => { recebidasB.push(m); return Promise.resolve(true) }
    await registro.serializador.deserializeWebviewPanel(painelB, { falas: [] })
    const telaB = aoReceberDaTela
    await telaB({ tipo: 'pronto' })
    await telaB({ tipo: 'pronto' })   // a restaurada limpa no primeiro e abre no segundo

    recebidasA.length = 0
    recebidasB.length = 0
    await telaA({ tipo: 'tamanho', parte: 'caixa', valor: 180.4 })
    const guardado = registro.estadoGlobal['oficina.layout.tamanhos']
    checar('⛔ V18: soltar a alça guarda a altura da caixa no perfil, sem botão (inteiro)', !!guardado && guardado.caixa === 180, JSON.stringify(guardado))
    checar('⛔ V18: a OUTRA aba recebe a altura nova', recebidasB.some(m => m.tipo === 'tamanhos' && m.caixa === 180), JSON.stringify(recebidasB))
    checar('V18: quem mudou não recebe o próprio eco (e a outra aba recebeu)', recebidasB.some(m => m.tipo === 'tamanhos') && !recebidasA.some(m => m.tipo === 'tamanhos'), JSON.stringify(recebidasA))
    await telaA({ tipo: 'tamanho', parte: 'caixa', valor: 99999 })
    checar('V18: altura absurda é guardada no teto, não como veio', guardadoAgora().caixa === 1200, JSON.stringify(guardadoAgora()))
    await telaA({ tipo: 'tamanho', parte: 'caixa', valor: 180 })
    await telaA({ tipo: 'tamanho', parte: 'barraDeCima', valor: 90 })
    await telaA({ tipo: 'tamanho', parte: 'caixa', valor: 'muito' })
    checar('V18 (controle): parte desconhecida e valor estragado não mudam nada',
      JSON.stringify(guardadoAgora()) === JSON.stringify({ caixa: 180 }), JSON.stringify(guardadoAgora()))
    registro.mensagensParaTela.length = 0
    await telaA({ tipo: 'pronto' })
    checar('⛔ V18: a página que (re)sobe recebe a altura guardada', tamanhosDaTela().some(m => m.caixa === 180), JSON.stringify(tamanhosDaTela()))

    // ── O menu Layout ──
    const layout = registro.comandos.get('oficina.layout')
    registro.filaDeEscolhas = ['__nada__']
    await layout()
    const itens = registro.itensDoSocorro || []
    const padrao = itens.find(i => i.id === 'padrao')
    checar('⛔ V18: o menu Layout tem "Voltar ao layout padrão…"', !!padrao && /Voltar ao layout padrão/.test(padrao.label), itens.map(i => i.label).join(' | '))

    // Um layout com nome guardado ANTES, para provar que o "voltar ao padrão" não o apaga (e que leva a caixa).
    registro.filaDeEscolhas = ['salvar']
    registro.respostaDoTexto = 'Minha tela'
    await layout()
    const preset = (registro.estadoGlobal['oficina.layout.presets'] || {})['Minha tela']
    checar('V18: o layout com nome leva a altura da caixa junto', !!preset && preset.tamanhos && preset.tamanhos.caixa === 180, JSON.stringify(preset && preset.tamanhos))

    // Cancelar a confirmação não mexe em nada.
    registro.config['workbench.statusBar.visible'] = true
    registro.config['workbench.activityBar.compact'] = true
    registro.avisosDeCuidado.length = 0
    registro.rodados.length = 0
    registro.filaDeEscolhas = ['padrao']
    registro.respostaDoCuidado = undefined
    await layout()
    const pergunta = registro.avisosDeCuidado[0] || ''
    checar('⛔ V18: "Voltar ao layout padrão" pergunta antes, e a pergunta diz que os layouts com nome NÃO são apagados',
      /Voltar ao layout padrão\?/.test(pergunta) && /layouts com nome NÃO são apagados/.test(pergunta), pergunta)
    checar('⛔ V18 (controle): sem confirmar, nada volta', guardadoAgora().caixa === 180 &&
      registro.config['workbench.statusBar.visible'] === true && !registro.rodados.includes('workbench.action.resetViewLocations'))

    // Confirmar.
    recebidasA.length = 0
    recebidasB.length = 0
    registro.avisosDeCuidado.length = 0
    registro.filaDeEscolhas = ['padrao']
    registro.respostaDoCuidado = 'Voltar ao padrão'
    await layout()
    registro.respostaDoCuidado = undefined
    const t = registro.estadoGlobal['oficina.layout.tamanhos']
    checar('⛔ V18: confirmado, a caixa de escrever volta ao automático (no perfil)', registro.rodados.includes('workbench.action.resetViewLocations') &&
      (!t || t.caixa === undefined || t.caixa === null), JSON.stringify(t))
    checar('⛔ V18: e as DUAS abas abertas recebem o automático', recebidasA.some(m => m.tipo === 'tamanhos' && m.caixa === null) &&
      recebidasB.some(m => m.tipo === 'tamanhos' && m.caixa === null))
    checar('⛔ V18: as configurações de tela voltam ao padrão do programa (inclusive a barra de ícones compacta)',
      !('workbench.statusBar.visible' in registro.config) && !('workbench.activityBar.compact' in registro.config), JSON.stringify(registro.config))
    checar('⛔ V18: o lugar das vistas volta pelo comando do próprio editor, e os grupos do editor ficam iguais',
      registro.rodados.includes('workbench.action.resetViewLocations') && registro.rodados.includes('workbench.action.evenEditorWidths'), registro.rodados.join(','))
    checar('V18: pede ao núcleo os ícones da barra lateral de fábrica (patch 0013)', registro.rodados.includes('_workbench.activityBar.resetToProductDefaults'))
    checar('⛔ V18: os layouts com nome continuam lá (depois de voltar ao padrão)', registro.rodados.includes('workbench.action.resetViewLocations') &&
      !!(registro.estadoGlobal['oficina.layout.presets'] || {})['Minha tela'])
    const frase = registro.avisosDeCuidado.slice(-1)[0] || ''
    checar('⛔ V18: sem os patches do núcleo, a frase DIZ o que não voltou (ícones da barra, tamanho das partes) e que os layouts continuam',
      /menos/.test(frase) && /ícones fixados na barra lateral/.test(frase) && /tamanho e a visibilidade das partes/.test(frase) && /layouts com nome continuam salvos/.test(frase), frase)

    // Aplicar o layout com nome devolve a caixa.
    registro.filaDeEscolhas = ['aplicar']
    await layout()
    checar('V18: aplicar o layout com nome devolve a altura da caixa', (registro.estadoGlobal['oficina.layout.tamanhos'] || {}).caixa === 180,
      JSON.stringify(registro.estadoGlobal['oficina.layout.tamanhos']))

    // A barra de ícones: dois tamanhos, e o item diz o que faz.
    delete registro.config['workbench.activityBar.compact']
    registro.filaDeEscolhas = ['barraCompacta']
    await layout()
    const ligouCompacta = registro.config['workbench.activityBar.compact'] === true
    checar('V18: "Barra de ícones compacta" liga o tamanho compacto do editor', ligouCompacta)
    registro.filaDeEscolhas = ['__nada__']
    await layout()
    const itens2 = registro.itensDoSocorro || []
    checar('V18: compacta, o item passa a oferecer o tamanho normal (e não o mesmo de novo)', itens2.some(i => i.id === 'barraNormal') && !itens2.some(i => i.id === 'barraCompacta'))
    registro.filaDeEscolhas = ['barraNormal']
    await layout()
    checar('V18: "tamanho normal" tira o valor (volta ao do programa)', ligouCompacta && !('workbench.activityBar.compact' in registro.config))
    registro.filaDeEscolhas = []
    for (const fn of painelB._aoFechar) fn()
    for (const fn of painelA._aoFechar) fn()
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.encerrar = encerrarOriginal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ A JANELA FECHA: a desativação encerra o que esta janela deixou rodando
// ─────────────────────────────────────────────────────────────────────────────
// A regra mora em `encerramento.js` (provada em `comando.mjs`, com processos de verdade). Aqui se prova o fio:
// o `deactivate` da extensão chama a regra com o programa do agente que VEM DENTRO dela e este host como pai.
{
  const E = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'encerramento.js'))
  const requererDaExtensao = createRequire(path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'))
  let agente = null
  try { agente = requererDaExtensao.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${process.platform === 'win32' ? 'claude.exe' : 'claude'}`) } catch { }
  const agora = Date.now()
  const lerOriginal = E.meios.lerTabela, matarOriginal = E.meios.matar
  const mortos = []
  E.meios.lerTabela = () => [
    { pid: 90001, pai: process.pid, exe: agente, criadoMs: agora },
    { pid: 90002, pai: 90001, exe: 'bash.exe', criadoMs: agora + 10 },
    { pid: 90003, pai: 90002, exe: 'powershell.exe', criadoMs: agora + 20 },
    { pid: 90004, pai: process.pid, exe: 'outro.exe', criadoMs: agora },
    { pid: 90005, pai: 90004, exe: 'bash.exe', criadoMs: agora + 10 },
  ]
  E.meios.matar = pids => mortos.push(...pids)
  try { extensao.deactivate() } finally { E.meios.lerTabela = lerOriginal; E.meios.matar = matarOriginal }
  mortos.sort((a, b) => a - b)
  checar('⛔ ao fechar a janela, a desativação encerra o que o agente desta janela lançou (e só isso)',
    !!agente && mortos.join() === '90002,90003', `agente ${agente ? 'achado' : 'NÃO achado'} · encerrados: ${mortos.join(',') || 'nenhum'}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ O SEGREDO DO CANAL PRIVADO: a edição SEM canal de update nunca o lê
// ─────────────────────────────────────────────────────────────────────────────
// As duas edições dividem a mesma pasta de dados do usuário; numa máquina que já rodou a da equipe, o arquivo do
// segredo existe também para a outra. A guarda de origem (o segredo só vai para a origem do `updateUrl`) protegia,
// mas era a única trava. Aqui o código do patch 0007 roda de verdade (o método tirado do texto do patch, sem os
// tipos), contra uma pasta com um segredo válido: sem `updateUrl`, nem a leitura acontece.
{
  const pasta0007 = path.join(REPO, 'patches')
  const texto0007 = fsDaPonte.readFileSync(path.join(pasta0007, fsDaPonte.readdirSync(pasta0007).find(f => f.startsWith('0007-') && f.endsWith('.patch'))), 'utf8')
  const linhas = texto0007.split('\n')
  const ini = linhas.findIndex(l => /^\+\s*protected lerSegredoDoCanal\(\)/.test(l))
  let corpo = null
  if (ini >= 0) {
    const fim = linhas.findIndex((l, i) => i > ini && /^\+\t\}\s*$/.test(l))
    corpo = linhas.slice(ini + 1, fim).map(l => l.slice(1)).join('\n')
  }
  const pastaDoSegredo = fsDaPonte.mkdtempSync(path.join(requerer('os').tmpdir(), 'oficina-canal-'))
  fsDaPonte.writeFileSync(path.join(pastaDoSegredo, 'canal-privado.txt'), 'segredo-de-teste-0123456789abcdef\n')
  const leituras = []
  const rodarMetodo = produto => {
    // eslint-disable-next-line no-new-func
    const fn = new Function('readFileSync', 'join', corpo)
    const lerArquivo = (...a) => { leituras.push(a[0]); return fsDaPonte.readFileSync(...a) }
    return fn.call({ productService: produto, environmentMainService: { userDataPath: pastaDoSegredo } }, lerArquivo, path.join)
  }
  let semCanal = 'não rodou', comCanal = 'não rodou'
  let leuSemCanal = null
  try {
    semCanal = rodarMetodo({})
    leuSemCanal = leituras.length
    comCanal = rodarMetodo({ updateUrl: 'https://canal.exemplo/e' })
  } catch (e) { semCanal = 'erro: ' + e.message }
  checar('⛔ a edição sem canal de update NÃO lê o segredo do canal privado (nem abre o arquivo)',
    !!corpo && semCanal === undefined && leuSemCanal === 0, `devolveu ${JSON.stringify(semCanal)}, leituras ${leuSemCanal}`)
  checar('CONTROLE: com canal de update, o mesmo código lê o segredo (o critério acima não passa vazio)',
    comCanal === 'segredo-de-teste-0123456789abcdef', JSON.stringify(comCanal))
  fsDaPonte.rmSync(pastaDoSegredo, { recursive: true, force: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ Com Contas e Gerenciar fora da barra (0014), o menu da barra não oferece "Accounts" marcado e sem efeito
// ─────────────────────────────────────────────────────────────────────────────
// Medido no executável: o menu de contexto da barra lateral listava "Accounts" MARCADO, e o ícone não existia (nem
// voltava ao clicar). O trecho do patch roda aqui com o produto de mentira: com a chave ligada, nenhum item.
{
  const pasta0014 = path.join(REPO, 'patches')
  const texto0014 = fsDaPonte.readFileSync(path.join(pasta0014, fsDaPonte.readdirSync(pasta0014).find(f => f.startsWith('0014-') && f.endsWith('.patch'))), 'utf8')
  const linhas = texto0014.split('\n')
  const ini = linhas.findIndex(l => /^[ +]\tgetContextMenuActions\(\): IAction\[\] \{/.test(l))
  const fim = ini < 0 ? -1 : linhas.findIndex((l, i) => i > ini && /^[ +]\t\}\s*$/.test(l))
  let comChave = 'o trecho não está no patch', semChave = null
  if (ini >= 0 && fim > ini) {
    const corpo = linhas.slice(ini + 1, fim).filter(l => !l.startsWith('-')).map(l => l.slice(1)).join('\n')
    const toAction = a => a
    const localize = (_k, t) => t
    const rodar = produto => new Function('toAction', 'localize', corpo).call({ productService: produto, accountsVisibilityPreference: true }, toAction, localize)
    comChave = rodar({ hideActivityBarGlobalActions: true }).map(a => a.label)
    semChave = rodar({}).map(a => a.label)
  }
  checar('⛔ 0014: com Contas e Gerenciar fora, o menu da barra não lista "Accounts" (marcado e sem efeito)',
    Array.isArray(comChave) && comChave.length === 0, JSON.stringify(comChave))
  checar('CONTROLE: sem a chave do produto, o menu continua oferecendo "Accounts" (o comportamento de origem)',
    Array.isArray(semChave) && semChave.join() === 'Accounts', JSON.stringify(semChave))
}

// ── V19: o aviso de limite do plano não é fala da conversa ───────────────────
//
// O limite é da CONTA. Ele vale igual em qualquer aba, e quem o desenha é a barra de cima —
// nunca a tela da conversa. Este critério é o par do `SO_DO_HOST` lá em cima: sem ele, pôr um
// tipo naquela lista seria apenas calar o alarme.
{
  const requererPonte = createRequire(import.meta.url)
  const { Conversa } = requererPonte(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const iniciarOriginal = Conversa.prototype.iniciar
  const enviarOriginal = Conversa.prototype.enviar
  const abertas = []
  Conversa.prototype.iniciar = async function () { abertas.push(this); this.estado = 'ociosa' }
  Conversa.prototype.enviar = function () { return true }
  try {
    await registro.comandos.get('oficina.novaConversa')()
    await aoReceberDaTela({ tipo: 'pronto' })
    const conversa = abertas[abertas.length - 1]
    registro.mensagensParaTela.length = 0
    conversa.aoEvento({ tipo: 'limite', conversa: conversa.id, aviso: { status: 'allowed', utilization: 0.07 } })
    await esperar(30)
    checar('⛔ V19: o aviso de limite NÃO vai para a tela da conversa',
      !registro.mensagensParaTela.some(m => m.tipo === 'limite'),
      registro.mensagensParaTela.map(m => m.tipo).join(', ') || 'nada foi para a tela')
    // Controle positivo: o mesmo caminho, com um evento que É da conversa, chega à tela.
    registro.mensagensParaTela.length = 0
    conversa.aoEvento({ tipo: 'texto', conversa: conversa.id, texto: 'oi' })
    await ate(() => registro.mensagensParaTela.some(m => m.tipo === 'texto'))
    checar('V19 (controle): pelo MESMO caminho, um evento que é da conversa chega à tela',
      registro.mensagensParaTela.some(m => m.tipo === 'texto'))

    /*
      ⛔ O AVISO CHEGA AO MOSTRADOR — e chega de QUALQUER conversa, inclusive de uma que não é a
      corrente. O limite é da CONTA: se o desvio estivesse abaixo do filtro que cala as outras
      conversas, o número da barra de cima congelaria sem ninguém saber por quê.
    */
    const valorDaChave = chave => {
      for (let i = registro.contextos.length - 1; i >= 0; i--) {
        if (registro.contextos[i][0] === chave) return registro.contextos[i][1]
      }
      return undefined
    }
    const outra = { id: 'uma-conversa-que-nao-e-a-corrente', aoEvento: conversa.aoEvento }
    outra.aoEvento({
      tipo: 'limite', conversa: outra.id,
      aviso: { status: 'allowed', rateLimitType: 'five_hour',
        unifiedWindows: { five_hour: { utilization: 0.41, resetsAt: 1789917600 }, seven_day: { utilization: 0.77, resetsAt: 1790254800 } } },
    })
        /*
      V20 — ESTE CAMINHO MUDOU DE PONTA A PONTA, E O CRITERIO MUDOU COM ELE.

      Ate a V19, o numero do limite vinha do AVISO que o laco da conversa propria empurrava, e ia
      para o texto da barra de cima. Na V20 os dois lados cairam: a conversa propria deixou de ser
      o caminho principal (t187 - logo nao ha aviso a receber), e o limite saiu da barra (t188)
      para virar a FAIXA de medidores (t199).

      O que este criterio protege continua o mesmo - o numero do limite chega a tela - mas agora
      pelo caminho que existe: o registro que o programa de linha de comando escreve no disco vira
      os medidores que o nucleo desenha. Trocar por um criterio que nao prova nada seria pior que
      apagar; o que ele cobra e o fio inteiro, do arquivo ate a chave.
    */
    {
      const faixaMod = requererPonteDoLimite(path.join(REPO, 'extensoes', 'oficina-claude', 'faixaDoLimite.js'))
      const chavesDaFaixa = {}
      const editorFalso = { commands: { executeCommand: (c, k, v) => { if (c === 'setContext') chavesDaFaixa[k] = v; return Promise.resolve() } } }
      /*
        ⚠️ `aoVivo: false` E CACHE PROPRIO, DE PROPOSITO. Este criterio mede o fio do REGISTRO ate a
        chave. Depois que a faixa passou a perguntar ao agente (21/09/2026), deixa-la ligada aqui
        fazia o numero REAL desta maquina (44%) chegar por cima do numero do duble (41%) — e o
        criterio ficava vermelho sem defeito nenhum. O fio da consulta ao vivo tem criterio proprio,
        logo abaixo.
      */
      const pastaDoCacheDaPonte = fsDaPonte.mkdtempSync(path.join(os.tmpdir(), 'oficina-ponte-faixa-'))
      const registroDoDisco = { cachedUsageUtilization: { accountUuid: 'nao-pode-vazar', utilization: {
        five_hour: { utilization: 41, resets_at: '2026-09-21T17:40:00Z' },
        seven_day: { utilization: 77, resets_at: '2026-09-24T13:00:00Z' },
        nimbus_quill: { utilization: 17, resets_at: null },
      } } }
      const faixa = faixaMod.criarFaixa(editorFalso, {
        marcar: () => null, desmarcar: () => { },
        aoVivo: false, pastaDoCache: pastaDoCacheDaPonte,
        lerRegistro: async () => registroDoDisco,
      })
      await faixa.lerAgora()
      const cru = String(chavesDaFaixa[faixaMod.CHAVE_DA_FAIXA] || '')
      const publicado = JSON.parse(cru || '{}')
      checar('V20: o registro do disco vira os medidores que o nucleo desenha na faixa',
        JSON.stringify(publicado.medidores) === JSON.stringify([{ rotulo: '5h', pct: 41 }, { rotulo: '7d', pct: 77 }]), cru)
      checar('V20: o terceiro limite nao entra na faixa, e nada da conta e publicado (ordem dele)',
        !/fable|nimbus|accountUuid|nao-pode-vazar/i.test(cru) && !(publicado.medidores || []).some(m => m.pct === 17), cru)
      const manifestoV20 = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
      checar('V20: o botao de expandir aponta para um comando declarado E registrado',
        publicado.botao === 'oficina.limite.detalhe' &&
        manifestoV20.contributes.commands.some(c => c.command === publicado.botao) &&
        registro.comandos.has(publicado.botao),
        JSON.stringify({ botao: publicado.botao, registrado: registro.comandos.has(publicado.botao) }))
      const produtoV20 = JSON.parse(fsDaPonte.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
      let patch17 = ''
      try { patch17 = fsDaPonte.readFileSync(path.join(REPO, 'patches', '0017-faixa-de-medidores-no-banner.patch'), 'utf8') } catch { patch17 = '' }
      checar('V20: a chave que a faixa escreve e a que o produto declara ao nucleo',
        produtoV20.bannerGaugesContextKey === faixaMod.CHAVE_DA_FAIXA,
        `produto: ${produtoV20.bannerGaugesContextKey} - faixa: ${faixaMod.CHAVE_DA_FAIXA}`)
      checar('V20: e o nucleo le esse nome do produto, em vez de te-lo escrito dentro',
        /bannerGaugesContextKey/.test(patch17) && !/oficina\.faixa/.test(patch17),
        patch17 ? 'patch lido' : 'patch nao encontrado')

      /*
        V20 (21/09/2026) — O FIO DA CONSULTA AO VIVO ATE A CHAVE.

        O criterio de cima prova que o REGISTRO chega a tela. Este prova o que conserta o defeito
        que ele viu: quando o agente responde, e o numero DELE que o nucleo desenha — mesmo com o
        registro do disco dizendo outra coisa, que foi exatamente o caso medido na maquina dele
        (registro parado em 29% havia 50 min; o real era 42%).
      */
      {
        const chavesAoVivo = {}
        const editorAoVivo = { commands: { executeCommand: (c, k, v) => { if (c === 'setContext') chavesAoVivo[k] = v; return Promise.resolve() } } }
        const consultaFalsa = {
          perguntar: async () => ({ estado: 'ok', quando: Date.now(), resposta: { rate_limits_available: true, rate_limits: {
            five_hour: { utilization: 42, resets_at: '2026-09-21T22:50:00Z' },
            seven_day: { utilization: 90, resets_at: '2026-09-24T13:00:00Z' },
          } } }),
          descartar: () => { },
        }
        const faixaViva = faixaMod.criarFaixa(editorAoVivo, {
          marcar: () => null, desmarcar: () => { },
          pastaDoCache: fsDaPonte.mkdtempSync(path.join(os.tmpdir(), 'oficina-ponte-viva-')),
          consulta: consultaFalsa,
          lerRegistro: async () => ({ cachedUsageUtilization: { fetchedAtMs: Date.now() - 50 * 60 * 1000, utilization: {
            five_hour: { utilization: 29, resets_at: '2026-09-21T17:40:00Z' },
            seven_day: { utilization: 88, resets_at: '2026-09-24T13:00:00Z' },
          } } }),
        })
        await faixaViva.lerAgora()
        const cruViva = String(chavesAoVivo[faixaMod.CHAVE_DA_FAIXA] || '')
        const medidoresVivos = JSON.parse(cruViva || '{}').medidores
        checar('V20: com o agente respondendo, e o numero AO VIVO que o nucleo desenha (e nao o registro parado)',
          JSON.stringify(medidoresVivos) === JSON.stringify([{ rotulo: '5h', pct: 42 }, { rotulo: '7d', pct: 90 }]), cruViva)
        faixaViva.descartar()
      }
    }
  } finally {
    Conversa.prototype.iniciar = iniciarOriginal
    Conversa.prototype.enviar = enviarOriginal
  }
}

fsDaPonte.rmSync(PASTA_DO_REGISTRO, { recursive: true, force: true })

Module._load = carregarOriginal

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou, total: resultados.length,
  falhas: resultados.filter(r => !r.ok).map(r => r.nome),
}))
process.exit(passou ? 0 : 1)
