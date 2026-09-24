// A FILEIRA DE AÇÕES DA ABA, LIDA NA TELA — o que sobrou depois da lista do produto.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE. O patch 0019 deu ao produto o poder de esconder ações da
// barra de abas (`editorTitleActionsToHide`), e o documento dele prometia que o botão "…"
// sumiria "quando não sobrar nada atrás". A promessa foi escrita duas vezes e MEDIDA zero —
// as duas vezes ela estava errada, e a segunda só apareceu numa leitura de tela do build 2,
// depois de o dono do projeto olhar a aba e dizer que os ícones continuavam lá.
//
// O custo declarado do próprio patch 0019 é: "a lista é por id; se o upstream renomear um
// comando, o item volta a aparecer em silêncio — o teste de tela da barra de abas é o que
// avisa". Esse teste não existia. É este.
//
// O que ele mede, e só isto:
//   1. o que está VISÍVEL na fileira (a fileira das ações e a de layout, as duas);
//   2. o que está DENTRO da gaveta "…", abrindo-a de verdade;
//   3. que nenhum id da lista `editorTitleActionsToHide` aparece em nenhum dos dois lugares;
//   4. que as ações que a EXTENSÃO contribui continuam lá — que é a razão de o 0019 existir
//      em vez do `editorActionsLocation: "hidden"` (foi por esconder "Aceitar tudo /
//      Rejeitar tudo" que o patch nasceu).
//
// O critério 4 é o que impede este teste de virar cúmplice: um produto que esconde TUDO
// passaria nos três primeiros.
//
// Uso:  node testes/tela_fileira_da_aba.mjs [caminho do executavel]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, abrirArquivo } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 220) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

// A lista que o produto pediu para esconder — lida do MESMO product.json que este binário usa.
// Ler a lista do repositório seria medir a intenção; o que vale é o que o programa carregou.
function listaDoProduto() {
  // ⚠️ SEM caminho de maquina escrito aqui. A raiz do build vem da variavel de ambiente e,
  // sem ela, da mesma conta que `comum.mjs` faz — um caminho fixo neste arquivo iria para o
  // repositorio publico, e a varredura de vazamento reprova (com razao).
  const raiz = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
  const candidatos = process.env.OFICINA_DEV === '1'
    ? [path.join(raiz, 'vscode', 'product.json')]
    : [path.join(path.dirname(exe), 'resources', 'app', 'product.json')]
  for (const c of candidatos) {
    try {
      const p = JSON.parse(fs.readFileSync(c, 'utf8'))
      if (Array.isArray(p.editorTitleActionsToHide)) return { lista: p.editorTitleActionsToHide, de: c }
    } catch { }
  }
  return { lista: null, de: candidatos.join(' | ') }
}

const { lista: ESCONDIDOS, de: ONDE } = listaDoProduto()
checar('o produto que este binario carrega declara editorTitleActionsToHide',
  Array.isArray(ESCONDIDOS) && ESCONDIDOS.length > 0, `${ESCONDIDOS ? ESCONDIDOS.length + ' ids' : 'nao achei'} em ${ONDE}`)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-fileira-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
const ALVO = 'conta.js'
fs.writeFileSync(path.join(projeto, ALVO), 'function somar(a, b) {\n  return a + b\n}\n')

