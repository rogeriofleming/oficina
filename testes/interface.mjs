// INTERFACE — o que a pessoa VE quando abre a OFICINA num computador limpo.
//
// Este teste existe por causa do erro mais caro do projeto ate hoje (05-06/09/2026):
// os padroes de interface estavam no `configurationDefaults` do product.json, que o
// desktop NAO le (so o VS Code web). Durante versoes inteiras o documento de estado
// afirmou, em negrito, que aquilo "foi para o produto" — e valia so no perfil de
// quem tinha configurado a mao. Nenhum teste olhava a TELA: a fumaca cobra que o
// editor esteja vivo, a regressao cobra identidade e vazamento, e ninguem cobrava o
// layout. Um produto cuja promessa E o layout ficou sem gate justamente nele.
//
// Regra deste arquivo: cada criterio e medido no DOM da janela real, com perfil
// LIMPO e sem `--skip-welcome`. Nada e deduzido de configuracao lida — o que vale e
// o que aparece.
//
// Uso:  node testes/interface.mjs [caminho do exe] [--foto]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { fileURLToPath } from 'node:url'
import { RAIZ, carregarElectron, acharExe, lerCarimboOuDev, argumentosDeTeste, tirarFoto, esconderJanela, fecharApp, abrirOficina, modoDesenvolvimento } from './comum.mjs'

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

// Mesma exigencia da fumaca: sem carimbo nao se sabe QUAL build esta sendo medido, e
// a pasta de saida tem nome fixo. Um laudo de interface sem saber se e a OFICINA ou a
// linha de base nao vale nada — o --puro nao tem nenhum destes criterios, por
// definicao, e sairia todo vermelho parecendo regressao.
const carimbo = lerCarimboOuDev(exe)
const modo = process.argv.includes('--oficina') ? 'oficina'
  : process.argv.includes('--linha-de-base') ? 'puro'
  : carimbo?.modo
if (!modo) {
  console.log(JSON.stringify({
    passou: false,
    erro: 'este build nao tem carimbo (oficina-build.json) e ninguem disse o que ele deveria ser',
    oQueFazer: 'recompile pelo construir.bat (ele carimba), ou rode com --oficina / --linha-de-base'
  }))
  process.exit(1)
}
if (modo === 'puro') {
  console.log(JSON.stringify({
    passou: false,
    erro: 'este e um build de LINHA DE BASE: ele nao tem nenhum padrao de interface nosso',
    oQueFazer: 'meca a interface num build da OFICINA (construir.bat sem --puro)'
  }))
  process.exit(1)
}
console.log(`modo: ${modo}  (carimbo: tag ${carimbo?.tag}, de ${carimbo?.quando})`)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-interface-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'alvo.txt'), 'alvo\n')

// Quem roda com --settings=<arquivo> injeta configuracao de USUARIO no perfil
// descartavel antes de abrir. Serve para SONDA (experimentar um valor que ainda nao e
// do produto). Nao serve de gate: o gate mede o produto sozinho, com o perfil vazio.
const argSettings = process.argv.find(a => a.startsWith('--settings='))
if (argSettings) {
  const origem = argSettings.slice('--settings='.length)
  const destino = path.join(area, 'dados', 'User')
  fs.mkdirSync(destino, { recursive: true })
  fs.copyFileSync(origem, path.join(destino, 'settings.json'))
  console.log('SONDA: settings de usuario injetados a partir de ' + origem)
}

