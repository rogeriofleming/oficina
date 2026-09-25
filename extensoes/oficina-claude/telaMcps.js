// A VISTA "CONEXÕES" (V26) — os MCPs do Claude: quais responderam, quais precisam de você, e o que
// dá para fazer com cada um.
//
// > *"eu vou querer fazer mais um ícone lá em cima. (…) Que ele abra os MCPs para eu ver quais são os
// > MCPs conectados. E poder ver os que foram desconectados e refazer a conexão, etc."* — ele, 24/09/2026
//
// ⚠️ O `vscode` chega por parâmetro, e não por `require`, pelo mesmo motivo de `telaSkills.js`:
// `testes/tela_mcps.mjs` desenha a vista inteira em node puro, e o que se prova é a vista de verdade.
//
// ⚠️ CINCO ESTADOS DE TELA, E ELES NÃO SE CONFUNDEM — é a lição do mostrador de tokens da V24
// aplicada antes de a tela existir, e o quinto entrou porque um revisor independente mostrou que sem
// ele a tela mentia:
//
//     nunca      → ainda não medi (a vista nasce assim, e DIZ isso)
//     medindo    → estou perguntando ao Claude agora
//     lido       → esta é a resposta, e a hora em que ela foi dada
//     erro       → NÃO CONSEGUI MEDIR, com o motivo
//     naoEntendi → o Claude respondeu, e eu não reconheci a resposta
//
// O quarto jamais é desenhado como "tudo desconectado". E o QUINTO existe porque "lista vazia" tinha
// duas causas — não há servidor, ou o formato mudou e eu descartei tudo — e as duas davam a mesma
// tela, com a frase mais categórica possível: *"não há nenhum servidor configurado"*. Agora afirmar
// isso exige a prova do próprio CLI (a linha `No MCP servers configured`); sem ela, a tela diz que
// não entendeu, que é o que de fato aconteceu.
//
// ⚠️ E HÁ UM SEXTO AVISO, que não é estado e sim ressalva: a medição pode ter vindo PELA METADE (o
// tempo acabou no meio, a resposta passou do tamanho que dá para ler). Nesse caso a lista aparece,
// mas com o aviso na frente — porque "2/2 conectados" quando existiam 5 é mentira contada com
// número.
//
// ⚠️ MEDIR CUSTA, então não se mede sem motivo: o `mcp list` CONECTA em cada servidor (medido: 5,4 s
// com 11 servidores). A vista mede quando fica **visível** pela primeira vez, e remede sozinha só
// depois de 5 minutos. Duas medições não correm juntas.

'use strict'

const M = require('./mcps.js')

/** As cores semânticas do `mcps.js` viram cor do tema aqui — a vista é quem conhece o editor. */
const CORES = {
  bom: 'testing.iconPassed',
  atencao: 'notificationsWarningIcon.foreground',
  ruim: 'notificationsErrorIcon.foreground',
}

/** Quanto tempo uma medição continua valendo antes de a vista se oferecer para remedir sozinha. */
const VALIDADE_MS = 5 * 60 * 1000

/**
 * A linha de cabeçalho da vista. Ela existe porque "MCP" é uma sigla em inglês num programa em
 * português, feito para quem não é programador — e um revisor independente contou, palavra por
 * palavra, que a sigla aparecia cinco vezes na tela e **não era explicada em lugar nenhum**.
 */
const EXPLICACAO = 'Os MCPs são os programas de fora que o Claude sabe usar por você — Gmail, Agenda, Drive, e o que mais você ligar. Aqui eles são perguntados um a um, agora.'

