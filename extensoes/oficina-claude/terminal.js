// O TERMINAL DO AGENTE (V4) — onde o comando aprovado roda À VISTA.
//
// ⚠️ É um terminal de VERDADE do editor, e não uma caixa de texto parecida com um. A diferença
// importa: a pessoa rola, seleciona, copia, procura, aumenta a fonte e vê a saída chegando linha a
// linha, com as mesmas teclas de sempre. Um painel próprio teria de reinventar tudo isso — pior, e
// com outra cara.
//
// ⚠️ POR QUE UM PSEUDOTERMINAL, e não `terminal.sendText(comando)`.
//
// O caminho fácil seria criar um terminal normal e "digitar" o comando nele. Ele foi recusado por
// três motivos medidos no que a V4 promete:
//   1. a SAÍDA não volta. Um terminal do editor não devolve ao programa o que apareceu nele — e o
//      agente precisa da saída para continuar o trabalho;
//   2. o PID seria o do shell da pessoa, não o do comando: parar mataria o terminal inteiro, ou
//      nada. O critério 9 ("cancelar não deixa órfão") não teria como ser cumprido;
//   3. o comando seria remontado por mais uma camada de escape, depois de já ter passado por duas.
// Com um pseudoterminal, quem executa é `comando.js` (com o PID na mão) e este arquivo só DESENHA.
//
// Custo desta escolha: este terminal não recebe digitação — não há shell do outro lado para responder.
// O que a pessoa pode fazer nele é o que ela precisa fazer: ler, copiar e apertar Ctrl+C para
// parar o comando. Quem quiser um terminal para si abre o de sempre (Ctrl+').

const vscode = require('vscode')
const { Execucao } = require('./comando')

const NOME = 'OFICINA — comandos do agente'
/** O teto do que fica guardado enquanto o terminal não está aberto (ver `_escrever`). */
const TETO_DA_FILA = 64 * 1024

/** O terminal onde os comandos do agente rodam. Um por janela, criado na primeira execução. */
class TerminalDoAgente {
  constructor() {
    this._terminal = null
    this._escrita = new vscode.EventEmitter()
    this._fechar = new vscode.EventEmitter()
    this._aberto = false
    /**
     * O que foi escrito ANTES de o terminal abrir.
     *
     * ⚠️ Isto não é precaução: foi um vermelho medido no editor de verdade (11/09/2026). O
     * `onDidWrite` de um pseudoterminal só tem ouvinte quando o EDITOR abre o terminal, e abrir é
     * assíncrono — a linha do comando, escrita logo depois do `createTerminal`, caía no vazio. O
     * terminal mostrava a saída e o rodapé, sem dizer QUE COMANDO tinha rodado, que é a única coisa
     * que ele precisa dizer. Nenhum teste com dublê pega isso: o dublê abre na hora.
     */
    this._pendente = []
    /** As execuções vivas neste terminal, para o Ctrl+C do próprio terminal. */
    this._vivas = new Set()
  }

  /**
   * Escreve no terminal — guardando o que vier antes de ele abrir.
   *
   * ⚠️ A FILA TEM TETO. Sem ele, um terminal que nunca abre (ou que foi fechado) acumularia a saída
   * de todo comando seguinte na memória do host de extensão — um `npm install` são megabytes. O que
   * não couber é descartado do COMEÇO: o que interessa a quem volta a olhar é o fim.
   */
  _escrever(texto) {
    if (!this._aberto) {
      this._pendente.push(texto)
      let peso = this._pendente.reduce((n, t) => n + t.length, 0)
      while (peso > TETO_DA_FILA && this._pendente.length > 1) peso -= this._pendente.shift().length
      return
    }
    this._escrita.fire(texto)
  }

