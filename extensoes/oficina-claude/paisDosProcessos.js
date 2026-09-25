// QUEM É O PAI DE CADA PROCESSO — para saber quais conversas são DESTA janela (V27).
//
// ⚠️ POR QUE ISTO EXISTE. O registro `~/.claude/sessions/<pid>.json` diz a pasta de cada conversa,
// mas não diz de qual PROGRAMA ela é. Com a mesma pasta aberta no VS Code e na OFICINA, as duas
// janelas registram conversas iguais em tudo (`entrypoint: 'claude-vscode'`, mesmo `cwd`) — e a barra
// de uma mostrava o gasto da outra.
//
// O que separa é o processo: toda conversa da extensão oficial é FILHA do host de extensões da
// janela que a abriu. Medido nesta máquina em 25/09/2026, com 9 registros:
//
//   6 conversas da OFICINA  -> pai 28664 (o host de extensões da OFICINA)
//   1 conversa do VS Code   -> pai  7024 (Code.exe)
//   2 registros velhos      -> pai services.exe / explorer.exe (PID REAPROVEITADO pelo Windows)
//
// E o host é o mesmo processo em que esta extensão roda: a conversa que a PRÓPRIA extensão abre pelo
// SDK (`sdk-ts`) também é filha do 28664. Então "conversa desta janela" = "filha de `process.pid`".
//
// ⚠️ O PAI SE PERGUNTA AO SISTEMA, E ISSO CUSTA: no Windows é uma consulta ao WMI (centenas de ms).
// Por isso (1) uma consulta só para todos os PIDs novos, (2) o resultado fica guardado por PID+início
// — o pai de um processo não muda enquanto ele vive — e (3) a consulta é assíncrona e nunca
// segura o tique: enquanto a resposta não chega, quem chama segue com o que já sabe.

'use strict'

const { execFile } = require('child_process')

/** Teto de uma consulta. Estourou = não se sabe o pai, e quem chama cai no critério antigo. */
const TETO_MS = 8000

/** O maior PID que o sistema aceita numa consulta (32 bits sem sinal). */
const PID_MAXIMO = 0xFFFFFFFF
/** Depois de uma consulta que falhou, quanto esperar antes de perguntar de novo. */
const RECUO_MS = 60000
/**
 * Tolerância ao comparar a hora de criação do registro com a do sistema, em unidades de 100 ns.
 * Medido em 25/09/2026: o `procStart` do registro e o `CreationDate` do WMI diferem só no último dígito
 * (o WMI guarda microssegundos). 10.000 = 1 ms: folga larga para isso, curta demais para um PID
 * reaproveitado, que nasce segundos ou dias depois.
 */
const TOLERANCIA_INICIO = 10000n

/**
 * Pergunta ao sistema o pai (e a hora de criação) de cada PID.
 * Devolve `Map<pid, { pai, inicio }>` só com os que responderam — `inicio` é a hora de criação no
 * formato do Windows (FILETIME, texto de 18 dígitos), igual ao `procStart` do registro de sessões.
 *
 * ⚠️ Os PIDs vão para dentro de um comando: só entram inteiros de 1 a 2³²−1. A primeira versão só
 * conferia "inteiro positivo" — `1e21` e `4294967296` passavam, o WMI recusava a consulta INTEIRA, e
 * um único arquivo de sessão corrompido deixava todos os pais desconhecidos para sempre (revisão).
 */
