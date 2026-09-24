// RETRATO DO PAINEL — screenshots para o olho humano (e para a revisao visual).
//
// Não é teste: não tem critério e não reprova nada. Existe porque um painel que passa
// em 12 critérios técnicos ainda pode estar feio, apertado ou ilegível — e nenhum
// `checar()` deste projeto responde isso.
//
// Tira o retrato nos DOIS temas, porque a paleta da V1 tem dois e um deles é sempre o
// esquecido.
//
// Uso:  node testes/retrato_painel.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const exe = acharExe(process.argv[2])
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

// ⚠️ DENTRO DO PRÓPRIO REPOSITÓRIO, e configurável por variável.
//
// A primeira versão gravava em uma pasta fora do proprio repositorio — dois
// problemas num só, achados por uma revisao independente em 10/09/2026: (a) este arquivo vive no
// repositório que vira PÚBLICO, e o caminho declarava o nome e a posição do repositório
// privado; (b) quem clonasse a OFICINA e rodasse o script criaria uma pasta nova FORA
// do clone dele, sem aviso. Script de repositório público não escreve acima da própria
// raiz.
const saida = process.env.OFICINA_RETRATOS || path.join(REPO, 'retratos')
fs.mkdirSync(saida, { recursive: true })

const respirar = ms => new Promise(r => setTimeout(r, ms))
const projeto = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-retrato-'))
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'projeto de teste\n', 'utf8')

// A cena 3 fotografa o modo que pula aprovação ligado — e ele só existe com a
// configuração ligada (desde 10/09/2026). Ligada no perfil descartável do retrato.
fs.mkdirSync(path.join(projeto, 'dados', 'User'), { recursive: true })
fs.writeFileSync(path.join(projeto, 'dados', 'User', 'settings.json'),
  JSON.stringify({ 'oficina.permitirPularAprovacao': true }, null, 2), 'utf8')

const _electron = await carregarElectron()
const app = await abrirOficina(_electron, { exe, projeto, area: projeto })

