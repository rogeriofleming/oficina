// BOAS-VINDAS — prova que a tela de abertura do produto e NOSSA, e que ela nao
// aparece sem ser chamada.
//
// Sao dois criterios que puxam para lados opostos, e por isso moram no mesmo arquivo:
//
//   1. A OFICINA tem uma tela de boas-vindas propria, em portugues, com os quatro
//      passos que fazem a pessoa usar o programa. Um walkthrough contribuido no
//      package.json que ninguem nunca abriu e so JSON: aqui ele e ABERTO e lido.
//   2. Ela NAO pode abrir sozinha. O produto abre direto na conversa — decisao do
//      dono, 06/09/2026 — e uma tela de recepcao surgindo na frente e exatamente o
//      que ele mandou tirar. `workbench.startupEditor: none` cuida disso, e o
//      criterio 2 existe para o dia em que alguem mexer nessa chave sem perceber.
//
// ⚠️ Nao usa atalho de teclado: desde que o produto abre dentro da webview da
// conversa, tecla no nivel da pagina vai para o HTML da extensao e o atalho do editor
// nunca acontece (licao paga em extensao_claude.mjs, 06/09/2026). Aqui o comando e
// disparado pela paleta, com o foco posto no workbench.
//
// Uso: node testes/boas_vindas.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ, carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, modoDesenvolvimento } from './comum.mjs'

