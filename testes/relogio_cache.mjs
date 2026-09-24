// O RELÓGIO DO CACHE (V14) — `relogioCache.js` e o medidor que o alimenta (`tokens.js`), em node puro,
// com o tempo controlado e arquivos de conversa DE VERDADE no disco.
//
// O que precisa ser verdade:
//   1. o TTL sai do uso da resposta: escrita de 1 h → 60 min; de 5 min → 5 min; nas duas → o menor;
//   2. resposta que só leu do cache renova o relógio e mantém o último TTL visto;
//   3. sem nenhum dado de TTL, 60 min, marcado como suposição (e a dica diz);
//   4. cada resposta nova recomeça o relógio; a mesma resposta em várias linhas não;
//   5. passou do TTL: vencido, e a dica diz que a próxima mensagem relê a conversa inteira e custa mais;
//   6. conversa retomada parte do `timestamp` da última resposta no arquivo, não da hora da leitura;
//   7. subagente não mexe no relógio da conversa;
//   8. o anel e os minutos saem da mesma conta, e o próximo tique cai na virada do minuto.
//
// Uso:  node testes/relogio_cache.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const R = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'relogioCache.js'))
const T = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'tokens.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const MIN = 60 * 1000
const escrita1h = n => ({ input_tokens: 3, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: n, cache_creation: { ephemeral_1h_input_tokens: n, ephemeral_5m_input_tokens: 0 } })
const escrita5m = n => ({ input_tokens: 3, output_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: n, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: n } })
const soLeitura = () => ({ input_tokens: 3, output_tokens: 10, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } })

// ── 1. o TTL de uma resposta ──
checar('TTL: escrita de 1 h → 60 min', R.ttlDoUso(escrita1h(500)) === 60 * MIN)
checar('TTL: escrita de 5 min → 5 min', R.ttlDoUso(escrita5m(500)) === 5 * MIN)
checar('TTL: escrita nas duas → o menor (a parte de 5 min vence primeiro)',
  R.ttlDoUso({ cache_creation: { ephemeral_1h_input_tokens: 900, ephemeral_5m_input_tokens: 10 } }) === 5 * MIN)
checar('TTL: só leitura não diz o TTL', R.ttlDoUso(soLeitura()) === null)
checar('TTL: uso sem `cache_creation` não diz o TTL', R.ttlDoUso({ input_tokens: 5, output_tokens: 5 }) === null && R.ttlDoUso(null) === null)

