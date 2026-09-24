// AS CONVERSAS DE OUTROS DIAS — os testes do arquivo de sessões, sem abrir o editor.
//
// Como `rodar.mjs`, este arquivo prova o motor em `node` puro: `sessoes.js` não importa
// `vscode` justamente para caber aqui. Se um dia importar, este arquivo para de rodar — e
// isso é o alarme, não um inconveniente.
//
// ⚠️ O SDK aqui é um DUBLÊ, e por uma razão que vai além de dinheiro: os casos que
// interessam (o caminho vir com barra invertida, a conversa trocar de modelo no meio, o
// arquivo ficar ilegível durante a busca) não se produzem sob encomenda contra a API real.
// A retomada de verdade — o critério de PRONTO desta versão — é medida contra o SDK real
// em `testes/retomar_de_verdade.mjs`, que é outro arquivo porque gasta a conta de quem roda.
//
// ⚠️ TODO CRITÉRIO AQUI RESPONDE A UMA PERGUNTA: ele fica VERMELHO quando eu desfaço o
// conserto? Onde a resposta não era obviamente sim, há um CONTROLE ao lado — o mesmo
// caminho com o defeito de volta, provando que o teste enxerga a diferença.
//
// Uso:  node testes/sessoes.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const CAMINHO = f => path.join(REPO, 'extensoes', 'oficina-claude', f)
const { Sessoes, normalizarPasta, converter, textoDaMensagem, dobrar } = requerer(CAMINHO('sessoes.js'))
const precos = requerer(CAMINHO('precos.js'))
const { Conversa, ESTADO } = requerer(CAMINHO('agente.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok, detalhe: detalhe ?? '' })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`)
}
const perto = (a, b, folga = 1e-9) => Math.abs(a - b) < folga

// ─────────────────────────────────────────────────────────────────────────────
// O DUBLÊ DO SDK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um SDK de mentira que se comporta como o de verdade nos pontos medidos em 12/09/2026.
 *
 * ⚠️ `exigeBarraNormal` reproduz o comportamento REAL e silencioso do SDK instalado: com
 * barra invertida no `dir`, `listSessions` devolve `[]` — sem erro, sem aviso. É o que
 * torna o teste da normalização um teste de verdade, e não uma checagem de string.
 */
function sdkFalso({ conversas = [], mensagens = {}, exigeBarraNormal = true, quebrarEm = null } = {}) {
  const registro = { renomeou: [], etiquetou: [], dirsRecebidos: [] }
  const casa = dir => {
    registro.dirsRecebidos.push(dir)
    return exigeBarraNormal ? !String(dir).includes('\\') : true
  }
  return {
    registro,
    api: {
      async listSessions({ dir, limit, offset } = {}) {
        if (!casa(dir)) return []
        let saida = conversas
        if (offset > 0) saida = saida.slice(offset)
        if (limit > 0) saida = saida.slice(0, limit)
        return saida
      },
      async getSessionInfo(id, { dir } = {}) {
        if (!casa(dir)) return undefined
        return conversas.find(c => c.sessionId === id)
      },
      async getSessionMessages(id, { dir } = {}) {
        if (!casa(dir)) return []
        if (quebrarEm && quebrarEm === id) throw new Error('arquivo ilegível')
        return mensagens[id] || []
      },
      async renameSession(id, titulo, opcoes) { registro.renomeou.push({ id, titulo, opcoes }) },
      async tagSession(id, etiqueta, opcoes) { registro.etiquetou.push({ id, etiqueta, opcoes }) },
    },
  }
}

const respostaDoAgente = (texto, modelo, uso) => ({
  type: 'assistant',
  message: { model: modelo, content: [{ type: 'text', text: texto }], usage: uso },
})
const falaDaPessoa = texto => ({ type: 'user', message: { content: [{ type: 'text', text: texto }] } })

const uso = ({ entrada = 0, saida = 0, leitura = 0, escrita5min = 0, escrita1h = 0, veloz = false } = {}) => ({
  input_tokens: entrada,
  output_tokens: saida,
  cache_read_input_tokens: leitura,
  cache_creation_input_tokens: escrita5min + escrita1h,
  cache_creation: { ephemeral_5m_input_tokens: escrita5min, ephemeral_1h_input_tokens: escrita1h },
  ...(veloz ? { speed: 'fast' } : {}),
})

const CONVERSAS = [
  {
    sessionId: 'aaa', summary: 'resumo automático', customTitle: 'O nome que eu dei',
    firstPrompt: 'a primeira frase', lastModified: 3000, createdAt: 1000, fileSize: 120,
    gitBranch: 'master', cwd: 'D:/pasta', tag: 'importante',
  },
  {
    sessionId: 'bbb', summary: 'resumo automático do bbb', firstPrompt: 'primeira frase do bbb',
    lastModified: 2000, createdAt: 900, fileSize: 90,
  },
  { sessionId: 'ccc', firstPrompt: 'só tem a primeira frase', lastModified: 1000 },
]

const novo = (extra = {}) => {
  const { api, registro } = sdkFalso({ conversas: CONVERSAS, ...extra })
  const s = new Sessoes({ cwd: 'D:\\pasta', carregarSdk: async () => api })
  return { s, registro, api }
}

async function principal() {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. A BARRA — o achado que teria esvaziado a lista inteira no Windows
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { s, registro } = novo()
    const lista = await s.listar()
    checar('a pasta do Windows (barra invertida) devolve as conversas', lista.length === CONVERSAS.length,
      `${lista.length} conversa(s)`)
    checar('o caminho chega ao SDK já com barra normal',
      registro.dirsRecebidos.length > 0 && registro.dirsRecebidos.every(d => !String(d).includes('\\')),
      JSON.stringify(registro.dirsRecebidos[0]))

    // ⛔ CONTROLE: sem a normalização, o MESMO caminho devolve lista vazia — em silêncio.
    // É este par que prova que a função conserta algo, em vez de só mexer em texto.
    const { api } = sdkFalso({ conversas: CONVERSAS })
    const cru = { ...new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api }) }
    void cru
    const listaCrua = await api.listSessions({ dir: 'D:\\pasta' })
    checar('⛔ CONTROLE: sem normalizar, a lista volta VAZIA e sem erro', listaCrua.length === 0,
      `${listaCrua.length} conversa(s)`)
    checar('normalizarPasta troca toda barra invertida', normalizarPasta(String.raw`D:\a\b\c`) === 'D:/a/b/c',
      normalizarPasta(String.raw`D:\a\b\c`))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. O QUE A LISTA MOSTRA
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { s } = novo()
    const [a, b, c] = await s.listar()
    checar('o nome que a pessoa deu ganha do resumo automático', a.titulo === 'O nome que eu dei', a.titulo)
    checar('sem nome próprio, vale o resumo do SDK', b.titulo === 'resumo automático do bbb', b.titulo)
    checar('sem resumo, vale a primeira frase', c.titulo === 'só tem a primeira frase', c.titulo)
    checar('a etiqueta viaja', a.etiqueta === 'importante' && b.etiqueta === null, String(a.etiqueta))
    checar('o ramo do git viaja', a.ramo === 'master', String(a.ramo))
    checar('as datas viajam como número', a.modificadaEm === 3000 && a.criadaEm === 1000)
    checar('conversa sem título nenhum não vira linha em branco',
      converter({ sessionId: 'x' }).titulo === '(conversa sem título)', converter({ sessionId: 'x' }).titulo)

    const limitada = await s.listar({ limite: 2 })
    checar('o limite é respeitado', limitada.length === 2, `${limitada.length}`)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. MODELO E CUSTO — o pedido explícito desta versão
  // ───────────────────────────────────────────────────────────────────────────
  {
    // Opus 5: entrada $5/MTok, saída $25/MTok. 1.000.000 de entrada e 100.000 de saída
    // dão $5,00 + $2,50 = $7,50 — conta feita à mão, não copiada da saída do código.
    const mensagens = {
      aaa: [
        falaDaPessoa('oi'),
        respostaDoAgente('olá', 'claude-opus-5', uso({ entrada: 1000000, saida: 100000 })),
      ],
    }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:\\pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('o modelo sai das mensagens (o SDK não o dá na lista)', m.modelo === 'claude-opus-5', String(m.modelo))
    checar('custo do Opus 5: 1M de entrada + 100k de saída = US$ 7,50', perto(m.custoUsd, 7.5, 1e-6),
      String(m.custoUsd))
    checar('o custo se declara ESTIMADO', m.estimado === true)
    checar('a data da tabela de preços viaja junto', m.tabelaDe === precos.ATUALIZADA_EM, m.tabelaDe)
    checar('conta as respostas do agente', m.respostas === 1, String(m.respostas))
  }

  {
    // ⚠️ O caso que um cálculo ingênuo erra: escrever no cache de 1 HORA custa o DOBRO da
    // entrada, e o de 5 minutos, 1,25×. 1M de cada, no Opus 5 ($5): 1M×5×2 = $10 mais
    // 1M×5×1,25 = $6,25 → $16,25. Tratar os dois como iguais daria $12,50.
    const mensagens = {
      aaa: [respostaDoAgente('x', 'claude-opus-5', uso({ escrita1h: 1000000, escrita5min: 1000000 }))],
    }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('cache de 1h custa o dobro do de 5min (US$ 16,25, não US$ 12,50)', perto(m.custoUsd, 16.25, 1e-6),
      String(m.custoUsd))
    checar('a escrita de cache não é contada duas vezes',
      m.uso.escritaDeCache1h === 1000000 && m.uso.escritaDeCache5min === 1000000,
      `1h=${m.uso.escritaDeCache1h} 5min=${m.uso.escritaDeCache5min}`)
  }

  {
    // Leitura de cache: 10% da entrada. 1M no Opus 5 = $0,50.
    const mensagens = { aaa: [respostaDoAgente('x', 'claude-opus-5', uso({ leitura: 1000000 }))] }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('ler do cache custa 10% da entrada (US$ 0,50 no Opus 5)', perto(m.custoUsd, 0.5, 1e-9), String(m.custoUsd))
  }

  {
    // ⚠️ Conversa que TROCA de modelo no meio: cada trecho pelo preço dele.
    // Opus 5: 1M entrada = $5. Haiku 4.5: 1M entrada = $1. Total $6 — e não $10 (tudo
    // Opus) nem $2 (tudo Haiku), que é o que sairia de somar no modelo predominante.
    const mensagens = {
      aaa: [
        respostaDoAgente('a', 'claude-opus-5', uso({ entrada: 1000000 })),
        respostaDoAgente('b', 'claude-haiku-4-5', uso({ entrada: 1000000 })),
      ],
    }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('conversa que trocou de modelo é cobrada trecho a trecho (US$ 6, não US$ 10)',
      perto(m.custoUsd, 6, 1e-9), String(m.custoUsd))
    checar('os dois modelos aparecem', m.modelos.length === 2, m.modelos.join(' + '))
  }

  {
    // ⚠️ ACHADO DE REVISÃO INDEPENDENTE (12/09/2026) — o mais caro desta versão.
    // O MESMO modelo com um trecho rápido e outro normal: o preço rápido não pode contaminar o
    // trecho normal. 1M de entrada normal (US$ 5) + 500 tokens rápidos (US$ 0,005) = US$ 5,005.
    // Antes do conserto saía US$ 10,005 — quase o DOBRO, e para mais, que é o pior lado para
    // errar num número que a pessoa lê como custo.
    const mensagens = {
      aaa: [
        respostaDoAgente('devagar', 'claude-opus-5', uso({ entrada: 1000000 })),
        respostaDoAgente('rapido', 'claude-opus-5', uso({ entrada: 500, veloz: true })),
      ],
    }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('trecho rápido não contamina o trecho normal do MESMO modelo (US$ 5,005, não US$ 10,005)',
      perto(m.custoUsd, 5.005, 1e-6), String(m.custoUsd))
    checar('e o modelo aparece uma vez só, mesmo cobrado em duas velocidades',
      m.modelos.length === 1, m.modelos.join(' + '))
  }

  {
    // ⚠️ ACHADO DA MESMA REVISÃO: o modelo mostrado é o da ÚLTIMA RESPOSTA, não o último a
    // aparecer pela primeira vez. Numa conversa Opus → Sonnet → Opus, a ordem de inserção diria
    // "Sonnet", e a tela mostraria o modelo errado justamente na conversa que se vai retomar.
    const mensagens = {
      aaa: [
        respostaDoAgente('a', 'claude-opus-5', uso({ entrada: 10 })),
        respostaDoAgente('b', 'claude-sonnet-5', uso({ entrada: 10 })),
        respostaDoAgente('c', 'claude-opus-5', uso({ entrada: 10 })),
      ],
    }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('o modelo mostrado é o da ÚLTIMA resposta (Opus), não o último a estrear (Sonnet)',
      m.modelo === 'claude-opus-5', String(m.modelo))
    checar('e os dois modelos continuam listados, sem repetir', m.modelos.length === 2,
      m.modelos.join(' + '))
  }

  {
    // ⚠️ Modelo fora da tabela: `null`, NUNCA zero. Um zero diria "esta conversa foi de
    // graça", que é uma afirmação falsa; `null` diz "não sei", e a tela mostra tokens.
    const mensagens = { aaa: [respostaDoAgente('x', 'modelo-que-nao-existe', uso({ entrada: 1000000 }))] }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('modelo desconhecido dá custo NULO, não zero', m.custoUsd === null, String(m.custoUsd))
    checar('e a falta é declarada, para a tela poder avisar', m.faltouPrecoDeAlgumModelo === true)
    checar('mas os tokens continuam contados', m.tokens === 1000000, String(m.tokens))
  }

  {
    // O modo rápido é o mesmo modelo a outro preço: Opus 5 rápido = $10/MTok de entrada.
    const mensagens = { aaa: [respostaDoAgente('x', 'claude-opus-5', uso({ entrada: 1000000, veloz: true }))] }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('o modo rápido é cobrado ao preço dele (US$ 10, não US$ 5)', perto(m.custoUsd, 10, 1e-9), String(m.custoUsd))
    checar('e a tela sabe que houve modo rápido', m.veloz === true)
  }

  {
    // ⛔ Revisão visual de 18/09/2026: a MESMA resposta vem em várias linhas, uma por bloco de
    // conteúdo, cada uma com o `usage` inteiro. Aqui: a resposta r1 em duas linhas (texto e
    // ferramenta), com a saída crescendo de 100k para 200k, e a r2 uma vez. Contada uma vez, com a
    // maior saída: 1M + 200k (r1) e 1M + 0 (r2) no Opus 5 = US$ 5 + 5 + 5 = US$ 15. Somando linha a
    // linha dariam 3M de entrada e 300k de saída = US$ 22,50. E `<synthetic>` não é resposta.
    const linha = (id, saida, modelo = 'claude-opus-5') =>
      ({ type: 'assistant', message: { id, model: modelo, content: [], usage: uso({ entrada: 1000000, saida }) } })
    const mensagens = { aaa: [linha('r1', 100000), linha('r1', 200000), linha('r2', 0), linha('s1', 0, '<synthetic>')] }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const m = await s.medir('aaa')
    checar('⛔ a resposta repetida em várias linhas conta UMA vez, com a maior saída (US$ 15, não US$ 22,50)',
      perto(m.custoUsd, 15, 1e-9), String(m.custoUsd))
    checar('⛔ e os tokens também: 2M de entrada + 200k de saída', m.tokens === 2200000, String(m.tokens))
    checar('duas respostas, não quatro linhas', m.respostas === 2, String(m.respostas))
    checar('`<synthetic>` não vira modelo da conversa', !m.modelos.includes('<synthetic>'), m.modelos.join(' + '))
  }

  {
    // A medida guardada em memória tem que morrer quando a conversa muda — senão uma
    // conversa retomada mostraria para sempre o custo de antes.
    let leituras = 0
    const mensagens = { aaa: [respostaDoAgente('x', 'claude-opus-5', uso({ entrada: 1000000 }))] }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const original = api.getSessionMessages
    api.getSessionMessages = async (...a) => { leituras++; return original(...a) }
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    await s.medir('aaa', { modificadaEm: 3000 })
    await s.medir('aaa', { modificadaEm: 3000 })
    checar('medir duas vezes a MESMA conversa lê o disco uma vez só', leituras === 1, `${leituras} leitura(s)`)
    await s.medir('aaa', { modificadaEm: 4000 })
    checar('conversa que MUDOU é medida de novo', leituras === 2, `${leituras} leitura(s)`)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. RENOMEAR E ETIQUETAR — quem grava é o SDK
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { s, registro } = novo()
    const nome = await s.renomear('aaa', '  Conversa   do  lançamento \n')
    checar('renomear chama o SDK com o id certo', registro.renomeou.length === 1 && registro.renomeou[0].id === 'aaa')
    checar('o nome chega limpo, numa linha só', nome === 'Conversa do lançamento', JSON.stringify(nome))
    checar('e vai com a pasta normalizada', !String(registro.renomeou[0].opcoes.dir).includes('\\'),
      registro.renomeou[0].opcoes.dir)

    let recusou = false
    try { await s.renomear('aaa', '   ') } catch { recusou = true }
    checar('nome vazio é recusado (em vez de apagar o título)', recusou)

    await s.etiquetar('aaa', 'trabalho')
    checar('etiquetar chama o SDK', registro.etiquetou.length === 1 && registro.etiquetou[0].etiqueta === 'trabalho')
    await s.etiquetar('aaa', '')
    checar('etiqueta vazia vira NULO (é assim que o SDK tira a etiqueta)',
      registro.etiquetou[1].etiqueta === null, String(registro.etiquetou[1].etiqueta))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. A BUSCA DENTRO DAS CONVERSAS
  // ───────────────────────────────────────────────────────────────────────────
  {
    const mensagens = {
      aaa: [falaDaPessoa('preciso resolver a DÚVIDA do cliente'), respostaDoAgente('claro', 'claude-opus-5', uso())],
      bbb: [falaDaPessoa('nada a ver'), respostaDoAgente('a dúvida aparece aqui, e a dúvida de novo', 'claude-opus-5', uso())],
      ccc: [falaDaPessoa('assunto diferente')],
    }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })

    const r = await s.buscar('duvida')
    checar('quem digita SEM acento acha o que foi escrito COM acento', r.achados.length === 2,
      `${r.achados.length} conversa(s)`)
    checar('conta quantas vezes apareceu em cada conversa',
      r.achados.find(a => a.id === 'bbb').ocorrencias === 2,
      String(r.achados.find(a => a.id === 'bbb').ocorrencias))
    checar('o trecho mostrado preserva o acento e a maiúscula originais',
      r.achados.find(a => a.id === 'aaa').trecho.includes('DÚVIDA'),
      r.achados.find(a => a.id === 'aaa').trecho)
    checar('diz de quem é a fala achada', r.achados.find(a => a.id === 'aaa').quem === 'pessoa')

    const comAcento = await s.buscar('DÚVIDA')
    checar('e quem digita COM acento acha o mesmo tanto', comAcento.achados.length === 2,
      `${comAcento.achados.length}`)

    const nada = await s.buscar('palavra que não existe em lugar nenhum')
    checar('busca sem resultado devolve lista vazia, não erro', nada.achados.length === 0)

    const vazia = await s.buscar('   ')
    checar('busca em branco não varre 193 arquivos à toa', vazia.achados.length === 0 && vazia.conversasLidas === 0)

    // ⚠️ Texto com caractere de expressão regular é procurado LITERALMENTE.
    const comParenteses = { aaa: [falaDaPessoa('o custo (estimado) apareceu')] }
    const { api: api2 } = sdkFalso({ conversas: CONVERSAS, mensagens: comParenteses })
    const s2 = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api2 })
    const achou = await s2.buscar('(estimado)')
    checar('parêntese é procurado como texto, não como expressão regular', achou.achados.length === 1,
      `${achou.achados.length}`)
    const naoAchou = await s2.buscar('.*')
    checar('⛔ CONTROLE: ".*" não casa com tudo (se casasse, a busca seria uma regex)',
      naoAchou.achados.length === 0, `${naoAchou.achados.length}`)

    const limitada = await s.buscar('duvida', { limite: 1 })
    checar('o limite corta a busca', limitada.achados.length === 1)
  }

  {
    // Uma conversa ilegível no meio da busca não pode derrubar as outras.
    const mensagens = { aaa: [falaDaPessoa('achei aqui')], bbb: [falaDaPessoa('achei aqui também')] }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens, quebrarEm: 'aaa' })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const r = await s.buscar('achei')
    checar('conversa ilegível é pulada, e a busca continua', r.achados.length === 1 && r.achados[0].id === 'bbb',
      `${r.achados.length} achado(s)`)
  }

  {
    // Desistir da busca no meio.
    const muitas = Array.from({ length: 50 }, (_, i) => ({ sessionId: 's' + i, firstPrompt: 'x', lastModified: i }))
    const mensagens = Object.fromEntries(muitas.map(c => [c.sessionId, [falaDaPessoa('achei')]]))
    const { api } = sdkFalso({ conversas: muitas, mensagens })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const controle = new AbortController()
    let vistas = 0
    const r = await s.buscar('achei', {
      limite: 999, sinal: controle.signal,
      aoAndar: () => { vistas++; if (vistas === 3) controle.abort() },
    })
    checar('dá para desistir da busca no meio', r.interrompida === true && r.conversasLidas < 50,
      `leu ${r.conversasLidas} de 50`)
  }

  {
    // O que o agente PENSOU não entra na busca.
    const comPensamento = {
      aaa: [{ type: 'assistant', message: { model: 'claude-opus-5', content: [{ type: 'thinking', thinking: 'segredo' }] } }],
    }
    const { api } = sdkFalso({ conversas: CONVERSAS, mensagens: comPensamento })
    const s = new Sessoes({ cwd: 'D:/pasta', carregarSdk: async () => api })
    const r = await s.buscar('segredo')
    checar('o pensamento do agente não entra na busca', r.achados.length === 0, `${r.achados.length}`)
    checar('⛔ CONTROLE: o mesmo texto num bloco de TEXTO é achado',
      textoDaMensagem({ message: { content: [{ type: 'text', text: 'segredo' }] } }) === 'segredo')
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. RETOMAR — o que o motor da conversa manda ao SDK
  // ───────────────────────────────────────────────────────────────────────────
  {
    // O `query` do SDK é espionado: o que interessa é a opção que sai daqui.
    const espiar = () => {
      const visto = {}
      const api = {
        query({ options }) {
          Object.assign(visto, options)
          return {
            // ⚠️ O iterador NÃO PODE TERMINAR aqui. Um gerador vazio faz o laço do motor
            // fechar sozinho e o estado cair para "parada" logo depois de abrir — que é o
            // contrário do que acontece com o SDK real, onde o canal fica aberto esperando.
            // Testar contra um dublê que termina na hora mediria um produto que não existe.
            [Symbol.asyncIterator]() { return { next: () => new Promise(() => { }) } },
            async initializationResult() { return null },
            async accountInfo() { return null },
            interrupt() { },
          }
        },
      }
      return { visto, carregar: async () => api }
    }

    const a = espiar()
    const comRetomada = new Conversa({ cwd: 'D:/pasta', aoEvento: () => { }, carregarSdk: a.carregar, retomar: 'aaa-bbb-ccc' })
    await comRetomada.iniciar()
    checar('retomar manda `resume` com o id da conversa', a.visto.resume === 'aaa-bbb-ccc', String(a.visto.resume))
    checar('e o motor guarda de quem é a retomada', comRetomada.retomando === 'aaa-bbb-ccc')

    // ⛔ CONTROLE: sem pedir retomada, `resume` NÃO pode ir junto — senão toda conversa
    // nova continuaria a última, e ninguém conseguiria começar do zero.
    const b = espiar()
    const semRetomada = new Conversa({ cwd: 'D:/pasta', aoEvento: () => { }, carregarSdk: b.carregar })
    await semRetomada.iniciar()
    checar('⛔ CONTROLE: conversa nova NÃO manda `resume`', !('resume' in b.visto), JSON.stringify(b.visto.resume))
    checar('conversa nova fica ociosa do mesmo jeito', semRetomada.estado === ESTADO.OCIOSA, semRetomada.estado)

    const c = espiar()
    const vazio = new Conversa({ cwd: 'D:/pasta', aoEvento: () => { }, carregarSdk: c.carregar, retomar: '' })
    await vazio.iniciar()
    checar('id vazio não vira retomada de nada', !('resume' in c.visto))
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. A DOBRA DE ACENTO — a peça de que a busca depende
  // ───────────────────────────────────────────────────────────────────────────
  {
    checar('a dobra NÃO muda o tamanho do texto (senão o trecho sai deslocado)',
      dobrar('dúvida ação naïve').length === 'dúvida ação naïve'.length)
    checar('a dobra não desalinha em emoji', dobrar('oi 🙂 tchau').length === 'oi 🙂 tchau'.length)
    // ⚠️ O CONTRATO MUDOU COM O CONSERTO DO ACENTO, e este critério mudou junto — de propósito.
    // A dobra agora RECOMPÕE antes (senão termo decomposto não acha texto composto), então o
    // comprimento que ela preserva é o do texto RECOMPOSTO, não o do original decomposto. É o
    // que importa: `buscar` recorta o trecho do mesmo recomposto que a dobra enxergou, e é esse
    // par que mantém a posição válida.
    checar('a dobra preserva o comprimento do texto RECOMPOSTO (é dele que o trecho é recortado)',
      dobrar('água').length === 'água'.normalize('NFC').length,
      `${dobrar('água').length} vs ${'água'.normalize('NFC').length}`)
    checar('e um acento solto que NÃO recompõe não vira letra à toa',
      dobrar('x́').length === 'x́'.normalize('NFC').length)
    checar('a dobra tira o acento', dobrar('ÁÉÍÓÚÇÃ') === 'aeiouca', dobrar('ÁÉÍÓÚÇÃ'))

    // ⚠️ ACHADO DA REVISÃO INDEPENDENTE: "dúvida" existe em DUAS formas em memória — composta
    // (6 caracteres) e decomposta (7: o `u` mais o acento à parte). A pessoa cola qualquer uma
    // das duas. Antes do conserto, termo decomposto contra texto composto NÃO casava: busca
    // vazia com o texto na tela. O teste que existia só conferia o TAMANHO da dobra — por isso
    // ficava verde. As SEIS combinações agora têm critério.
    const H = 'Tem uma dúvida aqui', T = 'dúvida'
    const combinacoes = [
      ['termo decomposto × texto composto', H, T.normalize('NFD')],
      ['termo composto × texto decomposto', H.normalize('NFD'), T],
      ['decomposto × decomposto', H.normalize('NFD'), T.normalize('NFD')],
      ['composto × composto', H, T],
      ['sem acento × texto decomposto', H.normalize('NFD'), 'duvida'],
      ['sem acento × texto composto', H, 'duvida'],
    ]
    for (const [nome, palheiro, agulha] of combinacoes) {
      checar('a busca acha em ' + nome, dobrar(palheiro).includes(dobrar(agulha)))
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  const falhas = resultados.filter(r => !r.ok)
  console.log('\n' + JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
  process.exit(falhas.length ? 1 : 0)
}

principal().catch(e => { console.error('ERRO NO TESTE:', e); process.exit(1) })
