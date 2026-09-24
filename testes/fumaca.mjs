// FUMACA — o teste que toda versao da OFICINA precisa passar antes de existir.
//
// Ele nao le codigo: abre o programa compilado de verdade, como uma pessoa abriria,
// e confere que o basico responde. Um build que passa aqui pode estar feio ou
// incompleto, mas esta VIVO. Um build que falha aqui nao vai para o gate de ninguem.
//
// Uso:  node testes/fumaca.mjs [caminho do exe]
// Sem argumento, procura o build na pasta de trabalho (variavel OFICINA_BUILD).
//
// Alvo de tempo: menos de 2 minutos (criterio 11 do plano).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { RAIZ, carregarElectron, acharExe, lerCarimbo, ambienteLimpo, argumentosDeTeste, esconderJanela, fecharApp } from './comum.mjs'
import { MARCAS_PROIBIDAS } from '../scripts/identidade.mjs'

const _electron = await carregarElectron()
const t0 = Date.now()

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok, detalhe: detalhe ?? '' })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`)
}

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado', procurei: RAIZ }))
  process.exit(1)
}
console.log('executavel: ' + exe)

// ⚠️ QUAL build e este? A pergunta nao pode ser respondida pelo que o programa DIZ.
//
// A pasta de saida tem nome fixo e recebe tanto o build de linha de base quanto o da
// OFICINA. Antes, este teste olhava `app.getName()`: se lesse "Code - OSS", concluia
// "e a linha de base" e DESLIGAVA as duas unicas checagens de identidade — saindo
// verde. Ou seja, o caso em que o build da OFICINA nao aplicou o nosso product.json,
// ou em que sobrou o binario de uma rodada anterior, era exatamente o caso que o
// teste deixava passar. Achado por uma revisao independente em 05/09/2026.
//
// Agora o modo e ENTRADA, nao deducao: vem do carimbo que o build deixou na pasta
// (`oficina-build.json`), ou da flag explicita de quem roda. Sem nenhum dos dois, o
// teste para e diz o que fazer — nao adivinha.
const carimbo = lerCarimbo(exe)
const flagLinhaDeBase = process.argv.includes('--linha-de-base')
const flagOficina = process.argv.includes('--oficina')
let modoEsperado
if (flagLinhaDeBase) modoEsperado = 'puro'
else if (flagOficina) modoEsperado = 'oficina'
else if (carimbo?.modo) modoEsperado = carimbo.modo
else {
  console.log(JSON.stringify({
    passou: false,
    erro: 'este build nao tem carimbo (oficina-build.json) e ninguem disse o que ele deveria ser',
    oQueFazer: 'recompile pelo construir.bat (ele carimba), ou rode com --oficina / --linha-de-base'
  }))
  process.exit(1)
}
console.log(`modo esperado: ${modoEsperado}` +
  (carimbo ? `  (carimbo: tag ${carimbo.tag}, sha ${String(carimbo.sha).slice(0, 12)}, de ${carimbo.quando})`
           : '  (sem carimbo — modo informado na linha de comando)'))

// Area de teste descartavel: o teste NUNCA usa o perfil de quem esta no computador.
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-fumaca-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
const MARCA = 'marca_da_fumaca_' + Date.now()
fs.writeFileSync(path.join(projeto, 'alvo.txt'), MARCA + '\n')

// O porque de limpar o ambiente esta em comum.mjs, junto da funcao - e la que o
// proximo teste que abrir o programa vai encontrar a licao.

let app, erros = []
let emUso = null          // erros vistos ATE o fechamento comecar - e o que conta
const anotar = (txt) => erros.push({ ms: Date.now() - t0, txt })
try {
  app = await _electron.launch({
    executablePath: exe,
    env: ambienteLimpo(),
    args: argumentosDeTeste(projeto, area),
    timeout: 120000
  })

  const win = await app.firstWindow({ timeout: 60000 })

  await esconderJanela(app)
  win.on('pageerror', e => anotar('pageerror: ' + String(e).split('\n')[0]))
  win.on('console', m => { if (m.type() === 'error') anotar('console: ' + m.text().slice(0, 600)) })

  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  checar('a janela principal abriu e o workbench carregou', true)

  const titulo = await win.title()
  const produto = await app.evaluate(({ app }) => ({ nome: app.getName(), versao: app.getVersion() }))

  // O build de linha de base e o upstream sem nada nosso: ali o nome AINDA E o do
  // upstream, por definicao, e cobrar identidade propria dele seria vermelho falso.
  // Mas quem decide isso e o MODO ESPERADO (carimbo/flag), nunca o nome que o
  // programa devolve — senao o teste se desliga sozinho no caso que mais importa.
  if (modoEsperado === 'puro') {
    checar('linha de base: o produto e mesmo o do upstream', /^code - oss$/i.test(produto.nome), produto.nome)
    console.log('  nota  build de LINHA DE BASE: as duas checagens de identidade propria nao se aplicam')
  } else {
    // A lista de marcas mora em scripts/identidade.mjs, que e a mesma que o portao de
    // build usa. Aqui havia dois regex locais que cobriam 2 das 7 marcas — o teste era
    // mais fraco que o portao, e os dois pareciam verdes.
    const sujoNoTitulo = MARCAS_PROIBIDAS.filter(m => new RegExp(m, 'i').test(titulo))
    const sujoNoNome = MARCAS_PROIBIDAS.filter(m => new RegExp(m, 'i').test(produto.nome))
    checar('titulo da janela nao carrega marca alheia', sujoNoTitulo.length === 0,
      sujoNoTitulo.length ? `${titulo} -> ${sujoNoTitulo.join(', ')}` : titulo)
    checar('o programa se identifica com nome proprio', sujoNoNome.length === 0,
      `${produto.nome} ${produto.versao}${sujoNoNome.length ? ' -> ' + sujoNoNome.join(', ') : ''}`)
  }
  console.log(`  info  produto: ${produto.nome} ${produto.versao} | titulo: ${titulo}`)

  // A pasta passada na linha de comando tem que aparecer no explorador.
  await win.waitForSelector('.explorer-folders-view', { timeout: 30000 })
  const temArquivo = await win.locator('.explorer-item .label-name', { hasText: 'alvo.txt' }).count()
  checar('o explorador mostra o arquivo da pasta aberta', temArquivo > 0)

  // Abrir o arquivo e conferir que o conteudo REAL aparece no editor.
  await win.locator('.explorer-item .label-name', { hasText: 'alvo.txt' }).first().dblclick()
  await win.waitForSelector('.monaco-editor', { timeout: 30000 })
  await win.waitForFunction(
    (m) => document.querySelector('.monaco-editor')?.textContent?.includes(m),
    MARCA, { timeout: 30000 }
  )
  checar('o editor abriu o arquivo e mostra o conteudo dele', true)

  // Terminal: existe e responde. Sem terminal, o editor nao serve para trabalhar.
  //
  // O atalho pode se PERDER se o workbench ainda estiver processando a abertura do
  // arquivo: medido em 05/09/2026, 1 falha em 16 rodadas, e o teste esperou os 45 s
  // inteiros por uma tecla que nunca chegou. Esperar mais nao traz de volta o que se
  // perdeu - reenviar traz. Tres tentativas de 15 s no lugar de uma de 45 s: mesmo
  // teto de paciencia, e o que era vermelho intermitente vira verde estavel sem
  // baixar a exigencia (o criterio continua "o terminal tem que abrir").
  // Ctrl+Shift+` CRIA terminal (nao alterna), entao reenviar nunca fecha o que abriu.
  let terminalAbriu = false
  for (let tentativa = 1; tentativa <= 3 && !terminalAbriu; tentativa++) {
    await win.keyboard.press('Control+Shift+`')
    try {
      await win.waitForSelector('.terminal-wrapper, .xterm-screen', { timeout: 15000 })
      terminalAbriu = true
      if (tentativa > 1) console.log(`  nota  o terminal abriu na ${tentativa}a tentativa de atalho`)
    } catch { /* a tecla se perdeu; reenvia */ }
  }
  checar('o terminal integrado abre', terminalAbriu)

  // ⚠️ Abrir nao e responder — e ate 05/09/2026 o criterio parava em "abre".
  //
  // O comentario acima ja dizia "existe e responde", mas a unica coisa cobrada era o
  // seletor do terminal aparecer na tela: um terminal que abrisse a moldura SEM shell
  // nenhum por tras passaria verde. E a V0 promete, com estas palavras, "terminal
  // responde".
  //
  // A uma revisao independente do ciclo provou por FOTO que o shell processa comando de
  // verdade. Foto nao serve de gate automatico, e ler a saida da tela tambem nao: o
  // terminal e desenhado em CANVAS, entao `.xterm-screen` + textContent devolve o
  // CSS de dentro de uma tag <style>, e nao a saida — quem tentar por ali vai
  // acreditar num texto que nunca foi impresso.
  //
  // Por isso a prova sai da UI e vai para o DISCO: o terminal grava um arquivo, e
  // quem confere e o `fs` DESTE processo, fora do editor. Mesmo padrao do resto da
  // casa — nunca perguntar ao proprio programa se ele funcionou.
  // ⚠️ E o comando tambem se perde — medido no mesmo dia em que este criterio nasceu.
  //
  // Rodando sozinho: verde em 6,7 s. Rodando dentro da regressao, com a maquina
  // ocupada: vermelho, esperando os 30 s inteiros. O objeto nao mudou; o teste mudou
  // de resposta — e um criterio que faz isso nao serve de gate binario. A causa e a
  // mesma do atalho: o shell integrado leva um tempo para nascer, e o que se digita
  // antes dele existir cai no vazio.
  //
  // Esperar mais nao traz de volta o que se perdeu; reenviar traz. Mesmo teto de
  // paciencia (30 s), reparticionado em 3 tentativas: a exigencia continua sendo
  // "o arquivo existe no disco com a marca desta rodada".
  let terminalRespondeu = false
  let tentativasGastas = 0
  const tTerminal = Date.now()
  const provaTerminal = path.join(area, 'prova_do_terminal.txt')
  for (let tentativa = 1; tentativa <= 3 && terminalAbriu && !terminalRespondeu; tentativa++) {
    tentativasGastas = tentativa
    await win.keyboard.type(`echo ${MARCA} > "${provaTerminal}"`)
    await win.keyboard.press('Enter')
    const ate = Date.now() + 10000
    while (Date.now() < ate && !terminalRespondeu) {
      try {
        // O `>` do PowerShell 5.1 grava UTF-16LE. Lido como utf8, cada letra vem
        // seguida de um byte nulo e a marca "some" — ela esta la, o leitor e que nao
        // enxerga. Tirar os nulos faz o teste valer para os dois shells (cmd grava
        // ANSI) sem afrouxar nada: a marca ou foi escrita, ou nao foi.
        const cru = fs.readFileSync(provaTerminal).toString("utf8").split(String.fromCharCode(0)).join("")
        terminalRespondeu = cru.includes(MARCA)
      } catch { /* o arquivo ainda nao existe */ }
      if (!terminalRespondeu) await new Promise(r => setTimeout(r, 500))
    }
    if (terminalRespondeu && tentativa > 1) {
      console.log(`  nota  o comando so chegou ao shell na ${tentativa}a tentativa`)
    }
  }
  // ⚠️ O NUMERO vai no detalhe, sempre — e nao so uma nota quando o reenvio dispara.
  // O reenvio absorve ate ~20 s de lentidao calado, e "verde" sem tempo esconde a
  // tendencia: o dia em que o editor comecar a demorar 25 s para responder no
  // terminal, este criterio continuaria verde sem ninguem notar. Pedido da revisao final
  // do ciclo, 05/09/2026.
  checar('o terminal RODA um comando de verdade (prova no disco, nao na tela)',
    terminalRespondeu,
    terminalAbriu
      ? `${((Date.now() - tTerminal) / 1000).toFixed(1)}s, ${tentativasGastas} tentativa(s)`
      : 'o terminal nem abriu')

  // O primeiro argumento que o playwright entrega aqui JA E o modulo electron - a
  // mesma forma usada na leitura de identidade, la em cima, que sempre passou. A
  // versao anterior fazia `await import('electron')` dentro do processo principal,
  // caia no catch calado e devolvia string vazia: o teste acusava o PRODUTO por um
  // defeito do proprio INSTRUMENTO. A checagem nao foi afrouxada - continua exigindo
  // que o app informe onde esta instalado, so que pelo caminho que funciona.
  const caminhoApp = await app.evaluate(({ app }) => app.getAppPath())
  checar('o app reporta o proprio caminho de instalacao', !!caminhoApp, caminhoApp)

  // ⚠️ CONGELA a lista aqui, ANTES de mandar fechar.
  //
  // Medido em 05/09/2026, 16 rodadas seguidas do mesmo build: 5 delas acusaram erro
  // no console, e em TODAS o erro nasceu DEPOIS do inicio do fechamento (fechamento
  // ~3,8 s; erros entre 4,16 s e 4,28 s) com a mesma causa - `[AHPLog] Failed to
  // write transport log ... (Canceled: Canceled)`: uma escrita de log pendente que o
  // servico de arquivos cancela ao ser desligado. O produto nao errou; o teste
  // estava cobrando dele o barulho da propria porta batendo.
  //
  // O criterio passa a ser o que sempre quis dizer: "nenhum erro no console ENQUANTO
  // o editor esta em uso". O que aparece durante o desligamento continua sendo
  // IMPRESSO (nota abaixo) - some da conta, nao some da vista.
  //
  // Declarado, porque e uma concessao de verdade: um defeito que so se manifeste ao
  // fechar (perda de dado nao salvo, por exemplo) NAO seria pego por esta checagem.
  // Se um dia isso importar, o lugar de cobrar e um teste proprio de desligamento.
  const errosEmUso = erros.slice()
  await fecharApp(app)
  app = null
  const errosNoFechamento = erros.slice(errosEmUso.length)
  if (errosNoFechamento.length) {
    console.log(`  nota  ${errosNoFechamento.length} erro(s) apareceram durante o desligamento, ` +
      'fora da conta: ' + errosNoFechamento.slice(0, 2).map(e => e.txt.slice(0, 160)).join(' | '))
  }
  emUso = errosEmUso
} catch (e) {
  if (app) { try { await fecharApp(app) } catch {} }
  checar('execucao sem excecao', false, String(e).split('\n')[0])
}

// Se a execucao estourou antes do fechamento, `emUso` fica nulo e a conta e feita
// sobre TUDO que foi visto - ali nao houve desligamento nenhum para desculpar erro.
const paraCobrar = emUso ?? erros
checar('nenhum erro no console durante a fumaca (com o editor em uso)', paraCobrar.length === 0,
  paraCobrar.slice(0, 3).map(e => e.ms + 'ms ' + e.txt).join(' | '))

try { fs.rmSync(area, { recursive: true, force: true }) } catch {}

const segundos = +((Date.now() - t0) / 1000).toFixed(1)
const passou = resultados.every(r => r.ok)
checar('fumaca abaixo de 2 minutos', segundos < 120, segundos + 's')

console.log('\n' + JSON.stringify({
  passou: passou && segundos < 120,
  segundos,
  falhas: resultados.filter(r => !r.ok).map(r => r.nome)
}))
process.exit(passou && segundos < 120 ? 0 : 1)
