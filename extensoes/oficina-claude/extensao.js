// A OFICINA abre DIRETO na conversa.
//
// Pedido do dono do projeto, olhando a tela: "ele abrir qualquer tela que não seja
// direto a do claude, não sei por que ainda não tá assim" — junto com tirar o painel
// da esquerda e a tela do meio.
//
// Os três são um problema só. Quando a conversa abre ocupando o editor e a barra
// lateral fecha, somem juntos: o explorador da esquerda, o marca-d'água do meio
// ("Open Chat / Show All Commands / Start Debugging") e a tela vazia. Não adianta
// atacar um por um.
//
// ⚠️ POR QUE ISTO É CÓDIGO, E NÃO CONFIGURAÇÃO. Foi procurado antes de escrever:
//   - `workbench.startupEditor` não tem valor "abra a view de tal extensão". Os
//     valores são none / welcomePage / readme / newUntitledFile / terminal /
//     welcomePageInEmptyWorkbench / agentSessionsWelcomePage.
//   - a barra lateral não tem configuração de visibilidade inicial. O default vem de
//     `LayoutStateKeys.SIDEBAR_HIDDEN`, calculado em `layout.ts` a partir de haver ou
//     não pasta aberta — não há chave para quem quer sempre fechada.
// O que existe é o que está aqui: comando, na abertura.
//
// O CUSTO, declarado: quem quiser o explorador o abre com Ctrl+Shift+E, como em
// qualquer editor. Trocamos "o explorador está sempre lá" por "a conversa está sempre
// lá" — que é o produto que este projeto se propôs a ser.

const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Conversa, ESTADO } = require('./agente')
const { Revisoes, temDiff, resumoParaTela } = require('./revisao')
const { TerminalDoAgente } = require('./terminal')
const telaSessoes = require('./telaSessoes')
const acoes = require('./acoes')
const { Registro } = require('./registro')
const { criarTelaDeTokens } = require('./telaTokens')
const { Layouts, validarNome, fraseDoResultado, fraseDoPadrao } = require('./layout')
const { Tamanhos } = require('./tamanhos')
const { criarTelaDeSkills } = require('./telaSkills')
const { pedidoDaSkill } = require('./skills')
const { conectarAoGithub } = require('./github')
const { avisoDaTroca } = require('./modelos')
const { montarMapa } = require('./agentes')
const { criarNavegador, AVISO: AVISO_DO_NAVEGADOR } = require('./navegador')
/** V26 — as duas vistas novas da barra de cima: as conexões (MCPs) e a conta. */
const mcps = require('./mcps')
const contaDoClaude = require('./conta')
const { criarTelaDeMcps } = require('./telaMcps')
const { criarTelaDaConta } = require('./telaConta')
const encerramento = require('./encerramento')
const { criarMostrador: criarMostradorDoLimite } = require('./mostradorDoLimite')
/** V20 — a faixa de medidores (t199) e o mostrador de tokens da barra de cima (t196). */
const { criarFaixa: criarFaixaDoLimite } = require('./faixaDoLimite')
const { criarMostradorDeTokens } = require('./mostradorDeTokens')
const pastaDeSempre = require('./pastaDeSempre')
const { criarVerHtml } = require('./verHtml')
const { renomearAConversa } = require('./renomearConversa')
const { criarMapaDosAgentes } = require('./mapaDosAgentes')
const extensoesQueFaltam = require('./extensoesQueFaltam')
const { criarTelaDoConsumo } = require('./telaDoConsumo')
const ajustesDaOficial = require('./ajustesDaConversaOficial')
/** V20 — o padrão de fábrica que a conversa oficial só lê da camada de quem usa (o bypass). */
const padraoDaOficial = require('./padraoDaConversaOficial')
const { lerRegistroDoDisco: lerRegistroDoUso } = require('./faixaDoLimite')
/** V20 — a consulta ao vivo do limite do plano e o cache dela, compartilhado entre janelas. */
const consultaDeUso = require('./consultaDeUso')

/** V10 — a barra e a vista de tokens da conversa aberta (ver `telaTokens.js`). */
let telaDeTokens = null
/** V12 — a vista de skills (ver `telaSkills.js`). */
let telaDeSkills = null
/** V18 — os tamanhos de dentro da conversa (a caixa de escrever), guardados no perfil (ver `tamanhos.js`). */
let tamanhosDaTela = null
/** V19 — o mostrador do limite do plano na barra de cima. `null` até ele subir na ativação. */
let mostradorDoLimite = null
/** V20 — a faixa de medidores do limite (t199). `null` até ela subir na ativação. */
let faixaDoLimite = null
/** V20 — o mostrador de tokens da barra de cima (t196). `null` até ele subir na ativação. */
let mostradorDeTokens = null
let mapaDosAgentes = null
/** V20 — a tela que o expandir da faixa abre (t199). `null` até a ativação. */
let telaDoConsumo = null

/** V8 — o registro em disco (ver `registro.js`). `null` só quando o editor não deu pasta nenhuma. */
let registroEmDisco = null
/** Anota sem nunca lançar, e sem exigir que o registro exista. */
function anotar(evento, dados) {
  if (registroEmDisco) registroEmDisco.anotar(evento, dados)
}

/** A revisão das mudanças no editor (V3) — uma por janela, criada na ativação. */
let revisoes = null
/** O terminal onde os comandos aprovados rodam (V4) — um por janela. */
let terminalDoAgente = null

/** Executa um comando sem deixar o erro subir. */
async function tentar(comando, ...args) {
  try {
    await vscode.commands.executeCommand(comando, ...args)
    return true
  } catch (e) {
    // Silêncio de propósito, mas COM registro: a extensão do Claude pode não estar
    // instalada num build de teste, e uma janela de erro na abertura seria pior que o
    // problema que esta extensão resolve.
    console.log(`[oficina] o comando "${comando}" nao rodou: ${e && e.message}`)
    anotar('comando.falhou', { comando, mensagem: String((e && e.message) || e) })
    return false
  }
}

/**
 * Os dois botoes da BARRA SUPERIOR — o pedido dele: "deixa icone do app, foto de perfil
 * do git, icone do files, icone do claude, barra de pesquisa, e o minimizar e fechar".
 *
 * O icone do app, a barra de pesquisa e os controles da janela ja vinham do core. O que
 * faltava era juntar o explorador e a conversa NA MESMA barra — e nao havia porta:
 * `MenuId.TitleBar` existe e e a barra de ferramentas global de la, mas nenhum dos 97
 * pontos de menu abertos a extensoes apontava para ela. O patch 0002 abre essa porta,
 * uma entrada, sem dizer ao core quais icones queremos. QUAIS sao esta escrito aqui e
 * no manifesto, onde se muda sem recompilar.
 *
 * ⚠️ Eles ABREM; nao alternam. A API de extensao nao expoe se a barra lateral esta
 * visivel — so o proprio workbench sabe — e inventar esse estado do lado de ca daria um
 * botao que erra na segunda vez que a pessoa mexe na tela por outro caminho (Ctrl+B, o
 * "x" do painel). Melhor um botao previsivel: abre. Fechar continua sendo Ctrl+B, como
 * em qualquer editor. Se um dia isso incomodar, o lugar certo de resolver e um context
 * key no `when` do manifesto, nao um palpite guardado em memoria.
 */
function registrarBotoesDaBarraSuperior(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('oficina.abrirArquivos', async () => {
      // `workbench.view.explorer` e nao `toggleSidebarVisibility`: o segundo reabriria
      // o que estivesse por ultimo na lateral (busca, git, extensoes). O botao se chama
      // ARQUIVOS, entao ele mostra arquivos.
      await tentar('workbench.view.explorer')
    }),
    // ⚠️ NAO chama `claude-vscode.editor.open` direto — chama a NOSSA porta.
    //
    // O botao da barra e o Ctrl+T tinham o mesmo defeito que a tela de boas-vindas:
    // num computador onde a extensao do Claude Code ainda nao foi instalada, o clique
    // caia num comando inexistente e a tela nao mudava. O conserto foi aplicado em 1
    // das 3 portas em 06/09/2026; estas sao as outras duas.
    vscode.commands.registerCommand('oficina.abrirConversa', abrirConversaOuExplicar)
  )
}

// A tela de boas-vindas da OFICINA, por um comando NOSSO.
//
// O VS Code so expoe "Welcome: Open Walkthrough", que abre um seletor em ingles com
// todos os walkthroughs instalados. Num produto em portugues isso e uma porta com o
// nome errado -- e, para o teste, um caminho que depende de digitar o rotulo da
// Microsoft numa lista que muda a cada versao.
//
// ⚠️ O id COMPLETO vem da API, nunca escrito a mao.
//
// Ele e "<id da extensao>#<id do walkthrough>", e a primeira versao deste arquivo
// montava a primeira metade na unha ('oficina.oficina-claude'). O comando aceitou,
// nao achou nada, e abriu a pagina de boas-vindas GENERICA -- que, num clone com a
// extensao do Copilot presente, mostrava o walkthrough DELA. Erro que nao levanta
// excecao: `openWalkthrough` cai no padrao em silencio quando o id nao casa.
// `context.extension.id` devolve o valor exato que o registro usou.
const ID_DO_WALKTHROUGH = 'oficina.primeiros-passos'

function registrarBoasVindas(context) {
  const completo = `${context.extension.id}#${ID_DO_WALKTHROUGH}`
  context.subscriptions.push(
    vscode.commands.registerCommand('oficina.boasVindas', () =>
      tentar('workbench.action.openWalkthrough', completo, false)))
}

/**
 * As TRÊS portas da conversa: o primeiro botão da tela de boas-vindas, o botão
 * "Conversa" da barra superior e o Ctrl+T.
 *
 * ⚠️ Nenhuma delas pode apontar direto para o comando da extensão do Claude Code.
 *
 * A extensão do Claude Code não vem dentro do instalador — ela se instala da loja. Numa
 * instalação recém-baixada, o botão "Abrir a conversa" chamava um comando que ainda não
 * existe: nada acontecia na tela, nenhum aviso aparecia, e o passo nem sequer era
 * marcado como concluído. Quem seguisse o tutorial na ordem levava um "não" mudo no
 * primeiro clique. Achado por uma revisao independente em 06/09/2026, usando o produto.
 *
 * Aqui o comando é NOSSO: ele tenta abrir a conversa e, se o comando não existir,
 * explica o que falta e oferece o caminho — em vez de não fazer nada.
 */
// ⚠️ NAO EXISTE GUARDA CONTRA RAJADA AQUI — e a ausencia dele foi MEDIDA, nao suposta.
//
// Este comando chegou a ter um: a ideia era nao empilhar avisos quando a pessoa aperta
// Ctrl+T tres vezes seguidas. Ele nasceu como um booleano preso a promessa do
// `showInformationMessage` e criou um defeito real (a promessa so resolve quando a
// notificacao e FECHADA; o toast sai da tela sozinho em ~20 s sem fechar, e dali em
// diante o comando ficava MUDO para sempre). Virou janela de tempo, e ai o gate novo
// mostrou o resto: com o guarda DESLIGADO, tres disparos em ~1,2 s produzem **uma**
// notificacao — no toast e na central. O proprio workbench nao empilha mensagem
// identica (medido no build de 06/09/2026, tag 1.136.1; nao verifiquei outras versoes).
//
// Ou seja: o guarda resolvia um problema que nao existia, e cobrava um defeito por
// isso. O que resta e o comportamento que interessa, e ele tem gate proprio em
// `testes/portas_da_conversa.mjs`: rajada mostra um aviso so, e o aviso VOLTA depois —
// se uma versao futura do core passar a empilhar, aquele criterio fica vermelho.

// ⚠️ MUDOU NA V23: a porta leva à conversa OFICIAL.
//
// Esta função já trocou de destino duas vezes, e o histórico curto explica por que a volta
// não é arrependimento:
//
//   até a V1   → abria a conversa da extensão oficial, e explicava quando ela faltava;
//   V2 — V22    → abria o painel NOSSO, que viaja dentro do programa e não depende de loja;
//   da V23 em diante → volta a abrir a oficial, por decisão do dono em 21/09/2026: a conversa
//                     da OFICINA passa a ser a dela.
//
// O programa JÁ abria assim desde a V20 — quem não tinha concordado com a abertura era a porta
// que a pessoa aperta. Apertar Ctrl+T dava uma conversa de um tipo; iniciar o programa dava a de
// outro, e as duas se chamavam "a conversa da OFICINA".
//
// ⚠️ O PAINEL PRÓPRIO NÃO FOI REMOVIDO, e isso é escolha, não sobra. Ele continua aqui como
// CAMINHO DE VOLTA: se a extensão oficial não responder — ausente num build de teste, desativada,
// ou quebrada no meio de um trabalho —, a porta ainda abre uma conversa em vez de dar o "não"
// mudo, que foi o defeito que criou `testes/portas_da_conversa.mjs` em 06/09/2026.
//
// ⚠️ POR QUE `focus` E NÃO `editor.open` — lido no corpo das funções dela (pacote 2.1.278), não
// deduzido dos títulos dos comandos, que aqui enganam:
//
//   • `editor.open` chamado SEM argumento cai em `createPanel(undefined, …)`, e lá o bloco que
//     reaproveita o painel existente só roda quando há id de sessão. Sem id, ele cria uma webview
//     NOVA toda vez — a rajada de Ctrl+T abriria uma conversa por toque, e cada conversa é uma
//     sessão de agente. Pior: sem argumento ele volta `updatePreferredLocationToPanel: true` e
//     REGRAVA a preferência global de quem tinha escolhido a barra lateral.
//   • `editor.openLast` NÃO é "reabre a última", apesar do nome: ele só escolhe entre a lateral e
//     o editor conforme a preferência, e delega. Nunca falha por não haver conversa anterior.
//   • `focus` é o único que pergunta primeiro se já existe conversa: entrega na visível, REVELA a
//     escondida, e só quando não há nenhuma é que chama `openLast` para abrir. É ele que mantém a
//     rajada abrindo UMA só.
//
// ⚠️ EFEITO COLATERAL DECLARADO, e ele é desejado: com texto selecionado no editor, `focus` leva
// a seleção para a caixa como referência. Quem seleciona um trecho e aperta Ctrl+T quer falar
// daquele trecho. Com nada selecionado, não insere nada.
async function abrirConversaOuExplicar() {
  // ⚠️ V27: a porta também não abre conversa SEM PASTA — pelo mesmo motivo da abertura (ver
  // `pastaDeSempre.js`): ali a conversa nasce sem CLAUDE.md, sem skills do projeto e sem travas.
  // Abre a pasta de sempre, ou pergunta qual. A conversa pelo ícone da extensão oficial não passa por
  // aqui; para ela, quem avisa é a barra (`⚠ sem pasta`, mostradorDeTokens.js).
  const pastas = vscode.workspace.workspaceFolders
  if (!(pastas && pastas.length)) {
    anotar('porta.semPasta')
    await pastaDeSempre.aoAbrir(vscode, { anotar, perguntar: true })
    return
  }
  for (const comando of ['claude-vscode.focus', 'claude-vscode.editor.openLast']) {
    if (await tentar(comando)) {
      anotar('porta.conversaOficial', { comando })
      return
    }
  }
  anotar('porta.semConversaOficial')
  await abrirPainel()
}

/**
 * O caminho de volta, explícito, na paleta como "Abrir a conversa da extensão oficial".
 *
 * ⚠️ Até a V22 este comando era o único jeito de chegar à conversa oficial, e o comentário aqui
 * dizia que ele "não é usado por nenhuma das três portas". Deixou de ser verdade na V23: as portas
 * vão para o mesmo lugar que ele. Ele fica por dois motivos — tem nome próprio na paleta para quem
 * procura pelo nome, e é o único que OFERECE A LOJA quando a extensão falta, coisa que a porta não
 * faz (ela cai calada no painel de volta, que é o comportamento certo para uma tecla de atalho).
 */
