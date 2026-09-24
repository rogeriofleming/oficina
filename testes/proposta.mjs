// A PROPOSTA de mudança (V3) — `extensoes/oficina-claude/proposta.js`, em node puro, sem o editor.
//
// Cada critério exercita o VERBO (aceitar um trecho grava só ele; rejeitar tudo devolve o arquivo
// igual) e tem o seu controle. O placar sai na última linha, para a regressão cobrar o número exato.
//
// Uso: node testes/proposta.mjs
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const P = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'proposta.js'))

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}
const J = x => JSON.stringify(x)

// ── normalizar / binário ─────────────────────────────────────────────────────
checar('normalizar: CRLF e CR soltos viram \\n', P.normalizar('a\r\nb\rc\n') === 'a\nb\nc\n')
checar('binario: byte NUL e binario', P.ehBinario(Buffer.from([0x61, 0x00, 0x62])))
// ⚠️ Este critério dizia "UTF-8 inválido é binário" — a regra que a revisão de suposições da V3 derrubou
// (um `.txt` com acento em Windows-1252 era recusado). E os bytes dele (FF FE 41) eram um BOM de UTF-16.
// A premissa agora é a certa, com o mesmo número de critérios: sem byte zero, não é binário; e não é UTF-8.
checar('UTF-8 invalido SEM byte zero NAO e binario, e tambem nao e UTF-8 (sem diff)',
  !P.ehBinario(Buffer.from([0x41, 0xe9, 0x42])) && typeof P.ehUtf8 === 'function' && P.ehUtf8(Buffer.from([0x41, 0xe9, 0x42])) === false)
checar('CONTROLE: texto com acento NAO e binario', !P.ehBinario(Buffer.from('ação é ótima\n', 'utf8')))
checar('CONTROLE: vazio NAO e binario', !P.ehBinario(Buffer.alloc(0)))

// ── simular ──────────────────────────────────────────────────────────────────
{
  // O caso medido no SDK real: arquivo CRLF, `old_string` com `\n`.
  const antes = 'linha um\r\nlinha dois\r\nlinha tres\r\n'
  const r = P.simular('Edit', { old_string: 'linha um\nlinha dois', new_string: 'LINHA UM\nlinha dois' }, antes)
  checar('Edit: arquivo CRLF com old_string em \\n e achado (como o SDK faz)', r.depois === 'LINHA UM\nlinha dois\nlinha tres\n', J(r))
  checar('Edit: trecho que nao esta no arquivo vira erro, nao depois', !!P.simular('Edit', { old_string: 'zzz', new_string: 'y' }, antes).erro)
  checar('Edit: trecho repetido sem replace_all vira erro (o SDK tambem recusaria)',
    !!P.simular('Edit', { old_string: 'linha', new_string: 'L' }, antes).erro)
  const todos = P.simular('Edit', { old_string: 'linha', new_string: 'L', replace_all: true }, antes)
  checar('Edit: replace_all troca todas', todos.depois === 'L um\nL dois\nL tres\n', J(todos))
  const dolar = P.simular('Edit', { old_string: 'dois', new_string: 'a$&b' }, antes)
  checar('Edit: "$&" no texto novo entra literal', dolar.depois === 'linha um\nlinha a$&b\nlinha tres\n', J(dolar))
  checar('Edit: arquivo que nao existe vira erro', !!P.simular('Edit', { old_string: 'a', new_string: 'b' }, null).erro)
  const w = P.simular('Write', { content: 'x\r\ny\r\n' }, null)
  checar('Write: o depois e o conteudo, normalizado', w.depois === 'x\ny\n', J(w))
  checar('ferramenta sem diff (NotebookEdit) vira erro', !!P.simular('NotebookEdit', {}, 'x').erro)
}

// ── trechos, combinar, classificar ───────────────────────────────────────────
{
  const antes = 'a\nb\nc\nd\ne\n'
  const depois = 'a\nB\nc\nd\nE\nE2\n'
  const t = P.calcularTrechos(antes, depois)
  checar('trechos: duas mudancas separadas sao DOIS trechos', t.length === 2, J(t))
  checar('trechos: o primeiro troca a linha 2 (b -> B)',
    t[0] && t[0].inicioAntes === 1 && J(t[0].removidas) === J(['b']) && J(t[0].adicionadas) === J(['B']), J(t[0]))
  checar('trechos: o segundo troca e acrescenta (e -> E, E2)',
    t[1] && J(t[1].removidas) === J(['e']) && J(t[1].adicionadas) === J(['E', 'E2']), J(t[1]))

  const soPrimeiro = P.combinar(antes, t, [t[0].id])
  checar('⛔ aceitar SO o primeiro trecho grava so ele', soPrimeiro === 'a\nB\nc\nd\ne\n', J(soPrimeiro))
  const soSegundo = P.combinar(antes, t, [t[1].id])
  checar('aceitar so o segundo grava so ele', soSegundo === 'a\nb\nc\nd\nE\nE2\n', J(soSegundo))
  checar('⛔ rejeitar tudo devolve o arquivo IDENTICO (criterio 8, na forma pura)', P.combinar(antes, t, []) === antes)
  checar('aceitar tudo da o depois', P.combinar(antes, t, t.map(x => x.id)) === depois)

  checar('classificar: tudo', P.classificar(antes, depois, depois) === 'tudo')
  checar('classificar: nada', P.classificar(antes, depois, antes) === 'nada')
  checar('classificar: parcial', P.classificar(antes, depois, soPrimeiro) === 'parcial')
  checar('classificar: CRLF no final nao muda a classe', P.classificar(antes, depois, depois.replace(/\n/g, '\r\n')) === 'tudo')
  checar('classificar: arquivo novo rejeitado e nada', P.classificar(null, 'x\n', '') === 'nada')

  const ins = P.calcularTrechos('a\nc\n', 'a\nb\nc\n')
  checar('trechos: insercao pura', ins.length === 1 && ins[0].removidas.length === 0 && J(ins[0].adicionadas) === J(['b']), J(ins))
  const rem = P.calcularTrechos('a\nb\nc\n', 'a\nc\n')
  checar('trechos: remocao pura', rem.length === 1 && J(rem[0].removidas) === J(['b']) && rem[0].adicionadas.length === 0, J(rem))
  checar('CONTROLE: sem mudanca, nenhum trecho', P.calcularTrechos(antes, antes).length === 0)
  const novo = P.calcularTrechos('', 'x\ny\n')
  checar('arquivo novo: um trecho, e rejeitar devolve vazio', novo.length === 1 && P.combinar('', novo, []) === '', J(novo))
}

