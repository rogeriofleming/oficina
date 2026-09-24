// O COMANDO — quem roda o que o agente pede é a OFICINA, e não o SDK por dentro.
//
// ⚠️ POR QUE ISTO EXISTE, e por que a porta escolhida é esta.
//
// A V4 promete quatro coisas: o comando é PROPOSTO, a pessoa APROVA, ele roda num terminal
// VISÍVEL, e parar mata **só o processo daquele comando**. Nenhuma das quatro cabe no caminho
// natural: quando o SDK executa o `Bash` ele o faz dentro do processo dele — a OFICINA não vê o
// processo, não tem o PID e não tem o que mostrar. Para cumprir a promessa, quem executa tem de
// ser a OFICINA. Havia duas portas, e as duas foram MEDIDAS com o agente de verdade antes de uma
// linha ser escrita (spike da V4, laudo em <pasta de build>/_oficina14/spike_terminal.json):
//
//   PORTA 1 — `toolAliases: { Bash: 'mcp__oficina__terminal' }` e uma ferramenta nossa.
//     FUNCIONA: o modelo pede o comando e a nossa função executa (rodada A). E foi REPROVADA na
//     rodada C: com o projeto negando `Bash(echo:*)`, o comando PASSOU. O alias troca o nome antes
//     da política, e a política do projeto é escrita sobre o nome `Bash` — a regra granular deixa
//     de valer. Isso é o coração 2 do produto (a trava da pasta valendo dentro da OFICINA), e
//     nenhuma facilidade paga esse preço. Junto veio um segundo buraco: a nossa ferramenta fica
//     VISÍVEL na lista e o modelo a chama direto, por fora do nome `Bash` (visto na rodada A).
//
//   PORTA 2 — o `Bash`/`PowerShell` continuam sendo do SDK; a OFICINA intercepta no `canUseTool`,
//     executa, e devolve a saída ao agente pela única via que o SDK oferece: a mensagem do `deny`.
//     É a porta deste arquivo. O que ela garante, por construção: quando o pedido chega aqui, ele
//     JÁ passou por todas as regras da pasta. As duas metades estão MEDIDAS: o `deny` do projeto
//     bloqueia antes (rodada F do spike do terminal) e o **hook `PreToolUse`** da pasta decide
//     antes — com controle positivo, em `ciclo_v4/spikes/hook.mjs` (3 rodadas, 4 critérios,
//     11/09/2026): com o hook negando, o pedido NÃO chega ao `canUseTool`; na mesma pasta sem o
//     hook, chega. Até aquele dia esta frase era uma afirmação sem medição — um revisor
//     independente pegou a contradição com o `agente.js`, que dizia por escrito "sobre hooks: não
//     afirme até medir". Mediu-se, em vez de apagar a frase.
//
// ⚠️ O CUSTO, declarado: o agente ouve um `tool_result` marcado como erro para um comando que deu
// certo. Medido, com o agente de verdade, em quatro rodadas (D, E, G, H): ele entende a mensagem,
// relata a saída corretamente, distingue o código 0 do código 1 — e NÃO repetiu o comando em
// nenhuma delas. É a mesma via que a V3 usa para contar o parcial (M2). Não é "sem custo": é um
// custo medido, pequeno, contra uma garantia que não podia ser perdida.
//
// ⚠️ E a segunda troca: para que TODO comando passe por aqui — e não só os que o CLI considera
// perigosos — a conversa pede `permissions.ask` na camada do SDK. Sem isso, um `echo` roda dentro
// do SDK sem cartão e sem terminal (medido: a 1ª corrida da rodada A não passou pelo `canUseTool`).
// O preço é que um `allow` que a pessoa tenha escrito no projeto para comandos deixa de valer
// dentro da OFICINA: ela vai ver o cartão assim mesmo (medido na rodada H). O `deny` dela continua
// ganhando de tudo (rodada F).
//
// Nada aqui usa `require('vscode')` — a mesma regra do `agente.js`, e pelo mesmo motivo: é o que
// deixa `testes/comando.mjs` provar execução, cancelamento e teto de tempo em segundos, sem abrir
// o editor. Quem fala com o editor é `terminal.js`.

