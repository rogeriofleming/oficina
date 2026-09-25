// A PASTA DE SEMPRE (V27) — em node puro, com o editor de mentira.
//
// O que precisa ser verdade:
//   1. com pasta aberta, nada muda (e a conversa automática segue);
//   2. PRIMEIRA janela desta execução, vazia, com a pasta de sempre existindo: abre ela — e a conversa
//      automática NÃO sai;
//   3. JANELA NOVA (a mesma execução já abriu a pasta de sempre): NÃO sequestra — pergunta, oferecendo
//      abrir a pasta de sempre (achado de revisão: `openFolder` só dava foco à outra janela);
//   4. janela sem pasta COM ARQUIVO ABERTO: não mexe (achado de revisão: a janela era trocada e o arquivo
//      sumia);
//   5. Ctrl+T sem pasta: pergunta, mesmo na primeira janela (nunca recarrega sem perguntar);
//   6. sem pasta de sempre: pergunta; a mensagem diz o que fica de fora, sem jargão e sem prometer demais;
//   7. pasta de sempre não encontrada: não abre, pergunta dizendo qual faltou ("não foi encontrada");
//   8. escolher grava a pasta como configuração global e abre; cancelar não grava nada;
//   9. falha ao abrir a pasta é avisada (nunca calada);
//  10. a checagem da pasta tem prazo (disco de rede desconectado não pendura o host);
//  11. manifesto e ordem na abertura.
//
// Uso:  node testes/pasta_de_sempre.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const PS = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'pastaDeSempre.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

function editor({ pastas, pastaDeSempre = '', escolha, dialogo, abas = 0, abrirFalha = false } = {}) {
  const feito = { comandos: [], gravado: null, mensagens: [], avisos: [] }
  return {
    feito,
    ConfigurationTarget: { Global: 1 },
    Uri: { file: p => ({ fsPath: p }) },
    workspace: {
      workspaceFolders: pastas,
      getConfiguration: () => ({
        get: (k, padrao) => (k === PS.CHAVE ? pastaDeSempre : padrao),
        update: (k, v, alvo) => { feito.gravado = { k, v, alvo }; return Promise.resolve() },
      }),
    },
    commands: {
      executeCommand: (c, ...a) => {
        if (abrirFalha && c === 'vscode.openFolder') return Promise.reject(new Error('negado'))
        feito.comandos.push([c, ...a]); return Promise.resolve(true)
      },
    },
    window: {
      tabGroups: { all: abas ? [{ tabs: Array.from({ length: abas }, () => ({})) }] : [{ tabs: [] }] },
      showWarningMessage: (m, ...botoes) => {
        if (botoes.length) { feito.mensagens.push({ m, botoes }); return Promise.resolve(escolha) }
        feito.avisos.push(m); return Promise.resolve()
      },
      showOpenDialog: () => Promise.resolve(dialogo),
    },
  }
}
function estadoDe(inicial = {}) {
  const m = new Map(Object.entries(inicial))
  return { get: (k, p) => (m.has(k) ? m.get(k) : p), update: (k, v) => { m.set(k, v); return Promise.resolve() }, m }
}
const esperar = () => new Promise(r => setTimeout(r, 10))
const sim = () => Promise.resolve(true)
const nao = () => Promise.resolve(false)
const abriu = (vs, p) => vs.feito.comandos.some(c => c[0] === 'vscode.openFolder' && c[1].fsPath === p)