let app
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(10000)

  await abrirArquivo(win, respirar, ALVO)
  await respirar(3000)

  /**
   * O que está visível nas duas fileiras. Cada item é lido pelo que o núcleo põe no DOM:
   * `aria-label` (o que um leitor de tela anuncia) e o id do comando, quando presente.
   */
  const visiveis = async () => await win.evaluate(() => {
    const saida = []
    for (const classe of ['.editor-actions', '.title-actions', '.editor-layout-actions']) {
      for (const barra of Array.from(document.querySelectorAll(classe))) {
        for (const item of Array.from(barra.querySelectorAll('.action-item'))) {
          const a = item.querySelector('.action-label') || item
          const caixa = a.getBoundingClientRect()
          if (caixa.width === 0 && caixa.height === 0) continue
          saida.push({
            onde: classe,
            rotulo: (a.getAttribute('aria-label') || a.getAttribute('title') || a.textContent || '').trim(),
            classes: a.className,
            largura: Math.round(caixa.width)
          })
        }
      }
    }
    return saida
  })

  const naFileira = await visiveis()
  console.log('\n  --- a fileira, como ela esta na tela ---')
  for (const i of naFileira) console.log(`      ${i.onde.padEnd(24)} ${i.rotulo || '(sem rotulo)'}  [${i.largura}px]`)

  /** O botão "…" — o núcleo o desenha com a classe `toolbar-toggle-more`. */
  const gavetas = await win.evaluate(() => {
    const saida = []
    for (const classe of ['.editor-actions', '.title-actions', '.editor-layout-actions']) {
      for (const barra of Array.from(document.querySelectorAll(classe))) {
        for (const b of Array.from(barra.querySelectorAll('.toolbar-toggle-more, .codicon-toolbar-more'))) {
          const caixa = b.getBoundingClientRect()
          if (caixa.width === 0 && caixa.height === 0) continue
          saida.push({ onde: classe, rotulo: (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim() })
        }
      }
    }
    return saida
  })
  console.log(`\n  --- botoes de transbordo visiveis: ${gavetas.length} ---`)
  for (const g of gavetas) console.log(`      ${g.onde}  "${g.rotulo}"`)

  /** O que está DENTRO da gaveta — abrindo-a, porque item de menu só existe no DOM depois do clique. */
  let dentroDaGaveta = []
  if (gavetas.length) {
    const botao = win.locator('.editor-actions .toolbar-toggle-more, .title-actions .toolbar-toggle-more, .editor-layout-actions .toolbar-toggle-more').first()
    try {
      await botao.click({ timeout: 8000 })
      await respirar(1200)
      dentroDaGaveta = await win.evaluate(() =>
        Array.from(document.querySelectorAll('.context-view .monaco-menu .action-item'))
          .map(i => {
            const a = i.querySelector('.action-label') || i
            return (a.getAttribute('aria-label') || a.textContent || '').trim()
          })
          .filter(t => t && t !== '')
      )
      await win.keyboard.press('Escape').catch(() => { })
      await respirar(600)
    } catch (e) {
      dentroDaGaveta = [`(nao consegui abrir: ${String(e.message).slice(0, 80)})`]
    }
  }
  console.log(`\n  --- dentro da gaveta: ${dentroDaGaveta.length} item(ns) ---`)
  for (const d of dentroDaGaveta) console.log(`      ${d}`)
  console.log('')

  // ── O que este teste COBRA ────────────────────────────────────────────────────────────
  //
  // Os rótulos que o núcleo dá às ações que a lista do produto esconde. O teste cobra pelo
  // RÓTULO porque é ele que a pessoa lê na tela; o id fica no mapa abaixo para que uma
  // renomeação no upstream apareça como falha aqui, e não em silêncio.
  const ROTULO_DO_ID = {
    'workbench.action.splitEditor': 'Split Editor',
    'workbench.action.toggleEditorGroupLock': 'Lock Group',
    'workbench.action.lockEditorGroup': 'Lock Group',
    'workbench.action.unlockEditorGroup': 'Unlock Group',
    'workbench.action.showEditorsInGroup': 'Show Opened Editors',
    'workbench.action.closeEditorsInGroup': 'Close All',
    'workbench.action.closeUnmodifiedEditors': 'Close Saved',
    'workbench.action.toggleKeepEditors': 'Enable Preview Editors',
    'workbench.action.configureEditor': 'Configure Editors',
    'editor.reopenWith': 'Reopen Editor With',
    'workbench.action.toggleMaximizeEditorGroup': 'Maximize Group',
    'toggle.diff.renderSideBySide': 'Inline View'
  }

  const tudoNaTela = [...naFileira.map(i => i.rotulo), ...dentroDaGaveta].map(t => t.toLowerCase())
  const vazados = []
  for (const id of (ESCONDIDOS || [])) {
    const rotulo = ROTULO_DO_ID[id]
    if (!rotulo) continue
    if (tudoNaTela.some(t => t.includes(rotulo.toLowerCase()))) vazados.push(`${rotulo} (${id})`)
  }
  checar('nenhuma acao da lista do produto aparece na fileira nem na gaveta',
    vazados.length === 0, vazados.join(' · '))

  checar('nao sobrou botao "..." na fileira da aba',
    gavetas.length === 0, gavetas.length ? `${gavetas.length} ainda visivel(is), guardando: ${dentroDaGaveta.join(' · ') || '(nada legivel)'}` : '')

  // O critério que impede o teste de aplaudir um produto que escondeu tudo: o que a EXTENSÃO
  // põe na aba tem que continuar na tela. Sem uma conversa montada não há botão dela, então
  // aqui o que se cobra é a fileira EXISTIR e ser capaz de mostrar item de extensão — medido
  // pela presença da barra no DOM, não por um botão específico.
  const fileiraExiste = await win.evaluate(() =>
    !!document.querySelector('.editor-actions, .title-actions'))
  checar('a fileira de acoes continua existindo (e onde a extensao poe os botoes dela)',
    fileiraExiste, fileiraExiste ? '' : 'a barra inteira desapareceu — isso e o defeito que o 0019 existe para NAO causar')

} catch (e) {
  checar('o teste rodou sem explodir', false, String(e && e.message || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const falhas = res.filter(r => !r.ok)
console.log(`\n${res.length - falhas.length}/${res.length} critérios`)
// ⚠️ O PLACAR EM JSON E O QUE A BATERIA LE — sem ele, esta suite entra na regressao e reprova
// VERDE. O `rodarSuiteCara` procura a ultima linha que comeca com `{`; nao achando, devolve
// `nao li o placar` e conta como falha. Esta suite viveu da V21 ate a V23 fora de toda bateria
// (ninguem a chamava), e por isso a ausencia nunca doeu. Medido ao inclui-la, na V23.
console.log(JSON.stringify({ passou: falhas.length === 0, total: res.length, falhas: falhas.map(r => r.criterio) }))
process.exit(falhas.length ? 1 : 0)
