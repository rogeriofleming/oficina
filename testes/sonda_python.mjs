// SONDA PYTHON — mede, dentro de UM editor, o que o servidor de linguagem Python
// entrega no arquivo de prova. Roda um lado por vez e salva o resultado em JSON.
//
// Por que existe: o plano manda escrever a tabela "Pylance × BasedPyright"
// TESTANDO, e o roteiro original pedia para olhar a tela e anotar. Olhar a tela
// funciona uma vez; não funciona daqui a seis meses, quando alguém subir de versão
// e precisar saber se algo piorou. O que esta sonda vê fica em arquivo, com o texto
// exato que apareceu — e pode ser rodada de novo.
//
// ⚠️ O que ela NÃO faz: julgar. Ela colhe o que cada lado mostrou. A coluna "perda"
// da tabela é leitura humana em cima dos dois JSON.
//
// ── Por que por CDP, e não pelo `_electron.launch` que a fumaça usa ──────────
// O VS Code oficial NÃO se deixa dirigir pelo launch do playwright: ele se relança
// e o playwright perde o processo ("Target page, context or browser has been
// closed", medido em 05/09/2026). O caminho que serve aos DOIS lados é o depurador
// remoto — e usar o mesmo instrumento nos dois é o que torna a comparação justa.
// Este é o plano B por CDP que a §11 do plano previa, aplicado onde ele era mesmo
// necessário.
//
// Uso:
//   node testes/sonda_python.mjs <apelido> <caminho do exe> <pasta de extensoes>
//
// Saída: %OFICINA_BUILD%\comparacao\<apelido>.json

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { RAIZ, ambienteLimpo } from './comum.mjs'

const [apelido, exe, extensoesDir] = process.argv.slice(2)
if (!apelido || !exe || !extensoesDir) {
  console.error('uso: node testes/sonda_python.mjs <apelido> <exe> <pasta de extensoes>')
  process.exit(2)
}
if (!fs.existsSync(exe)) { console.error('nao achei o executavel: ' + exe); process.exit(2) }
if (!fs.existsSync(extensoesDir)) { console.error('nao achei a pasta de extensoes: ' + extensoesDir); process.exit(2) }

// fileURLToPath, nao URL().pathname: o caminho desta casa tem espaco, e o pathname
// devolveria "%20" no meio — arquivo que nao existe, erro que aponta para o lugar errado.
const AMOSTRA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'python_amostra.py')

// Uma porta por apelido. ⚠️ A versao anterior usava so o PRIMEIRO caractere
// (`apelido.charCodeAt(0)`): `pylance`, `pylance-standard` e `pylance-fonte-normal`
// caiam todos na mesma porta, e `basedpyright` com `basedpyright-standard` idem — ou
// seja, justamente as rodadas que a gente quer comparar nao podiam coexistir. O hash
// abaixo usa o apelido inteiro.
const PORTA = 9333 + ([...apelido].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 4000, 7) % 400)

async function carregarChromium() {
  const tentativas = []
  if (process.env.OFICINA_PLAYWRIGHT) {
    const base = process.env.OFICINA_PLAYWRIGHT
    tentativas.push(base.endsWith('.mjs') ? base : path.join(base, 'index.mjs'))
  }
  tentativas.push('playwright-core')
  for (const t of tentativas) {
    try {
      const mod = await import(path.isAbsolute(t) ? 'file:///' + t.replace(/\\/g, '/') : t)
      if (mod.chromium) return mod.chromium
    } catch { /* proximo */ }
  }
  throw new Error('nao achei o playwright-core (veja OFICINA_PLAYWRIGHT)')
}
const chromium = await carregarChromium()

// Área descartável com uma CÓPIA da amostra: o editor pode reformatar, e o original
// do repositório não pode mudar por causa de um teste.
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-python-'))
// O nome da pasta carrega a marca unica desta area: e assim que se prova, depois,
// que a janela encontrada e a desta rodada e nao a sobra de outra.
const projeto = path.join(area, 'projeto-' + path.basename(area))
fs.mkdirSync(projeto)
fs.copyFileSync(AMOSTRA, path.join(projeto, 'amostra.py'))

