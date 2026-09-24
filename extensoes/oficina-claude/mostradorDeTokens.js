// O MOSTRADOR DE TOKENS NA BARRA DE CIMA (V20, t196).
//
// Pedido dele, com a referência pronta na mão: *"tokens tem que ficar assim. entre a barra de
// pesquisa e os botões de minimizar, maximizar e fechar janela"* — numa linha só, o nome da
// sessão, o custo e o contexto.
//
// ⚠️ O QUE MUDOU DESDE A V19, E POR QUÊ. Até aqui, quem sabia qual conversa medir era o painel
// próprio: ele tinha o id na mão. Na V20 a conversa passou a ser a da extensão oficial (t187) e a
// OFICINA deixou de ter esse id — foi o defeito que ele viu primeiro (*"nao surgiu esse contador
// do cache reset"*). Quem devolve o id agora é `sessaoAtiva.js`, lendo o registro que o próprio
// programa de linha de comando mantém. Daí para a frente nada mudou: o arquivo da conversa é
// achado PELO ID (`tokens.acharTranscrito`), como sempre foi — e não por palpite de "o mais
// recente desta pasta".
//
// ⚠️ NOME DE PASTA NÃO É TÍTULO. O registro traz `nameSource`, e o nome pode ter sido DERIVADO da
// pasta (medido: `nome-derivado-da-pasta`) em vez de escolhido por ele. Nome derivado não vai para a
// barra: repetiria o que o título da janela já diz e passaria por um nome que ele não deu. Só o
// nome escolhido aparece.
//
// ⚠️ O CUSTO É ESTIMATIVA, E A TELA PRECISA DIZER. Em assinatura ninguém paga por token; o número
// responde "quanto isto custaria pela tabela da API". O asterisco que o `tokens.js` já põe é o que
// carrega esse aviso, e a dica o escreve por extenso.

'use strict'

const T = require('./tokens')
const S = require('./sessaoAtiva')
const R = require('./relogioCache')
const TIT = require('./tituloDaConversa')

/** As chaves que a barra de cima lê — as mesmas duas do patch 0016 (texto vivo e sim/não). */
const CHAVE_DO_TEXTO = 'oficina.tokens'
const CHAVE_DE_MOSTRAR = 'oficina.tokens.aMostrar'

/**
 * O que a barra mostra quando NÃO há conversa aberta (t202).
 *
 * `–` no lugar do contexto e `0` no lugar do processado: o traço diz que não há o que medir, o
 * zero diz que nada passou pelo modelo. Escrito com o mesmo separador dos números de verdade, para
 * a linha não mudar de forma quando a conversa começar.
 */
const SEM_CONVERSA = '– · 0'

/**
 * O que a barra mostra quando HÁ conversa e o medidor FALHOU (t202).
 *
 * ⚠️ ESTE ESTADO EXISTE PARA NÃO MENTIR. Quando ele mandou o mostrador parar de sumir, o caminho
 * curto seria mandar tudo que não mede para o `– · 0`. Mas `0` é uma MEDIDA: diz "nada passou pelo
 * modelo". Um medidor que lançou exceção não sabe se passou muito ou pouco — e a conversa pode
 * estar consumindo o plano dele enquanto a barra anuncia zero. Medida que ninguém fez não vira
 * número na tela; vira `?`.
 *
 * A diferença com `SEM_CONVERSA` é essa: lá o zero é verdade (não há conversa), aqui seria palpite.
 */
const SEM_MEDIDA = '– · ?'

/** A mesma cadência da vista de tokens da V10: a leitura é incremental, só o que cresceu. */
const INTERVALO_MS = 3000

