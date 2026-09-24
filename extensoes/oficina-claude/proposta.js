// A PROPOSTA de mudança num arquivo — o que o agente quer gravar, recortado em trechos que a pessoa
// aceita ou rejeita um a um. Sem uma linha de interface, como o `agente.js`: roda em `node` puro e
// é provado por `testes/rodar.mjs` em segundos.
//
// ⚠️ O TEXTO É COMPARADO COM AS QUEBRAS DE LINHA NORMALIZADAS PARA `\n`. Medido no SDK real
// (11/09/2026): num arquivo CRLF o agente manda o `old_string` com `\n`, o SDK acha e aplica mesmo
// assim — e um `old_string` com CRLF devolvido a ele dá "String not found in file". Quem simula a
// mudança para mostrá-la tem que enxergar o arquivo do mesmo jeito que o SDK enxerga.

/**
 * CRLF (e CR solto) viram `\n`, e o BOM do UTF-8 sai. Com o BOM, a primeira linha do arquivo nunca era
 * igual à do agente (que não o escreve) e o diff mostrava um trecho fantasma na linha 1 (revisão de
 * suposições da V3). O editor guarda o BOM como codificação, não como texto — o parcial não o perde.
 */
function normalizar(texto) {
  return String(texto == null ? '' : texto).replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

/** Começa com o BOM do UTF-16 (o "Unicode" do Bloco de Notas)? */
function temBomUtf16(b) {
  return !!b && b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))
}

/**
 * O conteúdo é binário? Byte NUL nos primeiros 8 KB — menos em UTF-16 com BOM, que tem um byte zero em
 * todo caractere comum e é TEXTO.
 * ⚠️ Até a revisão de suposições da V3, UTF-8 inválido também contava como binário: um `.txt` ou `.bat`
 * antigo com acento (Windows-1252) era RECUSADO com "arquivo binário" — e o agente não conseguia mexer
 * nele de jeito nenhum. Texto que não é UTF-8 não é binário: só não tem diff (ver `ehUtf8`).
 * Proposta em binário de verdade é recusada com aviso: um diff de texto sobre ele mostraria lixo.
 */
function ehBinario(buffer) {
  if (!buffer || !buffer.length) return false
  if (temBomUtf16(buffer)) return false
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0)
}

/** É UTF-8? O diff só mostra UTF-8; o resto (Windows-1252, UTF-16) segue no cartão da V2, sem diff. */
function ehUtf8(buffer) {
  if (!buffer || !buffer.length) return true
  if (temBomUtf16(buffer)) return false
  try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); return true } catch { return false }
}

/** Quantas vezes `agulha` aparece em `palheiro`, sem sobreposição. */
function ocorrencias(palheiro, agulha) {
  if (!agulha) return 0
  let n = 0, i = 0
  while ((i = palheiro.indexOf(agulha, i)) !== -1) { n++; i += agulha.length }
  return n
}

/**
 * O arquivo DEPOIS da ferramenta, calculado aqui — sem gravar nada.
 * Devolve `{ depois }` ou `{ erro }`. O erro não é recusa: é "não consigo mostrar isto como diff",
 * e quem chama decide o que fazer (o SDK também falharia com essa entrada).
 *
 * @param {'Write'|'Edit'} ferramenta
 * @param {object} entrada   a entrada da ferramenta, como o SDK a entregou
 * @param {string|null} antes o conteúdo atual (null = o arquivo não existe)
 */
function simular(ferramenta, entrada, antes) {
  const e = entrada || {}
  if (ferramenta === 'Write') {
    if (typeof e.content !== 'string') return { erro: 'o Write veio sem conteudo' }
    return { depois: normalizar(e.content) }
  }
  if (ferramenta === 'Edit') {
    if (antes == null) return { erro: 'o arquivo nao existe' }
    const base = normalizar(antes)
    const velho = normalizar(e.old_string)
    const novo = normalizar(e.new_string)
    if (!velho) return { erro: 'o Edit veio sem o trecho a trocar' }
    const n = ocorrencias(base, velho)
    if (n === 0) return { erro: 'o trecho a trocar nao esta no arquivo' }
    // ⚠️ TEXTO NOVO VAZIO APAGA A LINHA INTEIRA. Lido no código do SDK que a extensão empacota e
    // medido contra uma cópia literal da função dele (revisão de código da V3): quando o texto novo é
    // vazio e o trecho não termina em quebra, ele apaga também a quebra seguinte. Sem isto o diff
    // mostrava uma linha vazia que o SDK não deixaria no arquivo — e no parcial, quem grava é o editor,
    // com o texto simulado: a linha vazia acabava no disco.
    const alvo = (novo === '' && !velho.endsWith('\n') && base.includes(velho + '\n')) ? velho + '\n' : velho
    if (e.replace_all === true) return { depois: base.split(alvo).join(novo) }
    if (n > 1) return { erro: 'o trecho a trocar aparece mais de uma vez' }
    const i = base.indexOf(alvo)
    // Por índice, e não por `replace`: um `$&` no texto novo seria lido como padrão de substituição.
    return { depois: base.slice(0, i) + novo + base.slice(i + alvo.length) }
  }
  return { erro: `ferramenta sem diff: ${ferramenta}` }
}

