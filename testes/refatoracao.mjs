// V3 — A REFATORAÇÃO REAL DE 3 ARQUIVOS, no executável, com o agente de verdade.
//
// O plano pede que "o próprio teste faça uma refatoração real de 3 arquivos e confira o resultado"
// (o gate que dependia de alguém aprovar virou teste). Duas metades, na mesma conversa:
//
//   1. CRITÉRIO 8 — o agente propõe renomear uma função nos 3 arquivos; tudo o que aparece é
//      REJEITADO. O hash dos 3 arquivos depois é o de antes, e a proposta apareceu no editor.
//   2. A REFATORAÇÃO — o mesmo pedido, agora ACEITO (pelo botão da barra de abas do diff quando ele
//      está à vista; pelo cartão, nos outros). Os 3 arquivos ficam exatamente com a troca e nada mais.
//      E um Ctrl+Z no primeiro arquivo desfaz a mudança do agente numa operação.
//
// ⚠️ ESTE TESTE GASTA na conta de quem roda (duas mensagens e as edições) — como o critério 7.
//
// Uso: node testes/refatoracao.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, extensaoForaDeSincronia } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const exe = acharExe(process.argv[2])
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 240) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
  if (fora.length) {
    console.log('\n' + JSON.stringify({ passou: false, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
    process.exit(1)
  }
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-refatoracao-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
const ARQUIVOS = {
  'a.js': 'function somar(x, y) {\n  return x + y\n}\n\nmodule.exports = { somar }\n',
  'b.js': "const { somar } = require('./a')\n\nconsole.log(somar(1, 2))\n",
  'c.js': "const { somar } = require('./a')\n\nmodule.exports = n => somar(n, n)\n",
}
for (const [nome, texto] of Object.entries(ARQUIVOS)) fs.writeFileSync(path.join(projeto, nome), texto)
const hash = nome => crypto.createHash('sha256').update(fs.readFileSync(path.join(projeto, nome))).digest('hex')
const hashesAntes = Object.fromEntries(Object.keys(ARQUIVOS).map(n => [n, hash(n)]))

let app
try {
  const _electron = await carregarElectron()
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow()
  await esconderJanela(app)

  // O frame da conversa.
  let frame = null
  for (const fim = Date.now() + 60000; Date.now() < fim && !frame;) {
    for (const f of win.frames()) { try { if (await f.evaluate(() => !!document.getElementById('entrada'))) { frame = f; break } } catch { } }
    if (!frame) await respirar(400)
  }
  if (!frame) throw new Error('a conversa nao abriu')
  const estado = () => frame.evaluate(() => (document.getElementById('ponto') || {}).dataset?.estado || '')
  const enviar = async texto => {
    for (let i = 0; i < 20; i++) {
      await frame.fill('#entrada', texto)
      await frame.click('#enviar').catch(() => { })
      await respirar(1500)
      if (!await frame.evaluate(() => document.getElementById('entrada').value)) return true
    }
    return false
  }
  const abasDeProposta = () => win.evaluate(() =>
    [...document.querySelectorAll('.tabs-container .tab .label-name')].map(e => e.textContent).filter(t => /proposta do agente/.test(t)).length)

  /**
   * Responde a toda proposta que aparecer até o agente parar. `decisao` é 'tudo' ou 'nada'.
   * Na aceitação, prefere o botão da BARRA DE ABAS do diff (o controle do desenho); sem ele à vista,
   * o do cartão. Devolve o que foi usado, para o laudo.
   */
  async function responderAteParar(decisao, tetoMs) {
    const usados = []
    let viuAba = 0
    const fim = Date.now() + tetoMs
    await respirar(2000)
    while (Date.now() < fim) {
      const pendente = await frame.evaluate(() => {
        const c = [...document.querySelectorAll('.permissao.proposta[data-respondida="nao"]')].pop()
        return c ? c.dataset.id : null
      })
      if (pendente) {
        await respirar(1500)   // deixa o diff abrir
        viuAba = Math.max(viuAba, await abasDeProposta())
        let usou = null
        // ⚠️ ALTERNA DE PROPOSITO: 1o pela barra de abas, 2o pelo CARTAO, 3o pela barra. Ate a revisao
        // final da V3 este laco tentava sempre a barra primeiro, e o caminho usado dependia de o botao estar
        // visivel naquele instante — o criterio do desfazer passava em duas corridas e caia numa terceira,
        // com o MESMO codigo, porque so o caminho misto fechava a aba do primeiro arquivo. Criterio que
        // muda de resposta sem o codigo mudar nao e porta: agora o caminho misto e exercitado SEMPRE.
        const peloCartao = decisao === 'tudo' && usados.length === 1
        if (decisao === 'tudo' && !peloCartao) {
          const botaoDaAba = win.locator('.editor-actions .action-label[aria-label="Aceitar tudo"]').first()
          if (await botaoDaAba.count() && await botaoDaAba.isVisible().catch(() => false)) {
            await botaoDaAba.click().catch(() => { }); usou = 'barra de abas'
          }
        }
        if (!usou) {
          const rotulo = decisao === 'tudo' ? 'Aceitar tudo' : 'Rejeitar tudo'
          await frame.evaluate(({ id, rotulo }) => {
            const c = document.querySelector(`.permissao[data-id="${CSS.escape(id)}"]`)
            const b = c && [...c.querySelectorAll('button')].find(x => x.textContent.trim() === rotulo)
            if (b) b.click()
          }, { id: pendente, rotulo })
          usou = 'cartao'
        }
        usados.push(usou)
        await respirar(2500)
        continue
      }
      if (await estado() === 'ociosa' && usados.length) { await respirar(3000); if (await estado() === 'ociosa') break }
      if (await estado() === 'erro') break
      await respirar(700)
    }
    return { usados, viuAba }
  }

  // ── 1. CRITÉRIO 8: tudo rejeitado ────────────────────────────────────────────
  await enviar('Renomeie a funcao somar para adicionar nos arquivos a.js, b.js e c.js desta pasta, usando a ferramenta Edit em cada um. Nao faca mais nada.')
  const rejeicao = await responderAteParar('nada', 240000)
  const iguais = Object.keys(ARQUIVOS).every(n => hash(n) === hashesAntes[n])
  checar('criterio 8: a proposta apareceu no EDITOR (aba "proposta do agente")', rejeicao.viuAba > 0, JSON.stringify(rejeicao))
  checar('⛔ criterio 8: tudo rejeitado -> o hash dos 3 arquivos e o de antes', rejeicao.usados.length > 0 && iguais,
    JSON.stringify({ decisoes: rejeicao.usados.length, iguais }))

  // ── 2. A REFATORAÇÃO: tudo aceito ────────────────────────────────────────────
  await enviar('Pode fazer agora: renomeie a funcao somar para adicionar nos tres arquivos (a.js, b.js e c.js), com a ferramenta Edit. Nao mude mais nada.')
  const aceite = await responderAteParar('tudo', 300000)
  const esperado = Object.fromEntries(Object.entries(ARQUIVOS).map(([n, t]) => [n, t.replace(/somar/g, 'adicionar')]))
  const lidos = Object.fromEntries(Object.keys(ARQUIVOS).map(n => [n, fs.readFileSync(path.join(projeto, n), 'utf8').replace(/\r\n/g, '\n')]))
  const errados = Object.keys(ARQUIVOS).filter(n => lidos[n] !== esperado[n])
  checar('⛔ refatoracao real: os 3 arquivos ficam EXATAMENTE com a troca, e nada mais', errados.length === 0,
    errados.length ? errados.map(n => `${n}: ${JSON.stringify(lidos[n])}`).join(' | ') : `decisoes: ${aceite.usados.join(', ')}`)
  checar('refatoracao: a aceitacao passou pelo botao da BARRA DE ABAS do diff pelo menos uma vez',
    aceite.usados.includes('barra de abas'), aceite.usados.join(', ') || 'nenhuma')
  // ⚠️ A ANCORA DA ALTERNANCIA. Sem esta linha, uma rodada em que o agente propusesse uma vez so
  // ficaria VERDE sem ter exercitado o caminho pelo cartao — que e exatamente o que derrubava o
  // desfazer. Criterio que pode passar sem tocar no caso que ele existe para cobrir nao e porta.
  checar('⛔ refatoracao: o caminho MISTO foi exercitado (barra de abas E cartao)',
    aceite.usados.includes('barra de abas') && aceite.usados.includes('cartao'),
    aceite.usados.join(', ') || 'nenhuma')

  // ── 3. Desfazer: um Ctrl+Z no a.js devolve o "somar" ─────────────────────────
  const abaA = win.locator('.tabs-container .tab', { hasText: 'a.js' }).filter({ hasNotText: 'proposta' }).first()
  let desfez = null
  if (await abaA.count()) {
    await abaA.click()
    await respirar(800)
    await win.locator('.editor-group-container.active .monaco-editor .view-lines').first().click().catch(() => { })
    await win.keyboard.press('Control+Z')
    await respirar(1200)
    desfez = await win.evaluate(() => {
      const ed = document.querySelector('.editor-group-container.active .monaco-editor .view-lines')
      return ed ? ed.innerText : null
    })
  }
  checar('desfazer: um Ctrl+Z no a.js devolve o "somar" (a mudanca do agente numa operacao)',
    !!desfez && /somar/.test(desfez) && !/adicionar/.test(desfez), desfez ? desfez.slice(0, 120) : 'a aba do a.js nao estava aberta')
} catch (e) {
  checar('o teste rodou ate o fim', false, String((e && e.stack) || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
