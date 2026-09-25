// OS MCPs (V26) — a lista das conexões do agente, o estado de cada uma e o que dá para fazer com ela.
// Sem `vscode`: `testes/mcps.mjs` prova o texto, os estados e a execução em node puro.
//
// ⚠️ DE QUEM É ESTE DADO — medido em 24/09/2026, antes de uma linha de tela ser desenhada, porque havia
// TRÊS donos possíveis e a escolha muda o projeto inteiro:
//
//   1. O CLI do Claude Code  ✅ ESCOLHIDO. `claude mcp list` devolve os servidores das três origens com o
//      estado de cada um, depois de um health-check de verdade. Medido nesta máquina: 11 servidores em
//      6 s. É o único que enxerga tudo.
//   2. Os arquivos de configuração  ❌ mostram um PEDAÇO. Medido: `~/.claude.json` (escopo da pessoa)
//      tinha 1 servidor e o `.mcp.json` da pasta tinha 1 — enquanto o CLI listava 11. Os outros 9 são
//      conectores da CONTA no claude.ai e não moram em arquivo nenhum desta máquina. Uma tela feita por
//      leitura de arquivo mostraria 2 de 11 e pareceria certa.
//   3. O MCP nativo do editor  ❌ é OUTRO conjunto. O núcleo tem a maquinaria inteira (29 comandos
//      `workbench.mcp.*`, inclusive reiniciar servidor), mas ela serve ao chat DO EDITOR, que a OFICINA
//      não usa — a conversa é a extensão oficial do Claude desde a V23. Medido: não existe `mcp.json` no
//      perfil da OFICINA, ou seja, a lista nativa está VAZIA. E a extensão oficial (2.1.278) não tem
//      nenhum comando de MCP entre os 31 dela.
//
// ⚠️ E o `.jsonl` da sessão também foi descartado por medição: ele NÃO registra o estado dos MCPs.
//
// ⚠️ SÃO DOIS `claude.exe` NESTA MÁQUINA, e eles foram COMPARADOS (24/09/2026, achado de um revisor
// independente que perguntou se a tela mede o mesmo Claude que responde à pessoa): o embutido no
// produto (2.1.261) e o que vem na extensão oficial (2.1.278). Medidos lado a lado: **mesma conta**
// (mesmo e-mail, mesmo `orgId`, mesma pasta de projetos) e **lista de MCPs byte a byte idêntica**.
// Compartilham o mesmo estado — a tela mede o mesmo Claude que conversa com ela.
//
// ⚠️ O ESTADO É LIDO, NUNCA INFERIDO. Esta é a lição que o mostrador de tokens da V24 pagou: `0` e
// `não consegui medir` não são a mesma coisa. Aqui, um estado que não case com nenhum texto conhecido
// vira `desconhecido` COM O TEXTO CRU JUNTO — nunca "desconectado". E quando o comando falha inteiro,
// quem chama recebe um erro, não uma lista vazia.
//
// ⚠️ NÃO HÁ SAÍDA EM JSON. Medido: `claude mcp list --json` responde `error: unknown option '--json'`
// (e `mcp get` também). Então o texto é a interface, e o parse dela é este arquivo. Por isso o estado é
// reconhecido pela PALAVRA e não pelo símbolo: o `✔`/`✗` que o CLI imprime vem de uma biblioteca que
// troca para `√`/`×` em terminal sem unicode, e um dia essa troca chegaria aqui sem avisar.
//
// ⛔ E POR ISSO ESTE ARQUIVO TRATA A SAÍDA DO CLI COMO ENTRADA NÃO CONFIÁVEL. O nome de um servidor
// vem de um `.mcp.json` que qualquer pasta aberta pode trazer, e o CLI o imprime CRU — inclusive com
// quebra de linha dentro. Um revisor independente provou, com o CLI de verdade, que isso quebrava
// duas coisas aqui (24/09/2026, antes do build):
//
//   1. **laço infinito**, e com ele o editor inteiro travado. `"…".lastIndexOf(s, -1)` em JavaScript
//      NÃO devolve `-1`: a posição negativa vira `0`. O laço que procurava o corte do estado da
//      direita para a esquerda, ao chegar em `i = 0` sem achar, pedia `lastIndexOf(' - ', -1)`,
//      recebia `0` de novo, e nunca saía. Bastava abrir uma pasta preparada e clicar no ícone novo.
//   2. **linha forjada**: um nome com `\n` no meio faz o CLI imprimir DUAS linhas, e a primeira pode
//      ser um servidor inventado, com estado "conectado" e tudo. Não há delimitador na saída que
//      permita separar isso — então o que se pode fazer é DIZER (ver `avisoDePastaAdulterada`) e não
//      deixar a vista quebrar por id repetido (ver `analisarLista`, que descarta nome repetido).

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

