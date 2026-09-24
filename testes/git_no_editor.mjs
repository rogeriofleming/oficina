// O que funciona de Git e de GitHub dentro de uma build feita do nucleo aberto.
//
// Por que este teste existe separado da fumaca: o suporte a Git e do nucleo e deve
// funcionar sempre; ja o login do GitHub embutido depende de um aplicativo OAuth da
// Microsoft e a expectativa e que NAO funcione fora do binario oficial. Misturar as
// duas coisas num teste so faria a fumaca ficar vermelha por um resultado esperado.
//
// Uso: node testes/git_no_editor.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { carregarElectron, acharExe, ambienteLimpo, argumentosDeTeste, esconderJanela, fecharApp } from './comum.mjs'

// ⚠️ Este teste ja abriu o Electron SEM limpar o ambiente: rodado de dentro de um
// editor, ELECTRON_RUN_AS_NODE o transformava em Node e ele acusaria o build por um
// defeito de quem o chamou. A licao existia — morava dentro da fumaca. Agora mora em
// comum.mjs, onde o proximo teste tambem a encontra.

const achados = []
const anotar = (o, valor, obs = '') => { achados.push({ o, valor, obs }); console.log(`  ${o}: ${valor}${obs ? '  — ' + obs : ''}`) }

const _electron = await carregarElectron()
const exe = acharExe(process.argv[2])
if (!exe) { console.log('nao achei executavel compilado'); process.exit(1) }

