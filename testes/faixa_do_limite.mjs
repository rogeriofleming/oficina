// A FAIXA DO LIMITE (V20) — o mostrador, com o tempo controlado, em node puro.
//
// O que precisa ser verdade:
//   1. ligar lê na hora e publica os medidores;
//   2. a releitura é de 5 em 5 minutos — a cadência que ele mandou;
//   3. publica SÓ quando o conteúdo muda (senão a faixa pisca de 5 em 5 min sem nada acontecer);
//   4. antes de haver número, a chave sai vazia (a faixa não ocupa altura desenhando vazio);
//   5. leitura que falha não apaga o que estava na tela ("perder nunca");
//   6. o conteúdo publicado leva o comando do botão de expandir;
//   7. descartar para o relógio;
//   8. nada que identifique a conta é publicado.
//
// E a partir do conserto do número errado (21/09/2026), a parte que importa mais:
//   9. o número perguntado AO VIVO manda sobre o registro local, que envelhece calado;
//  10. consulta que falha não apaga a faixa, e o piso continua valendo;
//  11. o método experimental sumido não vira erro — vira "viver do piso", sem insistir;
//  12. cache fresco (de outra janela) POUPA a consulta: é o que impede 5 janelas = 5 agentes;
//  13. descartar derruba a consulta (senão fica um processo de ~232 MB de pé).
//
// ⚠️ OS BLOCOS DE TEMPO RODAM COM `aoVivo: false` DE PROPÓSITO. Eles medem relógio e piso; subir
// um agente de verdade neles tornaria o teste lento e dependente de rede. Quem prova que a
// consulta REAL responde é `testes/consulta_de_uso.mjs`, sem dublê nenhum — a lição da rodada 1 de
// revisores da V20, em que um dublê tinha um método que a classe real não tinha.
//
// Uso:  node testes/faixa_do_limite.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const F = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'faixaDoLimite.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

/** Um editor de mentira: guarda o que foi para cada chave. */
function editorFalso() {
  const chaves = {}
  const historico = []
  return {
    chaves, historico,
    commands: {
      executeCommand: (cmd, chave, valor) => {
        if (cmd === 'setContext') { chaves[chave] = valor; historico.push({ chave, valor }) }
        return Promise.resolve()
      },
    },
  }
}

/** Um relógio de mentira: nada acontece sozinho, só quando o teste manda. */
function relogioFalso() {
  let t = Date.parse('2026-09-21T12:00:00.000Z')
  const pendentes = new Map()
  let id = 0
  return {
    agora: () => t,
    marcar: (fn, ms) => { const i = ++id; pendentes.set(i, { fn, quando: t + ms }); return i },
    desmarcar: i => pendentes.delete(i),
    get pendentes() { return pendentes },
    /** Avança o relógio e dispara o que vencer. */
    async avancar(ms) {
      t += ms
      for (const [i, p] of [...pendentes]) {
        if (p.quando <= t) { pendentes.delete(i); await p.fn() }
      }
    },
  }
}

const registro = (cinco, sete) => ({
  cachedUsageUtilization: {
    accountUuid: 'nao-pode-vazar-0000',
    utilization: {
      five_hour: cinco === null ? null : { utilization: cinco, resets_at: '2026-09-21T17:40:00Z' },
      seven_day: sete === null ? null : { utilization: sete, resets_at: '2026-09-24T13:00:00Z' },
      nimbus_quill: { utilization: 17, resets_at: null },
    },
  },
})

const MIN = 60 * 1000

/**
 * Uma pasta de cache SÓ DESTE TESTE.
 *
 * ⚠️ Sem isto, a faixa leria o cache real desta máquina (escrito pela OFICINA aberta ao lado) e os
 * casos passariam ou falhariam conforme o que estivesse no disco na hora. Foi o que aconteceu na
 * primeira rodada depois do conserto: a faixa "nasceu" com 44%/90% num caso que exigia vazio.
 */
const pastaNova = () => fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-faixa-'))

