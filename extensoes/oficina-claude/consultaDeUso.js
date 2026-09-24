// A CONSULTA DE USO — perguntar o limite do plano AO VIVO, sem conversa aberta (V20).
//
// ⚠️ POR QUE ISTO EXISTE. A V20 nasceu lendo só o registro que o programa de linha de comando
// deixa no computador, com o raciocínio de que "sem conversa própria não há a quem perguntar".
// O raciocínio estava errado, e foi medido em 21/09/2026 contra o SDK real desta máquina: uma
// consulta sobe com uma fila que NUNCA entrega mensagem, e responde a pergunta de uso sem nunca
// falar com o modelo.
//
//     subir a consulta e responder a 1a pergunta ....... 7,4 s
//     as perguntas seguintes, na mesma consulta ......... 244 ms
//     o registro local, na mesma hora ................... errado por 13 pontos (50 min de idade)
//
// ⚠️ O `cwd` NÃO É A PASTA ABERTA, E ISSO NÃO É DETALHE — É O QUE IMPEDE A CONSULTA DE SE
// DISFARÇAR DE CONVERSA DELE. Medido: subir a consulta grava um registro em
// `~/.claude/sessions/<pid>.json` com `"kind":"interactive"` e `"entrypoint":"claude-vscode"` —
// indistinguível de uma conversa de verdade. O `sessaoAtiva.js` escolhe "a conversa desta janela"
// justamente por entrypoint + pasta + processo vivo + registro mais novo. Com o `cwd` da pasta
// aberta, esta consulta (que não tem gasto nenhum) venceria a conversa real e o mostrador de
// tokens passaria a mostrar zero — quebrando o `t196` e o `t201`, que já estão entregues.
// Com o `cwd` fora da pasta, ela nunca é candidata.
//
// ⚠️ SOBRE O REGISTRO QUE ELA DEIXA — e aqui a primeira versão deste comentário estava ERRADA, do
// jeito que esta casa não aceita: eu tinha escrito "o registro fica para trás quando o processo
// morre", a partir de UM caso. Medido de novo, com cuidado: `descartar()` derruba o processo em
// menos de 1 s e **o próprio agente apaga o registro dele** (`ENOENT` na tentativa de limpar).
// O arquivo órfão que eu tinha visto veio de um `process.exit()` logo depois do aborto — ou seja,
// de matar o processo antes de ele se limpar. Fica valendo o que foi medido: saída ordenada não
// deixa lixo; morte abrupta deixa. Há caso de teste sobre isto em `testes/consulta_de_uso.mjs`.
//
// ⚠️ O CUSTO ESTÁ MEDIDO E É REAL: o processo do agente parado ocupa ~232 MB. É o preço de a
// faixa dizer a verdade, e está declarado junto da versão, onde as trocas do produto ficam
// registradas. O cache em arquivo abaixo existe para que esse preço seja pago UMA vez por máquina,
// e não uma vez por janela aberta.

'use strict'

const os = require('os')
const path = require('path')
const fs = require('fs')

/** O nome do método de uso no objeto de consulta — o mesmo que a V19 já usava. */
const { METODO_DE_USO } = require('./limite')

const PACOTE = '@anthropic-ai/claude-agent-sdk'

/** Quanto se espera por uma resposta antes de desistir desta pergunta (a próxima tenta de novo). */
const PRAZO_DA_PERGUNTA_MS = 30 * 1000

/** Acima desta idade o cache em arquivo não serve mais, e vale a pena subir a consulta. */
const CACHE_VELHO_MS = 5 * 60 * 1000

/** O arquivo onde a resposta é guardada para as outras janelas. */
const NOME_DO_CACHE = 'oficina-uso-do-plano.json'

