// TEMAS — prova que os dois temas da OFICINA nao tem buraco.
//
// "Buraco" e a cor que o tema nao define: o VS Code cai no default da Microsoft e o
// produto fica com uma peca azul no meio do carvao. Nao quebra nada, nao aparece em
// teste de fumaca, e so um olho humano notaria — o mesmo tipo de defeito silencioso
// que o `configurationDefaults` era antes do patch 0001.
//
// O que este arquivo cobra, na ordem em que a evidencia e confiavel:
//   1. a LISTA de tokens oficiais esta em dia com o clone (senao o teste envelhece
//      junto com o tema e os dois ficam verdes mentindo);
//   2. os dois temas cobrem 100% dessa lista;
//   3. toda cor e sintaticamente valida (#rrggbb ou #rrggbbaa);
//   4. o texto tem contraste legivel sobre o fundo em que ele de fato aparece — um
//      tema pode cobrir 100% dos tokens e ainda ser impossivel de ler;
//   5. a regra da casa: a brasa e a unica coisa quente. Se a sintaxe tambem for
//      laranja, o acento para de significar alguma coisa;
//   6. o produto aponta para o nosso tema (`workbench.colorTheme`), senao os dois
//      arquivos existem e ninguem os ve.
//
// CONTROLE POSITIVO no fim: apaga uma cor de uma copia em memoria e confere que o
// criterio de cobertura REPROVA. Guarda que nunca foi vista falhando e so intencao.
//
// Uso: node testes/temas.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const RAIZ = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const CLONE = path.join(RAIZ, 'vscode')
const LISTA = path.join(REPO, 'identidade', 'tokens_oficiais.txt')
const DIR_TEMAS = path.join(REPO, 'extensoes', 'oficina-temas', 'temas')

