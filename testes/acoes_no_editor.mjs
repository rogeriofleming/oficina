// AS AÇÕES DO EDITOR, DENTRO DO EDITOR DE VERDADE — a fumaça de cada uma.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE, se `testes/acoes.mjs` já prova o texto de cada pedido.
//
// Porque o que `acoes.mjs` prova é a FUNÇÃO que monta o texto. Entre ela e a pessoa há uma
// fila inteira de coisas que só existem dentro do editor: o comando estar registrado, o menu
// aparecer com seleção, a seleção virar contexto, o painel abrir se estiver fechado, e o
// pedido esperar a tela subir antes de ser entregue. Cada uma dessas pode quebrar sozinha, e
// nenhuma delas aparece no teste de motor.
//
// O critério da versão é "cada ação tem teste de fumaça". É este arquivo.
//
// ⚠️ ELE GASTA — pouco, mas gasta: cada ação manda uma mensagem de verdade ao agente. Por
// isso o teste PARA a resposta assim que confirma que o pedido saiu: o que se mede aqui é o
// pedido CHEGAR à conversa, não a qualidade da resposta.
//
// Uso:  node testes/acoes_no_editor.mjs [caminho do executavel] [--foto]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, abrirPaleta, abrirArquivo, selecaoDoEditor, extensaoForaDeSincronia } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const RAIZ = process.env.OFICINA_BUILD || path.join(os.tmpdir(), 'oficina')
const requerer = createRequire(import.meta.url)
const acoes = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'acoes.js'))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 190) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
}

// O arquivo que a pessoa vai selecionar. Pequeno de propósito: o que se mede é o caminho, e
// um arquivo grande só faria o agente gastar mais para dizer a mesma coisa.
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-acoes-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
const ALVO = 'conta.js'
fs.writeFileSync(path.join(projeto, ALVO),
  'function somar(a, b) {\n' +
  '  return a + b\n' +
  '}\n' +
  '\n' +
  'function dividir(a, b) {\n' +
  '  return a / b\n' +
  '}\n')

