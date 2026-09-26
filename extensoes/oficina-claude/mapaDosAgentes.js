// O MAPA DOS AGENTES COMO POP-UP, A PARTIR DA FAIXA (V30).
//
// Pedido dele, 26/09/2026: *"pode ter o botão do mapa de agentes (...) não o mapa inteiro, mas o
// botão que abre o pop-up que mostra o mapa de agentes com as informações ali de quais agentes estão
// rodando, quais são de cada conversa, o que cada um está fazendo, naquele mapinha que eu mostrei
// para ti de um bloco conectado em outros blocos derivando"*.
//
// ⚠️ O MAPA JÁ EXISTIA — E ESTAVA ÓRFÃO. Ele foi construído na V16 dentro do painel PRÓPRIO da
// OFICINA (`Ctrl+T`). Na V23 a porta da conversa passou a ser a extensão oficial, e o mapa ficou
// numa tela que ele não abre mais. Isto não é uma tela nova: é a mesma, com uma porta que ele
// alcança. O motor continua sendo `agentes.js` (`montarMapa`), sem cópia.
//
// ⚠️ DUAS FONTES, E AQUI SÓ UMA DELAS EXISTE. O mapa do painel junta o AO VIVO (eventos do SDK:
// `task_started`, `task_progress`…) com o DISCO (`subagents/agent-<id>.jsonl` + `.meta.json`). Os
// eventos ao vivo só chegam à OFICINA quando é ELA que roda a conversa — na conversa da extensão
// oficial, não chegam. Então este pop-up monta com `vivos: []`: nome, tipo, estado final, tokens,
// duração e a ÁRVORE (o `parentAgentId` da ficha, conferido em 470 fichas na V16) aparecem; a
// atividade do instante ("Running …") não. Está dito na tela, e não escondido.
//
// ⚠️ SEM JAVASCRIPT NA WEBVIEW, E ISSO FUI EU QUE DECIDI (não achei ordem dele a respeito). O painel
// da V16 tem script (cartões que expandem, relógio de 1 s, botão de parar agente). Aqui nada disso é
// possível — parar um agente exige a conversa própria viva — e um pop-up só de leitura não precisa
// de script: quem redesenha é o host, a cada mudança. Menos superfície, e o CSP fica sem `script-src`.
//
// ⚠️ O BOTÃO EXISTE MESMO SEM AGENTE. Ordem dele em 26/09/2026: *"se não tiver nenhuma conversa
// rodando e também não tiver nenhum subagente ligado (...) não vai mostrar nada, né? Mas ele
// existe"*. Por isso o estado vazio é uma TELA, com frase, e não um pop-up em branco.
//
// Nada aqui usa `require('vscode')` no topo: o `vscode` chega por parâmetro, como em `telaSkills.js`,
// e as duas funções puras (`montarMapaDaJanela`, `htmlDoMapa`) se provam em node puro.

'use strict'

const { montarMapa } = require('./agentes')

/** O que se escreve na tela quando não há agente nenhum. */
const SEM_AGENTES = 'Nenhum agente nesta janela.'
const EXPLICACAO_VAZIA =
  'Quando uma conversa chamar um subagente, ele aparece aqui — com o nome, o que consumiu e de quem ' +
  'derivou. Agentes de conversas já encerradas continuam aparecendo enquanto o arquivo delas existir.'

/** A ressalva que a tela sempre mostra, porque ela muda o que os números significam. */
const RESSALVA_DO_DISCO =
  'Lido do arquivo de cada conversa. O que cada agente está fazendo NESTE instante só aparece na ' +
  'conversa própria da OFICINA (Ctrl+T); aqui ficam o estado, o tamanho e de quem cada um derivou.'

/**
 * Um mapa por conversa da janela, montado só com o que está no disco.
 *
 * @param conversas o que `mostradorDeTokens.agentesPorConversa` devolve
 * @param montar injetável para o teste; por padrão o motor da V16
 * @returns [{ id, titulo, emUso, agentes: [...], quantos }] — só as conversas COM agente
 */
