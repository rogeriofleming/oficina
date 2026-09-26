// A ABERTURA COMO A PESSOA ABRE — com a confiança da pasta LIGADA, do jeito que o atalho abre.
//
// ⚠️ POR QUE ESTA SUÍTE EXISTE (25/09/2026). Toda janela de teste abria com `--disable-workspace-trust`
// (`argumentosDeTeste`). A V27 passou em tudo e, instalada, abriu em MODO RESTRITO: a pasta não era
// confiável, a extensão da OFICINA não declara suporte a pasta não confiável, e sumiu inteira — só
// Explorer e Source Control na barra, nenhuma conversa, nenhum contador. A barra de status vem
// escondida de fábrica, então nem o aviso "Restricted Mode" aparecia. O caminho real nunca tinha sido
// testado. Desde a V28 o produto desliga a confiança (`security.workspace.trust.enabled: false` nos
// padrões); esta suíte prova isso no executável, sem a opção dos testes e sem configuração do usuário.
//
// Uso:  node testes/abertura_como_ele_abre.mjs [exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RAIZ, carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, argumentosDeTeste } from './comum.mjs'

const resultados = []
const pulados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe !== undefined ? '  (' + detalhe + ')' : ''}`)
}

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado', procurei: RAIZ }))
  process.exit(1)
}
console.log('executavel: ' + exe)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-como-ele-abre-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'uma pasta que ninguem marcou como confiavel\n', 'utf8')

const opcoes = { confiancaDesligada: false }
// Controle: se a opcao dos testes voltar a entrar, esta suite deixa de provar o caminho real.
checar('controle: a janela abre SEM --disable-workspace-trust',
  !argumentosDeTeste(projeto, area, opcoes).includes('--disable-workspace-trust'))

const _electron = await carregarElectron()
let app = null
try {
  app = await abrirOficina(_electron, { exe, projeto, area, opcoes })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.part.titlebar', { timeout: 60000 })
  const DA_OFICINA = ['Tokens', 'Skills', 'Conexões', 'Conta']
  let icones = []
  for (let i = 0; i < 30; i++) {
    icones = await win.evaluate(() => [...document.querySelectorAll('.titlebar-activity-container .action-item .action-label')].map(e => e.getAttribute('aria-label') || ''))
    if (DA_OFICINA.every(n => icones.some(t => t.startsWith(n)))) break
    await new Promise(r => setTimeout(r, 1000))
  }
  checar('⛔ numa pasta NAO confiada, a extensao da OFICINA esta viva: Tokens, Skills, Conexões e Conta na barra',
    DA_OFICINA.every(n => icones.some(t => t.startsWith(n))), JSON.stringify(icones))
  const restrito = await win.evaluate(() => document.body.innerText.includes('Restricted Mode'))
  checar('a janela nao diz "Restricted Mode" em lugar nenhum', !restrito)

  // A ORDEM DA BARRA DE CIMA, do jeito que ele ditou (25/09/2026): logo > icones > limites > pesquisa >
  // contador > botoes do Windows. Na V28 instalada os limites foram para ANTES da logo: o `order` do CSS
  // decide a posicao, e o encaixe tinha ficado sem. Os limites so aparecem depois da primeira leitura
  // do uso — espera ate 60 s; se nao vierem, o criterio e PULADO, nao aprovado.
  await app.evaluate(({ BrowserWindow }) => { const j = BrowserWindow.getAllWindows()[0]; if (j) j.setSize(1360, 740) })
  for (let i = 0; i < 60; i++) {
    if (await win.evaluate(() => document.querySelectorAll('.part.titlebar .titlebar-gauges .gauge').length) > 0) break
    await new Promise(r => setTimeout(r, 1000))
  }
  await new Promise(r => setTimeout(r, 1500))
  const pos = await win.evaluate(() => {
    const q = s => document.querySelector('.part.titlebar ' + s)
    const x = e => e && e.getBoundingClientRect().width > 0 ? { de: Math.round(e.getBoundingClientRect().left), ate: Math.round(e.getBoundingClientRect().right) } : null
    return { logo: x(q('.window-appicon')), icones: x(q('.titlebar-activity-container')), limites: q('.titlebar-gauges .gauge') ? x(q('.titlebar-gauges')) : null, pesquisa: x(q('.command-center')), direita: x(q('.titlebar-right')) }
  })
  if (!pos.limites) {
    pulados.push('a ordem com os limites na barra')
    console.log('  --    a ordem com os limites na barra: PULADO (os limites nao subiram para a barra nesta rodada) — nao e um OK')
  } else {
    checar('⛔ a ordem da barra: logo > icones > limites > pesquisa > direita (contador e botoes)',
      !!(pos.logo && pos.icones && pos.pesquisa && pos.direita) &&
      pos.logo.ate <= pos.icones.de && pos.icones.ate <= pos.limites.de &&
      pos.limites.ate <= pos.pesquisa.de && pos.pesquisa.ate <= pos.direita.de,
      JSON.stringify(pos))
  }
} catch (e) {
  checar('a janela abriu', false, String(e && e.message || e).slice(0, 300))
} finally {
  await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const falhas = resultados.filter(r => !r.ok)
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome), pulados }))
process.exit(falhas.length ? 1 : 0)
