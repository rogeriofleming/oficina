// Copia as extensoes embutidas para dentro do clone antes de compilar.
//
// Uma extensao "embutida" (built-in) ja vem no programa: quem instala nao precisa
// procurar na loja. E assim que a OFICINA entrega o que e dela sem depender da
// Open VSX estar no ar.
//
// Uso: node copiar_extensoes.mjs <clone> <repo> [caminho da camada privada]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const [clone, repo, camada] = process.argv.slice(2)
const destino = path.join(clone, 'extensions')

function copiarPasta(de, para) {
  fs.mkdirSync(para, { recursive: true })
  for (const item of fs.readdirSync(de, { withFileTypes: true })) {
    // node_modules de extensao nao viaja: cada build reinstala o que precisar.
    if (item.name === 'node_modules' || item.name === '.git') continue
    const o = path.join(de, item.name), d = path.join(para, item.name)
    if (item.isDirectory()) copiarPasta(o, d)
    else fs.copyFileSync(o, d)
  }
}

/**
 * Instala as dependencias da extensao JA COPIADA.
 *
 * Desde a V2 a extensao da conversa depende do Agent SDK, e `node_modules` nao viaja
 * (nem no repositorio, nem nesta copia — o SDK traz um binario de centenas de MB, e
 * copiar isso a cada build seria minutos por rodada).
 *
 * ⚠️ `npm ci` e nao `npm install`: o lock e quem manda. Um `install` aqui poderia
 * resolver uma versao diferente da que foi testada, dentro do build, sem ninguem ver.
 *
 * ⚠️ FALHA AQUI ABORTA O BUILD. A tentacao e seguir e "resolver depois": o resultado
 * seria um editor que abre bonito e cuja conversa nao funciona — o unico defeito que
 * este projeto nao pode entregar, porque a conversa E o produto.
 */
function instalarDependencias(pasta, nome) {
  const manifesto = path.join(pasta, 'package.json')
  if (!fs.existsSync(manifesto)) return
  const deps = JSON.parse(fs.readFileSync(manifesto, 'utf8')).dependencies
  if (!deps || Object.keys(deps).length === 0) return

  const temLock = fs.existsSync(path.join(pasta, 'package-lock.json'))
  const comando = temLock ? 'ci' : 'install'
  if (!temLock) {
    console.log(`  ⚠️  ${nome}: sem package-lock.json — instalando com "npm install".`)
    console.log('      O lock deveria estar versionado; sem ele a versao instalada aqui')
    console.log('      pode nao ser a que foi testada.')
  }

  console.log(`  instalando dependencias de ${nome} (npm ${comando})...`)

  // ⚠️ O npm e chamado pelo NODE, apontando para o `npm-cli.js` — nao por `npm`,
  // nem por `npm.cmd`, nem com `shell: true`. Os tres caminhos foram tentados em
  // 10/09/2026 e cada um falha do seu jeito nesta maquina (Node 24, Windows):
  //
  //   shell: true   → funciona, mas o proprio Node avisa (DEP0190) que os argumentos
  //                   sao CONCATENADOS numa linha de comando em vez de passados um a
  //                   um. O `cwd` aqui vem de fora e um dia tera espaco ou aspas.
  //   'npm.cmd'     → EINVAL. Desde a correcao da injecao de argumentos em .cmd/.bat,
  //                   o Node RECUSA executar esses arquivos sem shell. Foi o que
  //                   quebrou a primeira tentativa de conserto: o `npm ci` saiu com
  //                   `status: null` e a copia abortou.
  //   'npm'         → ENOENT. No Windows nao existe um `npm` sem extensao.
  //
  // Chamar o script com o proprio node nao usa shell, nao toca em `.cmd` e nao depende
  // do PATH — e por isso resolve os tres de uma vez.
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const usarCli = fs.existsSync(cli)
  const r = usarCli
    ? spawnSync(process.execPath, [cli, comando, '--omit=dev', '--no-audit', '--no-fund'],
      { cwd: pasta, stdio: 'inherit' })
    // Fora do Windows (ou num node empacotado sem o npm ao lado), o `npm` do PATH
    // resolve normalmente e nada disso se aplica.
    : spawnSync('npm', [comando, '--omit=dev', '--no-audit', '--no-fund'],
      { cwd: pasta, stdio: 'inherit' })

  // ⚠️ `status` vem `null` quando o processo NEM CHEGOU A RODAR — e um `null` cai no
  // `!== 0` sem dizer por que. A causa real fica em `r.error`, e sem imprimi-la a
  // mensagem de erro acusa o npm por um problema que e de quem o chamou.
  if (r.error) {
    console.error(`\nERRO: nao consegui EXECUTAR o npm para ${nome}: ${r.error.code || r.error.message}`)
    console.error(`Comando: ${usarCli ? process.execPath + ' ' + cli : 'npm'} ${comando}`)
    process.exit(1)
  }

  if (r.status !== 0) {
    console.error(`\nERRO: nao instalei as dependencias de ${nome} (npm saiu ${r.status}).`)
    console.error('A conversa da OFICINA nao funciona sem elas — parando aqui, de proposito.')
    process.exit(1)
  }
}

