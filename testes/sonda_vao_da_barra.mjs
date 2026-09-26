// SONDA (descartável): QUEM ocupa o vão entre os ícones e os limites na barra de cima? (V29)
//
// Ele, com print: *"entre os ícones e as barras de limite tem um espaço enorme"*. Esta sonda não
// conserta nada: lista cada pedaço da barra de cima (esquerda, centro, direita e os filhos de cada
// um) com posição, largura e as regras de flex que decidem quem estica. Não fala com o agente, não
// gasta. ⚠️ TEM `finally` (armadilha 12). Perfil descartável: nunca toca nas configurações dele.
//
// Uso:  node testes/sonda_vao_da_barra.mjs [exe]

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
const respirar = ms => new Promise(r => setTimeout(r, ms))

const MEDIR = () => {
  const ficha = el => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      quem: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
      de: Math.round(r.left), ate: Math.round(r.right), largura: Math.round(r.width),
      flex: `${cs.flexGrow} ${cs.flexShrink} ${cs.flexBasis}`, width: cs.width, order: cs.order,
      justify: cs.justifyContent, margem: `${cs.marginLeft} ${cs.marginRight}`, display: cs.display,
    }
  }
  const barra = document.querySelector('.part.titlebar')
  const container = barra && barra.querySelector('.titlebar-container')
  if (!container) return { erro: 'sem .titlebar-container' }
  const partes = [...container.children].map(p => ({
    ...ficha(p),
    filhos: [...p.children].filter(f => f.getBoundingClientRect().width > 0).map(ficha),
  }))
  const rotulo = barra.querySelector('.oficina-rotulo-vivo')
  const blocoDeIcones = barra.querySelector('.titlebar-activity-container')
  const itensDosIcones = blocoDeIcones ? [...blocoDeIcones.querySelectorAll('.action-item')].map(li => {
    const r = li.getBoundingClientRect()
    const a = li.querySelector('.action-label')
    return { rotulo: (a && a.getAttribute('aria-label')) || li.className, de: Math.round(r.left), largura: Math.round(r.width), display: getComputedStyle(li).display }
  }) : []
  return {
    blocoDeIcones: blocoDeIcones ? { larguraInline: blocoDeIcones.style.width, itens: itensDosIcones } : null,
    janela: Math.round(document.documentElement.clientWidth),
    classes: container.className,
    partes,
    rotuloDeTokens: rotulo ? {
      ...ficha(rotulo), maxWidth: getComputedStyle(rotulo).maxWidth, texto: rotulo.textContent,
      pedacos: [...rotulo.querySelectorAll('.action-label span, .label span, span span')].map(s => ({ t: s.textContent, cor: getComputedStyle(s).color, peso: getComputedStyle(s).fontWeight })),
    } : null,
  }
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sonda-vao-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'x\n', 'utf8')
let app = null
const saida = { exe }
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.part.titlebar', { timeout: 60000 })
  await respirar(8000) // a extensão sobe, os ícones e a faixa assentam
  const tela = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workAreaSize)
  saida.tela = tela
  await app.evaluate(({ BrowserWindow }, t) => { const j = BrowserWindow.getAllWindows()[0]; if (j) j.setSize(t.width, 740) }, tela)
  await respirar(2000)
  saida.telaCheia = await win.evaluate(MEDIR)
} catch (e) {
  saida.erro = String(e && e.stack || e)
} finally {
  await fecharApp(app)
}
console.log(JSON.stringify(saida, null, 2))