/** Teto de paciência do `mcp list`: ele CONECTA em cada servidor. Medido: 11 servidores em 5,4 s. */
const TETO_DA_LISTA_MS = 60000
/** O `auth status` é local: ele lê a credencial desta máquina e responde. Medido: 340 ms. */
const TETO_CURTO_MS = 20000
/**
 * ⚠️ O `mcp get` NÃO é local, e o comentário daqui já dizia que era. Medido em 24/09/2026, depois de
 * um revisor independente cronometrar os dois: `auth status` = 317 ms · `mcp get "claude.ai Gmail"`
 * = **1917 ms**. A ajuda do próprio CLI explica ("approved servers are health-checked"): ele conecta
 * no servidor, como a lista. Por isso a paciência dele é a da lista — e por isso este comentário
 * existe, para a próxima "limpeza" não trocar isto pelo teto curto e cortar a ficha de um servidor
 * lento pela metade.
 */
const TETO_DO_DETALHE_MS = TETO_DA_LISTA_MS

/**
 * O que o CLI sabe dizer, lido do binário 2.1.261 em 24/09/2026 (não da documentação).
 *
 * `casar` bate no texto do estado JÁ SEM o símbolo da frente. A ordem importa: `Connected · tools fetch
 * failed` vem antes de `Connected`, senão o mais curto engoliria o mais longo.
 *
 * `acao` é o que o CLI de fato oferece para aquele estado — e `null` quer dizer *não há o que fazer*,
 * que é uma resposta honesta. Botão que finge é pior que botão nenhum.
 *
 * `comoDesfazer` é a frase que a tela mostra quando NÃO há botão: o caminho existe, só não é aqui.
 * Sem ela, a pessoa fica num beco — foi o que um revisor independente chamou de "o pedido dele não
 * foi cumprido e ninguém avisa".
 */
