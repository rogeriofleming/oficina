// A FAIXA DO LIMITE — quem segura o tempo e publica o que o núcleo desenha (V20).
//
// O motor (`usoDoPlano.js`) traduz as fontes em medidores; aqui mora o TEMPO: quando perguntar e o
// que publicar. A divisão é a mesma do mostrador do limite da V19 — motor puro de um lado, relógio
// do outro — porque foi ela que deixou o motor provável em node puro.
//
// ⚠️ DUAS FONTES, NESTA ORDEM (e a segunda é o conserto do defeito que a V20 nasceu com):
//
//   1. o PISO, de graça e instantâneo: o nosso cache em arquivo (o que outra janela já colheu ao
//      vivo) e, abaixo dele, o registro do programa de linha de comando. É o que faz a faixa
//      NASCER com número em vez de vazia;
//   2. a VERDADE, perguntada ao agente ao vivo (`consultaDeUso.js`).
//
// A V20 nasceu só com o registro local, e a faixa desenhava certo um número errado. Medido duas
// vezes em 21/09/2026, nesta máquina, com ele trabalhando — e nas duas o registro estava parado no
// MESMO 29%, com 48 e 50 minutos de idade, enquanto o real era 57% e 42%. Uma faixa que fica na
// tela o tempo todo, e em cima da qual se decide parar ou continuar, errada por 13 a 28 pontos, é
// pior que faixa nenhuma.
//
// ⚠️ A CADÊNCIA É DELE, NÃO É "BOA PRÁTICA". *"o numero pode atualizar de 5min em 5min, mas perder
// nunca"*. E os 5 minutos também cabem na cota do endereço que serve este dado: medido, quatro
// chamadas seguidas passam e a quinta é recusada pedindo 300 s.
//
// ⚠️ O "PERDER NUNCA" É LEI AQUI DENTRO: nenhuma falha — rede caída, agente fechado, método sumido,
// arquivo meio escrito — apaga o número que está na tela. O pior caso é ele envelhecer calado, que
// é o que ele escolheu ao proibir a idade na faixa.
//
// ⚠️ TUDO QUE MEDE TEMPO É INJETÁVEL (`agora`, `marcar`, `desmarcar`), pelo mesmo motivo do
// mostrador da V19: sem isso, provar "passou o intervalo e releu" custaria 5 minutos de teste.

'use strict'

const os = require('os')
const path = require('path')
const fs = require('fs')
const U = require('./usoDoPlano')
const C = require('./consultaDeUso')

/**
 * A chave que o núcleo lê para desenhar a faixa.
 *
 * ⚠️ UMA CHAVE SÓ, COM JSON DENTRO — e isto é decisão de interface com o patch. O patch 0017 é
 * GENÉRICO: o núcleo aprende a desenhar "uma lista de medidores com rótulo e porcentagem", e não
 * aprende o que é "limite", "5h" ou "plano". Publicar em chaves separadas (uma por número) faria
 * o núcleo precisar saber quantos números existem — e a cada mudança de ideia do produto seria
 * patch novo e build novo. É o mesmo raciocínio do patch 0016.
 */
const CHAVE_DA_FAIXA = 'oficina.faixa'

/** Onde o programa de linha de comando deixa o registro. Mesma regra do mostrador da V19. */
function caminhosDoRegistro(ambiente = process.env, pastaPessoal = os.homedir()) {
  const lista = []
  if (ambiente.CLAUDE_CONFIG_DIR) lista.push(path.join(ambiente.CLAUDE_CONFIG_DIR, '.claude.json'))
  lista.push(path.join(pastaPessoal, '.claude.json'))
  return lista
}

/**
 * Lê o registro do disco, sem nunca lançar.
 *
 * ⚠️ ASSÍNCRONA DE PROPÓSITO: este arquivo guarda muito mais que o uso do plano e cresce com o
 * uso (0,12 MB nesta máquina). Lido de forma síncrona, travaria o processo de extensões a cada
 * leitura de fundo.
 */
async function lerRegistroDoDisco(caminhos = caminhosDoRegistro()) {
  for (const c of caminhos) {
    try { return JSON.parse(await fs.promises.readFile(c, 'utf8')) } catch { /* ver `juntar`: leitura torta não apaga nada */ }
  }
  return null
}

/** De 5 em 5 minutos — a cadência que ele mandou, e a que cabe na cota do endereço. */
const INTERVALO_DA_LEITURA_MS = 5 * 60 * 1000