/**
 * ⚠️ E UMA PASTA POR BLOCO, não uma para o arquivo todo: a faixa GRAVA no cache quando pergunta ao
 * vivo, e um bloco passou a poupar a consulta do bloco seguinte (que então nunca era feita). Dois
 * casos ficaram vermelhos assim, sem defeito nenhum no produto.
 */
const SEM_AGENTE = () => ({ aoVivo: false, pastaDoCache: pastaNova() })

/** Uma consulta de mentira — e o teste 14 confere que ela só usa métodos que a real tem. */
function consultaFalsa(respostas) {
  let i = 0
  const pedidos = []
  return {
    pedidos,
    descartada: false,
    perguntar: async function () {
      pedidos.push(Date.now())
      const r = respostas[Math.min(i++, respostas.length - 1)]
      return typeof r === 'function' ? r() : r
    },
    descartar: function () { this.descartada = true },
  }
}

/** A resposta do agente, na forma medida contra o SDK real (por cento, hora em texto ISO). */
const aoVivo = (cinco, sete) => ({
  estado: 'ok',
  resposta: {
    rate_limits_available: true,
    rate_limits: {
      five_hour: { utilization: cinco, resets_at: '2026-09-21T22:50:00Z' },
      seven_day: { utilization: sete, resets_at: '2026-09-24T13:00:00Z' },
    },
  },
})

// ── 1, 4, 6, 8 ──
{
  const vs = editorFalso()
  const rel = relogioFalso()
  let proximo = null
  const faixa = F.criarFaixa(vs, { ...rel, ...SEM_AGENTE(), lerRegistro: async () => proximo })

  await faixa.ligar()
  checar('4. sem número ainda, a chave sai vazia',
    vs.chaves[F.CHAVE_DA_FAIXA] === '', JSON.stringify(vs.chaves))

  proximo = registro(3, 75)
  await faixa.lerAgora()
  const cru = vs.chaves[F.CHAVE_DA_FAIXA]
  const pub = JSON.parse(cru || '{}')
  checar('1. ligar/ler publica os dois medidores',
    JSON.stringify(pub.medidores) === JSON.stringify([{ rotulo: '5h', pct: 3 }, { rotulo: '7d', pct: 75 }]), cru)
  checar('6. o conteúdo publicado leva o comando do botão de expandir',
    pub.botao === 'oficina.limite.detalhe', cru)
  checar('8. nada que identifique a conta é publicado',
    !/accountUuid|nao-pode-vazar/i.test(cru), cru.slice(0, 120))
}

// ── 2 e 3 ──
{
  const vs = editorFalso()
  const rel = relogioFalso()
  let proximo = registro(3, 75)
  const faixa = F.criarFaixa(vs, { ...rel, ...SEM_AGENTE(), lerRegistro: async () => proximo })
  await faixa.ligar()
  const publicacoesDepoisDeLigar = faixa.publicacoes.length
  checar('2a. depois de ligar há relógio marcado', faixa.temRelogio === true)

  await rel.avancar(4 * MIN)
  checar('2b. antes dos 5 min não releu', faixa.publicacoes.length === publicacoesDepoisDeLigar)

  proximo = registro(43, 75)
  await rel.avancar(2 * MIN)   // passa dos 5
  const m = JSON.parse(vs.chaves[F.CHAVE_DA_FAIXA]).medidores
  checar('2c. passados os 5 min, releu e o número novo está na faixa',
    m[0].pct === 43, JSON.stringify(m))

  // mesma leitura de novo: não pode republicar
  const antes = faixa.publicacoes.length
  await rel.avancar(5 * MIN)
  checar('3. conteúdo igual não é republicado (a faixa não pisca)',
    faixa.publicacoes.length === antes, `${antes} -> ${faixa.publicacoes.length}`)
}

