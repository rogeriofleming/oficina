// O LIMITE DO PLANO — quanto já se gastou da janela de 5 h e da semana.
//
// Pedido do dono do produto, com as palavras dele: "alguma coisa que mostrasse na barra
// superior o limite da sessao e semanal, o tempo todo na tela". Este arquivo é o MOTOR:
// não importa `vscode`, não lê disco, não fala com a rede. Ele só traduz o que as três
// fontes entregam num estado único, e transforma esse estado no texto da barra e na dica.
//
// ⚠️ AS TRÊS FONTES FALAM UNIDADES DIFERENTES, E MISTURAR ERRA POR 100×.
//
//   fonte                         utilização        quando vira
//   ───────────────────────────── ───────────────── ─────────────────────
//   método de uso do agente       por cento (7)     texto ISO 8601
//   aviso empurrado no laço       fração (0,07)     segundos desde 1970
//   registro local do programa    por cento (7)     texto ISO 8601
//
// Foi medido, lado a lado, antes de este arquivo existir. É por isso que cada fonte tem a
// sua função de entrada e NENHUMA outra parte do produto enxerga o formato cru.
//
// ⚠️ SÓ EXISTE PERCENTUAL. Medido: os campos de quanto falta em dinheiro vieram todos
// vazios. Este arquivo não calcula "quanto sobra" em tokens nem em dinheiro, e não deve
// passar a calcular — seria número inventado num lugar onde a pessoa confia.
//
// ⚠️ NADA QUE IDENTIFIQUE A CONTA ENTRA NO ESTADO. O registro local traz um identificador
// de conta junto dos números; ele é ignorado de propósito, e há critério que cobra isso.
// O que este motor produz vai para a tela e para a dica, onde qualquer um lê por cima do
// ombro de quem está trabalhando.

'use strict'

/**
 * A cadência da consulta: uma a cada 5 minutos.
 *
 * ⚠️ NÃO É CHUTE DE "BOA PRÁTICA". O endereço que serve este dado tem cota própria e
 * apertada: medido, quatro chamadas seguidas passam e a quinta volta recusada pedindo
 * 300 segundos. É também a cadência que o próprio programa de linha de comando usa para
 * regravar o registro local. Um relógio de um em um minuto derruba o número da barra para
 * "não sei" quase o tempo todo — ou seja, consultar mais deixa a pessoa sabendo MENOS.
 */
const INTERVALO_DA_CONSULTA_MS = 5 * 60 * 1000

/** Daqui em diante o mostrador passa a dizer a idade do número, em vez de deixá-lo passar por "agora". */
const IDADE_VELHA_MS = 10 * 60 * 1000

/**
 * Acima disto o número não se mostra mais.
 *
 * É o mesmo corte que o programa de linha de comando aplica ao registro local dele: passada
 * uma hora, a entrada é descartada em vez de reaproveitada. Um número de ontem desenhado
 * como se fosse de agora é pior que traço nenhum.
 */
const IDADE_DESCARTAR_MS = 60 * 60 * 1000

/** A partir daqui o mostrador avisa que a janela está apertando. */
const PERTO_DO_TETO = 90

/**
 * O nome do método de uso no objeto de consulta do agente.
 *
 * ⚠️ ELE SE DECLARA EXPERIMENTAL NO PRÓPRIO NOME, e o tipo avisa que o nome MUDA quando a
 * interface estabilizar. Por isso o produto nunca o chama direto: pergunta se existe e,
 * quando não existir, cai para o registro local em silêncio. Sumir numa atualização é caso
 * NORMAL aqui dentro, não defeito — e é a razão de o registro local existir como piso.
 */
const METODO_DE_USO = 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET'

/** Traço de "ainda não sei", e não zero: zero é uma afirmação, e seria falsa. */
const SEM_NUMERO = '–'