function criarFaixa(vscode, {
  agora = () => Date.now(),
  marcar = (fn, ms) => setTimeout(fn, ms),
  desmarcar = t => clearTimeout(t),
  lerRegistro = lerRegistroDoDisco,
  comandoDoBotao = 'oficina.limite.detalhe',
  /** Onde o cache compartilhado entre janelas mora (a pasta de dados da extensão). */
  pastaDoCache = undefined,
  /** A consulta ao vivo. Injetável para medir sem subir agente nenhum. */
  consulta = null,
  /** Desligar a consulta ao vivo deixa a faixa como na primeira V20: só o piso. */
  aoVivo = true,
} = {}) {
  let estado = U.estadoInicial()
  let publicado = null
  let relogio = null
  let descartado = false
  /**
   * O método de uso sumiu numa atualização do agente?
   *
   * ⚠️ ELE SE DECLARA EXPERIMENTAL NO PRÓPRIO NOME. Sumir é caso NORMAL aqui dentro, não defeito —
   * e quando acontece não adianta insistir de 5 em 5 minutos: a faixa passa a viver do piso, que é
   * exatamente o que a primeira V20 fazia.
   */
  let semMetodo = false
  /**
   * A conta não tem limite de plano para mostrar — e isto é GRUDENTO, como o `semMetodo`.
   *
   * ⚠️ ACHADO POR REVISOR INDEPENDENTE, COM SONDA, e era o pior defeito desta peça. Sem isto, a
   * rodada fazia: piso repõe os números velhos do registro (a faixa APARECE) → a consulta responde
   * "esta conta não tem limite" (a faixa SOME) → 5 minutos depois, tudo de novo. A faixa é uma
   * parte do editor: aparecer e sumir empurra o editor inteiro 26 px para baixo e para cima, de 5
   * em 5 minutos, com números que o produto já sabe que são falsos — e subindo um agente a cada
   * volta, porque a resposta não era cacheável.
   */
  let semLimite = false
  /** Uma rodada por vez: duas em paralelo compartilhariam a consulta, e o prazo de uma abortaria a outra. */
  let emCurso = false
  /**
   * Falhas seguidas da consulta (rede caída, sem login, cota do endereço).
   *
   * ⚠️ TAMBÉM ACHADO POR REVISOR: sem recuo, uma janela aberta sem rede subia ~288 processos de
   * 232 MB por dia, cada um segurando até o prazo, calada. Agora a espera dobra a cada falha, até
   * o teto — e o piso continua desenhado o tempo todo, que é o que ele pediu.
   */
  let falhasSeguidas = 0
  let esperarAte = 0
  const TETO_DO_RECUO_MS = 60 * 60 * 1000
  const viva = consulta || (aoVivo ? C.criarConsulta({ agora }) : null)
  // Só para quem mede, com teto: uma janela aberta por dias publicaria para sempre, e lista sem
  // teto é vazamento de memória lento (a mesma trava do mostrador da V19).
  const publicacoes = []
  const TETO_DAS_PUBLICACOES = 50
  const origens = []
  const TETO_DAS_ORIGENS = 50

  const definir = (chave, valor) => {
    try { Promise.resolve(vscode.commands.executeCommand('setContext', chave, valor)).catch(() => { }) }
    catch { /* fora do editor não há chave nenhuma: a faixa não pode derrubar a ativação */ }
  }

  const anotarOrigem = o => {
    origens.push(o)
    if (origens.length > TETO_DAS_ORIGENS) origens.splice(0, origens.length - TETO_DAS_ORIGENS)
  }

  /**
   * Publica o que a faixa desenha — e SÓ quando muda.
   *
   * O "só quando muda" não é economia: a faixa se redesenha a cada publicação, e republicar o
   * mesmo conteúdo de 5 em 5 minutos a faria piscar sem nada ter acontecido.
   */
  function publicar() {
    if (descartado) return
    const medidores = U.medidores(estado)
    // Sem número nenhum (antes da primeira leitura) a faixa não aparece — e some do layout,
    // em vez de ocupar 26 px desenhando vazio.
    const conteudo = medidores.length ? JSON.stringify({ botao: comandoDoBotao, medidores }) : ''
    if (publicado !== conteudo) {
      definir(CHAVE_DA_FAIXA, conteudo)
      publicado = conteudo
      publicacoes.push({ medidores })
      if (publicacoes.length > TETO_DAS_PUBLICACOES) publicacoes.splice(0, publicacoes.length - TETO_DAS_PUBLICACOES)
    }
  }

  /** O PISO: o cache que outra janela colheu ao vivo e, abaixo dele, o registro do outro programa. */
  async function lerOPiso() {
    let veio = false
    let doCache = null
    try { doCache = await C.lerCache(pastaDoCache, agora) } catch { doCache = null }
    if (doCache) {
      const novidade = U.daConsulta(doCache, doCache.colhidoEm)
      if (novidade && novidade.semLimite) semLimite = true
      estado = U.juntar(estado, novidade)
      anotarOrigem('cache')
      veio = true
    }
    // Sabido que esta conta não tem limite para mostrar, o registro velho não volta para a tela.
    if (semLimite) return { veio, cache: doCache }
    let conteudo = null
    try { conteudo = await lerRegistro() } catch { conteudo = null }
    // ⚠️ SEM SEGUNDO ARGUMENTO, DE PROPÓSITO: o registro se carimba com o `fetchedAtMs` DELE, não
    // com a hora em que nós o lemos. Passar `agora()` aqui é exatamente o erro que fazia a
    // releitura do registro (parado em 29% havia 50 min) apagar, de 5 em 5 minutos, a resposta que
    // o agente acabara de dar. Sem `fetchedAtMs`, o número fica sem carimbo — e perde de quem tem.
    const doReg = U.doRegistro(conteudo)
    if (doReg) { estado = U.juntar(estado, doReg); anotarOrigem('registro'); veio = true }
    return { veio, cache: doCache }
  }

  /**
   * Uma rodada: o piso primeiro (instantâneo), a verdade depois (quando vale a pena perguntar).
   *
   * ⚠️ QUANDO NÃO VALE A PENA PERGUNTAR: quando o cache em arquivo tem menos de 5 minutos. Ele é
   * escrito por quem perguntou ao vivo, em qualquer janela desta máquina — e é assim que abrir
   * cinco janelas do programa não sobe cinco agentes de 232 MB.
   */
  async function lerAgora() {
    if (descartado) return false
    if (emCurso) return U.temNumero(estado)
    emCurso = true
    try {
      const { cache } = await lerOPiso()
      publicar()

      const cacheFresco = !!cache && (agora() - cache.colhidoEm) < C.CACHE_VELHO_MS
      const recuando = agora() < esperarAte
      if (viva && !semMetodo && !semLimite && !cacheFresco && !recuando) {
        const r = await viva.perguntar()
        if (descartado) return U.temNumero(estado)
        if (r.estado === 'ok') {
          const quando = typeof r.quando === 'number' ? r.quando : agora()
          falhasSeguidas = 0
          esperarAte = 0
          const novidade = U.daConsulta(r.resposta, quando)
          if (novidade && novidade.semLimite) { semLimite = true; anotarOrigem('semLimite') }
          estado = U.juntar(estado, novidade)
          if (!semLimite) anotarOrigem('aoVivo')
          // Guardar para as outras janelas não pode atrasar a pintura: é disparado e esquecido.
          // ⚠️ O "sem limite" TAMBÉM é guardado — é o que impede as outras janelas de subir agente.
          Promise.resolve(C.gravarCache(pastaDoCache, r.resposta, quando)).catch(() => { })
        } else if (r.estado === 'semMetodo') {
          // Sumiu numa atualização: daqui em diante a faixa vive do piso, sem insistir.
          semMetodo = true
          anotarOrigem('semMetodo')
        } else {
          // Recuo que dobra: 5, 10, 20, 40 min… até o teto de uma hora.
          falhasSeguidas++
          const espera = Math.min(INTERVALO_DA_LEITURA_MS * Math.pow(2, falhasSeguidas - 1), TETO_DO_RECUO_MS)
          esperarAte = agora() + espera
          anotarOrigem('falhou')
        }
        publicar()
      }
      return U.temNumero(estado)
    } finally {
      emCurso = false
    }
  }

  function marcarRelogio() {
    if (relogio) { desmarcar(relogio); relogio = null }
    if (descartado) return
    // ⚠️ O CALLBACK DEVOLVE A PROMESSA, e isso não é enfeite: `setTimeout` a ignora, mas o relógio
    // de mentira dos testes a aguarda. Sem devolvê-la, o teste que avança o relógio conferia a
    // faixa ANTES de a rodada terminar — e a rodada passou a ter leitura de arquivo de verdade
    // (o cache) no meio. Foi assim que "passados os 5 min, releu" ficou vermelho sem defeito.
    relogio = marcar(() => {
      relogio = null
      return Promise.resolve(lerAgora()).catch(() => { }).then(() => marcarRelogio())
    }, INTERVALO_DA_LEITURA_MS)
  }

  /**
   * Liga.
   *
   * ⚠️ O PISO É PUBLICADO ANTES DE A CONSULTA SUBIR, e por isso os ~7 s dela não aparecem para
   * ninguém: quando a janela abre, a faixa já está desenhada com o último número conhecido. A
   * consulta ao vivo acontece na mesma rodada, logo atrás, e repinta quando responde.
   */
  async function ligar() {
    await lerAgora()
    marcarRelogio()
  }

  function descartar() {
    descartado = true
    if (relogio) { desmarcar(relogio); relogio = null }
    // ⚠️ DERRUBAR A CONSULTA NÃO É OPCIONAL: ela é um processo de ~232 MB. Fechar a janela sem
    // derrubá-la deixaria o agente de pé até o sistema operacional resolver limpar.
    if (viva && typeof viva.descartar === 'function') viva.descartar()
  }

  return {
    ligar, descartar, lerAgora, publicar,
    get estado() { return estado },
    get publicado() { return publicado },
    get publicacoes() { return publicacoes },
    get origens() { return origens },
    get temRelogio() { return relogio !== null },
    get semMetodo() { return semMetodo },
    get semLimite() { return semLimite },
    get falhasSeguidas() { return falhasSeguidas },
    get consulta() { return viva },
  }
}

module.exports = {
  criarFaixa, caminhosDoRegistro, lerRegistroDoDisco,
  CHAVE_DA_FAIXA, INTERVALO_DA_LEITURA_MS,
}
