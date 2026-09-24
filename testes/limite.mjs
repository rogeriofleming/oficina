// O LIMITE DO PLANO (motor) — as três fontes, a junção, o texto da barra e a cota, em node puro.
//
// ⚠️ ESTE ARQUIVO NÃO TOCA A REDE, e é de propósito. O dado verdadeiro vem de um servidor com
// cota apertada (medido: a quinta chamada em oito segundos volta recusada pedindo 300 s); um
// teste que fosse buscá-lo não conseguiria encenar os casos que interessam — o número velho, a
// recusa, o método que sumiu, a conta sem plano — e ainda gastaria a cota de quem roda. Aqui as
// fontes são de MENTIRA, escritas com os formatos exatos que foram medidos antes de o produto
// existir, inclusive as unidades diferentes entre elas.
//
// O que precisa ser verdade:
//   1. cada fonte entra na sua unidade e sai na mesma (por cento inteiro, instante em ms);
//   2. o percentual que muda no meio do trabalho chega à tela sem consultar nada;
//   3. notícia parcial não apaga a outra janela, e notícia velha não sobrescreve a nova;
//   4. dado velho se declara velho, e velho demais não se desenha;
//   5. a recusa por cota vira "espere até tal hora", nunca erro na cara de ninguém;
//   6. conta sem limite de plano some da barra, em vez de virar traço eterno;
//   7. a virada de cada janela é dita como gente fala, e cabe na dica;
//   8. nada que identifique a conta entra no estado.
//
// Uso:  node testes/limite.mjs
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

/*
  ⚠️ GUARDA. Sem o módulo, esta suíte tem de marcar VERMELHO com placar — não morrer com um
  rastro de pilha. Quem roda a bateria rápida lê o placar; uma suíte que não imprime placar
  nenhum aparece como "sem placar", que é indistinguível de instrumento quebrado. É o mesmo
  cuidado que a suíte dos layouts ganhou quando a função nova ainda não existia.
*/
let L = null
try {
  L = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'limite.js'))
} catch (e) {
  checar('⛔ o motor do limite existe (extensoes/oficina-claude/limite.js)', false, String(e && e.message))
  console.log('\n' + JSON.stringify({ passou: false, total: resultados.length, falhas: resultados.map(r => r.nome) }))
  process.exit(1)
}

const MIN = 60 * 1000
const AGORA = Date.parse('2026-09-20T13:00:00.000Z')

// As respostas de mentira, nos formatos MEDIDOS.
const respostaDoAgente = (cinco, sete, viraCinco, viraSete) => ({
  subscription_type: 'max',
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: cinco, resets_at: viraCinco },
    seven_day: { utilization: sete, resets_at: viraSete },
    seven_day_opus: null, seven_day_sonnet: null,
    extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null },
  },
  session: { total_cost_usd: 0, total_duration_ms: 1631, model_usage: {} },
})
const VIRA_CINCO = '2026-09-20T15:20:00.581340+00:00'
const VIRA_SETE = '2026-09-24T13:00:00.581358+00:00'

// ─────────────────────────────────────────────────────────────────────────────
// 1. AS UNIDADES — o erro de 100× que este arquivo existe para impedir
// ─────────────────────────────────────────────────────────────────────────────
{
  const doAgente = L.daConsulta(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE), AGORA)
  checar('a consulta ao agente entra em POR CENTO e sai em por cento',
    doAgente.cincoHoras.porcento === 7 && doAgente.seteDias.porcento === 65,
    JSON.stringify(doAgente))
  checar('a consulta traz a virada de cada janela como instante',
    doAgente.cincoHoras.viraEmMs === Date.parse(VIRA_CINCO) && doAgente.seteDias.viraEmMs === Date.parse(VIRA_SETE))

  // O aviso empurrado no laço fala FRAÇÃO e SEGUNDOS — a armadilha medida.
  const aviso = {
    status: 'allowed', resetsAt: 1789917600, rateLimitType: 'five_hour',
    unifiedWindows: {
      five_hour: { utilization: 0.07, resetsAt: 1789917600 },
      seven_day: { utilization: 0.64, resetsAt: 1790254800 },
    },
  }
  const doAviso = L.doAviso(aviso, AGORA)
  checar('⛔ o aviso do laço entra em FRAÇÃO e sai em por cento (0,07 vira 7, não 0)',
    doAviso.cincoHoras.porcento === 7 && doAviso.seteDias.porcento === 64,
    JSON.stringify(doAviso))
  checar('⛔ o aviso do laço traz a virada em SEGUNDOS e sai em milissegundos',
    doAviso.cincoHoras.viraEmMs === 1789917600 * 1000 && doAviso.seteDias.viraEmMs === 1790254800 * 1000,
    String(doAviso.cincoHoras.viraEmMs))

  checar('por cento é inteiro de 0 a 100: 150 vira 100, -5 vira 0, o que não é número vira nada',
    L.porCento(150) === 100 && L.porCento(-5) === 0 && L.porCento('7') === null && L.porCento(NaN) === null)
  checar('0,649 arredonda para 65 (o mesmo número que a outra fonte mostraria)', L.porCento(0.649, 100) === 65)
  checar('data que não abre não vira instante inventado', L.instante('quinta que vem') === null && L.instante(null) === null)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. O PERCENTUAL QUE MUDA NO MEIO DO TRABALHO
