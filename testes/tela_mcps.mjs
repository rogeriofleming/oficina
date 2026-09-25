// A VISTA "CONEXÕES" (V26) — `telaMcps.js` com um editor de mentira. Sem abrir o editor.
//
// O que precisa ser verdade:
//   1. a vista NASCE dizendo que ainda não mediu, e não fingindo uma lista;
//   2. enquanto mede, ela diz que está medindo;
//   3. medido, separa "precisam de você" de "conectados", e conta certo no título;
//   4. ⛔ QUANDO A MEDIÇÃO FALHA, ela diz "não consegui medir" — NUNCA "desconectado", NUNCA lista vazia;
//   5. "nenhum servidor configurado" e "não consegui medir" são telas diferentes;
//   6. só o item com ação ganha botão; o conectado não ganha botão nenhum;
//   7. dois cliques no atualizar não abrem duas medições;
//   8. ação com nome que não está na lista lida não faz nada (a trava das skills, aqui também);
//   9. a vista mede sozinha ao aparecer pela primeira vez, e não mede de novo à toa.
//
// Uso:  node testes/tela_mcps.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const { criarTelaDeMcps, VALIDADE_MS, quandoFoi } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'telaMcps.js'))
const M = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'mcps.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

// ── o editor de mentira ──
const vscode = {
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class { constructor(label, estado) { this.label = label; this.collapsibleState = estado } },
  ThemeIcon: class { constructor(id, cor) { this.id = id; this.cor = cor } },
  ThemeColor: class { constructor(id) { this.id = id } },
  EventEmitter: class {
    constructor() { this.event = () => ({ dispose() { } }) }
    fire() { } dispose() { }
  },
}

const LISTA = M.analisarLista([
  'claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - \u2714 Connected',
  'claude.ai Drive: https://drivemcp.googleapis.com/mcp/v1 - \u2714 Connected',
  'notion: https://mcp.notion.com/mcp (HTTP) - ! Needs authentication',
  'gptmaker: uv --directory /projetos/pasta run gptmaker-mcp - ⏸ Pending approval (run `claude` to approve)',
  'velho: http://127.0.0.1:9 - \u2717 Failed to connect: ECONNREFUSED',
].join('\n'))

/** O que `lerLista` entrega de verdade — inclusive os campos que a revisão acrescentou. */
const medicao = (itens, extra = {}) => ({ itens, naoEntendidas: [], repetidas: 0, disseQueNaoHa: !itens.length, completo: true, motivoDoCorte: '', lidoEm: Date.now(), ...extra })

function montar({ medir, detalhar, agora, avisoDaPasta } = {}) {
  const registro = { textos: [], entrou: [], explicou: [], avisos: [] }
  const tela = criarTelaDeMcps(vscode, {
    medir: medir || (async () => medicao(LISTA)),
    detalhar: detalhar || (async nome => `ficha de ${nome}`),
    mostrarTexto: (titulo, texto) => registro.textos.push({ titulo, texto }),
    avisar: texto => registro.avisos.push(texto),
    avisoDaPasta,
    entrar: nome => registro.entrou.push(nome),
    explicarAprovacao: nome => registro.explicou.push(nome),
    agora,
  })
  return { tela, registro }
}

const raiz = tela => tela.provedor.getChildren()
const filhos = (tela, g) => tela.provedor.getChildren(g)
const todosOsItens = tela => raiz(tela).flatMap(g => (g.filhos && g.filhos.length ? g.filhos : [g]))

// ── 1. nasce sem fingir ──
{
  const { tela } = montar()
  const r = raiz(tela)
  checar('tela mcps: nasce dizendo que ainda não mediu', r.length === 1 && /Ver as conexões/.test(r[0].label), r.map(i => i.label).join())
  checar('tela mcps: e o clique é o que mede', r[0].command && r[0].command.command === 'oficina.mcps.atualizar')
  checar('tela mcps: nascendo, o título não afirma nada', tela.descricaoDaVista() === '', tela.descricaoDaVista())
}

