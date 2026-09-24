// AS AÇÕES DO EDITOR — o que "explicar", "corrigir" e "gerar teste" pedem ao agente.
//
// ⚠️ Como `agente.js` e `sessoes.js`, este arquivo NÃO importa `vscode`. É o que permite
// `testes/acoes.mjs` provar o texto de cada pedido em `node` puro, em segundos. Quem lê a
// seleção do editor e desenha menu é `extensao.js`.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ POR QUE O TEXTO DO PEDIDO É UM ARQUIVO, E NÃO TRÊS `template strings` SOLTAS.
//
// O texto que sai daqui É o produto desta versão. Um "explique este trecho" mal escrito
// devolve meia página de óbvio; um bem escrito devolve o que a pessoa queria saber. E, como
// ele é montado a partir de dados que vêm do editor (caminho, linguagem, número de linha,
// código selecionado), ele tem exatamente os problemas de qualquer coisa montada com dado
// de fora: pode ficar gigante, pode vir vazio, pode trazer o caminho absoluto da máquina de
// alguém para dentro da conversa.
//
// Concentrar isso num arquivo sem `vscode` faz cada um desses casos virar critério de teste
// em vez de virar surpresa no uso.

'use strict'

/**
 * ⚠️ O TETO DO TRECHO COLADO NO PEDIDO.
 *
 * Selecionar um arquivo inteiro e mandar "explique" é o uso normal, não o excepcional. Sem
 * teto, o pedido carrega o arquivo todo já na primeira mensagem — e quem paga por token paga
 * duas vezes pelo mesmo texto, porque o agente costuma reler o arquivo com as ferramentas
 * dele de qualquer jeito.
 *
 * Acima do teto, o pedido manda o ENDEREÇO (arquivo e linhas) em vez do conteúdo, e diz ao
 * agente para ler de lá. ⚠️ CUSTO DECLARADO: nesses casos o agente precisa de uma leitura a
 * mais antes de responder — mais lento, e passa pela porta de permissão de leitura.
 */
const TETO_DO_TRECHO = 8000

/** Quantas linhas do começo e do fim aparecem quando o trecho é grande demais para caber. */
const LINHAS_DE_AMOSTRA = 8

/**
 * As quatro ações, na ordem em que aparecem no menu.
 *
 * `pedido` recebe o CONTEXTO (o que o editor viu) e devolve o texto que vai para o agente,
 * como se a pessoa o tivesse digitado. `pergunta` marca a única que precisa de algo escrito
 * por ela antes de valer.
 */
const ACOES = [
  {
    id: 'explicar',
    rotulo: 'Explicar',
    // ⚠️ "sem reescrever" está no texto de propósito: sem isso, o agente costuma responder a
    // explicação E já propor uma mudança, e a pessoa que só queria entender leva um diff.
    instrucao: 'Explique o que este código faz, em português, para alguém que conhece programação mas ' +
      'nunca viu este arquivo. Comece pelo objetivo dele em uma frase, depois o passo a passo do que ' +
      'importa. Aponte o que for surpreendente ou arriscado. NÃO reescreva o código e não proponha ' +
      'mudanças — se você achar um problema, apenas diga qual é.',
  },
  {
    id: 'corrigir',
    rotulo: 'Corrigir',
    instrucao: 'Ache o defeito deste código e corrija. Antes de mudar qualquer coisa, diga em uma frase ' +
      'qual é o defeito e como você sabe que é um. Se não houver defeito, diga isso e não mude nada — ' +
      'não invente melhoria para ter o que entregar.',
  },
  {
    id: 'testar',
    rotulo: 'Gerar teste',
    instrucao: 'Escreva um teste para este código, no estilo dos testes que já existem neste projeto ' +
      '(procure antes de escrever; não invente um framework que o projeto não usa). O teste tem que ' +
      'FALHAR se o comportamento mudar — se você não conseguir escrever um assim, diga por quê em vez ' +
      'de escrever um teste que passa de qualquer jeito.',
  },
  {
    id: 'perguntar',
    rotulo: 'Perguntar sobre a seleção',
    pergunta: true,
    instrucao: null,   // a pessoa escreve; ver `montar`
  },
]

const porId = id => ACOES.find(a => a.id === id) || null

