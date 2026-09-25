// OS MCPs (V26) — `mcps.js` em node puro: o parse, os estados e a execução. Sem abrir o editor.
//
// O que precisa ser verdade:
//   1. cada um dos oito estados que o CLI sabe dizer é reconhecido, e vira rótulo em português;
//   2. o estado é reconhecido pela PALAVRA, não pelo símbolo (o CLI troca de símbolo sem avisar);
//   3. um alvo com ` - ` dentro (um comando com argumentos) não engana o corte do estado;
//   4. estado desconhecido vira `desconhecido` COM O TEXTO CRU — nunca "desconectado";
//   5. o ruído do CLI (o "Checking…", as linhas vazias) não vira servidor;
//   6. nome fora do padrão não vira argumento de processo;
//   7. a execução devolve a saída mesmo com código de saída diferente de zero, e ERRA quando não há
//      saída nenhuma — quem desenha precisa poder dizer "não consegui medir";
//   8. o teto de tempo mata a espera e diz que matou.
//
// Uso:  node testes/mcps.mjs          (tudo com um CLI de mentira)
//       node testes/mcps.mjs --real   (e mais uma rodada contra o claude.exe desta máquina)

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const M = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'mcps.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

// ── 1 e 2. os oito estados, e o símbolo que não manda ──
// ⚠️ Os textos vieram do BINÁRIO 2.1.261 (lidos em 24/09/2026), não da documentação.
const CASOS = [
  ['a: http://x - \u2714 Connected', 'conectado', 'conectado'],
  ['a: http://x - \u221A Connected', 'conectado', 'o mesmo estado com o símbolo ASCII'],
  ['a: http://x - ! Connected \u00B7 tools fetch failed', 'semFerramentas', 'conectado sem listar ferramentas'],
  ['a: http://x - ! Needs authentication', 'precisaEntrar', 'precisa entrar'],
  ['a: http://x - \u2717 Failed to connect: ECONNREFUSED', 'naoConectou', 'não conectou'],
  ['a: cmd - \u23F8 Pending approval (run `claude` to approve)', 'aguardandoAprovacao', 'à espera de aprovação'],
  ['a: cmd - \u2717 Rejected (see disabledMcpjsonServers in settings)', 'recusado', 'recusado'],
  ['a: cmd - \u2298 Disabled for this project (re-enable via /mcp)', 'desligado', 'desligado nesta pasta'],
  ['a: http://x - - Not configured', 'semEndereco', 'sem endereço'],
]
for (const [linha, esperado, oQue] of CASOS) {
  const item = M.analisarLinha(linha)
  checar(`mcps: ${oQue}`, item && item.estado === esperado, item && item.estado)
}
checar('mcps: todo estado conhecido tem rótulo em português',
  M.ESTADOS.every(e => e.rotulo && !/[A-Z]/.test(e.rotulo[0]) && !/connect|authentic|approval/i.test(e.rotulo)),
  M.ESTADOS.map(e => e.rotulo).join(' | '))

// o motivo do erro fica guardado, e não some no rótulo
{
  const item = M.analisarLinha('a: http://x - \u2717 Failed to connect: ECONNREFUSED 127.0.0.1:9')
  checar('mcps: o motivo da falha é preservado', item.detalhe === 'ECONNREFUSED 127.0.0.1:9', item.detalhe)
}

// ── 3. o alvo com ` - ` dentro ──
{
  // ⚠️ O que importa aqui é o ` - ` DENTRO do comando, que é a armadilha do corte. O caminho é
  // POSIX de propósito: a varredura anti-vazamento barra caminho de máquina em teste.
  const linha = 'gptmaker: uv --directory /projetos/uma pasta - com traco run gptmaker-mcp - ⏸ Pending approval (run `claude` to approve)'
  const item = M.analisarLinha(linha)
  checar('mcps: comando com " - " no meio não engana o corte', item.estado === 'aguardandoAprovacao', item && item.estado)
  checar('mcps: e o alvo fica inteiro', item.alvo.endsWith('run gptmaker-mcp'), item && item.alvo)
  checar('mcps: e o nome é só o nome', item.nome === 'gptmaker', item && item.nome)
}

