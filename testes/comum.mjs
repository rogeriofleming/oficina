// O que TODO teste que abre a OFICINA precisa fazer igual.
//
// Este arquivo existe por causa de um erro concreto, e nao por gosto de organizar:
// a fumaca aprendeu, em 05/09/2026, que rodar de dentro de um editor SEQUESTRA o
// Electron (ver `ambienteLimpo` abaixo) — e o teste de Git, escrito no mesmo dia,
// nao aprendeu, porque a licao morava dentro do outro arquivo. Enquanto cada teste
// montar o proprio lancamento, o proximo teste vai repetir a mesma armadilha.
//
// Regra da casa: teste novo que abre o programa importa daqui. Nao copia de la.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * A extensao que o teste vai exercitar e a do REPOSITORIO? Devolve o que difere (vazio = igual).
 *
 * ⚠️ Nasceu de um achado de 10/09/2026, noite: o executavel usado nos testes de tela da V2
 * carregava `extensao.js` e `painel.js` de um commit anterior e `agente.js` de outro mais
 * velho ainda. Os consertos da revisao final nunca tinham rodado dentro do editor — e todo
 * criterio de tela ficava verde testando o codigo de ANTES. Motor e ponte leem o
 * repositorio; a tela le o executavel; ninguem conferia que os dois eram o mesmo codigo.
 *
 * Compara ignorando fim de linha (o working tree no Windows tem CRLF, o git guarda LF).
 * ⚠️ Um build de verdade pode transformar arquivo ao empacotar; se este criterio acusar
 * logo depois de um `construir.bat`, a primeira pergunta e essa — nao afrouxar a regra.
 */
export function extensaoForaDeSincronia(exe, repo, pasta = 'oficina-claude') {
  const origem = path.join(repo, 'extensoes', pasta)
  // ⚠️ NO MODO RAPIDO O DESTINO E O CLONE, e nao a pasta do executavel — porque no modo rapido
  // NAO HA executavel empacotado. A primeira versao comparava sempre contra
  // `<exe>/resources/app/extensions`, e no ciclo rapido isso devolvia
  // "(a extensao nao existe dentro do executavel)": uma FALHA que fala do produto, quando o que
  // faltava era o empacotamento que aquele modo nao faz. O efeito pratico era pior do que o
  // ruido — toda suite de tela que comeca por este criterio morria na primeira linha em modo
  // dev, e o ciclo rapido (15 s) ficava inutilizavel justamente para elas, empurrando cada
  // conferencia de tela para um build de 20 minutos.
  const destino = modoDesenvolvimento()
    ? path.join(pastaDoClone(), 'extensions', pasta)
    : path.join(path.dirname(exe), 'resources', 'app', 'extensions', pasta)
  if (!fs.existsSync(destino)) {
    return [modoDesenvolvimento()
      ? '(a extensao nao foi copiada para o clone — rode scripts/copiar_extensoes.mjs)'
      : '(a extensao nao existe dentro do executavel)']
  }
  const rastreados = execFileSync('git', ['-C', repo, 'ls-files', `extensoes/${pasta}`], { encoding: 'utf8' })
    .split('\n').map(l => l.trim()).filter(Boolean)
  const semCR = p => fs.readFileSync(p).toString('utf8').replace(/\r/g, '')
  // ⚠️ JSON se compara como JSON. O build de verdade (gulp) MINIFICA o `package.json` da
  // extensao: mesmo conteudo, outro texto — e a comparacao por texto acusaria um build
  // correto. Isto NAO afrouxa a regra: qualquer chave ou valor diferente continua acusado;
  // so o espaco em branco deixa de contar. JSON que nao abre conta como diferente.
  const mesmoJson = (a, b) => {
    try { return JSON.stringify(JSON.parse(semCR(a))) === JSON.stringify(JSON.parse(semCR(b))) } catch { return false }
  }
  // ⚠️ O que o EMPACOTAMENTO não leva, por regra dele — não conta como "falta".
  // Achado no primeiro build de verdade depois deste critério (11/09/2026): o `package-lock.json`
  // entra na pasta do build e não sai no executável, porque o filtro do núcleo o exclui de
  // propósito (`build/filters.ts`, `'!**/package-lock.json'`). Até então o critério só tinha rodado
  // contra o executável híbrido, com os arquivos copiados à mão — inclusive o lock. Só a AUSÊNCIA
  // é perdoada: se o arquivo estiver lá, é comparado como qualquer outro.
  const oEmpacotamentoNaoLeva = new Set(['package-lock.json'])
  const diferentes = []
  for (const rel of rastreados) {
    const sub = rel.slice(`extensoes/${pasta}/`.length)
    const a = path.join(origem, sub)
    const b = path.join(destino, sub)
    if (!fs.existsSync(b) && oEmpacotamentoNaoLeva.has(sub)) continue
    if (!fs.existsSync(b)) { diferentes.push(sub + ' (falta no executavel)'); continue }
    if (fs.readFileSync(a).equals(fs.readFileSync(b)) || semCR(a) === semCR(b)) continue
    if (sub.endsWith('.json') && mesmoJson(a, b)) continue
    diferentes.push(sub)
  }
  if (!rastreados.length) diferentes.push('(nenhum arquivo rastreado — o criterio nao mediu nada)')

  /*
    ⚠️ ARQUIVO NOVO QUE O GIT AINDA NAO CONHECE — o ponto cego que este criterio tinha.

    Achado em 12/09/2026, e o modo de falha e o pior que existe: a extensao NAO ATIVA e o
    portao diz que esta tudo sincronizado. Aconteceu assim — tres arquivos novos foram
    criados, `extensao.js` passou a exigir um deles, e nada foi adicionado ao git. O
    sincronizador copia o que `git ls-files` lista; os tres nao foram. O executavel ficou
    com o `extensao.js` NOVO e sem o modulo que ele exige, e o host de extensoes morreu com
    "Cannot find module './telaSessoes'" — enquanto esta funcao devolvia `[]`, porque ela
    so compara o que o git rastreia. Um arquivo invisivel para o git e invisivel para ela.

    Agora todo arquivo de CODIGO que exista na origem e nao esteja rastreado e acusado: ele
    nao vai para o build, logo o que roda la nao e o que esta aqui. E exatamente o que este
    criterio existe para dizer.
  */
  const naoRastreados = []
  const varrer = (dir, prefixo = '') => {
    let entradas = []
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entradas) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const rel = prefixo ? prefixo + '/' + e.name : e.name
      if (e.isDirectory()) { varrer(path.join(dir, e.name), rel); continue }
      // ⚠️ QUALQUER arquivo, não só código. A primeira versão deste conserto olhava
      // `.js|.mjs|.json|.css|.html` — e um ícone `.svg` novo (o painel usa um) escaparia
      // exatamente pelo mesmo buraco que os três arquivos de código escaparam, com o mesmo
      // modo de falha silencioso. Achado por revisão independente em 12/09/2026: consertar um
      // buraco por extensão é deixar as outras abertas.
      if (!rastreados.includes(`extensoes/${pasta}/${rel}`)) naoRastreados.push(rel)
    }
  }
  varrer(origem)
  for (const rel of naoRastreados) diferentes.push(rel + ' (existe aqui mas o git nao rastreia: NAO vai para o build)')

  return diferentes
}

