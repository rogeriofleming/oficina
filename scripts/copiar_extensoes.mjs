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
console.log(n === 0 ? 'nenhuma extensao embutida (esperado na V0)' : `${n} extensao(oes) embutida(s)`)
