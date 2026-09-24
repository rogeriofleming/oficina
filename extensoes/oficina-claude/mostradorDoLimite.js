// O MOSTRADOR DO LIMITE — quem segura o estado, o relógio e a cota, e publica o que a barra
// de cima desenha.
//
// O motor (`limite.js`) traduz e escreve o texto; aqui mora o TEMPO: quando consultar, quando
// não consultar, quando repintar porque o número envelheceu, e o que fazer quando a pessoa
// clica. Nada disto cabe num motor puro, e nada disto pode morar solto na ativação da extensão
// — foi a lição do relógio do cache, que virou peça própria pelo mesmo motivo.
//
// ⚠️ TUDO QUE MEDE TEMPO É INJETÁVEL (`agora`, `marcar`, `desmarcar`). Sem isso, provar "passou
// uma hora e o número sumiu" custaria uma hora de teste, e o caminho ficaria sem teste nenhum.
//
// ⚠️ NINGUÉM AQUI VÊ SEGREDO. O que sai deste arquivo são duas coisas: um sim/não de mostrar e
// um texto de duas partes (a linha da barra e o que o mouse mostra). Token, cabeçalho e
// identificador de conta não passam por aqui nem em registro de diagnóstico.

'use strict'

const os = require('os')
const path = require('path')
const fs = require('fs')
const L = require('./limite')

/**
 * As chaves que a barra de cima lê.
 *
 * ⚠️ SÃO DUAS, E NÃO TRÊS, DE PROPÓSITO. Um item de menu do editor tem título estático no
 * manifesto e NÃO tem campo de dica que uma extensão possa preencher (medido no tipo:
 * `ICommandAction` tem `title` e `tooltip`, mas `contributes.commands` só aceita o primeiro).
 * Então o texto vivo carrega as duas informações numa string só: a PRIMEIRA LINHA é o que se lê
 * na barra, e o resto é o que o mouse mostra. Quem separa é o editor, no patch da barra de
 * título — e a regra é genérica, não sabe o que é "limite".
 */
const CHAVE_DO_TEXTO = 'oficina.limite'
const CHAVE_DE_MOSTRAR = 'oficina.limite.aMostrar'

/**
 * Onde o programa de linha de comando deixa o registro do uso.
 *
 * ⚠️ MEDIDO: o arquivo é `.claude.json` na pasta pessoal. A primeira alternativa da lista é
 * tentativa barata para quem aponta a configuração do programa para outro lugar — NÃO foi
 * medida, e por isso vem antes só quando o arquivo existe mesmo.
 */
function caminhosDoRegistro(ambiente = process.env, pastaPessoal = os.homedir()) {
  const lista = []
  if (ambiente.CLAUDE_CONFIG_DIR) lista.push(path.join(ambiente.CLAUDE_CONFIG_DIR, '.claude.json'))
  lista.push(path.join(pastaPessoal, '.claude.json'))
  return lista
}

/**
 * Lê o registro local, sem nunca lançar. `null` quando não há nada legível.
 *
 * ⚠️ A LEITURA É ASSÍNCRONA DE PROPÓSITO. Este arquivo guarda muito mais coisa que o uso do
 * plano, e o tamanho dele depende de quanto a pessoa já trabalhou — nesta máquina são 0,11 MB e
 * 5 ms, mas não há teto conhecido. Lido de forma síncrona, ele travaria o processo de extensões
 * por todo esse tempo, na abertura e a cada leitura de fundo. O custo de ser assíncrona é que a
 * primeira pintura chega alguns milissegundos depois; o de ser síncrona seria a janela engasgar
 * num tempo que ninguém mede.
 */
async function lerRegistroDoDisco(caminhos = caminhosDoRegistro()) {
  for (const c of caminhos) {
    try {
      return JSON.parse(await fs.promises.readFile(c, 'utf8'))
    } catch { /* não existe, meio escrito ou ilegível: o piso é o piso, não pode quebrar nada */ }
  }
  return null
}

const MINUTO = 60 * 1000