// ── 5. leitura que falha não apaga ──
{
  const vs = editorFalso()
  const rel = relogioFalso()
  let modo = 'ok'
  const faixa = F.criarFaixa(vs, {
    ...rel, ...SEM_AGENTE(),
    lerRegistro: async () => {
      if (modo === 'explode') throw new Error('arquivo sendo reescrito')
      if (modo === 'vazio') return null
      return registro(70, 75)
    },
  })
  await faixa.ligar()
  const bom = vs.chaves[F.CHAVE_DA_FAIXA]

  modo = 'explode'; await faixa.lerAgora()
  checar('5a. leitura que lança não apaga a faixa', vs.chaves[F.CHAVE_DA_FAIXA] === bom, vs.chaves[F.CHAVE_DA_FAIXA])

  modo = 'vazio'; await faixa.lerAgora()
  checar('5b. leitura vazia não apaga a faixa', vs.chaves[F.CHAVE_DA_FAIXA] === bom, vs.chaves[F.CHAVE_DA_FAIXA])
}

// ── 7. descartar ──
{
  const vs = editorFalso()
  const rel = relogioFalso()
  const faixa = F.criarFaixa(vs, { ...rel, ...SEM_AGENTE(), lerRegistro: async () => registro(3, 75) })
  await faixa.ligar()
  faixa.descartar()
  checar('7. descartar para o relógio', faixa.temRelogio === false && rel.pendentes.size === 0)
}

// ── 9 a 13. A CONSULTA AO VIVO — o conserto do número errado ──
{
  // 9. o registro local diz 29% (o número congelado que ele viu na tela); o agente diz 42%.
  const vs = editorFalso()
  const rel = relogioFalso()
  const consulta = consultaFalsa([aoVivo(42, 90)])
  const faixa = F.criarFaixa(vs, {
    ...rel, pastaDoCache: pastaNova(), consulta,
    lerRegistro: async () => registro(29, 88),
  })
  await faixa.ligar()
  const m = JSON.parse(vs.chaves[F.CHAVE_DA_FAIXA]).medidores
  checar('9. o número perguntado AO VIVO manda sobre o registro local',
    m[0].pct === 42 && m[1].pct === 90, JSON.stringify(m))
  checar('9b. e a faixa passou pelas duas origens: piso primeiro, ao vivo depois',
    faixa.origens.includes('registro') && faixa.origens.indexOf('aoVivo') > faixa.origens.indexOf('registro'),
    JSON.stringify(faixa.origens))

  // ⚠️ O CASO QUE FEZ O CARIMBO EXISTIR: 5 minutos depois, o registro continua com o número velho.
  // Sem comparar QUANDO cada número foi colhido, esta releitura derrubaria o 42% para 29% — de 5
  // em 5 minutos, para sempre.
  await rel.avancar(6 * MIN)
  const m2 = JSON.parse(vs.chaves[F.CHAVE_DA_FAIXA]).medidores
  checar('9c. a releitura do registro velho NÃO derruba o número ao vivo',
    m2[0].pct === 42, JSON.stringify(m2))
  faixa.descartar()
}

{
  // 10. a consulta falha (rede, cota, agente fechado): o piso vale e nada some da tela.
  const vs = editorFalso()
  const rel = relogioFalso()
  const consulta = consultaFalsa([aoVivo(42, 90), { estado: 'falhou', erro: new Error('rede') }])
  const faixa = F.criarFaixa(vs, {
    ...rel, pastaDoCache: pastaNova(), consulta,
    lerRegistro: async () => registro(29, 88),
  })
  await faixa.ligar()
  const bom = vs.chaves[F.CHAVE_DA_FAIXA]
  await rel.avancar(6 * MIN)
  checar('10. consulta que falha não apaga o que está na faixa',
    vs.chaves[F.CHAVE_DA_FAIXA] === bom, vs.chaves[F.CHAVE_DA_FAIXA])
  faixa.descartar()
}

{
  // 11. o método experimental sumiu numa atualização do agente.
  const vs = editorFalso()
  const rel = relogioFalso()
  const consulta = consultaFalsa([{ estado: 'semMetodo' }])
  const faixa = F.criarFaixa(vs, {
    ...rel, pastaDoCache: pastaNova(), consulta,
    lerRegistro: async () => registro(29, 88),
  })
  await faixa.ligar()
  const m = JSON.parse(vs.chaves[F.CHAVE_DA_FAIXA]).medidores
  const perguntasDepoisDeLigar = consulta.pedidos.length
  await rel.avancar(6 * MIN)
  checar('11. método sumido: a faixa vive do piso e PARA de insistir',
    m[0].pct === 29 && faixa.semMetodo === true && consulta.pedidos.length === perguntasDepoisDeLigar,
    JSON.stringify({ m, semMetodo: faixa.semMetodo, pedidos: consulta.pedidos.length }))
  faixa.descartar()
}

