// A TELA DAS CONVERSAS — a lista que abre, retoma, renomeia, etiqueta e procura.
//
// ⚠️ Este é o único arquivo da versão das conversas que importa `vscode`. O que sabe ler,
// medir e escrever é `sessoes.js`, sem interface nenhuma — é o que deixa a parte difícil
// testável em `node` puro, e sobra aqui só o desenho.
//
// ⚠️ POR QUE O SELETOR DO EDITOR, E NÃO UMA TELA NOSSA.
//
// A tentação era desenhar mais uma webview. Três razões contra, nesta ordem:
//   1. É a lista que o editor já usa para tudo (arquivos, comandos, ramos do git) — a
//      pessoa já sabe usar antes de a gente explicar: digita e filtra, setas andam, Enter
//      escolhe, Esc some.
//   2. Ela herda o tema, a fonte e o realce da busca de graça, e continua certa quando o
//      tema mudar. Uma tela nossa teria que perseguir isso para sempre.
//   3. Teclado e leitor de tela já funcionam. Numa webview, tudo isso é trabalho nosso —
//      e trabalho nosso que ninguém testa é trabalho que quebra calado.
//
// O que ela NÃO faz de graça, e por isso está escrito aqui: mostrar modelo e custo (que
// custam a leitura da conversa, e por isso chegam depois, sem travar a lista) e a busca
// dentro do texto das conversas (o filtro do seletor só olha o que já está na tela).

'use strict'

const vscode = require('vscode')
const { Sessoes } = require('./sessoes.js')
const { tokens, dinheiro, nomeDoModelo } = require('./formato.js')

/** Quantas conversas são medidas assim que a lista abre. O resto, ao passar por cima. */
const MEDIR_DE_CARA = 20

const ICONE = {
  retomar: new vscode.ThemeIcon('debug-continue'),
  renomear: new vscode.ThemeIcon('edit'),
  etiquetar: new vscode.ThemeIcon('tag'),
  procurar: new vscode.ThemeIcon('search'),
  copia: new vscode.ThemeIcon('git-branch'),
}

/**
 * Quando foi, em português de gente.
 *
 * ⚠️ "há 3 dias" é o tipo de frase que fica errada sozinha se for calculada de qualquer
 * jeito: o cálculo é sobre o dia do calendário, não sobre 24 horas. Sem isso, uma conversa
 * das 23h de ontem vista às 8h de hoje sairia como "hoje", porque não completou um dia.
 */
function quando(ms) {
  if (!ms) return 'sem data'
  const agora = new Date()
  const data = new Date(ms)
  const soODia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dias = Math.round((soODia(agora) - soODia(data)) / 86400000)
  const hora = data.toTimeString().slice(0, 5)
  // ⚠️ Data no FUTURO existe: relógio dessincronizado, fuso, metadado estranho. Sem esta linha
  // saía "há -2 dias", que é texto quebrado na cara de quem lê. Achado por revisão independente
  // em 12/09/2026.
  if (dias < 0) return data.toLocaleDateString('pt-BR') + ' ' + hora
  if (dias === 0) return `hoje ${hora}`
  if (dias === 1) return `ontem ${hora}`
  if (dias < 7) return `há ${dias} dias`
  return data.toLocaleDateString('pt-BR')
}

// `tokens`, `dinheiro` e `nomeDoModelo` moram em `formato.js` desde a V10: a vista de tokens
// fala dos mesmos números, e duas cópias da mesma frase divergem.

