// AS CONVERSAS DE OUTROS DIAS — listar, retomar, renomear, etiquetar e procurar.
//
// ⚠️ Como `agente.js`, este arquivo NÃO importa `vscode`. Mesma razão: assim
// `testes/sessoes.mjs` prova a lista, a busca e a conta de tokens em `node` puro, em
// segundos, sem abrir o editor. Quem desenha a tela é `extensao.js`.
//
// ⚠️ ONDE AS CONVERSAS MORAM — e por que este arquivo não guarda nada.
//
// Quem guarda conversa é o SDK, no perfil do usuário. Este arquivo só LÊ, pela API do
// próprio SDK (`listSessions`, `getSessionInfo`, `getSessionMessages`), e ESCREVE só pelas
// funções que o SDK oferece para isso (`renameSession`, `tagSession`). Não existe banco,
// arquivo de índice nem cópia de conversa em lugar nenhum — de propósito: uma segunda
// cópia vira, no dia seguinte, uma segunda verdade.
//
// O único guardado é em MEMÓRIA, morre quando a janela fecha, e é invalidado pela data de
// modificação da própria conversa (ver `_medidas`). Serve para não reler 190 arquivos toda
// vez que a lista rola.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE FOI MEDIDO ANTES DE ESCREVER (12/09/2026, contra o SDK 0.3.261 instalado aqui,
// sobre a pasta real deste computador — 193 conversas):
//
//   1. ⚠️ `listSessions({dir})` DEVOLVE ZERO, CALADO, quando o caminho vem com barra
//      invertida. `D:\projetos\meu-app` → 0 conversas; `D:/projetos/meu-app` → 193. Não é
//      erro, não é aviso: é uma lista vazia, idêntica à de quem nunca conversou.
//      Isto seria o defeito da versão inteira, porque a barra invertida é exatamente o que
//      o editor entrega em `uri.fsPath` no Windows. Por isso todo caminho que entra aqui
//      passa por `normalizarPasta`, e há teste que reprova se ela sumir.
//   2. `listSessions` das 193 levou 397 ms; `getSessionMessages` de uma conversa de 2,8 MB
//      (742 mensagens) levou 22 ms. Ou seja: a lista é barata, e ler o conteúdo de TODAS
//      custaria alguns segundos — daí a leitura ser sob demanda e guardada em memória.
//   3. ⚠️ `includeProgrammatic: false` devolveu ZERO nesta máquina. O padrão (`true`) é o
//      que mostra as conversas; a opção fica de fora até haver o que ela ajude a esconder.
//   4. O `SDKSessionInfo` traz `sessionId, summary, lastModified, fileSize, customTitle,
//      firstPrompt, gitBranch, cwd, tag, createdAt` — e NÃO traz modelo nem custo. Os dois
//      saem das mensagens (ver `medir`), que é o motivo de `precos.js` existir.

'use strict'

const precos = require('./precos.js')

/** O pacote do agente. Mesma constante de `agente.js`, pelo mesmo motivo. */
const PACOTE = '@anthropic-ai/claude-agent-sdk'

/**
 * O caminho no formato que `listSessions` entende.
 *
 * ⚠️ NÃO APAGUE ESTA FUNÇÃO ACHANDO QUE É ENFEITE. Medido em 12/09/2026: com barra
 * invertida a lista volta VAZIA e sem erro — o editor no Windows entrega justamente assim.
 * `testes/sessoes.mjs` tem o par de casos que reprova se ela virar identidade.
 */
function normalizarPasta(caminho) {
  if (typeof caminho !== 'string' || !caminho) return caminho
  return caminho.replace(/\\/g, '/')
}