// o nome com ": " depois do primeiro não quebra (o CLI corta no primeiro, nós também)
{
  const item = M.analisarLinha('claude.ai Claude Docs: https://api.anthropic.com/v1/pages/mcp - \u2714 Connected')
  checar('mcps: nome com espaço e ponto', item.nome === 'claude.ai Claude Docs', item && item.nome)
  checar('mcps: e a URL não perde o "https://"', item.alvo === 'https://api.anthropic.com/v1/pages/mcp', item && item.alvo)
}

// ── 4. o desconhecido ──
{
  const item = M.analisarLinha('novo: http://y - \u2605 Alguma coisa que ainda não existe')
  checar('mcps: estado novo vira "desconhecido", não "desconectado"', item && item.estado === 'desconhecido', item && item.estado)
  checar('mcps: e o texto cru do estado aparece para a pessoa',
    item && item.rotulo.includes('Alguma coisa que ainda não existe'), item && item.rotulo)
  checar('mcps: desconhecido NÃO conta como conectado', M.resumir([item]).conectados === 0)
}

// ── 5. o ruído ──
{
  const saida = 'Checking MCP server health\u2026\n\na: http://x - \u2714 Connected\n\n'
  const itens = M.analisarLista(saida)
  checar('mcps: o "Checking…" e as linhas vazias não viram servidor', itens.length === 1, itens.length)
  const vazio = M.analisarLista('No MCP servers configured. Use `claude mcp add` to add a server.')
  checar('mcps: "nenhum servidor" é lista vazia, e não um item falso', vazio.length === 0, vazio.length)
}

// ── o resumo ──
{
  const itens = M.analisarLista([
    'a: http://x - \u2714 Connected',
    'b: http://x - \u2714 Connected',
    'c: http://x - ! Needs authentication',
    'd: http://x - \u2717 Failed to connect: nada',
  ].join('\n'))
  const r = M.resumir(itens)
  checar('mcps: o resumo conta certo', r.total === 4 && r.conectados === 2 && r.atencao === 1 && r.parados === 1, JSON.stringify(r))
}

// ── 6. o nome que não pode virar argumento ──
//
// ⚠️ A REGRA MUDOU NA REVISÃO, E MUDOU PARA OS DOIS LADOS. Ela era uma lista branca de ASCII: barrava
// `Conexões da Equipe` (e o botão daquele servidor ficava mudo, sem dizer nada) e deixava passar
// `PWN:  - nada`, que era justamente o nome que travava o parser. Agora barra-se o que é perigoso de
// carregar adiante, e aceita-se o resto — inclusive `&& calc` e `a;b`, que NÃO são perigosos aqui
// porque nada passa por interpretador de comando: `execFile` e `shellArgs` recebem LISTA.
for (const ruim of [
  ['', 'vazio'],
  ['  ', 'só espaço'],
  [' x', 'espaço na frente'],
  ['x ', 'espaço no fim'],
  ['-rf', 'começando com traço — o CLI leria como opção dele, não como nome'],
  ['x\ny', 'com quebra de linha'],
  ['a"b', 'com aspas'],
  ['a\u0000b', 'com caractere de controle'],
  ['a'.repeat(200), 'longo demais'],
  [null, 'nulo'],
]) {
  checar(`mcps: nome recusado (${ruim[1]})`, M.nomeValido(ruim[0]) === false && M.argumentosParaEntrar(ruim[0]) === null, JSON.stringify(ruim[0]).slice(0, 40))
}
for (const bom of ['Conexões da Equipe', 'gptmaker (produção)', 'claude.ai Gmail', '&& calc', 'a;b']) {
  checar(`mcps: nome aceito (${bom})`, M.nomeValido(bom) === true)
}
checar('mcps: nome bom vira argumentos de login',
  JSON.stringify(M.argumentosParaEntrar('claude.ai Gmail')) === JSON.stringify(['mcp', 'login', 'claude.ai Gmail']))

