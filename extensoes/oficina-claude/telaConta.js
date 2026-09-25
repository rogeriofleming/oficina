// A VISTA "CONTA" (V26) — em qual conta do Claude o programa está, e o botão de sair para entrar em outra.
//
// > *"como é que eu deslogo a minha conta do Claude no oficina? Para poder logar em outra conta. Eu
// > tenho que ter algum botão para isso também."* — ele, 24/09/2026
//
// ⚠️ POR QUE UMA VISTA, E NÃO SÓ UM BOTÃO. Quem vai TROCAR de conta precisa saber em qual está — senão
// o botão desloga às cegas. O `claude auth status` responde isso em 340 ms e em JSON, então mostrar sai
// de graça. O botão fica dentro da vista, que é o que o ícone da barra de cima abre.
//
// ⚠️ OS MESMOS QUATRO ESTADOS da vista de conexões, pela mesma razão (a lição do mostrador de tokens da
// V24): `nunca`, `medindo`, `lido` e `erro`. E dentro de `lido` ainda há dois — está DENTRO da conta ou
// FORA dela. "Não consegui ler" nunca é desenhado como "fora da conta".
//
// ⚠️ A OFICINA NÃO APAGA CREDENCIAL, e esta tela diz isso com todas as letras. Quem guarda o login é o
// Claude, no perfil da pessoa; o botão chama quem de fato desconecta (ver `conta.js`).

'use strict'

const C = require('./conta.js')
const { quandoFoi, VALIDADE_MS } = require('./telaMcps.js')

const CORES = {
  bom: 'testing.iconPassed',
  atencao: 'notificationsWarningIcon.foreground',
}

/**
 * @param vscode a API do editor
 * @param {{ medir: () => Promise<any>, sair: () => void, entrar: () => void, agora?: () => number }} servicos
 */
