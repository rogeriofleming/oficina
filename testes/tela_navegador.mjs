// O NAVEGADOR COM TAMANHOS DE TELA (V17), dentro do editor de verdade — e medido DE DENTRO DA PÁGINA.
//
// ⚠️ POR QUE A MEDIDA É DE DENTRO DA PÁGINA. A vista pode mostrar "iPhone 15 — em uso" e a página
// continuar com a largura do painel: o nome na lista é o que a extensão PEDIU, não o que o navegador
// FEZ. O único juiz é a página: `innerWidth`, `devicePixelRatio`, `navigator.userAgent`, o toque
// (`ontouchstart`, `maxTouchPoints`) — lidos por `executeJavaScript` na página, pelo processo principal.
//
// ⚠️ A PÁGINA É LOCAL. Um servidor deste teste em 127.0.0.1, porta sorteada, com uma página que declara
// `width=device-width` (sem isso, o celular de verdade também não usa a largura dele).
//
// ⚠️ A BARRA LATERAL VEM LIGADA PELO PERFIL DO TESTE. Quem prova que ela nasce ligada no produto é o
// `tela_lateral.mjs`; aqui o assunto é o navegador, e o perfil garante o botão até em executável anterior
// à barra.
//
// Sem conta e sem gasto: nenhuma mensagem vai ao agente.
//
// Uso:  node testes/tela_navegador.mjs [caminho do executavel]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, extensaoForaDeSincronia, abrirArquivo, tirarFoto, abrirPaleta, clicarNoIconeDaVista, iconesDasVistas } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 220) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
}

// O que se espera de cada aparelho vem da MESMA lista que a vista desenha — o teste não tem uma cópia.
let esperados = []
try { esperados = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'navegador.js')).aparelhos() } catch { /* feature ausente: os critérios abaixo ficam vermelhos */ }
const aparelho = id => esperados.find(a => a.id === id)

// ── A página local ───────────────────────────────────────────────────────────────────────────────
const PAGINA = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>medida</title></head>
<body style="margin:0;font:14px sans-serif"><p>pagina de medida</p></body></html>`
const servidor = http.createServer((req, resp) => { resp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); resp.end(PAGINA) })
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}/`

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-navegador-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leia.txt'), 'um\n')
fs.writeFileSync(path.join(projeto, 'pagina.html'), PAGINA)
const userDir = path.join(area, 'dados', 'User')
fs.mkdirSync(userDir, { recursive: true })
fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({
  'workbench.activityBar.location': 'default', 'workbench.colorTheme': 'OFICINA Escuro',
}, null, 2))

// ⚠️ OS ÍCONES NÃO MORAM MAIS EM `.part.activitybar` — nem no cabeçalho da lateral. Desde o
// patch 0022 (o `t198` cumprido) eles vivem na BARRA DE TÍTULO. Este teste nunca foi sobre a
// barra: ela é só o meio de abrir a vista do Navegador. Por isso quem acha o ícone agora é
// `comum.mjs`, num lugar só — ver a nota de `clicarNoIconeDaVista`.
const iconesDaLateral = win => iconesDasVistas(win)
const clicarNaLateral = (win, rotulo) => clicarNoIconeDaVista(win, rotulo)
const PAINEL = '[id="workbench.view.extension.oficinaNavegador"]'
/** As linhas da vista, pelo nome (a descrição vem à parte). */
const linhasDaVista = win => win.evaluate(sel => [...document.querySelectorAll(`${sel} .monaco-list-row`)]
  .map(r => ({ nome: (r.querySelector('.label-name')?.innerText || '').trim(), desc: (r.querySelector('.label-description')?.innerText || '').trim() })), PAINEL)
/**
 * Clica numa linha da vista, ESPERANDO a linha existir.
 *
 * ⚠️ A vista se redesenha inteira a cada mudança, e um passo pode disparar DOIS redesenhos: girar troca o
 * rótulo ("Girar para paisagem" ⇄ "Girar para retrato") e, logo depois, reaplica o aparelho, que avisa de
 * novo. Uma busca de uma tentativa só pode cair na janela em que a lista está sendo trocada e concluir que
 * o rótulo "não está na vista" — o que é diferente de ele não existir. Medido em 19/09/2026: em 4 de 4
 * voltas, procurando com repetição, "Girar para retrato" apareceu sempre; sem repetição, a suíte parou ali
 * em 2 de 3 corridas. Quem usa o programa também não perde o clique por causa disso: tenta de novo.
 * Se a linha realmente não existir, o erro continua saindo — só depois do prazo.
 */