// ── arquivo grande: o teto do miolo ──────────────────────────────────────────
{
  const n = 2100
  const antes = Array.from({ length: n }, (_, i) => 'a' + i).join('\n')
  const depois = Array.from({ length: n }, (_, i) => 'b' + i).join('\n')
  const t0 = Date.now()
  const t = P.calcularTrechos(antes, depois)
  const ms = Date.now() - t0
  checar('grande: acima do teto vira UM trecho (e nao estoura memoria)', t.length === 1, `${t.length} trecho(s), ${ms} ms`)
  checar('grande: aceitar tudo e rejeitar tudo continuam exatos',
    P.combinar(antes, t, [t[0].id]) === depois && P.combinar(antes, t, []) === antes)
}

// ── codificação e BOM (revisão de suposições da V3) ────────────────────────────
{
  const latin1 = Buffer.from([0x61, 0xe7, 0xe3, 0x6f, 0x0a])   // "ação" em Windows-1252
  checar('codificacao: texto em Windows-1252 NAO e binario', !P.ehBinario(latin1))
  checar('codificacao: Windows-1252 e reconhecido como NAO-UTF-8 (o diff nao o mostra)',
    typeof P.ehUtf8 === 'function' && P.ehUtf8(latin1) === false)
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ação\n', 'utf16le')])
  checar('codificacao: UTF-16 com BOM NAO e binario (tem byte zero, mas e texto)', !P.ehBinario(utf16))
  checar('CONTROLE: UTF-8 com acento e UTF-8', typeof P.ehUtf8 === 'function' && P.ehUtf8(Buffer.from('ação\n', 'utf8')) === true)
  checar('BOM do UTF-8 nao vira trecho fantasma na linha 1', P.calcularTrechos('﻿a\nb\n', 'a\nb\n').length === 0)
}

// ── o que o SDK faz de verdade quando o texto novo é VAZIO, e o arquivo novo (revisão de código da V3) ──
// Lido no código do SDK pela revisão de código e medido numa cópia literal da função: com o texto novo
// vazio, ele apaga a LINHA inteira (o trecho e a quebra que vem depois). O diff tem que mostrar isso.
{
  const r = P.simular('Edit', { old_string: 'b', new_string: '' }, 'a\nb\nc\n')
  checar('Edit com texto novo vazio apaga a linha INTEIRA, como o SDK', r.depois === 'a\nc\n', JSON.stringify(r))
  const t = P.simular('Edit', { old_string: 'x', new_string: '', replace_all: true }, 'x\ny\nx')
  checar('replace_all com texto novo vazio: somem as ocorrencias com quebra depois (como o SDK)', t.depois === 'y\nx', JSON.stringify(t))
  checar('CONTROLE: texto novo nao vazio troca so o trecho', P.simular('Edit', { old_string: 'b', new_string: 'B' }, 'a\nb\nc\n').depois === 'a\nB\nc\n')
  const novo = P.calcularTrechos('', 'a\n\nb')
  checar('arquivo novo e UM trecho so, mesmo com linha em branco no meio', novo.length === 1, JSON.stringify(novo))
  checar('arquivo novo: aceitar da o arquivo inteiro, rejeitar da vazio',
    novo.length === 1 && P.combinar('', novo, [novo[0].id]) === 'a\n\nb' && P.combinar('', novo, []) === '')
}

// ── a mensagem do parcial ────────────────────────────────────────────────────
{
  const m = P.mensagemDoParcial('a.txt', 3, [1], true)
  checar('parcial: a mensagem diz quantos, que ja esta gravado e para nao repetir',
    /1 de 3/.test(m) && /JÁ ESTÃO GRAVADOS/.test(m) && /Não repita/.test(m), m)
  checar('parcial nao conferido: a mensagem NAO afirma que gravou', !/JÁ ESTÃO GRAVADOS/.test(P.mensagemDoParcial('a.txt', 3, [1], false)))
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