function criarMostrador(vscode, {
  agora = () => Date.now(),
  marcar = (fn, ms) => setTimeout(fn, ms),
  desmarcar = t => clearTimeout(t),
  lerRegistro = lerRegistroDoDisco,
  consultar = null,        // () => Promise<{ estado, resposta, erro }> — a leitura pelo agente
  avisar = null,           // (texto) => void — a única fala com a pessoa, e só quando ELA clica
} = {}) {
  let estado = L.estadoInicial()
  let publicado = { mostrar: null, texto: null }
  let relogioDaConsulta = null
  let tiqueDaIdade = null
  let descartado = false
  let lendo = false
  // O que foi para as chaves, em ordem — só para quem mede. ⚠️ COM TETO: uma janela aberta por dias
  // publicaria a cada 5 min para sempre, e uma lista sem teto é um vazamento de memória lento.
  const publicacoes = []
  const TETO_DAS_PUBLICACOES = 50

  const definir = (chave, valor) => {
    try { Promise.resolve(vscode.commands.executeCommand('setContext', chave, valor)).catch(() => { }) }
    catch { /* fora do editor não há chave nenhuma: o mostrador não pode derrubar a ativação */ }
  }

  /**
   * Publica o que a barra desenha — e SÓ quando muda.
   *
   * ⚠️ O "só quando muda" não é economia de linha: a barra de título se redesenha a cada
   * publicação, e publicar o mesmo texto de minuto em minuto faria a barra piscar sem nada ter
   * acontecido.
   */
  function publicar() {
    if (descartado) return
    const quando = agora()
    const texto = L.textoDaBarra(estado, quando)
    const mostrar = texto !== null
    const dica = L.dicaDaBarra(estado, quando)
    const junto = mostrar ? `${texto}\n${dica}` : ''
    if (publicado.mostrar !== mostrar) { definir(CHAVE_DE_MOSTRAR, mostrar); publicado.mostrar = mostrar }
    if (publicado.texto !== junto) { definir(CHAVE_DO_TEXTO, junto); publicado.texto = junto }
    publicacoes.push({ mostrar, texto, dica })
    if (publicacoes.length > TETO_DAS_PUBLICACOES) publicacoes.splice(0, publicacoes.length - TETO_DAS_PUBLICACOES)
    marcarTiqueDaIdade(quando)
  }

  /**
   * O TIQUE DA IDADE. Enquanto o número está velho (mas ainda vale), a barra diz "há N min" — e
   * esse N muda sozinho, sem nada chegar do agente. Um tique por virada de minuto, marcado uma
   * vez; nenhum enquanto o número é recente (aí não há nada a redesenhar) e nenhum depois que
   * ele é velho demais (aí o texto já parou de mudar).
   */
  function marcarTiqueDaIdade(quando) {
    if (tiqueDaIdade) { desmarcar(tiqueDaIdade); tiqueDaIdade = null }
    const idade = L.idadeMs(estado, quando)
    if (idade === null || idade >= L.IDADE_DESCARTAR_MS) return
    const faltaParaVelho = L.IDADE_VELHA_MS - idade
    const espera = faltaParaVelho > 0 ? faltaParaVelho : (MINUTO - (idade % MINUTO))
    tiqueDaIdade = marcar(() => { tiqueDaIdade = null; publicar() }, Math.max(1, espera))
  }

  /** Junta uma novidade ao estado e repinta. */
  function receber(novidade) {
    if (!novidade) return false
    estado = L.juntar(estado, novidade)
    publicar()
    return true
  }

  /** O aviso que chega de graça no laço da conversa (fração e segundos — o motor converte). */
  function aoAviso(aviso) {
    return receber(L.doAviso(aviso, agora()))
  }

  /**
   * O piso: o registro que o programa de linha de comando deixou no computador.
   *
   * ⚠️ Devolve PROMESSA, porque a leitura de disco é assíncrona (ver `lerRegistroDoDisco`). Um
   * leitor injetado que devolva valor direto continua valendo: o `await` aceita os dois.
   */
  async function lerDoRegistro() {
    let conteudo = null
    try { conteudo = await lerRegistro() } catch { conteudo = null }
    return receber(L.doRegistro(conteudo))
  }

  /**
   * A CONSULTA AO AGENTE — a única que fala com o servidor, e a que tem cota.
   *
   * `porPedido` é o clique da pessoa. Ele NÃO fura a cota (furar seria pedir para ser barrado
   * por 5 minutos), mas ele é o único caso em que o mostrador fala: quando não pode consultar,
   * diz quanto falta, em vez de parecer que o clique não fez nada.
   */
  async function consultarAgora({ porPedido = false } = {}) {
    if (descartado) return 'descartado'
    const quando = agora()
    if (!L.podeConsultar(estado, quando)) {
      if (porPedido && avisar) {
        const falta = L.idadeEmPalavras(L.faltaParaConsultar(estado, quando))
        avisar(`O limite se consulta no máximo uma vez a cada ${L.idadeEmPalavras(L.INTERVALO_DA_CONSULTA_MS)}. ` +
          `A próxima leitura pode ser em ${falta}.`)
      }
      return 'naCota'
    }
    // ⚠️ Uma leitura de cada vez. Duas em voo ao mesmo tempo gastariam a cota em dobro e a
    // segunda a resposta poderia chegar antes da primeira, pondo o número mais velho na tela.
    if (lendo) return 'jaLendo'
    if (typeof consultar !== 'function') return 'semLeitor'
    lendo = true
    try {
      const r = await consultar()
      const depois = agora()
      if (descartado) return 'descartado'
      if (!r || r.estado === 'semConversa' || r.estado === 'semMetodo') {
        // ⚠️ NÃO É FALHA, E POR ISSO NÃO ENTRA NA COTA. Não houve conversa com o servidor: o
        // método experimental sumiu, ou não há conversa aberta. O piso continua sendo o
        // registro local, e é ele que segura a barra.
        await lerDoRegistro()
        return r ? r.estado : 'semLeitor'
      }
      if (r.estado === 'falhou') {
        estado = L.registrarRecusa(estado, r.erro, depois)
        publicar()
        return 'falhou'
      }
      estado = L.marcarConsulta(estado, depois)
      receber(L.daConsulta(r.resposta, depois))
      return 'ok'
    } finally {
      lendo = false
    }
  }

  /** O relógio de fundo: uma leitura a cada intervalo, e nunca mais que isso. */
  function marcarRelogio() {
    if (relogioDaConsulta) { desmarcar(relogioDaConsulta); relogioDaConsulta = null }
    if (descartado) return
    relogioDaConsulta = marcar(() => {
      relogioDaConsulta = null
      Promise.resolve(consultarAgora()).catch(() => { }).then(() => marcarRelogio())
    }, L.INTERVALO_DA_CONSULTA_MS)
  }

  /**
   * Liga o mostrador: pinta na hora com o registro local (custo zero, sem rede) e só depois vai
   * perguntar ao agente. É por isso que a barra nasce com número em vez de traço.
   */
  async function ligar() {
    await lerDoRegistro()
    publicar()
    marcarRelogio()
    try { await consultarAgora() } catch { /* a barra nao pode cair por causa de uma leitura */ }
  }

  function descartar() {
    descartado = true
    if (relogioDaConsulta) { desmarcar(relogioDaConsulta); relogioDaConsulta = null }
    if (tiqueDaIdade) { desmarcar(tiqueDaIdade); tiqueDaIdade = null }
  }

  return {
    ligar, descartar, aoAviso, lerDoRegistro, consultarAgora, publicar,
    get estado() { return estado },
    get publicacoes() { return publicacoes },
    get ultima() { return publicacoes[publicacoes.length - 1] || null },
    get temRelogio() { return relogioDaConsulta !== null },
    get temTiqueDaIdade() { return tiqueDaIdade !== null },
  }
}

module.exports = { criarMostrador, caminhosDoRegistro, lerRegistroDoDisco, CHAVE_DO_TEXTO, CHAVE_DE_MOSTRAR }
