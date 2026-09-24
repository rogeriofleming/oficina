// A REVISÃO NO EDITOR (V3) — a mudança que o agente propõe aparece no editor de diff do núcleo, EM
// LINHA (o esboço escolhido na P2), com "✓ Aceitar trecho / ✕ Rejeitar trecho" em cada trecho e
// "Aceitar tudo / Rejeitar tudo" na barra de abas. Nada grava sem a pessoa decidir.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE FOI MEDIDO ANTES DE ESCREVER (11/09/2026, no executável e no SDK real):
//
//   M1. Se quem grava é o SDK, o arquivo ABERTO recarrega sozinho e UM Ctrl+Z desfaz só aquela
//       mudança (o núcleo empilha a recarga como uma edição). Por isso, antes de deixar o SDK gravar,
//       o arquivo real é aberto.
//   M2. O `allow` do SDK não carrega mensagem: aceitar só parte pelo `allow` faria o agente acreditar
//       que gravou tudo. Parcial é gravado AQUI (WorkspaceEdit + salvar) e o agente ouve a verdade num
//       `deny` (ver `responderProposta` no motor).
//   M3. `vscode.diff` + `diffEditor.renderSideBySide=false` abre em linha; o CodeLens só aparece com
//       `diffEditor.codeLens=true` (o diff o desliga por padrão); o clique de mouse chega ao comando.
//
// ⚠️ A PROPOSTA É SOMENTE LEITURA. Ela só muda pelos botões. Custo desta escolha: some a seta nativa de
// "reverter trecho" do diff e a pessoa não edita a proposta à mão — em troca, o que a tela mostra e o
// que a revisão sabe nunca divergem (um trecho revertido pela seta nativa não passaria por aqui).
// ─────────────────────────────────────────────────────────────────────────────

const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const P = require('./proposta')

const ESQUEMA_ANTES = 'oficina-antes'
const ESQUEMA_PROPOSTA = 'oficina-proposta'

/** O pedido tem uma proposta que dá para mostrar como diff? */
function temDiff(pedido) {
  return !!(pedido && pedido.proposta && !pedido.proposta.erro && Array.isArray(pedido.proposta.trechos))
}

/**
 * O pedido como a TELA o recebe. Com diff, sem o conteúdo: a mudança está no editor, e mandar um
 * arquivo de megabytes para a webview só para ela não mostrar seria peso à toa. Sem diff (erro,
 * caminho de rede, grande demais), a tela recebe o pedido como na V2 — com o conteúdo à vista.
 */
function resumoParaTela(pedido) {
  if (!pedido || !pedido.proposta) return pedido
  if (!temDiff(pedido)) {
    const { proposta, ...resto } = pedido
    return resto
  }
  const p = pedido.proposta
  const primeiro = p.trechos[0]
  return {
    ...pedido,
    entrada: { file_path: p.caminho },
    proposta: { nome: path.basename(p.caminho), novo: !!p.novo, trechos: p.trechos.length,
      linha: primeiro ? primeiro.inicioDepois + 1 : 1 },
  }
}

/**
 * Mesmo arquivo? Pelo caminho REAL — uma junção, um link ou um nome curto (8.3) apontam para o mesmo
 * arquivo com outro texto, e a checagem de "arquivo sujo" se enganava (revisão de suposições da V3).
 * No Windows, caixa não importa. ⚠️ Caminho de rede não é resolvido: resolver toca o servidor.
 */