async function abrirConversaOficial() {
  if (await tentar('claude-vscode.editor.open')) return
  const instalar = 'Ver na loja'
  const escolha = await vscode.window.showInformationMessage(
    'A conversa da extensão oficial não está instalada neste computador. A conversa da OFICINA continua funcionando (Ctrl+T).',
    instalar)
  if (escolha === instalar) {
    await tentar('workbench.extensions.search', 'anthropic.claude-code')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O PAINEL — a conversa nativa da OFICINA
// ─────────────────────────────────────────────────────────────────────────────

const TIPO_DO_PAINEL = 'oficina.conversa'

/**
 * O NOME DA CONVERSA NA ABA — pedido dele, com a OFICINA aberta, em 05/09/2026:
 * "o nome da conversa 'untitled' fica no lugar do nome onde ta 'Claude code' sem uma
 * segunda barra". A V2 nasceu com a aba chamada "Conversa" para sempre, e nenhum
 * critério cobrava; o mapeamento do inventário (10/09/2026, noite) achou.
 *
 * O nome sai da primeira coisa que a pessoa pediu: a primeira linha com texto, espaços
 * colapsados, até 40 caracteres. ⚠️ O SDK guarda também um `aiTitle` por sessão, mas se
 * ele chega a um host de SDK durante a conversa NÃO foi medido — e renomear à mão é
 * da V5. Aqui fica o que é determinístico.
 */
const TITULO_NOVO = 'Nova conversa'
const TITULO_MAXIMO = 40

function tituloDaConversa(texto) {
  const linha = String(texto || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).find(Boolean) || ''
  if (!linha) return TITULO_NOVO
  return linha.length > TITULO_MAXIMO ? linha.slice(0, TITULO_MAXIMO - 1).trimEnd() + '…' : linha
}

/**
 * A configuração que libera o modo "faz tudo sem perguntar" — desligada por padrão,
 * igual à extensão oficial. Lida na criação de cada conversa (ver `agente.js`).
 */
function permitirPularAprovacao() {
  try {
    return vscode.workspace.getConfiguration('oficina').get('permitirPularAprovacao', false) === true
  } catch { return false }
}

/** Quando a extensão ativou, e se alguma conversa já abriu o programa do agente (ver `deactivate`). */
let ativouEm = 0
let agenteAbriu = false
/** O painel aberto agora, se houver. Um por janela — sessões simultâneas são a V5. */
let painelAberto = null
let conversaAberta = null
/** Recomeça a conversa do painel aberto (o botão "Nova conversa" da aba). */
let recomecarAberta = null
/**
 * V6 — entrega um pedido do editor à conversa aberta. Definida por `ligar`.
 *
 * ⚠️ É `null` enquanto não há painel: quem chama ABRE o painel antes (ver `pedirAoAgente`).
 */
let entregarPedido = null
/** Guardado no activate, porque a webview precisa saber de onde carregar os arquivos. */
let contextoDaExtensao = null

/**
 * Monta o HTML da webview com a CSP e o nonce da vez.
 *
 * ⚠️ O nonce é gerado a cada abertura e vale só para o `<script>` que nós escrevemos.
 * Sem `unsafe-inline`, sem `unsafe-eval` e sem nenhuma origem remota: uma resposta do
 * agente que traga `<script>` não roda, porque não tem o nonce. É o cinto; o
 * suspensório é `painel.js` nunca usar `innerHTML` com texto de fora.
 */
function montarHtml(webview) {
  const base = path.join(contextoDaExtensao.extensionPath, 'painel')
  const nonce = crypto.randomBytes(16).toString('base64')

  const uri = arquivo => webview.asWebviewUri(vscode.Uri.file(path.join(base, arquivo))).toString()

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ')

  // ⚠️ A substituição é por FUNÇÃO, não por string. Medido em 10/09/2026:
  // `'__CSS__'.replace('__CSS__', 'a$&b')` devolve `a__CSS__b` — o `$&` de uma URI
  // seria lido como padrão de substituição e comeria a própria marca. Nenhuma URI de
  // webview tem `$&` hoje; o ponto é que este código não pode depender disso, porque
  // quem gera a URI é o editor, não nós. Com função, o texto entra literal.
  const trocas = { __CSP__: csp, __CSS__: uri('painel.css'), __JS__: uri('painel.js'), __NONCE__: nonce }
  return fs.readFileSync(path.join(base, 'painel.html'), 'utf8')
    .replace(/__(CSP|CSS|JS|NONCE)__/g, marca => trocas[marca])
}

/** A pasta que o agente enxerga: a que está aberta no editor. */
function pastaDoProjeto() {
  const pastas = vscode.workspace.workspaceFolders
  return pastas && pastas.length ? pastas[0].uri.fsPath : undefined
}

/**
 * ⚠️ SEM PASTA ABERTA, A CONVERSA NÃO COMEÇA — e isto é segurança, não usabilidade.
 *
 * Achado por uma revisao independente em 10/09/2026, e é o caso mais comum que existe: a
 * PRIMEIRA abertura de uma instalação nova, antes de alguém abrir uma pasta.
 *
 * O que acontecia: `cwd` ia `undefined` para o SDK, que cai no `process.cwd()` do host
 * de extensão — a pasta do programa, ou pior. Três consequências, e a terceira é a que
 * assusta:
 *   1. o agente trabalha numa pasta que ninguém escolheu;
 *   2. a tela afirma "Ele lê e escreve os arquivos desta pasta" — frase sem referente;
 *   3. os `settingSources` do disco passam a ser lidos DAQUELA pasta — ou seja, **nenhuma regra
 *      de permissao do projeto vale**. O critério 7 dos critérios de pronto, que a V2
 *      provou com pasta aberta, simplesmente não se aplicaria ali.
 *
 * Preferir "não começa" a "começa em lugar nenhum" é a escolha conservadora, e o painel
 * diz o que fazer em vez de só recusar.
 */
async function exigirPastaAberta(painel) {
  if (pastaDoProjeto()) return true

  anotar('conversa.semPasta')
  painel.webview.postMessage({
    tipo: 'semPasta',
    mensagem: 'Abra uma pasta para começar. O agente trabalha nos arquivos dela — ' +
      'e é da pasta que vêm as regras do que ele pode e não pode fazer.',
  })
  return false
}

/**
 * Liga uma webview ao motor.
 *
 * ⚠️ Todo `postMessage` para a tela passa por aqui, e a tela nunca recebe nada além do
 * que estes eventos carregam. Em especial: o e-mail da conta vai (a pessoa precisa ver
 * em qual conta está), e nenhum token vai — o motor nem os tem.
 */
function ligar(painel, { restaurada = false } = {}) {
  const enviarParaTela = evento => { try { painel.webview.postMessage(evento) } catch { } }
  /** A página já subiu? Antes disso, pedido do editor espera na fila (ver o fim desta função). */
  let telaPronta = false
  /** A aba desta tela foi fechada? Daí em diante a conversa dela não fala com as vistas da janela. */
  let abaFechada = false
  /** Esvazia a fila de pedidos. Trocada por uma de verdade no fim de `ligar`. */
  let escoarPedidos = () => { }
  /** V16 — publica o mapa dos agentes. Trocada pela de verdade quando a conversa existe (logo abaixo). */
  let publicarAgentes = () => { }
  /*
    V14 — O PÉ DA CONVERSA: tokens e relógio do cache, sempre à vista. A tela de tokens publica sozinha
    (a cada leitura e a cada virada de minuto do relógio); esta aba só repassa. A página ainda pode não
    ter subido aqui: o `pronto` dela manda o estado de novo.
    V16: cada leitura do disco pode trazer um agente novo (ou a ficha dele): o mapa vai junto.
  */
  const desligarPe = telaDeTokens
    ? telaDeTokens.ligarPe(pe => { if (!abaFechada) { enviarParaTela({ ...pe, tipo: 'tokens' }); publicarAgentes() } })
    : () => { }
  /*
    V18 — OS TAMANHOS DA CONVERSA. Quando mudam por fora desta tela (outra aba de conversa, um layout com nome
    aplicado, o "voltar ao padrão"), esta tela recebe os novos. A mudança que ELA fez não volta para ela: o eco
    chegaria atrasado no meio de uma sequência de setas e a caixa pularia para trás.
  */
  const desligarTamanhos = tamanhosDaTela
    ? tamanhosDaTela.aoMudar((t, origem) => { if (!abaFechada && origem !== painel) enviarParaTela({ tipo: 'tamanhos', ...t }) })
    : { dispose() { } }
  // A revisão no editor fala com a tela do painel que está aberto.
  if (revisoes) {
    revisoes.aoAvisar = texto => enviarParaTela({ tipo: 'nota', texto })
    revisoes.aoDecidir = decisao => enviarParaTela({ tipo: 'propostaDecidida', ...decisao })
  }

  /*
    ⚠️ A CONVERSA É TROCÁVEL (o botão "Nova conversa"), e por isso cada uma só fala com a
    tela enquanto for a CORRENTE. Sem este filtro, a conversa encerrada continuaria
    mandando eventos depois do "limpar" — o último `estado: parada` dela chegaria por
    cima da conversa nova e deixaria o ponto dizendo "parada" com a nova abrindo.
    Critério em `testes/ponte.mjs`, com o controle positivo (a nova chega).
  */
  const criarConversa = ({ retomar = null, bifurcar = false } = {}) => {
    let esta = null
    agenteAbriu = true
    esta = new Conversa({
      cwd: pastaDoProjeto(),
      permitirPularAprovacao: permitirPularAprovacao(),
      // V5: quando a pessoa escolheu uma conversa na lista, esta nasce com o histórico dela.
      retomar,
      bifurcar,
      // V4: quem executa o comando aprovado é o terminal do editor — com o PID na mão, para o
      // Parar alcançar o processo. Sem esta função o motor se comporta como na V3.
      executarComando: pedido => terminalDoAgente.rodar(pedido),
      aoEvento: evento => {
        // A revisão ouve a RETIRADA de qualquer conversa — inclusive da que acabou de ser trocada por
        // "Nova conversa", que o filtro logo abaixo cala: senão a aba do diff dela ficaria órfã.
        if (evento.tipo === 'permissao_retirada' && revisoes) revisoes.retirar(evento.id)
        /*
          V19 — O AVISO DE LIMITE NÃO É FALA DA CONVERSA, e por isso sai daqui antes de tudo.

          O limite é da CONTA, não desta conversa: ele vale igual para qualquer aba aberta, e
          continua valendo enquanto a pessoa lê a resposta com a aba fechada. Por isso este desvio
          está ACIMA do filtro que cala as conversas que não são a corrente e do que cala a aba
          fechada — se estivesse abaixo, o número da barra de cima congelaria sem ninguém saber
          por quê, exatamente nos momentos em que ele mais muda.

          Quem desenha é o mostrador da barra de cima. Enquanto ele não estiver de pé, o aviso é
          descartado em silêncio: não há para onde mandá-lo, e mandá-lo para a tela da conversa
          faria aparecer um dado de conta no meio de uma conversa.
        */
        if (evento.tipo === 'limite') { if (mostradorDoLimite) mostradorDoLimite.aoAviso(evento.aviso); return }
        if (esta && esta !== conversa) return
        // V12 — a lista de skills é da vista "Skills", e só dela: não é fala da conversa nem linha do registro.
        if (evento.tipo === 'comandos') { if (telaDeSkills && !abaFechada) telaDeSkills.receberLista(evento.lista).catch(() => { }); return }
        // V8 — só o que vale uma linha, e nada do que a pessoa escreveu (ver `registro.js`).
        if (registroEmDisco) registroEmDisco.anotarDaConversa(evento)
        /*
          ⚠️ A ABA FECHADA CONTINUA FALANDO ENQUANTO ENCERRA (revisão de código, 16/09/2026). Fechar a aba zera
          o painel aberto, mas a conversa desta tela segue sendo a "corrente" aqui dentro, e o `encerrar()` dela
          leva segundos. Nesse meio tempo uma aba nova já pode estar trabalhando — e o `estado: parada` atrasado
          da velha desligava o relógio de tokens da nova, ou um `pronto` punha os números dela na barra. As
          vistas de tokens e de skills são da JANELA: só a conversa de uma aba viva fala com elas. O registro em
          disco, logo acima, continua ouvindo — o que acontece no encerramento ainda é história.
        */
        if (abaFechada) return
        // V10 — a tela de tokens acompanha a conversa CORRENTE (o filtro logo acima já calou as outras).
        if (telaDeTokens) telaDeTokens.aoEvento(evento)
        // O aviso é diagnóstico do host, não recado para quem está trabalhando.
        if (evento.tipo === 'aviso') { console.log('[oficina] ' + evento.mensagem); return }
        // V16 — os agentes ao vivo não vão crus para a tela: o host junta com o disco e manda o mapa pronto.
        if (evento.tipo === 'agentes') { publicarAgentes(); return }
        // O cartão da sessão no mapa mostra o modelo e se a conversa está viva.
        if (evento.tipo === 'modelo' || evento.tipo === 'estado') publicarAgentes()
        if (evento.tipo === 'permissao') {
          // V3: mudança de arquivo vai para o EDITOR; a tela recebe o resumo (sem o conteúdo).
          // Primeiro o cartão, depois a revisão: um arquivo sujo é recusado na hora, e a recusa
          // precisa achar o cartão já desenhado.
          enviarParaTela({ ...evento, pedido: resumoParaTela(evento.pedido) })
          if (revisoes && temDiff(evento.pedido)) {
            revisoes.abrir(esta, evento.pedido).catch(e => console.log('[oficina] a revisao nao abriu: ' + (e && e.message)))
          }
          return
        }
        enviarParaTela(evento)
      },
    })
    return esta
  }
  let conversa = null
  /*
    V16 — O MAPA DOS AGENTES. O ao vivo (motor: `agentes.js`) junto com o disco (`tokens.js`: fichas e arquivos
    dos subagentes da conversa que a tela de tokens acompanha) — o disco é o que sobra de uma conversa retomada.
    Só sai quando muda: os eventos de progresso chegam a cada ferramenta de cada agente, e o pé lê o disco a
    cada 3 s enquanto o agente escreve.
  */
  let ultimoMapa = null
  const VIVA = new Set([ESTADO.OCIOSA, ESTADO.PENSANDO, ESTADO.ESPERANDO_PERMISSAO, ESTADO.CANCELANDO])
  publicarAgentes = ({ forcar = false } = {}) => {
    if (abaFechada || !conversa) return
    const resumo = telaDeTokens ? telaDeTokens.resumo : null
    const mapa = montarMapa({
      vivos: conversa.estadoDosAgentes(),
      doDisco: resumo && Array.isArray(resumo.subagentes) ? resumo.subagentes : [],
      sessao: { titulo: painel.title, modelo: conversa.estadoDoModelo().nome, contexto: resumo ? resumo.contextoAgora : 0, viva: VIVA.has(conversa.estado) },
      podeParar: id => conversa.agentes.podeParar(id),
    })
    const chave = JSON.stringify(mapa)
    if (!forcar && chave === ultimoMapa) return
    ultimoMapa = chave
    enviarParaTela({ tipo: 'agentes', conversa: conversa.id, ...mapa })
  }
  conversa = criarConversa()
  // Houve mensagem aceita nesta sessão do agente? É o que separa "reabrir" de "recomeçar do
  // zero debaixo de uma conversa" (ver `tentarDeNovo`).
  let conversou = false

  painel.webview.onDidReceiveMessage(async m => {
    if (!m || !m.tipo) return
    switch (m.tipo) {
      case 'pronto':
        // V18 — antes de tudo, os tamanhos guardados: a caixa de escrever nasce do jeito que a pessoa deixou,
        // em toda subida da página (a primeira, a restaurada e a de "Nova conversa").
        if (tamanhosDaTela) enviarParaTela({ tipo: 'tamanhos', ...tamanhosDaTela.ler() })
        // A tela subiu. Só agora vale abrir a conversa: assim nenhum evento se perde
        // no caminho entre o motor começar e a página existir para ouvi-lo.
        //
        // ⚠️ `pronto` chega TODA VEZ que a página carrega — inclusive quando a pessoa
        // clica em "Tentar de novo". É por isso que ele também serve de porta de
        // recuperação: sem isto, um erro na abertura (sem login, sem rede) deixava o
        // painel morto para sempre, porque `iniciar()` só era chamado uma vez e a
        // única saída era fechar a aba — sem nada na tela dizendo isso.
        //
        // Antes de tudo, o que a tela pode OFERECER: o seletor só mostra o modo que pula
        // aprovação se esta conversa foi criada com a configuração ligada.
        //
        // ⚠️ ABA RESTAURADA: a primeira porta é LIMPAR, não abrir. Depois de fechar e
        // reabrir o editor, o VS Code devolve a aba com o estado da tela da conversa
        // antiga — o custo no pé era o de uma conversa que já acabou —, mas a conversa
        // do host é NOVA (retomar a antiga é a V5). Achado pela revisão funcional
        // (10/09/2026), medido fechando e reabrindo o executável. A tela limpa e manda outro `pronto`:
        // a mesma porta do botão "Nova conversa", e nenhum caminho paralelo de abertura.
        if (restaurada) {
          restaurada = false
          enviarParaTela({ tipo: 'limpar' })
          break
        }
        // V16 — a página que (re)subiu não tem mapa nenhum: o próximo sai inteiro, mesmo que igual ao último.
        ultimoMapa = null
        // V14 — o pé nasce com os números e o relógio de agora (a página que subiu não tem nada).
        if (telaDeTokens) enviarParaTela({ ...telaDeTokens.pe, tipo: 'tokens' })
        enviarParaTela({ tipo: 'opcoes', pularAprovacao: conversa.permitePularAprovacao })
        if (!await exigirPastaAberta(painel)) break
        // ⚠️ Janela com várias pastas: o agente trabalha na PRIMEIRA, e as regras de
        // permissão que valem são as dela. Dizer isso na tela, em vez de deixar a pessoa
        // descobrir quando o agente não enxergar a segunda (revisão de suposições, 10/09).
        {
          const pastas = vscode.workspace.workspaceFolders || []
          if (pastas.length > 1) {
            enviarParaTela({ tipo: 'nota', texto: `Esta janela tem ${pastas.length} pastas. O agente trabalha em ` +
              `"${pastas[0].name}" — e as regras do que ele pode fazer são as dessa pasta.` })
          }
        }
        if (conversa.estado === ESTADO.PARADA || conversa.estado === ESTADO.ERRO) {
          await conversa.iniciar()
          // ⚠️ SÓ AQUI o pedido do editor pode sair: antes de `iniciar()` voltar, o motor
          // recusaria a mensagem (estado ABRINDO) e a pessoa veria "não enviei" logo depois
          // de clicar em "Explicar". A fila existe exatamente para cobrir esse intervalo.
          telaPronta = true
          escoarPedidos()
        } else {
          // ⚠️ A TELA RECARREGOU COM A CONVERSA VIVA. Revisão de código (10/09/2026, noite),
          // medido em node: quando o editor descarta e recria a webview sem o painel morrer,
          // o script roda de novo e o seletor volta a "pergunta sempre" — mas a conversa é a
          // MESMA, no modo que a pessoa escolheu. Responder só `opcoes` deixava a tela
          // mentindo para o lado perigoso. Quem diz o modo é o host: ele conta tudo de novo.
          enviarParaTela({ tipo: 'estado', conversa: conversa.id, estado: conversa.estado })
          enviarParaTela({ tipo: 'pronto', conversa: conversa.id, modelo: conversa.modelo, modo: conversa.modo,
            listaDeFerramentas: Array.isArray(conversa.ferramentas) ? conversa.ferramentas : null })
          if (conversa.conta) enviarParaTela({ tipo: 'conta', conversa: conversa.id, conta: conversa.conta })
          // V15 — o botão do modelo e o painel de escolha: a página que subiu não sabe nada deles.
          enviarParaTela({ tipo: 'modelo', conversa: conversa.id, ...conversa.estadoDoModelo() })
          // V16 — nem o botão dos agentes e o mapa: os que rodam seguem rodando no agente.
          publicarAgentes({ forcar: true })
          // V8 — sem login, a tela recarregada nasce sem o cartão, e a próxima fala ficaria sem saída.
          if (conversa.semLogin) enviarParaTela({ tipo: 'semLogin', conversa: conversa.id })
          enviarParaTela({ tipo: 'nota', texto: 'A tela recarregou. A conversa continua no agente, do mesmo jeito — ' +
            'só o que foi dito antes não aparece mais aqui.' })
          // ⚠️ E os pedidos pendentes também (revisão final, 11/09/2026): sem eles a caixa dizia
          // "Há uma decisão esperando por você" sem cartão nenhum, e o agente ficava parado.
          for (const pedido of conversa.permissoesPendentes()) {
            enviarParaTela({ tipo: 'permissao', conversa: conversa.id, pedido: resumoParaTela(pedido) })
          }
          // ⚠️ E os COMANDOS que estão rodando (V4). Sem isto, quem arrastasse a aba da conversa
          // para outro grupo durante um `npm test` voltava sem o cartão, sem o botão de parar e sem
          // o histórico — e, quando o comando terminasse, o veredito seria descartado em silêncio
          // porque não havia mais onde escrevê-lo (revisor independente, 11/09/2026).
          for (const emCurso of conversa.comandosEmCurso()) {
            enviarParaTela({ tipo: 'comando_inicio', conversa: conversa.id, ...emCurso })
          }
          // A conversa já estava de pé: o pedido do editor sai na hora.
          telaPronta = true
          escoarPedidos()
        }
        break

      // A porta de recuperação, pedida pela tela quando algo falhou.
      case 'tentarDeNovo': {
        if (!await exigirPastaAberta(painel)) break
        const reabre = conversa.estado === ESTADO.PARADA || conversa.estado === ESTADO.ERRO
        await conversa.iniciar()
        // ⚠️ REABRIR DEPOIS DE CONVERSAR É RECOMEÇAR DO ZERO — e a tela diz. Revisão de código
        // (10/09/2026, noite), medido em node: o processo do agente caía no meio da conversa,
        // "Tentar de novo" abria uma sessão NOVA e vazia (retomar a antiga é a V5) debaixo das
        // falas antigas, e nada dizia que o agente não lembrava de nada. As falas ficam — podem
        // servir para reler —; o que entra é a linha que conta a verdade.
        if (reabre && conversou && conversa.estado === ESTADO.OCIOSA) {
          conversou = false
          enviarParaTela({ tipo: 'nota', texto: 'O agente recomeçou do zero: ele não lembra do que está acima desta linha.' })
        }
        break
      }

      case 'abrirPasta':
        await tentar('workbench.action.files.openFolder')
        break

      // O custo no pé da conversa é a porta da vista de tokens (as barras que teriam o ícone nascem ocultas).
      case 'abrirTokens':
        await tentar('workbench.view.extension.oficinaTokens')
        break
      // ⚠️ NENHUMA MENSAGEM SOME EM SILÊNCIO.
      //
      // `enviar()` devolve `false` quando a conversa não está de pé (ainda abrindo,
      // encerrada, em erro). Até 10/09/2026 esse `false` era ignorado aqui: a tela já
      // tinha desenhado o balão da pessoa, e a mensagem simplesmente não ia a lugar
      // nenhum — sem erro, sem aviso, sem nada.
      //
      // Foi assim que o teste da trava passou a falhar de forma intermitente (0, 33 ou
      // 53 ferramentas em corridas idênticas): ele clicava em Enviar antes de a
      // conversa ficar pronta, a mensagem sumia, e o `init` que traz a lista nunca
      // chegava. O teste estava certo em acusar; o produto é que engolia.
      //
      // É o mesmo defeito do botão "Parar", noutra porta — e a regra que fica é uma só:
      // toda recusa volta para a tela.
      case 'enviar': {
        const foi = conversa.enviar(m.texto)
        if (!foi) painel.webview.postMessage({ tipo: 'naoEnviei', texto: m.texto, estado: conversa.estado })
        else {
          conversou = true
          // Só a mensagem ACEITA dá nome à conversa: uma recusada voltou para a caixa, e a
          // aba não pode ter o nome de um pedido que nunca foi feito.
          if (painel.title === TITULO_NOVO) painel.title = tituloDaConversa(m.texto)
        }
        break
      }
      case 'cancelar': conversa.cancelar(); break
      case 'permissao': {
        // ⚠️ "Permitir" e "Sempre permitir" num pedido COM REVISÃO ABERTA passam pela revisão: é lá que
        // moram as conferências de trabalho não salvo e de disco mudado. Por esta porta elas eram
        // puladas e o SDK gravava por cima do que a pessoa não tinha salvo (revisão de código da V3).
        // O "negar" não precisa de conferência nenhuma: nada vai ser gravado.
        if (revisoes && m.decisao !== 'negar' && revisoes.tem(m.id)) {
          if (!await revisoes.liberar(m.id, m.decisao)) enviarParaTela({ tipo: 'permissaoNaoValeu', id: m.id })
          break
        }
        // ⚠️ Toda recusa volta para a tela (revisão de código, 10/09/2026, noite): a tela marca
        // o cartão ANTES de o host responder, e um pedido já retirado deixava "Permitido."
        // escrito sobre uma ação negada.
        if (!conversa.responderPermissao(m.id, m.decisao)) enviarParaTela({ tipo: 'permissaoNaoValeu', id: m.id })
        else if (revisoes) await revisoes.retirar(m.id)   // pedido com diff negado pelo cartão: a aba fecha
        break
      }
      // V3: as duas decisões inteiras do cartão de uma proposta — as mesmas da barra de abas do diff.
      // Sem revisão aberta para o pedido (ela não abriu), o cartão ainda decide pelo caminho da V2.
      case 'proposta': {
        const aceita = m.decisao === 'tudo'
        // ⚠️ HAVENDO REVISÃO PARA ESTE PEDIDO, QUEM RESPONDE AO MOTOR É ELA — mesmo que já esteja
        // concluindo, quando o `decidirTudo` devolve `false`. Cair no `responderPermissao` fazia o
        // agente ouvir "Você não permitiu esta ação." e o editor gravar o parcial logo depois: o
        // arquivo mudava com o agente convencido do contrário (revisão de código da V3). O cartão
        // perdeu a corrida para os botões do diff, e é só isso que a tela precisa saber.
        const temRevisao = !!revisoes && revisoes.tem(m.id)
        let valeu = temRevisao ? await revisoes.decidirTudo(m.id, aceita ? 'aceito' : 'rejeitado') : false
        if (!valeu && !temRevisao) valeu = conversa.responderPermissao(m.id, aceita ? 'permitir' : 'negar')
        if (!valeu) enviarParaTela({ tipo: 'permissaoNaoValeu', id: m.id })
        break
      }
      case 'mostrarProposta': if (revisoes) await revisoes.mostrar(m.id); break

      // V4 — o botão da linha de execução. Para SÓ este comando (o Parar da conversa para tudo).
      // ⚠️ A recusa volta para a tela, como toda recusa deste arquivo: um comando que já terminou
      // deixaria o botão dizendo "parando…" para sempre.
      case 'pararComando':
        if (!conversa.pararComando(m.id)) enviarParaTela({ tipo: 'comandoNaoParou', id: m.id })
        break
      case 'mostrarTerminal': if (terminalDoAgente) terminalDoAgente.mostrar(true); break
      case 'abrirArquivo': await abrirArquivoCitado(m.caminho); break
      case 'sair': await sair(); break
      // V8 — a conversa nova nasce quando o terminal do login fecha: é ela que lê a credencial nova.
      case 'entrarNaConta': entrarNaConta(() => recomecarAberta && recomecarAberta()); break
      case 'socorro': await socorro(); break

      // ⚠️ ESTE `case` FALTAVA, e o defeito era o pior possível: a TELA MENTIA.
      //
      // Achado por uma revisao independente em 10/09/2026. A webview mandava `{tipo:'modo'}`,
      // o motor tinha o `trocarModo()` pronto e testado — e ninguém ligava os dois.
      // Resultado: a pessoa escolhia "faz tudo sem perguntar", o seletor mudava, o
      // aviso permanente aparecia na conversa dizendo que dali em diante ele agiria
      // sozinho... e o agente continuava perguntando, em `default`.
      //
      // Por que isso é grave e não um botão sem função: o modo é a única coisa da tela
      // que responde "ele vai me perguntar antes de mexer nos meus arquivos?". Uma tela
      // que erra ESSA resposta é pior do que uma tela que não a oferece — e o erro
      // podia cair para o lado perigoso, se um dia o padrão do produto mudasse.
      //
      // Pior: `painel.js` tinha um comentário afirmando "a tela nunca mente sobre o
      // modo". Era a mesma classe de erro que reprovou a V1 três vezes, escrita por
      // mim, sobre um caminho que eu nunca tinha exercitado de ponta a ponta.
      //
      // A confirmação volta pela mesma porta (`aoEvento` → `{tipo:'modo'}`), e quando a
      // troca falha ela NÃO volta — daí a tela reverte o seletor sozinha.
      case 'modo': await conversa.trocarModo(m.modo); break
      /*
        V15 — MODELO E ESFORÇO, pelo painel de escolha do pé. A resposta volta sempre pela porta do motor
        (`{tipo:'modelo'}`, com o que VALE), como o modo.

        ⚠️ O AVISO DO CUSTO É ANTES, E É DAQUI. Trocar de modelo com o cache quente faz a próxima mensagem
        reler a conversa inteira no modelo novo; o agente só dá a estimativa DEPOIS da troca. O host tem o
        relógio do cache e o contexto (medidor de tokens), então a primeira escolha volta como pergunta
        (`confirmarModelo`) e só a confirmada chega ao motor. Cache frio, conversa sem resposta ou o mesmo
        modelo por outro nome: troca direto.
      */
      case 'trocarModelo': {
        const aviso = m.confirmado ? null : avisoDaTroca({
          lista: conversa.modelos, emUso: conversa.modelo, valor: m.valor,
          resumo: telaDeTokens ? telaDeTokens.resumo : null,
        })
        if (aviso) { enviarParaTela({ tipo: 'confirmarModelo', conversa: conversa.id, ...aviso }); break }
        await conversa.trocarModelo(m.valor)
        break
      }
      case 'trocarEsforco': await conversa.trocarEsforco(m.nivel); break
      /*
        V16 — PARAR UM AGENTE, pelo cartão dele no mapa. A tela já perguntou (a confirmação é no próprio cartão);
        o motor confere que é um agente vivo desta conversa. Toda recusa volta para a tela, como as outras.
      */
      case 'pararAgente':
        if (!await conversa.pararAgente(m.id)) enviarParaTela({ tipo: 'agenteNaoParou', id: m.id })
        break

      // V18 — a pessoa soltou a alça (ou usou as setas nela): guarda já, sem botão. O valor volta normalizado
      // só para as OUTRAS telas; o que não serve (parte desconhecida, número estragado) fica no registro.
      case 'tamanho': {
        if (!tamanhosDaTela) break
        const r = await tamanhosDaTela.guardar(m.parte, m.valor, painel)
        if (r.erro) anotar('tamanho.recusado', { parte: String(m.parte).slice(0, 40) })
        break
      }
    }
  })

  painel.onDidDispose(async () => {
    abaFechada = true
    desligarPe()
    desligarTamanhos.dispose()
    anotar('painel.fechado')
    if (telaDeTokens) telaDeTokens.acompanhar(null)
    painelAberto = null
    conversaAberta = null
    recomecarAberta = null
    await conversa.encerrar()
    // O terminal dos comandos é da conversa: sem a conversa, ninguém mais tem como parar o que
    // estiver rodando nele. `descartar()` mata o comando em curso antes de fechar a aba.
    if (terminalDoAgente) { terminalDoAgente.descartar(); terminalDoAgente = new TerminalDoAgente() }
  })

  /**
   * NOVA CONVERSA — o botão da aba.
   *
   * A ordem importa: primeiro a conversa corrente passa a ser a nova (daí em diante a
   * velha fala sozinha, ver `criarConversa`), depois a tela limpa e a aba volta ao nome
   * inicial, e só então a velha é encerrada. Quem ABRE a nova é o `pronto` que a tela
   * manda depois de limpar — a mesma porta da primeira abertura.
   */
  recomecarAberta = async ({ retomar = null, bifurcar = false, titulo = null } = {}) => {
    // V10: a conversa trocou, então os números também. A retomada mostra os dela na hora.
    if (telaDeTokens) telaDeTokens.acompanhar(bifurcar ? null : retomar)
    const velha = conversa
    conversa = criarConversa({ retomar, bifurcar })
    conversaAberta = conversa
    conversou = false
    // ⚠️ Retomada MANTÉM o nome da conversa na aba. Sem isto, escolher "Ontem, o
    // lançamento" na lista abriria uma aba chamada "Conversa" — e a pessoa não teria como
    // saber, olhando a tela, em qual das 193 ela está escrevendo.
    painel.title = titulo || TITULO_NOVO
    // A tela vai recarregar e mandar outro `pronto`; até lá, pedido do editor espera na fila.
    telaPronta = false
    enviarParaTela({ tipo: 'limpar', retomada: retomar || null, titulo: titulo || null })
    await velha.encerrar()
  }

  /*
    V6 — A FILA DE PEDIDOS DO EDITOR.

    ⚠️ Ela existe por causa de uma corrida real: quando a pessoa aperta "Explicar" com a
    conversa FECHADA, o painel nasce nesse instante e a tela leva um tempo até subir. Mandar
    o pedido na hora seria mandá-lo para uma página que ainda não existe — ele sumiria em
    silêncio, e o clique não faria nada.

    Por isso o pedido espera o `pronto` da tela (que é também quando a conversa fica de pé —
    antes disso `conversa.enviar` recusaria). Com o painel já aberto, a fila é atravessada
    na hora.
  */
  const pedidosEsperando = []
  const entregarAgora = pedido => {
    enviarParaTela({ tipo: 'pedido', texto: pedido.texto })
    // A aba ganha o nome do que foi pedido, como acontece quando a pessoa digita.
    if (painel.title === TITULO_NOVO && pedido.titulo) painel.title = tituloDaConversa(pedido.titulo)
    painel.reveal(painel.viewColumn || vscode.ViewColumn.One, false)
  }
  entregarPedido = pedido => {
    if (!pedido || !pedido.texto) return
    if (telaPronta) entregarAgora(pedido)
    else pedidosEsperando.push(pedido)
  }
  escoarPedidos = () => {
    while (pedidosEsperando.length) entregarAgora(pedidosEsperando.shift())
  }

  conversaAberta = conversa
  return conversa
}

/**
 * Abre o arquivo que o agente citou.
 *
 * ⚠️ O caminho vem de TEXTO GERADO — trate como entrada de fora, não como fato.
 *
 * ⚠️ E `path.join` NÃO PRENDE NINGUÉM NA PASTA. A primeira versão desta função dizia,
 * num comentário, que resolver a partir da pasta aberta impedia um caminho relativo de
 * escapar. É falso, e foi medido em 10/09/2026:
 *
 *     path.join('D:\\projeto', '../../Windows/System32/config/SAM')
 *     → 'D:..\\Windows\\System32\\config\\SAM'
 *
 * Ou seja: bastava o agente escrever `../../` numa resposta para o clique abrir um
 * arquivo de fora do projeto. O estrago possível é pequeno (abre no editor de quem já
 * tem o arquivo, não vaza para lugar nenhum), mas a frase do comentário era uma
 * garantia que o código não dava — e é exatamente esse tipo de afirmação que o
 * revisao final reprovou três vezes na V1.
 *
 * Agora quem decide é `path.relative`: se o caminho resolvido sai da raiz, não abre.
 * Caminho ABSOLUTO continua valendo — o agente cita `D:\outro\projeto\x.js` o tempo
 * todo em trabalho de verdade, e recusar isso seria quebrar o uso normal para
 * resolver um problema que não é de segurança, é de precisão.
 */
function dentroDaPasta(alvo, raiz) {
  const rel = path.relative(raiz, alvo)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function abrirArquivoCitado(caminho) {
  if (!caminho || typeof caminho !== 'string') return

  const semLinha = caminho.replace(/:(\d+)$/, '')
  const linha = /:(\d+)$/.exec(caminho)
  const raiz = pastaDoProjeto()

  // ⚠️ CAMINHO DE REDE NÃO É TOCADO — nem para ver se existe. `\\servidor\pasta\x.md` é
  // "absoluto" para o `path`, e o `statSync` abaixo tentaria alcançar o servidor: no
  // Windows isso pode negociar SMB e entregar o hash da senha (NTLM) a quem controla o
  // nome citado. Revisão de segurança (10/09/2026, noite). Hoje o padrão da tela só gera
  // link com letra de unidade; esta função é que não pode depender disso.
  // Custo aceito: caminho de rede citado deixa de abrir, e o prefixo `\\?\` também.
  // Pasta de PROJETO numa rede continua funcionando: o que se olha é o texto citado.
  if (/^[\\/]{2}/.test(semLinha)) {
    vscode.window.setStatusBarMessage('OFICINA: caminho de rede — não abri', 4000)
    return
  }

  let candidato
  if (path.isAbsolute(semLinha)) {
    candidato = path.resolve(semLinha)
  } else if (raiz) {
    // ⚠️ JANELA COM VÁRIAS PASTAS: um caminho relativo pode ser de QUALQUER uma delas.
    // Até 10/09/2026 só a primeira contava, e um arquivo citado da segunda era recusado
    // como "fora da pasta" (achado pela revisão de suposições). Cada pasta é conferida
    // contra ela mesma — nenhuma abre porta para fora de si.
    const raizes = (vscode.workspace.workspaceFolders || []).map(f => path.resolve(f.uri.fsPath))
    const dentro = raizes.map(r => path.resolve(r, semLinha)).filter((c, i) => dentroDaPasta(c, raizes[i]))
    if (!dentro.length) {
      vscode.window.setStatusBarMessage('OFICINA: esse caminho sai da pasta aberta — não abri', 4000)
      return
    }
    candidato = dentro.find(c => { try { return fs.statSync(c).isFile() } catch { return false } }) || dentro[0]
  } else {
    return   // sem pasta aberta, um caminho relativo não significa nada
  }

  let existe = false
  try { existe = fs.statSync(candidato).isFile() } catch { existe = false }
  if (!existe) {
    vscode.window.setStatusBarMessage(`OFICINA: não achei ${path.basename(semLinha)}`, 3000)
    return
  }

  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(candidato))
  const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One })
  if (linha) {
    const n = Math.max(0, parseInt(linha[1], 10) - 1)
    const pos = new vscode.Position(n, 0)
    editor.selection = new vscode.Selection(pos, pos)
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter)
  }
}