// ── 2 a 5. o relógio, com o tempo na mão ──
{
  let agora = Date.parse('2026-09-18T12:00:00.000Z')
  const rel = new R.RelogioDoCache({ agora: () => agora })
  checar('sem resposta nenhuma, não há relógio', rel.dados() === null && R.estadoDoRelogio(null, agora) === null)

  rel.resposta('m1', { input_tokens: 5, output_tokens: 5 }, '2026-09-18T12:00:00.000Z')
  let d = rel.dados()
  let e = R.estadoDoRelogio(d, agora)
  checar('sem dado de TTL: 60 min, marcado como suposição', d.ttlMs === 60 * MIN && d.suposto === true && e.minutos === 60, JSON.stringify(d))
  checar('sem dado de TTL: a dica diz que é suposição', /suposição/.test(R.dicaDoRelogio(e)), R.dicaDoRelogio(e))

  rel.resposta('m2', escrita1h(800), '2026-09-18T12:10:00.000Z')
  agora = Date.parse('2026-09-18T12:10:00.000Z')
  e = R.estadoDoRelogio(rel.dados(), agora)
  checar('resposta com escrita de 1 h: 60m, anel cheio, não é suposição', e.minutos === 60 && e.fracao === 1 && e.suposto === false, JSON.stringify(e))
  checar('a dica diz de quanto é o cache, lido da resposta', /1 hora/.test(R.dicaDoRelogio(e)) && !/suposição/.test(R.dicaDoRelogio(e)), R.dicaDoRelogio(e))

  agora += 20 * MIN + 1
  e = R.estadoDoRelogio(rel.dados(), agora)
  checar('20 min depois: 40m e o anel em 40/60', e.minutos === 40 && Math.abs(e.fracao - 40 / 60) < 1e-9, JSON.stringify(e))
  checar('⛔ o próximo tique cai exatamente na virada para 39m', e.proximaMudancaMs === MIN - 1 &&
    R.estadoDoRelogio(rel.dados(), agora + e.proximaMudancaMs).minutos === 39 && R.estadoDoRelogio(rel.dados(), agora + e.proximaMudancaMs - 1).minutos === 40,
    e.proximaMudancaMs)

  // só leitura: renova o relógio, mantém o TTL de 1 h
  const antes = rel.dados().desdeMs
  rel.resposta('m3', soLeitura(), '2026-09-18T12:30:00.001Z')
  e = R.estadoDoRelogio(rel.dados(), agora)
  checar('⛔ cada resposta nova recomeça o relógio (a que só leu do cache também)', rel.dados().desdeMs > antes && e.minutos === 60, JSON.stringify(rel.dados()))
  checar('resposta que só leu mantém o último TTL visto (1 h, não suposição)', rel.dados().ttlMs === 60 * MIN && rel.dados().suposto === false)

  // a mesma resposta em outra linha não recomeça
  rel.resposta('m3', soLeitura(), '2026-09-18T12:30:05.000Z')
  checar('a mesma resposta em outra linha NÃO recomeça o relógio (vale a primeira linha)', rel.dados().desdeMs === Date.parse('2026-09-18T12:30:00.001Z'))

  // vencido
  agora = Date.parse('2026-09-18T13:30:00.001Z')
  e = R.estadoDoRelogio(rel.dados(), agora)
  checar('⛔ passou de 1 h: vencido, sem próximo tique, anel vazio', e.vencido === true && e.proximaMudancaMs === null && e.fracao === 0 && e.minutos === 0, JSON.stringify(e))
  checar('vencido: a dica diz que a próxima mensagem relê a conversa inteira e custa mais',
    /venceu/.test(R.dicaDoRelogio(e)) && /relê a conversa inteira/.test(R.dicaDoRelogio(e)) && /custa mais/.test(R.dicaDoRelogio(e)), R.dicaDoRelogio(e))
  e = R.estadoDoRelogio(rel.dados(), agora - 2)
  checar('um instante antes de vencer ainda é 1m (a última fatia do anel)', e.vencido === false && e.minutos === 1, JSON.stringify(e))

  // 5 min
  rel.resposta('m4', escrita5m(100), '2026-09-18T14:00:00.000Z')
  e = R.estadoDoRelogio(rel.dados(), Date.parse('2026-09-18T14:02:30.000Z'))
  checar('cache de 5 min: 2,5 min depois mostra 3m, anel 3/5', e.minutos === 3 && Math.abs(e.fracao - 0.6) < 1e-9 && e.ttlMinutos === 5, JSON.stringify(e))
  checar('cache de 5 min vence em 5 min', R.estadoDoRelogio(rel.dados(), Date.parse('2026-09-18T14:05:00.000Z')).vencido === true)

  // Escrita nos DOIS caches na mesma resposta: vence o de 5 min, que é o FIM da conversa. A próxima mensagem relê
  // esse pedaço, não a conversa inteira — a dica não pode dizer "inteira".
  rel.resposta('m4b', { cache_creation: { ephemeral_1h_input_tokens: 5000, ephemeral_5m_input_tokens: 300 } }, '2026-09-18T14:10:00.000Z')
  e = R.estadoDoRelogio(rel.dados(), Date.parse('2026-09-18T14:16:00.000Z'))
  checar('escrita nos dois caches: vencido o de 5 min, a dica diz que relê a PARTE que venceu, não a conversa inteira',
    e.vencido === true && !/conversa inteira/.test(R.dicaDoRelogio(e)) && /parte/.test(R.dicaDoRelogio(e)) && /custa mais/.test(R.dicaDoRelogio(e)), R.dicaDoRelogio(e))
  rel.resposta('m4c', escrita5m(100), '2026-09-18T14:20:00.000Z')
  e = R.estadoDoRelogio(rel.dados(), Date.parse('2026-09-18T14:26:00.000Z'))
  checar('CONTROLE: escrita só no de 5 min, vencido, volta a dizer a conversa inteira', /relê a conversa inteira/.test(R.dicaDoRelogio(e)), R.dicaDoRelogio(e))

  // sem timestamp: a hora da leitura
  agora = Date.parse('2026-09-18T15:00:00.000Z')
  rel.resposta('m5', escrita1h(10), null)
  checar('resposta sem `timestamp`: o relógio parte da hora em que ela foi lida', rel.dados().desdeMs === agora)

  // relógio da máquina atrás do arquivo: não passa do cheio
  e = R.estadoDoRelogio(rel.dados(), agora - 5 * MIN)
  checar('hora do arquivo à frente do relógio da máquina: fica no cheio, sem passar de 60m', e.minutos === 60 && e.fracao === 1, JSON.stringify(e))
}

