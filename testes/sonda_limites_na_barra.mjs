// SONDA (descartável): cabem os medidores do limite NA BARRA DE CIMA? (V27, item 1d)
//
// A especificação aprovada (25/09/2026) saiu de um PRINT: pesquisa −65%, barrinhas −10%, vão entre
// os dois medidores apertado — folga estimada de ~25 px. Print não é medida: ele pode estar em escala,
// e o monitor desta máquina tem 1360 px de largura, então MEIA tela são ~680 px. Esta sonda mede, na
// janela de verdade, nas duas larguras:
//   - onde terminam os ícones e onde começa/termina a pesquisa;
//   - a largura da faixa de medidores de hoje, e a dela com as barrinhas −10% e o vão apertado;
//   - quanto espaço sobra entre os ícones e a pesquisa com a pesquisa em 35% da largura atual.
//
// Não fala com o agente, não gasta. ⚠️ TEM `finally` (armadilha 12).
//
// Uso:  node testes/sonda_limites_na_barra.mjs [exe]

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
const respirar = ms => new Promise(r => setTimeout(r, ms))

const MEDIR = () => {
  const r = el => (el ? el.getBoundingClientRect() : null)
  const barra = document.querySelector('.part.titlebar')
  const icones = barra && barra.querySelector('.titlebar-activity-container')
  const centro = barra && barra.querySelector('.titlebar-center')
  const pesquisa = barra && (barra.querySelector('.command-center .command-center-center') || centro)
  const controles = barra && barra.querySelector('.window-controls-container')
  const direita = barra && barra.querySelector('.titlebar-right')
  const faixa = document.querySelector('.part.banner .gauges-container') || document.querySelector('.gauges-container')
  const medidores = faixa ? [...faixa.querySelectorAll('.gauge')] : []
  const trilhos = faixa ? [...faixa.querySelectorAll('.gauge-track')] : []
  const expandir = faixa ? faixa.querySelector('.gauges-expand') : null
  const ri = r(icones), rp = r(pesquisa), rc = r(controles), rf = r(faixa), rd = r(direita)
  // A largura do CONTEÚDO da faixa (do início do primeiro elemento ao fim do último), não a da faixa
  // inteira, que ocupa a janela toda.
  const pecas = [expandir, ...medidores].filter(Boolean).map(r)
  const conteudo = pecas.length ? Math.round(Math.max(...pecas.map(p => p.right)) - Math.min(...pecas.map(p => p.left))) : null
  const vaos = medidores.slice(1).map((m, i) => Math.round(r(m).left - r(medidores[i]).right))
  const trilho = trilhos.length ? Math.round(r(trilhos[0]).width) : null
  const encolheTrilhos = trilho ? Math.round(trilhos.length * trilho * 0.10) : 0
  const vaoAtual = vaos.length ? vaos[0] : 0
  const encolheVao = Math.max(0, vaoAtual - 12)
  const conteudoAprovado = conteudo !== null ? conteudo - encolheTrilhos - encolheVao * vaos.length : null
  const larguraPesquisa = rp ? Math.round(rp.width) : null
  const pesquisaAprovada = larguraPesquisa !== null ? Math.round(larguraPesquisa * 0.35) : null
  const centroPesquisa = rp ? (rp.left + rp.right) / 2 : null
  const inicioPesquisaAprovada = centroPesquisa !== null ? Math.round(centroPesquisa - pesquisaAprovada / 2) : null
  const fimIcones = ri ? Math.round(ri.right) : null
  // Depois do patch 0028: onde os medidores estão de fato.
  const encaixe = barra && barra.querySelector('.titlebar-gauges')
  const banner = document.querySelector('.part.banner')
  const container = barra && barra.querySelector('.titlebar-container')
  const noEncaixe = !!(encaixe && encaixe.style.display !== 'none' && encaixe.querySelector('.gauge'))
  const depois0028 = encaixe ? {
    medidoresNaBarra: noEncaixe,
    quantosNaBarra: encaixe.querySelectorAll('.gauge').length,
    larguraDoEncaixe: noEncaixe ? Math.round(r(encaixe).width) : 0,
    faixaDeBaixoVisivel: !!(banner && banner.getBoundingClientRect().height > 0),
    classeLigada: !!(container && container.classList.contains('oficina-medidores-na-barra')),
    controlesDaJanelaNoLugar: rc ? Math.round(rc.right) <= Math.round(document.documentElement.clientWidth) : null,
    barraRola: container ? container.scrollWidth > container.clientWidth + 1 : null,
  } : { patch0028: 'ausente' }
  return {
    depois0028,
    janela: Math.round(document.documentElement.clientWidth),
    fimIcones,
    pesquisa: rp ? { inicio: Math.round(rp.left), fim: Math.round(rp.right), largura: larguraPesquisa } : null,
    inicioDaDireita: rd ? Math.round(rd.left) : null,
    controles: rc ? Math.round(rc.left) : null,
    faixaHoje: { conteudo, medidores: medidores.length, trilho, vaos },
    aprovado: {
      pesquisa: pesquisaAprovada,
      pesquisaComecaEm: inicioPesquisaAprovada,
      espacoLivre: fimIcones !== null && inicioPesquisaAprovada !== null ? inicioPesquisaAprovada - fimIcones : null,
      faixa: conteudoAprovado,
    },
  }
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sonda-limites-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'x\n', 'utf8')
let app = null
const saida = {}
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.part.titlebar', { timeout: 60000 })
  await respirar(6000) // a extensão sobe, os ícones e a faixa assentam
  for (const [nome, largura] of [['telaCheia', 1360], ['meiaTela', 680]]) {
    await app.evaluate(({ BrowserWindow }, l) => { const j = BrowserWindow.getAllWindows()[0]; if (j) j.setSize(l, 740) }, largura)
    await respirar(1500)
    saida[nome] = await win.evaluate(MEDIR)
  }
} catch (e) {
  saida.erro = String(e && e.stack || e)
} finally {
  await fecharApp(app)
}
console.log(JSON.stringify(saida, null, 2))