async function clicarNaVista(win, nome, tetoMs = 8000) {
  const fim = Date.now() + tetoMs
  for (;;) {
    const alvo = await win.evaluateHandle(([sel, n]) => [...document.querySelectorAll(`${sel} .monaco-list-row`)]
      .find(r => (r.querySelector('.label-name')?.innerText || '').trim() === n), [PAINEL, nome])
    const el = alvo.asElement()
    if (el) return await el.click()
    if (Date.now() >= fim) throw new Error(`a linha "${nome}" não está na vista`)
    await respirar(250)
  }
}

/** A página medida por dentro, pelo processo principal (a página é um WebContentsView, não uma janela). */
const medirPagina = app => app.evaluate(async ({ webContents }, base) => {
  const w = webContents.getAllWebContents().find(x => !x.isDestroyed() && x.getURL().startsWith(base))
  if (!w) return null
  try {
    return await w.executeJavaScript(`({ largura: innerWidth, altura: innerHeight, tela: screen.width, densidade: devicePixelRatio,
      agente: navigator.userAgent, toque: 'ontouchstart' in window, pontos: navigator.maxTouchPoints, grosso: matchMedia('(pointer: coarse)').matches,
      marcada: !!window.__documentoAntigo })`)
  } catch (e) { return { erro: String(e && e.message) } }
}, BASE)

/** Espera a página chegar a `largura` (a troca recarrega a página); devolve a última medida. */
async function medirAte(app, cond, tetoMs = 15000) {
  const fim = Date.now() + tetoMs
  let m = null
  while (Date.now() < fim) {
    m = await medirPagina(app).catch(() => null)
    if (m && !m.erro && cond(m)) return m
    await respirar(400)
  }
  return m
}

// O agente de Android e Windows leva a versão do Chromium que RODA (a extensão a lê do processo dela);
// o teste a lê da página sem aparelho e cobra que seja a mesma: agente que mente o motor seria pior.
let versaoDoMotor = null
const agenteEsperado = a => versaoDoMotor ? a.agente.replace(/Chrome\/\d+\.0\.0\.0/, `Chrome/${versaoDoMotor}.0.0.0`) : a.agente

/**
 * Marca o documento que está na página. ⚠️ A TROCA RECARREGA A PÁGINA, e a medida tem de ser do documento
 * NOVO: a largura e o agente mudam no documento antigo antes do recarregar, mas o `ontouchstart` é decidido
 * quando o documento nasce. Medido em 18/09/2026: sem a marca, o Notebook depois do Galaxy S24 foi lido no
 * documento antigo (1366 px, agente de Windows e `ontouchstart` ainda de celular) — vermelho do instrumento.
 */
const marcarDocumento = app => app.evaluate(async ({ webContents }, base) => {
  const w = webContents.getAllWebContents().find(x => !x.isDestroyed() && x.getURL().startsWith(base))
  if (w) await w.executeJavaScript('window.__documentoAntigo = true')
}, BASE)

