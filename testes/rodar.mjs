// MOTOR DO PAINEL — os testes que provam a conversa sem abrir o editor.
//
// Por que este arquivo existe separado dos outros: todo teste da OFICINA que vale
// alguma coisa até hoje precisa ABRIR o programa (minutos por corrida, uma corrida por
// vez). O motor do painel não pode depender disso, senão a peça mais
// delicada do produto — a fila de permissões, o cancelamento, o estado de login —
// vira a menos testada, porque testá-la custa caro.
//
// `agente.js` foi escrito sem `require('vscode')` justamente para caber aqui. Se um dia
// alguém importar `vscode` lá dentro, este arquivo para de rodar — e isso é o alarme,
// não um inconveniente.
//
// ⚠️ O SDK aqui é um DUBLÊ, não o de verdade, em quase tudo. Não é economia: um teste
// que chama a API de verdade responde diferente a cada corrida, gasta a conta de quem
// roda e não consegue produzir os casos que interessam (o agente pedir permissão
// exatamente 2 vezes, a permissão chegar DEPOIS do cancelamento). O laço de integração
// com o SDK real é o `spike_v2_permissoes.mjs`, que já rodou 4 de 4.
//
// ⚠️ TODO NEGATIVO TEM CONTROLE POSITIVO. "o arquivo não nasceu", "o texto não
// apareceu" não provam nada sozinhos — a lição mais cara do V0.5, registrada no
// historico do projeto. Onde este arquivo afirma que algo NÃO aconteceu, o teste vizinho prova
// que o mesmo caminho, invertido, FAZ acontecer.
//
// Uso:  node testes/rodar.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const { Conversa, FilaDeMensagens, ESTADO, descreverPedido, estaSemLogin, ehRespostaSemLogin, caminhoParaMostrar } =
  requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
// V19 — o nome do método de uso do plano, da fonte única (ele se declara instável e vai mudar).
const { METODO_DE_USO: NOME_DO_USO } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'limite.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok, detalhe: detalhe ?? '' })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`)
}

const esperar = ms => new Promise(r => setTimeout(r, ms))

/** Espera uma condição virar verdade, com teto. Devolve se conseguiu. */
async function ate(condicao, tetoMs = 2000) {
  const fim = Date.now() + tetoMs
  while (Date.now() < fim) {
    if (condicao()) return true
    await esperar(10)
  }
  return condicao()
}

/**
 * O dublê do SDK.
 *
 * `roteiro` é uma função que recebe as ferramentas do agente (pedirPermissao, emitir)
 * e encena o que o agente faria. Assim cada teste desenha o cenário exato de que
 * precisa, inclusive os que a API real não produz sob encomenda.
 */
function sdkFalso(roteiro, usoDoPlano = null) {
  return () => Promise.resolve({
    query({ prompt, options }) {
      const saida = []          // mensagens a entregar ao consumidor
      let esperando = null
      let terminou = false

      const emitir = m => {
        if (esperando) { const r = esperando; esperando = null; r({ value: m, done: false }) }
        else saida.push(m)
      }
      const encerrar = () => {
        terminou = true
        if (esperando) { const r = esperando; esperando = null; r({ value: undefined, done: true }) }
      }

      const contexto = {
        emitir,
        encerrar,
        options,
        /** Encena o agente pedindo permissão — é o caminho que o painel precisa cobrir. */
        pedirPermissao: (nome, entrada, extra = {}) =>
          options.canUseTool(nome, entrada, {
            signal: options.abortController ? options.abortController.signal : new AbortController().signal,
            suggestions: extra.suggestions,
            title: extra.title,
            displayName: extra.displayName || nome,
            description: extra.description,
          }),
        /** As mensagens que o usuário mandou, para provar que a fila entrega. */
        recebidas: [],
      }

      // Consome o que o usuário digita, em paralelo.
      ;(async () => {
        if (prompt && typeof prompt[Symbol.asyncIterator] === 'function') {
          for await (const m of prompt) contexto.recebidas.push(m)
        }
      })()

      const consulta = {
        // ⚠️ `interrupt` EXISTE NO DUBLE desde 10/09/2026, e a ausencia dele era um
        // verde falso apontado pela revisao final: `cancelar()` so usa `interrupt` quando o
        // metodo existe, entao os tres criterios verdes de cancelamento estavam
        // exercitando o FALLBACK `abort()` — exatamente o comportamento que esta versao
        // consertou (abort encerra a sessao inteira; interrupt para o turno).
        // O conserto passou sem trava contra o retorno dele, e o placar verde sugeria o
        // contrario.
        async interrupt() {
          if (options && options.__semInterrupt) throw new Error('sem interrupt')
          contexto.interrompeu = (contexto.interrompeu || 0) + 1
          return undefined
        },
        async accountInfo() {
          if (options && options.__contaQuebrada) throw new Error('sem conta')
          return { email: 'pessoa@exemplo.com', organization: 'Casa', subscriptionType: 'Claude Max', apiProvider: 'firstParty' }
        },
        /*
          V19 — o metodo de uso do plano. ⚠️ ELE PRECISA PODER NAO EXISTIR NESTE DUBLE, e por isso
          e acrescentado DEPOIS (mais abaixo), sob bandeira: o metodo se declara experimental no
          proprio nome e o tipo avisa que o nome muda quando a interface estabilizar. Um duble que
          o tivesse sempre deixaria o caminho da ausencia — o unico que importa no dia em que ele
          sumir — sem nenhum teste, que foi o verde falso que o `interrupt` ja custou a esta casa.
        */
        [Symbol.asyncIterator]() {
          return {
            next: () => {
              if (saida.length) return Promise.resolve({ value: saida.shift(), done: false })
              if (terminou) return Promise.resolve({ value: undefined, done: true })
              return new Promise(r => { esperando = r })
            },
            return: () => { encerrar(); return Promise.resolve({ value: undefined, done: true }) },
          }
        },
      }

      // V19 — o método de uso do plano só existe quando o teste pede (ver a nota acima).
      if (usoDoPlano) {
        contexto.usoPedido = []
        consulta[NOME_DO_USO] = opcoes => {
          contexto.usoPedido.push(opcoes)
          return usoDoPlano(opcoes)
        }
      }

      // O aborto tem que chegar ao consumidor como exceção, igual ao SDK real
      // (medido no spike 2: "Operation aborted").
      if (options.abortController) {
        options.abortController.signal.addEventListener('abort', () => {
          const original = consulta[Symbol.asyncIterator]
          consulta[Symbol.asyncIterator] = () => ({
            next: () => Promise.reject(new Error('Operation aborted')),
            return: () => Promise.resolve({ value: undefined, done: true }),
          })
          void original
          if (esperando) { const r = esperando; esperando = null; r(Promise.reject(new Error('Operation aborted'))) }
        }, { once: true })
      }

      setTimeout(() => roteiro(contexto), 0)
      return consulta
    },
  })
}

/** Atalho: cria a conversa já ligada num dublê, coletando os eventos. */
async function conversaDeTeste(roteiro, extras = {}) {
  const eventos = []
  const c = new Conversa({
    cwd: REPO,
    id: 'teste',
    carregarSdk: sdkFalso(roteiro),
    aoEvento: e => eventos.push(e),
    ...extras,
  })
  await c.iniciar()
  return { c, eventos, dos: tipo => eventos.filter(e => e.tipo === tipo) }
}

/**
 * V19 — a mesma conversa, com o método de uso do plano PRESENTE no objeto de consulta.
 *
 * ⚠️ Fica separada do atalho de cima de propósito: a ausência do método é o caso que a barra de
 * cima precisa sobreviver, e ele só continua sendo testado enquanto o dublê padrão NÃO tiver o
 * método. Quem quiser o método, pede.
 */