/**
 * O texto como a busca o enxerga: sem acento e em minúsculas — SEM MUDAR DE TAMANHO.
 *
 * ⚠️ Duas coisas, e as duas custaram caro em outros programas desta casa:
 *
 *   1. Comparar cru falha exatamente nas palavras que importam num programa em português:
 *      quem digita "duvida" não acha "dúvida", e desiste achando que a conversa sumiu.
 *   2. O jeito óbvio de tirar acento (`.normalize('NFD').replace(...)` na string inteira)
 *      MUDA O COMPRIMENTO do texto — e aí a posição do que se achou não serve mais para
 *      recortar o trecho que a tela mostra: ele sai deslocado uma letra por acento
 *      anterior. Por isso a dobra é feita caractere a caractere, preenchendo para o mesmo
 *      tamanho: a posição na dobrada é a mesma posição no original, sempre.
 *
 * O `\u0001` é o preenchimento de um acento solto que sobreviveu à recomposição. Ninguém digita esse
 * caractere, então ele nunca casa com uma busca — que é justamente o que se quer dele.
 *
 * ⚠️ E POR QUE ELA COMEÇA COM `normalize('NFC')`, se a dobra tira o acento logo adiante.
 *
 * "dúvida" tem DUAS formas em memória: a composta (6 caracteres, o normal) e a decomposta
 * (7 — o `u` mais o acento à parte). Visualmente são iguais, e a pessoa cola qualquer uma das
 * duas na caixa de busca. Sem recompor antes, a decomposta dobrava para uma coisa e o texto
 * composto para outra, e a busca voltava VAZIA com o texto na tela. Achado por uma revisão
 * independente em 12/09/2026 — e o teste que existia não pegava, porque conferia só o TAMANHO
 * da dobra, nunca o casamento entre as duas formas. Hoje as seis combinações têm critério.
 */
function dobrar(texto) {
  if (typeof texto !== 'string') return ''
  let saida = ''
  for (const ch of texto.normalize('NFC')) {
    const d = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    saida += d.length === ch.length ? d : d.padEnd(ch.length, '\u0001').slice(0, ch.length)
  }
  return saida
}

/** Texto curto e seguro para a tela, sem quebra de linha nem exagero de tamanho. */
function umaLinha(texto, teto = 200) {
  if (typeof texto !== 'string') return ''
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > teto ? limpo.slice(0, teto - 1) + '…' : limpo
}

/**
 * O que a tela mostra de uma conversa, a partir do que `listSessions` entrega.
 *
 * ⚠️ O título tem TRÊS origens e a ordem importa: o nome que a pessoa deu ganha de tudo;
 * depois o resumo que o próprio SDK gera; e só então a primeira frase. Sem essa ordem,
 * renomear uma conversa não mudaria nada na lista — que é metade do pedido desta versão.
 */
function converter(bruta) {
  const titulo = umaLinha(bruta.customTitle) || umaLinha(bruta.summary) || umaLinha(bruta.firstPrompt) || ''
  return {
    id: bruta.sessionId,
    titulo: titulo || '(conversa sem título)',
    temTituloProprio: !!bruta.customTitle,
    primeiraFrase: umaLinha(bruta.firstPrompt, 300),
    etiqueta: bruta.tag || null,
    ramo: bruta.gitBranch || null,
    pasta: bruta.cwd || null,
    modificadaEm: Number.isFinite(bruta.lastModified) ? bruta.lastModified : null,
    criadaEm: Number.isFinite(bruta.createdAt) ? bruta.createdAt : null,
    bytes: Number.isFinite(bruta.fileSize) ? bruta.fileSize : null,
  }
}

/** O texto de uma mensagem do SDK, juntando os blocos que têm texto. */
function textoDaMensagem(m) {
  const conteudo = m && m.message && m.message.content
  if (typeof conteudo === 'string') return conteudo
  if (!Array.isArray(conteudo)) return ''
  const pedacos = []
  for (const bloco of conteudo) {
    if (!bloco || typeof bloco !== 'object') continue
    if (typeof bloco.text === 'string') pedacos.push(bloco.text)
    // ⚠️ O que o agente PENSOU não entra na busca. Não é economia: o pensamento não é o
    // que a pessoa escreveu nem o que ela leu, e procurar "senha" acharia conversas onde a
    // palavra só passou pela cabeça do modelo — resultado que ela não reconheceria.
  }
  return pedacos.join('\n')
}

/**
 * O arquivo de conversas de uma pasta.
 *
 * @param {object} opcoes
 * @param {string} opcoes.cwd            a pasta aberta no editor
 * @param {Function} [opcoes.carregarSdk] injeção para teste; por padrão importa o pacote
 */
