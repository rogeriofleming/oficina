// A BARRA LATERAL COM OS TRÊS BOTÕES, dentro do editor de verdade.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE. A barra lateral nascia oculta pelo produto, e o pedido novo pede
// botões nela: Arquivos (com as cores do Git), Git e Skills. Os outros ícones de fábrica do editor
// (Pesquisa, Executar e Depurar, Extensões) e o de Tokens nascem SOLTOS — e isso não tem
// configuração: é o patch 0012 do núcleo, lendo uma lista do produto. Nada disso se prova fora da
// janela: a barra só existe com o núcleo compilado, e as cores do Git vêm do tema aplicado sobre um
// repositório de verdade.
//
// ⚠️ O PERFIL GUARDADO GANHA DO PRODUTO. A lista só vale para quem ainda não tem estado salvo. Por
// isso a segunda metade reabre o programa com o MESMO perfil, depois de a pessoa fixar a Pesquisa
// pelo menu da barra: ela tem de continuar lá.
//
// Sem conta e sem gasto: nenhuma mensagem vai ao agente.
//
// `--perfil-com-lateral` escreve no perfil do teste a barra lateral ligada. Serve só para conferir
// este teste num executável anterior à barra lateral: os critérios do produto (a barra aparece sozinha,
// nascem só os quatro de fábrica) continuam medindo o executável, e ficam vermelhos nele.
//
// Uso:  node testes/tela_lateral.mjs [caminho do executavel] [--perfil-com-lateral]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, abrirPaleta, extensaoForaDeSincronia, clicarNoIconeDaVista, iconesDasVistas } from './comum.mjs'

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
const comLateralNoPerfil = process.argv.includes('--perfil-com-lateral')

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
}

// ── O projeto: um repositório com um arquivo modificado, um novo e um ignorado ────────────────────
const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-lateral-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
const git = (...a) => execFileSync('git', ['-C', projeto, ...a], { stdio: 'pipe' })
git('init', '-q')
git('config', 'user.email', 'teste@exemplo.invalido')
git('config', 'user.name', 'teste')
fs.writeFileSync(path.join(projeto, 'guardado.txt'), 'um\n')
fs.writeFileSync(path.join(projeto, '.gitignore'), 'ignorado.log\n')
git('add', '.')
git('commit', '-qm', 'base')
fs.writeFileSync(path.join(projeto, 'guardado.txt'), 'um\ndois\n')
fs.writeFileSync(path.join(projeto, 'novo.txt'), 'novo\n')
fs.writeFileSync(path.join(projeto, 'ignorado.log'), 'ignorado\n')

const userDir = path.join(area, 'dados', 'User')
fs.mkdirSync(userDir, { recursive: true })
// O menu de contexto desenhado pelo próprio editor, e não pelo sistema: é o único que o teste alcança.
const perfil = { 'window.menuStyle': 'custom', 'workbench.colorTheme': 'OFICINA Escuro' }
if (comLateralNoPerfil) perfil['workbench.activityBar.location'] = 'default'
fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify(perfil, null, 2))

/**
 * Clica no ícone da barra lateral cujo rótulo COMEÇA com `rotulo`. O rótulo muda com o estado (o do Git
 * ganha "- 2 pending changes"), então o ícone é achado no DOM e o clique é do Playwright, de verdade. O
 * clique vai no item inteiro: o selo de contagem fica POR CIMA do ícone e tomaria o clique dele.
 */