async function conversaComUso(usoDoPlano, extras = {}) {
  const eventos = []
  let contexto = null
  const c = new Conversa({
    cwd: REPO,
    id: 'uso',
    carregarSdk: sdkFalso(ctx => { contexto = ctx }, usoDoPlano),
    aoEvento: e => eventos.push(e),
    ...extras,
  })
  await c.iniciar()
  await esperar(20)
  return {
    c, eventos,
    pedidos: () => (contexto && contexto.usoPedido) || [],
    recebidas: () => (contexto && contexto.recebidas) || [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A FILA — a peça que faz a conversa ser conversa, e não formulário
// ─────────────────────────────────────────────────────────────────────────────
{
  const fila = new FilaDeMensagens()
  const lidas = []
  const consumidor = (async () => { for await (const m of fila) lidas.push(m) })()

  fila.empurrar('um')
  await esperar(10)
  // O caso que importa: empurrar quando NINGUÉM está esperando, e depois quando
  // alguém está. Os dois caminhos existem no código e só um deles é o óbvio.
  fila.empurrar('dois')
  await esperar(10)
  fila.fechar()
  await consumidor

  checar('fila entrega na ordem, esperando ou não', lidas.join(',') === 'um,dois', lidas.join(','))

  const depois = new FilaDeMensagens()
  depois.fechar()
  checar('fila fechada recusa mensagem nova', depois.empurrar('tarde') === false)
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN — o dado que o painel mostra no canto
// ─────────────────────────────────────────────────────────────────────────────
{
  const { eventos } = await conversaDeTeste(ctx => { ctx.emitir({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus-5', tools: ['Read', 'Write'] }) })
  await ate(() => eventos.some(e => e.tipo === 'conta'))
  const conta = eventos.find(e => e.tipo === 'conta')
  checar('login: a conta de quem está usando chega ao painel', !!conta && conta.conta.email === 'pessoa@exemplo.com')
  checar('login: a assinatura vem junto', !!conta && conta.conta.assinatura === 'Claude Max', conta && conta.conta.assinatura)

  // ⚠️ Esperar pelo evento CERTO, não pelo vizinho. A primeira versão desta linha
  // procurava o `pronto` logo depois de a CONTA chegar — e falhava, porque no dublê a
  // conta resolve no mesmo tick e o `init` só é consumido no seguinte. O defeito era
  // do teste, não do motor: um teste que corre com o código produz vermelho falso
  // hoje e, pior, verde falso no dia em que a ordem mudar por outro motivo.
  await ate(() => eventos.some(e => e.tipo === 'pronto'))
  const pronto = eventos.find(e => e.tipo === 'pronto')
  checar('a sessão e o modelo chegam ao painel', !!pronto && pronto.sessao === 's1' && pronto.modelo === 'claude-opus-5',
    pronto ? `${pronto.sessao} / ${pronto.modelo}` : 'o evento pronto não chegou')
}
{
  // Controle: sem conta legível o painel não quebra — só fica sem o nome.
  const eventos = []
  const c = new Conversa({
    cwd: REPO, id: 'teste', aoEvento: e => eventos.push(e),
    carregarSdk: () => Promise.resolve({
      query: () => ({
        accountInfo: () => Promise.reject(new Error('sem conta')),
        [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => { }), return: () => Promise.resolve({ done: true }) }),
      }),
    }),
  })
  await c.iniciar()
  await ate(() => eventos.some(e => e.tipo === 'aviso'))
  checar('login: conta ilegível vira aviso, não erro que derruba', eventos.some(e => e.tipo === 'aviso') && !eventos.some(e => e.tipo === 'erro'))
  checar('login: mesmo sem conta, a conversa fica utilizável', c.estado === ESTADO.OCIOSA, c.estado)
}

// ─────────────────────────────────────────────────────────────────────────────
// SEM LOGIN (V8) — o primeiro uso numa máquina onde ninguém entrou na conta
// ─────────────────────────────────────────────────────────────────────────────
// As contas abaixo são as MEDIDAS no SDK 0.3.261 (12/09/2026, pasta de configuração vazia), não
// inventadas: a primeira sem nada, a segunda com `ANTHROPIC_API_KEY` no ambiente.
{
  checar('V8 sem login: conta sem token, sem chave e sem e-mail é "sem login"',
    estaSemLogin({ tokenSource: 'none', apiProvider: 'firstParty' }) === true)
  // Controles: cada um tira UM motivo, e nenhum pode acusar.
  checar('V8 sem login: quem usa chave de API NÃO é acusado (medido: tokenSource também vem "none")',
    estaSemLogin({ tokenSource: 'none', apiKeySource: 'ANTHROPIC_API_KEY', apiProvider: 'firstParty' }) === false)
  checar('V8 sem login: conta com e-mail não é acusada',
    estaSemLogin({ tokenSource: 'none', email: 'pessoa@exemplo.com' }) === false)
  checar('V8 sem login: conta ilegível não é acusada', estaSemLogin(undefined) === false && estaSemLogin(null) === false)
  checar('V8 sem login: provedor que não é o da Anthropic não é acusado',
    estaSemLogin({ tokenSource: 'none', apiProvider: 'bedrock' }) === false)
  checar('V8 sem login: a resposta medida do CLI é reconhecida, e outra não',
    ehRespostaSemLogin('Not logged in · Please run /login') && !ehRespostaSemLogin('Rate limited'))
  // As outras frases da conta que o binário embutido traz (lidas nele em 16/09/2026) também valem.
  checar('V8 sem login: as variantes da conta do Claude no binário são reconhecidas',
    ehRespostaSemLogin('Not logged in · Run /login') && ehRespostaSemLogin('Not logged in. Run claude auth login to authenticate.'))
  checar('⛔ V8 sem login: "not logged in" do GitHub CLI no meio do texto NÃO vira aviso da conta',
    !ehRespostaSemLogin('O comando falhou: `not logged in` — `gh auth status` failed to run') &&
    !ehRespostaSemLogin('Rodei o deploy, mas o gh respondeu: not logged in to github.com'))
  checar('V8 sem login: palavra que só começa igual não conta', !ehRespostaSemLogin('Not logged insane'))

  const conversaComConta = async conta => {
    const eventos = []
    const c = new Conversa({
      cwd: REPO, id: 'teste', aoEvento: e => eventos.push(e),
      carregarSdk: () => Promise.resolve({
        query: ({ options }) => ({
          accountInfo: () => Promise.resolve(conta),
          initializationResult: () => Promise.resolve({ account: conta, models: [] }),
          // Como o SDK real: o `abort` do `encerrar()` termina o laço. Sem isso o teste espera para sempre.
          [Symbol.asyncIterator]: () => ({
            next: () => new Promise(r => options.abortController.signal.addEventListener('abort', () => r({ value: undefined, done: true }))),
            return: () => Promise.resolve({ value: undefined, done: true }),
          }),
        }),
      }),
    })
    await c.iniciar()
    await ate(() => eventos.some(e => e.tipo === 'pronto'))
    await esperar(20)
    return { c, eventos }
  }

  const sem = await conversaComConta({ tokenSource: 'none', apiProvider: 'firstParty' })
  checar('V8 sem login: o aviso chega ANTES de a pessoa escrever', sem.eventos.filter(e => e.tipo === 'semLogin').length === 1)
  checar('V8 sem login: o aviso vem DEPOIS do "pronto" (a abertura não pode apagá-lo)',
    sem.eventos.findIndex(e => e.tipo === 'semLogin') > sem.eventos.findIndex(e => e.tipo === 'pronto'))
  // O turno medido: `success` + `is_error` + o texto do CLI.
  sem.c._traduzir({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login', terminal_reason: 'api_error', total_cost_usd: 0 })
  const fimSem = sem.eventos.filter(e => e.tipo === 'fim').pop()
  checar('V8 sem login: o turno sem login NÃO vira "terminou com um erro (success)"', !!fimSem && fimSem.erro === null, fimSem && fimSem.erro)
  // ⚠️ Revisão de código (16/09/2026): o cartão da abertura some (o botão o tira, a tela recarregada nasce
  // sem ele). O turno sem login precisa avisar DE NOVO, senão a pessoa fica com uma fala sem resposta nenhuma.
  checar('⛔ V8 sem login: o turno sem login avisa de novo (o cartão da abertura pode ter sumido)', sem.eventos.filter(e => e.tipo === 'semLogin').length === 2)
  checar('V8 sem login: a conversa guarda que está sem login (o host redesenha na tela recarregada)', sem.c.semLogin === true)
  sem.c._prepararAntesDaPrimeiraMensagem && await sem.c._prepararAntesDaPrimeiraMensagem()
  checar('V8 sem login (controle): a abertura não repete o aviso que já deu', sem.eventos.filter(e => e.tipo === 'semLogin').length === 2)
  // ⚠️ Revisão independente (16/09/2026): a marca nunca voltava a falso. A pessoa entra na conta por fora e
  // aperta "Tentar de novo" (mesma conversa); os turnos andam, e a tela recarregada mostrava o cartão de novo.
  sem.c._traduzir({ type: 'result', subtype: 'success', is_error: false, result: 'Pronto.', total_cost_usd: 0.01 })
  checar('⛔ V8 sem login: um turno respondido de verdade tira a marca de sem login', sem.c.semLogin === false)
  sem.c._traduzir({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'outra falha', total_cost_usd: 0 })
  checar('V8 sem login (controle): um turno com erro de outro tipo não recoloca a marca', sem.c.semLogin === false)
  await sem.c.encerrar()

  const com = await conversaComConta({ tokenSource: 'claude.ai', email: 'pessoa@exemplo.com', apiProvider: 'firstParty' })
  checar('V8 sem login (controle): quem está logado não recebe o aviso', !com.eventos.some(e => e.tipo === 'semLogin'))
  com.c._traduzir({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'outra coisa', total_cost_usd: 0 })
  const fimCom = com.eventos.filter(e => e.tipo === 'fim').pop()
  checar('V8 sem login (controle): erro de outro tipo continua sendo erro', !!fimCom && fimCom.erro === 'error_during_execution', fimCom && fimCom.erro)
  await com.c.encerrar()
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING — a resposta aparece enquanto é gerada
// ─────────────────────────────────────────────────────────────────────────────
{
  const { eventos, dos } = await conversaDeTeste(ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
    for (const t of ['Oi', ', ', 'mundo']) {
      ctx.emitir({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } })
    }
    ctx.emitir({ type: 'result', total_cost_usd: 0.0123, duration_ms: 900 })
  })
  await ate(() => eventos.some(e => e.tipo === 'fim'))
  checar('streaming: o texto chega em pedaços', dos('texto').length === 3, dos('texto').map(e => e.texto).join(''))
  checar('streaming: os pedaços montam a frase', dos('texto').map(e => e.texto).join('') === 'Oi, mundo')
  const fim = eventos.find(e => e.tipo === 'fim')
  checar('o custo da conversa chega ao painel', fim && fim.custoUsd === 0.0123, fim && String(fim.custoUsd))
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSÃO — o coração da V2: nada escreve sem a pessoa deixar
// ─────────────────────────────────────────────────────────────────────────────
{
  let decisao = null
  const { c, eventos, dos } = await conversaDeTeste(async ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
    decisao = await ctx.pedirPermissao('Write', { file_path: 'D:/x/relatorio.md', content: 'oi' })
  })

  await ate(() => dos('permissao').length === 1)
  const pedido = dos('permissao')[0] && dos('permissao')[0].pedido
  checar('permissão: o pedido chega ao painel', !!pedido, pedido && pedido.ferramenta)
  checar('permissão: a frase é em português e nomeia o arquivo',
    !!pedido && pedido.frase === 'Escrever o arquivo relatorio.md', pedido && pedido.frase)
  checar('permissão: a conversa fica esperando a pessoa', c.estado === ESTADO.ESPERANDO_PERMISSAO, c.estado)

  // ⚠️ O NEGATIVO QUE IMPORTA: enquanto ninguém responde, o agente NÃO anda.
  await esperar(120)
  checar('permissão: sem resposta, o agente não age (fica pendurado de propósito)', decisao === null)

  c.responderPermissao(pedido.id, 'negar')
  await ate(() => decisao !== null)
  checar('permissão: negar devolve deny ao agente', decisao && decisao.behavior === 'deny', decisao && decisao.behavior)
}
{
  // CONTROLE POSITIVO do caso acima: o MESMO caminho, com "permitir", passa.
  let decisao = null
  const { c, dos } = await conversaDeTeste(async ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
    decisao = await ctx.pedirPermissao('Write', { file_path: 'D:/x/relatorio.md', content: 'oi' })
  })
  await ate(() => dos('permissao').length === 1)
  c.responderPermissao(dos('permissao')[0].pedido.id, 'permitir')
  await ate(() => decisao !== null)
  checar('CONTROLE POSITIVO — permitir devolve allow (logo o deny acima significa algo)',
    decisao && decisao.behavior === 'allow', decisao && decisao.behavior)
  checar('permitir devolve a entrada que o agente pediu',
    decisao && decisao.updatedInput && decisao.updatedInput.file_path === 'D:/x/relatorio.md')
}
{
  // "Sempre permitir" só manda regra quando o SDK sugeriu uma. Inventar a regra do
  // nosso lado seria escrever no settings da pessoa uma permissão que ela não deu.
  let comSugestao = null, semSugestao = null
  {
    const { c, dos } = await conversaDeTeste(async ctx => {
      ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
      comSugestao = await ctx.pedirPermissao('Read', { file_path: 'a.txt' }, { suggestions: [{ type: 'addRules', rules: [{ toolName: 'Read' }] }] })
    })
    await ate(() => dos('permissao').length === 1)
    c.responderPermissao(dos('permissao')[0].pedido.id, 'permitir_sempre')
    await ate(() => comSugestao !== null)
  }
  {
    const { c, dos } = await conversaDeTeste(async ctx => {
      ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
      semSugestao = await ctx.pedirPermissao('Read', { file_path: 'a.txt' })
    })
    await ate(() => dos('permissao').length === 1)
    c.responderPermissao(dos('permissao')[0].pedido.id, 'permitir_sempre')
    await ate(() => semSugestao !== null)
  }
  checar('sempre permitir: com sugestão do SDK, a regra viaja',
    comSugestao && Array.isArray(comSugestao.updatedPermissions) && comSugestao.updatedPermissions.length === 1)
  checar('sempre permitir: SEM sugestão, nenhuma regra é inventada',
    semSugestao && semSugestao.behavior === 'allow' && semSugestao.updatedPermissions === undefined)
}
{
  // ⚠️ MEDIDO NO SDK REAL (10/09/2026, noite, um pedido ao agente, tudo negado): num `Write`
  // a sugestão é `{type:'setMode', mode:'acceptEdits', destination:'session'}`; num `Bash`,
  // `{type:'addRules', …, destination:'localSettings'}` + um `addDirectories` de sessão.
  // Repassadas cruas, "Sempre permitir" trocava o modo POR FORA do seletor (a tela seguia em
  // "pergunta sempre" e o próximo arquivo nascia sem cartão — visto pela revisão funcional)
  // e gravava a regra em DISCO, quando a tela promete "nesta conversa".
  const init = ctx => ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
  const SETMODE = [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]
  const REGRA_EM_DISCO = [
    { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'echo oi *' }], behavior: 'allow', destination: 'localSettings' },
    { type: 'addDirectories', directories: ['C:/tmp/x'], destination: 'session' },
  ]

  let rEdit = null
  const trocas = []
  const edit = await conversaDeTeste(async ctx => {
    init(ctx)
    rEdit = await ctx.pedirPermissao('Write', { file_path: 'a.txt', content: 'x' }, { suggestions: SETMODE })
  })
  edit.c._consulta.setPermissionMode = async m => { trocas.push(m) }
  await ate(() => edit.dos('permissao').length === 1)
  const pedidoEdit = edit.dos('permissao')[0].pedido
  checar('sempre permitir: com setMode sugerido, o pedido diz a tela que "sempre" e possivel', pedidoEdit.podeSempre === true,
    String(pedidoEdit.podeSempre))
  edit.c.responderPermissao(pedidoEdit.id, 'permitir_sempre')
  await ate(() => rEdit !== null)
  await ate(() => edit.dos('modo').length > 0)
  const modoEv = edit.dos('modo').pop()
  checar('⛔ sempre permitir num Write: a troca de modo passa pelo seletor (a tela e avisada)',
    !!modoEv && modoEv.modo === 'acceptEdits' && modoEv.ok === true && trocas.includes('acceptEdits'),
    `${JSON.stringify(modoEv)}; SDK recebeu ${trocas.join(',') || 'nada'}`)
  checar('sempre permitir num Write: o setMode NAO vai cru para o SDK',
    !!rEdit && !((rEdit.updatedPermissions || []).some(u => u.type === 'setMode')), JSON.stringify(rEdit))
  checar('CONTROLE POSITIVO: o Write do "sempre permitir" e permitido', !!rEdit && rEdit.behavior === 'allow', JSON.stringify(rEdit))

  let rBash = null
  const bash = await conversaDeTeste(async ctx => {
    init(ctx)
    rBash = await ctx.pedirPermissao('Bash', { command: 'echo oi' }, { suggestions: REGRA_EM_DISCO })
  })
  await ate(() => bash.dos('permissao').length === 1)
  bash.c.responderPermissao(bash.dos('permissao')[0].pedido.id, 'permitir_sempre')
  await ate(() => rBash !== null)
  const destinos = ((rBash && rBash.updatedPermissions) || []).map(u => u.destination)
  checar('⛔ sempre permitir num Bash: nenhuma regra vai para o disco (tudo vale so nesta conversa)',
    destinos.length === 2 && destinos.every(d => d === 'session'), JSON.stringify(destinos))

  // Sem sugestão nenhuma, "sempre" não tem o que lembrar — a tela não pode oferecer.
  let rNada = null
  const nada = await conversaDeTeste(async ctx => {
    init(ctx)
    rNada = await ctx.pedirPermissao('Read', { file_path: 'a.txt' })
  })
  await ate(() => nada.dos('permissao').length === 1)
  const pedidoNada = nada.dos('permissao')[0].pedido
  checar('sem sugestao do SDK: o pedido diz a tela que "sempre" NAO e possivel', pedidoNada.podeSempre === false,
    String(pedidoNada.podeSempre))
  nada.c.responderPermissao(pedidoNada.id, 'negar')
  await ate(() => rNada !== null)
  await edit.c.encerrar(); await bash.c.encerrar(); await nada.c.encerrar()
}
{
  // Duas permissões ao mesmo tempo: a fila responde a pedida, não a última.
  const decisoes = {}
  const { c, dos } = await conversaDeTeste(async ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
    ctx.pedirPermissao('Read', { file_path: 'a.txt' }).then(d => { decisoes.a = d })
    ctx.pedirPermissao('Bash', { command: 'dir' }).then(d => { decisoes.b = d })
  })
  await ate(() => dos('permissao').length === 2)
  const [p1, p2] = dos('permissao').map(e => e.pedido)
  c.responderPermissao(p2.id, 'negar')
  await ate(() => decisoes.b !== undefined)
  checar('fila: responder o segundo pedido não mexe no primeiro',
    decisoes.b && decisoes.b.behavior === 'deny' && decisoes.a === undefined)
  c.responderPermissao(p1.id, 'permitir')
  await ate(() => decisoes.a !== undefined)
  checar('fila: o primeiro continua respondível depois', decisoes.a && decisoes.a.behavior === 'allow')
  checar('fila: id que não existe devolve false (clique duplo não quebra)',
    c.responderPermissao(p1.id, 'permitir') === false)
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCELAMENTO — e o que ele faz com uma permissão na tela
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c, eventos, dos } = await conversaDeTeste(ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
    ctx.emitir({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'pensando...' } } })
  })
  await ate(() => dos('texto').length === 1)
  c.enviar('faz aí')
  const cancelou = c.cancelar()
  checar('cancelar: responde na hora, sem esperar o SDK', cancelou === true)
  // ⚠️ Este é o critério que veio de uma MEDIÇÃO: no spike 2 o SDK levou ~7 s entre
  // o abort() e o laço parar. Se o estado só mudasse no fim, o botão ficaria mudo
  // sete segundos e a pessoa apertaria de novo.
  checar('cancelar: o estado vira CANCELANDO imediatamente',
    c.estado === ESTADO.CANCELANDO || c.estado === ESTADO.PARADA, c.estado)
  await ate(() => eventos.some(e => e.tipo === 'cancelado'), 3000)
  checar('cancelar: o aborto vira "cancelado", não "erro"',
    eventos.some(e => e.tipo === 'cancelado') && !eventos.some(e => e.tipo === 'erro'))
}
{
  // O caso feio: cancelar COM uma permissão aberta na tela. Sem tratamento, o agente
  // ficaria preso numa Promise que ninguém mais vai resolver.
  let decisao = null
  const { c, dos } = await conversaDeTeste(async ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
    decisao = await ctx.pedirPermissao('Bash', { command: 'formatar tudo' })
  })
  await ate(() => dos('permissao').length === 1)
  c.cancelar()
  await ate(() => decisao !== null, 3000)
  checar('cancelar com permissão aberta: o pedido é resolvido (ninguém fica pendurado)',
    decisao !== null && decisao.behavior === 'deny', decisao && decisao.behavior)
  checar('cancelar com permissão aberta: o painel é avisado de retirar o pedido',
    dos('permissao_retirada').length === 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// PARAR — o turno morre, a CONVERSA VIVE
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ Estes criterios nasceram de um verde falso. O pior defeito desta versao era o
// botao "Parar" encerrar a SESSAO (abort) em vez do turno (interrupt): depois de parar,
// a pessoa digitava e a mensagem sumia no vacuo. O conserto entrou sem teste, e os
// verdes de cancelamento exercitavam o caminho antigo porque o duble nao tinha
// `interrupt`. Achado pela revisao final, 10/09/2026.
{
  let ctx = null
  const eventos = []
  const c = new Conversa({
    cwd: REPO, aoEvento: e => eventos.push(e),
    carregarSdk: sdkFalso(x => { ctx = x; x.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] }) }),
  })
  await c.iniciar()
  await ate(() => !!ctx)
  c.enviar('faz aí')
  c.cancelar()
  await ate(() => (ctx.interrompeu || 0) > 0, 3000)

  checar('parar: usa interrupt (o turno), NAO abort (a sessao)', (ctx.interrompeu || 0) === 1,
    `interrupt chamado ${ctx.interrompeu || 0}x`)

  // ⚠️ O CRITERIO QUE IMPORTA: depois de parar, a conversa continua UTILIZAVEL.
  await ate(() => c.estado === ESTADO.OCIOSA, 3000)
  checar('parar: a conversa continua viva (nao vira PARADA)', c.estado === ESTADO.OCIOSA, c.estado)
  checar('parar: da para enviar DEPOIS de parar', c.enviar('mais uma') === true)
}
{
  // Controle: SEM `interrupt` no SDK, o motor cai no abort — e isso tem que continuar
  // funcionando (nao pode explodir), so nao e mais o caminho normal.
  let ctx = null
  const eventos = []
  const c = new Conversa({
    cwd: REPO, aoEvento: e => eventos.push(e),
    carregarSdk: () => Promise.resolve({
      query: (opcoes) => {
        const controle = opcoes.options.abortController
        return {
          accountInfo: async () => ({ email: 'a@b.c' }),
          [Symbol.asyncIterator]: () => ({
            next: () => new Promise((_, rj) => {
              controle.signal.addEventListener('abort', () => rj(new Error('Operation aborted')), { once: true })
            }),
            return: () => Promise.resolve({ done: true }),
          }),
        }
      },
    }),
  })
  await c.iniciar()
  // ⚠️ Com trabalho EM CURSO: desde 10/09/2026, noite, "Parar" com a conversa ociosa não faz
  // nada (não havia o que parar, e ele escrevia "Você parou." mesmo assim). O que este
  // critério prova — o `abort` quando o SDK não tem `interrupt` — só existe com algo rodando.
  c.enviar('oi')
  c.cancelar()
  await ate(() => eventos.some(e => e.tipo === 'cancelado'), 3000)
  checar('parar: sem interrupt no SDK, o abort ainda funciona (nao explode)',
    eventos.some(e => e.tipo === 'cancelado') && !eventos.some(e => e.tipo === 'erro'))
}