try {
  const pagina = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await pagina.waitForLoadState('domcontentloaded')
  await pagina.setViewportSize({ width: 1280, height: 860 })

  // Achar o frame do painel.
  let frame = null
  const fim = Date.now() + 60000
  while (Date.now() < fim && !frame) {
    for (const f of pagina.frames()) {
      try { if (await f.evaluate(() => !!document.getElementById('entrada'))) { frame = f; break } } catch { }
    }
    if (!frame) await respirar(400)
  }
  if (!frame) throw new Error('o painel nao abriu')
  await respirar(4000)

  // 1. A tela como ela nasce.
  //
  // ⚠️ O e-mail da conta é trocado por um fictício ANTES da foto. O retrato fica num
  // repositório (o privado, mas ainda assim versionado), e a primeira versão deste
  // arquivo gravou o e-mail real de quem rodou. Screenshot é documento: o que não
  // entraria num laudo também não entra num PNG.
  await frame.evaluate(() => {
    const c = document.getElementById('conta')
    if (c && c.textContent.includes('@')) c.textContent = 'voce@exemplo.com'
  })
  await respirar(300)
  await pagina.screenshot({ path: path.join(saida, '1-abertura.png') })
  console.log('  1-abertura.png')

  // 2. Com conversa: uma fala de cada lado, uma ferramenta e um pedido de permissão.
  //
  // ⚠️ Encenado NA TELA, sem chamar o agente. O retrato é da INTERFACE — usar a API de
  // verdade custaria dinheiro e daria uma tela diferente a cada corrida, o que é ruim
  // justamente para comparar antes/depois.
  // ⚠️ A FALA DO USUÁRIO É INJETADA NO DOM, e o botão "Enviar" NÃO é clicado.
  //
  // A primeira versão deste retrato clicava em Enviar — e mandou uma mensagem DE
  // VERDADE ao agente, na conta de quem rodou. O retrato saiu com a resposta real por
  // cima da cena encenada (inclusive um cursor piscando que eu quase registrei como
  // defeito visual). Retrato de interface não conversa com a API: custa dinheiro e dá
  // uma foto diferente a cada corrida, que é o oposto do que serve para comparar.
  await frame.evaluate(() => {
    window.postMessage({ tipo: 'pronto', modelo: 'claude-opus-5', modo: 'default' }, '*')
    window.postMessage({ tipo: 'conta', conta: { email: 'voce@exemplo.com', assinatura: 'Claude Max' } }, '*')
    const vazio = document.getElementById('vazio')
    if (vazio) vazio.remove()
    const fala = document.createElement('div')
    fala.className = 'fala de-voce'
    fala.textContent = 'arruma o cabeçalho do relatorio.md e me diz o que mudou'
    document.getElementById('conversa').appendChild(fala)
  })
  await respirar(400)
  await frame.evaluate(() => {
    for (const t of ['Olhei o ', 'relatorio.md', ': o título estava em duas linhas ',
      'porque havia um espaço a mais. Já corrijo.']) {
      window.postMessage({ tipo: 'texto', texto: t }, '*')
    }
    window.postMessage({ tipo: 'ferramenta', nome: 'Read', entrada: { file_path: 'relatorio.md' } }, '*')
    window.postMessage({
      tipo: 'permissao', pedido: {
        id: 'p1', ferramenta: 'Edit', frase: 'Alterar o arquivo relatorio.md',
        detalhe: 'Tira o espaço a mais do título, na primeira linha.',
        entrada: { file_path: 'relatorio.md', new_string: '# Relatório de setembro' },
      }
    }, '*')
    window.postMessage({ tipo: 'estado', estado: 'esperando_permissao' }, '*')
    window.postMessage({ tipo: 'fim', custoUsd: 0.0184 }, '*')
  })
  await respirar(1200)
  await pagina.screenshot({ path: path.join(saida, '2-conversa-com-permissao.png') })
  console.log('  2-conversa-com-permissao.png')

  // 3. O modo sem freio ligado — o aviso tem que gritar.
  await frame.evaluate(() => {
    const sel = document.getElementById('modo')
    sel.value = 'bypassPermissions'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await respirar(800)
  await pagina.screenshot({ path: path.join(saida, '3-modo-sem-freio.png') })
  console.log('  3-modo-sem-freio.png')

  // 4. O tema CLARO, que é o que ninguém olha.
  await pagina.evaluate(() => { }) // no-op para garantir foco na página
  await pagina.locator('.monaco-workbench').first().press('Control+Shift+P')
  await respirar(1500)
  await pagina.keyboard.type('>Color Theme')
  await respirar(1500)
  const item = pagina.locator('.quick-input-list .monaco-list-row', { hasText: 'Color Theme' }).first()
  if (await item.count()) {
    await item.click()
    await respirar(1200)
    // ⚠️ DIGITAR O NOME, e não procurar na lista. A lista de temas é VIRTUALIZADA: só as
    // linhas visíveis existem no DOM, e com as dezenas de temas do upstream o nosso fica
    // abaixo da dobra. Nas corridas de 10/09/2026 (tarde e noite) o retrato do claro NUNCA
    // saiu — "nao achei OFICINA Claro na lista" — e o tema estava lá o tempo todo, com esse
    // rótulo exato no package.json da extensão de temas. Hipótese, não medição: a próxima
    // corrida confirma ou derruba.
    await pagina.keyboard.type('OFICINA Claro')
    await respirar(1000)
    const claro = pagina.locator('.quick-input-list .monaco-list-row', { hasText: 'OFICINA Claro' }).first()
    if (await claro.count()) {
      await claro.click()
      await respirar(2500)
      await pagina.screenshot({ path: path.join(saida, '4-tema-claro.png') })
      console.log('  4-tema-claro.png')
    } else {
      console.log('  (nao achei "OFICINA Claro" na lista de temas — sem retrato do claro)')
      await pagina.keyboard.press('Escape')
    }
  } else {
    console.log('  (nao achei o seletor de tema — sem retrato do claro)')
    await pagina.keyboard.press('Escape')
  }

  console.log('\nretratos em: ' + path.resolve(saida))
} finally {
  await fecharApp(app)
  try { fs.rmSync(projeto, { recursive: true, force: true }) } catch { }
}
