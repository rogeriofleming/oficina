// O ROBÔ DA SUBIDA (V9) — `scripts/robo_upstream.mjs` e o workflow, em node puro: sem rede, sem build.
//
// O que um ciclo real prova (compilar a tag nova de ponta a ponta) só se prova compilando, e isso
// fica para o próximo build. Aqui se prova o que decide se o robô é seguro e útil:
//   1. ele só sobe tag estável, e nunca para trás;
//   2. quando um patch não aplica, o relatório diz QUAL patch, QUAIS arquivos e o TRECHO;
//   3. ele não tem como publicar: todo `gh` passa pela trava, e a trava recusa o que não é rascunho;
//   4. o workflow não usa segredo, não cola entrada do botão no comando, e roda na cadência e por botão.
//
// Uso:  node testes/robo.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const robo = await import(pathToFileURL(path.join(REPO, 'scripts', 'robo_upstream.mjs')).href)

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}
const lanca = fn => { try { fn(); return false } catch { return true } }

// ── 1. a tag ────────────────────────────────────────────────────────────────
{
  const lsRemote = [
    'aaa\trefs/tags/1.99.10',
    'bbb\trefs/tags/1.100.0',
    'bbb2\trefs/tags/1.100.0^{}',
    'ccc\trefs/tags/1.101.0-insider',
    'ddd\trefs/tags/release/1.102',
    'eee\trefs/tags/1.136.1',
    'fff\trefs/tags/1.137.0',
  ].join('\n')
  const tags = robo.tagsEstaveis(lsRemote)
  checar('robô: só tags estáveis, sem repetir a anotada (^{})', tags.join(',') === '1.137.0,1.136.1,1.100.0,1.99.10', tags.join(','))
  checar('robô: a ordem é numérica (1.100.0 é mais nova que 1.99.10)', tags.indexOf('1.100.0') < tags.indexOf('1.99.10'))

  checar('robô: sem pedido, escolhe a estável mais nova', robo.escolherTag({ atual: '1.136.1', tags }).tag === '1.137.0')
  checar('robô: já na mais nova, não faz nada', !!robo.escolherTag({ atual: '1.137.0', tags }).nada)
  checar('⛔ robô: "main" pedida pelo botão é recusada', !!robo.escolherTag({ atual: '1.136.1', tags, pedida: 'main' }).erro)
  checar('robô: pré-lançamento é recusado', !!robo.escolherTag({ atual: '1.136.1', tags, pedida: '1.101.0-insider' }).erro)
  checar('robô: tag que não existe no núcleo é recusada', !!robo.escolherTag({ atual: '1.136.1', tags, pedida: '1.200.0' }).erro)
  checar('robô: tag mais velha, ou a mesma, é recusada',
    !!robo.escolherTag({ atual: '1.136.1', tags, pedida: '1.100.0' }).erro && !!robo.escolherTag({ atual: '1.136.1', tags, pedida: '1.136.1' }).erro)
  checar('robô (controle): a tag pedida, estável, existente e mais nova, passa', robo.escolherTag({ atual: '1.100.0', tags, pedida: '1.136.1' }).tag === '1.136.1')
  checar('robô: pedido vazio (o agendado) vale como "a mais nova"', robo.escolherTag({ atual: '1.136.1', tags, pedida: '' }).tag === '1.137.0')
}