function criarMostradorDeTokens(vscode, {
  agendar = setInterval,
  desagendar = clearInterval,
  pastaDoProjeto = () => {
    const p = vscode.workspace.workspaceFolders
    return p && p.length ? p[0].uri.fsPath : null
  },
  acharSessao = S.sessaoDaPasta,
  acharTranscrito = T.acharTranscrito,
  criarMedidor = transcrito => new T.MedidorDaConversa(transcrito),
  lerTitulo = TIT.doTranscrito,
} = {}) {
  let medidor = null
  let transcritoAtual = null
  let idAtual = null
  let sessaoAtual = null
  let relogio = null
  let publicado = { mostrar: null, texto: null }
  /** O medidor lançou na ÚLTIMA passada? Separa "não há o que medir" de "não consegui medir". */
  let falhouAoMedir = false
  let descartado = false
  const publicacoes = []
  const TETO_DAS_PUBLICACOES = 50

  const definir = (chave, valor) => {
    try { Promise.resolve(vscode.commands.executeCommand('setContext', chave, valor)).catch(() => { }) }
    catch { /* fora do editor não há chave: o mostrador não derruba a ativação */ }
  }

  /**
   * A conversa mudou? Troca o medidor.
   *
   * ⚠️ TROCAR DE CONVERSA RECOMEÇA A MEDIÇÃO. O medidor é incremental (lê só o que cresceu desde a
   * leitura anterior); apontá-lo para outro arquivo sem recomeçar somaria duas conversas num
   * número só.
   */
  function conferirSessao() {
    const pasta = pastaDoProjeto()
    const sessao = pasta ? acharSessao(pasta) : null
    const id = sessao ? sessao.id : null

    if (id !== idAtual) {
      idAtual = id
      medidor = null
      transcritoAtual = null
      // ⚠️ A marca de falha é DA CONVERSA que falhou. Trocando de conversa ela zera, senão o `?`
      // ficaria preso na barra: a conversa nova mediria bem e a tela continuaria dizendo que não
      // conseguiu medir, até a primeira passada boa — e no caso sem conversa, para sempre.
      falhouAoMedir = false
    }
    // ⚠️ O REGISTRO É RELIDO A CADA PASSADA, mesmo com o id igual. Sem isto, renomear a conversa
    // nunca mudava o nome na barra — e o nome é metade do que ele pediu no `t196`.
    sessaoAtual = sessao
    if (!id) { medidor = null; falhouAoMedir = false; return }

    // ⚠️ E O ARQUIVO É PROCURADO DE NOVO ENQUANTO NÃO EXISTIR. A primeira versão saía cedo quando o
    // id não tinha mudado: se, no primeiro instante em que a conversa aparece, o `.jsonl` ainda não
    // tivesse sido escrito, o medidor ficava `null` PARA SEMPRE naquela conversa — e esse é
    // justamente o caso da conversa recém-aberta, porque a sessão é registrada antes do arquivo.
    // O teste que existia provava que não quebra; não provava que se recupera.
    if (!medidor) {
      const transcrito = acharTranscrito(id)
      // ⚠️ Arquivo ainda não escrito NÃO é falha de medição: a sessão é registrada antes do
      // `.jsonl`, então este é o estado normal do primeiro instante de toda conversa. Vai para
      // `– · 0` (nada processado ainda), nunca para `– · ?`.
      if (!transcrito) falhouAoMedir = false
      if (transcrito) {
        transcritoAtual = transcrito
        try { medidor = criarMedidor(transcrito); falhouAoMedir = false } catch { medidor = null; falhouAoMedir = true }
      }
    }
  }

  /**
   * O que a barra desenha.
   *
   * A primeira linha é o que se lê; o resto é o que o mouse mostra. Quem separa é o patch 0016 —
   * a mesma regra do mostrador do limite da V19, e pelo mesmo motivo (não há campo de dica no
   * manifesto).
   */
  function montarTexto(resumo) {
    /*
      ⚠️ O MOSTRADOR NÃO SOME MAIS QUANDO NÃO HÁ CONVERSA (t202, ordem dele em 24/09/2026).

      Até a V23 esta linha era `if (!numeros) return null`, e o `null` apagava o item da barra: sem
      conversa aberta, o contador desaparecia e a linha de cima ficava só com os medidores do plano.
      As palavras dele: *"ele tem que estar ligado ali o tempo inteiro naquela mesma linha"* — e,
      sem conversa, *"marca só um risquinho e zero tokens"*.

      ⚠️ ISTO NÃO É ESCONDER AUSENTE ATRÁS DE ZERO. O `–` diz "não há o que medir" e o `0` diz
      "nada foi processado" — duas informações diferentes, e por isso as duas aparecem, em vez de um
      `0 · 0` que confundiria "sem conversa" com "conversa nova e vazia". É a mesma degradação que a
      faixa do limite já usa (`5h – · 7d –`), e pelo mesmo motivo.

      O custo não entra: sem conversa não há estimativa para mostrar, e um `$0,00*` seria apresentar
      como medida uma conta que ninguém fez.
    */
    const numeros = T.textoDaBarra(resumo) || (falhouAoMedir ? SEM_MEDIDA : SEM_CONVERSA)

    /*
      ⚠️ O NOME VEM DO ARQUIVO DA CONVERSA, e não do registro de sessões — e isto foi pago.

      A primeira versão lia `name`/`nameSource` do registro (`~/.claude/sessions/<pid>.json`). Ali o
      nome quase sempre é DERIVADO da pasta, então, com a regra de não anunciar nome de diretório
      como título, ele NUNCA aparecia. Eu cheguei a escrever isso como "limitação". Não era: ele
      renomeia a conversa e o nome tem de aparecer.

      Medido no pacote da extensão oficial: o comando de renomear grava no TRANSCRITO (ela lê
      `sessionTitleOnDisk` e reclama de "no readable transcript"), numa linha
      `{"type":"ai-title","aiTitle":"<nome>",...}`. É de lá que se lê — ver `tituloDaConversa.js`.

      O registro de sessões continua servindo para achar QUAL conversa é; o nome dela vem do arquivo.
    */
    const nome = transcritoAtual ? lerTitulo(transcritoAtual) : null

    /*
      ⚠️ O RELÓGIO DO CACHE (t201) MORA AQUI AGORA, E É O PONTO DO ITEM.

      Ele reparou que o relógio sumiu ao usar a conversa da extensão oficial. A razão: ele era
      desenhado no pé do painel PRÓPRIO e na vista Tokens — as duas coisas que a decisão do `t187`
      tirou do caminho. A primeira versão desta leva AFIRMOU no registro que o relógio "voltava a
      funcionar", e não voltava: nada o desenhava. Um revisor independente pegou.

      O dado nunca dependeu do painel: sai do arquivo da conversa, pelo mesmo medidor que dá os
      tokens (`resumo.cache`). O que faltava era uma superfície, e a barra de cima é a que existe.

      `cache N` é quanto falta para a conversa esfriar: enquanto corre, a próxima mensagem só relê o
      que já está no cache (barato); vencido, ela relê a conversa inteira e custa mais. O `?` marca
      o caso em que o tempo de vida foi SUPOSTO, e não lido da resposta — a mesma marca que o
      relógio do painel usava, e pelo mesmo motivo: não apresentar suposição como medida.
    */
    const rel = resumo && resumo.cache ? R.estadoDoRelogio(resumo.cache, Date.now()) : null
    const relogio = !rel ? null
      : rel.vencido ? 'cache vencido'
        : `cache ${rel.minutos}m${rel.suposto ? '?' : ''}`

    const linha = [nome, numeros, relogio].filter(Boolean).join(' · ')

    const dica = numeros === SEM_MEDIDA ? [
      'Tokens: ha uma conversa, mas a medicao falhou nesta passada.',
      'O `?` esta no lugar do numero de proposito: dizer 0 seria afirmar que nada foi processado,',
      'e ninguem mediu isso. A proxima passada tenta de novo, a cada 3 segundos.',
    ].join(String.fromCharCode(10)) : numeros === SEM_CONVERSA ? [
      'Tokens: nenhuma conversa aberta nesta pasta agora.',
      'O contador fica na barra o tempo todo; ele se enche quando uma conversa comecar.',
      '– = nao ha conversa para medir · 0 = nada processado ainda.',
    ].join(String.fromCharCode(10)) : [
      'Tokens desta conversa.',
      'Contexto agora: o tamanho da conversa na última resposta.',
      'Processado: tudo que já passou pelo modelo — é ele que custa.',
      'O custo é estimativa pela tabela da API; em assinatura não se paga por token.',
      ...(rel ? ['', R.dicaDoRelogio(rel)] : []),
    ].join('\n')
    return `${linha}\n${dica}`
  }

  function publicar() {
    if (descartado) return
    let resumo = null
    if (medidor) {
      // ⚠️ `atualizar`, NÃO `ler`. A primeira versão desta linha chamava `medidor.ler()` — método que
      // `MedidorDaConversa` não tem (ele expõe `atualizar` e `resumo`). O `TypeError` caía neste
      // `catch`, o resumo virava `null` e o item da barra NUNCA aparecia, sem uma linha de erro.
      // O teste não pegou porque injetava um medidor de mentira que TINHA `ler()`.
      try { medidor.atualizar(); resumo = medidor.resumo(); falhouAoMedir = false }
      catch { resumo = null; falhouAoMedir = true }
    }
    const texto = montarTexto(resumo)
    const mostrar = texto !== null
    if (publicado.mostrar !== mostrar) { definir(CHAVE_DE_MOSTRAR, mostrar); publicado.mostrar = mostrar }
    if (publicado.texto !== texto) {
      definir(CHAVE_DO_TEXTO, texto || '')
      publicado.texto = texto
      publicacoes.push({ mostrar, texto })
      if (publicacoes.length > TETO_DAS_PUBLICACOES) publicacoes.splice(0, publicacoes.length - TETO_DAS_PUBLICACOES)
    }
  }

  /** Uma passada: confere qual conversa é, mede e publica. Nunca lança. */
  function tique() {
    if (descartado) return
    try { conferirSessao() } catch { /* registro ilegível: fica o que estava */ }
    publicar()
  }

  function ligar() {
    tique()
    if (!relogio) relogio = agendar(tique, INTERVALO_MS)
  }

  function descartar() {
    descartado = true
    if (relogio) { desagendar(relogio); relogio = null }
    medidor = null
  }

  return {
    ligar, descartar, tique, publicar,
    get idAtual() { return idAtual },
    get sessao() { return sessaoAtual },
    get temMedidor() { return medidor !== null },
    get temRelogio() { return relogio !== null },
    get publicacoes() { return publicacoes },
    get ultima() { return publicacoes[publicacoes.length - 1] || null },
  }
}

module.exports = { criarMostradorDeTokens, CHAVE_DO_TEXTO, CHAVE_DE_MOSTRAR, INTERVALO_MS, SEM_CONVERSA, SEM_MEDIDA }