/**
 * Sair da conta.
 *
 * ⚠️ Quem guarda a credencial é o CLI do Claude, no perfil do usuário — não a OFICINA
 * (item 4 do checklist da P1; a extensão nunca leu nem escreveu token). Logo, "sair"
 * daqui não pode fingir que apagou algo. Ele encerra a conversa e chama quem realmente
 * desconecta, dizendo isso com todas as letras.
 *
 * ⛔ V26 — O QUE ESTAVA ERRADO AQUI, e por que é o retrato da regra 31. Até esta versão, o caminho
 * era abrir um terminal escrevendo `claude /logout`. Medido em 24/09/2026 no CLI que vem DENTRO do
 * produto (2.1.261): o comando é `claude auth logout`. O `/logout` é de uma versão anterior — a
 * instrução envelheceu junto com a ferramenta, sem ninguém editar nada, e o produto vinha
 * mostrando isso para quem usa. Nada quebrou e nenhum teste ficou vermelho: o texto não sabia que
 * a ferramenta tinha mudado de casa.
 *
 * ⚠️ E O MELHOR CAMINHO NEM É TERMINAL. A extensão oficial do Claude (a porta da conversa desde a
 * V23) registra `claude-vscode.logout`, que desloga e ainda diz se conseguiu. Medido no código
 * dela. A ordem passa a ser: o comando oficial, se existir nesta instalação; o terminal com os
 * argumentos certos, se não existir. Os dois caminhos são de verdade — nenhum é enfeite.
 */
