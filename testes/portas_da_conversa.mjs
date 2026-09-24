// PORTAS DA CONVERSA — para onde as portas levam, e o que acontece quando a oficial falta.
//
// ⚠️ ESTE ARQUIVO MUDOU DE PERGUNTA TRES VEZES, e quem ler o git vai ver criterios "sumirem"
// duas vezes. As tres perguntas, na ordem:
//
//   ate a V1  "as portas EXPLICAM quando a extensao do Claude Code nao esta instalada?"
//             A conversa vinha de uma extensao da loja, que nao viaja no instalador: numa
//             maquina recem-instalada, tudo que abria a conversa chamava um comando inexistente
//             e dava um "nao" mudo. Uma revisao independente achou isso em 06/09/2026 usando o
//             produto, e o conserto varreu as portas.
//
//   V2 - V22  "a porta ABRE O PAINEL?"  A conversa passou a ser NOSSA e a vir dentro do
//             programa. Nao havia mais instalacao para faltar, entao nao havia mais o que
//             explicar: os seis criterios da explicacao foram SUBSTITUIDOS, um a um.
//
//   V23 ->    "a porta leva a conversa OFICIAL — e o caminho de volta ainda pega quando ela
//             falta?"  Decisao do dono em 21/09/2026: a conversa da OFICINA passa a ser a da
//             extensao oficial. O programa ja abria assim desde a V20; a porta que a pessoa
//             aperta e que nao tinha concordado com a abertura.
//
// ⚠️ POR QUE A SUBSTITUICAO IMPORTA MAIS DO QUE PARECE. Os criterios antigos gravavam como
// ESPERADO exatamente o que a decisao inverte — havia um que exigia que "nenhuma porta chame
// `claude-vscode.` direto". Feito o conserto certo, ele ficaria VERMELHO, e o vermelho pareceria
// regressao sendo acerto. Apagar sem substituir seria perder cobertura em silencio, que e o jeito
// mais barato de um projeto ficar verde sem estar certo. Por isso cada pergunta velha tem
// sucessora declarada aqui embaixo, na linha do criterio.
//
// ⚠️ E POR QUE ESTA SUITE ABRE O PROGRAMA DUAS VEZES. Os testes de tela rodam num
// `--extensions-dir` VAZIO, de proposito — perfil limpo prova o padrao de fabrica. So que sem a
// extensao oficial instalada o produto cai no caminho de volta, e medir a porta nessa condicao
// provaria o mundo que quase ninguem usa: a porta "abriria a conversa" e o criterio ficaria verde
// sem ter exercitado a decisao. Entao sao duas corridas, e cada uma prova uma metade:
//
//   CORRIDA 1 (com a oficial instalada)  a porta leva a conversa DELA, e a rajada nao duplica;
//   CORRIDA 2 (sem a oficial)            a porta cai no painel nosso — o caminho de volta pega.
//
// Uso: node testes/portas_da_conversa.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ, carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, instalarConversaOficial, abrirPaleta, digitarNaPaleta, ABA_DA_CONVERSA_NOVA } from './comum.mjs'