// ─────────────────────────────────────────────────────────────────────────────
// ENVIAR — o que a conversa aceita e o que recusa
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c } = await conversaDeTeste(ctx => ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] }))
  checar('enviar: texto vazio é recusado', c.enviar('   ') === false)
  checar('enviar: texto de verdade é aceito', c.enviar('oi') === true)
  await c.encerrar()
  checar('enviar: depois de encerrada, recusa', c.enviar('oi') === false, c.estado)
}

// ─────────────────────────────────────────────────────────────────────────────
// MODO DE PERMISSÃO — o que a pessoa escolhe, e o que ela NÃO consegue escolher
// ─────────────────────────────────────────────────────────────────────────────
{
  const pedidos = []
  const { c, eventos } = await conversaDeTeste(ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
  })
  // O dublê não implementa setPermissionMode; isso é de propósito no primeiro caso.
  checar('modo: o padrao entregue e "pergunta sempre"', c.modo === 'default', c.modo)
  checar('modo: um valor inventado e recusado', await c.trocarModo('modoQueNaoExiste') === false)
  checar('modo: valor inventado nao muda o que esta valendo', c.modo === 'default', c.modo)
  void pedidos; void eventos
}
{
  // Agora com o SDK respondendo à troca — o caminho que o produto usa.
  const trocas = []
  const eventos = []
  const c = new Conversa({
    cwd: REPO, aoEvento: e => eventos.push(e),
    carregarSdk: () => Promise.resolve({
      query: () => ({
        setPermissionMode: async m => { trocas.push(m) },
        accountInfo: async () => ({ email: 'a@b.c' }),
        [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => { }), return: () => Promise.resolve({ done: true }) }),
      }),
    }),
  })
  await c.iniciar()
  const ok = await c.trocarModo('acceptEdits')
  checar('modo: a troca chega ao SDK', ok === true && trocas[0] === 'acceptEdits', trocas.join(','))
  checar('modo: o painel e avisado da troca', eventos.some(e => e.tipo === 'modo' && e.modo === 'acceptEdits'))
  // ⚠️ MUDOU EM 10/09/2026, noite. Este critério dizia "bypassPermissions é escolhível" —
  // e era verde só aqui, contra um dublê que aceita qualquer modo. O SDK de verdade
  // RECUSA esse modo sem `allowDangerouslySkipPermissions`, e dentro do editor a troca
  // falhava sempre. Agora ele só existe com a configuração ligada, e sem ela a recusa
  // acontece no motor, SEM chegar ao SDK.
  const antes = trocas.length
  checar('modo: sem a configuracao, bypassPermissions e recusado',
    await c.trocarModo('bypassPermissions') === false && c.modo === 'acceptEdits', c.modo)
  checar('modo: a recusa acontece no motor, sem pedir ao SDK', trocas.length === antes, trocas.join(','))
}
{
  // CONTROLE POSITIVO: com a configuração ligada, o `query` nasce com a chave que o SDK
  // exige, e a troca chega a ele. Sem este bloco, "é recusado" passaria com um motor que
  // recusa sempre.
  const trocas = []
  let opcoesRecebidas = null
  const semChave = { v: null }
  const montar = permitir => new Conversa({
    cwd: REPO, aoEvento: () => { }, permitirPularAprovacao: permitir,
    carregarSdk: () => Promise.resolve({
      query: ({ options }) => {
        if (permitir) opcoesRecebidas = options; else semChave.v = options
        return {
          setPermissionMode: async m => { trocas.push(m) },
          accountInfo: async () => ({ email: 'a@b.c' }),
          [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => { }), return: () => Promise.resolve({ done: true }) }),
        }
      },
    }),
  })
  const liberada = montar(true)
  await liberada.iniciar()
  checar('modo: com a configuracao, o query recebe allowDangerouslySkipPermissions',
    !!opcoesRecebidas && opcoesRecebidas.allowDangerouslySkipPermissions === true)
  checar('modo: com a configuracao, bypassPermissions chega ao SDK',
    await liberada.trocarModo('bypassPermissions') === true && trocas.includes('bypassPermissions'), trocas.join(','))
  const presa = montar(false)
  await presa.iniciar()
  checar('modo: sem a configuracao, o query NAO recebe a chave',
    !!semChave.v && !('allowDangerouslySkipPermissions' in semChave.v))
}

// ─────────────────────────────────────────────────────────────────────────────
// ERRO — carregar o SDK pode falhar, e isso não pode derrubar o editor
// ─────────────────────────────────────────────────────────────────────────────
{
  const eventos = []
  const c = new Conversa({
    cwd: REPO, aoEvento: e => eventos.push(e),
    carregarSdk: () => Promise.reject(new Error('pacote não instalado')),
  })
  await c.iniciar()
  checar('SDK ausente: vira erro no painel, não exceção solta', eventos.some(e => e.tipo === 'erro'))
  checar('SDK ausente: a mensagem diz o que houve',
    eventos.some(e => e.tipo === 'erro' && /pacote não instalado/.test(e.mensagem)))
  checar('SDK ausente: o estado fica ERRO', c.estado === ESTADO.ERRO, c.estado)
}

// ─────────────────────────────────────────────────────────────────────────────
// AS FRASES DOS PEDIDOS — o que a pessoa lê antes de decidir
// ─────────────────────────────────────────────────────────────────────────────
{
  checar('frase: Bash mostra o comando', /Rodar um comando: dir/.test(descreverPedido('Bash', { command: 'dir' }, {})))
  checar('frase: Edit nomeia o arquivo', descreverPedido('Edit', { file_path: 'a/b/c.txt' }, {}) === 'Alterar o arquivo c.txt')
  checar('frase: ferramenta desconhecida não vira frase quebrada',
    descreverPedido('CoisaNova', {}, {}) === 'Usar CoisaNova')
  // ⚠️ Medido no spike 2: `title` veio NULL num Write real. Quando ele existe, manda.
  checar('frase: o title do SDK tem preferência quando existe',
    descreverPedido('Write', {}, { title: 'Claude quer escrever foo.txt' }) === 'Claude quer escrever foo.txt')
}

// ─────────────────────────────────────────────────────────────────────────────
// CORRIDA — encerrar ENQUANTO a conversa abre não pode deixar sessão órfã
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Revisão de código (10/09/2026, noite), medido: `iniciar` esperava o SDK carregar e, se
// `encerrar` rodasse nessa janela (fechar a aba, "Nova conversa"), criava a sessão DEPOIS —
// viva, sem dono, e o motor terminava dizendo "ociosa". O primeiro import do SDK é o frio.
{
  const lentoCom = cont => () => esperar(150).then(() => sdkFalso(() => { })())
    .then(sdk => ({ query: (...a) => { cont.n++; return sdk.query(...a) } }))

  const cA = { n: 0 }
  const c = new Conversa({ cwd: REPO, aoEvento: () => { }, carregarSdk: lentoCom(cA) })
  const abrindo = c.iniciar()
  await esperar(20)
  await c.encerrar()
  await abrindo
  checar('⛔ encerrar durante a abertura: nenhuma sessao nasce depois', cA.n === 0, `${cA.n} sessao(oes)`)
  checar('encerrar durante a abertura: o motor fica PARADA, nao ociosa', c.estado === ESTADO.PARADA, c.estado)

  // CONTROLE POSITIVO: a mesma abertura lenta, sem encerrar, cria a sessão.
  const cB = { n: 0 }
  const d = new Conversa({ cwd: REPO, aoEvento: () => { }, carregarSdk: lentoCom(cB) })
  await d.iniciar()
  checar('CONTROLE POSITIVO: a abertura lenta, sem encerrar, cria a sessao', cB.n === 1 && d.estado === ESTADO.OCIOSA, `${cB.n}; ${d.estado}`)

  // A porta de recuperação continua de pé: depois do encerrar, "tentar de novo" abre.
  await c.iniciar()
  checar('depois de encerrar na abertura, tentar de novo ainda abre', c.estado === ESTADO.OCIOSA && cA.n === 1, `${c.estado}; ${cA.n}`)
  await c.encerrar(); await d.encerrar()
}

// ─────────────────────────────────────────────────────────────────────────────
// PARAR SEM NADA RODANDO — não faz nada, e não mata a porta de recuperação
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Revisão de código (10/09/2026, noite), medido: depois de um erro, "Parar" pela paleta
// tirava a conversa de ERRO; o "Tentar de novo" deixava de abrir, e a mensagem seguinte era
// aceita e sumia com a tela em "pensando" para sempre. Com a conversa ociosa, o mesmo "Parar"
// escrevia "Você parou." sem nada ter sido parado.
{
  const { c, dos } = await conversaDeTeste(() => { })
  const antes = dos('cancelado').length
  checar('parar com a conversa OCIOSA nao faz nada', c.cancelar() === false && c.estado === ESTADO.OCIOSA, c.estado)
  await esperar(30)
  checar('parar ociosa: ninguem escreve "voce parou"', dos('cancelado').length === antes)

  c._mudarEstado(ESTADO.ERRO)
  checar('⛔ parar em ERRO nao muda o estado (a porta "tentar de novo" continua viva)',
    c.cancelar() === false && c.estado === ESTADO.ERRO, c.estado)
  await c.iniciar()
  checar('depois de parar em erro, tentar de novo abre', c.estado === ESTADO.OCIOSA, c.estado)

  // CONTROLE POSITIVO: com trabalho em curso, parar vale.
  c.enviar('oi')
  const pensando = c.estado === ESTADO.PENSANDO
  checar('CONTROLE POSITIVO: pensando, parar vale', pensando && c.cancelar() === true, `${pensando}; ${c.estado}`)
  await c.encerrar()
}

// ─────────────────────────────────────────────────────────────────────────────
// PARAR NÃO É ERRO — o `result` que o SDK manda depois de um interrupt
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ MEDIDO NO SDK REAL (revisão final, 11/09/2026): depois de um `interrupt()` o turno termina
// com `{subtype:'error_during_execution', is_error:true, terminal_reason:'aborted_streaming'}`.
// Quando a tela passou a avisar turno com erro, todo "Parar" virou "deu um erro no meio do
// trabalho" — um conserto meu criando a tela que mente, no botão mais usado do painel.
{
  const init = ctx => ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
  let ctxP = null
  const p = await conversaDeTeste(async ctx => {
    ctxP = ctx
    init(ctx)
    ctx.emitir({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'um texto longo' } } })
  })
  p.c.enviar('escreva muito')
  await ate(() => p.dos('texto').length > 0)
  p.c.cancelar()
  await ate(() => p.dos('cancelado').length > 0)
  ctxP.emitir({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'aborted_streaming', total_cost_usd: 0.001 })
  await ate(() => p.dos('fim').length > 0)
  const fimP = p.dos('fim').pop()
  checar('⛔ parar: o fim do turno interrompido NAO vira erro na tela', !!fimP && fimP.erro === null, JSON.stringify(fimP))

  // CONTROLE POSITIVO: um turno que termina com erro de verdade continua avisando.
  let ctxE = null
  const e = await conversaDeTeste(async ctx => { ctxE = ctx; init(ctx) })
  e.c.enviar('faça algo')
  await ate(() => ctxE !== null)   // o roteiro roda no próximo giro, não na hora
  ctxE.emitir({ type: 'result', subtype: 'error_max_turns', is_error: true, total_cost_usd: 0.001 })
  await ate(() => e.dos('fim').length > 0)
  const fimE = e.dos('fim').pop()
  checar('CONTROLE POSITIVO: erro de verdade (limite de passos) continua avisando', !!fimE && fimE.erro === 'error_max_turns', JSON.stringify(fimE))

  // Modo sugerido que o seletor não oferece (`dontAsk`, `auto` — existem no tipo do SDK) não
  // pode acender o "Sempre permitir": o `trocarModo` o recusaria, e o botão prometeria à toa.
  let r = null
  const s = await conversaDeTeste(async ctx => {
    init(ctx)
    r = await ctx.pedirPermissao('Write', { file_path: 'a.txt', content: 'x' }, { suggestions: [{ type: 'setMode', mode: 'dontAsk', destination: 'session' }] })
  })
  await ate(() => s.dos('permissao').length === 1)
  const pedidoS = s.dos('permissao')[0].pedido
  checar('sempre permitir: modo sugerido que o seletor nao oferece nao acende o botao', pedidoS.podeSempre === false, String(pedidoS.podeSempre))
  s.c.responderPermissao(pedidoS.id, 'negar')
  await ate(() => r !== null)
  await p.c.encerrar(); await e.c.encerrar(); await s.c.encerrar()
}

// ── Os dois sinais do Parar, UM DE CADA VEZ, e o turno novo depois de um Parar ──
// Revisão final (11/09/2026): o critério acima injeta os dois sinais juntos — tirar qualquer
// metade do conserto deixava tudo verde. E escrever durante "Parando…" deixava a conversa em
// OCIOSA com o turno novo rodando (medido no motor).
{
  const init = ctx => ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
  const texto = ctx => ctx.emitir({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'texto' } } })

  // Só a marca do `cancelar` — o `result` vem SEM `terminal_reason`.
  let cF = null
  const f = await conversaDeTeste(async ctx => { cF = ctx; init(ctx); texto(ctx) })
  f.c.enviar('x'); await ate(() => f.dos('texto').length > 0)
  f.c.cancelar(); await ate(() => f.dos('cancelado').length > 0)
  cF.emitir({ type: 'result', subtype: 'error_during_execution', is_error: true, total_cost_usd: 0.001 })
  await ate(() => f.dos('fim').length > 0)
  const fimF = f.dos('fim').pop()
  checar('parar: so a marca do cancelar (sem terminal_reason) ja tira o erro', !!fimF && fimF.erro === null, JSON.stringify(fimF))

  // Só o `terminal_reason` — sem o `cancelar` daqui (o motivo que o SDK dá basta).
  let cT = null
  const t = await conversaDeTeste(async ctx => { cT = ctx; init(ctx) })
  t.c.enviar('y'); await ate(() => cT !== null)
  cT.emitir({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'aborted_tools', total_cost_usd: 0.001 })
  await ate(() => t.dos('fim').length > 0)
  const fimT = t.dos('fim').pop()
  checar('parar: so o terminal_reason aborted_* (sem o cancelar) ja tira o erro', !!fimT && fimT.erro === null, JSON.stringify(fimT))

  // Parar e escrever de novo antes de o `result` do turno parado chegar.
  let cN = null
  const n = await conversaDeTeste(async ctx => { cN = ctx; init(ctx); texto(ctx) })
  n.c.enviar('a'); await ate(() => n.dos('texto').length > 0)
  n.c.cancelar(); await ate(() => n.dos('cancelado').length > 0)
  n.c.enviar('b')
  cN.emitir({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'aborted_streaming', total_cost_usd: 0.001 })
  await ate(() => n.dos('fim').length > 0)
  await esperar(50)
  checar('⛔ parar e escrever de novo: o fim do turno PARADO nao poe em ociosa com o turno novo rodando', n.c.estado === 'pensando', n.c.estado)
  cN.emitir({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.002 })
  await ate(() => n.dos('fim').length > 1)
  checar('CONTROLE: o fim do turno NOVO poe em ociosa', n.c.estado === 'ociosa', n.c.estado)

  // `default` e `plan` não cumprem "não pergunto mais" — não acendem o "Sempre".
  for (const modo of ['default', 'plan']) {
    let r = null
    const s = await conversaDeTeste(async ctx => {
      init(ctx)
      r = await ctx.pedirPermissao('Write', { file_path: 'a.txt', content: 'x' }, { suggestions: [{ type: 'setMode', mode: modo, destination: 'session' }] })
    })
    await ate(() => s.dos('permissao').length === 1)
    const pedido = s.dos('permissao')[0].pedido
    checar(`sempre permitir: sugestao "${modo}" nao acende o botao`, pedido.podeSempre === false, String(pedido.podeSempre))
    s.c.responderPermissao(pedido.id, 'negar')
    await ate(() => r !== null)
    await s.c.encerrar()
  }
  await f.c.encerrar(); await t.c.encerrar(); await n.c.encerrar()
}