async function sair() {
  /*
    ⛔ A PERGUNTA VEM ANTES DE QUALQUER ESTRAGO — e esta ordem é um conserto, não um detalhe.

    Até a V26 a primeira linha desta função era `await conversaAberta.encerrar()`, e só depois vinha
    o aviso. `encerrar()` é definitivo (o `agente.js` diz: *"fecha para valer; depois disto a
    conversa não serve mais"*): aborta o laço, mata comando em andamento, descarta permissão
    pendente. Enquanto o único caminho até aqui era um botão DENTRO do painel da conversa, isso
    tinha alguma lógica. A V26 pôs este mesmo clique num ícone da barra de cima e na paleta de
    comandos — e aí virou o que dois revisores independentes descreveram igual: um clique curioso
    em "Conta", um Esc no diálogo, e a conversa estava morta do mesmo jeito.

    Agora: pergunta primeiro, e em diálogo MODAL, como as outras ações irreversíveis deste arquivo.
    E a frase não afirma que a conversa foi encerrada — ela diz o que VAI acontecer, e só se houver
    conversa aberta. Afirmar "a conversa foi encerrada" quando não havia conversa nenhuma era
    inventar um fato na tela, na única função que esta versão existia para consertar.
  */
  const temConversa = !!conversaAberta
  const escolha = await vscode.window.showWarningMessage(
    'Sair da conta do Claude?' + (temConversa ? '\n\nA conversa aberta será encerrada.' : ''),
    { modal: true, detail: 'Quem guarda o seu login é o Claude, fora da OFICINA — ela não tem a sua senha nem o seu token para apagar.' },
    'Sair da conta')
  if (escolha !== 'Sair da conta') return
  if (conversaAberta) await conversaAberta.encerrar()
  anotar('conta.sair')

  // 1. O caminho oficial: o comando da extensão do Claude, que desloga e avisa o resultado.
  try {
    const comandos = await vscode.commands.getCommands(true)
    if (comandos.includes(contaDoClaude.COMANDO_OFICIAL_DE_SAIR)) {
      await vscode.commands.executeCommand(contaDoClaude.COMANDO_OFICIAL_DE_SAIR)
      if (telaDaConta) await telaDaConta.atualizar()
      return
    }
  } catch (e) {
    anotar('conta.sair.falhouOficial', { erro: e && e.message })
  }

  // 2. O plano B: o `claude` embutido, com os argumentos certos, num terminal visível.
  //
  // ⚠️ E ELE TAMBÉM RELÊ A CONTA DEPOIS. Antes, só o caminho oficial remedia — ou seja, justamente
  // na máquina onde o plano B existe para atender (sem a extensão oficial), a pessoa saía da conta
  // e a tela continuava mostrando o e-mail antigo até reiniciar o programa. O terminal é
  // assíncrono, então quem avisa que acabou é o fechamento dele.
  if (!abrirClaudeNoTerminal('Conta do Claude', contaDoClaude.ARGUMENTOS_PARA_SAIR, { aoFechar: () => telaDaConta && telaDaConta.atualizar() })) return
  vscode.window.setStatusBarMessage('OFICINA: saindo da conta no terminal que abriu', 5000)
}

/**
 * V8 — o `claude` que VEM DENTRO da extensão (o pacote nativo do SDK, por plataforma).
 *
 * Medido em 12/09/2026: `claude.exe --version` do pacote win32-x64 responde "2.1.261 (Claude
 * Code)" — é o programa inteiro, com o login oficial dentro. `null` quando o pacote da
 * plataforma não está (quem chama diz isso à pessoa, não finge).
 */