/**
 * A extensao de TEMAS dentro do executavel e a do repositorio?
 *
 * ⚠️ Nasceu de um ponto cego achado pela revisao final da V3 (11/09/2026): a funcao acima varre so a
 * `oficina-claude`, e naquela rodada os dois temas tinham mudado. Um executavel com o tema VELHO
 * passaria pelo portao com `[]` — e todo criterio de cor estaria medindo a versao anterior, que e
 * exatamente o erro que a funcao acima existe para impedir, uma pasta ao lado.
 */
export function temasForaDeSincronia(exe, repo) {
  return extensaoForaDeSincronia(exe, repo, 'oficina-temas')
}

/**
 * Como os testes reconhecem a aba da conversa da OFICINA recem-aberta (fonte do regex,
 * para passar a `evaluate`, que roda no navegador e nao enxerga funcao do node).
 *
 * ⚠️ Ate 10/09/2026 tres testes procuravam `/^Conversa\b/`, o titulo FIXO da aba. Nesse
 * dia a aba passou a levar o nome da conversa (pedido dele): nasce "Nova conversa"
 * e vira a primeira linha do primeiro pedido. Os tres testes ficaram vermelhos com o
 * produto certo — o log mostrava a aba "Nova conversa" aberta. Por isso UM lugar so.
 *
 * ⚠️ O limite, declarado: o padrao reconhece a conversa ANTES da primeira mensagem. Os
 * testes que o usam nunca mandam mensagem; um que mande precisa de outro criterio.
 */
export const ABA_DA_CONVERSA_NOVA = '^Nova conversa\\b'

/** A pasta de trabalho do build (variavel OFICINA_BUILD). */
export const RAIZ = process.env.OFICINA_BUILD ||
  path.join(process.env.SystemDrive || 'C:', 'oficina-build')

/**
 * O playwright-core, que dirige o Electron. Resolvido de forma portatil, nesta
 * ordem, porque este repositorio nao pode conter o caminho da maquina de ninguem:
 *   1. a variavel OFICINA_PLAYWRIGHT, para quem ja tem uma instalacao (evita baixar);
 *   2. o playwright-core instalado neste repositorio (npm install na raiz).
 */
export async function carregarElectron() {
  const tentativas = []
  if (process.env.OFICINA_PLAYWRIGHT) {
    const base = process.env.OFICINA_PLAYWRIGHT
    tentativas.push(base.endsWith('.mjs') ? base : path.join(base, 'index.mjs'))
  }
  tentativas.push('playwright-core')
  for (const t of tentativas) {
    try {
      const especificador = path.isAbsolute(t) ? 'file:///' + t.replace(/\\/g, '/') : t
      const mod = await import(especificador)
      if (mod._electron) return mod._electron
    } catch { /* tenta o proximo */ }
  }
  throw new Error('nao achei o playwright-core. Rode "npm install" na raiz do repositorio, ' +
    'ou aponte a variavel OFICINA_PLAYWRIGHT para uma instalacao existente.')
}

