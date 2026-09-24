// O USO DO PLANO — o motor da faixa de medidores (V20).
//
// Traduz o registro que o programa de linha de comando deixa no computador
// (`~/.claude.json` -> `cachedUsageUtilization`) no estado que a faixa desenha: duas janelas,
// a de 5 h e a de 7 dias, cada uma com a sua porcentagem.
//
// ⚠️ DUAS FONTES, E A ORDEM ENTRE ELAS É O CONSERTO DO DEFEITO QUE A V20 NASCEU COM.
//
//   1. o REGISTRO local (`~/.claude.json` -> `cachedUsageUtilization`) — piso: custo zero, sem
//      rede, sem cota. É ele que faz a faixa NASCER com número em vez de vazia;
//   2. a CONSULTA AO VIVO ao agente (`consultaDeUso.js`) — a que vale, e a que diz a verdade.
//
// A V20 nasceu só com o registro, com este raciocínio escrito aqui: *"a conversa própria deixou de
// ser o caminho principal (`t187`), logo a consulta ao vivo devolveria `semConversa` para sempre"*.
// O raciocínio estava errado num ponto só, e foi medido depois: **a consulta ao agente não precisa
// de conversa nenhuma**. Sobe-se uma com uma fila que nunca entrega mensagem, e pergunta-se
// (21/09/2026: 7,4 s para subir e responder; 244 ms nas perguntas seguintes).
//
// E o registro sozinho estava mentindo: ele só muda quando o outro programa vai buscar o número, e
// nesta máquina ficou 50 minutos parado no mesmo 29% enquanto o real subia para 42%. Ver
// `daConsulta` para as quatro medições lado a lado.
//
// O que ele pediu continua valendo inteiro — *"o numero pode atualizar de 5min em 5min, mas perder
// nunca"*: nenhuma falha de consulta apaga o que está na tela (ver `juntar`).
//
// ⚠️ A FAIXA NÃO MOSTRA IDADE. Ordem dele, 21/09/2026, com todas as letras: *"eu NAO QUERO idade
// com 'ha 11 min' desenhado na barra de limite da sessao. Lê a cada 5 min, se tiver 70% marca, se
// tiver 43% marca, se resetou marca 0%"*. Este motor NÃO calcula idade, NÃO envelhece número e NÃO
// tem estado de descarte. O que ele leu por último é o que vale, até chegar coisa nova.
// É o contrário do `limite.js` (V19), que descartava depois de 1 h — e a diferença é ordem dele.
//
// ⚠️ O TERCEIRO LIMITE FICA DE FORA. O registro traz `nimbus_quill` (o "Weekly Fable" da tela da
// extensão oficial). Ele decidiu: *"fable nao entra"*. Está lido e descartado de propósito, não
// esquecido.
//
// ⚠️ NADA QUE IDENTIFIQUE A CONTA SAI DAQUI. O registro traz `accountUuid` junto dos números; ele
// é ignorado, e há teste que cobra isso. O que este motor produz vai para uma faixa que fica na
// tela o tempo todo, à vista de quem passar atrás da cadeira.

'use strict'

/** As duas janelas que a faixa desenha, na ordem em que aparecem. */
const JANELAS = [
  { chave: 'five_hour', rotulo: '5h' },
  { chave: 'seven_day', rotulo: '7d' },
]

/** O terceiro limite existe no registro e fica de fora por ordem dele. Nomeado para não voltar por engano. */
const FORA_POR_ORDEM_DELE = ['nimbus_quill']

/** O estado antes de qualquer leitura: nem zero, nem número — nada ainda. */
function estadoInicial() {
  return { janelas: JANELAS.map(j => ({ rotulo: j.rotulo, pct: null, resetaEm: null, colhidoEm: null })), lidoEm: null }
}

/**
 * Uma porcentagem só vale se for número de verdade entre 0 e 100.
 *
 * ⚠️ `null` e `undefined` NÃO viram 0. Zero é uma afirmação ("não gastei nada") e seria falsa
 * quando o campo simplesmente não veio. Quem não tem número fica com `null`, e a faixa sabe a
 * diferença: `null` na primeira leitura não desenha; depois da primeira, o valor anterior fica.
 */
function porcentagemValida(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}