const res = []
const pulados = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + detalhe + ')' : ''}`)
}
// ⚠️ Criterio PULADO nao e criterio passado, e o JSON tem que dizer isso.
//
// O `passou` soma ok/falha e nao enxerga o que nem foi medido: uma corrida verde num
// lugar sem o clone daria "tema 100% coberto" com a lista possivelmente tres tags
// atrasada -- o mesmo buraco silencioso que custou 13% da lista, entrando por outra
// porta. Quem consome a saida recebe a lista de pulados junto -- no JSON do fim
// deste arquivo, e nao so na tela. (Revisao independente, 06/09/2026; a metade que
// faltava, o JSON, foi achada pela revisao final no mesmo dia: ate entao a lista vivia
// so na memoria do processo, e numa maquina sem python a suite saia verde com o
// criterio anti-drift nem tendo rodado.)
const pular = (criterio, porque) => {
  pulados.push({ criterio, porque })
  console.log(`  --    ${criterio}: PULADO (${porque}) — nao e um OK`)
}

// ── 1. a lista oficial esta em dia com o clone ──────────────────────────────────
// Varre o fonte do VS Code atras de `registerColor('id'`. Se o clone nao estiver
// nesta maquina o criterio e PULADO, com aviso — nunca dado por verde.
function idsDoClone() {
  const alvo = path.join(CLONE, 'src', 'vs')
  if (!fs.existsSync(alvo)) return null
  const ids = new Set()
  const re = /registerColor\(\s*'([a-zA-Z0-9_.]+)'/g
  const andar = (dir) => {
    for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, it.name)
      if (it.isDirectory()) andar(p)
      else if (it.name.endsWith('.ts')) {
        const txt = fs.readFileSync(p, 'utf8')
        let m
        while ((m = re.exec(txt))) ids.add(m[1])
      }
    }
  }
  andar(alvo)
  return ids
}

const listaEmDisco = new Set(fs.readFileSync(LISTA, 'utf8').split('\n').map(s => s.trim()).filter(Boolean))
const doClone = idsDoClone()
if (doClone) {
  const faltando = [...doClone].filter(id => !listaEmDisco.has(id))
  checar('a lista de tokens oficiais esta em dia com o clone', faltando.length === 0,
    faltando.length ? `${faltando.length} cor(es) novas no upstream: ${faltando.slice(0, 5).join(', ')} — rode a extracao` : `${doClone.size} tokens`)
} else {
  pular('a lista de tokens oficiais esta em dia com o clone',
    `clone ausente em ${CLONE}; defina OFICINA_BUILD`)
}

// ── contraste (WCAG 2.1) ────────────────────────────────────────────────────────
const canal = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
// matiz em graus, para separar quente de frio
const matiz = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (d === 0) return null           // cinza nao tem matiz: nao conta como quente
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = h * 60
  return (h + 360) % 360
}
const satur = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1))
}

// ── os pares que a pessoa realmente le ──────────────────────────────────────────
// Texto pequeno pede 4.5:1; o alvo aqui e 4.5 para corpo e 3.0 para o que e apoio
// (numero de linha, item inativo) — que e o piso do WCAG para texto grande e icone.
//
// ⚠️ COMENTARIO NAO E APOIO: e conteudo, e cobra 4.5 como o resto do codigo. Ate
// 06/09/2026 este arquivo lhe dava isencao de 3.0 enquanto o registro do projeto afirmava o
// contrario, e o tema claro vivia em 3,92:1 dentro dessa brecha — o documento e o
// teste discordando sobre a mesma cor. A incoerencia foi resolvida do lado do
// PRODUTO (o `com` do claro subiu para 4,79:1), nao do lado do alvo.
const PARES = [
  ['editor.foreground', 'editor.background', 4.5, 'codigo no editor'],
  ['sideBar.foreground', 'sideBar.background', 4.5, 'texto da lateral'],
  // ⛔ Texto secundario e TEXTO: 4,5 (revisao visual de 18/09/2026 — a barra de status dava 3,00:1
  // no claro, a descricao 3,59:1, o titulo da lateral 3,29:1, e a aba inativa 3,28:1).
  ['statusBar.foreground', 'statusBar.background', 4.5, 'barra de status'],
  ['descriptionForeground', 'sideBar.background', 4.5, 'descricao na lateral'],
  ['descriptionForeground', 'editor.background', 4.5, 'descricao no editor'],
  ['sideBarTitle.foreground', 'sideBar.background', 4.5, 'titulo da lateral'],
  ['panelTitle.inactiveForeground', 'panel.background', 4.5, 'aba inativa do painel'],
  ['titleBar.activeForeground', 'titleBar.activeBackground', 3.0, 'barra de titulo'],
  ['tab.activeForeground', 'tab.activeBackground', 4.5, 'aba ativa'],
  ['tab.inactiveForeground', 'tab.inactiveBackground', 4.5, 'aba inativa'],
  // O grupo SEM foco é comum desde que a conversa mora ao lado do editor (e a barra da direita, o navegador): a aba
  // da conversa fica justamente num deles. Caíam na regra do "inativo" (a cor de desabilitado): 3,89:1 e 3,28:1.
  ['tab.unfocusedActiveForeground', 'tab.unfocusedActiveBackground', 4.5, 'aba ativa de grupo sem foco'],
  ['tab.unfocusedInactiveForeground', 'tab.unfocusedInactiveBackground', 4.5, 'aba inativa de grupo sem foco'],
  ['tab.unfocusedHoverForeground', 'tab.unfocusedHoverBackground', 4.5, 'aba sob o mouse em grupo sem foco'],
  ['terminal.foreground', 'terminal.background', 4.5, 'terminal'],
  ['button.foreground', 'button.background', 4.5, 'botao primario'],
  ['input.foreground', 'input.background', 4.5, 'campo de texto'],
  ['menu.foreground', 'menu.background', 4.5, 'menu'],
  ['list.activeSelectionForeground', 'editor.background', 4.5, 'item selecionado'],
  ['editorLineNumber.foreground', 'editor.background', 3.0, 'numero de linha'],
  ['badge.foreground', 'badge.background', 4.5, 'contador'],
  ['notifications.foreground', 'notifications.background', 4.5, 'notificacao'],
  ['quickInput.foreground', 'quickInput.background', 4.5, 'paleta de comandos'],
]
// a sintaxe tambem e lida o dia inteiro, e sai do tokenColors, nao do colors
const SINTAXE = ['Comentario', 'Cadeia', 'Numero', 'Palavra-chave', 'Funcao', 'Tipo e classe', 'Texto']

const chato = (c) => (c || '').slice(0, 7)   // ignora o canal alfa na conta de contraste

// ── O PAINEL DA CONVERSA: a cor que cada peça dele usa, lida do CSS ─────────────
//
// Os pares acima provam o tema contra o EDITOR. Mas o painel da conversa escolhe, peça por peça, qual
// cor do tema vai onde — e foi ali que as linhas do mapa dos agentes sumiram no escuro (borda da mesma
// claridade do fundo elevado, 1,01:1), sem nenhum criterio acusar: o tema estava "certo" e a escolha
// estava errada. Aqui o CSS do painel e lido de verdade: para cada peca, a propriedade dela, a primeira
// `var(--vscode-…)` da declaracao (a que vale com o nosso tema), e o contraste contra o fundo sobre o
// qual ela e desenhada. TODAS as declaracoes da peca passam pela conta — a de base e as de `@container`,
// que sao a mesma peca em outra largura. Peca sem declaracao reprova: sumiu do CSS ou mudou de nome.
const CSS_DO_PAINEL = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'painel', 'painel.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
function tokensNoPainel(seletor, propriedade) {
  const achados = []
  for (const m of CSS_DO_PAINEL.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const seletores = m[1].split(',').map(s => s.trim())
    if (!seletores.includes(seletor)) continue
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':')
      if (i < 0 || d.slice(0, i).trim() !== propriedade) continue
      const valor = d.slice(i + 1).trim()
      // `none`/`transparent` e a peca NAO desenhada naquela largura: nao ha cor para medir
      if (/^(none|transparent|0)$/.test(valor)) continue
      const v = /var\(--vscode-([A-Za-z0-9-]+)/.exec(valor)
      achados.push(v ? v[1] : null)
    }
  }
  return achados
}
const chaveDoTema = (cores, nomeCss) => Object.keys(cores).find(k => k.replace(/\./g, '-') === nomeCss) || null

for (const arq of ['oficina-escuro.json', 'oficina-claro.json']) {
  const tema = JSON.parse(fs.readFileSync(path.join(DIR_TEMAS, arq), 'utf8'))
  const nome = tema.name
  const cores = tema.colors

  // ── 2. cobertura ──
  const faltando = [...listaEmDisco].filter(id => !(id in cores))
  checar(`${nome}: cobre 100% dos tokens oficiais`, faltando.length === 0,
    faltando.length ? `${faltando.length} sem cor: ${faltando.slice(0, 6).join(', ')}` : `${listaEmDisco.size} tokens`)

  // ── 3. formato ──
  const invalidas = Object.entries(cores).filter(([, v]) => !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v))
  checar(`${nome}: toda cor tem formato valido`, invalidas.length === 0,
    invalidas.length ? invalidas.slice(0, 3).map(([k, v]) => `${k}=${v}`).join(' | ') : `${Object.keys(cores).length} cores`)

  // ── 4. contraste ──
  const ruins = []
  for (const [frente, fundo, alvo, apelido] of PARES) {
    const f = chato(cores[frente]), b = chato(cores[fundo])
    if (!f || !b) { ruins.push(`${apelido}: token ausente`); continue }
    const r = contraste(f, b)
    if (r < alvo) ruins.push(`${apelido} ${r.toFixed(2)}:1 < ${alvo}`)
  }
  const fundoEditor = chato(cores['editor.background'])
  for (const alvoNome of SINTAXE) {
    const regra = tema.tokenColors.find(t => t.name === alvoNome)
    if (!regra) { ruins.push(`sintaxe "${alvoNome}" ausente`); continue }
    // 4.5 para TODA a sintaxe, comentario incluido (ver o aviso no topo dos PARES)
    const alvo = 4.5
    const r = contraste(chato(regra.settings.foreground), fundoEditor)
    if (r < alvo) ruins.push(`sintaxe ${alvoNome} ${r.toFixed(2)}:1 < ${alvo}`)
  }
  checar(`${nome}: tudo que se le tem contraste suficiente`, ruins.length === 0, ruins.slice(0, 4).join(' | '))

  // ── 4b. erro, aviso e acerto nao podem depender SO do matiz ──────────────────
  //
  // Vermelho (6°), amarelo (40°) e a brasa (27°) sao vizinhos na roda de cores --
  // justamente a faixa que protanopia e deuteranopia embaralham (perto de 8% dos
  // homens). Um tema que separa "deu erro" de "atencao" so pelo matiz nao e legivel
  // para quem tem visao de cor reduzida.
  //
  // O que da para cobrar num teste automatico e o que sobra quando a cor se perde: a
  // LUMINANCIA. Se erro e aviso tambem se separam por claridade, a distincao
  // sobrevive. Achado duma revisao independente, 06/09/2026 -- e nao havia uma linha sobre
  // isso no projeto ate entao.
  {
    const pares = [
      ['erro x aviso', cores['editorError.foreground'], cores['editorWarning.foreground']],
      ['erro x acerto', cores['editorError.foreground'], cores['gitDecoration.addedResourceForeground']],
      ['aviso x acerto', cores['editorWarning.foreground'], cores['gitDecoration.addedResourceForeground']],
    ]
    const juntos = pares.filter(([, a, b]) => contraste(chato(a), chato(b)) < 1.35)
    checar(`${nome}: erro, aviso e acerto se separam tambem por claridade`, juntos.length === 0,
      juntos.length
        ? juntos.map(([n, a, b]) => `${n}: ${contraste(chato(a), chato(b)).toFixed(2)}:1`).join(' | ')
        : pares.map(([n, a, b]) => `${n} ${contraste(chato(a), chato(b)).toFixed(2)}:1`).join(' · '))
  }

  // ── 4c. o acento NAO pode pintar o que significa "inativo" ───────────────────
  //
  // Nasceu de um bug de substring no gerador: "inactive" CONTEM "active", e o teste
  // do ramo ativo vinha primeiro. 30 tokens de estado inativo saiam pintados de
  // brasa -- a cor que quer dizer "e aqui que voce esta" marcando exatamente o que
  // nao esta. Nenhum teste via, porque cor errada nao quebra nada.
  {
    // Duas excecoes DECLARADAS, e as duas sao acento de proposito:
    //  - `editor.inactiveSelectionBackground`: a selecao continua marcada quando o
    //    editor perde o foco -- e a mesma selecao, mais fraca, nao outro estado;
    //  - `tab.unfocusedActiveBorderTop`: a aba ATIVA de um grupo sem foco.
    const COM_ACENTO_DE_PROPOSITO = ['editor.inactiveSelectionBackground', 'tab.unfocusedActiveBorderTop']
    const brasa = chato(cores['focusBorder']).toLowerCase()
    const inativos = Object.entries(cores).filter(([k, v]) =>
      /inactive|unfocused|disabled|placeholder/i.test(k) &&
      chato(v).toLowerCase() === brasa &&
      !COM_ACENTO_DE_PROPOSITO.includes(k))
    checar(`${nome}: o acento nao pinta o que esta INATIVO`, inativos.length === 0,
      inativos.length ? `${inativos.length}: ${inativos.slice(0, 5).map(([k]) => k).join(', ')}` : 'so as 2 excecoes declaradas')
  }

  // ── 4d. a escada de superficies separa os planos ─────────────────────────────
  //
  // ΔL* do CIELAB entre degraus vizinhos. Abaixo de ~3 duas superficies grandes e
  // chapadas leem como uma placa so, e a separacao passa a depender da borda -- que
  // some em tudo que flutua. Medido antes: 1,6 a 3,8.
  {
    const lstar = (hex) => {
      const y = lum(hex)
      return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
    }
    const degraus = [
      ['titulo→lateral', 'titleBar.activeBackground', 'sideBar.background'],
      ['lateral→editor', 'sideBar.background', 'editor.background'],
      ['editor→painel', 'editor.background', 'panel.background'],
      ['painel→widget', 'panel.background', 'editorWidget.background'],
    ]
    const MIN = 2.8
    const rasos = degraus
      .map(([n, a2, b2]) => [n, Math.abs(lstar(chato(cores[a2])) - lstar(chato(cores[b2])))])
      .filter(([, d]) => d < MIN)
    checar(`${nome}: os planos se separam sem depender da borda`, rasos.length === 0,
      rasos.length ? rasos.map(([n, d]) => `${n} ΔL* ${d.toFixed(2)} < ${MIN}`).join(' | ')
        : degraus.map(([n, a2, b2]) => `${n} ${Math.abs(lstar(chato(cores[a2])) - lstar(chato(cores[b2]))).toFixed(1)}`).join(' · '))
  }

  // ── 4e. o hover nunca piora a leitura ────────────────────────────────────────
  //
  // No tema claro, `button.hoverBackground` CLAREAVA: o botao primario ia de 5,45:1
  // para 3,73:1 quando o mouse passava -- reprovando AA justamente no momento em que
  // a pessoa esta olhando para ele.
  {
    const repouso = contraste(chato(cores['button.foreground']), chato(cores['button.background']))
    const hover = contraste(chato(cores['button.foreground']), chato(cores['button.hoverBackground']))
    checar(`${nome}: o hover do botao nao piora a leitura`, hover >= 4.5,
      `repouso ${repouso.toFixed(2)}:1 · hover ${hover.toFixed(2)}:1`)
  }

  // ── 4f. a borda se ve sobre o que flutua ─────────────────────────────────────
  //
  // No escuro a borda tinha a MESMA claridade da superficie elevada (17 contra 17,5%): 1,01:1. Tudo que
  // e desenhado por borda em cima de uma caixa flutuante sumia — os cartoes e a arvore do mapa dos
  // agentes, o trilho do esforco, a borda do campo dentro da paleta. No claro a borda fica FORA da
  // escada de superficies (mais escura que todas), e ali as mesmas pecas se leem: 1,36:1 sobre o branco.
  // O piso de 1,3 e esse — o do claro, que a revisao de beleza de 18/09/2026 viu se ler.
  {
    const r = contraste(chato(cores['input.border']), chato(cores['editorWidget.background']))
    checar(`${nome}: a borda se ve sobre a superficie elevada`, r >= 1.3, `${r.toFixed(2)}:1 (piso 1,3)`)
  }

  // ── 4g. o painel da conversa: o que ele desenha com o tema se ve ─────────────
  //
  // [seletor, propriedade, fundo sobre o qual a peca aparece, piso, apelido]. 3:1 e o piso do WCAG 1.4.11
  // para o grafico que da a estrutura (a linha e o que liga a sessao aos agentes; o trilho e o que diz
  // "quanto falta"); 1,3 e o da borda de caixa (ver 4f).
  {
    const PECAS = [
      ['.mapa-ramo::before', 'border-top', 'editorWidget.background', 3, 'mapa: o toco da arvore ate o cartao'],
      ['.mapa-ramo::after', 'border-left', 'editorWidget.background', 3, 'mapa: a linha que liga os irmaos'],
      ['.mapa-sessao::after', 'border-top', 'editorWidget.background', 3, 'mapa: a linha da sessao ate os agentes'],
      ['.mapa-sessao::after', 'border-left', 'editorWidget.background', 3, 'mapa estreito: a linha da sessao descendo'],
      ['.esforco-trilho', 'background', 'menu.background', 3, 'o trilho que liga os pontos do esforco'],
      ['.agente', 'border', 'editorWidget.background', 1.3, 'a borda do cartao do agente sobre o mapa'],
      ['.cache-trilho', 'stroke', 'editor.background', 3, 'o trilho do relogio do cache (o circulo de referencia do anel)'],
      ['.cache-arco', 'stroke', 'editor.background', 3, 'o arco do relogio do cache (o que falta)'],
      // o vermelho do tema e calibrado como SINAL (>= 3:1), nao como texto: "Parar este agente…" em vermelho
      // dava 3,02:1 no escuro, abaixo dos 4,5 do texto pequeno
      ['.agente-parar-botao', 'color', 'editor.background', 4.5, 'o texto do botao "Parar este agente…"'],
      ['.agente-parar-botao', 'border', 'editor.background', 3, 'a borda do botao "Parar este agente…" (o sinal de que ele destroi)'],
    ]
    const ruins = []
    for (const [seletor, prop, fundo, piso, apelido] of PECAS) {
      const tokens = tokensNoPainel(seletor, prop)
      if (!tokens.length) { ruins.push(`${apelido}: sem declaracao no CSS`); continue }
      for (const t of tokens) {
        const chave = t && chaveDoTema(cores, t)
        if (!chave) { ruins.push(`${apelido}: cor fora do tema (${t})`); continue }
        const r = contraste(chato(cores[chave]), chato(cores[fundo]))
        if (r < piso) ruins.push(`${apelido} ${r.toFixed(2)}:1 < ${piso} (${chave})`)
      }
    }
    checar(`${nome}: o painel da conversa desenha com cores que se veem`, ruins.length === 0,
      ruins.slice(0, 4).join(' | ') || `${PECAS.length} pecas`)
    // A brasa marca foco, item ativo, botão primário e cursor — e nada mais (topo do `gerar_temas.py`). No pé da
    // conversa ela tinha passado a morar FIXA: o arco do relógio (sempre, depois da primeira resposta) e o ícone dos
    // agentes (com agente rodando) — mais o Enviar, três pontos quentes numa linha só.
    const brasa = chato(cores['focusBorder']).toLowerCase()
    const SEM_BRASA = [
      ['.cache-arco', 'stroke', 'o arco do relógio do cache'],
      ['.agentes[data-rodando="sim"] .agentes-icone', 'color', 'o ícone dos agentes rodando'],
    ]
    const quentes = []
    for (const [seletor, prop, apelido] of SEM_BRASA) {
      const tokens = tokensNoPainel(seletor, prop)
      if (!tokens.length) { quentes.push(`${apelido}: sem declaração no CSS`); continue }
      for (const t of tokens) {
        const chave = t && chaveDoTema(cores, t)
        if (!chave || chato(cores[chave]).toLowerCase() === brasa) quentes.push(`${apelido} (${chave || t})`)
      }
    }
    checar(`${nome}: a brasa não mora fixa no pé da conversa`, quentes.length === 0, quentes.join(' | ') || 'arco e ícone dos agentes fora da brasa')
  }

  // ── 5. a brasa e a unica coisa quente ──
  // Quente = matiz entre 10 e 55 graus com saturacao real. Na sintaxe isso e
  // proibido: se o codigo tiver laranja, o acento deixa de marcar o que importa.
  const quentes = []
  for (const t of tema.tokenColors) {
    const c = chato(t.settings.foreground)
    if (!c) continue
    const h = matiz(c), s = satur(c)
    // "Decorador" e "Ligacao" usam a brasa de proposito: sao ACENTO dentro do texto
    if (['Decorador', 'Ligacao'].includes(t.name)) continue
    if (h !== null && h >= 10 && h <= 55 && s > 0.35) quentes.push(`${t.name}=${c}`)
  }
  checar(`${nome}: a sintaxe nao compete com a brasa`, quentes.length === 0, quentes.slice(0, 4).join(' | '))

  // ── 5b. e nao pode estar DENTRO da area de codigo ────────────────────────────
  //
  // Tres lugares onde ela estava, e os tres competem com o acento o dia inteiro:
  // `terminal.ansiBrightYellow` (todo `npm WARN` saia na cor da marca, e ainda
  // errado -- amarelo e ~45°, a brasa e 27°), o colchete de nivel 5, e os guias de
  // indentacao ativos 2..6, que pintavam uma listra opaca da altura do bloco.
  {
    const brasa2 = chato(cores['focusBorder']).toLowerCase()
    const proibidos = Object.entries(cores).filter(([k, v]) =>
      /^terminal\.ansi|^editorBracketHighlight|^editorBracketPairGuide/.test(k) &&
      chato(v).toLowerCase() === brasa2)
    checar(`${nome}: a brasa nao entra na area de codigo`, proibidos.length === 0,
      proibidos.length ? proibidos.map(([k]) => k).join(', ') : 'terminal, colchetes e guias sem o acento')
  }

  // e a brasa precisa de fato marcar o que importa
  const marcados = ['editorCursor.foreground', 'button.background', 'activityBar.activeBorder',
    'tab.activeBorderTop', 'progressBar.background', 'badge.background']
  const semBrasa = marcados.filter(k => {
    const h = matiz(chato(cores[k] || '#000000'))
    return h === null || h < 5 || h > 60
  })
  checar(`${nome}: a brasa marca foco, aba ativa, botao e cursor`, semBrasa.length === 0, semBrasa.join(', '))
}

// ── 6. o produto aponta para o tema ─────────────────────────────────────────────
{
  const d = JSON.parse(fs.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
  const cd = d.configurationDefaults || {}
  checar('o produto abre no tema OFICINA', cd['workbench.colorTheme'] === 'OFICINA Escuro',
    cd['workbench.colorTheme'] || 'sem workbench.colorTheme — os temas existem e ninguem os ve')
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-temas', 'package.json'), 'utf8'))
  const rotulos = (pkg.contributes?.themes || []).map(t => t.label)
  checar('a extensao de temas contribui os dois', rotulos.includes('OFICINA Escuro') && rotulos.includes('OFICINA Claro'),
    rotulos.join(', '))
  // caminho quebrado no package.json e um tema que some sem aviso
  const perdidos = (pkg.contributes?.themes || [])
    .filter(t => !fs.existsSync(path.join(REPO, 'extensoes', 'oficina-temas', t.path)))
  checar('os caminhos do package.json apontam para arquivos que existem', perdidos.length === 0,
    perdidos.map(t => t.path).join(', '))
}

// ── 7. os JSON commitados sao os que o GERADOR produz ───────────────────────────
//
// Todos os criterios acima leem os dois arquivos de tema. Nenhum perguntava de onde
// eles vieram — e a resposta certa e uma so: `identidade/gerar_temas.py`. Uma cor
// mudada a mao dentro do JSON passa em todos eles, fica bonita, e desaparece calada
// na proxima vez que alguem rodar o gerador. Sao 979 cores: ninguem nota.
//
// Foi por isso que o gerador ganhou `--saida`: aqui os temas sao regerados num
// diretorio temporario e comparados com os que estao commitados. Sem python na
// maquina o criterio e PULADO, com aviso — nunca dado por verde.
{
  const pyCandidatos = [['python'], ['py', '-3'], ['python3']]
  const gerador = path.join(REPO, 'identidade', 'gerar_temas.py')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-drift-'))
  let usado = null
  let erro = ''
  for (const cand of pyCandidatos) {
    try {
      execFileSync(cand[0], [...cand.slice(1), gerador, '--saida', tmp],
        { stdio: 'pipe', timeout: 120000 })
      usado = cand.join(' ')
      break
    } catch (e) { erro = String(e).split('\n')[0] }
  }
  const semCR = (t) => t.replace(/\r\n/g, '\n')
  if (!usado) {
    pular('os temas commitados sao os que o gerador produz',
      `python nao rodou nesta maquina (${erro})`)
  } else {
    const arquivos = ['oficina-escuro.json', 'oficina-claro.json']
    const diferentes = arquivos.filter(a =>
      semCR(fs.readFileSync(path.join(tmp, a), 'utf8')) !==
      semCR(fs.readFileSync(path.join(DIR_TEMAS, a), 'utf8')))
    checar('os temas commitados sao os que o gerador produz', diferentes.length === 0,
      diferentes.length
        ? `editado a mao (ou o gerador mudou sem regerar): ${diferentes.join(', ')} — rode python identidade/gerar_temas.py`
        : `${arquivos.length} arquivos identicos ao que ${usado} gera`)

    // CONTROLE POSITIVO: a comparacao tem que ACUSAR uma cor trocada a mao. Sem isto,
    // "0 diferentes" pode significar que a comparacao esta olhando para o lugar errado.
    const original = fs.readFileSync(path.join(DIR_TEMAS, 'oficina-escuro.json'), 'utf8')
    const adulterado = original.replace(/"editor\.background": "#[0-9a-fA-F]{6}"/,
      '"editor.background": "#0000ff"')
    const mudou = adulterado !== original
    const acusa = semCR(adulterado) !== semCR(fs.readFileSync(path.join(tmp, 'oficina-escuro.json'), 'utf8'))
    checar('controle positivo: uma cor trocada a mao REPROVA a comparacao', mudou && acusa,
      mudou ? (acusa ? 'pegou editor.background trocada' : 'a comparacao esta cega')
        : 'nao consegui adulterar a copia — o controle nao provou nada')
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* some no proximo boot */ }
}

// ── CONTROLE POSITIVO ───────────────────────────────────────────────────────────
// Sem isto, "0 faltando" pode significar "o teste nao esta olhando".
{
  const tema = JSON.parse(fs.readFileSync(path.join(DIR_TEMAS, 'oficina-escuro.json'), 'utf8'))
  delete tema.colors['editor.background']
  const faltando = [...listaEmDisco].filter(id => !(id in tema.colors))
  checar('controle positivo: apagar uma cor REPROVA a cobertura', faltando.length === 1,
    faltando.length === 1 ? 'pegou editor.background' : 'o criterio de cobertura esta cego')
}

// ⚠️ O VEREDITO CARREGA OS PULADOS — e a revisao final mostrou por que.
//
// O mecanismo `pular` imprimia "nao e um OK" na tela e guardava o criterio num array
// que NINGUEM lia: o JSON final so somava ok/falha, e `regressao.mjs` julga por codigo
// de saida. Medido pela revisao final numa maquina sem python (`env -i`): o criterio
// anti-drift E o controle positivo dele desapareciam, a suite saia com passou=true e
// codigo 0, e a regressao carimbava o criterio 5 como OK. Um gate que some em silencio
// e pior que gate nenhum, porque ninguem procura o que nao aparece.
//
// Agora o pulado viaja no JSON, e `regressao.mjs` o le e diz "NAO VERIFICADO" em vez de
// "OK". O codigo de saida continua 0: pular por falta de ferramenta na maquina nao
// reprova o produto — o que nao pode e sumir.
const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou,
  /*
    ⚠️ O TOTAL CONTA OS PULADOS, e sem isso esta suite briga com o proprio piso.

    Ha um criterio aqui que so existe quando o clone do nucleo esta na maquina (a lista de
    cores do produto e comparada com a dele); sem clone, ele se declara PULADO. Contando so
    os executados, o total era 32 numa maquina e 33 na outra — e o ciclo rapido compara o
    total com o piso por IGUALDADE, entao a suite ficava vermelha em uma das duas, sem
    nada de errado no produto.

    Contar o pulado mantem o total estavel; o que ele NAO faz e virar um OK — a lista de
    `pulados` continua no placar, e o ciclo rapido a mostra com o aviso.
  */
  total: res.length + pulados.length,
  falhas: res.filter(r => !r.ok).map(r => r.criterio),
  pulados: pulados.map(p => ({ criterio: p.criterio, porque: p.porque })),
}))
process.exit(passou ? 0 : 1)
