// OS LAYOUTS COM NOME (V11) — salvar a tela do jeito que ficou, e trazer de volta quando algo desfizer.
//
// ⚠️ DUAS METADES, porque o layout mora em dois lugares:
//   1. O NÚCLEO guarda o que só ele sabe: o que está visível, o tamanho de cada parte, onde fica o
//      painel, e para onde cada grupo de vistas e cada vista foi arrastado. Uma extensão não alcança
//      isso — por isso o patch 0011 abriu dois comandos internos, e é por eles que se captura e aplica.
//   2. As CONFIGURAÇÕES que mudam a cara da tela (barra de status, barra de atividades, abas,
//      minimapa…), que a extensão lê e grava pela API dela.
//
// ⚠️ SE O COMANDO DO NÚCLEO NÃO EXISTIR (um build sem o patch), o layout é salvo e aplicado só com as
// configurações — e isso é DITO na tela. Um preset que restaura metade calado é pior do que um que
// avisa: a pessoa acreditaria que a tela voltou.
//
// ⚠️ O QUE NÃO EXISTE AQUI, de propósito: salvar sozinho de tempos em tempos. O caso que motivou o
// pedido é "um bug desfez a arrumação" — e um salvamento automático gravaria a tela JÁ desfeita por
// cima da boa. Salvar é ato da pessoa.
//   (V18: o estado CORRENTE, esse sim, se guarda sozinho — as partes do editor pelo próprio editor, a
//   caixa de escrever por `tamanhos.js`. O layout com nome continua sendo a foto que a pessoa tira.)
//
// V18 — "VOLTAR AO LAYOUT PADRÃO" também mora aqui (`voltarAoPadrao`): configurações, lugar das vistas,
// ícones da barra lateral (patch 0013), tamanho das partes (patch 0011), grupos do editor e a caixa de
// escrever. Os layouts com nome NÃO são tocados.
//
// Nada aqui usa `require('vscode')`: `testes/layout.mjs` prova tudo em node puro.

'use strict'

const CAPTURAR = '_workbench.layout.captureSnapshot'
const APLICAR = '_workbench.layout.applySnapshot'
// V18 — "Voltar ao layout padrão". Os dois primeiros são do editor de base; o terceiro, do patch 0013.
const RESETAR_VISTAS = 'workbench.action.resetViewLocations'
const IGUALAR_GRUPOS = 'workbench.action.evenEditorWidths'
const RESETAR_BARRA = '_workbench.activityBar.resetToProductDefaults'
const CHAVE = 'oficina.layout.presets'
const NOME_MAXIMO = 40

/** As configurações que mudam a cara da tela. Só estas: preset não é backup de configuração. */
const CONFIGURACOES_DO_LAYOUT = [
  'workbench.activityBar.location',
  'workbench.statusBar.visible',
  'workbench.sideBar.location',
  'workbench.editor.showTabs',
  'breadcrumbs.enabled',
  'editor.minimap.enabled',
  'window.menuBarVisibility',
  // V18: a barra de ícones não se arrasta (medido: o editor trava a largura dela), mas tem dois tamanhos.
  'workbench.activityBar.compact',
]

/** As partes que o patch 0011 captura e aplica (ids do `Parts` do núcleo). */
const PARTE = {
  lateral: 'workbench.parts.sidebar',
  painel: 'workbench.parts.panel',
  secundaria: 'workbench.parts.auxiliarybar',
}

/**
 * O padrão do núcleo 1.136.1 (`layout.ts`, `LayoutStateKeys`): barra lateral, barra secundária e painel
 * com 300 px; painel embaixo (`Position.BOTTOM` = 2), centralizado.
 *
 * ⚠️ `largura` é o TETO, não um número fixo — ver `larguraPadraoDaBarra`.
 */
const PADRAO_DO_NUCLEO = { largura: 300, larguraMinima: 170, alturaDoPainel: 300, posicaoDoPainel: 2, alinhamento: 'center' }