/**
 * SÓ ESTES CAMPOS SAEM DA RESPOSTA PARA O DISCO.
 *
 * ⚠️ A resposta inteira traz coisas que não têm por que ser gravadas em arquivo nenhum: a sessão,
 * o tipo de assinatura, e um detalhamento por modelo com ids. O que a faixa e o detalhe usam são
 * estes quatro campos, e é só o que se guarda — mesma regra do motor, que descarta o identificador
 * de conta do registro local.
 */
const CAMPOS_GUARDADOS = ['five_hour', 'seven_day', 'seven_day_breakdown', 'extra_usage']

/** Onde o cache mora: a pasta que quem chama indicar, ou a temporária do sistema. */
function caminhoDoCache(pasta) {
  return path.join(pasta || os.tmpdir(), NOME_DO_CACHE)
}

/**
 * Só os campos que interessam, e nada mais. `null` quando não há o que guardar.
 *
 * ⚠️ "ESTA CONTA NÃO TEM LIMITE DE PLANO" TAMBÉM É RESPOSTA, E PRECISA SER GUARDADA. Achado por
 * revisor independente, com sonda: quando o agente devolve `rate_limits_available: false` (chave
 * de interface, outro provedor, escopo faltando), a versão anterior desta função devolvia `null`,
 * nada era gravado, e o atalho do cache nunca engatava — cada janela subia o seu agente de
 * 232 MB a cada 5 minutos, para sempre, e a faixa piscava no mesmo ritmo.
 */
function limparResposta(resposta) {
  const rl = resposta && typeof resposta === 'object'
    ? (resposta.rate_limits && typeof resposta.rate_limits === 'object' ? resposta.rate_limits : resposta)
    : null
  if (resposta && typeof resposta === 'object' && resposta.rate_limits_available === false) {
    return { semLimite: true }
  }
  if (!rl || typeof rl !== 'object') return null
  const fora = {}
  for (const campo of CAMPOS_GUARDADOS) if (rl[campo] !== undefined) fora[campo] = rl[campo]
  if (!fora.five_hour && !fora.seven_day) return null
  return fora
}

/**
 * Guarda a resposta para as outras janelas. Nunca lança: falhar aqui não pode derrubar a faixa.
 *
 * ⚠️ GRAVA NUM ARQUIVO AO LADO E DEPOIS RENOMEIA. Apontado por revisor: duas janelas gravando
 * direto no caminho final podem deixar o arquivo truncado, e quem ler naquele instante trata como
 * "sem cache" e sobe um agente que não precisava. `rename` no mesmo volume é atômico.
 */
async function gravarCache(pasta, resposta, quando = Date.now()) {
  const limpa = limparResposta(resposta)
  if (!limpa) return false
  const destino = caminhoDoCache(pasta)
  const aoLado = `${destino}.${process.pid}.tmp`
  try {
    await fs.promises.writeFile(aoLado, JSON.stringify({ colhidoEm: quando, rate_limits: limpa }), 'utf8')
    await fs.promises.rename(aoLado, destino)
    return true
  } catch {
    try { await fs.promises.unlink(aoLado) } catch { /* nem chegou a existir */ }
    return false
  }
}

/**
 * Lê o cache. Devolve `{colhidoEm, rate_limits}` ou `null`. Nunca lança.
 *
 * ⚠️ CARIMBO NO FUTURO VALE COMO AGORA. Achado por revisor, com sonda: se o relógio da máquina
 * andar para trás (correção de horário depois de um boot com a hora errada, dual-boot, máquina
 * virtual restaurada), o carimbo gravado antes fica no futuro — e aí `agora() - colhidoEm` dá
 * negativo, o cache passa a ser "fresco" para sempre, a consulta ao vivo NUNCA mais é feita e a
 * faixa congela num número velho. Sem idade na tela (ordem dele), nada denunciaria.
 */