// ─────────────────────────────────────────────────────────────────────────────
{
  let e = L.juntar(L.estadoInicial(), L.daConsulta(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE), AGORA))
  checar('a primeira leitura pinta os dois números', L.textoDaBarra(e, AGORA) === '5h 7% · 7d 65%', L.textoDaBarra(e, AGORA))

  const aviso = {
    status: 'allowed', rateLimitType: 'five_hour', resetsAt: Math.round(Date.parse(VIRA_CINCO) / 1000),
    unifiedWindows: {
      five_hour: { utilization: 0.11, resetsAt: Math.round(Date.parse(VIRA_CINCO) / 1000) },
      seven_day: { utilization: 0.66, resetsAt: Math.round(Date.parse(VIRA_SETE) / 1000) },
    },
  }
  e = L.juntar(e, L.doAviso(aviso, AGORA + MIN))
  checar('⛔ o aviso que chega de graça atualiza os dois números, sem consultar nada',
    L.textoDaBarra(e, AGORA + MIN) === '5h 11% · 7d 66%', L.textoDaBarra(e, AGORA + MIN))
  checar('e a dica passa a dizer que quem atualizou foi o trabalho em andamento',
    /no meio do trabalho/.test(L.dicaDaBarra(e, AGORA + MIN)))
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. NOTÍCIA PARCIAL E NOTÍCIA VELHA
// ─────────────────────────────────────────────────────────────────────────────
{
  let e = L.juntar(L.estadoInicial(), L.daConsulta(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE), AGORA))
  // O campo com as DUAS janelas não está na definição publicada: pode sumir. Sobra uma janela só.
  const so = { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.19, resetsAt: Math.round(Date.parse(VIRA_CINCO) / 1000) }
  e = L.juntar(e, L.doAviso(so, AGORA + 2 * MIN))
  checar('⛔ aviso de UMA janela só atualiza aquela janela — a outra não vira traço',
    L.textoDaBarra(e, AGORA + 2 * MIN) === '5h 19% · 7d 65%', L.textoDaBarra(e, AGORA + 2 * MIN))

  // O agente devolve o que tem guardado quando a cota o barra: a resposta pode ser MAIS VELHA.
  const velha = L.daConsulta(respostaDoAgente(3, 60, VIRA_CINCO, VIRA_SETE), AGORA - 5 * MIN)
  const depois = L.juntar(e, velha)
  checar('⛔ resposta mais VELHA que o que está na tela não sobrescreve o número novo',
    L.textoDaBarra(depois, AGORA + 2 * MIN) === '5h 19% · 7d 65%', L.textoDaBarra(depois, AGORA + 2 * MIN))

  checar('aviso sem janela nenhuma reconhecível não vira estado', L.doAviso({ status: 'allowed' }, AGORA) === null)
  /*
    ⚠️ O caso do meio — `rate_limits` PRESENTE e vazio — é o que separa de verdade. Sem ele,
    o critério só exercitava a porta de entrada (resposta nula, objeto sem o campo) e um
    produto que respondesse "0% e 0%" a uma resposta sem janela nenhuma passaria verde.
    Achado por mutação. Zero desenhado é uma AFIRMAÇÃO: diria que a pessoa não gastou nada.
  */
  checar('resposta vazia do agente não vira estado (não é "o limite é zero")',
    L.daConsulta(null, AGORA) === null && L.daConsulta({}, AGORA) === null &&
    L.daConsulta({ rate_limits: {} }, AGORA) === null,
    JSON.stringify(L.daConsulta({ rate_limits: {} }, AGORA)))
  checar('o que não se entende não apaga o que já se sabia', L.juntar(e, null) === e)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. O REGISTRO LOCAL — o piso, e a idade do dado