/**
 * A largura com que a barra lateral e a barra da direita (onde mora a vista Tokens) voltam ao padrão.
 *
 * **É a conta do próprio núcleo, e não um número nosso.** Em `layout.ts` o padrão de fábrica das duas é
 * `Math.min(300, largura da janela ÷ 4)` — um quarto da janela, com teto de 300 px. Até a V18 este código
 * mandava 300 fixo: numa janela estreita o "voltar ao padrão" devolvia uma barra MAIOR que a de fábrica e
 * espremia a conversa (medido no executável da V18: janela de 656 px → a barra da direita ficava com 218 px,
 * porque quem cortava os outros 82 era o grid, não nós).
 *
 * O PISO é 170 px, e também é do núcleo: é o `minimumWidth` das duas partes
 * (`auxiliaryBarPart.ts` e `sidebarPart.ts`). Pedir menos não encolhe nada — o grid corrige para 170 —, e
 * pedir exatamente o piso faz o número que guardamos ser o número que aparece na tela. Medido: numa janela
 * que NASCE com 640 px, o núcleo dá 170 px à barra da direita (um quarto seriam 160).
 *
 * ⚠️ `larguraDaJanela` chega pelo retrato do patch 0011. Num núcleo sem esse campo (build anterior à V19) o
 * valor é desconhecido, e aí fica o teto — que é o comportamento de antes, nunca uma adivinhação.
 */
function larguraPadraoDaBarra(larguraDaJanela) {
  const janela = Number(larguraDaJanela)
  if (!isFinite(janela) || janela <= 0) return PADRAO_DO_NUCLEO.largura
  return Math.max(PADRAO_DO_NUCLEO.larguraMinima, Math.min(PADRAO_DO_NUCLEO.largura, Math.round(janela / 4)))
}

/**
 * Os retratos que o `applySnapshot` recebe para pôr as partes no padrão, em três fases, porque uma parte
 * escondida NÃO se redimensiona (lido em `splitview.ts`: o tamanho de uma vista invisível fica preso em 0):
 *   1. `mostrar`  — painel no lugar padrão; barra lateral e barra secundária visíveis, sem tamanho;
 *   2. `medidas`  — com o retrato capturado DEPOIS da fase 1: a largura padrão, e a altura que elas já têm
 *                   (a outra dimensão vai junto no `setSize` e não pode mudar);
 *   3. `esconder` — as três fechadas, que é como a OFICINA abre.
 * ⚠️ O painel só é medido se já estava aberto: abrir o painel só para medir abre também o que mora nele
 * (o terminal cria uma sessão de shell). Fechado, ele guarda a altura que a pessoa deixou.
 *
 * ⚠️ A POSIÇÃO DO PAINEL SÓ VAI QUANDO PRECISA MUDAR, e só na fase 1. Medido no executável da V12 e lido em
 * `layout.ts`: `setPanelPosition` ABRE o painel e o remonta no grid, mesmo quando a posição é a mesma — na
 * primeira versão deste código o painel fechado abria, e a largura dada à barra lateral na fase 2 não ficava.
 * Sem o campo, o `applySnapshot` só anota "panel position" como ignorado e segue.
 */
function retratoDoPadrao(fase, atual) {
  const base = { version: 1, containers: {}, views: {} }
  const parte = nome => (atual && atual.parts && atual.parts[nome]) || null
  const semTamanho = visible => ({ visible, width: 0, height: 0 })
  if (fase === 'mostrar') {
    const painel = parte(PARTE.painel)
    const lugar = {}
    if (!atual || atual.panelPosition !== PADRAO_DO_NUCLEO.posicaoDoPainel) lugar.panelPosition = PADRAO_DO_NUCLEO.posicaoDoPainel
    if (!atual || atual.panelAlignment !== PADRAO_DO_NUCLEO.alinhamento) lugar.panelAlignment = PADRAO_DO_NUCLEO.alinhamento
    return { ...base, ...lugar, parts: { [PARTE.lateral]: semTamanho(true), [PARTE.secundaria]: semTamanho(true), [PARTE.painel]: semTamanho(!!(painel && painel.visible)) } }
  }
  if (fase === 'medidas') {
    const parts = {}
    // Um quarto da janela, com teto de 300 e piso de 170 — a conta do próprio núcleo (ver `larguraPadraoDaBarra`).
    const largura = larguraPadraoDaBarra(atual && atual.window && atual.window.width)
    for (const nome of [PARTE.lateral, PARTE.secundaria]) {
      const p = parte(nome)
      if (p && p.visible) parts[nome] = { visible: true, width: largura, height: p.height }
    }
    const painel = parte(PARTE.painel)
    if (painel && painel.visible) parts[PARTE.painel] = { visible: true, width: painel.width, height: PADRAO_DO_NUCLEO.alturaDoPainel }
    return { ...base, parts }
  }
  // ⚠️ V20 (t197): A BARRA SECUNDÁRIA VOLTA FECHADA. Até a V19 ela voltava ABERTA, porque era onde a
  // vista Tokens morava "sempre à vista". Ele desfez isso — *"esse negócio inteiro na direita não faz
  // sentido, não quero ele assim"* — e os números foram para a barra de cima (t196). Deixar o "voltar
  // ao padrão" reabrindo a barra seria o produto desfazendo a própria decisão dele a cada uso.
  return { ...base, parts: { [PARTE.lateral]: semTamanho(false), [PARTE.secundaria]: semTamanho(false), [PARTE.painel]: semTamanho(false) } }
}