class Sessoes {
  constructor({ cwd, carregarSdk = null } = {}) {
    this.cwd = normalizarPasta(cwd)
    this._carregarSdk = carregarSdk || (() => import(PACOTE))
    this._sdk = null
    /**
     * Medidas já calculadas: id → { modificadaEm, medida }.
     * Guardado em MEMÓRIA e chaveado pela data de modificação: conversa que mudou é medida
     * de novo. Sem a data, uma conversa retomada mostraria para sempre o custo de antes.
     */
    this._medidas = new Map()
  }

  async _api() {
    if (this._sdk) return this._sdk
    const sdk = await this._carregarSdk()
    if (!sdk || typeof sdk.listSessions !== 'function') {
      throw new Error('esta versão do agente não sabe listar conversas')
    }
    this._sdk = sdk
    return sdk
  }

  /**
   * As conversas desta pasta, da mais recente para a mais antiga.
   *
   * Não traz modelo nem custo: eles custam a leitura do conteúdo e vêm por `medir`, sob
   * demanda, para a lista abrir na hora mesmo com centenas de conversas.
   */
  async listar({ limite = 0, deslocamento = 0 } = {}) {
    const sdk = await this._api()
    const opcoes = { dir: this.cwd }
    if (limite > 0) opcoes.limit = limite
    if (deslocamento > 0) opcoes.offset = deslocamento
    const brutas = await sdk.listSessions(opcoes)
    return (Array.isArray(brutas) ? brutas : []).map(converter)
  }

  /** Uma conversa só, ou `null` se ela não existe mais. */
  async uma(id) {
    const sdk = await this._api()
    if (typeof sdk.getSessionInfo !== 'function') return null
    const bruta = await sdk.getSessionInfo(id, { dir: this.cwd })
    return bruta ? converter(bruta) : null
  }