// Um repositorio git de verdade, descartavel, com um commit e uma alteracao pendente:
// so assim da para ver se o editor enxerga branch e arquivo modificado.
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-git-'))
const projeto = path.join(area, 'repo')
fs.mkdirSync(projeto)
const git = (...a) => execFileSync('git', ['-C', projeto, ...a], { encoding: 'utf8' })
git('init', '-b', 'principal')
fs.writeFileSync(path.join(projeto, 'arquivo.txt'), 'primeira linha\n')
git('add', '.')
git('-c', 'user.name=Teste', '-c', 'user.email=teste@exemplo.invalido', 'commit', '-m', 'commit de teste')
fs.appendFileSync(path.join(projeto, 'arquivo.txt'), 'linha nova, ainda nao commitada\n')
// Um arquivo que o git nunca viu, para medir tambem a marca de nao rastreado.
fs.writeFileSync(path.join(projeto, 'novo.txt'), 'arquivo que o git nunca viu\n')

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

  // 1. O nucleo traz a extensao de Git embutida?
  const embutidas = fs.readdirSync(path.join(path.dirname(exe), 'resources', 'app', 'extensions'))
    .filter(n => !n.startsWith('.'))
  anotar('extensao git embutida', embutidas.includes('git') ? 'SIM' : 'NAO')
  anotar('github-authentication embutida', embutidas.includes('github-authentication') ? 'SIM' : 'NAO',
    'so estar presente nao quer dizer que o login funcione: o aplicativo OAuth e da Microsoft')
  anotar('total de extensoes embutidas', String(embutidas.length))

  // 2. O editor reconhece o repositorio? A barra de status mostra o nome do ramo.
  let ramo = ''
  try {
    await win.waitForFunction(() => {
      const b = document.querySelector('.statusbar')
      return b && /principal/.test(b.textContent || '')
    }, null, { timeout: 45000 })
    ramo = 'SIM'
  } catch { ramo = 'NAO' }
  anotar('barra de status mostra o ramo do git', ramo, 'ramo criado no teste: "principal"')

  // 3. O arquivo alterado aparece marcado no explorador?
  //
  // ⚠️ A marca do git NAO esta no texto do item nem numa classe chamada "modified":
  // o VS Code a poe no `aria-label` ("<caminho> • Modified") e em classes geradas com
  // sufixo aleatorio (monaco-decoration-itemBadge-kkyaq5). A versao anterior procurava
  // a letra M no texto e uma classe "modified" que nao existe: deu "NAO" num editor que
  // marcava certinho — instrumento acusando o produto pela terceira vez neste projeto.
  // Conferido no DOM real da OFICINA em 05/09/2026.
  // ⚠️ ABRIR O EXPLORADOR ANTES DE PROCURAR NELE — obrigatório desde a V2 (10/09/2026).
  //
  // Este teste ficou vermelho na primeira regressão da V2, e o produto estava certo: a
  // OFICINA fecha a barra lateral na abertura, de propósito (pedido dele: abrir direto
  // na conversa, sem o explorador ocupando espaço). Os itens `.explorer-item` que este
  // bloco procura simplesmente não estavam na tela.
  //
  // Por que passava antes: até a V1, a lateral só era fechada se a conversa tivesse
  // aberto — e no perfil descartável deste teste a extensão do Claude Code não existe,
  // então a conversa não abria e a lateral ficava aberta **por acidente**. O critério
  // vinha passando de carona num caminho de falha.
  //
  // O que se mede aqui é o git decorar o explorador, não o explorador estar aberto.
  // ⚠️ TIRAR O FOCO DA WEBVIEW ANTES DA TECLA — a mesma causa que `abrirPaleta`
  // documenta em `comum.mjs`, e que este bloco estava prestes a repetir pela quarta vez
  // no projeto (achado por uma revisao independente, 10/09/2026). Com o painel abrindo SEMPRE, ha
  // webview com foco em toda abertura, e `press` no nivel da pagina entrega a tecla
  // para o HTML dela. Sem isto o teste fica vermelho de forma intermitente, com o
  // produto certo.
  const focarWorkbench = async () => {
    try { await win.locator('#workbench\.parts\.titlebar').first().click({ timeout: 2000 }) } catch { }
  }
  let exploradorAberto = false
  for (let tentativa = 1; tentativa <= 5 && !exploradorAberto; tentativa++) {
    await focarWorkbench()
    await win.locator('.monaco-workbench').first().press('Control+Shift+E')
    await new Promise(r => setTimeout(r, 1500))
    exploradorAberto = await win.evaluate(() =>
      document.querySelectorAll('.explorer-item').length > 0)
  }
  if (!exploradorAberto) {
    // Reprova com a causa dita, em vez de deixar os dois criterios abaixo caírem com
    // "NAO" e mandarem procurar defeito no git.
    anotar('o explorador abriu para as marcas serem medidas', 'NAO',
      'sem explorador aberto, os dois criterios abaixo nao foram medidos em condicao valida')
  }

  const marcaDoGit = async (arquivo, palavra) => {
    try {
      await win.waitForFunction(({ arquivo, palavra }) =>
        [...document.querySelectorAll('.explorer-item')].some(i => {
          const rotulo = i.getAttribute('aria-label') || ''
          return rotulo.includes(arquivo) && new RegExp('\u2022\\s*' + palavra, 'i').test(rotulo)
        }), { arquivo, palavra }, { timeout: 45000 })
      return 'SIM'
    } catch { return 'NAO' }
  }
  anotar('arquivo modificado aparece marcado no explorador', await marcaDoGit('arquivo.txt', 'Modified'))
  anotar('arquivo novo aparece como nao rastreado', await marcaDoGit('novo.txt', 'Untracked'))

  await fecharApp(app)
  app = null
} catch (e) {
  if (app) { try { await fecharApp(app) } catch {} }
  anotar('execucao', 'FALHOU', String(e).split('\n')[0])
}

try { fs.rmSync(area, { recursive: true, force: true }) } catch {}

// ⚠️ Este teste saia com codigo 0 SEMPRE — inclusive quando o editor nem abria.
// Quem o chama (a regressao) contava ocorrencias de ": NAO" no texto, e a linha do
// caminho de falha e "execucao: FALHOU", que nao casa com esse padrao: o teste ficava
// MAIS verde quanto pior o build. Agora o resultado sai como dado, nao como prosa.
//
// `github-authentication` fica fora da conta de proposito: o proprio plano espera que
// o login do GitHub NAO funcione fora do binario oficial, e reprovar por isso seria
// vermelho falso. Ela continua sendo reportada.
const obrigatorias = achados.filter(a => !/github-authentication|total de extensoes/i.test(a.o))
const reprovadas = obrigatorias.filter(a => a.valor !== 'SIM')
console.log('\n' + JSON.stringify({
  passou: reprovadas.length === 0 && obrigatorias.length >= 4,
  conferidas: obrigatorias.length,
  reprovadas: reprovadas.map(r => r.o),
  achados
}, null, 2))
process.exit(reprovadas.length === 0 && obrigatorias.length >= 4 ? 0 : 1)
