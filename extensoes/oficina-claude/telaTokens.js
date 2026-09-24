// A TELA DE TOKENS — a barra de status e a vista "Tokens" (V10).
//
// ⚠️ O `vscode` chega por parâmetro, e não por `require`. Assim `testes/tela_tokens.mjs` desenha a
// tela inteira em node puro, com um editor de mentira, e o que se prova é a tela de verdade.
//
// ⚠️ POR QUE UMA VISTA DO EDITOR, E NÃO UMA JANELA NOSSA. Mesmas razões da lista das conversas:
// herda tema, fonte, teclado e leitor de tela, e não há webview para manter. E, de propósito, NÃO
// existe uma faixa flutuante sempre por cima das janelas: seria um segundo programa Electron para
// manter vivo, e é o tipo de peça que some sozinha. A barra de status já fica sempre visível.
//
// ⚠️ QUANDO LÊ O DISCO. A conversa só muda enquanto o agente trabalha. Então: a cada 3 s enquanto
// ele pensa, espera permissão ou está parando; uma leitura ao fim de cada resposta; e nada parado.
// A leitura é incremental (`tokens.js`), então conversa longa não custa mais a cada volta.
//
// V14 — O PÉ DA CONVERSA. Os mesmos números vão para a linha de baixo da conversa (`ligarPe`), sempre,
// sem configuração que os esconda, junto com o RELÓGIO DO CACHE (`relogioCache.js`). O relógio anda
// sozinho: um único temporizador, marcado para o instante em que o número de minutos muda — uma vez por
// minuto no cache de 1 h, nenhuma depois de vencido. Ele não relê o disco: só refaz a conta com a hora.

'use strict'

const T = require('./tokens.js')
const F = require('./formato.js')
const R = require('./relogioCache.js')

const INTERVALO_MS = 3000
const ESTADOS_QUE_ESCREVEM = new Set(['pensando', 'esperando_permissao', 'cancelando'])
/** Folga depois da virada do minuto, para o número já ter mudado quando a conta for refeita. */
const FOLGA_DO_TIQUE_MS = 50