const { spawn, execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

/** As ferramentas do SDK que executam comando — as DUAS, porque o agente usa as duas.
 *
 *  ⚠️ Não é "no Windows ele usa PowerShell": no laudo do spike da V4, a rodada `G` saiu em
 *  `PowerShell` e a `H` em `Bash`, com pedidos parecidos. Esta linha já disse "ele escolheu
 *  PowerShell nas duas rodadas", que era uma generalização contradita pelo próprio laudo (achado M6
 *  do revisor de documentos). O que se pode afirmar: ele escolhe uma das duas, e por isso as duas
 *  passam por aqui. */
const FERRAMENTAS = ['Bash', 'PowerShell']

/** Teto de tempo: o do pedido, se vier; senão o mesmo padrão do Bash do SDK. */
const TETO_PADRAO_MS = 120000
const TETO_MAXIMO_MS = 600000

/** O que cabe na mensagem que volta ao agente. Acima disto, o MEIO é cortado e o corte é dito. */
const LIMITE_PARA_O_AGENTE = 30000

function ehFerramentaDeComando(nome) {
  return FERRAMENTAS.includes(nome)
}

/**
 * Onde está o interpretador desta ferramenta nesta máquina — ou `null`.
 *
 * ⚠️ `null` NÃO é erro: é o sinal de que a OFICINA não pode executar este comando, e nesse caso o
 * pedido segue pelo caminho da V3 (o SDK executa, como sempre fez). Preferir "o agente trabalha,
 * sem terminal" a "o agente não trabalha" — o terminal é o ganho da versão, não a condição dela.
 * O caso real: `Bash` numa máquina Windows sem Git instalado.
 */
function acharInterpretador(ferramenta, ambiente = process.env, plataforma = process.platform) {
  const existe = p => { try { return !!p && fs.statSync(p).isFile() } catch { return false } }

  if (ferramenta === 'PowerShell') {
    if (plataforma !== 'win32') return null
    const raiz = ambiente.SystemRoot || ambiente.windir || 'C:\\Windows'
    const nativo = path.join(raiz, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    if (existe(nativo)) return nativo
    return noCaminho('powershell.exe', ambiente) || null
  }

  if (ferramenta === 'Bash') {
    if (plataforma !== 'win32') return existe('/bin/bash') ? '/bin/bash' : (noCaminho('bash', ambiente) || null)
    // O bash que existe no Windows de quem programa é o do Git. Os dois lugares padrão e, por
    // último, o PATH — nesta ordem, porque o do PATH pode ser o do WSL (`bash.exe` do sistema),
    // que abre uma OUTRA máquina: caminhos, ferramentas e permissões diferentes dos do projeto.
    const programas = [ambiente.ProgramFiles, ambiente['ProgramFiles(x86)'], ambiente.ProgramW6432]
    for (const base of programas.filter(Boolean)) {
      for (const sub of [['Git', 'bin', 'bash.exe'], ['Git', 'usr', 'bin', 'bash.exe']]) {
        const p = path.join(base, ...sub)
        if (existe(p)) return p
      }
    }
    // A procura CONTINUA quando o que se achou e o bash do WSL, em vez de desistir. Ate a Oficina
    // 15 esta linha pegava o PRIMEIRO `bash.exe` do PATH e, se fosse o do System32, devolvia
    // `null`: numa maquina com WSL e com o Git fora de `Program Files`, a OFICINA saia da frente e
    // o terminal simplesmente nao acontecia, sem dizer por que (achado BAIXO 3 do revisor de erros
    // da V4). O que se recusa e o WSL -- ele abre outra maquina, com outros caminhos --, nao a
    // busca.
    return noCaminho('bash.exe', ambiente, achado => !/\\System32\\bash\.exe$/i.test(achado))
  }

  return null
}

/** Procura um executável nas pastas do PATH. Sem `where`/`which`: um processo a menos, e o mesmo
 *  resultado — o que interessa é o arquivo existir. */
function noCaminho(nome, ambiente, aceitar = () => true) {
  const pastas = String(ambiente.PATH || ambiente.Path || '').split(path.delimiter).filter(Boolean)
  for (const pasta of pastas) {
    const p = path.join(pasta, nome)
    try { if (fs.statSync(p).isFile() && aceitar(p)) return p } catch { }
  }
  return null
}

/**
 * O pedido de comando, como a OFICINA o entende — ou `null` quando ela não deve executar.
 *
 * Devolve `null` (e o pedido segue como na V3, com o SDK executando) quando:
 *   - não é ferramenta de comando, ou não veio `command`;
 *   - o agente pediu `run_in_background`: quem cuida de shell em segundo plano é o SDK, que tem
 *     `BashOutput` e `KillShell` para isso. Reimplementar aqui seria criar uma segunda verdade
 *     sobre processos vivos — e a primeira continuaria existindo;
 *   - não há interpretador desta ferramenta nesta máquina.
 */
function montarPedidoDeComando(ferramenta, entrada, opcoes = {}) {
  if (!ehFerramentaDeComando(ferramenta)) return null
  const e = entrada || {}
  if (typeof e.command !== 'string' || !e.command.trim()) return null
  if (e.run_in_background === true) return null
  const interpretador = (opcoes.acharInterpretador || acharInterpretador)(ferramenta)
  if (!interpretador) return null

  const teto = Number(e.timeout)
  return {
    ferramenta,
    linha: e.command,
    descricao: typeof e.description === 'string' && e.description.trim() ? e.description.trim() : null,
    interpretador,
    tetoMs: Number.isFinite(teto) && teto > 0 ? Math.min(teto, TETO_MAXIMO_MS) : TETO_PADRAO_MS,
  }
}

/**
 * Os argumentos do interpretador.
 *
 * ⚠️ `-EncodedCommand` no PowerShell, e não `-Command`. O comando vem de um modelo e traz aspas,
 * `$`, `&`, parênteses e acento; com `-Command` a linha é remontada pelo Windows e reinterpretada
 * pelo PowerShell, e cada camada come um pedaço do escape. Em base64 UTF-16LE não há o que comer.
 * O prefixo fixa a saída em UTF-8: sem ele, acento volta como lixo na página de código do console.
 *
 * ⚠️ `-NoProfile`: o perfil da pessoa pode definir função, alias e variável que mudam o que o
 * comando faz. Custo desta escolha: um alias que ela criou no perfil não existe aqui — em troca, o que
 * roda é o que está escrito no cartão que ela aprovou.
 */
function argumentosDo(ferramenta, linha) {
  if (ferramenta === 'PowerShell') {
    // ⚠️ `$ProgressPreference` DESLIGADO — e isto foi MEDIDO, não precavido. Sem esta linha, um
    // `Write-Output "alfa"` devolvia `#< CLIXML` e 600 caracteres de `<Objs Version="1.1.0.1">…`
    // junto do "alfa": quando a saída não é um console, o PowerShell SERIALIZA a barra de progresso
    // no canal de erro. Isso ia inteiro para a tela do terminal e para a mensagem do agente.
    const script = '$ProgressPreference = \'SilentlyContinue\'\n' +
      '$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8\n' + linha
    return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
  }
  return ['-c', linha]
}

/**
 * Guarda a saída para o agente sem guardar o mundo: o começo e o fim, com o meio cortado e o corte
 * DITO. Um `npm install` despeja megabytes — segurar tudo na memória do host de extensão para
 * jogar fora depois é como o painel trava numa sessão de trabalho de verdade.
 */
class Colheita {
  constructor(limite = LIMITE_PARA_O_AGENTE) {
    this.limite = limite
    this.metade = Math.floor(limite / 2)
    this.inicio = ''
    this.fim = ''
    this.total = 0
  }

  juntar(texto) {
    if (!texto) return
    this.total += texto.length
    // Enche o começo; o que sobrar entra no fim, que só guarda os últimos caracteres.
    if (this.inicio.length < this.metade) {
      const cabe = this.metade - this.inicio.length
      this.inicio += texto.slice(0, cabe)
      texto = texto.slice(cabe)
    }
    if (!texto) return
    this.fim = (this.fim + texto).slice(-this.metade)
  }

  get cortou() { return this.total > this.inicio.length + this.fim.length }

  texto() {
    if (!this.cortou) return this.inicio + this.fim
    const sumiu = this.total - this.inicio.length - this.fim.length
    return this.inicio +
      `\n\n[… a OFICINA cortou ${sumiu.toLocaleString('pt-BR')} caracteres do meio desta saída …]\n\n` +
      this.fim
  }
}

/**
 * Uma execução. Nasce rodando; `pronto` é a promessa do resultado.
 *
 * ⚠️ Esta classe NUNCA lança. Ela roda dentro de um `canUseTool`, e uma exceção aqui deixaria o
 * agente esperando para sempre por uma permissão que ninguém vai responder.
 */
class Execucao {
  /**
   * @param {object} opcoes
   * @param {string} opcoes.ferramenta   'Bash' | 'PowerShell'
   * @param {string} opcoes.linha        o comando, como o agente escreveu
   * @param {string} opcoes.interpretador caminho do executável
   * @param {string} opcoes.cwd          a pasta aberta no editor
   * @param {number} opcoes.tetoMs
   * @param {(texto: string) => void} [opcoes.aoSair]  cada pedaço de saída, para o terminal
   * @param {Function} [opcoes.gerarProcesso] injeção para teste
   * @param {Function} [opcoes.executarArquivo] injeção para teste (o `execFile` que mata pelo PID)
   */
  constructor({ ferramenta, linha, interpretador, cwd, tetoMs = TETO_PADRAO_MS, aoSair, gerarProcesso, executarArquivo }) {
    this.ferramenta = ferramenta
    this.linha = linha
    this.cwd = cwd
    this.tetoMs = tetoMs
    this.aoSair = typeof aoSair === 'function' ? aoSair : () => { }
    this.colheita = new Colheita()
    this.cancelado = false
    this.motivo = null
    this.pid = null
    this.comecou = Date.now()
    this._executarArquivo = typeof executarArquivo === 'function' ? executarArquivo : execFile
    /** O que deu errado ao tentar matar (a mensagem do sistema), para quem precisa saber por que não parou. */
    this.falhasAoParar = []
    this._resolver = null
    this.pronto = new Promise(r => { this._resolver = r })

    let filho = null
    try {
      const criar = gerarProcesso || spawn
      filho = criar(interpretador, argumentosDo(ferramenta, linha), {
        cwd,
        windowsHide: true,
        // ⚠️ A entrada é FECHADA, não herdada. O comando roda sem ninguém para responder: um
        // programa que pergunta receberia o fim da entrada e desiste, em vez de ficar pendurado
        // até o teto de tempo com a pessoa olhando um terminal parado.
        stdio: ['ignore', 'pipe', 'pipe'],
        // Fora do Windows, o grupo próprio é o que permite matar a árvore pelo PID negativo.
        ...(process.platform === 'win32' ? {} : { detached: true }),
      })
    } catch (e) {
      this._terminar({ erro: descrever(e) })
      return
    }

    this.filho = filho
    this.pid = filho.pid || null

    const receber = fluxo => {
      if (!fluxo) return
      fluxo.setEncoding('utf8')
      fluxo.on('data', pedaco => {
        this.colheita.juntar(pedaco)
        try { this.aoSair(pedaco) } catch { }
      })
    }
    // ⚠️ Os dois fluxos vão para a MESMA colheita, na ordem em que chegam — como num terminal.
    // Separar em dois blocos ("saída" e "erros") faria o agente ler uma ordem que nunca existiu,
    // e é justamente a ordem que explica em que passo o comando quebrou.
    receber(filho.stdout)
    receber(filho.stderr)

    this._relogio = setTimeout(() => this.cancelar('tempo'), this.tetoMs)

    filho.on('error', e => this._terminar({ erro: descrever(e) }))

    /*
      ⚠️ `exit` E `close` — e o `exit` é o que salva o agente de ficar pendurado PARA SEMPRE.

      Medido por um revisor independente em 11/09/2026, com `algo & exit 0` (um servidor, um watcher,
      um `npm run dev &` — trabalho de todo dia de um agente de código): o shell sai na hora, mas o
      NETO herda o cano da saída e continua vivo. O Node só emite `close` quando o processo saiu **E**
      os canos fecharam — então `close` nunca chegava, a promessa nunca resolvia, e o `canUseTool`
      ficava esperando sem prazo (o próprio tipo do SDK diz: "permission prompts have no park
      deadline"). A tela ficava em "rodando…" para sempre, e o teto de tempo não resolvia nada: ele
      manda MATAR, não termina a execução.

      Agora: `exit` diz que o processo morreu. Damos um prazo curto para o que ainda está no cano
      chegar e terminamos — anotando que algo ficou segurando a saída, porque isso é informação para
      quem pediu o comando.
    */
    const PRAZO_DOS_CANOS_MS = 700
    filho.on('exit', (codigo, sinal) => {
      if (this.terminou) return
      this._prazoDosCanos = setTimeout(() => {
        // Alguém que não é o nosso processo ainda segura a saída: um descendente solto.
        try { filho.stdout && filho.stdout.destroy() } catch { }
        try { filho.stderr && filho.stderr.destroy() } catch { }
        this._terminar({ codigo, sinal, deixouAlgoRodando: true })
      }, PRAZO_DOS_CANOS_MS)
    })
    filho.on('close', (codigo, sinal) => {
      clearTimeout(this._prazoDosCanos)
      this._terminar({ codigo, sinal })
    })
  }

  /**
   * Para o comando — matando o processo e os filhos dele, PELO PID.
   *
   * ⚠️ NUNCA por nome. `taskkill /IM`, `Stop-Process -Name` e parentes matariam o `node` ou o
   * `powershell` de outra pessoa na mesma máquina; a lei da casa é explícita, e `/T` só desce a
   * árvore DESTE pid. Um `npm test` cancelado deixa filhos vivos sem o `/T`, e é por isso que o
   * critério 9 fala em "lista de processos antes = depois", não em "o processo morreu".
   */
  cancelar(motivo = 'parar') {
    if (this.terminou) return false
    // ⚠️ CANCELAR TEM SEGUNDA CHANCE. Até 11/09/2026 a primeira tentativa marcava `cancelado` e a
    // segunda devolvia `false` sem tentar nada — então, quando o teto de tempo disparava e o
    // processo NÃO morria, o botão "Parar este comando", o Parar da conversa e o encerrar da aba
    // viravam três botões mortos sobre o mesmo processo vivo (revisor independente).
    const repetida = this.cancelado
    this.cancelado = true
    if (!repetida) this.motivo = motivo
    const pid = this.pid
    if (!pid) return true
    try {
      if (process.platform === 'win32') {
        // A árvore normal, enquanto o pai vive: rápido e suficiente na maioria dos casos.
        /*
          ⚠️ A FALHA NÃO É ENGOLIDA. A resposta do `taskkill` era jogada fora: se ele falhasse (o processo ainda
          nascendo, a máquina sob carga), `cancelar()` devolvia `true`, ninguém tentava de novo, e o Ctrl+C ou o
          "Parar" não paravam nada, sem aviso. Agora a falha fica guardada (vai no resultado) e há UMA segunda
          tentativa, meio segundo depois, se o processo ainda não terminou. Uma só: a primeira falha pode ser só
          o processo que já estava morrendo (o `taskkill` também reclama de PID que acabou de sair).
        */
        this._executarArquivo('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, erro => {
          if (!erro || this.terminou) return
          this.falhasAoParar.push(descrever(erro).slice(0, 300))
          if (this.falhasAoParar.length === 1) {
            setTimeout(() => { if (!this.terminou) this.cancelar(this.motivo || motivo) }, 500)
          }
        })
        // E o que sobra quando o pai JÁ morreu (o `/T` não tem mais árvore para descer).
        matarDescendentes(pid, this.comecou, this._executarArquivo)
      } else {
        try { process.kill(-pid, 'SIGKILL') } catch { process.kill(pid, 'SIGKILL') }
      }
    } catch { }
    return true
  }

  _terminar(resultado) {
    if (this.terminou) return
    this.terminou = true
    clearTimeout(this._relogio)
    const r = {
      ferramenta: this.ferramenta,
      linha: this.linha,
      codigo: typeof resultado.codigo === 'number' ? resultado.codigo : null,
      sinal: resultado.sinal || null,
      erro: resultado.erro || null,
      cancelado: this.cancelado,
      motivo: this.motivo,
      // O comando terminou, mas alguém que ele soltou continua segurando a saída. Quem pediu o
      // comando precisa saber disso — é a diferença entre "acabou" e "acabou e deixou algo rodando".
      deixouAlgoRodando: resultado.deixouAlgoRodando === true,
      duracaoMs: Date.now() - this.comecou,
      falhasAoParar: this.falhasAoParar.slice(),
      saida: this.colheita.texto(),
      bytes: this.colheita.total,
      cortou: this.colheita.cortou,
      pid: this.pid,
    }
    this._resolver(r)
  }
}

/**
 * Mata o que descende deste processo — inclusive depois de o pai morrer.
 *
 * ⚠️ POR QUE O `taskkill /T` NÃO BASTA. Ele desce a árvore do processo VIVO. Quando o comando faz
 * `algo & exit 0`, o pai sai e o neto continua: a árvore acabou, e `/T` não alcança ninguém. O
 * Windows, porém, guarda o `ParentProcessId` do filho mesmo depois de o pai morrer — é por aí que
 * dá para achar o órfão.
 *
 * ⚠️ DUAS TRAVAS CONTRA MATAR O PROCESSO DE OUTRA PESSOA, e as duas são a lei da casa:
 *   1. só PID — nunca nome. O que se lê do sistema é o parentesco, e o que se mata é o número.
 *   2. só o que NASCEU DEPOIS desta execução. PID é reciclado pelo Windows; sem a data de criação,
 *      um processo novo que por acaso herdasse o número do nosso shell viraria alvo.
 * Falhar aqui é silencioso de propósito: não matar um órfão é ruim; matar o que não é nosso é pior.
 */
function matarDescendentes(pid, desdeMs, executarArquivo = execFile) {
  if (process.platform !== 'win32') return
  const desde = new Date(desdeMs - 1000).toISOString()
  const script = [
    '$alvo = ' + pid,
    '$desde = [datetime]"' + desde + '"',
    '$todos = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate',
    // ⚠️ Fila de verdade (`Queue`), e não fatia de array: `@(1)[1..1]` devolve `$null` no
    // PowerShell, e a primeira versão disto entrava na fila com um nulo e parava de descer a
    // árvore — o descendente continuava vivo e o teste acusou (11/09/2026).
    '$mortos = New-Object System.Collections.ArrayList',
    '$fila = New-Object System.Collections.Queue',
    '[void]$fila.Enqueue($alvo)',
    'while ($fila.Count -gt 0) {',
    '  $p = $fila.Dequeue()',
    '  foreach ($f in $todos) {',
    '    if ($f.ParentProcessId -eq $p -and $f.ProcessId -ne $p -and $f.CreationDate -ge $desde) {',
    '      [void]$mortos.Add($f.ProcessId); [void]$fila.Enqueue($f.ProcessId) } } }',
    // `taskkill /PID`, e não um cmdlet que aceite nome: aqui o alvo é sempre um número, e o
    // comando que o mata também só sabe falar em números.
    'foreach ($m in ($mortos | Select-Object -Unique)) {',
    '  try { & taskkill.exe /PID $m /F | Out-Null } catch { } }',
  ].join('\n')
  try {
    executarArquivo('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 30000 }, () => { })
  } catch { }
}

/**
 * O que o agente ouve. É a peça mais delicada da versão: é ela que faz um `deny` do SDK carregar
 * um comando que DEU CERTO sem o agente concluir que falhou (medido nas rodadas D, E, G e H do
 * spike — ele relatou a saída certa e não repetiu o comando em nenhuma).
 *
 * ⚠️ A frase final muda com o caso, e isso é o que evita o pior defeito possível aqui: o agente
 * refazer sozinho um comando que a pessoa mandou PARAR. É a mesma lição que a revisão funcional da
 * V3 cobrou no botão Parar — a alavanca que a OFICINA tem sobre a escolha do modelo é o texto.
 */
function mensagemDoComando(r) {
  const cabeca = 'A OFICINA rodou este comando no terminal do editor, no lugar de você — é assim que ' +
    'este editor funciona, e NÃO é um erro nem uma recusa.\n' +
    `Comando: ${r.linha}\n`

  if (r.erro && !r.cancelado) {
    return cabeca + `A OFICINA não conseguiu iniciar o comando: ${r.erro}\n` +
      'Nada rodou. Diga isso à pessoa em vez de tentar de novo por conta própria.'
  }

  const saida = r.saida && r.saida.trim() ? r.saida : '(o comando não escreveu nada)'

  if (r.cancelado) {
    const porque = r.motivo === 'tempo'
      ? `O comando passou do tempo limite (${Math.round((r.duracaoMs || 0) / 1000)} s) e a OFICINA o parou.`
      : r.motivo === 'encerrada'
        ? 'A conversa foi fechada enquanto o comando rodava, e a OFICINA o parou junto.'
        : 'A PESSOA parou este comando no meio.'
    return cabeca + porque + '\n' +
      `O que ele alcançou a fazer até ali está feito. Saída até o momento em que parou:\n${saida}\n\n` +
      'NÃO rode este comando de novo por conta própria — espere ela pedir.'
  }

  const fim = r.codigo === 0
    ? 'Considere o comando EXECUTADO com sucesso. Não rode de novo.'
    : 'Considere o comando EXECUTADO — e ele terminou com erro. Não rode de novo só para ver o erro outra vez.'

  // O comando saiu deixando algo dele rodando em segundo plano (um `&`, um servidor, um watcher).
  // Dizer isso é o que separa "acabou" de "acabou e deixou coisa viva na máquina da pessoa".
  const solto = r.deixouAlgoRodando
    ? '\n⚠️ O comando terminou, mas deixou um processo rodando em segundo plano, que continua vivo. ' +
      'A OFICINA não controla esse processo: ele não morre com o botão Parar. Se ele não era para ' +
      'ficar, avise a pessoa.\n'
    : ''

  return cabeca +
    `Código de saída: ${r.codigo === null ? (r.sinal ? 'morto pelo sinal ' + r.sinal : 'desconhecido') : r.codigo}\n` +
    `Saída:\n${saida}\n${solto}\n${fim}`
}

function descrever(e) {
  return String((e && (e.message || e.code)) || e)
}

module.exports = {
  FERRAMENTAS, TETO_PADRAO_MS, TETO_MAXIMO_MS, LIMITE_PARA_O_AGENTE,
  ehFerramentaDeComando, acharInterpretador, montarPedidoDeComando, argumentosDo,
  Colheita, Execucao, mensagemDoComando,
}
