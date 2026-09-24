// QUAL CONVERSA ESTÁ ABERTA — o achado que a V20 precisou (t201).
//
// ⚠️ POR QUE ESTE ARQUIVO PRECISOU EXISTIR. Até a V19, o medidor de tokens e o relógio do cache
// achavam o arquivo da conversa PELO ID, que o painel próprio conhecia — está escrito no
// `tokens.js`: *"o arquivo é achado pelo id da conversa, que a OFICINA conhece — não por palpite
// de 'o mais recente desta pasta'"*. Na V20 a conversa passou a ser a da extensão oficial
// (decisão dele, t187), e com isso a OFICINA perdeu o id. O sintoma que ele viu: *"fui testar uma
// conversa la e nao surgiu esse contador do cache reset"*, e a vista Tokens dizendo "Nenhuma
// conversa aberta".
//
// ⚠️ E NÃO É O PALPITE QUE O `tokens.js` RECUSOU. O próprio programa de linha de comando mantém um
// registro das sessões vivas em `~/.claude/sessions/<pid>.json`, e ele traz o `sessionId` escrito.
// Não se adivinha "a mais recente da pasta": lê-se o id que o dono da sessão registrou. Medido
// nesta máquina em 21/09/2026:
//
//   {"pid":15504,"sessionId":"0efc67d8-...","cwd":"d:\alguma\pasta",
//    "version":"2.1.273","kind":"interactive","entrypoint":"claude-vscode",
//    "name":"nome-derivado-da-pasta","status":"idle","updatedAt":1789917012877}
//
// ⚠️ O QUE NÃO FOI MEDIDO, e por isso o código é conservador: como fica com VÁRIAS abas de sessão
// abertas ao mesmo tempo. A hipótese é um arquivo por processo, e a escolha aqui é a sessão da
// pasta certa com o `updatedAt` mais novo. Se houver empate ou nenhuma candidata, esta peça
// devolve `null` — e quem chama mostra "nenhuma conversa", que é honesto, em vez de mostrar os
// números de uma conversa que talvez não seja a que está na tela.

'use strict'

const os = require('os')
const path = require('path')
const fs = require('fs')
/** O arquivo da conversa pelo id — a mesma peça que o medidor de tokens usa. */
const { acharTranscrito } = require('./tokens')

/** Onde o programa de linha de comando registra as sessões vivas. */
function pastaDasSessoes(ambiente = process.env, pastaPessoal = os.homedir()) {
  const base = ambiente.CLAUDE_CONFIG_DIR || path.join(pastaPessoal, '.claude')
  return path.join(base, 'sessions')
}

/**
 * De onde a sessão nasceu. Só as que nasceram do editor interessam: uma sessão de terminal, ou de
 * outra janela, não é a conversa que está na tela deste programa.
 */
const ENTRADAS_DO_EDITOR = ['claude-vscode']

/**
 * O que conta como nome ESCOLHIDO por quem usa (e não derivado da pasta).
 *
 * ⚠️ Medido nesta máquina em 21/09/2026: nos 6 registros existentes, `nameSource` era `'derived'`
 * em 6 de 6 — ou seja, no uso comum o nome NÃO aparece na barra. Isso é escolha de produto (não
 * anunciar nome de diretório como título), e está registrado para ele decidir se quer mudá-la.
 */
const NOMES_ESCOLHIDOS = ['user', 'chosen', 'explicit']

/**
 * O processo daquele registro ainda está vivo?
 *
 * ⚠️ O QUE ESTÁ MEDIDO, E O QUE NÃO ESTÁ. Nesta máquina havia **5 a 6 registros de sessão para a
 * mesma pasta** — isso foi medido. O que eu escrevi na primeira versão e NÃO se reproduziu foi
 * "a maioria era de processo já morto": numa segunda medição, no mesmo dia, os 6 PIDs estavam
 * vivos (confirmado contra a tabela de processos). Ou seja, hoje esta peneira pode não descartar
 * nada — ela existe para o caso do registro que fica para trás quando a sessão termina, que é real
 * mas não foi observado. Fica, porque o custo é nulo e o erro que ela evita (mostrar o gasto de uma
 * conversa encerrada) é do tipo silencioso.
 *
 * `process.kill(pid, 0)` não mata nada: só pergunta se dá para sinalizar. `EPERM` conta como vivo
 * (existe, mas é de outro dono).
 */
