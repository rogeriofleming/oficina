// O USO DO PLANO (V20) — o motor da faixa de medidores, em node puro.
//
// O que precisa ser verdade:
//   1. lê o registro REAL desta máquina (`~/.claude.json`) e tira dele as duas janelas;
//   2. aceita o arquivo inteiro e também só o bloco de dentro;
//   3. campo ausente NÃO vira 0 — zero é uma afirmação, e seria falsa;
//   4. o terceiro limite (`nimbus_quill`, o "Weekly Fable") fica de fora — ordem dele;
//   5. nada que identifique a conta sai do motor;
//   6. PERDER NUNCA: leitura nova sem número não apaga o número que já estava;
//   7. resetou → marca 0, porque 0 é um número e substitui;
//   8. porcentagem fora de faixa é presa entre 0 e 100;
//   9. antes da primeira leitura não há medidor nenhum;
//  10. o motor NÃO tem idade, nem descarte por tempo — ordem dele ("perder nunca").
//
// Uso:  node testes/uso_do_plano.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const U = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'usoDoPlano.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const registro = (cinco, sete, extra = {}) => ({
  cachedUsageUtilization: {
    fetchedAtMs: 1789996312070,
    accountUuid: 'nao-pode-vazar-0000-0000',
    utilization: {
      five_hour: cinco === null ? null : { utilization: cinco, resets_at: '2026-09-21T17:40:00.027877+00:00' },
      seven_day: sete === null ? null : { utilization: sete, resets_at: '2026-09-24T13:00:00.027892+00:00' },
      nimbus_quill: { utilization: 17, resets_at: null },
      ...extra,
    },
  },
})

// ── 1. o registro REAL desta máquina ──
{
  const p = path.join(os.homedir(), '.claude.json')
  if (fs.existsSync(p)) {
    let cru = null
    try { cru = JSON.parse(fs.readFileSync(p, 'utf8')) } catch { /* meio escrito: não é falha do motor */ }
    const e = cru ? U.doRegistro(cru) : null
    checar('1. o registro real desta máquina entrega as duas janelas',
      !!e && e.janelas.length === 2 && e.janelas.every(j => j.pct === null || (j.pct >= 0 && j.pct <= 100)),
      JSON.stringify(e && e.janelas))
    if (e) console.log(`       (medido agora: ${U.medidores(e).map(m => `${m.rotulo} ${m.pct}%`).join(' · ') || 'sem número'})`)
  } else {
    checar('1. o registro real desta máquina entrega as duas janelas', false, 'arquivo não existe nesta máquina')
  }
}

// ── 2. as duas formas de entrada ──
{
  const inteiro = U.doRegistro(registro(3, 75))
  const soBloco = U.doRegistro(registro(3, 75).cachedUsageUtilization)
  checar('2. aceita o arquivo inteiro e só o bloco, com o mesmo resultado',
    JSON.stringify(U.medidores(inteiro)) === JSON.stringify(U.medidores(soBloco)) &&
    JSON.stringify(U.medidores(inteiro)) === JSON.stringify([{ rotulo: '5h', pct: 3 }, { rotulo: '7d', pct: 75 }]),
    JSON.stringify(U.medidores(inteiro)))
}

// ── 3. ausente não é zero ──
{
  const e = U.doRegistro(registro(null, 75))
  checar('3. janela ausente fica sem número, e NÃO vira 0',
    e.janelas[0].pct === null && e.janelas[1].pct === 75, JSON.stringify(e.janelas))
  checar('3b. `null`, texto e NaN não viram número',
    U.porcentagemValida(null) === null && U.porcentagemValida('75') === null && U.porcentagemValida(NaN) === null)
}