// ── 6 e 7. pelo medidor, sobre arquivos de conversa no disco ──
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-relogio-cache-'))
try {
  const pasta = path.join(base, 'projects', 'D--pasta')
  fs.mkdirSync(pasta, { recursive: true })
  const ID = 'dddddddd-0000-0000-0000-000000000004'
  const arquivo = path.join(pasta, ID + '.jsonl')
  const L = (id, uso, timestamp) => JSON.stringify({ type: 'assistant', timestamp, message: { id, model: 'claude-opus-5', usage: uso, content: [] } }) + '\n'
  fs.writeFileSync(arquivo,
    L('r1', escrita1h(4000), '2026-09-18T09:00:00.000Z') +
    L('r2', escrita1h(300), '2026-09-18T09:40:00.000Z') +
    L('r2', escrita1h(300), '2026-09-18T09:40:03.000Z'))
  // Um subagente que respondeu DEPOIS, com cache de 5 min: não é o relógio da conversa.
  const sub = path.join(pasta, ID, 'subagents')
  fs.mkdirSync(sub, { recursive: true })
  fs.writeFileSync(path.join(sub, 'agent-abc123.jsonl'), L('s1', escrita5m(900), '2026-09-18T09:55:00.000Z'))

  let agora = Date.parse('2026-09-18T10:05:00.000Z')
  const med = new T.MedidorDaConversa(arquivo, { agora: () => agora })
  med.atualizar()
  let r = med.resumo()
  checar('⛔ retomada: o relógio parte do `timestamp` da última resposta no arquivo (09:40), não da leitura (10:05)',
    !!r.cache && r.cache.desdeMs === Date.parse('2026-09-18T09:40:00.000Z'), JSON.stringify(r.cache))
  let e = R.estadoDoRelogio(r.cache, agora)
  checar('retomada 25 min depois da última resposta: faltam 35m', e.minutos === 35, JSON.stringify(e))
  checar('⛔ subagente (cache de 5 min, resposta mais nova) não mexe no relógio da conversa', r.cache.ttlMs === 60 * MIN && r.cache.desdeMs === Date.parse('2026-09-18T09:40:00.000Z'), JSON.stringify(r.cache))

  // Uma resposta nova chega no arquivo: recomeça.
  fs.appendFileSync(arquivo, L('r3', soLeitura(), '2026-09-18T10:06:00.000Z'))
  agora = Date.parse('2026-09-18T10:06:01.000Z')
  med.atualizar()
  r = med.resumo()
  checar('⛔ a resposta nova no arquivo recomeça o relógio da conversa', r.cache.desdeMs === Date.parse('2026-09-18T10:06:00.000Z') && R.estadoDoRelogio(r.cache, agora).minutos === 60, JSON.stringify(r.cache))

  // Linha sintética não é chamada ao modelo: não renova o cache.
  fs.appendFileSync(arquivo, JSON.stringify({ type: 'assistant', timestamp: '2026-09-18T10:20:00.000Z', message: { id: 'x9', model: '<synthetic>', usage: soLeitura(), content: [] } }) + '\n')
  med.atualizar()
  checar('resposta `<synthetic>` (aviso interno) não recomeça o relógio', med.resumo().cache.desdeMs === Date.parse('2026-09-18T10:06:00.000Z'))

  // Conversa sem nenhuma resposta ainda: sem relógio.
  const vazio = path.join(pasta, 'eeeeeeee-0000-0000-0000-000000000005.jsonl')
  fs.writeFileSync(vazio, JSON.stringify({ type: 'user', message: { content: 'oi' } }) + '\n')
  const m2 = new T.MedidorDaConversa(vazio)
  m2.atualizar()
  checar('conversa sem resposta ainda: o relógio não existe (não inventa)', m2.resumo().cache === null)
} finally {
  fs.rmSync(base, { recursive: true, force: true })
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
