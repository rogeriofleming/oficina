// A TELA DO CONSUMO (V20, t199) — o que o expandir da faixa abre, em node puro.
//
// O que precisa ser verdade:
//   1. o detalhe sai do registro REAL desta máquina;
//   2. o terceiro limite não aparece (ordem dele);
//   3. nada que identifique a conta chega ao HTML;
//   4. a tela não tem script nenhum — e a política de segurança proíbe script;
//   5. sem registro, a tela diz que não há leitura, em vez de desenhar zeros;
//   6. "quanto falta" vira palavra curta, e data vencida não vira número negativo;
//   7. o uso por produto aparece do maior para o menor;
//   8. a tela avisa que a conta é só desta máquina;
//   9. texto vindo do registro é escapado (não injeta HTML);
//  10. abrir duas vezes reaproveita o painel em vez de abrir outro.
//
// Uso:  node testes/tela_do_consumo.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const T = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'telaDoConsumo.js'))
const U = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'usoDoPlano.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const AGORA = Date.parse('2026-09-21T13:00:00Z')
const registro = (extra = {}) => ({
  cachedUsageUtilization: {
    fetchedAtMs: AGORA - 60000,
    accountUuid: 'nao-pode-vazar-0000',
    utilization: {
      five_hour: { utilization: 3, resets_at: '2026-09-21T17:40:00Z' },
      seven_day: { utilization: 75, resets_at: '2026-09-24T13:00:00Z' },
      nimbus_quill: { utilization: 17, resets_at: null },
      seven_day_breakdown: { rows: [
        { key: 'chats', display_name: 'Chats', percent: 12 },
        { key: 'claude_code', display_name: 'Claude Code', percent: 88 },
      ] },
      ...extra,
    },
  },
})

// ── 1 ──
{
  const p = path.join(os.homedir(), '.claude.json')
  let det = null
  if (fs.existsSync(p)) {
    try { det = U.detalhe(JSON.parse(fs.readFileSync(p, 'utf8'))) } catch { }
  }
  checar('1. o detalhe sai do registro real desta máquina',
    !!det && det.janelas.length === 2, JSON.stringify(det && det.janelas))
  if (det) console.log(`       (medido agora: ${det.janelas.map(j => `${j.rotulo} ${j.pct}%`).join(' · ')})`)
}

// ── 2, 3, 4, 8 ──
{
  const html = T.html(U.detalhe(registro()), AGORA)
  checar('2. o terceiro limite não aparece', !/fable|nimbus/i.test(html))
  checar('3. nada que identifique a conta chega ao HTML', !/accountUuid|nao-pode-vazar/i.test(html))
  checar('4. a tela não tem script, e a política proíbe script',
    !/<script/i.test(html) && /default-src 'none'/.test(html) && !/script-src (?!'none')/.test(html), html.slice(0, 200))
  checar('8. a tela avisa que a conta é só deste computador',
    /só para ele|neste computador/i.test(html))
}

// ── 5 ──
{
  const html = T.html(U.detalhe(null), AGORA)
  // ⚠️ NÃO se prova procurando "0%" no HTML: o CSS tem `height: 100%`, que contém "0%" — a
  // primeira versão desta asserção caiu nisso. O que se prova é que nenhuma JANELA foi desenhada.
  checar('5. sem registro, diz que não há leitura em vez de desenhar zeros',
    /ainda não há leitura/i.test(html) && !/class="janela"/.test(html) && !/class="trilho"/.test(html),
    html.slice(html.indexOf('<body>'), html.indexOf('<body>') + 160))
}

// ── 6 ──
{
  checar('6a. quanto falta vira palavra curta',
    T.faltaEmPalavras(AGORA + 30 * 60000, AGORA) === 'em 30 min' &&
    T.faltaEmPalavras(AGORA + 4 * 3600000, AGORA) === 'em 4 h' &&
    T.faltaEmPalavras(AGORA + 3 * 86400000, AGORA) === 'em 3 dias',
    [T.faltaEmPalavras(AGORA + 30 * 60000, AGORA), T.faltaEmPalavras(AGORA + 4 * 3600000, AGORA), T.faltaEmPalavras(AGORA + 3 * 86400000, AGORA)].join(' | '))
  checar('6b. data já vencida não vira número negativo',
    T.faltaEmPalavras(AGORA - 5000, AGORA) === 'a qualquer momento', String(T.faltaEmPalavras(AGORA - 5000, AGORA)))
  checar('6c. sem data, não inventa', T.faltaEmPalavras(null, AGORA) === null)
}