/** O estado vazio — antes de qualquer fonte responder. */
function estadoInicial() {
  return {
    cincoHoras: null,      // { porcento, viraEmMs }
    seteDias: null,
    origem: null,          // 'agente' | 'aviso' | 'registro'
    lidoEmMs: null,        // quando a informação foi COLHIDA (não quando foi desenhada)
    disponivel: null,      // false = esta conta não tem limite de plano para mostrar
    proximaConsultaMs: 0,  // antes disto, não se consulta (cota)
  }
}

/** Por cento inteiro, de 0 a 100 — ou `null` quando não veio número nenhum. */
function porCento(valor, escala = 1) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
  const v = Math.round(valor * escala)
  return Math.max(0, Math.min(100, v))
}

/** Um instante, venha ele como texto ISO ou como segundos desde 1970. */
function instante(valor, emSegundos = false) {
  if (emSegundos) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return null
    return Math.round(valor * 1000)
  }
  if (typeof valor !== 'string' || !valor) return null
  const t = Date.parse(valor)
  return Number.isFinite(t) ? t : null
}

function janela(porcentoValor, viraEmMs) {
  if (porcentoValor === null) return null
  return { porcento: porcentoValor, viraEmMs: viraEmMs === null ? undefined : viraEmMs }
}

/**
 * O CORPO COM AS JANELAS, venha ele embrulhado ou solto.
 *
 * ⚠️ AS DUAS FORMAS EXISTEM, E ISSO FOI MEDIDO NO ARQUIVO DE VERDADE. A resposta do agente traz as
 * janelas dentro de `rate_limits`; o registro local do programa de linha de comando guarda o MESMO
 * conteúdo **solto**, com `five_hour` e `seven_day` no primeiro nível e sem o `rate_limits_available`
 * ao lado. Escrito só para a primeira forma, este arquivo devolvia "não sei" contra o arquivo real —
 * e a barra nasceria com traço justamente no caso que o registro local existe para cobrir.
 */
function corpoDosLimites(resposta) {
  if (!resposta || typeof resposta !== 'object') return null
  if (resposta.rate_limits && typeof resposta.rate_limits === 'object') return resposta.rate_limits
  if (resposta.five_hour || resposta.seven_day) return resposta
  return null
}

/**
 * FONTE 1 — a resposta do método de uso do agente (por cento inteiro, hora em texto ISO).
 *
 * Devolve `null` quando a resposta não traz as janelas: quem chama trata isso como "não
 * consegui ler agora", nunca como "o limite é zero".
 */
function daConsulta(resposta, quandoMs) {
  if (!resposta || typeof resposta !== 'object') return null
  const limites = corpoDosLimites(resposta)
  // ⚠️ O agente diz, ele mesmo, quando NÃO há limite de plano a mostrar (chave de interface,
  // e outros provedores). Nesse caso o mostrador não inventa traço eterno: ele some.
  if (resposta.rate_limits_available === false) {
    return { cincoHoras: null, seteDias: null, origem: 'agente', lidoEmMs: quandoMs, disponivel: false }
  }
  if (!limites || typeof limites !== 'object') return null
  const cinco = limites.five_hour || null
  const sete = limites.seven_day || null
  const a = cinco ? janela(porCento(cinco.utilization), instante(cinco.resets_at)) : null
  const b = sete ? janela(porCento(sete.utilization), instante(sete.resets_at)) : null
  if (!a && !b) return null
  return {
    cincoHoras: a, seteDias: b, origem: 'agente', lidoEmMs: quandoMs, disponivel: true,
    creditoExtra: temCreditoExtra(limites),
  }
}

/**
 * A CONTA TEM CRÉDITO EXTRA LIGADO?
 *
 * ⚠️ ISTO É UM RISCO DECLARADO, e o mostrador não pode fingir que não existe. Há uma mudança
 * anunciada — e HOJE pausada pela própria página que a anuncia — que tiraria o gasto deste tipo de
 * programa das duas janelas do plano e o jogaria num crédito mensal separado. Se ela for
 * despausada, os dois números da barra passam a mostrar um limite que **não é o deste programa**,
 * e ninguém perceberia: eles continuariam se mexendo, só que por outro motivo.
 *
 * O que se faz aqui é o pouco que dá para fazer com honestidade: quando o crédito extra estiver
 * LIGADO, a dica diz que os dois números podem não cobrir o gasto deste programa. Não se inventa
 * um terceiro número — o formato do crédito extra não foi medido (na medição ele veio desligado),
 * e número inventado numa barra em que a pessoa confia é pior que aviso nenhum.
 */