async function lerCache(pasta, agora = () => Date.now()) {
  try {
    const d = JSON.parse(await fs.promises.readFile(caminhoDoCache(pasta), 'utf8'))
    if (!d || typeof d !== 'object' || typeof d.colhidoEm !== 'number') return null
    if (!d.rate_limits || typeof d.rate_limits !== 'object') return null
    const agoraMs = agora()
    // Carimbo no futuro é dado suspeito: vale como JÁ VENCIDO, para a consulta ao vivo acontecer
    // agora e corrigir. (Tratá-lo como "agora" ainda o deixaria fresco por cinco minutos.)
    return d.colhidoEm > agoraMs ? { ...d, colhidoEm: agoraMs - CACHE_VELHO_MS } : d
  } catch { return null }
}

/**
 * A consulta viva.
 *
 * ⚠️ ELA SOBE PREGUIÇOSA. Ativar a extensão não paga os 7 s: quem chama pergunta, e só na primeira
 * pergunta a consulta nasce. Antes disso a faixa já está na tela com o número do cache ou do
 * registro local — que é o "perder nunca" dele.
 *
 * ⚠️ NUNCA LANÇA E NUNCA VIRA MENSAGEM VERMELHA. Falha de rede, agente fechado, método sumido:
 * tudo volta como estado, e quem chama cai para o piso. Uma barra de limite não pode interromper
 * quem está trabalhando para avisar que não conseguiu ler o limite.
 */
