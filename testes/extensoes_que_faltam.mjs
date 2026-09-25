// AS EXTENSÕES QUE FALTAM (V27) — em node puro, com o editor de mentira.
//
// O que precisa ser verdade:
//   1. a lista é `lista.txt` MENOS `embutidas-da-loja.txt` (fonte única: não envelhece calada);
//   2. só instala o que falta, e o Claude Code PRIMEIRO;
//   3. sem nada faltando, não mostra nada;
//   4. falha (sem internet) avisa, com o nome de gente, e oferece tentar de novo — nunca calada;
//   5. a chave dos testes desliga tudo, e o ambiente dos testes a liga;
//   6. na abertura, a instalação vem ANTES da conversa automática.
//
// Uso:  node testes/extensoes_que_faltam.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const E = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'extensoesQueFaltam.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

function editor({ instaladas = [], falha = null } = {}) {
  const feito = { instalou: [], avisos: [], progresso: 0 }
  return {
    feito,
    ProgressLocation: { Notification: 15 },
    // Como no programa: o que foi instalado passa a existir, e pode ser ativado.
    extensions: {
      getExtension: id => (instaladas.includes(id) || feito.instalou.includes(id)
        ? { id, activate: () => { feito.ativou = (feito.ativou || []).concat(id); return Promise.resolve() } } : undefined),
    },
    commands: {
      executeCommand: (c, id) => {
        if (c !== 'workbench.extensions.installExtension') return Promise.resolve()
        if (falha && falha(id)) return Promise.reject(new Error('sem rede'))
        feito.instalou.push(id)
        return Promise.resolve()
      },
    },
    window: {
      withProgress: (op, f) => { feito.progresso++; return f({ report() { } }) },
      showWarningMessage: (m, ...b) => { feito.avisos.push({ m, b }); return Promise.resolve(undefined) },
    },
  }
}

