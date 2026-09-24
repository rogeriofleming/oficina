// O PAINEL DA CONVERSA, dentro da OFICINA de verdade — a fumaça estendida da V2.
//
// O que este teste faz que `rodar.mjs` NÃO consegue fazer: provar que a peça existe
// DENTRO do editor. `rodar.mjs` prova o motor em node puro (47 critérios, segundos);
// ele nunca saberia se a webview abriu, se a CSP foi aplicada, se o script carregou ou
// se o `require('./agente')` resolve de dentro do host de extensão. São perguntas
// diferentes, e é por isso que os dois arquivos existem.
//
// ⚠️ ESTE TESTE NÃO FALA COM A API. Ele não manda mensagem para o agente nem pede
// resposta: isso gastaria a conta de quem roda, dependeria de rede e daria um
// resultado diferente a cada corrida — três coisas que um critério de regressão não
// pode ter. Que o agente responde de dentro da OFICINA já está provado, e por medição:
// o spike do V0.5 (7 de 7) e o spike 2 da V2 (4 de 4). Aqui a pergunta é a tela.
//
// ⚠️ UMA CORRIDA POR VEZ. Este teste abre o editor.
//
// Uso:  node testes/painel.mjs [caminho do exe]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, extensaoForaDeSincronia } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const exe = acharExe(process.argv[2])
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}