// ─────────────────────────────────────────────────────────────────────────────
// V3 — A PROPOSTA: mudança de arquivo vira antes/depois/trechos, e a resposta da revisão decide
// ─────────────────────────────────────────────────────────────────────────────
// O motor só LÊ. Quem grava é o SDK (aceitar tudo) ou o editor (parcial, simulado aqui gravando o
// arquivo à mão antes de responder). Os casos do PROMPTS §V3: aceitar parcial, rejeitar tudo, binário,
// 10 arquivos de uma vez (sujo e fechado são do editor — testes de ponte e de tela).
{
  const { default: fsx } = await import('node:fs')
  const { createRequire } = await import('node:module')
  const P_combinar = createRequire(import.meta.url)(path.join(REPO, 'extensoes', 'oficina-claude', 'proposta.js')).combinar
  const pasta = fsx.mkdtempSync(path.join(process.env.TEMP || REPO, 'oficina-prop-'))
  const arq = nome => path.join(pasta, nome)
  const init = ctx => ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
  const hash = p => fsx.readFileSync(p).toString('base64')
  try {
    fsx.writeFileSync(arq('a.txt'), 'linha um\r\nlinha dois\r\nlinha tres\r\n')
    const antesA = hash(arq('a.txt'))
    const entradaEdit = { file_path: arq('a.txt'), old_string: 'linha um\nlinha dois\nlinha tres', new_string: 'LINHA UM\nlinha dois\nLINHA TRES' }

    // Um pedido de Edit por conversa, respondido do jeito que cada caso pede.
    const umPedido = async (ferramenta, entrada) => {
      let r = null
      const s = await conversaDeTeste(async ctx => { init(ctx); r = await ctx.pedirPermissao(ferramenta, entrada, {}) })
      await ate(() => s.dos('permissao').length === 1 || r !== null)
      const ev = s.dos('permissao')[0]
      return { s, pedido: ev && ev.pedido, resultado: () => r }
    }

    // A proposta que o editor vai mostrar.
    const u = await umPedido('Edit', entradaEdit)
    const p = u.pedido && u.pedido.proposta
    checar('proposta: Edit num arquivo CRLF traz antes, depois e DOIS trechos',
      !!p && !p.erro && p.trechos.length === 2 && p.depois === 'LINHA UM\nlinha dois\nLINHA TRES\n', JSON.stringify(p && { erro: p.erro, trechos: p.trechos.length }))

    // Aceitar tudo → allow com a entrada ORIGINAL (quem grava é o SDK).
    u.s.c.responderProposta(u.pedido.id, p.depois)
    await ate(() => u.resultado() !== null)
    checar('⛔ aceitar tudo: allow com a entrada ORIGINAL do agente',
      u.resultado().behavior === 'allow' && JSON.stringify(u.resultado().updatedInput) === JSON.stringify(entradaEdit), JSON.stringify(u.resultado()))
    await u.s.c.encerrar()

    // Rejeitar tudo → deny, e o arquivo NÃO muda (critério 8 no motor: ele nunca grava).
    const n = await umPedido('Edit', entradaEdit)
    n.s.c.responderProposta(n.pedido.id, n.pedido.proposta.antes)
    await ate(() => n.resultado() !== null)
    checar('⛔ rejeitar tudo: deny, e o hash do arquivo e o de antes (criterio 8)',
      n.resultado().behavior === 'deny' && /rejeitou todas/.test(n.resultado().message) && hash(arq('a.txt')) === antesA, JSON.stringify(n.resultado()))
    await n.s.c.encerrar()

    // Parcial → o editor já gravou (simulado aqui); o motor confere no disco e o agente ouve a verdade.
    const q = await umPedido('Edit', entradaEdit)
    const pq = q.pedido.proposta
    const soPrimeiro = P_combinar(pq.antes, pq.trechos, [pq.trechos[0].id])
    fsx.writeFileSync(arq('a.txt'), soPrimeiro.replace(/\n/g, '\r\n'))
    q.s.c.responderProposta(q.pedido.id, soPrimeiro, { aceitos: [pq.trechos[0].id] })
    await ate(() => q.resultado() !== null)
    checar('⛔ parcial: deny com a mensagem honesta (1 de 2, ja gravado, nao repita)',
      q.resultado().behavior === 'deny' && /1 de 2/.test(q.resultado().message) && /JÁ ESTÃO GRAVADOS/.test(q.resultado().message), q.resultado().message)
    await q.s.c.encerrar()

    // CONTROLE do parcial: o disco NÃO tem o que a revisão diz → a mensagem não afirma que gravou.
    fsx.writeFileSync(arq('a.txt'), 'linha um\r\nlinha dois\r\nlinha tres\r\n')
    const q2 = await umPedido('Edit', entradaEdit)
    const pq2 = q2.pedido.proposta
    q2.s.c.responderProposta(q2.pedido.id, P_combinar(pq2.antes, pq2.trechos, [pq2.trechos[0].id]))
    await ate(() => q2.resultado() !== null)
    checar('CONTROLE: parcial sem o disco confirmar NAO diz que gravou', !/JÁ ESTÃO GRAVADOS/.test(q2.resultado().message), q2.resultado().message)
    await q2.s.c.encerrar()

    // Binário → recusado na hora, sem cartão, com aviso na tela.
    fsx.writeFileSync(arq('b.bin'), Buffer.from([0x50, 0x4b, 0x00, 0x01, 0xff]))
    const b = await umPedido('Write', { file_path: arq('b.bin'), content: 'texto' })
    await ate(() => b.resultado() !== null)
    checar('binario: recusado sem cartao, e a tela recebe o aviso',
      !b.pedido && b.resultado().behavior === 'deny' && b.s.dos('nota').some(x => /binário/.test(x.texto)), JSON.stringify(b.resultado()))
    await b.s.c.encerrar()

    // Caminho de rede → sem diff (nem é lido); o pedido segue como cartão da V2.
    const rede = await umPedido('Write', { file_path: '\\\\servidor.invalid\\pasta\\x.txt', content: 'x' })
    checar('caminho de rede: sem diff (erro "caminho de rede"), o cartao da V2 continua',
      !!rede.pedido && rede.pedido.proposta && rede.pedido.proposta.erro === 'caminho de rede', JSON.stringify(rede.pedido && rede.pedido.proposta))
    rede.s.c.responderPermissao(rede.pedido.id, 'negar')
    await rede.s.c.encerrar()

    // Arquivo novo e NotebookEdit.
    const novo = await umPedido('Write', { file_path: arq('novo.txt'), content: 'um\ndois\n' })
    checar('arquivo novo: proposta marcada como nova, um trecho',
      novo.pedido.proposta && novo.pedido.proposta.novo === true && novo.pedido.proposta.trechos.length === 1, JSON.stringify(novo.pedido.proposta && novo.pedido.proposta.trechos))
    novo.s.c.responderProposta(novo.pedido.id, '')
    await ate(() => novo.resultado() !== null)
    checar('arquivo novo rejeitado: deny, e o arquivo NAO nasce', novo.resultado().behavior === 'deny' && !fsx.existsSync(arq('novo.txt')))
    await novo.s.c.encerrar()
    const nb = await umPedido('NotebookEdit', { notebook_path: arq('x.ipynb'), new_source: 'x' })
    checar('NotebookEdit: sem proposta (fica com o cartao)', !!nb.pedido && !nb.pedido.proposta)
    checar('responderProposta num pedido sem proposta devolve false', nb.s.c.responderProposta(nb.pedido.id, 'x') === false)
    nb.s.c.responderPermissao(nb.pedido.id, 'negar')
    await nb.s.c.encerrar()

    // 10 ARQUIVOS DE UMA VEZ, na MESMA conversa, respondidos fora de ordem e cada um de um jeito.
    const r10 = []
    for (let i = 0; i < 10; i++) fsx.writeFileSync(arq(`f${i}.txt`), `x${i}\ny${i}\n`)
    const dez = await conversaDeTeste(async ctx => {
      init(ctx)
      await Promise.all(Array.from({ length: 10 }, (_, i) =>
        ctx.pedirPermissao('Edit', { file_path: arq(`f${i}.txt`), old_string: `x${i}`, new_string: `X${i}` }, {}).then(res => { r10[i] = res })))
    })
    await ate(() => dez.dos('permissao').length === 10)
    const pedidos = dez.dos('permissao').map(e => e.pedido)
    const ordem = [7, 2, 9, 0, 5, 1, 8, 3, 6, 4]
    for (const i of ordem) {
      const pd = pedidos.find(x => x.proposta.caminho === arq(`f${i}.txt`))
      dez.c.responderProposta(pd.id, i % 2 === 0 ? pd.proposta.depois : pd.proposta.antes)
    }
    await ate(() => r10.filter(Boolean).length === 10)
    const certos = r10.every((res, i) => res && res.behavior === (i % 2 === 0 ? 'allow' : 'deny') &&
      (i % 2 !== 0 || res.updatedInput.file_path === arq(`f${i}.txt`)))
    checar('⛔ 10 arquivos de uma vez: cada resposta vai para o SEU pedido', certos, r10.map(x => x && x.behavior).join(','))
    checar('10 arquivos: o motor nao gravou nenhum (os negados seguem iguais)',
      [1, 3, 5, 7, 9].every(i => fsx.readFileSync(arq(`f${i}.txt`), 'utf8') === `x${i}\ny${i}\n`))
    await dez.c.encerrar()
  } finally {
    fsx.rmSync(pasta, { recursive: true, force: true })
  }
}

// Texto que NÃO é UTF-8 (Windows-1252, comum em .txt e .bat antigos com acento): sem diff — mas NÃO é
// recusado como binário. Cai no cartão da V2, com Permitir / Não (revisão de suposições da V3).
{
  const { default: fsx } = await import('node:fs')
  const pasta = fsx.mkdtempSync(path.join(process.env.TEMP || REPO, 'oficina-cod-'))
  const arq = path.join(pasta, 'l1.txt')
  fsx.writeFileSync(arq, Buffer.from([0x61, 0xe7, 0xe3, 0x6f, 0x0a]))
  let r = null
  const s = await conversaDeTeste(async ctx => {
    ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
    r = await ctx.pedirPermissao('Write', { file_path: arq, content: 'x\n' }, {})
  })
  await ate(() => s.dos('permissao').length === 1 || r !== null)
  const ev = s.dos('permissao')[0]
  checar('⛔ texto em Windows-1252: NAO e recusado como binario, vira cartao sem diff',
    !!ev && r === null && !!ev.pedido.proposta && !!ev.pedido.proposta.erro,
    JSON.stringify({ r, erro: ev && ev.pedido.proposta && ev.pedido.proposta.erro }))
  if (ev) s.c.responderPermissao(ev.pedido.id, 'negar')
  await ate(() => r !== null)
  await s.c.encerrar()
  fsx.rmSync(pasta, { recursive: true, force: true })
}