  /**
   * A pessoa fechou a aba do terminal.
   *
   * ⚠️ SEM ISTO, O TERMINAL SUMIA PARA SEMPRE — achado por um revisor independente em 11/09/2026,
   * com o gesto mais corriqueiro que existe (clicar no X da aba). `_garantir()` só cria quando
   * `_terminal` é `null`; com a referência pendurada numa aba morta, ele devolvia o cadáver: o
   * comando seguinte rodava INVISÍVEL, a saída ia para a fila, e a promessa que dá nome à versão
   * quebrava em silêncio — o mesmo motivo pelo qual esta versão tirou o botão "sempre permitir".
   */
  _fechou() {
    this._aberto = false
    this._terminal = null
    this._pendente = []
  }

  /** Cria o terminal na primeira vez. Não o traz para a frente — quem faz isso é `mostrar()`. */
  _garantir() {
    if (this._terminal) return this._terminal
    const pty = {
      onDidWrite: this._escrita.event,
      onDidClose: this._fechar.event,
      open: () => {
        this._aberto = true
        this._escrita.fire('\x1b[2mOs comandos que você aprovar na conversa rodam aqui.\x1b[0m\r\n\r\n')
        // O que foi escrito enquanto o editor abria o terminal — na ordem em que veio.
        const guardado = this._pendente
        this._pendente = []
        for (const texto of guardado) this._escrita.fire(texto)
      },
      close: () => this._fechou(),
      // ⚠️ A ÚNICA tecla que faz alguma coisa. `\x03` é o Ctrl+C: a mão de quem usa terminal já
      // sabe que ele para o que está rodando, e seria pior o gesto existir e não fazer nada.
      // O retorno de `pararCorrente()` não é jogado fora: sem nada rodando, a pessoa ouve isso, em vez de
      // um Ctrl+C mudo que parece não ter funcionado.
      handleInput: dados => {
        if (dados === '\x03' && !this.pararCorrente()) this._linha('\x1b[2m^C — não há comando rodando agora.\x1b[0m')
      },
    }
    this._terminal = vscode.window.createTerminal({ name: NOME, pty, iconPath: new vscode.ThemeIcon('terminal') })
    /*
      ⚠️ DUAS PORTAS PARA O MESMO FATO, e as duas precisam existir. O `close` do pseudoterminal é
      chamado quando o editor encerra ESTE pty; o `onDidCloseTerminal` é o evento do editor sobre a
      aba. Dependendo de como a aba morre (o X, "matar terminal", fechar a janela), um pode vir sem o
      outro — e a consequência de perder o aviso é o terminal virar cadáver silencioso.
    */
    if (typeof vscode.window.onDidCloseTerminal === 'function') {
      this._ouvinteDoFechamento = vscode.window.onDidCloseTerminal(t => {
        if (t === this._terminal) this._fechou()
      })
    }
    return this._terminal
  }

  mostrar(comFoco = false) {
    this._garantir().show(!comFoco)
  }

  /**
   * Roda um comando, desenhando no terminal o que acontece.
   * Devolve um objeto com `pronto` (promessa do resultado) e `cancelar()` — o contrato que o motor
   * espera em `executarComando`.
   */
  rodar({ ferramenta, linha, interpretador, cwd, tetoMs }) {
    this._garantir()
    // Aparecer sozinho é o ponto: a pessoa aprovou um comando e quer VER o comando. Sem foco, para
    // não tirar o cursor de onde ela estava (`preserveFocus`).
    this.mostrar(false)

    this._linha(`\x1b[2m${agora()}\x1b[0m  \x1b[1m${escapar(linha)}\x1b[0m`)

    const execucao = new Execucao({
      ferramenta, linha, interpretador, cwd, tetoMs,
      aoSair: texto => this._escrever(paraTerminal(texto)),
    })
    this._vivas.add(execucao)

    execucao.pronto.then(r => {
      this._vivas.delete(execucao)
      this._linha('')
      // ⚠️ Com mais de um comando no mesmo terminal as saídas se misturam, e um rodapé sozinho não
      // diz de quem ele é. Havendo concorrência, o rodapé repete o comando (revisor independente).
      this._linha(rodapeDo(r) + (this._vivas.size > 0 ? `  \x1b[2m— ${escapar(resumir(linha))}\x1b[0m` : ''))
      this._linha('')
    }).catch(() => { })

    return execucao
  }

