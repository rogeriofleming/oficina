// A ABERTURA DA V20, NO EDITOR DE VERDADE — o `t187`, o `t196`, o `t199` e o `t197` na tela.
//
// ⚠️ ESTE ARQUIVO EXISTE PORQUE OS OUTROS PROVAVAM O MUNDO ERRADO. Os testes de tela rodam num
// perfil de extensões VAZIO, e isso é certo para provar o padrão de fábrica. Só que na V20 a
// conversa do produto passou a ser a da extensão OFICIAL (t187): num perfil sem ela, o produto cai
// no caminho de volta (o painel próprio) e os critérios ficam verdes provando o que quase ninguém
// vai ver. Apontado numa revisao independente, antes do build.
//
// Aqui a conversa oficial é INSTALADA no perfil descartável, do `.vsix` em cache, e só então o
// programa é aberto. É o único lugar onde o caminho que ele de fato usa é exercitado.
//
// O que precisa ser verdade:
//   1. abrindo numa pasta, o programa cai DIRETO numa aba de conversa — sem passo manual (t187);
//   2. a barra de ícones está NO TOPO, não na lateral (t198);
//   3. a barra da direita NÃO nasce aberta (t197);
//   4. a barra de cima não tem os três botões que ele mandou tirar (t188);
//   5. a faixa de medidores existe como parte do workbench (t199, patch 0017);
//   6. e quando ela tem medidores, o preenchimento NÃO sai mais escuro que o trilho — o defeito
//      que foi medido num navegador antes do build.
//
// Uso:  node testes/abertura_v20.mjs [caminho do executavel]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RAIZ, carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, instalarConversaOficial } from './comum.mjs'

const _electron = await carregarElectron()
const resultados = []
/**
 * Critério PULADO não é critério passado — e o placar tem que dizer isso.
 *
 * ⚠️ APANHADO NUMA CONFERÊNCIA INDEPENDENTE (21/09/2026): havia `checar(..., true, 'não
 * exercitado')` aqui, ou seja, um OK escrito à mão para um caso que ninguém mediu. Some no meio
 * de uma lista de verdes e some do placar: a suíte diz "todos passaram" sobre algo que não rodou.
 * O padrão certo já existia no projeto (`temas.mjs`), e é este.
 */
const pulados = []
const pular = (criterio, porque) => {
  pulados.push({ criterio, porque })
  console.log(`  --    ${criterio}: PULADO (${porque}) — nao e um OK`)
}

