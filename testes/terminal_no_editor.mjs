// V4 — O TERMINAL DO AGENTE, no EXECUTÁVEL, com o agente de verdade.
//
// ⚠️ ESTE TESTE GASTA na conta de quem roda (duas mensagens curtas) — como a refatoração da V3 e o
// critério 7. Ele existe porque tudo o que vem antes dele prova uma camada PARECIDA com a que roda:
// `comando.mjs` prova o processo em node puro, `ponte.mjs` prova a costura com um `vscode` de
// mentira. Nenhum dos dois sabe o que o terminal DE VERDADE do editor faz com o que a OFICINA
// escreve nele, nem se o agente de verdade aceita a saída que volta pelo `deny`.
//
// O que ele mede, na camada que a pessoa usa:
//   1. o pedido de comando vira CARTÃO com a linha à vista;
//   2. aprovar abre o terminal do editor, com nome próprio, e o comando roda DE VERDADE (o efeito
//      é conferido no disco, não na tela que o próprio programa desenhou);
//   3. a saída aparece no terminal e o veredito aparece no cartão;
//   4. o histórico da conversa registra o comando;
//   5. ⛔ o agente NÃO repete o comando depois de ouvir a saída pelo `deny` — o risco declarado da
//      arquitetura da V4, medido aqui com o modelo de verdade;
//   6. ⛔ "Parar este comando" mata o processo e NÃO deixa órfão (critério 9 no caminho de verdade).
//
// Uso: node testes/terminal_no_editor.mjs [caminho do exe]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
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