// ⚠️ A CÓPIA LOCAL DESTES DOIS SAIU DAQUI. Ela já tinha sido corrigida uma vez (tirar o
// `.part.activitybar` quando os ícones foram para o cabeçalho da lateral) e teria que ser
// corrigida OUTRA vez agora, que eles foram para a barra de título (patch 0022). Quatro suítes
// repetiam o mesmo seletor, e cada mudança de lugar custava quatro consertos: agora ele mora
// em `comum.mjs`, num lugar só.
const clicarNaLateral = (win, rotulo, opcoes = {}) => clicarNoIconeDaVista(win, rotulo, opcoes)
const iconesDaLateral = win => iconesDasVistas(win)
const larguraDaLateral = win => win.evaluate(() => {
  const s = document.getElementById('workbench.parts.sidebar')
  return s && getComputedStyle(s).display !== 'none' ? Math.round(s.getBoundingClientRect().width) : 0
})
const vistaAberta = (win, id) => win.locator(`[id="${id}"]`).first().isVisible().catch(() => false)
/*
  ⛔ OS ÍCONES DE FÁBRICA SÃO DERIVADOS, NÃO ESCRITOS À MÃO.

  Era `['Explorer', 'Source Control', 'Skills']`, com a conta `+ 1` para a vista Tokens. Quando a
  V26 acrescentou dois contêineres de fábrica (Conexões e Conta), estes dois critérios ficaram
  vermelhos — e o vermelho parecia regressão sendo acerto. É exatamente a pergunta que o conferidor
  pré-build manda responder antes de compilar (*"há critério gravando o jeito ANTIGO como
  esperado?"*), e que eu respondi olhando só dois dos três lugares onde a lista morava.

  A lista agora sai do MANIFESTO e do `product.json` — os mesmos dois arquivos que mandam na barra
  de verdade, e a mesma conta que o `ponte.mjs` e a suíte da barra de cima fazem. Assim, acrescentar
  ou tirar um contêiner de fábrica não deixa mais nenhum critério para trás.

  O Navegador não entra: ele nasce SOLTO (está em `defaultUnpinnedViewContainers`) e abre pela paleta.
*/
const manifestoDaExtensao = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
const produtoDaOficina = JSON.parse(fs.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
const OS_TRES = ['Explorer', 'Source Control', ...(manifestoDaExtensao.contributes.viewsContainers.activitybar || [])
  .filter(c => !(produtoDaOficina.defaultUnpinnedViewContainers || []).includes('workbench.view.extension.' + c.id))
  .map(c => c.title)]

async function abrir() {
  const app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  /*
    ⚠️ A LATERAL PRECISA SER REVELADA ANTES DE MEDIR — e é o `t198` que fez isso ser verdade.

    Com os ícones no topo (ordem dele: *"esses negócio ao invés de lateral, eu quero em cima, na
    horizontal"*), eles deixaram de morar numa barra própria: o núcleo os põe no **cabeçalho da
    barra lateral**. Medido no build `V20-B2`, com a lateral fechada: `Explorer`, `Source
    Control`, `Skills` e `Claude Code` existem no DOM e estão TODOS com altura zero. Com ela
    aberta, os quatro aparecem em linha horizontal (x = 4, 30, 56, 82; mesmo y).

    Este teste mede o que a barra de ícones tem e como ela responde ao clique — então ele abre a
    lateral primeiro. O critério de que ela NÃO ocupa a coluna da esquerda está logo abaixo, e
    continua valendo.
  */
  await respirar(4000)
  await win.locator('.monaco-workbench').first().press('Control+Shift+E')
  await respirar(2500)
  // A extensão de fora (Skills) registra o contêiner dela depois do núcleo.
  const fim = Date.now() + 30000
  while (Date.now() < fim && !(await iconesDaLateral(win).catch(() => [])).includes('Skills')) await respirar(500)
  await respirar(1500)
  return { app, win }
}

let app
try {
  // ── Primeira abertura: perfil limpo ─────────────────────────────────────────────────────────────
  let win
  ;({ app, win } = await abrir())
  const barraVisivel = await win.evaluate(() => {
    const el = document.getElementById('workbench.parts.activitybar')
    return !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none'
  })
  // ⚠️ O CRITÉRIO É O OPOSTO DO QUE ERA, por ordem dele (t198): a barra de ícones saiu da coluna
  // da esquerda. Quem cobra que ela não volte é este; quem cobra que os ícones existam e
  // funcionem são os de baixo.
  checar('⛔ perfil limpo: a barra de ícones NÃO ocupa a lateral (t198: ele mandou para o topo)',
    !barraVisivel, `activitybar visível: ${barraVisivel}`)
  const icones = await iconesDaLateral(win)
  checar('⛔ perfil limpo: os ícones são exatamente os de fábrica (derivados do manifesto), mais a conversa oficial',
    OS_TRES.every(r => icones.includes(r)) && icones.length <= OS_TRES.length + 1, icones.join(', '))
  // E eles estão EM LINHA, que é o que ele pediu ("na horizontal").
  const emLinha = await win.evaluate(() => {
    const itens = [...document.querySelectorAll('.composite-bar .action-item')]
      .map(i => i.getBoundingClientRect()).filter(r => r.height > 0)
    if (itens.length < 2) return { quantos: itens.length, mesmaLinha: false }
    const y = Math.round(itens[0].y)
    return { quantos: itens.length, mesmaLinha: itens.every(r => Math.abs(Math.round(r.y) - y) <= 2), y }
  })
  checar('⛔ os ícones estão na HORIZONTAL, um ao lado do outro (t198)',
    emLinha.mesmaLinha && emLinha.quantos >= 3, JSON.stringify(emLinha))
  // Contas e Gerenciar, os ícones globais do pé da barra, saem pela chave do produto (patch 0014).
  const globais = await win.evaluate(() => document.querySelectorAll('.part.activitybar .global-activity .action-item, .part.activitybar .global-composite-bar .action-item').length)
  checar('⛔ perfil limpo: o pé da barra lateral não tem Contas nem Gerenciar', globais === 0, `${globais} ícone(s) global(is)`)
  const pe = await win.evaluate(() => [...document.querySelectorAll('.part.activitybar .action-label')]
    .filter(a => !a.closest('.composite-bar') && a.getBoundingClientRect().height > 0).map(a => a.getAttribute('aria-label')))
  console.log(`  nota  no pé da barra lateral: ${pe.join(', ') || '(nada)'}`)

  /*
    Arquivos: o clique fecha, e o atalho traz de volta.

    ⚠️ O CICLO "UM CLIQUE ABRE, OUTRO FECHA" DEIXOU DE EXISTIR COM O `t198`, e não é defeito: os
    ícones passaram a morar no cabeçalho da barra lateral. Com ela fechada, **não há ícone nenhum
    na tela** — medido no build `V20-B2`: os quatro continuam no DOM, todos com altura zero. Ou
    seja, fechar pelo ícone é possível; reabrir, não — isso agora é atalho ou paleta.

    É uma consequência da ordem dele que vale ele saber, e está registrada no documento da versão.
  */
  const explorador = await vistaAberta(win, 'workbench.view.explorer')
  const aberta = await larguraDaLateral(win)

  /*
    ⚠️ SUCESSOR DE: "o ícone mostra o explorador e o clique NÃO a fecha" (V20 — V24-B1).

    Aquele critério carregava a nota *"MEDIDO, NÃO SUPOSTO: clicar no ícone da vista ATIVA nao
    fecha a lateral"* — e a nota era verdadeira sobre o que o produto FAZIA. Só que aquilo não era
    comportamento, era defeito: o dono o descreveu em 24/09/2026, usando o produto, com estas
    palavras: *"quando eu clico de novo no mesmo, ele nao fecha (...) uma vez aberta aquela aba
    lateral ela fica aberta o tempo inteiro e eu nao consigo fechar ela"*.

    ⚠️ E A LIÇÃO JA ESTAVA ESCRITA NESTE ARQUIVO, vinte linhas abaixo: *"um critério que descreve
    o que se vê não é o mesmo que um critério que descreve o que se quer. Quando o que se vê é ruim,
    gravá-lo como esperado transforma a bateria em guardiã do erro."* Ela foi escrita para o
    critério dos ícones com a lateral fechada — e o critério logo ACIMA dela cometeu o mesmo erro,
    na mesma leva. Saber a lição e aplicá-la sao coisas diferentes.

    O patch 0024 devolveu o toggle do núcleo à barra de cima. A pergunta vira a oposta.
  */
  await clicarNaLateral(win, 'Explorer')
  await respirar(1200)
  const depoisDoClique = await larguraDaLateral(win)
  checar('⛔ Arquivos: clicar no ícone da vista ATIVA FECHA a lateral (patch 0024, ordem dele)',
    aberta > 0 && explorador && depoisDoClique === 0, `aberta ${aberta}px, depois do clique ${depoisDoClique}px`)

  // E o MESMO ícone a traz de volta: sem isto, um produto que fechasse e nunca mais abrisse
  // passaria no critério acima. É alternar, não é um botão de fechar.
  await clicarNaLateral(win, 'Explorer')
  await respirar(1200)
  const reaberta = await larguraDaLateral(win)
  checar('⛔ e o mesmo ícone a traz de volta (alterna, não é botão de fechar)',
    reaberta > 0, `${reaberta}px`)

  await win.locator('.monaco-workbench').first().press('Control+B')
  await respirar(1500)
  const fechada = await larguraDaLateral(win)
  const iconesComLateralFechada = await iconesDaLateral(win)
  checar('o atalho fecha a lateral', fechada === 0, `${fechada}px`)
  /*
    ⚠️ ESTE CRITÉRIO ERA O OPOSTO, E A HISTÓRIA DELE É O AVISO.

    Ele nasceu na V20 cobrando que, com a lateral fechada, **não sobrasse ícone nenhum** — e
    estava certo sobre o que se via: era a consequência medida do `activityBar.location: "top"`,
    que põe os ícones no cabeçalho da barra lateral. Um critério assim registra o que o produto
    FAZ, e nisso ele não mentiu.

    O problema é que aquilo não era comportamento; era DEFEITO. Com a lateral fechada não
    sobrava porta nenhuma para reabri-la a não ser atalho e paleta — num produto cuja navegação
    inteira são esses quatro ícones. Ao gravá-lo como esperado, o teste passou a **proteger** o
    defeito: qualquer conserto ficaria vermelho, e o vermelho pareceria regressão.

    O patch 0022 pôs a barra na BARRA DE TÍTULO, que não fecha. O critério vira o que ele sempre
    deveria ter sido: com a lateral fechada, os ícones CONTINUAM na tela.

    A lição, que vale para o projeto inteiro: **um critério que descreve o que se vê não é o
    mesmo que um critério que descreve o que se quer.** Quando o que se vê é ruim, gravá-lo como
    esperado transforma a bateria em guardiã do erro.
  */
  checar('⛔ com a lateral FECHADA os ícones continuam na tela (patch 0022 — a barra não fecha junto)',
    iconesComLateralFechada.length > 0 && iconesComLateralFechada.length === icones.length,
    `com ela fechada: ${iconesComLateralFechada.join(', ') || '(nenhum)'} · com ela aberta eram ${icones.length}`)
  await win.locator('.monaco-workbench').first().press('Control+Shift+E')
  await respirar(2000)
  checar('e o atalho traz a lateral de volta', (await larguraDaLateral(win)) > 0,
    `${await larguraDaLateral(win)}px`)

  // As cores do Git no explorador: cada estado com a cor que o tema dá a ele.
  //
  // ⚠️ NÃO CLICAR NO ÍCONE AQUI. O `Control+Shift+E` acima já deixou o explorador aberto, e desde o
  // patch 0024 um clique no ícone da vista ATIVA FECHA a lateral — as três cores passariam a ser
  // lidas de um explorador que não está na tela e voltariam `null`. Foi o que aconteceu na primeira
  // corrida da bateria sobre o `V24-B2`: três critérios vermelhos que não tinham nada a ver com
  // cor, e sim com um clique a mais herdado do tempo em que clicar não fechava.
  await respirar(2500)
  const cores = await win.evaluate(() => {
    const raiz = document.querySelector('.monaco-workbench')
    const doTema = v => { const p = document.createElement('span'); p.style.color = `var(${v})`; raiz.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c }
    const linha = nome => {
      const r = [...document.querySelectorAll('.explorer-folders-view .monaco-list-row')].find(l => (l.innerText || '').trim().startsWith(nome))
      const rotulo = r && r.querySelector('.label-name')
      return rotulo ? getComputedStyle(rotulo).color : null
    }
    return {
      modificado: linha('guardado.txt'), esperadoModificado: doTema('--vscode-gitDecoration-modifiedResourceForeground'),
      novo: linha('novo.txt'), esperadoNovo: doTema('--vscode-gitDecoration-untrackedResourceForeground'),
      ignorado: linha('ignorado.log'), esperadoIgnorado: doTema('--vscode-gitDecoration-ignoredResourceForeground'),
      normal: linha('.gitignore'),
    }
  })
  checar('⛔ explorador: o arquivo modificado tem a cor de "modificado" do Git', !!cores.modificado && cores.modificado === cores.esperadoModificado && cores.modificado !== cores.normal,
    `${cores.modificado} (tema ${cores.esperadoModificado}, sem mudança ${cores.normal})`)
  checar('⛔ explorador: o arquivo novo tem a cor de "novo" do Git', !!cores.novo && cores.novo === cores.esperadoNovo && cores.novo !== cores.normal,
    `${cores.novo} (tema ${cores.esperadoNovo})`)
  checar('explorador: o arquivo ignorado tem a cor de "ignorado" do Git', !!cores.ignorado && cores.ignorado === cores.esperadoIgnorado && cores.ignorado !== cores.normal,
    `${cores.ignorado} (tema ${cores.esperadoIgnorado})`)

  // Git: a vista do controle de versão, com as mudanças e o botão de conectar ao GitHub.
  await clicarNaLateral(win, 'Source Control')
  await respirar(3000)
  const scm = await win.evaluate(() => {
    const s = document.getElementById('workbench.parts.sidebar')
    const linhas = [...(s ? s.querySelectorAll('.monaco-list-row') : [])].map(r => (r.innerText || '').replace(/\s+/g, ' ').trim())
    return { linhas, conectar: s ? s.querySelectorAll('[aria-label="Conectar ao GitHub"]').length : 0 }
  })
  checar('Git: o botão abre o controle de versão, com as duas mudanças', await vistaAberta(win, 'workbench.view.scm') &&
    scm.linhas.some(l => l.startsWith('guardado.txt')) && scm.linhas.some(l => l.startsWith('novo.txt')), scm.linhas.slice(0, 6).join(' | '))
  checar('Git: o botão "Conectar ao GitHub" está no título da vista', scm.conectar > 0, `${scm.conectar}`)

  // Skills.
  await clicarNaLateral(win, 'Skills')
  await respirar(2500)
  checar('Skills: o botão abre a vista de skills', await vistaAberta(win, 'workbench.view.extension.oficinaSkills'))

  // Tokens: fora da lateral de fábrica, mas continua abrindo pelo comando dele.
  if (!await abrirPaleta(win, respirar)) throw new Error('a paleta nao abriu')
  await win.keyboard.type('OFICINA: Tokens da conversa')
  const itemTokens = win.locator('.quick-input-list .monaco-list-row', { hasText: /^OFICINA: Tokens da conversa/i }).first()
  await itemTokens.waitFor({ timeout: 15000 })
  await itemTokens.click()
  await respirar(2500)
  /*
    ⚠️ SUCESSOR DE: "Tokens NÃO nasce na barra lateral, e abre pelo comando dele" (V20 — V24-B1).

    Aquele critério nasceu quando a vista Tokens morava na barra da DIREITA: não estar entre os
    ícones era o certo. Na V24 ela saiu de lá por ordem dele (*"eu nao quero essa aba da direita"*)
    e virou o quarto ícone da barra de cima — então "não nasce na barra" passou a cobrar o oposto
    do produto.

    O que continua valendo, e por isso o critério foi substituído e não apagado: ela abre pelo
    comando próprio, na paleta. Um ícone pode ser desafixado por quem usa; o comando é a porta que
    não depende disso.
  */
  checar('⛔ Tokens é o quarto ícone da barra de cima (saiu da direita na V24) e abre pelo comando dele',
    icones.includes('Tokens') && await vistaAberta(win, 'workbench.view.extension.oficinaTokens'), icones.join(', '))

  // A pessoa fixa a Pesquisa pelo menu da barra lateral.
  const pesquisaAntes = (await iconesDaLateral(win)).includes('Search')
  await clicarNaLateral(win, 'Explorer', { button: 'right' })
  await respirar(1200)
  // O menu da barra lista cada contêiner com a marca de fixado; clicar no nome troca a marca.
  const itens = await win.evaluate(() => [...document.querySelectorAll('.monaco-menu .action-item .action-label')].map(a => (a.textContent || '').trim()))
  const itemPesquisa = win.locator('.monaco-menu .action-item .action-label', { hasText: /^\s*Search\s*$/ }).first()
  if (!await itemPesquisa.count()) throw new Error(`o menu da barra lateral não tem "Search": ${itens.join(' | ')}`)
  await itemPesquisa.click({ timeout: 10000 })
  await respirar(1500)
  const pesquisaDepois = (await iconesDaLateral(win)).includes('Search')
  checar('⛔ a Pesquisa nasce solta, e a pessoa a fixa pelo menu da barra lateral', !pesquisaAntes && pesquisaDepois, `antes ${pesquisaAntes}, depois ${pesquisaDepois}`)

  await fecharApp(app)
  app = null
  await respirar(1500)

  // ── Segunda abertura: o MESMO perfil ───────────────────────────────────────────────────────────
  ;({ app, win } = await abrir())
  const reaberto = await iconesDaLateral(win)
  checar('⛔ reaberto com o mesmo perfil, a Pesquisa que a pessoa fixou continua lá', reaberto.includes('Search'), reaberto.join(', '))
  /*
    ⚠️ A CONTA MUDOU, E A RAZÃO ESTÁ NO PRÓPRIO TESTE. O esperado é a lista EXATA do que este teste
    pediu para existir: os três de fábrica, mais a Pesquisa que ele fixou pelo menu, mais a vista
    Tokens que ele abriu pelo comando (ela passa a morar na barra depois de aberta uma vez).
    A conta antiga (`OS_TRES.length + 1`) era de quando a vista Tokens era mantida aberta à força
    e não entrava nesta lista; o `t197` tirou essa força, e a conta ficou para trás.

    ⚠️ E desde a V26 o `Tokens` JÁ ESTÁ em `OS_TRES` — que agora é derivado do manifesto, e não uma
    lista escrita à mão. Somá-lo de novo aqui faria a lista esperada ter um item repetido, e a
    contagem exata nunca bateria: o critério ficaria vermelho para sempre, pelo motivo errado.

    O que este critério protege continua o mesmo: nada aparecer SOZINHO — por isso a lista é
    exata, e não "contém".
  */
  const ESPERADOS = [...OS_TRES, 'Search']
  checar('reaberto: só está na barra o que este teste pediu — nada apareceu sozinho',
    ESPERADOS.every(r => reaberto.includes(r)) && reaberto.length === ESPERADOS.length,
    `${reaberto.join(', ')}  (esperado: ${ESPERADOS.join(', ')})`)
} catch (e) {
  checar('execucao sem excecao', false, String(e && e.message || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: res.length, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
