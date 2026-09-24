// A tela da conversa — o que roda DENTRO da webview.
//
// ⚠️ Este arquivo nunca vê o disco, nunca vê o `vscode` e nunca vê credencial. Ele só
// desenha o que o host manda e devolve o que a pessoa clicou. É de propósito: uma
// webview é uma página web, e tudo que ela puder fazer, um dia, alguém vai conseguir
// fazer por ela.
//
// ⚠️ PROIBIDO `innerHTML` COM TEXTO DO AGENTE — e não é regra de estilo.
//
// O texto que chega aqui vem de um modelo que acabou de ler os arquivos do projeto:
// um README com `<img src=x onerror=...>` viraria script rodando dentro do editor.
// Tudo que vem de fora entra por `textContent` ou por `document.createElement`. Se
// algum dia alguém precisar de negrito, o caminho é montar os nós — não concatenar
// string. A CSP sem `unsafe-inline` é o cinto; isto aqui é o suspensório.

(function () {
  'use strict'

  const vscode = acquireVsCodeApi()

  const $ = id => document.getElementById(id)
  const elConversa = $('conversa')
  const elVazio = $('vazio')
  const elEntrada = $('entrada')
  const elAlca = $('alca-caixa')
  const elEnviar = $('enviar')
  const elParar = $('parar')
  const elConta = $('conta')
  const elModelo = $('modelo')
  const elCusto = $('custo')
  // O custo é a porta da vista de tokens: as barras de atividade e de status nascem ocultas, e as
  // barras de cima e do painel têm composição definida — o botão mora num elemento que já existia.
  const abrirTokens = () => { if (elCusto.textContent) vscode.postMessage({ tipo: 'abrirTokens' }) }
  elCusto.addEventListener('click', abrirTokens)
  elCusto.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirTokens() } })
  const elCache = $('cache')
  const elCacheArco = $('cache-arco')
  const elCacheMinutos = $('cache-minutos')
  const elPonto = $('ponto')
  const elSair = $('sair')
  const elModo = $('modo')
  const elHistorico = $('historico')
  const elHistoricoBotao = $('historico-botao')
  const elHistoricoConta = $('historico-conta')
  const elHistoricoLista = $('historico-lista')
  // V15 — o painel de escolha do modelo e do esforço.
  const elSeletor = $('seletor')
  const elSeletorLista = $('seletor-lista')
  const elSeletorConfirmar = $('seletor-confirmar')
  const elSeletorConfirmarTexto = $('seletor-confirmar-texto')
  const elSeletorTrocar = $('seletor-trocar')
  const elSeletorManter = $('seletor-manter')
  const elSeletorNota = $('seletor-nota')
  const elEsforcoTitulo = $('esforco-titulo')
  const elEsforcoControle = $('esforco-controle')
  const elEsforcoSem = $('esforco-sem')
  const elEsforcoAviso = $('esforco-aviso')
  // V16 — o botão dos agentes e o mapa.
  const elAgentes = $('agentes')
  const elAgentesN = $('agentes-n')
  const elAgentesRotulo = $('agentes-rotulo')
  const elMapa = $('mapa')
  const elMapaSub = $('mapa-sub')
  const elMapaFechar = $('mapa-fechar')
  const elMapaSessaoPonto = $('mapa-sessao-ponto')
  const elMapaSessaoTitulo = $('mapa-sessao-titulo')
  const elMapaSessaoLinha = $('mapa-sessao-linha')
  const elMapaRamos = $('mapa-ramos')

  /** O que a tela sabe. Guardado também no estado da webview, para sobreviver a
      quando o editor descarta e recria a aba (acontece ao trocar de grupo). */
  let estado = vscode.getState() || { falas: [], conta: null, rotuloDoModelo: null }
  let balaoAtual = null      // a fala do agente que está sendo escrita agora

  // ── desenho ────────────────────────────────────────────────────────────────

  function esconderVazio() {
    if (elVazio && elVazio.parentNode) elVazio.remove()
  }

  function rolarParaOFim() {
    // Só rola se a pessoa já estava no fim. Puxar a tela de quem subiu para reler é
    // a forma mais rápida de tornar um chat irritante.
    const perto = elConversa.scrollHeight - elConversa.scrollTop - elConversa.clientHeight < 80
    if (perto) elConversa.scrollTop = elConversa.scrollHeight
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    if (texto !== undefined && texto !== null) el.textContent = String(texto)
    return el
  }

  function falaDeVoce(texto) {
    esconderVazio()
    const el = criar('div', 'fala de-voce', texto)
    elConversa.appendChild(el)
    rolarParaOFim()
  }

  /**
   * Acrescenta um pedaço de texto do agente à fala corrente (streaming).
   *
   * ⚠️ Um nó de texto por pedaço, e não `el.textContent += pedaço`. A segunda forma
   * relê e reescreve a árvore inteira a cada token; numa resposta longa isso trava a
   * rolagem. Aqui cada pedaço é um nó novo, e o navegador só acrescenta.
   */
  function pedacoDele(texto) {
    esconderVazio()
    // A resposta comecou: o pensamento vira historico, e para de crescer.
    if (balaoDePensamento) { balaoDePensamento.classList.add('terminado'); balaoDePensamento = null }
    if (!balaoAtual) {
      balaoAtual = criar('div', 'fala dele escrevendo')
      elConversa.appendChild(balaoAtual)
    }
    balaoAtual.appendChild(document.createTextNode(texto))
    rolarParaOFim()
  }

  /**
   * O pensamento do agente, quando o modo de pensamento estendido esta ligado.
   *
   * Um bloco so, que cresce — nao uma linha por pedaco. E some assim que a resposta
   * de verdade comeca: o que interessa na conversa e o que ele FEZ.
   */
  let balaoDePensamento = null
  function pedacoDePensamento(texto) {
    esconderVazio()
    if (!balaoDePensamento) {
      balaoDePensamento = criar('div', 'pensando')
      balaoDePensamento.appendChild(criar('span', 'pensando-rotulo', 'pensando'))
      balaoDePensamento.appendChild(document.createElement('span'))
      elConversa.appendChild(balaoDePensamento)
    }
    balaoDePensamento.lastChild.appendChild(document.createTextNode(texto))
    rolarParaOFim()
  }

  function fecharBalao() {
    if (balaoAtual) {
      balaoAtual.classList.remove('escrevendo')
      enfeitarCaminhos(balaoAtual)
      balaoAtual = null
    }
  }

  /**
   * Transforma caminho de arquivo citado no texto em algo clicável.
   *
   * ⚠️ Feito DEPOIS que a fala fecha, percorrendo nós de texto — nunca com innerHTML.
   * O ganho é o pedido do plano ("clicar em arquivo citado abre no editor") sem abrir
   * a porta que o cabeçalho deste arquivo fecha.
   */
  /*
    ⚠️ ESTE PADRÃO ACEITA ESPAÇO E ACENTO — e a primeira versão não aceitava nenhum dos
    dois. Achado por uma revisao independente em 10/09/2026, e era o defeito mais provável de
    todos: pasta de trabalho de verdade tem espaco no nome quase sempre.

    O que acontecia: `[^\s]+` cortava no primeiro espaço, então
    `X:\Meus Projetos\coisa nova\x.md` virava o botao **`X:\Meus`**. Nao era um
    link faltando — era um botão errado, que prometia abrir e falhava. E `\w` sem a
    flag `u` deixava `relatório.md` sem link nenhum.

    Como ele evita comer a frase inteira: o caminho tem que TERMINAR em extensão
    (`.md`, `.js`, …). "abri o D:\a b\c.md e segui" casa `D:\a b\c.md` e para ali,
    porque o resto não termina em extensão.

    A troca declarada: sobra a chance de um falso positivo colar duas coisas num
    caminho só. O custo disso é baixo e já está tratado — o botão mostra o caminho por
    extenso antes do clique, e `abrirArquivoCitado` responde com um aviso discreto na
    barra de status quando o arquivo não existe. O custo do erro contrário (nenhum
    caminho desta casa vira link) é alto e certo.
  */
  /*
    ⚠️ TODA REPETIÇÃO TEM TETO (segmento até 255, até 32 níveis) — e não é capricho.
    Medido em 10/09/2026, noite, depois que a revisão de segurança travou um benchmark: sem
    teto, o custo crescia com o QUADRADO do tamanho — 3,3 s para 40 mil caracteres de
    `a/a/a/…` sem extensão no fim, com a webview parada enquanto isso. Com teto: no
    máximo ~280 ms na mesma bateria, e os mesmos casos bons continuam casando. Nenhum
    caminho real passa de 32 níveis ou 255 caracteres por pasta (o limite do Windows).
    Critério em `testes/ponte.mjs`, com o tempo cobrado e os casos bons como controle.

    Relativo aceita emoji e marcas de acento combinadas; espaço e parêntese continuam FORA
    (casariam a frase ao redor — "(veja a/b.md)" viraria link quebrado; medido).
  */
  const PADRAO_CAMINHO = new RegExp(
    // Windows absoluto: D:\pasta com espaço\arquivo.ext
    '[A-Za-z]:\\\\(?:[^\\\\/:*?"<>|\\r\\n]{1,255}\\\\){0,32}[^\\\\/:*?"<>|\\r\\n]{0,255}?\\.\\w{1,8}' +
    '|' +
    // POSIX / relativo: ./pasta/arquivo.ext — com acento, por causa da flag u
    '(?:\\.{0,2}/)?(?:[\\p{L}\\p{N}\\p{M}\\p{Extended_Pictographic}_.\\-+@#&~]{1,255}/){1,32}' +
    '[\\p{L}\\p{N}\\p{M}\\p{Extended_Pictographic}_.\\-+@#&~]{1,255}\\.\\w{1,8}',
    'gu')

  function enfeitarCaminhos(raiz) {
    // ⚠️ JUNTAR OS PEDAÇOS ANTES DE PROCURAR. O streaming cria um nó de texto por pedaço
    // (`pedacoDele`), e o padrão casa nó por nó: um caminho cortado entre dois pedaços
    // nunca virava link. Medido no executável com o agente de verdade (10/09/2026, noite):
    // ele respondeu `./nota.txt`, o padrão casa `./nota.txt`, e não houve link. `normalize()`
    // funde os nós de texto vizinhos — a fala dele só tem texto, então vira um nó só.
    raiz.normalize()
    const textos = []
    const andarilho = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
    while (andarilho.nextNode()) textos.push(andarilho.currentNode)

    for (const no of textos) {
      const conteudo = no.nodeValue
      PADRAO_CAMINHO.lastIndex = 0
      if (!PADRAO_CAMINHO.test(conteudo)) continue
      PADRAO_CAMINHO.lastIndex = 0

      const pedacos = document.createDocumentFragment()
      let ultimo = 0, achado
      while ((achado = PADRAO_CAMINHO.exec(conteudo)) !== null) {
        if (achado.index > ultimo) pedacos.appendChild(document.createTextNode(conteudo.slice(ultimo, achado.index)))
        const caminho = achado[0]
        const botao = criar('button', 'arquivo', caminho)
        botao.type = 'button'
        botao.title = 'Abrir no editor'
        // ⚠️ `caminho`, e NÃO `achado[0]`: o ouvinte roda no CLIQUE, depois do laço, e aí
        // `achado` já é `null` (o `exec` que encerra o laço). Até 10/09/2026 todo clique em
        // arquivo citado dava `Cannot read properties of null` e não abria nada — achado
        // pela revisão funcional no executável; o critério que só via o link não pegava.
        botao.addEventListener('click', () => vscode.postMessage({ tipo: 'abrirArquivo', caminho }))
        pedacos.appendChild(botao)
        ultimo = achado.index + achado[0].length
      }
      if (ultimo < conteudo.length) pedacos.appendChild(document.createTextNode(conteudo.slice(ultimo)))
      no.parentNode.replaceChild(pedacos, no)
    }
  }

  /*
    O nome da ferramenta em português. O SDK manda o nome técnico ("Read", "Bash"); na
    tela de um produto em português ele era a única palavra em inglês da conversa
    (revisão de beleza, 10/09/2026). O nome técnico continua na dica. Ferramenta que não
    está aqui aparece com o nome que veio — melhor em inglês do que sumida.
  */
  const NOMES_DAS_FERRAMENTAS = {
    Read: 'Leu', Write: 'Escreveu', Edit: 'Editou', MultiEdit: 'Editou', NotebookEdit: 'Editou',
    Bash: 'Rodou', Glob: 'Procurou arquivos', Grep: 'Procurou no texto', LS: 'Listou',
    WebFetch: 'Abriu a página', WebSearch: 'Pesquisou', TodoWrite: 'Lista de tarefas',
    Task: 'Delegou', Agent: 'Delegou',
  }

  function linhaDeFerramenta(nome, entrada, mostrar) {
    fecharBalao()
    esconderVazio()
    const el = criar('div', 'ferramenta')
    const rotulo = criar('span', 'nome', NOMES_DAS_FERRAMENTAS[nome] || nome)
    rotulo.title = String(nome)
    el.appendChild(rotulo)
    const inteiro = (entrada && (entrada.file_path || entrada.path || entrada.command || entrada.url)) || ''
    // `mostrar` e o caminho relativo a pasta aberta (motor, `caminhoParaMostrar`); o inteiro vai na dica.
    const alvo = mostrar || inteiro
    if (alvo) {
      const span = criar('span', null, String(alvo).slice(0, 160))
      if (mostrar) span.title = String(inteiro)
      el.appendChild(span)
    }
    elConversa.appendChild(el)
    rolarParaOFim()
  }

  /** O pedido de permissão, com os três caminhos que a pessoa tem. */
  function cartaoDePermissao(pedido) {
    // V3: mudança de arquivo com diff tem o seu cartão — a mudança está no editor, não aqui.
    if (pedido && pedido.proposta && typeof pedido.proposta.trechos === 'number') return cartaoDeProposta(pedido)
    // V4: comando que a OFICINA vai rodar tem o cartão dele, que vira a própria execução.
    if (pedido && pedido.comando && typeof pedido.comando.linha === 'string') return cartaoDeComando(pedido)
    fecharBalao()
    esconderVazio()

    const cartao = criar('div', 'permissao')
    cartao.dataset.id = pedido.id
    cartao.dataset.respondida = 'nao'

    cartao.appendChild(criar('p', 'frase', pedido.frase))
    if (pedido.detalhe) cartao.appendChild(criar('p', 'detalhe', pedido.detalhe))

    // O comando ou o conteúdo, à vista. Aprovar sem ver o que se aprova não é aprovar.
    const e = pedido.entrada || {}
    const corpo = e.command || e.content || e.new_string || null
    // ⚠️ O CONTEÚDO VAI INTEIRO — e se não couber, o corte é DITO. Até 10/09/2026 ele era
    // cortado em 1.200 caracteres sem marca nenhuma (revisão de código): um comando
    // inofensivo no começo e perigoso no fim passava por completo. O teto agora é só para o
    // que não cabe em tela nenhuma, e a caixa rola (CSS `.permissao .comando`).
    const LIMITE_DO_CONTEUDO = 20000
    if (corpo) {
      const texto = String(corpo)
      cartao.appendChild(criar('pre', 'comando', texto.slice(0, LIMITE_DO_CONTEUDO)))
      if (texto.length > LIMITE_DO_CONTEUDO) {
        const resto = (texto.length - LIMITE_DO_CONTEUDO).toLocaleString('pt-BR')
        cartao.appendChild(criar('p', 'detalhe', `O conteúdo continua por mais ${resto} caracteres, que não cabem aqui. ` +
          'Se você não viu tudo, não permita.'))
      }
    }

    /*
      ⚠️ O PESO VISUAL DOS TRÊS BOTÕES NÃO É IGUAL, e a razão não é estética.
      Visto no retrato de 10/09/2026: "Permitir" e "Sempre permitir" saíram os dois em
      laranja sólido, lado a lado. "Sempre permitir" é a ação mais arriscada das três —
      ela vale para TODAS as próximas vezes, sem perguntar de novo — e estava tão
      convidativa quanto a que vale só para este pedido.
      Botão de uma vez só é o cheio; os outros dois são discretos. Nenhum é escondido:
      quem quer "sempre" continua a um clique.
    */
    const botoes = criar('div', 'botoes')
    const responder = (decisao, rotulo, classe, titulo) => {
      const b = criar('button', classe, rotulo)
      b.type = 'button'
      if (titulo) b.title = titulo
      b.addEventListener('click', () => {
        vscode.postMessage({ tipo: 'permissao', id: pedido.id, decisao })
        marcarRespondida(cartao, decisao)
      })
      return b
    }
    botoes.appendChild(responder('permitir', 'Permitir', 'botao', 'Só desta vez'))
    // Só quando há o que lembrar — o motor diz, em `podeSempre`. Sem sugestão do SDK,
    // "sempre" era um "Permitir" com outro nome, e a tela prometia "não pergunto de novo"
    // (revisão de código, 10/09/2026, noite).
    if (pedido.podeSempre) {
      botoes.appendChild(responder('permitir_sempre', 'Sempre permitir', 'botao discreto',
        pedido.modoSugerido === 'acceptEdits'
          ? 'Passa a editar sem perguntar, até o fim desta conversa'
          : 'Não pergunto mais por isso nesta conversa'))
    }
    botoes.appendChild(responder('negar', 'Não', 'botao discreto'))
    cartao.appendChild(botoes)

    elConversa.appendChild(cartao)
    elConversa.scrollTop = elConversa.scrollHeight   // permissão SEMPRE traz a tela
    return cartao
  }

  /**
   * V3: o pedido de mudar um arquivo NÃO mostra o conteúdo aqui — a mudança está no editor, trecho a
   * trecho, com "aceitar / rejeitar" em cada um. O cartão diz qual arquivo e quantos trechos, leva até
   * lá (a ficha com a linha — o que a V3 trouxe do esboço B) e tem as duas decisões inteiras.
   * "Sempre permitir" continua quando o motor o oferece: é o jeito EXPLÍCITO de pular a revisão até o
   * fim da conversa, e nunca o padrão.
   */
  function cartaoDeProposta(pedido) {
    fecharBalao()
    esconderVazio()
    const p = pedido.proposta
    const cartao = criar('div', 'permissao proposta')
    cartao.dataset.id = pedido.id
    cartao.dataset.respondida = 'nao'
    cartao.appendChild(criar('p', 'frase', p.novo ? `Criar o arquivo ${p.nome}` : `Alterar o arquivo ${p.nome}`))
    cartao.appendChild(criar('p', 'detalhe', `${p.trechos === 1 ? '1 trecho' : p.trechos + ' trechos'} para revisar no editor — ` +
      'aceite ou rejeite direto na linha.'))
    const ficha = criar('button', 'arquivo ficha', `${p.nome} :${p.linha}`)
    ficha.type = 'button'
    ficha.title = 'Mostrar a mudança no editor'
    ficha.addEventListener('click', () => vscode.postMessage({ tipo: 'mostrarProposta', id: pedido.id }))
    cartao.appendChild(ficha)

    const botoes = criar('div', 'botoes')
    const decidir = (decisao, rotulo, classe) => {
      const b = criar('button', classe, rotulo)
      b.type = 'button'
      b.addEventListener('click', () => {
        vscode.postMessage({ tipo: 'proposta', id: pedido.id, decisao })
        marcarRespondida(cartao, decisao === 'tudo' ? 'proposta_tudo' : 'proposta_nada')
      })
      return b
    }
    botoes.appendChild(decidir('tudo', 'Aceitar tudo', 'botao'))
    if (pedido.podeSempre) {
      const sempre = criar('button', 'botao discreto', 'Sempre permitir')
      sempre.type = 'button'
      sempre.title = 'Passa a editar sem perguntar, até o fim desta conversa'
      sempre.addEventListener('click', () => {
        vscode.postMessage({ tipo: 'permissao', id: pedido.id, decisao: 'permitir_sempre' })
        marcarRespondida(cartao, 'permitir_sempre')
      })
      botoes.appendChild(sempre)
    }
    botoes.appendChild(decidir('nada', 'Rejeitar tudo', 'botao discreto'))
    cartao.appendChild(botoes)

    elConversa.appendChild(cartao)
    elConversa.scrollTop = elConversa.scrollHeight
    return cartao
  }

  /**
   * V4 — o cartão de um COMANDO.
   *
   * Ele é o mesmo elemento do começo ao fim: pede a aprovação, vira "rodando…" com o botão de
   * parar, e termina no veredito. Três peças separadas na conversa (o pedido, a execução, o
   * resultado) fariam a leitura de "o que aconteceu com este comando" saltar entre três lugares —
   * e, numa resposta longa, com outras coisas no meio.
   *
   * ⚠️ Sem "Sempre permitir", e é decisão do motor, não da tela: o "sempre" do SDK escreve uma
   * regra de allow, e o comando seguinte deixaria de passar por aqui — sumindo do terminal sem
   * ninguém perceber. O porquê está em `agente.js`.
   */
  function cartaoDeComando(pedido) {
    fecharBalao()
    esconderVazio()
    const c = pedido.comando
    const cartao = criar('div', 'permissao comando-cartao')
    cartao.dataset.id = pedido.id
    cartao.dataset.respondida = 'nao'
    cartao.appendChild(criar('p', 'frase', 'Rodar um comando no terminal'))
    if (c.descricao) cartao.appendChild(criar('p', 'detalhe', c.descricao))
    cartao.appendChild(criar('pre', 'comando', c.linha))

    const botoes = criar('div', 'botoes')
    const responder = (decisao, rotulo, classe, titulo) => {
      const b = criar('button', classe, rotulo)
      b.type = 'button'
      if (titulo) b.title = titulo
      b.addEventListener('click', () => {
        vscode.postMessage({ tipo: 'permissao', id: pedido.id, decisao })
        // O "Permitido." dos outros cartões não serve aqui: entre o clique e o processo nascer há
        // uma abertura de terminal, e a tela precisa dizer o que está acontecendo nesse meio.
        marcarRespondida(cartao, decisao, decisao === 'permitir' ? 'Abrindo o terminal…' : undefined)
      })
      return b
    }
    botoes.appendChild(responder('permitir', 'Rodar', 'botao', 'Roda agora, no terminal do editor, à sua vista'))
    botoes.appendChild(responder('negar', 'Não', 'botao discreto'))
    cartao.appendChild(botoes)

    elConversa.appendChild(cartao)
    elConversa.scrollTop = elConversa.scrollHeight
    return cartao
  }

  /** O cartão pelo id do pedido — a costura entre o que a tela desenhou e o que o host conta. */
  const cartaoDe = id => elConversa.querySelector(`.permissao[data-id="${CSS.escape(String(id))}"]`)

  /**
   * O comando começou a rodar: o cartão troca o veredito por uma linha viva, com o botão que para
   * ESTE comando e o caminho para o terminal.
   */
  function comandoComecou(m) {
    /*
      ⚠️ SEM CARTÃO, O CARTÃO NASCE AQUI. A tela é descartada e recriada quando a aba muda de grupo
      (o editor faz isso), e o host reenvia os comandos que estão rodando. Sem este ramo, quem
      arrastasse a aba durante um `npm test` voltava sem cartão, sem botão de parar e sem histórico —
      e o veredito, quando chegasse, seria descartado em silêncio (revisor independente, 11/09/2026).
    */
    let cartao = cartaoDe(m.id)
    if (!cartao && m.linha) {
      cartao = criar('div', 'permissao comando-cartao')
      cartao.dataset.id = m.id
      cartao.dataset.respondida = 'sim'
      cartao.appendChild(criar('p', 'frase', 'Comando rodando'))
      cartao.appendChild(criar('pre', 'comando', m.linha))
      esconderVazio()
      elConversa.appendChild(cartao)
    }
    if (!cartao) return
    // A tela recriada pode receber o mesmo comando duas vezes; uma linha de execução basta.
    if (cartao.querySelector(`.execucao[data-execucao="${CSS.escape(String(m.id))}"]`)) return
    const veredito = cartao.querySelector('.veredito')
    if (veredito) veredito.remove()

    const linha = criar('div', 'execucao')
    linha.dataset.execucao = String(m.id)
    linha.appendChild(criar('span', 'girando', ''))
    linha.appendChild(criar('span', 'execucao-texto', 'rodando…'))

    const parar = criar('button', 'botao discreto miudo', 'Parar este comando')
    parar.type = 'button'
    parar.addEventListener('click', () => {
      vscode.postMessage({ tipo: 'pararComando', id: m.id })
      parar.disabled = true
      linha.querySelector('.execucao-texto').textContent = 'parando…'
    })
    linha.appendChild(parar)
    linha.appendChild(botaoDoTerminal('Ver no terminal'))
    cartao.appendChild(linha)
    rolarParaOFim()
    registrarNoHistorico(m)
  }

  /** O comando terminou: a linha viva vira o veredito do que aconteceu. */
  function comandoTerminou(m) {
    const cartao = cartaoDe(m.id)
    const texto = vereditoDoComando(m)
    if (cartao) {
      const linha = cartao.querySelector(`.execucao[data-execucao="${CSS.escape(String(m.id))}"]`)
      if (linha) {
        linha.replaceChildren()
        linha.dataset.fim = m.cancelado ? 'parado' : m.codigo === 0 ? 'bem' : 'mal'
        linha.appendChild(criar('span', 'execucao-texto', texto))
        linha.appendChild(botaoDoTerminal('Ver no terminal'))
      } else {
        cartao.appendChild(criar('p', 'veredito', texto))
      }
    }
    atualizarNoHistorico(m, texto)
  }

  function botaoDoTerminal(rotulo) {
    const b = criar('button', 'botao-texto miudo', rotulo)
    b.type = 'button'
    b.addEventListener('click', () => vscode.postMessage({ tipo: 'mostrarTerminal' }))
    return b
  }

  /** O que aconteceu com o comando, em uma linha — a mesma leitura do rodapé do terminal. */
  function vereditoDoComando(m) {
    const tempo = typeof m.duracaoMs === 'number'
      ? ' · ' + (m.duracaoMs / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s'
      : ''
    if (m.erro && !m.cancelado) return '✕ não consegui rodar: ' + m.erro
    if (m.cancelado) {
      return (m.motivo === 'tempo' ? '⏹ parado: passou do tempo limite' : '⏹ parado por você') + tempo
    }
    if (m.codigo === 0) return '✓ terminou bem' + tempo
    return `✕ terminou com erro (código ${m.codigo === null ? '?' : m.codigo})` + tempo
  }

  // ── O histórico dos comandos da sessão ─────────────────────────────────────

  let quantosComandos = 0

  function registrarNoHistorico(m) {
    quantosComandos++
    elHistorico.hidden = false
    elHistoricoConta.textContent = quantosComandos === 1 ? '1 comando nesta conversa' : `${quantosComandos} comandos nesta conversa`
    const item = criar('li', 'historico-item')
    item.dataset.id = String(m.id)
    const d = new Date()
    item.appendChild(criar('span', 'historico-hora',
      [d.getHours(), d.getMinutes()].map(n => String(n).padStart(2, '0')).join(':')))
    item.appendChild(criar('code', 'historico-linha', m.linha))
    item.appendChild(criar('span', 'historico-fim', 'rodando…'))
    item.addEventListener('click', () => vscode.postMessage({ tipo: 'mostrarTerminal' }))
    elHistoricoLista.appendChild(item)
  }

  function atualizarNoHistorico(m, texto) {
    const item = elHistoricoLista.querySelector(`.historico-item[data-id="${CSS.escape(String(m.id))}"]`)
    if (!item) return
    const fim = item.querySelector('.historico-fim')
    if (fim) fim.textContent = texto
    item.dataset.fim = m.cancelado ? 'parado' : m.codigo === 0 ? 'bem' : 'mal'
  }

  elHistoricoBotao.addEventListener('click', () => {
    const abrindo = elHistoricoLista.hidden
    elHistoricoLista.hidden = !abrindo
    elHistoricoBotao.setAttribute('aria-expanded', String(abrindo))
    elHistorico.dataset.aberto = abrindo ? 'sim' : 'nao'
  })

  function limparHistorico() {
    quantosComandos = 0
    elHistoricoLista.replaceChildren()
    elHistoricoLista.hidden = true
    elHistoricoBotao.setAttribute('aria-expanded', 'false')
    delete elHistorico.dataset.aberto
    elHistorico.hidden = true
  }

  function marcarRespondida(cartao, decisao, textoPronto) {
    if (!cartao || cartao.dataset.respondida === 'sim') return
    cartao.dataset.respondida = 'sim'
    const botoes = cartao.querySelector('.botoes')
    if (botoes) botoes.remove()
    const texto = textoPronto ? textoPronto
      : decisao === 'proposta_tudo' ? 'Você aceitou tudo.'
      : decisao === 'proposta_nada' ? 'Você rejeitou tudo.'
      : decisao === 'negar' ? 'Você não permitiu.'
      : decisao === 'permitir_sempre' ? 'Permitido — e não pergunto de novo.'
        : decisao === 'retirada' ? 'O pedido foi retirado.'
          : 'Permitido.'
    cartao.appendChild(criar('p', 'veredito', texto))
  }

  /**
   * Um erro na tela SEMPRE vem com uma saída.
   *
   * ⚠️ Achado por uma revisao independente em 10/09/2026: quem instalasse a OFICINA sem nunca
   * ter feito login via um erro cru em inglês e o painel MORRIA — o Enviar ficava
   * desabilitado, o motor recusava mensagens no estado de erro, e a abertura só era
   * tentada uma vez. A única saída era fechar a aba, e nada na tela dizia isso.
   *
   * Um beco sem saída é pior que a falha que o causou: a falha é do momento, o beco
   * fica. Todo erro daqui em diante carrega o botão que refaz a tentativa.
   */
  /**
   * O turno terminou com erro, mas a conversa CONTINUA.
   *
   * ⚠️ Revisão de código (10/09/2026, noite): o motor manda `fim` com `erro` (limite de
   * passos, erro no meio do trabalho) e a tela usava só o custo — a pessoa ficava olhando
   * uma pergunta sem resposta e sem erro. Sem botão de propósito: "Tentar de novo" reabre a
   * conversa, e ela não caiu; a saída aqui é a própria caixa de escrever.
   */
  const MOTIVOS_DO_FIM = {
    error_max_turns: 'chegou ao limite de passos desta resposta',
    error_during_execution: 'deu um erro no meio do trabalho',
  }
  function avisoDeTurno(erro) {
    esconderVazio()
    const motivo = MOTIVOS_DO_FIM[erro] || `terminou com um erro (${erro})`
    const bloco = criar('div', 'erro')
    bloco.appendChild(criar('p', 'erro-texto',
      `O agente parou antes de terminar: ${motivo}. A conversa continua — escreva de novo para ele seguir.`))
    elConversa.appendChild(bloco)
    rolarParaOFim()
  }

  function mostrarErro(mensagem, acao, segunda) {
    fecharBalao()
    esconderVazio()
    const bloco = criar('div', 'erro')
    bloco.appendChild(criar('p', 'erro-texto', mensagem))

    const botao = criar('button', 'botao', (acao && acao.rotulo) || 'Tentar de novo')
    botao.type = 'button'
    botao.addEventListener('click', () => {
      vscode.postMessage({ tipo: (acao && acao.tipo) || 'tentarDeNovo' })
      bloco.remove()
    })
    bloco.appendChild(botao)

    // V8 — a SEGUNDA saída, quando existe (hoje: o Socorro). Botão separado, com cara de secundário, e
    // ele NÃO some o erro: quem abre o socorro ainda precisa do texto para entender o que houve.
    if (segunda) {
      const outro = criar('button', 'botao discreto', segunda.rotulo)
      outro.type = 'button'
      outro.addEventListener('click', () => vscode.postMessage({ tipo: segunda.tipo }))
      bloco.appendChild(outro)
    }

    elConversa.appendChild(bloco)
    rolarParaOFim()
    return bloco
  }

  // ── estado da tela ─────────────────────────────────────────────────────────

  const TEXTO_DA_CAIXA = elEntrada.placeholder

  function aplicarEstado(nome) {
    elPonto.dataset.estado = nome
    // O estado no <body> deixa o CSS reagir fora do ponto (a borda da caixa, abaixo).
    document.body.dataset.estado = nome
    // ESPERANDO VOCÊ: o "Enviar" sai do laranja cheio — a decisão está no cartão, e dois
    // botões primários disputando o olho é a tela dizendo duas coisas ao mesmo tempo.
    const esperando = nome === 'esperando_permissao'
    elEnviar.classList.toggle('discreto', esperando)
    elEntrada.placeholder = esperando
      ? 'Há uma decisão esperando por você na conversa — ou escreva aqui'
      : TEXTO_DA_CAIXA
    const ocupado = nome === 'pensando' || nome === 'esperando_permissao' || nome === 'cancelando'
    elParar.hidden = !ocupado
    elParar.disabled = nome === 'cancelando'
    // O botão é ícone: o "Parando…" vai para o nome acessível e para a dica, e o
    // desenho pulsa — o texto trocaria o SVG por palavra.
    const rotuloParar = nome === 'cancelando' ? 'Parando…' : 'Parar'
    elParar.setAttribute('aria-label', rotuloParar)
    elParar.title = rotuloParar
    elParar.classList.toggle('parando', nome === 'cancelando')
    elEnviar.disabled = nome === 'abrindo' || nome === 'erro'
    if (nome === 'ociosa' || nome === 'parada') fecharBalao()
  }

  /*
    V15 — O BOTÃO DO MODELO E O PAINEL DE ESCOLHA.

    Tudo o que aparece aqui vem do host no evento `modelo`, e é sempre o que está EM USO (lido do agente
    depois de cada troca): a tela nunca desenha o que foi pedido, só o que voltou — a mesma regra do modo.
    O nome de gente ("Opus 5 (1M)") e os rótulos do esforço também vêm prontos (`modelos.js`): um lugar só.
  */
  let modeloAtual = null        // o último evento `modelo`
  let cacheQuente = false       // pelo relógio do pé (V14): liga o aviso do esforço
  let ativo = -1                // o item com o foco do teclado na lista

  function mostrarModelo(m) {
    modeloAtual = m
    const rotulo = m && m.rotulo ? String(m.rotulo) : ''
    // Em partes (nome, contexto longo, esforço): o pé estreito tira a do contexto longo (ver o CSS).
    const partes = m && Array.isArray(m.partes) && m.partes.length ? m.partes : [{ parte: 'nome', texto: rotulo }]
    elModelo.replaceChildren(...partes.map(p => criar('span', 'modelo-' + String(p.parte).replace(/[^a-z]/g, ''), p.texto)))
    elModelo.setAttribute('aria-label', rotulo ? `Modelo e esforço: ${rotulo}` : 'Modelo e esforço')
    elModelo.hidden = !rotulo
    if (m && m.modelo) {
      const esforco = m.esforco ? (m.niveis || []).find(n => n.nivel === m.esforco) : null
      elModelo.title = `${m.modelo}` +
        (esforco ? ` · esforço ${esforco.rotulo}${m.esforcoSuposto ? ' (o padrão: o agente não disse)' : ''}` : '') +
        '\nClique para trocar o modelo ou o esforço.'
    } else elModelo.removeAttribute('title')
    estado.rotuloDoModelo = rotulo
    guardar()
    if (!elSeletor.hidden) desenharSeletor()
  }

  function desenharSeletor() {
    const m = modeloAtual || { modelos: [], niveis: [], esforcos: [] }
    const modelos = Array.isArray(m.modelos) ? m.modelos : []
    elSeletorLista.replaceChildren()
    modelos.forEach((item, i) => {
      const li = criar('li', 'seletor-item')
      li.id = 'seletor-item-' + i
      li.setAttribute('role', 'option')
      li.dataset.valor = item.valor
      const emUso = item.valor === m.emUso
      li.setAttribute('aria-selected', emUso ? 'true' : 'false')
      if (emUso) li.dataset.emUso = 'sim'
      const textos = criar('span', 'seletor-textos')
      textos.appendChild(criar('span', 'seletor-nome', item.nome))
      if (item.descricao) textos.appendChild(criar('span', 'seletor-descricao', item.descricao))
      li.appendChild(textos)
      li.appendChild(criar('span', 'seletor-marca', emUso ? '✓' : ''))
      li.addEventListener('click', () => { ativo = i; marcarAtivo(); escolherModelo(item.valor) })
      elSeletorLista.appendChild(li)
    })
    if (ativo < 0 || ativo >= modelos.length) ativo = Math.max(0, modelos.findIndex(i => i.valor === m.emUso))
    marcarAtivo()

    // O esforço: os cinco pontos, só os que o modelo aceita; modelo sem esforço, o controle some e diz por quê.
    const aceitos = Array.isArray(m.esforcos) ? m.esforcos : []
    const semEsforco = m.aceitaEsforco === false || !aceitos.length
    const niveis = (m.niveis || []).filter(n => aceitos.includes(n.nivel))
    const atual = niveis.find(n => n.nivel === m.esforco)
    elEsforcoTitulo.textContent = semEsforco ? 'Esforço'
      : `Esforço (${atual ? atual.rotulo + (m.esforcoSuposto ? ', o padrão' : '') : 'não informado'})`
    elEsforcoControle.hidden = semEsforco
    elEsforcoSem.hidden = !semEsforco
    const itemEmUso = modelos.find(i => i.valor === m.emUso)
    elEsforcoSem.textContent = semEsforco
      ? `${itemEmUso ? itemEmUso.nome : 'Este modelo'} não tem nível de esforço: o agente não deixa escolher o quanto ele pensa neste modelo.`
      : ''
    elEsforcoAviso.hidden = semEsforco || !cacheQuente
    elEsforcoControle.replaceChildren()
    if (!semEsforco) {
      elEsforcoControle.appendChild(criar('span', 'esforco-trilho'))
      niveis.forEach(n => {
        const ponto = criar('span', 'esforco-ponto')
        ponto.dataset.nivel = n.nivel
        if (n.nivel === m.esforco) ponto.dataset.atual = 'sim'
        ponto.appendChild(criar('span', 'esforco-bolinha'))
        ponto.appendChild(criar('span', 'esforco-rotulo', n.rotulo))
        ponto.addEventListener('click', () => escolherEsforco(n.nivel))
        elEsforcoControle.appendChild(ponto)
      })
      const indice = niveis.findIndex(n => n.nivel === m.esforco)
      elEsforcoControle.setAttribute('aria-valuemin', '1')
      elEsforcoControle.setAttribute('aria-valuemax', String(niveis.length))
      elEsforcoControle.setAttribute('aria-valuenow', String(indice + 1))
      elEsforcoControle.setAttribute('aria-valuetext', atual ? atual.rotulo : 'não informado')
    }
  }

  function marcarAtivo() {
    const itens = [...elSeletorLista.children]
    itens.forEach((li, i) => li.classList.toggle('ativo', i === ativo))
    if (itens[ativo]) {
      elSeletorLista.setAttribute('aria-activedescendant', itens[ativo].id)
      itens[ativo].scrollIntoView({ block: 'nearest' })
    } else elSeletorLista.removeAttribute('aria-activedescendant')
  }

  function abrirSeletor() {
    if (!modeloAtual) return
    ativo = -1
    elSeletorConfirmar.hidden = true
    elSeletorNota.hidden = true
    elSeletor.hidden = false
    elModelo.setAttribute('aria-expanded', 'true')
    desenharSeletor()
    elSeletorLista.focus()
  }

  function fecharSeletor({ devolverFoco = true } = {}) {
    if (elSeletor.hidden) return
    elSeletor.hidden = true
    elSeletorConfirmar.hidden = true
    elModelo.setAttribute('aria-expanded', 'false')
    if (devolverFoco) elModelo.focus()
  }

  function escolherModelo(valor, confirmado = false) {
    if (!modeloAtual) return
    if (valor === modeloAtual.emUso && !confirmado) return
    elSeletorNota.hidden = true
    elSeletorConfirmar.hidden = true
    vscode.postMessage({ tipo: 'trocarModelo', valor, confirmado })
  }

  function escolherEsforco(nivel) {
    if (!modeloAtual || nivel === modeloAtual.esforco) return
    elSeletorNota.hidden = true
    vscode.postMessage({ tipo: 'trocarEsforco', nivel })
  }

  /** O pedido de confirmação do host: trocar de modelo com o cache quente custa (o texto diz quanto). */
  function pedirConfirmacao(m) {
    if (elSeletor.hidden) abrirSeletor()
    elSeletorConfirmar.hidden = false
    elSeletorConfirmar.dataset.valor = m.valor
    elSeletorConfirmarTexto.textContent = m.texto || ''
    elSeletorManter.textContent = modeloAtual && modeloAtual.nome ? `Manter ${modeloAtual.nome}` : 'Manter o modelo'
    // O foco vai para MANTER: trocar custa dinheiro, e um Enter distraído não pode pagar por ninguém.
    elSeletorManter.focus()
  }

  /**
   * V14 — O PÉ: os tokens (contexto agora · processado · custo estimado) e o relógio do cache. Tudo vem
   * pronto do host (`telaTokens.js`), que é a mesma fonte da vista Tokens: o número do pé e o do detalhe
   * não podem discordar. Sem números, o pé fica vazio — nunca "0".
   *
   * ⚠️ Até a V13 o pé mostrava o custo que o SDK devolve no fim de cada turno (`fim.custoUsd`). Saiu: era um
   * SEGUNDO número de custo, contado de outro jeito que o da vista, e dois números para a mesma pergunta
   * foi exatamente o defeito que a revisão de tela achou na lista das conversas.
   */
  function mostrarTokens(m) {
    elCusto.textContent = m.texto || ''
    elCusto.title = m.texto ? (m.dica || '') : ''
    const r = m.texto ? m.relogio : null
    // V15 — o aviso do esforço no painel de escolha segue o relógio: só com o cache quente.
    cacheQuente = !!r && !r.vencido
    elEsforcoAviso.hidden = !cacheQuente || elEsforcoControle.hidden
    elCache.hidden = !r
    if (!r) { delete elCache.dataset.vencido; elCache.removeAttribute('title'); return }
    const fracao = Math.max(0, Math.min(1, Number(r.fracao) || 0))
    elCacheArco.setAttribute('stroke-dasharray', `${Math.round(fracao * 100)} 100`)
    elCache.dataset.vencido = r.vencido ? 'sim' : 'nao'
    elCache.dataset.suposto = r.suposto ? 'sim' : 'nao'
    elCacheMinutos.textContent = r.vencido ? 'venceu' : `${r.minutos}m`
    elCache.title = r.dica || ''
    elCache.setAttribute('role', 'img')
    elCache.setAttribute('aria-label', r.dica || '')
  }

  /*
    V16 — O BOTÃO "N AGENTES" E O MAPA.

    Tudo vem pronto do host (`agentes.js`, `montarMapa`): nomes, estados, tokens já escritos, a árvore (quem é filho
    de quem) e se dá para parar. A tela só desenha, e só faz UMA conta: o tempo de quem ainda roda (agora − início).

    ⚠️ O TEMPO ANDA SOZINHO SEM GASTAR À TOA: um único temporizador de 1 s, e só com o mapa ABERTO e algum agente
    rodando. Ele troca o texto dos tempos que correm e nada mais (não redesenha cartão). Mapa fechado, ou nenhum
    rodando: nenhum temporizador. O botão do pé não tem relógio — ele mostra quantos rodam, e isso só muda por evento.
  */
  let mapaAtual = null
  const expandidos = new Set()     // os cartões abertos, pelo id do agente (sobrevivem ao redesenho)
  let confirmandoParar = null      // o agente cujo cartão está perguntando "parar mesmo?"
  const naoParou = new Set()       // os que o host recusou parar (o cartão diz)
  const naoConfirmou = new Set()   // os que receberam o pedido de parar, mas o fim não chegou no prazo
  let relogioDoMapa = null

  /** "45s", "37m 3s", "1h 2m". */
  function duracao(ms) {
    const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ${s % 60}s`
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }
  const tempoDo = a => (a.vivo && a.inicioMs != null ? duracao(Date.now() - a.inicioMs) : a.duracaoMs != null ? duracao(a.duracaoMs) : '')

  function mostrarAgentes(m) {
    mapaAtual = m
    const total = Number(m.total) || 0
    const rodando = Number(m.rodando) || 0
    elAgentes.hidden = total === 0
    elAgentesN.textContent = String(rodando)
    elAgentesRotulo.textContent = ' ' + String(m.rotulo || '').replace(/^\d+\s*/, '')
    elAgentes.dataset.rodando = rodando > 0 ? 'sim' : 'nao'
    const terminados = total - rodando
    const frase = `${m.rotulo || rodando} rodando` + (terminados > 0 ? `, ${terminados} ${terminados === 1 ? 'terminado' : 'terminados'}` : '')
    elAgentes.setAttribute('aria-label', `${frase}. Abrir o mapa dos agentes.`)
    elAgentes.title = `${frase}.\nClique para ver o mapa dos agentes.`
    if (total === 0 && !elMapa.hidden) fecharMapa()
    else if (!elMapa.hidden) desenharMapa()
  }

  /** A chave de foco de um elemento do mapa: o redesenho troca os elementos, e o foco volta para o equivalente. */
  function chaveDoFoco() {
    const el = document.activeElement
    return el && elMapa.contains(el) && el.dataset ? el.dataset.foco || null : null
  }

  function desenharMapa() {
    const m = mapaAtual || { agentes: [], sessao: {}, total: 0, rodando: 0 }
    const foco = chaveDoFoco()
    const agentes = Array.isArray(m.agentes) ? m.agentes : []
    const porId = new Map(agentes.map(a => [a.id, a]))
    const total = agentes.length
    elMapaSub.textContent = `${total} ${total === 1 ? 'agente' : 'agentes'} · ${m.rodando || 0} rodando · clique num agente para ver os detalhes`
    elMapaSessaoTitulo.textContent = (m.sessao && m.sessao.titulo) || 'Esta conversa'
    elMapaSessaoLinha.textContent = (m.sessao && m.sessao.linha) || ''
    elMapaSessaoPonto.dataset.viva = m.sessao && m.sessao.viva ? 'sim' : 'nao'
    const raizes = agentes.filter(a => !a.pai || !porId.has(a.pai))
    elMapaRamos.replaceChildren(...raizes.map(a => ramo(a, porId)))
    if (foco) {
      const alvo = elMapa.querySelector(`[data-foco="${CSS.escape(foco)}"]`)
      if (alvo) alvo.focus()
      else elMapaFechar.focus()
    }
    ligarRelogioDoMapa()
  }

  /** Um agente: o cartão (botão que abre e fecha) e, aberto, o detalhe com os filhos dentro. */
  function ramo(a, porId) {
    const li = criar('li', 'mapa-ramo')
    const aberto = expandidos.has(a.id)
    const cartao = criar('button', 'agente')
    cartao.type = 'button'
    cartao.dataset.id = a.id
    cartao.dataset.foco = 'cartao|' + a.id
    cartao.dataset.estado = a.estado
    cartao.setAttribute('aria-expanded', aberto ? 'true' : 'false')
    const ponto = criar('span', 'agente-ponto')
    ponto.dataset.estado = a.estado
    ponto.setAttribute('aria-hidden', 'true')
    const textos = criar('span', 'agente-textos')
    textos.appendChild(criar('span', 'agente-nome', a.nome))
    const linha = criar('span', 'agente-linha')
    const tempo = criar('span', 'agente-tempo', tempoDo(a))
    if (a.vivo && a.inicioMs != null) tempo.dataset.inicio = String(a.inicioMs)
    linha.appendChild(tempo)
    const resto = [a.tokensTexto, a.parando ? 'parando…' : (a.vivo ? null : a.rotuloDoEstado)].filter(Boolean)
    if (resto.length) linha.appendChild(document.createTextNode(' · ' + resto.join(' · ')))
    textos.appendChild(linha)
    cartao.appendChild(ponto)
    cartao.appendChild(textos)
    const filhos = (a.filhos || []).map(id => porId.get(id)).filter(Boolean)
    if (filhos.length && !aberto) cartao.appendChild(criar('span', 'agente-mais', `+${filhos.length}`))
    cartao.setAttribute('aria-label', `${a.nome}: ${a.rotuloDoEstado}${tempo.textContent ? ', ' + tempo.textContent : ''}${a.tokensTexto ? ', ' + a.tokensTexto : ''}` +
      (filhos.length ? `, ${filhos.length} ${filhos.length === 1 ? 'agente' : 'agentes'} dentro` : ''))
    cartao.addEventListener('click', () => {
      if (expandidos.has(a.id)) expandidos.delete(a.id)
      else expandidos.add(a.id)
      if (confirmandoParar === a.id) confirmandoParar = null
      desenharMapa()
    })
    li.appendChild(cartao)
    if (aberto) li.appendChild(detalhe(a, filhos, porId))
    return li
  }

  function detalhe(a, filhos, porId) {
    const caixa = criar('div', 'agente-detalhe')
    const campos = criar('dl', 'agente-campos')
    const campo = (rotulo, valor, extra) => {
      if (valor == null || valor === '') return
      campos.appendChild(criar('dt', null, rotulo))
      const dd = criar('dd', extra || null, String(valor))
      campos.appendChild(dd)
      return dd
    }
    campo('Estado', a.parando ? 'parando…' : a.rotuloDoEstado)
    campo('Tipo', a.tipo)
    campo('Fazendo agora', a.atividade)
    campo('Última ferramenta', a.ultimaFerramenta)
    campo('Ferramentas usadas', a.ferramentas)
    // "No contexto", como no cartão da sessão: é o tamanho do agente no fim (a conta do próprio agente). O que ele
    // PROCESSOU no total é outro número, maior, e mora na vista Tokens — dois números com o mesmo nome confundiriam.
    campo('Tokens no contexto', a.tokensTexto)
    const dd = campo('Duração', tempoDo(a))
    if (dd && a.vivo && a.inicioMs != null) { dd.classList.add('agente-tempo'); dd.dataset.inicio = String(a.inicioMs) }
    campo('Resumo', a.resumo, 'agente-resumo')
    campo('Erro', a.erro)
    caixa.appendChild(campos)
    if (a.doDisco) caixa.appendChild(criar('p', 'agente-nota', 'Lido do disco: este agente é de antes desta abertura da conversa.'))
    if (naoParou.has(a.id)) {
      caixa.appendChild(criar('p', 'agente-nota', naoConfirmou.has(a.id)
        ? 'Pedi para parar, mas ele não confirmou — pode seguir rodando. Dá para tentar de novo.'
        : 'Não consegui parar — ele segue como estava.'))
    }
    if (filhos.length) {
      const bloco = criar('div', 'agente-filhos')
      bloco.appendChild(criar('div', 'agente-filhos-titulo', `Lançados por ele (${filhos.length})`))
      const ul = criar('ul', 'mapa-ramos aninhado')
      for (const f of filhos) ul.appendChild(ramo(f, porId))
      bloco.appendChild(ul)
      caixa.appendChild(bloco)
    }
    /*
      PARAR É DESTRUTIVO: o que o agente ainda não fez não vai ser feito. Por isso o botão só pergunta, no próprio
      cartão, e o foco vai para "Deixar rodando" — um Enter distraído não para ninguém (a regra do painel de modelo).
    */
    if (a.podeParar) {
      const barra = criar('div', 'agente-parar')
      if (confirmandoParar === a.id) {
        barra.appendChild(criar('p', 'agente-parar-texto', 'Parar este agente? O que ele ainda não fez não será feito; o que já fez fica.'))
        // O primário (a brasa, onde o olho vai) é "Deixar rodando", o mesmo que recebe o foco: a ação que destrói
        // fica no secundário, e ninguém é levado a ela pela cor.
        const sim = criar('button', 'seletor-botao secundario', 'Parar o agente')
        sim.type = 'button'
        sim.dataset.foco = 'confirmar|' + a.id
        sim.addEventListener('click', () => {
          confirmandoParar = null
          naoParou.delete(a.id)
          vscode.postMessage({ tipo: 'pararAgente', id: a.id })
          desenharMapa()
        })
        const nao = criar('button', 'seletor-botao', 'Deixar rodando')
        nao.type = 'button'
        nao.dataset.foco = 'manter|' + a.id
        nao.addEventListener('click', () => { confirmandoParar = null; desenharMapa(); focarNoMapa('parar|' + a.id) })
        const botoes = criar('div', 'seletor-confirmar-botoes')
        botoes.appendChild(sim)
        botoes.appendChild(nao)
        barra.appendChild(botoes)
        barra.dataset.confirmando = 'sim'
      } else {
        const parar = criar('button', 'agente-parar-botao', 'Parar este agente…')
        parar.type = 'button'
        parar.dataset.foco = 'parar|' + a.id
        parar.addEventListener('click', () => { confirmandoParar = a.id; desenharMapa(); focarNoMapa('manter|' + a.id) })
        barra.appendChild(parar)
      }
      caixa.appendChild(barra)
    }
    return caixa
  }

  function focarNoMapa(chave) {
    const alvo = elMapa.querySelector(`[data-foco="${CSS.escape(chave)}"]`)
    if (alvo) alvo.focus()
  }

  function atualizarTempos() {
    for (const el of elMapa.querySelectorAll('[data-inicio]')) el.textContent = duracao(Date.now() - Number(el.dataset.inicio))
  }

  function ligarRelogioDoMapa() {
    const precisa = !elMapa.hidden && !!elMapa.querySelector('[data-inicio]')
    if (precisa && !relogioDoMapa) relogioDoMapa = setInterval(atualizarTempos, 1000)
    else if (!precisa && relogioDoMapa) { clearInterval(relogioDoMapa); relogioDoMapa = null }
    document.body.dataset.relogioDoMapa = relogioDoMapa ? 'ligado' : 'desligado'
  }

  function abrirMapa() {
    if (!mapaAtual || !mapaAtual.total) return
    fecharSeletor({ devolverFoco: false })
    elMapa.hidden = false
    elAgentes.setAttribute('aria-expanded', 'true')
    desenharMapa()
    const primeiro = elMapaRamos.querySelector('.agente')
    ;(primeiro || elMapaFechar).focus()
  }

  function fecharMapa({ devolverFoco = true } = {}) {
    if (elMapa.hidden) return
    elMapa.hidden = true
    confirmandoParar = null
    elAgentes.setAttribute('aria-expanded', 'false')
    ligarRelogioDoMapa()
    if (devolverFoco && !elAgentes.hidden) elAgentes.focus()
  }

  function guardar() {
    try { vscode.setState(estado) } catch (e) { /* estado é conforto, não requisito */ }
  }

  // ── mensagens do host ──────────────────────────────────────────────────────

  window.addEventListener('message', evento => {
    const m = evento.data
    if (!m || !m.tipo) return

    // ⚠️ Contador de diagnóstico, e não enfeite: sem ele não há como distinguir
    // "a tela não recebeu nada do host" de "recebeu e não soube desenhar". Os dois
    // aparecem iguais para quem olha (uma tela parada), e levam a consertos opostos.
    // Foi a primeira falha da fumaça do painel, em 10/09/2026: o e-mail da conta
    // aparecia (parecia que os eventos chegavam) e o ponto de estado não mudava.
    document.body.dataset.eventos = String((+document.body.dataset.eventos || 0) + 1)
    document.body.dataset.ultimoEvento = m.tipo

    switch (m.tipo) {
      case 'estado': aplicarEstado(m.estado); break

      case 'conta':
        estado.conta = m.conta
        elConta.textContent = (m.conta && m.conta.email) || 'não identificado'
        elSair.hidden = !(m.conta && m.conta.email)
        // V14: no pé estreito o e-mail é o que encolhe (os tokens e o relógio ficam) — a dica guarda ele inteiro.
        elConta.title = [m.conta && m.conta.email, m.conta && m.conta.assinatura].filter(Boolean).join(' · ')
        guardar()
        break

      case 'pronto':
        // V15: o modelo NÃO se desenha daqui — o botão é do evento `modelo`, que traz também o esforço.
        // O modo real vem do próprio SDK na abertura — a tela não o adivinha.
        if (m.modo) { elModo.value = m.modo; aplicarAvisoDeModo(m.modo); estado.modo = m.modo }
        // ⚠️ As ferramentas ficam no `dataset` para o TESTE poder lê-las de fora — é o
        // que prova, de dentro da OFICINA, que a regra de permissao do projeto valeu (o critério 7 do
        // os criterios de pronto). Não aparecem na tela: quem trabalha não precisa da lista, e enchê-la de
        // informação técnica é o começo do "parece um formulário".
        //
        // ⚠️ `null` NÃO é lista vazia. Este evento chega duas vezes: primeiro pela
        // abertura (`initializationResult`, que não conhece as ferramentas e manda
        // `null`), depois pelo `init` de verdade. Gravar `''` no primeiro caso diria
        // "o agente não tem ferramenta nenhuma" — e um teste que lesse isso concluiria
        // que a regra de permissao do projeto bloqueou tudo.
        if (Array.isArray(m.listaDeFerramentas)) {
          document.body.dataset.ferramentas = m.listaDeFerramentas.join(',')
        }
        guardar()
        break

      case 'texto': delete document.body.dataset.semLogin; pedacoDele(m.texto); break

      case 'pensando':
        // O pensamento estendido, quando ligado. Fica DISCRETO de proposito: e
        // raciocinio, nao resposta — quem le a conversa depois quer o que ele fez, nao
        // o caminho ate la. Mas ficar MUDO era pior: o motor emitia e a tela ignorava,
        // entao com pensamento longo o painel parecia travado. Achado por uma revisao independente
        // e confirmado pelo teste da ponte em 10/09/2026.
        pedacoDePensamento(m.texto)
        break
      case 'ferramenta': linhaDeFerramenta(m.nome, m.entrada, m.mostrar); break
      case 'permissao': cartaoDePermissao(m.pedido); break

      // V4 — a execução do comando, do começo ao fim, no mesmo cartão.
      case 'comando_inicio': comandoComecou(m); break
      case 'comando_fim': comandoTerminou(m); break

      case 'comandoNaoParou': {
        // O host recusou o "parar": o comando já tinha terminado. Sem isto o botão ficava
        // desabilitado com "parando…" escrito para sempre — a mesma família do `permissaoNaoValeu`.
        const linha = elConversa.querySelector(`.execucao[data-execucao="${CSS.escape(String(m.id))}"]`)
        const texto = linha && linha.querySelector('.execucao-texto')
        if (texto && texto.textContent === 'parando…') texto.textContent = 'ele já tinha terminado'
        break
      }

      case 'permissao_retirada': {
        const cartao = elConversa.querySelector(`.permissao[data-id="${CSS.escape(m.id)}"]`)
        marcarRespondida(cartao, 'retirada')
        break
      }

      case 'tokens': mostrarTokens(m); break

      // V15 — o modelo e o esforço EM USO. `ok: false` é uma troca que não valeu: o botão já mostra o que
      // continua valendo (o evento traz o estado real), e o painel diz que não trocou.
      case 'modelo': {
        const antes = modeloAtual && modeloAtual.modelo
        mostrarModelo(m)
        document.body.dataset.respostaDoModelo = `${m.emUso || ''}|${m.esforco || ''}|${m.ok === false ? 'falhou' : 'ok'}`
        if (m.ok === false) {
          elSeletorNota.textContent = 'Não consegui trocar — segue como estava.'
          elSeletorNota.hidden = elSeletor.hidden
        } else if (m.ok === true && antes && m.modelo && antes !== m.modelo && m.nome) {
          // A troca de modelo fica na conversa: quem relê sabe de que modelo veio cada resposta.
          // O balão em andamento FECHA antes: sem isto, o texto que ainda chegava ia para o balão de cima, e a
          // linha ficava abaixo de uma resposta que continuava crescendo (fora de ordem).
          fecharBalao()
          esconderVazio()
          elConversa.appendChild(criar('div', 'ferramenta', `Modelo trocado: daqui em diante, ${m.nome}.`))
          rolarParaOFim()
        }
        break
      }
      case 'confirmarModelo': pedirConfirmacao(m); break

      // V16 — os agentes em paralelo (o mapa inteiro, pronto) e a parada que não valeu.
      case 'agentes': mostrarAgentes(m); break
      case 'agenteNaoParou':
        naoParou.add(m.id)
        if (m.motivo === 'semConfirmacao') naoConfirmou.add(m.id); else naoConfirmou.delete(m.id)
        if (!elMapa.hidden) desenharMapa()
        break

      case 'fim':
        fecharBalao()
        if (m.erro) avisoDeTurno(m.erro)
        guardar()
        break

      // V3: a revisão decidiu — pelos botões do diff, pelos do cartão, ou recusando um arquivo sujo. O
      // veredito do cartão passa a dizer o que de fato ficou no arquivo.
      case 'propostaDecidida': {
        const cartao = elConversa.querySelector(`.permissao[data-id="${CSS.escape(String(m.id))}"]`)
        if (!cartao) break
        const texto = m.classe === 'tudo' ? 'Você aceitou tudo.'
          : m.classe === 'nada' ? 'Você rejeitou tudo — o arquivo ficou como estava.'
            : m.classe === 'parcial' ? `Você aceitou ${m.aceitos} de ${m.total} trechos — já gravados.`
              : m.classe === 'suja' ? 'Recusado: você tem mudanças não salvas neste arquivo.'
              : m.classe === 'mudou' ? 'Não gravado: o arquivo mudou no disco enquanto você revisava.'
                : m.classe === 'perdida' ? 'Não valeu: o pedido já tinha sido retirado — nada foi gravado.'
                : 'Você aceitou parte, mas não consegui gravar — o agente foi avisado.'
        // O "Sempre permitir" que foi recusado NÃO trocou o modo: sem esta frase a pessoa lê que o
        // arquivo está sujo e continua achando que dali em diante ele edita sem perguntar.
        const inteiro = m.sempre ? texto + ' O "sempre" não pegou — ele vai continuar perguntando.' : texto
        const veredito = cartao.querySelector('.veredito')
        if (veredito) veredito.textContent = inteiro
        else marcarRespondida(cartao, 'decidida', inteiro)
        break
      }

      case 'permissaoNaoValeu': {
        // O host recusou a resposta: o pedido já tinha sido retirado. O cartão foi marcado
        // antes (no clique), e não pode continuar dizendo "Permitido." sobre uma ação negada.
        const cartao = elConversa.querySelector(`.permissao[data-id="${CSS.escape(String(m.id))}"]`)
        if (cartao) {
          const texto = 'Não valeu: o pedido já tinha sido retirado.'
          const veredito = cartao.querySelector('.veredito')
          if (veredito) veredito.textContent = texto
          else marcarRespondida(cartao, 'retirada')
        }
        break
      }

      case 'cancelado':
        fecharBalao()
        elConversa.appendChild(criar('div', 'ferramenta', 'Você parou.'))
        rolarParaOFim()
        break

      case 'erro': mostrarErro(m.mensagem, null, { rotulo: 'Socorro', tipo: 'socorro' }); break

      case 'naoEnviei': {
        // O host recusou a mensagem. A tela ja desenhou o balao da pessoa — se nada
        // aparecesse aqui, ela ficaria olhando a propria frase achando que foi.
        // Devolve o texto para a caixa: reescrever do zero por causa de um erro do
        // programa e cobrar da pessoa um trabalho que nao e dela.
        const balao = [...elConversa.querySelectorAll('.fala.de-voce')].pop()
        if (balao && balao.textContent === m.texto) balao.remove()
        elEntrada.value = m.texto
        ajustarAltura()
        mostrarErro(m.estado === 'abrindo'
          ? 'A conversa ainda estava abrindo — sua mensagem não foi enviada. Ela voltou para a caixa.'
          : 'Não consegui enviar: a conversa não está ativa. Sua mensagem voltou para a caixa.')
        break
      }

      case 'semPasta':
        // Nao e erro do programa: e o estado normal de uma instalacao recem-aberta.
        // Por isso o botao ABRE A PASTA em vez de "tentar de novo" — repetir a mesma
        // tentativa sem pasta daria o mesmo resultado, e a pessoa aprenderia que o
        // botao nao funciona.
        mostrarErro(m.mensagem, { rotulo: 'Abrir uma pasta', tipo: 'abrirPasta' })
        break

      case 'semLogin': {
        // V8 — o mesmo raciocínio do `semPasta`: numa instalação nova, não ter entrado na conta é
        // o estado normal, não defeito. O botão leva ao login OFICIAL do Claude (quem guarda a
        // credencial é ele, nunca a OFICINA) e a conversa recomeça sozinha quando o terminal fecha.
        // O motor avisa a cada turno sem login. A tela guarda UM cartão só, sempre depois da última
        // fala: o anterior sai e o novo entra no fim. Antes, só o cartão que já era a última coisa
        // da tela não se repetia — e cada mensagem enviada sem login somava outro cartão igual
        // (medido no build, 1 → 2 → 3).
        const ultimo = elConversa.lastElementChild
        if (ultimo && ultimo.dataset && ultimo.dataset.login === 'sim') break
        for (const velho of elConversa.querySelectorAll('[data-login="sim"]')) velho.remove()
        const cartao = mostrarErro('Você ainda não entrou na sua conta do Claude. A OFICINA trabalha com a sua ' +
          'própria conta e não guarda senha nem token. O botão abre o login oficial do Claude num ' +
          'terminal; quando terminar, feche o terminal e a conversa recomeça.',
        { rotulo: 'Entrar na minha conta', tipo: 'entrarNaConta' })
        cartao.dataset.login = 'sim'
        cartao.classList.add('convite')
        // O ponto parado e verde ("tudo certo"). Sem conta, nao esta tudo certo: a marca abaixo o
        // pinta de aviso ate a primeira resposta de verdade (`texto`) ou uma conversa nova.
        document.body.dataset.semLogin = 'sim'
        break
      }

      // V18 — os tamanhos guardados (a cada `pronto`) ou mudados por fora (outra aba, um layout aplicado, o
      // "voltar ao padrão"). Só redesenha: quem guarda é o host.
      case 'tamanhos':
        if (arrastoDaAlca) break
        escolherAlturaDaCaixa(typeof m.caixa === 'number' ? m.caixa : null, { cortar: false })
        estado.caixa = alturaDaCaixa
        guardar()
        break

      case 'limpar':
        // NOVA CONVERSA. O host já encerrou a anterior e trocou o nome da aba; a tela
        // volta ao começo — sem falas, sem custo, com o convite — e avisa que subiu de
        // novo, pela mesma porta da primeira abertura (`pronto`), que é quem abre a
        // conversa nova. Nenhum caminho paralelo de abertura para divergir do primeiro.
        //
        // O modo volta a "pergunta sempre", que é como o motor começa; o `pronto` do
        // motor novo confirma. Deixar o seletor mostrando "faz tudo sem perguntar" de
        // uma conversa que acabou seria a tela mentir sobre o modo, de novo.
        fecharBalao()
        balaoDePensamento = null
        delete document.body.dataset.semLogin
        elConversa.replaceChildren(elVazio)
        // O histórico é DA CONVERSA: a nova começa sem comando nenhum, e deixar a lista da
        // anterior no pé diria que este agente rodou coisas que ele não rodou.
        limparHistorico()
        delete document.body.dataset.ferramentas
        // A altura da caixa é da TELA, não da conversa: fica. Sem ela, a aba recriada depois de uma conversa nova
        // nascia com a caixa no automático e saltava quando o host respondia.
        estado = { falas: [], conta: estado.conta, rotuloDoModelo: estado.rotuloDoModelo, caixa: estado.caixa }
        fecharSeletor({ devolverFoco: false })
        // V16 — os agentes são da conversa: a nova começa sem nenhum (o host manda os dela, se houver).
        fecharMapa({ devolverFoco: false })
        expandidos.clear()
        naoParou.clear()
        mostrarAgentes({ total: 0, rodando: 0, rotulo: '0 agentes', agentes: [], sessao: {} })
        mostrarTokens({ texto: null })
        elModo.value = 'default'
        aplicarAvisoDeModo('default')
        guardar()
        vscode.postMessage({ tipo: 'pronto' })
        elEntrada.focus()
        break
      /*
        V6 — UM PEDIDO VINDO DO EDITOR (Explicar / Corrigir / Gerar teste / Perguntar).

        ⚠️ Ele passa pela MESMA porta de quem digita: desenha a fala e manda `enviar` ao host.
        Não há segundo caminho de envio, de propósito — um envio paralelo teria que repetir
        (e um dia esquecer) o que a porta da pessoa já faz: dar nome à aba, marcar que a
        conversa começou, e mostrar "não enviei" quando o agente ainda não está de pé.
      */
      case 'pedido': {
        const texto = String(m.texto || '')
        if (!texto) break
        falaDeVoce(texto)
        vscode.postMessage({ tipo: 'enviar', texto })
        break
      }

      case 'nota':
        // Um fato do ambiente que a pessoa precisa saber (ex.: várias pastas na janela).
        // Discreto como uma linha de ferramenta: é contexto, não erro.
        esconderVazio()
        elConversa.appendChild(criar('div', 'ferramenta', m.texto))
        rolarParaOFim()
        break

      case 'opcoes': {
        // O modo que pula aprovação só aparece com a configuração ligada de propósito
        // (`oficina.permitirPularAprovacao`) — igual à extensão oficial. Oferecer na tela um
        // modo que o produto não consegue ligar foi o defeito medido em 10/09/2026.
        const op = elModo.querySelector('option[value="bypassPermissions"]')
        if (op) { op.hidden = !m.pularAprovacao; op.disabled = !m.pularAprovacao }
        break
      }
      case 'aviso': break   // aviso é para o log do host, não para a tela da pessoa

      case 'modo':
        // ⚠️ O host responde SEMPRE, e o que ele manda e o modo QUE ESTA VALENDO —
        // nunca o que foi pedido. Entao a tela simplesmente desenha o que voltou: se a
        // troca falhou, o seletor volta sozinho para o estado real.
        //
        // Ate 10/09/2026 este `case` nao existia do outro lado: o host NAO tratava a
        // mensagem `modo`. A pessoa escolhia "faz tudo sem perguntar", o seletor mudava,
        // o aviso aparecia — e o agente continuava perguntando. A tela mentia sobre a
        // unica coisa que ela precisa acertar. Achado por uma revisao independente.
        elModo.value = m.modo
        aplicarAvisoDeModo(m.modo)
        // O modo guardado é o que VALE, não o que foi pedido — senão a aba recriada
        // reabriria mostrando o modo de uma troca que falhou.
        estado.modo = m.modo
        guardar()
        // ⚠️ Para o TESTE ler de fora se a troca valeu (mesma ideia do `ferramentas`).
        // Sem isto, "troquei o seletor e esperei 2 s" passava por "o modo ligou" — e o
        // critério do pior caso da trava ficou verde sem nunca ter ligado o modo.
        document.body.dataset.respostaDoModo = `${m.modo}|${m.ok === false ? 'falhou' : 'ok'}`
        if (m.ok === false) {
          // ⚠️ O AVISO DO MODO PEDIDO SAI DA CONVERSA. Visto no retrato de 10/09/2026,
          // noite: a troca para "faz tudo sem perguntar" falhou, o seletor voltou — e a
          // frase "a partir de agora ele faz tudo sem perguntar" continuou lá, afirmando
          // um modo que nunca ligou. Só sai o aviso que o host NÃO confirmou; o de uma
          // troca que valeu é histórico e fica.
          elConversa.querySelectorAll('.aviso-modo:not([data-confirmado])').forEach(a => {
            if (a.dataset.modo !== m.modo) a.remove()
          })
          elConversa.appendChild(criar('div', 'ferramenta', 'Não consegui trocar o modo — segue como estava.'))
          rolarParaOFim()
        } else {
          const aviso = elConversa.querySelector(`.aviso-modo[data-modo="${CSS.escape(m.modo)}"]`)
          if (aviso) aviso.dataset.confirmado = 'sim'
        }
        break

    }
  })

  // ── o que a pessoa faz ─────────────────────────────────────────────────────

  function enviar() {
    const texto = elEntrada.value.trim()
    if (!texto) return
    falaDeVoce(texto)
    vscode.postMessage({ tipo: 'enviar', texto })
    elEntrada.value = ''
    ajustarAltura()
  }

  /*
    V18 — A ALTURA DA CAIXA. `null` é o automático de sempre: cresce com o texto, de uma linha até 40% da janela.
    Com a alça, a pessoa escolhe a altura EM REPOUSO: a caixa não fica menor que ela, e o texto ainda pode
    crescer até o maior entre ela e os 40%. O teto na tela é 70% da janela (a conversa não some); o número
    guardado é o que a pessoa escolheu, e numa janela maior volta a caber inteiro.
  */
  const ALTURA_MINIMA = 32   // uma linha com o respiro (o mesmo mínimo de `tamanhos.js`)
  let alturaDaCaixa = typeof estado.caixa === 'number' ? estado.caixa : null
  const tetoDaCaixa = () => Math.max(ALTURA_MINIMA, Math.floor(window.innerHeight * 0.7))

  function ajustarAltura() {
    const escolhida = alturaDaCaixa === null ? null : Math.min(alturaDaCaixa, tetoDaCaixa())
    const teto = Math.max(escolhida || 0, Math.floor(window.innerHeight * 0.4))
    elEntrada.style.maxHeight = teto + 'px'
    elEntrada.style.height = 'auto'
    const altura = Math.min(Math.max(elEntrada.scrollHeight, escolhida || 0), teto)
    elEntrada.style.height = altura + 'px'
    elAlca.setAttribute('aria-valuemin', String(ALTURA_MINIMA))
    elAlca.setAttribute('aria-valuemax', String(tetoDaCaixa()))
    elAlca.setAttribute('aria-valuenow', String(Math.round(altura)))
    elAlca.setAttribute('aria-valuetext', escolhida === null ? `automática (${Math.round(altura)} px)` : `${Math.round(altura)} px`)
  }

  /**
   * Muda a altura escolhida (px, ou `null` para o automático) e redesenha. Não guarda.
   *
   * ⚠️ O teto da janela só vale para o que a pessoa escolhe AGORA, com a alça (ela não escolhe mais do que vê).
   * O valor que vem guardado do host (`cortar: false`) fica inteiro: foi escolhido talvez numa janela maior, e é
   * o `ajustarAltura` que corta na hora de desenhar. Cortado aqui, uma janela pequena (ou uma aba escondida, com
   * a altura zerada) gravava o valor menor, e a caixa não voltava ao tamanho escolhido quando a janela crescia.
   */
  function escolherAlturaDaCaixa(px, { cortar = true } = {}) {
    alturaDaCaixa = px === null ? null
      : Math.min(cortar ? tetoDaCaixa() : Infinity, Math.max(ALTURA_MINIMA, Math.round(px)))
    ajustarAltura()
  }

  /** Guarda no host (que guarda no perfil) e no estado da aba. Sem botão: é chamado ao soltar e a cada tecla. */
  function guardarAlturaDaCaixa() {
    estado.caixa = alturaDaCaixa
    guardar()
    vscode.postMessage({ tipo: 'tamanho', parte: 'caixa', valor: alturaDaCaixa })
  }

  let arrastoDaAlca = null
  elAlca.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return
    ev.preventDefault()
    try { elAlca.setPointerCapture(ev.pointerId) } catch { }
    arrastoDaAlca = { y: ev.clientY, altura: elEntrada.getBoundingClientRect().height }
    document.body.classList.add('arrastando-alca')
  })
  elAlca.addEventListener('pointermove', ev => {
    if (!arrastoDaAlca) return
    // Para cima, maior: a caixa cresce na direção da conversa.
    escolherAlturaDaCaixa(arrastoDaAlca.altura + (arrastoDaAlca.y - ev.clientY))
  })
  const soltarAlca = () => {
    if (!arrastoDaAlca) return
    arrastoDaAlca = null
    document.body.classList.remove('arrastando-alca')
    guardarAlturaDaCaixa()
  }
  elAlca.addEventListener('pointerup', soltarAlca)
  elAlca.addEventListener('pointercancel', soltarAlca)
  elAlca.addEventListener('lostpointercapture', soltarAlca)
  elAlca.addEventListener('dblclick', () => { escolherAlturaDaCaixa(null); guardarAlturaDaCaixa() })
  elAlca.addEventListener('keydown', ev => {
    const agora = Math.round(elEntrada.getBoundingClientRect().height)
    const passo = ev.shiftKey ? 64 : 16
    let novo
    if (ev.key === 'ArrowUp') novo = agora + passo
    else if (ev.key === 'ArrowDown') novo = agora - passo
    else if (ev.key === 'Home') novo = ALTURA_MINIMA
    else if (ev.key === 'End') novo = tetoDaCaixa()
    else if (ev.key === 'Delete' || ev.key === 'Backspace') novo = null
    else return
    ev.preventDefault()
    escolherAlturaDaCaixa(novo)
    guardarAlturaDaCaixa()
  })
  window.addEventListener('resize', ajustarAltura)

  /*
    O CURSOR VOLTA PARA A CAIXA quando a página volta a ter o foco sem ninguém ter clicado nela.
    ⚠️ MEDIDO no executável (Ctrl+Alt+B com o cursor na caixa): a caixa perde o foco, a página perde o foco, e ~50 ms
    depois o editor devolve o foco à página — a conversa é o editor ativo —, mas com NADA focado dentro dela. O cursor
    sumia da caixa, e a vista Tokens, que volta sozinha sem roubar o foco, levava a culpa. Aqui, se a caixa era o
    último lugar do cursor e a página volta sem um clique (atalho, Alt+Tab, o editor devolvendo o foco), o cursor
    volta para ela. Com um clique dentro da página, quem decide o foco é o clique (selecionar texto da conversa, um
    botão): nada é mexido.
  */
  let caixaTinhaOCursor = false
  let ultimoToque = 0
  elEntrada.addEventListener('focus', () => { caixaTinhaOCursor = true })
  document.addEventListener('focusin', ev => { if (ev.target !== elEntrada) caixaTinhaOCursor = false })
  window.addEventListener('pointerdown', () => { ultimoToque = Date.now() }, true)
  window.addEventListener('focus', () => {
    const voltou = Date.now()
    setTimeout(() => {
      if (!caixaTinhaOCursor || ultimoToque >= voltou - 50) return
      const ativo = document.activeElement
      if (ativo && ativo !== document.body && ativo !== document.documentElement) return
      elEntrada.focus({ preventScroll: true })
    }, 60)
  })

  elEnviar.addEventListener('click', enviar)
  elParar.addEventListener('click', () => vscode.postMessage({ tipo: 'cancelar' }))
  elSair.addEventListener('click', () => vscode.postMessage({ tipo: 'sair' }))

  /**
   * A troca de modo.
   *
   * ⚠️ Os dois modos que deixam o agente agir sozinho AVISAM na tela, e o aviso fica
   * enquanto o modo estiver ligado — não é um alerta que se fecha e esquece. A razão é
   * que esses modos mudam a natureza do produto: a partir dali o programa escreve nos
   * arquivos da pessoa sem parar para perguntar, e ela precisa poder olhar a tela a
   * qualquer momento e ver isso.
   */
  const MODOS_SEM_FREIO = ['acceptEdits', 'bypassPermissions']

  elModo.addEventListener('change', () => {
    const modo = elModo.value
    vscode.postMessage({ tipo: 'modo', modo })
    aplicarAvisoDeModo(modo)
    estado.modo = modo
    guardar()
  })

  function aplicarAvisoDeModo(modo) {
    document.body.dataset.modo = modo
    const semFreio = MODOS_SEM_FREIO.includes(modo)
    elModo.classList.toggle('sem-freio', semFreio)
    if (semFreio) {
      esconderVazio()
      const jaAvisou = elConversa.querySelector(`.aviso-modo[data-modo="${CSS.escape(modo)}"]`)
      if (!jaAvisou) {
        const el = criar('div', 'aviso-modo',
          modo === 'bypassPermissions'
            ? 'A partir de agora ele faz tudo sem perguntar — inclusive rodar comandos.'
            : 'A partir de agora ele edita arquivos sem perguntar.')
        el.dataset.modo = modo
        elConversa.appendChild(el)
        rolarParaOFim()
      }
    }
  }

  elEntrada.addEventListener('input', ajustarAltura)
  elEntrada.addEventListener('keydown', ev => {
    // Enter envia; Shift+Enter quebra linha. É o que a extensão oficial faz e o que a
    // mão de quem usa já sabe — trocar isso seria cobrar um aprendizado por nada.
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault()
      enviar()
    }
  })

  /*
    V15 — O PAINEL DE ESCOLHA PELO TECLADO. O botão abre (clique, Enter ou Espaço — é um `button`); na lista,
    setas para cima/baixo andam, Home/End vão às pontas, Enter escolhe; no controle do esforço, setas para os
    lados (e para cima/baixo) mudam o nível; Tab passa da lista ao esforço; Esc fecha de qualquer ponto e
    devolve o foco ao botão. Clique fora também fecha.
  */
  elModelo.addEventListener('click', () => { if (elSeletor.hidden) abrirSeletor(); else fecharSeletor() })
  elSeletorLista.addEventListener('keydown', ev => {
    const itens = elSeletorLista.children.length
    if (!itens) return
    if (ev.key === 'ArrowDown') { ativo = Math.min(itens - 1, ativo + 1) }
    else if (ev.key === 'ArrowUp') { ativo = Math.max(0, ativo - 1) }
    else if (ev.key === 'Home') { ativo = 0 }
    else if (ev.key === 'End') { ativo = itens - 1 }
    else if (ev.key === 'Enter' || ev.key === ' ') {
      const li = elSeletorLista.children[ativo]
      if (li) escolherModelo(li.dataset.valor)
    } else return
    ev.preventDefault()
    marcarAtivo()
  })
  elEsforcoControle.addEventListener('keydown', ev => {
    if (!modeloAtual) return
    const pontos = [...elEsforcoControle.querySelectorAll('.esforco-ponto')].map(p => p.dataset.nivel)
    if (!pontos.length) return
    const i = pontos.indexOf(modeloAtual.esforco)
    let novo = null
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') novo = pontos[Math.min(pontos.length - 1, i + 1)]
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') novo = pontos[Math.max(0, i < 0 ? 0 : i - 1)]
    else if (ev.key === 'Home') novo = pontos[0]
    else if (ev.key === 'End') novo = pontos[pontos.length - 1]
    else return
    ev.preventDefault()
    if (novo) escolherEsforco(novo)
  })
  elSeletorTrocar.addEventListener('click', () => {
    const valor = elSeletorConfirmar.dataset.valor
    elSeletorConfirmar.hidden = true
    if (valor) escolherModelo(valor, true)
    elSeletorLista.focus()
  })
  elSeletorManter.addEventListener('click', () => { elSeletorConfirmar.hidden = true; elSeletorLista.focus() })
  // No documento, e não só no painel: com o foco ainda no botão, o Esc também fecha.
  document.addEventListener('keydown', ev => {
    // V16: o mapa fica por cima de tudo — o Esc fecha ele primeiro (e devolve o foco ao botão dos agentes).
    if (ev.key === 'Escape' && !elMapa.hidden) { ev.preventDefault(); ev.stopPropagation(); fecharMapa(); return }
    if (ev.key === 'Escape' && !elSeletor.hidden) { ev.preventDefault(); ev.stopPropagation(); fecharSeletor() }
  })
  // V16 — o botão dos agentes abre (e fecha) o mapa; o ✕ fecha.
  elAgentes.addEventListener('click', () => { if (elMapa.hidden) abrirMapa(); else fecharMapa() })
  elMapaFechar.addEventListener('click', () => fecharMapa())
  document.addEventListener('mousedown', ev => {
    if (elSeletor.hidden) return
    if (elSeletor.contains(ev.target) || elModelo.contains(ev.target)) return
    fecharSeletor({ devolverFoco: false })
  })

  // Restaura o pouco que faz sentido restaurar quando a aba é recriada.
  if (estado.conta && estado.conta.email) { elConta.textContent = estado.conta.email; elConta.title = estado.conta.email; elSair.hidden = false }
  // V15 — só o texto do botão, até o host mandar o estado de agora (o painel de escolha espera por ele).
  if (estado.rotuloDoModelo) { elModelo.textContent = estado.rotuloDoModelo; elModelo.hidden = false }
  delete estado.modelo
  // ⚠️ O MODO NÃO SE RESTAURA. A aba recriada ganha uma conversa NOVA no host, que nasce em
  // "pergunta sempre" — restaurar o modo guardado desenhava o de uma conversa que já
  // acabou. Achado pela revisão de suposições (10/09/2026, noite): com o modo que pula
  // aprovação guardado, a reabertura escrevia "a partir de agora ele faz tudo sem
  // perguntar" ANTES de o host responder, e o aviso ficava órfão depois que o `pronto`
  // corrigia o seletor. Quem diz o modo é o host, no `pronto`.
  delete estado.modo
  // Os tokens e o relógio NÃO se restauram daqui: o host manda os de agora no `pronto`.
  delete estado.custoUsd

  // V18 — a altura que a aba guardou, antes de o host confirmar (evita a caixa piscar no tamanho automático).
  ajustarAltura()

  vscode.postMessage({ tipo: 'pronto' })
  elEntrada.focus()
})()
