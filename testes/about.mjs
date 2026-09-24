// O "Sobre" — a tela onde a identidade do produto aparece por extenso pro usuario.
//
// ⚠️ Este teste nasceu de uma pendencia duma revisao independente do ciclo da V0
// (05/09/2026): ela tentou conferir o "Help: About" pela paleta e nao achou dialogo
// nenhum no DOM, e registrou honestamente "nao consegui verificar". Estava certa em
// nao concluir: o "Sobre" do editor NAO e HTML. O core o monta em
// `createNativeAboutDialogDetails` e entrega a `dialog.showMessageBox` do Electron —
// uma janela do proprio Windows. O Playwright dirige o conteudo web e nunca vai
// enxergar aquilo. Um teste que so olhe o DOM diria "nao abriu" com o dialogo aberto
// na frente dele.
//
// Por isso aqui sao DOIS instrumentos: o playwright abre o programa e dispara o
// comando; a automacao de interface do Windows (ler_janelas.ps1) le a janela nativa.
//
// Uso: node testes/about.mjs [caminho do exe]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

import { carregarElectron, acharExe, lerCarimbo, ambienteLimpo, argumentosDeTeste, esconderJanela, abrirPaleta } from './comum.mjs'
import { MARCAS_PROIBIDAS } from '../scripts/identidade.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const _electron = await carregarElectron()

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 300) + ')' : ''}`)
}

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado' }))
  process.exit(1)
}

// Mesma lei do resto da casa: o teste tem que saber QUAL build esta na mao.
const carimbo = lerCarimbo(exe)
const modo = process.argv.includes('--linha-de-base') ? 'puro'
  : process.argv.includes('--oficina') ? 'oficina'
    : carimbo?.modo
if (!modo) {
  console.log(JSON.stringify({
    passou: false,
    erro: 'este build nao tem carimbo (oficina-build.json) e ninguem disse o que ele deveria ser',
    oQueFazer: 'recompile pelo construir.bat, ou rode com --oficina / --linha-de-base'
  }))
  process.exit(1)
}

// O nome que o dialogo DEVE mostrar sai do product.json DESTE build — nunca chutado.
let nomeLongo = ''
try {
  nomeLongo = JSON.parse(fs.readFileSync(
    path.join(path.dirname(exe), 'resources', 'app', 'product.json'), 'utf8')).nameLong || ''
} catch { /* fica vazio e reprova abaixo */ }
checar('o build informa o proprio nome longo', !!nomeLongo, nomeLongo)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-about-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'alvo.txt'), 'x\n')

let app
try {
  app = await _electron.launch({
    executablePath: exe,
    env: ambienteLimpo(),
    args: argumentosDeTeste(projeto, area),
    timeout: 120000
  })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })

  // ⚠️ QUEM e o dono da janela? Nao e o PID que o playwright entrega — e tambem NAO
  // se descobre pelo titulo.
  //
  // `app.process().pid` e o processo que o playwright lancou. Medido em 05/09/2026:
  // esse processo NAO possui janela nenhuma na area de trabalho — nem a principal. O
  // Electron do VS Code reexecuta a si mesmo, e quem desenha (e quem cria o dialogo
  // nativo) e um descendente. Filtrar pelo PID direto devolve lista vazia SEMPRE, e o
  // teste concluiria "o Sobre nao abriu" sem nunca ter olhado no lugar certo —
  // vermelho pelo motivo errado, que e tao ruim quanto verde pelo motivo errado.
  //
  // A primeira versao deste teste resolveu isso pelo TITULO da janela. A revisao final do
  // ciclo derrubou com medicao: rodou dois `about.mjs` ao mesmo tempo e os DOIS
  // resolveram o mesmo processo — um reprovou olhando a janela do outro, e o outro
  // passou lendo uma janela que podia nao ser a dele. Titulo nao identifica
  // instancia: duas rodadas do mesmo teste tem titulo identico por construcao.
  //
  // O laco que nao confunde instancia e a ARVORE DE PROCESSOS: o ler_janelas.ps1 sobe
  // de pai para filho a partir do processo que ESTE teste lancou, e so devolve janela
  // de dentro dessa arvore.
  const pidRaiz = app.process().pid
  const lerJanelas = (alvo, soTitulos) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(AQUI, 'ler_janelas.ps1'), '-ProcessoRaiz', String(alvo)]
    if (soTitulos) args.push('-SoTitulos')
    let bruto = ''
    try { bruto = execFileSync('powershell', args, { encoding: 'utf8', timeout: 30000 }) }
    catch (e) { bruto = (e.stdout || '') }
    try {
      const j = JSON.parse(bruto || '[]')
      // `flat()` porque o PowerShell ja devolveu [[{...}]] uma vez, e o teste seguiu
      // verde lendo "uma janela" com todos os campos undefined. E `j.pid` porque a
      // unica prova de que a leitura veio inteira e o campo estar la.
      return (Array.isArray(j) ? j.flat(3) : [j]).filter(x => x && x.pid !== undefined)
    } catch { return [] }
  }

  const minhasJanelas = lerJanelas(pidRaiz, false)
  checar('achei a janela do programa que EU lancei (pela arvore de processos)',
    minhasJanelas.length > 0,
    minhasJanelas.map(j => `[pid ${j.pid}] ${j.classe}`).join(', ') ||
      `nenhuma janela na arvore do processo ${pidRaiz}`)

  // Paleta de comandos -> "About". `--locale=en` esta fixado em argumentosDeTeste,
  // entao o nome do comando e estavel.
  // ⚠️ `abrirPaleta` e nao `keyboard.press`: desde a V2 ha SEMPRE uma webview com
  // foco na abertura (o painel da conversa), e a tecla no nivel da pagina ia parar
  // dentro do HTML dela. Foi exatamente o que aconteceu em 10/09/2026 — e estava
  // previsto por escrito no fim do registro da V1.
  const respirar = ms => new Promise(r => setTimeout(r, ms))
  if (!await abrirPaleta(win, respirar)) throw new Error('a paleta de comandos nao abriu em 8 tentativas')
  await win.keyboard.type('Help: About')

  // ⚠️ Nao apertar Enter as cegas. A paleta ordena por uso recente e por casamento
  // difuso: o primeiro item pode ser outro comando, e o teste concluiria "o Sobre nao
  // abriu" tendo aberto outra coisa. Espera o item exato, IMPRIME qual escolheu, e
  // clica nele.
  const item = win.locator('.quick-input-list .monaco-list-row', { hasText: /About/i }).first()
  await item.waitFor({ timeout: 15000 })
  const rotulo = ((await item.textContent()) || '').trim()
  console.log('  info  item escolhido na paleta: ' + rotulo)
  await item.click()

  // ⚠️ O DIALOGO, e nao a janela que o contem.
  //
  // A primeira versao juntava todo o texto da janela de topo e procurava ali. O
  // revisao final mostrou o estrago: aquele texto comeca pelo TITULO da janela principal
  // (`projeto - OFICINA`) e engloba o workbench inteiro — entao "o Sobre mostra o
  // nome do produto" passava pelo titulo, e o "Sobre" podia nao dizer o nome nenhuma
  // vez. A assercao tinha o nome de uma coisa e o alcance de outra.
  //
  // Agora o ler_janelas.ps1 devolve os dialogos (janelas FILHAS) separados, e tudo o
  // que se afirma sobre o "Sobre" e medido SO no texto dele.
  //
  // A janela nativa nao aparece instantaneamente, e nao ha evento no DOM para
  // esperar (e o ponto deste teste). Tenta ler por ate 15 s.
  let dialogo = null
  const ate = Date.now() + 15000
  while (Date.now() < ate && !dialogo) {
    for (const j of lerJanelas(pidRaiz, false)) {
      // O dialogo se distingue por trazer o texto do "Sobre": a chave `Version:` nao
      // e traduzida no corpo, em idioma nenhum.
      const achado = (j.dialogos || []).find(d => (d.textos || []).some(t => /Version:/i.test(t)))
      if (achado) { dialogo = achado; break }
    }
    if (!dialogo) await new Promise(r => setTimeout(r, 1000))
  }

  // Fracassou? Diz ONDE olhou, em vez de so declarar ausencia. So classe e pid —
  // nunca o conteudo nem o titulo das janelas de quem esta no computador.
  if (!dialogo) {
    console.log(`  info  procurei na arvore do processo ${pidRaiz}. Janelas na area de trabalho agora: ` +
      lerJanelas(0, true).map(j => `[pid ${j.pid}] ${j.classe}`).join(', '))
  }

  checar('o dialogo "Sobre" abre de verdade (janela nativa do Windows)', !!dialogo,
    dialogo ? dialogo.classe : 'nenhuma janela da minha arvore trouxe o texto do Sobre em 15 s')

  if (dialogo) {
    // SO o texto do dialogo. Nada do editor entra aqui.
    const corpo = (dialogo.textos || []).join('\n')
    console.log('  info  corpo do dialogo:\n' + corpo.split('\n').map(l => '        ' + l).join('\n'))

    if (modo === 'puro') {
      console.log('  nota  build de LINHA DE BASE: identidade propria nao se aplica')
    } else {
      checar('o CORPO do "Sobre" traz o nome do produto',
        !!nomeLongo && corpo.includes(nomeLongo), nomeLongo)

      // ⚠️ ISTO ERA UMA NOTA, E VIROU CRITERIO — porque o diagnostico estava errado.
      //
      // O corpo anunciava `@github/copilot: 1.0.81-0` e `@github/copilot-sdk: 1.0.11`,
      // e o projeto registrou isso como "heranca do upstream, decisao de identidade da
      // V1". Nao era heranca inevitavel: sao duas linhas ESCRITAS no template do
      // dialogo (`dialog.ts`), com a versao vinda de uma chave que o EMPACOTAMENTO
      // carimba de volta (`build/gulpfile.vscode.ts:342`) depois de o nosso
      // `__remover` a ter tirado. Ou seja, era um defeito com causa localizada, e a
      // nota fez o projeto conviver com ele por versoes inteiras.
      //
      // Alem de nao ser nosso, o dado era FALSO: a OFICINA nao embute nenhum dos dois
      // (o build remove as extensoes de terceiro e o produto desliga o chat do
      // upstream). Conserto: patch 0005. Este criterio e o que impede a volta.
      const linhasDeTerceiro = corpo.split('\n').filter(l => /copilot/i.test(l))
      checar('o corpo do "Sobre" nao anuncia produto de terceiro que a OFICINA nao embute',
        linhasDeTerceiro.length === 0,
        linhasDeTerceiro.map(l => l.trim()).join(' | ') || 'nenhuma linha de terceiro')

      // A marca alheia e cobrada no CORPO do dialogo — que e o que ninguem conferia.
      // O titulo da janela ja e cobrado duas vezes pela fumaca; repetir ali seria
      // fingir cobertura nova.
      const sujoNoCorpo = MARCAS_PROIBIDAS.filter(m => new RegExp(m, 'i').test(corpo))
      checar('o corpo do "Sobre" nao carrega marca alheia', sujoNoCorpo.length === 0,
        sujoNoCorpo.join(', ') || 'nenhuma das marcas da lista')
    }

    // Fecha o dialogo para nao deixar janela pendurada na tela de quem rodou.
    await win.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 500))
  }
} finally {
  try { await app?.close() } catch { /* ja fechou */ }
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* some no proximo boot */ }
}

const falhas = resultados.filter(r => !r.ok)
console.log('\n' + JSON.stringify({ passou: falhas.length === 0, falhas: falhas.map(f => f.nome) }))
process.exit(falhas.length ? 1 : 0)