/** A linha de baixo de cada item: quando, modelo, custo, tamanho. */
function detalhe(conversa, medida) {
  const partes = [quando(conversa.modificadaEm)]
  if (medida) {
    const modelo = nomeDoModelo(medida.modelo)
    if (modelo) partes.push(modelo)
    const custo = dinheiro(medida.custoUsd)
    if (custo) partes.push(custo)
    // ⚠️ Quando o preço de algum modelo da conversa é desconhecido, o total é PARCIAL — e
    // a tela diz isso. Um valor incompleto mostrado como completo é um valor errado.
    else if (medida.faltouPrecoDeAlgumModelo) partes.push('custo não sei (modelo fora da tabela)')
    const t = tokens(medida.tokens)
    if (t) partes.push(t)
  } else {
    partes.push('medindo…')
  }
  if (conversa.ramo) partes.push('ramo ' + conversa.ramo)
  return partes.join(' · ')
}

function paraItem(conversa, medida) {
  return {
    label: conversa.titulo,
    description: conversa.etiqueta ? '$(tag) ' + conversa.etiqueta : '',
    detail: detalhe(conversa, medida),
    // ⚠️ Cada botão carrega um `acao` próprio, e é POR ELE que o clique é reconhecido — nunca
    // pelo texto do tooltip. Com a comparação por texto, mudar uma palavra da dica (ou traduzir
    // a interface) quebrava o botão EM SILÊNCIO: o clique simplesmente não fazia nada, sem erro
    // nenhum. Achado por revisão independente em 12/09/2026.
    buttons: [
      { iconPath: ICONE.renomear, tooltip: 'Dar um nome a esta conversa', acao: 'renomear' },
      { iconPath: ICONE.etiquetar, tooltip: 'Etiquetar', acao: 'etiquetar' },
      { iconPath: ICONE.copia, tooltip: 'Continuar numa CÓPIA (a original fica intacta)', acao: 'copia' },
    ],
    conversa,
    medida,
  }
}

/**
 * Abre a lista de conversas da pasta.
 *
 * @param {object} deps
 * @param {() => string} deps.pastaDoProjeto
 * @param {(escolha: {id: string, titulo: string, bifurcar: boolean}) => Promise<void>} deps.aoRetomar
 */