/** O nome como vai ser guardado, ou o motivo de não servir. */
function validarNome(nome) {
  const limpo = String(nome == null ? '' : nome).replace(/\s+/g, ' ').trim()
  if (!limpo) return { erro: 'Dê um nome ao layout.' }
  if (limpo.length > NOME_MAXIMO) return { erro: `Nome comprido demais (até ${NOME_MAXIMO} letras).` }
  return { nome: limpo }
}

class Layouts {
  /**
   * @param {{
   *   armazenamento: { get(chave: string): any, update(chave: string, valor: any): Promise<void> },
   *   executar: (comando: string, ...args: any[]) => Promise<any>,
   *   configuracao: { inspect(chave: string): { globalValue?: any } | undefined, update(chave: string, valor: any): Promise<void> },
   *   agora?: () => Date,
   *   tamanhos?: import('./tamanhos').Tamanhos,
   * }} deps
   */
  constructor({ armazenamento, executar, configuracao, agora = () => new Date(), tamanhos = null, esperar = ms => new Promise(r => setTimeout(r, ms)) }) {
    this.esperar = esperar
    this.armazenamento = armazenamento
    this.executar = executar
    this.configuracao = configuracao
    this.agora = agora
    // V18 — os tamanhos de dentro da conversa (a caixa de escrever): um layout com nome leva junto, e o
    // "voltar ao padrão" os devolve ao automático.
    this.tamanhos = tamanhos
  }

  _todos() {
    const guardados = this.armazenamento.get(CHAVE)
    return guardados && typeof guardados === 'object' ? guardados : {}
  }

  /** Os layouts salvos, do mais recente para o mais antigo. */
  listar() {
    return Object.entries(this._todos())
      .map(([nome, p]) => ({ nome, salvoEm: p.salvoEm, completo: !!p.nucleo }))
      .sort((a, b) => String(b.salvoEm).localeCompare(String(a.salvoEm)))
  }

  existe(nome) {
    return Object.prototype.hasOwnProperty.call(this._todos(), nome)
  }

  /** Captura a tela agora e guarda com este nome. Devolve `{ nome, completo }` ou `{ erro }`. */
  async salvar(nomeDigitado) {
    const v = validarNome(nomeDigitado)
    if (v.erro) return v
    let nucleo = null
    try {
      nucleo = await this.executar(CAPTURAR)
    } catch {
      nucleo = null
    }
    if (!nucleo || nucleo.version !== 1) nucleo = null
    const config = {}
    for (const chave of CONFIGURACOES_DO_LAYOUT) {
      const i = this.configuracao.inspect(chave)
      // Só o valor que a PESSOA definiu. O padrão do programa não é guardado: se ele mudar numa
      // versão nova, o preset não deve congelar o padrão antigo.
      config[chave] = i && i.globalValue !== undefined ? i.globalValue : null
    }
    const tamanhos = this.tamanhos ? this.tamanhos.ler() : undefined
    const todos = { ...this._todos(), [v.nome]: { salvoEm: this.agora().toISOString(), nucleo, config, ...(tamanhos ? { tamanhos } : {}) } }
    await this.armazenamento.update(CHAVE, todos)
    return { nome: v.nome, completo: !!nucleo }
  }