const ESTADOS = [
  {
    chave: 'semFerramentas',
    casar: /^Connected\s*[·.]\s*tools fetch failed/i,
    // ⚠️ O rótulo NÃO começa com "conectado", de propósito: este estado conta como pendência no
    // resumo, e um rótulo começando com "conectado" fazia a lista contradizer o próprio título
    // ("10/11 conectados" com 11 linhas dizendo "conectado").
    rotulo: 'respondeu, mas não listou as ferramentas',
    icone: 'warning', cor: 'atencao', acao: 'detalhe',
    comoDesfazer: 'O servidor atendeu, mas não disse quais ferramentas tem. Ver a ficha mostra o erro que ele devolveu.',
  },
  {
    chave: 'conectado',
    casar: /^Connected$/i,
    rotulo: 'conectado',
    icone: 'pass-filled', cor: 'bom', acao: null,
    comoDesfazer: 'Está tudo certo com este. Para forçar uma nova tentativa de conexão, use "Conectar de novo em todos", no alto da vista.',
  },
  {
    chave: 'precisaEntrar',
    casar: /^Needs authentication/i,
    rotulo: 'precisa entrar',
    icone: 'key', cor: 'atencao', acao: 'entrar',
    comoDesfazer: 'Entrar abre um terminal com o Claude, que leva você ao site do serviço para autorizar.',
  },
  {
    chave: 'naoConectou',
    casar: /^Failed to connect/i,
    rotulo: 'não conectou',
    icone: 'error', cor: 'ruim', acao: 'detalhe',
    comoDesfazer: 'Não há botão que conserte isto: o motivo está na ficha, e costuma ser do lado do servidor (fora do ar, endereço errado, sem internet). "Conectar de novo em todos" tenta outra vez.',
  },
  {
    chave: 'aguardandoAprovacao',
    casar: /^Pending approval/i,
    rotulo: 'à espera da sua aprovação',
    icone: 'debug-pause', cor: 'atencao', acao: 'aprovar',
    comoDesfazer: 'Este veio no arquivo .mcp.json da pasta aberta. Quem aprova é a conversa, não esta tela.',
  },
  {
    chave: 'recusado',
    casar: /^Rejected/i,
    // ⚠️ Era "recusado nas configurações", e mandava a pessoa para uma tela que não tem nada sobre
    // isto. O estado nasce de ela ter respondido NÃO ao pedido de aprovação, na conversa.
    rotulo: 'você recusou este',
    icone: 'circle-slash', cor: 'ruim', acao: 'detalhe',
    comoDesfazer: 'Você respondeu "não" ao pedido de aprovação deste servidor. Para poder decidir de novo, o Claude tem o comando `claude mcp reset-project-choices`, que limpa as respostas desta pasta.',
  },
  {
    chave: 'desligado',
    casar: /^Disabled for this project/i,
    rotulo: 'desligado nesta pasta',
    icone: 'circle-slash', cor: 'ruim', acao: 'detalhe',
    comoDesfazer: 'Ele está desligado só nesta pasta. Quem religa é a conversa, pelo comando /mcp.',
  },
  {
    chave: 'semEndereco',
    casar: /^Not configured/i,
    // ⚠️ Era "sem endereço configurado", que presume que todo servidor é uma URL. Servidor local é
    // um COMANDO, não um endereço.
    rotulo: 'falta configurar',
    icone: 'circle-slash', cor: 'ruim', acao: 'detalhe',
    comoDesfazer: 'Falta dizer ao Claude onde este servidor fica. Tentar de novo não resolve: ele precisa ser configurado primeiro.',
  },
]

/** O que aparece na frente do estado e não é o estado. Sai antes de comparar. */
const SIMBOLOS = /^[✔✓√✖✗×❌⏸⊘⚠!\-*\s]+/

/**
 * ⚠️ O NOME VAI VIRAR ARGUMENTO DE PROCESSO. Nada daqui é executado por interpretador de comando
 * (sempre `execFile`/`shellArgs` com LISTA de argumentos, nunca uma linha de texto), e mesmo assim o
 * nome é conferido.
 *
 * ⛔ ELA NASCEU LARGA DEMAIS DE UM LADO E ESTREITA DEMAIS DO OUTRO (achado de um revisor
 * independente, 24/09/2026). A primeira versão era uma lista branca de caracteres ASCII, e o efeito
 * era pior que o risco que ela evitava: um servidor chamado `Conexões da Equipe` ou
 * `gptmaker (produção)` APARECIA na lista e os botões dele não faziam nada, **em silêncio** —
 * exatamente o "botão que finge" que este produto existe para não ter. E, do outro lado, ela
 * deixava passar `PWN:  - nada`, que era o nome que travava o parser.
 *
 * O que vale agora: recusa-se o que é perigoso de carregar adiante — caractere de controle, quebra
 * de linha, aspas, nome vazio, com espaço nas pontas ou longo demais — e aceita-se o resto, acento e
 * parêntese inclusive. E quem não passa daqui NÃO some da tela: aparece com o aviso de que não dá
 * para agir nele, e por quê.
 */