function montarMapaDaJanela(conversas, { montar = montarMapa } = {}) {
  const lista = Array.isArray(conversas) ? conversas : []
  const mapas = []
  for (const c of lista) {
    const doDisco = Array.isArray(c && c.subagentes) ? c.subagentes : []
    if (!doDisco.length) continue
    const m = montar({
      vivos: [],
      doDisco,
      sessao: { titulo: (c && c.nome) || 'conversa sem nome', contexto: (c && c.contexto) || 0, viva: !!(c && c.emUso) },
      podeParar: () => false,
    })
    mapas.push({
      id: c.id,
      titulo: (c && c.nome) || 'conversa sem nome',
      emUso: !!(c && c.emUso),
      agentes: (m && Array.isArray(m.agentes)) ? m.agentes : [],
      quantos: (m && Array.isArray(m.agentes)) ? m.agentes.length : 0,
    })
  }
  return mapas
}

/** Escapa o que vai para dentro do HTML. Tudo que vem de nome de agente passa por aqui. */
function escapar(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Duração em palavra curta: `45s`, `3min 20s`, `1h 12min`. */
function duracaoCurta(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min}min${s % 60 ? ' ' + (s % 60) + 's' : ''}`
  return `${Math.floor(min / 60)}h${min % 60 ? ' ' + (min % 60) + 'min' : ''}`
}

/** Um agente, e abaixo dele os filhos — o "bloco conectado em outros blocos" que ele descreveu. */
function ramoDoAgente(a, porId, nivel = 0) {
  const filhos = (a.filhos || []).map(id => porId.get(id)).filter(Boolean)
  const detalhes = [
    a.tipo ? escapar(a.tipo) : null,
    a.tokensTexto ? `${escapar(a.tokensTexto)} tokens` : null,
    duracaoCurta(a.duracaoMs) || null,
    a.ferramentas != null ? `${escapar(a.ferramentas)} ferramentas` : null,
  ].filter(Boolean).join(' · ')
  const atividade = a.atividade ? `<span class="mapa-sessao-linha">${escapar(a.atividade)}</span>` : ''
  return `<li class="mapa-ramo" data-nivel="${nivel}">
    <div class="mapa-sessao">
      <span class="mapa-sessao-ponto" aria-hidden="true"></span>
      <span class="mapa-sessao-textos">
        <span class="mapa-sessao-titulo">${escapar(a.nome)}</span>
        <span class="mapa-sessao-linha">${escapar(a.rotuloDoEstado || a.estado || '')}${detalhes ? ' · ' + detalhes : ''}</span>
        ${atividade}
      </span>
    </div>
    ${filhos.length ? `<ul class="mapa-ramos">${filhos.map(f => ramoDoAgente(f, porId, nivel + 1)).join('')}</ul>` : ''}
  </li>`
}

/**
 * A página do pop-up. Pura: recebe os mapas e o endereço do CSS, devolve texto.
 *
 * ⚠️ O CSS É O DO PAINEL, e não uma cópia. As classes `.mapa*` são as mesmas da V16 — duas folhas de
 * estilo para o mesmo desenho divergiriam na primeira mudança.
 */
function htmlDoMapa(mapas, { cssUri = '', csp = '' } = {}) {
  const total = mapas.reduce((n, m) => n + m.quantos, 0)
  const cabeca = total
    ? `${total} agente${total > 1 ? 's' : ''} em ${mapas.length} conversa${mapas.length > 1 ? 's' : ''} desta janela`
    : SEM_AGENTES
  const corpo = total
    ? mapas.map(m => {
      const porId = new Map(m.agentes.map(a => [a.id, a]))
      const raizes = m.agentes.filter(a => !a.pai)
      return `<section class="mapa-conversa">
        <div class="mapa-sessao">
          <span class="mapa-sessao-ponto${m.emUso ? ' viva' : ''}" aria-hidden="true"></span>
          <span class="mapa-sessao-textos">
            <span class="mapa-sessao-titulo">${escapar(m.titulo)}${m.emUso ? ' — em uso' : ''}</span>
            <span class="mapa-sessao-linha">${m.quantos} agente${m.quantos > 1 ? 's' : ''}</span>
          </span>
        </div>
        <ul class="mapa-ramos">${raizes.map(a => ramoDoAgente(a, porId)).join('')}</ul>
      </section>`
    }).join('')
    : `<p class="mapa-sub">${EXPLICACAO_VAZIA}</p>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
${cssUri ? `<link rel="stylesheet" href="${cssUri}">` : ''}
<style>
  /* O pop-up e a janela inteira: o .mapa da V16 nasceu como dialogo por cima do painel. */
  body { margin: 0; background: var(--vscode-editor-background); }
  .mapa { position: static; inset: auto; height: 100vh; border: 0; border-radius: 0; box-shadow: none; }
  .mapa-conversa + .mapa-conversa { margin-top: 18px; }
  .mapa-ramo[data-nivel="1"] { margin-left: 18px; }
  .mapa-ramo[data-nivel="2"] { margin-left: 36px; }
  .mapa-rodape { opacity: .75; font-size: 11px; padding: 10px 2px 0; }
</style>
</head>
<body>
<div class="mapa" role="document">
  <div class="mapa-cabeca">
    <div class="mapa-cabeca-textos">
      <h2 class="mapa-titulo">Mapa dos agentes</h2>
      <p class="mapa-sub">${escapar(cabeca)}</p>
    </div>
  </div>
  <div class="mapa-corpo">
    ${corpo}
    <p class="mapa-rodape">${escapar(RESSALVA_DO_DISCO)}</p>
  </div>
</div>
</body>
</html>`
}

/**
 * O pop-up em si: abre (ou traz para a frente) uma aba com o mapa, e a redesenha quando pedido.
 *
 * @param vscode a API do editor
 * @param lerConversas () => o `agentesPorConversa` do mostrador
 * @param pastaDaExtensao para achar o CSS do painel
 */
function criarMapaDosAgentes(vscode, { lerConversas, pastaDaExtensao, anotar = () => { } } = {}) {
  let painel = null

  function desenhar() {
    if (!painel) return
    let conversas = []
    try {
      conversas = lerConversas() || []
    } catch (e) {
      anotar('mapa.leituraFalhou', { mensagem: String((e && e.message) || e) })
      conversas = []
    }
    const mapas = montarMapaDaJanela(conversas)
    const cssNoDisco = vscode.Uri.joinPath(pastaDaExtensao, 'painel', 'painel.css')
    const cssUri = painel.webview.asWebviewUri(cssNoDisco).toString()
    const csp = `default-src 'none'; style-src ${painel.webview.cspSource} 'unsafe-inline'; font-src ${painel.webview.cspSource}`
    painel.webview.html = htmlDoMapa(mapas, { cssUri, csp })
  }

  function abrir() {
    if (painel) {
      painel.reveal(painel.viewColumn, true)
      desenhar()
      return painel
    }
    painel = vscode.window.createWebviewPanel(
      'oficina.mapaDosAgentes',
      'Mapa dos agentes',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false, localResourceRoots: [vscode.Uri.joinPath(pastaDaExtensao, 'painel')], retainContextWhenHidden: false },
    )
    painel.onDidDispose(() => { painel = null })
    desenhar()
    return painel
  }

  return {
    abrir,
    /** Chamado a cada tique do mostrador: só custa algo com o pop-up aberto. */
    atualizar: () => { if (painel) desenhar() },
    get aberto() { return !!painel },
    descartar: () => { if (painel) { painel.dispose(); painel = null } },
  }
}

module.exports = {
  criarMapaDosAgentes, montarMapaDaJanela, htmlDoMapa, escapar, duracaoCurta,
  SEM_AGENTES, EXPLICACAO_VAZIA, RESSALVA_DO_DISCO,
}