  /**
   * Põe a tela de volta. Devolve `{ nome, completo, ignorados }` ou `{ erro }`.
   * `completo: false` quer dizer: só as configurações voltaram (sem a parte do núcleo).
   */
  async aplicar(nome) {
    const p = this._todos()[nome]
    if (!p) return { erro: `Não há layout chamado "${nome}".` }

    // Configurações primeiro: mudar a posição da barra lateral depois de dar tamanho a ela desfaria o tamanho.
    for (const chave of CONFIGURACOES_DO_LAYOUT) {
      if (!p.config || !(chave in p.config)) continue
      try {
        await this.configuracao.update(chave, p.config[chave] === null ? undefined : p.config[chave])
      } catch { }
    }
    // V18 — a caixa de escrever do jeito que estava. Layout salvo antes da V18 não tem, e não mexe nela.
    if (this.tamanhos && p.tamanhos) { try { await this.tamanhos.aplicar(p.tamanhos) } catch { } }

    if (!p.nucleo) return { nome, completo: false, ignorados: [], motivo: 'salvo sem a parte do núcleo' }
    let resposta = null
    try {
      resposta = await this.executar(APLICAR, p.nucleo)
    } catch {
      resposta = null
    }
    if (!resposta || !Array.isArray(resposta.skipped)) {
      return { nome, completo: false, ignorados: [], motivo: 'este programa não sabe aplicar a parte do núcleo' }
    }
    return { nome, completo: true, ignorados: resposta.skipped }
  }

  /**
   * V18 — VOLTAR AO LAYOUT PADRÃO: desfaz o que foi arrastado, redimensionado e fixado. NÃO apaga os
   * layouts com nome (eles moram noutra chave, que esta função não toca).
   *
   * Ordem: configurações primeiro (o lado da barra lateral desfaria o resto); depois ONDE as coisas moram
   * (vistas, e os ícones da barra, que dependem de os contêineres estarem de volta nela); por último o
   * tamanho e a visibilidade das partes, os grupos do editor e o que é nosso.
   *
   * Devolve `{ voltou: string[], faltou: { parte, motivo }[], painelFechado }` — o que não voltou é DITO,
   * como no layout com nome: a pessoa não pode acreditar que tudo voltou quando uma parte ficou.
   */
  async voltarAoPadrao() {
    const voltou = []
    const faltou = []
    /*
      ⚠️ SÓ SE DIZ QUE VOLTOU O QUE VOLTOU. Antes, o erro de cada gravação era engolido e a frase dizia "voltou"
      assim mesmo. E o "voltar" mexe no perfil (alvo Global): um valor que a PASTA aberta define no
      `.vscode/settings.json` dela continua valendo por cima — a pessoa é avisada, e o arquivo do projeto não é
      tocado (é dela, e pode estar no Git).
    */
    const naoGravou = []
    const daPasta = []
    for (const chave of CONFIGURACOES_DO_LAYOUT) {
      try { await this.configuracao.update(chave, undefined) } catch { naoGravou.push(chave) }
      try {
        const i = typeof this.configuracao.inspect === 'function' ? this.configuracao.inspect(chave) : null
        if (i && (i.workspaceValue !== undefined || i.workspaceFolderValue !== undefined)) daPasta.push(chave)
      } catch { }
    }
    if (!naoGravou.length && !daPasta.length) voltou.push('as configurações da tela')
    if (naoGravou.length) faltou.push({ parte: `as configurações ${naoGravou.join(', ')}`, motivo: 'não consegui gravar' })
    if (daPasta.length) {
      faltou.push({ parte: `as configurações ${daPasta.join(', ')}`, motivo: 'a pasta aberta define o próprio valor, no .vscode/settings.json dela' })
    }

    try { await this.executar(RESETAR_VISTAS); voltou.push('o lugar das vistas') }
    catch { faltou.push({ parte: 'o lugar das vistas', motivo: 'o editor recusou' }) }

    let barra = null
    try { barra = await this.executar(RESETAR_BARRA) } catch { barra = null }
    if (barra && Array.isArray(barra.pinned)) voltou.push('os ícones da barra lateral')
    else faltou.push({ parte: 'os ícones fixados na barra lateral', motivo: 'este programa não sabe fazer isso' })

    const partes = await this._partesAoPadrao()
    if (partes.ok) voltou.push('o tamanho das partes')
    else faltou.push({ parte: 'o tamanho e a visibilidade das partes', motivo: 'este programa não informou o tamanho delas' })

    try { await this.executar(IGUALAR_GRUPOS); voltou.push('a largura dos grupos de editor') } catch { }

    if (this.tamanhos) {
      try { await this.tamanhos.voltarAoPadrao(); voltou.push('a caixa de escrever') }
      catch { faltou.push({ parte: 'a caixa de escrever', motivo: 'não consegui gravar' }) }
    }
    return { voltou, faltou, painelFechado: !!partes.painelFechado }
  }

