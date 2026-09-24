// A extensão do Claude Code ATIVA dentro da OFICINA — caso-teste 4 do coração 1.
//
// Por que existe separado do instalador: instalar e ativar são coisas diferentes, e
// o caso-teste do plano pede a segunda. Uma extensão pode entrar no registro e nunca
// carregar (falta de ponto de extensão, erro na ativação, dependência ausente) — e
// "10 de 10 instaladas" diria que está tudo bem.
//
// ⚠️ O que este teste NÃO faz: login. Nada de conta, nada de credencial. Ele mede se
// o editor CARREGOU a extensão e expôs o que ela contribui.
//
// Uso:  node testes/extensao_claude.mjs [pasta de extensoes] [caminho do exe]
//       (sem argumentos: o perfil da OFICINA nesta máquina e o build da pasta de trabalho)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { carregarElectron, acharExe, ambienteLimpo, argumentosDeTeste, esconderJanela, fecharApp, abrirPaleta, ABA_DA_CONVERSA_NOVA } from './comum.mjs'

const extensoesDir = process.argv[2] ||
  path.join(os.homedir(), '.oficina', 'extensions')
const exe = acharExe(process.argv[3])

if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel compilado'); process.exit(1) }
if (!fs.existsSync(extensoesDir)) {
  console.log(`nao achei a pasta de extensoes: ${extensoesDir}\n` +
    'Rode antes: node scripts/instalar_extensoes.mjs')
  process.exit(1)
}