// ─────────────────────────────────────────────────────────────────────────────
{
  /*
    ⚠️ ESTA É A FORMA DE VERDADE, COPIADA DO ARQUIVO REAL — e ela NÃO é a da resposta do agente.
    O registro local guarda as janelas SOLTAS, com `five_hour` e `seven_day` no primeiro nível,
    sem o invólucro `rate_limits` e sem o `rate_limits_available` ao lado. Escrito só para a forma
    embrulhada, o motor devolvia "não sei" contra o arquivo real: a barra nasceria com traço
    justamente no caso que o registro local existe para cobrir, e nenhum critério acusava, porque
    todos usavam o formato que EU tinha escrito. Achado atacando o próprio trabalho contra o
    arquivo desta máquina, depois de a suíte inteira estar verde.
    Os nomes de bucket sem sentido (`tangelo`, `nimbus_quill`) estão aqui de propósito: eles vêm
    no arquivo real e não podem confundir a leitura.
  */
  const registroComoEleE = {
    five_hour: { utilization: 7, resets_at: VIRA_CINCO, limit_dollars: null, used_dollars: null, remaining_dollars: null, locked_reason: null },
    seven_day: { utilization: 65, resets_at: VIRA_SETE, limit_dollars: null, used_dollars: null, remaining_dollars: null, locked_reason: null },
    seven_day_opus: null, seven_day_sonnet: null, tangelo: null, nimbus_quill: { utilization: 0 },
    extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null },
    limits: [], spend: {}, member_dashboard_available: false, seven_day_breakdown: {},
  }
  {
    const real = L.doRegistro({ cachedUsageUtilization: { fetchedAtMs: AGORA - 3 * MIN, accountUuid: 'x', utilization: registroComoEleE } })
    checar('⛔ o registro local guarda as janelas SOLTAS (sem o invólucro da resposta do agente) — e é lido assim',
      !!real && real.cincoHoras.porcento === 7 && real.seteDias.porcento === 65 &&
      real.cincoHoras.viraEmMs === Date.parse(VIRA_CINCO), JSON.stringify(real))
    checar('o corpo das janelas é reconhecido nas DUAS formas, e só nelas',
      L.corpoDosLimites(registroComoEleE) === registroComoEleE &&
      L.corpoDosLimites(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE)) !== null &&
      L.corpoDosLimites({ tangelo: null, spend: {} }) === null,
      String(L.corpoDosLimites({ tangelo: null, spend: {} })))
  }

  const conteudo = {
    cachedUsageUtilization: {
      fetchedAtMs: AGORA - 3 * MIN,
      accountUuid: 'uma-conta-qualquer',
      utilization: respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE),
    },
    outrasCoisasDoArquivo: { muitas: true },
  }
  const doDisco = L.doRegistro(conteudo)
  checar('o registro local dá os dois números sem rede e sem cota',
    doDisco.cincoHoras.porcento === 7 && doDisco.seteDias.porcento === 65 && doDisco.origem === 'registro')
  checar('⛔ a idade sai de QUANDO O DADO FOI COLHIDO, não de quando o produto o leu',
    doDisco.lidoEmMs === AGORA - 3 * MIN && L.idadeMs(L.juntar(L.estadoInicial(), doDisco), AGORA) === 3 * MIN,
    String(L.idadeMs(L.juntar(L.estadoInicial(), doDisco), AGORA)))
  checar('⛔ NADA que identifique a conta entra no estado',
    !JSON.stringify(doDisco).toLowerCase().includes('account') && !JSON.stringify(doDisco).includes('uma-conta-qualquer'),
    JSON.stringify(doDisco))
  checar('registro sem a hora de colheita não vale (não dá para dizer a idade dele)',
    L.doRegistro({ cachedUsageUtilization: { utilization: respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE) } }) === null)
  checar('arquivo sem o registro do uso não vira estado',
    L.doRegistro({}) === null && L.doRegistro(null) === null)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DADO VELHO — dizer a idade, e parar de mostrar o que é velho demais