// ── 2. enquanto mede ──
{
  let liberar
  const { tela } = montar({ medir: () => new Promise(r => { liberar = () => r(medicao(LISTA)) }) })
  const p = tela.atualizar()
  const r = raiz(tela)
  checar('tela mcps: enquanto mede, diz que está medindo', /Perguntando ao Claude/.test(r[0].label), r[0].label)
  checar('tela mcps: e o título também', tela.descricaoDaVista() === 'medindo…', tela.descricaoDaVista())
  // ⚠️ `medir` só é chamado no microtask seguinte (a medição nunca acontece dentro do clique), então
  // `liberar` só existe depois de um tick. Um `await` de nada basta, e o teste registra o porquê.
  await Promise.resolve()
  liberar(); await p
}

// ── 3. medido ──
{
  const { tela } = montar()
  await tela.atualizar()
  const grupos = raiz(tela)
  /*
    ⛔ TRÊS GRUPOS, e a mudança é um conserto. Eram dois, e tudo que não estivesse conectado caía em
    "Precisam de você" — inclusive os estados em que ela NÃO PODE FAZER NADA. O cabeçalho prometia
    trabalho que a tela não entregava (achado de revisor independente). Agora "Precisam de você" é
    só quem tem ação de verdade; o resto vai para "Com problema", que é o que de fato são.
  */
  checar('tela mcps: três grupos', grupos.length === 3, grupos.map(g => g.label).join(' | '))
  checar('⛔ tela mcps: "Precisam de você" só conta quem TEM o que fazer', /^Precisam de você \(2\)/.test(grupos[0].label), grupos[0].label)
  checar('⛔ tela mcps: quem não tem ação vai para "Com problema"', /^Com problema \(1\)/.test(grupos[1].label), grupos[1].label)
  checar('tela mcps: e os conectados por último', /^Conectados \(2\)/.test(grupos[2].label), grupos[2].label)
  checar('tela mcps: os grupos nascem abertos', grupos.every(g => g.collapsibleState === 2))
  checar('tela mcps: o título conta certo', /2\/5 conectados · 3 com pendência/.test(tela.descricaoDaVista()), tela.descricaoDaVista())

  const porNome = Object.fromEntries(todosOsItens(tela).map(i => [i.label, i]))
  checar('tela mcps: o estado aparece em português na linha', porNome['notion'].description === 'precisa entrar', porNome['notion'].description)
  checar('tela mcps: o motivo do erro aparece junto', /não conectou — ECONNREFUSED/.test(porNome['velho'].description), porNome['velho'].description)
  checar('tela mcps: o conectado tem ícone de cor boa', porNome['claude.ai Gmail'].iconPath.cor.id === 'testing.iconPassed')
  // ⛔ O que fazer quando NÃO há botão fica escrito na linha — senão o estado sem ação é um beco.
  checar('⛔ tela mcps: quem não tem botão diz onde está o caminho',
    /não há botão que conserte isto/i.test(porNome['velho'].tooltip), porNome['velho'].tooltip)
  checar('⛔ tela mcps: e o conectado explica o que seria "reconectar"',
    /Conectar de novo em todos/.test(porNome['claude.ai Gmail'].tooltip), porNome['claude.ai Gmail'].tooltip)
}

// ── 4. ⛔ a falha não vira "desconectado" ──
{
  const { tela } = montar({ medir: async () => { throw new Error('o Claude não respondeu em 60 s') } })
  await tela.atualizar()
  const r = raiz(tela)
  const tudo = r.map(i => `${i.label} ${i.tooltip || ''}`).join(' ')
  checar('tela mcps: a falha diz "não consegui medir"', /Não consegui medir/.test(r[0].label), r[0].label)
  checar('tela mcps: e explica que isso NÃO é estar fora', /NÃO quer dizer que os servidores estão fora/.test(r[0].tooltip), r[0].tooltip)
  checar('tela mcps: e mostra o motivo verdadeiro', /não respondeu em 60 s/.test(r[0].tooltip))
  checar('tela mcps: a falha NÃO desenha nenhum servidor', !/conectado|desconectado/i.test(tudo), tudo.slice(0, 120))
  checar('tela mcps: e oferece tentar de novo', r.some(i => i.command && i.command.command === 'oficina.mcps.atualizar'))
  checar('tela mcps: o título da falha não afirma estado de servidor',
    tela.descricaoDaVista() === 'não consegui medir', tela.descricaoDaVista())
}

