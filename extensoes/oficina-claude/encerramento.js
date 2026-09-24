'use strict'
/**
 * O QUE A OFICINA DEIXOU RODANDO, ENCERRADO QUANDO A JANELA FECHA.
 *
 * ⚠️ MEDIDO (19/09/2026), no executável, com uma conversa de verdade: pedi ao agente um comando em primeiro
 * plano (quem roda é o terminal da OFICINA) e outro em segundo plano (quem roda é o próprio agente) e fechei
 * a janela do jeito normal. Os DOIS continuaram vivos depois, órfãos: o `powershell` do primeiro e toda a
 * cadeia `bash → bash → bash → powershell` do segundo. O host de extensões sai uns 30 ms depois de pedir a
 * desativação, e o `deactivate` desta extensão era vazio.
 *
 * ⚠️ E NÃO BASTA DISPARAR O `taskkill` E SAIR. Medido no mesmo executável: um processo lançado DURANTE a
 * desativação morre junto com o host antes de fazer qualquer coisa. Por isso aqui tudo é SÍNCRONO — a
 * leitura da tabela de processos e as mortes acontecem antes de `deactivate` devolver. O editor dá até 5 s
 * para isso; o que se gasta aqui é o tempo de um PowerShell lendo a tabela (medido fora do editor: 0,44 a
 * 0,52 s, com ~290 processos) e o de uma única chamada de morte, com todos os PIDs.
 *
 * O que é encerrado — e só isso, sempre por PID (nome de processo não diz de quem ele é):
 *   1. os comandos que a OFICINA está rodando AGORA (o terminal do agente) e toda a descendência deles —
 *      a mesma regra de fechar a aba (`agente.js`, `encerrar`): a conversa que pediu o comando acabou, e
 *      ninguém mais teria como pará-lo. Comando que JÁ TERMINOU e deixou um servidor solto não entra: esse
 *      foi pedido para ficar, e a mensagem ao agente já disse isso (`comando.js`).
 *   2. a descendência do PROGRAMA DO AGENTE que esta janela abriu (os comandos em segundo plano dele, os
 *      servidores MCP que ele subiu) — não o programa em si, que sai sozinho quando a janela fecha.
 *      "O programa do agente desta janela" = filho DESTE host, com o executável exato que vem dentro da
 *      extensão. Outro `claude.exe` (a extensão oficial, um terminal) tem outro pai ou outro caminho.
 * Em todos os casos, só o que nasceu DEPOIS da raiz: o Windows recicla PID, e sem a data um processo novo
 * que herdasse o número de um morto viraria alvo.
 */

const path = require('path')
const { execFileSync } = require('child_process')

/**
 * A lista de PIDs a encerrar, a partir de uma foto da tabela de processos. Função pura: é o que os testes provam.
 * @param {{pid:number, pai:number, exe:string|null, criadoMs:number}[]} tabela
 * @param {object} o
 * @param {number} o.hostPid                 o processo deste host de extensões
 * @param {string|null} o.executavelDoAgente o `claude.exe` que vem dentro da extensão
 * @param {{pid:number, desdeMs:number}[]} o.raizesDoExecutor  os comandos rodando agora (terminal do agente)
 * @param {number} o.desdeMs                 quando a extensão ativou (o agente desta janela é mais novo que isso)
 */
function processosParaEncerrar(tabela, { hostPid, executavelDoAgente, raizesDoExecutor = [], desdeMs = 0 }) {
  const FOLGA = 1000   // relógio do sistema e do Node não batem ao milissegundo
  const filhos = new Map()
  for (const p of tabela) {
    if (!filhos.has(p.pai)) filhos.set(p.pai, [])
    filhos.get(p.pai).push(p)
  }
  const alvo = new Set()
  const descer = (raiz, desde) => {
    const fila = [raiz]
    const vistos = new Set([raiz])
    while (fila.length) {
      const atual = fila.shift()
      for (const f of filhos.get(atual) || []) {
        if (vistos.has(f.pid) || f.pid === hostPid || !(f.criadoMs >= desde - FOLGA)) continue
        vistos.add(f.pid)
        alvo.add(f.pid)
        fila.push(f.pid)
      }
    }
  }
  const porPid = new Map(tabela.map(p => [p.pid, p]))
  for (const r of raizesDoExecutor) {
    if (!r || !Number.isInteger(r.pid)) continue
    const linha = porPid.get(r.pid)
    // A raiz só entra se é a MESMA (nasceu depois do comando começar); a descendência, pelo parentesco, que o
    // Windows guarda mesmo depois de o pai morrer.
    if (linha && linha.criadoMs >= r.desdeMs - FOLGA && r.pid !== hostPid) alvo.add(r.pid)
    descer(r.pid, r.desdeMs)
  }
  const mesmo = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  for (const p of tabela) {
    if (p.pai !== hostPid || !mesmo(p.exe, executavelDoAgente) || !(p.criadoMs >= desdeMs - FOLGA)) continue
    descer(p.pid, p.criadoMs)
  }
  alvo.delete(hostPid)
  return [...alvo]
}

/** A tabela de processos do Windows (PID, pai, executável, criação). Vazia fora do Windows ou se falhar. */
function lerTabela() {
  if (process.platform !== 'win32') return []
  const script = 'Get-CimInstance Win32_Process | ForEach-Object { "{0}|{1}|{2}|{3}" -f $_.ProcessId, $_.ParentProcessId, ' +
    '$(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString("o") } else { "" }), $_.ExecutablePath }'
  const saida = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 16 * 1024 * 1024 })
  const tabela = []
  for (const linha of saida.split(/\r?\n/)) {
    const [pid, pai, criado, ...resto] = linha.split('|')
    const p = parseInt(pid, 10), q = parseInt(pai, 10), c = Date.parse(criado)
    if (!Number.isInteger(p) || !Number.isInteger(q)) continue
    tabela.push({ pid: p, pai: q, criadoMs: Number.isFinite(c) ? c : NaN, exe: resto.join('|').trim() || null })
  }
  return tabela
}

/** Encerra estes PIDs, de uma vez, pelo número. Síncrono (ver o topo do arquivo). */
function matar(pids) {
  if (!pids.length) return
  if (process.platform === 'win32') {
    const args = ['/F']
    for (const p of pids) args.push('/PID', String(p))
    try { execFileSync('taskkill', args, { windowsHide: true, timeout: 1500, stdio: 'ignore' }) } catch { }
  } else {
    for (const p of pids) { try { process.kill(p, 'SIGKILL') } catch { } }
  }
}

/** Os meios de verdade; os testes trocam por dublês (a tabela inventada, a morte anotada). */
const meios = { lerTabela, matar }

/**
 * Chamado pelo `deactivate`. Nunca lança: a janela tem de fechar mesmo que isto falhe.
 * Devolve o que fez, para o registro e para os testes.
 */
function encerrarOQueFicou(o) {
  const semNada = !(o.raizesDoExecutor && o.raizesDoExecutor.length) && !o.agenteAbriu
  if (semNada) return { pids: [], pulou: 'nada a encerrar' }
  try {
    const pids = processosParaEncerrar(meios.lerTabela(), o)
    meios.matar(pids)
    return { pids }
  } catch (e) {
    return { pids: [], erro: String((e && e.message) || e).slice(0, 200) }
  }
}

module.exports = { processosParaEncerrar, encerrarOQueFicou, meios }