/**
 * O CICLO RAPIDO: rodar a OFICINA direto do fonte, sem empacotar.
 *
 * Por que isto existe — e a conta que o dono do projeto fez em voz alta, com razao:
 * se cada alteracao custar um build de 20 minutos, uma versao leva dias. E o build
 * empacotado NAO e necessario para ver a maioria das mudancas.
 *
 * Rodando do fonte (`VSCODE_DEV=1`), o `product.json` e lido do DISCO a cada abertura
 * (`bootstrap-meta.ts`: `productObj = require('../product.json')`), e o codigo vem do
 * `out/`, que a compilacao incremental atualiza em segundos. Medido em 06/09/2026:
 * compilacao completa do cliente **2,9 min**, uma vez; depois disso, incremental.
 *
 * ⚠️ O que o modo dev NAO prova, e por isso o build empacotado continua existindo:
 * o icone dentro do `.exe`, o empacotamento em si, a remocao das extensoes de
 * terceiro da saida, o carimbo, e o `product.json` **embutido** nos bundles (no
 * empacotado ele NAO e lido do disco — foi medido). Regra: ciclo rapido para
 * construir; build empacotado uma vez por versao, para provar.
 *
 * Liga-se com OFICINA_DEV=1. Sem a variavel, tudo continua como estava.
 */
export function pastaDoClone() {
  return process.env.OFICINA_CLONE || path.join(RAIZ, 'vscode')
}

export function modoDesenvolvimento() {
  return process.env.OFICINA_DEV === '1'
}

/**
 * O executavel do Electron de desenvolvimento, dentro do clone.
 *
 * O nome dele acompanha o `nameShort` do nosso product.json (o `code.bat` do upstream
 * faz a mesma leitura): com "OFICINA" no produto, o arquivo e `OFICINA.exe`.
 */
export function acharExeDeDesenvolvimento() {
  const clone = pastaDoClone()
  const dir = path.join(clone, '.build', 'electron')
  if (!fs.existsSync(dir)) return null
  const exe = fs.readdirSync(dir).find(f => f.toLowerCase().endsWith('.exe') && !/unins|setup/i.test(f))
  return exe ? path.join(dir, exe) : null
}

/** O ambiente que o `code.bat` monta para rodar do fonte. */
export function ambienteDeDesenvolvimento() {
  return {
    ...ambienteLimpo(),
    NODE_ENV: 'development',
    VSCODE_DEV: '1',
    VSCODE_CLI: '1'
  }
}

/** O executavel compilado dentro da pasta de trabalho, ou o informado na linha de comando. */
export function acharExe(informado) {
  if (informado) return informado
  if (modoDesenvolvimento()) {
    const dev = acharExeDeDesenvolvimento()
    if (dev) return dev
    throw new Error('OFICINA_DEV=1, mas nao achei o Electron de desenvolvimento em ' +
      path.join(pastaDoClone(), '.build', 'electron') +
      '. Rode uma vez, dentro do clone: node build/lib/preLaunch.ts')
  }
  if (!fs.existsSync(RAIZ)) return null
  const pastas = fs.readdirSync(RAIZ, { withFileTypes: true })
    .filter(d => d.isDirectory() && /win32-x64$/.test(d.name))
    .map(d => path.join(RAIZ, d.name))
  for (const p of pastas) {
    const exe = fs.readdirSync(p).find(f => f.endsWith('.exe') && !/unins|setup/i.test(f))
    if (exe) return path.join(p, exe)
  }
  return null
}

/**
 * O carimbo que o build deixou na pasta de saida (`oficina-build.json`).
 *
 * ⚠️ Devolve `null` quando nao existe — e teste nenhum deve seguir em frente com
 * `null` sem dizer isso em voz alta. A pasta de saida tem nome FIXO e recebe tanto o
 * build de linha de base quanto o da OFICINA: sem o carimbo, o teste nao tem como
 * saber em qual dos dois esta rodando, nem se aquele binario e de agora ou sobrou de
 * uma rodada que falhou antes de empacotar.
 */
export function lerCarimbo(exe) {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(exe), 'oficina-build.json'), 'utf8'))
  } catch { return null }
}

/**
 * O ambiente com que o Electron TEM que ser lancado.
 *
 * ⚠️ O ambiente de quem roda o teste pode SEQUESTRAR o Electron.
 *
 * Se ELECTRON_RUN_AS_NODE estiver definida, qualquer Electron lancado vira Node
 * puro: nao abre janela nenhuma, recusa todas as opcoes ("bad option: --...") e o
 * playwright so consegue dizer "Process failed to launch!", que nao aponta nada.
 * E o build parece quebrado quando esta perfeito.
 *
 * Ela vem definida dentro do processo de extensoes do VS Code — ou seja, sempre que
 * o teste for disparado de um terminal ou agente que viva dentro de um editor. Foi
 * exatamente o que aconteceu em 05/09/2026: o mesmo instrumento passou de madrugada
 * (rodado por uma tarefa agendada, fora do editor) e falhou de manha (rodado de
 * dentro dele). O que mudou nao foi o build: foi quem chamou.
 *
 * As VSCODE_* saem junto porque apontam para o perfil, o cache e o socket do editor
 * de quem esta no computador — o teste tem que abrir um programa limpo, nao herdar
 * a sessao de ninguem.
 */