function caminhoDoClaude() {
  const nome = process.platform === 'win32' ? 'claude.exe' : 'claude'
  try {
    return require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${nome}`)
  } catch {
    return null
  }
}

/**
 * V11 — O BOTÃO "LAYOUT": personalizar a tela, salvar como, aplicar um salvo, excluir.
 *
 * ⚠️ Ações separadas, como no socorro: cada item faz uma coisa só e diz o que faz. Nenhum alterna.
 * Quem sabe capturar e aplicar é `layout.js`; aqui mora só a conversa com a pessoa.
 */
function criarLayouts(context) {
  return new Layouts({
    tamanhos: tamanhosDaTela,
    armazenamento: context.globalState,
    executar: (comando, ...args) => vscode.commands.executeCommand(comando, ...args),
    configuracao: {
      inspect: chave => vscode.workspace.getConfiguration().inspect(chave),
      update: (chave, valor) => vscode.workspace.getConfiguration().update(chave, valor, vscode.ConfigurationTarget.Global),
    },
  })
}

/**
 * A VISTA TOKENS FICA SEMPRE ABERTA. O pedido é o painel de tokens inteiro à vista, sem opção de desligar. O editor
 * não deixa uma extensão tirar o "esconder" dos menus dele; o que se garante daqui é que a vista VOLTA sozinha, meio
 * segundo depois de sumir — e sem roubar o foco de onde a pessoa estava (`reveal` sem elemento abre a vista com
 * `focus: false`; é por isso que o provedor tem `getParent`). Ela mora na barra secundária, que nasce aberta.
 * Custo desta escolha: quem esconder a barra secundária a vê voltar; para ganhar espaço, o caminho é arrastar a borda.
 */
/**
 * ⚠️ V20: NÃO É MAIS USADA (t197) — ver a chamada removida em `registrarTokens`.
 *
 * Ela existia para a vista Tokens estar sempre à vista, o que era a decisão dele até a V19.
 * Na leva de 21/09/2026 ele decidiu o contrário para a barra direita inteira. Fica aqui, sem
 * chamador, porque o comportamento pode voltar a ser pedido para outra vista; apagá-la é item
 * próprio, junto com a limpeza do painel próprio.
 */
function manterSempreAberta(vista) {
  let agendado = null
  const reabrir = () => {
    agendado = null
    if (vista.visible) return
    Promise.resolve(vista.reveal(undefined, { focus: false, select: false })).catch(e => anotar('tokens.naoReabriu', { erro: String(e && e.message) }))
  }
  const ouvinte = vista.onDidChangeVisibility(e => {
    if (e && e.visible) return
    clearTimeout(agendado)
    agendado = setTimeout(reabrir, 500)
  })
  // Na ABERTURA ela pode nascer escondida sem que evento nenhum chegue: em perfil limpo a barra secundária abre com
  // o contêiner do chat do núcleo ativo (vazio) e a aba Tokens sem selecionar. Medido no build 1 da V18. Por isso a
  // mesma reabertura, uma vez, meio segundo depois da ativação.
  if (!vista.visible) agendado = setTimeout(reabrir, 500)
  return { dispose() { clearTimeout(agendado); ouvinte.dispose(); vista.dispose() } }
}

/** A barra de ícones está no tamanho compacto (o valor que a pessoa definiu, ou o do programa)? */
function barraCompacta() {
  const i = vscode.workspace.getConfiguration().inspect('workbench.activityBar.compact')
  if (!i) return false
  return (i.globalValue !== undefined ? i.globalValue : i.defaultValue) === true
}

async function menuDeLayout(layouts) {
  const salvos = layouts.listar()
  const itens = [
    { id: 'personalizar', label: '$(layout) Personalizar a tela', detail: 'Mostrar ou esconder partes (barra lateral, painel, barra de status) e mudar de lugar.' },
    { id: 'salvar', label: '$(save) Salvar a tela como…', detail: 'Guarda o que está visível, o tamanho e o lugar de cada parte, com um nome seu.' },
    // V18 — o tamanho de agora se guarda sozinho; isto desfaz tudo o que foi arrastado, sem apagar os salvos.
    { id: 'padrao', label: '$(discard) Voltar ao layout padrão…', detail: 'Desfaz o que foi arrastado, redimensionado e fixado. Os layouts com nome continuam salvos.' },
    // V18 — a barra de ícones não se arrasta (o editor trava a largura dela); tem dois tamanhos, e o item diz o que faz.
    barraCompacta()
      ? { id: 'barraNormal', label: '$(layout-activitybar-left) Barra de ícones no tamanho normal', detail: 'Volta aos 48 px de largura.' }
      : { id: 'barraCompacta', label: '$(layout-activitybar-left) Barra de ícones compacta', detail: 'Ícones menores e a barra com 36 px de largura, em vez de 48. A largura não se arrasta: o editor só tem estes dois tamanhos.' },
  ]
  if (salvos.length) {
    itens.push({ label: 'Layouts salvos', kind: vscode.QuickPickItemKind.Separator })
    for (const s of salvos) {
      itens.push({
        id: 'aplicar', nome: s.nome, label: '$(debug-restart) ' + s.nome,
        description: 'salvo ' + telaSessoes.quando(new Date(s.salvoEm).getTime()),
        detail: s.completo ? undefined : 'Só as configurações: este foi salvo sem o tamanho e o lugar das partes.',
      })
    }
    itens.push({ id: 'excluir', label: '$(trash) Excluir um layout…' })
  }
  const escolha = await vscode.window.showQuickPick(itens, { title: 'Layout da tela', placeHolder: 'O que fazer?' })
  if (!escolha) return
  anotar('layout.escolha', { acao: escolha.id })

  if (escolha.id === 'personalizar') { await tentar('workbench.action.customizeLayout'); return }

  if (escolha.id === 'barraCompacta' || escolha.id === 'barraNormal') {
    await vscode.workspace.getConfiguration().update('workbench.activityBar.compact', escolha.id === 'barraCompacta' ? true : undefined, vscode.ConfigurationTarget.Global)
    return
  }

  if (escolha.id === 'padrao') {
    const ok = await vscode.window.showWarningMessage('Voltar ao layout padrão? Os layouts com nome NÃO são apagados.', {
      modal: true,
      detail: 'Volta ao padrão: o lugar e o tamanho das partes e das vistas, a caixa de escrever, os ícones da barra lateral ' +
        '(Arquivos, Git e Skills) e as configurações de tela (barra de status, abas, minimapa, barra de ícones). ' +
        'Para guardar o que está na tela antes, use "Salvar a tela como…".',
    }, 'Voltar ao padrão')
    if (ok !== 'Voltar ao padrão') return
    const r = await layouts.voltarAoPadrao()
    anotar('layout.padrao', { voltou: r.voltou.length, faltou: r.faltou.length })
    ;(r.faltou.length ? vscode.window.showWarningMessage : vscode.window.showInformationMessage)(fraseDoPadrao(r))
    return
  }

  if (escolha.id === 'salvar') {
    const nome = await vscode.window.showInputBox({
      title: 'Salvar a tela como',
      prompt: 'Um nome para este layout (dá para trazer ele de volta depois).',
      validateInput: valor => validarNome(valor).erro || null,
    })
    if (nome === undefined) return
    const limpo = validarNome(nome).nome
    if (layouts.existe(limpo)) {
      const ok = await vscode.window.showWarningMessage(`Já existe um layout "${limpo}". Substituir pelo que está na tela agora?`, { modal: true }, 'Substituir')
      if (ok !== 'Substituir') return
    }
    const r = await layouts.salvar(limpo)
    if (r.erro) { vscode.window.showErrorMessage(r.erro); return }
    vscode.window.showInformationMessage(r.completo
      ? `Layout "${r.nome}" salvo.`
      : `Layout "${r.nome}" salvo só com as configurações: este programa não informou o tamanho e o lugar das partes.`)
    return
  }

  if (escolha.id === 'aplicar') {
    const r = await layouts.aplicar(escolha.nome)
    anotar('layout.aplicado', { completo: !!r.completo, ignorados: r.ignorados ? r.ignorados.length : 0 })
    ;(r.erro || !r.completo ? vscode.window.showWarningMessage : vscode.window.showInformationMessage)(fraseDoResultado(r))
    return
  }

  if (escolha.id === 'excluir') {
    const qual = await vscode.window.showQuickPick(salvos.map(s => ({ label: s.nome })), { title: 'Excluir qual layout?' })
    if (!qual) return
    const ok = await vscode.window.showWarningMessage(`Excluir o layout "${qual.label}"? Não dá para desfazer.`, { modal: true }, 'Excluir')
    if (ok !== 'Excluir') return
    await layouts.excluir(qual.label)
  }
}

/**
 * V8 — ENTRAR NA CONTA, o passo que faltava no primeiro uso.
 *
 * ⚠️ A OFICINA não faz login e não toca em credencial (termos da Anthropic: app de terceiro não
 * intermedeia login). Ela só ABRE o programa oficial num terminal, e é ele que conversa com a
 * pessoa e guarda a credencial no perfil dela. Quando o terminal fecha, `aoFechar` recomeça a
 * conversa — uma conversa NOVA, porque é a abertura que lê a conta.
 *
 * ⚠️ ESCRITO, NÃO MEDIDO (V8, sem build e com a tela ocupada): o que o `claude.exe` mostra ao
 * abrir sem credencial (se já cai no login ou pede `/login`) e se a conversa nova sai logada.
 * Por isso o texto do cartão manda "fechar o terminal", que vale nos dois casos. Prova no próximo build,
 * numa conta de teste.
 */
function entrarNaConta(aoFechar) {
  const exe = caminhoDoClaude()
  if (!exe) {
    vscode.window.showErrorMessage(
      'Não achei o programa do Claude dentro da OFICINA, então não consigo abrir o login. ' +
      'A instalação pode estar incompleta: reinstale a OFICINA.')
    return
  }
  anotar('login.aberto')
  const terminal = vscode.window.createTerminal({ name: 'Entrar na conta do Claude', shellPath: exe })
  const vigia = vscode.window.onDidCloseTerminal(t => {
    if (t !== terminal) return
    vigia.dispose()
    anotar('login.fechado')
    Promise.resolve(aoFechar()).catch(e => console.log('[oficina] a conversa nao recomecou depois do login: ' + (e && e.message)))
  })
  terminal.show()
}

/** Abre (ou traz para a frente) a conversa da OFICINA. */
async function abrirPainel() {
  if (painelAberto) {
    painelAberto.reveal(painelAberto.viewColumn || vscode.ViewColumn.One)
    return painelAberto
  }

  const painel = vscode.window.createWebviewPanel(
    TIPO_DO_PAINEL,
    TITULO_NOVO,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      // ⚠️ A webview só enxerga a NOSSA pasta `painel/`. Sem isto ela poderia carregar
      // qualquer arquivo do disco por URI — inclusive um que o agente acabou de
      // escrever. Anexo B, item 4.
      localResourceRoots: [vscode.Uri.file(path.join(contextoDaExtensao.extensionPath, 'painel'))],
      // A conversa continua viva quando a pessoa troca de aba. Sem isto, o VS Code
      // descarta a webview e a conversa recomeça do zero toda vez que ela vai ver um
      // arquivo — que é exatamente o que ela vai fazer o tempo todo.
      retainContextWhenHidden: true,
    })

  painel.iconPath = vscode.Uri.file(path.join(contextoDaExtensao.extensionPath, 'painel', 'conversa.svg'))
  painel.webview.html = montarHtml(painel.webview)
  painelAberto = painel
  anotar('painel.aberto')
  ligar(painel)
  return painel
}

/**
 * V8 — O SOCORRO: quando a conversa não responde e a pessoa não sabe o que fazer.
 *
 * ⚠️ AÇÕES SEPARADAS, NUNCA UMA QUE ALTERNA. Um botão que decide olhando o estado que o próprio
 * programa reporta erra justamente quando o programa está quebrado — e é só aí que alguém abre o
 * socorro. Cada item faz UMA coisa, sempre a mesma, e diz o que ela custa.
 *
 * ⚠️ "REABRIR" MONTA DE NOVO, não traz para a frente. Trazer para a frente uma aba cuja conversa
 * morreu é clique inerte: a pessoa clica, nada muda, e ela conclui que o programa quebrou.
 *
 * Mora na paleta (`OFICINA: Socorro`) e no botão "Socorro" de todo erro do painel — a paleta
 * funciona mesmo quando o painel inteiro não abre.
 */
const ACOES_DO_SOCORRO = [
  { id: 'reabrir', label: 'Reabrir a conversa', detail: 'Fecha a aba da conversa, se houver, e abre uma nova. Uma resposta que estava no meio se perde.' },
  { id: 'registro', label: 'Abrir o registro', detail: 'O arquivo onde a OFICINA anota erros e mudanças de estado. Não guarda o que você escreveu nem a sua conta.' },
  { id: 'pasta', label: 'Mostrar a pasta do registro', detail: 'Para anexar o arquivo quando for pedir ajuda.' },
  { id: 'recarregar', label: 'Recarregar a janela', detail: 'Reinicia a OFICINA nesta janela.' },
]

async function socorro() {
  anotar('socorro.aberto')
  const escolha = await vscode.window.showQuickPick(ACOES_DO_SOCORRO, { title: 'Socorro da OFICINA', placeHolder: 'O que fazer?' })
  if (!escolha) return
  anotar('socorro.escolha', { acao: escolha.id })

  if (escolha.id === 'reabrir') {
    const antigo = painelAberto
    if (antigo) {
      try { antigo.dispose() } catch (e) { anotar('socorro.naoFechou', { mensagem: String((e && e.message) || e) }) }
      // O fechamento avisa por `onDidDispose`, que zera `painelAberto`. Sem esse aviso a aba antiga
      // continua dona da conversa — abrir outra por cima deixaria duas, uma delas órfã.
      const ate = Date.now() + 2000
      while (painelAberto === antigo && Date.now() < ate) await new Promise(r => setTimeout(r, 20))
      if (painelAberto === antigo) {
        anotar('socorro.naoFechou', { mensagem: 'a aba antiga nao avisou que fechou' })
        vscode.window.showErrorMessage('A aba antiga da conversa não fechou. Feche-a pelo X e use "Reabrir a conversa" de novo.')
        return
      }
    }
    await abrirPainel()
    return
  }

  if (escolha.id === 'registro' || escolha.id === 'pasta') {
    if (!registroEmDisco) {
      vscode.window.showErrorMessage('Esta janela não tem registro: o editor não informou uma pasta para ele.')
      return
    }
    if (registroEmDisco.falhou) {
      vscode.window.showErrorMessage('Não consegui gravar o registro: ' + registroEmDisco.falhou)
      return
    }
    const uri = vscode.Uri.file(registroEmDisco.arquivo)
    if (escolha.id === 'registro') await vscode.window.showTextDocument(uri, { preview: false })
    else await tentar('revealFileInOS', uri)
    return
  }

  if (escolha.id === 'recarregar') await tentar('workbench.action.reloadWindow')
}

/**
 * V5 — A LISTA DAS CONVERSAS.
 *
 * ⚠️ A ordem aqui tem uma razão: o painel é ABERTO ANTES de mandar retomar. Enquanto
 * `recomecarAberta` não existe (nenhuma aba de conversa aberta), não há a quem entregar a
 * conversa escolhida — e o clique morreria em silêncio, que é a pior resposta possível
 * para quem acabou de escolher uma conversa numa lista.
 */
async function abrirListaDeConversas() {
  await telaSessoes.abrirLista({
    pastaDoProjeto,
    aoRetomar: async ({ id, titulo, bifurcar }) => {
      await abrirPainel()
      if (typeof recomecarAberta === 'function') {
        await recomecarAberta({ retomar: id, bifurcar, titulo: tituloDaConversa(titulo) })
      }
    },
  })
}

/*
 * ═══════════════════════════════════════════════════════════════════════════════
 * V6 — AS AÇÕES DO EDITOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Selecionar um trecho e pedir "explicar", "corrigir" ou "gerar teste" — pelo menu do botão
 * direito, pela paleta, por atalho, ou pelo CodeLens que aparece em cima de cada função.
 *
 * ⚠️ NENHUMA DELAS GRAVA NADA POR CONTA PRÓPRIA. Elas só escrevem um pedido na conversa; o
 * que muda arquivo é o agente, e todo pedido de mudança dele passa pela porta de permissão e
 * pela revisão em diff — o mesmo caminho de quando a pessoa digita. É por isso que "corrigir"
 * pode existir sem ser um botão que altera o código de alguém sem mostrar.
 */

/** O que o editor está mostrando agora, no formato que `acoes.js` entende. */
function contextoDaSelecao(editor, intervalo = null, simbolo = null) {
  if (!editor || !editor.document) return null
  const doc = editor.document
  const faixa = intervalo || (editor.selection && !editor.selection.isEmpty ? editor.selection : null)
  if (!faixa) return null

  const trecho = doc.getText(faixa)
  if (!trecho || !trecho.trim()) return null

  // ⚠️ RELATIVO à pasta aberta — nunca o caminho absoluto desta máquina. A conversa fica
  // gravada no perfil de quem usa, e um caminho absoluto põe o nome de usuário e a árvore de
  // pastas de alguém dentro de cada pedido (ver o comentário em `acoes.js`).
  /*
    ⚠️ COMECA VAZIO, e nao com o caminho absoluto.

    A versao anterior comecava com `doc.uri.fsPath` e so o trocava por relativo SE o editor
    achasse uma pasta para aquele documento. Quando o arquivo ativo esta FORA da pasta aberta
    (um arquivo solto aberto pelo Ctrl+O, um rascunho), nao ha pasta para ele: o `if` nao
    rodava e o absoluto seguia para dentro do pedido — com o nome de usuario e a arvore de
    pastas de alguem. Achado por revisao independente em 12/09/2026, por leitura de codigo.

    Comecando vazio, o pior caso vira o NOME do arquivo, que e o que a linha de baixo faz.
    `acoes.js` ainda tem a barreira propria (`caminhoParaMostrar`): duas camadas de proposito,
    porque esta aqui depende de quem chama e aquela vale para todo caminho ate o texto.
  */
  let caminho = ''
  try {
    const pasta = vscode.workspace.getWorkspaceFolder(doc.uri)
    if (pasta) caminho = path.relative(pasta.uri.fsPath, doc.uri.fsPath).replace(/\\/g, '/')
  } catch { /* fica o que der; `acoes.js` aguenta caminho vazio */ }

  return {
    caminho: caminho || path.basename(doc.uri.fsPath),
    linguagem: doc.languageId,
    trecho,
    linhaInicial: faixa.start.line + 1,
    linhaFinal: faixa.end.line + 1,
    simbolo,
  }
}

/**
 * Roda uma ação: monta o pedido, abre a conversa e entrega.
 *
 * A ordem importa — o painel é aberto ANTES de entregar, senão não há a quem entregar. A fila
 * dentro de `ligar` cobre o tempo entre a aba nascer e a tela subir.
 */
async function pedirAoAgente(id, { intervalo = null, simbolo = null } = {}) {
  const editor = vscode.window.activeTextEditor
  const contexto = contextoDaSelecao(editor, intervalo, simbolo)
  if (!contexto) {
    vscode.window.setStatusBarMessage('OFICINA: selecione um trecho de código primeiro', 4000)
    return
  }

  if (id === 'perguntar') {
    const pergunta = await vscode.window.showInputBox({
      title: 'Perguntar sobre a seleção',
      prompt: `${contexto.linhaFinal - contexto.linhaInicial + 1} linha(s) de ${contexto.caminho}`,
      placeHolder: 'O que você quer saber sobre este trecho?',
    })
    if (!pergunta || !pergunta.trim()) return
    contexto.pergunta = pergunta
  }

  const texto = acoes.montar(id, contexto)
  if (!texto) {
    vscode.window.setStatusBarMessage('OFICINA: não consegui montar o pedido', 4000)
    return
  }

  await abrirPainel()
  if (typeof entregarPedido === 'function') {
    entregarPedido({ texto, titulo: acoes.titulo(id, contexto) })
  }
}

/**
 * Os botões que aparecem em cima de cada função: "Explicar · Gerar teste" (CodeLens).
 *
 * ⚠️ QUEM ACHA AS FUNÇÕES É O EDITOR, não uma expressão regular nossa. O provedor de símbolos
 * já existe para toda linguagem que tem suporte instalado, entende classe, método e função
 * aninhada, e continua certo quando a linguagem muda. Uma regex nossa acertaria JavaScript e
 * erraria todo o resto — e erraria calada, mostrando o botão no lugar errado.
 */
class BotoesDaFuncao {
  async provideCodeLenses(documento, cancelamento) {
    if (!botoesNaFuncaoLigados()) return []
    let simbolos
    try {
      simbolos = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', documento.uri)
    } catch { return [] }
    if (!Array.isArray(simbolos) || (cancelamento && cancelamento.isCancellationRequested)) return []

    const QUE_VALEM = new Set([
      vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Constructor,
    ])
    const botoes = []
    const percorrer = lista => {
      for (const s of lista || []) {
        if (QUE_VALEM.has(s.kind)) {
          const faixa = s.range
          const primeira = new vscode.Range(faixa.start, faixa.start)
          for (const id of ['explicar', 'testar']) {
            const acao = acoes.porId(id)
            botoes.push(new vscode.CodeLens(primeira, {
              title: acao.rotulo,
              command: `oficina.${id}`,
              arguments: [{ intervalo: faixa, simbolo: s.name }],
            }))
          }
        }
        if (s.children && s.children.length) percorrer(s.children)
      }
    }
    percorrer(simbolos)
    return botoes
  }
}

/** Os botões na função podem ser desligados por quem acha que eles poluem o código. */
function botoesNaFuncaoLigados() {
  try {
    return vscode.workspace.getConfiguration('oficina').get('botoesNasFuncoes', true) !== false
  } catch { return true }
}

function registrarAcoes(context) {
  for (const acao of acoes.ACOES) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`oficina.${acao.id}`, (arg) => {
        // ⚠️ O CodeLens passa `{intervalo, simbolo}`; o menu e a paleta não passam nada, e aí
        // vale a seleção do editor. Sem esta distinção, o clique no botão pediria sobre o que
        // estivesse selecionado em vez da função em que a pessoa clicou.
        const de = arg && typeof arg === 'object' && arg.intervalo ? arg : {}
        return pedirAoAgente(acao.id, de)
      }))
  }
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new BotoesDaFuncao()))
}

/** Sem painel aberto, "nova conversa" é simplesmente abrir a conversa. */
async function novaConversa() {
  if (recomecarAberta) await recomecarAberta()
  else await abrirPainel()
}

/**
 * A edição da equipe mostra o logo do Claude no botão de nova conversa.
 *
 * ⚠️ O logo é marca de terceiro, e este repositório é público: o ARQUIVO não mora aqui. A
 * camada da equipe sobrepõe `painel/marca-equipe.svg` no build, e esta chave diz ao menu da
 * aba qual dos dois botões mostrar. Sem o arquivo, a edição neutra segue com o `$(add)` —
 * que acompanha a cor do tema, coisa que um SVG próprio não faria.
 */
function marcarEdicaoDaEquipe(context) {
  const temMarca = fs.existsSync(path.join(context.extensionPath, 'painel', 'marca-equipe.svg'))
  return Promise.resolve(vscode.commands.executeCommand('setContext', 'oficina.marcaDaEquipe', temMarca)).catch(() => { })
}

function registrarPainel(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('oficina.abrirPainel', abrirPainel),
    vscode.commands.registerCommand('oficina.abrirConversaOficial', abrirConversaOficial),
    vscode.commands.registerCommand('oficina.pararAgente', () => { conversaAberta && conversaAberta.cancelar() }),
    vscode.commands.registerCommand('oficina.novaConversa', novaConversa),
    // V5: a lista das conversas desta pasta — retomar, renomear, etiquetar, procurar.
    vscode.commands.registerCommand('oficina.conversas', abrirListaDeConversas),
    // V4: a porta pela paleta para o terminal dos comandos — quem fechou a aba dele precisa de um
    // caminho de volta que não dependa de ter um comando rodando agora.
    vscode.commands.registerCommand('oficina.mostrarTerminal', () => terminalDoAgente && terminalDoAgente.mostrar(true)),
    // O mesmo botão, com o logo da edição da equipe (ver `marcarEdicaoDaEquipe`).
    vscode.commands.registerCommand('oficina.novaConversaEquipe', novaConversa),
  )

  // Restaurar o estado ao abrir é requisito dele, não enfeite: "já abre sozinho pq
  // nunca fecho" (V0). Sem o serializer, uma aba de conversa aberta ontem volta como
  // um retângulo cinza depois de reiniciar o editor.
  if (vscode.window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(TIPO_DO_PAINEL, {
        async deserializeWebviewPanel(painel) {
          painel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(contextoDaExtensao.extensionPath, 'painel'))],
          }
          painel.webview.html = montarHtml(painel.webview)
          // ⚠️ O VS Code devolve a aba com o NOME da conversa antiga, e a conversa que
          // `ligar` cria é nova. Sem isto a aba mentia sobre o que tem dentro — e, como o
          // nome já não era "Nova conversa", o primeiro pedido novo nem a renomeava.
          painel.title = TITULO_NOVO
          painelAberto = painel
          ligar(painel, { restaurada: true })
        },
      }))
  }
}

/**
 * V12 — a vista "Skills". Quem sabe ordenar e guardar é `telaSkills.js`; aqui mora só o clique.
 *
 * ⚠️ CLICAR É O MESMO CAMINHO DE DIGITAR. O clique manda `/nome` pela fila de pedidos da V6: a mensagem
 * aparece na conversa como fala da pessoa, e o agente carrega a skill do jeito de sempre. Medido no SDK
 * em 13/09/2026: mandar `/nome` como mensagem põe o `SKILL.md` inteiro na conversa antes de qualquer
 * chamada ao modelo. Não há atalho para o agente: o que a pessoa não poderia digitar, o clique não faz.
 */
function registrarSkills(context) {
  telaDeSkills = criarTelaDeSkills(vscode, { perfil: context.globalState, pasta: context.workspaceState || context.globalState })
  const vista = vscode.window.createTreeView('oficina.skills', {
    treeDataProvider: telaDeSkills.provedor,
    dragAndDropController: telaDeSkills.arrastar,
    canSelectMany: true,
  })
  context.subscriptions.push(
    vista,
    vscode.window.registerFileDecorationProvider(telaDeSkills.decoracao),
    vscode.commands.registerCommand('oficina.skills.abrir', () => tentar('workbench.view.extension.oficinaSkills')),
    vscode.commands.registerCommand('oficina.skills.usar', usarSkill),
    vscode.commands.registerCommand('oficina.skills.favoritar', alvo => telaDeSkills.alternarFavorita(alvo)),
    vscode.commands.registerCommand('oficina.skills.desfavoritar', alvo => telaDeSkills.alternarFavorita(alvo)),
    vscode.commands.registerCommand('oficina.skills.ocultar', alvo => telaDeSkills.alternarOculta(alvo)),
    vscode.commands.registerCommand('oficina.skills.mostrar', alvo => telaDeSkills.alternarOculta(alvo)),
    vscode.commands.registerCommand('oficina.skills.recomecar', recomecarSkills),
    // Outra janela pode ter mudado a arrumação (ela mora no perfil): relê ao voltar o foco.
    vscode.window.onDidChangeWindowState(e => { if (e && e.focused && telaDeSkills) telaDeSkills.redesenhar() }),
    { dispose: () => telaDeSkills && telaDeSkills.descartar() })
}

async function usarSkill(nome, ficha) {
  // Só o clique na vista traz a ficha (ver `telaSkills.js`): chamada de outra extensão ou da paleta não vira pedido.
  if (!telaDeSkills || !telaDeSkills.cliqueValido(nome, ficha)) { anotar('skills.recusado'); return }
  const texto = pedidoDaSkill(nome)
  if (!texto) return
  anotar('skills.usar')
  await abrirPainel()
  if (typeof entregarPedido === 'function') entregarPedido({ texto, titulo: nome })
}

async function recomecarSkills() {
  const ok = await vscode.window.showWarningMessage(
    'Voltar a lista de skills para a ordem do agente? As favoritas e as ocultas também saem.', { modal: true }, 'Recomeçar')
  if (ok !== 'Recomeçar') return
  await telaDeSkills.recomecar()
}

/**
 * V26 — as vistas "Conexões" (os MCPs) e "Conta". Quem lê o estado é `mcps.js`/`conta.js`, quem desenha
 * é `telaMcps.js`/`telaConta.js`; aqui mora só o registro e a conversa com o editor.
 *
 * ⚠️ A PASTA IMPORTA. A lista de MCPs depende da pasta aberta: um `.mcp.json` de projeto só existe
 * dentro dela. Por isso o CLI roda com o `cwd` da primeira pasta do espaço de trabalho — o mesmo lugar
 * de onde a conversa lê as skills de projeto.
 */
function pastaDeTrabalho() {
  const pastas = vscode.workspace.workspaceFolders
  return pastas && pastas.length && pastas[0].uri.scheme === 'file' ? pastas[0].uri.fsPath : undefined
}

/**
 * A pasta que a medição usou, dita como ela é — para a tela não falar no singular quando há várias,
 * nem dizer "nesta pasta" quando não há pasta nenhuma.
 *
 * ⚠️ MEDIDO (revisor independente, 24/09/2026): o CLI SOBE a árvore atrás de `.mcp.json`. Dentro do
 * projeto vinham 11 servidores; numa pasta temporária, 10 — e o arquivo que traz o servidor
 * faltante está DOIS NÍVEIS acima da pasta aberta. "Veio no .mcp.json desta pasta" era falso.
 */
function ondeAMedicaoAconteceu() {
  const pastas = vscode.workspace.workspaceFolders || []
  const daMedicao = pastaDeTrabalho()
  if (!daMedicao) return 'sem nenhuma pasta aberta (o Claude respondeu sobre a sua conta, não sobre um projeto)'
  if (pastas.length > 1) return `na pasta ${daMedicao} — a primeira das ${pastas.length} abertas; as outras não foram consultadas`
  return `na pasta ${daMedicao}`
}

let saidaDasConexoes = null
function mostrarTextoDasConexoes(titulo, texto) {
  if (!saidaDasConexoes) {
    saidaDasConexoes = vscode.window.createOutputChannel('OFICINA — conexões')
    // ⚠️ Ele nasce sob demanda, mas MORRE com a extensão: era o único `createOutputChannel` do
    // arquivo fora das `subscriptions`, e canal não descartado é recurso vazando na recarga.
    if (contextoDaExtensao) contextoDaExtensao.subscriptions.push(saidaDasConexoes)
  }
  saidaDasConexoes.clear()
  saidaDasConexoes.appendLine(titulo)
  saidaDasConexoes.appendLine('─'.repeat(Math.min(60, titulo.length + 10)))
  saidaDasConexoes.appendLine(String(texto || '').trim())
  // ⚠️ O texto abaixo vem do Claude, em inglês e cru — e a tela diz isso, em vez de deixar a pessoa
  // achar que o programa é que resolveu falar inglês.
  saidaDasConexoes.appendLine('')
  saidaDasConexoes.appendLine('(o texto acima é a resposta do Claude, como ele a deu — em inglês)')
  saidaDasConexoes.show(true)
}

/**
 * Um terminal VISÍVEL com o `claude` embutido, já com os argumentos — nunca uma linha de comando
 * digitada num shell.
 *
 * ⚠️ `shellArgs` como LISTA é o que impede qualquer nome de servidor de virar comando. É a mesma
 * decisão do `comando.js`: quem executa passa argumentos, não texto.
 *
 * ⚠️ E é terminal, e não processo escondido, porque `mcp login` e `auth login` CONVERSAM: abrem o
 * navegador e às vezes pedem para colar um endereço de volta. Um processo mudo travaria para sempre.
 */
function abrirClaudeNoTerminal(nome, argumentos, { aoFechar } = {}) {
  const exe = caminhoDoClaude()
  if (!exe) {
    vscode.window.showWarningMessage('Não achei o programa do Claude dentro desta instalação da OFICINA.')
    return false
  }
  const t = vscode.window.createTerminal({ name: nome, shellPath: exe, shellArgs: argumentos, cwd: pastaDeTrabalho() })
  /*
    ⚠️ QUEM AVISA QUE O TRABALHO DO TERMINAL ACABOU É O FECHAMENTO DELE — e este arquivo já sabia
    disso desde a V8, no login da conversa: *"a conversa nova nasce quando o terminal do login fecha:
    é ela que lê a credencial nova"*. As duas ações novas da V26 (entrar num MCP, entrar/sair da
    conta) nasceram sem esse gancho, e o efeito era a tela continuar mostrando o estado velho depois
    de a pessoa ter mudado o estado de verdade. Um revisor independente apontou que o padrão já
    existia no mesmo arquivo, três funções acima.
  */
  if (typeof aoFechar === 'function') {
    const assinatura = vscode.window.onDidCloseTerminal(fechado => {
      if (fechado !== t) return
      assinatura.dispose()
      try { aoFechar() } catch (e) { anotar('terminal.aoFechar.falhou', { erro: e && e.message }) }
    })
    if (contextoDaExtensao) contextoDaExtensao.subscriptions.push(assinatura)
  }
  t.show()
  return true
}

/** A vista da conta, para o "Sair" poder mandá-la reler o estado depois de deslogar. */
let telaDaConta = null

function registrarConexoes(context) {
  const tela = criarTelaDeMcps(vscode, {
    medir: () => mcps.lerLista({ exe: caminhoDoClaude(), cwd: pastaDeTrabalho() }),
    detalhar: nome => mcps.lerDetalhe(nome, { exe: caminhoDoClaude(), cwd: pastaDeTrabalho() }),
    mostrarTexto: mostrarTextoDasConexoes,
    // Recusa nunca é silêncio: quando a tela não pode agir num servidor, ela DIZ por quê.
    avisar: texto => vscode.window.showInformationMessage(texto),
    avisoDaPasta: () => mcps.avisoDePastaAdulterada(pastaDeTrabalho()),
    entrar: nome => {
      anotar('mcps.entrar')
      abrirClaudeNoTerminal(`Entrar no MCP: ${nome}`, mcps.argumentosParaEntrar(nome),
        { aoFechar: () => tela.atualizar() })
    },
    /*
      ⚠️ AQUI NÃO HÁ BOTÃO QUE FAZ — porque não existe a operação. Um servidor de `.mcp.json` que a
      pessoa ainda não aprovou é aprovado NA CONVERSA (o próprio CLI diz: "run `claude` to approve"),
      e não por um comando que a gente pudesse chamar daqui.

      ⚠️ E O TEXTO NÃO AFIRMA QUE O PEDIDO APARECE. A versão anterior mandava "abra a conversa e
      responda o pedido de aprovação que aparece" — afirmação sobre o comportamento de uma ferramenta
      de terceiro que NINGUÉM mediu, como um revisor independente apontou. O que o CLI diz, ele diz
      com todas as letras: `run claude to approve`. Então os dois caminhos ficam oferecidos, e o que
      não foi medido está dito como não medido.
    */
    explicarAprovacao: async nome => {
      anotar('mcps.aprovar')
      const escolha = await vscode.window.showInformationMessage(
        `O servidor "${nome}" veio de um arquivo .mcp.json (da pasta aberta ou de uma pasta acima dela) e ainda ` +
        'não foi aprovado por você. Quem aprova é o Claude conversando, não esta tela: o caminho que ele mesmo ' +
        'indica é rodar o Claude num terminal, nesta pasta, e responder o pedido de aprovação. Pela conversa da ' +
        'OFICINA costuma funcionar também, mas isso não foi verificado aqui.',
        'Abrir um terminal com o Claude', 'Abrir a conversa')
      if (escolha === 'Abrir a conversa') await tentar('oficina.abrirConversaOuExplicar')
      else if (escolha === 'Abrir um terminal com o Claude') {
        abrirClaudeNoTerminal('Aprovar servidor MCP', [], { aoFechar: () => tela.atualizar() })
      }
    },
  })
  const vista = vscode.window.createTreeView('oficina.mcps', { treeDataProvider: tela.provedor })
  vista.message = tela.mensagemDaVista()
  const acompanhar = () => { vista.description = tela.descricaoDaVista() }
  context.subscriptions.push(
    vista,
    tela.provedor.onDidChangeTreeData(acompanhar),
    // Mede quando a vista aparece — e NUNCA na abertura do programa: medir conecta em cada servidor.
    //
    // ⚠️ E É POR ISSO QUE NÃO HÁ `if (vista.visible) …` AQUI. Havia, e um revisor independente
    // mostrou que aquela linha desmentia o comentário: quem deixasse o painel aberto pagaria um
    // health-check em todos os servidores a cada abertura de janela, sem ter pedido nada. Com o
    // painel aberto na largada, a vista mostra o convite — um clique, e ele decide.
    vista.onDidChangeVisibility(e => { if (e && e.visible) tela.aoAparecer() }),
    // O "há N min" do título precisa envelhecer mesmo sem medição nova.
    vscode.window.onDidChangeWindowState(e => { if (e && e.focused) { tela.redesenhar(); acompanhar() } }),
    vscode.commands.registerCommand('oficina.mcps.abrir', () => tentar('workbench.view.extension.oficinaConexoes')),
    // ⚠️ Chamado pela paleta, ele ABRE a vista antes de medir: sem isso, o comando rodava 6 s e não
    // aparecia nada na tela — comando que parece não ter funcionado.
    vscode.commands.registerCommand('oficina.mcps.atualizar', async () => {
      if (!vista.visible) await tentar('workbench.view.extension.oficinaConexoes')
      return tela.atualizar()
    }),
    vscode.commands.registerCommand('oficina.mcps.detalhe', alvo => tela.verDetalhe(alvo)),
    vscode.commands.registerCommand('oficina.mcps.entrar', alvo => tela.entrarNoServidor(alvo)),
    vscode.commands.registerCommand('oficina.mcps.aprovar', alvo => tela.explicarAprovacao(alvo)),
    { dispose: () => tela.descartar() })
}

function registrarConta(context) {
  const tela = criarTelaDaConta(vscode, {
    medir: () => contaDoClaude.lerConta({ exe: caminhoDoClaude(), cwd: pastaDeTrabalho() }),
    sair: () => sair(),
    entrar: () => {
      anotar('conta.entrar')
      abrirClaudeNoTerminal('Conta do Claude', contaDoClaude.ARGUMENTOS_PARA_ENTRAR,
        { aoFechar: () => tela.atualizar() })
    },
  })
  const vista = vscode.window.createTreeView('oficina.conta', { treeDataProvider: tela.provedor })
  const acompanhar = () => { vista.description = tela.descricaoDaVista() }
  telaDaConta = tela
  context.subscriptions.push(
    vista,
    tela.provedor.onDidChangeTreeData(acompanhar),
    vista.onDidChangeVisibility(e => { if (e && e.visible) tela.aoAparecer() }),
    vscode.window.onDidChangeWindowState(e => { if (e && e.focused) { tela.redesenhar(); acompanhar() } }),
    vscode.commands.registerCommand('oficina.conta.abrir', () => tentar('workbench.view.extension.oficinaConta')),
    vscode.commands.registerCommand('oficina.conta.atualizar', async () => {
      if (!vista.visible) await tentar('workbench.view.extension.oficinaConta')
      return tela.atualizar()
    }),
    vscode.commands.registerCommand('oficina.conta.sair', () => tela.sair()),
    vscode.commands.registerCommand('oficina.conta.entrar', () => tela.entrar()),
    // ⚠️ A referência de módulo morre junto com a vista: depois do `dispose`, o "Sair" ainda achava
    // `telaDaConta` viva e chamava `atualizar()` sobre um emissor já descartado.
    { dispose: () => { telaDaConta = null; tela.descartar() } })
}

/**
 * V17 — a vista "Navegador": o navegador do próprio editor, imitando aparelhos. Quem sabe os aparelhos e
 * fala com o navegador é `navegador.js`; aqui mora só o registro.
 */
function registrarNavegador(context) {
  const navegador = criarNavegador(vscode, { anotar })
  const verHtml = criarVerHtml(vscode, { anotar })
  const vista = vscode.window.createTreeView('oficina.navegador', { treeDataProvider: navegador.provedor })
  // O custo dito na tela, e não só no documento: "iOS" aqui não é o Safari.
  vista.message = AVISO_DO_NAVEGADOR
  const w = vscode.window
  context.subscriptions.push(
    vista,
    vscode.commands.registerCommand('oficina.navegador.abrir', () => tentar('workbench.view.extension.oficinaNavegador')),
    vscode.commands.registerCommand('oficina.navegador.abrirEndereco', endereco => navegador.abrirEndereco(endereco)),
    vscode.commands.registerCommand('oficina.navegador.abrirHtml', () => navegador.abrirHtmlDoEditor()),
    vscode.commands.registerCommand('oficina.navegador.emular', id => navegador.emular(id)),
    vscode.commands.registerCommand('oficina.navegador.girar', () => navegador.girar()),
    // V27: as duas opções de um `.html` — ver a página e ver o código (verHtml.js).
    vscode.commands.registerCommand('oficina.navegador.ladoALado', () => navegador.ladoALado()),
    vscode.commands.registerCommand('oficina.html.verPagina', uri => verHtml.verPagina(uri)),
    vscode.commands.registerCommand('oficina.html.verCodigo', uri => verHtml.verCodigo(uri)),
    // V30: renomear a conversa pelo menu da ABA — ponte para o comando da extensão oficial, que
    // existe mas só está no botão direito DENTRO da conversa e na paleta (`renomearConversa.js`).
    vscode.commands.registerCommand('oficina.conversa.renomear', () => renomearAConversa(vscode)),
    { dispose: () => navegador.descartar() })
  if (typeof w.onDidCloseBrowserTab === 'function') context.subscriptions.push(w.onDidCloseBrowserTab(aba => navegador.esquecerAba(aba)))
}

function registrarAbrirConversa(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('oficina.abrirConversaOuExplicar', abrirConversaOuExplicar))
}

/**
 * V19 — O MOSTRADOR DO LIMITE DO PLANO na barra de cima.
 *
 * O pedido dele, com as palavras dele: *"alguma coisa que mostrasse na barra superior o limite da
 * sessao e semanal, o tempo todo na tela"*. São os dois números — quanto já se gastou da janela de
 * 5 horas e quanto da semana — com quando cada uma vira.
 *
 * ⚠️ POR QUE ISTO EXIGIU PATCH NO NÚCLEO, e o que foi procurado antes. O que uma extensão põe na
 * barra de cima tem texto FIXO: o título vem do manifesto e não muda enquanto o programa roda.
 * Procurado, um a um: `contributes.commands` (texto fixo, sem templating), campo de dica no
 * manifesto (não existe — só `title`, `shortTitle`, `category`, `icon` e `enablement`), API
 * proposta (nenhuma das definições publicadas cita a barra de título), a variável do título da
 * janela (existe e é alcançável, mas escreve no título da JANELA, que com a barra de pesquisa
 * ligada vira o rótulo dela — sequestraria a barra de pesquisa) e o serviço interno de itens
 * customizados (é como o próprio editor desenha coisa viva ali, e é interno ao workbench). O
 * patch 0016 abre a porta genérica: título curto com `${chave}` vira texto vivo daquele context
 * key. QUAL texto mora aqui e no manifesto, onde se muda sem recompilar nada.
 *
 * ⚠️ O CLIQUE NÃO FURA A COTA. Ele pede uma leitura; se a cota não permitir, o mostrador diz
 * quanto falta. Furar seria pedir para ser barrado por cinco minutos — e aí o número da barra
 * pararia de atualizar justamente por causa de quem quis vê-lo mais cedo.
 */
/**
 * ⚠️ V20 — O MOSTRADOR DA V19 SAIU DA BARRA DE TÍTULO, E ESTA FUNÇÃO NÃO É MAIS CHAMADA.
 *
 * Duas ordens dele na leva de 21/09/2026 a desligaram:
 *   - `t188`: perguntado se o mostrador do limite saía da barra de cima junto com os três botões,
 *     respondeu **"tira os 3 e o limite também"**;
 *   - `t199`: o limite não sumiu do produto — mudou de lugar. Virou a FAIXA de medidores, com
 *     barra que enche, entre a barra de cima e as abas (`faixaDoLimite.js` + patch 0017).
 *
 * Fica aqui, sem ser chamada, de propósito: o caminho de consulta ao agente que ela usa
 * (`conversaAberta.lerUsoDoPlano`) é o único do produto, e apagá-lo junto com a troca de lugar
 * misturaria duas decisões numa só. **Remover `limite.js`, `mostradorDoLimite.js` e esta função é
 * item próprio, para depois que a V20 for aprovada por ele.**
 */
function registrarMostradorDoLimiteDaV19(context) {
  mostradorDoLimite = criarMostradorDoLimite(vscode, {
    consultar: () => (conversaAberta && typeof conversaAberta.lerUsoDoPlano === 'function'
      ? conversaAberta.lerUsoDoPlano()
      : Promise.resolve({ estado: 'semConversa' })),
    avisar: texto => { vscode.window.showInformationMessage(texto) },
  })
  context.subscriptions.push(
    { dispose: () => { if (mostradorDoLimite) { mostradorDoLimite.descartar(); mostradorDoLimite = null } } })
  Promise.resolve(mostradorDoLimite.ligar()).catch(e => anotar('limite.naoLigou', { mensagem: String((e && e.message) || e) }))
}

/**
 * A FAIXA DO LIMITE E O MOSTRADOR DE TOKENS — as duas coisas que a V20 põe na tela de cima.
 *
 * A faixa (`t199`) lê o registro do programa de linha de comando de 5 em 5 minutos e publica os
 * medidores na chave que o `product.json` declarou; quem desenha é o patch 0017. O mostrador de
 * tokens (`t196`) publica o texto vivo da barra de título, pela porta do patch 0016.
 *
 * ⚠️ NENHUM DOS DOIS DEPENDE DA CONVERSA PRÓPRIA. É o que a decisão dele no `t187` exigiu: a faixa
 * lê um arquivo, e o mostrador de tokens acha a conversa pelo id que o próprio programa registra
 * (`sessaoAtiva.js`). Foi assim que o relógio do cache e os tokens voltaram a funcionar com a
 * conversa da extensão oficial.
 */
function abrirDetalheDoConsumo() {
  if (!telaDoConsumo) return Promise.resolve(null)
  anotar('consumo.abriu')
  return Promise.resolve(telaDoConsumo.abrir()).catch(e => {
    anotar('consumo.naoAbriu', { mensagem: String((e && e.message) || e) })
    return null
  })
}

/**
 * Os ajustes na tela da extensão oficial (t194, t200) — ver `ajustesDaConversaOficial.js`.
 *
 * ⚠️ RODA NA ATIVAÇÃO, E O EFEITO SÓ APARECE NA PRÓXIMA ABERTURA DA WEBVIEW. O CSS dela já foi
 * carregado quando chegamos aqui; escrever agora vale para a conversa seguinte. É o preço de
 * ajustar a tela de outra extensão, e é por isso que o resultado vai para o registro — sem isso,
 * "não funcionou" e "funcionou e você ainda não recarregou" seriam a mesma coisa.
 */
function aplicarAjustesDaConversaOficial() {
  try { ajustesDaOficial.aplicar(vscode, { anotar }) }
  catch (e) { anotar('ajustesDaOficial.erro', { mensagem: String((e && e.message) || e) }) }
}

/**
 * O PADRÃO DE FÁBRICA QUE A CONVERSA OFICIAL NÃO ENXERGA (ver `padraoDaConversaOficial.js`).
 *
 * ⚠️ ISTO ESCREVE NO ARQUIVO DE CONFIGURAÇÃO DE QUEM USA, e é decisão dele de 21/09/2026, tomada
 * com o custo declarado. Sem isto, o modo que pula aprovação NÃO vale para quem instala — a
 * extensão oficial lê essa chave só da camada da pessoa, e o padrão do produto é descartado. O
 * defeito foi achado por revisor independente na tela do build 1, que leu "Auto" três vezes em
 * perfil limpo enquanto o produto anunciava o contrário no README.
 *
 * Escreve UMA vez: se a pessoa já tem a chave, a escolha dela fica.
 */
function propagarPadroesDaConversaOficial() {
  try {
    const inspecionar = (secao, chave) => vscode.workspace.getConfiguration(secao).inspect(chave)
    const escrever = (secao, chave, valor) =>
      vscode.workspace.getConfiguration(secao).update(chave, valor, vscode.ConfigurationTarget.Global)
    Promise.resolve(padraoDaOficial.propagar(inspecionar, escrever))
      .then(escritas => {
        // O registro é o que separa "não precisou" de "tentou e não conseguiu".
        for (const e of escritas) anotar('padraoDaOficial.escrito', { chave: `${e.secao}.${e.chave}`, valor: String(e.valor) })
      })
      .catch(e => anotar('padraoDaOficial.erro', { mensagem: String((e && e.message) || e) }))
  } catch (e) {
    anotar('padraoDaOficial.erro', { mensagem: String((e && e.message) || e) })
  }
}

/**
 * A CONVERSA MORA NO CENTRO — e volta para lá sozinha se alguém a mandou para a lateral (t203).
 *
 * ⚠️ POR QUE ISTO NÃO ENTROU EM `padraoDaConversaOficial.js`. Aquele módulo tem um contrato claro
 * e correto: *nunca sobrescreve escolha de quem usa* — só escreve quando a camada da pessoa está
 * vazia. Se `preferredLocation` fosse escolha, ele seria o lugar e a resposta seria "não mexer".
 *
 * Só que NÃO É ESCOLHA. Lido no pacote dela (2.1.278): o comando `claude-vscode.sidebar.open`
 * começa com `X.setPreferredLocation("sidebar")`, e esse comando é o que roda quando se CLICA no
 * ícone dela. Ou seja: um clique sem intenção nenhuma de mudar padrão grava `sidebar` na camada da
 * pessoa, para sempre, e a partir dali toda conversa nasce na barra da direita. O produto declara
 * `panel` no `product.json`, mas padrão de produto perde para a camada de quem usa — entao o
 * padrão nunca mais volta a valer sozinho.
 *
 * A decisão é do dono, em 24/09/2026, com estas palavras: *"ele abre aqui no centro um chat que
 * ocupa praticamente a tela inteira e e isso, e acabou, eu nao quero essa aba da direita"*.
 *
 * ⚠️ O QUE ISTO CUSTA, DECLARADO: quem de fato quiser a conversa na lateral perde a preferência a
 * cada abertura do programa. É uma troca consciente — no lugar de uma preferência que se pode
 * mudar sem querer e não se sabe desfazer, fica um comportamento fixo e previsível do produto.
 * Quem quiser a lateral em uma sessão continua abrindo pelo comando dela; o que não sobrevive é a
 * gravação silenciosa.
 */
function forcarConversaNoCentro() {
  try {
    const conf = vscode.workspace.getConfiguration('claudeCode')
    const atual = conf.inspect('preferredLocation')
    // Só escreve quando há o que desfazer: escrita à toa suja o arquivo de quem usa a cada abertura.
    if (atual && atual.globalValue === 'sidebar') {
      Promise.resolve(conf.update('preferredLocation', 'panel', vscode.ConfigurationTarget.Global))
        .then(() => anotar('conversaNoCentro.devolvida', { de: 'sidebar', para: 'panel' }))
        .catch(e => anotar('conversaNoCentro.erro', { mensagem: String((e && e.message) || e) }))
    }
  } catch (e) {
    anotar('conversaNoCentro.erro', { mensagem: String((e && e.message) || e) })
  }
}

function registrarFaixaETokens(context) {
  /*
    ⚠️ A PASTA DO CACHE DO USO É COMPARTILHADA ENTRE AS JANELAS, e é isso que se quer.
    `globalStorageUri` é a mesma pasta em todas as janelas desta instalação: a primeira janela que
    perguntar o limite ao vivo guarda a resposta ali, e as outras a leem em vez de subir cada uma o
    seu agente (~232 MB cada). Sem pasta (fora do editor, em teste), o módulo cai na temporária do
    sistema, que tem a mesma propriedade.
  */
  const pastaDoCache = (context.globalStorageUri && context.globalStorageUri.fsPath) || undefined
  if (pastaDoCache) { try { fs.mkdirSync(pastaDoCache, { recursive: true }) } catch { /* já existe, ou sem permissão: o cache então não grava, e o piso continua */ } }

  faixaDoLimite = criarFaixaDoLimite(vscode, { pastaDoCache })
  mostradorDeTokens = criarMostradorDeTokens(vscode)
  /*
    V30 — O MAPA DOS AGENTES GANHA PORTA. Ele existe desde a V16, mas dentro do painel próprio
    (`Ctrl+T`), que deixou de ser o caminho na V23 — ou seja, estava construído e invisível. O botão
    da faixa (`BOTOES_DA_FAIXA`) chama o comando abaixo.

    ⚠️ QUEM SABE DOS AGENTES É O MOSTRADOR, e por isso ele é a fonte: ele já mede TODAS as conversas
    desta janela e cada medidor já traz os subagentes do disco. Um segundo leitor do mesmo disco
    seria um segundo número para divergir do primeiro.
  */
  mapaDosAgentes = criarMapaDosAgentes(vscode, {
    lerConversas: () => (mostradorDeTokens ? mostradorDeTokens.agentesPorConversa : []),
    pastaDaExtensao: contextoDaExtensao.extensionUri,
    anotar,
  })
  /*
    ⚠️ O DETALHE (o que o expandir da faixa abre) LÊ O CACHE AO VIVO ANTES DO REGISTRO LOCAL.
    O registro pode estar parado há quase uma hora — medido, 50 min com 13 pontos de diferença. Se
    a faixa mostra o número de agora e o detalhe abre com o de 50 minutos atrás, os dois se
    contradizem na cara de quem clicou. O cache é o mesmo que a faixa usou; o registro fica como
    piso, para quando nunca se conseguiu perguntar ao vivo.
  */
  telaDoConsumo = criarTelaDoConsumo(vscode, {
    lerRegistro: async () => {
      try {
        const doCache = await consultaDeUso.lerCache(pastaDoCache)
        if (doCache && doCache.rate_limits) return doCache.rate_limits
      } catch { /* sem cache: o registro local resolve */ }
      return lerRegistroDoUso()
    },
  })

  context.subscriptions.push(
    // O clique no expandir da faixa, e o comando de mesmo nome na paleta.
    vscode.commands.registerCommand('oficina.limite.detalhe', () => abrirDetalheDoConsumo()),
    // ⚠️ O ITEM DA BARRA PRECISA DE COMANDO REGISTRADO, e não só declarado no manifesto. Um item de
    // menu aponta para um comando; sem registro, clicar nele diz "command not found". A primeira
    // versão da V20 declarou `oficina.tokensNaBarra` em três lugares do manifesto e não registrou em
    // lugar nenhum — e nenhum teste pegou, porque o critério que cobrava isso na V19 foi trocado por
    // um que só olha o manifesto. Clicar no mostrador abre o detalhe do gasto, que é o que se quer
    // ver quando se olha para um número de tokens.
    vscode.commands.registerCommand('oficina.tokensNaBarra', () => tentar('oficina.tokens.abrir')),
    // V30: o segundo botão da faixa. Abre ao lado, sem roubar o foco de quem está escrevendo.
    vscode.commands.registerCommand('oficina.agentes.mapa', () => mapaDosAgentes && mapaDosAgentes.abrir()),
    // ⚠️ O AJUSTE NA TELA DA OUTRA EXTENSÃO PRECISA DE PORTA DE VOLTA. Ele escreve um bloco de CSS
    // dentro do pacote dela; sem um comando que desfaça, a única saída seria editar arquivo na mão.
    // E o bloco sobrevive à desinstalação da OFICINA — razão a mais para a porta existir e ser
    // achável pela paleta.
    vscode.commands.registerCommand('oficina.ajustes.desfazer', () => {
      const r = ajustesDaOficial.desfazer(vscode, { anotar })
      vscode.window.showInformationMessage(r === 'desfeito'
        ? 'Os ajustes na tela da conversa foram desfeitos. Recarregue a janela para ver.'
        : 'Não havia ajuste nosso para desfazer.')
    }),
    vscode.commands.registerCommand('oficina.limite', () => abrirDetalheDoConsumo()),
    { dispose: () => { if (faixaDoLimite) { faixaDoLimite.descartar(); faixaDoLimite = null } } },
    { dispose: () => { if (mostradorDeTokens) { mostradorDeTokens.descartar(); mostradorDeTokens = null } } },
    { dispose: () => { if (mapaDosAgentes) { mapaDosAgentes.descartar(); mapaDosAgentes = null } } },
    { dispose: () => { telaDoConsumo = null } },
  )

  // Não se espera por nenhum dos dois: a ativação não pode ficar presa numa leitura de disco.
  Promise.resolve(faixaDoLimite.ligar()).catch(e => anotar('faixa.naoLigou', { mensagem: String((e && e.message) || e) }))
  try { mostradorDeTokens.ligar() } catch (e) { anotar('tokensNaBarra.naoLigou', { mensagem: String((e && e.message) || e) }) }
}

async function activate(context) {
  contextoDaExtensao = context
  ativouEm = Date.now()
  // V8 — o registro nasce primeiro: o que der errado na ativação já tem onde ficar.
  const pastaDoRegistro = context.logUri || context.globalStorageUri
  if (pastaDoRegistro) registroEmDisco = new Registro(pastaDoRegistro.fsPath)
  anotar('ativou', { versao: (context.extension && context.extension.packageJSON && context.extension.packageJSON.version) || null })
  context.subscriptions.push(vscode.commands.registerCommand('oficina.socorro', socorro))
  telaDeTokens = criarTelaDeTokens(vscode)
  tamanhosDaTela = new Tamanhos({ armazenamento: context.globalState })
  const layouts = criarLayouts(context)
  context.subscriptions.push(vscode.commands.registerCommand('oficina.layout', () => menuDeLayout(layouts)))
  context.subscriptions.push(
    // ⚠️ V20: A VISTA NÃO SE REABRE MAIS SOZINHA (t197). Até a V19 ela era embrulhada em
    // `manterSempreAberta`, que a revelava meio segundo depois da ativação E desfazia o fechamento
    // de quem a fechasse. Isso virou defeito quando ele mandou a barra direita não abrir de
    // fábrica: *"esse negócio inteiro na direita não faz sentido, não quero ele assim"*. O produto
    // mandava fechar e a extensão reabria — e o que reabria era a vista sem conversa nenhuma.
    // A vista continua existindo e alcançável pelo comando `oficina.tokens.abrir`.
    vscode.window.createTreeView('oficina.tokens', { treeDataProvider: telaDeTokens.provedor }),
    vscode.commands.registerCommand('oficina.tokens.abrir', () => tentar('workbench.view.extension.oficinaTokens')),
    { dispose: () => telaDeTokens && telaDeTokens.descartar() })
  registrarSkills(context)
  registrarNavegador(context)
  registrarConexoes(context)
  registrarConta(context)
  registrarBotoesDaBarraSuperior(context)
  registrarFaixaETokens(context)
  aplicarAjustesDaConversaOficial()
  propagarPadroesDaConversaOficial()
  forcarConversaNoCentro()
  context.subscriptions.push(vscode.commands.registerCommand('oficina.conectarGithub', () => conectarAoGithub(vscode, anotar)))
  registrarBoasVindas(context)
  registrarAbrirConversa(context)
  registrarAcoes(context)
  revisoes = new Revisoes()
  revisoes.registrar(context)
  terminalDoAgente = new TerminalDoAgente()
  context.subscriptions.push({ dispose: () => terminalDoAgente && terminalDoAgente.descartar() })
  registrarPainel(context)
  await marcarEdicaoDaEquipe(context)

  /*
    ⚠️ V27: A PRIMEIRA ABERTURA INSTALA O QUE FALTA — antes da abertura da conversa, de propósito.
    Sem a extensão do Claude Code, a abertura cai no painel próprio, e a OFICINA de quem instalou fica
    "tão diferente" da de quem desenvolve (o caso de um membro da equipe, 25/09/2026). Ver `extensoesQueFaltam.js`.
    Os ajustes na conversa oficial rodaram lá em cima, quando ela ainda não existia: refaz agora.
  */
  // ⚠️ Nada aqui pode derrubar a ativação: uma falha ao instalar deixa a OFICINA como estava, e anota.
  let instalacao = { instaladas: [], falharam: [] }
  try { instalacao = await extensoesQueFaltam.instalarOQueFalta(vscode, { anotar, estado: context.globalState }) }
  catch (e) { anotar('extensoes.erro', { mensagem: String((e && e.message) || e) }) }
  if (instalacao.instaladas.includes(extensoesQueFaltam.A_CONVERSA)) {
    aplicarAjustesDaConversaOficial()
    propagarPadroesDaConversaOficial()
  }

  /*
    ⚠️ A BARRA DA DIREITA FECHA NA ABERTURA, SEMPRE — e esta é a única coisa que se faz antes da
    guarda abaixo (t204, 24/09/2026).

    O padrão `workbench.secondarySideBar.defaultVisibility: "hidden"` só vale enquanto o perfil
    não tem layout salvo. Depois que a barra abre uma vez — e ela abre com UM clique no ícone da
    conversa oficial —, o layout salvo passa a mandar, e ela volta em toda abertura. Foi o que ele
    viu depois de instalar a V24: *"pq krls ta assim?"*, com a conversa ocupando a direita.

    A decisão é dele, e é a mesma de antes: *"eu não quero essa aba da direita (…) ele abre aqui no
    centro um chat que ocupa praticamente a tela inteira e é isso, e acabou"*.

    ⚠️ O CUSTO, DECLARADO: isto contraria em parte a guarda logo abaixo (*"mexer no que a pessoa
    deixou aberto é atrapalhar"*), e de propósito. A diferença: aquela guarda protege o TRABALHO
    dela — arquivos abertos, a lateral com o que ela estava lendo. A barra da direita não é
    trabalho: é uma casa de conversa que o produto decidiu não ter. Quem quiser abri-la continua
    com `Ctrl+Alt+B`, e aí ela fica — até a próxima abertura.
  */
  await tentar('workbench.action.closeAuxiliaryBar')
  anotar('abertura.barraDaDireitaFechada')

  /*
    ⚠️ V27: SEM PASTA, NADA DE CONVERSA AUTOMÁTICA — e isto vem ANTES da abertura abaixo, de propósito.
    A abertura abre uma conversa sozinha quando a tela está vazia; numa janela sem pasta essa conversa
    nascia na pasta pessoal, sem CLAUDE.md, sem skills do projeto e sem travas (medido em 25/09/2026).
    `pastaDeSempre.js` abre a pasta de sempre ou pergunta qual — ver o cabeçalho de lá.
  */
  if (await pastaDeSempre.aoAbrir(vscode, { anotar, estado: contextoDaExtensao && contextoDaExtensao.globalState })) return

  // ⚠️ Só arruma a tela quando ela está VAZIA.
  //
  // Sem esta guarda, quem fechasse a OFICINA com três arquivos abertos os encontraria
  // empurrados para trás de uma conversa nova, e a lateral fechada por cima do
  // trabalho dele. Arrumar a casa de quem chegou agora é serviço; mexer no que a
  // pessoa deixou aberto é atrapalhar.
  const abas = vscode.window.tabGroups.all.reduce((n, g) => n + g.tabs.length, 0)
  if (abas > 0) {
    console.log(`[oficina] ${abas} aba(s) restauradas: a tela e de quem estava usando, nao mexo`)
    return
  }

  // ⚠️ MUDOU NA V20 (t187): quem abre é a conversa OFICIAL.
  //
  // Na V2 esta linha passou a abrir o painel NOSSO. Na a leva de 21/09/2026 ele decidiu o contrário —
  // a conversa da OFICINA passa a ser a da extensão oficial — e o pedido que gerou a decisão
  // foi este: *"se eu abro o app, deve abrir DIRETO no claude code com uma conversa aberta"*.
  //
  // ⚠️ O QUE ELE VIVEU, E QUE O REGISTRO DESTA MÁQUINA PROVOU (21/09/2026, 09:46):
  //     ativou → painel.aberto → conversa.semPasta → painel.fechado, 13 s depois.
  // Ou seja, a abertura automática FUNCIONAVA: o que o barrou foi a trava `exigirPastaAberta`
  // do painel próprio ("Abra uma pasta para começar"). Ele fechou e foi procurar conversa no
  // ícone da extensão oficial, na mão — os dois cliques que ele descreveu.
  //
  // ⚠️ A ORDEM DAS TENTATIVAS IMPORTA, e nenhuma delas é chute:
  //   1. `claude-vscode.editor.openLast` — retoma a última conversa desta pasta, que é o que
  //      "com uma conversa aberta" quer dizer para quem volta ao trabalho de ontem;
  //   2. `claude-vscode.editor.open` — se não havia última, abre uma nova em aba;
  //   3. o painel nosso — só se a extensão oficial não estiver instalada (build de teste).
  // Os dois primeiros nomes saíram da lista dos 26 comandos que ela registra, lida do pacote
  // instalado, não de documentação.
  //
  // ⚠️ E A LATERAL NÃO SE FECHA MAIS AQUI. Fechá-la era certo quando a conversa era um painel
  // no editor; com a conversa oficial, a lateral é uma das casas dela — fechá-la na abertura
  // seria desfazer o que o próprio produto acabou de abrir.
  for (const comando of ['claude-vscode.editor.openLast', 'claude-vscode.editor.open']) {
    if (await tentar(comando)) {
      // ⚠️ A LATERAL FECHA, SIM — e tirá-la daqui foi um erro que só a tela mostrou.
      //
      // Ao trocar a abertura para a conversa oficial, eu tinha tirado este fechamento com o
      // argumento de que "a lateral é uma das casas dela". Medido no build: o explorador abre por
      // cima, e quem inicia o programa encontra a árvore de arquivos na frente em vez da conversa —
      // o oposto de *"se eu abro o app, deve abrir DIRETO no claude code com uma conversa aberta"*.
      //
      // Os dois comandos acima abrem a conversa em ABA, no editor; com ela em aba, a lateral aberta
      // é só espaço tomado na primeira impressão. Quem quiser os arquivos abre num clique.
      await tentar('workbench.action.closeSidebar')
      anotar('abertura.conversaOficial', { comando })
      return
    }
  }

  // A extensão oficial não respondeu: o caminho de volta é o painel nosso, que viaja dentro do
  // programa e não depende de instalação nenhuma.
  anotar('abertura.semConversaOficial')
  try {
    await abrirPainel()
    await tentar('workbench.action.closeSidebar')
  } catch (e) {
    console.log('[oficina] o painel nao abriu: ' + (e && e.message))
  }
}

/**
 * A JANELA ESTÁ FECHANDO: o que a OFICINA deixou rodando morre junto — os comandos em curso no terminal do
 * agente e o que o programa do agente desta janela lançou (comandos em segundo plano, servidores). Medido:
 * sem isto, os dois ficavam vivos, órfãos, depois de a janela fechar (ver `encerramento.js`).
 *
 * ⚠️ SÍNCRONO DE PROPÓSITO. O host de extensões sai dezenas de milissegundos depois de pedir a desativação, e
 * um processo lançado aqui para matar os outros morre junto antes de agir (medido). O editor espera até 5 s.
 * Custo, medido no executável: o host passou a sair em 0,72 s depois do pedido de desativação (era 0,03 s),
 * quando houve conversa nesta janela. Sem conversa e sem comando, nem a tabela de processos é lida.
 */
function deactivate() {
  const r = encerramento.encerrarOQueFicou({
    hostPid: process.pid,
    executavelDoAgente: caminhoDoClaude(),
    raizesDoExecutor: terminalDoAgente ? terminalDoAgente.processosVivos() : [],
    desdeMs: ativouEm,
    agenteAbriu,
  })
  anotar('encerramento', { encerrados: r.pids.length, ...(r.pulou ? { pulou: r.pulou } : {}), ...(r.erro ? { erro: r.erro } : {}) })
}

module.exports = { activate, deactivate }
