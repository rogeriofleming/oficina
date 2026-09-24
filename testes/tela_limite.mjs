// O MOSTRADOR DO LIMITE — o relógio, a cota, o clique e o que vai para a barra de cima.
//
// `mostradorDoLimite.js` com um editor de mentira, relógio na mão e um agente de mentira. Sem
// abrir o editor e sem rede: o que se prova aqui é o TEMPO (quando consultar, quando não, quando
// repintar porque o número envelheceu), e tempo de verdade transformaria uma suíte de
// milissegundos numa de horas.
//
// O que precisa ser verdade:
//   1. a barra NASCE com número, do registro local, antes de qualquer conversa com o servidor;
//   2. o aviso que chega de graça repinta na hora;
//   3. a consulta respeita a cota (uma a cada 5 min), e a recusa nunca vira erro na tela;
//   4. o método experimental ausente NÃO gasta cota e NÃO apaga o número — cai para o registro;
//   5. o número envelhece sozinho na tela, e some quando fica velho demais;
//   6. conta sem limite de plano esconde o item, em vez de mostrar traço para sempre;
//   7. o clique só fala com a pessoa quando não pode consultar, dizendo quanto falta;
//   8. nada que identifique a conta chega às chaves que a barra lê.
//
// Uso:  node testes/tela_limite.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}

let M = null, L = null
try {
  M = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'mostradorDoLimite.js'))
  L = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'limite.js'))
} catch (e) {
  // Guarda: sem o módulo esta suíte marca VERMELHO com placar, em vez de morrer sem placar.
  checar('⛔ o mostrador do limite existe (extensoes/oficina-claude/mostradorDoLimite.js)', false, String(e && e.message))
  console.log('\n' + JSON.stringify({ passou: false, total: resultados.length, falhas: resultados.map(r => r.nome) }))
  process.exit(1)
}

const MIN = 60 * 1000
const INICIO = Date.parse('2026-09-20T13:00:00.000Z')

// ── o editor de mentira: só o que o mostrador usa ────────────────────────────
function editorFalso() {
  const chaves = []
  return {
    chaves,
    vscode: {
      commands: {
        executeCommand: async (nome, ...args) => {
          if (nome === 'setContext') chaves.push({ chave: args[0], valor: args[1] })
          return undefined
        },
      },
    },
    valorDe: chave => {
      for (let i = chaves.length - 1; i >= 0; i--) if (chaves[i].chave === chave) return chaves[i].valor
      return undefined
    },
    vezesDe: chave => chaves.filter(c => c.chave === chave).length,
  }
}

const respostaDoAgente = (cinco, sete) => ({
  subscription_type: 'max',
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: cinco, resets_at: '2026-09-20T15:20:00.581340+00:00' },
    seven_day: { utilization: sete, resets_at: '2026-09-24T13:00:00.581358+00:00' },
  },
})

/** Monta um mostrador com o tempo na mão. */
function montar({ registro = null, consultar = null, avisar = null } = {}) {
  const editor = editorFalso()
  let agora = INICIO
  const marcados = []
  const mostrador = M.criarMostrador(editor.vscode, {
    agora: () => agora,
    marcar: (fn, ms) => { const t = { fn, ms, vivo: true }; marcados.push(t); return t },
    desmarcar: t => { if (t) t.vivo = false },
    lerRegistro: () => registro,
    consultar,
    avisar,
  })
  return {
    editor, mostrador, marcados,
    vivos: () => marcados.filter(t => t.vivo),
    andar: ms => { agora += ms },
    get agora() { return agora },
    /** Dispara o temporizador vivo mais próximo, andando o relógio até ele. */
    disparar: async alvo => {
      const t = marcados.filter(x => x.vivo).find(x => (alvo ? x.ms === alvo : true))
      if (!t) return false
      agora += t.ms
      t.vivo = false
      await t.fn()
      return true
    },
  }
}

