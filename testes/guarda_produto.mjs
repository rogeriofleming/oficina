// GUARDA DO PRODUTO — prova que a mesclagem do product.json ABORTA quando uma chave
// obrigatoria some.
//
// Por que este teste existe: as chaves obrigatorias falham de formas que NENHUM outro
// teste pega.
//   - `builtInExtensionsEnabledWithAutoUpdates` e `defaultChatAgent` derrubam o editor
//     na abertura, mas 20 minutos de build DEPOIS da causa, com uma mensagem que nao
//     fala do product.json.
//   - `configurationDefaults` (desde o patch 0001, 06/09/2026) e pior: nao derruba
//     nada. O editor abre perfeito, com a cara do VS Code cru, e todo teste automatico
//     passa verde. So um olho humano notaria — e um olho humano nao roda a cada build.
//
// Uma guarda que nunca foi vista falhando e so uma intencao. Este teste a ve falhar,
// com o cenario exato que causou os defeitos: a chave na lista `__remover`.
//
// Uso:  node testes/guarda_produto.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const APLICAR = path.join(REPO, 'scripts', 'aplicar_produto.mjs')

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok, detalhe: detalhe ?? '' })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`)
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-guarda-'))

/**
 * Monta um "clone" de mentira: uma pasta git com um product.json no HEAD, que e de
 * onde `aplicar_produto.mjs` tira a base (`git show HEAD:product.json`).
 *
 * As chaves aqui sao as que o script MESCLA por cima — em especial as obrigatorias,
 * que precisam existir no upstream para que remove-las seja um ato do NOSSO lado, que
 * e o defeito que se quer reproduzir.
 */
function montarClone(nome) {
  const clone = path.join(area, nome)
  fs.mkdirSync(clone, { recursive: true })
  const upstream = {
    version: '1.136.1',
    nameShort: 'Code - OSS',
    nameLong: 'Code - OSS',
    applicationName: 'code-oss',
    dataFolderName: '.vscode-oss',
    urlProtocol: 'code-oss',
    builtInExtensionsEnabledWithAutoUpdates: [],
    defaultChatAgent: { extensionId: 'GitHub.copilot' }
  }
  fs.writeFileSync(path.join(clone, 'product.json'), JSON.stringify(upstream, null, 2))
  const git = (...args) => execFileSync('git', ['-C', clone, ...args], { stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.email', 'teste@exemplo.invalido')
  git('config', 'user.name', 'teste')
  git('add', 'product.json')
  git('commit', '-q', '-m', 'base')
  return clone
}

/** Monta um "repo" de mentira com o nosso produto/product.json, opcionalmente sabotado. */
function montarRepo(nome, sabotar) {
  const repo = path.join(area, nome)
  fs.mkdirSync(path.join(repo, 'produto'), { recursive: true })
  // Parte do produto REAL: um teste que inventa o proprio product.json prova que a
  // guarda funciona sobre um exemplo, nao sobre o produto que vai ser compilado.
  const nosso = JSON.parse(fs.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
  if (sabotar) sabotar(nosso)
  fs.writeFileSync(path.join(repo, 'produto', 'product.json'), JSON.stringify(nosso, null, 2))
  return repo
}

function rodar(clone, repo, camada = '0') {
  const r = spawnSync(process.execPath, [APLICAR, clone, repo, camada], { encoding: 'utf8' })
  return { codigo: r.status, saida: (r.stdout || '') + (r.stderr || '') }
}

/**
 * Uma camada privada de mentira: so o que a de verdade tem, o endereco do canal de atualizacao.
 * E ele que define a EDICAO (`carimbar_build.mjs`, `edicao.mjs`) — nao a bandeira da linha de comando.
 */
function montarCamada(nome, extra = {}) {
  const camada = path.join(area, nome)
  fs.mkdirSync(camada, { recursive: true })
  fs.writeFileSync(path.join(camada, 'product.override.json'),
    JSON.stringify({ updateUrl: 'https://canal.exemplo.invalido', ...extra }, null, 2))
  return camada
}

/** O product.json que a mesclagem escreveu dentro do "clone". */
const produtoMesclado = clone => JSON.parse(fs.readFileSync(path.join(clone, 'product.json'), 'utf8'))

// ── CONTROLE POSITIVO ────────────────────────────────────────────────────────────
// Sem ele, um script quebrado (que abortasse SEMPRE) passaria em todos os cenarios de
// sabotagem abaixo e o teste inteiro seria teatro.
{
  const r = rodar(montarClone('clone_ok'), montarRepo('repo_ok'))
  checar('controle: o produto INTEIRO mescla sem abortar', r.codigo === 0,
    r.codigo === 0 ? 'saiu 0' : `saiu ${r.codigo}: ` + r.saida.split('\n').slice(0, 3).join(' | '))
}

// ── CADA CHAVE OBRIGATORIA, UMA A UMA ────────────────────────────────────────────
// Uma a uma, e nao todas juntas: com as tres removidas de uma vez, uma guarda que so
// cobrisse UMA delas ainda abortaria, e o teste ficaria verde mentindo sobre as outras.
for (const chave of ['configurationDefaults', 'builtInExtensionsEnabledWithAutoUpdates', 'defaultChatAgent', 'defaultUnpinnedViewContainers', 'hideActivityBarGlobalActions', 'userDataFolderName']) {
  const repo = montarRepo('repo_sem_' + chave, (nosso) => {
    nosso.__remover = [...(nosso.__remover || []), chave]
  })
  const r = rodar(montarClone('clone_sem_' + chave), repo)
  const abortou = r.codigo !== 0
  const explicou = r.saida.includes(chave)
  checar(`"${chave}" no __remover ABORTA o build`, abortou,
    abortou ? `saiu ${r.codigo}` : 'MESCLOU MESMO ASSIM — a guarda nao pega esta chave')
  // Abortar calado obriga quem construiu a adivinhar. A mensagem tem que nomear a chave.
  checar(`e a mensagem NOMEIA "${chave}"`, explicou,
    explicou ? '' : r.saida.split('\n').slice(0, 4).join(' | '))
}

// ── O CASO QUE A LISTA `__remover` NAO PEGA ──────────────────────────────────────
// A guarda olha o RESULTADO da mesclagem, e nao a lista `__remover` — de proposito.
// Este cenario prova a diferenca: a chave nao esta em `__remover` nenhum; ela
// simplesmente nunca foi declarada no nosso produto e nao existe no upstream.
{
  const repo = montarRepo('repo_nunca_declarou', (nosso) => {
    delete nosso.configurationDefaults
  })
  const clone = montarClone('clone_nunca_declarou')
  const r = rodar(clone, repo)
  checar('chave que NUNCA foi declarada (fora do __remover) tambem aborta', r.codigo !== 0,
    r.codigo !== 0 ? `saiu ${r.codigo}` : 'passou — a guarda so enxerga o __remover')
}

// ── A PASTA DE DADOS DE CADA EDICAO (V19) ────────────────────────────────────────
//
// As duas edicoes usavam `%APPDATA%\OFICINA`, onde mora o `canal-privado.txt` (apontado por uma
// revisao independente). Cada uma passa a ter a sua, pelo `userDataFolderName` (patch 0015). O modo de falha
// e sempre o mesmo desta suite: se a separacao sumir, NADA quebra — o build sai, o programa abre, e as
// duas voltam a escrever no mesmo lugar.
{
  const cloneN = montarClone('clone_neutra')
  const rN = rodar(cloneN, montarRepo('repo_neutra'))
  const neutra = rN.codigo === 0 ? produtoMesclado(cloneN) : null

  const cloneE = montarClone('clone_equipe')
  const rE = rodar(cloneE, montarRepo('repo_equipe'), montarCamada('camada_equipe'))
  const equipe = rE.codigo === 0 ? produtoMesclado(cloneE) : null

  checar('a edicao SEM canal mescla, e diz em que pasta guarda os dados',
    !!neutra && neutra.userDataFolderName === 'OFICINA' && !neutra.updateUrl,
    neutra ? `${neutra.userDataFolderName}, canal: ${!!neutra.updateUrl}` : `saiu ${rN.codigo}: ` + rN.saida.split('\n').slice(0, 3).join(' | '))
  checar('a edicao COM canal mescla, e a camada privada e que a define',
    !!equipe && !!equipe.updateUrl,
    equipe ? `canal: ${!!equipe.updateUrl}` : `saiu ${rE.codigo}: ` + rE.saida.split('\n').slice(0, 3).join(' | '))
  checar('⛔ a edicao com canal NAO aponta para a pasta de dados da outra',
    !!neutra && !!equipe && neutra.userDataFolderName !== equipe.userDataFolderName,
    `neutra="${neutra && neutra.userDataFolderName}" equipe="${equipe && equipe.userDataFolderName}"`)
  checar('⛔ e a pasta da edicao com canal e a declarada no bloco __equipe do produto',
    !!equipe && equipe.userDataFolderName === 'OFICINA Equipe', equipe && equipe.userDataFolderName)
  // ⛔ A TRAVA: com o bloco vazio (ou com a mesma pasta da publica), o build tem de ABORTAR. Sem esta
  // linha o cenario acima passaria tambem num produto que nunca separou nada.
  for (const [nome, bloco] of [['vazio', {}], ['com a MESMA pasta da publica', { userDataFolderName: 'OFICINA' }]]) {
    const repo = montarRepo('repo_bloco_' + nome.replace(/\W+/g, '_'), nosso => { nosso.__equipe = bloco })
    const r = rodar(montarClone('clone_bloco_' + nome.replace(/\W+/g, '_')), repo, montarCamada('camada_bloco_' + nome.replace(/\W+/g, '_')))
    checar(`⛔ bloco da edicao ${nome} ABORTA o build (as duas dividiriam a pasta do segredo)`, r.codigo !== 0,
      r.codigo !== 0 ? `saiu ${r.codigo}` : 'MESCLOU MESMO ASSIM')
    checar(`e a mensagem diz que e a pasta de dados`, r.codigo !== 0 && /pasta de dados/i.test(r.saida),
      r.saida.split('\n').slice(0, 5).join(' | '))
  }
  // CONTROLE: sem canal, o bloco nao vale — a edicao publica nao muda de pasta por causa dele.
  {
    const clone = montarClone('clone_bloco_sem_canal')
    const r = rodar(clone, montarRepo('repo_bloco_sem_canal'))
    const p = r.codigo === 0 ? produtoMesclado(clone) : null
    checar('controle: sem canal, o bloco da equipe nao e aplicado (a publica fica na pasta dela)',
      !!p && p.userDataFolderName === 'OFICINA' && !('__equipe' in p), p && p.userDataFolderName)
  }
  // ⛔ A CAMADA PRIVADA TEM A ULTIMA PALAVRA. O bloco do repositorio e aplicado DEPOIS dela (e o
  // endereco do canal que diz qual edicao e), entao sem guarda ele sobrescreveria, em silencio, um
  // valor posto a mao na camada. A trava da pasta continua valendo sobre o resultado.
  {
    const clone = montarClone('clone_camada_manda')
    const r = rodar(clone, montarRepo('repo_camada_manda'),
      montarCamada('camada_manda', { userDataFolderName: 'OFICINA Casa' }))
    const p = r.codigo === 0 ? produtoMesclado(clone) : null
    checar('⛔ a camada privada tem a ultima palavra: o bloco do produto nao a sobrescreve',
      !!p && p.userDataFolderName === 'OFICINA Casa',
      p ? p.userDataFolderName : `saiu ${r.codigo}: ` + r.saida.split('\n').slice(0, 3).join(' | '))
  }
  // CONTROLE: e se a camada puser a pasta da publica, a trava aborta do mesmo jeito.
  {
    const r = rodar(montarClone('clone_camada_igual'), montarRepo('repo_camada_igual'),
      montarCamada('camada_igual', { userDataFolderName: 'OFICINA' }))
    checar('controle: camada que aponta para a pasta da publica tambem ABORTA', r.codigo !== 0,
      r.codigo !== 0 ? `saiu ${r.codigo}` : 'MESCLOU MESMO ASSIM')
  }
  checar('o bloco __equipe nao vaza para o product.json do build',
    !!equipe && !('__equipe' in equipe), equipe ? Object.keys(equipe).filter(k => k.startsWith('__')).join() || 'nenhuma chave __' : '')
}

// ── O CARIMBO BATE COM A PASTA DA EDICAO (V19) ───────────────────────────────────
//
// O carimbo e a unica coisa que responde "este exe vai escrever ONDE?" sem abrir o programa, e
// `conferir_edicao.mjs` recusa empacotar quando ele discorda do product.json que foi para dentro.
{
  const CARIMBAR = path.join(REPO, 'scripts', 'carimbar_build.mjs')
  const CONFERIR = path.join(REPO, 'scripts', 'conferir_edicao.mjs')
  const montarSaida = (nome, produto) => {
    const saida = path.join(area, nome)
    fs.mkdirSync(path.join(saida, 'resources', 'app'), { recursive: true })
    fs.writeFileSync(path.join(saida, 'resources', 'app', 'product.json'), JSON.stringify(produto, null, 2))
    return saida
  }
  const carimbar = saida => spawnSync(process.execPath, [CARIMBAR, saida, 'oficina', '1.136.1', ''], { encoding: 'utf8' })
  const conferir = (saida, esperada) => spawnSync(process.execPath, [CONFERIR, saida, esperada], { encoding: 'utf8' })
  const lerCarimbo = saida => JSON.parse(fs.readFileSync(path.join(saida, 'oficina-build.json'), 'utf8'))

  const saidaN = montarSaida('saida_neutra', { nameShort: 'OFICINA', nameLong: 'OFICINA', applicationName: 'oficina', userDataFolderName: 'OFICINA', quality: 'stable' })
  const saidaE = montarSaida('saida_equipe', { nameShort: 'OFICINA', nameLong: 'OFICINA', applicationName: 'oficina', userDataFolderName: 'OFICINA Equipe', quality: 'stable', updateUrl: 'https://canal.exemplo.invalido' })
  carimbar(saidaN); carimbar(saidaE)
  const cN = lerCarimbo(saidaN), cE = lerCarimbo(saidaE)
  checar('⛔ o carimbo de cada edicao traz a pasta de dados DELA',
    cN.edicao === 'neutra' && cN.pastaDeDados === 'OFICINA' && cE.edicao === 'equipe' && cE.pastaDeDados === 'OFICINA Equipe',
    `${cN.edicao}/${cN.pastaDeDados} vs ${cE.edicao}/${cE.pastaDeDados}`)
  const okN = conferir(saidaN, 'neutra'), okE = conferir(saidaE, 'equipe')
  checar('⛔ e conferir_edicao aceita quando o carimbo bate com o produto de dentro do build',
    okN.status === 0 && okE.status === 0, `neutra ${okN.status}, equipe ${okE.status}`)
  // ⛔ O carimbo velho: a pasta muda no produto e ninguem recarimba. Antes disto, o empacotamento
  // seguia em frente e o instalador depositava o segredo numa pasta que o programa nao le.
  {
    const c = lerCarimbo(saidaE)
    c.pastaDeDados = 'OFICINA'
    fs.writeFileSync(path.join(saidaE, 'oficina-build.json'), JSON.stringify(c, null, 2))
    const r = conferir(saidaE, 'equipe')
    checar('⛔ carimbo que discorda da pasta do produto RECUSA o empacotamento', r.status !== 0,
      r.status !== 0 ? `saiu ${r.status}` : 'PASSOU MESMO ASSIM')
  }
  {
    const c = lerCarimbo(saidaN)
    delete c.pastaDeDados
    fs.writeFileSync(path.join(saidaN, 'oficina-build.json'), JSON.stringify(c, null, 2))
    const r = conferir(saidaN, 'neutra')
    checar('carimbo antigo, sem a pasta de dados, tambem recusa (e manda reconstruir)',
      r.status !== 0 && /reconstrua/i.test((r.stdout || '') + (r.stderr || '')), `saiu ${r.status}`)
  }
}

try { fs.rmSync(area, { recursive: true, force: true }) } catch {}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