{
  // 12. outra janela já perguntou há 1 minuto: esta não sobe agente nenhum.
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-faixa-cache-'))
  const rel = relogioFalso()
  const CD = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'consultaDeUso.js'))
  await CD.gravarCache(pasta, aoVivo(42, 90).resposta, rel.agora() - 1 * MIN)
  const vs = editorFalso()
  const consulta = consultaFalsa([aoVivo(99, 99)])
  const faixa = F.criarFaixa(vs, {
    ...rel, pastaDoCache: pasta, consulta,
    lerRegistro: async () => registro(29, 88),
  })
  await faixa.ligar()
  const m = JSON.parse(vs.chaves[F.CHAVE_DA_FAIXA]).medidores
  checar('12. cache fresco de outra janela poupa a consulta (5 janelas ≠ 5 agentes)',
    consulta.pedidos.length === 0 && m[0].pct === 42, JSON.stringify({ pedidos: consulta.pedidos.length, m }))

  // e o cache velho volta a valer a pena
  await rel.avancar(6 * MIN)
  checar('12b. passada a validade do cache, a consulta volta a ser feita',
    consulta.pedidos.length === 1, String(consulta.pedidos.length))
  faixa.descartar()
}

{
  // 13. fechar a janela tem que derrubar o processo do agente.
  const vs = editorFalso()
  const rel = relogioFalso()
  const consulta = consultaFalsa([aoVivo(42, 90)])
  const faixa = F.criarFaixa(vs, { ...rel, pastaDoCache: pastaNova(), consulta, lerRegistro: async () => null })
  await faixa.ligar()
  faixa.descartar()
  checar('13. descartar derruba a consulta (senão fica um agente de ~232 MB de pé)',
    consulta.descartada === true)
}

// ── 15 a 19. O QUE A RODADA 2 DE REVISORES ACHOU (21/09/2026) ──

{
  // 15. CONTA SEM LIMITE DE PLANO: a faixa não pode piscar de 5 em 5 minutos.
  //
  // ⚠️ O defeito que este caso trava, medido por um revisor com sonda: o piso repunha os números
  // velhos do registro (faixa APARECE), a consulta respondia "esta conta não tem limite" (faixa
  // SOME), e cinco minutos depois tudo de novo — empurrando o editor 26 px para baixo e para cima,
  // com números falsos, e subindo um agente a cada volta.
  const vs = editorFalso()
  const rel = relogioFalso()
  const semLimite = { estado: 'ok', resposta: { rate_limits_available: false } }
  const consulta = consultaFalsa([semLimite])
  const faixa = F.criarFaixa(vs, {
    ...rel, pastaDoCache: pastaNova(), consulta,
    lerRegistro: async () => registro(29, 88),
  })
  await faixa.ligar()
  const publicadoDepoisDeLigar = vs.chaves[F.CHAVE_DA_FAIXA]
  const piscadasAteAqui = faixa.publicacoes.length
  await rel.avancar(6 * MIN)
  await rel.avancar(6 * MIN)
  // ⚠️ O QUE SE EXIGE, E O QUE NÃO DÁ PARA EXIGIR. Na primeiríssima abertura de uma máquina assim
  // não há como saber antes de perguntar: o piso desenha o número velho e a resposta o apaga —
  // uma vez. O que não pode é isso VIRAR CICLO de 5 em 5 minutos, e é isso que se mede aqui:
  // depois da primeira rodada, nenhuma publicação nova.
  checar('15. conta sem limite: a faixa fica vazia e não volta a piscar',
    publicadoDepoisDeLigar === '' && vs.chaves[F.CHAVE_DA_FAIXA] === ''
    && faixa.publicacoes.length === piscadasAteAqui && faixa.semLimite === true,
    JSON.stringify({ publicado: vs.chaves[F.CHAVE_DA_FAIXA], antes: piscadasAteAqui, depois: faixa.publicacoes.length, origens: faixa.origens }))
  checar('15b. e ela PARA de perguntar (senão é um agente de 232 MB a cada 5 min, para sempre)',
    consulta.pedidos.length === 1, String(consulta.pedidos.length))
  faixa.descartar()
}

