// O MOSTRADOR DO LIMITE DENTRO DO EDITOR DE VERDADE — o que só a janela responde.
//
// ⚠️ ESTE ARQUIVO MEDE DUAS COISAS QUE NENHUM MOTOR MEDE, e uma terceira que é a mais importante
// hoje:
//
//   1. **CABE?** O texto mais largo que o mostrador pode chegar a ter (`5h 100%! · 7d 100%! ·
//      há 59 min`) empurra alguma coisa na barra de cima? A resposta depende da fonte, do tema, da
//      largura da janela e do que mais está ali — nada disso existe fora do editor. A medida é
//      direta: uma sonda com a cara do item é INSERIDA na barra, e se mede se os controles da
//      janela andaram e se a barra de pesquisa encolheu.
//   2. **DÁ PARA LER?** O contraste do texto contra o fundo da barra, **nos dois temas**, lido do
//      que o navegador de fato calculou — não do gerador de temas.
//   3. **O ITEM APARECE OU SOME, conforme o núcleo.** Com o patch 0016 (build da V19 em diante) o
//      mostrador TEM de estar na barra, sozinho, com a forma que o motor produz. Sem o patch ele
//      TEM de sumir, sem deixar `${...}` escrito na tela. Nos dois casos o comando continua
//      existindo, com nome de gente, na paleta.
//
// ⚠️ ESTE ARQUIVO MUDOU NO BUILD DA V19 (20/09/2026), e vale contar por quê. Ele nasceu quando o
// único executável disponível era o do build anterior, cujo núcleo não tinha o patch — então
// cobrava "o item some" como se fosse a única verdade possível, e inseria um CLONE do item para
// medir o espaço. Rodado contra o build da V19, deu **6 vermelhos**: dois porque o item passou a
// aparecer (que era exatamente o que o dono pediu) e quatro porque, com o mostrador já na barra,
// o clone somava um SEGUNDO mostrador e a conta de "quanto a barra de pesquisa cede" media 242 px
// de texto onde o produto põe 81. Os dois consertos estão marcados no corpo, com o porquê.
//
// Sem conta e sem gasto: nenhuma mensagem vai ao agente.
//
// Uso:  node testes/tela_limite_barra.mjs [caminho do executavel]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, abrirPaleta, digitarNaPaleta, extensaoForaDeSincronia, temasForaDeSincronia } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const L = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'limite.js'))
// V20: quem mora na barra de cima agora e o mostrador de TOKENS (t196). O texto medido sai dele (`MT`, abaixo).

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 220) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
  const temas = temasForaDeSincronia(exe, REPO)
  checar('os temas DENTRO do executavel sao os do repositorio', temas.length === 0, temas.join(', '))
}

/**
 * O TEXTO MAIS LARGO QUE O MOSTRADOR PODE TER — tirado do próprio motor, e não escrito à mão.
 *
 * ⚠️ Escrito à mão, ele ficaria velho no primeiro dia em que o formato mudasse, e o critério
 * passaria a medir um texto que o produto não produz mais.
 */
/*
  ⚠️ V20 — O QUE MORA NA BARRA DE CIMA MUDOU, E ESTE ARQUIVO MUDOU COM ELE.

  Até a V19 a barra trazia o mostrador do LIMITE (`5h 41% · 7d 77%`). Na leva de 21/09/2026 ele
  mandou tirar o limite dali (`t188`: "tira os 3 e o limite também") e pôr o mostrador de TOKENS no
  lugar (`t196`: "tokens tem que ficar assim, entre a barra de pesquisa e os botões"). O limite
  virou a faixa de medidores, que é outra parte da tela.

  As duas perguntas que este arquivo existe para responder continuam valendo, e só elas é que
  importam: **cabe** na barra sem empurrar nada, e **dá para ler** nos dois temas. O que mudou é o
  texto medido — e ele continua saindo do motor de verdade, nunca escrito à mão.
*/
/*
  ⚠️ V27: O TEXTO VEM DO FORMATO DO PAINEL (`mostradorDeTokens.itemDoPainel`), e o pior caso CRESCEU.
  Com várias conversas na janela a linha ganha colchetes, `+N`, o total e, sem pasta, o aviso na
  frente. É por isso que ele tem de ser medido de novo aqui, e não herdado da V20.
*/
const MT = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'mostradorDeTokens.js'))
function textoMaisLargo() {
  // O pior caso: sem pasta, nome longo, várias conversas, números grandes e preço faltando (o
  // relógio do cache saiu da linha na V27: ele mora no rodapé do chat oficial).
  const item = MT.itemDoPainel('Uma conversa com nome comprido demais', {
    contextoAgora: 999000, tokens: 999000000, custoUsd: 9999.99, faltouPreco: true,
  })
  return `${MT.AVISO_SEM_PASTA}  [${item}]  +9  │  ${MT.dinheiro(99999.99)}  ${MT.tokens(9999000)}/${MT.tokens(9999000000)}`
}
const O_MAIS_LARGO = textoMaisLargo()
/** O texto de TODO DIA: uma conversa com nome, números comuns — é este que fica na tela quase sempre. */
const O_DE_TODO_DIA = MT.itemDoPainel('Catálogo skills', {
  contextoAgora: 117000, tokens: 2000000, custoUsd: 2.5, faltouPreco: false,
})
checar('o texto mais largo possível sai do próprio mostrador (nada escrito à mão)',
  /999k/.test(String(O_MAIS_LARGO)) &&
  String(O_MAIS_LARGO).includes(MT.AVISO_SEM_PASTA), String(O_MAIS_LARGO))