/*
  ⚠️ O REGISTRO LOCAL AQUI TEM A FORMA DE VERDADE, e não a da resposta do agente: as janelas vêm
  SOLTAS, sem o invólucro `rate_limits`. Foi assim que o arquivo real se mostrou quando o trabalho
  já estava todo verde — e, com o formato errado no teste, o piso inteiro do mostrador passava sem
  nunca ter sido exercitado com o que existe no computador de quem usa.
*/
const REGISTRO_BOM = quando => ({
  cachedUsageUtilization: {
    fetchedAtMs: quando,
    accountUuid: 'nao-pode-vazar-daqui',
    utilization: {
      five_hour: { utilization: 7, resets_at: '2026-09-20T15:20:00.581340+00:00', limit_dollars: null, used_dollars: null, remaining_dollars: null },
      seven_day: { utilization: 65, resets_at: '2026-09-24T13:00:00.581358+00:00', limit_dollars: null, used_dollars: null, remaining_dollars: null },
      seven_day_opus: null, tangelo: null, nimbus_quill: { utilization: 0 },
      extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null },
    },
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. A BARRA NASCE COM NÚMERO — do registro local, sem rede
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar({ registro: REGISTRO_BOM(INICIO - 2 * MIN), consultar: async () => ({ estado: 'semMetodo' }) })
  await t.mostrador.ligar()
  checar('⛔ o mostrador nasce com número, do registro local, sem falar com o servidor',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 7% · 7d 65%',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  checar('o item aparece na barra (a chave de mostrar vai a verdadeiro)',
    t.editor.valorDe(M.CHAVE_DE_MOSTRAR) === true)
  checar('⛔ a chave leva DUAS partes: a primeira linha é a barra, o resto é o que o mouse mostra',
    /^5h 7% · 7d 65%\nLimite do plano\n/.test(t.editor.valorDe(M.CHAVE_DO_TEXTO)),
    JSON.stringify(t.editor.valorDe(M.CHAVE_DO_TEXTO)).slice(0, 160))
  checar('⛔ o que o mouse mostra traz a virada de CADA janela',
    /Janela de 5 horas: 7% usado · vira /.test(t.editor.valorDe(M.CHAVE_DO_TEXTO)) &&
    /Semana: 65% usado · vira /.test(t.editor.valorDe(M.CHAVE_DO_TEXTO)))
  checar('⛔ NADA que identifique a conta chega às chaves que a barra lê',
    !JSON.stringify(t.editor.chaves).includes('nao-pode-vazar-daqui') &&
    !/account/i.test(JSON.stringify(t.editor.chaves)),
    JSON.stringify(t.editor.chaves).slice(0, 160))
  checar('sem registro e sem agente, a barra ainda tem forma (traço) em vez de sumir',
    (() => { const v = montar({ registro: null, consultar: async () => ({ estado: 'semConversa' }) })
      v.mostrador.publicar()
      return v.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h – · 7d –' })())
  t.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. O AVISO QUE CHEGA DE GRAÇA REPINTA NA HORA
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar({ registro: REGISTRO_BOM(INICIO), consultar: async () => ({ estado: 'semMetodo' }) })
  await t.mostrador.ligar()
  const antes = t.editor.vezesDe(M.CHAVE_DO_TEXTO)
  t.mostrador.aoAviso({
    status: 'allowed', rateLimitType: 'five_hour',
    unifiedWindows: { five_hour: { utilization: 0.23, resetsAt: 1789917600 }, seven_day: { utilization: 0.66, resetsAt: 1790254800 } },
  })
  checar('⛔ o aviso do laço repinta a barra na hora, sem consultar nada',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 23% · 7d 66%' &&
    t.editor.vezesDe(M.CHAVE_DO_TEXTO) === antes + 1,
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  const depois = t.editor.vezesDe(M.CHAVE_DO_TEXTO)
  t.mostrador.aoAviso({
    status: 'allowed', rateLimitType: 'five_hour',
    unifiedWindows: { five_hour: { utilization: 0.23, resetsAt: 1789917600 }, seven_day: { utilization: 0.66, resetsAt: 1790254800 } },
  })
  checar('⛔ aviso que não muda o texto NÃO repinta (a barra de cima redesenha a cada publicação)',
    t.editor.vezesDe(M.CHAVE_DO_TEXTO) === depois, `${depois} -> ${t.editor.vezesDe(M.CHAVE_DO_TEXTO)}`)
  t.mostrador.aoAviso(null)
  checar('aviso vazio não apaga o número que está na tela',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 23% · 7d 66%')
  t.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A COTA — uma consulta a cada 5 min, e a recusa não vira erro
// ─────────────────────────────────────────────────────────────────────────────
{
  let vezes = 0
  const t = montar({
    registro: REGISTRO_BOM(INICIO),
    consultar: async () => { vezes++; return { estado: 'ok', resposta: respostaDoAgente(10 + vezes, 65) } },
  })
  await t.mostrador.ligar()
  checar('ligar consulta UMA vez', vezes === 1, String(vezes))
  checar('a resposta do agente vale sobre o registro local', t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 11% · 7d 65%',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  await t.mostrador.consultarAgora()
  checar('⛔ consultar de novo na mesma hora NÃO fala com o servidor (a cota é de 5 min)', vezes === 1, String(vezes))
  t.andar(4 * MIN)
  await t.mostrador.consultarAgora()
  checar('⛔ nem depois de 4 minutos', vezes === 1, String(vezes))
  t.andar(MIN)
  await t.mostrador.consultarAgora()
  checar('⛔ passados 5 minutos, consulta de novo', vezes === 2, String(vezes))
  checar('há um relógio de fundo marcado, e ele é o do intervalo da consulta',
    t.mostrador.temRelogio && t.vivos().some(x => x.ms === L.INTERVALO_DA_CONSULTA_MS),
    t.vivos().map(x => x.ms).join(', '))
  t.mostrador.descartar()
  checar('descartar desliga os temporizadores (nada sobra vivo)',
    !t.mostrador.temRelogio && !t.mostrador.temTiqueDaIdade, t.vivos().map(x => x.ms).join(', '))
}
{
  // A recusa medida: 429 pedindo 94 s.
  let vezes = 0
  const t = montar({
    registro: REGISTRO_BOM(INICIO),
    consultar: async () => {
      vezes++
      return { estado: 'falhou', erro: Object.assign(new Error('429'), { headers: { 'retry-after': '94' } }) }
    },
    avisar: () => { throw new Error('o mostrador falou sem a pessoa pedir') },
  })
  await t.mostrador.ligar()
  checar('⛔ a recusa por cota NÃO apaga o número que está na tela',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 7% · 7d 65%',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  checar('⛔ a recusa não fala nada com quem está trabalhando (o `avisar` teria lançado)', vezes === 1)
  t.andar(93 * 1000)
  await t.mostrador.consultarAgora()
  checar('⛔ depois da recusa, espera o que o servidor pediu — nem um segundo a menos', vezes === 1, String(vezes))
  t.andar(1000)
  await t.mostrador.consultarAgora()
  checar('passado o tempo pedido, tenta de novo', vezes === 2, String(vezes))
  t.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. O MÉTODO EXPERIMENTAL AUSENTE — caso normal, não defeito
// ─────────────────────────────────────────────────────────────────────────────
{
  /*
    ⚠️ O REGISTRO SÓ APARECE DEPOIS DE LIGAR, e isso não é capricho do teste: é o que faz o
    critério separar. Na primeira versão o registro já existia ao ligar, e o número na barra vinha
    da leitura da própria ligação — então apagar a queda para o piso dentro da consulta deixava
    tudo verde. Achado pela mutação "método ausente não cai para o registro local", que passou
    muda. Aqui a barra nasce com traço, o registro surge, e só a queda pode pintar o número.
  */
  let vezes = 0
  let registro = null
  const editor = editorFalso()
  const agora = INICIO
  const u = M.criarMostrador(editor.vscode, {
    agora: () => agora,
    marcar: () => null, desmarcar: () => { },
    lerRegistro: () => registro,
    consultar: async () => { vezes++; return { estado: 'semMetodo' } },
  })
  await u.ligar()
  checar('sem método e sem registro, a barra fica com traço — e não some nem quebra',
    editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h – · 7d –' && editor.valorDe(M.CHAVE_DE_MOSTRAR) === true,
    editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  checar('⛔ método ausente NÃO gasta cota (não houve conversa com o servidor)',
    L.podeConsultar(u.estado, agora) === true)
  registro = REGISTRO_BOM(INICIO - MIN)
  await u.consultarAgora()
  checar('⛔ método ausente: a leitura CAI para o registro local, e a barra ganha número',
    editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 7% · 7d 65%',
    editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  checar('e a leitura seguinte pode tentar de novo na hora (a cota não foi gasta)',
    vezes === 2 && L.podeConsultar(u.estado, agora) === true, String(vezes))
  u.descartar()

  const v = montar({ registro: REGISTRO_BOM(INICIO), consultar: async () => ({ estado: 'semConversa' }) })
  await v.mostrador.ligar()
  checar('sem conversa aberta, mesma coisa: o registro local segura a barra',
    v.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 7% · 7d 65%')
  v.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. O NÚMERO ENVELHECE SOZINHO NA TELA
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar({ registro: REGISTRO_BOM(INICIO), consultar: async () => ({ estado: 'semMetodo' }) })
  await t.mostrador.ligar()
  checar('recém-lido, não há tique de idade marcado para agora — há um para quando ele ficar velho',
    t.mostrador.temTiqueDaIdade && t.vivos().some(x => x.ms === L.IDADE_VELHA_MS),
    t.vivos().map(x => x.ms).join(', '))
  await t.disparar(L.IDADE_VELHA_MS)
  checar('⛔ passados 10 minutos, a barra passa a dizer a idade sozinha',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 7% · 7d 65% · há 10 min',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  checar('e marca o próximo tique, na virada do minuto', t.mostrador.temTiqueDaIdade && t.vivos().some(x => x.ms === MIN),
    t.vivos().map(x => x.ms).join(', '))
  await t.disparar(MIN)
  checar('⛔ o tique sozinho sobe um minuto, sem nada chegar do agente',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h 7% · 7d 65% · há 11 min',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  // Uma hora depois: o número some, e o tique para.
  t.andar(50 * MIN)
  t.mostrador.publicar()
  checar('⛔ velho demais: a barra volta ao traço, em vez de passar por "agora" um número de uma hora atrás',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h – · 7d –',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  checar('⛔ e o tique para (o texto não muda mais, marcar seria acordar a barra à toa)',
    !t.mostrador.temTiqueDaIdade, t.vivos().map(x => x.ms).join(', '))
  t.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CONTA SEM LIMITE DE PLANO — o item some
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar({
    registro: REGISTRO_BOM(INICIO),
    consultar: async () => ({ estado: 'ok', resposta: { rate_limits_available: false, rate_limits: null } }),
  })
  await t.mostrador.ligar()
  checar('⛔ conta sem limite de plano ESCONDE o item, em vez de mostrar traço para sempre',
    t.editor.valorDe(M.CHAVE_DE_MOSTRAR) === false, String(t.editor.valorDe(M.CHAVE_DE_MOSTRAR)))
  checar('e o texto vai vazio junto (nada de número velho pendurado na chave)',
    t.editor.valorDe(M.CHAVE_DO_TEXTO) === '', JSON.stringify(t.editor.valorDe(M.CHAVE_DO_TEXTO)))
  t.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. O CLIQUE — só fala quando não pode consultar
// ─────────────────────────────────────────────────────────────────────────────
{
  const ditos = []
  let vezes = 0
  const t = montar({
    registro: REGISTRO_BOM(INICIO),
    consultar: async () => { vezes++; return { estado: 'ok', resposta: respostaDoAgente(12, 65) } },
    avisar: texto => ditos.push(texto),
  })
  await t.mostrador.ligar()
  checar('ligar não fala nada com a pessoa', ditos.length === 0, ditos.join(' | '))
  const r = await t.mostrador.consultarAgora({ porPedido: true })
  checar('⛔ o clique dentro da cota NÃO fura a cota (furar seria pedir para ser barrado por 5 min)',
    r === 'naCota' && vezes === 1, `${r}, ${vezes} leitura(s)`)
  checar('⛔ mas o clique DIZ quanto falta — senão pareceria que o clique não fez nada',
    ditos.length === 1 && /5 min/.test(ditos[0]) && /pode ser em/.test(ditos[0]), ditos[0])
  checar('e o que ele diz não é erro nem susto', !/erro|falh|proibid/i.test(ditos[0]), ditos[0])
  t.andar(5 * MIN)
  const r2 = await t.mostrador.consultarAgora({ porPedido: true })
  checar('passada a cota, o clique lê de verdade e não fala nada',
    r2 === 'ok' && vezes === 2 && ditos.length === 1, `${r2}, ${vezes}, ${ditos.length}`)
  t.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. DUAS LEITURAS AO MESMO TEMPO NÃO ACONTECEM
// ─────────────────────────────────────────────────────────────────────────────
{
  let emVoo = 0, maximo = 0
  let soltar = null
  const t = montar({
    registro: REGISTRO_BOM(INICIO),
    consultar: () => {
      emVoo++; maximo = Math.max(maximo, emVoo)
      return new Promise(r => { soltar = () => { emVoo--; r({ estado: 'ok', resposta: respostaDoAgente(9, 65) }) } })
    },
  })
  const primeira = t.mostrador.ligar()
  /*
    ⚠️ ESPERAR A PRIMEIRA LEITURA ESTAR EM VOO. `ligar` lê o registro do disco ANTES de consultar,
    e essa leitura é assíncrona: chamar a segunda consulta no mesmo instante a faria passar pela
    trava — não porque a trava falhou, mas porque a primeira ainda nem tinha começado. O teste
    ficaria pendurado para sempre, culpando o produto por um passo que ele não tinha dado.
  */
  for (let i = 0; i < 200 && emVoo === 0; i++) await new Promise(r => setTimeout(r, 5))
  const segunda = t.mostrador.consultarAgora()
  checar('⛔ duas leituras ao mesmo tempo não acontecem (gastariam a cota em dobro e podem chegar fora de ordem)',
    await segunda === 'jaLendo' && maximo === 1, `maximo em voo: ${maximo}`)
  soltar()
  await primeira
  t.mostrador.descartar()
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. O REGISTRO LOCAL ILEGÍVEL NÃO DERRUBA NADA
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar({
    registro: null,
    consultar: async () => ({ estado: 'semMetodo' }),
  })
  // Um leitor que LANÇA: arquivo meio escrito, enorme, sem permissão.
  const u = M.criarMostrador(t.editor.vscode, {
    agora: () => INICIO, marcar: () => null, desmarcar: () => { },
    lerRegistro: () => { throw new Error('arquivo ilegivel') },
    consultar: async () => ({ estado: 'semMetodo' }),
  })
  await u.ligar()
  checar('⛔ registro local ilegível não derruba a ativação — a barra fica com traço',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0] === '5h – · 7d –',
    t.editor.valorDe(M.CHAVE_DO_TEXTO).split('\n')[0])
  u.descartar()
  t.mostrador.descartar()

  /*
    ⛔ A LISTA DO QUE FOI PUBLICADO TEM TETO. Uma janela aberta por dias publica a cada 5 minutos
    para sempre; sem teto, essa lista é um vazamento de memória lento — do tipo que ninguém nota
    porque nada quebra, só vai ficando pesado.
  */
  {
    const editor = editorFalso()
    let agora = INICIO
    const mostrador = M.criarMostrador(editor.vscode, {
      agora: () => agora, marcar: () => null, desmarcar: () => { },
      lerRegistro: () => REGISTRO_BOM(agora), consultar: async () => ({ estado: 'semMetodo' }),
    })
    for (let i = 0; i < 300; i++) { agora += MIN; mostrador.publicar() }
    checar('⛔ a lista do que foi publicado não cresce sem fim (teto, com a última sempre lá)',
      mostrador.publicacoes.length <= 50 && mostrador.ultima !== null,
      `${mostrador.publicacoes.length} publicações guardadas depois de 300`)
    mostrador.descartar()
  }

  const caminhos = M.caminhosDoRegistro({ CLAUDE_CONFIG_DIR: '' }, '/casa/pessoa')
  checar('o registro local é procurado no arquivo medido, na pasta pessoal',
    caminhos.length === 1 && caminhos[0].replace(/\\/g, '/') === '/casa/pessoa/.claude.json', caminhos.join(' | '))
  const comConfig = M.caminhosDoRegistro({ CLAUDE_CONFIG_DIR: '/outro/lugar' }, '/casa/pessoa')
  checar('quem aponta a configuração para outro lugar é tentado ANTES, e a pasta pessoal continua de reserva',
    comConfig.length === 2 && comConfig[0].replace(/\\/g, '/') === '/outro/lugar/.claude.json', comConfig.join(' | '))
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou, total: resultados.length,
  falhas: resultados.filter(r => !r.ok).map(r => r.nome),
}))
process.exit(passou ? 0 : 1)
