// A TELA DE SKILLS (V12) — a vista "Skills": clicar usa, estrela favorita, olho oculta, arrastar reordena.
//
// ⚠️ O `vscode` chega por parâmetro, e não por `require`, pelo mesmo motivo de `telaTokens.js`:
// `testes/tela_skills.mjs` desenha a vista inteira em node puro, e o que se prova é a vista de verdade.
//
// ⚠️ UMA VISTA DO EDITOR, e não uma webview: herda tema, fonte, teclado e leitor de tela, e o arrastar
// é o do próprio editor (`TreeDragAndDropController`), com a mesma sensação de arrastar um arquivo.
//
// ⚠️ OCULTA FICA CINZA PELA DECORAÇÃO, não por um ícone só. Uma vista do editor não tem cor de texto por
// item; o caminho que o editor oferece é a decoração de recurso (a mesma que pinta arquivo ignorado pelo
// git). Por isso cada skill tem um endereço próprio, no esquema `oficina-skill`, que não abre nada.
//
// ⚠️ A LISTA SÓ EXISTE DEPOIS DE UMA CONVERSA ABRIR NESTA PASTA. Quem conhece as skills é o agente; antes
// dele, a vista diz isso em vez de ficar vazia. Da segunda vez em diante, ela nasce com a última lista lida.

'use strict'

const crypto = require('crypto')
const S = require('./skills.js')

const ESQUEMA = 'oficina-skill'
const MIME = 'application/vnd.code.tree.oficina.skills'

/**
 * @param vscode a API do editor
 * @param {{ perfil: { get(k: string): any, update(k: string, v: any): Thenable<void> },
 *           pasta: { get(k: string): any, update(k: string, v: any): Thenable<void> } }} armazenamento
 *   `perfil` guarda a ordem, as favoritas e as ocultas; `pasta` guarda a lista lida nesta pasta.
 */