// Cyber da V3: o id do pedido não se adivinha (um link `command:` precisaria dele); o teto de tamanho
// vale pelo que foi LIDO (o arquivo pode crescer entre o `stat` e a leitura); arquivo numa unidade de
// rede MAPEADA (`Z:`) não é tocado — a mesma regra do `\\servidor`, que a V2 fechou por causa do NTLM.
{
  const { default: fsx } = await import('node:fs')
  const { createRequire } = await import('node:module')
  const fsDoMotor = createRequire(import.meta.url)('fs')
  const pasta = fsx.mkdtempSync(path.join(process.env.TEMP || REPO, 'oficina-cyber-'))
  const init = ctx => ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: [] })
  const umPedido = async (ferramenta, entrada, extras = {}) => {
    let r = null
    const s = await conversaDeTeste(async ctx => { init(ctx); r = await ctx.pedirPermissao(ferramenta, entrada, {}) }, extras)
    await ate(() => s.dos('permissao').length === 1 || r !== null)
    return { s, ev: s.dos('permissao')[0], r: () => r }
  }
  const encerrar = async u => { if (u.ev) u.s.c.responderPermissao(u.ev.pedido.id, 'negar'); await u.s.c.encerrar() }
  try {
    fsx.writeFileSync(path.join(pasta, 'a.txt'), 'a\n')
    const u = await umPedido('Write', { file_path: path.join(pasta, 'a.txt'), content: 'b\n' })
    checar('cyber: o id do pedido tem uma parte aleatoria (nao se adivinha)', !!u.ev && /-[0-9a-f]{8}$/.test(u.ev.pedido.id), u.ev && u.ev.pedido.id)
    await encerrar(u)

    const grande = path.join(pasta, 'grande.txt')
    fsx.writeFileSync(grande, 'x'.repeat(6 * 1024 * 1024))
    const statOriginal = fsDoMotor.statSync
    fsDoMotor.statSync = (p, ...a) => {
      const s = statOriginal(p, ...a)
      return p === grande ? Object.assign(Object.create(Object.getPrototypeOf(s)), s, { size: 10 }) : s
    }
    let g
    try { g = await umPedido('Write', { file_path: grande, content: 'y\n' }) } finally { fsDoMotor.statSync = statOriginal }
    checar('cyber: o teto de tamanho vale pelo que foi LIDO (o arquivo cresceu depois do stat)',
      !!g.ev && !!g.ev.pedido.proposta && /grande demais/.test(g.ev.pedido.proposta.erro || ''),
      JSON.stringify(g.ev && g.ev.pedido.proposta && { erro: g.ev.pedido.proposta.erro }))
    await encerrar(g)

    const q = await umPedido('Write', { file_path: 'Q:\\pasta\\x.txt', content: 'x' }, { unidadesDeRede: () => ['Q'] })
    checar('⛔ cyber: arquivo numa UNIDADE DE REDE mapeada nao e tocado (sem diff, "caminho de rede")',
      !!q.ev && !!q.ev.pedido.proposta && q.ev.pedido.proposta.erro === 'caminho de rede', JSON.stringify(q.ev && q.ev.pedido.proposta))
    await encerrar(q)

    const real = path.join(pasta, 'real')
    fsx.mkdirSync(real)
    fsx.writeFileSync(path.join(real, 'j.txt'), 'j\n')
    const junc = path.join(pasta, 'junc')
    fsx.symlinkSync(real, junc, 'junction')
    const j = await umPedido('Write', { file_path: path.join(junc, 'j.txt'), content: 'J\n' })
    checar('CONTROLE: por uma juncao para pasta LOCAL, a proposta continua com diff',
      !!j.ev && !!j.ev.pedido.proposta && !j.ev.pedido.proposta.erro, JSON.stringify(j.ev && j.ev.pedido.proposta && j.ev.pedido.proposta.erro))
    await encerrar(j)
  } finally {
    fsx.rmSync(pasta, { recursive: true, force: true })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V4 — O COMANDO: quem executa é a OFICINA, e o agente ouve a saída pelo `deny`
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ O executor aqui é DUBLÊ — quem prova processo de verdade (PID, filhos, teto de tempo) é
// `testes/comando.mjs`, com o sistema operacional no lugar do dublê. O que este bloco prova é a
// COSTURA: o pedido vira cartão de comando, o "sim" vira execução, o Parar alcança o processo, e o
// que volta ao agente é a mensagem — nunca um `allow` mudo.
{
  const init = ctx => ctx.emitir({ type: 'system', subtype: 'init', session_id: 's', model: 'm', tools: ['Bash'] })

  /** Um executor que não executa nada: guarda o que foi pedido e deixa o teste decidir o fim. */
  function executorFalso() {
    const chamadas = []
    const fn = pedido => {
      let resolver = null
      const ex = {
        pedido,
        cancelouCom: null,
        pronto: new Promise(r => { resolver = r }),
        cancelar(motivo) {
          ex.cancelouCom = motivo
          resolver({ linha: pedido.linha, codigo: null, cancelado: true, motivo, saida: 'metade', duracaoMs: 7 })
        },
        terminar(extra = {}) {
          resolver({ linha: pedido.linha, codigo: 0, cancelado: false, saida: 'alfa', duracaoMs: 42, ...extra })
        },
      }
      chamadas.push(ex)
      return ex
    }
    return { fn, chamadas }
  }

  /** Um pedido de comando, com o executor ligado (ou não, para os controles). */
  const umComando = async (entrada, extras = {}) => {
    let resposta = null
    let opcoesDaQuery = null
    const s = await conversaDeTeste(async ctx => {
      opcoesDaQuery = ctx.options
      init(ctx)
      resposta = await ctx.pedirPermissao(extras.ferramenta || 'Bash', entrada, {
        suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'localSettings' }],
      })
    }, extras.conversa || {})
    await ate(() => s.dos('permissao').length === 1 || resposta !== null)
    return { s, ev: s.dos('permissao')[0], resposta: () => resposta, opcoes: () => opcoesDaQuery }
  }

  const exec = executorFalso()
  const comExecutor = { executarComando: exec.fn }

  // 1. O pedido vira COMANDO — com a linha, e sem o "sempre".
  const u = await umComando({ command: 'npm test', description: 'roda os testes' }, { conversa: comExecutor })
  const pedido = u.ev && u.ev.pedido
  checar('V4: o pedido de Bash chega à tela como COMANDO, com a linha e a descrição',
    !!pedido && !!pedido.comando && pedido.comando.linha === 'npm test' && pedido.comando.descricao === 'roda os testes',
    JSON.stringify(pedido && pedido.comando))
  checar('⛔ V4: comando NÃO oferece "sempre permitir" (a regra de allow o tiraria do terminal)',
    pedido.podeSempre === false && pedido.sugestoes === null && pedido.modoSugerido === null,
    JSON.stringify({ podeSempre: pedido.podeSempre, sugestoes: pedido.sugestoes }))
  checar('V4: a conversa pede `ask` para as ferramentas de comando (senão o CLI aprova sozinho)',
    !!u.opcoes() && !!u.opcoes().settings &&
    JSON.stringify(u.opcoes().settings.permissions.ask) === JSON.stringify(['Bash', 'PowerShell']),
    JSON.stringify(u.opcoes() && u.opcoes().settings))

  /*
    ⛔ A GUARDA DO CORACAO 2 — as regras da pasta continuam valendo dentro da OFICINA.

    Por que ela existe (achado M4 do revisor de erros da V4): a garantia central desta versao — o
    `deny` GRANULAR da pasta (`Bash(echo:*)`) ganhar do nosso `ask` — foi medida UMA vez, num spike
    pago (rodada F), e nao tinha nenhum criterio permanente. O teste caro que existe
    (`trava_de_permissao.mjs`) mede `deny: ["Bash"]` INTEIRO, pelo sumiço da ferramenta na lista; o
    caso granular nao sumia de lista nenhuma e ficou sem trava. Conclusao do revisor, com a qual eu
    concordo: hoje a versao esta certa, e amanha alguem troca `ask` por `allow` "para tirar um cartao
    do caminho" e TUDO continua verde.

    O que esta guarda prova: as quatro escolhas de que a garantia depende continuam de pe nas opcoes
    que a OFICINA entrega ao SDK. Nenhuma delas pode mudar sem esta linha ficar vermelha.
      (a) NENHUM `toolAliases` — foi ele que reprovou a porta 1: o alias troca o nome da ferramenta
          ANTES da politica, e a politica da pasta e escrita sobre o nome `Bash`;
      (b) o nosso pedido e `ask`, nunca `allow` — `allow` tiraria o comando da porta;
      (c) nos NAO escrevemos `deny` nem `allow` na camada do SDK: quem manda nisso e a pasta;
      (d) `settingSources` pede as TRES fontes do disco. Pelo tipo do SDK, `project` e o
          `.claude/settings.json` da pasta, `local` e o `.claude/settings.local.json` DA MESMA PASTA
          e `user` e o global da pessoa. Ate 11/09/2026 so `project` era pedido, e um `deny`
          escrito no `settings.local.json` nao valia aqui dentro — com o produto anunciando que as
          regras da pasta valem. Tirar qualquer uma das tres deixa esta linha vermelha.

    ⚠️ O QUE ELA NAO PROVA, dito com todas as letras: que o CLI de verdade obedece. Isso e
    comportamento, foi medido no spike F com o agente de verdade, e repetir custa dinheiro e uma
    corrida de editor. Esta guarda pega a TROCA ACIDENTAL, que e o risco de todo dia; o comportamento
    continua declarado no registro desta versao como medido uma vez.
  */
  {
    const o = u.opcoes() || {}
    const p = (o.settings && o.settings.permissions) || {}
    const problemas = []
    if (o.toolAliases) problemas.push('toolAliases voltou (a porta 1 fura a regra granular da pasta)')
    if (JSON.stringify(p.ask) !== JSON.stringify(['Bash', 'PowerShell'])) problemas.push('o `ask` mudou')
    if (p.allow) problemas.push('`allow` na camada do SDK tira o comando da porta')
    if (p.deny) problemas.push('quem escreve `deny` e a pasta, nao nos')
    for (const fonte of ['user', 'project', 'local'])
      if (!Array.isArray(o.settingSources) || !o.settingSources.includes(fonte))
        problemas.push(`settingSources sem '${fonte}': a regra dessa camada deixa de valer aqui dentro`)
    checar('⛔ V4 / coracao 2: nada nas opcoes derruba a regra da PASTA (alias, allow, deny, settingSources)',
      problemas.length === 0, problemas.join(' | ') || 'as quatro escolhas de pe')
  }

  // 2. O "sim" vira execução, e o agente ouve a SAÍDA — num deny, que é o único canal que carrega texto.
  u.s.c.responderPermissao(pedido.id, 'permitir')
  await ate(() => exec.chamadas.length === 1)
  checar('V4: aprovar o cartão manda o comando para o executor (não para o SDK)',
    exec.chamadas.length === 1 && exec.chamadas[0].pedido.linha === 'npm test',
    JSON.stringify(exec.chamadas.map(c => c.pedido.linha)))
  const comecou = u.s.dos('comando_inicio')[0]
  checar('V4: a tela é avisada de que o comando COMEÇOU, com a linha e a ferramenta',
    !!comecou && comecou.linha === 'npm test' && comecou.ferramenta === 'Bash' && comecou.id === pedido.id,
    JSON.stringify(comecou))
  // ⚠️ Com a LINHA junto, e não só o id: a tela recarregada precisa redesenhar a execução, e id
  // sozinho não desenha nada (o método existia devolvendo só chaves, sem chamador — revisor
  // independente, 11/09/2026).
  checar('V4: enquanto o comando roda, ele está na lista de comandos em curso, COM a linha',
    u.s.c.comandosEmCurso().some(c => c.id === pedido.id && c.linha === 'npm test' && c.ferramenta === 'Bash'),
    JSON.stringify(u.s.c.comandosEmCurso()))
  // ⚠️ A resposta ao agente NÃO pode vir antes do comando terminar: se viesse, ele seguiria o
  // trabalho sem a saída — e o `deny` chegaria depois, sobre um passo que ele já deu.
  checar('⛔ V4: o agente ainda NÃO ouviu nada enquanto o comando roda', u.resposta() === null)

  exec.chamadas[0].terminar({ codigo: 0, saida: '3 passaram' })
  await ate(() => u.resposta() !== null)
  const r = u.resposta()
  checar('⛔ V4: o agente ouve a SAÍDA do comando (num deny, que é o que carrega texto)',
    r.behavior === 'deny' && /3 passaram/.test(r.message) && /Código de saída: 0/.test(r.message) &&
    /NÃO é um erro/.test(r.message), JSON.stringify(r).slice(0, 200))
  const terminou = u.s.dos('comando_fim')[0]
  checar('V4: a tela é avisada do FIM, com código e duração',
    !!terminou && terminou.codigo === 0 && terminou.duracaoMs === 42 && terminou.cancelado === false,
    JSON.stringify(terminou))
  checar('V4: terminado, o comando sai da lista de comandos em curso', u.s.c.comandosEmCurso().length === 0)
  await u.s.c.encerrar()

  // 3. O "não" não roda nada — e o agente ouve a recusa de sempre.
  const exec2 = executorFalso()
  const n = await umComando({ command: 'rm -rf /' }, { conversa: { executarComando: exec2.fn } })
  n.s.c.responderPermissao(n.ev.pedido.id, 'negar')
  await ate(() => n.resposta() !== null)
  checar('⛔ V4: recusar não executa NADA, e o agente ouve a recusa',
    exec2.chamadas.length === 0 && n.resposta().behavior === 'deny' && !/Código de saída/.test(n.resposta().message),
    `${exec2.chamadas.length} execução(ões)`)
  await n.s.c.encerrar()

  // 4. O Parar da conversa alcança o PROCESSO, não só o turno.
  const exec3 = executorFalso()
  const p = await umComando({ command: 'sleep 300' }, { conversa: { executarComando: exec3.fn } })
  p.s.c.responderPermissao(p.ev.pedido.id, 'permitir')
  await ate(() => exec3.chamadas.length === 1)
  p.s.c.cancelar()
  await ate(() => p.resposta() !== null)
  checar('⛔ V4: o Parar da conversa cancela o comando que está rodando',
    exec3.chamadas[0].cancelouCom === 'parar', String(exec3.chamadas[0].cancelouCom))
  checar('⛔ V4: o agente ouve que foi a PESSOA que parou, e que não é para refazer sozinho',
    /A PESSOA parou/.test(p.resposta().message) && /NÃO rode este comando de novo/.test(p.resposta().message),
    p.resposta().message.slice(0, 120))
  await p.s.c.encerrar()

  // 5. O botão da linha para SÓ aquele comando — e recusa o que já acabou.
  const exec4 = executorFalso()
  const b = await umComando({ command: 'npm run build' }, { conversa: { executarComando: exec4.fn } })
  b.s.c.responderPermissao(b.ev.pedido.id, 'permitir')
  await ate(() => exec4.chamadas.length === 1)
  checar('V4: pararComando() para aquele comando pelo id do pedido',
    b.s.c.pararComando(b.ev.pedido.id) === true && exec4.chamadas[0].cancelouCom === 'parar')
  await ate(() => b.resposta() !== null)
  checar('⛔ CONTROLE: pararComando() de um id que não está rodando devolve false (a tela precisa saber)',
    b.s.c.pararComando(b.ev.pedido.id) === false && b.s.c.pararComando('nao-existe') === false)
  await b.s.c.encerrar()

  // 6. Encerrar a conversa não deixa comando rodando sozinho.
  const exec5 = executorFalso()
  const e = await umComando({ command: 'sleep 300' }, { conversa: { executarComando: exec5.fn } })
  e.s.c.responderPermissao(e.ev.pedido.id, 'permitir')
  await ate(() => exec5.chamadas.length === 1)
  await e.s.c.encerrar()
  checar('⛔ V4: encerrar a conversa para o comando que estava rodando',
    exec5.chamadas[0].cancelouCom === 'encerrada', String(exec5.chamadas[0].cancelouCom))

  // 7. Os casos em que a OFICINA sai da frente — e o CONTROLE de que ela normalmente entra.
  const exec6 = executorFalso()
  const fundo = await umComando({ command: 'npm test', run_in_background: true }, { conversa: { executarComando: exec6.fn } })
  checar('⛔ V4: comando em SEGUNDO PLANO segue com o SDK (cartão da V2, sem execução nossa)',
    !fundo.ev.pedido.comando, JSON.stringify(fundo.ev.pedido.comando))
  fundo.s.c.responderPermissao(fundo.ev.pedido.id, 'permitir')
  await ate(() => fundo.resposta() !== null)
  checar('⛔ V4: e nesse caso o agente ouve `allow` — quem roda é o SDK, como sempre foi',
    fundo.resposta().behavior === 'allow' && exec6.chamadas.length === 0, JSON.stringify(fundo.resposta().behavior))
  await fundo.s.c.encerrar()

  const semExecutor = await umComando({ command: 'npm test' })
  checar('⛔ CONTROLE: sem executor (host antigo), o pedido é o da V3 e não há `ask` nas opções',
    !semExecutor.ev.pedido.comando && !(semExecutor.opcoes() && semExecutor.opcoes().settings),
    JSON.stringify({ comando: semExecutor.ev.pedido.comando, settings: semExecutor.opcoes().settings }))
  await semExecutor.s.c.encerrar()

  // 8. O executor quebrado não pode pendurar o agente para sempre — o SDK não tem prazo para
  //    permissão (está escrito no tipo `CanUseTool`): quem não responde, não responde nunca.
  const quebrado = await umComando({ command: 'npm test' }, {
    conversa: { executarComando: () => { throw new Error('o terminal não abriu') } },
  })
  quebrado.s.c.responderPermissao(quebrado.ev.pedido.id, 'permitir')
  await ate(() => quebrado.resposta() !== null)
  checar('⛔ V4: executor que QUEBRA ainda responde ao agente (ninguém fica pendurado)',
    !!quebrado.resposta() && /não conseguiu iniciar/.test(quebrado.resposta().message),
    quebrado.resposta() && quebrado.resposta().message.slice(0, 90))
  await quebrado.s.c.encerrar()

  /*
    ⛔ O TERCEIRO CASO, QUE E O QUE ACONTECE NA MAQUINA: o executor que simplesmente NAO RESPONDE.
    Os dois criterios acima (executor que lanca, executor que devolve lixo) cobrem o que o codigo ja
    tratava; a familia inteira ficava verde sem cobrir a unica forma real de pendurar o agente --
    apontado pelo revisor de erros da V4 (achado M5), e foi assim que um comando com descendente
    vivo pendurou o `canUseTool` PARA SEMPRE, que o SDK nao tem prazo para prompt de permissao.
    Com o conserto, o motor responde por conta propria depois do teto do comando mais uma folga.
    A folga e injetada aqui (30 ms) so para o criterio nao custar 15 segundos.
  */
  {
    const nuncaResponde = { pronto: new Promise(() => { }), cancelar() { return true } }
    const pendurado = await umComando({ command: 'npm test', timeout: 10 }, {
      conversa: { executarComando: () => nuncaResponde, folgaDoExecutorMs: 30 },
    })
    pendurado.s.c.responderPermissao(pendurado.ev.pedido.id, 'permitir')
    const respondeu = await ate(() => pendurado.resposta() !== null, 4000)
    checar('⛔ V4: executor que NAO RESPONDE nunca pendura o agente (o motor responde sozinho)',
      respondeu && !!pendurado.resposta() && pendurado.resposta().behavior === 'deny',
      respondeu ? String(pendurado.resposta().message).slice(0, 110) : 'o agente ficou pendurado')
    await pendurado.s.c.encerrar()
  }

  const semPromessa = await umComando({ command: 'npm test' }, { conversa: { executarComando: () => ({}) } })
  semPromessa.s.c.responderPermissao(semPromessa.ev.pedido.id, 'permitir')
  await ate(() => semPromessa.resposta() !== null)
  checar('⛔ V4: executor que devolve lixo também responde ao agente',
    !!semPromessa.resposta() && semPromessa.resposta().behavior === 'deny')
  await semPromessa.s.c.encerrar()

  // 9. A linha de ferramenta não duplica o cartão — mas volta quando o cartão não existe.
  {
    const exec7 = executorFalso()
    const s = await conversaDeTeste(ctx => {
      init(ctx)
      ctx.emitir({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } })
    }, { executarComando: exec7.fn })
    await esperar(30)
    checar('V4: comando que a OFICINA vai rodar NÃO vira também linha de ferramenta (seria "Rodou" antes de rodar)',
      s.dos('ferramenta').length === 0, JSON.stringify(s.dos('ferramenta')))
    await s.c.encerrar()

    const sSem = await conversaDeTeste(ctx => {
      init(ctx)
      ctx.emitir({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } })
    })
    await esperar(30)
    checar('⛔ CONTROLE: sem executor, a linha de ferramenta do comando continua aparecendo',
      sSem.dos('ferramenta').length === 1, JSON.stringify(sSem.dos('ferramenta').map(e => e.nome)))
    await sSem.c.encerrar()

    // No modo que pula aprovação o comando não passa por aqui — a linha é o ÚNICO registro dele.
    const sBypass = await conversaDeTeste(ctx => {
      init(ctx)
      ctx.emitir({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } })
    }, { executarComando: exec7.fn, permitirPularAprovacao: true })
    sBypass.c.modo = 'bypassPermissions'
    sBypass.c._traduzir({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' } }] } })
    checar('⛔ V4: no modo que pula aprovação a linha VOLTA (sem ela, o comando não apareceria em lugar nenhum)',
      sBypass.dos('ferramenta').length === 1, JSON.stringify(sBypass.dos('ferramenta').map(e => e.nome)))
    await sBypass.c.encerrar()
  }

  // 10. O caminho na linha de ferramenta: relativo à pasta aberta (revisão de tela de 18/09/2026:
  // a linha dizia "Leu d:\\pasta\\do\\projeto\\conta.js").
  {
    const dentro = path.join(REPO, 'sub', 'conta.js')
    const s = await conversaDeTeste(ctx => {
      init(ctx)
      ctx.emitir({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: dentro.toLowerCase() } }] } })
    })
    await esperar(30)
    const ev = s.dos('ferramenta')[0] || {}
    checar('⛔ arquivo dentro da pasta aberta aparece relativo a ela (mesmo com a letra do disco em minúscula)',
      ev.mostrar === path.join('sub', 'conta.js'), String(ev.mostrar))
    checar('e a entrada continua com o caminho inteiro', ev.entrada && ev.entrada.file_path === dentro.toLowerCase())
    await s.c.encerrar()
    checar('arquivo FORA da pasta aberta não é encurtado (ali o caminho é a informação)',
      caminhoParaMostrar(path.join(path.dirname(REPO), 'outro', 'x.js'), REPO) === null)
    checar('comando não é caminho: nada a mostrar', caminhoParaMostrar('npm test', REPO) === null)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V15 — MODELO E ESFORÇO: o que a barra mostra é o EM USO, e as trocas chamam o agente com o argumento certo