  /** As três fases de `retratoDoPadrao`. Sem o patch 0011 (captura que não responde), não mexe em nada. */
  async _partesAoPadrao() {
    const capturar = async () => {
      try { const r = await this.executar(CAPTURAR); return r && r.version === 1 ? r : null } catch { return null }
    }
    const aplicar = async retrato => {
      try { const r = await this.executar(APLICAR, retrato); return !!r && Array.isArray(r.skipped) } catch { return false }
    }
    const antes = await capturar()
    if (!antes) return { ok: false }
    if (!await aplicar(retratoDoPadrao('mostrar', antes))) return { ok: false }
    const mostrado = await capturar()
    // Depois da fase 1, o painel está como a pessoa o deixou: aberto ou fechado. Se ele teve de mudar de lugar, o
    // núcleo o abriu para movê-lo e a mesma chamada o fechou de novo (a fase 1 manda a visibilidade de antes) — ele
    // pisca, mas termina fechado. `painelFechado` é, portanto, o estado de antes, e é o que a frase conta.
    const painelFechado = !(mostrado && mostrado.parts && mostrado.parts[PARTE.painel] && mostrado.parts[PARTE.painel].visible)
    if (!mostrado || !await aplicar(retratoDoPadrao('medidas', mostrado))) return { ok: false }
    if (!await aplicar(retratoDoPadrao('esconder', mostrado))) return { ok: false }
    /*
      ⚠️ CONFERIR QUE FICOU FECHADO. Medido no build 1 da V18: com o TERMINAL no painel, a fase 3 fecha o painel e o
      núcleo o reabre ~12 ms depois (a classe `nopanel` entra e sai), com a altura nova. Sem o terminal (Problemas, por
      exemplo) ele fica fechado. Quem reabre não foi confirmado; por isso a conferência lê o estado em vez de supor a
      causa: se o painel voltou, fecha de novo — no máximo três vezes.
      Custo: um quarto de segundo a mais no "voltar", e o painel pisca quando o terminal o reabre.
    */
    for (let i = 0; i < 3; i++) {
      await this.esperar(250)
      const depois = await capturar()
      const painel = depois && depois.parts && depois.parts[PARTE.painel]
      if (!painel || !painel.visible) break
      if (!await aplicar(retratoDoPadrao('esconder', depois))) break
    }
    return { ok: true, painelFechado }
  }

  async excluir(nome) {
    if (!this.existe(nome)) return false
    const todos = { ...this._todos() }
    delete todos[nome]
    await this.armazenamento.update(CHAVE, todos)
    return true
  }
}

/** A frase que a pessoa lê depois de aplicar. */
function fraseDoResultado(r) {
  if (r.erro) return r.erro
  if (!r.completo) {
    return `Layout "${r.nome}" aplicado só em parte: as configurações voltaram, mas a posição e o tamanho das partes não (${r.motivo}).`
  }
  const n = r.ignorados.length
  if (!n) return `Layout "${r.nome}" aplicado.`
  return `Layout "${r.nome}" aplicado. ` + (n === 1
    ? '1 item não existe mais nesta instalação e ficou de fora.'
    : `${n} itens não existem mais nesta instalação e ficaram de fora.`)
}

/** V18 — a frase depois de "Voltar ao layout padrão". Os layouts com nome são citados sempre: é a dúvida de quem clicou. */
function fraseDoPadrao(r) {
  const fim = ' Os layouts com nome continuam salvos.'
  const painel = r.painelFechado ? ' O painel de baixo estava fechado e guarda a altura que você deixou.' : ''
  if (!r.faltou || !r.faltou.length) return 'A tela voltou ao layout padrão.' + painel + fim
  const partes = r.faltou.map(f => `${f.parte} (${f.motivo})`).join('; ')
  return `A tela voltou ao layout padrão, menos ${partes}.` + painel + fim
}

module.exports = {
  Layouts, validarNome, fraseDoResultado, fraseDoPadrao, retratoDoPadrao, CONFIGURACOES_DO_LAYOUT, CAPTURAR, APLICAR, CHAVE, NOME_MAXIMO,
  RESETAR_VISTAS, IGUALAR_GRUPOS, RESETAR_BARRA, PARTE, PADRAO_DO_NUCLEO, larguraPadraoDaBarra,
}