let app
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(12000)

  /** O frame da nossa webview — reconhecido pelo `#entrada`, que só ela tem. */
  const acharPainel = async () => {
    for (const frame of win.frames()) {
      try { if (await frame.locator('#entrada').count()) return frame } catch { }
    }
    return null
  }

  /** O que está escrito nas falas da PESSOA dentro do painel. */
  const falasDeVoce = async () => {
    const frame = await acharPainel()
    if (!frame) return []
    return await frame.evaluate(() =>
      [...document.querySelectorAll('.fala.de-voce')].map(e => e.textContent || ''))
  }

  /**
   * Abre o arquivo e seleciona o corpo da primeira função. Devolve o que MEDIU, não um `void`:
   * quem chama precisa saber se o arquivo abriu e se sobrou seleção, porque sem uma das duas
   * todo critério seguinte reprova por um passo que o teste não deu.
   *
   * ⚠️ Até 12/09/2026 esta função abria a paleta de COMANDOS (`Ctrl+Shift+P`) e digitava o nome
   * do arquivo — que ali vira busca de comando, dá "No matching commands" e não abre nada.
   * Quem abre arquivo é `abrirArquivo` (`Ctrl+P`), em `comum.mjs`, com a medição junto.
   */
  const abrirEselecionar = async () => {
    const aberto = await abrirArquivo(win, respirar, ALVO)
    // Seleciona da linha 1 à 3 (a função `somar` inteira) por tecla, e não por clique: clique
    // depende de posição de pixel, que muda com fonte e tema.
    await win.keyboard.press('Control+Home')
    await respirar(400)
    for (let i = 0; i < 3; i++) { await win.keyboard.press('Shift+ArrowDown'); await respirar(120) }
    await respirar(600)
    return { aberto, selecao: await selecaoDoEditor(win) }
  }

  const partida = await abrirEselecionar()
  checar('o arquivo abriu no editor', partida.aberto.abriu && partida.aberto.texto.includes('function somar'),
    !partida.aberto.abriu ? 'nenhum editor na tela'
      : partida.aberto.texto.includes('function somar') ? `aba "${partida.aberto.aba}"`
        : `aba "${partida.aberto.aba}", mas o codigo nao estava na tela: "${partida.aberto.texto.slice(0, 60)}"`)
  // ⚠️ CRITÉRIO SEPARADO, de propósito: "há editor na tela" não é "há seleção". A extensão
  // recusa em silêncio quando não há trecho selecionado (só escreve na barra de status), e
  // sem este critério a falha chegaria como "o pedido não chegou", culpando o produto.
  checar('e há um trecho SELECIONADO nele', partida.selecao.caracteres > 0 && partida.selecao.pedacosDesenhados > 0,
    partida.selecao.status || 'a barra de status não mostra seleção')

  // ── cada ação, uma por vez ────────────────────────────────────────────────
  //
  // ⚠️ "perguntar" fica de fora deste laço porque ela abre uma caixa de texto antes de
  // mandar — o caminho dela é medido logo abaixo, à parte.
  const PRONTAS = acoes.ACOES.filter(a => !a.pergunta)
  checar('há três ações que mandam direto (sem caixa de texto)', PRONTAS.length === 3,
    PRONTAS.map(a => a.id).join(', '))

  for (const acao of PRONTAS) {
    const antes = (await falasDeVoce()).length
    // A volta anterior mexeu na tela (o painel veio para a frente). Se a seleção não sobreviveu,
    // o vermelho tem que dizer ISSO, e não "o pedido não chegou".
    const deVez = await selecaoDoEditor(win)
    checar(`antes de "${acao.rotulo}": a seleção está de pé`, deVez.caracteres > 0,
      deVez.status || 'sem seleção na barra de status')

    await abrirPaleta(win, respirar)
    // ⚠️ `abrirPaleta` já deixa a paleta no modo comando (o `>` vem pronto na caixa): digitar
    // `>` de novo procuraria um comando cujo nome começa com `>`.
    await win.keyboard.type(acao.rotulo)
    await respirar(1800)
    const item = win.locator('.quick-input-list .monaco-list-row', { hasText: acao.rotulo })
      .filter({ hasNotText: 'Ask in Chat' }).first()
    const achou = await item.count() > 0
    checar(`a ação "${acao.rotulo}" existe na paleta`, achou)
    if (!achou) { await win.keyboard.press('Escape'); continue }
    await item.click()

    // O painel abre (se estava fechado) e o pedido espera a tela subir.
    let falas = []
    for (let i = 0; i < 30; i++) {
      await respirar(1000)
      falas = await falasDeVoce()
      if (falas.length > antes) break
    }
    const nova = falas[falas.length - 1] || ''
    checar(`"${acao.rotulo}": o pedido chegou à conversa`, falas.length > antes,
      falas.length > antes ? `${falas.length} fala(s)` : 'nenhuma fala nova em 30 s')
    if (falas.length > antes) {
      checar(`"${acao.rotulo}": o pedido leva o código selecionado`, nova.includes('function somar'),
        nova.slice(0, 120))
      checar(`"${acao.rotulo}": o pedido leva o endereço do arquivo`, nova.includes(ALVO),
        nova.split('\n')[0])
      checar(`"${acao.rotulo}": o pedido leva a instrução desta ação`,
        nova.includes(acao.instrucao.slice(0, 40)), acao.instrucao.slice(0, 40))
    }

    // ⚠️ PARAR a resposta: o que se mede é o pedido ter saído. Deixar o agente responder
    // três vezes só encareceria a corrida sem medir nada a mais.
    const frame = await acharPainel()
    if (frame) {
      try { await frame.locator('#parar').click({ timeout: 2000 }) } catch { }
    }
    await respirar(2500)
    // Volta o foco ao editor e refaz a seleção para a próxima ação.
    await abrirEselecionar()
  }

  // ── a ação que pergunta antes ─────────────────────────────────────────────
  {
    const antes = (await falasDeVoce()).length
    await abrirPaleta(win, respirar)
    await win.keyboard.type('>Perguntar sobre a seleção')
    await respirar(1800)
    const item = win.locator('.quick-input-list .monaco-list-row', { hasText: 'Perguntar sobre a seleção' })
      .filter({ hasNotText: 'Ask in Chat' }).first()
    const achou = await item.count() > 0
    checar('a ação "Perguntar sobre a seleção" existe na paleta', achou)
    if (achou) {
      await item.click()
      await respirar(2500)
      // A caixa de texto do próprio editor: digitar a pergunta e confirmar.
      const caixa = win.locator('.quick-input-widget .quick-input-box input').first()
      // ⚠️ `count() > 0` NÃO serve aqui, e isso foi medido em 12/09/2026: depois que a paleta é
      // aberta uma vez, o widget FICA no DOM com `display: none`. O critério ficava verde com a
      // caixa fechada — media o vazio. Visibilidade é o que distingue as duas coisas.
      const abriu = await caixa.isVisible().catch(() => false)
      checar('perguntar abre a caixa para a pessoa escrever', abriu,
        abriu ? 'visível' : 'o campo existe no DOM, mas escondido (ou nem isso)')
      if (abriu) {
        await caixa.fill('isto trata divisão por zero?')
        await win.keyboard.press('Enter')
        let falas = []
        for (let i = 0; i < 30; i++) {
          await respirar(1000)
          falas = await falasDeVoce()
          if (falas.length > antes) break
        }
        const nova = falas[falas.length - 1] || ''
        checar('"Perguntar": o pedido chegou à conversa', falas.length > antes,
          falas.length > antes ? `${falas.length} fala(s)` : 'nenhuma fala nova em 30 s')
        checar('"Perguntar": a pergunta da pessoa vai LITERAL no pedido',
          nova.includes('isto trata divisão por zero?'), nova.slice(-120))
        checar('"Perguntar": e o código selecionado vai junto', nova.includes('function somar'))
      }
      const frame = await acharPainel()
      if (frame) { try { await frame.locator('#parar').click({ timeout: 2000 }) } catch { } }
      await respirar(2000)
    }
  }

  // ── os botões em cima da função (CodeLens) ────────────────────────────────
  {
    await abrirEselecionar()
    await respirar(4000)
    const nasFuncoes = await win.evaluate(() =>
      [...document.querySelectorAll('.codelens-decoration a')].map(e => e.textContent.trim()).filter(Boolean))
    checar('os botões aparecem em cima das funções', nasFuncoes.length > 0,
      nasFuncoes.length ? nasFuncoes.join(' · ') : 'nenhum botão de função na tela')
    checar('e eles são "Explicar" e "Gerar teste"',
      nasFuncoes.includes('Explicar') && nasFuncoes.includes('Gerar teste'),
      nasFuncoes.join(' · '))
    // ⚠️ Duas funções no arquivo, dois botões em cada: o provedor tem que achar as DUAS.
    checar('cada função do arquivo tem os seus (2 funções × 2 botões)', nasFuncoes.length >= 4,
      `${nasFuncoes.length} botão(ões)`)
  }

  // ── o CLIQUE no botão da função, e não só a aparência dele ───────────────
  //
  // ⚠️ Achado por revisão independente em 12/09/2026: até aqui a suíte media que o botão
  // APARECE, nunca que clicar nele faz a coisa certa. E o botão tem uma ligação própria, que
  // nenhum outro caminho exercita: ele manda a FAIXA da função e o NOME dela, em vez de usar
  // a seleção. Se essa ligação quebrasse, tudo continuaria verde.
  //
  // Por isso o clique é no botão da SEGUNDA função (`dividir`), com a seleção em cima da
  // PRIMEIRA (`somar`): se o pedido vier falando de `somar`, o botão usou a seleção em vez da
  // função em que se clicou — e o critério acusa exatamente isso.
  {
    const antes = (await falasDeVoce()).length
    const botoes = win.locator('.codelens-decoration a', { hasText: 'Explicar' })
    const quantos = await botoes.count()
    checar('há um botão "Explicar" por função para clicar', quantos >= 2, `${quantos} botão(ões)`)
    if (quantos >= 2) {
      await botoes.nth(1).click()   // a SEGUNDA função do arquivo: `dividir`
      let falas = []
      for (let i = 0; i < 30; i++) {
        await respirar(1000)
        falas = await falasDeVoce()
        if (falas.length > antes) break
      }
      const nova = falas[falas.length - 1] || ''
      checar('o clique no botão da função chegou à conversa', falas.length > antes,
        falas.length > antes ? `${falas.length} fala(s)` : 'nenhuma fala nova em 30 s')
      checar('e o pedido fala da função em que se clicou (`dividir`)', nova.includes('dividir'),
        nova.slice(0, 120))
      // ⛔ CONTROLE: a seleção estava em `somar`. Se ela tivesse ganhado do botão, o pedido
      // traria o corpo de `somar` — e este critério, e só ele, pegaria a troca.
      checar('⛔ CONTROLE: o botão GANHOU da seleção (o pedido não é sobre `somar`)',
        !nova.includes('function somar'), nova.slice(0, 120))
      const frame = await acharPainel()
      if (frame) { try { await frame.locator('#parar').click({ timeout: 2000 }) } catch { } }
      await respirar(2500)
    }
  }

  // ── o ATALHO DE TECLADO ────────────────────────────────────────
  //
  // ⚠️ "Atalhos configuráveis" é uma das quatro promessas escritas desta versão, e não tinha
  // teste nenhum — achado pela mesma revisão. A suíte inteira ia pela paleta: apagar a seção
  // `keybindings` do manifesto deixaria os dois placares batendo, sem mudar uma linha.
  {
    await abrirEselecionar()
    const antes = (await falasDeVoce()).length
    // A tecla vai para o WORKBENCH, como em `abrirPaleta`: pela página ela seria da webview.
    await win.locator('.monaco-workbench').first().press('Control+Alt+E')
    let falas = []
    for (let i = 0; i < 30; i++) {
      await respirar(1000)
      falas = await falasDeVoce()
      if (falas.length > antes) break
    }
    const nova = falas[falas.length - 1] || ''
    checar('o atalho de teclado (ctrl+alt+e) chegou à conversa', falas.length > antes,
      falas.length > antes ? `${falas.length} fala(s)` : 'nenhuma fala nova em 30 s')
    checar('e o pedido do atalho leva o código selecionado', nova.includes('function somar'),
      nova.slice(0, 120))
    const frame = await acharPainel()
    if (frame) { try { await frame.locator('#parar').click({ timeout: 2000 }) } catch { } }
    await respirar(2000)
  }

  if (process.argv.includes('--foto')) {
    try { fs.mkdirSync(path.join(RAIZ, 'log'), { recursive: true }) } catch { }
    const destino = path.join(RAIZ, 'log', `acoes_no_editor_${Date.now()}.png`)
    await win.screenshot({ path: destino, animations: 'disabled' })
    console.log('foto: ' + destino)
  }
} catch (e) {
  checar('execucao sem excecao', false, String(e && e.message || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: res.length, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