async function abrirLista({ pastaDoProjeto, aoRetomar }) {
  const pasta = pastaDoProjeto()
  if (!pasta) {
    vscode.window.showInformationMessage('A OFICINA guarda as conversas por pasta — abra uma pasta primeiro.')
    return
  }

  const arquivo = new Sessoes({ cwd: pasta })
  const seletor = vscode.window.createQuickPick()
  seletor.title = 'Conversas desta pasta'
  // ⚠️ CURTO de propósito. A primeira versão dizia "Filtre pelo título, ou use a lupa para
  // procurar DENTRO das conversas": o editor mostra a dica longa como balão flutuante, e na
  // foto de 12/09/2026 esse balão cobria o TÍTULO da própria lista. Dica é dica, não manual.
  seletor.placeholder = 'Filtre pelo título — ou use a lupa'
  seletor.matchOnDetail = true
  seletor.matchOnDescription = true
  seletor.buttons = [{ iconPath: ICONE.procurar, tooltip: 'Procurar dentro das conversas', acao: 'procurar' }]
  seletor.busy = true
  seletor.show()

  let conversas = []
  const medidas = new Map()
  let vivo = true
  /*
    ⚠️ EM QUE MODO A LISTA ESTÁ — e por que isto não é firula.

    A medição de modelo e custo roda em segundo plano e chama `redesenhar()` a cada medida que
    chega. `redesenhar()` repovoa a tela a partir de `conversas`. Se a pessoa abrir a lupa nesse
    meio-tempo, uma medida atrasada podia repovoar a tela com as conversas de ANTES da procura —
    por cima do resultado — e um Enter naquele instante abriria a conversa errada.
    Achado por revisão independente em 12/09/2026.

    Com o modo, `redesenhar()` só desenha quando a tela ainda é a lista.
  */
  let modo = 'lista'
  /** A procura em curso, para uma nova poder cancelar a anterior (ver o botão da lupa). */
  let procuraEmCurso = null
  seletor.onDidHide(() => {
    vivo = false
    if (procuraEmCurso) procuraEmCurso.abort()
    seletor.dispose()
  })

  /*
    ⚠️ AQUI HOUVE UM CONSERTO QUE FOI DESFEITO, e o registro fica porque a lição é sobre método.

    Ao escrever o teste da medição sob demanda, 25 setas para baixo moviam o foco só 3 posições.
    Concluí que a culpa era desta função — cada medida reescreve `seletor.items`, e navegar
    brigaria com o redesenho — e agrupei os redesenhos num temporizador. **Não mudou nada.**

    Só então medi o que devia ter medido primeiro: uma sonda que aperta uma seta e lê a posição,
    seta a seta. Resultado: 1 → 2 → 3 → 4 → 5 → 6 → 7, uma posição por tecla, com `aria-setsize`
    em 22. A navegação estava PERFEITA; o teste é que mandava as teclas rápido demais e o editor
    as descartava. O agrupamento foi removido: corrigia um defeito que não existia, e o comentário
    que o justificava afirmava como defeito do produto o que era artefato do instrumento.
  */
  const redesenhar = () => {
    if (!vivo || modo !== 'lista') return
    const ativo = seletor.activeItems[0]
    seletor.items = conversas.map(c => paraItem(c, medidas.get(c.id)))
    // Sem isto, cada medida que chega joga a seleção de volta para o topo enquanto a
    // pessoa está navegando — a lista "pula na mão".
    if (ativo && ativo.conversa) {
      const igual = seletor.items.find(i => i.conversa && i.conversa.id === ativo.conversa.id)
      if (igual) seletor.activeItems = [igual]
    }
  }


  try {
    conversas = await arquivo.listar()
  } catch (e) {
    seletor.hide()
    vscode.window.showErrorMessage('Não consegui ler as conversas: ' + (e && e.message))
    return
  }
  seletor.busy = false

  if (!conversas.length) {
    seletor.items = [{ label: 'Nenhuma conversa nesta pasta ainda', detail: 'A primeira aparece aqui depois que você conversar.' }]
  } else {
    redesenhar()
  }

  /** Mede uma conversa e redesenha a linha dela. Falha aqui não estraga a lista. */
  const medir = async conversa => {
    if (!conversa || medidas.has(conversa.id)) return
    try {
      const m = await arquivo.medir(conversa.id, { modificadaEm: conversa.modificadaEm })
      if (m) { medidas.set(conversa.id, m); redesenhar() }
    } catch { /* a linha fica sem modelo e custo — a lista continua servindo */ }
  }

  // As primeiras chegam sozinhas; as outras, quando a pessoa passa por cima.
  ;(async () => {
    for (const c of conversas.slice(0, MEDIR_DE_CARA)) {
      if (!vivo) return
      await medir(c)
    }
  })()
  seletor.onDidChangeActive(itens => { const i = itens[0]; if (i && i.conversa) medir(i.conversa) })

  // ── Retomar ────────────────────────────────────────────────────────────────
  seletor.onDidAccept(async () => {
    const item = seletor.activeItems[0]
    if (!item || !item.conversa) return
    seletor.hide()
    await aoRetomar({ id: item.conversa.id, titulo: item.conversa.titulo, bifurcar: false })
  })

  // ── Os botões de cada linha ────────────────────────────────────────────────
  seletor.onDidTriggerItemButton(async ({ item, button }) => {
    const c = item.conversa
    if (!c) return

    if (button.acao === 'renomear') {
      const nome = await vscode.window.showInputBox({
        title: 'Nome desta conversa',
        value: c.temTituloProprio ? c.titulo : '',
        placeHolder: c.titulo,
        prompt: 'O nome vale também no `claude` do terminal — quem guarda é ele, não a OFICINA.',
      })
      if (nome == null) return
      try {
        const posto = await arquivo.renomear(c.id, nome)
        c.titulo = posto
        c.temTituloProprio = true
        redesenhar()
      } catch (e) { vscode.window.showErrorMessage('Não consegui renomear: ' + (e && e.message)) }
      return
    }

    if (button.acao === 'etiquetar') {
      const etiqueta = await vscode.window.showInputBox({
        title: 'Etiqueta desta conversa',
        value: c.etiqueta || '',
        prompt: 'Deixe em branco para tirar a etiqueta.',
      })
      if (etiqueta == null) return
      try {
        c.etiqueta = await arquivo.etiquetar(c.id, etiqueta)
        redesenhar()
      } catch (e) { vscode.window.showErrorMessage('Não consegui etiquetar: ' + (e && e.message)) }
      return
    }

    if (button.acao === 'copia') {
      seletor.hide()
      await aoRetomar({ id: c.id, titulo: c.titulo, bifurcar: true })
    }
  })

  // ── Procurar dentro das conversas ──────────────────────────────────────────
  seletor.onDidTriggerButton(async botao => {
    if (botao.acao !== 'procurar') return
    const termo = await vscode.window.showInputBox({
      title: 'Procurar dentro das conversas',
      prompt: 'Procura no que foi escrito e no que foi respondido. Acento não faz diferença.',
    })
    if (!termo) return

    // ⚠️ UMA PROCURA POR VEZ. Sem isto, clicar na lupa de novo antes de a primeira terminar
    // deixava DUAS varreduras correndo, cada uma escrevendo no título e nos itens: quem
    // terminasse por último vencia, e não necessariamente a procura mais recente — a pessoa
    // via o resultado da pergunta anterior. Achado na mesma revisão.
    if (procuraEmCurso) procuraEmCurso.abort()
    const controle = new AbortController()
    procuraEmCurso = controle
    modo = 'busca'
    seletor.busy = true
    seletor.title = `Procurando "${termo}"…`
    seletor.items = []

    let resultado
    try {
      resultado = await arquivo.buscar(termo, {
        sinal: controle.signal,
        aoAndar: ({ lidas, total, achados }) => {
          if (vivo && !controle.signal.aborted) seletor.title = `Procurando "${termo}" — ${lidas} de ${total}, ${achados} encontrada(s)`
        },
      })
    } catch (e) {
      seletor.busy = false
      vscode.window.showErrorMessage('A procura falhou: ' + (e && e.message))
      return
    } finally { if (procuraEmCurso === controle) procuraEmCurso = null }

    // ⚠️ Uma procura abortada NÃO desenha: se ela foi cancelada, é porque a tela fechou ou uma
    // procura mais nova tomou o lugar dela — pintar aqui seria escrever por cima da atual.
    if (!vivo || controle.signal.aborted) return
    seletor.busy = false
    seletor.title = `"${resultado.termo}" — ${resultado.achados.length} conversa(s)`
    conversas = resultado.achados
    if (!conversas.length) {
      seletor.items = [{ label: `Não achei "${resultado.termo}" em nenhuma conversa desta pasta`, detail: `Procurei em ${resultado.conversasLidas}.` }]
      return
    }
    seletor.items = resultado.achados.map(c => {
      const item = paraItem(c, medidas.get(c.id))
      // No resultado da procura, o trecho achado vale mais do que o custo — é o que faz a
      // pessoa reconhecer a conversa que ela está procurando.
      item.detail = `${c.ocorrencias}× · ${c.quem === 'pessoa' ? 'você disse' : 'o agente disse'}: ${c.trecho}`
      // ⚠️ A etiqueta NÃO some no resultado da busca. Antes, a data sobrescrevia a descrição
      // inteira e a conversa etiquetada perdia o selo justamente na tela em que a pessoa está
      // procurando por ela. Os dois cabem. Achado por revisão independente em 12/09/2026.
      item.description = (c.etiqueta ? '$(tag) ' + c.etiqueta + ' · ' : '') + quando(c.modificadaEm)
      return item
    })
  })
}

module.exports = { abrirLista, quando, tokens, dinheiro, nomeDoModelo, detalhe }