function temCreditoExtra(limites) {
  const extra = limites && limites.extra_usage
  return !!(extra && typeof extra === 'object' && extra.is_enabled === true)
}

/**
 * FONTE 2 — o aviso de limite que já chega no laço da conversa.
 *
 * ⚠️ AQUI A UTILIZAÇÃO É FRAÇÃO E A HORA É EM SEGUNDOS. Ver a tabela no topo.
 *
 * ⚠️ ELE NÃO É BATIMENTO POR TURNO. Medido: dois turnos seguidos geraram UM aviso só,
 * porque o segundo não mexeu no percentual arredondado. Serve para atualizar de graça no
 * instante em que o número muda; não serve de relógio.
 *
 * ⚠️ O campo que traz as DUAS janelas de uma vez não está na definição publicada do agente
 * — ele existe, foi medido, mas pode sumir sem quebrar tipo nenhum. Quando ele não vier,
 * sobra a janela que está apertando, e só ela é atualizada (ver `juntar`): a outra continua
 * valendo o que a última leitura boa disse, em vez de virar traço.
 */
function doAviso(evento, quandoMs) {
  if (!evento || typeof evento !== 'object') return null
  const dupla = evento.unifiedWindows
  if (dupla && typeof dupla === 'object') {
    const cinco = dupla.five_hour || null
    const sete = dupla.seven_day || null
    const a = cinco ? janela(porCento(cinco.utilization, 100), instante(cinco.resetsAt, true)) : null
    const b = sete ? janela(porCento(sete.utilization, 100), instante(sete.resetsAt, true)) : null
    if (a || b) return { cincoHoras: a, seteDias: b, origem: 'aviso', lidoEmMs: quandoMs, disponivel: true }
  }
  // Sem a dupla: uma janela só, a que o aviso nomeia.
  const qual = evento.rateLimitType === 'seven_day' ? 'seteDias'
    : evento.rateLimitType === 'five_hour' ? 'cincoHoras' : null
  const so = qual ? janela(porCento(evento.utilization, 100), instante(evento.resetsAt, true)) : null
  if (!so) return null
  return {
    cincoHoras: qual === 'cincoHoras' ? so : null,
    seteDias: qual === 'seteDias' ? so : null,
    origem: 'aviso', lidoEmMs: quandoMs, disponivel: true,
  }
}

/**
 * FONTE 3 — o registro que o próprio programa de linha de comando grava no computador.
 *
 * É o piso: custo zero, sem rede, sem cota, e é o que faz a barra NASCER com número em vez
 * de traço. Ele diz a hora em que foi colhido, e é essa hora que o mostrador usa para
 * declarar a idade — nunca a hora em que o produto o leu.
 *
 * ⚠️ O identificador de conta que vem junto é descartado aqui, de propósito.
 */
function doRegistro(conteudo) {
  if (!conteudo || typeof conteudo !== 'object') return null
  const guardado = conteudo.cachedUsageUtilization
  if (!guardado || typeof guardado !== 'object') return null
  const lidoEmMs = typeof guardado.fetchedAtMs === 'number' && Number.isFinite(guardado.fetchedAtMs)
    ? guardado.fetchedAtMs : null
  if (lidoEmMs === null) return null
  const base = daConsulta(guardado.utilization, lidoEmMs)
  if (!base) return null
  return { ...base, origem: 'registro' }
}