checar('o texto de todo dia também sai do mostrador, no formato do painel',
  O_DE_TODO_DIA === 'Catálogo skills  $2.50  117k/2.0M', String(O_DE_TODO_DIA))

const contraste = (a, b) => {
  const lum = c => {
    const [r, g, b2] = c
    const f = v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2)
  }
  const la = lum(a), lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const rgb = texto => {
  const m = String(texto).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/**
 * O QUE SE MEDE DENTRO DA JANELA, com a sonda inserida e tirada.
 *
 * A sonda é um CLONE de um item que já está na barra, com o ícone trocado por texto. Clonar, em
 * vez de montar do zero, é o que garante que ela herde TODA a cascata de estilo do lugar onde o
 * item de verdade vai ficar — classe, preenchimento, fonte, altura.
 */
const SONDAR = maisLargo => {
  const barra = document.querySelector('.part.titlebar')
  const container = barra && barra.querySelector('.titlebar-container')
  const acoes = barra && barra.querySelector('.action-toolbar-container .actions-container')
  const controles = barra && barra.querySelector('.window-controls-container')
  const centro = barra && barra.querySelector('.titlebar-center')
  if (!barra || !container || !acoes) return { erro: 'nao achei a barra de cima' }

  const estiloDaBarra = getComputedStyle(barra)
  const itens = [...acoes.querySelectorAll(':scope > .action-item')]
  const rotulos = itens.map(i => (i.textContent || '').trim()).filter(Boolean)

  const retrato = () => ({
    controles: controles ? Math.round(controles.getBoundingClientRect().left) : null,
    centro: centro ? Math.round(centro.getBoundingClientRect().width) : null,
    acoes: Math.round(acoes.getBoundingClientRect().width),
    barra: Math.round(container.getBoundingClientRect().width),
    rolagem: Math.round(container.scrollWidth),
  })

  /*
    ⚠️ O MOSTRADOR DE VERDADE É FOTOGRAFADO E DEPOIS ESCONDIDO — e isto é o coração da medida.

    Num núcleo que JÁ TEM o patch 0016, o mostrador está na barra antes de a sonda entrar. Somar
    um clone por cima dele mede DOIS mostradores, um caso que não existe no produto: em janela
    estreita a barra de pesquisa cedia 104 px para 242 px de mostrador e o critério (teto de 80)
    acusava o produto de um custo que ele não tem. Escondendo o item real antes do retrato
    `antes`, toda diferença medida daqui para baixo é a de UM mostrador — que é o que o produto
    de fato põe na barra.

    Num núcleo SEM o patch não há item de texto nenhum para esconder, e nada nesta medida muda:
    é por isso que o mesmo arquivo continua valendo para as duas situações.
  */
  const comTexto = itens.filter(i => (i.textContent || '').trim())
  const real = {
    quantos: comTexto.length,
    rotulos: comTexto.map(i => (i.textContent || '').trim()),
    cor: comTexto.length
      ? getComputedStyle(comTexto[0].querySelector('.action-label') || comTexto[0]).color : null,
    largura: comTexto.length ? Math.round(comTexto[0].getBoundingClientRect().width) : 0,
    textoDaBarra: (barra.textContent || '').trim(),
    /*
      ⚠️ O TETO DO ITEM REAL — e por que ele é medido AQUI, e não na sonda.

      Tudo o que este arquivo mede de espaço é medido numa SONDA, que é um clone do último item da
      barra. Isso basta para o espaço; não basta para o patch 0023. O clone herda o estilo do
      original, então, depois do patch, a sonda passaria a truncar e os critérios de espaço ficariam
      verdes — sem que nada provasse que o item que a pessoa vê é o que ganhou o teto. Seria verde
      por herança, que é o jeito mais barato de um teste mentir.

      Estes dois campos olham o ITEM DE VERDADE: o teto que o navegador calculou e a classe que o
      patch acrescenta.
    */
    teto: comTexto.length ? getComputedStyle(comTexto[0]).maxWidth : null,
    temAClasseDoPatch: comTexto.length ? comTexto[0].classList.contains('oficina-rotulo-vivo') : false,
  }
  const escondidos = comTexto.map(i => { const antesDisplay = i.style.display; i.style.display = 'none'; return { i, antesDisplay } })
  void container.offsetWidth

  const antes = retrato()

  const modelo = itens[itens.length - 1]
  if (!modelo) return { erro: 'a barra de cima nao tem item nenhum para servir de modelo' }
  const sonda = modelo.cloneNode(true)
  /*
    ⚠️ O MODELO PODE SER O PRÓPRIO MOSTRADOR, que acabou de ser escondido acima — e o clone herda
    o `display:none` junto. Medido: a sonda ficava com **0 px**, "nada se mexia na barra", e três
    critérios de espaço passavam VERDES sem medir coisa alguma. Quem pegou foi o critério "a sonda
    ocupa o que um texto desse tamanho ocupa (e não zero)", que existe exatamente para isso.
  */
  const doModelo = escondidos.find(e => e.i === modelo)
  sonda.style.display = doModelo ? doModelo.antesDisplay : modelo.style.display
  const rotulo = sonda.querySelector('.action-label')
  if (!rotulo) return { erro: 'o item da barra nao tem rotulo' }
  for (const c of [...rotulo.classList]) if (c === 'codicon' || c.startsWith('codicon-')) rotulo.classList.remove(c)
  rotulo.textContent = maisLargo
  rotulo.style.display = 'inline-flex'
  rotulo.style.alignItems = 'center'
  acoes.appendChild(sonda)
  void container.offsetWidth

  const comSonda = retrato()
  const corDoTexto = getComputedStyle(rotulo).color
  const r = sonda.getBoundingClientRect()
  const larguraDaSonda = Math.round(r.width)
  /*
    ⚠️ ONDE A SONDA FICOU, e não só quanto ela mede. Sem isto o critério "cabe" seria VAZIO: se o
    contêiner das ações recortasse o excesso, a sonda teria 161 px de largura, nada se mexeria na
    barra — e o critério passaria verde com o mostrador invisível ou por cima da barra de pesquisa.
  */
  const daBarra = container.getBoundingClientRect()
  const doCentro = centro ? centro.getBoundingClientRect() : null
  const ondeFicou = {
    esquerda: Math.round(r.left), direita: Math.round(r.right),
    dentroDaBarra: r.left >= daBarra.left - 1 && r.right <= daBarra.right + 1,
    depoisDaPesquisa: doCentro ? r.left >= doCentro.right - 1 : true,
    visivel: r.width > 0 && r.height > 0 && getComputedStyle(sonda).visibility !== 'hidden',
    cresceu: Math.round(acoes.getBoundingClientRect().width) - antes.acoes,
  }
  acoes.removeChild(sonda)
  void container.offsetWidth
  const depois = retrato()
  // E agora a barra volta a ser a de verdade: o item real reaparece.
  for (const e of escondidos) e.i.style.display = e.antesDisplay
  void container.offsetWidth

  return {
    fundoDaBarra: estiloDaBarra.backgroundColor,
    corDoTexto, larguraDaSonda, ondeFicou, antes, comSonda, depois, rotulos, real,
    // ⚠️ o texto da barra é o de ANTES de esconder: é o que a pessoa vê.
    textoDaBarra: real.textoDaBarra,
    itens: itens.length,
    larguraDaJanela: Math.round(document.documentElement.clientWidth),
  }
}

/** Abre o programa num perfil descartável com o tema pedido, mede, e fecha. */
async function medirNoTema(tema) {
  const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-limite-barra-'))
  const projeto = path.join(area, 'projeto')
  fs.mkdirSync(projeto, { recursive: true })
  fs.writeFileSync(path.join(projeto, 'leia.md'), '# limite na barra\n', 'utf8')
  const userDir = path.join(area, 'dados', 'User')
  fs.mkdirSync(userDir, { recursive: true })
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({
    'workbench.colorTheme': tema,
    'window.dialogStyle': 'custom',
  }, null, 2))

  /*
    ⚠️ A FIXTURE DE CONVERSA — SEM ELA ESTE TESTE MEDE UMA BARRA VAZIA.

    Até a V19 o item desta barra era o mostrador do LIMITE do plano, que aparecia sempre. Na V20 o
    limite saiu da barra por ordem dele (t188: *"tira os 3 e o limite também"*) e virou a faixa
    (t199). O que ficou na barra é o mostrador de TOKENS (t196) — e ele só existe quando há uma
    conversa registrada para a pasta aberta.

    Medido no build `V20-B2`: numa pasta nova, sem conversa, a barra de cima fica sem item nenhum
    e este teste morria em "a barra de cima nao tem item nenhum para servir de modelo" — 6
    critérios em vez de 46. Era o instrumento, não o produto: com a fixture abaixo, o mostrador
    aparece na barra (medido: `Conversa de teste · 0 · 0`, 121 px).

    A fixture é um registro de sessão apontando para ESTA pasta, com um transcrito de verdade ao
    lado. Nada é enviado a lugar nenhum: o produto só lê arquivo.
  */
  const conf = path.join(area, 'claude')
  const sessoes = path.join(conf, 'sessions')
  const projetosDoClaude = path.join(conf, 'projects', 'fixture')
  fs.mkdirSync(sessoes, { recursive: true })
  fs.mkdirSync(projetosDoClaude, { recursive: true })
  const sid = '11111111-2222-3333-4444-555555555555'
  fs.writeFileSync(path.join(sessoes, `${process.pid}.json`), JSON.stringify({
    pid: process.pid, sessionId: sid, cwd: projeto, startedAt: Date.now(),
    version: '2.1.278', kind: 'interactive', entrypoint: 'claude-vscode',
    name: 'conversa de teste', nameSource: 'user', status: 'idle', updatedAt: Date.now(),
  }), 'utf8')
  fs.writeFileSync(path.join(projetosDoClaude, `${sid}.jsonl`), [
    JSON.stringify({ type: 'ai-title', aiTitle: 'Conversa de teste', sessionId: sid }),
    JSON.stringify({
      type: 'assistant', sessionId: sid, timestamp: new Date().toISOString(),
      message: { model: 'claude-opus-5', usage: { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 98000, cache_creation_input_tokens: 4200 } },
    }),
  ].join(String.fromCharCode(10)) + String.fromCharCode(10), 'utf8')

  let app = null
  const confAntes = process.env.CLAUDE_CONFIG_DIR
  try {
    // Herdado pelo `ambienteLimpo()` de `comum.mjs`, que copia `process.env`.
    process.env.CLAUDE_CONFIG_DIR = conf
    app = await abrirOficina(_electron, { exe, projeto, area })
    const win = await app.firstWindow({ timeout: 60000 })
    await esconderJanela(app)
    await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
    await win.waitForSelector('.part.titlebar', { timeout: 30000 })
    // A extensão sobe e contribui os botões: dá tempo de a barra assentar.
    await respirar(4000)

    const medido = await win.evaluate(SONDAR, O_MAIS_LARGO)
    const normalLarga = await win.evaluate(SONDAR, O_DE_TODO_DIA)

    /*
      ⚠️ E AGORA A JANELA ESTREITA, que é onde isto de fato pode dar errado. A medida de cima foi
      feita numa janela larga, onde sobra espaço — exatamente o tipo de medida que dá verde e não
      prova nada. Medido, varrendo de 1376 a 616 px: os controles da janela NUNCA andam, e quem
      cede largura, quando falta espaço, é a barra de pesquisa (o núcleo já a encolhe sozinho).
      Com o texto de todo dia isso só começa abaixo de ~660 px; com o texto mais largo possível,
      abaixo de ~850 px.
    */
    await app.evaluate(({ BrowserWindow }) => {
      const j = BrowserWindow.getAllWindows()[0]
      if (j) j.setSize(660, 700)
    })
    await respirar(1500)
    const estreita = await win.evaluate(SONDAR, O_MAIS_LARGO)
    const normalEstreita = await win.evaluate(SONDAR, O_DE_TODO_DIA)

    // A paleta de comandos: o comando existe, e com nome de gente.
    // ⚠️ O TEXTO E ESCRITO NO CAMPO E CONFERIDO, e nao mandado pelo teclado global.
    //
    // Medido em 24/09/2026: dentro da regressao inteira este bloco reprovou nos DOIS temas, com a
    // lista generica em ordem alfabetica no detalhe — a paleta tinha aberto, e o texto do teclado
    // caiu no vazio porque a caixa ainda nao tinha o foco sob carga. Rodada sozinha minutos
    // depois, a mesma suite deu 48/48. Teste que so falha sob carga passa por sorte no resto das
    // vezes, que e a pior especie de verde.
    //
    // `naPaleta` fica VAZIA quando o texto nao entrou, e nao com a lista sem filtro: assim o
    // criterio la embaixo reprova por "nao consegui medir" em vez de reprovar o produto por uma
    // lista que nunca foi filtrada.
    let naPaleta = []
    if (await abrirPaleta(win, respirar)) {
      if (await digitarNaPaleta(win, respirar, 'Limite do plano')) {
        await respirar(900)
        naPaleta = await win.evaluate(() => [...document.querySelectorAll('.quick-input-list .monaco-list-row')]
          .map(l => (l.textContent || '').trim()).slice(0, 6))
      } else {
        console.log('  nota  o texto nao entrou na caixa da paleta: a lista nao foi lida')
      }
      await win.keyboard.press('Escape')
      await respirar(400)
    }
    return { medido, estreita, normalLarga, normalEstreita, naPaleta }
  } finally {
    if (app) await fecharApp(app)
    // A variável volta ao que era: este teste roda duas vezes (um tema cada) e não pode vazar
    // ambiente para o resto da bateria.
    if (confAntes === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = confAntes
    try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
  }
}

const escuro = await medirNoTema('OFICINA Escuro')
const claro = await medirNoTema('OFICINA Claro')

for (const [nome, r] of [['escuro', escuro], ['claro', claro]]) {
  const m = r.medido
  if (m.erro) { checar(`[${nome}] a barra de cima foi encontrada`, false, m.erro); continue }

  // 1. CABE? — a sonda entra e nada se mexe.
  checar(`⛔ [${nome}] o texto mais largo do mostrador CABE: os controles da janela não andam`,
    m.antes.controles !== null && m.comSonda.controles === m.antes.controles,
    `${m.antes.controles} -> ${m.comSonda.controles} (sonda de ${m.larguraDaSonda} px)`)
  checar(`⛔ [${nome}] e a barra de pesquisa não encolhe para o mostrador caber`,
    m.comSonda.centro === m.antes.centro, `${m.antes.centro} -> ${m.comSonda.centro}`)
  checar(`[${nome}] a barra de cima não passa a rolar com o mostrador dentro`,
    m.comSonda.rolagem <= m.comSonda.barra, `rolagem ${m.comSonda.rolagem} de ${m.comSonda.barra}`)
  checar(`[${nome}] a sonda ocupa o que um texto desse tamanho ocupa (e não zero)`,
    // V27: o pior caso do formato do painel passou do teto do item (30vw, patch 0023) — a sonda
    // agora bate NO teto, e é o teto que ela tem de respeitar (o `< 400` fixo era de antes).
    m.larguraDaSonda > 100 && m.larguraDaSonda <= Math.round(m.larguraDaJanela * 0.3) + 2,
    `${m.larguraDaSonda} px (teto ${Math.round(m.larguraDaJanela * 0.3)} px)`)
  checar(`⛔ [${nome}] a sonda OCUPA ESPACO DE VERDADE: a barra de ações cresce o tamanho dela`,
    m.ondeFicou.cresceu >= m.larguraDaSonda && m.ondeFicou.cresceu - m.larguraDaSonda <= 8,
    `a barra de ações cresceu ${m.ondeFicou.cresceu} px para uma sonda de ${m.larguraDaSonda} px (a diferença é a margem entre itens)`)
  checar(`⛔ [${nome}] e ela fica DENTRO da barra, depois da barra de pesquisa (não recortada, não por cima)`,
    m.ondeFicou.dentroDaBarra && m.ondeFicou.depoisDaPesquisa && m.ondeFicou.visivel,
    JSON.stringify(m.ondeFicou))
  checar(`[${nome}] CONTROLE: tirada a sonda, a barra volta exatamente ao que era`,
    m.depois.acoes === m.antes.acoes && m.depois.centro === m.antes.centro,
    `${m.antes.acoes}/${m.antes.centro} -> ${m.depois.acoes}/${m.depois.centro}`)

  /*
    2. DÁ PARA LER? — contraste do que o navegador calculou.

    ⚠️ Quando o item DE VERDADE está na barra (núcleo com o patch), a cor medida é a DELE, e não
    a do clone: é a prova mais forte que existe aqui, porque quem pinta é o produto, não o teste.
    Sem o patch não há item real, e a cor volta a ser a do clone — que herda a mesma cascata.
  */
  const temPatch = !!(m.real && m.real.quantos > 0)
  const corMedida = temPatch ? m.real.cor : m.corDoTexto
  const frente = rgb(corMedida), fundo = rgb(m.fundoDaBarra)
  const razao = frente && fundo ? contraste(frente, fundo) : 0
  checar(`⛔ [${nome}] o texto do mostrador passa de 4,5:1 contra o fundo da barra de cima`,
    razao >= 4.5, `${razao.toFixed(2)}:1  (texto ${corMedida} sobre ${m.fundoDaBarra}; medido no ${temPatch ? 'ITEM REAL' : 'clone, porque este núcleo não desenha o item'})`)
  checar(`[${nome}] a cor do texto é a da barra de título, e não a brasa (que marca só foco e ativo)`,
    !!frente && !(frente[0] > 180 && frente[1] < 160 && frente[2] < 90), corMedida)

  // 3. O ITEM — que aparece num núcleo COM o patch 0016, e some num núcleo sem ele.
  checar(`⛔ [${nome}] num editor SEM o patch, o marcador do texto vivo NÃO aparece na tela`,
    !/\$\{/.test(String(m.textoDaBarra)) && !m.rotulos.some(t => /\$\{/.test(t)),
    m.rotulos.join(' | ') || '(nenhum rótulo de texto na barra)')
  /*
    ⚠️ ESTE CRITÉRIO TEM DOIS LADOS, e ele diz em qual está. Num núcleo sem o patch o item TEM de
    sumir (era o único caso possível até a V19). Num núcleo COM o patch ele TEM de aparecer — e
    aparecer direito: um item só, com a forma que o motor produz, na barra de quatro itens que o
    dono definiu. Cobrar só o lado antigo faria o build que ATENDE ao pedido ficar vermelho.
  */
  checar(temPatch
    ? `⛔ [${nome}] o MOSTRADOR APARECE na barra de cima: um item só, com a forma que o motor produz`
    : `⛔ [${nome}] e o item também não aparece vazio: a barra fica com os botões que este núcleo desenha`,
    temPatch
      // ⚠️ `m.itens === 1`, e não 4: o `t188` tirou os três botões (Arquivos, Conversa e Layout) da
      // barra de cima, e o mostrador ficou sozinho. A conta antiga é de antes da ordem dele.
      ? (m.real.quantos === 1 && m.itens === 1 &&
        // V27: a forma do painel de tokens (`nome  $1.24  69.6k/1.0M`), com o aviso de pasta na frente
        // quando for o caso — ou um dos dois estados sem número. `$?` é custo desconhecido (`custoDe`).
        // V29: com várias, TODAS pelo nome, separadas por ` │ `, e a soma no fim; quando não cabe, cada
        // conversa pode perder o tamanho (degraus do `mostradorDeTokens.js`). O texto do elemento é o da
        // extensão, byte a byte: o 0029 desenha em pedaços, mas com os espaços DENTRO do texto.
        /^(⚠ sem pasta {2})?(– · [0?]|(.+? {2})?\$(?:[\d.]+\+?|\?)( {2}[\d.]+[kM](\/[\d.]+[kM])?)?( │ (.+? {2})?\$(?:[\d.]+\+?|\?)( {2}[\d.]+[kM](\/[\d.]+[kM])?)?)*)$/.test(m.real.rotulos[0]))
      : (m.itens >= 3 && m.rotulos.length === 0),
    temPatch
      ? `${m.itens} itens na barra, ${m.real.quantos} com texto: "${m.real.rotulos.join(' | ')}" (${m.real.largura} px)`
      : `${m.itens} item(ns), ${m.rotulos.length} com texto`)

  /*
    ⚠️ O PATCH 0023, MEDIDO NO ITEM QUE A PESSOA VÊ — não na sonda.

    Tudo o que este arquivo mede de espaço é medido num CLONE do item. Depois do 0023 o clone herda
    o teto do original, então os critérios de espaço ficariam verdes mesmo que o item real não
    tivesse ganhado nada: verde por herança. Estes dois olham o original.

    Por que `30vw` e não um número de pixels: medido nos dois tamanhos de janela, um teto fixo
    (220 px) corta o texto TAMBÉM na janela larga, onde sobra espaço. Com `30vw`, a janela de
    676 px trunca para 203 px e a de 1376 px mostra os 401 px inteiros. O porquê inteiro está em
    `patches/0023-rotulo-vivo-trunca-em-vez-de-empurrar.md`.
  */
  if (temPatch) {
    const tetoEmPx = parseFloat(String(m.real.teto))
    const esperado = m.larguraDaJanela * 0.3
    checar(`⛔ [${nome}] V22/0023: o item REAL do mostrador tem teto de largura (não é a sonda que trunca)`,
      !!m.real.temAClasseDoPatch && Number.isFinite(tetoEmPx) && Math.abs(tetoEmPx - esperado) <= 2,
      `classe: ${m.real.temAClasseDoPatch} · teto: ${m.real.teto} (30vw de ${m.larguraDaJanela} px = ${Math.round(esperado)} px)`)
  }

  // 3b. A JANELA ESTREITA — onde isto de fato pode dar errado.
  const e = r.estreita
  if (e && !e.erro) {
    checar(`⛔ [${nome}] em janela estreita, o mostrador ainda não empurra os controles da janela`,
      e.comSonda.controles === e.antes.controles,
      `janela ${e.larguraDaJanela} px · ${e.antes.controles} -> ${e.comSonda.controles} (sonda de ${e.larguraDaSonda} px)`)
    /*
      ⚠️ AQUI ESTÁ O CUSTO, MEDIDO — e ele é o contrário do que eu tinha escrito antes de medir.
      Em janela estreita a barra de pesquisa CEDE largura para o mostrador caber. Não é defeito do
      mostrador: é o próprio editor encolhendo a barra de pesquisa, que é a parte elástica da barra
      de cima. O que este critério cobra é o TAMANHO da cedência, para que uma piora futura fique
      vermelha — e o que ele declara é que quem cede é a pesquisa, nunca os controles da janela.

      ⚠️ O TETO SUBIU DE 80 PARA 130 PX, E A RAZÃO É UMA ORDEM DELE — não uma piora escondida. O
      patch 0020 atendeu ao `t199` (*"a barra de pesquisa pode ser menos larga"*) e ela passou de
      `38vw/600px` para `30vw/420px`. Com menos largura de partida, sobra menos folga: medido no
      build `V20-B2`, numa janela de 676 px, a pesquisa vai de 211 a 86 px quando o mostrador do
      PIOR CASO (393 px) entra.

      ⚠️ E O QUE ISSO NÃO É: o caso de todo dia. Com o texto que o motor produz no uso normal
      (178 px), medido na mesma janela estreita, a pesquisa cede **zero** — está nos dois critérios
      logo abaixo. O pior caso é sintético: nome de conversa comprido somado a todos os campos.
    */
    checar(`⛔ [${nome}] em janela estreita quem cede é a barra de pesquisa, e no máximo 130 px`,
      e.comSonda.centro <= e.antes.centro && (e.antes.centro - e.comSonda.centro) <= 130,
      `a barra de pesquisa foi de ${e.antes.centro} a ${e.comSonda.centro} px (cedeu ${e.antes.centro - e.comSonda.centro})`)
    checar(`[${nome}] em janela estreita, a barra de cima não passa a rolar`,
      e.comSonda.rolagem <= e.comSonda.barra, `rolagem ${e.comSonda.rolagem} de ${e.comSonda.barra}`)
    checar(`⛔ [${nome}] em janela estreita a sonda continua ocupando espaço de verdade, dentro da barra`,
      e.ondeFicou.cresceu >= e.larguraDaSonda && e.ondeFicou.cresceu - e.larguraDaSonda <= 8 &&
      e.ondeFicou.dentroDaBarra && e.ondeFicou.depoisDaPesquisa,
      JSON.stringify(e.ondeFicou))
    checar(`[${nome}] CONTROLE: a janela realmente ficou estreita (senão esta medida não mede nada)`,
      e.larguraDaJanela < 900 && e.larguraDaJanela < m.larguraDaJanela,
      `${m.larguraDaJanela} -> ${e.larguraDaJanela} px`)
  } else {
    checar(`[${nome}] a barra de cima foi medida também em janela estreita`, false, (e && e.erro) || 'não mediu')
  }

  // 3c. O TEXTO DE TODO DIA — o caso que fica na tela a maior parte do tempo.
  for (const [onde, x] of [['janela larga', r.normalLarga], ['janela estreita', r.normalEstreita]]) {
    if (!x || x.erro) { checar(`[${nome}] o texto de todo dia foi medido em ${onde}`, false, (x && x.erro) || 'não mediu'); continue }
    /*
      ⚠️ ESTE CRITÉRIO AFROUXOU NA V22, e o afrouxamento é DECLARADO — não é um teto subindo para
      deixar a bateria verde.

      Ele nasceu cobrando "cede ZERO", e estava certo: até a V20 a barra de cima tinha folga para
      absorver o mostrador. Na V21 o `t198` levou três ícones para lá (Arquivos, Git e Skills), que
      medem 104 px — e em janela estreita o texto de TODO DIA passou a tirar 10 px dos 211 da barra
      de pesquisa (4,7% dela). Isso é consequência medida de uma ordem dele, não regressão escondida.

      ⚠️ POR QUE NÃO SE CONSERTA COM MAIS TRUNCAMENTO. Baixar o teto do patch 0023 até o texto comum
      caber (de 30vw para ~24vw) faria o mostrador do dia a dia aparecer CORTADO em janela estreita,
      para salvar 10 px de uma barra de pesquisa que continua utilizável. Trocaria a informação que
      ele quer ler por um número de teste. O teto de 15 px abaixo é a folga dos 104 px de ícones, e
      nada além dela.

      ⚠️ E O QUE NÃO AFROUXOU: os controles da janela continuam tendo de ficar PARADOS — isso não é
      preferência, é o produto invadindo os botões de fechar janela. O pior caso continua preso ao
      teto de 130 px, e a barra continua não podendo rolar. Se um dia o dia a dia passar de 15 px,
      volta a ficar vermelho, que é o serviço deste critério.
    */
    const CEDENCIA_TOLERADA = 15
    const cedeu = x.antes.centro - x.comSonda.centro
    checar(`⛔ [${nome}] o texto de todo dia, em ${onde}, não empurra os controles e quase não tira da pesquisa`,
      x.comSonda.controles === x.antes.controles && cedeu >= 0 && cedeu <= CEDENCIA_TOLERADA,
      `janela ${x.larguraDaJanela} px · sonda ${x.larguraDaSonda} px · pesquisa ${x.antes.centro} -> ${x.comSonda.centro} (cedeu ${cedeu}, tolerado ${CEDENCIA_TOLERADA})`)
    checar(`[${nome}] e ele é bem mais curto que o pior caso, em ${onde}`,
      x.larguraDaSonda < (onde === 'janela larga' ? m.larguraDaSonda : e.larguraDaSonda),
      `${x.larguraDaSonda} px contra ${onde === 'janela larga' ? m.larguraDaSonda : e.larguraDaSonda} px`)
  }

  // 4. O comando continua existindo, com nome de gente.
  checar(`⛔ [${nome}] o comando do limite está na paleta com nome de gente (não com o marcador)`,
    r.naPaleta.some(t => /Limite do plano/.test(t)) && !r.naPaleta.some(t => /\$\{/.test(t)),
    r.naPaleta.join(' | '))
}

const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou, total: res.length,
  falhas: res.filter(r => !r.ok).map(r => r.criterio),
}))
process.exit(passou ? 0 : 1)
