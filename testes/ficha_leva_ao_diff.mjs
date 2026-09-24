// V3 — A FICHA DO CARTÃO LEVA AO DIFF ABERTO, no executável, com o agente de verdade.
//
// A revisão funcional da V3 mediu, 2 de 2, em duas corridas independentes: clicar na ficha
// "arquivo :linha" do cartão abria um SEGUNDO diff da mesma proposta, num grupo de editor novo, em vez
// de trazer o que já estava aberto. O conserto (a aba é reaberta na coluna em que ela já está) tinha
// prova só em dublê — e dublê nenhum sabe o que o `vscode.diff` do núcleo faz com a mesma entrada na
// mesma coluna. Esta é a medição no lugar onde o defeito foi encontrado.
//
// O que se mede, em ordem:
//   1. o diff abre sozinho quando o cartão aparece (1 aba "proposta do agente");
//   2. CLICAR NA FICHA (clique de mouse de verdade) não faz nascer outra — nem outra aba, nem outro
//      grupo de editor;
//   3. CONTROLE: a aba continua lá depois do clique (o clique não fechou nada).
//
// ⚠️ ESTE TESTE GASTA na conta de quem roda (uma mensagem curta e uma edição).
//
// Uso: node testes/ficha_leva_ao_diff.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-ficha-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'alvo.js'), 'function valor() {\n  return 1\n}\n\nmodule.exports = { valor }\n')

let app
try {
  const _electron = await carregarElectron()
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow()
  await esconderJanela(app)

  let frame = null
  for (const fim = Date.now() + 60000; Date.now() < fim && !frame;) {
    for (const f of win.frames()) { try { if (await f.evaluate(() => !!document.getElementById('entrada'))) { frame = f; break } } catch { } }
    if (!frame) await respirar(400)
  }
  if (!frame) throw new Error('a conversa nao abriu')

  const enviar = async texto => {
    for (let i = 0; i < 20; i++) {
      await frame.fill('#entrada', texto)
      await frame.click('#enviar').catch(() => { })
      await respirar(1500)
      if (!await frame.evaluate(() => document.getElementById('entrada').value)) return true
    }
    return false
  }
  // Quantas abas de proposta existem, e em quantos GRUPOS de editor a janela está dividida.
  const contar = () => win.evaluate(() => ({
    abas: [...document.querySelectorAll('.tabs-container .tab .label-name')]
      .map(e => e.textContent).filter(t => /proposta do agente/.test(t)).length,
    grupos: document.querySelectorAll('.editor-group-container').length,
  }))

  await enviar('Na pasta aberta, use a ferramenta Edit no arquivo alvo.js para trocar o "return 1" por "return 42". Nao faca mais nada.')

  // O cartão da proposta, e o diff que abre sozinho com ele.
  let id = null
  for (const fim = Date.now() + 240000; Date.now() < fim && !id;) {
    id = await frame.evaluate(() => {
      const c = [...document.querySelectorAll('.permissao.proposta[data-respondida="nao"]')].pop()
      return c ? c.dataset.id : null
    })
    if (!id) await respirar(700)
  }
  if (!id) throw new Error('o cartao da proposta nao apareceu')
  await respirar(2500)   // deixa o diff abrir

  const antes = await contar()
  checar('o diff da proposta abre sozinho com o cartao (1 aba)', antes.abas === 1, JSON.stringify(antes))

  // ⚠️ CLIQUE DE MOUSE DE VERDADE na ficha — `.click()` no DOM não passa pelo mesmo caminho.
  const ficha = frame.locator(`.permissao[data-id="${id}"] .ficha`).first()
  const tinhaFicha = await ficha.count()
  await ficha.click().catch(() => { })
  await respirar(3000)
  const depois = await contar()

  checar('⛔ a ficha do cartao NAO abre um segundo diff da mesma proposta',
    tinhaFicha > 0 && depois.abas === antes.abas,
    JSON.stringify({ tinhaFicha, antes, depois }))
  checar('⛔ a ficha do cartao NAO abre um grupo de editor novo',
    tinhaFicha > 0 && depois.grupos === antes.grupos, JSON.stringify({ antes, depois }))
  checar('CONTROLE: a aba do diff continua aberta depois do clique', depois.abas >= 1, JSON.stringify(depois))

  // Fecha limpo: rejeita tudo pelo cartão (nada é gravado).
  await frame.evaluate(x => {
    const c = document.querySelector(`.permissao[data-id="${CSS.escape(x)}"]`)
    const b = c && [...c.querySelectorAll('button')].find(e => e.textContent.trim() === 'Rejeitar tudo')
    if (b) b.click()
  }, id)
  await respirar(2500)
  const disco = fs.readFileSync(path.join(projeto, 'alvo.js'), 'utf8')
  checar('CONTROLE: rejeitado, o arquivo ficou como estava', /return 1\b/.test(disco) && !/42/.test(disco), disco.slice(0, 80))
} catch (e) {
  checar('o teste rodou ate o fim', false, String((e && e.stack) || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