  /**
   * Mede uma conversa: modelo(s), tokens e o custo estimado.
   *
   * ⚠️ O custo é ESTIMADO a partir dos tokens (o arquivo não guarda dinheiro — ver o
   * cabeçalho de `precos.js`), e o resultado diz isso em `estimado: true`, para a tela não
   * ter como apresentar um chute como fatura.
   *
   * ⚠️ Quando o modelo não está na tabela de preços, `custoUsd` vem `null` — e a tela mostra
   * tokens. Um zero ali seria pior do que não saber: pareceria uma conversa de graça.
   */
  async medir(id, { modificadaEm = null } = {}) {
    const guardada = this._medidas.get(id)
    if (guardada && modificadaEm != null && guardada.modificadaEm === modificadaEm) return guardada.medida

    const sdk = await this._api()
    if (typeof sdk.getSessionMessages !== 'function') return null
    const msgs = await sdk.getSessionMessages(id, { dir: this.cwd })

    const uso = precos.usoZerado()
    /*
      ⚠️ A CHAVE É MODELO **+ VELOCIDADE**, e não só o modelo.

      O primeiro esboço guardava um booleano `veloz` por modelo: bastava UMA resposta em modo
      rápido para a conversa inteira daquele modelo ser cobrada ao preço rápido. Medido: 1 milhão
      de tokens normais mais 500 tokens rápidos no Opus 5 davam **US$ 10,005 em vez de US$ 5,005** —
      quase o dobro, e para mais, que é o pior lado para errar num número que a pessoa lê como
      custo. Achado por uma revisão independente em 12/09/2026.

      Cada par (modelo, velocidade) é o seu próprio preço, pela mesma razão que cada modelo já era:
      é assim que a conta é cobrada de verdade.
    */
    const porPreco = new Map()
    const modelosVistos = []
    let velozEmAlgum = false
    let ultimoModelo = null
    let respostas = 0
    /*
      ⛔ UMA RESPOSTA CONTA UMA VEZ (achado de revisão visual, 18/09/2026). O arquivo da conversa
      grava a mesma resposta em várias linhas, uma por bloco de conteúdo, cada uma com o `usage`
      inteiro. Somando linha a linha, a lista mostrava 123 mil tokens / US$ 0,34 para uma conversa
      que a vista de tokens media, certo, em 92 mil / US$ 0,19. A regra é a do `tokens.js`, medida
      em arquivos reais: por `message.id`, fica a linha de MAIOR saída; `<synthetic>` é aviso
      interno do programa e não conta. (A vista de tokens também soma subagentes; esta lista, não.)
    */
    const unicas = new Map()
    for (const m of Array.isArray(msgs) ? msgs : []) {
      if (!m || m.type !== 'assistant' || !m.message || !m.message.usage) continue
      if (m.message.model === '<synthetic>') continue
      const chave = m.message.id || m.uuid || unicas.size
      const anterior = unicas.get(chave)
      if (anterior && (m.message.usage.output_tokens || 0) <= (anterior.message.usage.output_tokens || 0)) continue
      unicas.set(chave, m)
    }
    for (const m of unicas.values()) {
      const u = m.message.usage
      respostas++
      const veloz = u.speed === 'fast'
      if (veloz) velozEmAlgum = true
      precos.somarUso(uso, u)
      const modelo = m.message.model || null
      if (modelo) {
        // ⚠️ O ÚLTIMO modelo é o da última RESPOSTA, não o último a aparecer pela primeira vez.
        // Numa conversa Opus → Sonnet → Opus, a ordem de inserção do Map diria "Sonnet", e a tela
        // mostraria o modelo errado justamente na conversa que a pessoa vai retomar. Mesmo achado.
        ultimoModelo = modelo
        if (!modelosVistos.includes(modelo)) modelosVistos.push(modelo)
        const chave = modelo + (veloz ? ' (rápido)' : '')
        const doPreco = porPreco.get(chave) || { uso: precos.usoZerado(), modelo, veloz }
        precos.somarUso(doPreco.uso, u)
        porPreco.set(chave, doPreco)
      }
    }

    // ⚠️ Uma conversa pode ter trocado de modelo no meio. Cada trecho é cobrado pelo preço
    // DELE — somar tudo no modelo predominante daria o número errado justamente nas
    // conversas longas, que são as que custam.
    let custoUsd = null
    let algumSemPreco = false
    for (const dados of porPreco.values()) {
      const parcela = precos.custoDoUso(dados.uso, dados.modelo, dados.veloz)
      if (parcela == null) { algumSemPreco = true; continue }
      custoUsd = (custoUsd || 0) + parcela
    }

    const modelos = modelosVistos
    const medida = {
      id,
      modelos,
      modelo: ultimoModelo,
      respostas,
      mensagens: Array.isArray(msgs) ? msgs.length : 0,
      tokens: precos.totalDeTokens(uso),
      uso,
      custoUsd,
      estimado: true,
      // Sem isto a tela não teria como avisar que o total está incompleto — e um total
      // incompleto apresentado como total é o mesmo que um número errado.
      faltouPrecoDeAlgumModelo: algumSemPreco,
      veloz: velozEmAlgum,
      tabelaDe: precos.ATUALIZADA_EM,
    }
    if (modificadaEm != null) this._medidas.set(id, { modificadaEm, medida })
    return medida
  }

  /**
   * Dá um nome próprio à conversa.
   *
   * ⚠️ Quem grava é o SDK (`renameSession`), no lugar dele. A OFICINA não tem arquivo de
   * apelidos — se tivesse, o nome apareceria aqui e não no `claude` do terminal, e a pessoa
   * teria dois nomes para a mesma conversa.
   */
  async renomear(id, titulo) {
    const sdk = await this._api()
    if (typeof sdk.renameSession !== 'function') throw new Error('esta versão do agente não sabe renomear conversas')
    const limpo = umaLinha(titulo, 120)
    if (!limpo) throw new Error('o nome não pode ser vazio')
    await sdk.renameSession(id, limpo, { dir: this.cwd })
    this._medidas.delete(id)
    return limpo
  }