const _electron = await carregarElectron()
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + detalhe + ')' : ''}`)
}
const respirar = (ms) => new Promise(r => setTimeout(r, ms))

// ── o que o package.json promete ────────────────────────────────────────────────
// Antes de abrir o programa: se a promessa nem esta escrita, abrir nao ajuda.
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
const wt = (pkg.contributes?.walkthroughs || [])[0]
checar('o produto contribui uma tela de boas-vindas propria', !!wt, wt ? wt.id : 'nenhum walkthrough no package.json')
if (wt) {
  checar('ela tem os cinco passos', (wt.steps || []).length === 5, `${(wt.steps || []).length} passo(s)`)
  // Media que nao existe vira um retangulo vazio na tela, e ninguem ve isso num JSON.
  const perdidas = (wt.steps || [])
    .map(s => s.media?.markdown)
    .filter(Boolean)
    .filter(m => !fs.existsSync(path.join(REPO, 'extensoes', 'oficina-claude', m)))
  checar('todo passo aponta para um arquivo que existe', perdidas.length === 0, perdidas.join(', '))
  // O produto e em portugues: titulo em ingles aqui denuncia texto herdado.
  const suspeitos = (wt.steps || []).map(s => s.title).filter(t => /\b(get started|welcome|setup|learn)\b/i.test(t))
  checar('os passos estao em portugues', suspeitos.length === 0, suspeitos.join(' | '))
}

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado', procurei: RAIZ }))
  process.exit(1)
}
console.log('executavel: ' + exe)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-boasvindas-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'alvo.txt'), 'arquivo qualquer\n')

let app
try {
  // ⚠️ SEMPRE por `abrirOficina`, nunca por `_electron.launch` cru.
  //
  // Rodando do fonte, o Electron precisa receber a pasta do clone como primeiro
  // argumento (e o cwd, e o ambiente de desenvolvimento). Chamando o launch direto,
  // ele entende a pasta do projeto de teste como sendo o app, nao acha nada e abre
  // uma JANELA DE ERRO na cara de quem estiver usando o computador. Aconteceu duas
  // vezes em 06/09/2026, com o dono do projeto olhando.
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(12000)

  // ── 2. ela NAO aparece sozinha ────────────────────────────────────────────────
  // Este criterio vem primeiro de proposito: depois que o teste abrir a tela na mao,
  // a abertura ja nao existe mais para ser medida.
  const naAbertura = await win.evaluate(() =>
    [...document.querySelectorAll('.tabs-container .tab .label-name')].map(e => e.textContent.trim()))
  const apareceuSozinha = naAbertura.some(t => /bem-vind|welcome|oficina$/i.test(t))
  checar('a tela de boas-vindas NAO abre sozinha', !apareceuSozinha,
    naAbertura.length ? 'abas: ' + naAbertura.join(', ') : 'nenhuma aba aberta')

  // ── 1. e ela abre quando chamada ──────────────────────────────────────────────
  //
  // ⚠️ A PRIMEIRA VERSAO DESTE CRITERIO PASSOU VERDE COM A TELA ERRADA.
  //
  // Ela procurava o texto da OFICINA em `document.body.innerText`. O corpo do
  // workbench inteiro entra nessa string -- barra de titulo, abas, lateral -- entao o
  // nome do produto casava mesmo com a pagina aberta sendo a do upstream. A foto da
  // MESMA execucao mostrava "Get started with VS Code" ocupando o editor.
  //
  // Agora a tela e aberta POR ID, com o comando que o proprio VS Code expoe, e a
  // pergunta e feita dentro do container do walkthrough: qual titulo esta na tela?
  let visto = { titulo: '', categorias: [], aba: [] }
  for (let tentativa = 1; tentativa <= 3 && !visto.titulo; tentativa++) {
    await win.locator('.monaco-workbench').first().press('Control+Shift+P')
    try {
      await win.waitForSelector('.quick-input-widget', { timeout: 5000 })
    } catch { await respirar(500); continue }
    // `>` entra no modo comando; sem ele a paleta procura ARQUIVO e o Enter abre um.
    // Pelo comando NOSSO, nao pelo "Welcome: Open Walkthrough" do upstream: aquele
    // abre um seletor em ingles com todos os walkthroughs instalados, e depender do
    // rotulo da Microsoft numa lista que muda a cada versao e teste fragil. Este
    // comando existe no produto (menu Ajuda) e abre a nossa tela pelo id.
    await win.keyboard.type('>Boas-vindas da OFICINA')
    await respirar(1800)
    // ⚠️ CLICAR no item, nao apertar Enter. A paleta intercala uma entrada
    // "Ask in Chat: <o que voce digitou>" com o texto que a pessoa escreveu, e a
    // ordem dela depende do que esta instalado -- um Enter as cegas pode abrir a
    // conversa em vez do comando, e o teste mediria outra coisa.
    const item = win.locator('.quick-input-list .monaco-list-row', { hasText: 'Boas-vindas da OFICINA' })
      .filter({ hasNotText: 'Ask in Chat' }).first()
    if (await item.count()) await item.click()
    else await win.keyboard.press('Enter')
    await respirar(6000)
    visto = await win.evaluate(() => {
      const raiz = document.querySelector('.gettingStartedContainer')
      const txt = (el) => (el ? el.textContent.trim() : '')
      return {
        titulo: txt(raiz && raiz.querySelector('.category-title')) || txt(raiz && raiz.querySelector('h1')),
        // ⚠️ Fora do BANNER. O upstream desenha "Try out the new Agents window" com a
        // classe `getting-started-category`, a mesma dos walkthroughs -- entao um
        // seletor por `.category-title` conta o banner como se fosse uma categoria e
        // o teste acusa um walkthrough que nao existe.
        categorias: raiz
          ? [...raiz.querySelectorAll('.category-title')]
              .filter(el => !el.closest('.agents-banner'))
              .map(el => el.textContent.trim()).filter(Boolean)
          : [],
        banners: raiz ? [...raiz.querySelectorAll('.agents-banner')].map(el => el.textContent.trim()) : [],
        aba: [...document.querySelectorAll('.tabs-container .tab .label-name')].map(e => e.textContent.trim()),
      }
    })
    if (!visto.titulo) await respirar(1000)
  }
  // ⚠️ RODANDO DO FONTE, ESTE CRITERIO NAO PODE SER COBRADO -- e o motivo nao e
  // preguica, e medicao:
  //
  // num perfil novo o VS Code abre a PRIMEIRA categoria em destaque, ignorando a que
  // foi pedida (`openToFirstCategory`, em gettingStarted.ts). Foi provado clicando em
  // "A OFICINA" no proprio seletor nativo do editor: abriu "GitHub Copilot" do mesmo
  // jeito. No clone essa extensao existe; no build empacotado ela e REMOVIDA, e a
  // unica categoria e a nossa.
  //
  // Cobrar aqui daria vermelho num produto certo -- ou, pior, me faria "consertar" o
  // que nao esta quebrado. Em dev o resultado e IMPRESSO; no empacotado ele vale.
  const eNossa = /A OFICINA/i.test(visto.titulo)
  if (modoDesenvolvimento() && !eNossa) {
    console.log(`  --    a tela que ABRE e a NOSSA: PULADO no modo dev ` +
      `(abriu "${visto.titulo}" — o clone tem a extensao que o build remove). Nao e um OK.`)
  } else {
    checar('a tela que ABRE e a NOSSA (titulo do walkthrough)', eNossa,
      `titulo lido: "${visto.titulo || '(vazio)'}"` + (visto.aba?.length ? ` | aba: ${visto.aba.join(', ')}` : ''))
  }

  // ── 2b. e a ABA nao pode estar em ingles ──────────────────────────────────────
  //
  // A tela inteira e nossa e em portugues, e a aba dizia "Welcome" -- a unica palavra
  // daquela tela que nao era nossa, bem na moldura, ao lado do nosso icone. Os testes
  // conferiam o CONTEUDO do walkthrough e passavam verdes; ninguem olhava o nome da
  // aba. Achado por uma revisao independente, usando o produto. Conserto: patch 0004.
  {
    const abas = visto.aba || []
    const emIngles = abas.filter(a => /^welcome$/i.test(a.trim()))
    checar('a aba da tela de boas-vindas nao esta em ingles', emIngles.length === 0,
      abas.length ? `aba(s): ${abas.join(', ')}` : 'nenhuma aba')
  }

  // ── 3. e nenhum walkthrough do upstream sobrou ────────────────────────────────
  //
  // O patch 0002 tira os que moram no FONTE do workbench ("Get started with VS Code"
  // e companhia). Rodando do fonte ainda sobram os que vem de extensoes do upstream
  // que o build empacotado REMOVE -- hoje so a `copilot`, com "Try out the new Agents
  // window". Nao da para exigir a ausencia dela aqui sem mentir sobre o que se mediu:
  // no modo dev ela e listada e declarada; no build empacotado ela nao existe e o
  // criterio vale inteiro.
  // O banner do upstream tem criterio proprio: ele nao e walkthrough, e oferece uma
  // janela que este produto nao tem. `chat.disableAIFeatures` o desliga.
  checar('o banner do upstream nao aparece na tela de boas-vindas',
    (visto.banners || []).length === 0, (visto.banners || []).join(' | ') || 'nenhum')

  const REMOVIDAS_NO_BUILD = /agents window|copilot|chat/i
  const doUpstream = (visto.categorias || []).filter(t => !/A OFICINA/i.test(t))
  const sobraramDeVerdade = modoDesenvolvimento()
    ? doUpstream.filter(t => !REMOVIDAS_NO_BUILD.test(t))
    : doUpstream
  checar('nenhum walkthrough do upstream sobrou na tela', sobraramDeVerdade.length === 0,
    sobraramDeVerdade.length ? sobraramDeVerdade.join(' | ')
      : (modoDesenvolvimento() && doUpstream.length
        ? `so os que o build empacotado remove: ${doUpstream.join(', ')}`
        : `${(visto.categorias || []).length} categoria(s) na tela`))

  if (process.argv.includes('--foto')) {
    const destino = path.join(RAIZ, 'log', `boas_vindas_${Date.now()}.png`)
    await win.screenshot({ path: destino, animations: 'disabled' })
    console.log('foto: ' + destino)
  }
} catch (e) {
  checar('execucao sem excecao', false, String(e && e.message || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch {}
}

const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