/** Escapa nada: apenas garante que o trecho não feche o bloco de código do markdown. */
function cercaSegura(trecho) {
  // ⚠️ Um trecho que já contenha ``` fecharia o bloco no meio e o resto do pedido viraria
  // texto solto — inclusive a instrução. A cerca cresce até ser maior que qualquer sequência
  // de crases dentro do trecho, que é como o próprio markdown resolve isso.
  let maior = 0
  for (const m of String(trecho).matchAll(/`+/g)) maior = Math.max(maior, m[0].length)
  return '`'.repeat(Math.max(3, maior + 1))
}

/** O trecho como ele entra no pedido — ou o aviso de que ele é grande demais. */
function corpoDoTrecho({ trecho, caminho, linhaInicial, linhaFinal, linguagem }) {
  const texto = typeof trecho === 'string' ? trecho : ''
  const onde = enderecar({ caminho, linhaInicial, linhaFinal })
  if (!texto.trim()) return { corpo: '', grande: false, onde }

  if (texto.length <= TETO_DO_TRECHO) {
    const cerca = cercaSegura(texto)
    return { corpo: `${cerca}${linguagem || ''}\n${texto}\n${cerca}`, grande: false, onde }
  }

  // Grande demais: vai o endereço e uma amostra das pontas, para o agente reconhecer o
  // trecho ao abrir o arquivo sem receber o arquivo inteiro duas vezes.
  const linhas = texto.split('\n')
  const cabeca = linhas.slice(0, LINHAS_DE_AMOSTRA).join('\n')
  const cauda = linhas.slice(-LINHAS_DE_AMOSTRA).join('\n')
  const cerca = cercaSegura(texto)
  return {
    grande: true,
    onde,
    corpo: `O trecho tem ${linhas.length} linhas (${texto.length} caracteres) — grande demais para colar aqui.\n` +
      `Leia direto do arquivo, em ${onde}. Ele começa e termina assim:\n\n` +
      `${cerca}${linguagem || ''}\n${cabeca}\n\n[...]\n\n${cauda}\n${cerca}`,
  }
}

/**
 * ⚠️ A BARREIRA CONTRA O CAMINHO ABSOLUTO, e ela mora AQUI de propósito.
 *
 * Quem lê a seleção já tenta entregar o caminho relativo à pasta aberta. Só que "tenta" não
 * é "garante": quando o arquivo ativo está FORA da pasta do projeto (um arquivo solto aberto
 * pelo Ctrl+O, um rascunho), o editor não tem pasta para aquele documento e o caminho volta
 * absoluto — com o nome de usuário e a árvore de pastas de alguém dentro dele.
 *
 * Achado por revisão independente em 12/09/2026, por leitura de código. A garantia estava
 * escrita no comentário abaixo e o código não a dava: era exatamente o tipo de frase que
 * promete mais do que cumpre.
 *
 * Por isso a barreira é aqui, no montador do texto, e não só em quem chama: assim qualquer
 * caminho novo até o pedido passa por ela. Caminho absoluto vira SÓ o nome do arquivo — o
 * agente lê o arquivo pelas ferramentas dele de qualquer forma.
 */
function caminhoParaMostrar(caminho) {
  const p = String(caminho == null ? '' : caminho).trim()
  if (!p) return ''
  // `C:\\...`, `/home/...` e `\\servidor\\...` - as tres formas de absoluto que chegam aqui.
  const absoluto = /^([a-zA-Z]:[\\/]|[\\/])/.test(p)
  if (!absoluto) return p.replace(/\\/g, '/')
  return p.split(/[\\/]/).filter(Boolean).pop() || ''
}

/**
 * O endereço do trecho, do jeito que o painel já sabe transformar em link.
 *
 * ⚠️ CAMINHO RELATIVO à pasta aberta, nunca absoluto. Dois motivos, e o segundo é o que
 * importa: o absoluto entope a conversa com a pasta de usuário inteira (que o agente não precisa),
 * e essa conversa fica GRAVADA no perfil de quem usa — virando um arquivo com o nome de usuário e
 * a estrutura de pastas de alguém dentro de cada pedido.
 */
function enderecar({ caminho, linhaInicial, linhaFinal }) {
  const arq = caminhoParaMostrar(caminho) || '(arquivo sem nome)'
  if (!Number.isFinite(linhaInicial)) return arq
  if (!Number.isFinite(linhaFinal) || linhaFinal === linhaInicial) return `${arq}:${linhaInicial}`
  return `${arq}:${linhaInicial}-${linhaFinal}`
}

/**
 * Monta o pedido de uma ação.
 *
 * @param {string} id                    a ação (`explicar`, `corrigir`, `testar`, `perguntar`)
 * @param {object} contexto              o que o editor viu
 * @param {string} contexto.caminho      caminho RELATIVO à pasta aberta
 * @param {string} [contexto.linguagem]  o id da linguagem, para a cerca do markdown
 * @param {string} contexto.trecho       o código selecionado
 * @param {number} [contexto.linhaInicial]
 * @param {number} [contexto.linhaFinal]
 * @param {string} [contexto.simbolo]    o nome da função, quando a ação veio do CodeLens
 * @param {string} [contexto.pergunta]   o que a pessoa escreveu (só na ação `perguntar`)
 * @returns {string|null} o texto do pedido, ou `null` se ele não pode ser montado
 */
function montar(id, contexto = {}) {
  const acao = porId(id)
  if (!acao) return null

  const { corpo, onde } = corpoDoTrecho(contexto)
  // ⚠️ Sem trecho não há ação: melhor devolver `null` e deixar quem chamou avisar do que
  // mandar ao agente um pedido sobre um código que não foi junto.
  if (!corpo) return null

  const instrucao = acao.pergunta ? String(contexto.pergunta || '').trim() : acao.instrucao
  if (!instrucao) return null

  const alvo = contexto.simbolo ? `${acao.pergunta ? '' : 'Sobre '}\`${contexto.simbolo}\`, em ${onde}` : `Em ${onde}`
  const cabecalho = `${alvo}:`

  return `${cabecalho}\n\n${corpo}\n\n${instrucao}`
}

/** O rótulo curto que a aba da conversa usa quando o pedido veio de uma ação. */
function titulo(id, contexto = {}) {
  const acao = porId(id)
  if (!acao) return null
  const alvo = contexto.simbolo || (contexto.caminho ? String(contexto.caminho).split(/[\\/]/).pop() : '')
  if (acao.pergunta) {
    const p = String(contexto.pergunta || '').trim()
    return p ? p : null
  }
  return alvo ? `${acao.rotulo}: ${alvo}` : acao.rotulo
}

module.exports = { ACOES, montar, titulo, porId, enderecar, caminhoParaMostrar, cercaSegura, TETO_DO_TRECHO }
