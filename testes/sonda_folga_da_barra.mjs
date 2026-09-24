// SONDA DE CONTROLE (descartável): os 3 ícones do `t198` são a causa da perda de folga na barra?
//
// O QUE ESTA SONDA RESPONDE. Em 22/09/2026, com a máquina livre,
// `tela_limite_barra.mjs` reprovou 8 critérios nos dois temas: em janela estreita a barra de
// pesquisa passou a ceder **211 px** (o teto declarado é 130), os controles da janela andaram e a
// barra passou a rolar. O mesmo arquivo registra a medida do build anterior, `V20-B2`: naquela
// janela a pesquisa cedia **125 px**, dentro do teto.
//
// Entre um build e outro entrou o `t198` — os três ícones (Arquivos, Git, Skills) na barra de
// título. A hipótese é que a folga que sumiu é a largura deles. Hipótese não é causa: esta sonda
// faz o CONTROLE, na mesma janela e na mesma corrida — mede a cedência com os ícones e, logo
// depois, com o contêiner deles escondido. Se o número voltar ao patamar da V20, está provado.
//
// ⚠️ TEM `finally` (armadilha 12). Não fala com o agente, não gasta.
//
// Uso:  node testes/sonda_folga_da_barra.mjs
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()
const exe = acharExe()
const respirar = ms => new Promise(r => setTimeout(r, ms))

/** Mede a barra com uma sonda de `larguraDaSonda` px dentro dela, com e sem os ícones do t198. */
const MEDIR = (larguraDaSonda) => {
  const barra = document.querySelector('.part.titlebar')
  const container = barra && barra.querySelector('.titlebar-container')
  const acoes = barra && barra.querySelector('.action-toolbar-container .actions-container')
  const controles = barra && barra.querySelector('.window-controls-container')
  const centro = barra && barra.querySelector('.titlebar-center')
  const icones = barra && barra.querySelector('.titlebar-activity-container')
  if (!barra || !container || !acoes) return { erro: 'nao achei a barra de cima' }

  const retrato = () => ({
    pesquisa: centro ? Math.round(centro.getBoundingClientRect().width) : null,
    controles: controles ? Math.round(controles.getBoundingClientRect().left) : null,
    rolagem: Math.round(container.scrollWidth),
    barra: Math.round(container.getBoundingClientRect().width),
  })

  const porSonda = () => {
    const sonda = document.createElement('div')
    sonda.style.width = larguraDaSonda + 'px'
    sonda.style.height = '22px'
    sonda.style.flex = '0 0 auto'
    sonda.className = 'action-item'
    acoes.appendChild(sonda)
    void container.offsetWidth
    const depois = retrato()
    acoes.removeChild(sonda)
    void container.offsetWidth
    return depois
  }

  // 1. como está hoje, com os três ícones na barra
  const antesComIcones = retrato()
  const comSondaEIcones = porSonda()
  const larguraDosIcones = icones ? Math.round(icones.getBoundingClientRect().width) : 0
  const quantosIcones = icones ? icones.querySelectorAll('.action-item').length : 0

  // 2. CONTROLE: o mesmo, com o contêiner dos ícones fora da conta
  const displayAntes = icones ? icones.style.display : null
  if (icones) icones.style.display = 'none'
  void container.offsetWidth
  const antesSemIcones = retrato()
  const comSondaSemIcones = porSonda()
  if (icones) icones.style.display = displayAntes
  void container.offsetWidth

  return {
    larguraDaJanela: Math.round(document.documentElement.clientWidth),
    larguraDaSonda, larguraDosIcones, quantosIcones,
    comIcones: {
      antes: antesComIcones, comSonda: comSondaEIcones,
      cedeu: antesComIcones.pesquisa - comSondaEIcones.pesquisa,
      controlesAndaram: antesComIcones.controles !== comSondaEIcones.controles,
      rola: comSondaEIcones.rolagem > comSondaEIcones.barra,
    },
    semIcones: {
      antes: antesSemIcones, comSonda: comSondaSemIcones,
      cedeu: antesSemIcones.pesquisa - comSondaSemIcones.pesquisa,
      controlesAndaram: antesSemIcones.controles !== comSondaSemIcones.controles,
      rola: comSondaSemIcones.rolagem > comSondaSemIcones.barra,
    },
  }
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sonda-folga-'))
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

  await app.evaluate(({ BrowserWindow }) => {
    const j = BrowserWindow.getAllWindows()[0]
    if (j) j.setSize(660, 700)
  })
  await respirar(1500)

  const piorCaso = await win.evaluate(MEDIR, 393)
  const todoDia = await win.evaluate(MEDIR, 178)
  console.log(JSON.stringify({ piorCaso, todoDia }, null, 2))
} catch (e) {
  console.log('SONDA FALHOU: ' + (e && e.message))
} finally {
  await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* área temporária */ }
}