function caminhoReal(p) {
  const s = String(p)
  if (/^[\\/]{2}/.test(s)) return path.resolve(s)
  try { return fs.realpathSync.native(s) } catch { return path.resolve(s) }
}
function mesmoCaminho(a, b) {
  const x = caminhoReal(a), y = caminhoReal(b)
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

class Revisoes {
  constructor() {
    this._porId = new Map()        // id do pedido -> revisão
    this._conteudo = new Map()     // uri.toString() -> texto
    this._versao = new Map()       // uri.toString() -> contador (o `mtime` da proposta)
    this._mudou = new vscode.EventEmitter()
    this._botoesMudaram = new vscode.EventEmitter()
    // Quem fala com a tela é a extensão; ela troca estes dois quando liga um painel.
    this.aoAvisar = () => { }
    this.aoDecidir = () => { }
  }

  registrar(context) {
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(ESQUEMA_ANTES, {
        provideTextDocumentContent: u => this._conteudo.get(u.toString()) || '',
      }),
      vscode.workspace.registerFileSystemProvider(ESQUEMA_PROPOSTA, this._sistemaDeArquivos(),
        { isCaseSensitive: true, isReadonly: true }),
      vscode.languages.registerCodeLensProvider({ scheme: ESQUEMA_PROPOSTA }, {
        onDidChangeCodeLenses: this._botoesMudaram.event,
        provideCodeLenses: doc => this._botoesDosTrechos(doc),
      }),
      vscode.commands.registerCommand('oficina.aceitarTrecho', (id, trecho) => this.decidirTrecho(id, trecho, 'aceito')),
      vscode.commands.registerCommand('oficina.rejeitarTrecho', (id, trecho) => this.decidirTrecho(id, trecho, 'rejeitado')),
      // ⚠️ SÓ COM A URI DA PROPOSTA (cyber da V3). Sem argumento, o comando caía na "aba ativa" e
      // aprovava sem clique nenhum — pela paleta, por outra extensão, por um link `command:`. O botão da
      // barra de abas é quem passa a uri; sem ela, não há decisão.
      vscode.commands.registerCommand('oficina.aceitarTudo', uri => this.decidirTudo(this._idDaUri(uri), 'aceito')),
      vscode.commands.registerCommand('oficina.rejeitarTudo', uri => this.decidirTudo(this._idDaUri(uri), 'rejeitado')),
    )
  }

  tem(id) { return this._porId.has(id) }

  /**
   * Abre a revisão de um pedido. Arquivo aberto e SUJO: recusa na hora — nunca sobrescrever calado.
   * Devolve `true` se a revisão abriu.
   */
  async abrir(conversa, pedido) {
    const p = pedido.proposta
    const nome = path.basename(p.caminho)
    const aberto = this._documentoAberto(p.caminho)
    if (aberto && aberto.isDirty) {
      this._recusarSuja(conversa, pedido.id, nome)
      return false
    }
    const r = {
      id: pedido.id, conversa, caminho: p.caminho, nome, novo: !!p.novo,
      antes: p.antes, depois: p.depois, trechos: p.trechos,
      estado: new Map(p.trechos.map(t => [t.id, 'pendente'])),
      uriAntes: vscode.Uri.from({ scheme: ESQUEMA_ANTES, path: `/${pedido.id}/${nome}` }),
      uriProposta: vscode.Uri.from({ scheme: ESQUEMA_PROPOSTA, path: `/${pedido.id}/${nome}` }),
      concluindo: false,
    }
    this._porId.set(r.id, r)
    this._conteudo.set(r.uriAntes.toString(), r.antes)
    this._conteudo.set(r.uriProposta.toString(), r.depois)
    // O arquivo real carregado ANTES de qualquer gravação: é o que faz o desfazer ser uma operação (M1).
    if (!r.novo) {
      try { r.documento = await vscode.workspace.openTextDocument(vscode.Uri.file(r.caminho)) } catch { }
    }
    await this.mostrar(r.id)
    return true
  }

  /**
   * Traz a aba do diff (o clique na ficha do cartão).
   * ⚠️ NA COLUNA EM QUE A ABA JÁ ESTÁ. `Beside` quer dizer "ao lado da ativa": clicar na ficha com o
   * diff aberto abria um SEGUNDO diff da mesma proposta, num grupo novo (revisão funcional da V3,
   * medido 2 de 2 no editor). Achando a aba cujo lado modificado é a uri desta proposta, o mesmo
   * `vscode.diff` na coluna dela traz a que existe.
   */
  async mostrar(id) {
    const r = this._porId.get(id)
    if (!r) return false
    await vscode.commands.executeCommand('vscode.diff', r.uriAntes, r.uriProposta,
      `${r.nome} — proposta do agente`,
      { preview: false, viewColumn: this._colunaDaAba(r) || vscode.ViewColumn.Beside })
    return true
  }

  /** Em que coluna está a aba desta proposta, se já estiver aberta? */
  _colunaDaAba(r) {
    const alvo = r.uriProposta.toString()
    for (const grupo of vscode.window.tabGroups.all || []) {
      for (const aba of grupo.tabs || []) {
        const e = aba.input
        if (e && e.modified && e.modified.toString() === alvo) return grupo.viewColumn || null
      }
    }
    return null
  }

  async decidirTrecho(id, idDoTrecho, estado) {
    const r = this._porId.get(id)
    if (!r || r.concluindo || !r.estado.has(idDoTrecho)) return false
    r.estado.set(idDoTrecho, estado)
    this._redesenhar(r)
    if ([...r.estado.values()].every(v => v !== 'pendente')) await this._concluir(r)
    return true
  }

  /**
   * "Aceitar tudo" aceita o que ainda está pendente (um trecho já rejeitado continua rejeitado);
   * "Rejeitar tudo" rejeita tudo — nada foi gravado ainda, então nada do que foi aceito vale.
   */
  async decidirTudo(id, estado) {
    const r = this._porId.get(id)
    if (!r || r.concluindo) return false
    for (const k of r.estado.keys()) {
      if (estado === 'rejeitado' || r.estado.get(k) === 'pendente') r.estado.set(k, estado)
    }
    await this._concluir(r)
    return true
  }

  /** O pedido morreu no motor (Parar, conversa encerrada): a aba fecha, e nada mais acontece. */
  async retirar(id) {
    const r = this._porId.get(id)
    if (!r) return
    r.concluindo = true
    this._esquecer(r)
    await this._fecharAbas(r)
  }

  // ── por dentro ─────────────────────────────────────────────────────────────

  async _concluir(r) {
    if (r.concluindo) return
    r.concluindo = true
    const aceitos = r.trechos.filter(t => r.estado.get(t.id) === 'aceito').map(t => t.id)
    const final = P.combinar(r.antes, r.trechos, aceitos)
    const classe = P.classificar(r.antes, r.depois, final)
    try {
      await this._fecharAbas(r)
      if (classe === 'nada') {
        // ⚠️ O VEREDITO DA TELA SAI DO RETORNO DO MOTOR, não da intenção. Um `false` aqui quer dizer que
        // o pedido já tinha sido retirado (Parar, ou o cartão decidindo ao mesmo tempo) — e a tela dizia
        // "Você aceitou tudo." sobre um pedido que o agente ouviu como cancelado (revisão de código da V3).
        return this._avisarDecisao(r, r.conversa.responderProposta(r.id, final) ? 'nada' : 'perdida', aceitos)
      }
      // A pessoa pode ter mexido no arquivo real enquanto revisava: confere de novo.
      const aberto = this._documentoAberto(r.caminho)
      if (aberto && aberto.isDirty) {
        this._recusarSuja(r.conversa, r.id, r.nome)
        return
      }
      // ⚠️ E o DISCO ainda é o que ela viu? Git, outra janela da OFICINA ou um script podem ter mudado o
      // arquivo durante a revisão — gravar agora descartaria essa mudança sem ninguém ver (revisão de
      // suposições da V3). O que ela aprovou foi uma mudança sobre o "antes"; sem o "antes", não vale.
      if (!this._discoIgualAoAntes(r)) {
        this._recusarMudou(r)
        return
      }
      if (classe === 'tudo') {
        // Quem grava é o SDK; o arquivo aberto recarrega e o Ctrl+Z desfaz numa operação (M1).
        if (!r.novo) await this._mostrarArquivo(r.caminho)
        return this._avisarDecisao(r, r.conversa.responderProposta(r.id, final) ? 'tudo' : 'perdida', aceitos)
      }
      // ⚠️ NO PARCIAL QUEM GRAVA É O EDITOR — então o pedido precisa estar VIVO antes de o arquivo mudar.
      // Fechar a aba e abrir o documento levam tempo, e nessa janela cabe o botão Parar: o agente já
      // ouviu "você cancelou" e o editor gravava depois, deixando o arquivo mudado com ele convencido do
      // contrário (revisão de código da V3). Sem pedido, nada é gravado.
      if (!this._vivo(r)) return this._avisarDecisao(r, 'perdida', aceitos)
      const gravou = await this._gravarPeloEditor(r, final)
      const valeu = r.conversa.responderProposta(r.id, final, { aceitos })
      return this._avisarDecisao(r, valeu ? (gravou ? 'parcial' : 'parcial_falhou') : 'perdida', aceitos)
    } finally {
      this._esquecer(r)
    }
  }

  /**
   * "Permitir" / "Sempre permitir" vindo do CARTÃO num pedido que tem revisão aberta: quem grava é o
   * SDK, e as duas conferências que protegem o arquivo — trabalho não salvo e disco mudado durante a
   * revisão — moravam só nos botões do diff. Por esta porta elas eram puladas e o SDK gravava por
   * cima do que a pessoa não tinha salvo (revisão de código da V3).
   * Devolve `false` só quando não havia o que decidir (o cartão avisa a tela).
   */
  async liberar(id, decisao) {
    const r = this._porId.get(id)
    if (!r || r.concluindo) return false
    r.concluindo = true
    try {
      await this._fecharAbas(r)
      // ⚠️ Recusando aqui, o `responderPermissao` nunca roda — e com ele não roda o `trocarModo`: o
      // "sempre" que a pessoa clicou NÃO pegou, e o agente vai continuar perguntando. A tela precisa
      // dizer isso; sem essa palavra ela lê só "o arquivo está sujo" e fica achando que o modo mudou.
      const sempre = decisao === 'permitir_sempre' ? { sempre: true } : null
      const aberto = this._documentoAberto(r.caminho)
      if (aberto && aberto.isDirty) {
        this._recusarSuja(r.conversa, r.id, r.nome, sempre)
        return true
      }
      if (!this._discoIgualAoAntes(r)) {
        this._recusarMudou(r, sempre)
        return true
      }
      if (!r.novo) await this._mostrarArquivo(r.caminho)
      const valeu = r.conversa.responderPermissao(id, decisao)
      this._avisarDecisao(r, valeu ? 'tudo' : 'perdida', r.trechos.map(t => t.id))
      return true
    } finally {
      this._esquecer(r)
    }
  }

  /** Parcial: o editor grava — WorkspaceEdit (entra no desfazer) e salvar. */
  async _gravarPeloEditor(r, final) {
    try {
      const uri = vscode.Uri.file(r.caminho)
      const doc = await vscode.workspace.openTextDocument(uri)
      // ⚠️ Na quebra de linha DO ARQUIVO. O `final` vem normalizado para `\n`; gravado assim num arquivo
      // CRLF, todas as linhas — inclusive as que ninguém tocou — perdiam o `\r` (revisão de suposições da V3).
      const texto = doc.eol === vscode.EndOfLine.CRLF ? final.replace(/\n/g, '\r\n') : final
      const edicao = new vscode.WorkspaceEdit()
      edicao.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), texto)
      if (!await vscode.workspace.applyEdit(edicao)) return false
      const salvou = await doc.save()
      await this._mostrarArquivo(r.caminho)
      return salvou === true
    } catch (e) {
      console.log('[oficina] nao gravei o parcial: ' + (e && e.message))
      return false
    }
  }

  /**
   * ⚠️ O RETORNO DO MOTOR DECIDE O QUE A TELA DIZ, aqui também. Se o pedido já tinha sido retirado, esta
   * recusa não chegou a ninguém — e a tela escrevia "recusado porque o arquivo está sujo" sobre um cartão
   * que o motor já não tinha. É a mesma família do achado que o conserto fechou nas classes de decisão.
   * `extra` leva o que a porta de entrada sabe e esta função não: se veio de um "Sempre permitir".
   */
  _recusarSuja(conversa, id, nome, extra) {
    const valeu = conversa.responderPermissao(id, 'negar',
      `A pessoa tem mudanças não salvas em ${nome}. A OFICINA não sobrescreve trabalho não salvo: nada foi gravado. ` +
      'Peça para ela salvar ou descartar as mudanças e tente de novo.')
    if (!valeu) return this.aoDecidir({ id, classe: 'perdida', nome, ...(extra || {}) })
    this.aoAvisar(`Você tem mudanças não salvas em ${nome}. Recusei a mudança do agente para não sobrescrever o seu ` +
      'trabalho — salve ou descarte, e peça de novo.')
    this.aoDecidir({ id, classe: 'suja', nome, ...(extra || {}) })
  }

  /**
   * O pedido ainda está de pé no motor? (Parar e a conversa encerrada o retiram por baixo.)
   * ⚠️ Sem o método no motor isto responde NÃO, e o parcial não grava. É de propósito: um padrão
   * permissivo aqui transformaria um motor trocado em gravação sem dono, calada.
   */
  _vivo(r) {
    return !!r.conversa && typeof r.conversa.temPermissao === 'function' && r.conversa.temPermissao(r.id)
  }

  /** O disco ainda tem o "antes" que a pessoa viu? Arquivo novo: continua não existindo. */
  _discoIgualAoAntes(r) {
    try {
      if (r.novo) return !fs.existsSync(r.caminho)
      return P.normalizar(fs.readFileSync(r.caminho, 'utf8')) === r.antes
    } catch { return false }
  }

  _recusarMudou(r, extra) {
    const valeu = r.conversa.responderPermissao(r.id, 'negar',
      `${r.nome} mudou no disco enquanto a pessoa revisava a proposta. Nada foi gravado. ` +
      'Leia o arquivo de novo e, se ainda fizer sentido, proponha a mudança outra vez.')
    if (!valeu) return this.aoDecidir({ id: r.id, classe: 'perdida', nome: r.nome, ...(extra || {}) })
    this.aoAvisar(`${r.nome} mudou no disco enquanto você revisava — não gravei nada por cima. ` +
      'O agente vai precisar propor de novo.')
    this.aoDecidir({ id: r.id, classe: 'mudou', nome: r.nome, ...(extra || {}) })
  }

  _avisarDecisao(r, classe, aceitos) {
    this.aoDecidir({ id: r.id, classe, nome: r.nome, aceitos: aceitos.length, total: r.trechos.length })
  }

  _esquecer(r) {
    this._porId.delete(r.id)
    this._conteudo.delete(r.uriAntes.toString())
    this._conteudo.delete(r.uriProposta.toString())
  }

  async _fecharAbas(r) {
    const alvo = r.uriProposta.toString()
    for (const grupo of vscode.window.tabGroups.all) {
      for (const aba of grupo.tabs) {
        const e = aba.input
        if (e && e.modified && e.modified.toString() === alvo) {
          try { await vscode.window.tabGroups.close(aba) } catch { }
        }
      }
    }
  }

  /**
   * Traz o arquivo REAL para a tela antes de o SDK gravar — é o que faz o desfazer ser uma operação (M1).
   *
   * ⚠️ `preview: false`, E NÃO pré-visualização. Aba de pré-visualização é a aba em itálico que a
   * PRÓXIMA pré-visualização do mesmo grupo substitui. Numa refatoração de vários arquivos — o critério
   * de pronto da V3 — o segundo arquivo fechava a aba do primeiro, e com a aba fechada não há onde
   * apertar Ctrl+Z: a promessa da M1 valia só para o último arquivo. O critério da refatoração pegou
   * isto de forma intermitente (ele passava quando as três decisões vinham pela barra de abas e caía
   * quando uma vinha pelo cartão, porque `Beside` é "ao lado da ATIVA" e a ativa muda com o botão
   * usado) — e critério que muda de resposta sem o código mudar não serve de porta.
   * Custo desta escolha: a pessoa termina uma refatoração de 10 arquivos com 10 abas abertas, em vez de
   * uma só. É o preço de o desfazer existir em cada um deles.
   *
   * E na coluna em que o arquivo JÁ está, se estiver aberto — senão cada decisão abre o mesmo arquivo
   * num grupo novo.
   */
  async _mostrarArquivo(caminho) {
    try {
      await vscode.window.showTextDocument(vscode.Uri.file(caminho),
        { preview: false, preserveFocus: true,
          viewColumn: this._colunaDoArquivo(caminho) || vscode.ViewColumn.Beside })
    } catch { }
  }

  /** Em que coluna está a aba deste arquivo, se já estiver aberta? */
  _colunaDoArquivo(caminho) {
    for (const grupo of vscode.window.tabGroups.all || []) {
      for (const aba of grupo.tabs || []) {
        const e = aba.input
        const uri = e && e.uri
        if (uri && uri.scheme === 'file' && mesmoCaminho(uri.fsPath, caminho)) return grupo.viewColumn || null
      }
    }
    return null
  }

  _documentoAberto(caminho) {
    return (vscode.workspace.textDocuments || []).find(d => d.uri && d.uri.scheme === 'file' && mesmoCaminho(d.uri.fsPath, caminho))
  }

  /** A uri da proposta diz de qual pedido ela é: `/<id>/<nome>`. Outra coisa (ou nada) não é pedido nenhum. */
  _idDaUri(uri) {
    if (!uri || uri.scheme !== ESQUEMA_PROPOSTA) return null
    return String(uri.path).split('/').filter(Boolean)[0] || null
  }

  _porUri(uri) {
    return this._porId.get(this._idDaUri(uri)) || null
  }

  /** O que a proposta mostra agora: tudo menos os trechos rejeitados. */
  _redesenhar(r) {
    const mostrar = r.trechos.filter(t => r.estado.get(t.id) !== 'rejeitado').map(t => t.id)
    const chave = r.uriProposta.toString()
    this._conteudo.set(chave, P.combinar(r.antes, r.trechos, mostrar))
    this._versao.set(chave, (this._versao.get(chave) || 0) + 1)
    this._mudou.fire([{ type: vscode.FileChangeType.Changed, uri: r.uriProposta }])
    this._botoesMudaram.fire()
  }

  _botoesDosTrechos(doc) {
    const r = this._porUri(doc.uri)
    if (!r || r.concluindo) return []
    const botoes = []
    let deslocamento = 0   // linhas a mais (ou a menos) que a proposta tem em relação ao antes, até aqui
    for (const t of [...r.trechos].sort((a, b) => a.inicioAntes - b.inicioAntes)) {
      const estado = r.estado.get(t.id)
      if (estado === 'rejeitado') continue   // o trecho sumiu da proposta; as linhas antigas seguem no lugar
      const linha = Math.max(0, Math.min(t.inicioAntes + deslocamento, doc.lineCount - 1))
      deslocamento += t.adicionadas.length - t.removidas.length
      const faixa = new vscode.Range(linha, 0, linha, 0)
      if (estado === 'aceito') {
        botoes.push(new vscode.CodeLens(faixa, { title: '✓ aceito', command: '' }))
      } else {
        botoes.push(
          new vscode.CodeLens(faixa, { title: '✓ Aceitar trecho', command: 'oficina.aceitarTrecho', arguments: [r.id, t.id] }),
          new vscode.CodeLens(faixa, { title: '✕ Rejeitar trecho', command: 'oficina.rejeitarTrecho', arguments: [r.id, t.id] }))
      }
    }
    return botoes
  }

  _sistemaDeArquivos() {
    const self = this
    return {
      onDidChangeFile: self._mudou.event,
      watch: () => new vscode.Disposable(() => { }),
      stat: u => ({ type: vscode.FileType.File, ctime: 0, mtime: self._versao.get(u.toString()) || 0,
        size: Buffer.byteLength(self._conteudo.get(u.toString()) || '') }),
      readDirectory: () => [],
      createDirectory: () => { },
      readFile: u => Buffer.from(self._conteudo.get(u.toString()) || '', 'utf8'),
      writeFile: () => { throw vscode.FileSystemError.NoPermissions('a proposta só muda pelos botões') },
      delete: () => { },
      rename: () => { },
    }
  }
}

module.exports = { Revisoes, temDiff, resumoParaTela, ESQUEMA_ANTES, ESQUEMA_PROPOSTA }