{
  // 15c. A SEGUNDA JANELA nem chega a piscar: o "sem limite" ficou guardado no cache.
  const pasta = pastaNova()
  const CD = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'consultaDeUso.js'))
  const rel = relogioFalso()
  await CD.gravarCache(pasta, { rate_limits_available: false }, rel.agora())
  const vs = editorFalso()
  const consulta = consultaFalsa([aoVivo(42, 90)])
  const faixa = F.criarFaixa(vs, { ...rel, pastaDoCache: pasta, consulta, lerRegistro: async () => registro(29, 88) })
  await faixa.ligar()
  checar('15c. a outra janela já nasce sabendo: nada é desenhado e nenhum agente sobe',
    (vs.chaves[F.CHAVE_DA_FAIXA] || '') === '' && consulta.pedidos.length === 0 && faixa.semLimite === true,
    JSON.stringify({ publicado: vs.chaves[F.CHAVE_DA_FAIXA], pedidos: consulta.pedidos.length }))
  faixa.descartar()
}

{
  // 16. RELÓGIO QUE ANDA PARA TRÁS: o cache carimbado no futuro não pode congelar a faixa.
  //
  // ⚠️ Outro achado da rodada 2: com `colhidoEm` no futuro, `agora() - colhidoEm` fica negativo, o
  // cache passa a ser "fresco" para sempre e a consulta ao vivo nunca mais acontece. E, como ele
  // proibiu idade na tela, nada denunciaria — a faixa ficaria num número velho, calada.
  const pasta = pastaNova()
  const rel = relogioFalso()
  const CD = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'consultaDeUso.js'))
  await CD.gravarCache(pasta, aoVivo(11, 11).resposta, rel.agora() + 60 * 60 * 1000)   // uma hora no futuro
  const vs = editorFalso()
  const consulta = consultaFalsa([aoVivo(42, 90)])
  const faixa = F.criarFaixa(vs, {
    ...rel, pastaDoCache: pasta, consulta,
    lerRegistro: async () => registro(29, 88),
  })
  await faixa.ligar()
  const m = JSON.parse(vs.chaves[F.CHAVE_DA_FAIXA] || '{}').medidores
  checar('16. carimbo no futuro não congela a faixa: a consulta ao vivo acontece do mesmo jeito',
    consulta.pedidos.length === 1 && m && m[0].pct === 42,
    JSON.stringify({ pedidos: consulta.pedidos.length, m }))
  faixa.descartar()
}

{
  // 17. SEM REDE, SEM LOGIN: a espera dobra, em vez de subir um agente a cada 5 minutos.
  const vs = editorFalso()
  const rel = relogioFalso()
  const consulta = consultaFalsa([{ estado: 'falhou', erro: new Error('sem rede') }])
  const faixa = F.criarFaixa(vs, {
    ...rel, pastaDoCache: pastaNova(), consulta,
    lerRegistro: async () => registro(29, 88),
  })
  await faixa.ligar()                       // 1a tentativa (falha) -> espera 5 min
  await rel.avancar(6 * MIN)                // passou: 2a tentativa (falha) -> espera 10 min
  const depoisDeDuas = consulta.pedidos.length
  await rel.avancar(6 * MIN)                // ainda dentro do recuo de 10 min: NÃO tenta
  const depoisDoRecuo = consulta.pedidos.length
  await rel.avancar(6 * MIN)                // agora passou dos 10: tenta de novo
  checar('17. falha seguida faz a espera DOBRAR (e não um agente a cada 5 min)',
    depoisDeDuas === 2 && depoisDoRecuo === 2 && consulta.pedidos.length === 3 && faixa.falhasSeguidas === 3,
    JSON.stringify({ depoisDeDuas, depoisDoRecuo, total: consulta.pedidos.length, falhas: faixa.falhasSeguidas }))
  checar('17b. e o piso continua desenhado o tempo todo ("perder nunca")',
    JSON.parse(vs.chaves[F.CHAVE_DA_FAIXA] || '{}').medidores[0].pct === 29, vs.chaves[F.CHAVE_DA_FAIXA])
  faixa.descartar()
}