function quandoFoi(lidoEm, agora = Date.now()) {
  const s = Math.max(0, Math.round((agora - lidoEm) / 1000))
  if (s < 10) return 'agora'
  if (s < 60) return `há ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  return `há ${h} h`
}

/**
 * @param vscode a API do editor
 * @param {{ medir: () => Promise<any>,
 *           detalhar: (nome: string) => Promise<string>,
 *           mostrarTexto: (titulo: string, texto: string) => void,
 *           avisar: (texto: string) => void,
 *           entrar: (nome: string) => void,
 *           explicarAprovacao: (nome: string) => void,
 *           avisoDaPasta?: () => (string|null),
 *           agora?: () => number }} servicos
 */
function criarTelaDeMcps(vscode, servicos) {
  const agora = servicos.agora || (() => Date.now())
  const avisar = servicos.avisar || (() => { })
  const aoMudar = new vscode.EventEmitter()

  let situacao = 'nunca'
  let itens = []
  let lidoEm = 0
  let motivo = ''
  let naoEntendidas = []
  let completo = true
  let motivoDoCorte = ''
  let avisoDaPasta = null
  let medindo = null

  function redesenhar() {
    // ⚠️ `fire()` pode estourar se a vista já foi descartada. Deixar a exceção subir daqui prendia a
    // vista em "medindo" para sempre (achado de revisor): o `medindo = null` do `finally` nunca
    // rodava. Redesenhar é o último passo de tudo, e nunca deve derrubar o que veio antes.
    try { aoMudar.fire() } catch { /* a vista já não existe; não há o que redesenhar */ }
  }

  /**
   * Mede agora. Uma medição por vez: pedir de novo no meio devolve a que já está correndo — senão
   * dois cliques no botão de atualizar abrem duas conexões a cada servidor.
   */
  function atualizar() {
    if (medindo) return medindo
    situacao = 'medindo'
    redesenhar()
    medindo = Promise.resolve()
      .then(() => servicos.medir())
      .then(r => {
        itens = Array.isArray(r && r.itens) ? r.itens : []
        naoEntendidas = Array.isArray(r && r.naoEntendidas) ? r.naoEntendidas : []
        completo = !(r && r.completo === false)
        motivoDoCorte = (r && r.motivoDoCorte) || ''
        lidoEm = (r && r.lidoEm) || agora()
        // Nenhum item e nenhuma prova de que não há nada = eu não entendi a resposta.
        situacao = (!itens.length && !(r && r.disseQueNaoHa)) ? 'naoEntendi' : 'lido'
        try { avisoDaPasta = servicos.avisoDaPasta ? servicos.avisoDaPasta() : null } catch { avisoDaPasta = null }
      })
      .catch(e => {
        // ⚠️ Aqui é onde a honestidade vive ou morre: erro NÃO vira lista vazia.
        situacao = 'erro'
        motivo = (e && e.message) ? e.message : String(e)
      })
      .then(() => { medindo = null; redesenhar() }, () => { medindo = null; redesenhar() })
    return medindo
  }

  /**
   * A vista ficou visível: mede da primeira vez, e remede se a última medição já envelheceu.
   *
   * ⚠️ `erro` e `naoEntendi` TAMBÉM remedem ao reaparecer. Antes não remediam, e o vermelho ficava
   * colado na tela até um clique — quem fecha e reabre a vista está justamente pedindo de novo.
   */
  function aoAparecer() {
    if (situacao === 'nunca' || situacao === 'erro' || situacao === 'naoEntendi') return atualizar()
    if (situacao === 'lido' && agora() - lidoEm > VALIDADE_MS) return atualizar()
    return Promise.resolve()
  }

  // ── a vista ──

  function aviso(rotulo, icone, cor, dica, comando) {
    const t = new vscode.TreeItem(rotulo, vscode.TreeItemCollapsibleState.None)
    t.id = 'aviso:' + rotulo
    t.iconPath = new vscode.ThemeIcon(icone, cor ? new vscode.ThemeColor(cor) : undefined)
    if (dica) t.tooltip = dica
    if (comando) t.command = { command: comando, title: rotulo }
    t.filhos = []
    return t
  }

  function grupo(id, rotulo, filhos) {
    const t = new vscode.TreeItem(rotulo, vscode.TreeItemCollapsibleState.Expanded)
    t.id = 'grupo:' + id
    t.contextValue = 'grupoDeMcps'
    t.filhos = filhos
    return t
  }

  function itemDoMcp(m) {
    const t = new vscode.TreeItem(m.nome, vscode.TreeItemCollapsibleState.None)
    t.id = 'mcp:' + m.nome
    t.nome = m.nome
    t.description = m.rotulo + (m.detalhe && m.estado !== 'desconhecido' ? ` — ${m.detalhe}` : '')
    t.iconPath = new vscode.ThemeIcon(m.icone, new vscode.ThemeColor(CORES[m.cor] || CORES.atencao))
    const linhas = [m.nome, '', `Estado: ${m.rotulo}`]
    if (m.detalhe) linhas.push(`Detalhe: ${m.detalhe}`)
    if (m.alvo) linhas.push('', m.alvo)
    // ⚠️ O QUE FAZER QUANDO NÃO HÁ BOTÃO fica escrito aqui. Sem isto, o estado sem ação virava um
    // beco: a pessoa via "não conectou" e nenhum caminho — e o pedido dele era justamente poder
    // refazer a conexão.
    if (m.comoDesfazer) linhas.push('', m.comoDesfazer)
    if (m.aviso) linhas.push('', '⚠️ ' + m.aviso)
    linhas.push('', 'Clique para ver a ficha completa deste servidor.')
    t.tooltip = linhas.join('\n')
    // O botão da linha é escolhido pelo `viewItem` (ver o package.json): um botão por estado, e
    // NENHUM quando não há o que fazer.
    t.contextValue = ['mcp', m.acao ? 'acao-' + m.acao : 'semAcao'].join(' ')
    if (m.podeAgir !== false) t.command = { command: 'oficina.mcps.detalhe', title: 'Ver a ficha', arguments: [m.nome] }
    return t
  }

  function raizDaVista() {
    if (situacao === 'nunca') {
      return [aviso('Ver as conexões do Claude', 'plug', undefined,
        'Perguntar ao Claude quais servidores MCP estão respondendo.\nIsto conecta em cada um, e leva alguns segundos.',
        'oficina.mcps.atualizar')]
    }
    if (situacao === 'medindo') {
      return [aviso('Perguntando ao Claude…', 'loading~spin', undefined,
        'Conectando em cada servidor MCP para ver quais respondem.')]
    }
    if (situacao === 'erro') {
      return [
        aviso('Não consegui medir', 'question', CORES.atencao,
          `Isto NÃO quer dizer que os servidores estão fora — quer dizer que não consegui perguntar.\n\n${motivo}`,
          'oficina.mcps.atualizar'),
        aviso('Tentar de novo', 'refresh', undefined, undefined, 'oficina.mcps.atualizar'),
      ]
    }
    if (situacao === 'naoEntendi') {
      const amostra = naoEntendidas.slice(0, 3).join('\n')
      return [
        aviso('Não entendi a resposta do Claude', 'question', CORES.atencao,
          'O Claude respondeu, mas num formato que este programa não reconhece — e por isso eu NÃO posso dizer ' +
          'que não há servidor nenhum: eu não sei.\n\nIsso costuma acontecer quando o Claude é atualizado e muda ' +
          'o jeito de responder.' + (amostra ? `\n\nO que ele respondeu:\n${amostra}` : ''),
          'oficina.mcps.atualizar'),
        aviso('Tentar de novo', 'refresh', undefined, undefined, 'oficina.mcps.atualizar'),
      ]
    }
    if (!itens.length) {
      return [aviso('Nenhum servidor MCP configurado', 'info', undefined,
        'O Claude respondeu, com todas as letras, que não há nenhum servidor configurado nesta pasta nem na sua conta.')]
    }

    const lista = []
    if (!completo) {
      lista.push(aviso('⚠️ Esta lista pode estar incompleta', 'warning', CORES.atencao,
        `A resposta do Claude foi cortada no meio: ${motivoDoCorte}.\nO que está abaixo é o que deu para ler — pode haver servidor que não apareceu.`,
        'oficina.mcps.atualizar'))
    }
    if (avisoDaPasta) {
      lista.push(aviso('⚠️ A pasta aberta pode estar forjando esta lista', 'warning', CORES.ruim, avisoDaPasta))
    }
    if (naoEntendidas.length) {
      lista.push(aviso(`⚠️ ${naoEntendidas.length} linha(s) que eu não entendi`, 'question', CORES.atencao,
        'O Claude respondeu isto junto com a lista, e eu não soube ler:\n\n' + naoEntendidas.slice(0, 5).join('\n')))
    }

    /*
      ⚠️ OS GRUPOS SAEM DO ESTADO LIDO, e não da ausência de botão. A primeira versão montava o grupo
      "Conectados" com `filter(i => !i.acao)` — hoje dá no mesmo, porque só o conectado não tem ação,
      mas no dia em que entrar um estado sem ação possível ele seria arquivado como "conectado"
      enquanto o resumo (que olha o estado de verdade) não o contaria. A mesma tela dizendo duas
      coisas. É o "deduzir em vez de ler" em miniatura, e um revisor independente o pegou.

      E são TRÊS grupos, não dois: "Precisam de você" agora é só quem tem ação de verdade. Antes,
      tudo que não estava conectado caía ali — inclusive quatro estados em que ele não pode fazer
      nada —, e o cabeçalho prometia trabalho que a tela não entregava.
    */
    const conectados = itens.filter(i => i.estado === 'conectado')
    const precisam = itens.filter(i => i.estado !== 'conectado' && i.acao && i.acao !== 'detalhe')
    const comProblema = itens.filter(i => i.estado !== 'conectado' && !precisam.includes(i))
    if (precisam.length) lista.push(grupo('precisam', `Precisam de você (${precisam.length})`, precisam.map(itemDoMcp)))
    if (comProblema.length) lista.push(grupo('problema', `Com problema (${comProblema.length})`, comProblema.map(itemDoMcp)))
    if (conectados.length) lista.push(grupo('conectados', `Conectados (${conectados.length})`, conectados.map(itemDoMcp)))
    return lista
  }

  const provedor = {
    onDidChangeTreeData: aoMudar.event,
    getTreeItem: t => t,
    getChildren: t => (t ? t.filhos : raizDaVista()),
  }

  /** O que vai ao lado do nome da vista: o resumo em uma linha, com a hora da medição. */
  function descricaoDaVista() {
    if (situacao === 'nunca') return ''
    if (situacao === 'medindo') return 'medindo…'
    if (situacao === 'erro') return 'não consegui medir'
    if (situacao === 'naoEntendi') return 'não entendi a resposta'
    const r = M.resumir(itens)
    if (!r.total) return `nenhum · ${quandoFoi(lidoEm, agora())}`
    const partes = [`${r.conectados}/${r.total} conectados`]
    if (r.atencao + r.parados) partes.push(`${r.atencao + r.parados} com pendência`)
    if (!completo) partes.push('lista incompleta')
    partes.push(quandoFoi(lidoEm, agora()))
    return partes.join(' · ')
  }

  /**
   * A linha fixa no alto da vista: o que é isto, e o que ESTA TELA não faz.
   *
   * ⚠️ A segunda metade é a resposta honesta ao pedido dele. O CLI não tem "reconectar": tem entrar
   * onde falta autenticação, e uma nova rodada de perguntas em todos. Dizer isso aqui é a diferença
   * entre "não foi entregue" e "foi entregue o que existe, e está escrito o que não existe".
   */
  function mensagemDaVista() {
    return EXPLICACAO +
      '\n\n"Conectar de novo em todos" (o ⟳, no alto) refaz a conexão com cada um e traz o estado novo — ' +
      'é o mais perto de "reconectar" que existe. Não há como religar UM servidor por aqui: onde falta ' +
      'autenticação, o botão "Entrar neste servidor" resolve; o resto se resolve na conversa ou no próprio serviço.'
  }

  /** O nome está na lista que o Claude acabou de dar, e dá para agir nele? */
  function podeAgirEm(nome) {
    const item = itens.find(i => i.nome === nome)
    if (!item) return { ok: false, porque: 'Este servidor não está na última lista que o Claude me deu. Peça a lista de novo (⟳) e tente outra vez.' }
    if (item.podeAgir === false) return { ok: false, porque: M.AVISO_DO_NOME }
    return { ok: true }
  }

  function alvoValido(alvo) {
    const nome = typeof alvo === 'string' ? alvo : (alvo && alvo.nome)
    if (typeof nome !== 'string' || !nome) return null
    const r = podeAgirEm(nome)
    // ⚠️ Recusa NUNCA é silêncio. Antes era: o comando dava `return` e a pessoa via um botão que não
    // fazia nada — "o botão que finge" que este produto existe para não ter.
    if (!r.ok) { avisar(r.porque); return null }
    return nome
  }

  async function verDetalhe(alvo) {
    const nome = alvoValido(alvo)
    if (!nome) return
    let texto
    try {
      texto = await servicos.detalhar(nome)
    } catch (e) {
      texto = `Não consegui ler a ficha deste servidor.\n\n${e && e.message ? e.message : String(e)}`
    }
    servicos.mostrarTexto(`MCP: ${nome}`, texto)
  }

  async function entrarNoServidor(alvo) {
    const nome = alvoValido(alvo)
    if (nome) await servicos.entrar(nome)
  }

  async function explicarAprovacao(alvo) {
    const nome = alvoValido(alvo)
    if (nome) await servicos.explicarAprovacao(nome)
  }

  return {
    provedor,
    atualizar,
    aoAparecer,
    verDetalhe,
    entrarNoServidor,
    explicarAprovacao,
    descricaoDaVista,
    mensagemDaVista,
    /** O host chama isto quando a janela volta ao foco: o "há N min" do título tem que envelhecer. */
    redesenhar,
    get situacao() { return situacao },
    get itens() { return itens },
    get motivo() { return motivo },
    get completo() { return completo },
    descartar() { aoMudar.dispose() },
  }
}

module.exports = { criarTelaDeMcps, CORES, VALIDADE_MS, EXPLICACAO, quandoFoi }
