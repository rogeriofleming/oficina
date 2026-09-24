// A CONSULTA DE USO — medida SEM DUBLÊ NENHUM, contra o agente de verdade.
//
// ⚠️ POR QUE ESTA SUÍTE EXISTE, e por que ela aceita ser lenta. A rodada 1 de revisores da V20
// achou um teste verde sobre um produto quebrado: o dublê do medidor TINHA um método que a classe
// real não tem, e o mostrador nunca apareceu na tela. A lição foi "medir o objeto real", e aqui
// ela é levada a sério: esta suíte sobe a consulta de verdade, pergunta de verdade, e confere o
// número contra a faixa de 0 a 100.
//
// O que precisa ser verdade:
//   1. a consulta REAL sobe sem conversa aberta e responde (medido: ~7 s na primeira pergunta);
//   2. o número que ela devolve é percentual de verdade, nas duas janelas;
//   3. a 2a pergunta, na mesma consulta viva, é rápida (medido: ~244 ms);
//   4. ⚠️ ela NÃO se disfarça da conversa dele: com o `cwd` fora da pasta aberta, `sessaoAtiva`
//      continua escolhendo a mesma conversa de antes (é o que protege o `t196` e o `t201`);
//   5. o cache em arquivo guarda só os quatro campos, e nada que identifique a conta;
//   6. descartar derruba o processo do agente (~232 MB);
//   7. e não deixa registro de sessão órfão para trás.
//
// ⚠️ ELA CUSTA ~10 s E PRECISA DE REDE. Na bateria rápida isso pesa; por isso quem a chama dá o
// prazo. Sem rede ou sem login, o caso 1 fica vermelho — e é o aviso certo, não ruído: significa
// que a faixa vai viver do piso.
//
// Uso:  node testes/consulta_de_uso.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const C = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'consultaDeUso.js'))
const S = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'sessaoAtiva.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const pastaDasSessoes = S.pastaDasSessoes()
const listarSessoes = () => {
  try { return fs.readdirSync(pastaDasSessoes) } catch { return [] }
}

// ── 1 a 4. A consulta REAL ──
const antesDasSessoes = listarSessoes()
const escolhidaAntes = S.sessaoDaPasta(REPO)

const consulta = C.criarConsulta()      // sem carregador de mentira: é o SDK do pacote
const t0 = Date.now()
const primeira = await consulta.perguntar()
const msPrimeira = Date.now() - t0

checar('1. a consulta real sobe SEM conversa aberta e responde',
  primeira.estado === 'ok', `${primeira.estado}${primeira.erro ? ': ' + primeira.erro.message : ''}`)
if (primeira.estado === 'ok') console.log(`       (a primeira pergunta levou ${(msPrimeira / 1000).toFixed(1)} s)`)

{
  const rl = primeira.estado === 'ok' && primeira.resposta ? primeira.resposta.rate_limits : null
  const cinco = rl && rl.five_hour ? rl.five_hour.utilization : null
  const sete = rl && rl.seven_day ? rl.seven_day.utilization : null
  const percentual = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
  checar('2. as duas janelas vêm como percentual de verdade (0 a 100)',
    percentual(cinco) && percentual(sete), JSON.stringify({ cinco, sete }))
  if (percentual(cinco)) console.log(`       (medido agora: 5h ${cinco}% · 7d ${sete}%)`)
}

{
  const t1 = Date.now()
  const segunda = await consulta.perguntar()
  const ms = Date.now() - t1
  checar('3. a 2a pergunta, na mesma consulta viva, é rápida',
    segunda.estado === 'ok' && ms < 5000, `${segunda.estado} em ${ms} ms`)
}

{
  // ⚠️ O CASO QUE VALE MAIS DE TODOS. Subir a consulta grava um registro de sessão com
  // `"entrypoint":"claude-vscode"` — igual ao de uma conversa de verdade. Se o `cwd` fosse a pasta
  // aberta, o `sessaoAtiva` a escolheria (registro mais novo) e o mostrador de tokens passaria a
  // mostrar o gasto de uma consulta que não gasta nada: zero na barra, com a conversa dele viva ao
  // lado. O `cwd` fora da pasta é o que impede isso, e é isto que este caso mede.
  const escolhidaDepois = S.sessaoDaPasta(REPO)
  const mesmo = JSON.stringify(escolhidaAntes && escolhidaAntes.sessionId) === JSON.stringify(escolhidaDepois && escolhidaDepois.sessionId)
  checar('4. a consulta NÃO se disfarça da conversa da pasta aberta',
    mesmo && !path.resolve(consulta.cwd).toLowerCase().startsWith(path.resolve(REPO).toLowerCase()),
    JSON.stringify({ antes: escolhidaAntes && escolhidaAntes.sessionId, depois: escolhidaDepois && escolhidaDepois.sessionId, cwd: consulta.cwd }))
}