export function ambienteLimpo() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  for (const chave of Object.keys(env)) {
    if (chave.startsWith('VSCODE_')) delete env[chave]
  }
  // V27: a primeira abertura instala as extensões que faltam (`extensoesQueFaltam.js`). Os testes abrem
  // com a pasta de extensões VAZIA de propósito — o padrão de fábrica — e cada abertura baixaria ~250 MB.
  env.OFICINA_SEM_INSTALAR_EXTENSOES = '1'
  return env
}

/**
 * Tira a janela do teste da FRENTE de quem esta usando o computador.
 *
 * Um teste que abre o editor de verdade abre uma janela de verdade, que rouba o foco e
 * pisca na cara de quem esta trabalhando. Rodar a regressao inteira significa fazer
 * isso uma duzia de vezes seguidas — e o dono da maquina pediu, com todas as letras,
 * que parasse.
 *
 * Nao da para rodar sem janela: o Electron do VS Code nao tem modo headless de
 * verdade, e o workbench so existe quando ha janela. O que da e MOVER a janela para
 * fora da area visivel. Ela continua existindo, pintando e respondendo — o Playwright
 * fala com ela pelo protocolo do Chrome, nao pela tela, entao seletor, medicao de
 * layout e ate `screenshot` continuam funcionando iguais.
 *
 * Quem quiser assistir ao teste roda com OFICINA_MOSTRAR_JANELA=1.
 */
export async function esconderJanela(app) {
  if (process.env.OFICINA_MOSTRAR_JANELA === '1') return false
  try {
    return await app.evaluate(({ BrowserWindow }) => {
      const janelas = BrowserWindow.getAllWindows()
      if (!janelas.length) return false
      for (const j of janelas) {
        // Longe o bastante para nao aparecer em monitor nenhum, e sem minimizar:
        // janela minimizada no Windows pode parar de pintar, e ai a foto sai preta.
        j.setPosition(-32000, -32000)
        // ⚠️ NADA de `setSkipTaskbar`, `hide()` ou `minimize()`.
        //
        // A primeira versao disto chamava `setSkipTaskbar(true)` junto — e o teste
        // passou a deixar o programa VIVO depois de terminar. Dez processos ficaram
        // pendurados em 06/09/2026, e foram eles que travaram a pasta de saida do
        // build seguinte: `EBUSY: resource busy or locked` depois de 13 minutos de
        // compilacao, com uma mensagem que nao fala de teste nenhum.
        //
        // Mover a janela e inofensivo: nao muda o ciclo de vida dela. Tirar da barra
        // de tarefas e esconder mexem no estado que o desligamento usa. A diferenca
        // entre as duas coisas custou um build.
      }
      return true
    })
  } catch {
    // Nao conseguir esconder nao pode reprovar teste nenhum: e conforto, nao criterio.
    return false
  }
}

/**
 * Abre a OFICINA — do build empacotado OU do fonte, conforme OFICINA_DEV.
 *
 * Todo teste que abre o programa deveria passar por aqui: e o unico jeito de os dois
 * modos nao divergirem, e de o ciclo rapido valer para todos os testes de uma vez em
 * vez de ser reescrito em cada um.
 *
 * A diferenca entre os modos e so o lancamento:
 *   - empacotado: o `.exe` da pasta de saida, sozinho;
 *   - fonte: o Electron de `.build/electron`, recebendo o CLONE como primeiro
 *     argumento (e de la que ele carrega o `main.js`), com `VSCODE_DEV=1` — a mesma
 *     coisa que o `code.bat` do upstream faz.
 */
export async function abrirOficina(_electron, { exe, projeto, area, opcoes = {}, argsExtras = [] }) {
  const dev = modoDesenvolvimento()
  const clone = pastaDoClone()
  const args = [
    ...(dev ? [clone] : []),
    ...argumentosDeTeste(projeto, area, opcoes),
    ...argsExtras
  ]
  return await _electron.launch({
    executablePath: exe,
    env: dev ? ambienteDeDesenvolvimento() : ambienteLimpo(),
    ...(dev ? { cwd: clone } : {}),
    args,
    timeout: 120000
  })
}

/**
 * Que build e este? — respondido por ENTRADA, nunca por deducao.
 *
 * No empacotado vem do carimbo que o build deixou na pasta. Rodando do fonte nao ha
 * carimbo (nao houve build), entao a resposta vem do `product.json` do clone, que e
 * exatamente o arquivo que aquele Electron vai ler. Sem isto, todo teste que exige
 * carimbo recusaria o modo dev — e o ciclo rapido morreria na primeira linha.
 */
export function lerCarimboOuDev(exe) {
  if (modoDesenvolvimento()) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(pastaDoClone(), 'product.json'), 'utf8'))
      return {
        modo: p.nameLong === 'OFICINA' ? 'oficina' : 'puro',
        tag: '(do fonte)',
        quando: 'agora',
        produto: `${p.nameShort} / ${p.nameLong}`,
        doFonte: true
      }
    } catch { return null }
  }
  return lerCarimbo(exe)
}

