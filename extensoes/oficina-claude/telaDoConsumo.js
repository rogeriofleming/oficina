// A TELA DO CONSUMO — o que o botão de expandir da faixa abre (V20, t199).
//
// Ele apontou o painel "Account & usage…" da extensão oficial e disse: *"o botao de expandir deve
// mostrar oq aparece quando clico aqui"*.
//
// ⚠️ NÃO DÁ PARA ABRIR O PAINEL DELA. Os 26 comandos que `anthropic.claude-code` registra foram
// listados um a um (manifesto e `registerCommand` do pacote): nenhum é de conta ou de uso. Aquele
// painel é um componente interno da webview dela, sem porta de fora. Então esta tela é NOSSA, com
// o que o registro do programa de linha de comando traz — que é quase tudo o que aquela mostra.
//
// ⚠️ O QUE ESTA TELA NÃO MOSTRA, E DIZ QUE NÃO MOSTRA:
//   - quanto falta em dinheiro: os campos vêm vazios (medido), e inventar seria mentir;
//   - o terceiro limite ("Weekly Fable"): fora por ordem dele;
//   - as frases de análise da tela dela: são conta feita sobre os arquivos de conversa DESTA
//     máquina, não campo do registro. A própria tela dela avisa isso, e esta avisaria também.
//
// ⚠️ NADA DE CONTA NA TELA. O registro traz `accountUuid`; o motor (`usoDoPlano.detalhe`) já o
// descarta, e há teste que cobra. Esta tela fica aberta na frente de quem passar atrás da cadeira.

'use strict'

const U = require('./usoDoPlano')

const ID_DA_TELA = 'oficina.consumo'