// ─────────────────────────────────────────────────────────────────────────────
{
  const e = L.juntar(L.estadoInicial(), L.daConsulta(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE), AGORA))
  checar('recém-lido, a barra mostra só os números', L.textoDaBarra(e, AGORA + 4 * MIN) === '5h 7% · 7d 65%')
  checar('⛔ passados 12 minutos, a barra DIZ a idade em vez de passar o número por "agora"',
    L.textoDaBarra(e, AGORA + 12 * MIN) === '5h 7% · 7d 65% · há 12 min', L.textoDaBarra(e, AGORA + 12 * MIN))
  checar('a dica repete a idade junto da origem',
    /Há 12 min\./.test(L.dicaDaBarra(e, AGORA + 12 * MIN)), L.dicaDaBarra(e, AGORA + 12 * MIN))
  checar('⛔ passada uma hora, o número não se desenha mais (traço, como antes da primeira leitura)',
    L.textoDaBarra(e, AGORA + 61 * MIN) === '5h – · 7d –', L.textoDaBarra(e, AGORA + 61 * MIN))
  checar('e a dica diz POR QUE sumiu, em vez de ficar muda',
    /velho demais/.test(L.dicaDaBarra(e, AGORA + 61 * MIN)), L.dicaDaBarra(e, AGORA + 61 * MIN))
  checar('antes de qualquer fonte responder, a barra já tem forma (traço nos dois lugares)',
    L.textoDaBarra(L.estadoInicial(), AGORA) === '5h – · 7d –' && L.textoDaBarra(null, AGORA) === '5h – · 7d –')
  checar('e a dica de antes da primeira leitura não finge que há número',
    /Ainda não li o limite/.test(L.dicaDaBarra(L.estadoInicial(), AGORA)))
  checar('a idade se diz como gente fala',
    [L.idadeEmPalavras(45000), L.idadeEmPalavras(12 * MIN), L.idadeEmPalavras(125 * MIN)].join('|') === '45 s|12 min|2 h',
    [L.idadeEmPalavras(45000), L.idadeEmPalavras(12 * MIN), L.idadeEmPalavras(125 * MIN)].join('|'))
  checar('os dois cortes de idade são os que o próprio programa de linha de comando usa',
    L.IDADE_VELHA_MS === 10 * MIN && L.IDADE_DESCARTAR_MS === 60 * MIN)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. A COTA — a recusa nunca vira erro na cara de ninguém