// ── 5. vazio ≠ falha ──
{
  const { tela } = montar({ medir: async () => medicao([]) })
  await tela.atualizar()
  const r = raiz(tela)
  checar('tela mcps: "nenhum configurado" é tela própria', /Nenhum servidor MCP configurado/.test(r[0].label), r[0].label)
  checar('tela mcps: e ela não se confunde com a falha', !/Não consegui/.test(r[0].label))
}

// ── 6. um botão por estado, e nenhum quando não há o que fazer ──
{
  const { tela } = montar()
  await tela.atualizar()
  const porNome = Object.fromEntries(todosOsItens(tela).map(i => [i.label, i]))
  checar('tela mcps: quem precisa entrar ganha o botão de entrar', porNome['notion'].contextValue.includes('acao-entrar'), porNome['notion'].contextValue)
  checar('tela mcps: quem espera aprovação ganha o botão de aprovar', porNome['gptmaker'].contextValue.includes('acao-aprovar'), porNome['gptmaker'].contextValue)
  checar('tela mcps: quem falhou ganha o botão de detalhe', porNome['velho'].contextValue.includes('acao-detalhe'), porNome['velho'].contextValue)
  checar('tela mcps: o CONECTADO não ganha botão nenhum', porNome['claude.ai Gmail'].contextValue.includes('semAcao'), porNome['claude.ai Gmail'].contextValue)
  checar('tela mcps: clicar na linha abre a ficha', porNome['claude.ai Gmail'].command.command === 'oficina.mcps.detalhe')
}

// ── 7. uma medição por vez ──
{
  let vezes = 0
  let liberar
  const { tela } = montar({ medir: () => { vezes++; return new Promise(r => { liberar = () => r(medicao(LISTA)) }) } })
  const a = tela.atualizar()
  await Promise.resolve()
  const b = tela.atualizar()
  checar('tela mcps: dois pedidos no meio de uma medição não abrem duas', vezes === 1, vezes)
  checar('tela mcps: e o segundo pedido devolve a medição que já está correndo', a === b)
  liberar(); await a
}

// ── 8. a trava do nome ──
{
  const { tela, registro } = montar()
  await tela.atualizar()
  tela.entrarNoServidor('servidor que não existe')
  tela.entrarNoServidor('&& calc')
  await tela.verDetalhe('servidor que não existe')
  tela.explicarAprovacao('outro que não existe')
  checar('tela mcps: ação com nome fora da lista lida não faz nada',
    registro.entrou.length === 0 && registro.textos.length === 0 && registro.explicou.length === 0,
    JSON.stringify(registro))
  tela.entrarNoServidor('notion')
  await tela.verDetalhe('claude.ai Gmail')
  checar('tela mcps: e o nome que está na lista funciona',
    registro.entrou[0] === 'notion' && /ficha de claude.ai Gmail/.test(registro.textos[0].texto), JSON.stringify(registro))
}
{
  const { tela, registro } = montar({ detalhar: async () => { throw new Error('caiu') } })
  await tela.atualizar()
  await tela.verDetalhe('notion')
  checar('tela mcps: ficha que não abre vira texto explicando, não silêncio',
    /Não consegui ler a ficha/.test(registro.textos[0].texto), JSON.stringify(registro.textos))
}

