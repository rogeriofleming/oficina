// O NOME DA CONVERSA (V20, t196) — em node puro, com arquivos de verdade no disco.
//
// O que precisa ser verdade:
//   1. o nome sai da linha `ai-title` do transcrito;
//   2. renomear ACRESCENTA outra linha — vale a ÚLTIMA, não a primeira;
//   3. conversa sem nome devolve `null` (e quem desenha mostra só os números);
//   4. a leitura é pela CAUDA: um arquivo grande não é lido inteiro quando o nome está no fim;
//   5. quando o nome está no COMEÇO de um arquivo grande, a varredura completa acha — uma vez só;
//   6. linha cortada pela borda da cauda não quebra nada;
//   7. arquivo que não existe, ilegível ou vazio devolve `null` sem lançar;
//   8. nome em branco não conta como nome;
//   9. no arquivo REAL desta máquina, lê o nome que está lá.
//
// Uso:  node testes/titulo_da_conversa.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const T = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'tituloDaConversa.js'))
const TOK = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'tokens.js'))

const resultados = []
/**
 * Critério PULADO não é critério passado — e o placar tem que dizer isso.
 *
 * ⚠️ APANHADO NUMA CONFERÊNCIA INDEPENDENTE (21/09/2026): havia `checar(..., true, 'não
 * exercitado')` aqui, ou seja, um OK escrito à mão para um caso que ninguém mediu. Some no meio
 * de uma lista de verdes e some do placar: a suíte diz "todos passaram" sobre algo que não rodou.
 * O padrão certo já existia no projeto (`temas.mjs`), e é este.
 */
const pulados = []
const pular = (criterio, porque) => {
  pulados.push({ criterio, porque })
  console.log(`  --    ${criterio}: PULADO (${porque}) — nao e um OK`)
}

function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const titulo = (nome, id = 'abc') => JSON.stringify({ type: 'ai-title', aiTitle: nome, sessionId: id })
const outraLinha = i => JSON.stringify({ type: 'user', uuid: 'u' + i, message: { role: 'user', content: 'x'.repeat(200) } })

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-titulo-'))
function escrever(nome, linhas) {
  const p = path.join(pasta, nome)
  fs.writeFileSync(p, linhas.join('\n') + '\n', 'utf8')
  return p
}

// ── 1, 2 ──
{
  const p = escrever('a.jsonl', [outraLinha(1), titulo('Primeiro'), outraLinha(2), titulo('Depois de renomear'), outraLinha(3)])
  checar('1+2. lê o nome do transcrito, e vale a ÚLTIMA linha `ai-title` (renomear acrescenta)',
    T.doTranscrito(p) === 'Depois de renomear', String(T.doTranscrito(p)))
}

// ── 3, 8 ──
{
  const semNome = escrever('b.jsonl', [outraLinha(1), outraLinha(2)])
  checar('3. conversa sem nome devolve null', T.doTranscrito(semNome) === null, String(T.doTranscrito(semNome)))
  const emBranco = escrever('c.jsonl', [titulo('   ')])
  checar('8. nome em branco não conta como nome', T.doTranscrito(emBranco) === null, String(T.doTranscrito(emBranco)))
}

// ── 4. cauda: arquivo grande com o nome no FIM não é lido inteiro ──
{
  const grande = []
  for (let i = 0; i < 6000; i++) grande.push(outraLinha(i))   // ~1,5 MB
  grande.push(titulo('No fim do arquivo'))
  const p = escrever('d.jsonl', grande)
  const tamanho = fs.statSync(p).size
  let lidoInteiro = false
  const achado = T.doTranscrito(p, {
    lerCauda: T.lerCaudaDoDisco,
    lerTudo: (c) => { lidoInteiro = true; return T.lerTudoDoDisco(c) },
  })
  checar('4. nome no fim: acha pela cauda, sem ler o arquivo inteiro',
    achado === 'No fim do arquivo' && lidoInteiro === false,
    `achado=${achado} | leu tudo=${lidoInteiro} | arquivo=${(tamanho / 1e6).toFixed(1)} MB`)
  checar('4b. e a cauda lida é menor que o arquivo',
    T.lerCaudaDoDisco(p).length < tamanho && T.CAUDA_BYTES < tamanho,
    `cauda=${T.lerCaudaDoDisco(p).length} arquivo=${tamanho}`)
}

// ── 5. nome no COMEÇO de arquivo grande: varredura completa, uma vez só ──
{
  const grande = [titulo('Lá no começo')]
  for (let i = 0; i < 6000; i++) grande.push(outraLinha(i))
  const p = escrever('e.jsonl', grande)
  T.limparCache()
  let vezes = 0
  const ler = (c) => { vezes++; return T.lerTudoDoDisco(c) }
  const a = T.doTranscrito(p, { lerCauda: T.lerCaudaDoDisco, lerTudo: ler })
  const b = T.doTranscrito(p, { lerCauda: T.lerCaudaDoDisco, lerTudo: ler })
  checar('5. nome no começo: a varredura completa acha — e roda UMA vez só (cache)',
    a === 'Lá no começo' && b === 'Lá no começo' && vezes === 1, `achado=${a}/${b} | varreduras=${vezes}`)
}

// ── 6. linha cortada pela borda ──
{
  const pedacoCortado = '{"type":"user","message":"aaa' + '\n' + titulo('Depois do corte')
  checar('6. linha cortada pela borda da cauda não quebra: lê o que der',
    T.doTexto(pedacoCortado) === 'Depois do corte', String(T.doTexto(pedacoCortado)))
  checar('6b. e um pedaço só com lixo devolve null',
    T.doTexto('{"type":"ai-ti') === null && T.doTexto('') === null && T.doTexto(null) === null)
}

// ── 7. o que não pode lançar ──
{
  checar('7. arquivo inexistente, caminho vazio e pasta devolvem null sem lançar',
    T.doTranscrito(path.join(pasta, 'nao-existe.jsonl')) === null &&
    T.doTranscrito('') === null && T.doTranscrito(null) === null &&
    T.doTranscrito(pasta) === null)
}

// ── 9. o arquivo REAL desta máquina ──
{
  const raiz = TOK.diretorioDeProjetos()
  let alvo = null
  try {
    for (const d of fs.readdirSync(raiz)) {
      const dir = path.join(raiz, d)
      if (!fs.statSync(dir).isDirectory()) continue
      for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonl'))) {
        const p = path.join(dir, f)
        if (T.doTranscrito(p)) { alvo = p; break }
      }
      if (alvo) break
    }
  } catch { /* sem conversas nesta máquina */ }
  if (alvo) {
    const nome = T.doTranscrito(alvo)
    console.log(`       (lido de uma conversa real: "${nome}")`)
    checar('9. numa conversa real desta máquina, lê o nome que está lá',
      typeof nome === 'string' && nome.length > 0, String(nome))
  } else {
    pular('9. numa conversa real desta máquina, lê o nome que está lá',
      'nenhuma conversa com nome escolhido nesta máquina')
  }
}

fs.rmSync(pasta, { recursive: true, force: true })

const falhas = resultados.filter(r => !r.ok)
console.log(`\n  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome), pulados }))
if (falhas.length) process.exit(1)