// ── 5. o cache ──
{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-cache-'))
  const respostaSuja = {
    session: { total_cost_usd: 1.23 },
    subscription_type: 'max',
    rate_limits: {
      five_hour: { utilization: 42, resets_at: '2026-09-21T22:50:00Z' },
      seven_day: { utilization: 90, resets_at: '2026-09-24T13:00:00Z' },
      seven_day_breakdown: { rows: [{ display_name: 'Claude Code', percent: 80 }] },
      extra_usage: { is_enabled: false },
      model_scoped: { modelo: { id: 'id-que-nao-precisa-ir-para-disco' } },
      accountUuid: 'nao-pode-vazar-0000',
    },
  }
  await C.gravarCache(pasta, respostaSuja, 1789996312070)
  const cru = fs.readFileSync(C.caminhoDoCache(pasta), 'utf8')
  const lido = await C.lerCache(pasta)
  checar('5a. o cache guarda os quatro campos e volta legível',
    !!lido && lido.colhidoEm === 1789996312070 && lido.rate_limits.five_hour.utilization === 42
    && !!lido.rate_limits.seven_day_breakdown, cru.slice(0, 160))
  checar('5b. e NADA que identifique a conta (nem a sessão, nem o plano, nem os ids de modelo) vai para o disco',
    !/accountUuid|nao-pode-vazar|subscription_type|total_cost_usd|model_scoped/i.test(cru), cru.slice(0, 200))
  fs.rmSync(pasta, { recursive: true, force: true })
}

// ── 6. descartar ──
{
  consulta.descartar()
  checar('6. depois de descartar, a consulta não está mais de pé', consulta.viva === false)
}

// ── 7. O QUE ESTE TESTE DEIXA PARA TRÁS ──
//
// ⚠️ ESTE CASO NASCEU DE UM ERRO MEU DE MEDIÇÃO. Eu tinha afirmado, de um caso só, que o registro
// de sessão da consulta "fica para trás quando o processo morre" — e escrevi isso no código como
// fato. Medido de novo: `descartar()` derruba o processo em menos de 1 s e o próprio agente apaga
// o registro dele. O órfão que eu vira antes veio de um `process.exit()` logo após o aborto, que
// mata o processo antes de ele se limpar.
//
// O caso existe para continuar provando isso: se um dia a consulta passar a deixar lixo em
// `~/.claude/sessions`, aqui fica vermelho — e o que o teste criou é removido do mesmo jeito,
// apenas depois de confirmado que aquele processo não está mais vivo.
{
  const vivoAinda = pid => { try { process.kill(pid, 0); return true } catch (e) { return !!(e && e.code === 'EPERM') } }
  const novas = listarSessoes().filter(n => !antesDasSessoes.includes(n))
  const pids = [...new Set(novas.map(n => Number(String(n).split('.')[0])).filter(p => Number.isFinite(p) && p > 0))]
  const ateMs = Date.now() + 5000
  while (Date.now() < ateMs && pids.some(vivoAinda)) await new Promise(r => setTimeout(r, 250))

  const sobraram = listarSessoes().filter(n => !antesDasSessoes.includes(n))
  checar('7. a consulta descartada não deixa registro de sessão órfão',
    sobraram.length === 0, JSON.stringify(sobraram))

  // O que tiver sobrado é lixo criado por este teste: sai, e só com o processo comprovadamente morto.
  for (const n of sobraram) {
    const pid = Number(String(n).split('.')[0])
    if (!Number.isFinite(pid) || pid <= 0 || vivoAinda(pid)) continue
    try { fs.unlinkSync(path.join(pastaDasSessoes, n)) } catch { /* já não está lá */ }
  }
}

const falhas = resultados.filter(r => !r.ok)
console.log(`
  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
process.exit(falhas.length ? 1 : 0)