/** Texto ISO do registro -> milissegundos. `null` quando não dá para ler. */
function instante(iso) {
  if (typeof iso !== 'string' || !iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/**
 * As duas janelas, a partir do objeto que as contém.
 *
 * ⚠️ AS DUAS FONTES FALAM A MESMA LÍNGUA — e isto foi MEDIDO, não suposto (21/09/2026, contra o
 * SDK real desta máquina): a resposta ao vivo traz `rate_limits.five_hour = {utilization: 42,
 * resets_at: "…"}`, e o registro local guarda exatamente o mesmo formato dentro de
 * `cachedUsageUtilization.utilization`. Por isso a tradução é UMA só, e as duas portas abaixo
 * apenas dizem onde procurar e quando o número foi colhido.
 */
function dasJanelas(u, colhidoEm) {
  if (!u || typeof u !== 'object') return null
  // ⚠️ CARIMBO NO FUTURO VALE COMO AGORA — vale para as DUAS fontes. Um relógio que ande para trás
  // (correção de horário, dual-boot, máquina virtual restaurada) deixaria um número velho vencendo
  // todos os seguintes no desempate, para sempre. Achado por revisor, com sonda.
  if (typeof colhidoEm === 'number') colhidoEm = Math.min(colhidoEm, Date.now())
  const janelas = JANELAS.map(({ chave, rotulo }) => {
    const j = u[chave]
    return {
      rotulo,
      pct: j ? porcentagemValida(j.utilization) : null,
      resetaEm: j ? instante(j.resets_at) : null,
      colhidoEm,
    }
  })
  if (janelas.every(j => j.pct === null)) return null
  return { janelas, lidoEm: colhidoEm }
}

/**
 * FONTE 1 (o piso) — o registro que o programa de linha de comando deixa no computador.
 *
 * Aceita tanto o arquivo inteiro (`{cachedUsageUtilization: {...}}`) quanto só o bloco de dentro:
 * quem chama não precisa saber onde o programa de linha de comando resolveu aninhar.
 *
 * ⚠️ O CARIMBO É O `fetchedAtMs` DO REGISTRO, NÃO A HORA EM QUE NÓS LEMOS — e a diferença é o
 * defeito inteiro da V20. Medido duas vezes em 21/09/2026, com a máquina em uso: o bloco de uso
 * ficou 50 minutos sem ser reescrito enquanto o número real subia 13 pontos. Carimbar a leitura
 * com `Date.now()` fazia um número de 50 minutos atrás passar por recém-colhido — e era ele que
 * ganhava de uma resposta ao vivo, por ser "mais novo". Quem diz quando o número nasceu é quem o
 * colheu.
 */
function doRegistro(conteudo, quando = null) {
  if (!conteudo || typeof conteudo !== 'object') return null
  const bloco = conteudo.cachedUsageUtilization || conteudo
  // ⚠️ SEM `fetchedAtMs`, O CARIMBO É `null` — E NÃO "AGORA". Um número cuja hora de colheita não
  // se conhece não pode alegar ser o mais recente: carimbá-lo com o relógio da leitura fazia um
  // registro de origem desconhecida derrubar a resposta que o agente acabara de dar. `null` aqui
  // quer dizer "não sei quando este número nasceu", e `juntar` trata isso como o mais fraco.
  // (O `quando` continua valendo para quem chama com carimbo próprio.)
  const carimbo = typeof bloco.fetchedAtMs === 'number' && Number.isFinite(bloco.fetchedAtMs)
    ? bloco.fetchedAtMs
    : (typeof quando === 'number' ? quando : null)
  return dasJanelas(bloco && bloco.utilization, carimbo)
}

/**
 * FONTE 2 (a que vale) — a resposta do método de uso do agente, perguntada AO VIVO.
 *
 * ⚠️ POR QUE ELA EXISTE, depois de a V20 ter nascido só com o registro local. O registro não é
 * reescrito na cadência em que o arquivo é regravado: ele só muda quando o outro programa vai
 * buscar o número. Medido em 21/09/2026, nesta máquina, duas vezes com horas de intervalo — e nas
 * duas o registro estava parado no MESMO 29%:
 *
 *     registro local (colhido há 48 min)  ->  5h 29% | 7d 78%      (medição da tarde)
 *     perguntando ao agente agora          ->  5h 57% | 7d 82%
 *     registro local (colhido há 50 min)  ->  5h 29% | 7d 88%      (medição do fim do dia)
 *     perguntando ao agente agora          ->  5h 42% | 7d 90%
 *
 * A faixa desenhava certo um número errado — e uma faixa que fica na tela o tempo todo, e em cima
 * da qual se decide parar ou continuar, mentindo por 13 a 28 pontos, é pior que faixa nenhuma.
 *
 * ⚠️ `rate_limits_available: false` NÃO É FALHA. É o agente dizendo que esta conta não tem limite
 * de plano para mostrar (chave de interface, outros provedores). Nesse caso a faixa não fica com
 * número zumbi do registro: ela se apaga. Ver `juntar`.
 */
function daConsulta(resposta, quando = Date.now()) {
  if (!resposta || typeof resposta !== 'object') return null
  // O cache em arquivo guarda "esta conta não tem limite" como `{rate_limits: {semLimite: true}}`.
  // Sem esta linha, a janela que lesse o cache não saberia disso e voltaria a subir um agente.
  const doCache = resposta.rate_limits && resposta.rate_limits.semLimite === true
  if (doCache || resposta.rate_limits_available === false || resposta.semLimite === true) {
    return { janelas: JANELAS.map(j => ({ rotulo: j.rotulo, pct: null, resetaEm: null, colhidoEm: quando })), lidoEm: quando, semLimite: true }
  }
  const u = resposta.rate_limits && typeof resposta.rate_limits === 'object' ? resposta.rate_limits : resposta
  return dasJanelas(u, quando)
}

/**
 * Junta uma leitura nova ao que já estava na tela.
 *
 * ⚠️ AQUI MORA O "PERDER NUNCA". Leitura que não trouxe número para uma janela **não apaga** o
 * número que estava lá: fica o anterior. Só um número novo substitui um número. Sem isto, uma
 * leitura torta (arquivo sendo reescrito na hora, campo ausente numa versão nova do programa)
 * limparia a faixa — que é exatamente o que ele proibiu.
 *
 * ⚠️ E AQUI MORA O DESEMPATE ENTRE AS DUAS FONTES: quem foi COLHIDO por último manda. Isto não é
 * idade na tela e não é descarte por tempo (os dois seguem proibidos, ordem dele): número velho
 * continua desenhado para sempre, sem aviso nenhum. O carimbo só responde a uma pergunta, e só
 * quando duas fontes discordam — *qual destes dois números é o mais recente?* Sem ele, a releitura
 * do registro (com o número congelado de 50 minutos atrás) sobrescrevia, de 5 em 5 minutos, a
 * resposta que o agente acabara de dar.
 */
function juntar(estado, novidade) {
  if (!novidade) return estado
  const antes = (estado && estado.janelas) || []
  // O agente disse que esta conta não tem limite: a faixa se apaga em vez de exibir o que sobrou.
  if (novidade.semLimite) return { janelas: novidade.janelas, lidoEm: novidade.lidoEm, semLimite: true }
  const janelas = novidade.janelas.map((nova, i) => {
    const velha = antes[i] || { rotulo: nova.rotulo, pct: null, resetaEm: null, colhidoEm: null }
    /*
      QUEM PERDE, E SÓ NESTES DOIS CASOS:
        - a novidade foi colhida ANTES do que já está na tela (as duas com carimbo);
        - a novidade não tem carimbo nenhum e o que está na tela tem.
      Nos outros dois casos a novidade entra: as duas sem carimbo (uma releitura da mesma fonte
      substitui a anterior, que é o comportamento de sempre) e a novidade carimbada sobre uma
      velha sem carimbo.
    */
    const temNumeroAntes = velha.pct !== null
    const novaSemCarimbo = typeof nova.colhidoEm !== 'number'
    const velhaComCarimbo = typeof velha.colhidoEm === 'number'
    const maisVelha = temNumeroAntes && (
      (!novaSemCarimbo && velhaComCarimbo && nova.colhidoEm < velha.colhidoEm) ||
      (novaSemCarimbo && velhaComCarimbo)
    )
    if (maisVelha) return velha
    return {
      rotulo: nova.rotulo,
      pct: nova.pct === null ? velha.pct : nova.pct,
      resetaEm: nova.resetaEm === null ? velha.resetaEm : nova.resetaEm,
      colhidoEm: nova.pct === null ? velha.colhidoEm : nova.colhidoEm,
    }
  })
  return { janelas, lidoEm: novidade.lidoEm }
}

/** Já houve alguma leitura com número? Antes disso a faixa não desenha medidor nenhum. */
function temNumero(estado) {
  return !!(estado && estado.janelas && estado.janelas.some(j => j.pct !== null))
}

/**
 * O que a faixa desenha: uma lista de medidores.
 *
 * ⚠️ SEM IDADE, SEM AVISO DE VELHO, SEM TRAÇO — ordem dele. O que sai é rótulo e porcentagem.
 * Janela sem número ainda (só antes da primeira leitura) sai com `pct: null` e a faixa a omite.
 */
function medidores(estado) {
  if (!temNumero(estado)) return []
  return estado.janelas
    .filter(j => j.pct !== null)
    .map(j => ({ rotulo: j.rotulo, pct: Math.round(j.pct) }))
}

/**
 * O DETALHE do consumo — o que o botão de expandir da faixa mostra (`t199`).
 *
 * Ele pediu: *"o botao de expandir deve mostrar oq aparece quando clico aqui"*, apontando o
 * "Account & usage…" da extensão oficial.
 *
 * ⚠️ NÃO HÁ COMANDO QUE ABRA AQUELE PAINEL. Os 26 comandos que a extensão oficial registra foram
 * listados um a um: nenhum é de conta ou de uso — aquilo é um componente interno da tela dela.
 * Então o detalhe é desenhado por nós, com o que o registro local traz. O que ele traz está aqui;
 * o que não traz NÃO se inventa.
 *
 * ⚠️ O QUE ESTA FUNÇÃO NÃO DEVOLVE, E POR QUÊ:
 *   - **quanto falta em dinheiro**: medido, `limit_dollars` e `used_dollars` vêm vazios. Calcular
 *     seria número inventado num lugar onde a pessoa confia;
 *   - **as frases de análise** da tela dela ("83% do seu uso veio de sessões acima de 150k de
 *     contexto"). Aquilo ela calcula dos arquivos de conversa da máquina, e não é campo do
 *     registro. Se um dia existir aqui, será conta NOSSA sobre os mesmos arquivos — e terá de
 *     dizer, como a dela diz, que é só desta máquina.
 *
 * ⚠️ O terceiro limite continua fora, como na faixa (ordem dele).
 */
function detalhe(conteudo) {
  if (!conteudo || typeof conteudo !== 'object') return null
  // ⚠️ AS DUAS FONTES SERVEM AQUI, e a ao vivo é melhor: medido, a resposta do agente traz o mesmo
  // `seven_day_breakdown` e o mesmo `extra_usage` que o registro guarda — só que de agora. Quem
  // chama passa o que tiver: a resposta ao vivo (`rate_limits`), o arquivo inteiro
  // (`cachedUsageUtilization`) ou o bloco de dentro.
  const bloco = conteudo.cachedUsageUtilization || conteudo
  const u = (bloco && bloco.utilization)
    || (conteudo.rate_limits && typeof conteudo.rate_limits === 'object' ? conteudo.rate_limits : null)
    // ⚠️ E TAMBÉM AS JANELAS SOLTAS: é assim que o cache ao vivo entrega (`{five_hour, seven_day,
    // seven_day_breakdown, extra_usage}`), e sem esta linha o detalhe voltava vazio justamente
    // quando havia número fresco para mostrar.
    || (bloco && (bloco.five_hour || bloco.seven_day) ? bloco : null)
  if (!u || typeof u !== 'object') return null

  const janelas = JANELAS.map(({ chave, rotulo }) => {
    const j = u[chave]
    return {
      rotulo,
      nome: chave === 'five_hour' ? 'Janela de 5 horas' : 'Semana (7 dias)',
      pct: j ? porcentagemValida(j.utilization) : null,
      resetaEm: j ? instante(j.resets_at) : null,
    }
  })

  // De onde veio o uso da semana, por produto. É o único detalhamento que o registro traz pronto.
  let porProduto = []
  const b = u.seven_day_breakdown
  if (b && Array.isArray(b.rows)) {
    porProduto = b.rows
      .filter(r => r && typeof r.percent === 'number')
      .map(r => ({
        nome: typeof r.display_name === 'string' ? r.display_name : String(r.key || '?'),
        pct: porcentagemValida(r.percent),
      }))
      .filter(r => r.pct !== null)
      .sort((a, b2) => b2.pct - a.pct)
  }

  // Crédito extra: só aparece quando a pessoa o tem ligado.
  let credito = null
  const e = u.extra_usage
  if (e && e.is_enabled === true) {
    credito = { usado: porcentagemValida(e.utilization), limiteMensal: typeof e.monthly_limit === 'number' ? e.monthly_limit : null }
  }

  return { janelas, porProduto, credito, lidoEm: typeof bloco.fetchedAtMs === 'number' ? bloco.fetchedAtMs : null }
}

module.exports = {
  JANELAS, FORA_POR_ORDEM_DELE,
  estadoInicial, doRegistro, daConsulta, dasJanelas, juntar, medidores, temNumero, detalhe,
  porcentagemValida, instante,
}
