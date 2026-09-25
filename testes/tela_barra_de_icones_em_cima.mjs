// OS ÍCONES DAS VISTAS NA BARRA DE CIMA — o pedido `t198`, medido na tela.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE, e por que ele é rigoroso com a POSIÇÃO.
//
// O pedido, com as palavras dele: *"esses negócio ao invés de lateral, eu quero em cima, na
// horizontal, entre a logo na esquerda e a barra de pesquisa no centro"*.
//
// A resposta anterior foi `activityBar.location: "top"`, e ela pareceu certa: os ícones ficam
// numa linha horizontal. Mas a linha fica no CABEÇALHO DA BARRA LATERAL — medido no build
// V20-B2: x = 4, 30, 56, 82, todos no mesmo y, e **altura zero com a lateral fechada**. Ou
// seja: clicar no ícone ativo fecha a lateral e a tela fica sem ícone nenhum para reabrir.
//
// Um teste que só medisse "os quatro estão em linha horizontal" teria APROVADO aquilo. Por
// isso os critérios daqui são de posição RELATIVA e de sobrevivência:
//
//   1. os ícones estão dentro da BARRA DE TÍTULO (não da lateral, não da barra de atividade);
//   2. estão em linha (mesmo y, x crescente);
//   3. estão À DIREITA da logo e À ESQUERDA da barra de pesquisa — as duas âncoras que ELE
//      nomeou, medidas pela caixa de cada uma, não por ordem no DOM;
//   4. continuam visíveis com a barra lateral FECHADA — o critério que reprova o estado
//      anterior, e a razão de o patch 0022 existir;
//   5. clicar num ícone abre a vista correspondente NA LATERAL (a barra mudou de lugar, não
//      de função);
//   6. não sobrou uma SEGUNDA barra de ícones (nem no cabeçalho da lateral, nem a vertical) —
//      um patch que desenha a nova e esquece de apagar a velha passaria nos cinco de cima.
//
// Uso:  node testes/tela_barra_de_icones_em_cima.mjs [caminho do executavel]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 230) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-emcima-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'conta.js'), 'const a = 1\n')