/**
 * Fecha o programa e CONFERE que ele morreu.
 *
 * `app.close()` do playwright pede o fechamento e volta — mas voltar nao e o mesmo que
 * ter fechado. Em 06/09/2026 um teste saiu com codigo 0, gravou o laudo e deixou
 * **dez** processos do editor vivos; o build seguinte morreu ao tentar apagar a pasta
 * de saida que eles seguravam. O teste dizia que tinha terminado. Nao tinha.
 *
 * Aqui o processo e encerrado pelo PID que ESTE script lancou — nunca por nome. Nome de
 * processo nao diz de quem o processo e, e esta maquina e usada por outra pessoa ao
 * mesmo tempo. `taskkill /T` leva junto a arvore de filhos (GPU, renderers, utility),
 * que sao filhos DESTE pid e de mais ninguem.
 */
export async function fecharApp(app) {
  let pid = null
  try { pid = app.process()?.pid ?? null } catch { /* segue com o close mesmo assim */ }
  try { await app.close() } catch { /* ja pode ter caido */ }
  if (!pid) return { pid: null, precisouForcar: false }

  const vivo = () => {
    try { process.kill(pid, 0); return true } catch { return false }
  }
  // Um instante para o desligamento normal acontecer. Se ele funcionou, nada abaixo roda.
  for (let i = 0; i < 20 && vivo(); i++) await new Promise(r => setTimeout(r, 250))
  if (!vivo()) return { pid, precisouForcar: false }

  try {
    const { execFileSync } = await import('node:child_process')
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
    console.log(`  nota  o programa nao fechou sozinho; encerrei a arvore do pid ${pid} que este teste lancou`)
  } catch { /* se nem isso funcionou, o teste ja terminou; o laudo e o que vale */ }
  return { pid, precisouForcar: true }
}

/**
 * Tirar foto da janela — SEMPRE por aqui, nunca por `pagina.screenshot()` cru.
 *
 * ⚠️ `page.screenshot()` do playwright espera as animacoes "estabilizarem" antes de
 * disparar. O cursor do terminal integrado pisca PARA SEMPRE: com o terminal aberto,
 * a foto nunca sai e o teste morre de timeout — parecendo que o produto travou,
 * quando quem travou foi o instrumento. `animations: 'disabled'` congela a animacao
 * e a foto sai na hora.
 *
 * Medido por uma revisao independente do ciclo da V0, em 05/09/2026: o mesmo script trava
 * sem a opcao e passa com ela, sem nada mudar no build.
 */
export async function tirarFoto(pagina, caminho) {
  await pagina.screenshot({ path: caminho, animations: 'disabled' })
  return caminho
}

/**
 * Os argumentos de linha de comando que abrem o programa numa area descartavel:
 * o teste NUNCA usa o perfil de quem esta no computador.
 *
 * ⚠️ `pularBoasVindas` (ligado por padrao) MASCARA duas configuracoes do produto.
 *
 * `--skip-welcome` faz o editor abrir sem a aba de boas-vindas por LINHA DE COMANDO —
 * ou seja, o mesmo resultado que `workbench.startupEditor: none` e
 * `workbench.welcomePage.experimentalOnboarding: false` deveriam produzir sozinhos.
 * Quem mede se o PRODUTO aplica esses dois padroes precisa abrir SEM a bandeira,
 * senao a tela fica certa pelo motivo errado e o teste fica verde com o produto
 * quebrado. Os testes que so precisam do editor aberto continuam pulando: para eles
 * a aba de boas-vindas e ruido que atrasa e atrapalha os seletores.
 */
/**
 * INSTALA A CONVERSA OFICIAL no perfil descartável de um teste.
 *
 * ⚠️ POR QUE ISTO PRECISOU EXISTIR (V20). Os testes de tela rodam num `--extensions-dir` vazio, de
 * propósito: perfil limpo é o que prova o padrão de fábrica. Só que na V20 a conversa do produto
 * passou a ser a da extensão OFICIAL (t187) — e num perfil sem ela o produto cai no caminho de
 * volta (o painel próprio). Ou seja: os critérios da abertura ficavam verdes provando o caminho
 * que quase ninguém vai ver. Um revisor independente apontou isso antes do build.
 *
 * Instala do `.vsix` em CACHE, nunca da loja: a versão testada é exatamente a que foi conferida, e
 * o teste não depende da rede nem do dia.
 *
 * Devolve `true` quando instalou, `false` quando não havia `.vsix` em cache — e quem chama decide
 * se isso é "pular" ou "reprovar". Nunca lança.
 */