// ─────────────────────────────────────────────────────────────────────────────
// O dublê responde como o SDK 0.3.261 respondeu na medida de 18/09/2026: a lista (com `default` e
// `opus[1m]` apontando para o mesmo modelo, e o Haiku sem esforço), e `getSettings().applied` mudando com
// `setModel` e `applyFlagSettings`. No Haiku, pedir esforço é aceito e ignorado — como medido.
{
  const M = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'modelos.js'))
  const TODOS = ['low', 'medium', 'high', 'xhigh', 'max']
  const LISTA_MEDIDA = [
    { value: 'default', resolvedModel: 'claude-opus-5[1m]', displayName: 'Default (recommended)', description: 'Opus 5 with 1M context · Best for everyday, complex tasks', supportsEffort: true, supportedEffortLevels: TODOS },
    { value: 'opus[1m]', resolvedModel: 'claude-opus-5[1m]', displayName: 'Opus (1M context)', description: 'Opus 5 with 1M context · Best for everyday, complex tasks', supportsEffort: true, supportedEffortLevels: TODOS },
    { value: 'claude-fable-5-1[1m]', resolvedModel: 'claude-fable-5-1', displayName: 'Fable', description: 'Fable 5.1 · Most capable for your hardest and longest-running tasks', supportsEffort: true, supportedEffortLevels: TODOS },
    { value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Sonnet 5 · Efficient for routine tasks', supportsEffort: true, supportedEffortLevels: ['medium', 'high', 'low'] },
    { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku', description: 'Haiku 4.5 · Fastest for quick answers' },
  ]

  /** Conversa com um agente que tem modelo e esforço. `st` é o estado do agente; `chamadas`, o que a OFICINA pediu. */
  const conversaDeModelo = async ({ modelo = 'claude-sonnet-5', esforco = 'medium', semGetSettings = false, falhaSetModel = false, ignoraEsforco = false } = {}) => {
    const st = { model: modelo, effort: esforco, flag: null }
    const chamadas = { setModel: [], applyFlagSettings: [], opcoes: [] }
    const eventos = []
    let emitir = null
    const c = new Conversa({
      cwd: REPO, id: 'teste', aoEvento: e => eventos.push(e),
      carregarSdk: () => Promise.resolve({
        query: ({ options }) => {
          chamadas.opcoes.push(options)
          const consulta = {
            accountInfo: () => Promise.resolve({ email: 'pessoa@exemplo.com', tokenSource: 'claude.ai' }),
            initializationResult: () => Promise.resolve({ account: { email: 'pessoa@exemplo.com' }, models: LISTA_MEDIDA }),
            async setModel(...args) {
              chamadas.setModel.push(args)
              if (falhaSetModel) throw new Error('Model is not a recognized model id')
              const v = args[0]
              const info = LISTA_MEDIDA.find(i => i.value === (v === undefined ? 'default' : v))
              if (!info) throw new Error(`Model "${v}" is not a recognized model id.`)
              st.model = info.resolvedModel
              st.effort = info.supportsEffort ? (st.flag || 'high') : null
            },
            async applyFlagSettings(s) {
              chamadas.applyFlagSettings.push(s)
              if (ignoraEsforco) return
              const info = LISTA_MEDIDA.find(i => i.resolvedModel === st.model)
              st.flag = s.effortLevel
              if (info && info.supportsEffort) st.effort = s.effortLevel
            },
            [Symbol.asyncIterator]: () => ({
              next: () => new Promise(r => {
                emitir = m => r({ value: m, done: false })
                options.abortController.signal.addEventListener('abort', () => r({ value: undefined, done: true }))
              }),
              return: () => Promise.resolve({ value: undefined, done: true }),
            }),
          }
          if (!semGetSettings) consulta.getSettings = () => Promise.resolve({ effective: {}, sources: [], applied: { model: st.model, effort: st.effort, advisor: null, ultracode: false } })
          return consulta
        },
      }),
    })
    await c.iniciar()
    await ate(() => eventos.some(e => e.tipo === 'pronto'))
    await esperar(20)
    const doModelo = () => eventos.filter(e => e.tipo === 'modelo')
    return { c, eventos, chamadas, st, doModelo, ultimo: () => doModelo().pop(), emitir: m => emitir && emitir(m) }
  }

  // 1. A abertura: o em uso, não o primeiro da lista.
  const a = await conversaDeModelo()
  const pronto = a.eventos.find(e => e.tipo === 'pronto')
  checar('⛔ V15: na abertura o modelo é o EM USO (lido do agente), e não o primeiro da lista',
    !!pronto && pronto.modelo === 'claude-sonnet-5' && a.c.modelo === 'claude-sonnet-5', pronto && pronto.modelo)
  let ev = a.ultimo() || {}
  checar('⛔ V15: a barra recebe "Sonnet 5 · médio" — modelo e esforço em uso, num texto só', ev.rotulo === 'Sonnet 5 · médio', ev.rotulo)
  checar('V15: o ✓ vai no item em uso (sonnet), e o esforço é o que o agente disse, não suposto',
    ev.emUso === 'sonnet' && ev.esforco === 'medium' && ev.esforcoSuposto === false, `${ev.emUso} ${ev.esforco} ${ev.esforcoSuposto}`)
  checar('V15: a lista do painel vem do agente, com nome e descrição; "Default (recommended)" em português',
    Array.isArray(ev.modelos) && ev.modelos.length === 5 && ev.modelos[0].nome === 'Padrão (recomendado)' && /Best for everyday/.test(ev.modelos[1].descricao),
    ev.modelos && ev.modelos.map(i => i.nome).join(', '))
  checar('V15: os pontos do esforço são só os que o modelo aceita, na ordem do controle',
    JSON.stringify(ev.esforcos) === JSON.stringify(['low', 'medium', 'high']) && ev.aceitaEsforco === true, JSON.stringify(ev.esforcos))
  checar('V15: os cinco pontos com os rótulos em português vêm prontos para a tela',
    (ev.niveis || []).map(n => n.rotulo).join(',') === 'baixo,médio,alto,extra-alto,máximo', (ev.niveis || []).map(n => n.rotulo).join(','))

  // 2. Trocar o esforço.
  let ok = await a.c.trocarEsforco('low')
  ev = a.ultimo()
  checar('⛔ V15: trocar o esforço chama `applyFlagSettings({ effortLevel })` com o nível pedido, uma vez',
    ok === true && a.chamadas.applyFlagSettings.length === 1 && JSON.stringify(a.chamadas.applyFlagSettings[0]) === '{"effortLevel":"low"}',
    JSON.stringify(a.chamadas.applyFlagSettings))
  checar('V15: e a barra passa a "Sonnet 5 · baixo", relido do agente', ev.rotulo === 'Sonnet 5 · baixo' && ev.ok === true, ev.rotulo)
  ok = await a.c.trocarEsforco('max')
  checar('⛔ V15: nível que ESTE modelo não aceita é recusado sem chegar ao agente', ok === false && a.chamadas.applyFlagSettings.length === 1 && a.ultimo().ok === false && a.ultimo().esforco === 'low',
    JSON.stringify(a.chamadas.applyFlagSettings))
  ok = await a.c.trocarEsforco('turbo')
  checar('V15: nível inventado é recusado', ok === false && a.chamadas.applyFlagSettings.length === 1)

  // 3. Trocar o modelo.
  ok = await a.c.trocarModelo('opus[1m]')
  ev = a.ultimo()
  checar('⛔ V15: trocar o modelo chama `setModel` com o valor do item escolhido',
    ok === true && a.chamadas.setModel.length === 1 && a.chamadas.setModel[0][0] === 'opus[1m]', JSON.stringify(a.chamadas.setModel))
  checar('⛔ V15: dois itens com o mesmo modelo — o ✓ vai no ESCOLHIDO (opus[1m]), não no primeiro (Padrão)',
    ev.emUso === 'opus[1m]' && ev.modelo === 'claude-opus-5[1m]' && ev.rotulo === 'Opus 5 (1M) · baixo', `${ev.emUso} ${ev.rotulo}`)
  ok = await a.c.trocarModelo('haiku')
  ev = a.ultimo()
  checar('⛔ V15: modelo sem esforço — o esforço some da barra e o painel sabe que não há controle',
    ok === true && ev.rotulo === 'Haiku 4.5' && ev.esforco === null && ev.aceitaEsforco === false && ev.esforcos.length === 0, `${ev.rotulo} ${ev.esforco}`)
  const antesDoHaiku = a.chamadas.applyFlagSettings.length
  ok = await a.c.trocarEsforco('high')
  checar('⛔ V15: no Haiku, pedir esforço é recusado AQUI (o agente aceitaria em silêncio e ignoraria)',
    ok === false && a.chamadas.applyFlagSettings.length === antesDoHaiku, JSON.stringify(a.chamadas.applyFlagSettings))
  ok = await a.c.trocarModelo('default')
  const pedidoDoPadrao = a.chamadas.setModel[a.chamadas.setModel.length - 1]
  checar('V15: "Padrão" volta ao modelo padrão chamando `setModel` com `undefined` (o caminho medido)',
    ok === true && pedidoDoPadrao[0] === undefined && a.st.model === 'claude-opus-5[1m]' && a.ultimo().emUso === 'default', `${String(pedidoDoPadrao[0])} ${a.ultimo().emUso}`)
  const nChamadas = a.chamadas.setModel.length
  ok = await a.c.trocarModelo('claude-inventado-9')
  checar('⛔ V15: modelo fora da lista do agente é recusado sem chegar a ele, e a barra continua no que vale',
    ok === false && a.chamadas.setModel.length === nChamadas && a.ultimo().ok === false && a.ultimo().emUso === 'default')

  // 4. O `init` de cada turno com outro modelo (volta automática do agente, ou troca por fora): relê e avisa.
  const antesDoInit = a.doModelo().length
  a.st.model = 'claude-sonnet-5'; a.st.effort = 'high'
  a.emitir({ type: 'system', subtype: 'init', session_id: 's15', model: 'claude-sonnet-5', tools: [] })
  await ate(() => a.doModelo().length > antesDoInit)
  checar('V15: o `init` com outro modelo relê o agente e atualiza a barra', a.ultimo().rotulo === 'Sonnet 5 · alto', a.ultimo().rotulo)
  await a.c.encerrar()

  // 4a. O `init` traz o id SEM o `[1m]` (o contexto longo é opção da sessão, não outro modelo). Sem a releitura do
  // agente, trocar o em uso por ele apagava o "(1M)" do botão e o ✓ do item; com ela, relia a cada turno à toa.
  {
    const um = await conversaDeModelo({ modelo: 'claude-opus-5[1m]', esforco: 'high' })
    await um.c.trocarModelo('opus[1m]')
    delete um.c._consulta.getSettings
    const nAntes = um.doModelo().length
    um.emitir({ type: 'system', subtype: 'init', session_id: 's15b', model: 'claude-opus-5', tools: [] })
    await esperar(40)
    checar('⛔ V15: `init` com o mesmo modelo sem o `[1m]` não tira o "(1M)" nem o ✓ (e não relê à toa)',
      um.c.modelo === 'claude-opus-5[1m]' && um.doModelo().length === nAntes && um.c.estadoDoModelo().emUso === 'opus[1m]',
      JSON.stringify({ modelo: um.c.modelo, eventos: um.doModelo().length - nAntes, emUso: um.c.estadoDoModelo().emUso }))
    await um.c.encerrar()
  }

  // 4b. O PROCESSO RECOMEÇA NA MESMA ABA ("Tentar de novo", a tela que volta com a conversa parada): a escolha da
  // pessoa nesta conversa vai junto. Antes, o processo novo nascia no modelo configurado e o botão voltava calado.
  {
    const rc = await conversaDeModelo()
    checar('CONTROLE V15: sem escolha nenhuma, o processo nasce sem modelo nem esforço impostos (vale o configurado)',
      rc.chamadas.opcoes[0] && rc.chamadas.opcoes[0].model === undefined && rc.chamadas.opcoes[0].effort === undefined,
      JSON.stringify({ m: rc.chamadas.opcoes[0] && rc.chamadas.opcoes[0].model, e: rc.chamadas.opcoes[0] && rc.chamadas.opcoes[0].effort }))
    await rc.c.trocarEsforco('low')
    await rc.c.trocarModelo('opus[1m]')
    await rc.c.encerrar()
    await rc.c.iniciar()
    await esperar(20)
    const nova = rc.chamadas.opcoes[rc.chamadas.opcoes.length - 1] || {}
    checar('⛔ V15: o processo que recomeça na mesma conversa nasce com o modelo e o esforço que a pessoa escolheu',
      rc.chamadas.opcoes.length === 2 && nova.model === 'opus[1m]' && nova.effort === 'low', JSON.stringify({ m: nova.model, e: nova.effort }))
    await rc.c.trocarModelo('default')
    await rc.c.encerrar()
    await rc.c.iniciar()
    await esperar(20)
    const padrao = rc.chamadas.opcoes[rc.chamadas.opcoes.length - 1] || {}
    checar('V15: voltar ao "Padrão" deixa de impor o modelo no recomeço', padrao.model === undefined, String(padrao.model))
    await rc.c.encerrar()
  }

  // 5. O estado mostrado é o RELIDO: agente que aceita e ignora → a troca não vale, e a barra não mente.
  const ig = await conversaDeModelo({ ignoraEsforco: true })
  ok = await ig.c.trocarEsforco('low')
  checar('⛔ V15: o agente aceitou mas não aplicou → `ok: false` e a barra continua no esforço real',
    ok === false && ig.ultimo().esforco === 'medium' && ig.ultimo().ok === false, `${ig.ultimo().esforco} ${ig.ultimo().ok}`)
  await ig.c.encerrar()

  const falha = await conversaDeModelo({ falhaSetModel: true })
  ok = await falha.c.trocarModelo('haiku')
  checar('V15: `setModel` que falha → `ok: false`, e o modelo continua o de antes', ok === false && falha.ultimo().rotulo === 'Sonnet 5 · médio', falha.ultimo().rotulo)
  await falha.c.encerrar()

  // 6. Sem a leitura do agente: a abertura não chuta o primeiro da lista.
  const sg = await conversaDeModelo({ semGetSettings: true })
  const prontoSg = sg.eventos.find(e => e.tipo === 'pronto')
  checar('⛔ V15: sem como ler o modelo em uso, a abertura fica SEM modelo (e não com o "Padrão" da lista)',
    !!prontoSg && prontoSg.modelo === null && (sg.ultimo() || {}).rotulo === '', prontoSg && String(prontoSg.modelo))
  await sg.c.encerrar()

  // 7. As regras puras (`modelos.js`).
  checar('V15: nomes de gente', M.nomeDoModelo('claude-opus-5[1m]') === 'Opus 5 (1M)' && M.nomeDoModelo('claude-haiku-4-5-20251001') === 'Haiku 4.5' &&
    M.nomeDoModelo('claude-fable-5-1') === 'Fable 5.1', M.nomeDoModelo('claude-opus-5[1m]'))
  checar('V15: o botão vem em partes (nome, contexto longo, esforço) — o pé estreito tira só a do contexto',
    JSON.stringify(M.partesDoBotao('Opus 5 (1M)', 'xhigh').map(p => p.parte)) === '["nome","contexto","esforco"]' &&
    M.rotuloDoBotao('Opus 5 (1M)', 'xhigh') === 'Opus 5 (1M) · extra-alto' && M.partesDoBotao('Haiku 4.5', null).length === 1,
    JSON.stringify(M.partesDoBotao('Opus 5 (1M)', 'xhigh')))
  const itemOpus = M.listaDeModelos(LISTA_MEDIDA)[1]
  checar('V15: esforço não dito, modelo que aceita → o padrão do agente (alto), marcado como suposto',
    JSON.stringify(M.esforcoMostrado(null, itemOpus)) === '{"nivel":"high","suposto":true}', JSON.stringify(M.esforcoMostrado(null, itemOpus)))
  // A conta do agente, medida em 18/09/2026 (hook `PostModelSwitch`): 45.883 tokens, cache de 1 h, para o Haiku → US$ 0,0918.
  const troca = M.custoDaTroca({ contexto: 45883, ttlMs: 60 * 60 * 1000, destino: 'claude-haiku-4-5-20251001' })
  checar('⛔ V15: o custo da troca é a MESMA conta que o agente faz depois (medida: US$ 0,0918)', Math.abs(troca.usd - 0.0918) < 0.00005, troca.usd)
  const troca5 = M.custoDaTroca({ contexto: 100000, ttlMs: 5 * 60 * 1000, destino: 'claude-sonnet-5' })
  checar('V15: cache de 5 min usa a escrita de 5 min (1,25×)', Math.abs(troca5.usd - 0.25) < 1e-9, troca5.usd)

  const lista = M.listaDeModelos(LISTA_MEDIDA)
  const agora = Date.parse('2026-09-18T12:00:00Z')
  const quente = { contextoAgora: 92000, cache: { desdeMs: agora - 10 * 60 * 1000, ttlMs: 60 * 60 * 1000, suposto: false } }
  const aviso = M.avisoDaTroca({ lista, emUso: 'claude-opus-5[1m]', valor: 'sonnet', resumo: quente, agoraMs: agora })
  checar('⛔ V15: cache quente → aviso ANTES de trocar, com minutos, tokens e dinheiro',
    !!aviso && aviso.minutos === 50 && /50 min/.test(aviso.texto) && /Sonnet 5/.test(aviso.texto) && /92 mil tokens/.test(aviso.texto) && /US\$ 0,37/.test(aviso.texto),
    aviso && aviso.texto)
  const vencido = { ...quente, cache: { ...quente.cache, desdeMs: agora - 61 * 60 * 1000 } }
  checar('V15: cache vencido → sem aviso (a próxima mensagem relê de qualquer jeito)', M.avisoDaTroca({ lista, emUso: 'claude-opus-5[1m]', valor: 'sonnet', resumo: vencido, agoraMs: agora }) === null)
  checar('⛔ V15: o mesmo modelo por outro nome (Padrão ↔ Opus 1M) → sem aviso: o cache é do modelo',
    M.avisoDaTroca({ lista, emUso: 'claude-opus-5[1m]', valor: 'default', resumo: quente, agoraMs: agora }) === null)
  // O que foi medido UMA vez não aparece na tela como lei: o aviso do esforço diz "pode", e o dinheiro da troca é
  // dito como estimativa (a conta usa o preço normal do modelo; preço de contexto longo não foi verificado).
  const htmlDoPainel = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'painel', 'painel.html'), 'utf8')
  const avisoDoEsforco = (/<p id="esforco-aviso"[^>]*>([^<]*)</.exec(htmlDoPainel) || [])[1] || ''
  checar('V15: o aviso do esforço não afirma como certo o que foi medido uma vez ("pode")', / pode /.test(avisoDoEsforco), avisoDoEsforco)
  checar('V15: o valor em dinheiro da troca de modelo é dito como estimativa', !!aviso && /estimad/.test(aviso.texto), aviso && aviso.texto)
  checar('V15: conversa que ainda não respondeu → sem aviso', M.avisoDaTroca({ lista, emUso: 'claude-opus-5[1m]', valor: 'sonnet', resumo: { contextoAgora: 0, cache: null }, agoraMs: agora }) === null)
}

