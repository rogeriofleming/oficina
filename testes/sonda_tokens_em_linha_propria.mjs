// SONDA (descartável): quanto espaço o painel de tokens PEDE, e quanto sobra na barra sem ele? (V30)
//
// Pedido dele (26/09/2026): o painel de tokens sai da barra de cima e vai para uma LINHA PRÓPRIA
// (a faixa, entre a barra de título e as abas); os medidores do limite ficam sempre em cima, e
// medidores + pesquisa podem crescer com o espaço que o rótulo devolve.
//
// Mede, na janela de verdade, em tela cheia e em meia tela:
//   - onde termina cada peça da barra de título hoje (ícones, medidores, pesquisa, rótulo, controles);
//   - o TETO do rótulo (30vw, patch 0023) e o quanto ele pediria sem teto;
//   - a largura que textos REAIS de 1..5 conversas ocupam na fonte da barra — para saber quantas
//     cabem numa linha da janela inteira, que é o ganho que a V30 promete;
//   - quanto sobra na barra de título ao remover o rótulo (o que medidores e pesquisa podem crescer).
//
// Não fala com o agente, não gasta. ⚠️ TEM `finally` (armadilha 12).
//
// Uso:  node testes/sonda_tokens_em_linha_propria.mjs [exe]

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
const respirar = ms => new Promise(r => setTimeout(r, ms))

// Textos REAIS no formato do degrau 0 (nome + custo + contexto/processado), como o painel os escreve.
const EXEMPLOS = [
  ['1 conversa', 'Comparar pagamentos Hotmart  $13.79  195k/13.3M'],
  ['2 conversas', 'Comparar pagamentos Hotmart  $13.79  195k/13.3M │ teste  $0.07  48.1k/96.2k │ $13.86'],
  ['3 conversas', 'Comparar pagamentos Hotmart  $13.79  195k/13.3M │ teste  $0.07  48.1k/96.2k │ Painel da Casa Evolucao  $2.41  88.0k/1.9M │ $16.27'],
  ['4 conversas', 'Comparar pagamentos Hotmart  $13.79  195k/13.3M │ teste  $0.07  48.1k/96.2k │ Painel da Casa Evolucao  $2.41  88.0k/1.9M │ Oficina V30 layout  $5.12  140k/4.2M │ $21.39'],
  ['5 conversas', 'Comparar pagamentos Hotmart  $13.79  195k/13.3M │ teste  $0.07  48.1k/96.2k │ Painel da Casa Evolucao  $2.41  88.0k/1.9M │ Oficina V30 layout  $5.12  140k/4.2M │ Revisar copy da pagina  $0.88  61.3k/720k │ $22.27'],
]