export function instalarConversaOficial(area, { raiz = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build') } = {}) {
  try {
    const cache = path.join(raiz, 'extensoes-cache')
    const vsix = fs.readdirSync(cache).filter(f => f.startsWith('anthropic.claude-code') && f.endsWith('.vsix')).sort().pop()
    if (!vsix) return false
    const cli = path.join(raiz, 'VSCode-win32-x64', 'bin', 'oficina.cmd')
    if (!fs.existsSync(cli)) return false
    execFileSync('cmd', ['/c', cli, '--install-extension', path.join(cache, vsix),
      '--extensions-dir', path.join(area, 'extensoes'), '--force'],
      { stdio: 'ignore', timeout: 180000 })
    return fs.existsSync(path.join(area, 'extensoes'))
  } catch { return false }
}

export function argumentosDeTeste(projeto, area, opcoes = {}) {
  const { pularBoasVindas = true } = opcoes
  return [
    projeto,
    '--user-data-dir=' + path.join(area, 'dados'),
    '--extensions-dir=' + path.join(area, 'extensoes'),
    ...(pularBoasVindas ? ['--skip-welcome'] : []),
    '--skip-release-notes', '--disable-workspace-trust',
    '--disable-updates', '--no-sandbox', '--disable-telemetry',
    // ⚠️ Idioma FIXO. Varios testes casam com texto da interface ("Modified",
    // "Untracked", nomes de comando). O Windows desta casa esta em pt-BR, e o idioma
    // de exibicao do editor mora em ~/<dataFolderName>/argv.json — que fica FORA do
    // --user-data-dir descartavel, ou seja, e estado compartilhado entre o teste e
    // quem usa o computador. Sem fixar, instalar um pacote de idioma faria testes
    // verdes virarem vermelhos sem nada ter mudado no produto.
    '--locale=en'
  ]
}

/**
 * Abre a paleta de comandos, com o teto de paciencia que a webview exige.
 *
 * ⚠️ ESTA FUNCAO MORA AQUI DESDE 10/09/2026 — antes ela era uma copia dentro de
 * `extensao_claude.mjs`, e a V1 fechou com esta anotacao no historico do projeto:
 *
 *   "o about.mjs e o boas_vindas.mjs ainda nao tem o teto de paciencia alinhado (...)
 *    a anotacao existe para quando falhar, para ninguem procurar defeito no produto."
 *
 * A previsao se cumpriu na V2: com o painel NOSSO abrindo sempre, ha webview com foco
 * em toda abertura, e o `about.mjs` passou a nao achar a paleta. O produto estava
 * certo; o teste e que mandava a tecla para dentro de um HTML.
 *
 * A licao maior nao e o teto: e que ela estava aplicada num arquivo e nao nos outros.
 * Por isso agora e UMA funcao, e nao tres.
 *
 * O teto de 8 NAO afrouxa criterio nenhum: se a paleta nao abrir em 8 tentativas, quem
 * chama reprova. Ele so impede que o vermelho seja sobre a maquina estar ocupada.
 */
export async function abrirPaleta(win, respirar) {
  for (let tentativa = 1; tentativa <= 8; tentativa++) {
    // ⚠️ TIRAR O FOCO DA WEBVIEW ANTES DE MANDAR A TECLA. Reenviar o atalho ajudava,
    // mas nao atacava a causa: enquanto o foco esta dentro da webview, a tecla e dela.
    // Um clique na barra de titulo devolve o foco ao workbench sem alterar a tela.
    try {
      await win.locator('#workbench\.parts\.titlebar').first().click({ timeout: 2000 })
    } catch { /* sem barra de titulo visivel: tenta a tecla assim mesmo */ }
    // ⚠️ A tecla vai para o WORKBENCH, nao para a pagina: `keyboard.press` no nivel da
    // pagina entrega a tecla ao HTML da webview e o atalho do editor nunca acontece.
    await win.locator('.monaco-workbench').first().press('Control+Shift+P')
    try {
      await win.waitForSelector('.quick-input-widget', { timeout: 5000 })
      if (tentativa > 1) console.log(`  nota  a paleta so abriu na ${tentativa}a tentativa de atalho`)
      return true
    } catch { await respirar(500) }
  }
  return false
}

/**
 * ESCREVE NA PALETA E CONFIRMA QUE O TEXTO ENTROU — o passo que faltava depois de `abrirPaleta`.
 *
 * ⚠️ POR QUE ISTO PRECISOU EXISTIR (24/09/2026). `abrirPaleta` resolve a metade dela: a paleta
 * ABRE. Mas `win.keyboard.type(...)` logo depois manda as teclas para quem tiver o foco naquele
 * instante — e sob carga (a bateria inteira rodando) a caixa da paleta ainda nao o tem. O texto
 * cai no vazio, a paleta fica mostrando a lista de comandos SEM FILTRO, e quem le a lista acha que
 * o comando procurado nao existe.
 *
 * Medido: `tela_limite_barra.mjs` reprovou nos DOIS temas dentro da regressao, com a lista
 * generica em ordem alfabetica no detalhe ("Accounts: Manage Accounts", "Add Data Breakpoint"...),
 * e passou 48/48 rodada sozinha minutos depois. Teste que so falha sob carga e pior que teste
 * vermelho: passa por sorte e ensina a ignorar o vermelho quando ele aparece.
 *
 * O conserto nao e esperar mais: e ESCREVER NO CAMPO e conferir que o valor ficou la. Se nao
 * ficou, tenta de novo; esgotado, devolve `false` e quem chama decide — nunca segue medindo uma
 * lista que nao foi filtrada.
 *
 * ⚠️ `Control+Shift+P` ja deixa o `>` na caixa. O texto entra DEPOIS dele, entao a conferencia
 * aceita que o valor lido comece com `>`.
 */
export async function digitarNaPaleta(win, respirar, texto, tentativas = 4) {
  const campo = win.locator('.quick-input-widget .monaco-inputbox input, .quick-input-box input').first()
  const querido = texto.replace(/^>/, '').trim()
  let ultimoValor = null, ultimoErro = null

  for (let i = 1; i <= tentativas; i++) {
    try {
      // ⚠️ `fill` e NAO `click` + `type`. Medido em 24/09/2026: em `tela_limite_barra.mjs`, que
      // ENCOLHE a janela de proposito para medir a barra, o `click` no campo estourava o teto e a
      // funcao desistia — o conserto que eu tinha escrito para uma suite quebrou a outra. `fill`
      // foca o elemento sozinho e nao depende de o ponto de clique estar visivel.
      //
      // ⚠️ E O PREFIXO `>` E PRESERVADO. `Control+Shift+P` abre a paleta em modo COMANDO, com `>`
      // na caixa; escrever por cima sem ele muda a paleta para o modo "ir para arquivo", e a lista
      // que volta nao e de comandos. Quem chama passa o texto com ou sem `>`, e aqui ele e
      // recolocado quando ja estava la.
      const jaTinha = (await campo.inputValue({ timeout: 2000 })).startsWith('>')
      await campo.fill((jaTinha || texto.startsWith('>') ? '>' : '') + querido)
    } catch (e) {
      ultimoErro = String((e && e.message) || e).slice(0, 120)
      await respirar(400)
      continue
    }
    await respirar(600)
    try { ultimoValor = await campo.inputValue({ timeout: 2000 }) }
    catch (e) { ultimoErro = String((e && e.message) || e).slice(0, 120) }
    if (ultimoValor !== null && ultimoValor.replace(/^>/, '').trim() === querido) {
      if (i > 1) console.log(`  nota  o texto da paleta so entrou na ${i}a tentativa`)
      return true
    }
    await respirar(500)
  }
  // ⚠️ O QUE FALHOU TEM DE APARECER. Sem isto, quem le so ve "nao entrou" e volta a adivinhar —
  // que foi exatamente o que me custou uma corrida inteira desta suite.
  console.log(`  nota  a caixa da paleta nao recebeu "${querido}": ultimo valor lido = ${JSON.stringify(ultimoValor)}${ultimoErro ? ' · erro: ' + ultimoErro : ''}`)
  return false
}

/**
 * Abre um arquivo da pasta do projeto NO EDITOR, e so devolve quando ele esta na tela.
 *
 * ⚠️ POR QUE ISTO NAO E "Ctrl+Shift+P e digitar o nome". Foi exatamente o que a suite das
 * acoes fazia, e ela nunca abriu arquivo nenhum: `Ctrl+Shift+P` abre a paleta ja com `>`,
 * que e o modo COMANDO. Digitar `conta.js` ali procura um COMANDO chamado `conta.js`, a
 * lista responde "No matching commands", o Enter nao faz nada e o editor continua vazio.
 * Medido em 12/09/2026, lado a lado: pelo `>` o editor nao existia (`.monaco-editor`
 * ausente); por `Ctrl+P` a aba abriu com o conteudo certo.
 *
 * ⚠️ E o modo de falha era o pior: a suite seguia adiante sem arquivo, logo sem selecao, e
 * as tres acoes seguintes reprovavam por "o pedido nao chegou" — apontando para o produto,
 * quando o defeito era do instrumento.
 *
 * Devolve `{ abriu, aba, texto }` para quem chama medir, em vez de so confiar.
 */
export async function abrirArquivo(win, respirar, nome) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    // Mesmo cuidado de foco de `abrirPaleta`: dentro da webview a tecla e dela.
    try {
      await win.locator('#workbench\.parts\.titlebar').first().click({ timeout: 2000 })
    } catch { /* sem barra de titulo visivel: tenta a tecla assim mesmo */ }
    await win.locator('.monaco-workbench').first().press('Control+P')
    try {
      await win.waitForSelector('.quick-input-widget', { timeout: 5000 })
    } catch { await respirar(500); continue }
    await win.keyboard.type(nome)
    await respirar(1800)
    await win.keyboard.press('Enter')
    /*
      Espera o arquivo ESTAR na tela, em vez de dormir um tempo fixo e torcer.

      ⚠️ E "na tela" inclui O TEXTO PINTADO, nao so a aba existir. A primeira versao desta
      funcao devolvia assim que a aba aparecia e media o texto num segundo `evaluate` logo
      depois: na corrida de 12/09/2026 a aba `conta.js` ja estava la e as linhas do editor
      ainda vinham vazias, entao quem chamou reprovou "o arquivo abriu no editor" com o
      arquivo aberto. Instrumento que perde a corrida por milissegundos acusa o produto
      no lugar de acusar a si mesmo.
    */
    for (let i = 0; i < 20; i++) {
      await respirar(500)
      const visto = await win.evaluate(alvo => ({
        abriu: !!document.querySelector('.monaco-editor'),
        aba: [...document.querySelectorAll('.tabs-container .tab.active')].map(t => t.textContent.trim())[0] || '',
        temAba: [...document.querySelectorAll('.tabs-container .tab')].some(t => (t.textContent || '').includes(alvo)),
        // ⚠️ O EDITOR NAO PINTA ESPACO COMUM. O Monaco desenha os espacos como
        // nao-quebraveis (U+00A0), entao `texto.includes('function somar')` dava FALSO com a
        // frase inteira na tela -- medido em 12/09/2026, com o codigo visivel no proprio log da
        // falha. Quem compara texto de tela com texto de arquivo normaliza antes, sempre.
        texto: [...document.querySelectorAll('.monaco-editor .view-line')].map(e => e.textContent)
          .join(String.fromCharCode(10)).replace(new RegExp(String.fromCharCode(160), 'g'), ' '),
      }), nome)
      if (visto.abriu && visto.temAba && visto.texto.trim()) {
        return { abriu: true, aba: visto.aba, texto: visto.texto }
      }
    }
    if (tentativa < 3) { try { await win.keyboard.press('Escape') } catch { } ; await respirar(800) }
  }
  return { abriu: false, aba: '', texto: '' }
}