  /** Etiqueta a conversa — ou tira a etiqueta, com `null`. Quem grava é o SDK. */
  async etiquetar(id, etiqueta) {
    const sdk = await this._api()
    if (typeof sdk.tagSession !== 'function') throw new Error('esta versão do agente não sabe etiquetar conversas')
    const valor = etiqueta == null || etiqueta === '' ? null : umaLinha(etiqueta, 40)
    await sdk.tagSession(id, valor, { dir: this.cwd })
    this._medidas.delete(id)
    return valor
  }

  /**
   * Procura um texto DENTRO das conversas — não só nos títulos.
   *
   * Lê o conteúdo conversa por conversa, da mais recente para a mais antiga, e para quando
   * junta `limite` resultados. Buscar em 193 conversas custa alguns segundos; `aoAndar`
   * existe para a tela poder mostrar progresso em vez de congelar, e `sinal` (um
   * `AbortSignal`) para a pessoa poder desistir no meio.
   *
   * ⚠️ A busca é do jeito que a pessoa escreveu, sem maiúscula/minúscula, SEM ACENTO (ver
   * `dobrar`) e sem regex: um texto com `(` ou `*` é procurado literalmente, e não explode
   * nem vira outra busca.
   */
  async buscar(texto, { limite = 30, tetoDeConversas = 400, aoAndar = null, sinal = null } = {}) {
    const alvo = typeof texto === 'string' ? dobrar(texto.trim()) : ''
    if (!alvo) return { termo: '', achados: [], conversasLidas: 0, interrompida: false }

    const lista = await this.listar()
    const achados = []
    let lidas = 0
    let interrompida = false

    for (const conversa of lista.slice(0, tetoDeConversas)) {
      if (sinal && sinal.aborted) { interrompida = true; break }
      if (achados.length >= limite) break
      lidas++
      if (typeof aoAndar === 'function') {
        try { aoAndar({ lidas, total: Math.min(lista.length, tetoDeConversas), achados: achados.length }) } catch { }
      }

      let msgs = []
      try {
        const sdk = await this._api()
        msgs = await sdk.getSessionMessages(conversa.id, { dir: this.cwd })
      } catch {
        // Uma conversa ilegível (apagada no meio da busca, arquivo truncado) não pode
        // derrubar a busca inteira — as outras 192 continuam valendo.
        continue
      }

      let ocorrencias = 0
      let trecho = ''
      let quem = null
      for (const m of Array.isArray(msgs) ? msgs : []) {
        if (!m || (m.type !== 'user' && m.type !== 'assistant')) continue
        const t = textoDaMensagem(m)
        if (!t) continue
        // ⚠️ Procura na dobrada, RECORTA na original: é o que preserva o acento e a
        // maiúscula no trecho que a pessoa lê, sem perder o casamento sem acento.
        // ⚠️ O trecho é recortado do RECOMPOSTO, não de `t`: é ele que a dobra enxerga, e é nele
        // que a posição achada faz sentido. Recortar do original desalinharia exatamente nos
        // textos decompostos — os que este conserto veio atender.
        const recomposto = t.normalize('NFC')
        const dobrada = dobrar(recomposto)
        // ⚠️ TODAS as vezes, não uma por mensagem. O primeiro esboço parava no primeiro
        // achado de cada mensagem, e o teste pegou: uma resposta que repetia o termo duas
        // vezes era contada como uma. A contagem é o que a pessoa usa para escolher entre
        // dois resultados — contar mensagens e chamar de ocorrências é dizer outro número.
        let de = dobrada.indexOf(alvo)
        while (de >= 0) {
          ocorrencias++
          if (!trecho) {
            const inicio = Math.max(0, de - 60)
            trecho = (inicio > 0 ? '…' : '') + umaLinha(recomposto.slice(inicio, de + alvo.length + 100), 200)
            quem = m.type === 'user' ? 'pessoa' : 'agente'
          }
          de = dobrada.indexOf(alvo, de + alvo.length)
        }
        if (!ocorrencias) continue
      }
      if (ocorrencias) achados.push({ ...conversa, ocorrencias, trecho, quem })
    }

    return { termo: texto.trim(), achados, conversasLidas: lidas, interrompida }
  }
}

module.exports = { Sessoes, normalizarPasta, converter, textoDaMensagem, umaLinha, dobrar, PACOTE }
