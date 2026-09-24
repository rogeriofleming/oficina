// SONDA DE VIABILIDADE (descartável): QUAL estilo faz o rótulo vivo ceder em vez de empurrar?
//
// ⚠️ POR QUE ESTA SONDA EXISTE ANTES DO PATCH. O conserto escolhido por ele é "o mostrador trunca
// com … em vez de empurrar os controles da janela". Escrever o patch primeiro e compilar para
// descobrir se o CSS era o certo custa uma compilação por tentativa, e o teto deste projeto é UM
// build por checkpoint. Aqui a hipótese é testada de graça, no executável que JÁ existe: os
// estilos candidatos são aplicados ao vivo, e a medida diz se resolveram.
//
// O que ela imprime, para cada candidato: se os controles da janela andaram, se a barra passou a
// rolar, quanto a barra de pesquisa cedeu e qual a largura final do item.
//
// ⚠️ TEM `finally` (armadilha 12). Não fala com o agente, não gasta.
//
// Uso:  node testes/sonda_viabilidade_truncar.mjs
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()
const exe = acharExe()
const respirar = ms => new Promise(r => setTimeout(r, ms))

const TEXTO_PIOR_CASO = 'Uma conversa com nome comprido · 999k · 999,0M · US$ 9.999,99*? · cache 60m?'