/** Quais destes PIDs ainda existem? Pergunta ao SISTEMA — nunca ao programa que estamos testando. */
const vivos = pids => {
  if (!pids.length) return []
  const filtro = pids.map(p => `ProcessId=${p}`).join(' or ')
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-CimInstance Win32_Process -Filter "${filtro}" | ForEach-Object { $_.ProcessId }`],
      { encoding: 'utf8', windowsHide: true, timeout: 30000 })
      .split(/\r?\n/).map(l => parseInt(l.trim(), 10)).filter(Number.isInteger)
  } catch { return [] }
}
/*
  ⛔ POR QUE NAO SE PROCURA O PROCESSO PELO TEXTO DO COMANDO — a historia inteira, porque ela custou
  duas correcoes e quase passou batido nas duas.

  1ª forma de errar (achada pelo revisor de documentos em 11/09/2026): a consulta procurava
     `CommandLine -like '*marca*'` e ACHAVA A SI MESMA — a marca viaja na linha de comando do
     proprio `powershell.exe` que pergunta. Ela devolvia um PID SEMPRE, o controle positivo ficava
     verde sem o comando existir, e o criterio 9 "matava" o processo da consulta, que morria
     sozinho. O conserto daquele dia excluiu o `Get-CimInstance` do filtro.

  2ª forma, que o conserto acima REVELOU (na regressao inteira de 11/09/2026, 23:19): com a consulta
     honesta, ela passou a devolver ZERO — e a razao e estrutural. A OFICINA lanca o PowerShell com
     `-EncodedCommand <base64>` (decisao 5 da V4, para nenhuma camada comer o escape): o texto do
     comando NAO EXISTE em claro na linha de comando do processo. Nenhuma marca escrita pelo agente
     jamais apareceria ali. Ou seja, este criterio nunca mediu o processo do comando: media o PID da
     propria pergunta. (O criterio 9 na camada do PROCESSO continua medido de verdade, e sempre
     esteve, em `testes/comando.mjs` — o que estava furado era a camada da TELA.)

  A forma que sobra, e que e a mesma das sondas do revisor: o proprio comando GRAVA o seu PID num
  arquivo, e o teste pergunta ao SISTEMA se aquele numero esta vivo. O dado vem do processo de
  verdade, e a confirmacao vem do Windows — em nenhum momento do programa que esta sendo testado.
*/

// ⛔ CONTROLE DO INSTRUMENTO, antes de usa-lo: a consulta tem de APROVAR um processo vivo (este
// mesmo) e REPROVAR um numero que nao existe. Um medidor que so diz "nao achei" passaria despercebido
// como "nada sobrou" — que e exatamente como o criterio 9 ficou verde sem medir nada.
{
  const meu = vivos([process.pid])
  const inventado = vivos([2147480000])
  checar('⛔ CONTROLE: a consulta de processos acha um processo VIVO (este) e nao acha um inexistente',
    meu.includes(process.pid) && inventado.length === 0,
    `vivo devolveu: ${meu.join(',') || 'nada'} · inexistente devolveu: ${inventado.join(',') || 'nada'}`)
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-terminal-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'exemplo.txt'), 'arquivo qualquer\n')

/*
  ⚠️ O TERMINAL DESENHA EM CANVAS, E CANVAS NÃO TEM TEXTO PARA LER.

  Medido em 11/09/2026 (`ciclo_v4/spikes/ler_terminal.mjs`): a primeira versão deste teste leu
  `.xterm-rows` e recebeu string VAZIA nas duas linhas — e a leitura errada era "o terminal não
  apareceu". O diagnóstico mostrou o contrário: o terminal estava lá, com o nome certo no painel, e
  o xterm tinha QUATRO `<canvas>`. O texto simplesmente não existe no DOM.

  `gpuAcceleration: off` põe o xterm no renderizador de DOM, e aí o texto existe. Isto é o
  INSTRUMENTO, e está declarado: o produto de verdade continua desenhando em canvas; o que este
  teste mede é o CONTEÚDO escrito no terminal, não o renderizador. O controle positivo logo abaixo
  (a frase de abertura do terminal) é quem prova que o instrumento enxerga.
*/
fs.mkdirSync(path.join(area, 'dados', 'User'), { recursive: true })
fs.writeFileSync(path.join(area, 'dados', 'User', 'settings.json'),
  JSON.stringify({ 'terminal.integrated.gpuAcceleration': 'off' }, null, 2))

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
  /*
    ⚠️ O ROTEIRO DO AGENTE MUDA A CADA CORRIDA, e a primeira versão deste teste presumia um só.
    Medido em três corridas: na primeira ele escreveu e leu o arquivo com UM comando; na segunda,
    com DOIS (escrever, depois conferir com `Get-Content`); numa terceira, não pediu comando nenhum
    dentro do tempo. O teste reprovava por isso — e o produto estava certo nas três.

    O conserto não é afrouxar o critério: é medir o que a versão promete, e não o caminho que o
    modelo escolheu. "Não repetiu" passou a ser "nenhum cartão traz a MESMA linha de um comando que
    já rodou", que é a coisa que realmente importaria se o `deny` enganasse o agente.
  */
  /** Os cartões de comando da conversa: id, linha e se já foram respondidos. */
  const cartoes = () => frame.evaluate(() => [...document.querySelectorAll('.permissao.comando-cartao')].map(c => ({
    id: c.dataset.id,
    linha: ((c.querySelector('pre.comando') || {}).textContent || '').trim(),
    respondida: c.dataset.respondida === 'sim',
  })))
  /** O primeiro cartão pendente que ainda não foi visto por este teste. */
  const cartaoPendente = async (jaVistos = new Set()) => {
    const lista = await cartoes()
    return lista.find(c => !c.respondida && !jaVistos.has(c.id)) || null
  }
  const esperarCartao = async (tetoMs = 180000, jaVistos = new Set(), casa = () => true) => {
    for (const fim = Date.now() + tetoMs; Date.now() < fim;) {
      const c = await cartaoPendente(jaVistos)
      if (c && casa(c)) return c
      if (!c && await estado() === 'erro') return null
      await respirar(600)
    }
    return null
  }
  const clicarNoCartao = (id, rotulo) => frame.evaluate(({ id, rotulo }) => {
    const c = document.querySelector(`.permissao[data-id="${CSS.escape(id)}"]`)
    const b = c && [...c.querySelectorAll('button')].find(x => x.textContent.trim() === rotulo)
    if (b) b.click()
    return !!b
  }, { id, rotulo })
  /** O que os terminais do editor mostram agora (o xterm de verdade, não a nossa webview). */
  const textoDosTerminais = () => win.evaluate(() =>
    [...document.querySelectorAll('.xterm-rows')].map(e => e.innerText).join('\n'))

  // ── 1. Um comando que MUDA o disco: é a prova de que rodou de verdade ────────
  const alvo = path.join(projeto, 'saida.txt')
  await enviar('Rode UM comando de terminal que escreva a palavra alfa no arquivo saida.txt desta pasta, ' +
    'e depois me diga em uma linha se deu certo. Nao use as ferramentas Write, Edit ou Read — so o terminal.')

  const cartao = await esperarCartao()
  /*
    ⚠️ O DETALHE DA FALHA TEM DE DIZER O QUE HOUVE. Na primeira corrida depois de um conserto, este
    critério caiu com "nenhum cartao apareceu" — e isso não distingue "o agente não pediu comando"
    de "a extensão quebrou" de "deu erro de rede". Sem o estado e a última fala, a única saída seria
    adivinhar (e uma corrida a mais, paga).
  */
  const diagnostico = cartao ? '' : await frame.evaluate(() => JSON.stringify({
    estado: (document.getElementById('ponto') || {}).dataset?.estado,
    cartoesDeQualquerTipo: document.querySelectorAll('.permissao').length,
    erros: [...document.querySelectorAll('.erro')].map(e => e.innerText).slice(0, 2),
    ultimaFala: ([...document.querySelectorAll('.fala.dele')].pop() || {}).innerText || '',
    ferramentas: [...document.querySelectorAll('.ferramenta')].map(e => e.innerText).slice(-4),
  }))
  checar('⛔ V4: o pedido de comando vira CARTAO com a linha do comando a vista',
    !!cartao && cartao.linha.trim().length > 0,
    cartao ? JSON.stringify(cartao.linha.slice(0, 90)) : 'nenhum cartao apareceu — ' + diagnostico)
  if (!cartao) throw new Error('o cartao de comando nao apareceu')

  checar('V4: o cartao de comando NAO oferece "sempre permitir"',
    !await frame.evaluate(id => {
      const c = document.querySelector(`.permissao[data-id="${CSS.escape(id)}"]`)
      return !!c && [...c.querySelectorAll('button')].some(b => /Sempre/.test(b.textContent))
    }, cartao.id))

  await clicarNoCartao(cartao.id, 'Rodar')

  // O fim da execução, pela tela (e o disco confere depois — a tela sozinha não prova nada).
  let fim = null
  for (const ate = Date.now() + 120000; Date.now() < ate;) {
    fim = await frame.evaluate(id => {
      const l = document.querySelector(`.execucao[data-execucao="${CSS.escape(id)}"]`)
      return l && l.dataset.fim ? { fim: l.dataset.fim, texto: l.innerText } : null
    }, cartao.id)
    if (fim) break
    await respirar(500)
  }
  checar('V4: a tela mostra o veredito da execucao no proprio cartao',
    !!fim && fim.fim === 'bem' && /terminou bem/.test(fim.texto), JSON.stringify(fim))

  const escreveu = fs.existsSync(alvo) ? fs.readFileSync(alvo, 'utf8') : null
  checar('⛔ V4: o comando rodou DE VERDADE — o arquivo existe no disco, com o conteudo pedido',
    !!escreveu && /alfa/i.test(escreveu), JSON.stringify(escreveu))

  const terminais = await textoDosTerminais()
  // O nome no painel sai do DOM do editor e não depende de renderizador nenhum: é a prova de que o
  // terminal EXISTE, separada da prova do que está escrito nele.
  const nomeNoPainel = await win.evaluate(() => document.body.innerText.includes('OFICINA — comandos do agente'))
  checar('⛔ V4: o terminal da OFICINA existe no painel do editor, com nome próprio', nomeNoPainel)
  // ⚠️ CONTROLE DO INSTRUMENTO: a frase que o terminal escreve ao abrir. Sem ela, "não achei o
  // comando no terminal" não distingue "o terminal está vazio" de "eu não consigo ler o terminal" —
  // e foi exatamente essa confusão que a primeira corrida deste teste produziu.
  checar('CONTROLE: o instrumento consegue LER o texto do terminal',
    /rodam aqui/.test(terminais), JSON.stringify(terminais.slice(0, 120)))
  checar('⛔ V4: o terminal do editor mostra a linha do comando que rodou',
    terminais.includes('saida.txt'), JSON.stringify(terminais.slice(-200)))
  checar('V4: o terminal mostra o rodape do resultado, em portugues',
    /terminou bem|terminou com erro|parado/.test(terminais), JSON.stringify(terminais.slice(-120)))

  const historico = await frame.evaluate(() => {
    const h = document.getElementById('historico')
    return { escondido: !!h.hidden, conta: (document.getElementById('historico-conta') || {}).textContent || '',
      itens: document.querySelectorAll('.historico-item').length }
  })
  checar('V4: o historico da conversa registra o comando', !historico.escondido && historico.itens === 1,
    JSON.stringify(historico))

  /*
    ⛔ O RISCO DECLARADO DA ARQUITETURA: o agente ouve um `deny` para um comando que DEU CERTO. Ele
    acredita, ou refaz? A resposta ruim é ele propor de novo a MESMA linha — não é ele propor um
    segundo comando diferente (conferir o que escreveu é trabalho legítimo, e ele faz isso).

    Até o agente ficar ocioso, todo cartão que aparecer é aprovado: é assim que o roteiro dele pode
    variar sem o teste reprovar o produto. A pasta é descartável e os comandos são dele mesmo.
  */
  const linhasQueRodaram = [cartao.linha.trim()]
  let repetiu = null
  for (const ate = Date.now() + 180000; Date.now() < ate;) {
    if (await estado() === 'ociosa') break
    const pendente = await cartaoPendente()
    if (pendente) {
      // Os DOIS lados com `trim()`: um espaco a mais escaparia do criterio que sustenta a
      // decisao 1 da arquitetura (revisor de documentos, 11/09/2026).
      const linha = pendente.linha.trim()
      if (linhasQueRodaram.includes(linha)) { repetiu = linha; break }
      linhasQueRodaram.push(linha)
      await clicarNoCartao(pendente.id, 'Rodar')
      await respirar(2500)
      continue
    }
    await respirar(700)
  }
  await respirar(3000)
  const resposta = await frame.evaluate(() => {
    const f = [...document.querySelectorAll('.fala.dele')].pop()
    return f ? f.innerText : ''
  })
  checar('⛔ V4: o agente NAO repetiu o comando depois de ouvir a saida pelo deny', repetiu === null,
    repetiu ? 'ele propôs de novo: ' + JSON.stringify(repetiu) : `${linhasQueRodaram.length} comando(s), nenhum repetido`)
  checar('⛔ V4: e ele relatou o resultado como sucesso (a mensagem do deny foi entendida)',
    /certo|sucesso|criado|escrit|alfa|pronto/i.test(resposta), JSON.stringify(resposta.slice(0, 200)))
  const vistos = new Set((await cartoes()).map(c => c.id))

  // ── 2. Parar um comando longo: o processo morre, sem órfão ──────────────────
  const marca = 'oficina-teste-longo-' + Date.now()
  // O arquivo onde o PROPRIO processo do comando grava o numero dele. E por aqui que o teste sabe
  // qual processo tem de morrer: a linha de comando nao serve (vai em base64), e perguntar a
  // OFICINA seria perguntar ao programa que esta sendo testado.
  const arquivoPid = path.join(projeto, marca + '.pid')
  await enviar(`Rode UM comando de terminal que escreva o numero do processo atual no arquivo ` +
    `${arquivoPid} e depois espere 120 segundos parado. No PowerShell o numero do processo atual e ` +
    `$PID e a espera e Start-Sleep; no bash sao $$ e sleep. Nao use outra ferramenta.`)
  // ⚠️ O cartão TEM de ser novo E ser o do comando longo: esperar "qualquer cartão pendente" pegava
  // um que já estava na tela do ato anterior, e o teste parava um comando que não era esse.
  const longo = await esperarCartao(180000, vistos, c => c.linha.includes(marca))
  checar('V4: o segundo pedido de comando tambem vira cartao (o do comando longo)', !!longo,
    longo ? JSON.stringify(longo.linha.slice(0, 90)) : 'nenhum cartao com a marca apareceu')
  if (longo) {
    await clicarNoCartao(longo.id, 'Rodar')
    // Espera o processo existir de verdade — é ele que precisa morrer. O numero sai do arquivo que
    // o proprio comando gravou; quem diz se ele esta VIVO e o Windows.
    let pids = [], escrito = null
    for (const ate = Date.now() + 60000; Date.now() < ate;) {
      try {
        const bruto = fs.readFileSync(arquivoPid, 'utf8').replace(/﻿/g, '').trim()
        const n = parseInt(bruto, 10)
        if (Number.isInteger(n) && n > 0 && n !== process.pid) {
          escrito = n
          pids = vivos([n])
          if (pids.length) break
        }
      } catch { /* o arquivo ainda nao existe */ }
      await respirar(800)
    }
    checar('CONTROLE: o comando longo esta rodando de verdade (processo vivo no sistema)',
      pids.length > 0,
      `o comando gravou o pid: ${escrito === null ? 'nao gravou nada legivel' : escrito}` +
      ` · vivo no sistema: ${pids.join(',') || 'nenhum'}`)

    const clicou = await frame.evaluate(id => {
      const l = document.querySelector(`.execucao[data-execucao="${CSS.escape(id)}"]`)
      const b = l && [...l.querySelectorAll('button')].find(x => /Parar este comando/.test(x.textContent))
      if (b) b.click()
      return !!b
    }, longo.id)
    checar('V4: a linha de execucao tem o botao que para ESTE comando', clicou)

    let sobraram = pids
    for (const ate = Date.now() + 40000; Date.now() < ate;) {
      sobraram = vivos(pids)
      if (!sobraram.length) break
      await respirar(700)
    }
    /*
      ⚠️ `clicou` ENTRA NA ASSERCAO, e isso foi pago. Sem ele, a corrida das 22:43 de 11/09/2026
      reprovou "a linha tem o botao que para" e APROVOU o criterio 9 na mesma tela — o botao nunca
      foi clicado, o comando terminou sozinho, e o criterio que sustenta a versao inteira ficou
      verde. Instrumento ausente virando resultado positivo e a regra 21 da casa no espelho.
    */
    checar('⛔ V4 / criterio 9: parar o comando pelo botao NAO deixa processo orfao',
      clicou === true && pids.length > 0 && sobraram.length === 0,
      `botao clicado: ${clicou} · ainda vivos: ${sobraram.join(',') || 'nenhum'}`)

    let fimLongo = null
    for (const ate = Date.now() + 30000; Date.now() < ate;) {
      fimLongo = await frame.evaluate(id => {
        const l = document.querySelector(`.execucao[data-execucao="${CSS.escape(id)}"]`)
        return l && l.dataset.fim ? { fim: l.dataset.fim, texto: l.innerText } : null
      }, longo.id)
      if (fimLongo) break
      await respirar(500)
    }
    checar('V4: a tela diz que foi VOCE quem parou o comando',
      !!fimLongo && fimLongo.fim === 'parado' && /parado por voc/i.test(fimLongo.texto), JSON.stringify(fimLongo))
  }

  const custo = await frame.evaluate(() => (document.getElementById('custo') || {}).textContent || '')
  console.log('custo desta corrida (o que a tela mostra): ' + custo)
} catch (e) {
  checar('o teste rodou ate o fim', false, String((e && e.stack) || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
