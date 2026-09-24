// O SEGUNDO CLIQUE FECHA — a barra de icones de cima alterna, medida na tela (V24, patch 0024).
//
// ⚠️ POR QUE ESTA SUITE EXISTE. O defeito foi achado pelo dono usando o produto, em 24/09/2026:
//
//   "quando eu clico, abre, quando eu clico em outro, troca para o outro que eu cliquei, mas
//    quando eu clico de novo no mesmo, ele nao fecha (...) uma vez aberta aquela aba lateral ela
//    fica aberta o tempo inteiro e eu nao consigo fechar ela para deixar o chat na tela cheia"
//
// A causa estava no nucleo: o toggle de `ViewContainerActivityAction.run()` e guardado por
// `if (this.part === Parts.ACTIVITYBAR_PART)`, e o patch 0022 criou a barra de cima passando
// `Parts.TITLEBAR_PART`. O bloco era pulado e a execucao caia no `openPaneComposite` do fim, que
// SEMPRE abre. O patch 0024 aceita as duas partes.
//
// ⚠️ E POR QUE ELA PRECISA ABRIR O PROGRAMA. O conserto e uma condicao em TypeScript do nucleo:
// nao existe nada para medir em node puro, e o `.js` compilado so existe depois do build. Um teste
// que lesse o `.patch` provaria que a linha foi ESCRITA, nao que o clique fecha a lateral — e o
// projeto ja pagou caro por essa diferenca. O clique aqui e clique de verdade.
//
// ⚠️ O CONTROLE QUE IMPEDE O VERDE FACIL. "A lateral fechou" e um criterio NEGATIVO: ele fica
// verde sozinho se o detector nao souber ver a lateral, ou se ela nunca tiver aberto. Por isso a
// ordem e: provar que o detector ve a lateral ABERTA, provar que a troca entre icones funciona, e
// so entao cobrar o fechamento. Sem os dois primeiros, o terceiro nao vale nada.
//
// Uso: node testes/tela_toggle_da_barra.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RAIZ, carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const _electron = await carregarElectron()

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + detalhe + ')' : ''}`)
}
const respirar = (ms) => new Promise(r => setTimeout(r, ms))

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado', procurei: RAIZ }))
  process.exit(1)
}
console.log('executavel: ' + exe)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-toggle-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto, { recursive: true })
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'projeto de teste\n', 'utf8')

let app = null
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(12000)

  /** A lateral esquerda esta visivel AGORA? Medida por tamanho real, nao por classe. */
  const lateral = () => win.evaluate(() => {
    const p = document.querySelector('.part.sidebar')
    return {
      visivel: !!(p && (p.offsetWidth || p.offsetHeight)),
      largura: p ? p.offsetWidth : null,
      vista: (document.querySelector('.part.sidebar .composite.title h2, .part.sidebar .title-label h2, .part.sidebar .pane-header h3') || {}).textContent?.trim() || null,
    }
  })

  /**
   * Os icones da barra de cima, na ordem em que estao.
   *
   * ⚠️ O ROTULO NAO ESTA NO `action-item`: esta no `.action-label` DENTRO dele. A primeira
   * versao desta funcao lia `aria-label` do proprio `li` e filtrava por `Boolean` — como o `li`
   * nao tem rotulo nenhum, TODOS viravam string vazia e a lista voltava `[]`. O seletor estava
   * certo o tempo todo (4 itens); cego era o filtro.
   *
   * E isso quase passou por defeito do produto: com a lista vazia, os criterios de "abriu" ficam
   * vermelhos e os de "fechou" ficam VERDES — porque a lateral nunca abriu. Foram os controles
   * (a lateral comeca fechada, a troca entre icones) que mostraram que o vermelho era do teste.
   */
  const icones = () => win.evaluate(() =>
    [...document.querySelectorAll('.titlebar-activity-container .action-item')]
      .map(li => {
        const lab = li.querySelector('.action-label')
        return ((lab && (lab.getAttribute('aria-label') || lab.title)) || li.getAttribute('aria-label') || '').trim()
      })
      .filter(Boolean))

  /**
   * Clica no icone cujo rotulo contem `nome`.
   *
   * O rotulo do nucleo vem em ingles e com o atalho junto ("Explorer (Ctrl+Shift+E)"), e o das
   * nossas vistas vem do manifesto ("Tokens", "Skills") — por isso a busca e por PEDACO do texto,
   * e quem chama passa as duas formas quando o nome depende de quem registrou a vista.
   */
  const clicarIcone = async (nome) => {
    const alvo = win.locator(`.titlebar-activity-container .action-item .action-label[aria-label*="${nome}"]`).first()
    if (!await alvo.count()) return false
    await alvo.click()
    await respirar(1500)
    return true
  }

  // ── 0. a barra de icones existe, e e a de cima ───────────────────────────────
  const lista = await icones()
  checar('a barra de icones de CIMA existe e tem icones', lista.length > 0, JSON.stringify(lista))

  /*
    ⚠️ O QUARTO ICONE (V24). A vista Tokens saiu da barra da direita e veio para ca — e o guia de
    boas-vindas diz "quatro botoes". Se um dia alguem a mover de novo, este criterio e o guia
    discordam do produto ao mesmo tempo, e ha um criterio na `ponte.mjs` cobrando o numero dito.
  */
  checar('e o Tokens esta entre eles (saiu da barra da direita na V24)',
    lista.some(t => /token/i.test(t)), JSON.stringify(lista))

  /*
    ⚠️ OS QUATRO ICONES TEM DE TER O MESMO TAMANHO — e este criterio nasceu de um defeito MEU.

    Os icones da barra vem de duas fontes: os do nucleo (Arquivos, Git) sao `codicon`, que se
    dimensionam pela FONTE; os das nossas vistas (Tokens, Skills) sao imagem de fundo, que precisa
    de `width`/`height`. O patch 0025 subiu 16 -> 20 mexendo so na regra de imagem, porque o
    seletor do 0022 termina em `:not(.codicon)` — exclusao correta, que eu li como se alcancasse os
    quatro. Resultado medido no build V24-B1: 22x22 contra 26x26, lado a lado, na mesma barra.
    Ficou MAIS desigual do que antes do conserto, quando os quatro tinham o mesmo tamanho errado.

    O patch 0026 fez os codicons crescerem por `font-size`. Este criterio existe para que a proxima
    mudanca de tamanho tenha de mexer nos DOIS lugares: se alguem subir so um, aqui fica vermelho.

    ⚠️ Compara o tamanho RENDERIZADO do rotulo, nao o `font-size`: um codicon de 20px de fonte e
    uma imagem de 20px de largura sao a mesma coisa na tela e numeros diferentes no CSS. Medir o
    CSS faria este criterio reprovar o produto certo.
  */
  {
    const tamanhos = await win.evaluate(() =>
      [...document.querySelectorAll('.titlebar-activity-container .action-item')].map(li => {
        const lab = li.querySelector('.action-label')
        return {
          rotulo: (lab && (lab.getAttribute('aria-label') || lab.title)) || '(sem rotulo)',
          tamanho: lab ? `${lab.offsetWidth}x${lab.offsetHeight}` : null,
        }
      }))
    const distintos = [...new Set(tamanhos.map(t => t.tamanho))]
    checar('⛔ os quatro icones da barra tem o MESMO tamanho (0025 e 0026 andam juntos)',
      tamanhos.length >= 2 && distintos.length === 1, JSON.stringify(tamanhos))
  }

  // ── 1. CONTROLE: a lateral comeca FECHADA ────────────────────────────────────
  // O produto fecha a lateral na abertura (para a conversa ficar na frente). Se ela ja estivesse
  // aberta aqui, o "abriu" do passo 2 seria verde sem o clique ter feito nada.
  {
    const l = await lateral()
    checar('controle: a lateral comeca FECHADA (senao o "abriu" abaixo nao prova nada)',
      l.visivel === false, JSON.stringify(l))
  }

  // ── 2. o primeiro clique ABRE ────────────────────────────────────────────────
  const achouArquivos = await clicarIcone('Arquivos') || await clicarIcone('Explorer')
  {
    const l = await lateral()
    checar('1o clique no icone de Arquivos: a lateral ABRE',
      achouArquivos && l.visivel === true && l.largura > 0, JSON.stringify(l))
  }

  // ── 3. clicar em OUTRO icone TROCA, sem fechar ───────────────────────────────
  // Este e o comportamento que ele descreveu como certo ("quando eu clico em outro, troca"), e
  // serve de controle positivo do detector: a lateral continua visivel entre os dois cliques.
  const achouSkills = await clicarIcone('Skills')
  {
    const l = await lateral()
    checar('clique em OUTRO icone (Skills): TROCA de vista, e a lateral continua aberta',
      achouSkills && l.visivel === true, JSON.stringify(l))
  }

  // ── 4. O CRITERIO DELE: o segundo clique no MESMO icone FECHA ────────────────
  {
    await clicarIcone('Skills')
    const l = await lateral()
    checar('⛔ 2o clique no MESMO icone: a lateral FECHA (o pedido dele, patch 0024)',
      l.visivel === false, JSON.stringify(l))
  }

  // ── 5. e volta a abrir, para nao ficar um fechamento sem volta ───────────────
  // Sem isto, um produto que fechasse a lateral e nao a reabrisse mais passaria no criterio 4.
  {
    await clicarIcone('Skills')
    const l = await lateral()
    checar('3o clique: abre de novo (o toggle alterna, nao e um botao de fechar)',
      l.visivel === true, JSON.stringify(l))
  }

  // ── 6. a barra da DIREITA continua fora (o outro pedido dele, V24) ───────────
  {
    const direita = await win.evaluate(() => {
      const p = document.querySelector('.part.auxiliarybar')
      return { visivel: !!(p && (p.offsetWidth || p.offsetHeight)), largura: p ? p.offsetWidth : null }
    })
    checar('a barra da DIREITA continua fechada depois de tudo isso',
      direita.visivel === false, JSON.stringify(direita))
  }

} catch (e) {
  checar('execucao sem excecao', false, String(e && e.message || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

/**
 * ⚠️ PISO PROPRIO, pelo mesmo motivo da suite das portas: a regressao chama esta suite como UM
 * criterio, que so olha o codigo de saida. Sem piso, um criterio pode sumir daqui — ou a corrida
 * pode morrer no meio, gravando um criterio so no `catch` — e nada fica vermelho.
 */
const PISO = 9

const passou = res.every(r => r.ok) && res.length >= PISO
if (res.length < PISO) {
  console.log(`  FALHA  criterios de menos: ${res.length} de ${PISO}. Ou um criterio saiu sem substituto, ou a corrida morreu no meio.`)
}
console.log('\n' + JSON.stringify({ passou, total: res.length, piso: PISO, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