const _electron = await carregarElectron()
const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 160) + ')' : ''}`)
}
const respirar = (ms) => new Promise(r => setTimeout(r, ms))

// ⚠️ `abrirPaleta` MORA EM `comum.mjs` desde 10/09/2026 — antes era uma copia daqui.
//
// O historico dela vale ser lembrado, porque e a mesma licao duas vezes: nasceu aqui
// em 06/09/2026 (o teste ficou vermelho com o produto PERFEITO, porque a tecla ia
// para dentro da webview), teve o teto subido de 5 para 8 na mesma noite (falso
// vermelho por CPU disputada com a revisao final) — e o `about.mjs` seguiu SEM ela, ate
// falhar na V2 exatamente como o historico do projeto tinha previsto por escrito.
//
// Licao que ficou: quando um conserto vale para varios arquivos, ele vira UMA funcao
// — copiar garante que um dos lados vai ficar para tras.


// A extensão precisa estar no registro ANTES de abrir — senão o teste mede outra coisa.
const registro = path.join(extensoesDir, 'extensions.json')
const instaladas = fs.existsSync(registro) ? JSON.parse(fs.readFileSync(registro, 'utf8')) : []
const claude = instaladas.find(e => e.identifier?.id?.toLowerCase() === 'anthropic.claude-code')
checar('a extensao esta no registro do editor', !!claude, claude ? 'versao ' + claude.version : extensoesDir)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-claude-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'exemplo.txt'), 'arquivo qualquer\n')

let app
try {
  app = await _electron.launch({
    executablePath: exe,
    env: ambienteLimpo(),
    args: [...argumentosDeTeste(projeto, area).filter(a => !a.startsWith('--extensions-dir')),
      '--extensions-dir=' + extensoesDir],
    timeout: 120000
  })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })

  // Ativação não é instantânea: a extensão sobe depois do workbench.
  await respirar(15000)

  // 0. A TELA DE ABERTURA — o que a pessoa vê antes de tocar em nada.
  //
  // Pedido do dono, olhando o produto rodar: abrir direto na conversa, sem o
  // explorador da esquerda e sem a tela do meio. Quem cumpre isso é a extensão
  // embutida `oficina-claude` (ela roda `claude-vscode.editor.open` e fecha a
  // lateral em `onStartupFinished`).
  //
  // Este critério tem que rodar ANTES dos passos abaixo, que abrem coisas na mão:
  // depois deles a tela já não é mais a de abertura, e mediríamos o nosso próprio
  // teste em vez do produto.
  const aberturaLimpa = await win.evaluate(padraoDaConversa => {
    const visivel = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'
    }
    const abas = [...document.querySelectorAll('.tabs-container .tab .label-name')].map(e => e.textContent.trim())
    return {
      abas,
      temClaude: abas.some(t => /claude/i.test(t)),
      temConversa: abas.some(t => new RegExp(padraoDaConversa).test(t)),
      lateralAberta: visivel(document.getElementById('workbench.parts.sidebar')),
      // O marca-d'água só é desenhado quando NÃO há editor aberto. Se ele sumiu, é
      // porque alguma coisa ocupou o meio — que é o efeito pedido.
      marcaDagua: [...document.querySelectorAll('.editor-group-watermark')].filter(el => visivel(el)).length
    }
  }, ABA_DA_CONVERSA_NOVA)
  // ⚠️ MUDOU DUAS VEZES, E A SEGUNDA É A QUE VALE.
  //
  // V1: a aba que abria sozinha era a da extensão do Claude Code (a OFICINA não tinha painel).
  // V2 (10/09/2026): passou a abrir o painel NOSSO, e o critério virou `temConversa`.
  // V20 (21/09/2026): ele decidiu o contrário — *"se eu abro o app, deve abrir DIRETO no claude
  //   code com uma conversa aberta"* —, e a conversa do produto voltou a ser a da extensão
  //   oficial. Logo, o que tem de abrir sozinho é a aba DELA.
  //
  // O que este arquivo mede continua sendo o CASO 4 DO CORAÇÃO 1 — "a extensão do Claude Code roda
  // dentro da OFICINA". Na V20 isso deixou de ser linha de base e virou o caminho principal.
  checar('V20: ABRE DIRETO na conversa da extensão oficial (t187)', aberturaLimpa.temClaude,
    aberturaLimpa.abas.join(', ') || 'nenhuma aba aberta')
  checar('a barra lateral (explorador) NAO fica aberta na abertura', !aberturaLimpa.lateralAberta,
    aberturaLimpa.lateralAberta ? 'aberta' : 'fechada')
  checar('a tela do meio (marca-dagua) nao aparece na abertura', aberturaLimpa.marcaDagua === 0,
    aberturaLimpa.marcaDagua ? `${aberturaLimpa.marcaDagua} visivel(is)` : 'nenhuma')

  // 1. O editor EXPÔE os comandos dela? Comando na paleta só existe se o manifesto
  //    foi lido e a extensão registrada pelo editor.
  if (!await abrirPaleta(win, respirar)) throw new Error('a paleta de comandos nao abriu em 8 tentativas')
  await win.keyboard.type('Claude', { delay: 25 })
  await respirar(2500)
  const comandos = await win.evaluate(() =>
    [...document.querySelectorAll('.quick-input-list .monaco-list-row')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12))
  await win.keyboard.press('Escape')
  // ⚠️ Condicao POSITIVA, nao ausencia de uma frase em ingles. A versao anterior
  // aceitava "a lista nao esta vazia e a primeira linha nao diz 'No matching commands'"
  // — que fica verde com a paleta em portugues ("Nenhum comando correspondente") e
  // tambem com qualquer comando de outra extensao que o filtro difuso trouxesse. Este
  // e o criterio do caso-teste 4 do coracao 1: ele nao pode passar por engano.
  const doClaude = comandos.filter(c => /claude/i.test(c))
  checar('os comandos da extensao aparecem na paleta', doClaude.length > 0,
    doClaude.slice(0, 4).join(' | ') || ('nada do Claude na lista: ' + comandos.slice(0, 3).join(' | ')))

  // 2. A pessoa CONSEGUE ABRIR a conversa?
  //
  // ⚠️ Até 06/09/2026 este critério contava o ícone do Claude dentro de
  // `.activitybar` — e ficou VERMELHO no dia em que o produto passou a esconder a
  // barra de atividade de verdade (patch 0001). Ou seja: ele vinha passando porque um
  // padrão do produto NÃO estava sendo aplicado. Media o editor quebrado.
  //
  // O critério não foi afrouxado para caber no produto novo; foi trocado por um mais
  // exigente. Contar ícone prova que existe um desenho na tela. Isto prova que a
  // conversa ABRE — que é o que o caso-teste 4 promete, e o que a pessoa faz. Se um dia
  // a barra de atividade voltar, este critério continua valendo sem mudar uma linha.
  if (!await abrirPaleta(win, respirar)) throw new Error('a paleta de comandos nao abriu em 8 tentativas')
  await win.keyboard.type('Claude Code: Focus on Claude Code View', { delay: 15 })
  await respirar(1500)
  await win.keyboard.press('Enter')
  await respirar(4000)
  // A view do Claude é um `webview`/`iframe` dentro do container da parte onde ela
  // mora — painel, barra lateral ou secundária, conforme `claudeCode.preferredLocation`.
  // Procurar pelo TÍTULO visível da view cobre os três lugares sem depender de qual.
  const abriu = await win.evaluate(() => {
    const visivel = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    }
    const titulos = [...document.querySelectorAll('.pane-header .title, .composite.title .title-label, .tabs-container .label-name')]
      .filter(el => visivel(el))
      .map(el => el.textContent.trim())
    return {
      titulos: titulos.filter(Boolean),
      temClaude: titulos.some(t => /claude/i.test(t)),
      // Uma webview viva é prova independente do título: a extensão desenhou algo.
      webviews: [...document.querySelectorAll('iframe.webview, webview')].filter(el => visivel(el)).length
    }
  })
  checar('a conversa do Claude ABRE pelo comando (a pessoa alcanca a extensao)',
    abriu.temClaude || abriu.webviews > 0,
    `titulos visiveis: ${abriu.titulos.slice(0, 6).join(' | ') || 'nenhum'} | webviews: ${abriu.webviews}`)

  // 3. O editor reclamou dela? Erro de ativação sai como notificação.
  //
  // ⚠️ ERRO, não "qualquer aviso que fale em Claude". O filtro era o texto casar com
  // /claude/ — e em 06/09/2026, quando o passo 2 passou a ABRIR a conversa de verdade,
  // a extensão emitiu um informativo perfeitamente normal ("Keep working from anywhere
  // … or claude.ai") que reprovou o build. O `claude.ai` dentro da frase bateu no
  // regex. Um critério que confunde aviso de boas-vindas com falha de ativação vira
  // ruído, e ruído acaba sendo ignorado — que é como um erro de verdade passa.
  //
  // A severidade não se adivinha pelo texto: o VS Code a marca no DOM, com o ícone
  // `codicon-error` no item da notificação. É isso que se lê.
  const notificacoes = await win.evaluate(() =>
    [...document.querySelectorAll('.notification-toast')].map(e => ({
      texto: e.textContent.replace(/\s+/g, ' ').trim(),
      erro: !!e.querySelector('.codicon-error'),
      aviso: !!e.querySelector('.codicon-warning')
    })))
  const reclamou = notificacoes.filter(n => n.erro && /claude|extension/i.test(n.texto))
  checar('nenhuma notificacao de ERRO sobre a extensao', reclamou.length === 0,
    reclamou.map(n => n.texto).join(' | ') ||
    // O que apareceu e NÃO era erro vai no detalhe: some da conta, não some da vista.
    (notificacoes.length
      ? `${notificacoes.length} notificacao(oes) sem severidade de erro: ` +
        notificacoes.map(n => n.texto.slice(0, 70)).join(' | ')
      : 'nenhuma notificacao'))

  await fecharApp(app)
  app = null
} catch (e) {
  if (app) { try { await fecharApp(app) } catch { /* segue */ } }
  checar('execucao sem excecao', false, String(e).split('\n')[0])
}

try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* a area some no proximo boot */ }

const falhas = resultados.filter(r => !r.ok)
console.log('\n' + JSON.stringify({ passou: falhas.length === 0, falhas: falhas.map(f => f.nome) }))
process.exit(falhas.length ? 1 : 0)