  /**
   * Para o que está rodando agora — o Ctrl+C do terminal.
   *
   * ⚠️ TODAS AS EXECUÇÕES VIVAS, e não "a última". Havia uma variável só, e com dois comandos no
   * mesmo terminal o Ctrl+C — anunciado no cabeçalho como a única tecla que faz alguma coisa —
   * parava o comando ERRADO (medido por um revisor independente em 11/09/2026). Num terminal de
   * verdade o Ctrl+C também não escolhe: ele interrompe o que está ali.
   */
  pararCorrente() {
    if (!this._vivas.size) return false
    this._linha('\x1b[33m^C — parando ' +
      (this._vivas.size === 1 ? 'este comando…' : `os ${this._vivas.size} comandos…`) + '\x1b[0m')
    for (const execucao of [...this._vivas]) {
      try { execucao.cancelar('parar') } catch { }
    }
    return true
  }

  /** Os comandos rodando agora, pelo PID e pela hora em que começaram (para o `deactivate`, ver `encerramento.js`). */
  processosVivos() {
    return [...this._vivas].filter(e => Number.isInteger(e.pid)).map(e => ({ pid: e.pid, desdeMs: e.comecou }))
  }

  descartar() {
    for (const execucao of [...this._vivas]) {
      try { execucao.cancelar('encerrada') } catch { }
    }
    this._vivas.clear()
    try { this._ouvinteDoFechamento && this._ouvinteDoFechamento.dispose() } catch { }
    try { this._terminal && this._terminal.dispose() } catch { }
    this._terminal = null
    this._escrita.dispose()
    this._fechar.dispose()
  }

  _linha(texto) {
    this._escrever(texto + '\r\n')
  }
}

/**
 * ⚠️ O terminal quer `\r\n`. Um `\n` sozinho desce uma linha e NÃO volta ao começo: a saída sai em
 * escada, cada linha começando onde a anterior acabou. É o defeito clássico de quem escreve num
 * pseudoterminal pela primeira vez, e aparece na primeira saída de duas linhas.
 */
function paraTerminal(texto) {
  return String(texto).replace(/\r?\n/g, '\r\n')
}

/** O que não é texto pode trazer sequências que mexem no terminal; o comando em si vai sem elas. */
function escapar(texto) {
  return String(texto).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '·').replace(/\r?\n/g, ' ⏎ ')
}

/** O comando em uma linha curta, para o rodapé quando há mais de um rodando. */
function resumir(linha) {
  const t = String(linha).replace(/\s+/g, ' ').trim()
  return t.length > 48 ? t.slice(0, 47) + '…' : t
}

function agora() {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

/**
 * A linha do fim: o que aconteceu, em português e com cor.
 * Verde para 0, vermelho para o resto, amarelo para o que a pessoa parou — a mesma leitura de
 * relance que qualquer terminal dá.
 */
function rodapeDo(r) {
  const tempo = typeof r.duracaoMs === 'number' ? ` em ${(r.duracaoMs / 1000).toFixed(1).replace('.', ',')} s` : ''
  if (r.erro && !r.cancelado) return `\x1b[31m✕ não consegui iniciar: ${escapar(r.erro)}\x1b[0m`
  if (r.cancelado) {
    return r.motivo === 'tempo'
      ? `\x1b[33m⏹ parado: passou do tempo limite${tempo}\x1b[0m`
      : `\x1b[33m⏹ parado por você${tempo}\x1b[0m`
  }
  if (r.codigo === 0) return `\x1b[32m✓ terminou bem (código 0)${tempo}\x1b[0m`
  const codigo = r.codigo === null ? (r.sinal ? `morto pelo sinal ${r.sinal}` : 'código desconhecido') : `código ${r.codigo}`
  return `\x1b[31m✕ terminou com erro (${codigo})${tempo}\x1b[0m`
}

module.exports = { TerminalDoAgente, NOME, paraTerminal, escapar, rodapeDo }
