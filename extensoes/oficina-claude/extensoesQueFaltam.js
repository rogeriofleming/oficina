// AS EXTENSÕES QUE FALTAM — a primeira abertura instala o que a OFICINA precisa (V27).
//
// ⚠️ POR QUE ISTO EXISTE. Em 25/09/2026 um membro da equipe abriu a OFICINA e ela estava "tão diferente": abriu a
// conversa PRÓPRIA em vez do Claude Code, faltavam ícones na barra de cima, e o relógio do cache e o
// mapa de agentes não estavam no rodapé do chat. Uma causa só: o instalador leva apenas a extensão da
// OFICINA. O Claude Code, o Python, o PowerShell e as outras da `extensoes/lista.txt` só chegavam à
// máquina de DESENVOLVIMENTO, por `scripts/instalar_extensoes.mjs` — por isso a máquina de quem
// desenvolve parecia certa e a de quem instalava não.
//
// ⚠️ POR QUE BAIXAR, E NÃO EMBUTIR. A extensão do Claude Code é "© Anthropic PBC. All rights reserved"
// (lido no manifesto dela): redistribuí-la dentro de um instalador público não é nosso direito. Baixar
// da loja do produto (Open VSX, `extensionsGallery`) na máquina de quem usa é o mesmo que a pessoa
// faria à mão. As extensões de licença aberta que precisam funcionar SEM internet (os leitores) vão
// embutidas — `extensoes/embutidas-da-loja.txt`.
//
// ⚠️ DUAS COISAS QUE A REVISÃO DE 25/09/2026 ACHOU NO NÚCLEO, e que nenhum teste com editor de mentira
// pegaria:
//   - instalar por comando pergunta "você confia neste editor?" (janela modal) para cada editor fora de
//     `trustedExtensionPublishers` do produto — seriam até seis janelas seguidas na primeira abertura.
//     Os seis editores desta lista estão declarados como confiáveis no `produto/product.json`. Custo: as
//     extensões DELES não perguntam mais, nem quando instaladas à mão;
//   - esta build NÃO verifica assinatura de extensão (um patch de viabilidade desliga `verifySignature`,
//     porque a loja aberta não tem o serviço de assinatura da Microsoft). A confiança aqui é na loja do
//     produto (Open VSX) e na lista acima — não numa assinatura conferida.
//
// Decisão do dono, 25/09/2026: nas DUAS edições, sozinha, na primeira abertura. Sem internet, avisa e
// tenta de novo na próxima abertura — nunca falha calada.

'use strict'

/**
 * O que a OFICINA precisa e não embute. Tem de ser `lista.txt` MENOS `embutidas-da-loja.txt` — o
 * teste `extensoes_que_faltam.mjs` cobra isso, para esta lista não envelhecer calada.
 */
const RECOMENDADAS = [
  'anthropic.claude-code',
  'ms-python.python',
  'detachhead.basedpyright',
  'ms-python.debugpy',
  'ms-python.vscode-python-envs',
  'ms-vscode.powershell',
  'github.vscode-github-actions',
  'mechatroner.rainbow-csv',
]

/** A conversa é a peça sem a qual a OFICINA abre "diferente" — ela vem primeiro, e é esperada. */
const A_CONVERSA = 'anthropic.claude-code'

/** Nome de gente para a notificação. */
const NOMES = {
  'anthropic.claude-code': 'Claude Code',
  'ms-python.python': 'Python',
  'detachhead.basedpyright': 'verificador de Python',
  'ms-python.debugpy': 'depurador de Python',
  'ms-python.vscode-python-envs': 'ambientes de Python',
  'ms-vscode.powershell': 'PowerShell',
  'github.vscode-github-actions': 'GitHub Actions',
  'mechatroner.rainbow-csv': 'CSV colorido',
}

/** Chave de desligar dos testes: eles abrem com a pasta de extensões VAZIA de propósito. */
const DESLIGAR = 'OFICINA_SEM_INSTALAR_EXTENSOES'

