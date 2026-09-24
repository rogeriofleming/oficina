// O PRIMEIRO USO, DENTRO DO EDITOR DE VERDADE: quem acabou de instalar e ainda não entrou na conta.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE. Três defeitos de 18/09/2026 só apareceram com o programa aberto,
// numa revisão de tela — o motor e a ponte estavam verdes com os três:
//   1. cada mensagem mandada sem login somava OUTRO cartão de login igual (1 → 2 → 3);
//   2. no tema escuro, que é o padrão, o texto do cartão saía com contraste 2,67:1 (ilegível);
//   3. as barras de atividade e de status nascem ocultas, e era nelas que moravam os ícones de
//      Tokens e Skills: as duas vistas só abriam pela paleta. As barras que sobram têm composição
//      definida pelo dono; a porta de Tokens é o custo no pé, e o guia de boas-vindas leva às duas.
//      (V13: a barra lateral volta com Skills; Tokens continua fora dela e abre pelo custo.
//       V24: Tokens entra na barra de cima, e a barra da direita fica sem conteudo nosso.)
// Nenhum dos três se prova sem a tela: o cartão é desenhado pela webview, a cor vem do tema
// aplicado, e as barras só existem com o núcleo modificado.
//
// ⚠️ SEM LOGIN DE VERDADE, SEM GASTO: `CLAUDE_CONFIG_DIR` aponta para uma pasta VAZIA, criada aqui.
// Nada toca na configuração de quem roda, e nenhuma mensagem chega ao modelo.
//
// Uso:  node testes/tela_primeiro_uso.mjs [caminho do executavel]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, abrirPaleta, extensaoForaDeSincronia } from './comum.mjs'

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

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
}

async function acharFrameDaConversa(win, teto = 60000) {
  const fim = Date.now() + teto
  while (Date.now() < fim) {
    for (const f of win.frames()) {
      try { if (await f.evaluate(() => !!document.getElementById('entrada'))) return f } catch { }
    }
    await respirar(400)
  }
  return null
}

async function enviar(frame, texto) {
  await frame.fill('#entrada', texto)
  await frame.click('#enviar').catch(() => { })
  await respirar(4000)
}

/**
 * Os cartões de login VISÍVEIS e o contraste do texto de cada um.
 *
 * O fundo do cartão pode ser translúcido: ele é composto por cima do fundo da página, que é o que
 * o olho vê. A razão é a do WCAG (luminância relativa), sem arredondar antes de comparar.
 */
const medirCartoes = frame => frame.evaluate(() => {
  const rgba = s => { const m = String(s).match(/[\d.]+/g) || []; return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m[3] === undefined ? 1 : +m[3] } }
  const compor = (cima, baixo) => ({ r: cima.r * cima.a + baixo.r * (1 - cima.a), g: cima.g * cima.a + baixo.g * (1 - cima.a), b: cima.b * cima.a + baixo.b * (1 - cima.a), a: 1 })
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const razao = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const fundoDaPagina = rgba(getComputedStyle(document.body).backgroundColor)
  const cartoes = [...document.querySelectorAll('[data-login="sim"]')].filter(e => e.offsetParent !== null)
  const conversa = document.getElementById('conversa') || cartoes[0]?.parentElement
  return {
    quantos: cartoes.length,
    ultimoEhCartao: !!conversa && conversa.lastElementChild?.dataset?.login === 'sim',
    convite: cartoes.map(c => c.classList.contains('convite')),
    contrastes: cartoes.map(c => {
      const texto = c.querySelector('.erro-texto') || c
      const fundo = compor(rgba(getComputedStyle(c).backgroundColor), fundoDaPagina)
      return Math.round(razao(rgba(getComputedStyle(texto).color), fundo) * 100) / 100
    }),
  }
})