let app
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(12000)

  /**
   * Onde está cada coisa, pela caixa que o navegador desenhou.
   *
   * ⚠️ Item com caixa 0×0 conta como AUSENTE — foi assim que "top" enganou a medição
   * anterior: os quatro ícones estavam no DOM, com altura zero, e um teste que só
   * contasse elementos teria dito que eles estavam na tela.
   */
  const ler = async () => await win.evaluate(() => {
    const caixa = el => {
      if (!el) return null
      const c = el.getBoundingClientRect()
      if (c.width === 0 || c.height === 0) return null
      return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) }
    }
    /*
      ⚠️ O RÓTULO MORA NO FILHO, e não no item — medido com a sonda do DOM em 24/09/2026, depois de
      o critério novo do 0027 reprovar um build CERTO. O `.action-item` não tem `aria-label`; quem
      tem é o `.action-label` dentro dele (ou o `title`, quando o ícone é imagem). Lendo do lugar
      errado, todos os seis ícones vinham com rótulo vazio — e o teste dizia que "faltavam", com a
      barra perfeita na tela.

      É a mesma família dos achados desta versão: quem afirma tem de ler de onde o dado está.
    */
    const rotuloDe = el => {
      const lab = el.querySelector('.action-label')
      return ((lab && (lab.getAttribute('aria-label') || lab.title)) || el.getAttribute('aria-label') || el.textContent || '').trim()
    }
    const itens = seletor => Array.from(document.querySelectorAll(seletor))
      .map(el => ({ rotulo: rotuloDe(el), ...(caixa(el) || {}) }))
      .filter(i => i.w > 0)

    const naBarraDeTitulo = '.part.titlebar .titlebar-activity-container .action-item'
    const noCabecalhoDaLateral = '.part.sidebar .composite-bar-container .action-item, .part.sidebar .header-or-footer .action-item'
    const naBarraVertical = '.part.activitybar .action-item'

    return {
      titulo: caixa(document.querySelector('.part.titlebar')),
      logo: caixa(document.querySelector('.part.titlebar .window-appicon')),
      pesquisa: caixa(document.querySelector('.part.titlebar .command-center')),
      containerDaBarra: caixa(document.querySelector('.part.titlebar .titlebar-activity-container')),
      icones: itens(naBarraDeTitulo),
      aindaNaLateral: itens(noCabecalhoDaLateral),
      aindaNaVertical: itens(naBarraVertical),
      lateralVisivel: !!caixa(document.querySelector('.part.sidebar'))
    }
  })

  const t = await ler()
  console.log('\n  --- a barra de cima, como ela esta ---')
  console.log(`      barra de titulo:  ${JSON.stringify(t.titulo)}`)
  console.log(`      logo:             ${JSON.stringify(t.logo)}`)
  console.log(`      container:        ${JSON.stringify(t.containerDaBarra)}`)
  console.log(`      pesquisa:         ${JSON.stringify(t.pesquisa)}`)
  for (const i of t.icones) console.log(`      icone  x=${String(i.x).padStart(4)} y=${String(i.y).padStart(3)} ${i.w}x${i.h}  ${i.rotulo}`)
  console.log(`      sobrou na lateral: ${t.aindaNaLateral.length} · na vertical: ${t.aindaNaVertical.length}`)
  console.log('')

  // 1. dentro da barra de título
  checar('os icones das vistas estao DENTRO da barra de titulo',
    t.icones.length >= 2 && !!t.containerDaBarra,
    `${t.icones.length} icone(s); container ${t.containerDaBarra ? 'existe' : 'NAO existe'}`)

  // 2. em linha horizontal
  if (t.icones.length >= 2) {
    const ys = new Set(t.icones.map(i => i.y))
    const xs = t.icones.map(i => i.x)
    const crescente = xs.every((x, n) => n === 0 || x > xs[n - 1])
    checar('estao em LINHA horizontal (mesmo y, x crescente)',
      ys.size === 1 && crescente, `y: ${[...ys].join(',')} · x: ${xs.join(',')}`)
  } else {
    checar('estao em LINHA horizontal (mesmo y, x crescente)', false, 'menos de 2 icones para medir')
  }

  // 3. entre a logo e a barra de pesquisa — as âncoras que ELE nomeou
  if (t.icones.length && t.logo && t.pesquisa) {
    const primeiro = t.icones[0]
    const ultimo = t.icones[t.icones.length - 1]
    const depoisDaLogo = primeiro.x >= (t.logo.x + t.logo.w)
    const antesDaPesquisa = (ultimo.x + ultimo.w) <= t.pesquisa.x
    checar('estao DEPOIS da logo e ANTES da barra de pesquisa',
      depoisDaLogo && antesDaPesquisa,
      `logo termina em ${t.logo.x + t.logo.w} · icones ${primeiro.x}..${ultimo.x + ultimo.w} · pesquisa comeca em ${t.pesquisa.x}`)
  } else {
    checar('estao DEPOIS da logo e ANTES da barra de pesquisa', false,
      `logo ${t.logo ? 'ok' : 'nao achei'} · pesquisa ${t.pesquisa ? 'ok' : 'nao achei'} · ${t.icones.length} icone(s)`)
  }

  /*
    4b. ⛔ A DIVIDA DO PATCH 0027, PAGA — V26.

    O 0027 existe porque a largura reservada por icone (26 px) tinha ficado menor que o icone real
    (32 px): com CINCO fixados, dois caiam no transbordo "Additional Views". Ele foi corrigido e
    entrou em dois builds, mas NUNCA foi provado na tela, porque de fabrica havia so quatro icones
    e quatro cabiam de qualquer jeito — ou seja, estava escrito e nao medido.

    A V26 fixa o quinto (Conexoes) e o SEXTO (Conta) — entao este e o momento de cobrar. O criterio
    nao conta um numero copiado: ele deriva os fixados de fabrica do MANIFESTO e do `product.json`
    (a mesma conta que o `ponte.mjs` faz no guia), e exige que cada um esteja na barra com caixa de
    verdade, e que NADA tenha caido no transbordo.
  */
  {
    const manifesto = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
    const produto = JSON.parse(fs.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
    const soltos = produto.defaultUnpinnedViewContainers || []
    const nossosFixados = (manifesto.contributes.viewsContainers.activitybar || [])
      .filter(c => !soltos.includes('workbench.view.extension.' + c.id))
      .map(c => c.title)
    const rotulos = t.icones.map(i => i.rotulo).join(' | ')
    const faltando = nossosFixados.filter(nome => !t.icones.some(i => i.rotulo.includes(nome)))
    const transbordo = t.icones.filter(i => /Additional Views|Vistas adicionais/i.test(i.rotulo))
    checar('⛔ 0027: TODO icone fixado de fabrica esta na barra, e nada caiu no transbordo',
      faltando.length === 0 && transbordo.length === 0,
      `fixados nossos: ${nossosFixados.join(', ')} · na barra: ${rotulos} · faltando: ${faltando.join(', ') || 'nenhum'} · transbordo: ${transbordo.length}`)
    // E o passo entre eles e o mesmo: se a conta do patch discordasse do CSS, os icones se
    // sobreporiam ou sobraria buraco — e isso aparece na diferenca entre os x.
    if (t.icones.length >= 3) {
      const passos = t.icones.slice(1).map((i, n) => i.x - t.icones[n].x)
      const iguais = passos.every(p => Math.abs(p - passos[0]) <= 1)
      checar('⛔ 0027: o passo entre os icones e o mesmo (a conta do patch bate com o CSS)',
        iguais, `passos: ${passos.join(', ')} px`)
    }
  }

  // 6. nenhuma segunda barra sobrou
  checar('nao sobrou uma SEGUNDA barra de icones (cabecalho da lateral ou vertical)',
    t.aindaNaLateral.length === 0 && t.aindaNaVertical.length === 0,
    `lateral: ${t.aindaNaLateral.map(i => i.rotulo).join(',') || 'nada'} · vertical: ${t.aindaNaVertical.map(i => i.rotulo).join(',') || 'nada'}`)

  // 5. clicar abre a vista NA LATERAL
  let abriu = null
  if (t.icones.length) {
    const alvo = win.locator('.part.titlebar .titlebar-activity-container .action-item').first()
    const rotulo = t.icones[0].rotulo
    try {
      await alvo.click({ timeout: 8000 })
      await respirar(2500)
      abriu = await win.evaluate(() => {
        const lateral = document.querySelector('.part.sidebar')
        const c = lateral?.getBoundingClientRect()
        const titulo = lateral?.querySelector('.composite.title .title-label, .title-label')
        return {
          lateralAberta: !!(c && c.width > 0 && c.height > 0),
          tituloDaVista: (titulo?.textContent || '').trim()
        }
      })
    } catch (e) { abriu = { erro: String(e.message).slice(0, 90) } }
    checar('clicar num icone abre a vista NA BARRA LATERAL',
      !!abriu?.lateralAberta, `clicado "${rotulo}" → lateral ${abriu?.lateralAberta ? 'aberta, mostrando "' + abriu.tituloDaVista + '"' : 'fechada'} ${abriu?.erro || ''}`)
  } else {
    checar('clicar num icone abre a vista NA BARRA LATERAL', false, 'sem icone para clicar')
  }

  // 4. O CRITÉRIO QUE REPROVA O ESTADO ANTERIOR: fechar a lateral e os ícones continuarem lá.
  {
    // Fecha pela ação do núcleo, não por clique no ícone: o que se mede é a lateral FECHADA,
    // e chegar lá por caminhos diferentes não deve mudar o resultado.
    await win.locator('.monaco-workbench').first().press('Control+B')
    await respirar(2500)
    const d = await ler()
    console.log(`\n  --- com a lateral FECHADA (lateral visivel: ${d.lateralVisivel}) ---`)
    for (const i of d.icones) console.log(`      icone  x=${String(i.x).padStart(4)} y=${String(i.y).padStart(3)} ${i.w}x${i.h}  ${i.rotulo}`)
    console.log('')
    checar('com a barra lateral FECHADA os icones CONTINUAM na tela',
      d.icones.length === t.icones.length && d.icones.length > 0,
      `lateral visivel: ${d.lateralVisivel} · ${d.icones.length} icone(s) contra ${t.icones.length} com ela aberta`)
  }

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