// ── 7 e 8. a execução ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-mcps-'))
const falso = path.join(tmp, 'falso.mjs')
fs.writeFileSync(falso, [
  'const modo = process.argv[2]',
  'if (modo === "ruidoso") { console.log("a: http://x - \\u2714 Connected"); console.error("aviso qualquer"); process.exit(3) }',
  'if (modo === "mudo") { process.exit(9) }',
  'if (modo === "lento") { setTimeout(() => console.log("tarde"), 30000) }',
].join('\n'), 'utf8')

{
  // ⚠️ `rodar` devolve `{ texto, completo, motivo }` desde a revisão da V26 — o `completo` é o que
  // separa "a lista inteira" de "o pedaço que deu para ler".
  const r = await M.rodar(process.execPath, [falso, 'ruidoso'])
  checar('mcps: código de saída != 0 com texto útil NÃO é erro', /Connected/.test(r.texto), String(r.texto).slice(0, 60))
  checar('mcps: e o que saiu no erro padrão vem junto', /aviso qualquer/.test(r.texto))
  checar('mcps: saída inteira é marcada como COMPLETA', r.completo === true)
}
{
  let erro = null
  try { await M.rodar(process.execPath, [falso, 'mudo']) } catch (e) { erro = e }
  checar('mcps: sem saída nenhuma, ERRA (não devolve lista vazia)', erro instanceof Error, erro && erro.message)
}
{
  const t0 = Date.now()
  let erro = null
  try { await M.rodar(process.execPath, [falso, 'lento'], { teto: 1500 }) } catch (e) { erro = e }
  const levou = Date.now() - t0
  checar('mcps: o teto de tempo corta a espera', erro instanceof Error && levou < 10000, `${levou} ms`)
  checar('mcps: e diz que foi o tempo, com o número', erro && /não respondeu em \d+ s/.test(erro.message), erro && erro.message)
}
{
  let erro = null
  try { await M.rodar(null, ['mcp', 'list']) } catch (e) { erro = e }
  checar('mcps: sem o programa do Claude, erra com uma frase que a pessoa entende',
    erro && /não achei o programa do Claude/.test(erro.message), erro && erro.message)
}
// `lerLista` com o CLI de mentira: o caminho inteiro, do processo ao item.
{
  const r = await M.lerLista({ exe: process.execPath, rodarComando: (exe, args, o) => M.rodar(exe, [falso, 'ruidoso'], o) })
  checar('mcps: lerLista entrega itens e a hora da medição', r.itens.length === 1 && typeof r.lidoEm === 'number')
}
{
  let erro = null
  try { await M.lerDetalhe('&& calc', { exe: process.execPath }) } catch (e) { erro = e }
  checar('mcps: lerDetalhe recusa nome fora do padrão ANTES de rodar nada', erro instanceof Error, erro && erro.message)
}
fs.rmSync(tmp, { recursive: true, force: true })

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// OS ACHADOS DOS REVISORES DE FORA (24/09/2026) — cada um com o seu critério, para não voltarem.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── ⛔ O LAÇO INFINITO. Um nome de servidor vindo de `.mcp.json` travava o editor inteiro.
// Roda em OUTRO processo, com teto de tempo: se a regressão voltar, o teste falha em 8 s em vez de
// pendurar a bateria para sempre.
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-lacо-'))
  const roteiro = path.join(tmp2, 'veneno.mjs')
  const modulo = path.join(REPO, 'extensoes', 'oficina-claude', 'mcps.js').split(path.sep).join('/')
  fs.writeFileSync(roteiro, [
    `import { createRequire } from 'node:module'`,
    `const M = createRequire(import.meta.url)('${modulo}')`,
    // A linha exata que o revisor produziu com o CLI de verdade: separador na posição 0 e fim que
    // não é estado conhecido.
    `const venenosa = 'PWN:  - nada_reconhecivel'`,
    `M.analisarLista(venenosa)`,
    `M.analisarLinha(venenosa)`,
    `M.ondeCortarOEstado(' - nada')`,
    `console.log('SAIU')`,
  ].join('\n'), 'utf8')
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(process.execPath, [roteiro], { encoding: 'utf8', timeout: 8000 })
  checar('⛔ mcps: a linha que travava o editor NÃO trava mais (laço infinito do lastIndexOf)',
    r.status === 0 && /SAIU/.test(String(r.stdout || '')), `status=${r.status} ${r.signal || ''}`)
  fs.rmSync(tmp2, { recursive: true, force: true })
}