// ─────────────────────────────────────────────────────────────────────────────
{
  let e = L.estadoInicial()
  checar('sem nunca ter consultado, pode consultar', L.podeConsultar(e, AGORA) === true)
  e = L.marcarConsulta(e, AGORA)
  checar('⛔ depois de uma consulta, a próxima só daqui a 5 minutos (a cadência do próprio programa)',
    L.podeConsultar(e, AGORA + 4 * MIN) === false && L.podeConsultar(e, AGORA + 5 * MIN) === true &&
    L.INTERVALO_DA_CONSULTA_MS === 5 * MIN)
  checar('e o produto sabe dizer quanto falta, para não insistir às cegas',
    L.faltaParaConsultar(e, AGORA + 4 * MIN) === MIN)

  /*
    A recusa medida: código 429 com o cabeçalho dizendo quantos segundos faltam para a
    janela virar. ⚠️ O NÚMERO AQUI É 94, E NÃO 300, DE PROPÓSITO: com 300 este critério não
    separava nada — é exatamente o intervalo normal, então ignorar o cabeçalho dava o mesmo
    resultado e o critério ficava verde com o produto surdo. Achado pela mutação "a recusa
    ignora quantos segundos o servidor pediu", que passou verde na primeira versão. 94 s é
    uma das esperas medidas (a contagem regressiva para o fim da janela de 5 min).
  */
  const recusa = Object.assign(new Error('Request failed with status 429'), { headers: { 'retry-after': '94' } })
  const apos = L.registrarRecusa(L.estadoInicial(), recusa, AGORA)
  checar('⛔ a recusa por cota vira "espere o que o servidor pediu" — e não mensagem de erro',
    L.podeConsultar(apos, AGORA + 93 * 1000) === false && L.podeConsultar(apos, AGORA + 94 * 1000) === true,
    String(L.faltaParaConsultar(apos, AGORA)))
  checar('⛔ com a consulta recusada, o número que já estava na tela CONTINUA lá',
    L.textoDaBarra(L.juntar(apos, L.daConsulta(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE), AGORA)), AGORA) === '5h 7% · 7d 65%')
  checar('o pedido de espera é lido do cabeçalho, do corpo ou do texto do erro',
    L.segundosPedidos({ headers: { 'Retry-After': 120 } }) === 120 &&
    L.segundosPedidos({ retryAfter: 90 }) === 90 &&
    L.segundosPedidos(new Error('rate limited, retry-after: 42')) === 42,
    [L.segundosPedidos({ headers: { 'Retry-After': 120 } }), L.segundosPedidos({ retryAfter: 90 }), L.segundosPedidos(new Error('rate limited, retry-after: 42'))].join('|'))
  checar('cabeçalho no formato de mapa (o que a rede do editor devolve) também é lido',
    L.segundosPedidos({ headers: new Map([['retry-after', '77']]) }) === 77)
  checar('falha que NÃO diz quanto esperar cai no intervalo normal, em vez de tentar de novo já',
    L.faltaParaConsultar(L.registrarRecusa(L.estadoInicial(), new Error('a rede caiu'), AGORA), AGORA) === 5 * MIN)
  checar('erro sem informação nenhuma não inventa espera negativa',
    L.segundosPedidos(null) === null && L.segundosPedidos({}) === null && L.segundosPedidos({ retryAfter: 0 }) === null)
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONTA SEM LIMITE DE PLANO — o mostrador some, em vez de virar traço eterno
// ─────────────────────────────────────────────────────────────────────────────
{
  const semPlano = L.daConsulta({ rate_limits_available: false, rate_limits: null }, AGORA)
  checar('o agente diz, ele mesmo, quando não há limite de plano a mostrar',
    semPlano && semPlano.disponivel === false)
  const e = L.juntar(L.juntar(L.estadoInicial(), L.daConsulta(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE), AGORA)), semPlano)
  checar('⛔ sem limite de plano, não há texto de barra (quem chama esconde o item)',
    L.textoDaBarra(e, AGORA) === null, String(L.textoDaBarra(e, AGORA)))
  checar('e a dica diz o que aconteceu, sem falar em erro',
    /não tem limite de plano/.test(L.dicaDaBarra(e, AGORA)) && !/erro/i.test(L.dicaDaBarra(e, AGORA)),
    L.dicaDaBarra(e, AGORA))
  checar('o nome do método de uso do agente é guardado num lugar só, porque ele se declara instável',
    typeof L.METODO_DE_USO === 'string' && /EXPERIMENTAL/.test(L.METODO_DE_USO))
}

// ─────────────────────────────────────────────────────────────────────────────
// 7b. CRÉDITO EXTRA LIGADO — o risco que invalidaria os dois números, declarado na dica
// ─────────────────────────────────────────────────────────────────────────────
{
  const com = extra => {
    const r = respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE)
    r.rate_limits.extra_usage = { is_enabled: extra, monthly_limit: null, used_credits: null }
    return L.juntar(L.estadoInicial(), L.daConsulta(r, AGORA))
  }
  checar('com o crédito extra DESLIGADO (o estado medido), a dica não fala dele',
    !/crédito extra/.test(L.dicaDaBarra(com(false), AGORA)))
  checar('⛔ com o crédito extra LIGADO, a dica avisa que os dois números podem não cobrir este programa',
    /crédito extra ligado/.test(L.dicaDaBarra(com(true), AGORA)), L.dicaDaBarra(com(true), AGORA))
  checar('⛔ e NÃO se inventa um terceiro número: o texto da barra continua sendo os dois de sempre',
    L.textoDaBarra(com(true), AGORA) === '5h 7% · 7d 65%', L.textoDaBarra(com(true), AGORA))
  checar('o crédito extra é lido das duas formas do corpo (embrulhado e solto)',
    L.temCreditoExtra({ extra_usage: { is_enabled: true } }) === true &&
    L.temCreditoExtra({ extra_usage: { is_enabled: false } }) === false &&
    L.temCreditoExtra({}) === false && L.temCreditoExtra(null) === false)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. A VIRADA DE CADA JANELA — dita como gente fala, na dica