// ── 2. o conflito ───────────────────────────────────────────────────────────
// As linhas de erro abaixo são as MEDIDAS no `git apply --3way` em 12/09/2026, num repositório
// descartável: conflito de conteúdo, arquivo que sumiu, e patch que não encaixa.
{
  const log = [
    '[2/6] viabilidade: 0001-remover-gancho-do-copilot-no-empacotamento.patch',
    '[2/6] aplicando patches',
    '    patch: 0001-desktop-le-configurationDefaults-do-produto.patch',
    '    patch: 0006-update-exige-hash.patch',
    "Applied patch to 'src/vs/platform/update/electron-main/abstractUpdateService.ts' with conflicts.",
    "Applied patch to 'src/vs/outro.ts' cleanly.",
    'U src/vs/platform/update/electron-main/abstractUpdateService.ts',
    'error: src/vs/sumiu.ts: does not exist in index',
    'error: patch failed: src/vs/nao-encaixa.ts:42',
    'error: src/vs/nao-encaixa.ts: patch does not apply',
    'ERRO: um patch nosso nao aplicou na tag 1.137.0.',
  ].join('\r\n')
  const c = robo.lerConflito(log)
  checar('robô: acha o patch que parou (o último anunciado, não o primeiro)', c.patch === '0006-update-exige-hash.patch', c.patch)
  checar('robô: diz que não é patch de viabilidade', c.viabilidade === false)
  const porArquivo = Object.fromEntries(c.arquivos.map(a => [a.arquivo, a.motivo]))
  checar('robô: reconhece o conflito de conteúdo', /conflito de conteúdo/.test(porArquivo['src/vs/platform/update/electron-main/abstractUpdateService.ts'] || ''))
  checar('robô: reconhece o arquivo que sumiu', /não existe mais/.test(porArquivo['src/vs/sumiu.ts'] || ''))
  checar('robô: reconhece o patch que não encaixa, com a linha', /linha 42/.test(porArquivo['src/vs/nao-encaixa.ts'] || ''), porArquivo['src/vs/nao-encaixa.ts'])
  checar('robô (controle): o arquivo que aplicou limpo NÃO entra na lista', !('src/vs/outro.ts' in porArquivo))

  const viab = robo.lerConflito('[2/6] viabilidade: 0003-instalar-extensao-da-loja-sem-o-modulo-fechado.patch\nerror: build/x.js: does not exist in index')
  checar('robô: patch de viabilidade é marcado como tal', viab.viabilidade === true && viab.patch === '0003-instalar-extensao-da-loja-sem-o-modulo-fechado.patch')

  // O trecho sai de um patch REAL do repositório.
  const nomeDoPatch = fs.readdirSync(path.join(REPO, 'patches')).find(f => f.startsWith('0006') && f.endsWith('.patch'))
  const textoDoPatch = fs.readFileSync(path.join(REPO, 'patches', nomeDoPatch), 'utf8')
  const primeiroArquivo = (textoDoPatch.match(/^diff --git a\/(\S+)/m) || [])[1]
  const trecho = robo.trechoDoPatch(textoDoPatch, primeiroArquivo)
  checar('robô: tira do patch real o trecho do arquivo que conflitou', !!trecho && trecho.startsWith(`diff --git a/${primeiroArquivo}`) && /^@@/m.test(trecho), primeiroArquivo)
  checar('robô (controle): arquivo que o patch não toca não tem trecho', robo.trechoDoPatch(textoDoPatch, 'src/nao/existe.ts') === null)

  const md = fs.readFileSync(path.join(REPO, 'patches', nomeDoPatch.replace(/\.patch$/, '.md')), 'utf8')
  const relatorio = robo.montarRelatorio({
    atual: '1.136.1', nova: '1.137.0', etapas: [{ nome: 'aplicar os patches', ok: false }],
    conflito: { patch: nomeDoPatch, viabilidade: false, arquivos: [{ arquivo: primeiroArquivo, motivo: 'conflito de conteúdo' }] },
    patchTexto: textoDoPatch, patchMd: md,
  })
  checar('robô: o relatório diz de qual tag para qual', relatorio.includes('1.136.1 → 1.137.0'))
  checar('robô: o relatório nomeia o patch e traz o porquê dele', relatorio.includes(nomeDoPatch) && relatorio.includes('Por que o patch existe'))
  checar('robô: o relatório traz o arquivo e o trecho do patch', relatorio.includes(primeiroArquivo) && relatorio.includes('```diff'))
  checar('robô: o relatório diz que a tag antiga continua valendo', /tag antiga continua valendo/.test(relatorio))
  const semArquivo = robo.montarRelatorio({ atual: '1', nova: '2', etapas: [], conflito: { patch: 'x.patch', viabilidade: false, arquivos: [] } })
  checar('robô: sem arquivo no log, o relatório diz isso (não fica calado)', /Não achei no log qual arquivo/.test(semArquivo))
}