// ── ⛔ TEXTO DE ERRO DO CLI NÃO VIRA SERVIDOR.
for (const [linha, oQue] of [
  ["error: unknown option '--json'", 'o erro que o próprio CLI dá'],
  ['Usage: claude mcp [options] [command]', 'a linha de uso'],
  ['(node:26936) Warning: alguma coisa', 'um aviso do node'],
  ['Error: something went wrong', 'um erro genérico'],
]) {
  checar(`⛔ mcps: ${oQue} NÃO vira servidor`, M.analisarLinha(linha) === null, JSON.stringify(M.analisarLinha(linha)))
}
checar('⛔ mcps: e a saída de erro inteira não vira "1 servidor com pendência"',
  M.analisarLista("error: unknown option '--json'").length === 0)

// ── ⛔ NOME QUE A TELA MOSTRA MAS NÃO DEIXA AGIR: aparece, com aviso, e sem ação muda.
for (const nome of ['Conexões da Equipe', 'gptmaker (produção)', 'servidor-de-casa']) {
  checar(`mcps: nome em português é AGÍVEL (${nome})`, M.nomeValido(nome) === true)
}
{
  const item = M.analisarLinha('nome "com aspas": http://x - ✔ Connected')
  checar('⛔ mcps: nome que não pode virar argumento AINDA APARECE na lista', !!item, 'sumiu')
  checar('⛔ mcps: e ele vem sem ação, com o aviso escrito', item.podeAgir === false && item.acao === null && /não consigo agir/.test(item.aviso), JSON.stringify(item && item.aviso))
  const bom = M.analisarLinha('gptmaker (produção): uv run x - ! Needs authentication')
  checar('mcps: e o nome bom continua com a ação dele', bom.podeAgir === true && bom.acao === 'entrar')
}

// ── ⛔ NOME REPETIDO é descartado (id repetido quebra a árvore do editor).
{
  const itens = M.analisarLista([
    'github: https://api.github.com/mcp - ✔ Connected',
    'github: outra coisa - ✗ Failed to connect: x',
  ].join('\n'))
  checar('⛔ mcps: nome repetido não vira dois itens', itens.length === 1, itens.length)
  const leitura = M.lerSaida([
    'github: https://api.github.com/mcp - ✔ Connected',
    'github: outra coisa - ✗ Failed to connect: x',
  ].join('\n'))
  checar('⛔ mcps: e o descarte é CONTADO, não escondido', leitura.repetidas === 1, leitura.repetidas)
}

// ── ⛔ "NÃO HÁ NENHUM" só se o CLI disser isso.
{
  const vazio = M.lerSaida('No MCP servers configured. Use `claude mcp add` to add a server.')
  checar('⛔ mcps: com a frase do CLI, o vazio é AFIRMÁVEL', vazio.disseQueNaoHa === true && vazio.itens.length === 0)
  const formatoNovo = M.lerSaida('| nome | estado |\n| ---- | ------ |\n| gmail | ok |')
  checar('⛔ mcps: formato que eu não entendo NÃO vira "não há nenhum"',
    formatoNovo.disseQueNaoHa === false && formatoNovo.itens.length === 0 && formatoNovo.naoEntendidas.length > 0,
    JSON.stringify({ d: formatoNovo.disseQueNaoHa, n: formatoNovo.naoEntendidas.length }))
}