let app = null
let laudo = null
try {
  // ⚠️ pularBoasVindas: false de proposito — ver o porque em comum.mjs.
  app = await abrirOficina(_electron, {
    exe, projeto, area, opcoes: { pularBoasVindas: false }
  })

  const win = await app.firstWindow({ timeout: 60000 })

  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  // O layout se acomoda depois da primeira pintura (partes que aparecem e somem).
  // Sem esta espera, "visivel" e "invisivel" viram loteria.
  await win.waitForTimeout(3000)
  // V13: o icone de Skills e de uma extensao, e chega depois do nucleo. Sem esperar por ele, a contagem
  // dos icones da barra lateral mediria a corrida. Teto de 30 s; se nao chegar, o criterio acusa.
  await win.waitForSelector('.part.activitybar .composite-bar .action-label[aria-label="Skills"]', { timeout: 30000 }).catch(() => { })

  laudo = await win.evaluate(() => {
    const visivel = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return false
      const e = getComputedStyle(el)
      return e.display !== 'none' && e.visibility !== 'hidden'
    }
    const parte = (id) => {
      const el = document.getElementById(id)
      if (!el) return { existe: false, visivel: false }
      const r = el.getBoundingClientRect()
      return { existe: true, visivel: visivel(el), w: Math.round(r.width), h: Math.round(r.height) }
    }
    const titlebar = document.getElementById('workbench.parts.titlebar')
    // Texto E rotulo: os botoes da barra superior sao icones com aria-label, e o
    // texto visivel sozinho nao os enxergaria.
    //
    // ⚠️ So o que esta VISIVEL entra. O menu oculto continua no DOM com os oito nomes
    // ("File Edit Selection...") dentro dele: colher o textContent cru faria o laudo
    // descrever uma barra superior que ninguem ve, e o criterio do "Sign In" acusaria
    // um botao escondido como se estivesse na cara da pessoa. O que se mede aqui e o
    // que aparece.
    const rotulosDaBarra = titlebar
      ? Array.from(titlebar.querySelectorAll('[aria-label],[title]'))
          .filter(el => visivel(el))
          .map(el => (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim())
          .filter(Boolean)
      : []
    const textoVisivelDaBarra = titlebar
      ? Array.from(titlebar.querySelectorAll('*'))
          .filter(el => el.children.length === 0 && el.textContent.trim() && visivel(el))
          .map(el => el.textContent.trim())
          .join(' ')
      : ''
    const menubar = titlebar ? titlebar.querySelector('.menubar') : null
    return {
      statusbar: parte('workbench.parts.statusbar'),
      activitybar: parte('workbench.parts.activitybar'),
      // V13: os icones que a barra lateral mostra, pelo comeco do rotulo (o fim traz o atalho e a contagem).
      iconesDaLateral: Array.from(document.querySelectorAll('.part.activitybar .composite-bar .action-item'))
        .filter(li => visivel(li))
        .map(li => ((li.querySelector('.action-label') || li).getAttribute('aria-label') || '').replace(/\s*\(.*$/, '').trim()),
      auxiliarybar: parte('workbench.parts.auxiliarybar'),
      // A vista Tokens morou na barra secundaria da rodada 1 ate a V23. Na V24 ela saiu de la por
      // ordem dele ("eu nao quero essa aba da direita") e virou o quarto icone da barra de cima.
      tokensNaSecundaria: (() => {
        const aux = document.getElementById('workbench.parts.auxiliarybar')
        const v = document.querySelector('[id="workbench.view.extension.oficinaTokens"]')
        return !!(aux && v && aux.contains(v) && visivel(v))
      })(),
      sidebar: parte('workbench.parts.sidebar'),
      panel: parte('workbench.parts.panel'),
      titlebar: parte('workbench.parts.titlebar'),
      menubar: { existe: !!menubar, visivel: visivel(menubar) },
      itensDoMenu: menubar
        ? Array.from(menubar.querySelectorAll('.menubar-menu-button')).map(b => b.textContent.trim())
        : [],
      textoDaBarraSuperior: textoVisivelDaBarra.replace(/\s+/g, ' ').trim(),
      textoDaBarraSuperiorIncluindoOculto: titlebar ? titlebar.textContent.replace(/\s+/g, ' ').trim() : '',
      rotulosDaBarraSuperior: rotulosDaBarra,
      // O TEMA, lido da janela viva.
      //
      // Um tema pode existir no disco, ser contribuido por uma extensao valida, passar
      // no teste estatico -- e nao estar aplicado. Basta o `workbench.colorTheme` nao
      // chegar, ou o rotulo nao casar, e o produto abre com a cara do VS Code cru com
      // todos os testes verdes. E o mesmo defeito silencioso do `configurationDefaults`
      // antes do patch 0001, e por isso a prova tem que sair da TELA.
      //
      // Le-se a variavel que o proprio workbench publica a partir do tema carregado,
      // e nao a folha de estilo do tema padrao.
      tema: (() => {
        // ⚠️ As variaveis `--vscode-*` NAO moram no <body>: o workbench as publica na
        // sua propria raiz (`.monaco-workbench`). Lidas do body voltam TODAS vazias, e
        // um criterio que compara vazio com vazio passaria verde sem olhar nada.
        const raiz = document.querySelector('.monaco-workbench') || document.documentElement
        const cs = getComputedStyle(raiz)
        const v = (n) => (cs.getPropertyValue(n) || '').trim()
        // e a cor REALMENTE pintada, que e a prova final: variavel certa com regra de
        // CSS sobreposta ainda daria uma tela de outra cor.
        // ⚠️ por id, nao por querySelector: o id tem PONTO dentro
        // ("workbench.parts.titlebar") e num seletor CSS o ponto significa classe.
        // Sem escapar, o querySelector devolve null e o criterio compara vazio com
        // vazio -- foi o que aconteceu na primeira versao deste teste.
        const pintado = (id) => {
          const el = document.getElementById(id)
          return el ? getComputedStyle(el).backgroundColor : ''
        }
        return {
          fundoEditor: v('--vscode-editor-background'),
          fundoLateral: v('--vscode-sideBar-background'),
          fundoTitulo: v('--vscode-titleBar-activeBackground'),
          acentoFoco: v('--vscode-focusBorder'),
          cursor: v('--vscode-editorCursor-foreground'),
          pintadoTitulo: pintado('workbench.parts.titlebar'),
          pintadoLateral: pintado('workbench.parts.sidebar'),
          classesDoCorpo: Array.from(document.body.classList).filter(c => c.startsWith('vs') || c.includes('theme')),
        }
      })(),
      // Abas abertas: com startupEditor "none" a de boas-vindas nao pode existir.
      abas: Array.from(document.querySelectorAll('.tabs-container .tab .label-name'))
        .map(el => el.textContent.trim()),
      // O avatar de conta: no rodape da barra de atividade OU na barra superior,
      // conforme `workbench.activityBar.location`. Medir os dois lugares e o unico
      // jeito de responder ao pedido dele sem chutar.
      avatarNaBarraSuperior: titlebar
        ? titlebar.querySelectorAll('.action-item.icon.menu-entry, [class*="account"], [aria-label*="Account"], [aria-label*="account"]').length
        : 0,
      // O icone do canto superior esquerdo — o unico que a pessoa ve enquanto
      // trabalha. Ele NAO vem do .exe: o CSS o desenha como background-image do
      // `.window-appicon`. Ler o valor computado responde "de qual arquivo veio",
      // que e a pergunta que ficou sem resposta ate 06/09/2026.
      iconeDaBarraSuperior: (() => {
        const el = titlebar ? titlebar.querySelector('.window-appicon') : null
        if (!el) return { existe: false, fonte: '' }
        const bg = getComputedStyle(el).backgroundImage || ''
        return {
          existe: true,
          visivel: visivel(el),
          // A arte da OFICINA e um PNG embutido em SVG; a do upstream e vetor puro.
          // Se vier `data:`, e a nossa. Se vier um caminho de arquivo, e a do upstream.
          embutida: /data:image\//.test(bg),
          fonte: bg.slice(0, 120)
        }
      })(),
      larguraDaJanela: window.innerWidth,
      alturaDaJanela: window.innerHeight
    }
  })

  console.log('\n--- o que a janela mostra ---')
  console.log(JSON.stringify(laudo, null, 2))
  console.log('---\n')

  const barraSuperior = (laudo.textoDaBarraSuperior + ' ' + laudo.rotulosDaBarraSuperior.join(' ')).toLowerCase()

  checar('a barra de STATUS esta oculta', !laudo.statusbar.visivel,
    laudo.statusbar.visivel ? `visivel ${laudo.statusbar.w}x${laudo.statusbar.h}` : 'oculta')
  /*
    ⚠️ MUDOU TRÊS VEZES, E A TERCEIRA É A QUE VALE.

    V0: a barra de atividade era REMOVIDA ("barra lateral REMOVE", ordem dele).
    V13 (18/09/2026): voltou, com três botões — Arquivos, Git e Skills.
    V24 (24/09/2026): são QUATRO — o Tokens veio da barra da direita, que deixou de ter conteúdo nosso.
    V20 (21/09/2026): ele mandou os ícones para CIMA — *"esses negócio ao invés de lateral, eu
      quero em cima, na horizontal, entre a logo na esquerda e a barra de pesquisa no centro"*
      (t198). Com `workbench.activityBar.location: "top"`, a barra da LATERAL fica vazia e os
      ícones passam a morar na barra de título.

    O que se cobra agora é o resultado do pedido: a lateral não ocupa espaço. O VALOR do produto
    (`top`, e não `hidden`) é conferido em `guarda_produto.mjs` e na ponte — aqui se mede a tela.
  */
  checar('V20: a barra de atividade NAO ocupa a lateral (os icones foram para cima, t198)',
    !laudo.activitybar.visivel,
    laudo.activitybar.visivel ? `ainda visivel ${laudo.activitybar.w}x${laudo.activitybar.h}` : 'lateral livre')
  /*
    ⚠️ MUDOU DUAS VEZES. Depois da V18 a barra secundaria passou a NASCER ABERTA, porque a vista
    Tokens morava nela e ele a queria sempre a vista. Na V20 ele desfez: *"esse negocio inteiro na
    direita nao faz sentido, nao quero ele assim"* (t197), e os numeros subiram para a barra de
    cima (t196).
  */
  checar('V20: o painel SECUNDARIO (direita) NAO nasce aberto (t197)', !laudo.auxiliarybar.visivel,
    laudo.auxiliarybar.visivel ? `ainda visivel ${laudo.auxiliarybar.w}x${laudo.auxiliarybar.h}` : 'fechado')
  checar('o MENU (File Edit Selection...) esta oculto', !laudo.menubar.visivel,
    laudo.menubar.visivel ? laudo.itensDoMenu.join(' ') : 'oculto')
  checar('nao ha "Sign In" na barra superior', !barraSuperior.includes('sign in'),
    laudo.textoDaBarraSuperior.slice(0, 120))
  checar('nao ha "Open in Agents" na barra superior', !barraSuperior.includes('open in agents'), '')
  checar('nao abre a aba de BOAS-VINDAS (sem --skip-welcome)',
    !laudo.abas.some(t => /welcome|bem-vindo|get started/i.test(t)),
    laudo.abas.length ? laudo.abas.join(', ') : 'nenhuma aba aberta')
  // ⚠️ Este criterio nasceu de o DONO ver o produto e perguntar por que o icone nao
  // tinha trocado — depois de o projeto ter declarado a logo "aplicada em 7 destinos"
  // e ter PROVADO os 7 quadros dentro do .exe, byte a byte. A prova estava certa; era
  // a lista de destinos que tinha um buraco, e nenhum teste olhava para a janela.
  //
  // ⚠️ A primeira versao deste criterio media no lugar errado, e reprovou um build que
  // estava CERTO: ela exigia `data:image/` dentro do `background-image`, supondo que o
  // build embutiria o SVG no CSS. O gulp COPIA o arquivo (`out/media/code-icon.svg`) e
  // deixa a regra apontando para ele. A logo estava trocada; o teste e que olhava para
  // a URL em vez do conteudo.
  //
  // Agora a prova sai da tela e vai para o DISCO, como no resto da casa: le-se o
  // arquivo que o CSS aponta, com o `fs` DESTE processo, e cobra-se a nossa arte
  // dentro dele. Cobre os dois jeitos de o build entregar o icone.
  const icone = laudo.iconeDaBarraSuperior
  let iconeEhNosso = icone.embutida
  let detalheIcone = icone.fonte
  if (icone.existe && !iconeEhNosso) {
    // A URL vem como `vscode-file://vscode-app/<caminho>` dentro de `url("...")`.
    const m = /url\(["']?([^"')]+)["']?\)/.exec(icone.fonte || '')
    const bruto = m ? m[1] : ''
    const caminho = bruto.replace(/^vscode-file:\/\/vscode-app\//, '').replace(/^file:\/\/\//, '')
    try {
      const conteudo = fs.readFileSync(decodeURIComponent(caminho), 'utf8')
      iconeEhNosso = conteudo.includes('data:image/png;base64')
      detalheIcone = `${path.basename(caminho)}: ${conteudo.length} bytes, ` +
        (iconeEhNosso ? 'com a nossa arte dentro' : 'SEM a nossa arte (e o SVG do upstream)')
    } catch (e) {
      detalheIcone = 'nao consegui ler o arquivo apontado: ' + caminho
    }
  }
  checar('o icone da barra superior e a logo do PRODUTO (nao a do upstream)',
    icone.existe && iconeEhNosso,
    icone.existe ? detalheIcone : 'nao achei o .window-appicon na barra superior')

  // ── O TEMA ESTA APLICADO? ──────────────────────────────────────────────────────
  // A cor que o workbench esta usando tem que ser a NOSSA, lida do JSON do tema.
  // Comparar com o valor do arquivo (e nao com um hex escrito aqui) mantem o criterio
  // vivo quando a paleta mudar: quem regerar o tema nao precisa lembrar deste teste.
  {
    const caminhoTema = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'extensoes', 'oficina-temas', 'temas', 'oficina-escuro.json')
    let esperado = null
    try { esperado = JSON.parse(fs.readFileSync(caminhoTema, 'utf8')).colors } catch {}
    const lido = laudo.tema || {}
    const norm = (c) => (c || '').toLowerCase().replace(/\s/g, '')
    // `backgroundColor` volta como "rgb(25, 23, 21)"; o tema guarda "#191715".
    const hexDe = (rgb) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '')
      return m ? '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('') : (rgb || '')
    }
    const pares = esperado ? [
      ['fundo do editor', lido.fundoEditor, esperado['editor.background']],
      ['fundo da lateral', lido.fundoLateral, esperado['sideBar.background']],
      ['fundo da barra de titulo', lido.fundoTitulo, esperado['titleBar.activeBackground']],
      ['cor do cursor', lido.cursor, esperado['editorCursor.foreground']],
      ['barra de titulo PINTADA', hexDe(lido.pintadoTitulo), esperado['titleBar.activeBackground']],
      ['lateral PINTADA', hexDe(lido.pintadoLateral), esperado['sideBar.background']],
    ] : []
    const errados = pares.filter(([, a, b]) => norm(a) !== norm(b))
    checar('o tema OFICINA esta APLICADO na janela (cor lida da tela)',
      esperado !== null && pares.length > 0 && errados.length === 0,
      esperado === null ? 'nao consegui ler o JSON do tema'
        : errados.length ? errados.map(([n, a, b]) => `${n}: tela ${a || '(vazio)'} != tema ${b}`).join(' | ')
          : `editor ${lido.fundoEditor}`)
  }

  if (process.argv.includes('--foto')) {
    const destino = path.join(RAIZ, 'log', `interface_${Date.now()}.png`)
    await tirarFoto(win, destino)
    console.log('foto: ' + destino)
  }

  await fecharApp(app)
  app = null
} catch (e) {
  if (app) { try { await fecharApp(app) } catch {} }
  checar('execucao sem excecao', false, String(e).split('\n')[0])
}

try { fs.rmSync(area, { recursive: true, force: true }) } catch {}

const segundos = +((Date.now() - t0) / 1000).toFixed(1)
const passou = resultados.every(r => r.ok)
const saida = {
  passou,
  segundos,
  quando: new Date().toISOString(),
  exe,
  carimbo,
  sonda: argSettings ? argSettings.slice('--settings='.length) : null,
  criterios: resultados,
  laudo
}
try {
  fs.mkdirSync(path.join(RAIZ, 'log'), { recursive: true })
  const arq = path.join(RAIZ, 'log', `interface_${Date.now()}.json`)
  fs.writeFileSync(arq, JSON.stringify(saida, null, 2))
  console.log('\nlaudo: ' + arq)
} catch { /* o laudo em disco e conveniencia; o veredito abaixo e o que vale */ }

console.log('\n' + JSON.stringify({ passou, segundos, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
