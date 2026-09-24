// A TELA DE TOKENS (V10) — `telaTokens.js` com um editor de mentira, relógio controlado e arquivos
// de conversa DE VERDADE no disco. Sem abrir o editor.
//
// O que precisa ser verdade:
//   1. sem conversa, nada de número (a barra some e a vista diz por quê);
//   2. conversa nova diz que os números vêm depois da primeira resposta;
//   3. com o id, a barra e a vista mostram os números do arquivo;
//   4. o disco só é relido enquanto o agente trabalha, e uma vez ao fim da resposta;
//   5. trocar de conversa troca os números; não há configuração que esconda os números (V14);
//   6. o PÉ da conversa recebe os mesmos números e o relógio do cache, que anda sozinho, um tique por
//      virada de minuto, e para quando vence (V14).
//
// Uso:  node testes/tela_tokens.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const { criarTelaDeTokens, INTERVALO_MS } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'telaTokens.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

// ── o editor de mentira ──
const config = {}
let ouvinteDeConfig = null
const vscode = {
  StatusBarAlignment: { Left: 1, Right: 2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class { constructor(label, estado) { this.label = label; this.collapsibleState = estado } },
  ThemeIcon: class { constructor(id) { this.id = id } },
  EventEmitter: class {
    constructor() { this.n = 0; this.event = () => ({ dispose() { } }) }
    fire() { this.n++ }
    dispose() { }
  },
  window: {
    createStatusBarItem: () => ({ text: '', tooltip: '', visivel: false, show() { this.visivel = true }, hide() { this.visivel = false }, dispose() { } }),
  },
  workspace: {
    getConfiguration: () => ({ get: (k, padrao) => (k in config ? config[k] : padrao) }),
    onDidChangeConfiguration: fn => { ouvinteDeConfig = fn; return { dispose() { } } },
  },
}

// ── relógio controlado ──
let relogios = []
let atrasos = []
const agendar = (fn, ms) => { const r = { fn, ms, vivo: true }; relogios.push(r); return r }
const desagendar = r => { r.vivo = false }
const atrasar = (fn, ms) => { atrasos.push({ fn, ms }) }
const vivos = () => relogios.filter(r => r.vivo)
// O tique do relógio do cache (V14): marcado à parte, com a hora na mão.
let tiques = []
const marcar = (fn, ms) => { const t = { fn, ms, vivo: true }; tiques.push(t); return t }
const desmarcar = t => { t.vivo = false }
const tiquesVivos = () => tiques.filter(t => t.vivo)
const MIN = 60 * 1000
let agora = Date.parse('2026-09-18T12:00:00.000Z')

// ── as conversas no disco ──
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-tela-tokens-'))
const pasta = path.join(base, 'projects', 'D--pasta')
fs.mkdirSync(pasta, { recursive: true })
const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const L = (id, uso, model = 'claude-opus-5', timestamp) => JSON.stringify({ type: 'assistant', timestamp, message: { id, model, usage: uso, content: [] } }) + '\n'
fs.writeFileSync(path.join(pasta, A + '.jsonl'), L('a1', { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 583000, cache_creation_input_tokens: 0 }, 'claude-opus-5', '2026-09-18T11:50:00.000Z'))
fs.writeFileSync(path.join(pasta, B + '.jsonl'), L('b1', { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }))

try {
  const tela = criarTelaDeTokens(vscode, { raiz: path.join(base, 'projects'), agendar, desagendar, atrasar, marcar, desmarcar, agora: () => agora })
  const pes = []
  tela.ligarPe(pe => pes.push(pe))
  checar('pé: quem liga recebe o estado de agora na hora (sem conversa: vazio, sem relógio)', pes.length === 1 && pes[0].texto === null && pes[0].relogio === null, JSON.stringify(pes[0]))
  const rotulos = () => tela.provedor.getChildren().map(i => i.label)

  // 1. sem conversa
  checar('tela: sem conversa, a barra fica escondida', tela.barra.visivel === false)
  checar('tela: sem conversa, a vista diz por quê', rotulos().join() === 'Nenhuma conversa aberta', rotulos().join())

  // 2. conversa nova
  tela.aoEvento({ tipo: 'pronto', sessao: null, retomada: null })
  checar('tela: conversa nova diz que os números vêm depois da primeira resposta', rotulos().join() === 'Conversa nova' && tela.barra.visivel === false, rotulos().join())

  // 3. o id chega (o `init` depois da primeira mensagem) — ⚠️ NA ORDEM DO MOTOR: `pensando` vem ANTES do
  // id. O teste antigo mandava o id primeiro, e o relógio desligado pela chegada do id passava invisível.
  tela.aoEvento({ tipo: 'estado', estado: 'pensando' })
  tela.aoEvento({ tipo: 'pronto', sessao: A })
  checar('⛔ tela: o id que chega no meio do primeiro turno NÃO desliga o relógio', vivos().length === 1, vivos().length)
  tela.aoEvento({ tipo: 'estado', estado: 'ociosa' })
  checar('tela: com o id, a barra aparece com contexto · total · custo', tela.barra.visivel && /^\$\(pulse\) 584k · 585k · US\$ [\d,]+\*$/.test(tela.barra.text), tela.barra.text)
  checar('tela: a dica da barra diz que o custo é estimativa e não cobrança', /estimativa/.test(tela.barra.tooltip) && /não é cobrança/.test(tela.barra.tooltip), tela.barra.tooltip)
  const r = rotulos()
  checar('tela: a vista mostra contexto, processado, custo, modelos, subagentes e skills',
    ['Contexto agora', 'Processado', 'Custo', 'Modelos (1)', 'Subagentes (0)', 'Skills (0)'].every(x => r.includes(x)), r.join(' | '))
  const contexto = tela.provedor.getChildren().find(i => i.label === 'Contexto agora')
  checar('tela: a vista fala do número como a lista das conversas fala (formato único)', contexto.description === '584 mil tokens', contexto.description)
  const modelos = tela.provedor.getChildren().find(i => i.label === 'Modelos (1)')
  checar('tela: os modelos abrem com nome de gente', tela.provedor.getChildren(modelos).map(i => i.label).join() === 'Opus 5')

  // 4. só lê enquanto trabalha
  checar('tela: parada, nenhum relógio ligado', vivos().length === 0)
  tela.aoEvento({ tipo: 'estado', estado: 'pensando' })
  checar('tela: pensando, um relógio a cada 3 s', vivos().length === 1 && vivos()[0].ms === INTERVALO_MS)
  tela.aoEvento({ tipo: 'estado', estado: 'esperando_permissao' })
  checar('tela: mudar de estado trabalhando não empilha relógio', vivos().length === 1)
  fs.appendFileSync(path.join(pasta, A + '.jsonl'), L('a2', { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 700000, cache_creation_input_tokens: 0 }, 'claude-opus-5', '2026-09-18T11:50:00.000Z'))
  vivos()[0].fn()
  checar('tela: a volta do relógio lê o que o agente acabou de gravar', /^\$\(pulse\) 701k · /.test(tela.barra.text), tela.barra.text)
  tela.aoEvento({ tipo: 'estado', estado: 'ociosa' })
  checar('tela: voltou a ficar parada, o relógio desliga', vivos().length === 0)
  tela.aoEvento({ tipo: 'fim', erro: null })
  checar('tela: ao fim da resposta, UMA leitura logo depois', atrasos.length === 1 && atrasos[0].ms <= 1000)

  // 5. sem configuração que esconda (V14)
  {
    const manifesto = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
    const chaves = Object.keys(((manifesto.contributes || {}).configuration || {}).properties || {})
    checar('⛔ não existe configuração que esconda os tokens (V14: "sem opção de desligar")',
      !chaves.some(k => /tokens/i.test(k)), chaves.filter(k => /tokens/i.test(k)).join())
  }

  // 6. o pé da conversa e o relógio do cache (V14)
  {
    const ultimo = () => pes[pes.length - 1]
    // Sem relógio no pé, o critério cai, e a suíte segue (não quebra no meio sem placar).
    const rel_ = () => ultimo().relogio || {}
    const disparar = () => { const t = tiquesVivos()[0]; if (t) { agora += t.ms; t.fn() } else agora += MIN }
    checar('⛔ pé: recebe os mesmos números da barra', ultimo().texto === tela.barra.text.replace('$(pulse) ', ''), `${ultimo().texto} x ${tela.barra.text}`)
    checar('pé: a dica dos números diz que o custo é estimativa e que o clique mostra o detalhe', /estimativa/.test(ultimo().dica) && /detalhe/.test(ultimo().dica), ultimo().dica)
    const rel = ultimo().relogio
    // Resposta das 11:50 sem escrita de cache, leitura às 12:00: 50 min, suposição (nenhum TTL visto).
    checar('⛔ pé: o relógio do cache vem junto (anel e minutos), e parte da resposta no arquivo', !!rel && rel.minutos === 50 && Math.abs(rel.fracao - 50 / 60) < 1e-9 && rel.vencido === false, JSON.stringify(rel))
    checar('pé: sem TTL visto na conversa, o relógio se diz suposição', rel && rel.suposto === true && /suposição/.test(rel.dica), rel && rel.dica)
    checar('⛔ pé: o relógio marca UM tique, na virada do minuto', tiquesVivos().length === 1 && tiquesVivos()[0].ms > 0 && tiquesVivos()[0].ms === MIN + 50, tiquesVivos().map(t => t.ms).join())

    // O tique anda sozinho: nenhuma leitura de disco, nenhum evento da conversa.
    const antes = pes.length
    disparar()
    checar('⛔ pé: o tique sozinho baixa um minuto e marca o próximo', pes.length === antes + 1 && rel_().minutos === 49 && tiquesVivos().length === 1,
      `${rel_().minutos}; ${tiquesVivos().length} tique(s)`)

    // Uma resposta nova (com escrita de 1 h) chega e é lida: o relógio recomeça em 60m.
    fs.appendFileSync(path.join(pasta, A + '.jsonl'), L('a3', { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 701000, cache_creation_input_tokens: 800,
      cache_creation: { ephemeral_1h_input_tokens: 800, ephemeral_5m_input_tokens: 0 } }, 'claude-opus-5', new Date(agora).toISOString()))
    tela.ler()
    checar('⛔ pé: a resposta nova recomeça o relógio (60m, TTL lido da resposta)', rel_().minutos === 60 && rel_().suposto === false && tiquesVivos().length === 1,
      JSON.stringify(ultimo().relogio))

    // Uma hora depois, sem resposta: vence, e o tique para.
    agora += 60 * MIN
    { const t = tiquesVivos()[0]; if (t) t.fn() }
    checar('⛔ pé: passou de 1 h, o relógio vence e para de marcar tique', rel_().vencido === true && tiquesVivos().length === 0, JSON.stringify(ultimo().relogio))
    checar('pé: vencido, a dica diz que a próxima mensagem relê a conversa inteira e custa mais', /relê a conversa inteira/.test(rel_().dica) && /custa mais/.test(rel_().dica))
  }

  // bifurcada: nasce com o id da ORIGINAL em `retomada`, e não pode mostrar os números dela
  tela.acompanhar(null)
  tela.aoEvento({ tipo: 'pronto', sessao: null, retomada: A, bifurcada: true })
  checar('⛔ tela: conversa bifurcada não mostra os números da original', tela.barra.visivel === false && rotulos().join() === 'Conversa nova', `${tela.barra.visivel} ${rotulos().join()}`)

  // trocar de conversa: retomada chega com `retomada`
  tela.aoEvento({ tipo: 'pronto', sessao: null, retomada: B })
  checar('tela: conversa retomada mostra os números DELA na hora', /^\$\(pulse\) 10 · 20$/.test(tela.barra.text) || /^\$\(pulse\) 10 · 20 · US\$ [\d,]+\*$/.test(tela.barra.text), tela.barra.text)

  tela.aoEvento({ tipo: 'estado', estado: 'pensando' })
  tela.acompanhar(null)
  checar('tela: fechar a conversa esconde a barra, desliga o relógio e a vista diz que não há conversa',
    tela.barra.visivel === false && vivos().length === 0 && rotulos().join() === 'Nenhuma conversa aberta')
  checar('pé: fechar a conversa limpa o pé e não deixa tique marcado', pes[pes.length - 1].texto === null && pes[pes.length - 1].relogio === null && tiquesVivos().length === 0)

  // conversa cujo arquivo ainda não existe
  tela.acompanhar('cccccccc-0000-0000-0000-000000000003')
  checar('tela: id sem arquivo ainda não inventa número', tela.barra.visivel === false && /Ainda não há nada gravado/.test(rotulos().join()), rotulos().join())
  fs.writeFileSync(path.join(pasta, 'cccccccc-0000-0000-0000-000000000003.jsonl'), L('c1', { input_tokens: 5, output_tokens: 5 }))
  tela.ler()
  checar('tela: quando o arquivo aparece, a próxima leitura já mede', tela.barra.visivel === true && tela.situacao === 'medindo', tela.situacao)

  tela.descartar()
} finally {
  fs.rmSync(base, { recursive: true, force: true })
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
