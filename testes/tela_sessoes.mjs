// A LISTA DAS CONVERSAS, DENTRO DO EDITOR DE VERDADE.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE, se `testes/sessoes.mjs` já prova o motor inteiro.
//
// Porque o defeito mais caro desta versão só aparece AQUI. Medido em 12/09/2026:
// `listSessions` devolve ZERO, sem erro nenhum, quando o caminho da pasta vem com barra
// invertida — e barra invertida é exatamente o que o editor entrega em `uri.fsPath` no
// Windows. No motor, o teste passa o caminho que quiser; só dentro do editor é que o
// caminho vem do editor.
//
// Ou seja: se alguém tirar a normalização, `sessoes.mjs` continua verde (ele testa a
// função) e ESTE arquivo fica vermelho, porque a lista abre vazia na cara de quem usa.
// É a diferença entre testar a peça e testar o produto.
//
// ⚠️ A pasta aberta é o PRÓPRIO REPOSITÓRIO, e não uma pasta temporária, por um motivo
// simples: uma pasta recém-criada não tem conversa nenhuma, e uma lista vazia não
// distingue "não há conversas" de "a lista quebrou". Aqui há conversas de verdade.
//
// Uso:  node testes/tela_sessoes.mjs [caminho do executavel]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, abrirPaleta, extensaoForaDeSincronia } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const RAIZ = process.env.OFICINA_BUILD || path.join(os.tmpdir(), 'oficina')
const requerer = createRequire(import.meta.url)
const { Sessoes } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'sessoes.js'))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
// ⚠️ O caminho é o primeiro argumento que NÃO é uma opção. Passar `--foto` sozinho fazia
// `acharExe` devolver a própria palavra "--foto" como se fosse o executável, e o teste
// morria com "nao achei o executavel" — parecendo falta de build, sendo erro de leitura.
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
}