{
  // 18. O INTERRUPTOR, e não só o mecanismo.
  //
  // ⚠️ ESTE CASO NASCEU DE UM ACHADO DIRETO DA RODADA 2: trocar o padrão `aoVivo = true` para
  // `false` — ou seja, DESLIGAR a consulta ao vivo inteira, voltando ao número congelado — passava
  // 21/21. A suíte protegia o mecanismo e não o interruptor. Quem chama em produção
  // (`extensao.js`) depende só do padrão.
  const vs = editorFalso()
  const rel = relogioFalso()
  const faixa = F.criarFaixa(vs, { ...rel, pastaDoCache: pastaNova(), lerRegistro: async () => null })
  const temConsulta = !!faixa.consulta && typeof faixa.consulta.perguntar === 'function'
  faixa.descartar()
  checar('18. de fábrica a faixa PERGUNTA ao vivo (o padrão, não só o mecanismo)', temConsulta,
    String(temConsulta))
}

{
  // 19. Uma rodada por vez: duas em paralelo compartilhariam a consulta, e o prazo de uma
  // abortaria a que a outra está usando.
  const vs = editorFalso()
  const rel = relogioFalso()
  let emVoo = 0
  let maximo = 0
  const consulta = {
    pedidos: [],
    perguntar: async () => {
      emVoo++; maximo = Math.max(maximo, emVoo)
      await new Promise(r => setTimeout(r, 30))
      emVoo--
      consulta.pedidos.push(1)
      return aoVivo(42, 90)
    },
    descartar: () => { },
  }
  const faixa = F.criarFaixa(vs, { ...rel, pastaDoCache: pastaNova(), consulta, lerRegistro: async () => registro(29, 88) })
  await Promise.all([faixa.lerAgora(), faixa.lerAgora(), faixa.lerAgora()])
  checar('19. rodadas em paralelo não se atropelam (uma pergunta por vez)',
    maximo === 1, `máximo simultâneo: ${maximo}`)
  faixa.descartar()
}

// ── 14. O DUBLÊ NÃO PODE TER MÉTODO QUE A PEÇA REAL NÃO TEM ──
//
// ⚠️ ESTE CRITÉRIO NASCEU DE UM DEFEITO REAL: na V20, o teste do mostrador injetava um medidor de
// mentira que TINHA o método `ler()` — que a classe real não tem. O teste ficou verde e o
// mostrador nunca apareceu na tela. Aqui a comparação é entre o dublê e a peça de verdade.
{
  const CD = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'consultaDeUso.js'))
  const real = CD.criarConsulta({ carregarSdk: async () => ({ query: () => ({}) }) })
  const dublê = consultaFalsa([aoVivo(1, 1)])
  const usados = ['perguntar', 'descartar']
  const faltando = usados.filter(m => typeof real[m] !== 'function')
  const inventados = usados.filter(m => typeof dublê[m] === 'function' && typeof real[m] !== 'function')
  checar('14. todo método que a faixa usa existe na consulta REAL (e o dublê não inventa nenhum)',
    faltando.length === 0 && inventados.length === 0, JSON.stringify({ faltando, inventados }))
  real.descartar()
}

checar('cadência: o intervalo é de 5 minutos', F.INTERVALO_DA_LEITURA_MS === 5 * MIN, String(F.INTERVALO_DA_LEITURA_MS))

const falhas = resultados.filter(r => !r.ok)
console.log(`
  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
// ⚠️ O PLACAR EM JSON, na última linha: é por ele que a bateria (`rapidos.mjs`) e a regressão leem
// o resultado e conferem o piso. Sem esta linha, a suíte roda, passa, e a bateria a marca como
// "sem placar" — ou seja, não protege nada. Foi o que aconteceu com as seis suítes da V20.
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