/** Aplica o aparelho (pelo clique na vista, ou pela `acao`) e confere, de dentro da página, tudo o que ele promete. */
async function conferirAparelho(app, win, id, { paisagem = false, acao = null } = {}) {
  const a0 = aparelho(id)
  if (!a0) { checar(`⛔ ${id}: o aparelho está na lista`, false); return null }
  const a = { ...a0, agente: agenteEsperado(a0) }
  await marcarDocumento(app).catch(() => { })
  if (acao) await acao()
  else await clicarNaVista(win, a.nome)
  // Em paisagem vale a área de paisagem do descritor (`paisagem`), que NÃO é o retrato invertido: o iPhone 15 em
  // paisagem é 734×343, não 659×393 (as barras do sistema mudam de lugar).
  const [l, h] = paisagem && a.movel ? (Array.isArray(a.paisagem) ? a.paisagem : [a.altura, a.largura]) : [a.largura, a.altura]
  // ⚠️ Esperar também o TOQUE chegar ao esperado. A troca de aparelho manda quatro comandos e recarrega a
  // página; largura e agente podem já valer num documento em que a emulação de toque ainda não assentou.
  // Sem isto o critério lê um estado de passagem e reprova um produto certo (medido: o toque assenta em
  // ~0,5 s). Se o produto NÃO assentar, `medirAte` devolve a última medida do prazo e o critério abaixo
  // reprova do mesmo jeito — a espera não esconde defeito, só deixa de inventar um.
  const m = await medirAte(app, x => !x.marcada && x.largura === l && x.agente === a.agente && x.toque === a.movel)
  const ok = !!m && m.largura === l && m.altura === h && Math.abs(m.densidade - a.densidade) < 0.01 && m.agente === a.agente &&
    m.toque === a.movel && (a.movel ? m.pontos >= 1 : m.pontos === 0) && m.grosso === a.movel
  checar(`⛔ ${a.nome}${paisagem ? ' em paisagem' : ''} (${a.sistema}): de dentro da página, ${l}×${h}, densidade ${a.densidade}, agente e toque ${a.movel ? 'ligado' : 'desligado'}`,
    ok, JSON.stringify(m && { ...m, agente: (m.agente || '').slice(0, 70) }))
  return m
}