/** Quanto falta, em palavras curtas. `null` quando não há data. */
function faltaEmPalavras(quandoMs, agoraMs) {
  if (typeof quandoMs !== 'number' || !Number.isFinite(quandoMs)) return null
  const falta = quandoMs - agoraMs
  if (falta <= 0) return 'a qualquer momento'
  const min = Math.round(falta / 60000)
  if (min < 60) return `em ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `em ${h} h`
  const d = Math.round(h / 24)
  return `em ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Uma barra igual à da faixa, para a tela e a faixa falarem a mesma língua. */
function barra(pct) {
  const p = pct === null ? 0 : Math.max(0, Math.min(100, Math.round(pct)))
  return `<div class="trilho"><div class="cheio" style="width:${p}%"></div></div>`
}

function escapar(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/**
 * O corpo da tela.
 *
 * ⚠️ SEM `<script>`: esta tela não tem nada a executar. Sem script, não há nonce a gerar nem
 * superfície a proteger — a política de segurança pode proibir script por inteiro.
 */
function corpo(det, agoraMs) {
  if (!det) {
    return `<p class="vazio">Ainda não há leitura do consumo neste computador.</p>`
  }

  const janelas = det.janelas.map(j => {
    const valor = j.pct === null ? '—' : `${Math.round(j.pct)}%`
    const quando = faltaEmPalavras(j.resetaEm, agoraMs)
    return `<div class="janela">
      <div class="linha"><span class="nome">${escapar(j.nome)}</span><span class="valor">${valor}</span></div>
      ${barra(j.pct)}
      ${quando ? `<div class="quando">Recomeça ${escapar(quando)}</div>` : ''}
    </div>`
  }).join('')

  const produtos = det.porProduto.length
    ? `<h2>De onde veio o uso da semana</h2>
       <table>${det.porProduto.map(p =>
      `<tr><td>${escapar(p.nome)}</td><td class="pct">${Math.round(p.pct)}%</td></tr>`).join('')}</table>`
    : ''

  const credito = det.credito
    ? `<h2>Crédito extra</h2><p>${det.credito.usado === null ? 'ligado' : `${Math.round(det.credito.usado)}% usado`}</p>`
    : ''

  return `<h2>Limites do plano</h2>${janelas}${produtos}${credito}
    <p class="rodape">
      Estes números vêm do registro que o programa de linha de comando mantém neste computador, e
      valem só para ele — outro aparelho, ou o site, não entram nesta conta.
    </p>`
}

function html(det, agoraMs) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<title>Consumo do plano</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
         color: var(--vscode-foreground); padding: 18px 20px; line-height: 1.5; }
  h2 { font-size: 1em; font-weight: 600; opacity: .75; margin: 22px 0 10px;
       text-transform: uppercase; letter-spacing: .04em; }
  h2:first-child { margin-top: 0; }
  .janela { margin-bottom: 16px; }
  .linha { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .nome { }
  .valor { font-variant-numeric: tabular-nums; font-weight: 600; }
  /* ⚠️ O ESMAECIDO É UM PSEUDO-ELEMENTO, e não \`opacity\` no trilho: \`opacity\` vale para a subárvore
     inteira e apagaria também o preenchimento de dentro. Medido em navegador: com \`opacity\` no pai, a
     parte USADA saía mais escura que a VAZIA — a barra lia ao contrário. Mesmo conserto do patch 0017,
     para a faixa e esta tela desenharem a mesma coisa. */
  .trilho { position: relative; height: 6px; border-radius: 3px; overflow: hidden; }
  .trilho::before { content: ''; position: absolute; inset: 0;
                    background: var(--vscode-foreground); opacity: .22; }
  .trilho .cheio { position: relative; height: 100%; border-radius: 3px;
                   background: var(--vscode-progressBar-background); }
  .quando { font-size: .9em; opacity: .65; margin-top: 5px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 4px 0; }
  td.pct { text-align: right; font-variant-numeric: tabular-nums; }
  .rodape { font-size: .9em; opacity: .65; margin-top: 24px; }
  .vazio { opacity: .7; }
</style>
</head>
<body>${corpo(det, agoraMs)}</body>
</html>`
}

/**
 * Abre (ou traz para a frente) a tela do consumo.
 *
 * A leitura é feita na hora de abrir: é um arquivo, e a tela só existe enquanto ela está na
 * frente. Não há relógio aqui — quem tem relógio é a faixa.
 */
function criarTelaDoConsumo(vscode, { lerRegistro, agora = () => Date.now() }) {
  let painel = null

  async function abrir() {
    let conteudo = null
    try { conteudo = await lerRegistro() } catch { conteudo = null }
    const det = U.detalhe(conteudo)

    if (painel) {
      painel.webview.html = html(det, agora())
      painel.reveal(painel.viewColumn, true)
      return painel
    }

    /*
      ⚠️ ELA ABRE NA COLUNA QUE JÁ EXISTE — NUNCA numa divisão nova.

      Medido numa conferência independente do build 1: clicar no expandir da faixa fazia a conversa
      cair de 1416 px para ~680 px, porque a tela abria ao lado. Ele já reclamou disso duas vezes,
      com outras coisas que espremiam a conversa. Uma tela de consulta não pode custar metade da
      largura de onde se trabalha.

      `ViewColumn.Active` parece resolver, e não resolve sozinho: quando o foco está na faixa (que
      não é editor), "ativa" pode virar coluna nova. Por isso a coluna sai da fileira de abas que
      existe, e `Active` fica só como último recurso.
    */
    let coluna = vscode.ViewColumn.Active
    try {
      const grupos = (vscode.window.tabGroups && vscode.window.tabGroups.all) || []
      const ativo = vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup
      const escolhido = (ativo && ativo.viewColumn) || (grupos[0] && grupos[0].viewColumn)
      if (escolhido) coluna = escolhido
    } catch { /* editor sem a interface de abas: fica o `Active` */ }

    painel = vscode.window.createWebviewPanel(
      ID_DA_TELA, 'Consumo do plano',
      { viewColumn: coluna, preserveFocus: false },
      { enableScripts: false, retainContextWhenHidden: false })
    painel.webview.html = html(det, agora())
    painel.onDidDispose(() => { painel = null })
    return painel
  }

  return { abrir, html: (det, q) => html(det, q === undefined ? agora() : q), get aberta() { return painel !== null } }
}

module.exports = { criarTelaDoConsumo, html, corpo, faltaEmPalavras, ID_DA_TELA }