function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe !== undefined && !ok ? '  (' + detalhe + ')' : ''}`)
}

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado', procurei: RAIZ }))
  process.exit(1)
}
console.log('executavel: ' + exe)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-abertura-v20-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'uma pasta qualquer\n', 'utf8')

const instalou = instalarConversaOficial(area)
checar('a conversa oficial foi instalada no perfil do teste (senão isto prova o mundo errado)',
  instalou, 'não achei o .vsix em cache nem o programa de linha de comando do build')

let app = null
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow()
  await esconderJanela(app)
  await win.waitForLoadState('domcontentloaded')
  // A abertura automática espera o editor assentar; damos folga de sobra.
  await new Promise(r => setTimeout(r, 12000))

  const medido = await win.evaluate(() => {
    const q = s => document.querySelector(s)
    const partes = [...document.querySelectorAll('.monaco-workbench .part')].map(p => ({
      id: p.id || '', classes: p.className,
      visivel: !!(p.offsetWidth || p.offsetHeight), altura: p.offsetHeight,
    }))
    const abas = [...document.querySelectorAll('.tabs-container .tab')].map(t => (t.textContent || '').trim())
    const tituloItens = [...document.querySelectorAll('.part.titlebar .action-item')].map(a => (a.getAttribute('aria-label') || a.textContent || '').trim()).filter(Boolean)
    const medidores = [...document.querySelectorAll('.part.banner .gauge')].map(g => ({
      rotulo: (g.querySelector('.gauge-label') || {}).textContent || '',
      valor: (g.querySelector('.gauge-value') || {}).textContent || '',
      larguraCheio: (g.querySelector('.gauge-fill') || {}).offsetWidth ?? null,
      corCheio: g.querySelector('.gauge-fill') ? getComputedStyle(g.querySelector('.gauge-fill')).backgroundColor : null,
      opacidadeTrilho: g.querySelector('.gauge-track') ? getComputedStyle(g.querySelector('.gauge-track')).opacity : null,
    }))
    const lateral = q('.part.activitybar')
    return {
      partes, abas, tituloItens, medidores,
      temBanner: !!q('.part.banner'),
      lateralVisivel: !!(lateral && (lateral.offsetWidth || lateral.offsetHeight)),
      exploradorVisivel: !!(q('.part.sidebar') && (q('.part.sidebar').offsetWidth || q('.part.sidebar').offsetHeight)),
      direitaVisivel: !!(q('.part.auxiliarybar') && (q('.part.auxiliarybar').offsetWidth || q('.part.auxiliarybar').offsetHeight)),
      corpoClasses: document.body.className,
    }
  })

  // ── 1. abriu direto numa conversa? ──
  const abaDeConversa = medido.abas.find(t => /claude/i.test(t) || /conversa/i.test(t)) || null
  checar('1. (t187) o programa abre DIRETO numa aba de conversa, sem passo manual',
    !!abaDeConversa, `abas abertas: ${JSON.stringify(medido.abas)}`)

  // ── 2. barra de ícones no topo ──
  checar('2. (t198) a barra de ícones não ocupa a lateral — foi para o topo',
    medido.lateralVisivel === false, `activitybar visível: ${medido.lateralVisivel}`)

  // ── 3. barra da direita fechada ──
  checar('3. (t197) a barra da direita NÃO nasce aberta',
    medido.direitaVisivel === false, `auxiliarybar visível: ${medido.direitaVisivel}`)

  // ── 4. a barra de cima sem os três botões ──
  const proibidos = medido.tituloItens.filter(t => /^(Arquivos|Conversa|Layout)$/i.test(t))
  checar('4. (t188) os três botões saíram da barra de cima',
    proibidos.length === 0, `ainda na barra: ${proibidos.join(', ')} · itens: ${JSON.stringify(medido.tituloItens)}`)

  // ── 4b. o explorador não fica por cima da conversa ──
  // ⚠️ Medido no build 1: ao trocar a abertura para a conversa oficial eu tinha tirado o fechamento
  // da lateral, e o explorador passou a abrir na frente — o oposto de "abre direto na conversa".
  checar('4b. (t187) o explorador NÃO fica aberto por cima da conversa na abertura',
    medido.exploradorVisivel === false, `sidebar visível: ${medido.exploradorVisivel}`)

  // ── 5. a faixa existe como parte ──
  checar('5. (t199) a faixa de medidores existe no workbench (patch 0017)',
    medido.temBanner, `partes: ${medido.partes.map(p => p.id).join(', ')}`)

  // ── 6. e, se houver medidor, o preenchimento não está lavado ──
  if (medido.medidores.length) {
    console.log(`       (medidores na tela: ${medido.medidores.map(m => m.rotulo + ' ' + m.valor).join(' · ')})`)
    const lavado = medido.medidores.some(m => m.opacidadeTrilho !== null && Number(m.opacidadeTrilho) < 1)
    checar('6. (t199) o trilho não usa opacity no elemento — senão o cheio sai mais escuro que o vazio',
      !lavado, JSON.stringify(medido.medidores))
  } else {
    pular('6. (t199) o trilho não usa opacity no elemento',
      'sem medidores na tela nesta rodada — a faixa só aparece depois da primeira leitura do uso')
  }
} catch (e) {
  checar('a janela abriu e respondeu', false, String((e && e.message) || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* o editor pode segurar arquivo */ }
}

const falhas = resultados.filter(r => !r.ok)
console.log(`\n  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome), pulados }))
if (falhas.length) process.exit(1)