let app
const medidas = {}
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await app.evaluate(({ BrowserWindow }) => { for (const j of BrowserWindow.getAllWindows()) j.setSize(1500, 1400) }).catch(() => { })
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  const fim = Date.now() + 30000
  while (Date.now() < fim && !(await iconesDaLateral(win).catch(() => [])).includes('Skills')) await respirar(500)
  await respirar(1500)

  // O Navegador NÃO fica na barra lateral: nasce solto e abre pelo comando "Navegador" da paleta.
  const icones = await iconesDaLateral(win)
  checar('⛔ o Navegador não está fixado na barra lateral (a barra é só Arquivos, Git e Skills)',
    !icones.includes('Navegador') && ['Explorer', 'Source Control', 'Skills'].every(r => icones.includes(r)), icones.join(', '))

  const paleta = await abrirPaleta(win, respirar)
  if (paleta) {
    await win.keyboard.type('Navegador')
    await respirar(800)
    await win.keyboard.press('Enter')
  }
  await respirar(2000)
  const linhas = await linhasDaVista(win)
  const nomes = linhas.map(l => l.nome)
  checar('⛔ a vista abre com as ações e os cinco grupos (Desktop, Widescreen, Tablet, iOS, Android)',
    ['Abrir endereço…', 'Abrir o HTML do editor', 'Desktop', 'Widescreen', 'Tablet', 'iOS (imitação)', 'Android (imitação)'].every(n => nomes.includes(n)), nomes.join(' | '))
  checar('a lista mostra todos os aparelhos, cada um com polegadas/tela/densidade ao lado',
    esperados.length >= 12 && esperados.every(a => linhas.some(l => l.nome === a.nome && /\d+×\d+/.test(l.desc))), `${esperados.length} esperados, ${linhas.length} linhas`)
  const textoDoPainel = await win.evaluate(sel => document.querySelector(sel)?.innerText || '', PAINEL)
  checar('⛔ a vista diz, na tela, que iOS e Android são imitação e o motor é o Chromium', /não o Safari/.test(textoDoPainel) && /Chromium/.test(textoDoPainel))

  // Abrir a página: o clique na ação, o endereço digitado na caixa, Enter.
  await clicarNaVista(win, 'Abrir endereço…')
  await win.waitForSelector('.quick-input-widget input', { timeout: 10000 })
  await win.locator('.quick-input-widget input').first().fill(BASE)
  await win.locator('.quick-input-widget input').first().press('Enter')
  const aberta = await medirAte(app, m => typeof m.largura === 'number', 20000)
  checar('⛔ "Abrir endereço…" abre a página local no navegador integrado', !!aberta && !aberta.erro, JSON.stringify(aberta))
  medidas.semAparelho = aberta
  versaoDoMotor = aberta && /Chrome\/(\d+)\./.exec(aberta.agente || '')?.[1]

  // Com uma página aberta no navegador integrado, o núcleo punha o globo dele ("Browser") na barra de cima —
  // barra de composição definida pelo dono, onde ele não está. O produto o desliga pela configuração do núcleo.
  const naBarraDeCima = await win.evaluate(() => {
    const barra = document.getElementById('workbench.parts.titlebar')
    return barra ? [...barra.querySelectorAll('.action-item .action-label')]
      .map(e => (e.getAttribute('aria-label') || e.getAttribute('title') || '') + (String(e.className).includes('codicon-globe') ? ' [globo]' : ''))
      .filter(Boolean) : ['(sem barra de cima)']
  })
  checar('⛔ com a página aberta, a barra de cima não ganha o globo do navegador do núcleo',
    !!aberta && !naBarraDeCima.some(r => /^Browser\b|\[globo\]|sem barra/.test(r)), naBarraDeCima.join(' | '))

  medidas.iphone15 = await conferirAparelho(app, win, 'iphone-15')
  medidas.pixel8 = await conferirAparelho(app, win, 'pixel-8')
  medidas.iphoneSE = await conferirAparelho(app, win, 'iphone-se')
  medidas.galaxyS24 = await conferirAparelho(app, win, 'galaxy-s24')
  medidas.notebook = await conferirAparelho(app, win, 'desktop-1366')
  medidas.ultrawide = await conferirAparelho(app, win, 'wide-2560')
  medidas.ipad = await conferirAparelho(app, win, 'ipad-mini')

  // Girar: o celular em uso passa a paisagem.
  await clicarNaVista(win, 'iPhone 15')
  await medirAte(app, x => x.largura === 393)
  medidas.iphone15Paisagem = await conferirAparelho(app, win, 'iphone-15', { paisagem: true, acao: () => clicarNaVista(win, 'Girar para paisagem') })
  await clicarNaVista(win, 'Girar para retrato')
  await medirAte(app, x => x.largura === 393)

  const emUso = (await linhasDaVista(win)).find(l => l.nome === 'iPhone 15')
  checar('a vista marca o aparelho em uso', !!emUso && /em uso/.test(emUso.desc), emUso && emUso.desc)

  // De volta ao tamanho do painel: sem aparelho, a página volta ao agente e ao toque de sempre.
  await marcarDocumento(app).catch(() => { })
  await clicarNaVista(win, 'Tamanho do painel (sem aparelho)')
  // Mesma razão da espera acima, do outro lado: desfazer o aparelho também recarrega, e o toque leva um
  // instante a mais que a largura e o agente para sumir do documento novo.
  const volta = await medirAte(app, x => !x.marcada && !/iPhone/.test(x.agente) && x.largura !== 393 && x.toque === false)
  checar('⛔ "Tamanho do painel" desfaz o aparelho: agente de volta, sem toque, largura do painel',
    !!volta && !/iPhone|Android/.test(volta.agente) && volta.toque === false && volta.largura !== 393, JSON.stringify(volta && { ...volta, agente: (volta.agente || '').slice(0, 70) }))
  medidas.volta = volta

  // O HTML aberto no editor abre no navegador ao lado, como arquivo local.
  const foi = await abrirArquivo(win, respirar, 'pagina.html')
  await clicarNaVista(win, 'Abrir o HTML do editor')
  let doArquivo = null
  for (let i = 0; i < 30 && !doArquivo; i++) {
    doArquivo = await app.evaluate(({ webContents }) => webContents.getAllWebContents()
      .map(w => w.isDestroyed() ? '' : w.getURL()).find(u => /^file:.*pagina\.html$/i.test(u)) || null).catch(() => null)
    if (!doArquivo) await respirar(500)
  }
  checar('"Abrir o HTML do editor" abre o arquivo .html aberto no navegador integrado', foi !== false && !!doArquivo, doArquivo || 'nenhuma página com o arquivo')
  if (process.env.OFICINA_FOTO) await tirarFoto(win, process.env.OFICINA_FOTO)
} catch (e) {
  checar('o teste chegou ao fim sem erro', false, e && e.message)
} finally {
  if (app) await fecharApp(app)
  servidor.close()
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* pasta temporária do sistema */ }
}

console.log('\nMEDIDAS ' + JSON.stringify(medidas))
const passou = res.length > 0 && res.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: res.length, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