// ── 4. o Fable fica de fora ──
{
  const e = U.doRegistro(registro(3, 75))
  const rotulos = U.medidores(e).map(m => m.rotulo)
  // ⚠️ NÃO se prova procurando "17" no JSON: o `resets_at` das 17:40 tem "17" dentro, e a primeira
  // versão desta asserção falhou por isso. O que se prova é o que SAI: duas janelas, e nenhum
  // medidor com a porcentagem do terceiro limite.
  const pcts = U.medidores(e).map(m => m.pct)
  checar('4. o terceiro limite não entra na faixa (ordem dele: "fable nao entra")',
    rotulos.length === 2 && e.janelas.length === 2 && !pcts.includes(17),
    JSON.stringify({ rotulos, pcts }))
  checar('4b. e está nomeado no motor, para não voltar por engano',
    U.FORA_POR_ORDEM_DELE.includes('nimbus_quill'))
}

// ── 5. nada de conta ──
{
  const e = U.doRegistro(registro(3, 75))
  const texto = JSON.stringify(e) + JSON.stringify(U.medidores(e))
  checar('5. nada que identifique a conta sai do motor',
    !/accountUuid|nao-pode-vazar/i.test(texto), texto.slice(0, 120))
}

// ── 6. PERDER NUNCA ──
{
  let estado = U.juntar(U.estadoInicial(), U.doRegistro(registro(3, 75)))
  checar('6a. depois da primeira leitura, os dois números estão lá',
    JSON.stringify(U.medidores(estado)) === JSON.stringify([{ rotulo: '5h', pct: 3 }, { rotulo: '7d', pct: 75 }]))

  // uma leitura torta: o arquivo estava sendo reescrito e a janela de 5 h veio sem número
  estado = U.juntar(estado, U.doRegistro(registro(null, 76)))
  checar('6b. leitura sem número NÃO apaga o número que já estava',
    JSON.stringify(U.medidores(estado)) === JSON.stringify([{ rotulo: '5h', pct: 3 }, { rotulo: '7d', pct: 76 }]),
    JSON.stringify(U.medidores(estado)))

  // um registro ilegível inteiro
  estado = U.juntar(estado, U.doRegistro(null))
  estado = U.juntar(estado, U.doRegistro({ lixo: true }))
  checar('6c. registro ilegível não apaga nada',
    JSON.stringify(U.medidores(estado)) === JSON.stringify([{ rotulo: '5h', pct: 3 }, { rotulo: '7d', pct: 76 }]),
    JSON.stringify(U.medidores(estado)))
}

// ── 7. resetou marca 0 ──
{
  let estado = U.juntar(U.estadoInicial(), U.doRegistro(registro(70, 75)))
  estado = U.juntar(estado, U.doRegistro(registro(0, 75)))
  checar('7. resetou → marca 0% (0 é número, e substitui)',
    U.medidores(estado)[0].pct === 0, JSON.stringify(U.medidores(estado)))
}

// ── 8. faixa presa ──
checar('8. porcentagem fora de faixa é presa entre 0 e 100',
  U.porcentagemValida(-5) === 0 && U.porcentagemValida(140) === 100 && U.porcentagemValida(43) === 43)

// ── 9. antes da primeira leitura ──
{
  const e = U.estadoInicial()
  checar('9. antes da primeira leitura não há medidor nenhum',
    U.medidores(e).length === 0 && U.temNumero(e) === false)
}

// ── 10. sem idade, sem descarte ──
{
  const semIdade = !('idadeMs' in U) && !('IDADE_VELHA_MS' in U) && !('IDADE_DESCARTAR_MS' in U)
  const e = U.juntar(U.estadoInicial(), U.doRegistro(registro(43, 75), 1))
  const medidoresDepois = U.medidores(e)   // "muito tempo depois": o motor não sabe que horas são
  checar('10. o motor não tem idade nem descarte por tempo (ordem dele: "perder nunca")',
    semIdade && medidoresDepois.length === 2 && medidoresDepois[0].pct === 43,
    JSON.stringify(medidoresDepois))
}

const falhas = resultados.filter(r => !r.ok)
console.log(`
  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
// ⚠️ O PLACAR EM JSON, na última linha: é por ele que a bateria (`rapidos.mjs`) e a regressão leem
// o resultado e conferem o piso. Sem esta linha, a suíte roda, passa, e a bateria a marca como
// "sem placar" — ou seja, não protege nada. Foi o que aconteceu com as seis suítes da V20.
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