const _electron = await carregarElectron()
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + detalhe + ')' : ''}`)
}
const respirar = (ms) => new Promise(r => setTimeout(r, ms))

/** O que a porta chama, na ordem. Fonte unica: o corpo de `abrirConversaOuExplicar`. */
const COMANDOS_DA_PORTA = ['claude-vscode.focus', 'claude-vscode.editor.openLast']

// ── 1. o MANIFESTO e o CODIGO: barato, roda sem abrir nada ──────────────────────
// Pega o revert de uma linha antes de qualquer janela.
{
  const dirExt = path.join(REPO, 'extensoes', 'oficina-claude')
  const pkg = JSON.parse(fs.readFileSync(path.join(dirExt, 'package.json'), 'utf8'))
  const fonte = fs.readFileSync(path.join(dirExt, 'extensao.js'), 'utf8')
  const NOSSO = 'oficina.abrirConversaOuExplicar'

  const ctrlT = (pkg.contributes?.keybindings || []).find(k => k.key === 'ctrl+t')
  checar('porta 1 (Ctrl+T) passa pelo comando nosso', ctrlT?.command === NOSSO,
    ctrlT ? `ctrl+t -> ${ctrlT.command}` : 'nao ha atalho ctrl+t no manifesto')

  /*
    ⚠️ A PORTA 2 FOI FECHADA POR ORDEM DELE (t188), e o criterio virou o oposto.

    Ele apontou os tres botoes da barra de cima — Arquivos, Conversa e Layout — e disse *"nao
    entendi esses itens aqui nao quero eles"*. Da V20 em diante a barra de cima so tem o mostrador
    de tokens (t196). Continuar cobrando o botao deixava a regressao VERMELHA por uma decisao
    dele, e vermelho rotineiro deixa de ser sinal.

    O que este criterio protege agora: que o botao nao volte por descuido, e que o comando que ele
    chamava continue existindo (a conversa segue alcancavel por Ctrl+T e pela paleta).
  */
  const naBarra = (pkg.contributes?.menus?.titleBar || []).map(m => m.command)
  checar('a barra de cima NAO tem o botao "Conversa" (t188: ele mandou tirar os tres)',
    !naBarra.includes('oficina.abrirConversa'), naBarra.join(', ') || 'barra sem contribuicao')
  checar('e o comando que ele chamava continua existindo (a conversa nao ficou sem porta)',
    (pkg.contributes?.commands || []).some(c => c.command === 'oficina.abrirConversa'),
    (pkg.contributes?.commands || []).map(c => c.command).join(', '))

  const passo = (pkg.contributes?.walkthroughs?.[0]?.steps || []).find(s => s.id === 'conversa')
  const apontaCerto = !!passo && passo.description.includes(`command:${NOSSO}`)
  checar('porta 3 (botao da tela de boas-vindas) passa pelo comando nosso', apontaCerto,
    passo ? (apontaCerto ? 'command:' + NOSSO : 'aponta para outro comando') : 'passo "conversa" sumiu')

  /*
    ⚠️ SUCESSOR DE: "nenhuma das tres chama `claude-vscode.` direto" (V2 — V22).

    Aquele criterio dizia, com razao para a epoca, que a OFICINA nao podia depender de uma loja
    para conversar. A V23 inverte o destino mas NAO inverte o principio — e a diferenca esta em
    UMA palavra: `direto`.

    O manifesto continua sem citar `claude-vscode.`: quem as portas chamam e o comando NOSSO, e e
    ele — codigo que viaja dentro do programa — que decide o destino e mantem o caminho de volta.
    Fosse o manifesto a apontar para a extensao, uma porta ficaria sem dono: sem a extensao
    instalada, a tecla voltaria a dar o "nao" mudo de 06/09/2026, que e o defeito que criou este
    arquivo. O criterio continua valendo, entao, e agora protege o caminho de volta.
  */
  const cru = JSON.stringify({
    keybindings: pkg.contributes?.keybindings?.filter(k => k.key === 'ctrl+t'),
    titleBar: pkg.contributes?.menus?.titleBar,
    passo,
  })
  checar('nenhuma porta do MANIFESTO chama `claude-vscode.` direto (quem decide o destino e o codigo nosso)',
    !cru.includes('claude-vscode.'), cru.includes('claude-vscode.') ? cru.slice(0, 200) : 'limpo')

  /*
    ⚠️ CRITERIO NOVO (V23), e ele existe porque o de cima sozinho ficou AMBIGUO.

    Com o manifesto limpo nos dois mundos — o destino sendo o painel nosso (V22) ou a conversa
    oficial (V23) —, o criterio acima passa dos dois jeitos. Sozinho, ele deixaria um `git revert`
    da V23 passar batido. Quem diz de que lado o produto esta e o CODIGO da porta.

    Nao e "o arquivo contem a string": e a ordem das tentativas dentro da funcao da porta, na
    sequencia em que elas serao executadas.
  */
  const corpo = fonte.slice(fonte.indexOf('async function abrirConversaOuExplicar()'))
  const corpoDaPorta = corpo.slice(0, corpo.indexOf('\n}') + 2)
  const ordem = [...corpoDaPorta.matchAll(/'(claude-vscode\.[a-zA-Z.]+)'/g)].map(m => m[1])
  checar('a porta tenta a conversa OFICIAL primeiro, na ordem declarada',
    JSON.stringify(ordem) === JSON.stringify(COMANDOS_DA_PORTA),
    `achei: ${JSON.stringify(ordem)} · esperado: ${JSON.stringify(COMANDOS_DA_PORTA)}`)

  /*
    ⚠️ E O CAMINHO DE VOLTA TEM DE ESTAR NO CORPO DA PORTA, depois das tentativas.

    Sem este criterio, tirar o `abrirPainel()` do fim da funcao — a linha que impede o "nao" mudo
    quando a extensao falta — passaria por todos os outros. E um `if` a menos, e nenhum criterio
    de manifesto o veria.
  */
  checar('a porta cai no painel nosso quando a oficial nao responde (o caminho de volta esta no corpo)',
    /abrirPainel\(\)/.test(corpoDaPorta), corpoDaPorta.slice(-200).replace(/\s+/g, ' '))

  /*
    ⚠️ SUCESSOR DE: "o caminho de volta para a extensao oficial existe, FORA das tres portas".

    A segunda metade daquele criterio morreu de verdade na V23: o comando `abrirConversaOficial`
    leva ao mesmo lugar que as portas agora, entao "fora das tres portas" deixou de descrever o
    produto. O que continua sendo verdade, e vale proteger, e que ele EXISTE e tem nome proprio na
    paleta — e que so ele oferece a loja quando a extensao falta, coisa que uma tecla de atalho
    nao deve fazer.
  */
  const comandos = (pkg.contributes?.commands || []).map(c => c.command)
  checar('o comando explicito da conversa oficial continua na paleta, com nome proprio',
    comandos.includes('oficina.abrirConversaOficial'))
  const inicioDoVolta = fonte.indexOf('async function abrirConversaOficial()')
  checar('e so ele oferece a loja quando a extensao falta (a porta cai calada no painel)',
    inicioDoVolta > 0 && /workbench\.extensions\.search/.test(fonte.slice(inicioDoVolta, inicioDoVolta + 900)))
}

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado', procurei: RAIZ }))
  process.exit(1)
}
console.log('executavel: ' + exe)

/**
 * Uma corrida do programa, com ou sem a extensao oficial instalada no perfil descartavel.
 *
 * Devolve as ferramentas de medicao ja montadas. Quem chama fecha no `finally`.
 */
async function abrirCorrida({ comOficial }) {
  const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-portas-'))
  const projeto = path.join(area, 'projeto')
  fs.mkdirSync(projeto, { recursive: true })
  fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'projeto de teste\n', 'utf8')

  const instalou = comOficial ? instalarConversaOficial(area) : false
  const app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(10000)

  /**
   * Os rotulos de TODAS as abas abertas agora.
   *
   * ⚠️ O detector conta ABAS, e nao webviews. Uma webview pode existir escondida, pertencer a
   * outra extensao, ou sobreviver a um fechamento; a aba e o que a pessoa ve.
   *
   * ⚠️ E ele devolve a LISTA, nao a contagem. A V23 precisa separar duas conversas que antes eram
   * uma so — a nossa se chama "Nova conversa", a da extensao oficial se chama "Claude Code" — e
   * um contador que so devolve numero esconde justamente a informacao que decide o criterio.
   * Quando um criterio falha, o detalhe ja mostra o nome real das abas, e nao ha o que adivinhar.
   */
  const rotulosDasAbas = () => win.evaluate(() =>
    [...document.querySelectorAll('.tabs-container .tab')]
      .map(t => (t.getAttribute('aria-label') || t.textContent || '').trim())
      .filter(Boolean))

  const daOficial = (rotulos) => rotulos.filter(t => /claude\s*code/i.test(t))
  const daNossa = (rotulos) => rotulos.filter(t => new RegExp(ABA_DA_CONVERSA_NOVA).test(t))

  const fecharTudo = async () => {
    if (!await abrirPaleta(win, respirar)) return
    // ⚠️ O texto vai ESCRITO no campo e conferido — teclado global cai no vazio quando a caixa
    // ainda nao tem foco, e a paleta fica mostrando a lista sem filtro (medido na V23).
    if (!await digitarNaPaleta(win, respirar, '>View: Close All Editors')) {
      await win.keyboard.press('Escape'); return
    }
    await respirar(1200)
    const item = win.locator('.quick-input-list .monaco-list-row', { hasText: 'Close All Editors' })
      .filter({ hasNotText: 'Ask in Chat' }).first()
    if (await item.count()) await item.click()
    else await win.keyboard.press('Escape')
    await respirar(1500)
  }

  /** Espera ate alguma aba de conversa aparecer; devolve os rotulos do que havia no fim. */
  const esperarConversa = async (segundos = 15) => {
    for (let i = 0; i < segundos * 2; i++) {
      const r = await rotulosDasAbas()
      if (daOficial(r).length || daNossa(r).length) return r
      await respirar(500)
    }
    return await rotulosDasAbas()
  }

  return { area, app, win, rotulosDasAbas, daOficial, daNossa, fecharTudo, esperarConversa, instalou }
}

/**
 * A extensao da OFICINA ja registrou os comandos dela?
 *
 * ⚠️ Sem isto o teste e INSTAVEL, e gate instavel e pior que gate vermelho: fica verde por sorte.
 * Medido em 06/09/2026, duas rodadas do MESMO codigo: na primeira (cache frio) o Ctrl+T nao
 * produziu nada; na segunda produziu. O que mudou foi o tempo de registro da extensao, nao o
 * produto. O teto de 8 tentativas e o mesmo de `extensao_claude.mjs`.
 */
async function esperarExtensaoPronta(win) {
  for (let tentativa = 1; tentativa <= 8; tentativa++) {
    if (!await abrirPaleta(win, respirar)) continue
    if (!await digitarNaPaleta(win, respirar, '>Abrir a conversa')) {
      await win.keyboard.press('Escape'); await respirar(800); continue
    }
    await respirar(1200)
    const achou = await win.locator('.quick-input-list .monaco-list-row', { hasText: 'Abrir a conversa' })
      .filter({ hasNotText: 'Ask in Chat' }).count() > 0
    await win.keyboard.press('Escape')
    await respirar(achou ? 300 : 2000)
    if (achou) return true
  }
  return false
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORRIDA 1 — COM a extensao oficial instalada: e o mundo que a pessoa usa
// ═══════════════════════════════════════════════════════════════════════════════
let c1 = null
try {
  c1 = await abrirCorrida({ comOficial: true })
  // ⚠️ O DETALHE E CONDICIONAL DE PROPOSITO. Na primeira corrida da V23 este criterio saiu
  // "OK" com a frase "nao achei o .vsix em cache" ao lado — o `checar` daqui imprime o detalhe
  // sempre, e eu tinha escrito nele so a mensagem do caso ruim. Um verde que diz o contrario de si
  // mesmo e pior que um vermelho: quem le a saida corrida acredita na frase.
  checar('a conversa oficial foi instalada no perfil do teste (sem ela, tudo abaixo prova o mundo errado)',
    c1.instalou, c1.instalou ? '' : 'nao achei o .vsix em cache nem o programa de linha de comando do build')

  const pronta = await esperarExtensaoPronta(c1.win)
  checar('a extensao da OFICINA esta registrada (o comando existe na paleta)', pronta,
    pronta ? '' : 'o comando nao apareceu em 8 tentativas — nada abaixo foi medido em condicao valida')

  // ── CONTROLE NEGATIVO: com tudo fechado, o detector NAO pode ver conversa ─────
  // Sem isto, um detector quebrado que devolvesse "achei" para qualquer aba daria todos os OK
  // abaixo sem nada ter acontecido na tela.
  await c1.fecharTudo()
  {
    const r = await c1.rotulosDasAbas()
    checar('controle: com tudo fechado o detector nao ve conversa nenhuma',
      c1.daOficial(r).length === 0 && c1.daNossa(r).length === 0, JSON.stringify(r))
  }

  /*
    ⚠️ CONTROLE POSITIVO DO DETECTOR DA CONVERSA OFICIAL — e ele vem ANTES de medir a porta.

    Todo criterio desta corrida depende de o detector reconhecer a aba DELA, e o nome dessa aba
    ("Claude Code") e dado dela, nao nosso: uma versao nova pode renomea-la sem avisar ninguem. Se
    isso acontecer, os criterios da porta ficam vermelhos por defeito do INSTRUMENTO, e alguem vai
    procurar o problema no produto.

    Entao a conversa dela e aberta aqui pelo comando DELA, e o detector precisa ve-la. Vermelho
    aqui significa "o detector nao serve mais", e a mensagem diz o nome real das abas.
  */
  {
    // ⚠️ A PALETA SE ABRE PELA FUNCAO DE `comum.mjs`, e nao pela tecla direta. Enquanto o foco
    // esta dentro de uma webview, `Control+Shift+P` e da webview e a paleta nunca abre — e a
    // conversa oficial que o programa abre sozinho na abertura E uma webview. Medido na V23: com a
    // tecla direta, este controle falhou com `abas: []` enquanto o Ctrl+T logo abaixo achava a aba
    // normalmente, ou seja, o vermelho era do teste. A funcao clica na barra de titulo para
    // devolver o foco ao workbench antes de mandar a tecla, e tenta ate 8 vezes.
    const paletaAbriu = await abrirPaleta(c1.win, respirar)
    const textoEntrou = await digitarNaPaleta(c1.win, respirar, '>Open in New Tab')
    await respirar(1200)
    const linhas = c1.win.locator('.quick-input-list .monaco-list-row')
      .filter({ hasText: 'Open in New Tab' }).filter({ hasNotText: 'Ask in Chat' })
    const quantos = await linhas.count()
    if (quantos) await linhas.first().click()
    else await c1.win.keyboard.press('Escape')
    const r = await c1.esperarConversa()
    checar('controle positivo: o detector reconhece a aba da conversa OFICIAL quando ela existe',
      c1.daOficial(r).length > 0,
      c1.daOficial(r).length > 0 ? '' :
        `abas: ${JSON.stringify(r)} · a paleta abriu: ${paletaAbriu} · o texto entrou: ${textoEntrou} · itens "Open in New Tab" na lista: ${quantos}`)
  }

  // ── porta 1: o Ctrl+T ────────────────────────────────────────────────────────
  //
  // ⚠️ SUCESSOR DE: "Ctrl+T abre a conversa da OFICINA" (V2 — V22), que media o painel nosso.
  // A pergunta nova tem DUAS metades, e a segunda e a que prova a decisao: alem de abrir a dela,
  // nao pode ter aberto a nossa. Sem a segunda metade, o criterio ficaria verde no produto V22
  // tambem — e um criterio que passa nos dois mundos nao separa nenhum dos dois.
  await c1.fecharTudo()
  await c1.win.locator('.monaco-workbench').first().press('Control+T')
  {
    const r = await c1.esperarConversa()
    const oficial = c1.daOficial(r).length
    const nossa = c1.daNossa(r).length
    checar('Ctrl+T abre a conversa OFICIAL', oficial > 0,
      oficial > 0 ? `${oficial} aba dela` : `NENHUMA conversa dela · abas: ${JSON.stringify(r)}`)
    checar('e NAO abre o painel nosso junto (a porta trocou de destino, nao ganhou um segundo)',
      nossa === 0, nossa ? `o painel nosso abriu tambem: ${JSON.stringify(r)}` : '')
  }

  // ── a rajada NAO pode abrir duas conversas ───────────────────────────────────
  //
  // ⚠️ ESTE CRITERIO DECIDIU QUAL COMANDO A PORTA USA, e por isso ele e o mais importante da
  // suite. A pessoa aperta Ctrl+T de novo quando acha que nao pegou, e cada conversa aberta e uma
  // sessao de agente.
  //
  // Lido no corpo das funcoes da extensao oficial (pacote 2.1.278), porque os titulos dos comandos
  // enganam: `editor.open` chamado sem id de sessao cria uma webview NOVA a cada chamada — com ele
  // na porta, a rajada abriria uma conversa por toque. Quem pergunta primeiro se ja existe
  // conversa e `focus`: ele entrega na visivel, REVELA a escondida, e so abre quando nao ha
  // nenhuma. E por isso que a porta usa `focus`.
  {
    await c1.win.locator('.monaco-workbench').first().press('Control+T')
    await respirar(600)
    await c1.win.locator('.monaco-workbench').first().press('Control+T')
    await respirar(3000)
    const r = await c1.rotulosDasAbas()
    const oficial = c1.daOficial(r).length
    checar('rajada de Ctrl+T nao abre uma segunda conversa', oficial === 1,
      `${oficial} aba(s) dela · ${JSON.stringify(r)}`)
  }

  // ── porta 2: FECHADA por ordem dele (t188) ──────────────────────────────────
  await c1.fecharTudo()
  {
    // ⚠️ O CRITERIO E O OPOSTO DO QUE ERA, e de proposito: ele mandou tirar os tres botoes da
    // barra de cima. Aqui se prova que o botao nao esta na tela — e o `abertura_v20.mjs` prova,
    // do outro lado, que a barra de cima continua servindo ao mostrador de tokens (t196).
    const botao = c1.win.locator('.titlebar-container [aria-label*="Conversa"], .title-bar [aria-label*="Conversa"]').first()
    const existe = await botao.count() > 0
    checar('o botao "Conversa" NAO esta na barra superior (t188)', !existe,
      existe ? 'o botao voltou para a barra' : '')
  }

  // ── porta 3: o comando da tela de boas-vindas ────────────────────────────────
  //
  // O botao do walkthrough dispara `command:oficina.abrirConversaOuExplicar`. Aqui ele e chamado
  // pela paleta, que e a mesma porta sem depender de a tela de boas-vindas estar aberta.
  await c1.fecharTudo()
  {
    await abrirPaleta(c1.win, respirar)
    await digitarNaPaleta(c1.win, respirar, '>Abrir a conversa')
    await respirar(1200)
    const item = c1.win.locator('.quick-input-list .monaco-list-row', { hasText: 'Abrir a conversa' })
      .filter({ hasNotText: 'Ask in Chat' }).first()
    if (await item.count()) await item.click()
    else await c1.win.keyboard.press('Escape')

    const r = await c1.esperarConversa()
    checar('o comando da tela de boas-vindas abre a conversa OFICIAL', c1.daOficial(r).length > 0,
      `abas: ${JSON.stringify(r)}`)
  }

  // ── CONTROLE POSITIVO do contador: ele consegue ler DOIS? ────────────────────
  //
  // ⚠️ Sem isto, "rajada nao abre uma segunda conversa" seria verde tambem se o detector fosse
  // incapaz de ver duas abas. O criterio que mais importa desta secao e um NEGATIVO, e negativo
  // sem controle positivo nao prova nada — a licao mais cara deste projeto (V0.5).
  {
    const lidos = await c1.win.evaluate(() => {
      const cont = document.querySelector('.tabs-container')
      if (!cont) return -1
      const falsas = []
      for (let i = 0; i < 2; i++) {
        const t = document.createElement('div')
        t.className = 'tab'
        t.setAttribute('aria-label', 'Claude Code de mentira ' + i)
        cont.appendChild(t)
        falsas.push(t)
      }
      const n = [...document.querySelectorAll('.tabs-container .tab')]
        .map(x => (x.getAttribute('aria-label') || x.textContent || '').trim())
        .filter(t => /claude\s*code/i.test(t)).length
      falsas.forEach(f => f.remove())
      return n
    })
    checar('controle positivo: o contador de conversas consegue ler DOIS', lidos >= 2,
      lidos === -1 ? 'nao achei a barra de abas' : `com dois nos injetados o contador leu ${lidos}`)
  }
} catch (e) {
  checar('corrida 1 (com a oficial) sem excecao', false, String(e && e.message || e))
} finally {
  if (c1?.app) await fecharApp(c1.app)
  try { if (c1) fs.rmSync(c1.area, { recursive: true, force: true }) } catch { }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORRIDA 2 — SEM a extensao oficial: o caminho de volta tem de pegar
// ═══════════════════════════════════════════════════════════════════════════════
//
// ⚠️ ESTA CORRIDA E A RAZAO DE O PAINEL PROPRIO TER FICADO NO PRODUTO. O defeito que criou este
// arquivo, em 06/09/2026, foi uma porta que chamava um comando inexistente e nao fazia nada — o
// "nao" mudo. A V23 devolve o destino para a extensao oficial, e devolveria o defeito junto se a
// porta nao tivesse para onde cair. Aqui se prova que tem.
let c2 = null
try {
  c2 = await abrirCorrida({ comOficial: false })

  const pronta = await esperarExtensaoPronta(c2.win)
  checar('sem a oficial, a extensao da OFICINA continua registrada', pronta,
    pronta ? '' : 'o comando nao apareceu em 8 tentativas')

  await c2.fecharTudo()
  {
    const r = await c2.rotulosDasAbas()
    checar('controle: sem a oficial e com tudo fechado, nenhuma conversa aberta',
      c2.daOficial(r).length === 0 && c2.daNossa(r).length === 0, JSON.stringify(r))
  }

  await c2.win.locator('.monaco-workbench').first().press('Control+T')
  {
    const r = await c2.esperarConversa()
    const nossa = c2.daNossa(r).length
    checar('sem a extensao oficial, o Ctrl+T cai no painel NOSSO (o caminho de volta pega)',
      nossa > 0, nossa > 0 ? `${nossa} aba nossa` : `NENHUMA conversa: voltou o "nao" mudo · abas: ${JSON.stringify(r)}`)
  }
} catch (e) {
  checar('corrida 2 (sem a oficial) sem excecao', false, String(e && e.message || e))
} finally {
  if (c2?.app) await fecharApp(c2.app)
  try { if (c2) fs.rmSync(c2.area, { recursive: true, force: true }) } catch { }
}

/**
 * ⚠️ O PISO DESTA SUITE MORA AQUI DENTRO, e nao na regressao.
 *
 * As outras suites tem piso numerico la, mas esta nao: a regressao a chama como UM criterio, que
 * so olha o codigo de saida. Ou seja, ate a V22 um criterio podia sumir daqui — ou a suite podia
 * encolher de 14 para 3 — sem nada ficar vermelho em lugar nenhum. A V23 subiu a contagem de 14
 * para 22, e seria o momento perfeito para uma perda passar despercebida. O numero saiu da
 * corrida real no executavel, nao da contagem a olho: sao 9 estaticos e 13 de comportamento.
 *
 * Fica aqui, e nao la, porque esta suite nao roda no ciclo rapido (precisa do executavel): um
 * piso na regressao seria conferido contra um numero que ninguem produziu naquela corrida.
 *
 * ⚠️ E ele conta CRITERIOS EXECUTADOS, nao criterios escritos. Se uma corrida morrer no meio, o
 * `catch` grava um criterio so e o total despenca — entao o piso tambem pega a suite que parou
 * pelo caminho, que e um modo de falha ja visto neste projeto: suite morrendo no meio e sendo
 * lida como "tinha menos criterios", em vez de "quebrou".
 */
const PISO = 22

const passou = res.every(r => r.ok) && res.length >= PISO
if (res.length < PISO) {
  console.log(`  FALHA  criterios de menos: ${res.length} de ${PISO}. Ou um criterio saiu sem substituto, ou a corrida morreu no meio.`)
}
console.log('\n' + JSON.stringify({ passou, total: res.length, piso: PISO, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