const EXPERIMENTO = (texto) => {
  const barra = document.querySelector('.part.titlebar')
  const container = barra && barra.querySelector('.titlebar-container')
  const acoes = barra && barra.querySelector('.action-toolbar-container .actions-container')
  const caixaDeAcoes = barra && barra.querySelector('.action-toolbar-container')
  const controles = barra && barra.querySelector('.window-controls-container')
  const centro = barra && barra.querySelector('.titlebar-center')
  if (!barra || !container || !acoes) return { erro: 'nao achei a barra de cima' }

  const retrato = () => ({
    pesquisa: centro ? Math.round(centro.getBoundingClientRect().width) : null,
    controles: controles ? Math.round(controles.getBoundingClientRect().left) : null,
    rolagem: Math.round(container.scrollWidth),
    barra: Math.round(container.getBoundingClientRect().width),
  })

  // O item de mentira com a MESMA forma do real: largura intrínseca vinda do texto, não fixa.
  const item = document.createElement('div')
  item.className = 'action-item oficina-sonda'
  const rotulo = document.createElement('a')
  rotulo.className = 'action-label'
  rotulo.textContent = texto
  item.appendChild(rotulo)

  const antes = retrato()
  acoes.appendChild(item)
  void container.offsetWidth
  const cru = { ...retrato(), item: Math.round(item.getBoundingClientRect().width) }

  const medirCom = (nome, aplicar, desfazer) => {
    aplicar()
    void container.offsetWidth
    const r = { ...retrato(), item: Math.round(item.getBoundingClientRect().width) }
    const laudo = {
      candidato: nome,
      itemFicou: r.item,
      pesquisaCedeu: antes.pesquisa - r.pesquisa,
      controlesAndaram: r.controles !== antes.controles,
      rola: r.rolagem > r.barra,
      truncou: r.item < cru.item,
    }
    desfazer()
    void container.offsetWidth
    return laudo
  }

  const resultados = []

  // Candidato 1: só o item cede (min-width:0 + shrink) e o rótulo trunca.
  resultados.push(medirCom('1. item shrink + rotulo ellipsis', () => {
    item.style.minWidth = '0'; item.style.flexShrink = '1'
    rotulo.style.overflow = 'hidden'; rotulo.style.textOverflow = 'ellipsis'
    rotulo.style.whiteSpace = 'nowrap'; rotulo.style.display = 'block'
  }, () => {
    item.style.minWidth = ''; item.style.flexShrink = ''
    rotulo.style.overflow = ''; rotulo.style.textOverflow = ''
    rotulo.style.whiteSpace = ''; rotulo.style.display = ''
  }))

  // Candidato 2: o de cima MAIS deixar o contêiner de ações encolher.
  resultados.push(medirCom('2. + actions-container min-width:0', () => {
    item.style.minWidth = '0'; item.style.flexShrink = '1'
    rotulo.style.overflow = 'hidden'; rotulo.style.textOverflow = 'ellipsis'
    rotulo.style.whiteSpace = 'nowrap'; rotulo.style.display = 'block'
    acoes.style.minWidth = '0'
    if (caixaDeAcoes) { caixaDeAcoes.style.minWidth = '0'; caixaDeAcoes.style.flexShrink = '1' }
  }, () => {
    item.style.minWidth = ''; item.style.flexShrink = ''
    rotulo.style.overflow = ''; rotulo.style.textOverflow = ''
    rotulo.style.whiteSpace = ''; rotulo.style.display = ''
    acoes.style.minWidth = ''
    if (caixaDeAcoes) { caixaDeAcoes.style.minWidth = ''; caixaDeAcoes.style.flexShrink = '' }
  }))

  // Candidato 3: teto duro de largura no item (sem depender de flex nenhum).
  resultados.push(medirCom('3. max-width 220px + ellipsis', () => {
    item.style.maxWidth = '220px'; item.style.overflow = 'hidden'
    rotulo.style.overflow = 'hidden'; rotulo.style.textOverflow = 'ellipsis'
    rotulo.style.whiteSpace = 'nowrap'; rotulo.style.display = 'block'
  }, () => {
    item.style.maxWidth = ''; item.style.overflow = ''
    rotulo.style.overflow = ''; rotulo.style.textOverflow = ''
    rotulo.style.whiteSpace = ''; rotulo.style.display = ''
  }))

  // Candidato 4: teto RELATIVO — trunca quando a janela aperta, e não trunca quando sobra.
  for (const teto of ['30vw', 'min(400px, 30vw)', 'min(400px, 35vw)']) {
    resultados.push(medirCom(`4. max-width ${teto} + ellipsis`, () => {
      item.style.maxWidth = teto; item.style.overflow = 'hidden'
      rotulo.style.overflow = 'hidden'; rotulo.style.textOverflow = 'ellipsis'
      rotulo.style.whiteSpace = 'nowrap'; rotulo.style.display = 'block'
    }, () => {
      item.style.maxWidth = ''; item.style.overflow = ''
      rotulo.style.overflow = ''; rotulo.style.textOverflow = ''
      rotulo.style.whiteSpace = ''; rotulo.style.display = ''
    }))
  }

  acoes.removeChild(item)
  void container.offsetWidth

  return {
    larguraDaJanela: Math.round(document.documentElement.clientWidth),
    antes,
    semTratamento: { ...cru, pesquisaCedeu: antes.pesquisa - cru.pesquisa, controlesAndaram: cru.controles !== antes.controles, rola: cru.rolagem > cru.barra },
    resultados,
  }
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sonda-trunca-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'sonda\n')

let app = null
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.part.titlebar', { timeout: 60000 })
  await respirar(5000)

  // ⚠️ AS DUAS LARGURAS, e a segunda é a que impede um número mágico de virar defeito: um teto
  // que resolve a janela estreita pode estar TRUNCANDO À TOA na janela larga, onde sobra espaço.
  const laudo = {}
  for (const [nome, largura] of [['estreita', 660], ['larga', 1360]]) {
    await app.evaluate(({ BrowserWindow }, l) => {
      const j = BrowserWindow.getAllWindows()[0]
      if (j) j.setSize(l, 700)
    }, largura)
    await respirar(1500)
    laudo[nome] = await win.evaluate(EXPERIMENTO, TEXTO_PIOR_CASO)
  }
  console.log(JSON.stringify(laudo, null, 2))
} catch (e) {
  console.log('SONDA FALHOU: ' + (e && e.message))
} finally {
  await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* área temporária */ }
}