// ⚠️ Os dois lados recebem o MESMO interpretador Python, escrito no projeto.
//
// Sem isto o Pylance fica 150 s sem emitir um unico diagnostico (ele depende do
// interpretador selecionado) enquanto o BasedPyright analisa normalmente (traz o
// proprio verificador). A comparacao mediria a configuracao do teste, nao os dois
// servidores. O caminho vem de OFICINA_PYTHON ou do `python` que estiver no PATH.
function acharPython() {
  if (process.env.OFICINA_PYTHON) return process.env.OFICINA_PYTHON
  try {
    return execFileSync('python', ['-c', 'import sys; print(sys.executable)'],
      { encoding: 'utf8', timeout: 20000 }).trim()
  } catch { return '' }
}
const PYTHON = acharPython()
fs.mkdirSync(path.join(projeto, '.vscode'))
fs.writeFileSync(path.join(projeto, '.vscode', 'settings.json'), JSON.stringify({
  'python.defaultInterpreterPath': PYTHON,
  'python.terminal.activateEnvironment': false
}, null, 2))

// ⚠️ O arquivo inteiro precisa CABER na tela.
//
// O Monaco so mantem no DOM as linhas visiveis: procurar `.view-line` por um texto
// que esta 40 linhas abaixo devolve zero elementos, e a medicao vira "SEM HOVER" —
// como se o editor nao tivesse o recurso. A primeira solucao foi navegar por Ctrl+F,
// e ela ESTRAGOU o arquivo quando o foco nao estava no editor (Ctrl+A + digitacao
// sobrescreveram tudo). Fonte pequena resolve o mesmo problema sem tocar no teclado.
//
// O painel lateral direito sai junto: o VS Code oficial abre o Chat ali e a OFICINA
// nao tem Chat nenhum — deixar ligado daria menos espaco de editor a um lado so.
const dados = path.join(area, 'dados')
fs.mkdirSync(path.join(dados, 'User'), { recursive: true })
// OFICINA_SETTINGS_EXTRA (JSON) entra por cima: e assim que se mede o MESMO lado
// com configuracao diferente — a pergunta da coluna "COMO TER IGUAL" da tabela.
let extra = {}
if (process.env.OFICINA_SETTINGS_EXTRA) {
  try { extra = JSON.parse(process.env.OFICINA_SETTINGS_EXTRA) }
  catch (e) { console.error('OFICINA_SETTINGS_EXTRA nao e JSON valido: ' + e.message); process.exit(2) }
}
const configuracao = {
  'editor.fontSize': 6,
  'editor.lineHeight': 8,
  'editor.minimap.enabled': false,
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'workbench.startupEditor': 'none',
  'window.zoomLevel': -1,
  'security.workspace.trust.enabled': false,
  ...extra
}
fs.writeFileSync(path.join(dados, 'User', 'settings.json'), JSON.stringify(configuracao, null, 2))

const achado = { apelido, exe, quando: new Date().toISOString(), recursos: {} }
const anotar = (chave, valor) => {
  achado.recursos[chave] = valor
  const resumo = typeof valor === 'string' ? valor : JSON.stringify(valor)
  console.log(`  ${chave.padEnd(30)} ${resumo.slice(0, 160)}`)
}
const respirar = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Encerra SÓ os processos deste teste.
 *
 * ⚠️ Lei da casa: nunca matar processo por nome — a máquina não é só do teste. O
 * filtro é o caminho da área temporária (única, criada agora) na linha de comando:
 * nenhum processo de quem está no computador pode conter esse caminho. Se o editor
 * se relançou e o filho original morreu, é assim que a janela órfã é fechada em vez
 * de ficar aberta na tela de alguém.
 */
