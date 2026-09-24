// SONDA (descartável): quantos "Skills" existem na barra de cima, e quem são eles.
//
// Existe por causa de UMA medida: `tela_primeiro_uso.mjs` acusou `cima 2` para o rótulo
// "Skills". Dois é ambíguo — pode ser o mesmo ícone contado por dois seletores aninhados
// (inofensivo) ou DOIS ícones de verdade (defeito: o t198 pediu três, não quatro).
//
// ⚠️ TEM `finally`. Sonda sem `finally` foi o que deixou nove processos vivos e derrubou um
// build inteiro em 22/09/2026 (armadilha 12 do COMO_CONSTRUIR.md).
//
// Uso:  node testes/sonda_skills_na_barra.mjs
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()
const exe = acharExe()
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sonda-skills-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'sonda\n')

let app = null
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow()
  await esconderJanela(app)
  await win.waitForTimeout(6000)

  const laudo = await win.evaluate(() => {
    const caixa = el => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const achados = [...document.querySelectorAll('.part.titlebar [aria-label]')]
      .filter(el => (el.getAttribute('aria-label') || '').includes('Skills'))
      .map(el => ({
        rotulo: el.getAttribute('aria-label'),
        tag: el.tagName.toLowerCase(),
        classe: el.className && el.className.toString().slice(0, 90),
        pai: el.parentElement ? el.parentElement.className.toString().slice(0, 70) : null,
        caixa: caixa(el),
      }))
    // quem contém quem: o par aninhado é o caso inofensivo
    const nos = [...document.querySelectorAll('.part.titlebar [aria-label]')]
      .filter(el => (el.getAttribute('aria-label') || '').includes('Skills'))
    const aninhados = nos.length === 2 ? (nos[0].contains(nos[1]) || nos[1].contains(nos[0])) : null
    const naAtividade = document.querySelectorAll('.part.titlebar .titlebar-activity-container .action-item').length
    const rotulosDaAtividade = [...document.querySelectorAll('.part.titlebar .titlebar-activity-container .action-item')]
      .map(el => (el.getAttribute('aria-label') || el.textContent || '').trim())
    return { achados, aninhados, naAtividade, rotulosDaAtividade }
  })

  console.log(JSON.stringify(laudo, null, 2))
} catch (e) {
  console.log('SONDA FALHOU: ' + (e && e.message))
} finally {
  await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* a área é temporária */ }
}