function faltando(vscode, lista = RECOMENDADAS) {
  // Sem a API de extensões não há como saber o que falta — e "não sei" não vira "falta tudo".
  const ex = vscode && vscode.extensions
  if (!ex || typeof ex.getExtension !== 'function') return []
  return lista.filter(id => !ex.getExtension(id))
}

/** O que já foi instalado por aqui uma vez — se sumiu depois, foi a pessoa que tirou. */
const CHAVE_JA_INSTALADAS = 'oficina.extensoes.jaInstaladas'
/** Trava entre janelas: três janelas restauradas juntas não instalam três vezes a mesma coisa. */
const CHAVE_TRAVA = 'oficina.extensoes.instalandoAte'
const TRAVA_MS = 10 * 60 * 1000

/** Um estado de mentira quando não há `globalState` (fora do editor): nada lembrado, nada travado. */
const SEM_ESTADO = { get: (k, p) => p, update: () => Promise.resolve() }

/** Instala uma lista numa notificação de progresso. Nunca lança. */
async function instalarLista(vscode, ids, titulo) {
  const instaladas = []
  const falharam = []
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification, title: titulo, cancellable: false,
  }, async progresso => {
    for (const id of ids) {
      progresso.report({ message: `${NOMES[id] || id}${ids.length > 1 ? ` (${instaladas.length + falharam.length + 1} de ${ids.length})` : ''}` })
      try {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', id)
        instaladas.push(id)
      } catch (e) {
        falharam.push({ id, motivo: String((e && e.message) || e) })
      }
    }
  })
  return { instaladas, falharam }
}

/**
 * Espera a extensão recém-instalada ENTRAR e a ATIVA — antes de alguém chamar os comandos dela.
 *
 * ⚠️ ACHADO DE REVISÃO (25/09/2026), lido no núcleo: o comando de instalar termina ANTES de a extensão
 * estar registrada — ela entra depois, por uma fila assíncrona (`_handleDeltaExtensions`), e ativa por
 * `onStartupFinished`, que já passou. Chamar `claude-vscode.editor.openLast` logo em seguida dá
 * "command not found", e a abertura cairia no painel próprio: exatamente o sintoma que esta peça
 * existe para consertar. `Extension.activate()` é o caminho da API para ativar sob demanda.
 *
 * Nunca lança; devolve se conseguiu. Teto: `limiteMs` (a entrada costuma ser imediata — não medido).
 */