/**
 * O que o editor tem SELECIONADO agora, pela propria barra de status ("Ln 4, Col 1 (40 selected)").
 *
 * ⚠️ Existe porque "tem editor na tela" NAO e "tem selecao". A suite das acoes conferia so o
 * primeiro e mandava o pedido; sem selecao a extensao recusa em silencio (ela so escreve um
 * aviso na barra de status), e a falha chegava como "o pedido nao chegou a conversa" — de novo
 * culpando o produto por um passo que o teste nao tinha dado.
 */
export async function selecaoDoEditor(win) {
  return await win.evaluate(() => {
    const status = [...document.querySelectorAll('.statusbar-item')]
      .map(e => e.textContent.trim()).find(t => /Ln \d+, Col \d+/.test(t)) || ''
    const casado = status.match(/\((\d+)\s+selected\)|\((\d+)\s+selecionados?\)/)
    return {
      status,
      caracteres: casado ? Number(casado[1] || casado[2]) : 0,
      pedacosDesenhados: document.querySelectorAll('.monaco-editor .selected-text').length,
    }
  })
}

/**
 * OS ÍCONES DAS VISTAS — achados ONDE ELES ESTIVEREM, em um lugar só do código.
 *
 * ⚠️ POR QUE ISTO EXISTE, e por que não é só um atalho.
 *
 * Esses ícones já moraram em TRÊS lugares em três versões: na barra de atividade vertical
 * (V0–V19), no cabeçalho da barra lateral (V20, `activityBar.location: "top"`) e na barra de
 * TÍTULO (V21, patch 0022 — o pedido `t198` cumprido de verdade). Cada mudança dessas quebrou
 * suítes que usavam a barra apenas como MEIO de abrir uma vista, e o erro que elas davam era
 * `o ícone "X" não está na barra lateral` — que soa como defeito do produto, e não era.
 *
 * Na última mudança de lugar, QUATRO suítes foram reorientadas à mão por causa disso. A causa
 * não era o produto mudar de lugar: era cada teste ter o seu próprio seletor. Com um lugar só, a
 * próxima mudança de lugar custa uma linha aqui.
 *
 * O seletor é `.composite-bar`, que o núcleo cria em qualquer um dos três lugares
 * (`compositeBar.ts`: `parent.appendChild($('.composite-bar'))`) — de propósito sem prefixo de
 * parte, porque é a parte que muda.
 */
