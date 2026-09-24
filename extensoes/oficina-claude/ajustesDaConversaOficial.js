// OS AJUSTES NA CONVERSA DA EXTENSÃO OFICIAL (V20) — o grupo de risco, e ele sabe que é.
//
// ⚠️ ISTO ESCREVE NUM ARQUIVO DE OUTRA EXTENSÃO. Não há jeito bonito: ele decidiu que a conversa
// da OFICINA passa a ser a da extensão oficial (t187), e pediu mudanças na tela DELA — o `+` da
// caixa de escrever (t194) e a caixa mais perto do fundo (t200). Aquela tela é uma webview dela:
// não tem configuração, não tem comando e não tem tema que alcance. O que existe é o CSS dela.
//
// ⚠️ O CUSTO, DECLARADO ANTES DE ELE MANDAR FAZER: a extensão é baixada da Open VSX a cada build,
// então o ajuste se refaz sempre; e quando ela atualizar, o ajuste pode simplesmente deixar de
// valer. Por isso ele é:
//   - IDEMPOTENTE e MARCADO (um bloco com marca de início e fim: reaplicar não duplica);
//   - SILENCIOSO no erro (sem permissão, sem arquivo, pacote diferente → não faz nada e anota);
//   - MÍNIMO (dois seletores; quanto menos, menos superfície para quebrar).
//
// ⚠️ POR QUE POR `title`, E NÃO POR CLASSE. Medido no pacote instalado: as classes da webview
// carregam HASH DE BUILD (`.footerButton_gGYT1w`, `.attachedFilesContainer_cKsPxg`) — elas mudam
// quando ela recompila, mesmo sem mudar nada na tela. Já os `title` são o texto que a pessoa lê
// ("Add files or folders to the conversation") e só mudam se a própria frase mudar. Entre os dois,
// o texto é a âncora menos frágil — e é a diferença entre "quebra em toda versão" e "quebra quando
// eles mudarem o rótulo".
//
// ⚠️ O QUE NÃO ESTÁ AQUI, E POR QUÊ: o nome da sessão numa segunda linha (`t192`) e a redução do
// seletor de modos a dois itens (parte do `t189`) NÃO têm âncora estável — o primeiro sai de
// `$.summary.value || "Untitled"` dentro de um componente sem `title` nem `aria-label` próprios, e
// o segundo é lista montada em JavaScript. Esconder por posição ("o primeiro filho de") acertaria
// hoje e erraria calado amanhã, escondendo outra coisa. Ficam por fazer, declarados.

'use strict'

const fs = require('fs')
const path = require('path')

const MARCA_INICIO = '/* === OFICINA V20: inicio dos ajustes (nao editar a mao) === */'
const MARCA_FIM = '/* === OFICINA V20: fim dos ajustes === */'

/** O identificador da extensão cuja tela ajustamos. */
const EXTENSAO = 'anthropic.claude-code'

/*
  ⚠️ O TITULO CERTO E "Add", E ISTO FOI PAGO.

  A primeira versao ancorou o seletor na frase longa que aparece no menu de anexos. A frase existe
  no pacote, mas como titulo de um ITEM DE DENTRO do menu que o "+" abre - nao do botao. A regra
  escondia a linha do menu e deixava o "+" exatamente onde estava: piorava a extensao sem atender o
  pedido. E o comentario ainda dizia "medido", quando o que houve foi um grep pela string.

  Medido de verdade no bundle da versao instalada:
    D("button",{ref:z,type:"button",className:U,title:"Add",onClick:...})      <- o "+"
    q.push({id:"files",label:"Add context",title:"&lt;a frase longa&gt;",...})       <- item do menu

  E `title:"Add"` e UNICO no bundle, entao o seletor nao pega outro botao por engano. O teste
  `ajustes_da_conversa_oficial.mjs` agora confere as duas coisas CONTRA O PACOTE, e fica vermelho
  quando a ancora sumir.

  ⚠️ A EXPLICACAO MORA AQUI FORA, e nao dentro da string do CSS, de proposito: o criterio que
  procura as ancoras le a string inteira, e uma frase citada num comentario dentro dela seria lida
  como se fosse seletor. Foi o que aconteceu na primeira tentativa de consertar isto.
*/
const CSS = `
/* t194 - ele: "nao quero esses itens aqui na barrinha do claude" (o "+" da caixa de escrever). */
button[title="Add"] { display: none !important; }

/* t192 - ele: "isso eu nao quero que apareca, o nome da sessao deve ser [na aba], nao numa
   segunda linha abaixo". E o bloco do titulo no cabecalho da conversa (o "Untitled" e o relogio).
   Esconde-se o GRUPO DO TITULO, e nao o cabecalho inteiro: o cabecalho carrega outros controles,
   e tirar funcao que ele nao pediu e a mesma classe de defeito que fez o patch 0019 existir. */
[class*="titleGroup_"] { display: none !important; }

/* t200 - ele: "tem como esse bloco de digitacao do chat ficar praticamente mas nao literalmente
   grudado no fundo?". MEDIDO E PROVADO POR EXPERIMENTO na webview montada (22/09/2026): o bloco
   e position:absolute com bottom:16px; zerar o bottom levou o vao a 0, e mexer no padding do pai
   nao muda nada. 4px e "praticamente, mas nao literalmente". */
[class*="chatContainer_"] > [class*="inputContainer_"] { bottom: 4px !important; }
`