function processoVivo(pid, matar = (p, s) => process.kill(p, s)) {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return false
  try { matar(pid, 0); return true } catch (e) { return !!(e && e.code === 'EPERM') }
}

/**
 * Quando o arquivo daquela conversa foi escrito pela última vez.
 *
 * ⚠️ É O SINAL MAIS HONESTO DE "ESTA É A CONVERSA EM USO": o arquivo é escrito a cada turno,
 * enquanto o registro de sessões pode ficar minutos sem ser tocado (medido: 20 minutos, com a
 * conversa trabalhando). Nunca lança: sem transcrito, quem chama cai para o critério seguinte.
 */
function escritaDoTranscrito(sessaoId, raiz = undefined) {
  try {
    const arq = acharTranscrito(sessaoId, raiz === undefined ? undefined : raiz)
    if (!arq) return null
    return fs.statSync(arq).mtimeMs
  } catch { return null }
}

/** Duas pastas são a mesma pasta? No Windows, maiúscula e barra não distinguem. */
function mesmaPasta(a, b) {
  if (!a || !b) return false
  const normal = p => path.resolve(String(p)).replace(/[\/]+$/, '').toLowerCase()
  try { return normal(a) === normal(b) } catch { return false }
}

/** Lê um registro de sessão, sem nunca lançar. */
function lerUm(arquivo) {
  try {
    const d = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
    if (!d || typeof d !== 'object' || typeof d.sessionId !== 'string' || !d.sessionId) return null
    return d
  } catch { return null }
}

/** Todas as sessões registradas, sem nunca lançar. */
function lerTodas(pasta = pastaDasSessoes()) {
  let nomes = []
  try { nomes = fs.readdirSync(pasta) } catch { return [] }
  const fora = []
  for (const n of nomes) {
    if (!n.endsWith('.json')) continue     // há também arquivos `.key`, que não são registro de sessão
    const d = lerUm(path.join(pasta, n))
    if (d) fora.push(d)
  }
  return fora
}

/**
 * A conversa desta janela: a que nasceu do editor, na pasta aberta, com o registro mais novo.
 *
 * ⚠️ SEM PASTA ABERTA, DEVOLVE `null` — de propósito. Sem pasta não há como saber qual das sessões
 * da máquina é a desta janela, e escolher "a mais nova de todas" seria mostrar na barra o gasto de
 * uma conversa que pode ser de outro projeto. Pior que não mostrar.
 */