async function esperarAtiva(vscode, id, { limiteMs = 20000, passoMs = 250, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const ex = vscode.extensions
  if (!ex || typeof ex.getExtension !== 'function') return false
  for (let t = 0; t <= limiteMs; t += passoMs) {
    const e = ex.getExtension(id)
    if (e) {
      try { await e.activate(); return true } catch { return false }
    }
    await dormir(passoMs)
  }
  return false
}

/** O aviso de falha: o que faltou, a consequência, e o motivo real a um clique. Nunca calado. */
function avisarFalha(vscode, falharam, tentarDeNovo) {
  const nomes = falharam.map(f => NOMES[f.id] || f.id).join(', ')
  const semConversa = falharam.some(f => f.id === A_CONVERSA)
  const texto = `Não consegui instalar: ${nomes}.` +
    (semConversa ? ' Sem o Claude Code, a conversa abre no painel próprio da OFICINA.' : '') +
    ' Pode ser falta de internet ou a loja fora do ar; a OFICINA tenta de novo na próxima abertura.'
  Promise.resolve(vscode.window.showWarningMessage(texto, 'Tentar agora', 'Ver o motivo')).then(r => {
    if (r === 'Tentar agora') tentarDeNovo()
    else if (r === 'Ver o motivo') {
      vscode.window.showInformationMessage(falharam.map(f => `${NOMES[f.id] || f.id}: ${f.motivo}`).join('\n'), { modal: true })
    }
  }).catch(() => { })
}

/**
 * Instala o que falta. Devolve `{ instaladas, falharam, pulou?, resto }` QUANDO A CONVERSA TERMINA.
 *
 * ⚠️ SÓ A CONVERSA É ESPERADA (achado de revisão, 25/09/2026). A primeira versão esperava as oito —
 * a abertura inteira ficava parada durante ~250 MB de Python, verificador e depurador. Agora o Claude
 * Code vem primeiro e é esperado (quem chama abre a conversa logo depois); o resto é instalado em
 * seguida, sem segurar ninguém, e a promessa dele vai em `resto`.
 *
 * ⚠️ NÃO REINSTALA O QUE A PESSOA TIROU. O que foi instalado por aqui fica lembrado; se sumiu depois
 * (desinstalou, ou desabilitou — `getExtension` não devolve extensão desabilitada), não volta.
 * Quem não quiser nada disto desliga `oficina.instalarExtensoesQueFaltam`.
 */
async function instalarOQueFalta(vscode, {
  anotar = () => { }, ambiente = process.env, lista = RECOMENDADAS, estado = SEM_ESTADO, agora = () => Date.now(), esperar = null,
} = {}) {
  const nada = pulou => ({ instaladas: [], falharam: [], ...(pulou ? { pulou } : {}), resto: Promise.resolve({ instaladas: [], falharam: [] }) })
  if (ambiente[DESLIGAR] === '1') return nada('desligado')
  try {
    const cfg = vscode.workspace && vscode.workspace.getConfiguration && vscode.workspace.getConfiguration('oficina')
    if (cfg && cfg.get('instalarExtensoesQueFaltam', true) === false) return nada('configuracao')
  } catch { /* sem configuração legível: segue o padrão, que é instalar */ }

  const ja = new Set(estado.get(CHAVE_JA_INSTALADAS, []) || [])
  const faltam = faltando(vscode, lista).filter(id => !ja.has(id))
  if (!faltam.length) return nada()
  if ((estado.get(CHAVE_TRAVA, 0) || 0) > agora()) return nada('outraJanela')
  await estado.update(CHAVE_TRAVA, agora() + TRAVA_MS)
  anotar('extensoes.faltando', { quantas: faltam.length })

  const lembrar = async ids => {
    for (const id of ids) ja.add(id)
    await estado.update(CHAVE_JA_INSTALADAS, [...ja])
  }
  const tentarDeNovo = () => instalarOQueFalta(vscode, { anotar, ambiente, lista, estado, agora, esperar })

  // 1. A conversa, esperada.
  const primeiro = faltam.includes(A_CONVERSA)
    ? await instalarLista(vscode, [A_CONVERSA], 'OFICINA: instalando o Claude Code')
    : { instaladas: [], falharam: [] }
  await lembrar(primeiro.instaladas)
  let conversaAtiva = null
  if (primeiro.instaladas.includes(A_CONVERSA)) {
    conversaAtiva = await esperarAtiva(vscode, A_CONVERSA, { ...(esperar || {}) })
    anotar('extensoes.conversaAtiva', { ativa: conversaAtiva })
  }

  // 2. O resto, sem segurar a abertura.
  const outras = faltam.filter(id => id !== A_CONVERSA)
  const resto = (outras.length ? instalarLista(vscode, outras, 'OFICINA: instalando o que falta') : Promise.resolve({ instaladas: [], falharam: [] }))
    .then(async r => {
      await lembrar(r.instaladas)
      await estado.update(CHAVE_TRAVA, 0)
      const falharam = [...primeiro.falharam, ...r.falharam]
      anotar('extensoes.instaladas', { instaladas: primeiro.instaladas.length + r.instaladas.length, falharam: falharam.length })
      if (falharam.length) avisarFalha(vscode, falharam, tentarDeNovo)
      return r
    })
    .catch(() => ({ instaladas: [], falharam: [] }))

  return { instaladas: primeiro.instaladas, falharam: primeiro.falharam, conversaAtiva, resto }
}

module.exports = { instalarOQueFalta, esperarAtiva, faltando, RECOMENDADAS, A_CONVERSA, DESLIGAR, NOMES, CHAVE_JA_INSTALADAS, CHAVE_TRAVA }