function consultarPais(pids, { plataforma = process.platform, executar = execFile } = {}) {
  const limpos = [...new Set(pids)].filter(p => Number.isInteger(p) && p > 0 && p <= PID_MAXIMO)
  if (!limpos.length) return Promise.resolve(new Map())
  // Devolve `Map` quando perguntou, `null` quando não conseguiu perguntar (ver `ler`).
  return new Promise(resolve => {
    const ler = (erro, saida) => {
      const mapa = new Map()
      // ⚠️ FALHA DEVOLVE `null`, NÃO MAPA VAZIO. Mapa vazio quer dizer "perguntei e nenhum desses
      // existe mais"; falha quer dizer "não consegui perguntar". Confundir os dois gravaria "sem pai"
      // PARA SEMPRE em conversas vivas por causa de uma consulta que estourou o tempo uma vez.
      if (erro || typeof saida !== 'string') return resolve(null)
      for (const linha of saida.split(/\r?\n/)) {
        const m = linha.trim().match(/^(\d+)\s+(\d+)(?:\s+(\d+))?$/)
        if (m) mapa.set(Number(m[1]), { pai: Number(m[2]), inicio: m[3] || null })
      }
      resolve(mapa)
    }
    try {
      if (plataforma === 'win32') {
        const filtro = limpos.map(p => `ProcessId=${p}`).join(' OR ')
        const comando = `Get-CimInstance Win32_Process -Filter '${filtro}' | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.ToFileTimeUtc())" }`
        // Caminho ABSOLUTO do PowerShell, e não o do PATH (revisão): o PATH do host de extensões é o de
        // quem abriu o programa, e um `powershell.exe` qualquer à frente dele rodaria no lugar.
        const ps = require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        executar(ps, ['-NoProfile', '-NonInteractive', '-Command', comando],
          { timeout: TETO_MS, windowsHide: true }, ler)
      } else {
        // Fora do Windows não há `procStart` para comparar: só o pai.
        executar('ps', ['-o', 'pid=,ppid=', '-p', limpos.join(',')], { timeout: TETO_MS }, (erro, saida) => ler(saida ? null : erro, saida))
      }
    } catch { resolve(null) }
  })
}

/** O processo que respondeu é o MESMO que o registro descreve? (PID reaproveitado → não é.) */
function mesmoProcesso(procStart, inicio) {
  if (!procStart || !inicio) return true // sem as duas horas não há como desmentir: vale o PID
  try {
    const d = BigInt(String(procStart)) - BigInt(String(inicio))
    return (d < 0n ? -d : d) <= TOLERANCIA_INICIO
  } catch { return true }
}

/**
 * Guarda os pais já conhecidos e pergunta só pelos novos.
 *
 * A chave é `pid:procStart` e não só o PID: o Windows reaproveita PID (medido, ver o cabeçalho).
 * E a hora de criação que o sistema devolve é COMPARADA com a do registro: se não bate, o PID é de
 * outro processo, a sessão do registro morreu, e ela fica sem pai (a revisão pegou que a primeira
 * versão só usava o `procStart` como rótulo do cache, sem nunca conferir).
 */
function criarPaisDosProcessos({ consultar = consultarPais, agora = () => Date.now() } = {}) {
  const conhecidos = new Map()
  let perguntando = false
  let proximaTentativa = 0

  const chave = s => `${s.pid}:${s.procStart || ''}`

  /** O pai já conhecido desta sessão, ou `undefined` se ainda não se sabe. */
  function paiDe(sessao) { return conhecidos.get(chave(sessao)) }

  /** Pergunta pelos que faltam. Não espera: a resposta vale para a próxima passada. */
  function atualizar(sessoes) {
    const faltam = sessoes.filter(s => !conhecidos.has(chave(s)))
    if (!faltam.length || perguntando || agora() < proximaTentativa) return Promise.resolve()
    perguntando = true
    return consultar(faltam.map(s => s.pid)).then(mapa => {
      // Não consegui perguntar: nada gravado, e a próxima tentativa só depois do recuo — sem isto, uma
      // consulta quebrada disparava um PowerShell novo a cada 3 segundos, para sempre.
      if (!mapa) { proximaTentativa = agora() + RECUO_MS; return }
      for (const s of faltam) {
        const r = mapa.get(s.pid)
        // Quem não respondeu (morreu), ou respondeu mas é OUTRO processo com o mesmo PID, fica como
        // `null`: sabido que não há pai para mostrar, e não se pergunta de novo a cada tique.
        conhecidos.set(chave(s), r && mesmoProcesso(s.procStart, r.inicio) ? r.pai : null)
      }
    }).catch(() => { }).then(() => { perguntando = false })
  }

  return { paiDe, atualizar, get tamanho() { return conhecidos.size } }
}

module.exports = { consultarPais, criarPaisDosProcessos, mesmoProcesso, TETO_MS, PID_MAXIMO, RECUO_MS }