// ── 1 ──
{
  const vs = editor({ pastas: [{ uri: { fsPath: 'd:/p' } }], pastaDeSempre: 'd:/sempre' })
  const r = await PS.aoAbrir(vs, { existe: sim, estado: estadoDe(), pidDoPrograma: 1 })
  checar('1. com pasta aberta: nada muda e a conversa automatica segue', r === false && !vs.feito.comandos.length && !vs.feito.mensagens.length)
}
// ── 2 ──
{
  const vs = editor({ pastaDeSempre: 'd:/sempre' })
  const estado = estadoDe()
  const r = await PS.aoAbrir(vs, { existe: sim, estado, pidDoPrograma: 42 })
  checar('2a. primeira janela, vazia, com a pasta de sempre: abre ela', abriu(vs, 'd:/sempre'), JSON.stringify(vs.feito.comandos))
  checar('2b. e NAO sai conversa automatica', r === true)
  checar('2c. e marca esta execucao do programa', estado.m.get(PS.CHAVE_EXECUCAO) === 42)
}
// ── 3 ──
{
  const vs = editor({ pastaDeSempre: 'd:/sempre' })
  const r = await PS.aoAbrir(vs, { existe: sim, estado: estadoDe({ [PS.CHAVE_EXECUCAO]: 42 }), pidDoPrograma: 42 })
  await esperar()
  checar('3a. janela NOVA na mesma execucao: nao sequestra (nao abre a pasta sozinha)', !vs.feito.comandos.length, JSON.stringify(vs.feito.comandos))
  const msg = vs.feito.mensagens[0] || {}
  checar('3b. pergunta, oferecendo abrir a pasta de sempre pelo nome', r === true && (msg.botoes || [])[0] === 'Abrir sempre', JSON.stringify(msg.botoes))
  const vs2 = editor({ pastaDeSempre: 'd:/sempre' })
  await PS.aoAbrir(vs2, { existe: sim, estado: estadoDe({ [PS.CHAVE_EXECUCAO]: 41 }), pidDoPrograma: 42 })
  checar('3c. programa reaberto (outra execucao): a primeira janela volta a abrir sozinha', abriu(vs2, 'd:/sempre'))
}
// ── 4 ──
{
  const vs = editor({ pastaDeSempre: 'd:/sempre', abas: 1 })
  const r = await PS.aoAbrir(vs, { existe: sim, estado: estadoDe(), pidDoPrograma: 42 })
  await esperar()
  checar('4. sem pasta com ARQUIVO aberto: nao troca a janela nem pergunta (a barra avisa); e nao abre conversa',
    r === true && !vs.feito.comandos.length && !vs.feito.mensagens.length)
}
// ── 5 ──
{
  const vs = editor({ pastaDeSempre: 'd:/sempre' })
  await PS.aoAbrir(vs, { existe: sim, estado: estadoDe(), pidDoPrograma: 42, perguntar: true })
  await esperar()
  checar('5. Ctrl+T sem pasta: pergunta, mesmo na primeira janela (nunca recarrega sem perguntar)',
    !vs.feito.comandos.length && vs.feito.mensagens.length === 1)
}
// ── 6 ──
{
  const vs = editor({ pastas: [] })
  const r = await PS.aoAbrir(vs, { existe: sim, estado: estadoDe(), pidDoPrograma: 42 })
  await esperar()
  const m = (vs.feito.mensagens[0] || {}).m || ''
  checar('6a. sem pasta de sempre: pergunta, e nao abre conversa', r === true && vs.feito.mensagens.length === 1 && !vs.feito.comandos.length)
  checar('6b. a mensagem diz o que fica de fora (o que mora na pasta do projeto) e que nao ha conversa sem pasta',
    /CLAUDE\.md/.test(m) && /dentro da pasta do seu projeto/.test(m) && /não abre conversa sem pasta/.test(m), m)
  checar('6c. sem jargao interno ("travas")', !/travas/.test(m), m)
  checar('6d. as tres saidas, e a ultima e "Agora nao" (nao promete continuar)',
    JSON.stringify((vs.feito.mensagens[0] || {}).botoes) === JSON.stringify([PS.BOTAO_ESCOLHER, PS.BOTAO_SO_AGORA, 'Agora não']))
}
// ── 7 ──
{
  const vs = editor({ pastaDeSempre: 'd:/de-outra-maquina' })
  await PS.aoAbrir(vs, { existe: nao, estado: estadoDe(), pidDoPrograma: 42 })
  await esperar()
  const m = (vs.feito.mensagens[0] || {}).m || ''
  checar('7. pasta de sempre nao encontrada: nao abre, e pergunta dizendo qual faltou',
    !vs.feito.comandos.length && /d:\/de-outra-maquina/.test(m) && /não foi encontrada/.test(m), m)
}
// ── 8 ──
{
  const vs = editor({ escolha: PS.BOTAO_ESCOLHER, dialogo: [{ fsPath: 'd:/escolhida' }] })
  await PS.aoAbrir(vs, { existe: nao, estado: estadoDe(), pidDoPrograma: 42 })
  await esperar()
  checar('8a. escolher grava a pasta como configuracao global da pessoa',
    vs.feito.gravado && vs.feito.gravado.k === PS.CHAVE && vs.feito.gravado.v === 'd:/escolhida' && vs.feito.gravado.alvo === 1, JSON.stringify(vs.feito.gravado))
  checar('8b. e abre a pasta escolhida', abriu(vs, 'd:/escolhida'))
  const vs2 = editor({ escolha: PS.BOTAO_ESCOLHER, dialogo: undefined })
  await PS.aoAbrir(vs2, { existe: nao, estado: estadoDe(), pidDoPrograma: 42 })
  await esperar()
  checar('8c. cancelar a escolha nao grava nada nem abre nada', !vs2.feito.gravado && !vs2.feito.comandos.length)
  const vs3 = editor({ pastaDeSempre: 'd:/sempre', escolha: 'Abrir sempre' })
  await PS.aoAbrir(vs3, { existe: sim, estado: estadoDe({ [PS.CHAVE_EXECUCAO]: 42 }), pidDoPrograma: 42 })
  await esperar()
  checar('8d. na janela nova, o botao "Abrir <pasta>" abre a pasta de sempre', abriu(vs3, 'd:/sempre'))
}
// ── 9 ──
{
  const vs = editor({ pastaDeSempre: 'd:/sempre', abrirFalha: true })
  await PS.aoAbrir(vs, { existe: sim, estado: estadoDe(), pidDoPrograma: 42 })
  checar('9. falha ao abrir a pasta e avisada (nunca calada)', vs.feito.avisos.length === 1 && /d:\/sempre/.test(vs.feito.avisos[0]), JSON.stringify(vs.feito.avisos))
}
// ── 10 ──
{
  const t0 = Date.now()
  const r = await PS.existePasta('d:/nao-existe-mesmo-' + t0, { prazoMs: 50 })
  checar('10a. pasta inexistente: false', r === false)
  checar('10b. e a checagem e assincrona, com prazo (sem statSync pendurado)',
    !/statSync/.test(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'pastaDeSempre.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')))
}
// ── 11 ──
{
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const c = pkg.contributes.configuration.properties['oficina.' + PS.CHAVE]
  checar('11a. a configuracao existe no manifesto, texto, com escopo de maquina', c && c.type === 'string' && c.scope === 'machine', JSON.stringify(c))
  const ext = fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'), 'utf8')
  const guarda = ext.indexOf('pastaDeSempre.aoAbrir(vscode, { anotar, estado:')
  const conversa = ext.indexOf("for (const comando of ['claude-vscode.editor.openLast'")
  checar('11b. na abertura, a guarda da pasta vem ANTES da conversa automatica', guarda > 0 && conversa > guarda, `${guarda} ${conversa}`)
  checar('11c. o Ctrl+T sem pasta chama a guarda no modo "perguntar"', ext.includes('pastaDeSempre.aoAbrir(vscode, { anotar, perguntar: true })'))
}

const falhas = resultados.filter(r => !r.ok)
console.log(`\n  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
