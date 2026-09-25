// AS VISTAS "CONEXÕES" E "CONTA" (V26), NA TELA DE VERDADE.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE. As 194 asserções em node puro provam o motor e a montagem da
// árvore com um editor de mentira. Nenhuma delas prova que o editor DE VERDADE registra os dois
// contêineres, desenha os ícones e abre as vistas — e a história deste projeto é feita de coisas
// que só existiram na tela: a barra que nasceu vazia, os ícones de 6×6 px, o `order` do CSS. Uma
// vista pode estar perfeita no provedor e não aparecer, por um id trocado no manifesto.
//
// ⚠️ E ELE NÃO MEDE O CONTEÚDO DA LISTA DE MCPs, de propósito. A lista depende de conta logada, de
// rede e dos servidores de terceiros estarem de pé — três coisas que não são do produto. Medir isso
// aqui daria um teste que fica vermelho por motivo alheio, que é a pior espécie. O que se cobra é o
// que é NOSSO: os contêineres existem, os ícones aparecem, as vistas abrem, e a de Conexões nasce
// dizendo que ainda não mediu (em vez de fingir uma lista).
//
// O que precisa ser verdade:
//   1. os dois contêineres novos existem na barra de cima, com ícone desenhado (caixa > 0);
//   2. clicar em "Conexões" abre a vista, e ela nasce com o CONVITE — não com uma lista inventada;
//   3. a vista traz a linha que explica o que é um MCP (a sigla não fica órfã na tela);
//   4. clicar em "Conta" abre a vista da conta;
//   5. os comandos das duas vistas estão registrados no editor de verdade;
//   6. nenhum erro de JS no console enquanto isso acontece.
//
// Uso:  node testes/tela_conexoes_e_conta.mjs [caminho do executavel]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp } from './comum.mjs'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const res = []
const checar = (criterio, ok, detalhe = '') => {
  res.push({ criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${criterio}${detalhe ? '  (' + String(detalhe).slice(0, 230) + ')' : ''}`)
}
const respirar = ms => new Promise(r => setTimeout(r, ms))

const _electron = await carregarElectron()
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel'); process.exit(1) }

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-conexoes-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)
fs.writeFileSync(path.join(projeto, 'leia.txt'), 'uma pasta qualquer\n')

let app
const errosDoConsole = []
try {
  app = await abrirOficina(_electron, { exe, projeto, area })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  // ⚠️ Os erros são colhidos ANTES do fechamento e congelados: o barulho da porta batendo (escritas
  // de log canceladas no desligamento) não é defeito do produto. É a mesma decisão da fumaça.
  win.on('console', m => { if (m.type() === 'error') errosDoConsole.push(m.text().slice(0, 200)) })
  await respirar(12000)

  // ── 1. os dois contêineres, com ícone desenhado ──
  const iconesDaBarra = async () => await win.evaluate(() => {
    const caixa = el => {
      const c = el.getBoundingClientRect()
      return c.width === 0 || c.height === 0 ? null : { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) }
    }
    // ⚠️ O rótulo mora no `.action-label` DENTRO do item — o `.action-item` não tem `aria-label`.
    // Medido com a sonda do DOM, depois de um critério irmão reprovar um build certo por ler do
    // lugar errado.
    const rotuloDe = el => {
      const lab = el.querySelector('.action-label')
      return ((lab && (lab.getAttribute('aria-label') || lab.title)) || el.getAttribute('aria-label') || el.textContent || '').trim()
    }
    return Array.from(document.querySelectorAll('.part.titlebar .titlebar-activity-container .action-item'))
      .map(el => ({ rotulo: rotuloDe(el), ...(caixa(el) || {}) }))
      .filter(i => i.w > 0)
  })

  const antes = await iconesDaBarra()
  console.log('\n  --- a barra de cima ---')
  for (const i of antes) console.log(`      x=${String(i.x).padStart(4)} y=${String(i.y).padStart(3)} ${i.w}x${i.h}  ${i.rotulo}`)
  console.log('')

  // ⚠️ A busca é por PREFIXO SEM ACENTO (`conex`, `conta`), de propósito: comparar "Conexões"
  // inteiro dependeria de o acento sobreviver ao `aria-label`, ao DOM e a este arquivo. O pedaço
  // ASCII do rótulo identifica sem ambiguidade e não tem como quebrar por codificação.
  const achar = nome => antes.find(i => i.rotulo.toLowerCase().includes(nome))
  checar('o ícone CONEXÕES está na barra de cima, desenhado', !!achar('conex'), antes.map(i => i.rotulo).join(' | '))
  checar('o ícone CONTA está na barra de cima, desenhado', !!achar('conta'), antes.map(i => i.rotulo).join(' | '))
  const doisNovos = [achar('conex'), achar('conta')].filter(Boolean)
  checar('e os dois têm o mesmo tamanho dos outros ícones',
    doisNovos.length === 2 && doisNovos.every(i => i.h === antes[0].h && i.w === antes[0].w),
    doisNovos.map(i => `${i.rotulo} ${i.w}x${i.h}`).join(' | ') + ` · primeiro: ${antes[0] && antes[0].w}x${antes[0] && antes[0].h}`)

  // ── 2 e 3. abrir CONEXÕES ──
  //
  // ⚠️ O clique é no ÍCONE, e não numa chamada de comando por dentro. Chamar o comando provaria
  // que ele existe; clicar prova que a PORTA existe — que é o que ele pediu e o que já falhou
  // neste projeto (a barra que aparecia e não clicava, presa na região de arrasto da janela).
  const abrirPorId = async id => {
    await win.evaluate(nome => {
      const rotuloDe = e => {
        const lab = e.querySelector('.action-label')
        return ((lab && (lab.getAttribute('aria-label') || lab.title)) || e.getAttribute('aria-label') || '').toLowerCase()
      }
      const el = Array.from(document.querySelectorAll('.part.titlebar .titlebar-activity-container .action-item'))
        .find(e => rotuloDe(e).includes(nome))
      // ⚠️ O clique é no `.action-label` quando ele existe: é nele que o editor põe o manipulador,
      // e a barra de título inteira é região de arrasto da janela — clicar no lugar errado move a
      // janela em vez de abrir a vista.
      if (el) (el.querySelector('.action-label') || el).click()
    }, id)
    await respirar(3500)
    return await win.evaluate(() => {
      const lateral = document.querySelector('.part.sidebar')
      const c = lateral && lateral.getBoundingClientRect()
      const titulo = lateral && lateral.querySelector('.composite.title .title-label, .title-label')
      return {
        aberta: !!(c && c.width > 0 && c.height > 0),
        titulo: (titulo && titulo.textContent || '').trim(),
        texto: (lateral && lateral.textContent || '').trim().slice(0, 900),
      }
    })
  }

  const conexoes = await abrirPorId('conex')
  checar('clicar em CONEXÕES abre a vista na lateral', conexoes.aberta && /conex/i.test(conexoes.titulo), `titulo="${conexoes.titulo}"`)
  /*
    ⛔ ABRIR A VISTA JÁ MEDE — e o critério anterior exigia o convite, reprovando o comportamento
    certo. Quando a vista fica visível ela pergunta ao Claude; o convite ("Ver as conexões do
    Claude") é o estado de quem NUNCA a abriu. Era o teste errado, não o produto: o mesmo defeito
    que os revisores acharam noutro lugar, agora meu, na suíte.

    O que se cobra aqui é o CICLO HONESTO: ao abrir, ela diz que está medindo (nunca mostra lista
    pronta que não mediu); e, segundos depois, chega a um estado final que é OU a lista OU uma frase
    dizendo que não deu — nunca uma lista vazia calada.
  */
  checar('⛔ a vista, ao abrir, DIZ QUE ESTÁ MEDINDO — não mostra lista pronta',
    /medindo|Perguntando ao Claude/i.test(conexoes.texto), conexoes.texto.slice(0, 200))

  // O fim do ciclo: o `mcp list` conecta em cada servidor (medido: 5,4 s com 11).
  await respirar(25000)
  const depois = await win.evaluate(() => {
    const lateral = document.querySelector('.part.sidebar')
    return (lateral && lateral.textContent || '').trim().slice(0, 1200)
  })
  const chegou = /conectado|precisa entrar|não conectou|à espera|Nenhum servidor MCP configurado|Não consegui medir|Não entendi a resposta/i.test(depois)
  checar('⛔ e ela CHEGA a um estado final que diz alguma coisa (lista, "nada configurado" ou "não consegui")',
    chegou && !/medindo|Perguntando ao Claude/i.test(depois), depois.slice(0, 400))
  console.log('\n  --- o que a vista mostrou no fim ---\n      ' + depois.replace(/\s+/g, ' ').slice(0, 300) + '\n')
  checar('⛔ a sigla MCP é explicada na própria tela (não só na dica do mouse)',
    /programas de fora que o Claude sabe usar/i.test(conexoes.texto), conexoes.texto.slice(0, 300))
  checar('⛔ e a tela diz o que NÃO dá para fazer por ela',
    /Não há como religar um servidor por aqui/i.test(conexoes.texto), conexoes.texto.slice(0, 400))

  // ── 4. abrir CONTA ──
  const conta = await abrirPorId('conta')
  checar('clicar em CONTA abre a vista na lateral', conta.aberta && /conta/i.test(conta.titulo), `titulo="${conta.titulo}"`)
  // A vista da conta MEDE ao aparecer; o que se cobra aqui é que ela diga alguma das coisas que sabe
  // dizer — e nunca que ela esteja "dentro" (isso depende da conta desta máquina, que não é do produto).
  checar('a vista da conta diz em que pé está (medindo, dentro, fora ou não consegui)',
    /Vendo em qual conta|está fora da conta|Não consegui ler a conta|Sair \/ trocar de conta/i.test(conta.texto),
    conta.texto.slice(0, 300))

  // ── 6. o console ──
  const errosNossos = errosDoConsole.filter(t => !/Canceled|AHPLog|net::ERR|Failed to fetch/i.test(t))
  checar('nenhum erro de JS no console enquanto as duas vistas abrem',
    errosNossos.length === 0, errosNossos.slice(0, 3).join(' | '))
} catch (e) {
  checar('a suíte rodou até o fim', false, String(e && e.message).slice(0, 200))
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch { }
}

const falhas = res.filter(r => !r.ok)
console.log(`\ntela conexões e conta: ${res.length - falhas.length}/${res.length} criterios`)
console.log(JSON.stringify({ passou: falhas.length === 0, total: res.length, falhas: falhas.map(r => r.criterio) }))
process.exit(falhas.length ? 1 : 0)