const PROIBIDO_NO_NOME = /[\u0000-\u001F\u007F"'`]/
const NOME_VALIDO = nome =>
  typeof nome === 'string' && nome.length > 0 && nome.length <= 120 &&
  nome === nome.trim() && !PROIBIDO_NO_NOME.test(nome) &&
  // ⚠️ Não pode COMEÇAR COM TRAÇO. Não é injeção — é que o CLI leria `-rf` como opção dele, e não
  // como o nome do servidor. A regra antiga garantia isso de raspão, por exigir letra ou número na
  // primeira posição; ao alargar a regra (para deixar acento passar), esta parte precisou virar
  // linha própria, senão o alargamento levava junto uma garantia que ninguém tinha notado.
  !nome.startsWith('-')

/** O aviso que substitui a ação quando o nome não pode virar argumento. */
const AVISO_DO_NOME = 'não consigo agir neste: o nome tem caractere que eu não sei levar ao Claude com segurança'

/**
 * Linhas que o CLI imprime e não são servidor.
 *
 * ⚠️ `No MCP servers configured` NÃO é ruído qualquer: é a ÚNICA prova de que a lista está vazia
 * porque não há servidor — e não porque o formato mudou e eu descartei tudo. Por isso ela é
 * reconhecida à parte: é ela que autoriza a tela a afirmar o negativo, e sem ela a tela diz que não
 * entendeu, em vez de dizer que não há nada.
 */
const DISSE_QUE_NAO_HA = /^No MCP servers configured/i
const RUIDO = [
  /^Checking MCP server health/i,
  DISSE_QUE_NAO_HA,
  /^$/,
]

function ehRuido(linha) {
  return RUIDO.some(r => r.test(linha.trim()))
}

/** O estado conhecido que casa com este texto, ou `null`. */
function reconhecerEstado(texto) {
  const limpo = String(texto || '').replace(SIMBOLOS, '').trim()
  for (const e of ESTADOS) if (e.casar.test(limpo)) return e
  return null
}

/**
 * Onde cortar o estado, da direita para a esquerda — a primeira posição que produz um estado
 * conhecido. Devolve `-1` quando nenhuma produz.
 *
 * ⛔ ESTE LAÇO JÁ TRAVOU O EDITOR INTEIRO. Escrito como `for (…; i >= 0; i = resto.lastIndexOf(sep,
 * i - 1))`, ele nunca terminava quando o separador estava na posição 0 e o fim não era reconhecível:
 * `lastIndexOf(sep, -1)` devolve `0`, não `-1`. Agora a busca anda para trás por índice explícito e
 * tem parada em `i === 0` — e há teste com a linha exata que travava.
 */
function ondeCortarOEstado(resto, separador = ' - ') {
  let i = resto.lastIndexOf(separador)
  while (i >= 0) {
    if (reconhecerEstado(resto.slice(i + separador.length))) return i
    if (i === 0) return -1
    i = resto.lastIndexOf(separador, i - 1)
  }
  return -1
}

/**
 * Uma linha do `mcp list` virada em item, ou `null` se não for linha de servidor.
 *
 * A forma é `nome: alvo - estado`. As três partes têm armadilha:
 *   - o NOME pode ter `: ` dentro? Não: o CLI corta no primeiro, e é o que se faz aqui;
 *   - o ALVO pode ter ` - ` dentro (um comando com argumentos), então o corte do estado é feito na
 *     última posição que produz um estado RECONHECÍVEL — não na última posição, simplesmente;
 *   - o ESTADO pode trazer motivo junto (`Failed to connect: <motivo>`), guardado em `detalhe`.
 */
function analisarLinha(linha) {
  const texto = String(linha || '').replace(/\r$/, '')
  if (ehRuido(texto)) return null
  const doisPontos = texto.indexOf(': ')
  if (doisPontos < 1) return null
  const nome = texto.slice(0, doisPontos).trim()
  const resto = texto.slice(doisPontos + 2)

  /*
    ⛔ SEM ` - `, NÃO É LINHA DE SERVIDOR — e esta guarda existe por um achado, não por precaução.

    A versão anterior aceitava como servidor QUALQUER linha com `': '`. Um revisor independente
    apontou que a própria saída de erro do CLI tem essa forma, e provou com a string que este mesmo
    arquivo cita no cabeçalho: `error: unknown option '--json'` virava um servidor chamado **error**,
    e o título da vista anunciava "0/1 conectados · 1 com pendência". O programa inventava uma
    conexão a partir de uma mensagem de erro — e no dia em que o `mcp list` mudasse de flag, a tela
    mostraria "1 servidor com pendência" em vez de "não entendi a resposta".

    A forma do CLI é `nome: alvo - estado`. Sem o separador do estado, a linha não é servidor: vira
    "não entendida" e a tela DIZ isso. O estado ainda pode ser desconhecido (versão nova do Claude) —
    isso continua virando item, porque ali o formato foi respeitado.
  */
  if (resto.lastIndexOf(' - ') < 0) return null

  const corte = ondeCortarOEstado(resto)
  const estado = corte >= 0 ? reconhecerEstado(resto.slice(corte + 3)) : null

  let item
  if (!estado) {
    // Nenhum estado conhecido: o último ` - ` ainda separa alvo de estado, e o texto cru é preservado.
    const i = resto.lastIndexOf(' - ')
    const cru = i >= 0 ? resto.slice(i + 3).trim() : ''
    item = {
      nome,
      alvo: (i >= 0 ? resto.slice(0, i) : resto).trim(),
      estado: 'desconhecido',
      rotulo: cru || 'não entendi o que o Claude respondeu',
      detalhe: cru,
      icone: 'question', cor: 'atencao', acao: 'detalhe',
      comoDesfazer: 'O Claude respondeu uma situação que este programa ainda não conhece. A ficha mostra o texto dele, sem tradução.',
      cru: texto,
    }
  } else {
    const textoDoEstado = resto.slice(corte + 3).replace(SIMBOLOS, '').trim()
    const motivo = textoDoEstado.replace(estado.casar, '').replace(/^\s*[:\-—]\s*/, '').trim()
    item = {
      nome,
      alvo: resto.slice(0, corte).trim(),
      estado: estado.chave,
      rotulo: estado.rotulo,
      detalhe: motivo,
      icone: estado.icone,
      cor: estado.cor,
      acao: estado.acao,
      comoDesfazer: estado.comoDesfazer,
      cru: texto,
    }
  }

  // ⚠️ A validação do nome acontece AQUI, na hora de montar o item — e não só na hora de agir. Era
  // essa distância que produzia a linha que aparece e não responde a clique nenhum.
  item.podeAgir = NOME_VALIDO(item.nome)
  if (!item.podeAgir) {
    item.acao = null
    item.aviso = AVISO_DO_NOME
  }
  return item
}

/**
 * A saída inteira do `mcp list` virada em lista, na ordem em que o CLI a deu.
 *
 * ⚠️ NOME REPETIDO É DESCARTADO, e o descarte é contado. Não é capricho: a vista dá a cada item um id
 * derivado do nome, e id repetido faz o TreeView do editor recusar a árvore inteira. Um `.mcp.json`
 * com quebra de linha no nome consegue produzir duas linhas com o mesmo nome — então isto é uma
 * defesa, não uma arrumação.
 */
function analisarLista(saida) {
  const vistos = new Set()
  const itens = []
  for (const linha of String(saida || '').split('\n')) {
    const item = analisarLinha(linha)
    if (!item) continue
    if (vistos.has(item.nome)) continue
    vistos.add(item.nome)
    itens.push(item)
  }
  return itens
}

/**
 * A leitura completa de uma saída: o que entendi, o que NÃO entendi, e se o CLI disse que não há nada.
 *
 * ⛔ AS DUAS LISTAS VAZIAS NÃO SÃO A MESMA COISA, e era essa a confusão que um revisor independente
 * achou: "não há servidor" e "o formato mudou e eu descartei tudo" produziam a mesma tela. Agora,
 * afirmar que não há nada exige a frase do próprio CLI (`No MCP servers configured`); sem ela, o
 * programa diz que não entendeu — que é o que de fato aconteceu.
 */
function lerSaida(saida) {
  const texto = String(saida || '')
  const linhas = texto.split('\n').map(l => l.replace(/\r$/, ''))
  const itens = analisarLista(texto)
  const naoEntendidas = linhas.filter(l => l.trim() && !ehRuido(l) && !analisarLinha(l))
  // ⚠️ Conta por DIFERENÇA, e não comparando objetos: `analisarLinha` devolve um objeto novo a cada
  // chamada, então `itens.includes(…)` nunca reconheceria o item — e o contador acusava repetidas
  // que não existiam. Quem sabe quantas sobraram é a subtração.
  const quantasViraramLinha = linhas.filter(l => !!analisarLinha(l)).length
  return {
    itens,
    naoEntendidas,
    repetidas: quantasViraramLinha - itens.length,
    disseQueNaoHa: linhas.some(l => DISSE_QUE_NAO_HA.test(l.trim())),
  }
}

/** Quantos em cada estado — o resumo que vai para o título da vista. */
function resumir(itens) {
  const conta = { total: itens.length, conectados: 0, atencao: 0, parados: 0 }
  for (const i of itens) {
    if (i.estado === 'conectado') conta.conectados++
    else if (i.estado === 'precisaEntrar' || i.estado === 'aguardandoAprovacao' || i.estado === 'semFerramentas' || i.estado === 'desconhecido') conta.atencao++
    else conta.parados++
  }
  return conta
}

function nomeValido(nome) {
  return NOME_VALIDO(nome)
}

/**
 * Roda o CLI com uma LISTA de argumentos (nunca uma linha de comando).
 *
 * Devolve `{ texto, completo, motivo }`.
 *
 * ⛔ `completo: false` EXISTE PORQUE A FALHA PERIGOSA É A PARCIAL, não a total. Um revisor
 * independente provou os dois casos: (1) o teto de tempo estourando depois de o CLI ter impresso
 * parte da lista, e (2) a saída passando do `maxBuffer`. Nos dois, a versão anterior devolvia o
 * pedaço **como se fosse a lista inteira** — e a tela escrevia "2/2 conectados" faltando servidor.
 * É o mesmo erro do mostrador de tokens da V24, com outra roupa: faltava o estado "medi só um
 * pedaço".
 */
function rodar(exe, args, { cwd, teto = TETO_CURTO_MS, ambiente = process.env } = {}) {
  return new Promise((resolve, reject) => {
    if (!exe) return reject(new Error('não achei o programa do Claude nesta instalação'))
    execFile(exe, args, { cwd: cwd || undefined, timeout: teto, maxBuffer: 4 * 1024 * 1024, env: ambiente, windowsHide: true },
      (erro, saida, erroPadrao) => {
        const texto = String(saida || '') + (erroPadrao ? '\n' + String(erroPadrao) : '')
        if (!erro) return resolve({ texto, completo: true, motivo: '' })
        // ⚠️ Código de saída diferente de zero NÃO é motivo para jogar a saída fora: o `mcp list` tem
        // servidor quebrado e continua listando. Só é erro quando não veio texto aproveitável.
        if (!String(saida || '').trim()) {
          const motivo = erro.killed ? `o Claude não respondeu em ${Math.round(teto / 1000)} s` : (erro.message || String(erro))
          return reject(new Error(motivo))
        }
        const truncou = erro.killed || erro.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || /maxBuffer/i.test(erro.message || '')
        resolve({
          texto,
          completo: !truncou,
          motivo: truncou
            ? (erro.killed
              ? `o Claude ainda estava respondendo quando o tempo acabou (${Math.round(teto / 1000)} s)`
              : 'a resposta do Claude foi maior do que eu consigo ler de uma vez')
            : '',
        })
      })
  })
}

/**
 * A lista de MCPs desta pasta, medida agora.
 *
 * Erro sobe como erro — quem desenha precisa poder dizer *"não consegui medir"*, que é diferente de
 * *"não há nenhum"* e MUITO diferente de *"estão desconectados"*. E `completo: false` sobe junto, que
 * é a terceira coisa: *"medi só um pedaço"*.
 */
async function lerLista({ exe, cwd, teto = TETO_DA_LISTA_MS, rodarComando = rodar } = {}) {
  const r = await rodarComando(exe, ['mcp', 'list'], { cwd, teto })
  const saida = typeof r === 'string' ? { texto: r, completo: true, motivo: '' } : r
  const leitura = lerSaida(saida.texto)
  return {
    ...leitura,
    completo: saida.completo !== false,
    motivoDoCorte: saida.motivo || '',
    lidoEm: Date.now(),
    cru: saida.texto,
  }
}

/** O detalhe de um servidor (`mcp get`), em texto cru — é o que o CLI dá, e não se inventa forma. */
async function lerDetalhe(nome, { exe, cwd, teto = TETO_DO_DETALHE_MS, rodarComando = rodar } = {}) {
  if (!nomeValido(nome)) throw new Error(AVISO_DO_NOME)
  const r = await rodarComando(exe, ['mcp', 'get', nome], { cwd, teto })
  return typeof r === 'string' ? r : r.texto
}

/** Os argumentos de "entrar neste servidor" — para quem for abrir um terminal com eles. */
function argumentosParaEntrar(nome) {
  return nomeValido(nome) ? ['mcp', 'login', nome] : null
}

/**
 * A pasta aberta tem um `.mcp.json` com nome de servidor capaz de FORJAR linha na saída do CLI?
 *
 * ⛔ Esta é a única defesa possível contra o achado 2 do revisor de segurança, e ela é honesta sobre
 * o que faz: a saída do `mcp list` é texto sem delimitador, o CLI imprime o nome cru, e um nome com
 * quebra de linha vira uma linha inteira inventada — com estado "conectado" e tudo. Não dá para
 * distinguir a linha forjada da verdadeira DEPOIS que ela foi impressa. O que dá é olhar a fonte:
 * se o `.mcp.json` desta pasta tem nome com caractere de controle, a lista abaixo não é confiável, e
 * a tela DIZ isso em vez de mostrar um verde que pode ser mentira.
 *
 * Devolve `null` quando não há nada a dizer (sem pasta, sem arquivo, arquivo ilegível ou nomes
 * limpos). Arquivo ilegível não vira alarme: não saber não é o mesmo que achar.
 */
function avisoDePastaAdulterada(cwd, lerArquivo = p => fs.readFileSync(p, 'utf8')) {
  for (const arquivo of arquivosDeProjeto(cwd)) {
    let dados
    try {
      dados = JSON.parse(lerArquivo(arquivo))
    } catch {
      continue   // não existe, ou não dá para ler: não saber não é o mesmo que achar
    }
    const servidores = dados && typeof dados === 'object' ? dados.mcpServers : null
    if (!servidores || typeof servidores !== 'object') continue
    const suspeitos = Object.keys(servidores).filter(n => /[\u0000-\u001F\u007F]/.test(n))
    if (!suspeitos.length) continue
    return `O arquivo ${arquivo} tem ${suspeitos.length === 1 ? 'um servidor com nome' : `${suspeitos.length} servidores com nomes`} fora do comum (há quebra de linha dentro do nome). Isso consegue INVENTAR linhas nesta lista, inclusive uma que diga "conectado". Não confie no que está abaixo até conferir esse arquivo.`
  }
  return null
}

/**
 * Os `.mcp.json` que valem para esta pasta: o dela e o de cada pasta acima, até a raiz.
 *
 * ⚠️ MEDIDO, e desmentiu o que eu tinha escrito. Um revisor independente cronometrou o CLI em duas
 * pastas: dentro do projeto vinham **11** servidores, numa pasta temporária vinham **10** — e o
 * `.mcp.json` que traz o servidor faltante está **dois níveis acima** da pasta aberta. Ou seja: o
 * Claude SOBE a árvore, e a frase "veio no .mcp.json desta pasta" era falsa. Quem procura o arquivo
 * para conferir precisa procurar onde ele realmente pode estar.
 */
function arquivosDeProjeto(cwd) {
  if (!cwd) return []
  const lista = []
  let atual = path.resolve(cwd)
  for (let i = 0; i < 40; i++) {
    lista.push(path.join(atual, '.mcp.json'))
    const pai = path.dirname(atual)
    if (pai === atual) break
    atual = pai
  }
  return lista
}

module.exports = {
  ESTADOS, NOME_VALIDO, AVISO_DO_NOME, DISSE_QUE_NAO_HA,
  TETO_DA_LISTA_MS, TETO_CURTO_MS, TETO_DO_DETALHE_MS,
  analisarLinha, analisarLista, lerSaida, ondeCortarOEstado, reconhecerEstado, resumir, nomeValido,
  rodar, lerLista, lerDetalhe, argumentosParaEntrar, avisoDePastaAdulterada, arquivosDeProjeto,
}