function criarTelaDeSkills(vscode, { perfil, pasta }) {
  const aoMudar = new vscode.EventEmitter()
  const aoMudarDecoracao = new vscode.EventEmitter()

  let itens = S.classificarTodos(pasta.get(S.CHAVE_DA_LISTA))
  const preferencias = () => S.normalizarPreferencias(perfil.get(S.CHAVE_DAS_PREFERENCIAS))
  let organizados = S.organizar(itens, preferencias())

  const endereco = nome => vscode.Uri.from({ scheme: ESQUEMA, path: '/' + nome })

  /*
    ⚠️ A FICHA DO CLIQUE (revisão de segurança, 16/09/2026). `oficina.skills.usar` é um comando como
    qualquer outro: outra extensão instalada, a paleta ou um link `command:` conseguem chamá-lo. Só com o
    nome, um `executeCommand('oficina.skills.usar', 'x')` mandava `/x` para a conversa sem clique nenhum —
    a mesma classe de defeito dos botões de aceitar da revisão, consertada lá exigindo a URI da proposta.
    Aqui o equivalente é esta ficha: aleatória e nascida com a vista. Sem a ficha certa, e sem o nome estar
    na lista que o agente mandou, não há pedido.

    ⚠️ O QUE ELA NÃO BARRA (revisão independente, 16/09/2026, lido no editor da tag): o editor não manda
    os argumentos do item para a tela; ele os guarda no processo das extensões e registra um comando
    intermediário (`__vsc<uuid>`) com uma chave que é só um contador. Outra extensão instalada acha esse
    comando e reexecuta o clique, com a ficha certa. A ficha fecha a paleta e o link `command:`; contra uma
    extensão maliciosa, que roda no MESMO processo e poderia até carregar estes módulos, não há barreira
    dentro da extensão — risco aceito, como o dos comandos internos do layout.
  */
  const ficha = crypto.randomBytes(16).toString('hex')

  function redesenhar() {
    organizados = S.organizar(itens, preferencias())
    aoMudar.fire()
    aoMudarDecoracao.fire(undefined)
  }

  async function gravarPreferencias(p) {
    await perfil.update(S.CHAVE_DAS_PREFERENCIAS, p)
    redesenhar()
  }

  /** A lista nova do agente SUBSTITUI a anterior (é o que o SDK manda fazer). */
  async function receberLista(comandos) {
    if (!Array.isArray(comandos)) return
    const novos = S.classificarTodos(comandos)
    itens = novos
    await pasta.update(S.CHAVE_DA_LISTA, comandos.map(c => c && ({ name: c.name, description: c.description, argumentHint: c.argumentHint })))
    redesenhar()
  }

  // ── a vista ──

  function grupo(id, rotulo, filhos, aberto) {
    const t = new vscode.TreeItem(rotulo, aberto ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
    t.id = 'grupo:' + id
    t.contextValue = 'grupoDeSkills'
    t.filhos = filhos
    return t
  }

  function itemDaSkill(s) {
    const t = new vscode.TreeItem(s.nome, vscode.TreeItemCollapsibleState.None)
    t.id = 'skill:' + s.nome
    t.nome = s.nome
    t.description = s.oculta ? 'oculta' : s.descricao
    t.resourceUri = endereco(s.nome)
    t.iconPath = new vscode.ThemeIcon(s.favorita ? 'star-full' : s.oculta ? 'eye-closed' : s.origem === 'programa' ? 'terminal' : 'book')
    const linhas = ['/' + s.nome + (s.argumentos ? ' ' + s.argumentos : '')]
    if (s.descricao) linhas.push('', s.descricao)
    linhas.push('', 'Clique para o agente usar.')
    t.tooltip = linhas.join('\n')
    // Os botões da linha escolhem pelo `viewItem` (ver o package.json): cada estado mostra o botão contrário.
    t.contextValue = ['skill', s.favorita ? 'favorita' : 'naoFavorita', s.oculta ? 'oculta' : 'visivel'].join(' ')
    t.command = { command: 'oficina.skills.usar', title: 'Usar a skill', arguments: [s.nome, ficha] }
    return t
  }

  function raizDaVista() {
    if (!itens.length) {
      const t = new vscode.TreeItem('Abra a conversa para ver as skills', vscode.TreeItemCollapsibleState.None)
      t.iconPath = new vscode.ThemeIcon('info')
      t.tooltip = 'Quem conhece as skills é o agente: a lista chega quando uma conversa abre nesta pasta (Ctrl+T).'
      t.command = { command: 'oficina.abrirConversaOuExplicar', title: 'Abrir a conversa' }
      t.filhos = []
      return [t]
    }
    const lista = [grupo('pessoa', `Suas skills (${organizados.daPessoa.length})`, organizados.daPessoa.map(itemDaSkill), true)]
    if (organizados.doPrograma.length) {
      lista.push(grupo('programa', `Do programa (${organizados.doPrograma.length})`, organizados.doPrograma.map(itemDaSkill), false))
    }
    return lista
  }

  const provedor = {
    onDidChangeTreeData: aoMudar.event,
    getTreeItem: t => t,
    getChildren: t => (t ? t.filhos : raizDaVista()),
  }

  const decoracao = {
    onDidChangeFileDecorations: aoMudarDecoracao.event,
    provideFileDecoration(uri) {
      if (!uri || uri.scheme !== ESQUEMA) return undefined
      const nome = String(uri.path || '').replace(/^\//, '')
      if (!preferencias().ocultas.includes(nome)) return undefined
      return { color: new vscode.ThemeColor('disabledForeground'), tooltip: 'Oculta' }
    },
  }

  const visiveis = () => [...organizados.daPessoa, ...organizados.doPrograma].map(s => s.nome)

  const arrastar = {
    dragMimeTypes: [MIME],
    dropMimeTypes: [MIME],
    handleDrag(fonte, transferencia) {
      const nomes = (fonte || []).map(t => t && t.nome).filter(Boolean)
      if (nomes.length) transferencia.set(MIME, new vscode.DataTransferItem(nomes))
    },
    async handleDrop(alvo, transferencia) {
      const pacote = transferencia.get(MIME)
      if (!pacote) return
      let nomes = pacote.value
      if (!Array.isArray(nomes)) {
        try { nomes = JSON.parse(await pacote.asString()) } catch { return }
      }
      if (!Array.isArray(nomes) || !nomes.length) return
      // Solto em cima de uma skill: fica antes dela. Solto num grupo ou no vazio: vai para o fim.
      const antesDe = alvo && alvo.nome ? alvo.nome : null
      await gravarPreferencias(S.mover(preferencias(), visiveis(), nomes.filter(n => typeof n === 'string'), antesDe))
    },
  }

  const nomeDe = alvo => (typeof alvo === 'string' ? alvo : alvo && alvo.nome) || null

  return {
    provedor,
    decoracao,
    arrastar,
    receberLista,
    /** O clique é da vista, e o nome é um que o agente listou? Só então o host monta o pedido. */
    cliqueValido(nome, fichaRecebida) {
      return typeof fichaRecebida === 'string' && fichaRecebida === ficha && itens.some(i => i.nome === nome)
    },
    async alternarFavorita(alvo) { const n = nomeDe(alvo); if (n) await gravarPreferencias(S.alternar(preferencias(), n, 'favoritas')) },
    async alternarOculta(alvo) { const n = nomeDe(alvo); if (n) await gravarPreferencias(S.alternar(preferencias(), n, 'ocultas')) },
    async recomecar() { await gravarPreferencias(S.normalizarPreferencias(null)) },
    get organizados() { return organizados },
    get quantas() { return itens.length },
    /*
      ⚠️ DUAS JANELAS (revisão de suposições, 16/09/2026). A arrumação mora no perfil, que as janelas
      dividem, mas a vista só se redesenhava pelo que acontecia NELA: favoritar numa janela não aparecia na
      outra. O host chama isto quando a janela volta a ter foco, e as preferências são relidas do perfil.
    */
    redesenhar,
    descartar() { aoMudar.dispose(); aoMudarDecoracao.dispose() },
  }
}

module.exports = { criarTelaDeSkills, ESQUEMA, MIME }