function criarTelaDaConta(vscode, servicos) {
  const agora = servicos.agora || (() => Date.now())
  const aoMudar = new vscode.EventEmitter()

  let situacao = 'nunca'
  let conta = null
  let lidoEm = 0
  let medindo = null

  function redesenhar() {
    try { aoMudar.fire() } catch { /* a vista já não existe */ }
  }

  function atualizar() {
    if (medindo) return medindo
    situacao = 'medindo'
    redesenhar()
    medindo = Promise.resolve()
      .then(() => servicos.medir())
      // `lerConta` já devolve `naoSei` em vez de estourar; o `catch` aqui é o cinto do cinto.
      .then(c => { conta = c; situacao = 'lido'; lidoEm = (c && c.lidoEm) || agora() })
      .catch(e => { conta = { situacao: 'naoSei', motivo: (e && e.message) || String(e) }; situacao = 'lido'; lidoEm = agora() })
      .then(() => { medindo = null; redesenhar() }, () => { medindo = null; redesenhar() })
    return medindo
  }

  /**
   * ⛔ ELA MEDIA UMA VEZ SÓ NA VIDA DA JANELA, e isso era um defeito com nome: a pessoa saía da
   * conta, voltava aqui e a tela continuava mostrando o e-mail antigo, em letras grandes, com ícone
   * verde. Dois revisores independentes acharam a mesma coisa, e um deles apontou o caminho exato:
   * o plano B do "Sair" abre um terminal, e ninguém remede depois dele.
   *
   * Agora vale a mesma validade da vista de conexões, e o título carimba a hora da leitura — porque
   * numa tela cujo propósito é *saber em qual conta você está*, dado velho vestido de novo é o pior
   * defeito possível.
   */
  function aoAparecer() {
    if (situacao === 'nunca') return atualizar()
    if (situacao === 'lido' && agora() - lidoEm > VALIDADE_MS) return atualizar()
    return Promise.resolve()
  }

  // ── a vista ──

  function linha(id, rotulo, { descricao, icone, cor, dica, comando, contexto } = {}) {
    const t = new vscode.TreeItem(rotulo, vscode.TreeItemCollapsibleState.None)
    t.id = 'conta:' + id
    if (descricao) t.description = descricao
    if (icone) t.iconPath = new vscode.ThemeIcon(icone, cor ? new vscode.ThemeColor(cor) : undefined)
    if (dica) t.tooltip = dica
    if (comando) t.command = { command: comando, title: rotulo }
    if (contexto) t.contextValue = contexto
    t.filhos = []
    return t
  }

  /*
    ⚠️ A DICA NÃO PROMETE O QUE NÃO FOI MEDIDO. Ela dizia *"depois de sair, a conversa pede a conta
    de novo"* — e o que este produto tem registrado sobre esse caso, desde a V8, é o contrário:
    *"escrito, não medido: o que o `claude.exe` mostra ao abrir sem credencial"*. Um revisor
    independente pegou a contradição entre a tooltip e o próprio registro. O texto agora diz só o
    que se sabe, e aponta o caminho que existe de verdade: o botão "Entrar numa conta", que aparece
    nesta mesma vista quando a leitura mostrar que você ficou fora.

    ⚠️ E o nome citado aqui é o nome EXATO do botão, de propósito — há critério na suíte que casa
    todo nome entre aspas destes textos com os rótulos da tela e os títulos da paleta. Mandar
    procurar "Entrar" quando o botão se chama "Entrar numa conta" é a mesma quebra de confiança de
    um botão que não faz nada: ela procura, não acha, e conclui que o programa está errado.
  */
  const BOTAO_SAIR = () => linha('sair', 'Sair / trocar de conta', {
    icone: 'sign-out',
    dica: 'Encerra a sua sessão do Claude. Quem guarda o login é o Claude, fora da OFICINA — ' +
      'a OFICINA não tem a sua senha nem o seu token para apagar.\n\n' +
      'Depois de sair, esta tela mostra o botão "Entrar numa conta", e é por ele que você entra em outra.',
    comando: 'oficina.conta.sair',
    contexto: 'contaSair',
  })

  function raizDaVista() {
    if (situacao === 'nunca' || situacao === 'medindo') {
      return [linha('medindo', 'Vendo em qual conta você está…', { icone: 'loading~spin' })]
    }
    const c = conta || { situacao: 'naoSei', motivo: 'nada foi lido' }

    if (c.situacao === 'naoSei') {
      return [
        linha('naoSei', 'Não consegui ler a conta', {
          icone: 'question', cor: CORES.atencao,
          dica: `Isto NÃO quer dizer que você está fora da conta — quer dizer que não consegui perguntar.\n\n${c.motivo || ''}`,
          comando: 'oficina.conta.atualizar',
        }),
        linha('tentar', 'Tentar de novo', { icone: 'refresh', comando: 'oficina.conta.atualizar' }),
        BOTAO_SAIR(),
      ]
    }

    if (c.situacao === 'fora') {
      return [
        linha('fora', 'Você está fora da conta', {
          icone: 'account', cor: CORES.atencao,
          // ⚠️ "nesta máquina" era impreciso: o que o Claude responde é sobre o SEU usuário neste
          // computador. Outra pessoa logada no mesmo Windows tem a conta dela.
          dica: 'Não há nenhuma conta do Claude conectada no seu usuário deste computador.',
        }),
        linha('entrar', 'Entrar numa conta', {
          icone: 'sign-in', comando: 'oficina.conta.entrar',
          dica: 'Abre um terminal com o Claude e começa a entrada na conta. Quando o terminal fechar, esta tela lê de novo em qual conta você está.',
        }),
      ]
    }

    const lista = [linha('quem', c.email || c.organizacao || 'Você está dentro da conta', {
      descricao: [c.plano, c.metodo].filter(Boolean).join(' · '),
      icone: 'account', cor: CORES.bom,
      dica: [
        c.email ? `Conta: ${c.email}` : null,
        c.organizacao ? `Organização: ${c.organizacao}` : null,
        c.plano ? `Plano: ${c.plano}` : null,
        c.metodo ? `Entrou por: ${c.metodo}` : null,
        c.porApi ? `⚠️ Passando por: ${c.porApi}` : null,
      ].filter(Boolean).join('\n'),
    })]
    if (c.porApi) {
      lista.push(linha('api', `Passando por ${c.porApi}`, { icone: 'warning', cor: CORES.atencao }))
    }
    lista.push(BOTAO_SAIR())
    return lista
  }

  const provedor = {
    onDidChangeTreeData: aoMudar.event,
    getTreeItem: t => t,
    getChildren: t => (t ? t.filhos : raizDaVista()),
  }

  /** O resumo de uma linha, COM a hora da leitura — dado sem idade vira dado velho vestido de novo. */
  function descricaoDaVista() {
    if (situacao !== 'lido') return ''
    return `${C.resumoDaConta(conta)} · ${quandoFoi(lidoEm, agora())}`
  }

  return {
    provedor,
    atualizar,
    aoAparecer,
    descricaoDaVista,
    redesenhar,
    sair: () => servicos.sair(),
    entrar: () => servicos.entrar(),
    get situacao() { return situacao },
    get conta() { return conta },
    descartar() { aoMudar.dispose() },
  }
}

module.exports = { criarTelaDaConta, CORES }