// ── 1 ──
{
  const ler = f => fs.readFileSync(path.join(REPO, 'extensoes', f), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const esperado = ler('lista.txt').filter(id => !ler('embutidas-da-loja.txt').includes(id))
  checar('1. a lista e lista.txt menos as embutidas (fonte unica)',
    JSON.stringify([...E.RECOMENDADAS].sort()) === JSON.stringify([...esperado].sort()),
    `modulo=${E.RECOMENDADAS.join()} | esperado=${esperado.join()}`)
  checar('1b. toda recomendada tem nome de gente para a notificacao', E.RECOMENDADAS.every(id => E.NOMES[id]))
}
// ── 2 ──
{
  const vs = editor({ instaladas: ['ms-python.python'] })
  const r = await E.instalarOQueFalta(vs, { ambiente: {} })
  const resto = await r.resto
  checar('2a. so instala o que falta', !vs.feito.instalou.includes('ms-python.python') && r.instaladas.length + resto.instaladas.length === E.RECOMENDADAS.length - 1, JSON.stringify(vs.feito.instalou))
  checar('2b. o Claude Code primeiro', vs.feito.instalou[0] === 'anthropic.claude-code', vs.feito.instalou[0])
  checar('2c. duas notificacoes: a da conversa e a do resto', vs.feito.progresso === 2, vs.feito.progresso)
}
// ── 2d ── achado de revisao: a abertura esperava as OITO; agora so a conversa
{
  let soltar
  const segura = new Promise(res => { soltar = res })
  const vs = editor()
  const executar = vs.commands.executeCommand
  vs.commands.executeCommand = (c, id) => (id === 'anthropic.claude-code' ? executar(c, id) : segura.then(() => executar(c, id)))
  const r = await E.instalarOQueFalta(vs, { ambiente: {} })
  checar('2d. a chamada volta assim que o Claude Code termina, com o resto ainda baixando',
    r.instaladas.join() === 'anthropic.claude-code' && vs.feito.instalou.length === 1, JSON.stringify(vs.feito.instalou))
  soltar()
  await r.resto
  checar('2e. e o resto termina depois, sozinho', vs.feito.instalou.length === E.RECOMENDADAS.length, vs.feito.instalou.length)
}
// ── 2f ── achado de revisao: depois de instalar, a conversa ainda nao tem os comandos registrados
{
  const vs = editor()
  const r = await E.instalarOQueFalta(vs, { ambiente: {} })
  await r.resto
  checar('2f. o Claude Code recem-instalado e ATIVADO antes de a chamada voltar (senao a abertura cai no painel proprio)',
    r.conversaAtiva === true && (vs.feito.ativou || []).includes('anthropic.claude-code'), JSON.stringify(vs.feito.ativou))
  let passos = 0
  const tardia = { extensions: { getExtension: () => (++passos > 3 ? { activate: () => Promise.resolve() } : undefined) } }
  const ok = await E.esperarAtiva(tardia, 'x', { limiteMs: 5000, passoMs: 1, dormir: () => Promise.resolve() })
  checar('2g. a extensao que entra DEPOIS do fim da instalacao e esperada, e ativada', ok === true && passos === 4, passos)
  const nunca = await E.esperarAtiva({ extensions: { getExtension: () => undefined } }, 'x', { limiteMs: 3, passoMs: 1, dormir: () => Promise.resolve() })
  checar('2h. se ela nunca entrar, desiste no teto, sem lancar', nunca === false)
}
// ── 3 ──
{
  const vs = editor({ instaladas: E.RECOMENDADAS })
  const r = await E.instalarOQueFalta(vs, { ambiente: {} })
  checar('3. nada faltando: nao mostra nada', r.instaladas.length === 0 && vs.feito.progresso === 0 && !vs.feito.avisos.length)
}
// ── 4 ──
{
  const vs = editor({ falha: id => id === 'anthropic.claude-code' })
  const r = await E.instalarOQueFalta(vs, { ambiente: {} })
  const resto = await r.resto
  await new Promise(res => setTimeout(res, 5))
  checar('4a. falha e contada, e as outras seguem', r.falharam.length === 1 && resto.instaladas.length === E.RECOMENDADAS.length - 1)
  const aviso = vs.feito.avisos[0] || {}
  checar('4b. avisa com o nome de gente, diz a consequencia, e oferece tentar de novo e ver o motivo',
    /Claude Code/.test(aviso.m || '') && /painel próprio/.test(aviso.m || '') &&
    (aviso.b || []).includes('Tentar agora') && (aviso.b || []).includes('Ver o motivo'), JSON.stringify(aviso))
}
// ── 7 ── nao reinstala o que a pessoa tirou; trava entre janelas; configuracao desliga
{
  const mapa = new Map()
  const estado = { get: (k, p) => (mapa.has(k) ? mapa.get(k) : p), update: (k, v) => { mapa.set(k, v); return Promise.resolve() } }
  const vs = editor()
  const r = await E.instalarOQueFalta(vs, { ambiente: {}, estado })
  await r.resto
  const vs2 = editor({ instaladas: [] }) // tudo "sumiu": a pessoa tirou (ou desabilitou)
  const r2 = await E.instalarOQueFalta(vs2, { ambiente: {}, estado })
  await r2.resto
  checar('7a. o que foi instalado uma vez e sumiu nao volta (a pessoa tirou)', !vs2.feito.instalou.length, JSON.stringify(vs2.feito.instalou))

  const estado2 = { get: (k, p) => (k === E.CHAVE_TRAVA ? Date.now() + 60000 : p), update: () => Promise.resolve() }
  const vs3 = editor()
  const r3 = await E.instalarOQueFalta(vs3, { ambiente: {}, estado: estado2 })
  checar('7b. outra janela instalando agora: esta nao instala junto', r3.pulou === 'outraJanela' && !vs3.feito.instalou.length)

  const vs4 = editor()
  vs4.workspace = { getConfiguration: () => ({ get: (k, p) => (k === 'instalarExtensoesQueFaltam' ? false : p) }) }
  const r4 = await E.instalarOQueFalta(vs4, { ambiente: {} })
  checar('7c. a configuracao desligada respeita quem prefere instalar a mao', r4.pulou === 'configuracao' && !vs4.feito.instalou.length)
}
// ── 5 ──
{
  const vs = editor()
  const r = await E.instalarOQueFalta(vs, { ambiente: { [E.DESLIGAR]: '1' } })
  checar('5a. a chave dos testes desliga tudo', r.pulou === 'desligado' && !vs.feito.instalou.length && !vs.feito.progresso)
  const comum = fs.readFileSync(path.join(REPO, 'testes', 'comum.mjs'), 'utf8')
  checar('5b. e o ambiente dos testes a liga', comum.includes(`env.${E.DESLIGAR} = '1'`))
}
// ── 5c ── achado ao rodar a ponte: um editor sem a API de extensões DERRUBAVA a ativação inteira
{
  let lancou = null
  try { await E.instalarOQueFalta({}, { ambiente: {} }) } catch (e) { lancou = e }
  checar('5c. sem a API de extensoes: nao lanca e nao instala nada ("nao sei" nao vira "falta tudo")', !lancou, String(lancou))
  const ext = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'), 'utf8')
  checar('5d. e a ativacao protege a chamada (falha ao instalar nunca derruba a OFICINA)',
    /try \{ instalacao = await extensoesQueFaltam\.instalarOQueFalta\(/.test(ext))
}
// ── 6 ──
{
  const ext = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'), 'utf8')
  const instala = ext.indexOf('extensoesQueFaltam.instalarOQueFalta(')
  const conversa = ext.indexOf("for (const comando of ['claude-vscode.editor.openLast'")
  checar('6. na abertura, instalar vem ANTES da conversa automatica', instala > 0 && conversa > instala, `${instala} ${conversa}`)
}

const falhas = resultados.filter(r => !r.ok)
console.log(`\n  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