// ── 9. medir ao aparecer, e não medir à toa ──
{
  let vezes = 0
  let relogio = 1_000_000
  const { tela } = montar({ medir: async () => { vezes++; return medicao(LISTA, { lidoEm: relogio }) }, agora: () => relogio })
  await tela.aoAparecer()
  checar('tela mcps: mede sozinha na primeira vez que aparece', vezes === 1, vezes)
  await tela.aoAparecer()
  checar('tela mcps: aparecer de novo logo depois NÃO remede', vezes === 1, vezes)
  relogio += VALIDADE_MS + 1000
  await tela.aoAparecer()
  checar('tela mcps: mas remede quando a medição já envelheceu', vezes === 2, vezes)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// OS ACHADOS DOS REVISORES DE FORA (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── ⛔ LISTA VAZIA POR FALHA DE LEITURA ≠ "NÃO HÁ NENHUM SERVIDOR".
{
  const { tela } = montar({ medir: async () => medicao([], { disseQueNaoHa: false, naoEntendidas: ['| nome | estado |', '| gmail | ok |'] }) })
  await tela.atualizar()
  const r = raiz(tela)
  checar('⛔ tela mcps: sem a prova do CLI, ela NÃO afirma que não há servidor',
    !/Nenhum servidor MCP configurado/.test(r.map(i => i.label).join(' ')), r.map(i => i.label).join(' | '))
  checar('⛔ tela mcps: ela diz que não ENTENDEU a resposta', /Não entendi a resposta/.test(r[0].label), r[0].label)
  checar('⛔ tela mcps: e mostra o que o Claude respondeu', /\| nome \| estado \|/.test(r[0].tooltip), r[0].tooltip)
  checar('⛔ tela mcps: o título também não afirma', tela.descricaoDaVista() === 'não entendi a resposta', tela.descricaoDaVista())
}

// ── ⛔ MEDIÇÃO PELA METADE aparece como tal.
{
  const { tela } = montar({ medir: async () => medicao(LISTA.slice(0, 2), { completo: false, motivoDoCorte: 'o tempo acabou' }) })
  await tela.atualizar()
  const r = raiz(tela)
  checar('⛔ tela mcps: lista cortada traz o aviso na frente', /pode estar incompleta/i.test(r[0].label), r[0].label)
  checar('⛔ tela mcps: com o motivo do corte', /o tempo acabou/.test(r[0].tooltip), r[0].tooltip)
  checar('⛔ tela mcps: e o título avisa também', /lista incompleta/.test(tela.descricaoDaVista()), tela.descricaoDaVista())
}

// ── ⛔ A PASTA QUE PODE FORJAR A LISTA é denunciada na tela.
{
  const { tela } = montar({ avisoDaPasta: () => 'O arquivo X tem um servidor com nome fora do comum…' })
  await tela.atualizar()
  checar('⛔ tela mcps: o aviso da pasta adulterada aparece',
    raiz(tela).some(i => /forjando esta lista/i.test(i.label)), raiz(tela).map(i => i.label).join(' | '))
}

// ── ⛔ RECUSA NÃO É SILÊNCIO: o botão sempre diz por que não fez.
{
  const { tela, registro } = montar()
  await tela.atualizar()
  await tela.entrarNoServidor('servidor que não existe')
  checar('⛔ tela mcps: agir num nome fora da lista AVISA, não fica mudo',
    registro.entrou.length === 0 && registro.avisos.length === 1 && /não está na última lista/.test(registro.avisos[0]),
    JSON.stringify(registro.avisos))
}
{
  const comNomeRuim = M.analisarLista('nome "ruim": http://x - ✔ Connected')
  const { tela, registro } = montar({ medir: async () => medicao(comNomeRuim) })
  await tela.atualizar()
  const item = todosOsItens(tela).find(i => i.label === 'nome "ruim"')
  checar('⛔ tela mcps: servidor de nome impossível APARECE na lista', !!item, 'sumiu')
  checar('⛔ tela mcps: e ele não tem clique que finja funcionar', item && !item.command, JSON.stringify(item && item.command))
  await tela.verDetalhe('nome "ruim"')
  checar('⛔ tela mcps: pedir a ficha dele explica por que não dá',
    registro.textos.length === 0 && /não consigo agir neste/.test(registro.avisos.join(' ')), JSON.stringify(registro.avisos))
}

// ── ⛔ O VERMELHO NÃO FICA COLADO: reabrir a vista remede.
{
  let vezes = 0
  let relogio = 1_000_000
  const { tela } = montar({ medir: async () => { vezes++; if (vezes === 1) throw new Error('caiu'); return medicao(LISTA, { lidoEm: relogio }) }, agora: () => relogio })
  await tela.aoAparecer()
  checar('tela mcps: a primeira medição falhou', tela.situacao === 'erro')
  await tela.aoAparecer()
  checar('⛔ tela mcps: reabrir a vista depois de um erro MEDE de novo', vezes === 2 && tela.situacao === 'lido', `${vezes} · ${tela.situacao}`)
}

// ── ⛔ A SIGLA "MCP" É EXPLICADA, e o limite do "reconectar" está escrito.
{
  const { tela } = montar()
  const m = tela.mensagemDaVista()
  checar('⛔ tela mcps: a vista explica o que é um MCP, sem exigir tooltip',
    /programas de fora que o Claude sabe usar/.test(m), m)
  checar('⛔ tela mcps: e diz o que NÃO dá para fazer por aqui',
    /Não há como religar UM servidor por aqui/.test(m), m)
}

/*
  ── ⛔ TODO BOTÃO QUE O TEXTO MANDA PROCURAR EXISTE DE VERDADE.

  Este critério nasceu de uma releitura minha, depois dos revisores, e é o mesmo defeito que eles
  caçaram — só que em forma de TEXTO. Os avisos mandavam a pessoa usar um botão chamado "Conectar
  de novo em todos", e o comando registrado se chamava "Perguntar de novo ao Claude". Mandar
  procurar um botão que não existe é a mesma quebra de confiança de um botão que não faz nada:
  ela procura, não acha, e conclui que o programa está errado (ou que ela é que não sabe usar).

  A amarra: todo nome de botão entre aspas nos textos da tela tem de casar com o título de um
  comando declarado no manifesto.
*/
{
  const manifesto = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const titulos = new Set(manifesto.contributes.commands.map(c => c.title))
  const { tela } = montar()
  await tela.atualizar()
  const textos = [tela.mensagemDaVista(), ...todosOsItens(tela).map(i => i.tooltip || '')].join('\n')
  const citados = [...textos.matchAll(/"([^"\n]{3,60})"/g)].map(m => m[1])
  // Só interessam os que parecem nome de botão (começam com maiúscula e não são frase inteira).
  const comoBotao = [...new Set(citados.filter(t => /^[A-ZÀ-Ý]/.test(t) && t.split(' ').length <= 6))]
  const inexistentes = comoBotao.filter(t => !titulos.has(t))
  checar('⛔ tela mcps: todo botão citado no texto EXISTE como comando do produto',
    inexistentes.length === 0,
    `citados: ${comoBotao.join(' · ')} || não existem: ${inexistentes.join(' · ')}`)
}

// ── a hora da medição, que aparece no título ──
{
  const t = 1_000_000_000
  checar('tela mcps: "agora" para segundos', quandoFoi(t, t + 3000) === 'agora', quandoFoi(t, t + 3000))
  checar('tela mcps: segundos', quandoFoi(t, t + 30000) === 'há 30 s', quandoFoi(t, t + 30000))
  checar('tela mcps: minutos', quandoFoi(t, t + 5 * 60000) === 'há 5 min', quandoFoi(t, t + 5 * 60000))
  checar('tela mcps: horas', quandoFoi(t, t + 2 * 3600000) === 'há 2 h', quandoFoi(t, t + 2 * 3600000))
}

// O placar em JSON na última linha — ver a nota em `mcps.mjs`.
const falhas = resultados.filter(r => !r.ok).length
console.log(`\ntela mcps: ${resultados.length - falhas}/${resultados.length} critérios`)
console.log(JSON.stringify({ passou: falhas === 0, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(falhas ? 1 : 0)