// Quantas conversas esta pasta tem, segundo o motor — o número que a tela TEM que mostrar.
// ⚠️ Sem esta linha o teste não teria com o que comparar, e "apareceu alguma coisa" viraria
// critério. Se aqui já der zero, o teste avisa em vez de reprovar a tela por engano.
let esperadas = 0
try {
  esperadas = (await new Sessoes({ cwd: REPO }).listar()).length
} catch (e) { console.log('  info  o motor nao listou: ' + e.message) }
console.log(`  info  o motor vê ${esperadas} conversa(s) nesta pasta`)

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sessoes-'))
let app
try {
  // ⚠️ SEMPRE por `abrirOficina` (ver o comentário em `boas_vindas.mjs`).
  app = await abrirOficina(_electron, { exe, projeto: REPO, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(12000)

  if (!await abrirPaleta(win, respirar)) throw new Error('a paleta de comandos nao abriu em 8 tentativas')
  await win.keyboard.type('>Conversas desta pasta')
  await respirar(1800)
  // ⚠️ CLICAR no item, não apertar Enter às cegas: a paleta intercala uma entrada
  // "Ask in Chat: <texto>" e a ordem dela depende do que está instalado.
  const item = win.locator('.quick-input-list .monaco-list-row', { hasText: 'Conversas desta pasta' })
    .filter({ hasNotText: 'Ask in Chat' }).first()
  checar('o comando "Conversas desta pasta" existe na paleta', await item.count() > 0)
  if (await item.count()) await item.click()
  else await win.keyboard.press('Enter')

  // A lista lê o disco: dar tempo de a leitura terminar e as primeiras medidas chegarem.
  await respirar(9000)

  const tela = await win.evaluate(() => {
    const w = document.querySelector('.quick-input-widget')
    if (!w || w.style.display === 'none') return { aberta: false, linhas: [], titulo: '' }
    const linhas = [...w.querySelectorAll('.quick-input-list .monaco-list-row')].map(l => ({
      rotulo: (l.querySelector('.label-name') || {}).textContent || '',
      detalhe: (l.querySelector('.quick-input-list-label-meta') || {}).textContent || '',
      descricao: (l.querySelector('.label-description') || {}).textContent || '',
    }))
    return {
      aberta: true,
      titulo: (w.querySelector('.quick-input-title') || {}).textContent || '',
      dica: (w.querySelector('.quick-input-box input') || {}).placeholder || '',
      linhas,
    }
  })

  checar('a lista abriu', tela.aberta === true)
  checar('a lista tem o título das conversas', /Conversas desta pasta/i.test(tela.titulo || ''), tela.titulo)

  // ⚠️ O CRITÉRIO QUE PEGA A BARRA INVERTIDA. O editor entrega o caminho no formato do
  // Windows; se a normalização sumir, aqui vem "Nenhuma conversa nesta pasta ainda".
  const vazia = tela.linhas.length === 1 && /Nenhuma conversa/i.test(tela.linhas[0].rotulo)
  if (esperadas > 0) {
    checar('a lista mostra as conversas da pasta (e não uma lista vazia)',
      !vazia && tela.linhas.length > 0,
      vazia ? 'veio "Nenhuma conversa" com ' + esperadas + ' no disco'
        : (tela.linhas.length ? tela.linhas.length + ' linha(s)' : 'ZERO linhas com ' + esperadas + ' no disco'))
  } else {
    checar('sem conversas, a lista diz isso em vez de ficar em branco', vazia,
      JSON.stringify((tela.linhas[0] || {}).rotulo || ''))
  }

  if (esperadas > 0 && !vazia && tela.linhas.length > 0) {
    // ⚠️ TODO CRITÉRIO DAQUI PARA BAIXO EXIGE `tela.linhas.length > 0`, e a razão é um erro
    // desta mesma rodada: com a lista fechada (zero linhas), três critérios ficaram VERDES —
    // "cada conversa mostra quando foi (0 de 0)", "o custo é estimativa (todos com aprox.)" e
    // "nenhuma presa em medindo… (0 de 5)". Todo `todas as N têm X` é verdade quando N é zero.
    // Verde por vacuidade é pior que vermelho: ele afirma que mediu.
    // Cada linha diz QUANDO foi. É o dado que a pessoa usa para reconhecer a conversa.
    const comData = tela.linhas.filter(l => /hoje|ontem|há \d+ dias|\d{2}\/\d{2}\/\d{4}/i.test(l.detalhe))
    checar('cada conversa mostra quando foi', comData.length > 0 && comData.length === tela.linhas.length,
      `${comData.length} de ${tela.linhas.length}`)

    // MODELO E CUSTO — o pedido explícito desta versão. Eles chegam depois da lista,
    // porque custam a leitura da conversa; o critério é que CHEGUEM.
    const comModelo = tela.linhas.filter(l => /Opus|Sonnet|Haiku|Fable|Mythos/i.test(l.detalhe))
    checar('a conversa mostra o MODELO', comModelo.length > 0,
      comModelo.length ? comModelo[0].detalhe : 'nenhuma linha trouxe modelo: ' + JSON.stringify((tela.linhas[0] || {}).detalhe))

    const comCusto = tela.linhas.filter(l => /US\$|custo não sei/i.test(l.detalhe))
    checar('a conversa mostra o CUSTO', comCusto.length > 0,
      comCusto.length ? comCusto[0].detalhe : 'nenhuma linha trouxe custo')

    // ⚠️ E o custo NUNCA é apresentado como valor fechado.
    const semAviso = comCusto.filter(l => /US\$/.test(l.detalhe) && !/aprox\./i.test(l.detalhe))
    // Só vale como critério se houver custo na tela — senão está medindo o vazio.
    checar('o custo é apresentado como ESTIMATIVA, nunca como fatura',
      comCusto.length > 0 && semAviso.length === 0,
      semAviso.length ? semAviso[0].detalhe : (comCusto.length ? 'todos com "aprox."' : 'nenhum custo na tela para conferir'))

    const comTokens = tela.linhas.filter(l => /tokens/i.test(l.detalhe))
    checar('a conversa mostra o tamanho em tokens', comTokens.length > 0,
      (comTokens[0] || {}).detalhe || '')

    // Nenhuma linha pode ficar presa em "medindo…" depois de a lista abrir — as primeiras,
    // ao menos, têm que ter chegado.
    const primeiras = tela.linhas.slice(0, 5)
    const medindo = primeiras.filter(l => /medindo…/.test(l.detalhe))
    checar('as primeiras conversas não ficam presas em "medindo…"',
      primeiras.length > 0 && medindo.length === 0,
      `${medindo.length} de ${primeiras.length} ainda medindo`)
  }

  // ── O CAMINHO "SOB DEMANDA": a conversa ALÉM do lote inicial também ganha modelo e custo ──
  //
  // ⚠️ Este critério nasceu de uma revisão independente (12/09/2026) que apontou o buraco: o
  // produto mede as 20 primeiras conversas ao abrir e as outras "ao passar por cima"
  // (`onDidChangeActive`) — mas a pasta dos testes tinha 18 conversas, menos que o lote inicial.
  // O caminho sob demanda estava escrito e NUNCA tinha rodado, nem por acidente.
  //
  // Ele só mede de verdade quando há mais conversas que o lote; abaixo disso o critério DIZ que
  // não mediu, em vez de passar em silêncio — que era o defeito original.
  const LOTE_INICIAL = 20
  if (esperadas > LOTE_INICIAL) {
    // ⚠️ QUAL LINHA ESTAVA EM FOCO ANTES — sem isto, o critério abaixo passaria mesmo se o `End`
    // não tivesse movido nada: ele leria a MESMA primeira linha, que já vem medida do lote
    // inicial, e daria verde sem ter exercitado o caminho sob demanda coisa nenhuma.
    // (Foi o que quase aconteceu: na primeira corrida o detalhe da "última" saiu idêntico ao da
    // primeira, e só uma conversa de teste repetida separava isso de um falso verde.)
    //
    // ⚠️ E a comparação é pela POSIÇÃO na lista, não pelo texto do rótulo. Duas razões, as duas
    // vistas nesta rodada: as conversas de teste criadas pelas corridas contra a API têm TÍTULOS
    // IDÊNTICOS (é sempre a mesma pergunta), e o rótulo ainda pode ser lido truncado quando a
    // linha não está totalmente desenhada. Rótulo não identifica linha; `aria-posinset`, sim.
    const posicao = () => win.evaluate(() => {
      const f = document.querySelector('.quick-input-widget .quick-input-list .monaco-list-row.focused')
      if (!f) return null
      const p = f.getAttribute('aria-posinset')
      return {
        indice: p === null ? null : Number(p),
        rotulo: (f.querySelector('.label-name') || {}).textContent || '',
        detalhe: (f.querySelector('.quick-input-list-label-meta') || {}).textContent || '',
      }
    })
    const antes = await posicao()

    // ⚠️ SETA PARA BAIXO, uma a uma, e NÃO `End`.
    //
    // Medido nesta rodada: `End` não move nada aqui (posição 1 → 1) — dentro de um seletor, essa
    // tecla é do campo de texto, não da lista. E o critério ANTERIOR, sem o controle de posição,
    // dava VERDE assim mesmo: lia a primeira linha (que já vem medida do lote inicial) e afirmava
    // ter medido a conversa além do lote. Foi o controle que pegou.
    //
    // Descer item a item também é mais fiel ao que a pessoa faz — e é literalmente o gesto que o
    // produto chama de "ao passar por cima".
    /*
      ⚠️ A LISTA DÁ A VOLTA — e foi isto que me enganou três vezes seguidas.

      Mandando um número fixo de setas MAIOR que o número de conversas, o foco passa do fim,
      volta ao começo e para perto do topo. Com 22 conversas: 24 setas param na posição 3,
      25 na 4, 23 na 2 — e eu li isso como "as teclas estão se perdendo". Cheguei a alterar o
      produto por causa dessa leitura (um agrupamento de redesenhos, depois desfeito), e a
      escrever num comentário, como defeito medido, o que era erro do meu instrumento.
      A aritmética fecha exata nas três corridas: `((1 + setas - 1) % 22) + 1` dá 3, 4 e 2.

      A sonda que apertava UMA seta e lia a posição mostrou o que sempre foi verdade: cada tecla
      anda exatamente uma linha (1 → 2 → 3 → 4 → 5 → 6 → 7).

      Por isso agora o teste NÃO conta teclas: ele desce OLHANDO a posição e para quando passa do
      lote. Instrumento que não olha o que está fazendo é instrumento que inventa achado.
    */
    await respirar(12000)
    const caixa = win.locator('.quick-input-widget .quick-input-box input').first()
    await caixa.focus()
    for (let i = 0; i < esperadas + 5; i++) {
      const onde = await posicao()
      if (onde && onde.indice !== null && onde.indice > LOTE_INICIAL) break
      await win.keyboard.press('ArrowDown')
      await respirar(120)
    }
    // Uma folga para a medida da conversa recém-focada chegar.
    await respirar(6000)
    const ultima = await posicao()
    // A posição tem que ter andado, e ter passado do lote inicial — senão o critério seguinte
    // estaria medindo uma conversa que já veio medida da abertura.
    const andou = !!antes && !!ultima && antes.indice !== null && ultima.indice !== null &&
      ultima.indice !== antes.indice
    const passouDoLote = !!ultima && ultima.indice !== null && ultima.indice > LOTE_INICIAL
    checar('a navegação levou o foco a uma conversa ALÉM do lote inicial (senão o critério abaixo é vazio)',
      andou && passouDoLote,
      `posição ${antes && antes.indice} → ${ultima && ultima.indice} (lote = ${LOTE_INICIAL}, ${esperadas} conversas)`)
    checar('a conversa ALÉM do lote inicial é medida ao passar por cima (modelo e custo chegam)',
      andou && passouDoLote &&
      /Opus|Sonnet|Haiku|Fable|Mythos/i.test(ultima.detalhe) && !/medindo…/.test(ultima.detalhe),
      ultima ? ultima.detalhe : 'não achei a linha em foco depois do End')
  } else {
    checar('havia conversas além do lote inicial para medir sob demanda', false,
      `só ${esperadas} conversa(s) nesta pasta, e o lote inicial é ${LOTE_INICIAL} — ` +
      'este critério NÃO mediu o caminho sob demanda')
  }

  if (process.argv.includes('--foto')) {
    try { fs.mkdirSync(path.join(RAIZ, 'log'), { recursive: true }) } catch { }
    const destino = path.join(RAIZ, 'log', `tela_sessoes_${Date.now()}.png`)
    await win.screenshot({ path: destino, animations: 'disabled' })
    console.log('foto: ' + destino)
  }
} catch (e) {
  checar('execucao sem excecao', false, String(e && e.message || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const passou = res.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: res.length, falhas: res.filter(r => !r.ok).map(r => r.criterio) }))
process.exit(passou ? 0 : 1)
