// O COMANDO — os testes do motor que EXECUTA, sem abrir o editor e sem gastar um centavo.
//
// Mesma ideia do `rodar.mjs`: a peça mais delicada da V4 (um processo de verdade, que nasce, escreve
// e precisa morrer inteiro quando a pessoa manda parar) não pode depender de uma corrida de editor
// de 4 minutos para ser provada. Aqui ela roda em segundos, com processos DE VERDADE — o que é
// dublê no `rodar.mjs` (o SDK) aqui é o sistema operacional, e ele não se finge.
//
// ⚠️ O critério 9 dos critérios de pronto ("cancelar não deixa processo órfão") mora aqui, e é medido do
// único jeito que vale: um comando que cria um NETO, os dois PIDs anotados enquanto estão vivos
// (controle positivo), e a conferência de que os dois sumiram depois do cancelar.
//
// Uso:  node testes/comando.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync, execFile } from 'node:child_process'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const C = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'comando.js'))

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe: String(detalhe) })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 220) + ')' : ''}`)
}
const esperar = ms => new Promise(r => setTimeout(r, ms))
async function ate(condicao, tetoMs = 15000) {
  const fim = Date.now() + tetoMs
  while (Date.now() < fim) { if (await condicao()) return true; await esperar(120) }
  return !!(await condicao())
}

const NO_WINDOWS = process.platform === 'win32'
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-comando-'))

/** Roda uma execução de verdade e espera o resultado. */
function rodar(linha, extras = {}) {
  const ferramenta = extras.ferramenta || (NO_WINDOWS ? 'PowerShell' : 'Bash')
  const interpretador = extras.interpretador || C.acharInterpretador(ferramenta)
  return new C.Execucao({ ferramenta, linha, interpretador, cwd: extras.cwd || pasta, ...extras })
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEM É COMANDO, E ONDE ESTÁ O INTERPRETADOR
// ─────────────────────────────────────────────────────────────────────────────
{
  checar('as duas ferramentas de comando são reconhecidas',
    C.ehFerramentaDeComando('Bash') && C.ehFerramentaDeComando('PowerShell'))
  checar('CONTROLE: o que não é comando não é reconhecido',
    !C.ehFerramentaDeComando('Write') && !C.ehFerramentaDeComando('Edit') && !C.ehFerramentaDeComando(''))

  if (NO_WINDOWS) {
    const ps = C.acharInterpretador('PowerShell')
    checar('acha o PowerShell desta máquina', !!ps && fs.existsSync(ps), ps || 'não achei')
    const bash = C.acharInterpretador('Bash')
    checar('acha (ou declara que não há) o bash desta máquina', bash === null || fs.existsSync(bash),
      bash || 'não há bash — o pedido seguiria pelo caminho da V3')

    // ⚠️ O `bash.exe` do System32 é o do WSL: outra máquina, outros caminhos. Pegá-lo seria rodar o
    // comando num lugar que ninguém escolheu. Com um PATH forjado só com ele, a resposta é `null`.
    // ⚠️ O `System32` AQUI É FORJADO, e é isso que dá sentido ao critério: apontar para o
    // `C:\Windows\System32` da máquina só mede alguma coisa numa máquina COM WSL instalado. Nesta,
    // que não tem, os dois critérios ficavam verdes por não acharem arquivo nenhum — verde que
    // aparece sozinho (visto em 11/09/2026, ao escrever o critério do PATH logo abaixo: ele passou
    // igual com o defeito de volta). O filtro olha o FIM do caminho, então uma pasta `System32`
    // qualquer exerce exatamente o mesmo caminho de código.
    const wsl = path.join(pasta, 'System32')
    fs.mkdirSync(wsl, { recursive: true })
    fs.writeFileSync(path.join(wsl, 'bash.exe'), '')
    const soWsl = { PATH: wsl, ProgramFiles: path.join(pasta, 'nao-existe') }
    const achouWsl = C.acharInterpretador('Bash', soWsl, 'win32')
    checar('⛔ o bash do WSL (System32) NÃO é usado como shell do projeto', achouWsl === null, String(achouWsl))

    // CONTROLE POSITIVO do mesmo caminho: um bash.exe em qualquer OUTRA pasta do PATH é aceito.
    const falso = path.join(pasta, 'binfalso')
    fs.mkdirSync(falso, { recursive: true })
    fs.writeFileSync(path.join(falso, 'bash.exe'), '')
    const achouOutro = C.acharInterpretador('Bash', { PATH: falso }, 'win32')
    checar('CONTROLE: um bash fora do System32 é aceito', achouOutro === path.join(falso, 'bash.exe'), String(achouOutro))

    // ⛔ O PATH com o WSL PRIMEIRO e o bash bom DEPOIS. Até 11/09/2026 a busca pegava o primeiro
    // `bash.exe` do PATH e, se fosse o do System32, desistia — numa máquina com WSL e com o Git
    // fora de `Program Files`, o terminal não acontecia e ninguém sabia por quê (BAIXO 3 do revisor
    // de erros da V4). Sem o conserto esta linha fica vermelha: o resultado seria `null`.
    const wslPrimeiro = {
      PATH: [wsl, falso].join(path.delimiter),
      ProgramFiles: path.join(pasta, 'nao-existe'),
    }
    const achouDepoisDoWsl = C.acharInterpretador('Bash', wslPrimeiro, 'win32')
    checar('⛔ com o WSL primeiro no PATH, a busca CONTINUA e acha o bash bom depois',
      achouDepoisDoWsl === path.join(falso, 'bash.exe'), String(achouDepoisDoWsl))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O PEDIDO — quando a OFICINA executa, e quando ela sai da frente
// ─────────────────────────────────────────────────────────────────────────────
{
  const semShell = { acharInterpretador: () => null }
  const comShell = { acharInterpretador: () => 'C:\\shell.exe' }

  const p = C.montarPedidoDeComando('Bash', { command: 'echo oi', description: 'diz oi' }, comShell)
  checar('o pedido de comando nasce com a linha, a descrição e o teto',
    !!p && p.linha === 'echo oi' && p.descricao === 'diz oi' && p.tetoMs === C.TETO_PADRAO_MS,
    JSON.stringify(p))

  checar('⛔ sem interpretador nesta máquina, a OFICINA NÃO executa (o SDK segue como na V3)',
    C.montarPedidoDeComando('Bash', { command: 'echo oi' }, semShell) === null)
  checar('⛔ comando em segundo plano fica com o SDK (é ele que tem BashOutput/KillShell)',
    C.montarPedidoDeComando('Bash', { command: 'npm test', run_in_background: true }, comShell) === null)
  checar('⛔ ferramenta que não é de comando não vira execução',
    C.montarPedidoDeComando('Write', { command: 'echo oi' }, comShell) === null)
  checar('⛔ pedido sem comando (ou com comando vazio) não vira execução',
    C.montarPedidoDeComando('Bash', {}, comShell) === null &&
    C.montarPedidoDeComando('Bash', { command: '   ' }, comShell) === null)

  const curto = C.montarPedidoDeComando('Bash', { command: 'x', timeout: 5000 }, comShell)
  const enorme = C.montarPedidoDeComando('Bash', { command: 'x', timeout: 99999999 }, comShell)
  checar('o teto do pedido é respeitado, e tem um máximo',
    curto.tetoMs === 5000 && enorme.tetoMs === C.TETO_MAXIMO_MS, `${curto.tetoMs} / ${enorme.tetoMs}`)
  const bobo = C.montarPedidoDeComando('Bash', { command: 'x', timeout: -3 }, comShell)
  checar('teto sem sentido cai no padrão, em vez de virar um comando que morre na hora',
    bobo.tetoMs === C.TETO_PADRAO_MS, String(bobo.tetoMs))
}

// ─────────────────────────────────────────────────────────────────────────────
// OS ARGUMENTOS — o comando chega ao shell exatamente como o agente escreveu
// ─────────────────────────────────────────────────────────────────────────────
{
  const linha = 'Write-Output "olá \'mundo\' & $cifrão"'
  const args = C.argumentosDo('PowerShell', linha)
  const i = args.indexOf('-EncodedCommand')
  const script = i >= 0 ? Buffer.from(args[i + 1], 'base64').toString('utf16le') : ''
  checar('PowerShell: o comando viaja codificado (aspas e acento não são remontados pelo caminho)',
    i > 0 && script.includes(linha), script.slice(0, 80))
  checar('PowerShell: a saída é fixada em UTF-8 antes do comando', /OutputEncoding/.test(script))
  checar('PowerShell: sem o perfil da pessoa (o que roda é o que ela aprovou)', args.includes('-NoProfile'))
  checar('Bash: o comando vai inteiro, num argumento só',
    JSON.stringify(C.argumentosDo('Bash', linha)) === JSON.stringify(['-c', linha]))
}

// ─────────────────────────────────────────────────────────────────────────────
// A COLHEITA — a saída que volta ao agente tem teto, e o corte é DITO
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = new C.Colheita(100)
  c.juntar('a'.repeat(40))
  checar('CONTROLE: saída pequena volta inteira e sem aviso de corte',
    !c.cortou && c.texto() === 'a'.repeat(40), `${c.texto().length} chars`)

  const g = new C.Colheita(100)
  g.juntar('C'.repeat(50))       // enche o começo (50) e o resto vai para o fim
  g.juntar('M'.repeat(400))
  g.juntar('F'.repeat(50))
  const t = g.texto()
  checar('saída grande: o começo e o FIM são guardados, e o meio vira aviso',
    g.cortou && t.startsWith('C'.repeat(50)) && t.endsWith('F'.repeat(50)) && /cortou 400 caracteres/.test(t),
    `${g.total} chars, texto ${t.length}`)
  checar('o aviso de corte diz QUANTO sumiu (e não só que sumiu)', /cortou 400 caracteres do meio/.test(t))
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUÇÃO DE VERDADE
// ─────────────────────────────────────────────────────────────────────────────
{
  const pedacos = []
  const ex = rodar(NO_WINDOWS ? 'Write-Output "alfa"' : 'echo alfa', { aoSair: t => pedacos.push(t) })
  const r = await ex.pronto
  checar('um comando simples roda, devolve código 0 e a saída', r.codigo === 0 && /alfa/.test(r.saida),
    `codigo ${r.codigo}: ${JSON.stringify(r.saida)}`)
  checar('a saída sai PELO CAMINHO DO TERMINAL enquanto roda (não só no fim)',
    pedacos.join('').includes('alfa'), `${pedacos.length} pedaço(s)`)
  checar('a execução sabe o PID do processo que criou', Number.isInteger(r.pid) && r.pid > 0, String(r.pid))

  // ⚠️ Este critério nasceu de um vermelho de verdade (V4, 11/09/2026): a primeira corrida devolveu
  // `alfa` cercado de `#< CLIXML` e 600 caracteres de `<Objs Version="1.1.0.1">…` — o PowerShell
  // serializa a barra de progresso no canal de erro quando a saída não é um console. Aquilo ia
  // inteiro para o terminal da pessoa e para a mensagem do agente.
  const limpo = !/CLIXML|<Objs /.test(r.saida)
  checar('a saída do PowerShell chega LIMPA (sem o CLIXML da barra de progresso)', limpo,
    JSON.stringify(r.saida.slice(0, 120)))
  checar('CONTROLE: o detector de CLIXML pegaria o caso sujo',
    /CLIXML|<Objs /.test('#< CLIXML\r\nalfa\r\n<Objs Version="1.1.0.1">'))

  const acento = rodar(NO_WINDOWS ? 'Write-Output "ação — não é \'fácil\'"' : 'echo "ação — não é fácil"')
  const ra = await acento.pronto
  checar('acento e aspas chegam inteiros na saída (o teste do EncodedCommand em campo)',
    /ação/.test(ra.saida) && /não/.test(ra.saida), JSON.stringify(ra.saida))

  const falho = rodar(NO_WINDOWS ? 'Write-Output "antes"; exit 3' : 'echo antes; exit 3')
  const rf = await falho.pronto
  checar('comando que falha devolve o código de saída dele, com a saída que houve',
    rf.codigo === 3 && /antes/.test(rf.saida), `codigo ${rf.codigo}`)

  const erro = rodar(NO_WINDOWS ? '[Console]::Error.WriteLine("ruim")' : 'echo ruim 1>&2')
  const re = await erro.pronto
  checar('o que o comando escreve no canal de ERRO entra na mesma saída, na ordem em que chegou',
    /ruim/.test(re.saida), JSON.stringify(re.saida))

  const naPasta = rodar(NO_WINDOWS ? 'Write-Output (Get-Location).Path' : 'pwd')
  const rp = await naPasta.pronto
  checar('o comando roda NA PASTA do projeto, não na pasta do programa',
    rp.saida.toLowerCase().includes(fs.realpathSync.native(pasta).toLowerCase()),
    JSON.stringify(rp.saida.trim()))

  // ⚠️ Sem interpretador o construtor não pode LANÇAR: ele roda dentro de um `canUseTool`, e uma
  // exceção ali deixaria o agente esperando para sempre por uma resposta que ninguém daria.
  const semNada = new C.Execucao({
    ferramenta: 'Bash', linha: 'echo x', cwd: pasta,
    interpretador: path.join(pasta, 'nao-existe-mesmo.exe'),
  })
  const rn = await semNada.pronto
  checar('interpretador que não existe vira RESULTADO com erro, nunca exceção', !!rn.erro, String(rn.erro))
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ CRITÉRIO 9 — cancelar mata o comando E os filhos dele, pelo PID
// ─────────────────────────────────────────────────────────────────────────────
if (NO_WINDOWS) {
  /** Quais destes PIDs ainda existem? Uma pergunta ao sistema, nunca ao próprio programa. */
  const vivos = pids => {
    if (!pids.length) return []
    const filtro = pids.map(p => `ProcessId=${p}`).join(' or ')
    try {
      const saida = execFileSync('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command',
          `Get-CimInstance Win32_Process -Filter "${filtro}" | ForEach-Object { $_.ProcessId }`],
        { encoding: 'utf8', windowsHide: true, timeout: 30000 })
      return saida.split(/\r?\n/).map(l => parseInt(l.trim(), 10)).filter(Number.isInteger)
    } catch { return [] }
  }
  const filhosDe = pai => {
    try {
      const saida = execFileSync('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command',
          `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pai}" | ForEach-Object { $_.ProcessId }`],
        { encoding: 'utf8', windowsHide: true, timeout: 30000 })
      return saida.split(/\r?\n/).map(l => parseInt(l.trim(), 10)).filter(Number.isInteger)
    } catch { return [] }
  }

  // Um comando que cria um NETO: é o caso que separa "matei o processo" de "não deixei órfão".
  const linha = `& '${process.execPath}' -e "setTimeout(function(){}, 60000)"`
  const ex = rodar(linha)
  const pai = ex.pid
  let netos = []
  const apareceu = await ate(async () => { netos = filhosDe(pai); return netos.length > 0 }, 30000)

  // CONTROLE POSITIVO: sem esta linha, "os processos sumiram" não prova nada — eles podem nunca
  // ter existido. É o erro que o V0.5 quase cometeu, e está registrado no plano.
  checar('CONTROLE: o comando longo criou mesmo um processo NETO, e ele estava vivo',
    apareceu && netos.length > 0, `pai ${pai}, netos ${netos.join(',') || 'nenhum'}`)
  const todos = [pai, ...netos]
  checar('CONTROLE: pai e neto aparecem na lista de processos do sistema', vivos(todos).length === todos.length,
    `vivos: ${vivos(todos).join(',')}`)

  const antesDeMatar = Date.now()
  ex.cancelar('parar')
  const r = await ex.pronto
  checar('cancelar termina a execução na hora (não espera o comando acabar)',
    r.cancelado === true && r.duracaoMs < 55000, `${r.duracaoMs} ms, cancelado=${r.cancelado}`)
  checar('o motivo do cancelamento viaja com o resultado', r.motivo === 'parar', String(r.motivo))

  const sobraram = await ate(async () => vivos(todos).length === 0, 20000)
  checar('⛔ critério 9: cancelar não deixa processo órfão — pai e NETO morreram, pelo PID',
    sobraram, `ainda vivos: ${vivos(todos).join(',') || 'nenhum'} (em ${Date.now() - antesDeMatar} ms)`)

  // A lei da casa, cobrada no código: matar por NOME está proibido em qualquer lugar deste arquivo.
  const fonte = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'comando.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  checar('⛔ o código não mata processo por NOME em lugar nenhum',
    !/\/IM\b/.test(fonte) && !/Stop-Process/.test(fonte) && !/taskkill[^)]*\/IM/i.test(fonte) &&
    !/\bpkill\b/.test(fonte) && !/\bkillall\b/.test(fonte))
  checar('CONTROLE: o detector de "matar por nome" pega o caso proibido',
    /\/IM\b/.test('taskkill /IM node.exe') && /Stop-Process/.test('Get-Process x | Stop-Process'))

  /*
    ⛔ A MORTE PELO PID QUE FALHA NÃO PODE SER ENGOLIDA. Se a primeira chamada ao sistema falhar (processo
    ainda nascendo, máquina sob carga), o cancelar tem de SABER e tentar de novo — antes, a falha ia para um
    callback vazio, `cancelar()` dizia `true`, e o comando seguia até o fim. O dublê falha a PRIMEIRA chamada
    de morte e deixa as outras irem ao sistema de verdade; o comando dorme 60 s, então terminar em poucos
    segundos só é possível se alguém tentou de novo.
  */
  const chamadasDeMorte = []
  const falhaUmaVez = (arquivo, args, opcoes, cb) => {
    if (/taskkill/i.test(arquivo)) {
      chamadasDeMorte.push(args.join(' '))
      if (chamadasDeMorte.length === 1) { setImmediate(() => cb(new Error('falha simulada da primeira morte'))); return {} }
    }
    return execFile(arquivo, args, opcoes, cb)
  }
  const exF = rodar('Start-Sleep -Seconds 60', { tetoMs: 120000, executarArquivo: falhaUmaVez })
  await esperar(300)
  const t0F = Date.now()
  exF.cancelar('parar')
  const rF = await Promise.race([exF.pronto, esperar(15000).then(() => null)])
  if (!rF) { exF.cancelar('parar'); await Promise.race([exF.pronto, esperar(15000)]) }
  checar('⛔ a morte pelo PID que falha é tentada DE NOVO — o comando para em segundos, não no fim dele',
    !!rF && rF.cancelado === true && Date.now() - t0F < 15000 && chamadasDeMorte.length >= 2,
    rF ? `${rF.duracaoMs} ms, ${chamadasDeMorte.length} chamada(s) de morte` : `não parou em 15 s; ${chamadasDeMorte.length} chamada(s) de morte`)
  checar('e a falha da primeira tentativa viaja no resultado (não é engolida)',
    !!rF && Array.isArray(rF.falhasAoParar) && rF.falhasAoParar.some(f => /falha simulada/.test(f)),
    rF && JSON.stringify(rF.falhasAoParar))
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ O COMANDO QUE DEIXA UM DESCENDENTE SEGURANDO A SAÍDA
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ ACHADO POR UM REVISOR INDEPENDENTE em 11/09/2026, e é o pior caso da versão: um comando que
// solta outro processo e sai (um servidor, um watcher, um `npm run dev &` — trabalho de todo dia de
// um agente de código). O shell sai na hora; o descendente herda o cano da saída e continua vivo. O
// Node só emite `close` quando o processo saiu E os canos fecharam — então a execução NUNCA
// terminava, a promessa nunca resolvia, e o `canUseTool` ficava esperando sem prazo ("permission
// prompts have no park deadline", diz o tipo do SDK). A tela ficava em "rodando…" para sempre.
if (NO_WINDOWS) {
  const marcador = path.join(pasta, 'neto-vivo.txt')
  const neto = path.join(pasta, 'neto.js')
  fs.writeFileSync(neto, `require('fs').writeFileSync(${JSON.stringify(marcador)}, String(process.pid)); setTimeout(function(){}, 60000)`)

  /*
    ⚠️ O CENÁRIO TEM DE SER O QUE HERDA O CANO, e a primeira tentativa não era. Com
    `Start-Process` do PowerShell o descendente nasce DESLIGADO dos fluxos: o `close` chega na hora,
    e o defeito (a execução que nunca termina) não aparece — o teste ficava verde sem exercitar
    nada. Quem herda a saída é o `&` do shell, que é exatamente o caso que o revisor mediu.
    Sem bash nesta máquina o cenário não existe, e isso é DITO em vez de virar um OK silencioso.
  */
  const bash = C.acharInterpretador('Bash')
  checar('esta máquina tem o shell para medir o descendente que herda a saída', !!bash,
    bash || 'sem bash: os critérios do descendente NÃO foram verificados nesta corrida')
  const emBarra = p => p.replace(/\\/g, '/')
  const ex = bash
    ? rodar(`"${emBarra(process.execPath)}" "${emBarra(neto)}" & echo lancado`,
      { ferramenta: 'Bash', interpretador: bash, tetoMs: 60000 })
    : rodar(`Start-Process -FilePath '${process.execPath}' -ArgumentList '${neto.replace(/\\/g, '\\\\')}' -WindowStyle Hidden; Write-Output lancado`,
      { tetoMs: 60000 })
  const t0 = Date.now()
  const r = await ex.pronto
  const demorou = Date.now() - t0
  checar('⛔ o comando que solta um descendente TERMINA assim mesmo (ninguém fica pendurado)',
    !!r && demorou < 20000, `${demorou} ms, codigo ${r && r.codigo}`)

  // O PID do descendente vem do próprio descendente, gravado em arquivo — nunca de uma busca por
  // nome. A lei da casa vale também para os testes: nome de processo não diz de quem ele é.
  let pidDoNeto = null
  await ate(async () => {
    try { pidDoNeto = parseInt(fs.readFileSync(marcador, 'utf8').trim(), 10); return Number.isInteger(pidDoNeto) } catch { return false }
  }, 20000)
  checar('CONTROLE: o descendente nasceu mesmo, e gravou o PID dele em arquivo',
    Number.isInteger(pidDoNeto), String(pidDoNeto))

  const existe = pid => {
    try {
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ProcessId`],
        { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim().length > 0
    } catch { return false }
  }

  if (Number.isInteger(pidDoNeto)) {
    checar('CONTROLE: o descendente está VIVO depois de o comando terminar', existe(pidDoNeto))
    // ⚠️ E ele CONTINUA vivo, de propósito: quem pediu um servidor em segundo plano quer o servidor
    // rodando. O que a OFICINA deve é DIZER — matar o que a pessoa pediu para ficar seria pior.
    checar('⛔ o resultado DIZ que o comando deixou algo rodando (o agente precisa saber)',
      r.deixouAlgoRodando === true, `deixouAlgoRodando=${r.deixouAlgoRodando}, saida=${JSON.stringify(r.saida)}`)
    const msg = C.mensagemDoComando(r)
    checar('⛔ e a mensagem ao agente avisa, com todas as letras, que ficou processo vivo',
      /segundo plano/.test(msg) && /não morre com o botão Parar/.test(msg), msg.slice(-200))
    // O teste não deixa lixo na máquina de ninguém: mata o que ELE criou, pelo PID exato que o
    // próprio processo gravou — nunca por nome.
    try { execFileSync('taskkill', ['/PID', String(pidDoNeto), '/F'], { windowsHide: true }) } catch { }
  }

  /*
    ⛔ E O CASO QUE O BOTÃO PARAR TEM DE COBRIR: o comando solta um descendente e CONTINUA rodando
    (um `npm run dev` que abre um servidor filho). Aqui a pessoa aperta Parar — e o `taskkill /T`
    sozinho não basta, porque o descendente foi solto e não está mais na árvore do shell. Quem o
    alcança é a varredura por parentesco + data de criação.
  */
  const marcador2 = path.join(pasta, 'neto-vivo-2.txt')
  const neto2 = path.join(pasta, 'neto2.js')
  fs.writeFileSync(neto2, `require('fs').writeFileSync(${JSON.stringify(marcador2)}, String(process.pid)); setTimeout(function(){}, 90000)`)
  const ex2 = rodar(`Start-Process -FilePath '${process.execPath}' -ArgumentList '${neto2.replace(/\\/g, '\\\\')}' -WindowStyle Hidden; Start-Sleep -Seconds 90`,
    { tetoMs: 90000 })
  let pidDoNeto2 = null
  await ate(async () => {
    try { pidDoNeto2 = parseInt(fs.readFileSync(marcador2, 'utf8').trim(), 10); return Number.isInteger(pidDoNeto2) } catch { return false }
  }, 30000)
  checar('CONTROLE: com o comando AINDA rodando, o descendente está vivo',
    Number.isInteger(pidDoNeto2) && existe(pidDoNeto2), String(pidDoNeto2))
  ex2.cancelar('parar')
  const r2 = await ex2.pronto
  checar('o comando longo foi cancelado', r2.cancelado === true, JSON.stringify({ cancelado: r2.cancelado, motivo: r2.motivo }))
  if (Number.isInteger(pidDoNeto2)) {
    const morreu = await ate(async () => !existe(pidDoNeto2), 40000)
    checar('⛔ critério 9, o caso difícil: parar alcança o descendente SOLTO da árvore (pelo PID)',
      morreu, morreu ? `o pid ${pidDoNeto2} morreu` : `o pid ${pidDoNeto2} continua vivo`)
    if (!morreu) { try { execFileSync('taskkill', ['/PID', String(pidDoNeto2), '/F'], { windowsHide: true }) } catch { } }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O TETO DE TEMPO — um comando que não termina não prende a conversa para sempre
// ─────────────────────────────────────────────────────────────────────────────
{
  const ex = rodar(NO_WINDOWS ? 'Start-Sleep -Seconds 60' : 'sleep 60', { tetoMs: 1500 })
  const r = await ex.pronto
  checar('o teto de tempo para o comando, e diz que foi o tempo',
    r.cancelado === true && r.motivo === 'tempo' && r.duracaoMs < 20000,
    `${r.duracaoMs} ms, motivo ${r.motivo}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// A MENSAGEM QUE O AGENTE OUVE — a peça que faz um `deny` carregar um sucesso
// ─────────────────────────────────────────────────────────────────────────────
{
  const base = { linha: 'npm test', codigo: 0, saida: '3 passaram', duracaoMs: 900, cancelado: false }
  const ok = C.mensagemDoComando(base)
  checar('sucesso: a mensagem diz que NÃO é erro, mostra o comando, o código e a saída',
    /NÃO é um erro/.test(ok) && /npm test/.test(ok) && /Código de saída: 0/.test(ok) && /3 passaram/.test(ok))
  checar('sucesso: a mensagem manda NÃO repetir o comando', /Não rode de novo/.test(ok))

  const ruim = C.mensagemDoComando({ ...base, codigo: 1, saida: 'falhou feio' })
  checar('falha: a mensagem entrega o código 1 e a saída, e diz que o comando RODOU',
    /Código de saída: 1/.test(ruim) && /terminou com erro/.test(ruim) && /falhou feio/.test(ruim) &&
    /NÃO é um erro nem uma recusa/.test(ruim))

  // ⚠️ A frase do PARAR é a alavanca da OFICINA sobre a escolha do modelo — a mesma lição que a
  // revisão funcional da V3 cobrou no botão Parar (ele voltava sozinho ao pedido interrompido).
  const parado = C.mensagemDoComando({ ...base, cancelado: true, motivo: 'parar', saida: 'metade' })
  checar('parado pela pessoa: a mensagem diz que foi ELA, e proíbe refazer por conta própria',
    /A PESSOA parou/.test(parado) && /NÃO rode este comando de novo/.test(parado) && /metade/.test(parado))

  const tempo = C.mensagemDoComando({ ...base, cancelado: true, motivo: 'tempo', duracaoMs: 120000 })
  checar('parado pelo tempo: diz que foi o tempo limite, com os segundos',
    /tempo limite \(120 s\)/.test(tempo) && !/A PESSOA/.test(tempo))

  const nasceuMorto = C.mensagemDoComando({ ...base, erro: 'ENOENT', codigo: null })
  checar('não conseguiu iniciar: diz que NADA rodou (e não manda o agente tentar de novo)',
    /não conseguiu iniciar/.test(nasceuMorto) && /Nada rodou/.test(nasceuMorto))

  const mudo = C.mensagemDoComando({ ...base, saida: '   ' })
  checar('comando calado: a mensagem diz que ele não escreveu nada, em vez de parecer truncada',
    /não escreveu nada/.test(mudo))

  const porSinal = C.mensagemDoComando({ ...base, codigo: null, sinal: 'SIGKILL' })
  checar('sem código de saída, o sinal é dito (e não vira "0" por acidente)',
    /morto pelo sinal SIGKILL/.test(porSinal))
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ A JANELA FECHA: o que a OFICINA deixou rodando morre junto (`encerramento.js`)
// ─────────────────────────────────────────────────────────────────────────────
//
// Medido no executável (19/09/2026): fechando a janela do jeito normal, o comando em primeiro plano (o terminal
// da OFICINA) e o de segundo plano (o programa do agente) ficavam vivos, órfãos. O `deactivate` era vazio.
{
  const E = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'encerramento.js'))
  // A regra, numa tabela inventada: quem entra e — mais importante — quem NÃO entra.
  const T0 = 1_000_000
  const AGENTE = 'C:\\ext\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe'
  const tabela = [
    { pid: 100, pai: 1, exe: 'C:\\app\\OFICINA.exe', criadoMs: T0 - 60000 },                   // o host
    { pid: 200, pai: 100, exe: 'C:\\Git\\bin\\bash.exe', criadoMs: T0 + 5000 },                 // comando em curso
    { pid: 201, pai: 200, exe: 'C:\\Git\\usr\\bin\\bash.exe', criadoMs: T0 + 5100 },
    { pid: 202, pai: 201, exe: 'C:\\Windows\\powershell.exe', criadoMs: T0 + 5200 },
    { pid: 300, pai: 100, exe: AGENTE.toLowerCase(), criadoMs: T0 + 1000 },                    // o agente desta janela
    { pid: 301, pai: 300, exe: 'C:\\Git\\bin\\bash.exe', criadoMs: T0 + 9000 },                 // segundo plano dele
    { pid: 302, pai: 301, exe: 'C:\\Windows\\powershell.exe', criadoMs: T0 + 9100 },
    { pid: 400, pai: 100, exe: 'C:\\outra\\claude.exe', criadoMs: T0 + 2000 },                 // o de outra extensão
    { pid: 401, pai: 400, exe: 'C:\\Git\\bin\\bash.exe', criadoMs: T0 + 2100 },
    { pid: 500, pai: 100, exe: 'C:\\Git\\cmd\\git.exe', criadoMs: T0 + 3000 },                 // o git do editor
    { pid: 600, pai: 200, exe: 'C:\\x\\velho.exe', criadoMs: T0 - 50000 },                     // PID reciclado: mais velho que a raiz
    { pid: 700, pai: 999, exe: AGENTE, criadoMs: T0 + 1000 },                                   // o mesmo programa, filho de OUTRA janela
    { pid: 701, pai: 700, exe: 'C:\\Git\\bin\\bash.exe', criadoMs: T0 + 1100 },
  ]
  const alvo = E.processosParaEncerrar(tabela, {
    hostPid: 100, executavelDoAgente: AGENTE, raizesDoExecutor: [{ pid: 200, desdeMs: T0 + 5000 }], desdeMs: T0,
  }).sort((a, b) => a - b)
  checar('⛔ ao fechar: o comando em curso e toda a descendência dele entram na lista',
    [200, 201, 202].every(p => alvo.includes(p)), alvo.join(','))
  checar('⛔ ao fechar: o que o agente DESTA janela lançou entra — o agente em si, não', [301, 302].every(p => alvo.includes(p)) && !alvo.includes(300), alvo.join(','))
  checar('⛔ ao fechar: nada de outra extensão, do editor, de outra janela, nem PID reciclado',
    [100, 400, 401, 500, 600, 700, 701].every(p => !alvo.includes(p)), alvo.join(','))
  checar('sem conversa e sem comando, nem a tabela é lida (a janela fecha sem custo)',
    (() => { let leu = false; const o = E.meios.lerTabela; E.meios.lerTabela = () => { leu = true; return [] }
      const r = E.encerrarOQueFicou({ hostPid: 1, raizesDoExecutor: [], agenteAbriu: false }); E.meios.lerTabela = o; return !leu && r.pids.length === 0 })())

  // E com processos DE VERDADE, pelos meios de verdade (a tabela do sistema e a morte pelo PID).
  if (NO_WINDOWS) {
    const existe = pid => {
      try {
        return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ProcessId`],
          { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim().length > 0
      } catch { return false }
    }
    // (1) um comando em curso que criou um NETO — a raiz do executor.
    const ex = rodar(`& '${process.execPath}' -e "setTimeout(function(){}, 60000)"`, { tetoMs: 120000 })
    let netos = []
    await ate(async () => {
      try {
        netos = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `Get-CimInstance Win32_Process -Filter "ParentProcessId=${ex.pid}" | ForEach-Object { $_.ProcessId }`],
          { encoding: 'utf8', windowsHide: true, timeout: 30000 }).split(/\r?\n/).map(l => parseInt(l, 10)).filter(Number.isInteger)
      } catch { netos = [] }
      return netos.length > 0
    }, 30000)
    // (2) um "agente" (este mesmo node, filho DESTE processo) que lança um filho e fica esperando.
    const desde = Date.now()
    const marca = path.join(pasta, 'filho-do-agente.txt')
    const { spawn } = await import('node:child_process')
    const agente = spawn(process.execPath, ['-e',
      `const f=require('child_process').spawn(process.execPath,['-e','setTimeout(function(){},60000)'],{stdio:'ignore'});` +
      `require('fs').writeFileSync(${JSON.stringify(marca)}, String(f.pid)); setTimeout(function(){},60000)`], { stdio: 'ignore', windowsHide: true })
    let filhoDoAgente = null
    await ate(async () => { try { filhoDoAgente = parseInt(fs.readFileSync(marca, 'utf8'), 10); return Number.isInteger(filhoDoAgente) } catch { return false } }, 20000)
    const todos = [ex.pid, ...netos, filhoDoAgente].filter(Number.isInteger)
    checar('CONTROLE: comando, neto, "agente" e o filho dele estão vivos antes de fechar',
      netos.length > 0 && Number.isInteger(filhoDoAgente) && todos.every(existe) && existe(agente.pid),
      `comando ${ex.pid}, netos ${netos.join(',')}, agente ${agente.pid}, filho ${filhoDoAgente}`)
    const t0 = Date.now()
    const r = E.encerrarOQueFicou({ hostPid: process.pid, executavelDoAgente: process.execPath,
      raizesDoExecutor: [{ pid: ex.pid, desdeMs: ex.comecou }], desdeMs: desde, agenteAbriu: true })
    const levou = Date.now() - t0
    const sobraram = todos.filter(existe)
    checar('⛔ ao fechar, pelos meios de verdade: comando, neto e o filho do agente morrem ANTES de a função voltar',
      sobraram.length === 0 && !r.erro, `sobraram ${sobraram.join(',') || 'nenhum'} · ${levou} ms · ${JSON.stringify(r)}`)
    checar('e o "agente" em si fica (ele sai sozinho quando a janela fecha)', existe(agente.pid), String(agente.pid))
    // Limpeza: só o que ESTE teste criou, pelo PID que ele mesmo lançou.
    try { agente.kill() } catch { }
    for (const p of sobraram) { try { process.kill(p) } catch { } }
    await ex.pronto
  }
}

try { fs.rmSync(pasta, { recursive: true, force: true }) } catch { }

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome),
}))
process.exit(passou ? 0 : 1)