let n = 0
for (const origem of [path.join(repo, 'extensoes'), camada && camada !== '0' ? path.join(camada, 'extensoes') : null]) {
  if (!origem || !fs.existsSync(origem)) continue
  for (const ext of fs.readdirSync(origem, { withFileTypes: true })) {
    if (!ext.isDirectory()) continue
    const de = path.join(origem, ext.name)
    const alvo = path.join(destino, ext.name)
    copiarPasta(de, alvo)
    // ⚠️ Só instala quando a ORIGEM é uma extensão inteira (tem manifesto). A camada da
    // equipe pode sobrepor só um arquivo de uma extensão que já veio do repositório (o logo
    // do "Nova conversa"); instalar de novo ali rodaria o `npm ci` duas vezes por build.
    if (!fs.existsSync(path.join(de, 'package.json'))) {
      console.log('  sobreposta: ' + ext.name + ' (arquivos da camada por cima da do repositorio)')
      continue
    }
    instalarDependencias(alvo, ext.name)
    console.log('  embutida: ' + ext.name)
    n++
  }
}
/**
 * V27 — AS EXTENSOES DA LOJA QUE VAO DENTRO DO INSTALADOR (`extensoes/embutidas-da-loja.txt`).
 *
 * Ate a V26 as extensoes da Open VSX (`lista.txt`) so eram instaladas no PERFIL da maquina de
 * desenvolvimento, por `instalar_extensoes.mjs` — o instalador levava apenas as de `extensoes/`. Por
 * isso quem instalava a OFICINA nao tinha leitor de PDF nem de slide. Estas sao abertas do `.vsix` que
 * `baixar_extensoes.mjs` ja conferiu (nunca baixadas aqui) e copiadas como embutidas.
 *
 * ⚠️ O `node_modules` DELAS VIAJA, ao contrario do das nossas: o `.vsix` ja traz as dependencias
 * empacotadas pelo autor, e nao ha lock nem fonte para um `npm ci` refazer. QUANDO HA — o
 * vscode-office nao tem pasta nenhuma (usa bundler); ver abaixo o que isso quebrava.
 *
 * ⚠️ FALTAR O `.vsix` ABORTA — mesma razao do `npm ci` acima: um instalador sem o leitor que a lista
 * promete sairia "verde" e errado.
 */
