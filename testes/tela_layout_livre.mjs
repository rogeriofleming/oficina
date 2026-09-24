// O LAYOUT LIVRE, DENTRO DO EDITOR DE VERDADE: a alça da caixa de escrever e o "Voltar ao layout padrão".
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE. A altura da caixa é medida pelo navegador (a caixa cresce com o texto, e a
// alça arrasta a borda de cima); guardar e reabrir passa pelo perfil do editor; e o "voltar ao padrão" mexe em
// partes que só existem com o núcleo compilado (a barra lateral volta a 300 px pelo patch 0011). A ponte prova
// as mensagens e o motor prova as contas; o que só a janela prova é isto.
//
// O que ela faz, em ordem, num perfil descartável:
//   1. mede a caixa no automático, arrasta a alça para cima e mede de novo; desce 16 px pelo teclado;
//   2. fecha e reabre com o MESMO perfil: a caixa tem de voltar com a altura escolhida;
//   3. alarga a barra lateral pelo arrasto do próprio editor (preparação, não critério: o editor já faz);
//   4. "Layout da tela" → "Voltar ao layout padrão…" → confirma: a caixa volta ao automático, a barra lateral
//      fecha e, aberta de novo, tem 300 px; a configuração de tela do perfil sai; fecha e reabre: continua.
//
// ⚠️ A CONFIRMAÇÃO É DESENHADA PELO EDITOR (`window.dialogStyle: custom` no perfil do teste): a janela do sistema
// o Playwright não alcança.
//
// Sem conta e sem gasto: nenhuma mensagem vai ao agente.
//
// Uso:  node testes/tela_layout_livre.mjs [caminho do executavel]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, abrirPaleta, extensaoForaDeSincronia } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-layout-livre-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leia.md'), '# layout livre\n', 'utf8')
const userDir = path.join(area, 'dados', 'User')
fs.mkdirSync(userDir, { recursive: true })
const arquivoDoPerfil = path.join(userDir, 'settings.json')
fs.writeFileSync(arquivoDoPerfil, JSON.stringify({
  'workbench.colorTheme': 'OFICINA Escuro',
  'window.dialogStyle': 'custom',
  // Configuração de tela que o "voltar ao padrão" tem de tirar do perfil.
  'workbench.activityBar.compact': true,
}, null, 2))
const lerPerfil = () => { try { return JSON.parse(fs.readFileSync(arquivoDoPerfil, 'utf8')) } catch { return null } }

async function acharFrameDaConversa(win, teto = 60000) {
  const fim = Date.now() + teto
  while (Date.now() < fim) {
    for (const f of win.frames()) {
      try { if (await f.evaluate(() => !!document.getElementById('entrada'))) return f } catch { }
    }
    await respirar(400)
  }
  return null
}

async function abrir() {
  const app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  const frame = await acharFrameDaConversa(win)
  if (!frame) throw new Error('a conversa nao abriu (#entrada nunca apareceu)')
  // O host manda os tamanhos no `pronto`: dá tempo de chegarem.
  await respirar(2500)
  return { app, win, frame }
}

/** A altura da caixa de escrever, e o que a alça diz de si. `alca: false` quando a página não tem alça. */
const medirCaixa = frame => frame.evaluate(() => {
  const e = document.getElementById('entrada'), a = document.getElementById('alca-caixa')
  return { altura: Math.round(e.getBoundingClientRect().height), alca: !!a, valor: a ? Number(a.getAttribute('aria-valuenow')) : null }
})

async function comando(win, texto) {
  await abrirPaleta(win, respirar)
  await win.keyboard.type(texto)
  await respirar(900)
  await win.keyboard.press('Enter')
  await respirar(1500)
}
const larguraDaParte = (win, id) => win.evaluate(alvo => {
  const s = document.getElementById(alvo)
  return s && getComputedStyle(s).display !== 'none' ? Math.round(s.getBoundingClientRect().width) : 0
}, id)
const larguraDaLateral = win => larguraDaParte(win, 'workbench.parts.sidebar')
const larguraDaJanela = win => win.evaluate(() => Math.round(document.body.getBoundingClientRect().width))

let app
try {
  // ── 1. A alça ────────────────────────────────────────────────────────────────────────────────────
  let win, frame
  ;({ app, win, frame } = await abrir())
  const antes = await medirCaixa(frame)
  let depois = antes
  if (antes.alca) {
    const caixa = await frame.locator('#alca-caixa').boundingBox()
    const x = caixa.x + caixa.width / 2, y = caixa.y + caixa.height / 2
    await win.mouse.move(x, y)
    await win.mouse.down()
    for (let i = 1; i <= 10; i++) { await win.mouse.move(x, y - 15 * i); await respirar(30) }
    await win.mouse.up()
    await respirar(800)
    depois = await medirCaixa(frame)
  }
  const subiu = depois.altura - antes.altura
  checar('⛔ arrastar a alça 150 px para cima aumenta a caixa de escrever em 150 px (±4)', antes.alca && Math.abs(subiu - 150) <= 4,
    `antes ${antes.altura}px, depois ${depois.altura}px`)
  checar('a alça diz a altura de agora a quem não vê (aria-valuenow)', antes.alca && Math.abs(depois.valor - depois.altura) <= 1, `valor ${depois.valor}, altura ${depois.altura}`)
  let teclado = depois
  if (antes.alca) {
    await frame.focus('#alca-caixa')
    await frame.press('#alca-caixa', 'ArrowDown')
    await respirar(600)
    teclado = await medirCaixa(frame)
  }
  checar('⛔ pelo teclado, seta para baixo na alça tira 16 px', antes.alca && depois.altura - teclado.altura === 16, `${depois.altura} → ${teclado.altura}`)
  const escolhida = teclado.altura

  // ── 2. Guardado sem botão: fechar e reabrir ──────────────────────────────────────────────────────
  await fecharApp(app); app = null
  ;({ app, win, frame } = await abrir())
  const reaberta = await medirCaixa(frame)
  // Só vale se a altura escolhida NÃO for a automática: sem a alça, "32 = 32" passaria sem provar nada.
  checar('⛔ fechar e reabrir: a caixa volta com a altura escolhida, sem botão de salvar', escolhida !== antes.altura && Math.abs(reaberta.altura - escolhida) <= 1,
    `automática ${antes.altura}px, escolhida ${escolhida}px, reaberta ${reaberta.altura}px`)

  // ── 3. Preparação: a barra lateral alargada pelo arrasto do próprio editor ───────────────────────
  await comando(win, 'View: Show Explorer')
  const lateralAntes = await larguraDaLateral(win)
  const sash = await win.evaluate(() => {
    const s = document.getElementById('workbench.parts.sidebar').getBoundingClientRect()
    const alvo = [...document.querySelectorAll('.monaco-workbench > .monaco-grid-view .monaco-sash.vertical')]
      .map(e => e.getBoundingClientRect()).find(b => Math.abs(b.x - s.right) <= 4 && b.height > 100)
    return alvo ? { x: alvo.x + alvo.width / 2, y: alvo.y + alvo.height / 2 } : null
  })
  if (sash) {
    await win.mouse.move(sash.x, sash.y); await win.mouse.down()
    for (let i = 1; i <= 10; i++) { await win.mouse.move(sash.x + 12 * i, sash.y); await respirar(30) }
    await win.mouse.up(); await respirar(800)
  }
  const lateralAlargada = await larguraDaLateral(win)
  console.log(`  nota  barra lateral: ${lateralAntes}px → arrastada ${lateralAlargada}px (preparação; o editor já guarda sozinho)`)

  // ── 4. Voltar ao layout padrão ───────────────────────────────────────────────────────────────────
  await comando(win, 'OFICINA: Layout da tela')
  const item = win.locator('.quick-input-list .monaco-list-row', { hasText: 'Voltar ao layout padrão' }).first()
  const temItem = await item.isVisible().catch(() => false)
  checar('⛔ o botão Layout oferece "Voltar ao layout padrão…"', temItem)
  let dialogo = { texto: '' }
  if (temItem) {
    await item.click()
    await win.waitForSelector('.monaco-dialog-box', { timeout: 10000 }).catch(() => { })
    dialogo = await win.evaluate(() => {
      const d = document.querySelector('.monaco-dialog-box')
      return { texto: d ? d.innerText : '' }
    })
    const botao = win.locator('.monaco-dialog-box .dialog-buttons .monaco-button', { hasText: 'Voltar ao padrão' }).first()
    if (await botao.isVisible().catch(() => false)) await botao.click()
    await respirar(4000)
  }
  checar('⛔ a confirmação diz, antes, que os layouts com nome não são apagados', /layouts com nome NÃO são apagados/.test(dialogo.texto), dialogo.texto.replace(/\s+/g, ' '))
  const aviso = await win.evaluate(() => [...document.querySelectorAll('.notification-toast, .notifications-center')].map(n => n.innerText).join(' | '))
  checar('depois, a notificação repete que os layouts com nome continuam salvos', /layouts com nome continuam salvos/.test(aviso), aviso.replace(/\s+/g, ' ').slice(0, 300))
  const padrao = await medirCaixa(frame)
  // Idem: a caixa tinha de estar FORA do automático antes (a altura reaberta), senão o critério não separa nada.
  const saiuDoAutomatico = reaberta.altura !== antes.altura
  checar('⛔ voltar ao padrão: a caixa de escrever volta ao automático (a altura de antes de arrastar)', saiuDoAutomatico && Math.abs(padrao.altura - antes.altura) <= 1,
    `automático ${antes.altura}px, antes do padrão ${reaberta.altura}px, agora ${padrao.altura}px`)
  checar('⛔ voltar ao padrão: a barra lateral fecha (como a OFICINA abre)', (await larguraDaLateral(win)) === 0)
  await comando(win, 'View: Show Explorer')
  const lateralDepois = await larguraDaLateral(win)
  /*
    V19: a largura do padrão é a conta do núcleo — um quarto da janela, teto 300, piso 170 —, e por isso o
    critério calcula o esperado a partir da janela DESTA corrida, em vez de cravar 300.

    ⚠️ O que este critério NÃO separa aqui: num núcleo anterior à V19 o retrato não traz o tamanho da janela,
    e a extensão pede o teto. Numa janela larga (a que este teste abre) os dois caminhos dão o mesmo 300 — o
    número só diverge em janela estreita, e aí o executável precisa ser o da V19. Medido no executável da
    V18, numa janela de 656 px: o "voltar ao padrão" deixava a barra da direita com 218 px.
  */
  const janela = await larguraDaJanela(win)
  const esperado = Math.max(170, Math.min(300, Math.round(janela / 4)))
  checar('⛔ voltar ao padrão: aberta de novo, a barra lateral tem a largura de fábrica (patch 0011)',
    lateralDepois === esperado, `janela ${janela}px, esperado ${esperado}px, arrastada ${lateralAlargada}px, agora ${lateralDepois}px`)
  const secundariaDepois = await larguraDaParte(win, 'workbench.parts.auxiliarybar')
  /*
    ⚠️ CRITÉRIO INVERTIDO POR ORDEM DELE (t197), e é a mesma inversão que os critérios da ponte já
    tinham recebido — este, que é de tela, tinha ficado para trás.

    Ele apontou a barra da direita e disse: *"esse negócio inteiro na direita não faz sentido, não
    quero ele assim"*. Da V20 em diante o produto a entrega FECHADA
    (`secondarySideBar.defaultVisibility`), e o "voltar ao padrão" tem que respeitar isso — abrir a
    barra que ele mandou fechar seria desfazer a decisão dele por dentro.
  */
  checar('⛔ voltar ao padrão: a barra da direita NÃO é aberta (t197: ele mandou que ela não nasça assim)',
    secundariaDepois === 0, `janela ${janela}px, agora ${secundariaDepois}px (esperado 0)`)
  const perfil = lerPerfil()
  checar('⛔ voltar ao padrão: a configuração de tela sai do perfil (barra de ícones compacta)', !!perfil && !('workbench.activityBar.compact' in perfil), JSON.stringify(perfil))

  await fecharApp(app); app = null
  ;({ app, win, frame } = await abrir())
  const reabertaPadrao = await medirCaixa(frame)
  checar('⛔ fechar e reabrir depois do padrão: a caixa continua no automático', saiuDoAutomatico && Math.abs(reabertaPadrao.altura - antes.altura) <= 1, `${reabertaPadrao.altura}px`)
  // Esconder a barra da direita (Ctrl+Alt+B) com o cursor na caixa de escrever: a vista Tokens volta sozinha e o
  // cursor CONTINUA na caixa. O núcleo, ao esconder a barra, leva o foco ao editor — que é a própria conversa —,
  // mas a página chegava de volta sem nada focado (o cursor sumia da caixa). Medido no executável.
  await frame.click('#entrada')
  await frame.fill('#entrada', 'abc')
  await new Promise(r => setTimeout(r, 400))
  const focoAntes = await frame.evaluate(() => document.activeElement && document.activeElement.id)
  await frame.press('#entrada', 'Control+Alt+B')
  const serie = []
  for (let i = 0; i < 20; i++) {
    serie.push(await win.evaluate(() => { const a = document.getElementById('workbench.parts.auxiliarybar'); const b = a && a.getBoundingClientRect(); return b && b.width > 0 ? 1 : 0 }))
    await new Promise(r => setTimeout(r, 100))
  }
  await new Promise(r => setTimeout(r, 600))
  const focoDepois = await frame.evaluate(() => ({ id: document.activeElement && (document.activeElement.id || document.activeElement.tagName), valor: document.getElementById('entrada').value, temFoco: document.hasFocus() }))
  /*
    ⚠️ TAMBÉM INVERTIDO (t197). Até a V19 a extensão REABRIA a barra da direita meio segundo depois
    de alguém a fechar — o que era o comportamento desejado quando a vista Tokens morava lá, e
    virou defeito quando ele mandou a barra não existir assim. O que se cobra agora é o contrário:
    fechada, ela FICA fechada. Quem abre é quem quiser, pelo atalho.
  */
  /*
    ⚠️ O CRITÉRIO PRECISOU MUDAR DE CAMINHO, e a razão é medida. A série acima é colhida com o
    atalho disparado DE DENTRO do iframe da conversa própria (`frame.press`), e ali ele não chega
    ao editor: medido no build `V20-B2`, vinte amostras seguidas com a barra aberta. O critério
    irmão (o cursor continuar na caixa) continua valendo e é colhido do mesmo jeito.
    O que interessa ao `t197` é outra coisa — que NINGUÉM reabra a barra sozinho —, e isso se mede
    fechando pelo editor e observando se ela volta.
  */
  await win.locator('.monaco-workbench').first().press('Control+Alt+B')
  const serie2 = []
  for (let i = 0; i < 20; i++) {
    serie2.push(await win.evaluate(() => { const a = document.getElementById('workbench.parts.auxiliarybar'); const b = a && a.getBoundingClientRect(); return b && b.width > 0 ? 1 : 0 }))
    await new Promise(r => setTimeout(r, 100))
  }
  checar('Ctrl+Alt+B pelo editor: a barra da direita fecha e NÃO volta sozinha (t197)',
    serie2[serie2.length - 1] === 0, serie2.join('') + '  (esperado terminar em 0)')
  checar('⛔ Ctrl+Alt+B com o cursor na caixa: o cursor continua na caixa, com o texto', focoAntes === 'entrada' && focoDepois.id === 'entrada' && focoDepois.temFoco && focoDepois.valor === 'abc',
    JSON.stringify({ focoAntes, focoDepois }))
} catch (e) {
  checar('a suite rodou ate o fim', false, e && e.message)
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: res.length, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