for (const tema of ['OFICINA Escuro', 'OFICINA Claro']) {
  const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-primeiro-uso-'))
  const projeto = path.join(area, 'projeto')
  const configVazia = path.join(area, 'config-do-agente-vazia')
  fs.mkdirSync(projeto, { recursive: true })
  fs.mkdirSync(configVazia, { recursive: true })
  fs.writeFileSync(path.join(projeto, 'leia.md'), '# primeiro uso\n', 'utf8')
  // O tema entra pelo PERFIL, nunca pela paleta (ver `retrato.mjs`: pela paleta a foto saía no tema
  // errado, em silêncio).
  const userDir = path.join(area, 'dados', 'User')
  fs.mkdirSync(userDir, { recursive: true })
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({ 'workbench.colorTheme': tema }, null, 2))

  const antes = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = configVazia
  let app
  try {
    app = await abrirOficina(_electron, { exe, projeto, area })
    const win = await app.firstWindow({ timeout: 60000 })
    await esconderJanela(app)
    await win.waitForSelector('.monaco-workbench', { timeout: 60000 })

    const frame = await acharFrameDaConversa(win)
    if (!frame) throw new Error('a conversa nao abriu (#entrada nunca apareceu)')
    await respirar(3000)
    await enviar(frame, 'oi')
    await enviar(frame, 'oi de novo')
    const m = await medirCartoes(frame)
    checar(`[${tema}] ⛔ sem login, duas mensagens depois: UM cartão de login visível`, m.quantos === 1, `${m.quantos} cartão(ões)`)
    checar(`[${tema}] e ele fica depois da última fala`, m.ultimoEhCartao)
    checar(`[${tema}] o cartão veste a roupa de convite, não a de erro`, m.convite.length > 0 && m.convite.every(Boolean), JSON.stringify(m.convite))
    checar(`[${tema}] ⛔ o texto do cartão tem contraste AA (≥ 4,5:1)`, m.contrastes.length > 0 && m.contrastes.every(r => r >= 4.5), m.contrastes.join(', '))
    // O ponto parado é verde, "tudo certo". Sem conta, ele não pode dizer isso ao lado do cartão.
    const ponto = await frame.evaluate(() => {
      const cor = v => { const p = document.createElement('span'); p.style.color = `var(${v})`; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c }
      const el = document.getElementById('ponto')
      return { estado: el.dataset.estado, cor: getComputedStyle(el).backgroundColor, verde: cor('--vscode-testing-iconPassed'), aviso: cor('--vscode-editorWarning-foreground') }
    })
    checar(`[${tema}] sem login, o ponto parado NÃO é o verde de "tudo certo"`, ponto.cor !== ponto.verde && ponto.cor === ponto.aviso,
      `${ponto.estado}: ${ponto.cor} (verde ${ponto.verde}, aviso ${ponto.aviso})`)

    if (tema === 'OFICINA Escuro') {
      // V14 — O RELÓGIO DO CACHE E OS TOKENS NO PÉ. Sem login não há conversa, então o pé recebe a mensagem
      // que o host manda (`tipo: 'tokens'`, a mesma forma que `ponte.mjs` prova chegar) pela porta de
      // mensagens da própria página. O que se mede aqui é o DESENHO: anel, minutos, estado vencido, cores
      // do tema e o pé estreito com tudo dentro.
      const mandarPe = pe => frame.evaluate(m => window.postMessage(m, '*'), pe)
      const PE_CHEIO = { tipo: 'tokens', texto: '584k · 156M · US$ 56,71*', dica: 'Contexto agora: 584 mil tokens\nClique para ver o detalhe.',
        relogio: { minutos: 60, fracao: 1, vencido: false, suposto: false, dica: 'Cache quente por mais 60 min (vence às 13:00).' } }
      const lerRelogio = () => frame.evaluate(() => {
        const cor = v => { const p = document.createElement('span'); p.style.color = `var(${v})`; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c }
        const el = document.getElementById('cache'), arco = document.getElementById('cache-arco'), min = document.getElementById('cache-minutos')
        // Sem o relógio na página (o produto de antes), o critério cai sem derrubar a suíte.
        if (!el || !arco || !min) return { visivel: false, tokens: document.getElementById('custo').textContent }
        const anel = el.querySelector('svg').getBoundingClientRect()
        return {
          visivel: !el.hidden && el.getBoundingClientRect().width > 0, anel: Math.round(anel.width) + 'x' + Math.round(anel.height),
          minutos: min.textContent, traco: arco.getAttribute('stroke-dasharray'), arcoVisivel: getComputedStyle(arco).display !== 'none',
          corDoArco: getComputedStyle(arco).stroke, destaque: cor('--vscode-textLink-foreground'), texto: cor('--vscode-foreground'),
          corDosMinutos: getComputedStyle(min).color, aviso: cor('--vscode-editorWarning-foreground'), dica: el.title,
          tokens: document.getElementById('custo').textContent,
        }
      })
      await mandarPe(PE_CHEIO)
      await respirar(300)
      let rel = await lerRelogio()
      // O arco é a cor do TEXTO, não a brasa: a brasa marca foco, ativo, primário e cursor, e o arco fica à vista o tempo todo.
      checar('⛔ V14: o pé mostra os tokens e o relógio do cache (anel + "60m", anel cheio, na cor do texto e não na brasa)',
        rel.visivel && rel.anel === '14x14' && rel.minutos === '60m' && rel.traco === '100 100' && rel.arcoVisivel && rel.corDoArco === rel.texto && rel.corDoArco !== rel.destaque && rel.tokens === PE_CHEIO.texto,
        JSON.stringify(rel))
      await mandarPe({ ...PE_CHEIO, relogio: { ...PE_CHEIO.relogio, minutos: 30, fracao: 0.5 } })
      await respirar(200)
      rel = await lerRelogio()
      checar('V14: o anel acompanha os minutos (30m = meio anel)', rel.minutos === '30m' && rel.traco === '50 100', `${rel.minutos} ${rel.traco}`)
      await mandarPe({ ...PE_CHEIO, relogio: { minutos: 0, fracao: 0, vencido: true, suposto: false,
        dica: 'O cache venceu: a próxima mensagem relê a conversa inteira e custa mais.' } })
      await respirar(200)
      rel = await lerRelogio()
      checar('⛔ V14: vencido muda de estado ("venceu", sem arco, cor de aviso) e a dica diz que a próxima mensagem custa mais',
        rel.visivel && rel.minutos === 'venceu' && !rel.arcoVisivel && rel.corDosMinutos === rel.aviso && /custa mais/.test(rel.dica), JSON.stringify(rel))
      await mandarPe(PE_CHEIO)
      await respirar(200)

      // V15 — O BOTÃO DO MODELO E O PAINEL DE ESCOLHA. Sem conta, o agente de verdade já responde a lista de
      // modelos e o que está em uso (medido em 18/09/2026, pasta de configuração vazia): o botão, o Enter da
      // lista e as setas do esforço passam pelo agente real — sem mensagem nenhuma, sem gasto.
      const lerSeletor = () => frame.evaluate(() => {
        const cor = (v, p = 'color') => { const s = document.createElement('span'); s.style[p] = `var(${v})`; document.body.appendChild(s); const c = getComputedStyle(s)[p]; s.remove(); return c }
        const b = document.getElementById('modelo'), sel = document.getElementById('seletor')
        if (!b || !sel) return { existe: false }
        const itens = [...document.querySelectorAll('#seletor-lista .seletor-item')]
        const emUso = itens.find(i => i.getAttribute('aria-selected') === 'true')
        const pontos = [...document.querySelectorAll('#esforco-controle .esforco-ponto')]
        const atual = pontos.find(p => p.dataset.atual === 'sim')
        const visivel = el => !!el && !el.hidden && el.getBoundingClientRect().height > 0
        return {
          existe: true, botao: b.textContent, botaoVisivel: visivel(b), expandido: b.getAttribute('aria-expanded'), aberto: visivel(sel),
          foco: document.activeElement && document.activeElement.id, itens: itens.map(i => i.dataset.valor),
          nomes: itens.map(i => (i.querySelector('.seletor-nome') || {}).textContent), descricoes: itens.filter(i => i.querySelector('.seletor-descricao')).length,
          emUso: emUso && emUso.dataset.valor, marca: emUso && emUso.querySelector('.seletor-marca').textContent,
          fundoEmUso: emUso && getComputedStyle(emUso).backgroundColor, selecao: cor('--vscode-list-activeSelectionBackground', 'backgroundColor'),
          ativo: (itens.find(i => i.classList.contains('ativo')) || {}).dataset?.valor,
          tituloEsforco: document.getElementById('esforco-titulo').textContent, controleVisivel: visivel(document.getElementById('esforco-controle')),
          pontos: pontos.map(p => p.dataset.nivel), rotulos: pontos.map(p => p.textContent), atual: atual && atual.dataset.nivel,
          corDoAtual: atual && getComputedStyle(atual.querySelector('.esforco-bolinha')).backgroundColor, destaque: cor('--vscode-textLink-foreground'),
          semEsforco: visivel(document.getElementById('esforco-sem')) ? document.getElementById('esforco-sem').textContent : '',
          avisoEsforco: visivel(document.getElementById('esforco-aviso')),
          confirmar: visivel(document.getElementById('seletor-confirmar')) ? document.getElementById('seletor-confirmar-texto').textContent : '',
          resposta: document.body.dataset.respostaDoModelo || '',
        }
      })
      const esperarSeletor = async (condicao, teto = 15000) => {
        const fim = Date.now() + teto
        let s = await lerSeletor()
        while (!condicao(s) && Date.now() < fim) { await respirar(250); s = await lerSeletor() }
        return s
      }
      let s = await esperarSeletor(x => x.existe && x.botaoVisivel)
      checar('⛔ V15: o botão do modelo mostra o modelo e o esforço EM USO, lidos do agente de verdade ("Opus 5 (1M) · alto")',
        s.existe && s.botaoVisivel && /^[A-Z][a-z]+ [\d.]+( \(1M\))? · (baixo|médio|alto|extra-alto|máximo)$/.test(s.botao), JSON.stringify({ botao: s.botao, resposta: s.resposta }))
      await frame.click('#modelo')
      s = await esperarSeletor(x => x.aberto)
      checar('⛔ V15: o botão abre o painel, com a lista do agente (nome + descrição) e o foco na lista',
        s.aberto && s.expandido === 'true' && s.itens.length >= 2 && s.descricoes === s.itens.length && s.foco === 'seletor-lista', JSON.stringify({ itens: s.itens, nomes: s.nomes, foco: s.foco }))
      checar('⛔ V15: o item em uso tem o ✓ e o fundo de seleção do tema', !!s.emUso && s.marca === '✓' && s.fundoEmUso === s.selecao && s.ativo === s.emUso,
        JSON.stringify({ emUso: s.emUso, marca: s.marca, fundo: s.fundoEmUso, selecao: s.selecao }))
      checar('⛔ V15: o esforço no mesmo painel, cinco pontos em português, o atual na cor de destaque',
        s.controleVisivel && s.pontos.length === 5 && s.rotulos.join(',') === 'baixo,médio,alto,extra-alto,máximo' && !!s.atual && s.corDoAtual === s.destaque && /^Esforço \(/.test(s.tituloEsforco),
        JSON.stringify({ pontos: s.pontos, atual: s.atual, cor: s.corDoAtual, titulo: s.tituloEsforco }))
      checar('V15: com o cache quente (o relógio do pé), o painel avisa que trocar o esforço reescreve parte do cache', s.avisoEsforco)

      // Teclado: setas até o Sonnet, Enter — a troca vai ao agente de verdade e o botão mostra o que VOLTOU.
      for (let i = 0; i < 8 && (await lerSeletor()).ativo !== 'sonnet'; i++) await frame.press('#seletor-lista', 'ArrowDown')
      await frame.press('#seletor-lista', 'Enter')
      s = await esperarSeletor(x => /^Sonnet/.test(x.botao))
      checar('⛔ V15: setas + Enter escolhem o modelo: o botão passa ao Sonnet, relido do agente, e o ✓ muda de linha',
        /^Sonnet 5 · /.test(s.botao) && s.emUso === 'sonnet' && s.aberto, JSON.stringify({ botao: s.botao, emUso: s.emUso, resposta: s.resposta }))
      const antesDoEsforco = s.atual
      await frame.press('#esforco-controle', 'Home')
      s = await esperarSeletor(x => x.atual === 'low')
      checar('⛔ V15: no controle do esforço, o teclado troca o nível e o agente confirma ("baixo")',
        s.atual === 'low' && / · baixo$/.test(s.botao) && antesDoEsforco !== 'low', JSON.stringify({ botao: s.botao, atual: s.atual }))
      for (let i = 0; i < 8 && (await lerSeletor()).ativo !== 'haiku'; i++) await frame.press('#seletor-lista', 'ArrowDown')
      await frame.press('#seletor-lista', 'Enter')
      s = await esperarSeletor(x => /^Haiku/.test(x.botao))
      checar('⛔ V15: modelo sem esforço — o controle some, o botão mostra só o modelo, e o painel diz por quê',
        /^Haiku [\d.]+$/.test(s.botao) && !s.controleVisivel && /não tem nível de esforço/.test(s.semEsforco), JSON.stringify({ botao: s.botao, sem: s.semEsforco }))

      // Só os pontos que o modelo aceita: um modelo com três níveis desenha três pontos (o host manda os aceitos).
      const NIVEIS_PT = [['low', 'baixo'], ['medium', 'médio'], ['high', 'alto'], ['xhigh', 'extra-alto'], ['max', 'máximo']].map(([nivel, rotulo]) => ({ nivel, rotulo }))
      await mandarPe({ tipo: 'modelo', modelo: 'claude-sonnet-5', nome: 'Sonnet 5', rotulo: 'Sonnet 5 · médio', esforco: 'medium', esforcoSuposto: false, emUso: 'sonnet',
        aceitaEsforco: true, esforcos: ['low', 'medium', 'high'], niveis: NIVEIS_PT,
        modelos: [{ valor: 'sonnet', nome: 'Sonnet', descricao: 'Sonnet 5', aceitaEsforco: true, esforcos: ['low', 'medium', 'high'] }] })
      s = await esperarSeletor(x => x.pontos.length === 3, 3000)
      checar('⛔ V15: só os pontos que o modelo aceita (três níveis → três pontos)', s.pontos.join(',') === 'low,medium,high' && s.atual === 'medium', JSON.stringify(s.pontos))

      // O pedido de confirmação do host (a ponte prova quando ele vem): o painel mostra o custo e o foco vai para MANTER.
      await mandarPe({ tipo: 'confirmarModelo', valor: 'sonnet', texto: 'O cache desta conversa ainda vale por 50 min. Trocar para Sonnet 5 custa mais.' })
      s = await esperarSeletor(x => !!x.confirmar, 3000)
      checar('⛔ V15: com o cache quente, a troca pede confirmação no painel, com o custo, e o foco fica em "Manter"',
        /custa mais/.test(s.confirmar) && s.foco === 'seletor-manter', JSON.stringify({ confirmar: s.confirmar, foco: s.foco }))
      // O botão primário (a brasa, onde o olho vai) é o que o foco escolhe — o que não custa. O que custa é o secundário.
      const botoesDaTroca = await frame.evaluate(() => ({ manter: document.getElementById('seletor-manter').className, trocar: document.getElementById('seletor-trocar').className }))
      checar('⛔ V15: na confirmação, "Manter" é o botão primário e "Trocar mesmo assim" o secundário',
        !/secundario/.test(botoesDaTroca.manter) && /secundario/.test(botoesDaTroca.trocar), JSON.stringify(botoesDaTroca))
      await win.keyboard.press('Escape')
      s = await esperarSeletor(x => !x.aberto, 3000)
      checar('⛔ V15: Esc fecha o painel e devolve o foco ao botão', !s.aberto && s.expandido === 'false' && s.foco === 'modelo', JSON.stringify({ aberto: s.aberto, foco: s.foco }))

      // O PÉ ESTREITO. O painel ao lado da lateral e do editor fica com ~506 px, e ali "Opus 5 (1M)"
      // e "US$ 0,19" quebravam em duas linhas (revisão de tela de 18/09/2026). V14: o pé ganhou o relógio
      // e os três números; a medida é com TUDO o que ele pode ter — e-mail comprido e "Sair" à vista.
      const pe = await frame.evaluate(() => {
        const pe = document.querySelector('.pe'), linha = document.querySelector('.linha-de-estado')
        const custo = document.getElementById('custo'), modelo = document.getElementById('modelo')
        const cache = document.getElementById('cache'), conta = document.getElementById('conta'), sair = document.getElementById('sair')
        const antes = { largura: pe.style.width, modelo: modelo.textContent, modeloOculto: modelo.hidden, conta: conta.textContent, sair: sair.hidden }
        pe.style.width = '506px'
        // V15: o botão com o texto mais comprido que ele pode ter — modelo de contexto longo e o esforço mais longo.
        // Em partes, como o host manda (`modelos.js`, `partesDoBotao`): a do contexto longo é a que o pé estreito tira.
        modelo.hidden = false
        modelo.replaceChildren(...[['nome', 'Opus 5'], ['contexto', ' (1M)'], ['esforco', ' · extra-alto']].map(([p, t]) => {
          const s = document.createElement('span'); s.className = 'modelo-' + p; s.textContent = t; return s
        }))
        conta.textContent = 'uma.pessoa.com.nome.bem.comprido@exemplo.com'
        sair.hidden = false
        // `line-height: normal` não é número: aí a altura de uma linha vale 1,4 × o tamanho da letra.
        const altura = el => { const s = getComputedStyle(el); const l = parseFloat(s.lineHeight); return Number.isFinite(l) ? l : parseFloat(s.fontSize) * 1.4 }
        const linhas = el => el.getClientRects().length === 1 && el.getBoundingClientRect().height <= altura(el) * 1.5 + 1
        const borda = linha.getBoundingClientRect().right + 0.5
        const passam = [...linha.children].filter(c => !c.hidden && c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().right > borda).map(c => c.id || c.className)
        const r = { modelo: linhas(modelo), custo: linhas(custo), cache: !!cache && !cache.hidden && linhas(cache), textoModelo: modelo.textContent,
          passam, estouro: linha.scrollWidth - linha.clientWidth, altura: Math.round(linha.getBoundingClientRect().height),
          larguras: [...linha.children].filter(c => !c.hidden && getComputedStyle(c).display !== 'none').map(c => `${c.id || c.className}=${Math.round(c.getBoundingClientRect().width)}`).join(' ') }
        pe.style.width = antes.largura; modelo.textContent = antes.modelo; modelo.hidden = antes.modeloOculto; conta.textContent = antes.conta; sair.hidden = antes.sair
        return r
      })
      checar('⛔ pé a 506 px: o botão do modelo (com o esforço) cabe numa linha', pe.modelo, pe.textoModelo)
      checar('⛔ pé a 506 px: os tokens cabem numa linha', pe.custo)
      checar('⛔ V14: pé a 506 px: o relógio cabe numa linha', pe.cache)
      checar('⛔ V14: pé a 506 px, com tudo: nada da linha passa da borda', pe.passam.length === 0 && pe.estouro <= 0,
        `passam: ${pe.passam.join(', ') || 'nada'}; estouro ${pe.estouro}px; altura ${pe.altura}px; ${pe.larguras}`)

      // V16 — O BOTÃO "N AGENTES" E O MAPA. Sem login não há agente: o mapa chega pela porta de mensagens da página,
      // na forma que `ponte.mjs` prova o host mandar (`montarMapa`). O que se mede aqui é o DESENHO e o teclado — e a
      // parada vai ao host de verdade, que recusa (o agente não existe) e a tela diz que não parou.
      const agora = await frame.evaluate(() => Date.now())
      const MAPA = { tipo: 'agentes', conversa: 'x', rodando: 2, total: 4, rotulo: '2 agentes',
        sessao: { titulo: 'Minha conversa', viva: true, linha: 'Opus 5 (1M) · 450 mil tokens no contexto' },
        agentes: [
          { id: 'r1', nome: 'FUNCIONAL A: V12/V11/janelas', tipo: 'general-purpose', estado: 'rodando', rotuloDoEstado: 'rodando', vivo: true, profundidade: 1, pai: null, filhos: ['n1'],
            inicioMs: agora - 65000, duracaoMs: null, tokens: 251091, tokensTexto: '251 mil tokens', ferramentas: 116, ultimaFerramenta: 'PowerShell', atividade: 'Running testes', resumo: null, erro: null, parando: false, podeParar: true, doDisco: false },
          { id: 'n1', nome: 'segundo nível do A', tipo: 'Explore', estado: 'rodando', rotuloDoEstado: 'rodando', vivo: true, profundidade: 2, pai: 'r1', filhos: [],
            inicioMs: agora - 5000, duracaoMs: null, tokens: 900, tokensTexto: '900 tokens', ferramentas: 2, ultimaFerramenta: 'Read', atividade: null, resumo: null, erro: null, parando: false, podeParar: true, doDisco: false },
          { id: 't1', nome: 'revisor de documentos', tipo: 'general-purpose', estado: 'terminou', rotuloDoEstado: 'terminou', vivo: false, profundidade: 1, pai: null, filhos: [],
            inicioMs: agora - 3000000, duracaoMs: (37 * 60 + 3) * 1000, tokens: 251091, tokensTexto: '251 mil tokens', ferramentas: 40, ultimaFerramenta: 'Bash', atividade: null, resumo: 'Tudo conferido.', erro: null, parando: false, podeParar: false, doDisco: true },
          { id: 'f1', nome: 'o que falhou', tipo: null, estado: 'falhou', rotuloDoEstado: 'falhou', vivo: false, profundidade: 1, pai: null, filhos: [],
            inicioMs: agora - 90000, duracaoMs: 4000, tokens: null, tokensTexto: null, ferramentas: 1, ultimaFerramenta: null, atividade: null, resumo: null, erro: 'deu errado', parando: false, podeParar: false, doDisco: false },
        ] }
      const lerMapa = () => frame.evaluate(() => {
        const cor = (v, p = 'color') => { const s = document.createElement('span'); s.style[p] = `var(${v})`; document.body.appendChild(s); const c = getComputedStyle(s)[p]; s.remove(); return c }
        const b = document.getElementById('agentes'), mapa = document.getElementById('mapa')
        if (!b || !mapa) return { existe: false }
        const visivel = el => !!el && !el.hidden && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none'
        const cartoes = [...document.querySelectorAll('#mapa-ramos > .mapa-ramo > .agente')]
        const pontoDe = id => { const p = document.querySelector(`.agente[data-id="${id}"] .agente-ponto`); return p ? { cor: getComputedStyle(p).backgroundColor, raio: getComputedStyle(p).borderRadius } : null }
        const r1 = document.querySelector('.agente[data-id="r1"]')
        const detalhe = r1 && r1.parentElement.querySelector(':scope > .agente-detalhe')
        const ramo = document.querySelector('#mapa-ramos > .mapa-ramo')
        return {
          existe: true, botao: b.textContent.replace(/\s+/g, ' ').trim(), botaoVisivel: visivel(b), n: document.getElementById('agentes-n').textContent,
          expandido: b.getAttribute('aria-expanded'), aberto: visivel(mapa), foco: document.activeElement && (document.activeElement.id || document.activeElement.dataset.foco || document.activeElement.className),
          titulo: document.getElementById('mapa-titulo').textContent, sub: document.getElementById('mapa-sub').textContent,
          sessao: document.getElementById('mapa-sessao-titulo').textContent + ' | ' + document.getElementById('mapa-sessao-linha').textContent,
          sessaoViva: getComputedStyle(document.getElementById('mapa-sessao-ponto')).backgroundColor, verde: cor('--vscode-testing-iconPassed'),
          raizes: cartoes.map(c => c.dataset.id), linhaR1: r1 ? r1.querySelector('.agente-linha').textContent : '', linhaT1: (document.querySelector('.agente[data-id="t1"] .agente-linha') || {}).textContent,
          mais: r1 && r1.querySelector('.agente-mais') ? r1.querySelector('.agente-mais').textContent : '',
          toco: ramo ? getComputedStyle(ramo, '::before').borderTopWidth : '', tronco: ramo ? getComputedStyle(ramo, '::after').borderLeftWidth : '',
          pontos: { r1: pontoDe('r1'), t1: pontoDe('t1'), f1: pontoDe('f1') },
          destaque: cor('--vscode-textLink-foreground', 'backgroundColor'), cinza: cor('--vscode-descriptionForeground', 'backgroundColor'), erro: cor('--vscode-errorForeground', 'backgroundColor'),
          detalheR1: visivel(detalhe) ? detalhe.querySelector('.agente-campos').textContent : '', r1Expandido: r1 && r1.getAttribute('aria-expanded'),
          filhoDentro: !!(detalhe && detalhe.querySelector('.agente[data-id="n1"]')), n1NaRaiz: cartoes.some(c => c.dataset.id === 'n1'),
          confirmar: (document.querySelector('.agente-parar[data-confirmando="sim"] .agente-parar-texto') || {}).textContent || '',
          notas: [...document.querySelectorAll('.agente-nota')].map(n => n.textContent).join(' | '),
          relogio: document.body.dataset.relogioDoMapa || '',
        }
      })
      const esperarMapa = async (condicao, teto = 5000) => {
        const fim = Date.now() + teto
        let x = await lerMapa()
        while (!condicao(x) && Date.now() < fim) { await respirar(150); x = await lerMapa() }
        return x
      }
      await mandarPe({ ...MAPA, total: 0, rodando: 0, rotulo: '0 agentes', agentes: [] })
      let mp = await esperarMapa(x => x.existe)
      checar('V16: sem agente nenhum na conversa, o botão dos agentes não aparece', mp.existe && !mp.botaoVisivel, JSON.stringify({ existe: mp.existe, visivel: mp.botaoVisivel }))
      await mandarPe(MAPA)
      mp = await esperarMapa(x => x.botaoVisivel)
      checar('⛔ V16: com agentes, o pé mostra o botão com quantos RODAM ("2 agentes")', mp.botaoVisivel && mp.n === '2' && /^2 agentes$/.test(mp.botao), JSON.stringify({ botao: mp.botao, n: mp.n }))
      await frame.click('#agentes')
      mp = await esperarMapa(x => x.aberto)
      checar('⛔ V16: o botão abre o mapa: título, "N agentes · clique num agente", a sessão viva (ponto verde) com modelo e contexto',
        mp.aberto && mp.expandido === 'true' && mp.titulo === 'Mapa dos agentes' && /^4 agentes · 2 rodando · clique num agente/.test(mp.sub) &&
        mp.sessao === 'Minha conversa | Opus 5 (1M) · 450 mil tokens no contexto' && mp.sessaoViva === mp.verde, JSON.stringify({ sub: mp.sub, sessao: mp.sessao, viva: mp.sessaoViva, verde: mp.verde }))
      checar('⛔ V16: a árvore — um cartão por agente de primeiro nível, ligados por linhas; o de segundo nível NÃO fica na coluna (vai dentro do pai, "+1")',
        mp.raizes.join() === 'r1,t1,f1' && !mp.n1NaRaiz && mp.mais === '+1' && mp.toco === '2px' && mp.tronco === '2px', JSON.stringify({ raizes: mp.raizes, mais: mp.mais, toco: mp.toco, tronco: mp.tronco }))
      checar('⛔ V16: cada cartão diz tempo e tokens ("1m 5s · 251 mil tokens"; o terminado, "37m 3s · 251 mil tokens · terminou")',
        /^1m [5-7]s · 251 mil tokens$/.test(mp.linhaR1) && mp.linhaT1 === '37m 3s · 251 mil tokens · terminou', `${mp.linhaR1} | ${mp.linhaT1}`)
      checar('⛔ V16: o estado tem cor E forma: rodando = círculo no destaque · terminou = círculo cinza · falhou = losango na cor de erro',
        mp.pontos.r1.cor === mp.destaque && mp.pontos.r1.raio === '50%' && mp.pontos.t1.cor === mp.cinza && mp.pontos.f1.cor === mp.erro && mp.pontos.f1.raio === '1px',
        JSON.stringify({ p: mp.pontos, d: mp.destaque, c: mp.cinza, e: mp.erro }))
      checar('⛔ V16: com o mapa aberto e agente rodando, UM relógio de 1 s anda', mp.relogio === 'ligado', mp.relogio)
      await respirar(2200)
      const depois = await lerMapa()
      checar('⛔ V16: o tempo de quem roda anda sozinho (sem mensagem nova do host)', depois.linhaR1 !== mp.linhaR1 && /^1m ([7-9]|10)s/.test(depois.linhaR1), `${mp.linhaR1} -> ${depois.linhaR1}`)

      // Clique num agente: o detalhe, com o de segundo nível dentro.
      await frame.click('.agente[data-id="r1"]')
      mp = await esperarMapa(x => !!x.detalheR1)
      checar('⛔ V16: clicar num agente expande: estado, tipo, o que faz agora, última ferramenta, ferramentas, tokens, duração',
        mp.r1Expandido === 'true' && ['Estado', 'rodando', 'Tipo', 'general-purpose', 'Fazendo agora', 'Running testes', 'Última ferramenta', 'PowerShell', 'Ferramentas usadas', '116', 'Tokens no contexto', '251 mil tokens', 'Duração'].every(t => mp.detalheR1.includes(t)),
        mp.detalheR1)
      checar('⛔ V16: e o de segundo nível aparece DENTRO dele', mp.filhoDentro, String(mp.filhoDentro))

      // Parar: pergunta no próprio cartão, o foco fica em "Deixar rodando"; confirmado, vai ao host de verdade.
      await frame.click('[data-foco="parar|r1"]')
      mp = await esperarMapa(x => !!x.confirmar)
      checar('⛔ V16: "Parar este agente…" pergunta antes, no cartão, e o foco vai para "Deixar rodando"',
        /O que ele ainda não fez não será feito/.test(mp.confirmar) && mp.foco === 'manter|r1', JSON.stringify({ confirmar: mp.confirmar, foco: mp.foco }))
      const botoesDoParar = await frame.evaluate(() => ({ manter: document.querySelector('[data-foco="manter|r1"]').className, parar: document.querySelector('[data-foco="confirmar|r1"]').className }))
      checar('⛔ V16: na confirmação, "Deixar rodando" é o botão primário e "Parar o agente" o secundário',
        !/secundario/.test(botoesDoParar.manter) && /secundario/.test(botoesDoParar.parar), JSON.stringify(botoesDoParar))
      await frame.click('[data-foco="confirmar|r1"]')
      mp = await esperarMapa(x => /Não consegui parar/.test(x.notas))
      checar('V16: a parada confirmada vai ao host; recusada (o agente não existe), o cartão diz que não parou', /Não consegui parar/.test(mp.notas), mp.notas)

      // Esc fecha e devolve o foco ao botão; o relógio para.
      await win.keyboard.press('Escape')
      mp = await esperarMapa(x => !x.aberto)
      checar('⛔ V16: Esc fecha o mapa, devolve o foco ao botão dos agentes, e o relógio do mapa para',
        !mp.aberto && mp.expandido === 'false' && mp.foco === 'agentes' && mp.relogio === 'desligado', JSON.stringify({ aberto: mp.aberto, foco: mp.foco, relogio: mp.relogio }))
      await frame.click('#agentes')
      await esperarMapa(x => x.aberto)
      // O MAPA ESTREITO (a conversa num painel de 250 a 600 px). Medido no executável: numa coluna, ~170 px vazios
      // entre o cartão da sessão e o primeiro agente; a 454 px ainda em duas colunas, a sessão com 136 px e cinco
      // linhas; e a 248 px os nomes cortados ("FUNCIONAL A: …").
      await mandarPe({ ...MAPA, agentes: [
        { ...MAPA.agentes[0], id: 'e1', filhos: [] },
        { ...MAPA.agentes[2], id: 'e2' },
        { ...MAPA.agentes[3], id: 'e3' },
      ], sessao: { titulo: 'Revisão do build de teste', viva: true, linha: 'Opus 5 (1M) · 449 mil tokens no contexto' } })
      await respirar(300)
      const estreito = await frame.evaluate(() => {
        const mapa = document.getElementById('mapa')
        const antes = { right: mapa.style.right, width: mapa.style.width }
        const ruins = []
        for (const w of [248, 300, 360, 454, 520]) {
          mapa.style.right = 'auto'; mapa.style.width = w + 'px'
          const corpo = mapa.querySelector('.mapa-corpo'), sessao = mapa.querySelector('.mapa-sessao')
          const cartoes = [...mapa.querySelectorAll('#mapa-ramos > .mapa-ramo > .agente')]
          const colunas = getComputedStyle(corpo).gridTemplateColumns.split(' ').length
          const s = sessao.getBoundingClientRect(), c0 = cartoes[0] && cartoes[0].getBoundingClientRect()
          const lh = el => { const st = getComputedStyle(el); const l = parseFloat(st.lineHeight); return Number.isFinite(l) ? l : parseFloat(st.fontSize) * 1.4 }
          const linhas = el => Math.round(el.getBoundingClientRect().height / lh(el))
          const nLinhas = linhas(sessao.querySelector('.mapa-sessao-titulo')) + linhas(sessao.querySelector('.mapa-sessao-linha'))
          if (colunas !== 1) ruins.push(`${w}px: ${colunas} colunas`)
          else if (c0 && c0.top - s.bottom > 40) ruins.push(`${w}px: ${Math.round(c0.top - s.bottom)}px vazios entre a sessão e o primeiro agente`)
          if (nLinhas > 3) ruins.push(`${w}px: a sessão em ${nLinhas} linhas`)
          const cortados = cartoes.flatMap(c => [...c.querySelectorAll('.agente-nome, .agente-linha')]).filter(e => e.scrollWidth > e.clientWidth + 1)
          if (cortados.length) ruins.push(`${w}px: cortado "${cortados[0].textContent.slice(0, 24)}"`)
        }
        mapa.style.right = antes.right; mapa.style.width = antes.width
        return ruins
      })
      checar('⛔ V16: mapa estreito (250 a 520 px): uma coluna, a sessão logo acima dos agentes, em até 3 linhas, e nenhum nome cortado',
        estreito.length === 0, estreito.slice(0, 5).join(' | ') || '5 larguras')
      await mandarPe(MAPA)
      await respirar(200)
      await frame.click('#mapa-fechar')
      mp = await esperarMapa(x => !x.aberto)
      checar('V16: o ✕ também fecha', !mp.aberto && mp.foco === 'agentes', JSON.stringify({ aberto: mp.aberto, foco: mp.foco }))

      // O pé a 506 px COM o botão dos agentes, e com tudo o mais que ele pode ter (a mesma medida da V14/V15).
      const pe16 = await frame.evaluate(() => {
        const pe = document.querySelector('.pe'), linha = document.querySelector('.linha-de-estado')
        const modelo = document.getElementById('modelo'), conta = document.getElementById('conta'), sair = document.getElementById('sair'), ag = document.getElementById('agentes')
        const antes = { largura: pe.style.width, modelo: modelo.textContent, modeloOculto: modelo.hidden, conta: conta.textContent, sair: sair.hidden }
        pe.style.width = '506px'
        modelo.hidden = false
        modelo.replaceChildren(...[['nome', 'Opus 5'], ['contexto', ' (1M)'], ['esforco', ' · extra-alto']].map(([p, t]) => {
          const s = document.createElement('span'); s.className = 'modelo-' + p; s.textContent = t; return s
        }))
        conta.textContent = 'uma.pessoa.com.nome.bem.comprido@exemplo.com'
        sair.hidden = false
        document.getElementById('agentes-n').textContent = '12'
        const altura = el => { const s = getComputedStyle(el); const l = parseFloat(s.lineHeight); return Number.isFinite(l) ? l : parseFloat(s.fontSize) * 1.4 }
        const umaLinha = el => el.getClientRects().length === 1 && el.getBoundingClientRect().height <= altura(el) * 1.5 + 1
        // O seletor do modo mede a opção escolhida: a medida passa pelos QUATRO modos (o do "faz tudo" é o mais comprido).
        const modo = document.getElementById('modo'), pular = modo.querySelector('option[value="bypassPermissions"]')
        const modoAntes = { valor: modo.value, oculto: pular.hidden, desligado: pular.disabled }
        pular.hidden = false; pular.disabled = false
        const porModo = {}
        for (const valor of ['default', 'plan', 'acceptEdits', 'bypassPermissions']) {
          modo.value = valor
          const borda = linha.getBoundingClientRect().right + 0.5
          const passam = [...linha.children].filter(c => !c.hidden && c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().right > borda).map(c => c.id || c.className)
          porModo[valor] = { passam, estouro: linha.scrollWidth - linha.clientWidth, altura: Math.round(linha.getBoundingClientRect().height),
            larguras: [...linha.children].filter(c => !c.hidden && getComputedStyle(c).display !== 'none').map(c => `${c.id || c.className}=${Math.round(c.getBoundingClientRect().width)}`).join(' ') }
        }
        modo.value = modoAntes.valor; pular.hidden = modoAntes.oculto; pular.disabled = modoAntes.desligado
        const r = { agentesVisivel: !ag.hidden && ag.getBoundingClientRect().width > 0, agentes: umaLinha(ag), rotuloAgentes: getComputedStyle(document.getElementById('agentes-rotulo')).display, porModo }
        pe.style.width = antes.largura; modelo.textContent = antes.modelo; modelo.hidden = antes.modeloOculto; conta.textContent = antes.conta; sair.hidden = antes.sair
        return r
      })
      const relato = m => `passam: ${m.passam.join(', ') || 'nada'}; estouro ${m.estouro}px; altura ${m.altura}px; ${m.larguras}`
      checar('⛔ V16: pé a 506 px COM o botão dos agentes ("12", sem a palavra) e tudo o mais, no modo padrão: numa linha só, e nada passa da borda',
        pe16.agentesVisivel && pe16.agentes && pe16.rotuloAgentes === 'none' && pe16.porModo.default.passam.length === 0 && pe16.porModo.default.estouro <= 0 &&
        pe16.porModo.default.altura <= 30, relato(pe16.porModo.default))
      checar('⛔ V16: e nos outros três modos (o seletor mede a opção escolhida), nada passa da borda (o "Sair" pode descer)',
        ['plan', 'acceptEdits', 'bypassPermissions'].every(v => pe16.porModo[v].passam.length === 0 && pe16.porModo[v].estouro <= 0),
        ['plan', 'acceptEdits', 'bypassPermissions'].map(v => `${v}: ${relato(pe16.porModo[v])}`).join(' || '))
      // O PÉ DE 540 A 780 px, com e sem agentes, nos modos de texto curto e comprido. Medido no executável: entre 560 e
      // ~720 px o e-mail virava uma letra solta (3 a 38 px, sem reticências), e com agentes nos modos compridos a linha
      // passava da borda (até 82 px a 600 px) — só o pé de 506 px era medido.
      const varredura = await frame.evaluate(() => {
        const pe = document.querySelector('.pe'), linha = document.querySelector('.linha-de-estado')
        const modelo = document.getElementById('modelo'), conta = document.getElementById('conta'), sair = document.getElementById('sair'), ag = document.getElementById('agentes')
        const modo = document.getElementById('modo'), pular = modo.querySelector('option[value="bypassPermissions"]')
        const antes = { largura: pe.style.width, modelo: modelo.textContent, modeloOculto: modelo.hidden, conta: conta.textContent, sair: sair.hidden, ag: ag.hidden, valor: modo.value, oculto: pular.hidden, desligado: pular.disabled }
        modelo.hidden = false
        modelo.replaceChildren(...[['nome', 'Opus 5'], ['contexto', ' (1M)'], ['esforco', ' · alto']].map(([p, t]) => {
          const s = document.createElement('span'); s.className = 'modelo-' + p; s.textContent = t; return s
        }))
        conta.textContent = 'uma.pessoa.de.nome.comprido@exemplo.com'
        sair.hidden = false
        pular.hidden = false; pular.disabled = false
        const ruins = []
        for (const [comAgentes, valor] of [[false, 'default'], [true, 'default'], [true, 'bypassPermissions'], [false, 'bypassPermissions']]) {
          ag.hidden = !comAgentes
          modo.value = valor
          for (let w = 540; w <= 780; w += 20) {
            pe.style.width = w + 'px'
            const c = conta.getBoundingClientRect(), s = getComputedStyle(conta)
            const vista = s.visibility !== 'hidden' && s.display !== 'none' && c.width > 0
            const estouro = linha.scrollWidth - linha.clientWidth
            if (estouro > 0) ruins.push(`${w}px ${comAgentes ? 'com' : 'sem'} agentes, ${valor}: passa ${estouro}px`)
            if (vista && c.width < 40) ruins.push(`${w}px ${comAgentes ? 'com' : 'sem'} agentes, ${valor}: e-mail com ${Math.round(c.width)}px`)
          }
        }
        pe.style.width = antes.largura; modelo.textContent = antes.modelo; modelo.hidden = antes.modeloOculto; conta.textContent = antes.conta; sair.hidden = antes.sair; ag.hidden = antes.ag
        modo.value = antes.valor; pular.hidden = antes.oculto; pular.disabled = antes.desligado
        return ruins
      })
      checar('⛔ pé de 540 a 780 px (com e sem agentes, modo curto e comprido): nada passa da borda, e o e-mail aparece com pelo menos 40 px ou não aparece',
        varredura.length === 0, varredura.slice(0, 6).join(' | ') || '52 medidas')
      await mandarPe({ ...MAPA, total: 0, rodando: 0, rotulo: '0 agentes', agentes: [] })

      // AS DUAS BARRAS QUE SOBRAM TÊM COMPOSIÇÃO DEFINIDA PELO DONO, item a item: a de cima e a do
      // título do painel da conversa ("a ÚNICA coisa … é o ícone de nova conversa").
      //
      // ⚠️ ESTE CRITÉRIO MUDOU DE PERGUNTA NA V21 (22/09/2026) — e não foi apagado.
      //
      // Até a V20 ele cobrava que "Skills" não estivesse em barra nenhuma de composição definida, e
      // era descrição fiel do que ele tinha pedido ANTES ("…só isso"). Na V21 ele pediu o contrário
      // para a barra de cima — o `t198`, com as palavras dele: *"esses negócio ao invés de lateral,
      // eu quero em cima, na horizontal, entre a logo na esquerda e a barra de pesquisa no
      // centro"* — e `tela_barra_de_icones_em_cima.mjs` passou a cobrar a PRESENÇA dos três lá:
      // Arquivos, Git e Skills.
      //
      // Com o critério antigo no lugar, os dois ficavam CONTRADITÓRIOS na mesma bateria, e o
      // conserto certo aparecia como regressão: é o critério CÚMPLICE, aquele que grava o
      // comportamento antigo como esperado. Medido em 22/09/2026 com a máquina livre: esta suíte reprovava
      // *"Skills … cima 2"* enquanto a suíte do `t198` dava 6/6 no mesmo build.
      //
      // ⚠️ E O "2" NUNCA FOI ÍCONE DUPLICADO. Sonda na tela: um `a.action-label` de 22x22 px e um
      // `div.badge` de 0x0 — o contador do MESMO item, que herda o `aria-label`. Contar nós com
      // `aria-label` conta o badge; o que se quer contar é ÍCONE. Por isso o seletor desceu até o
      // `a.action-label` dentro do contêiner de atividade da barra de título.
      const iconeNaBarraDeCima = rotulo => win.locator(
        `.part.titlebar .titlebar-activity-container .action-item a.action-label[aria-label="${rotulo}"]`).count()
      const noTituloDoPainel = rotulo => win.locator(
        `.part.editor .editor-actions [aria-label="${rotulo}"]`).count()
      {
        // A porta de Tokens é o CUSTO no pé da conversa — ele não vira ícone em barra nenhuma.
        const cima = await iconeNaBarraDeCima('Tokens da conversa')
        const painel = await noTituloDoPainel('Tokens da conversa')
        checar('⛔ "Tokens da conversa" NÃO entra nas barras de composição definida (cima e título do painel)',
          cima === 0 && painel === 0, `cima ${cima}, painel ${painel}`)
      }
      {
        const cima = await iconeNaBarraDeCima('Skills')
        const painel = await noTituloDoPainel('Skills')
        checar('⛔ V21/t198: "Skills" ESTÁ na barra de cima, e é UM ícone só', cima === 1, `cima ${cima}`)
        checar('⛔ "Skills" NÃO entra na barra de título do painel da conversa', painel === 0, `painel ${painel}`)
      }
      const abertaA = async nome => win.locator(`[id="workbench.view.extension.${nome}"]`).first().isVisible().catch(() => false)
      const tituloDaLateral = async () => (await win.locator('.sidebar .composite.title .title-label').first().innerText().catch(() => '')).trim()
      // O custo só existe com conversa; sem login ele recebeu o pé típico, logo acima.
      await frame.click('#custo')
      await respirar(2500)
      checar('⛔ clicar no custo, no pé da conversa, abre a vista Tokens', await abertaA('oficinaTokens'))
      // O título da lateral junta o nome do contêiner e o da vista quando os dois diferem:
      // "TOKENS: TOKENS DA CONVERSA" (revisão de tela). Com os dois iguais, sai uma vez só.
      const tTokens = await tituloDaLateral()
      checar('o título da lateral de Tokens não se repete', !!tTokens && !/:/.test(tTokens), tTokens || '(sem título)')
      if (!await abrirPaleta(win, respirar)) throw new Error('a paleta nao abriu')
      await win.keyboard.type('OFICINA: Skills')
      const item = win.locator('.quick-input-list .monaco-list-row', { hasText: /^OFICINA: Skills/i }).first()
      await item.waitFor({ timeout: 15000 })
      await item.click()
      await respirar(2500)
      checar('a vista Skills abre pelo comando (o mesmo do guia de boas-vindas)', await abertaA('oficinaSkills'))
      const tSkills = await tituloDaLateral()
      checar('o título da lateral de Skills não se repete', !!tSkills && !/:/.test(tSkills), tSkills || '(sem título)')
    }
  } catch (e) {
    checar(`[${tema}] execucao sem excecao`, false, String(e && e.message || e))
  } finally {
    if (app) await fecharApp(app)
    if (antes === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = antes
    try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
  }
}

const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: res.length, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