const SELETOR_DOS_ICONES = '.composite-bar .action-item'

/** Os rótulos dos ícones de vista VISÍVEIS, sem o atalho do fim ("Explorer (Ctrl+Shift+E)" → "Explorer"). */
export function iconesDasVistas(win) {
  return win.evaluate(seletor =>
    [...document.querySelectorAll(seletor)]
      .filter(li => li.getBoundingClientRect().height > 0)
      .map(li => (li.querySelector('.action-label')?.getAttribute('aria-label') || '').replace(/\s*\(.*$/, '').trim())
      .filter(Boolean), SELETOR_DOS_ICONES)
}

/**
 * Clica no ícone de vista cujo rótulo COMEÇA com `rotulo`.
 *
 * O clique vai no ITEM inteiro, não no rótulo: o selo de contagem (o "2" do Git) fica por cima
 * do ícone e tomaria o clique. E o rótulo muda com o estado (o do Git ganha "- 2 pending
 * changes"), então a busca é por começo, não por igualdade.
 */
export async function clicarNoIconeDaVista(win, rotulo, opcoes = {}) {
  const alvo = await win.evaluateHandle(([seletor, r]) =>
    [...document.querySelectorAll(seletor)]
      .find(li => ((li.querySelector('.action-label')?.getAttribute('aria-label')) || '').startsWith(r)),
    [SELETOR_DOS_ICONES, rotulo])
  const el = alvo.asElement()
  if (!el) {
    const tem = await iconesDasVistas(win)
    throw new Error(`o icone "${rotulo}" nao esta na barra de icones (os que estao: ${tem.join(', ') || 'nenhum'})`)
  }
  await el.click(opcoes)
}
