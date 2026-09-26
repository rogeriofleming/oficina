// SONDA (descartável): a V30 na TELA — a faixa com o painel, os botões, e a barra de cima maior.
//
// Os testes de node provam o motor; esta sonda responde a pergunta que só o build responde: **o que
// aparece?** É a prova que faltava quando o patch 0030 foi escrito.
//
// Mede, na janela real, em tela cheia e em meia tela:
//   - a FAIXA existe, tem altura, e dentro dela há o rótulo vivo e os dois botões;
//   - os MEDIDORES estão na barra de cima (e não na faixa), com o trilho e o vão novos;
//   - a PESQUISA voltou ao tamanho de gente;
//   - o rótulo NÃO está mais na barra de cima;
//   - quantos pixels do texto cabem, e se ele está truncando.
//
// Não fala com o agente, não gasta. ⚠️ TEM `finally` (armadilha 12).
//
// Uso:  node testes/sonda_v30_na_tela.mjs [exe]

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
  const banner = document.querySelector('.part.banner')
  const faixa = banner && banner.querySelector('.oficina-faixa')
  const rotulo = banner && banner.querySelector('.banner-live-label')
  const botoes = banner ? [...banner.querySelectorAll('.banner-live-button')] : []
  const medidoresNaBarra = barra ? [...barra.querySelectorAll('.titlebar-gauges .gauge')] : []
  const medidoresNaFaixa = banner ? [...banner.querySelectorAll('.oficina-faixa-medidores .gauge')] : []
  const trilho = barra && barra.querySelector('.titlebar-gauges .gauge-track')
  const pesquisa = barra && barra.querySelector('.command-center .command-center-center')
  const rotuloNaBarra = barra && barra.querySelector('.oficina-rotulo-vivo')

  const vaoEntreMedidores = medidoresNaBarra.length > 1
    ? Math.round(r(medidoresNaBarra[1]).left - r(medidoresNaBarra[0]).right) : null

  return {
    janela: Math.round(document.documentElement.clientWidth),
    faixa: {
      existe: !!banner,
      altura: r(banner) ? Math.round(r(banner).height) : 0,
      temLinha: !!faixa,
      rotulo: rotulo ? {
        texto: rotulo.textContent,
        largura: Math.round(r(rotulo).width),
        pediria: rotulo.scrollWidth,
        truncando: rotulo.scrollWidth > Math.round(r(rotulo).width) + 1,
        dica: (rotulo.title || '').split('\n')[0] || null,
        pedacosColoridos: rotulo.querySelectorAll('span').length,
      } : null,
      botoes: botoes.map(b => ({
        rotulo: b.getAttribute('aria-label'),
        icone: (b.querySelector('span') || {}).className || null,
        largura: Math.round(r(b).width),
      })),
      medidoresAqui: medidoresNaFaixa.length,
    },
    barraDeCima: {
      medidores: medidoresNaBarra.length,
      trilho: trilho ? Math.round(r(trilho).width) : null,
      vaoEntreMedidores,
      pesquisa: r(pesquisa) ? Math.round(r(pesquisa).width) : null,
      rotuloAindaAqui: !!rotuloNaBarra,
      barraRola: (() => {
        const c = barra && barra.querySelector('.titlebar-container')
        return c ? c.scrollWidth > c.clientWidth + 1 : null
      })(),
    },
  }
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-v30-tela-'))
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
  await respirar(8000) // a extensão sobe, publica os tokens e a faixa assenta
  for (const [nome, largura] of [['telaCheia', 1360], ['meiaTela', 680]]) {
    await app.evaluate(({ BrowserWindow }, l) => { const j = BrowserWindow.getAllWindows()[0]; if (j) { j.setSize(l, 740) } }, largura)
    await respirar(2000)
    saida[nome] = await win.evaluate(MEDIR)
  }
} catch (e) {
  saida.erro = String((e && e.stack) || e)
} finally {
  await fecharApp(app)
}
console.log(JSON.stringify(saida, null, 2))