// ⚠️ O primeiro critério, e o que dá sentido a todos os outros: a tela que este teste vai
// olhar roda o código do repositório? Em 10/09/2026 ela rodava o de dois commits antes, e
// este arquivo inteiro ficou verde assim. Ver `extensaoForaDeSincronia` em comum.mjs.
{
  const fora = extensaoForaDeSincronia(exe, REPO)
  checar('a extensao DENTRO do executavel e a do repositorio', fora.length === 0, fora.join(', '))
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

/**
 * Acha o frame da NOSSA webview.
 *
 * ⚠️ Procurar por título ou por posição não serve: o VS Code aninha a webview em dois
 * iframes e a ordem deles muda com o que mais estiver aberto. O que identifica o nosso
 * painel sem ambiguidade é um elemento que só ele tem — a caixa de escrever com o id
 * `entrada`. Perguntar "existe #entrada aqui?" é a forma honesta de dizer "é este".
 */
async function acharFrameDoPainel(pagina, tetoMs = 45000) {
  const fim = Date.now() + tetoMs
  while (Date.now() < fim) {
    for (const frame of pagina.frames()) {
      try {
        const tem = await frame.evaluate(() => !!document.getElementById('entrada'))
        if (tem) return frame
      } catch { /* frame trocando de página: tenta o próximo */ }
    }
    await respirar(400)
  }
  return null
}

// A pasta que o editor vai abrir. Descartável: o agente desta janela não recebe
// nenhum arquivo de verdade para olhar.
const projeto = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-painel-'))
fs.writeFileSync(path.join(projeto, 'leiame.txt'), 'arquivo de teste\n', 'utf8')

const _electron = await carregarElectron()
let app
try {
  app = await abrirOficina(_electron, { exe, projeto, area: projeto })
  const pagina = await app.firstWindow()
  // ⚠️ ANTES DE QUALQUER OUTRA COISA: um erro na ativação da extensão acontece agora,
  // e não haveria segunda chance de vê-lo.
  const errosDaPagina = []
  pagina.on('pageerror', e => errosDaPagina.push(String((e && e.message) || e)))
  await esconderJanela(app)
  await pagina.waitForLoadState('domcontentloaded')

  // ── 1. O painel abre SOZINHO ────────────────────────────────────────────────
  // Não há clique nem atalho aqui de propósito: o produto tem que abrir na conversa
  // (é o que a V1 entregou e o que ele pediu). Se precisasse de um clique, este teste
  // ficaria verde e o produto estaria errado.
  const frame = await acharFrameDoPainel(pagina)
  checar('o painel da conversa abre sozinho, sem clique', !!frame,
    frame ? '' : 'nenhum frame com a caixa de escrever apareceu em 45 s')

  if (frame) {
    // ── 2. A tela está inteira ────────────────────────────────────────────────
    const tela = await frame.evaluate(() => ({
      // ⚠️ O cabeçalho SAIU (pedido dele: uma barra só, a da aba). Este critério já
      // cobrou o contrário — "a tela tem topo" — e passava com o produto errado.
      semCabecalho: !document.querySelector('header'),
      temLinhaDeEstado: !!document.querySelector('.pe .linha-de-estado #ponto') &&
        !!document.querySelector('.pe .linha-de-estado #modo'),
      temConversa: !!document.getElementById('conversa'),
      temEnviar: !!document.getElementById('enviar'),
      conta: (document.getElementById('conta') || {}).textContent || '',
      convite: (document.querySelector('.vazio-titulo') || {}).textContent || '',
      // O script rodou? Se a CSP tivesse bloqueado, o `acquireVsCodeApi` não teria
      // sido chamado e nada disto estaria ligado — mas a prova direta é o estado do
      // ponto, que só existe depois que o host manda o primeiro evento.
      estadoDoPonto: (document.getElementById('ponto') || {}).dataset?.estado || '',
      corDeFundo: getComputedStyle(document.body).backgroundColor,
    }))

    checar('a tela tem conversa, botão de enviar e a linha de estado no pé',
      tela.temLinhaDeEstado && tela.temConversa && tela.temEnviar)
    checar('uma barra só: o painel NÃO tem cabeçalho próprio', tela.semCabecalho)

    // A barra que sobra é a da ABA — lida no workbench, fora da webview.
    const aba = await pagina.evaluate(() => {
      const ativa = document.querySelector('.tabs-container .tab.active .label-name, .title .label-name')
      const botoes = [...document.querySelectorAll('.editor-actions .action-label')]
        .map(b => b.getAttribute('aria-label') || '')
      return { nome: ativa ? ativa.textContent.trim() : '', botoes }
    })
    checar('a aba se chama "Nova conversa" antes da primeira mensagem',
      aba.nome === 'Nova conversa', aba.nome || '(nao achei a aba ativa)')
    checar('o botão "Nova conversa" está na barra da aba',
      aba.botoes.some(b => /Nova conversa/.test(b)), aba.botoes.join(' | ') || '(nenhuma acao na aba)')
    checar('o convite está em português', /Peça em português/.test(tela.convite), tela.convite)

    // ── 3. O SCRIPT rodou (logo a CSP com nonce deixou passar o nosso, só o nosso) ─
    // ⚠️ Este é o critério que pega o erro mais provável desta fase: uma CSP escrita
    // errado não quebra nada visível — a página aparece, sem estilo ou sem script, e
    // um teste que só olhasse "a webview abriu" ficaria verde.
    const rodou = await frame.evaluate(async () => {
      // O ponto de estado começa "abrindo" no HTML e só muda quando o host responde.
      const inicio = Date.now()
      while (Date.now() - inicio < 20000) {
        const e = document.getElementById('ponto')?.dataset?.estado
        if (e && e !== 'abrindo') break
        await new Promise(r => setTimeout(r, 200))
      }
      return {
        estado: document.getElementById('ponto')?.dataset?.estado || '(sem ponto)',
        // ⚠️ Sem estes dois, "a tela está parada" tem duas causas possíveis e
        // indistinguíveis: o host não mandou nada, ou mandou e a tela não desenhou.
        eventos: +(document.body.dataset.eventos || 0),
        ultimo: document.body.dataset.ultimoEvento || '(nenhum)',
        demorouMs: Date.now() - inicio,
      }
    })
    checar('o script da webview rodou e conversa com o host',
      rodou.eventos > 0 && rodou.estado !== 'abrindo',
      `estado ${rodou.estado} | ${rodou.eventos} evento(s) | ultimo: ${rodou.ultimo} | ${rodou.demorouMs}ms`)

    // ⚠️ ESTE CRITÉRIO NASCEU DE UM VERMELHO QUE VIROU VERDE SOZINHO.
    //
    // Na primeira corrida da fumaça (10/09/2026) o painel ficou em "abrindo" além do
    // teto de 20 s; na corrida seguinte ficou pronto depressa, sem que uma linha de
    // comportamento tivesse mudado. A explicação provável é o custo da PRIMEIRA
    // importação do SDK (o pacote traz um binário de centenas de MB, e disco frio
    // custa caro) — mas "provável" não é medido, e por isso o número agora é cobrado
    // em vez de observado.
    //
    // ⚠️ O QUE ESTE NÚMERO NÃO É: o tempo que a pessoa espera. Ele conta a partir do
    // momento em que o teste ACHOU o frame — ou seja, a página já tinha carregado.
    // Medido em duas corridas seguidas: 0 ms e 203 ms, o que só diz que, uma vez que a
    // tela existe, o host responde na hora. O tempo de abertura de ponta a ponta
    // (clique → conversa pronta) não está medido por nenhum teste desta versão, e
    // dizer que está seria vender o que a medição não cobre.
    checar('o painel fica pronto em menos de 15 s (contados do frame existir)',
      rodou.demorouMs < 15000, rodou.demorouMs + 'ms')

    // ── 3a. O "Parar" só aparece quando há o que parar ────────────────────────
    //
    // ⚠️ Nasceu de um retrato (10/09/2026, noite): o botão virou ícone, ganhou
    // `display: inline-flex`, e passou a aparecer em repouso com o atributo `hidden` no
    // lugar. Conferir o ATRIBUTO teria dado verde; o que se cobra é o estilo CALCULADO.
    // CONTROLE POSITIVO: com o estado "pensando" simulado na tela, ele TEM que aparecer —
    // sem isto, um botão que nunca aparece passaria.
    const parar = await frame.evaluate(async () => {
      const visivel = () => getComputedStyle(document.getElementById('parar')).display !== 'none'
      const emRepouso = visivel()
      window.postMessage({ tipo: 'estado', estado: 'pensando' }, '*')
      await new Promise(r => setTimeout(r, 300))
      const pensando = visivel()
      window.postMessage({ tipo: 'estado', estado: 'ociosa' }, '*')
      await new Promise(r => setTimeout(r, 300))
      return { emRepouso, pensando, deVolta: visivel() }
    })
    checar('em repouso, o botao Parar NAO aparece (estilo calculado)', !parar.emRepouso && !parar.deVolta,
      JSON.stringify(parar))
    checar('CONTROLE POSITIVO: pensando, o botao Parar aparece', parar.pensando, JSON.stringify(parar))

    // ── 3a'. Caminho citado vira link MESMO chegando em pedaços ────────────────
    //
    // ⚠️ Medido no executável com o agente de verdade (10/09/2026, noite): ele respondeu
    // `./nota.txt` e não virou link. O padrão casa `./nota.txt` — o que falhou foi o
    // streaming: um nó de texto por pedaço, e o padrão era aplicado nó por nó. Aqui o
    // pedaço corta no meio do caminho de propósito. CONTROLE POSITIVO: o caminho inteiro
    // num pedaço só vira link — sem ele, um padrão que não casasse nada passaria no de
    // cima como "não quebrou".
    const links = await frame.evaluate(async () => {
      const mandar = m => window.postMessage(m, '*')
      const ler = () => [...document.querySelectorAll('button.arquivo')].map(b => b.textContent)
      mandar({ tipo: 'texto', texto: 'abri ./pasta/partido' })
      mandar({ tipo: 'texto', texto: '.md e segui' })
      mandar({ tipo: 'fim', custoUsd: 0 })
      await new Promise(r => setTimeout(r, 300))
      const partido = ler()
      mandar({ tipo: 'texto', texto: 'abri ./pasta/inteiro.md e segui' })
      mandar({ tipo: 'fim', custoUsd: 0 })
      await new Promise(r => setTimeout(r, 300))
      return { partido, depois: ler() }
    })
    checar('caminho citado que chega PARTIDO em dois pedacos vira link',
      links.partido.includes('./pasta/partido.md'), JSON.stringify(links))
    checar('CONTROLE POSITIVO: caminho citado num pedaco so vira link',
      links.depois.includes('./pasta/inteiro.md'), JSON.stringify(links))

    // ── 3a''. Turno que termina com ERRO diz isso na tela ─────────────────────
    // ⚠️ Revisão de código (10/09/2026, noite): o motor manda `fim` com `erro` (limite de
    // passos, erro no meio do trabalho) e a tela usava só o custo — a pessoa ficava olhando
    // uma pergunta sem resposta e sem erro. CONTROLE: turno sem erro não ganha aviso.
    const turno = await frame.evaluate(async () => {
      const ultimo = () => { const u = [...document.getElementById('conversa').children].pop(); return u ? u.textContent : '' }
      window.postMessage({ tipo: 'texto', texto: 'resposta boa' }, '*')
      window.postMessage({ tipo: 'fim', custoUsd: 0 }, '*')
      await new Promise(r => setTimeout(r, 300))
      const semErro = ultimo()
      window.postMessage({ tipo: 'texto', texto: 'resposta cortada' }, '*')
      window.postMessage({ tipo: 'fim', custoUsd: 0, erro: 'error_max_turns' }, '*')
      await new Promise(r => setTimeout(r, 300))
      return { semErro, comErro: ultimo() }
    })
    checar('turno que termina com ERRO diz isso na tela', /parou antes de terminar/i.test(turno.comErro), JSON.stringify(turno))
    checar('CONTROLE: turno sem erro nao ganha aviso', !/parou antes de terminar/i.test(turno.semErro), JSON.stringify(turno))

    // ── 3a'''. O cartão de permissão mostra o comando INTEIRO ──────────────────
    // ⚠️ Revisão de código (10/09/2026, noite): o comando era cortado em 1.200 caracteres sem
    // marca nenhuma — logo abaixo do comentário "aprovar sem ver o que se aprova não é
    // aprovar". Um comando inofensivo no começo e perigoso no fim passava como completo.
    const cartao = await frame.evaluate(async () => {
      const mostrar = (id, command) => window.postMessage({ tipo: 'permissao',
        pedido: { id, ferramenta: 'Bash', frase: 'Rodar um comando', entrada: { command } } }, '*')
      const responderNao = c => { const b = c && [...c.querySelectorAll('button')].find(x => x.textContent.trim() === 'Não'); if (b) b.click() }
      mostrar('teste-longo', 'echo inofensivo; '.repeat(80) + 'rm -rf FIM_DO_COMANDO')
      mostrar('teste-enorme', 'x'.repeat(25000) + 'FIM')
      await new Promise(r => setTimeout(r, 300))
      const longo = document.querySelector('.permissao[data-id="teste-longo"]')
      const enorme = document.querySelector('.permissao[data-id="teste-enorme"]')
      const r = {
        longoInteiro: !!longo && longo.querySelector('.comando').textContent.includes('FIM_DO_COMANDO'),
        enormeAvisa: !!enorme && /mais [\d.]+ caracteres/i.test(enorme.textContent),
      }
      responderNao(longo); responderNao(enorme)   // não deixa cartão pendurado na tela
      return r
    })
    checar('o cartao de permissao mostra o comando longo INTEIRO', cartao.longoInteiro, JSON.stringify(cartao))
    checar('comando enorme demais: o cartao DIZ que cortou', cartao.enormeAvisa, JSON.stringify(cartao))

    // ── 3a'''''. Resposta que o host recusa: o cartão deixa de dizer "Permitido." ──
    // O fio inteiro, no executável: a tela marca o cartão no clique, o host não acha o pedido
    // (o id não existe no motor) e manda `permissaoNaoValeu`, e a tela troca o veredito.
    // Revisão final, 11/09/2026: a ponte provava o evento; a metade da tela não tinha critério.
    const naoValeu = await frame.evaluate(async () => {
      window.postMessage({ tipo: 'permissao', pedido: { id: 'teste-nao-valeu', ferramenta: 'Write', frase: 'Escrever x', entrada: {} } }, '*')
      await new Promise(r => setTimeout(r, 200))
      const c = document.querySelector('.permissao[data-id="teste-nao-valeu"]')
      const b = c && [...c.querySelectorAll('button')].find(x => x.textContent.trim() === 'Permitir')
      if (b) b.click()
      await new Promise(r => setTimeout(r, 1000))
      return (c && (c.querySelector('.veredito') || {}).textContent) || '(sem cartao)'
    })
    checar('resposta recusada pelo host: o cartao troca "Permitido." por "Nao valeu"', /Não valeu/.test(naoValeu), naoValeu)

    // ── V3. O cartão de uma PROPOSTA: sem o conteúdo, com a ficha e as duas decisões ──
    const prop = await frame.evaluate(async () => {
      window.postMessage({ tipo: 'permissao', pedido: { id: 'teste-prop', ferramenta: 'Edit', frase: 'Alterar o arquivo r.txt',
        entrada: { file_path: 'r.txt' }, proposta: { nome: 'r.txt', novo: false, trechos: 2, linha: 3 } } }, '*')
      window.postMessage({ tipo: 'permissao', pedido: { id: 'teste-prop2', ferramenta: 'Edit', frase: 'Alterar o arquivo s.txt',
        entrada: { file_path: 's.txt' }, proposta: { nome: 's.txt', novo: false, trechos: 1, linha: 1 } } }, '*')
      await new Promise(r => setTimeout(r, 300))
      const c = document.querySelector('.permissao[data-id="teste-prop"]')
      const r = {
        existe: !!c,
        ehProposta: !!(c && c.classList.contains('proposta')),
        texto: c ? c.innerText : '',
        ficha: ((c && c.querySelector('.ficha')) || {}).textContent || '',
        botoes: c ? [...c.querySelectorAll('.botoes button')].map(b => b.textContent.trim()) : [],
        semConteudo: !!c && !c.querySelector('pre.comando'),
      }
      // A revisão decidiu (1 de 2) → o veredito diz o que ficou no arquivo.
      window.postMessage({ tipo: 'propostaDecidida', id: 'teste-prop', classe: 'parcial', aceitos: 1, total: 2, nome: 'r.txt' }, '*')
      await new Promise(r2 => setTimeout(r2, 300))
      r.veredito = ((c && c.querySelector('.veredito')) || {}).textContent || ''
      // "Rejeitar tudo" num pedido que o host não conhece → o host recusa e a tela diz.
      const c2 = document.querySelector('.permissao[data-id="teste-prop2"]')
      const b = c2 && [...c2.querySelectorAll('button')].find(x => x.textContent.trim() === 'Rejeitar tudo')
      if (b) b.click()
      await new Promise(r3 => setTimeout(r3, 1000))
      r.naoValeu = ((c2 && c2.querySelector('.veredito')) || {}).textContent || ''
      return r
    })
    checar('V3: o cartao de proposta nao mostra o conteudo, e tem a ficha e as duas decisoes',
      prop.ehProposta && prop.semConteudo && /2 trechos/.test(prop.texto) && prop.ficha === 'r.txt :3' &&
      prop.botoes.includes('Aceitar tudo') && prop.botoes.includes('Rejeitar tudo'), JSON.stringify(prop))
    checar('V3: a decisao da revisao vira o veredito do cartao (1 de 2, ja gravados)',
      /aceitou 1 de 2 trechos/.test(prop.veredito), prop.veredito)
    checar('V3: "Rejeitar tudo" num pedido que o host nao conhece volta "Nao valeu"', /Não valeu/.test(prop.naoValeu), prop.naoValeu)

    // ── 3a''''. Clicar no arquivo citado ABRE o arquivo ────────────────────────
    // ⚠️ Revisão funcional (10/09/2026, noite), no executável: o link aparecia, o clique não
    // abria nada, e o console dizia `Cannot read properties of null (reading '0')`. Por
    // último de propósito: ele tira o foco da conversa, e volta com ela no fim.
    await frame.evaluate(async () => {
      window.postMessage({ tipo: 'texto', texto: 'veja ./leiame.txt' }, '*')
      window.postMessage({ tipo: 'fim', custoUsd: 0 }, '*')
      await new Promise(r => setTimeout(r, 300))
      const b = [...document.querySelectorAll('button.arquivo')].reverse().find(x => x.textContent === './leiame.txt')
      if (b) b.click()
    })
    let abaDoArquivo = ''
    for (let i = 0; i < 20 && abaDoArquivo !== 'leiame.txt'; i++) {
      await respirar(250)
      abaDoArquivo = await pagina.evaluate(() =>
        ((document.querySelector('.tabs-container .tab.active .label-name') || {}).textContent || '').trim())
    }
    checar('clicar no arquivo citado ABRE o arquivo no editor', abaDoArquivo === 'leiame.txt', abaDoArquivo || '(nenhuma aba ativa)')
    await pagina.evaluate(() => {
      const t = [...document.querySelectorAll('.tabs-container .tab')].find(x => !/leiame\.txt/.test(x.textContent))
      if (t) t.click()
    })
    await respirar(800)

    // ── 3b. Cada modo do seletor LIGA de verdade ──────────────────────────────
    //
    // ⚠️ Nasceu do retrato de 10/09/2026, noite: a troca para "faz tudo sem perguntar"
    // falhou ao vivo, com o host respondendo `ok:false`. O conserto do seletor da V2 foi
    // provado na ponte (node, com dublê do SDK) e nunca dentro do editor — o executável
    // dos testes de tela tinha o código de antes. Aqui a pergunta é a do produto: o que o
    // seletor oferece, o motor de verdade aceita? É pedido de CONTROLE ao SDK, sem
    // mensagem ao modelo: não gasta na conta de quem roda.
    // O modo que pula aprovação NÃO aparece num perfil limpo — a configuração nasce
    // desligada, igual à extensão oficial.
    const bypass = await frame.evaluate(() => {
      const op = document.querySelector('#modo option[value="bypassPermissions"]')
      return op ? { escondido: op.hidden, desligado: op.disabled } : null
    })
    checar('sem a configuracao, o modo que pula aprovacao NAO aparece no seletor',
      !!bypass && bypass.escondido && bypass.desligado, JSON.stringify(bypass))

    const modos = await frame.evaluate(async () => {
      const sel = document.getElementById('modo')
      // Só o que a tela OFERECE: opção escondida não é promessa do produto.
      const opcoes = [...sel.options].filter(o => !o.hidden && !o.disabled).map(o => o.value)
      const r = {}
      // `default` por último: o teste devolve a tela como encontrou.
      for (const m of [...opcoes.filter(o => o !== 'default'), 'default']) {
        delete document.body.dataset.respostaDoModo
        sel.value = m
        sel.dispatchEvent(new Event('change', { bubbles: true }))
        const inicio = Date.now()
        let resp = null
        while (Date.now() - inicio < 15000) {
          resp = document.body.dataset.respostaDoModo
          if (resp) break
          await new Promise(x => setTimeout(x, 200))
        }
        r[m] = resp || '(o host nao respondeu em 15 s)'
      }
      return r
    })
    const naoLigam = Object.entries(modos).filter(([m, r]) => r !== `${m}|ok`)
    checar('cada modo do seletor LIGA de verdade no motor (o host confirma)', naoLigam.length === 0,
      naoLigam.length ? naoLigam.map(([m, r]) => `${m}: ${r}`).join(' | ')
        : Object.keys(modos).join(', ') + ' — todos confirmados')

    // ── 4. O CSS carregou ─────────────────────────────────────────────────────
    // Sem o `style-src` certo, a página abre sem estilo — e continua "funcionando".
    checar('o CSS do painel carregou (a página não está sem estilo)',
      tela.corDeFundo && tela.corDeFundo !== 'rgba(0, 0, 0, 0)', tela.corDeFundo)

    // ── 5. Nada de fora entra ─────────────────────────────────────────────────
    const csp = await frame.evaluate(() =>
      (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '')
    checar('a CSP está declarada na página', /default-src 'none'/.test(csp), csp.slice(0, 80))
    checar('a CSP não abre mão do nonce (sem unsafe-inline / unsafe-eval)',
      !/unsafe-inline|unsafe-eval/.test(csp))
    checar('a CSP não autoriza origem remota',
      !/https?:\/\/(?!\S*vscode-(resource|cdn))/.test(csp.replace(/vscode-webview:\/\/\S+/g, '')), csp.slice(0, 160))

    // ── 6. O login aparece ────────────────────────────────────────────────────
    // ⚠️ O critério NÃO é "aparece um e-mail": numa máquina sem login isso seria
    // vermelho sem defeito nenhum no produto. O critério é o campo ter SAÍDO do
    // "entrando…" — ou seja, o host respondeu quem está (ou não está) logado.
    const conta = await frame.evaluate(async () => {
      const inicio = Date.now()
      while (Date.now() - inicio < 25000) {
        const t = document.getElementById('conta')?.textContent || ''
        if (t && t !== 'entrando…') return t
        await new Promise(r => setTimeout(r, 250))
      }
      return document.getElementById('conta')?.textContent || ''
    })
    checar('o painel diz em qual conta você está (ou que não identificou)',
      !!conta && conta !== 'entrando…', conta.includes('@') ? '(e-mail presente, não registrado aqui)' : conta)

    // ── 7. Digitar funciona ───────────────────────────────────────────────────
    const digitou = await frame.evaluate(() => {
      const ent = document.getElementById('entrada')
      ent.value = 'teste de digitação'
      ent.dispatchEvent(new Event('input', { bubbles: true }))
      return { valor: ent.value, altura: ent.style.height }
    })
    checar('a caixa aceita texto e cresce sozinha',
      digitou.valor === 'teste de digitação' && !!digitou.altura, digitou.altura)
  }

  // ── 8. Nenhum erro no console do Electron (critério 11 dos critérios de pronto) ──────────────
  //
  // ⚠️ O COLETOR É LIGADO LÁ EM CIMA, logo depois de a janela existir — não aqui.
  //
  // A primeira versão registrava o ouvinte NESTA linha, depois de abrir o app, achar o
  // frame, esperar o host, ler a CSP, ler a conta e digitar. E o comentário dizia, com
  // todas as letras, "coletado do início". Tudo que quebrasse na ativação da extensão
  // ou na abertura do painel era invisível: o critério 11 dos critérios de pronto ficava verde por
  // construção. Achado por uma revisao independente em 10/09/2026 — o padrão certo já existia em
  // `fumaca.mjs`, que registra `pageerror` logo após o `firstWindow()`.
  await respirar(1500)
  checar('sem erro de página durante a fumaça do painel', errosDaPagina.length === 0,
    errosDaPagina.join(' | '))

} catch (e) {
  checar('o teste rodou até o fim', false, String((e && e.stack) || e))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(projeto, { recursive: true, force: true }) } catch { }
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({
  passou, total: resultados.length,
  falhas: resultados.filter(r => !r.ok).map(r => r.nome),
}))
process.exit(passou ? 0 : 1)