/**
 * Junta o que chegou com o que já se sabia.
 *
 * Duas regras, e as duas nascem de medida:
 *   1. **o mais novo manda** — cada fonte carimba quando colheu, e uma resposta velha
 *      (o agente devolve o que tem guardado quando a cota o barra) não sobrescreve uma
 *      leitura mais nova;
 *   2. **notícia parcial não apaga o resto** — um aviso que só fala de uma janela atualiza
 *      aquela janela e deixa a outra como estava, com a idade dela.
 */
function juntar(estado, novidade) {
  if (!novidade) return estado
  const atual = estado || estadoInicial()
  const novo = { ...atual }
  if (novidade.disponivel === false) {
    return { ...novo, cincoHoras: null, seteDias: null, disponivel: false, origem: novidade.origem, lidoEmMs: novidade.lidoEmMs }
  }
  const maisNovo = atual.lidoEmMs === null || novidade.lidoEmMs >= atual.lidoEmMs
  for (const chave of ['cincoHoras', 'seteDias']) {
    const veio = novidade[chave]
    if (!veio) continue
    if (!maisNovo && atual[chave]) continue
    novo[chave] = { ...veio, lidoEmMs: novidade.lidoEmMs }
  }
  if (maisNovo && (novidade.cincoHoras || novidade.seteDias)) {
    novo.origem = novidade.origem
    novo.lidoEmMs = novidade.lidoEmMs
  }
  if (novidade.disponivel === true) novo.disponivel = true
  if (maisNovo && typeof novidade.creditoExtra === 'boolean') novo.creditoExtra = novidade.creditoExtra
  return novo
}

/** Há quanto tempo o número mais velho que está na tela foi colhido. `null` = não há número. */
function idadeMs(estado, agoraMs) {
  if (!estado) return null
  const horas = [estado.cincoHoras, estado.seteDias].filter(Boolean)
    .map(j => (typeof j.lidoEmMs === 'number' ? j.lidoEmMs : estado.lidoEmMs))
    .filter(t => typeof t === 'number')
  if (!horas.length) return null
  return Math.max(0, agoraMs - Math.min(...horas))
}

/** O número é velho demais para ser desenhado? */
function velhoDemais(estado, agoraMs) {
  const i = idadeMs(estado, agoraMs)
  return i !== null && i >= IDADE_DESCARTAR_MS
}

/** Uma das janelas passou do aviso? Devolve a lista das que passaram. */
function apertadas(estado) {
  if (!estado) return []
  const fora = []
  if (estado.cincoHoras && estado.cincoHoras.porcento >= PERTO_DO_TETO) fora.push('cincoHoras')
  if (estado.seteDias && estado.seteDias.porcento >= PERTO_DO_TETO) fora.push('seteDias')
  return fora
}

/** "12 min", "2 h", "45 s" — a idade dita como gente fala. */
function idadeEmPalavras(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h`
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const doisDigitos = n => String(n).padStart(2, '0')

/**
 * Quando a janela vira, dito do jeito que serve a quem está trabalhando: a hora, quando é
 * hoje; o dia junto, quando não é. A conta é feita no fuso de quem está no computador,
 * porque é o relógio que essa pessoa olha.
 */
function quandoVira(viraEmMs, agoraMs) {
  if (typeof viraEmMs !== 'number' || !Number.isFinite(viraEmMs)) return ''
  const d = new Date(viraEmMs)
  const hora = `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
  const hoje = new Date(agoraMs)
  const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mesmoDia(d, hoje)) return `às ${hora}`
  const amanha = new Date(agoraMs + 24 * 60 * 60 * 1000)
  if (mesmoDia(d, amanha)) return `amanhã, ${hora}`
  return `${DIAS[d.getDay()]}, ${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}, ${hora}`
}

