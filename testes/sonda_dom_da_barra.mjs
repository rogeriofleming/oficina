// SONDA (descartavel): que seletor alcanca os icones da barra de cima?
//
// A suite do toggle procurou `.titlebar-activity-container .monaco-action-bar .action-item` e
// achou zero. Antes de trocar o seletor por palpite, esta sonda imprime o que EXISTE no DOM da
// barra de titulo — classe, rotulo e quantos filhos — para o seletor sair de leitura, nao de
// tentativa.
//
// ⚠️ TEM `finally`: sonda sem ele ja deixou processo vivo neste projeto.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()
const respirar = (ms) => new Promise(r => setTimeout(r, ms))
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sonda-dom-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'x\n', 'utf8')

let app = null
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(12000)

  const retrato = await win.evaluate(() => {
    const desenhar = (el, nivel = 0, max = 4) => {
      if (!el || nivel > max) return []
      const linha = `${'  '.repeat(nivel)}${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.')}`
        + (el.getAttribute && el.getAttribute('aria-label') ? ` [${el.getAttribute('aria-label')}]` : '')
        + ` (${el.offsetWidth}x${el.offsetHeight})`
      return [linha, ...[...el.children].flatMap(c => desenhar(c, nivel + 1, max))]
    }
    const itens = [...document.querySelectorAll('.titlebar-activity-container .action-item')].map(li => {
      const lab = li.querySelector('.action-label')
      const cs = lab ? getComputedStyle(lab) : null
      return {
        rotulo: (lab && (lab.getAttribute('aria-label') || lab.title)) || li.getAttribute('aria-label') || '(sem rotulo)',
        item: `${li.offsetWidth}x${li.offsetHeight}`,
        label: lab ? `${lab.offsetWidth}x${lab.offsetHeight}` : null,
        ehCodicon: !!(lab && lab.classList.contains('codicon')),
        fontSize: cs ? cs.fontSize : null,
        width: cs ? cs.width : null,
      }
    })
    const tb = document.querySelector('.titlebar-activity-container')
    return {
      arvore: tb ? desenhar(tb).slice(0, 80) : ['SEM .part.titlebar'],
      itens,
      candidatos: {
        'titlebar-activity-container': document.querySelectorAll('.titlebar-activity-container').length,
        '.part.titlebar .action-item': document.querySelectorAll('.part.titlebar .action-item').length,
        '.part.titlebar .monaco-action-bar': document.querySelectorAll('.part.titlebar .monaco-action-bar').length,
        '.titlebar-activity-container .action-item': document.querySelectorAll('.titlebar-activity-container .action-item').length,
        '.titlebar-activity-container .monaco-action-bar .action-item': document.querySelectorAll('.titlebar-activity-container .monaco-action-bar .action-item').length,
        '.part.activitybar': document.querySelectorAll('.part.activitybar').length,
      },
    }
  })
  console.log('--- ITENS ---'); console.log(JSON.stringify(retrato.itens, null, 1)); console.log('--- candidatos ---')
  console.log(JSON.stringify(retrato.candidatos, null, 1))
  console.log('--- arvore da barra de titulo ---')
  console.log(retrato.arvore.join('\n'))
} catch (e) {
  console.log('ERRO: ' + (e && e.message))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}
