// O MEDIDOR DE TOKENS (V10) — `extensoes/oficina-claude/tokens.js`, em node puro, sem o editor.
//
// Arquivos sintéticos, no formato das conversas do programa do Claude. A prova contra arquivos REAIS
// (o motor novo e o antigo, sobre as mesmas 10 conversas, 212 MB, números idênticos) está registrada
// no documento de versões: ela depende das conversas desta máquina e não cabe num teste portátil.
//
// Uso:  node testes/tokens.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const T = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'tokens.js'))
const precos = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'precos.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-tokens-'))
const ID = '0a1b2c3d-1111-2222-3333-444455556666'
const L = o => JSON.stringify(o) + '\n'
const resposta = (id, uso, extra = {}) => L({ type: 'assistant', message: { id, model: 'claude-opus-5', usage: uso, content: extra.content || [{ type: 'text', text: 'x' }], ...(extra.message || {}) } })

try {
  const projetos = path.join(base, 'config', 'projects')
  const pasta = path.join(projetos, 'D--alguma-pasta')
  fs.mkdirSync(path.join(pasta, ID, 'subagents'), { recursive: true })
  const principal = path.join(pasta, ID + '.jsonl')

  // A resposta r1 aparece em DUAS linhas (dois blocos); r2 chama uma skill e um subagente.
  fs.writeFileSync(principal,
    resposta('r1', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }) +
    resposta('r1', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }) +
    resposta('r2', { input_tokens: 20, output_tokens: 50, cache_read_input_tokens: 1500, cache_creation_input_tokens: 300 }, {
      content: [
        { type: 'tool_use', id: 'tu-skill', name: 'Skill', input: { skill: 'revisar-copy' } },
        { type: 'tool_use', id: 'tu-agente', name: 'Agent', input: { description: 'procurar o bug' } },
      ],
    }) +
    L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-agente', content: 'feito. agentId: abc123' }] } }) +
    // aviso interno do programa: não é chamada ao modelo
    L({ type: 'assistant', message: { id: 'syn', model: '<synthetic>', usage: { input_tokens: 999999, output_tokens: 0 }, content: [] } }))

  // O subagente: saída PARCIAL crescendo na mesma resposta.
  fs.writeFileSync(path.join(pasta, ID, 'subagents', 'agent-abc123.jsonl'),
    resposta('s1', { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }) +
    resposta('s1', { input_tokens: 100, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }) +
    resposta('s1', { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }))

  // ── achar o arquivo ──
  checar('tokens: acha o arquivo da conversa pelo id', T.acharTranscrito(ID, projetos) === principal)
  checar('tokens: id com cara de caminho é recusado (não vira leitura fora da pasta)', T.acharTranscrito('../../etc', projetos) === null)
  checar('tokens: conversa que não existe dá null', T.acharTranscrito('ffffffff-0000-0000-0000-000000000000', projetos) === null)
  checar('tokens: respeita CLAUDE_CONFIG_DIR, como o programa do Claude',
    T.diretorioDeProjetos({ CLAUDE_CONFIG_DIR: path.join(base, 'config') }) === projetos)

  // ── medir ──
  const m = new T.MedidorDaConversa(principal)
  checar('tokens: a primeira leitura muda os números', m.atualizar() === true)
  const r = m.resumo()
  checar('tokens: resposta repetida em duas linhas conta UMA vez', r.respostas === 3, r.respostas)
  checar('tokens: o aviso interno (<synthetic>) não entra', r.tokens < 999999, r.tokens)
  checar('tokens: contexto agora = o que a ÚLTIMA resposta principal leu (entrada + cache)', r.contextoAgora === 20 + 1500 + 300, r.contextoAgora)
  // principal: r1 (10+5+1000) + r2 (20+50+1500+300) ; subagente: s1 com a MAIOR saída (100+80)
  const esperado = (10 + 5 + 1000) + (20 + 50 + 1500 + 300) + (100 + 80)
  checar('tokens: processado soma o principal e o subagente, com a maior saída da resposta parcial', r.tokens === esperado, `${r.tokens} x ${esperado}`)
  checar('tokens: o subagente aparece com o nome da tarefa que o chamou', r.subagentes.length === 1 && r.subagentes[0].nome === 'procurar o bug' && r.subagentes[0].tokens === 180, JSON.stringify(r.subagentes))
  checar('tokens: a skill carregada aparece', r.skills.length === 1 && r.skills[0].nome === 'revisar-copy' && r.skills[0].vezes === 1, JSON.stringify(r.skills))

  // ⚠️ Skill por `/nome` (o clique do painel de skills): duas falas da pessoa, sem a ferramenta `Skill`.
  // Formato lido nas conversas gravadas em 16/09/2026. Comando embutido tem a primeira fala e não a segunda.
  {
    const porComando = path.join(pasta, 'por-comando.jsonl')
    const fala = (conteudo, uuid) => L({ type: 'user', uuid, message: { role: 'user', content: conteudo } })
    fs.writeFileSync(porComando,
      fala('<command-message>model</command-message>\n<command-name>/model</command-name>', 'u1') +
      fala('<local-command-stdout>Set model to Opus</local-command-stdout>', 'u2') +
      fala('<command-message>minha-skill</command-message>\n<command-name>/minha-skill</command-name>', 'u3') +
      fala([{ type: 'text', text: 'Base directory for this skill: C:/x/minha-skill\n\n# Minha skill' }], 'u4') +
      resposta('rc1', { input_tokens: 1, output_tokens: 1 }) +
      fala('<command-message>clear</command-message>\n<command-name>/clear</command-name>', 'u5') +
      resposta('rc2', { input_tokens: 1, output_tokens: 1 }) +
      fala('Base directory for this skill: solto, sem comando antes', 'u6'))
    const mc = new T.MedidorDaConversa(porComando, { listarSubagentes: () => [] })
    mc.atualizar()
    const nomes = mc.resumo().skills.map(s => `${s.nome}x${s.vezes}`).join()
    checar('⛔ tokens: skill chamada por /nome aparece nas skills da conversa', nomes.includes('minha-skillx1'), nomes)
    checar('tokens (controle): comando embutido (/model, /clear) não vira skill', !/model|clear/.test(nomes), nomes)
    checar('tokens (controle): carga de skill sem comando logo antes não inventa skill', nomes === 'minha-skillx1', nomes)
    mc.atualizar()
    checar('tokens: reler o arquivo não conta a mesma skill duas vezes', mc.resumo().skills.map(s => `${s.nome}x${s.vezes}`).join() === 'minha-skillx1')
  }
  checar('tokens: o custo é marcado como estimativa, com a data da tabela', r.estimado === true && r.tabelaDe === precos.ATUALIZADA_EM)

  // O custo tem que ser o da tabela única, e não uma conta própria.
  const usoTodo = precos.usoZerado()
  for (const u of [
    { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
    { input_tokens: 20, output_tokens: 50, cache_read_input_tokens: 1500, cache_creation_input_tokens: 300 },
    { input_tokens: 100, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ]) precos.somarUso(usoTodo, u)
  const custoEsperado = precos.custoDoUso(usoTodo, 'claude-opus-5')
  checar('tokens: o custo sai de precos.js (fonte única)', Math.abs(r.custoUsd - custoEsperado) < 1e-12, `${r.custoUsd} x ${custoEsperado}`)

  checar('tokens: sem nada novo, a leitura seguinte não muda nada', m.atualizar() === false)

  // ── incremental ──
  const linhaNova = resposta('r3', { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 })
  fs.appendFileSync(principal, linhaNova.slice(0, 40))           // metade da linha
  m.atualizar()
  checar('tokens: linha pela metade espera o resto (não conta, não quebra)', m.resumo().respostas === 3)
  fs.appendFileSync(principal, linhaNova.slice(40))
  m.atualizar()
  checar('tokens: quando o resto chega, a resposta entra', m.resumo().respostas === 4 && m.resumo().contextoAgora === 4001, m.resumo().contextoAgora)

  // ── arquivo trocado por outro, com o mesmo nome ──
  fs.rmSync(principal)
  fs.writeFileSync(principal, resposta('z1', { input_tokens: 7, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }))
  m.atualizar()
  checar('tokens: arquivo trocado é relido do começo (a resposta nova entra)', [...m.respostas.keys()].includes('z1'))
  checar('tokens: e o que veio do arquivo VELHO sai da conta (senão o total somaria os dois)',
    !['r1', 'r2', 'r3'].some(id => m.respostas.has(id)) && m.respostas.has('s1') && m.resumo().contextoAgora === 7, [...m.respostas.keys()].join(','))

  // ── modelo sem preço ──
  const semPreco = path.join(pasta, 'sem-preco.jsonl')
  fs.writeFileSync(semPreco, L({ type: 'assistant', message: { id: 'q', model: 'modelo-que-nao-existe', usage: { input_tokens: 5, output_tokens: 5 }, content: [] } }))
  const ms = new T.MedidorDaConversa(semPreco, { listarSubagentes: () => [] })
  ms.atualizar()
  const rs = ms.resumo()
  checar('tokens: modelo sem preço NÃO vira US$ 0 (fica null, e diz que faltou)', rs.custoUsd === null && rs.faltouPreco === true && rs.tokens === 10)

  // ── a barra ──
  checar('barra: formata como a pessoa lê', T.formatarTokens(584) === '584' && T.formatarTokens(12300) === '12k' && T.formatarTokens(1234567) === '1,2M' && T.formatarTokens(156000000) === '156M',
    [584, 12300, 1234567, 156000000].map(T.formatarTokens).join(' '))
  {
    // Revisão de código (16/09/2026): perto de 1 milhão, o arredondamento cruzava a faixa.
    const F = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'formato.js'))
    checar('⛔ barra e vista: 999.600 é 1,0M (não "1000k" nem "1000 mil tokens")',
      T.formatarTokens(999600) === '1,0M' && F.tokens(999600) === '1,0 mi de tokens', `${T.formatarTokens(999600)} / ${F.tokens(999600)}`)
    checar('barra e vista (controle): 999.400 continua 999k', T.formatarTokens(999400) === '999k' && F.tokens(999400) === '999 mil tokens')
  }
  const exemplo = { contextoAgora: 584000, tokens: 156000000, custoUsd: 56.713, faltouPreco: false }
  checar('barra: contexto · total · custo, com asterisco de estimativa', T.textoDaBarra(exemplo) === '584k · 156M · US$ 56,71*', T.textoDaBarra(exemplo))
  // V14 — "painel de tokens integrado automaticamente sem opção de desligar": não há modo que esconda
  // nem que corte um dos três números (até a V13 havia "só tokens", "só custo" e "esconder").
  checar('⛔ barra: não existe modo que esconda ou corte os números (V14)',
    T.MODOS_DA_BARRA === undefined && ['esconder', 'só tokens', 'só custo'].every(modo => T.textoDaBarra(exemplo, modo) === '584k · 156M · US$ 56,71*'),
    ['esconder', 'só tokens', 'só custo'].map(modo => T.textoDaBarra(exemplo, modo)).join(' | '))
  checar('barra: sem preço, mostra tokens e nunca US$ 0', T.textoDaBarra({ ...exemplo, custoUsd: null }) === '584k · 156M')
  checar('barra: preço incompleto ganha "+" (o total é maior que o mostrado)', T.textoDaBarra({ ...exemplo, faltouPreco: true }) === '584k · 156M · US$ 56,71+*')

  // ── V16: a ficha do subagente (`agent-<id>.meta.json`) e o que o mapa dos agentes lê do disco ──
  // Formato conferido em 470 fichas desta máquina e numa sonda ao vivo (SDK 0.3.261, 18/09/2026). O subagente de
  // SEGUNDO nível é chamado de dentro de outro: o arquivo principal não tem nem a chamada nem o `agentId` dele.
  {
    const ID2 = '0a1b2c3d-1111-2222-3333-444455550016'
    const sub = path.join(pasta, ID2, 'subagents')
    fs.mkdirSync(sub, { recursive: true })
    const p2 = path.join(pasta, ID2 + '.jsonl')
    fs.writeFileSync(p2,
      resposta('m1', { input_tokens: 1, output_tokens: 1 }, { content: [{ type: 'tool_use', id: 'tu-n1', name: 'Agent', input: { description: 'nível um pelo principal' } }] }) +
      L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-n1', content: 'lançado. agentId: aaa111' }] } }))
    const comHora = (o, hora) => JSON.stringify({ ...o, timestamp: hora }) + '\n'
    const doSub = (id, uso, conteudo, hora) => comHora({ type: 'assistant', message: { id, model: 'claude-opus-5', usage: uso, content: conteudo } }, hora)
    fs.writeFileSync(path.join(sub, 'agent-aaa111.jsonl'), doSub('a1', { input_tokens: 5, output_tokens: 5 }, [], '2026-09-18T10:00:00.000Z'))
    fs.writeFileSync(path.join(sub, 'agent-aaa111.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'nível um pela ficha', toolUseId: 'tu-n1', spawnDepth: 1 }))
    // O segundo nível: 3 ferramentas (uma repetida em duas linhas da mesma resposta), 37m 3s entre a primeira e a última linha.
    fs.writeFileSync(path.join(sub, 'agent-bbb222.jsonl'),
      comHora({ type: 'user', message: { role: 'user', content: 'faça' } }, '2026-09-18T10:00:00.000Z') +
      doSub('b1', { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }], '2026-09-18T10:00:01.000Z') +
      doSub('b1', { input_tokens: 10, output_tokens: 9, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }], '2026-09-18T10:00:02.000Z') +
      doSub('b2', { input_tokens: 2, output_tokens: 40, cache_read_input_tokens: 250000, cache_creation_input_tokens: 1000 },
        [{ type: 'tool_use', id: 't2', name: 'Grep', input: {} }, { type: 'tool_use', id: 't3', name: 'Bash', input: {} }], '2026-09-18T10:37:03.000Z'))
    fs.writeFileSync(path.join(sub, 'agent-bbb222.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'revisar o segundo nível', toolUseId: 'tu-n2',
      parentAgentId: 'aaa111', spawnDepth: 2, stoppedByUser: true }))
    // Um subagente sem ficha e sem ligação (conversa antiga): o caminho de antes continua.
    fs.writeFileSync(path.join(sub, 'agent-ccc333.jsonl'), doSub('c1', { input_tokens: 1, output_tokens: 1 }, [], '2026-09-18T10:00:00.000Z'))

    const m2 = new T.MedidorDaConversa(p2)
    m2.atualizar()
    const porId = id => m2.resumo().subagentes.find(s => s.id === id) || {}
    const n2 = porId('bbb222')
    checar('⛔ V16: o subagente de SEGUNDO nível ganha o nome pela ficha (.meta.json), e não "subagente bbb222"',
      n2.nome === 'revisar o segundo nível', n2.nome)
    checar('⛔ V16: a ficha dá o pai, a profundidade, o tipo e se a pessoa parou',
      n2.pai === 'aaa111' && n2.profundidade === 2 && n2.tipo === 'Explore' && n2.parado === true && n2.chamada === 'tu-n2', JSON.stringify(n2))
    checar('V16: no primeiro nível a ficha também vale (e dá a chamada)', porId('aaa111').nome === 'nível um pela ficha' && porId('aaa111').chamada === 'tu-n1' && porId('aaa111').pai === null,
      JSON.stringify(porId('aaa111')))
    checar('V16 (controle): sem ficha e sem ligação, continua "subagente xxxxxx"', porId('ccc333').nome === 'subagente ccc333' && porId('ccc333').profundidade === 1, porId('ccc333').nome)
    checar('⛔ V16: do disco, o começo e o fim (primeira e última linha), as ferramentas sem repetir e a última delas',
      n2.inicioMs === Date.parse('2026-09-18T10:00:00.000Z') && n2.fimMs - n2.inicioMs === (37 * 60 + 3) * 1000 && n2.ferramentas === 3 && n2.ultimaFerramenta === 'Bash',
      JSON.stringify({ i: n2.inicioMs, d: n2.fimMs - n2.inicioMs, f: n2.ferramentas, u: n2.ultimaFerramenta }))
    checar('⛔ V16: os tokens do agente são a conta do SDK — contexto da última resposta + a saída dela',
      n2.tokensNoFim === 2 + 250000 + 1000 + 40, n2.tokensNoFim)

    // A ficha que aparece DEPOIS do arquivo (ela nasce junto, mas a leitura pode chegar antes): a próxima leitura acha.
    fs.writeFileSync(path.join(sub, 'agent-ccc333.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'ficha que chegou depois', toolUseId: 'tu-n3', spawnDepth: 1 }))
    m2.atualizar()
    checar('V16: ficha que aparece depois é lida na leitura seguinte', porId('ccc333').nome === 'ficha que chegou depois', porId('ccc333').nome)
    checar('V16: T.lerFichaDoSubagente sem ficha devolve null', T.lerFichaDoSubagente(path.join(sub, 'nao-existe.jsonl')) === null)
  }
} finally {
  fs.rmSync(base, { recursive: true, force: true })
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