function criarTelaDeTokens(vscode, {
  raiz = null, agendar = setInterval, desagendar = clearInterval, atrasar = setTimeout,
  marcar = setTimeout, desmarcar = clearTimeout, agora = Date.now,
} = {}) {
  const barra = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  barra.name = 'Tokens da conversa'
  barra.command = 'oficina.tokens.abrir'

  let medidor = null
  let sessao = null
  let resumo = null
  let relogio = null
  /** O agente está escrevendo agora? Guardado à parte do relógio: trocar de conversa desliga o relógio, não o trabalho. */
  let trabalhando = false
  let situacao = 'semConversa'   // semConversa | aguardandoPrimeiraResposta | medindo | semArquivo
  const aoMudar = new vscode.EventEmitter()

  /** O pé da conversa (o host liga a tela aberta aqui). Recebe o que desenhar, já pronto. */
  let aoPublicar = null
  let ultimoPe = { tipo: 'tokens', texto: null, dica: '', relogio: null }
  let tique = null

  function pararTique() {
    if (tique) { desmarcar(tique); tique = null }
  }

  function dicaDosNumeros() {
    const linhas = [
      `Contexto agora: ${F.tokens(resumo.contextoAgora) || '0 tokens'} (o tamanho da conversa)`,
      `Processado: ${F.tokens(resumo.tokens) || '0 tokens'} (tudo que já passou pelo modelo)`,
    ]
    if (resumo.custoUsd != null) {
      linhas.push(`Custo: ${F.dinheiro(resumo.custoUsd)}${resumo.faltouPreco ? ' (sem o modelo que não tem preço)' : ''}`)
      linhas.push(`* estimativa pela tabela da API de ${resumo.tabelaDe}. Em assinatura, não é cobrança.`)
    }
    return linhas
  }

  /** Monta o que o pé mostra, publica, e marca o próximo tique do relógio. */
  function publicarPe() {
    pararTique()
    const medindo = !!resumo && situacao === 'medindo'
    const texto = medindo ? T.textoDaBarra(resumo) : null
    const e = medindo ? R.estadoDoRelogio(resumo.cache, agora()) : null
    ultimoPe = {
      tipo: 'tokens',
      texto,
      dica: medindo ? dicaDosNumeros().join('\n') + '\nClique para ver o detalhe.' : '',
      relogio: e ? { minutos: e.minutos, fracao: e.fracao, vencido: e.vencido, suposto: e.suposto, dica: R.dicaDoRelogio(e) } : null,
    }
    if (e && !e.vencido) tique = marcar(publicarPe, e.proximaMudancaMs + FOLGA_DO_TIQUE_MS)
    if (aoPublicar) { try { aoPublicar(ultimoPe) } catch { } }
  }

  function desenharBarra() {
    publicarPe()
    const texto = resumo && situacao === 'medindo' ? T.textoDaBarra(resumo) : null
    if (!texto) { barra.hide(); return }
    barra.text = '$(pulse) ' + texto
    barra.tooltip = dicaDosNumeros().join('\n')
    barra.show()
  }

  function ler() {
    if (!sessao) return
    if (!medidor) {
      const arquivo = T.acharTranscrito(sessao, raiz || T.diretorioDeProjetos())
      if (!arquivo) { situacao = 'semArquivo'; resumo = null; desenharBarra(); aoMudar.fire(); return }
      medidor = new T.MedidorDaConversa(arquivo, { agora })
    }
    if (medidor.atualizar() || situacao !== 'medindo') {
      resumo = medidor.resumo()
      situacao = 'medindo'
      desenharBarra()
      aoMudar.fire()
    }
  }

  function pararRelogio() {
    if (relogio) { desagendar(relogio); relogio = null }
  }

  /** Passa a medir a conversa `id` (ou nenhuma, com `null`). */
  function acompanhar(id) {
    if (id === sessao) return
    pararRelogio()
    sessao = id || null
    medidor = null
    resumo = null
    situacao = sessao ? 'medindo' : 'semConversa'
    if (sessao) ler()
    else { desenharBarra(); aoMudar.fire() }
    /*
      ⚠️ O ID DE UMA CONVERSA NOVA CHEGA NO MEIO DO PRIMEIRO TURNO (revisão de código, 16/09/2026). A ordem
      real do motor é: `estado: pensando` (liga o relógio, ainda sem id) e só depois o `pronto` do `init`,
      com o id — e este `acompanhar` desligava o relógio. Os números ficavam parados a primeira resposta
      inteira. O teste antigo mandava o id ANTES do `pensando`, a ordem contrária à do motor.
    */
    if (sessao && trabalhando) relogio = agendar(ler, INTERVALO_MS)
  }

  /** Os eventos da conversa aberta — o host repassa todos, e aqui só três importam. */
  function aoEvento(evento) {
    if (!evento) return
    if (evento.tipo === 'pronto') {
      // Conversa retomada já tem id na abertura (`retomada`); conversa nova só ganha no `init`.
      // ⚠️ Bifurcada NÃO: ela nasce com o id da original em `retomada`, mas os números dela são outros e
      // só existem depois da primeira resposta (ver `recomecarAberta`, que por isso acompanha `null`).
      const id = evento.sessao || (evento.bifurcada ? null : evento.retomada)
      if (id) acompanhar(id)
      else if (!sessao) { situacao = 'aguardandoPrimeiraResposta'; desenharBarra(); aoMudar.fire() }
      return
    }
    if (evento.tipo === 'estado') {
      trabalhando = ESTADOS_QUE_ESCREVEM.has(evento.estado)
      if (trabalhando) {
        if (!relogio && sessao) relogio = agendar(ler, INTERVALO_MS)
      } else {
        pararRelogio()
      }
      return
    }
    // O fim da resposta: uma leitura logo depois, para pegar o que acabou de ser gravado.
    if (evento.tipo === 'fim') atrasar(ler, 400)
  }

  // ── a vista ──

  const item = (rotulo, { descricao, dica, icone, filhos } = {}) => {
    const t = new vscode.TreeItem(rotulo, filhos && filhos.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)
    if (descricao) t.description = descricao
    if (dica) t.tooltip = dica
    if (icone) t.iconPath = new vscode.ThemeIcon(icone)
    t.filhos = filhos || []
    return t
  }

  function raizDaVista() {
    if (situacao === 'semConversa') return [item('Nenhuma conversa aberta', { icone: 'info', dica: 'Abra a conversa (Ctrl+T): os números aparecem aqui.' })]
    if (situacao === 'aguardandoPrimeiraResposta') return [item('Conversa nova', { descricao: 'os números aparecem depois da primeira resposta', icone: 'info' })]
    if (situacao === 'semArquivo' || !resumo) return [item('Ainda não há nada gravado desta conversa', { icone: 'info', dica: 'O arquivo da conversa aparece quando o agente responde pela primeira vez.' })]

    const r = resumo
    const lista = [
      item('Contexto agora', { descricao: F.tokens(r.contextoAgora) || '0 tokens', icone: 'dashboard', dica: 'Quanto o modelo leu na última resposta: o tamanho da conversa hoje.' }),
      item('Processado', { descricao: F.tokens(r.tokens) || '0 tokens', icone: 'pulse', dica: 'Tudo que já passou pelo modelo. A conversa é relida a cada resposta, por isso este número cresce bem mais depressa.' }),
      item('Custo', {
        descricao: r.custoUsd == null ? 'sem preço para o modelo' : F.dinheiro(r.custoUsd) + (r.faltouPreco ? ' (parcial)' : ''),
        icone: 'credit-card',
        dica: `Estimativa pela tabela da API de ${r.tabelaDe}. Em assinatura, ninguém paga por token: é quanto custaria.`,
      }),
    ]
    const porModelo = r.modelos.map(m => item(F.nomeDoModelo(m.modelo) || 'modelo desconhecido', {
      descricao: [F.tokens(m.tokens), m.custoUsd == null ? 'sem preço' : F.dinheiro(m.custoUsd), m.veloz ? 'modo rápido' : null].filter(Boolean).join(' · '),
    }))
    // `hubot`, e nao `symbol-class`: os icones `symbol-*` o tema pinta como simbolo de codigo, e o de
    // Modelos saia colorido no meio de cinco monocromaticos (revisao de tela, 18/09/2026).
    if (porModelo.length) lista.push(item(`Modelos (${porModelo.length})`, { icone: 'hubot', filhos: porModelo }))
    const porAgente = r.subagentes.map(s => item(s.nome, { descricao: [F.tokens(s.tokens), s.custoUsd == null ? null : F.dinheiro(s.custoUsd)].filter(Boolean).join(' · ') }))
    lista.push(item(`Subagentes (${porAgente.length})`, { icone: 'organization', filhos: porAgente, descricao: porAgente.length ? null : 'nenhum' }))
    const porSkill = r.skills.map(s => item(s.nome, { descricao: s.vezes > 1 ? `${s.vezes} vezes` : null }))
    lista.push(item(`Skills (${porSkill.length})`, { icone: 'book', filhos: porSkill, descricao: porSkill.length ? null : 'nenhuma', dica: 'Skill entra no contexto da conversa: não tem gasto separado para medir.' }))
    return lista
  }

  const provedor = {
    onDidChangeTreeData: aoMudar.event,
    getTreeItem: t => t,
    getChildren: t => (t ? t.filhos : raizDaVista()),
    // Só para o editor aceitar `reveal(undefined)` — o que reabre a vista sem roubar o foco (ver `extensao.js`).
    getParent: () => undefined,
  }

  return {
    provedor,
    barra,
    acompanhar,
    aoEvento,
    ler,
    get resumo() { return resumo },
    get situacao() { return situacao },
    /** V14 — o pé da conversa. Quem liga recebe o estado de agora na hora (a tela pode ter acabado de subir). */
    ligarPe(fn) {
      aoPublicar = fn
      if (fn) { try { fn(ultimoPe) } catch { } }
      return () => { if (aoPublicar === fn) aoPublicar = null }
    },
    get pe() { return ultimoPe },
    get tiqueMarcado() { return !!tique },
    descartar() { pararRelogio(); pararTique(); aoPublicar = null; barra.dispose(); aoMudar.dispose() },
  }
}

module.exports = { criarTelaDeTokens, INTERVALO_MS }