// ─────────────────────────────────────────────────────────────────────────────
{
  const e = L.juntar(L.estadoInicial(), L.daConsulta(respostaDoAgente(7, 65, VIRA_CINCO, VIRA_SETE), AGORA))
  const dica = L.dicaDaBarra(e, AGORA)
  const cinco = new Date(Date.parse(VIRA_CINCO))
  const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  checar('⛔ a dica diz, de cada janela, quanto foi usado E quando ela vira',
    dica.includes(`Janela de 5 horas: 7% usado · vira às ${hhmm(cinco)}`) && /Semana: 65% usado · vira /.test(dica), dica)
  checar('a dica diz que só existe percentual — sem inventar tokens nem dinheiro',
    /Só existe percentual/.test(dica) && !/US\$|token/i.test(dica.split('\n').slice(0, 4).join('\n')))

  // As três formas de dizer quando vira.
  const meioDia = Date.parse('2026-09-20T12:00:00')
  checar('hoje: só a hora', L.quandoVira(Date.parse('2026-09-20T15:20:00'), meioDia) === 'às 15:20',
    L.quandoVira(Date.parse('2026-09-20T15:20:00'), meioDia))
  checar('amanhã: a palavra e a hora', L.quandoVira(Date.parse('2026-09-21T09:05:00'), meioDia) === 'amanhã, 09:05',
    L.quandoVira(Date.parse('2026-09-21T09:05:00'), meioDia))
  checar('outro dia: o dia da semana, a data e a hora',
    L.quandoVira(Date.parse('2026-09-24T13:00:00'), meioDia) === 'qui, 24/09, 13:00',
    L.quandoVira(Date.parse('2026-09-24T13:00:00'), meioDia))
  checar('sem hora de virada, a dica não inventa uma', L.quandoVira(undefined, meioDia) === '')

  // Depois da virada o servidor manda zero — e zero é NÚMERO, não ausência.
  const zerado = L.juntar(L.estadoInicial(), L.daConsulta(respostaDoAgente(0, 65, VIRA_CINCO, VIRA_SETE), AGORA))
  checar('⛔ janela que acabou de virar mostra 0%, e não traço',
    L.textoDaBarra(zerado, AGORA) === '5h 0% · 7d 65%', L.textoDaBarra(zerado, AGORA))
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. PERTO DO TETO — aviso por marca de TEXTO, nunca só por cor
// ─────────────────────────────────────────────────────────────────────────────
{
  const em = (a, b) => L.juntar(L.estadoInicial(), L.daConsulta(respostaDoAgente(a, b, VIRA_CINCO, VIRA_SETE), AGORA))
  checar('em 89% ainda não há aviso', L.textoDaBarra(em(89, 65), AGORA) === '5h 89% · 7d 65%')
  checar('⛔ a partir de 90% a janela apertada ganha a marca — e só ela',
    L.textoDaBarra(em(90, 65), AGORA) === '5h 90%! · 7d 65%', L.textoDaBarra(em(90, 65), AGORA))
  checar('as duas apertadas, as duas marcadas',
    L.textoDaBarra(em(95, 97), AGORA) === '5h 95%! · 7d 97%!', L.textoDaBarra(em(95, 97), AGORA))
  checar('a dica nomeia qual janela apertou e mostra quando ela vira',
    /Falta pouco: a semana passou de 90%/.test(L.dicaDaBarra(em(10, 93), AGORA)), L.dicaDaBarra(em(10, 93), AGORA))
  checar('as duas apertadas, a dica fala das duas',
    /a janela de 5 horas e a semana/.test(L.dicaDaBarra(em(95, 97), AGORA)))
  checar('⛔ o aviso é marca de TEXTO: quem enxerga em preto e branco vê o mesmo alerta',
    L.textoDaBarra(em(95, 97), AGORA).includes('!') && L.PERTO_DO_TETO === 90)
  checar('número velho demais não avisa de teto nenhum (não se alarma com dado que não vale)',
    L.textoDaBarra(em(99, 99), AGORA + 61 * MIN) === '5h – · 7d –')
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou, total: resultados.length,
  falhas: resultados.filter(r => !r.ok).map(r => r.nome),
}))
process.exit(passou ? 0 : 1)