const MEDIR = (exemplos) => {
  const r = el => (el ? el.getBoundingClientRect() : null)
  const cx = el => (el ? getComputedStyle(el) : null)
  const barra = document.querySelector('.part.titlebar')
  const container = barra && barra.querySelector('.titlebar-container')
  const icones = barra && barra.querySelector('.titlebar-activity-container')
  const encaixe = barra && barra.querySelector('.titlebar-gauges')
  const pesquisa = barra && barra.querySelector('.command-center .command-center-center')
  const rotulo = barra && barra.querySelector('.oficina-rotulo-vivo')
  const controles = barra && barra.querySelector('.window-controls-container')
  const esquerda = barra && barra.querySelector('.titlebar-left')
  const direita = barra && barra.querySelector('.titlebar-right')
  const banner = document.querySelector('.part.banner')
  const faixa = document.querySelector('.gauges-container')
  const medidores = faixa ? [...faixa.querySelectorAll('.gauge')] : []
  const trilhos = faixa ? [...faixa.querySelectorAll('.gauge-track')] : []

  // Largura natural dos filhos de um container (a mesma conta do patch 0028).
  const natural = (el, exceto) => {
    let soma = 0
    for (const filho of Array.from((el && el.children) || [])) {
      if (filho !== exceto) soma += Math.max(filho.getBoundingClientRect().width, filho.scrollWidth)
    }
    return Math.round(soma)
  }

  // Quanto CADA texto de exemplo ocuparia com a fonte do rótulo (ou da barra, se ele não existe).
  const molde = document.createElement('span')
  const fonte = cx(rotulo || barra)
  molde.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0'
  molde.style.font = fonte.font || (fonte.fontSize + ' ' + fonte.fontFamily)
  document.body.appendChild(molde)
  const pedidos = exemplos.map(([nome, texto]) => {
    molde.textContent = texto
    return { caso: nome, caracteres: texto.length, px: Math.round(molde.getBoundingClientRect().width) }
  })
  document.body.removeChild(molde)

  const janela = Math.round(document.documentElement.clientWidth)
  const rr = r(rotulo)
  const naturalDaDireita = natural(direita)
  const naturalDaDireitaSemRotulo = rotulo ? naturalDaDireita - Math.round(Math.max(rr.width, rotulo.scrollWidth)) : naturalDaDireita

  return {
    janela,
    barraDeTitulo: {
      fimIcones: r(icones) ? Math.round(r(icones).right) : null,
      larguraDosIcones: r(icones) ? Math.round(r(icones).width) : null,
      encaixeVisivel: !!(encaixe && encaixe.style.display !== 'none' && encaixe.querySelector('.gauge')),
      encaixe: r(encaixe) ? { inicio: Math.round(r(encaixe).left), fim: Math.round(r(encaixe).right), largura: Math.round(r(encaixe).width) } : null,
      pesquisa: r(pesquisa) ? { inicio: Math.round(r(pesquisa).left), fim: Math.round(r(pesquisa).right), largura: Math.round(r(pesquisa).width) } : null,
      rotulo: rotulo ? {
        texto: rotulo.textContent,
        largura: Math.round(rr.width),
        pediria: rotulo.scrollWidth,
        tetoCss: cx(rotulo).maxWidth,
        tetoPx: Math.round(janela * 0.30),
        truncando: rotulo.scrollWidth > Math.round(rr.width) + 1,
      } : null,
      controles: r(controles) ? { inicio: Math.round(r(controles).left), largura: Math.round(r(controles).width) } : null,
      naturalDaEsquerdaSemEncaixe: natural(esquerda, encaixe),
      naturalDaDireita,
      naturalDaDireitaSemRotulo,
      sobraAoTirarORotulo: naturalDaDireita - naturalDaDireitaSemRotulo,
      barraRola: container ? container.scrollWidth > container.clientWidth + 1 : null,
      classeMedidoresNaBarra: !!(container && container.classList.contains('oficina-medidores-na-barra')),
    },
    faixa: {
      bannerAltura: r(banner) ? Math.round(r(banner).height) : 0,
      medidores: medidores.length,
      trilho: trilhos.length ? Math.round(r(trilhos[0]).width) : null,
      vaos: medidores.slice(1).map((m, i) => Math.round(r(m).left - r(medidores[i]).right)),
      larguraDoConteudo: medidores.length ? Math.round(Math.max(...medidores.map(m => r(m).right)) - Math.min(...medidores.map(m => r(m).left))) : null,
    },
    oQueOPainelPede: pedidos,
    cabeEmUmaLinhaDaJanela: pedidos.map(p => ({ caso: p.caso, px: p.px, cabe: p.px <= janela - 24 })),
  }
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sonda-v30-'))
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
    await app.evaluate(({ BrowserWindow }, l) => { const j = BrowserWindow.getAllWindows()[0]; if (j) { j.setSize(l, 740) } }, largura)
    await respirar(1500)
    saida[nome] = await win.evaluate(MEDIR, EXEMPLOS)
  }
} catch (e) {
  saida.erro = String((e && e.stack) || e)
} finally {
  await fecharApp(app)
}
console.log(JSON.stringify(saida, null, 2))