// ── 2b. o conflito DE VERDADE: o git desta máquina, num repositório descartável ──────────
// Sem isto, os formatos acima seriam um retrato de 12/09/2026: se uma versão futura do git mudar
// a frase, o robô para de reconhecer o conflito e este arquivo continuaria verde.
{
  const { execFileSync } = await import('node:child_process')
  const os = await import('node:os')
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-robo-'))
  const git = (...a) => execFileSync('git', ['-C', path.join(base, 'r'), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    fs.mkdirSync(path.join(base, 'r', 'src'), { recursive: true })
    execFileSync('git', ['init', '-q', path.join(base, 'r')])
    git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'core.autocrlf', 'false')
    fs.writeFileSync(path.join(base, 'r', 'src', 'nucleo.ts'), 'linha 1\nlinha 2\nlinha 3\n')
    fs.writeFileSync(path.join(base, 'r', 'src', 'vai-sumir.ts'), 'a\nb\n')
    git('add', '.'); git('commit', '-qm', 'base')
    // o patch "nosso"
    fs.writeFileSync(path.join(base, 'r', 'src', 'nucleo.ts'), 'linha 1\nlinha 2 NOSSA\nlinha 3\n')
    fs.writeFileSync(path.join(base, 'r', 'src', 'vai-sumir.ts'), 'a\nB NOSSO\n')
    const patch = git('diff')
    fs.writeFileSync(path.join(base, '0099-teste.patch'), patch)
    git('checkout', '-q', '.')
    // a "tag nova" do núcleo: mexe no mesmo trecho e apaga o outro arquivo
    fs.writeFileSync(path.join(base, 'r', 'src', 'nucleo.ts'), 'linha 1\nlinha 2 DO NUCLEO\nlinha 3\n')
    fs.rmSync(path.join(base, 'r', 'src', 'vai-sumir.ts'))
    git('commit', '-qam', 'tag nova')
    let saida = ''
    try { git('apply', '--3way', path.join(base, '0099-teste.patch')) } catch (e) { saida = String(e.stdout || '') + String(e.stderr || '') }
    const log = '    patch: 0099-teste.patch\n' + saida
    const c = robo.lerConflito(log)
    const achados = Object.fromEntries(c.arquivos.map(a => [a.arquivo, a.motivo]))
    checar('robô, com o git DE VERDADE: o apply falhou (controle: senão não há conflito para ler)', saida.length > 0, saida.slice(0, 120))
    checar('robô, com o git DE VERDADE: acha o patch e os DOIS arquivos com problema',
      c.patch === '0099-teste.patch' && !!achados['src/nucleo.ts'] && !!achados['src/vai-sumir.ts'], JSON.stringify(c) + ' // ' + saida.replace(/\s+/g, ' ').slice(0, 200))
    const rel = robo.montarRelatorio({ atual: '1.0.0', nova: '1.1.0', etapas: [{ nome: 'aplicar os patches', ok: false }], conflito: c, patchTexto: patch })
    checar('robô, com o git DE VERDADE: o relatório traz o trecho de cada arquivo',
      rel.includes('diff --git a/src/nucleo.ts') && rel.includes('diff --git a/src/vai-sumir.ts'))
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
}

// ── 3. não tem como publicar ────────────────────────────────────────────────
{
  const ok = args => !lanca(() => robo.garantirRascunho(args))
  const argsRelease = robo.argumentosDoRascunho({ tag: '1.137.0', arquivos: ['a.exe'], notas: 'n.md', repo: 'dono/repo' })
  const argsPr = robo.argumentosDoPr({ tag: '1.137.0', notas: 'n.md', repo: 'dono/repo' })
  checar('robô (controle): o rascunho de Release que ele monta passa na trava', ok(argsRelease))
  checar('robô (controle): o PR em rascunho que ele monta passa na trava', ok(argsPr))
  checar('robô: o rascunho aponta para a branch da subida, não para o main', argsRelease.includes('--target') && argsRelease[argsRelease.indexOf('--target') + 1] === 'subida/1.137.0')
  checar('⛔ robô: release SEM --draft é recusada', !ok(['release', 'create', 'x', '--repo', 'd/r']))
  checar('⛔ robô: --draft=false é recusado', !ok(['release', 'create', 'x', '--draft', '--draft=false']))
  checar('⛔ robô: editar release (o jeito de publicar um rascunho) é recusado', !ok(['release', 'edit', 'x', '--draft=false']))
  checar('robô: anexar a uma release existente é recusado (ela pode já estar publicada)', !ok(['release', 'upload', 'x', 'a.exe']))
  checar('robô: marcar como "latest" é recusado', !ok(['release', 'create', 'x', '--draft', '--latest']))
  checar('⛔ robô: mesclar PR é recusado', !ok(['pr', 'merge', '12']))
  checar('robô: PR sem --draft é recusado', !ok(['pr', 'create', '--head', 'x']))
  checar('robô: qualquer outro comando do gh é recusado', !ok(['repo', 'edit', '--visibility', 'public']))

  // O código: todo `gh` passa pela trava, e nada fala com o canal de atualização.
  const codigo = fs.readFileSync(path.join(REPO, 'scripts', 'robo_upstream.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  const chamadasGh = [...codigo.matchAll(/execFileSync\(\s*'gh'\s*,\s*([^,)]+)/g)].map(m => m[1].trim())
  checar('⛔ robô: toda chamada ao gh passa por garantirRascunho', chamadasGh.length > 0 && chamadasGh.every(a => a.startsWith('garantirRascunho(') || a === 'args'), chamadasGh.join(' | '))
  checar('robô: "args" do gh é mesmo o que saiu da trava', /const args = garantirRascunho\(/.test(codigo))
  // ⚠️ O NOME `liberar.mjs` aparece de propósito no texto do relatório (é a instrução para a pessoa).
  // O que não pode existir é CHAMADA: um comando, import ou caminho de script apontando para ele.
  checar('⛔ robô: não chama liberar.mjs', !/(rodarNode|rodarBat|spawnSync|execFileSync|import)\([^)\n]*liberar/.test(codigo) && !/'liberar\.(mjs|bat)'/.test(codigo))
  checar('⛔ robô: não fala com o armazenamento do canal de atualização', !/\bR2\b|CLOUDFLARE|wrangler|r2\/buckets/i.test(codigo))
  // Controle: a trava de cima pega a chamada, se ela existir.
  checar('robô (controle): a trava do liberar acusa uma chamada de verdade', /(rodarNode|rodarBat|spawnSync|execFileSync|import)\([^)\n]*liberar/.test("rodarNode('scripts/liberar.mjs')"))
  checar('robô: não usa spawn/exec de "gh" por outro caminho', !/spawnSync\(\s*'gh'/.test(codigo) && !/\bexecSync\(/.test(codigo))
}

// ── 4. o workflow ───────────────────────────────────────────────────────────
{
  const wf = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'subir_upstream.yml'), 'utf8')
  const semComentario = wf.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
  checar('workflow: roda na cadência trimestral', /schedule:\s*\n\s*- cron: '0 \d+ 1 1,4,7,10 \*'/.test(semComentario))
  checar('workflow: tem o botão "subir agora" (workflow_dispatch)', /workflow_dispatch:/.test(semComentario))
  checar('⛔ workflow: o agendado nasce DESLIGADO (só roda com a variável do repositório ligada, ou por botão)',
    semComentario.includes("if: github.event_name == 'workflow_dispatch' || vars.OFICINA_ROBO_LIGADO == 'true'"))
  checar('⛔ workflow: não usa segredo nenhum (só o token da própria execução)', !/secrets\./.test(semComentario))
  const linhasRun = semComentario.split('\n').filter(l => /^\s*run:/.test(l) || /^\s{10,}\S/.test(l))
  checar('⛔ workflow: entrada do botão nunca é colada dentro de um comando', !semComentario.split('\n').some(l => /run:.*\$\{\{\s*inputs/.test(l)), linhasRun.join(' / '))
  checar('workflow: a entrada do botão chega por variável de ambiente', /TAG_PEDIDA: \$\{\{ inputs\.tag \}\}/.test(semComentario))
  checar('workflow: permissões mínimas, nunca write-all', /permissions:\s*\n\s*contents: write/.test(semComentario) && !/write-all/.test(semComentario))
  checar('workflow: não publica e não mexe no canal (sem liberar, wrangler, release edit)', !/liberar|wrangler|release edit|--draft=false/.test(semComentario))
  checar('workflow: quem executa é o robô, com planejar antes', semComentario.indexOf('--planejar') > -1 && semComentario.indexOf('--planejar') < semComentario.indexOf('--executar'))
  checar('workflow: os logs ficam guardados mesmo quando para', /if: always\(\)[\s\S]*upload-artifact/.test(semComentario))
  const usos = [...semComentario.matchAll(/uses:\s*(\S+)/g)].map(m => m[1])
  checar('workflow: toda action fixada por SHA de 40 caracteres, nunca por tag', usos.length >= 2 && usos.every(u => /@[0-9a-f]{40}$/.test(u)), usos.join(' | '))
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