function criarConsulta({
  carregarSdk = () => import(PACOTE),
  cwd = os.tmpdir(),
  prazoMs = PRAZO_DA_PERGUNTA_MS,
  agora = () => Date.now(),
} = {}) {
  let consulta = null
  let controle = null
  let subindo = null
  let descartado = false
  let perguntas = 0
  /** O gerador da fila, guardado só para ser fechado quando a consulta cai (ver `subir`). */
  let fila = null

  /** Sobe a consulta uma vez só; chamadas concorrentes esperam a mesma subida. */
  function subir() {
    if (consulta) return Promise.resolve(consulta)
    if (subindo) return subindo
    subindo = (async () => {
      const sdk = await carregarSdk()
      const query = sdk && sdk.query
      if (typeof query !== 'function') throw new Error('o pacote carregou mas não expõe query()')
      /*
        A fila que nunca entrega: é ela que faz a consulta existir sem nunca falar com o modelo.

        ⚠️ ELA É GUARDADA PARA SER FECHADA NO DESCARTE. O SDK percorre a fila com `for await` e
        NUNCA chama `return()` nela — então, sem isto, cada subida deixava um gerador suspenso num
        `await` que jamais resolve. Um de cada vez é pequeno; com uma subida a cada 5 minutos,
        vira vazamento lento. Achado por revisor independente, lendo o `streamInput` do SDK.
      */
      const filaVazia = (async function* () { await new Promise(() => { }) })()
      fila = filaVazia
      controle = new AbortController()
      const c = query({
        prompt: filaVazia,
        options: {
          cwd,
          abortController: controle,
          /*
            ⚠️ ISOLAMENTO — E ISTO FOI ACHADO POR REVISOR, COM MEDIÇÃO.

            Sem `settingSources`, o SDK carrega TODAS as camadas de configuração do disco (o tipo
            diz: *"When omitted, all sources are loaded"*), e com elas os hooks do usuário. Medido
            em 21/09/2026, contando os arquivos de estado de hook desta máquina antes e depois:

                sem `settingSources`  →  363 → 364   (o hook `SessionStart` de quem usa RODOU)
                com `settingSources: []` →  364 → 364   (calado, e o número continua vindo)

            Uma faixa que mostra porcentagem não tem por que disparar hook nenhum de ninguém, de
            5 em 5 minutos, numa sessão fabricada sem pasta de projeto. `[]` é o modo de isolamento
            documentado pelo próprio SDK.
          */
          settingSources: [],
        },
      })
      if (descartado) {
        try { controle.abort() } catch { /* já morreu */ }
        throw new Error('descartada durante a subida')
      }
      consulta = c
      return c
    })()
    subindo.catch(() => { }).then(() => { subindo = null })
    return subindo
  }

  /** Derruba o que estiver de pé (a próxima pergunta sobe de novo). */
  function derrubar() {
    if (controle) { try { controle.abort() } catch { /* já morreu */ } }
    // O gerador suspenso não se fecha sozinho: o SDK não o devolve. Fechar aqui é o que impede
    // um frame de gerador (e uma promessa pendurada) por subida.
    if (fila && typeof fila.return === 'function') { try { fila.return() } catch { /* já fechado */ } }
    fila = null
    controle = null
    consulta = null
  }

  /**
   * Pergunta o uso.
   *
   * Estados possíveis, e nenhum deles é erro na cara de ninguém:
   *   `ok`        — veio resposta (em `resposta`);
   *   `semMetodo` — o método experimental sumiu numa atualização: quem chama usa o piso, para sempre;
   *   `falhou`    — rede, prazo, cota, agente fechado: quem chama usa o piso, e tenta de novo depois.
   */
  async function perguntar() {
    if (descartado) return { estado: 'falhou', erro: new Error('consulta descartada') }
    let c = null
    try {
      /*
        ⚠️ O PRAZO VALE PARA A SUBIDA TAMBÉM, e não só para a pergunta. Apontado por revisor: se
        o carregamento do pacote nunca assentasse, `perguntar()` nunca voltava, a rodada da faixa
        nunca terminava e o relógio dela NUNCA se rearmava — a faixa congelava em silêncio até
        alguém fechar a janela. Um relógio que não se recupera sozinho é pior que uma leitura
        perdida.
      */
      let prazoDaSubida = null
      const subida = await Promise.race([
        subir(),
        new Promise(resolver => {
          prazoDaSubida = setTimeout(() => resolver({ __semSubida: true }), prazoMs)
          if (prazoDaSubida && typeof prazoDaSubida.unref === 'function') prazoDaSubida.unref()
        }),
      ])
      if (prazoDaSubida) clearTimeout(prazoDaSubida)
      if (subida && subida.__semSubida) {
        derrubar()
        return { estado: 'falhou', erro: new Error('a consulta do limite não subiu no prazo') }
      }
      c = subida
    } catch (e) { return { estado: 'falhou', erro: e } }
    const metodo = c[METODO_DE_USO]
    if (typeof metodo !== 'function') return { estado: 'semMetodo' }
    let prazo = null
    try {
      // ⚠️ `skipBehaviors: true` não é enfeite: sem ele o agente varre todos os arquivos de conversa
      // dos últimos 7 dias para preencher uma seção que a faixa não usa.
      const resposta = await Promise.race([
        metodo.call(c, { skipBehaviors: true }),
        new Promise(resolver => {
          prazo = setTimeout(() => resolver({ __semResposta: true }), prazoMs)
          if (prazo && typeof prazo.unref === 'function') prazo.unref()
        }),
      ])
      if (resposta && resposta.__semResposta) {
        // Uma consulta que não responde mais está morta de pé: derruba, para a próxima subir nova.
        derrubar()
        return { estado: 'falhou', erro: new Error('a pergunta do limite passou do prazo') }
      }
      perguntas++
      return { estado: 'ok', resposta, quando: agora() }
    } catch (e) {
      derrubar()
      return { estado: 'falhou', erro: e }
    } finally {
      if (prazo) clearTimeout(prazo)
    }
  }

  function descartar() {
    descartado = true
    derrubar()
  }

  return {
    perguntar, descartar,
    get viva() { return consulta !== null },
    get perguntas() { return perguntas },
    get cwd() { return cwd },
  }
}

module.exports = {
  criarConsulta, lerCache, gravarCache, limparResposta, caminhoDoCache,
  METODO_DE_USO, PRAZO_DA_PERGUNTA_MS, CACHE_VELHO_MS, NOME_DO_CACHE, CAMPOS_GUARDADOS,
}