/*
  ⚠️ t200 - NAO ESTA AQUI, E ISSO E DE PROPOSITO.

  Pedido: "tem como esse bloco de digitacao do chat ficar praticamente mas nao literalmente grudado
  no fundo?". A primeira versao respondeu com
      *:has(> [aria-label="Message input"]) { margin-bottom: 4px !important; }
  e estava errada de duas formas: o seletor resolve para `.messageInputContainer`, que e um container
  INTERNO (irmao de cima da barrinha com o "+", o modelo e o enviar), e a regra ADICIONA 4px ali -
  ou seja, afastava a caixa da propria barrinha e deixava a caixa mais alta, em vez de aproximar o
  bloco do fundo da janela. O vao que ele reclama vem de um ancestral que ninguem mediu.

  Nao da para acertar isto lendo o bundle: e questao de PIXEL numa tela montada. O caminho honesto e
  medir na webview aberta (o vao real entre o rodape do bloco e o fundo, e qual regra o produz) e so
  entao escolher o alvo - o que exige o programa compilado. Fica para a rodada de revisores SOBRE O
  BUILD, declarado como nao feito, em vez de entrar uma regra que erra o alvo em silencio.
*/

/*
  ⚠️ POR QUE `[class*="nome_"]`, E POR QUE ISSO DESTRAVOU TRES PEDIDOS.

  As classes da webview dela carregam HASH DE BUILD: `header_aqhumA`, `inputContainer_07S1Yg`,
  `menuItemV2_8RAulQ`. Ate 21/09/2026 isso foi lido como "sem ancora estavel", e `t192`, `t200` e
  "so bypass e plan" ficaram parados por causa dessa leitura.

  Mas o que muda a cada build e o SUFIXO, nao o nome. `[class*="titleGroup_"]` casa com
  `titleGroup_aqhumA` e com qualquer hash que venha depois. O nome-base e semantico (quem escreveu
  a tela chamou aquilo de "titleGroup") e so muda se eles renomearem o componente — o mesmo grau
  de risco do `title="Add"` que ja estava em uso, e muito menor do que casar com o hash.

  ⚠️ O QUE ESTA ANCORA NAO RESOLVE, e por isso existe a funcao abaixo: CSS nao seleciona por
  texto. Os cinco modos do menu sao `<button class="menuItemV2_...">` IGUAIS entre si — o que
  distingue "Plan" de "Auto" e o texto dentro. Esconder por posicao fixa acertaria hoje e erraria
  calado amanha, que e exatamente o erro que este arquivo ja documentava como inaceitavel.
*/

/** Os modos que FICAM na tela (t189). Ordem nao importa aqui: quem manda e a ordem do pacote. */
const MODOS_QUE_FICAM = ['plan', 'bypassPermissions']

/**
 * O CSS que reduz o seletor de modos a "so bypass e plan" — COM A POSICAO DERIVADA DO PACOTE,
 * nunca escrita a mao.
 *
 * ⚠️ COMO, e por que isto nao e chute. O bundle da webview declara a tabela dos modos em ordem,
 * com as chaves visiveis (medido na 2.1.278, lendo o pacote):
 *
 *   dontAsk:{...label:"Don't ask"...}, default:{...label:"Manual"...},
 *   acceptEdits:{...label:"Edit automatically"...}, plan:{...label:"Plan"...},
 *   auto:{...label:"Auto"...}, bypassPermissions:{...label:"Bypass permissions"...}
 *
 * E o menu desenha essa MESMA ordem, pulando `dontAsk` — medido na tela, com a conversa montada e
 * logada: Manual, Edit automatically, Plan, Auto, Bypass permissions, precedidos de um
 * `menuHeader`. Entao a posicao de cada modo e DEDUZIVEL; se eles reordenarem a tabela numa versao
 * nova, a deducao acompanha sozinha.
 *
 * ⚠️ E SE O FORMATO MUDAR, NAO SE ESCREVE NADA. Devolver vazio deixa os cinco modos na tela —
 * feio, e honesto. Escrever um `nth-child` chutado esconderia o modo ERRADO em silencio, que e
 * pior do que nao fazer: ele perderia o "plan" sem entender por que.
 */