function sessaoDaPasta(pastaAberta, {
  sessoes = null, pasta = undefined, vivo = processoVivo,
  /** Quando o transcrito daquela conversa foi escrito pela última vez. `null` = não achei. */
  escritaEm = escritaDoTranscrito,
} = {}) {
  if (!pastaAberta) return null
  const todas = sessoes || lerTodas(pasta === undefined ? pastaDasSessoes() : pasta)
  const candidatas = todas.filter(s =>
    ENTRADAS_DO_EDITOR.includes(s.entrypoint) &&
    mesmaPasta(s.cwd, pastaAberta) &&
    vivo(s.pid))
  if (!candidatas.length) return null

  /*
    ⚠️ COM MAIS DE UMA CONVERSA VIVA NA MESMA PASTA, O `updatedAt` DO REGISTRO ESCOLHE A ERRADA.

    Apanhado numa conferência independente do build 1 ("o nome na barra não era o da conversa que
    eu estava usando") e medido depois, com sete sessões vivas desta máquina, todas na mesma pasta
    e — o que desmontou a primeira hipótese — todas FILHAS DO MESMO processo do editor: não são
    janelas diferentes, são abas da mesma janela.

        pid    sessao    status   registro   transcrito
        27428  2b9ee332  idle      17,3 min    17,3 min   <- a que o `updatedAt` escolhia
        18928  53990c45  busy      20,4 min     0,0 min   <- a que estava em uso NAQUELE instante

    O registro daquela sessão não era reescrito havia 20 minutos enquanto ela trabalhava. Quem diz
    a verdade é o arquivo da conversa: ele é escrito a cada turno. E `status: 'busy'` é ainda mais
    direto — só uma conversa está trabalhando de cada vez.

    Ordem de escolha: quem está trabalhando; depois, quem escreveu por último no arquivo da
    conversa; e só então o `updatedAt`, que continua servindo quando não há transcrito nenhum.

    ⚠️ O QUE ISTO NÃO RESOLVE, E ESTÁ DECLARADO: com duas abas de conversa PARADAS na mesma pasta,
    nada no disco diz qual delas está à vista. A escolha é "a última que trabalhou", que é a
    resposta mais útil — não uma certeza.
  */
  const trabalhando = candidatas.filter(c => c.status === 'busy')
  const disputa = trabalhando.length === 1 ? trabalhando : candidatas
  if (disputa.length === 1) return retrato(disputa[0])

  let melhorEscrita = null
  let empateNaEscrita = false
  for (const c of disputa) {
    const q = escritaEm(c.sessionId)
    if (typeof q !== 'number') continue
    if (!melhorEscrita || q > melhorEscrita.quando) { melhorEscrita = { quando: q, s: c }; empateNaEscrita = false }
    else if (q === melhorEscrita.quando) empateNaEscrita = true
  }
  if (melhorEscrita && !empateNaEscrita) return retrato(melhorEscrita.s)

  // ⚠️ EMPATE DEVOLVE `null` — E ISTO É CÓDIGO, NÃO PROMESSA DE COMENTÁRIO. A primeira versão desta
  // função dizia no cabeçalho que empate devolvia `null` e, no corpo, usava `>` estrito: em empate
  // (duas sessões nascidas juntas, ou `updatedAt` ausente em todas, que vira 0) ela escolhia a
  // primeira da ordem do sistema de arquivos, calada — atribuindo o gasto de uma conversa a outra,
  // que é exatamente o que o comentário prometia evitar. Um revisor independente pegou.
  let melhor = null
  let empatada = false
  for (const c of disputa) {
    const quando = typeof c.updatedAt === 'number' ? c.updatedAt : 0
    if (!melhor || quando > melhor.quando) { melhor = { quando, s: c }; empatada = false }
    else if (quando === melhor.quando) empatada = true
  }
  if (!melhor || empatada) return null
  return retrato(melhor.s)
}

/** O retrato que quem desenha recebe — um lugar só, para as três saídas acima não divergirem. */
function retrato(s) {
  return {
    id: s.sessionId,
    pasta: s.cwd,
    // ⚠️ O nome pode ser derivado da pasta (`nameSource: 'derived'`) em vez de escolhido por ela.
    // Quem desenha precisa saber, para não anunciar como título o que é só o nome do diretório.
    nome: typeof s.name === 'string' ? s.name : null,
    // ⚠️ LISTA BRANCA, e não `!== 'derived'`. Com a negação, um campo AUSENTE (versão do programa
    // mais velha ou mais nova) daria `undefined !== 'derived'` → `true`, e o nome do DIRETÓRIO
    // subiria para a barra de título como se fosse um título que ele escolheu. A falha tem de cair
    // para o lado de não mostrar.
    nomeEscolhido: NOMES_ESCOLHIDOS.includes(s.nameSource),
    estado: typeof s.status === 'string' ? s.status : null,
    atualizadaEm: typeof s.updatedAt === 'number' ? s.updatedAt : null,
  }
}

module.exports = { pastaDasSessoes, lerTodas, sessaoDaPasta, mesmaPasta, processoVivo, escritaDoTranscrito, ENTRADAS_DO_EDITOR, NOMES_ESCOLHIDOS }