// ─────────────────────────────────────────────────────────────────────────────
// V16 — OS AGENTES EM PARALELO: os eventos de tarefa viram o estado do mapa
// ─────────────────────────────────────────────────────────────────────────────
// O dublê entrega a MESMA sequência que o SDK 0.3.261 entregou na sonda ao vivo de 18/09/2026 (dois níveis de
// agente e um comando em segundo plano; depois, um agente em primeiro plano): a lista chegando antes do
// `task_started`, o `local_bash` misturado, o segundo nível sem pai no evento e com a chamada dele numa mensagem
// de dentro do primeiro, a descrição do progresso virando "Running …".
{
  const Ag = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agentes.js'))
  const conversaDeAgentes = async ({ semStopTask = false, stopFalha = false, prazoDoPararAgenteMs = null } = {}) => {
    const eventos = []
    const chamadas = { stopTask: [], opcoes: [] }
    const fila = []
    let esperando = null
    const c = new Conversa({
      cwd: REPO, id: 'teste-v16', aoEvento: e => eventos.push(e), prazoDoPararAgenteMs,
      carregarSdk: () => Promise.resolve({
        query: ({ options }) => {
          chamadas.opcoes.push(options)
          const consulta = {
            accountInfo: () => Promise.resolve({ email: 'pessoa@exemplo.com' }),
            [Symbol.asyncIterator]: () => ({
              next: () => {
                if (fila.length) return Promise.resolve({ value: fila.shift(), done: false })
                return new Promise(r => {
                  esperando = r
                  options.abortController.signal.addEventListener('abort', () => r({ value: undefined, done: true }))
                })
              },
              return: () => Promise.resolve({ value: undefined, done: true }),
            }),
          }
          if (!semStopTask) consulta.stopTask = async id => { chamadas.stopTask.push(id); if (stopFalha) throw new Error('no such task') }
          return consulta
        },
      }),
    })
    await c.iniciar()
    const emitir = async (...ms) => {
      for (const m of ms) { if (esperando) { const r = esperando; esperando = null; r({ value: m, done: false }) } else fila.push(m) ; await esperar(2) }
      await esperar(20)
    }
    // Sem evento nenhum (o produto de antes), um vazio que deixa cada critério vermelho em vez de derrubar a suíte.
    const ultimo = () => eventos.filter(e => e.tipo === 'agentes').pop() || { vivos: [], rodando: -1 }
    const porId = id => (ultimo() || { vivos: [] }).vivos.find(a => a.id === id) || {}
    return { c, eventos, chamadas, emitir, ultimo, porId }
  }
  const S = 'sessao-v16'
  const sis = (subtype, extra) => ({ type: 'system', subtype, session_id: S, uuid: 'u', ...extra })
  const N1 = 'a33ebf67768b04a3f', N2 = 'ab55b97d8b69a89a7', BASH = 'bah9mrkcu'
  const T1 = 'toolu_nivel_um', T2 = 'toolu_nivel_dois'

  const v = await conversaDeAgentes()
  checar('V16: o processo novo começa com a lista de agentes vazia (e avisa)', !!v.ultimo() && v.ultimo().vivos.length === 0 && v.ultimo().rodando === 0)
  checar('V16: o resumo de progresso dos agentes fica DESLIGADO, por escrito (custo estimado, ver agente.js)',
    v.chamadas.opcoes[0] && v.chamadas.opcoes[0].agentProgressSummaries === false, String(v.chamadas.opcoes[0] && v.chamadas.opcoes[0].agentProgressSummaries))

  // 1. Nasce o primeiro nível: a lista chega ANTES do `task_started` (a ordem medida).
  await v.emitir(
    sis('background_tasks_changed', { tasks: [{ task_id: N1, task_type: 'local_agent', description: 'sonda nivel 1' }] }),
    sis('task_started', { task_id: N1, tool_use_id: T1, description: 'sonda nivel 1', subagent_type: 'general-purpose', is_backgrounded: true, spawn_depth: 1, task_type: 'local_agent', prompt: 'x' }))
  let a1 = v.porId(N1)
  checar('⛔ V16: `task_started` de agente vira um agente RODANDO no mapa, com nome, tipo e nível',
    v.ultimo().rodando === 1 && a1.estado === 'rodando' && a1.nome === 'sonda nivel 1' && a1.tipo === 'general-purpose' && a1.profundidade === 1 && a1.chamada === T1,
    JSON.stringify(a1))

  // 2. O segundo nível: a chamada dele chega numa mensagem de DENTRO do primeiro; o `task_started` vem sem pai.
  await v.emitir(
    { type: 'assistant', parent_tool_use_id: T1, message: { id: 'm2', content: [{ type: 'tool_use', id: T2, name: 'Agent', input: { description: 'sonda nivel 2' } }] }, session_id: S },
    sis('task_progress', { task_id: N1, tool_use_id: T1, description: 'sonda nivel 2', subagent_type: 'general-purpose', usage: { total_tokens: 32422, tool_uses: 1, duration_ms: 2697 }, last_tool_name: 'Agent' }),
    sis('background_tasks_changed', { tasks: [{ task_id: N1, task_type: 'local_agent', description: 'sonda nivel 1' }, { task_id: N2, task_type: 'local_agent', description: 'sonda nivel 2' }] }),
    sis('task_started', { task_id: N2, tool_use_id: T2, description: 'sonda nivel 2', subagent_type: 'general-purpose', is_backgrounded: true, spawn_depth: 2, task_type: 'local_agent' }))
  a1 = v.porId(N1)
  const a2 = v.porId(N2)
  checar('⛔ V16: o segundo nível acha o pai pela mensagem de dentro do primeiro (o evento não traz pai)',
    a2.pai === N1 && a2.profundidade === 2 && v.ultimo().rodando === 2, JSON.stringify({ pai: a2.pai, prof: a2.profundidade, rodando: v.ultimo().rodando }))
  checar('⛔ V16: `task_progress` dá tokens, ferramentas e a última ferramenta — e a descrição dele é a ATIVIDADE, nunca o nome',
    a1.tokens === 32422 && a1.ferramentas === 1 && a1.ultimaFerramenta === 'Agent' && a1.nome === 'sonda nivel 1' && a1.atividade === 'sonda nivel 2',
    JSON.stringify({ t: a1.tokens, f: a1.ferramentas, u: a1.ultimaFerramenta, nome: a1.nome, at: a1.atividade }))

  // 2b. O que acontece DENTRO de um subagente não é fala do agente principal. Uma linha de ferramenta na
  // conversa fecha o balão da resposta que ainda está sendo escrita — a resposta sairia picada, com o
  // trabalho do subagente atribuído ao principal (a sonda viu `tool_use` de subagente chegando depois do
  // `result` do turno). O que ele faz mora no mapa (última ferramenta, atividade).
  const ferramentasAntes = v.eventos.filter(e => e.tipo === 'ferramenta').length
  checar('⛔ V16: ferramenta usada DENTRO de um subagente não vira linha da conversa principal',
    ferramentasAntes === 0, JSON.stringify(v.eventos.filter(e => e.tipo === 'ferramenta').map(e => e.nome)))
  await v.emitir({ type: 'stream_event', parent_tool_use_id: T1, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'texto do subagente' } }, session_id: S })
  checar('V16: nem o texto de um subagente, se chegar em pedaços, entra no balão do principal',
    !v.eventos.some(e => e.tipo === 'texto'), JSON.stringify(v.eventos.filter(e => e.tipo === 'texto')))
  await v.emitir({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm-principal', content: [{ type: 'tool_use', id: 'toolu_principal', name: 'Read', input: { file_path: 'a.txt' } }] }, session_id: S })
  checar('CONTROLE V16: a ferramenta do agente PRINCIPAL continua virando linha da conversa',
    v.eventos.filter(e => e.tipo === 'ferramenta').length === 1, JSON.stringify(v.eventos.filter(e => e.tipo === 'ferramenta').map(e => e.nome)))

  // 3. Um comando em segundo plano (de dentro do segundo nível): não é agente.
  await v.emitir(
    sis('background_tasks_changed', { tasks: [{ task_id: N2, task_type: 'local_agent', description: 'sonda nivel 2' }, { task_id: BASH, task_type: 'local_bash', description: 'Sleep for 40 seconds' }, { task_id: N1, task_type: 'local_agent', description: 'sonda nivel 1' }] }),
    sis('task_started', { task_id: BASH, owned_by_subagent: true, tool_use_id: 'toolu_bash', description: 'Sleep for 40 seconds', is_backgrounded: true, task_type: 'local_bash' }))
  checar('⛔ V16: comando em segundo plano (`local_bash`) não é agente: não entra no mapa nem na conta',
    !v.porId(BASH).id && v.ultimo().rodando === 2 && v.ultimo().vivos.length === 2, JSON.stringify(v.ultimo().vivos.map(a => a.id)))

  // 4. A lista SUBSTITUI: o primeiro nível saiu dela, sem notificação ainda → não roda mais.
  await v.emitir(sis('background_tasks_changed', { tasks: [{ task_id: N2, task_type: 'local_agent', description: 'sonda nivel 2' }, { task_id: BASH, task_type: 'local_bash', description: 'Sleep' }] }))
  checar('⛔ V16: `background_tasks_changed` substitui a lista: quem saiu dela deixa de rodar, mesmo sem notificação',
    v.porId(N1).estado === 'terminou' && v.ultimo().rodando === 1 && v.porId(N2).estado === 'rodando', JSON.stringify({ n1: v.porId(N1).estado, rodando: v.ultimo().rodando }))

  // 5. O fim de cada um: `task_updated` + `task_notification` (o resumo final e o uso).
  await v.emitir(
    sis('task_updated', { task_id: N1, patch: { status: 'completed', end_time: 1789755341596 } }),
    sis('task_notification', { task_id: N1, tool_use_id: T1, status: 'completed', output_file: 'x', summary: 'Aguardando o resultado do agente...', usage: { total_tokens: 34755, tool_uses: 1, duration_ms: 5870 } }))
  a1 = v.porId(N1)
  checar('⛔ V16: `task_notification` fecha o agente com o resumo, os tokens e a duração do agente',
    a1.estado === 'terminou' && a1.resumo === 'Aguardando o resultado do agente...' && a1.tokens === 34755 && a1.duracaoMs === 5870 && a1.fimMs === 1789755341596 && a1.atividade === null,
    JSON.stringify(a1))
  await v.emitir(sis('task_updated', { task_id: N2, patch: { status: 'failed', error: 'deu errado' } }))
  checar('V16: `task_updated` com `failed` → falhou, com o erro', v.porId(N2).estado === 'falhou' && v.porId(N2).erro === 'deu errado' && v.ultimo().rodando === 0, v.porId(N2).estado)

  // 6. Primeiro plano: não passa pela lista (medido), e a lista não o derruba.
  const FG = 'a80f8c1e172fb421e'
  await v.emitir(
    sis('task_started', { task_id: FG, tool_use_id: 'toolu_fg', description: 'sonda longa', subagent_type: 'general-purpose', is_backgrounded: false, spawn_depth: 1, task_type: 'local_agent' }),
    sis('background_tasks_changed', { tasks: [] }))
  checar('⛔ V16: agente em PRIMEIRO plano conta como rodando, e a lista de segundo plano (onde ele nunca aparece) não o derruba',
    v.porId(FG).estado === 'rodando' && v.ultimo().rodando === 1, JSON.stringify({ e: v.porId(FG).estado, rodando: v.ultimo().rodando }))

  // 7. Parar um agente: `stopTask` com o id dele; o fim chega pelo caminho normal.
  let ok = await v.c.pararAgente(FG)
  checar('⛔ V16: parar um agente chama `stopTask(id)` uma vez, e o cartão fica "parando" até o fim chegar',
    ok === true && JSON.stringify(v.chamadas.stopTask) === JSON.stringify([FG]) && v.porId(FG).parando === true, JSON.stringify(v.chamadas.stopTask))
  checar('V16: pedir de novo enquanto ele para não chama de novo', (await v.c.pararAgente(FG)) === false && v.chamadas.stopTask.length === 1)
  await v.emitir(sis('task_notification', { task_id: FG, status: 'stopped', output_file: '', summary: '' }))
  checar('V16: `stopped` → parado', v.porId(FG).estado === 'parado' && v.porId(FG).parando === false && v.ultimo().rodando === 0, v.porId(FG).estado)
  ok = await v.c.pararAgente(N1)
  checar('⛔ V16: agente que já terminou (ou id que não existe) não chega ao `stopTask`',
    ok === false && (await v.c.pararAgente('nao-existe')) === false && (await v.c.pararAgente(123)) === false && v.chamadas.stopTask.length === 1, JSON.stringify(v.chamadas.stopTask))

  // 8. Zerar ao reiniciar: o processo novo não conhece os agentes do anterior.
  await v.emitir(sis('task_started', { task_id: 'a0000000000000vivo', tool_use_id: 'toolu_vivo', description: 'vivo no fim', task_type: 'local_agent', is_backgrounded: true, spawn_depth: 1 }))
  checar('V16 (controle): antes de encerrar há um agente rodando', v.ultimo().rodando === 1)
  await v.c.encerrar()
  checar('⛔ V16: o processo que acaba leva os agentes junto: nenhum segue "rodando"', v.ultimo().rodando === 0 && v.porId('a0000000000000vivo').estado === 'parado',
    JSON.stringify({ rodando: v.ultimo().rodando, e: v.porId('a0000000000000vivo').estado }))
  await v.c.iniciar()
  await esperar(20)
  checar('⛔ V16: reiniciar o processo zera a lista (a doc do SDK manda: ele não repete o que já avisou)', v.ultimo().vivos.length === 0 && v.ultimo().rodando === 0,
    JSON.stringify(v.ultimo().vivos.map(a => a.id)))
  await v.c.encerrar()

  // 9. `stopTask` que falha, e SDK sem `stopTask`.
  const f = await conversaDeAgentes({ stopFalha: true })
  await f.emitir(sis('task_started', { task_id: 'aff', tool_use_id: 't', description: 'x', task_type: 'local_agent', is_backgrounded: true }))
  checar('V16: `stopTask` que falha → `false`, e o cartão volta a poder ser parado', (await f.c.pararAgente('aff')) === false && f.porId('aff').parando === false && f.porId('aff').estado === 'rodando')
  await f.c.encerrar()
  const s = await conversaDeAgentes({ semStopTask: true })
  await s.emitir(sis('task_started', { task_id: 'ass', tool_use_id: 't', description: 'x', task_type: 'local_agent', is_backgrounded: true }))
  checar('V16: SDK sem `stopTask` → não finge que parou', (await s.c.pararAgente('ass')) === false && s.porId('ass').parando === false)
  await s.c.encerrar()

  // 9b. `stopTask` que dá certo, mas o fim (`stopped`) nunca chega: o "parando…" tem prazo. Sem ele o cartão ficava
  // parando para sempre, e `podeParar` falso impedia uma segunda tentativa.
  const pz = await conversaDeAgentes({ prazoDoPararAgenteMs: 120 })
  await pz.emitir(sis('task_started', { task_id: 'apz', tool_use_id: 't', description: 'x', task_type: 'local_agent', is_backgrounded: true }))
  const pediu = await pz.c.pararAgente('apz')
  const parandoLogo = pz.porId('apz').parando === true
  await esperar(300)
  checar('⛔ V16: sem o fim confirmado dentro do prazo, o cartão sai de "parando" e pode ser parado de novo',
    pediu === true && parandoLogo && pz.porId('apz').parando === false && pz.c.agentes.podeParar('apz'),
    JSON.stringify({ pediu, parandoLogo, parando: pz.porId('apz').parando }))
  checar('V16: e a tela é avisada de que a parada não se confirmou',
    pz.eventos.some(e => e.tipo === 'agenteNaoParou' && e.id === 'apz' && e.motivo === 'semConfirmacao'),
    JSON.stringify(pz.eventos.filter(e => e.tipo === 'agenteNaoParou')))
  await pz.c.encerrar()
  const pzOk = await conversaDeAgentes({ prazoDoPararAgenteMs: 120 })
  await pzOk.emitir(sis('task_started', { task_id: 'aok', tool_use_id: 't', description: 'x', task_type: 'local_agent', is_backgrounded: true }))
  await pzOk.c.pararAgente('aok')
  await pzOk.emitir(sis('task_notification', { task_id: 'aok', status: 'stopped', output_file: '', summary: '' }))
  await esperar(300)
  checar('CONTROLE V16: com o `stopped` chegando a tempo, o prazo não avisa nada',
    pzOk.porId('aok').estado === 'parado' && !pzOk.eventos.some(e => e.tipo === 'agenteNaoParou'))
  await pzOk.c.encerrar()

  // 10. O mapa: o ao vivo junto com o disco (`montarMapa`, o que a tela recebe).
  const doDisco = [
    { id: 'd1', nome: 'da conversa de ontem', tipo: 'Explore', profundidade: 1, pai: null, parado: false, inicioMs: 1000, fimMs: 1000 + (37 * 60 + 3) * 1000, tokensNoFim: 251091, ferramentas: 116, ultimaFerramenta: 'PowerShell' },
    { id: 'd2', nome: 'filho do d1', profundidade: 2, pai: 'd1', parado: true, inicioMs: 2000, fimMs: 5000, tokensNoFim: 900, ferramentas: 2 },
    { id: 'v1', nome: 'nome do disco', tipo: 'general-purpose', profundidade: 1, pai: null, inicioMs: 3000, fimMs: 4000, tokensNoFim: 10, ferramentas: 1 },
    { id: 'orfao', nome: 'pai sumiu', profundidade: 2, pai: 'nao-esta', inicioMs: 4000, fimMs: 4500 },
  ]
  const vivosDoMapa = [{ id: 'v1', chamada: 'tv1', nome: null, tipo: null, profundidade: 1, segundoPlano: true, estado: 'rodando', inicioMs: 3000, fimMs: null,
    tokens: 5000, ferramentas: 3, duracaoMs: null, ultimaFerramenta: 'Read', atividade: 'Lendo', resumo: null, erro: null, parando: false, pai: null }]
  const mapa = Ag.montarMapa({ vivos: vivosDoMapa, doDisco, sessao: { titulo: 'Minha conversa', modelo: 'Opus 5 (1M)', contexto: 449700, viva: true }, podeParar: id => id === 'v1' })
  const noMapa = id => mapa.agentes.find(a => a.id === id) || {}
  checar('⛔ V16: agente só do disco (conversa retomada) aparece terminado, com os tokens e a duração da conta do agente',
    noMapa('d1').estado === 'terminou' && noMapa('d1').tokensTexto === '251 mil tokens' && noMapa('d1').duracaoMs === (37 * 60 + 3) * 1000 && noMapa('d1').ultimaFerramenta === 'PowerShell' && noMapa('d1').podeParar === false,
    JSON.stringify(noMapa('d1')))
  checar('V16: a ficha que diz "parado pela pessoa" vira parado', noMapa('d2').estado === 'parado', noMapa('d2').estado)
  checar('⛔ V16: o ao vivo vale sobre o disco (estado e tokens), e o disco completa o que o ao vivo não tem (nome, tipo)',
    noMapa('v1').estado === 'rodando' && noMapa('v1').tokens === 5000 && noMapa('v1').nome === 'nome do disco' && noMapa('v1').tipo === 'general-purpose' && noMapa('v1').duracaoMs === null && noMapa('v1').podeParar === true,
    JSON.stringify(noMapa('v1')))
  checar('⛔ V16: a árvore — o de segundo nível fica DENTRO do pai; pai que não está na lista sobe para a primeira coluna',
    JSON.stringify(noMapa('d1').filhos) === '["d2"]' && noMapa('d2').pai === 'd1' && noMapa('orfao').pai === null, JSON.stringify({ f: noMapa('d1').filhos, orfao: noMapa('orfao').pai }))
  checar('V16: o botão conta só os que rodam ("1 agente"), e o total inclui os terminados', mapa.rodando === 1 && mapa.rotulo === '1 agente' && mapa.total === 4 && Ag.rotuloDoBotao(2) === '2 agentes' && Ag.rotuloDoBotao(0) === '0 agentes',
    `${mapa.rotulo} / ${mapa.total}`)
  checar('V16: o cartão da sessão: título, viva, e "modelo · contexto"', mapa.sessao.titulo === 'Minha conversa' && mapa.sessao.viva === true && mapa.sessao.linha === 'Opus 5 (1M) · 450 mil tokens no contexto',
    JSON.stringify(mapa.sessao))
  checar('V16: os estados do SDK viram os da tela', ['running', 'pending', 'paused', 'completed', 'failed', 'killed', 'stopped'].map(Ag.estadoDoSdk).join() === 'rodando,rodando,pausado,terminou,falhou,parado,parado')
}

// ─────────────────────────────────────────────────────────────────────────────
// V19 — O LIMITE DO PLANO: o aviso que chega de graça, e a leitura sob encomenda
// ─────────────────────────────────────────────────────────────────────────────

/*
  ⚠️ GUARDA, e ela não é conforto. Rodados contra o motor de ANTES, estes critérios têm de ficar
  VERMELHOS — não derrubar a suíte. Na primeira corrida do "antes x depois" a suíte morreu na
  primeira linha, sem placar nenhum, e uma suíte sem placar é indistinguível de instrumento
  quebrado: não dá para dizer quantos critérios a mudança conquistou.
*/
const ler = async c => (typeof c.lerUsoDoPlano === 'function'
  ? await c.lerUsoDoPlano()
  : { estado: '(este motor não sabe ler o limite)' })

{
  // O aviso empurrado no laço vira evento, com o conteúdo INTEIRO e sem interpretação:
  // quem traduz unidade é um lugar só (`limite.js`), não o motor da conversa.
  const info = {
    status: 'allowed', resetsAt: 1789917600, rateLimitType: 'five_hour',
    unifiedWindows: { five_hour: { utilization: 0.07, resetsAt: 1789917600 }, seven_day: { utilization: 0.64, resetsAt: 1790254800 } },
  }
  const { eventos, dos } = await conversaDeTeste(ctx => {
    ctx.emitir({ type: 'rate_limit_event', rate_limit_info: info, uuid: 'u1', session_id: 's1' })
    ctx.emitir({ type: 'rate_limit_event', uuid: 'u2', session_id: 's1' })   // sem o conteúdo: não pode derrubar nada
    // A fala DEPOIS do aviso sem conteúdo: é ela que prova que o laço seguiu vivo.
    ctx.emitir({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'oi' } } })
    ctx.encerrar()
  })
  await ate(() => dos('limite').length >= 2 && dos('texto').length >= 1)
  // ⚠️ Guarda: com o motor de ANTES não existe evento nenhum, e indexar a lista vazia derrubaria a
  // suíte inteira sem placar — o que é indistinguível de instrumento quebrado. Aqui o caso vira
  // vermelho contado, que é o que a comparação "antes x depois" precisa.
  const limite = i => dos('limite')[i] || {}
  checar('V19: o aviso de limite do laço vira evento para a tela', dos('limite').length === 2, String(dos('limite').length))
  checar('⛔ V19: o conteúdo do aviso passa INTEIRO, sem o motor interpretar unidade',
    JSON.stringify(limite(0).aviso) === JSON.stringify(info), JSON.stringify(limite(0).aviso))
  checar('V19: aviso sem conteúdo não derruba o laço nem inventa número',
    limite(1).aviso === null && eventos.some(e => e.tipo === 'texto'), JSON.stringify(limite(1)))
  /*
    ⚠️ ESTE CRITÉRIO PASSOU A EXIGIR QUE OS AVISOS TENHAM CHEGADO. Escrito só como negativo
    ("nenhuma fala fala de limite"), ele ficava VERDE com o motor de antes, que não produz aviso
    nenhum — verde por vacuidade, o modo de falha que esta casa já pagou. Agora ele compara: dois
    avisos entraram, e a conversa continua com UMA fala só.
  */
  checar('⛔ V19: o aviso de limite NÃO vira fala na conversa (dois avisos, uma fala)',
    dos('limite').length === 2 && dos('texto').length === 1 && dos('texto')[0].texto === 'oi',
    `${dos('limite').length} aviso(s), ${dos('texto').length} fala(s)`)
}
{
  // A leitura sob encomenda, com o método presente.
  let vezes = 0
  const resposta = { rate_limits_available: true, rate_limits: { five_hour: { utilization: 7, resets_at: 'x' } } }
  const alvo = await conversaComUso(async () => { vezes++; return resposta })
  const r = await ler(alvo.c)
  checar('V19: a leitura do limite usa o método do objeto de consulta que já está de pé',
    r.estado === 'ok' && r.resposta === resposta && vezes === 1, JSON.stringify(r.estado))
  checar('⛔ V19: a leitura pede para PULAR a varredura dos arquivos de conversa (senão ela varre 7 dias)',
    alvo.pedidos().length === 1 && alvo.pedidos()[0] && alvo.pedidos()[0].skipBehaviors === true,
    JSON.stringify(alvo.pedidos()))
  // Mesma correção de vacuidade: exige que a leitura TENHA acontecido antes de afirmar o negativo.
  checar('⛔ V19: ler o limite não manda mensagem nenhuma ao agente, nem vira fala na conversa',
    alvo.pedidos().length === 1 && alvo.recebidas().length === 0 && alvo.eventos.every(e => e.tipo !== 'texto'),
    `${alvo.pedidos().length} leitura(s), ${alvo.recebidas().length} mensagem(ns)`)
}
{
  // ⛔ O MÉTODO AUSENTE É CASO NORMAL, e este é o critério que o prova.
  const semMetodo = await conversaDeTeste(ctx => { void ctx })
  const r = await ler(semMetodo.c)
  checar('⛔ V19: método de uso ausente devolve "semMetodo" — sem lançar e sem evento de erro',
    r.estado === 'semMetodo' && !semMetodo.eventos.some(e => e.tipo === 'erro'), JSON.stringify(r))

  const quebrado = await conversaComUso(async () => { throw new Error('rate_limit_error') })
  const r2 = await ler(quebrado.c)
  checar('⛔ V19: leitura recusada volta como "falhou" — e NÃO vira mensagem de erro na tela',
    r2.estado === 'falhou' && /rate_limit_error/.test(String(r2.erro && r2.erro.message)) &&
    !quebrado.eventos.some(e => e.tipo === 'erro'), JSON.stringify(r2.estado))

  const mudo = await conversaComUso(() => new Promise(() => { }), { prazoDoUsoDoPlanoMs: 40 })
  const r3 = await ler(mudo.c)
  checar('⛔ V19: leitura que nunca responde desiste no prazo, em vez de prender a barra para sempre',
    r3.estado === 'falhou' && /prazo/.test(String(r3.erro && r3.erro.message)), JSON.stringify(r3.estado))
}
{
  // Sem conversa de pé não há de quem perguntar — e isso não é erro.
  const { Conversa: C2 } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  const solta = new C2({ cwd: REPO, id: 'sem', aoEvento: () => { } })
  const r = await ler(solta)
  checar('V19: sem conversa aberta, a leitura diz "semConversa" (não é erro, é ausência)',
    r.estado === 'semConversa', JSON.stringify(r))
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou,
  total: resultados.length,
  falhas: resultados.filter(r => !r.ok).map(r => r.nome),
}))
process.exit(passou ? 0 : 1)