function cssDosModos(pastaDaExtensaoOficial, { ler = fs.readFileSync } = {}) {
  if (!pastaDaExtensaoOficial) return ''
  let bundle
  try { bundle = String(ler(path.join(pastaDaExtensaoOficial, 'webview', 'index.js'), 'utf8')) }
  catch { return '' }

  // As chaves da tabela, na ordem em que aparecem. O `icon:` e o `label:` no MESMO objeto sao o
  // que prova que aquilo e a tabela dos modos, e nao outra coisa com nome parecido no bundle.
  const ordem = []
  // ⚠️ NADA de [^}] ENTRE `icon:` e `label:`. A primeira versao usou isso e derivou ZERO modos:
  // entre os dois campos ha `icon:F(Ke,{})`, com chave de fechar dentro. O mecanismo se comportou
  // (vazio = nao escreve nada, em vez de chutar posicao), mas o pedido nao saia. O teto de 300
  // caracteres e o que impede a busca de atravessar objetos vizinhos e casar rotulo de outro.
  const re = /([A-Za-z]+):\{icon:[\s\S]{0,300}?label:"([^"]+)"/g
  let m
  while ((m = re.exec(bundle)) !== null) {
    if (!ordem.some(o => o.chave === m[1])) ordem.push({ chave: m[1], rotulo: m[2] })
  }

  // A conferencia antes de derivar: sem os modos que ele nomeou, nao ha o que fazer.
  const temTodos = MODOS_QUE_FICAM.every(c => ordem.some(o => o.chave === c))
  const noMenu = ordem.filter(o => o.chave !== 'dontAsk')
  if (!temTodos || noMenu.length < 3) return ''

  const OFFSET_DO_CABECALHO = 1 // o primeiro filho do popup e o `menuHeader`, nao um modo
  const esconder = noMenu
    .map((o, i) => ({ ...o, nth: i + 1 + OFFSET_DO_CABECALHO }))
    .filter(o => !MODOS_QUE_FICAM.includes(o.chave))
  if (!esconder.length) return ''

  const comentario = esconder.map(o => o.nth + '=' + o.rotulo).join(', ')
  return [
    '',
    '/* t189 - ele: "eu quero so o modo bypass e plan, e o bypass por padrao".',
    '   Posicoes DERIVADAS do pacote (' + comentario + '); ficam: ' + MODOS_QUE_FICAM.join(', ') + '. */',
    ...esconder.map(o =>
      '[class*="menuPopup_"] > [class*="menuItemV2_"]:nth-child(' + o.nth + ') { display: none !important; }'),
    ''
  ].join('\n')
}

/** Tudo o que vai para o arquivo dela: a parte fixa mais a parte derivada do pacote. */
function cssCompleto(pastaDaExtensaoOficial, deps) {
  return (CSS.trim() + '\n' + cssDosModos(pastaDaExtensaoOficial, deps)).trim()
}

/**
 * Grava por temporário + renomeação. Se a renomeação falhar, o temporário é removido — um `.tmp`
 * esquecido dentro do pacote de outra extensão é sujeira nossa em casa alheia.
 */
function escreverAtomico(alvo, texto, { escrever = fs.writeFileSync, renomear = fs.renameSync, remover = fs.unlinkSync } = {}) {
  const temporario = alvo + '.oficina-tmp'
  escrever(temporario, texto, 'utf8')
  try { renomear(temporario, alvo) }
  catch (e) { try { remover(temporario) } catch { /* já não está lá: nada a fazer */ } throw e }
}

/** A pasta da extensão oficial instalada, ou `null`. */
function pastaDaExtensao(vscode) {
  try {
    const e = vscode.extensions.getExtension(EXTENSAO)
    return e && e.extensionPath ? e.extensionPath : null
  } catch { return null }
}

/** O CSS da webview dela. `null` quando o pacote não tem a forma que conhecemos. */
function arquivoDeEstilo(pasta) {
  if (!pasta) return null
  const alvo = path.join(pasta, 'webview', 'index.css')
  try { return fs.statSync(alvo).isFile() ? alvo : null } catch { return null }
}