/**
 * O TEXTO DA BARRA DE CIMA — compacto de propósito.
 *
 * Desenho, e o porquê de cada escolha:
 *   - `5h 7% · 7d 65%`: os dois números na ordem em que apertam (a janela curta primeiro),
 *     com o mesmo separador que o pé da conversa já usa. É a forma mais curta que ainda
 *     diz DE QUE limite se trata — "7% · 65%" sozinho não diz.
 *   - traço no lugar do número enquanto não se sabe: a largura fica parecida e a posição do
 *     item não dança na barra quando o primeiro número chega.
 *   - a idade só aparece quando o número está velho; no caso normal ela seria ruído, e o
 *     lugar dela é a dica.
 *   - perto do teto entra um `!` colado no número apertado — MARCA DE TEXTO, não cor. Duas
 *     razões: a identidade do produto proíbe distinguir estado só pelo matiz (vermelho,
 *     âmbar e a brasa são vizinhos na roda de cores e se embaralham para perto de 8% dos
 *     homens), e pintar aqui exigiria ensinar ao editor QUAL é o limite que este produto
 *     considera apertado — decisão de produto dentro de código de terceiro.
 *
 * `null` = não há nada para desenhar (conta sem limite de plano): quem chama esconde o item.
 */
function textoDaBarra(estado, agoraMs) {
  if (estado && estado.disponivel === false) return null
  const limpo = !estado || velhoDemais(estado, agoraMs)
  const apertadas_ = limpo ? [] : apertadas(estado)
  const pedaco = (chave, rotulo) => {
    const j = limpo ? null : (estado && estado[chave])
    if (!j) return `${rotulo} ${SEM_NUMERO}`
    return `${rotulo} ${j.porcento}%${apertadas_.includes(chave) ? '!' : ''}`
  }
  let texto = `${pedaco('cincoHoras', '5h')} · ${pedaco('seteDias', '7d')}`
  if (limpo) return texto
  const i = idadeMs(estado, agoraMs)
  if (i !== null && i >= IDADE_VELHA_MS) texto += ` · há ${idadeEmPalavras(i)}`
  return texto
}

const DE_ONDE = {
  agente: 'Lido do agente agora.',
  aviso: 'Atualizado pelo agente no meio do trabalho.',
  registro: 'Lido do registro que o programa de linha de comando deixa neste computador.',
}

/**
 * A DICA — é aqui que cabem os horários de virada, que na barra não caberiam.
 *
 * Ela sempre diz TRÊS coisas: quanto se gastou de cada janela, quando cada uma vira, e de
 * onde veio o número (com a idade, quando ele não é de agora). A última linha existe porque
 * a pergunta seguinte de quem lê "65%" é "65% de quanto?" — e a resposta honesta é que o
 * servidor só entrega percentual.
 */
function dicaDaBarra(estado, agoraMs) {
  if (estado && estado.disponivel === false) {
    return 'Esta conta não tem limite de plano para mostrar.'
  }
  const linhas = ['Limite do plano']
  const velho = velhoDemais(estado, agoraMs)
  if (!estado || velho || (!estado.cincoHoras && !estado.seteDias)) {
    linhas.push(velho
      ? `O último número tem mais de ${idadeEmPalavras(IDADE_DESCARTAR_MS)} — velho demais para mostrar.`
      : 'Ainda não li o limite.')
    linhas.push('Assim que o agente responder, os dois números aparecem aqui.')
    return linhas.join('\n')
  }
  const apertadas_ = apertadas(estado)
  const linhaDe = (chave, rotulo) => {
    const j = estado[chave]
    if (!j) return `${rotulo}: ainda não li.`
    const vira = quandoVira(j.viraEmMs, agoraMs)
    return `${rotulo}: ${j.porcento}% usado${vira ? ` · vira ${vira}` : ''}`
  }
  if (apertadas_.length) {
    const nomes = apertadas_.map(c => (c === 'cincoHoras' ? 'a janela de 5 horas' : 'a semana'))
    linhas.push(`Falta pouco: ${nomes.join(' e ')} passou de ${PERTO_DO_TETO}%.`)
  }
  linhas.push(linhaDe('cincoHoras', 'Janela de 5 horas'))
  linhas.push(linhaDe('seteDias', 'Semana'))
  const i = idadeMs(estado, agoraMs)
  const de = DE_ONDE[estado.origem] || ''
  linhas.push(i !== null && i >= IDADE_VELHA_MS ? `${de} Há ${idadeEmPalavras(i)}.` : de)
  if (estado.creditoExtra) {
    linhas.push('Esta conta tem crédito extra ligado: os dois números acima podem não cobrir todo o gasto deste programa.')
  }
  linhas.push('Só existe percentual: o servidor não informa quanto falta em tokens nem em dinheiro.')
  return linhas.filter(Boolean).join('\n')
}