function extensoesDaLojaEmbutidas() {
  const lista = path.join(repo, 'extensoes', 'embutidas-da-loja.txt')
  if (!fs.existsSync(lista)) return 0
  const ids = fs.readFileSync(lista, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const cache = path.join(process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build'), 'extensoes-cache')
  // O `tar` do Windows (bsdtar) abre zip; o do Git Bash (GNU) nao. Por isso o caminho e explicito.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip'
  let feitas = 0
  for (const id of ids) {
    const vsix = fs.existsSync(cache)
      // A versão MAIS NOVA por número, não por texto (revisão): como texto, "4.10.0" vem antes de
      // "4.2.0", e com duas versões no cache a velha seria embutida calada.
      ? fs.readdirSync(cache).filter(f => f.startsWith(id + '-') && f.endsWith('.vsix'))
        .sort((a, b) => {
          const v = f => (f.slice(id.length + 1).match(/^(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number)
          const [x, y] = [v(a), v(b)]
          for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
          return 0
        }).pop()
      : null
    if (!vsix) {
      console.error(`\nERRO: ${id} esta em embutidas-da-loja.txt mas nao ha .vsix dele em ${cache}.`)
      console.error('Rode antes: node scripts/baixar_extensoes.mjs')
      process.exit(1)
    }
    const temporaria = path.join(destino, '.abrindo-' + id)
    // Sobra de uma corrida interrompida sai antes: o `tar` sobrescreve mas não apaga, e misturaria
    // arquivos de duas versões (revisão). É material do build, refeito a cada corrida.
    fs.rmSync(temporaria, { recursive: true, force: true })
    fs.mkdirSync(temporaria, { recursive: true })
    const r = process.platform === 'win32'
      ? spawnSync(tar, ['-xf', path.join(cache, vsix), '-C', temporaria], { stdio: 'inherit' })
      : spawnSync(tar, ['-q', path.join(cache, vsix), '-d', temporaria], { stdio: 'inherit' })
    const conteudo = path.join(temporaria, 'extension')
    if (r.error || r.status !== 0 || !fs.existsSync(path.join(conteudo, 'package.json'))) {
      console.error(`\nERRO: nao consegui abrir ${vsix} (${r.error ? r.error.message : 'saiu ' + r.status}).`)
      process.exit(1)
    }
    const alvo = path.join(destino, id)
    // O clone guarda o que o build anterior embutiu: a versao velha sai inteira, senao arquivos que a
    // versao nova apagou ficariam misturados com os dela. E material do build, refeito a cada corrida.
    fs.rmSync(alvo, { recursive: true, force: true })
    // `rename` falha com EPERM quando o antivírus segura um arquivo recém-extraído (comum no Windows):
    // aí copia, em vez de abortar o build com a extensão pela metade.
    try { fs.renameSync(conteudo, alvo) } catch { fs.cpSync(conteudo, alvo, { recursive: true }) }
    fs.rmSync(temporaria, { recursive: true, force: true }) // so o que sobrou do zip aberto aqui mesmo
    // ⚠️ DEPENDENCIA DECLARADA SEM `node_modules` DERRUBA O BUILD (25/09/2026: o V27-B2
    // morreu no passo 6 com `npm list ... ELSPROBLEMS`, 71 "missing" do vscode-office). O empacotador
    // do nucleo cobra cada `dependencies` do `package.json` em `node_modules`. Extensao da loja que o
    // autor empacotou com bundler NAO TRAZ essa pasta — o vscode-office poe o que usa em
    // `out/node_modules/*.js`, e o Node acha ali. Instalada pela loja, ela roda do mesmo jeito, sem
    // nada disso. A lista e letra morta: sai da COPIA (o `.vsix` do cache nao muda).
    const pacote = path.join(alvo, 'package.json')
    if (!fs.existsSync(path.join(alvo, 'node_modules'))) {
      const p = JSON.parse(fs.readFileSync(pacote, 'utf8'))
      const quantas = Object.keys(p.dependencies || {}).length
      if (quantas) {
        delete p.dependencies
        fs.writeFileSync(pacote, JSON.stringify(p, null, '\t') + '\n', 'utf8')
        console.log(`  ${id}: ${quantas} dependencia(s) declarada(s) sem node_modules — tiradas da copia`)
      }
    }
    console.log('  embutida da loja: ' + id + ' (' + vsix + ')')
    feitas++
  }
  return feitas
}
n += extensoesDaLojaEmbutidas()

console.log(n === 0 ? 'nenhuma extensao embutida (esperado na V0)' : `${n} extensao(oes) embutida(s)`)