// ── ⛔ MEDIÇÃO PELA METADE não é medição inteira.
{
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-parcial-'))
  const parcial = path.join(tmp3, 'parcial.mjs')
  fs.writeFileSync(parcial, [
    'console.log("a: http://x - \\u2714 Connected")',
    'console.log("b: http://y - \\u2714 Connected")',
    'setTimeout(() => {}, 30000)',   // imprime parte e pendura, como um servidor MCP travado
  ].join('\n'), 'utf8')
  const r = await M.rodar(process.execPath, [parcial], { teto: 1500 })
  checar('⛔ mcps: teto estourado COM saída parcial devolve a saída…', /Connected/.test(r.texto))
  checar('⛔ mcps: …mas marcada como INCOMPLETA, com o motivo',
    r.completo === false && /tempo acabou/.test(r.motivo), JSON.stringify({ c: r.completo, m: r.motivo }))
  const lista = await M.lerLista({ exe: process.execPath, rodarComando: (e, a, o) => M.rodar(process.execPath, [parcial], { ...o, teto: 1500 }) })
  checar('⛔ mcps: e a incompletude chega a quem desenha', lista.completo === false && lista.itens.length === 2, JSON.stringify({ c: lista.completo, n: lista.itens.length }))
  fs.rmSync(tmp3, { recursive: true, force: true })
}

// ── A PASTA QUE CONSEGUE FORJAR LINHA: o aviso existe, e ele sobe a árvore.
{
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-pasta-'))
  const funda = path.join(raiz, 'um', 'dois')
  fs.mkdirSync(funda, { recursive: true })
  checar('mcps: pasta limpa não gera aviso', M.avisoDePastaAdulterada(funda) === null)
  fs.writeFileSync(path.join(raiz, '.mcp.json'), JSON.stringify({ mcpServers: { 'x\ny: http://z - Connected': {} } }), 'utf8')
  const aviso = M.avisoDePastaAdulterada(funda)
  checar('⛔ mcps: nome com quebra de linha no .mcp.json vira AVISO', typeof aviso === 'string' && /INVENTAR linhas/.test(aviso), aviso)
  checar('⛔ mcps: e o aviso é achado mesmo com o arquivo DOIS NÍVEIS acima (o Claude sobe a árvore)',
    aviso && aviso.includes(raiz), aviso)
  checar('mcps: sem pasta, sem aviso (e sem estouro)', M.avisoDePastaAdulterada(undefined) === null)
  fs.rmSync(raiz, { recursive: true, force: true })
}
checar('mcps: a busca do .mcp.json sobe até a raiz e para', (() => {
  const l = M.arquivosDeProjeto(path.join('C:', 'um', 'dois', 'tres'))
  return l.length >= 3 && l.length < 40 && l.every(p => p.endsWith('.mcp.json'))
})())

// ── O teto do `mcp get` é o da lista, não o curto (o `mcp get` conecta: medido 1917 ms).
checar('mcps: o teto da ficha é o da lista, porque a ficha também conecta',
  M.TETO_DO_DETALHE_MS === M.TETO_DA_LISTA_MS && M.TETO_DO_DETALHE_MS > M.TETO_CURTO_MS)

// ── a rodada contra o CLI de verdade, só com --real ──
if (process.argv.includes('--real')) {
  const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OFICINA', 'resources', 'app', 'extensions',
    'oficina-claude', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe')
  if (!fs.existsSync(exe)) {
    console.log('  (pulado) --real: não achei o claude.exe da instalação')
  } else {
    const t0 = Date.now()
    const r = await M.lerLista({ exe, cwd: REPO })
    console.log(`  (real) ${r.itens.length} servidores em ${Date.now() - t0} ms`)
    for (const i of r.itens) console.log(`         ${i.nome} — ${i.rotulo}`)
    checar('mcps (real): o CLI desta máquina foi lido e nenhum item ficou desconhecido',
      r.itens.length > 0 && r.itens.every(i => i.estado !== 'desconhecido'),
      r.itens.filter(i => i.estado === 'desconhecido').map(i => i.cru).join(' | '))
  }
}

// ⚠️ O PLACAR É A ÚLTIMA LINHA, e em JSON: é assim que `rapidos.mjs` e `regressao.mjs` leem esta
// suíte. Sem ele, a bateria a marca como "sem placar" e apagar um critério daqui não deixaria nada
// vermelho — foi o que aconteceu com seis suítes da V20 até um revisor independente pegar.
// ⚠️ O piso na regressão é o total SEM `--real` (o modo real acrescenta um critério).
const falhas = resultados.filter(r => !r.ok).length
console.log(`\nmcps: ${resultados.length - falhas}/${resultados.length} critérios`)
console.log(JSON.stringify({ passou: falhas === 0, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(falhas ? 1 : 0)