// Acima disto o miolo vira um trecho só. LCS custa linhas × linhas de memória: 2 000 × 2 000 já são
// 4 milhões de células. Custo desta escolha: arquivo enorme com mudança espalhada perde a granularidade
// por trecho — ainda se aceita ou rejeita tudo, e nada grava sem a pessoa.
const TETO_DO_MIOLO = 4000000

/**
 * Os trechos que mudam, por linha: `[{ id, inicioAntes, removidas, inicioDepois, adicionadas }]`
 * (inícios em base 0). Prefixo e sufixo iguais saem antes do LCS — é o caso comum de um Edit.
 */
function calcularTrechos(antes, depois) {
  const A = normalizar(antes).split('\n')
  const B = normalizar(depois).split('\n')
  let ini = 0
  while (ini < A.length && ini < B.length && A[ini] === B[ini]) ini++
  let fimA = A.length, fimB = B.length
  while (fimA > ini && fimB > ini && A[fimA - 1] === B[fimB - 1]) { fimA--; fimB-- }
  const a = A.slice(ini, fimA), b = B.slice(ini, fimB)
  const trechos = []
  if (!a.length && !b.length) return trechos

  // ARQUIVO NOVO (ou vazio) É UM TRECHO SÓ. Sem isto, uma linha em branco no meio do conteúdo casava
  // com a única linha vazia do arquivo inexistente e a proposta vinha partida em dois trechos — e o
  // parcial de um arquivo que ainda não existe nunca grava: o editor não abre o que não está no disco,
  // a tela dizia "não consegui gravar" e o agente não ficava sabendo que o arquivo não nasceu
  // (revisão de código da V3). Aqui não há o que escolher trecho a trecho: ou o arquivo nasce, ou não.
  if (!normalizar(antes) || a.length * b.length > TETO_DO_MIOLO) {
    trechos.push({ inicioAntes: ini, removidas: a, inicioDepois: ini, adicionadas: b })
  } else {
    const n = a.length, m = b.length
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
    }
    let i = 0, j = 0, atual = null
    const fechar = () => { if (atual) { trechos.push(atual); atual = null } }
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { fechar(); i++; j++; continue }
      if (!atual) atual = { inicioAntes: ini + i, removidas: [], inicioDepois: ini + j, adicionadas: [] }
      if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { atual.adicionadas.push(b[j]); j++ }
      else { atual.removidas.push(a[i]); i++ }
    }
    fechar()
  }
  return trechos.map((t, k) => ({ id: k + 1, ...t }))
}

/**
 * O arquivo final com SÓ os trechos aceitos: cada trecho aceito entra com as linhas novas, cada
 * recusado fica com as antigas. `aceitos` é um conjunto (ou lista) de ids.
 */
function combinar(antes, trechos, aceitos) {
  const ok = new Set(aceitos || [])
  const A = normalizar(antes).split('\n')
  const saida = []
  let i = 0
  for (const t of [...trechos].sort((x, y) => x.inicioAntes - y.inicioAntes)) {
    while (i < t.inicioAntes) saida.push(A[i++])
    saida.push(...(ok.has(t.id) ? t.adicionadas : t.removidas))
    i += t.removidas.length
  }
  while (i < A.length) saida.push(A[i++])
  return saida.join('\n')
}

/** 'tudo' | 'nada' | 'parcial' — comparando o final com o antes e o depois, já normalizados. */
function classificar(antes, depois, final) {
  const f = normalizar(final)
  if (f === normalizar(depois)) return 'tudo'
  if (f === normalizar(antes == null ? '' : antes)) return 'nada'
  return 'parcial'
}

/**
 * O que o AGENTE ouve quando a pessoa aceita só uma parte.
 *
 * ⚠️ Vai como `deny` (com esta mensagem) e não como `allow`. Medido no SDK real (11/09/2026): o
 * `allow` não tem campo de mensagem, e com um `updatedInput` parcial o agente ouve "sucesso" e
 * acredita que gravou tudo. Aqui quem gravou os trechos aceitos foi o editor; o agente precisa saber
 * exatamente isso — e que não deve repetir a edição.
 */
function mensagemDoParcial(nomeDoArquivo, total, aceitos, conferido) {
  // Sem a lista (a pessoa pode ter mexido na proposta à mão), não se inventa a contagem.
  const quanto = Array.isArray(aceitos) ? `${aceitos.length} de ${total} trecho(s)` : `parte dos ${total} trecho(s)`
  return `A pessoa revisou esta mudança em ${nomeDoArquivo} no editor e aceitou ${quanto}. ` +
    (conferido
      ? 'Os trechos aceitos JÁ ESTÃO GRAVADOS no arquivo; os outros ficaram como estavam. '
      : 'ATENÇÃO: não consegui confirmar no disco que os trechos aceitos foram gravados. ') +
    'Não repita esta edição. Se precisar continuar mexendo neste arquivo, leia-o de novo antes.'
}

module.exports = { normalizar, ehBinario, ehUtf8, simular, calcularTrechos, combinar, classificar, mensagemDoParcial, TETO_DO_MIOLO }