// ── 7 ──
{
  const det = U.detalhe(registro())
  checar('7. o uso por produto vem do maior para o menor',
    det.porProduto[0].nome === 'Claude Code' && det.porProduto[0].pct === 88, JSON.stringify(det.porProduto))
}

// ── 9 ──
{
  const det = U.detalhe(registro({
    seven_day_breakdown: { rows: [{ key: 'x', display_name: '<img src=x onerror=alert(1)>', percent: 50 }] },
  }))
  const html = T.html(det, AGORA)
  checar('9. texto vindo do registro é escapado',
    !/<img/i.test(html) && /&lt;img/.test(html), html.match(/.{0,60}img.{0,60}/i)?.[0])
}

// ── 10 a 12 ──
//
// ⚠️ O PAINEL DE MENTIRA GUARDA O QUE RECEBE — e isto foi apanhado numa conferência independente.
// Antes, ele tinha `set html(_v) {}`: engolia o conteúdo. Apagar as DUAS linhas que entregam o
// HTML à webview — ou seja, fazer o botão de expandir abrir um painel EM BRANCO — passava 12/12.
// O painel agora guarda, e os casos abaixo cobram que o conteúdo chegou.
{
  let criados = 0
  let revelado = 0
  let colunaPedida = null
  const entregues = []
  const vs = {
    ViewColumn: { Active: 1 },
    window: {
      tabGroups: { all: [{ viewColumn: 7 }], activeTabGroup: { viewColumn: 7 } },
      createWebviewPanel: (_id, _titulo, onde) => {
        criados++
        colunaPedida = onde && onde.viewColumn
        const painel = {
          viewColumn: colunaPedida,
          reveal: () => { revelado++ },
          onDidDispose: () => { },
          webview: { set html(v) { entregues.push(v) }, get html() { return entregues[entregues.length - 1] } },
        }
        return painel
      },
    },
  }
  const tela = T.criarTelaDoConsumo(vs, { lerRegistro: async () => registro(), agora: () => AGORA })
  await tela.abrir()
  await tela.abrir()
  checar('10. abrir duas vezes reaproveita o painel', criados === 1 && revelado === 1, `criados=${criados} revelado=${revelado}`)
  checar('11. o HTML chega mesmo à webview, nas duas aberturas',
    entregues.length === 2 && /Janela de 5 horas/.test(entregues[0]) && /Janela de 5 horas/.test(entregues[1]),
    JSON.stringify({ entregas: entregues.length, comeco: String(entregues[0] || '').slice(0, 60) }))
  // ⚠️ O conserto do "expandir espreme a conversa": a tela usa a coluna de abas que JÁ existe.
  checar('12. abre na coluna que já existe, e não numa divisão nova',
    colunaPedida === 7, `pediu a coluna ${colunaPedida} (o grupo existente é o 7)`)
}

{
  // 12b. Sem a interface de abas (editor antigo, ou teste), cai no comportamento de antes sem lançar.
  let colunaPedida = null
  const vs = {
    ViewColumn: { Active: 1 },
    window: {
      createWebviewPanel: (_id, _titulo, onde) => {
        colunaPedida = onde && onde.viewColumn
        return { viewColumn: 1, reveal: () => { }, onDidDispose: () => { }, webview: { set html(_v) { } } }
      },
    },
  }
  const tela = T.criarTelaDoConsumo(vs, { lerRegistro: async () => registro(), agora: () => AGORA })
  await tela.abrir()
  checar('12b. sem a interface de abas, usa a coluna ativa e não lança', colunaPedida === 1, String(colunaPedida))
}

const falhas = resultados.filter(r => !r.ok)
console.log(`
  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
// ⚠️ O PLACAR EM JSON, na última linha: é por ele que a bateria (`rapidos.mjs`) e a regressão leem
// o resultado e conferem o piso. Sem esta linha, a suíte roda, passa, e a bateria a marca como
// "sem placar" — ou seja, não protege nada. Foi o que aconteceu com as seis suítes da V20.
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