/** Tira um bloco nosso que já esteja lá (de uma versão anterior do ajuste). */
function semOBlocoAntigo(texto) {
  const i = texto.indexOf(MARCA_INICIO)
  if (i === -1) return texto
  const f = texto.indexOf(MARCA_FIM, i)
  if (f === -1) return texto.slice(0, i)
  return texto.slice(0, i) + texto.slice(f + MARCA_FIM.length)
}

/** O bloco já está lá, com este mesmo conteúdo? Então não há o que escrever. */
function jaAplicado(texto, pastaDaExtensaoOficial, deps) {
  // ⚠️ COMPARA COM O CSS COMPLETO, e nao so com a parte fixa. A parte dos modos e derivada do
  // PACOTE: quando a extensao atualiza e as posicoes mudam, o bloco no arquivo fica velho — e uma
  // comparacao que so olhasse a parte fixa diria "ja estava" e deixaria o ajuste errado no lugar.
  const esperado = pastaDaExtensaoOficial === undefined
    ? CSS.trim()
    : cssCompleto(pastaDaExtensaoOficial, deps)
  return texto.includes(MARCA_INICIO) && texto.includes(esperado)
}

/**
 * Aplica (ou reaplica) o bloco. Devolve o que aconteceu, para o registro.
 *
 * ⚠️ NUNCA LANÇA. Esta função roda na ativação; um arquivo somente-leitura, um antivírus segurando
 * o handle ou um pacote de formato diferente não podem impedir o programa de abrir.
 */
function aplicar(vscode, { anotar = () => { }, ler = fs.readFileSync, escrever = fs.writeFileSync,
                          renomear = fs.renameSync, remover = fs.unlinkSync } = {}) {
  const pasta = pastaDaExtensao(vscode)
  const alvo = arquivoDeEstilo(pasta)
  if (!alvo) { anotar('ajustesDaOficial.semAlvo'); return 'semAlvo' }

  let texto
  try { texto = String(ler(alvo, 'utf8')) } catch { anotar('ajustesDaOficial.naoLeu'); return 'naoLeu' }

  const cssParaEscrever = cssCompleto(pasta, { ler })
  if (jaAplicado(texto, pasta, { ler })) { anotar('ajustesDaOficial.jaEstava'); return 'jaEstava' }

  const novo = semOBlocoAntigo(texto).replace(/\s+$/, '') +
    '\n\n' + MARCA_INICIO + '\n' + cssParaEscrever + '\n' + MARCA_FIM + '\n'
  // ⚠️ ESCRITA ATÔMICA: grava num temporário e renomeia por cima. Renomear no mesmo volume é uma
  // operação só para o sistema de arquivos — ou o arquivo é o antigo, ou é o novo, nunca um pedaço.
  // Sem isto, o processo morrendo no meio da escrita deixaria o CSS de OUTRA extensão cortado. O
  // `semOBlocoAntigo` se cura sozinho na abertura seguinte (descarta de `MARCA_INICIO` em diante
  // quando não acha o fim), mas curar depois é pior que não quebrar.
  try { escreverAtomico(alvo, novo, { escrever, renomear, remover }) }
  catch { anotar('ajustesDaOficial.naoEscreveu'); return 'naoEscreveu' }

  anotar('ajustesDaOficial.aplicado')
  return 'aplicado'
}

/** Desfaz o ajuste — existe para que a decisão seja reversível sem reinstalar nada. */
function desfazer(vscode, { anotar = () => { }, ler = fs.readFileSync, escrever = fs.writeFileSync,
                           renomear = fs.renameSync, remover = fs.unlinkSync } = {}) {
  const alvo = arquivoDeEstilo(pastaDaExtensao(vscode))
  if (!alvo) return 'semAlvo'
  let texto
  try { texto = String(ler(alvo, 'utf8')) } catch { return 'naoLeu' }
  if (!texto.includes(MARCA_INICIO)) return 'naoEstava'
  try { escreverAtomico(alvo, semOBlocoAntigo(texto).replace(/\s+$/, '') + '\n', { escrever, renomear, remover }) }
  catch { return 'naoEscreveu' }
  anotar('ajustesDaOficial.desfeito')
  return 'desfeito'
}

module.exports = { aplicar, desfazer, jaAplicado, semOBlocoAntigo, escreverAtomico, cssDosModos, cssCompleto, MODOS_QUE_FICAM, CSS, MARCA_INICIO, MARCA_FIM, EXTENSAO }