function encerrarOsMeus() {
  try {
    // O filtro e o NOME da pasta temporaria (unico, criado agora), nao o caminho:
    // em `-like` do PowerShell a barra invertida nao e escape, e dobrar as barras
    // fazia o padrao nao casar com nada — as janelas ficavam abertas na tela de
    // quem estava no computador. O proprio powershell da consulta e excluido, senao
    // ele casa com a propria linha de comando.
    const marca = path.basename(area)
    const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -ne 'powershell.exe' -and $_.CommandLine -like '*${marca}*' } | Select-Object -ExpandProperty ProcessId`
    const saida = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 30000 })
    const pids = saida.split(/\s+/).map(s => s.trim()).filter(Boolean)
    for (const pid of pids) {
      try { execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' }) } catch { /* ja saiu */ }
    }
    return pids.length
  } catch { return -1 }
}

/**
 * A porta do depurador precisa estar LIVRE antes de lancar.
 *
 * ⚠️ Sem esta checagem a sonda mede o editor errado: a porta e fixa por apelido, e
 * se uma janela de uma rodada anterior ainda estiver viva, `connectOverCDP` conecta
 * NELA — instantaneamente, com outra pasta aberta — e o resultado parece perfeito.
 * Aconteceu em 05/09/2026; o sintoma foi "conexao_em_s: 0.1".
 */
async function portaOcupada(porta) {
  try {
    const c = await fetch('http://127.0.0.1:' + porta + '/json/version', { signal: AbortSignal.timeout(2500) })
    return c.ok
  } catch { return false }
}

let navegador, filho, win
try {
  if (await portaOcupada(PORTA)) {
    throw new Error(`a porta ${PORTA} ja esta atendendo — ha um editor aberto de uma rodada anterior. ` +
      'Feche-o (ou encerre o processo dele) antes de medir: conectar nele mediria o editor errado.')
  }
  filho = spawn(exe, [
    projeto,
    '--user-data-dir=' + dados,
    '--extensions-dir=' + extensoesDir,
    '--remote-debugging-port=' + PORTA,
    '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
    '--disable-updates', '--no-sandbox'
  ], { env: ambienteLimpo(), detached: true, stdio: 'ignore' })
  filho.unref()

  // Esperar o depurador remoto atender. Ele só existe depois que a janela nasce.
  const t0conexao = Date.now()
  while (!navegador && Date.now() - t0conexao < 90000) {
    try { navegador = await chromium.connectOverCDP('http://127.0.0.1:' + PORTA, { timeout: 5000 }) }
    catch { await respirar(1500) }
  }
  if (!navegador) throw new Error('o depurador remoto nao atendeu na porta ' + PORTA)

  // A janela do workbench é a página que tem o .monaco-workbench. (Há outras: o
  // processo compartilhado, por exemplo.)
  win = null
  const t0janela = Date.now()
  while (!win && Date.now() - t0janela < 90000) {
    for (const ctx of navegador.contexts()) {
      for (const p of ctx.pages()) {
        try { if (await p.$('.monaco-workbench')) { win = p; break } } catch { /* pagina indo embora */ }
      }
      if (win) break
    }
    if (!win) await respirar(1500)
  }
  if (!win) throw new Error('nao achei a janela do workbench')

  // Provar que esta janela e a DESTA rodada, e nao uma sobra de outra: o titulo do
  // documento carrega o nome da pasta aberta, que aqui e sempre 'projeto' dentro de
  // uma area temporaria unica. Medicao sem essa prova nao vale — ja mediu errado.
  // ⚠️ Esta prova ja foi um NO-OP e ninguem percebeu: ela aceitava a janela se o
  // titulo contivesse "projeto" — e TODA rodada abre uma pasta chamada `projeto`, de
  // modo que a condicao nunca era falsa. O comentario dizia "medicao sem essa prova
  // nao vale" enquanto a prova nao provava nada. Agora a pasta do projeto carrega a
  // marca unica da area, e ela e exigida sem alternativa.
  const marcaDaArea = path.basename(area)
  const daMinhaRodada = await win.evaluate(() => document.title + ' | ' + (window.location?.href || ''))
  if (!daMinhaRodada.includes(marcaDaArea)) {
    throw new Error(`a janela encontrada NAO e a desta rodada (esperava "${marcaDaArea}" no titulo): ` +
      daMinhaRodada.slice(0, 140))
  }
  anotar('janela_conferida', daMinhaRodada.slice(0, 120))
  anotar('conexao_em_s', +((Date.now() - t0conexao) / 1000).toFixed(1))
  anotar('configuracao_extra', extra)
  anotar('python_do_teste', PYTHON || 'NENHUM — o resultado abaixo nao compara os dois lados')
  anotar('extensoes_na_pasta', fs.readdirSync(extensoesDir).filter(n => !n.startsWith('.') && !n.endsWith('.json')))

  // Abrir o arquivo pelo explorador.
  await win.waitForSelector('.explorer-folders-view', { timeout: 60000 })
  await win.locator('.explorer-item .label-name', { hasText: 'amostra.py' }).first().dblclick()
  await win.waitForSelector('.monaco-editor', { timeout: 30000 })

  // Que aba esta na frente, e quantas linhas o editor renderizou? Se o arquivo nem
  // abriu, todo o resto da medicao e ruido — e melhor saber disso aqui.
  anotar('aba_ativa', await win.evaluate(() => {
    const t = document.querySelector('.tabs-container .tab.active .label-name')
    return (t ? t.textContent.trim() : '(nenhuma)') +
      ' | linhas renderizadas: ' + document.querySelectorAll('.monaco-editor .view-line').length
  }))
  anotar('avisos_na_tela', await win.evaluate(() =>
    [...document.querySelectorAll('.notification-toast, .monaco-dialog-box')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 200))))

  // O servidor de linguagem demora a subir. Esperar pelo PRIMEIRO sinal de análise
  // em vez de dormir um número fixo de segundos.
  const t0analise = Date.now()
  let analisou = false
  while (Date.now() - t0analise < 150000 && !analisou) {
    analisou = await win.evaluate(() =>
      document.querySelectorAll('.monaco-editor .inlay-hint').length > 0 ||
      document.querySelectorAll('.monaco-editor .squiggly-error, .monaco-editor .squiggly-warning').length > 0)
    if (!analisou) await respirar(2000)
  }
  anotar('analise_comecou_em_s', analisou ? +((Date.now() - t0analise) / 1000).toFixed(1) : 'NAO ANALISOU em 150s')
  await respirar(4000)   // deixar a primeira leva de diagnósticos assentar

  // ── 1. dicas de tipo embutidas ────────────────────────────────────────────
  // O seletor procura QUALQUER classe com "inlay": o nome exato do elemento ja mudou
  // entre versoes do Monaco, e um seletor velho devolveria zero — que a tabela leria
  // como "este servidor nao tem dicas embutidas".
  const dicas = await win.evaluate(() =>
    [...document.querySelectorAll('.monaco-editor [class*="inlay"]')].map(e => e.textContent.trim()).filter(Boolean))
  anotar('1_inlay_hints', { quantas: dicas.length, amostra: dicas.slice(0, 12) })

  // ── 5 e 6. o que foi acusado, com mensagem, severidade e de QUEM veio ──────
  // O painel de problemas é a única superfície onde a mensagem inteira e a origem
  // aparecem escritas — a squiggle sozinha só diz que existe algo errado.
  await win.keyboard.press('Control+Shift+M')
  await respirar(5000)
  const problemas = await win.evaluate(() =>
    [...document.querySelectorAll('.markers-panel .monaco-list-row, .markers-table-container .monaco-table-row, .markers-panel-container .monaco-list-row')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean))
  anotar('5_6_problemas', problemas)
  await win.keyboard.press('Control+Shift+M')

  // ── 9. destaque semântico ─────────────────────────────────────────────────
  // Sem tokens semânticos, parâmetro e variável local saem com a MESMA cor. A conta
  // é de classes de cor distintas nas linhas do bloco 9 — não do bonito, do
  // diferente. (Os dois lados abrem no tema padrão.)
  const cores = await win.evaluate(() => {
    const alvo = [...document.querySelectorAll('.monaco-editor .view-line')]
      .filter(l => /parametro|local/.test(l.textContent || ''))
    const classes = new Set()
    for (const l of alvo) for (const s of l.querySelectorAll('span[class*="mtk"]')) classes.add(s.className)
    return { linhas_vistas: alvo.length, classes: [...classes] }
  })
  anotar('9_destaque_semantico', cores)

  // ── 2 e 4. hover: docstring e estreitamento de tipo ───────────────────────
  const hover = async (palavra, dentroDaLinhaQueContem) => {
    try {
      const alvo = win.locator('.monaco-editor .view-line', { hasText: dentroDaLinhaQueContem }).first()
      await alvo.scrollIntoViewIfNeeded({ timeout: 8000 })
      await alvo.locator(`span:text-is("${palavra}")`).first().hover({ timeout: 8000 })
      await win.waitForSelector('.monaco-hover .hover-contents', { timeout: 12000 })
      await respirar(800)
      const txt = await win.evaluate(() =>
        [...document.querySelectorAll('.monaco-hover .hover-contents')]
          .map(h => h.textContent.replace(/\s+/g, ' ').trim()).join(' ⟂ '))
      await win.keyboard.press('Escape')
      return txt
    } catch (e) { return 'SEM HOVER (' + String(e).split('\n')[0].slice(0, 90) + ')' }
  }
  anotar('2_hover_docstring', await hover('dobrar', 'def dobrar'))
  anotar('4_estreitamento_dentro_do_if', await hover('x', 'return len(x)'))
  anotar('4_estreitamento_na_assinatura', await hover('x', 'def tamanho'))

  // ── 3. ir para a definição dentro da biblioteca padrão ────────────────────
  let definicao = 'NAO FOI'
  try {
    const linha = win.locator('.monaco-editor .view-line', { hasText: 'Path.cwd()' }).first()
    await linha.locator('span:text-is("Path")').first().click({ timeout: 8000 })
    await win.keyboard.press('F12')
    await respirar(5000)
    definicao = await win.evaluate(() => {
      const aba = document.querySelector('.tabs-container .tab.active .label-name')
      return aba ? aba.textContent.trim() : '(sem aba ativa)'
    })
  } catch (e) { definicao = 'NAO FOI (' + String(e).split('\n')[0].slice(0, 70) + ')' }
  anotar('3_ir_para_definicao', definicao)

  // Voltar para a amostra antes das próximas sondas.
  try {
    await win.locator('.tabs-container .tab .label-name', { hasText: 'amostra.py' }).first().click({ timeout: 8000 })
    await respirar(1500)
  } catch { /* segue */ }

  // ── 8. ações de código (extrair método/variável) ──────────────────────────
  let acoes = []
  try {
    const linha = win.locator('.monaco-editor .view-line', { hasText: '(a * 2 + b * 3)' }).first()
    await linha.click({ timeout: 8000 })
    await win.keyboard.press('Home')
    await win.keyboard.down('Shift'); await win.keyboard.press('End'); await win.keyboard.up('Shift')
    await win.keyboard.press('Control+.')
    await respirar(4000)
    acoes = await win.evaluate(() =>
      [...document.querySelectorAll('.action-widget .action-item, .action-widget .monaco-list-row, .context-view .action-item')]
        .map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean))
    await win.keyboard.press('Escape')
  } catch (e) { acoes = ['SEM ACOES (' + String(e).split('\n')[0].slice(0, 70) + ')'] }
  anotar('8_acoes_de_codigo', acoes)

  // ── 10. o comando "Organize Imports" existe, e de quem é? ─────────────────
  let organizar = []
  try {
    await win.keyboard.press('Control+Shift+P')
    await win.waitForSelector('.quick-input-widget', { timeout: 10000 })
    await win.keyboard.type('Organize Imports', { delay: 25 })
    await respirar(2500)
    organizar = await win.evaluate(() =>
      [...document.querySelectorAll('.quick-input-list .monaco-list-row')]
        .map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8))
    await win.keyboard.press('Escape')
  } catch (e) { organizar = ['NAO ABRIU (' + String(e).split('\n')[0].slice(0, 70) + ')'] }
  anotar('10_organizar_imports', organizar)

  // ── 7. import automático ao completar ─────────────────────────────────────
  // Num arquivo NOVO, para não sujar a amostra. O que importa é se a lista de
  // sugestões oferece o auto-import (o VS Code escreve "Auto import" no detalhe).
  let autoImport = []
  try {
    // ⚠️ Num arquivo "Untitled" o VS Code nasce em TEXTO SIMPLES: nenhum servidor de
    // linguagem completa nada ali, e os dois lados devolviam lista vazia — um empate
    // falso. O rascunho e um .py de verdade, criado agora (depois da medicao dos
    // problemas, para nao mudar o que ja foi contado).
    fs.writeFileSync(path.join(projeto, 'rascunho.py'), 'contador = 0\ndatetim\n')
    await respirar(2500)
    await win.locator('.explorer-item .label-name', { hasText: 'rascunho.py' }).first().dblclick()
    await win.waitForSelector('.monaco-editor', { timeout: 20000 })
    await respirar(6000)

    // Dicas embutidas neste arquivo: 'contador = 0' e onde apareceria o ': int'.
    anotar('1_inlay_hints_no_rascunho', await win.evaluate(() =>
      [...document.querySelectorAll('.monaco-editor [class*="inlay"]')].map(e => e.textContent.trim()).filter(Boolean)))

    // Cursor no fim da palavra incompleta, e pedir a lista de sugestoes.
    await win.locator('.monaco-editor .view-line', { hasText: 'datetim' }).first().click()
    await win.keyboard.press('End')
    // Ctrl+Space nao serve aqui: no Windows ele e atalho de TROCA DE IDIOMA de
    // entrada e pode nem chegar ao editor (medido em 05/09/2026: lista vazia dos
    // dois lados, que a tabela leria como "nenhum dos dois completa"). Apagar e
    // redigitar a ultima letra dispara a sugestao pelo caminho normal de quem digita.
    await win.keyboard.press('Backspace')
    await respirar(600)
    await win.keyboard.type('m', { delay: 120 })
    // Esperar a lista APARECER, ate 40 s: o indice de auto-import e construido depois
    // que o servidor sobe, e um numero fixo de segundos mede a velocidade da maquina,
    // nao o recurso. Se em 40 s nao aparecer, a linha da tabela sai como NAO OBSERVADO
    // — nunca como "nao tem".
    const ateAparecer = Date.now()
    while (Date.now() - ateAparecer < 40000) {
      autoImport = await win.evaluate(() =>
        [...document.querySelectorAll('.suggest-widget .monaco-list-row')]
          .map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 10))
      if (autoImport.length) break
      await respirar(2000)
    }
    await win.keyboard.press('Escape')
  } catch (e) { autoImport = ['SEM SUGESTAO (' + String(e).split('\n')[0].slice(0, 70) + ')'] }
  anotar('7_auto_import', autoImport)

  // Cinto de seguranca: se a medicao mexeu no arquivo, TUDO acima e suspeito. Ja
  // aconteceu (05/09/2026) e passou despercebido ate alguem olhar um screenshot.
  const intacto = fs.readFileSync(path.join(projeto, 'amostra.py'), 'utf8') ===
    fs.readFileSync(AMOSTRA, 'utf8')
  anotar('amostra_intacta', intacto ? 'SIM' : 'NAO — a medicao mexeu no arquivo, NAO CONFIE nos numeros acima')
  // O cinto avisava e deixava passar: sair 0 com a amostra corrompida e entregar
  // numeros que nao valem como se valessem.
  if (!intacto) achado.erro = 'a medicao alterou o arquivo de prova'

} catch (e) {
  achado.erro = String(e).split('\n')[0]
  console.log('  ERRO: ' + achado.erro)
} finally {
  // Um retrato do fim, sempre: e a unica evidencia de que a tela estava mesmo no
  // estado que os numeros acima descrevem.
  try {
    if (typeof win !== 'undefined' && win) {
      const destinoImg = path.join(RAIZ, 'comparacao')
      fs.mkdirSync(destinoImg, { recursive: true })
      const img = path.join(destinoImg, apelido + '.png')
      await win.screenshot({ path: img })
      achado.screenshot = img
      console.log('  screenshot: ' + img)
    }
  } catch { /* screenshot e evidencia extra, nunca motivo de falhar */ }
  try { if (navegador) await navegador.close() } catch { /* segue */ }
  const quantos = encerrarOsMeus()
  console.log(`  (encerrados ${quantos} processo(s) deste teste)`)
}

const destino = path.join(RAIZ, 'comparacao')
fs.mkdirSync(destino, { recursive: true })
const arquivo = path.join(destino, apelido + '.json')
fs.writeFileSync(arquivo, JSON.stringify(achado, null, 2))
console.log('\nescrito em ' + arquivo)

try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* a area some no proximo boot */ }
process.exit(achado.erro ? 1 : 0)