/** Já pode consultar de novo? (cota própria, mais o que a recusa pediu) */
function podeConsultar(estado, agoraMs) {
  if (!estado) return true
  return agoraMs >= (estado.proximaConsultaMs || 0)
}

/** Quanto falta para a próxima consulta ser permitida. */
function faltaParaConsultar(estado, agoraMs) {
  if (!estado) return 0
  return Math.max(0, (estado.proximaConsultaMs || 0) - agoraMs)
}

/** Depois de uma consulta que deu certo: a próxima só daqui a um intervalo. */
function marcarConsulta(estado, agoraMs) {
  return { ...(estado || estadoInicial()), proximaConsultaMs: agoraMs + INTERVALO_DA_CONSULTA_MS }
}

/**
 * A RECUSA POR COTA NÃO É ERRO NA CARA DE NINGUÉM.
 *
 * O servidor recusa pedindo um tempo em segundos. Aqui esse pedido vira a hora da próxima
 * tentativa e mais nada: o número que já está na tela continua lá, com a idade dele, e
 * ninguém vê mensagem de erro por ter olhado a barra rápido demais. Quando a recusa não
 * disser quanto esperar, vale o intervalo normal.
 *
 * ⚠️ Vale para QUALQUER falha da consulta, não só para a recusa por cota: rede caída, o
 * agente fechado, a resposta malformada. Nenhuma delas é motivo para apagar da tela um
 * número que continua sendo a melhor informação disponível.
 */
function registrarRecusa(estado, erro, agoraMs) {
  const base = estado || estadoInicial()
  const segundos = segundosPedidos(erro)
  const espera = segundos === null ? INTERVALO_DA_CONSULTA_MS : Math.max(1000, segundos * 1000)
  return { ...base, proximaConsultaMs: agoraMs + espera }
}

/** Os segundos que a recusa pediu, venham eles no cabeçalho, no corpo ou no texto do erro. */
function segundosPedidos(erro) {
  if (!erro) return null
  const candidatos = []
  if (typeof erro === 'object') {
    const cab = erro.headers || (erro.response && erro.response.headers) || null
    if (cab) {
      const v = typeof cab.get === 'function' ? cab.get('retry-after') : (cab['retry-after'] || cab['Retry-After'])
      if (v !== undefined && v !== null) candidatos.push(v)
    }
    if (erro.retryAfter !== undefined) candidatos.push(erro.retryAfter)
    if (erro.retry_after !== undefined) candidatos.push(erro.retry_after)
  }
  const texto = String((erro && erro.message) || erro || '')
  const casado = texto.match(/retry[-_ ]?after[^0-9]{0,4}(\d+)/i)
  if (casado) candidatos.push(casado[1])
  for (const c of candidatos) {
    const n = Number(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

module.exports = {
  INTERVALO_DA_CONSULTA_MS, IDADE_VELHA_MS, IDADE_DESCARTAR_MS, PERTO_DO_TETO, METODO_DE_USO, SEM_NUMERO,
  estadoInicial, porCento, instante, corpoDosLimites, temCreditoExtra,
  daConsulta, doAviso, doRegistro, juntar,
  idadeMs, velhoDemais, apertadas, idadeEmPalavras, quandoVira,
  textoDaBarra, dicaDaBarra,
  podeConsultar, faltaParaConsultar, marcarConsulta, registrarRecusa, segundosPedidos,
}
