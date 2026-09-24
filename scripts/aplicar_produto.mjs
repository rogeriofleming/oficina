// Mescla o product.json da OFICINA sobre o do upstream.
//
// Por que mesclar em vez de substituir: o product.json do upstream tem dezenas de
// chaves que fazem o editor funcionar (proposta de API, extensoes embutidas, mapas
// de linguagem). Trocar o arquivo inteiro quebraria tudo isso de um jeito dificil
// de perceber. Aqui so as chaves declaradas em produto/product.json mudam.
//
// De onde vem a BASE: do proprio git do clone (git show HEAD:product.json), nunca
// de um cache em disco. A versao anterior guardava product.json.upstream dentro do
// clone e sempre partia dele — mas esse arquivo nao e rastreado pelo git, logo o
// "checkout -f" da tag nova nao o troca. Ao subir de versao, o merge partiria da
// BASE DA TAG VELHA e reverteria em silencio toda chave que a Microsoft mudou no
// meio. Achado por duas revisoes independentes no ciclo da V0 (05/09/2026), antes
// do primeiro ensaio real de bump — a prova que existia para pegar isso ainda nao
// tinha rodado.
//
// Uso: node aplicar_produto.mjs <clone> <repo> [caminho da camada privada]
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { conferirIdentidade } from './identidade.mjs'
import { edicaoDoProduto, pastaDeDados, aplicarBlocoDaEdicao, conferirPastaDaEdicao } from './edicao.mjs'

const [clone, repo, camada] = process.argv.slice(2)
const alvo = path.join(clone, 'product.json')

let base
try {
  // HEAD e a tag em que o construir.bat acabou de dar checkout: a base certa,
  // sempre, sem cache para envelhecer.
  base = JSON.parse(execFileSync('git', ['-C', clone, 'show', 'HEAD:product.json'], { encoding: 'utf8' }))
} catch (e) {
  console.error('Nao consegui ler o product.json da tag pelo git: ' + e.message)
  console.error('Sem essa base nao da para mesclar com seguranca (o arquivo em disco')
  console.error('pode ja estar mesclado de um build anterior). Abortei de proposito.')
  process.exit(2)
}

// Sobra de versoes anteriores, que ficava dentro do clone e nunca era renovada.
const cacheVelho = path.join(clone, 'product.json.upstream')
if (fs.existsSync(cacheVelho)) fs.rmSync(cacheVelho)
const nosso = JSON.parse(fs.readFileSync(path.join(repo, 'produto', 'product.json'), 'utf8'))

const remover = nosso.__remover || []
delete nosso.__remover
// O bloco da edicao da equipe sai do produto e e aplicado DEPOIS da camada privada (e ela que diz,
// pelo `updateUrl`, qual edicao esta sendo construida). Ver `edicao.mjs`.
const blocoDaEquipe = nosso.__equipe || null
delete nosso.__equipe
const pastaPublica = pastaDeDados(nosso)
Object.assign(base, nosso)
for (const k of remover) delete base[k]

// A camada privada e opcional e vive FORA deste repositorio. O repositorio conhece
// o mecanismo; nunca o caminho de nenhuma maquina.
let chavesDaCamada = []
if (camada && camada !== '0' && fs.existsSync(camada)) {
  const arq = path.join(camada, 'product.override.json')
  if (fs.existsSync(arq)) {
    const over = JSON.parse(fs.readFileSync(arq, 'utf8'))
    const rem2 = over.__remover || []
    delete over.__remover
    chavesDaCamada = Object.keys(over)
    Object.assign(base, over)
    for (const k of rem2) delete base[k]
    console.log('camada privada aplicada')
  }
}

// A EDICAO so se conhece AQUI, depois da camada privada: e o `updateUrl` dela que a define.
// Cada edicao guarda os dados na SUA pasta - sem isso, as duas escrevem em %APPDATA%\OFICINA,
// onde mora o `canal-privado.txt` (apontado por uma revisao independente em 19/09/2026).
const edicao = edicaoDoProduto(base)
const doBloco = aplicarBlocoDaEdicao(base, blocoDaEquipe, chavesDaCamada)
if (doBloco.length) console.log(`bloco da edicao equipe aplicado: ${doBloco.join(', ')}`)

// ⛔ CHAVES QUE O CODIGO EXIGE E QUE NAO PODEM SER REMOVIDAS DAQUI.
//
// Esta guarda existe por causa de dois defeitos do mesmo dia (05/09/2026), e os dois
// nasceram AQUI, nesta linha: `for (const k of remover) delete base[k]`.
//
//   - `builtInExtensionsEnabledWithAutoUpdates` entrou no `__remover` como se fosse
//     mais uma referencia ao Copilot. O fonte a consome com `for...of` sem guarda
//     (`extensionsScannerService.ts:112`): a varredura de extensoes morria inteira,
//     com "is not iterable", e 9 dos 17 criterios caiam junto.
//   - `defaultChatAgent` entrou pelo mesmo motivo. O editor passou a morrer aos 1,7 s
//     num `assertDefined` do onboarding. ⚠️ E eu cheguei a escrever um PATCH NO NUCLEO
//     do VS Code culpando o upstream — depois de "conferir" a chave no product.json do
//     working tree, que este script acabara de modificar. O upstream sempre teve a
//     chave; quem a apagava eramos nos.
//
// O tipo do VS Code declara as duas obrigatorias, entao remover nao da erro de
// compilacao: da um `TypeError` em runtime, longe da causa, 20 minutos de build depois.
//
// ⚠️ A guarda olha o RESULTADO da mesclagem, nao a lista `__remover`: assim ela pega
// tambem o caso de a chave nunca ter sido posta de volta, e o de a camada privada a
// remover. Faltar aqui e falhar ANTES de compilar, que e onde custa segundos.
const OBRIGATORIAS = [
  ['builtInExtensionsEnabledWithAutoUpdates', 'consumida com for...of sem guarda em extensionsScannerService.ts'],
  ['defaultChatAgent', 'consumida sem guarda em pelo menos 10 arquivos; um assertDefined no corpo de modulo derruba o editor na abertura'],
  // ⚠️ Esta nao derruba o editor: ela derruba o PRODUTO, em silencio.
  //
  // Desde o patch 0001 (06/09/2026) e daqui que saem TODOS os padroes de interface —
  // menu oculto, painel secundario oculto, barra de status, sem tela de boas-vindas.
  // Se sumir da mesclagem, o editor abre perfeitamente com a cara do VS Code cru, todo
  // teste de fumaca passa verde, e so um olho humano notaria. Justamente por nao
  // quebrar nada e que ela precisa ser cobrada aqui.
  ['configurationDefaults', 'e a fonte unica dos padroes de interface do produto (patch 0001); sem ela o editor abre com a cara do upstream sem nenhum erro'],
  // Mesmo perfil de falha, desde a barra lateral de volta: sem ela (patch 0012) a barra nasce com
  // os sete icones de fabrica em vez dos tres do produto, sem erro nenhum.
  ['defaultUnpinnedViewContainers', 'diz quais icones da barra lateral nascem soltos (patch 0012); sem ela a barra nasce com todos os de fabrica, sem nenhum erro'],
  // Mesmo perfil de novo: sem ela (patch 0014) Contas e Gerenciar voltam ao pe da barra lateral, sem erro nenhum.
  ['hideActivityBarGlobalActions', 'tira Contas e Gerenciar do pe da barra lateral (patch 0014); sem ela os dois voltam, sem nenhum erro'],
  // Mesmo perfil de falha, de novo: sem ela (patch 0015) o editor volta a usar %APPDATA%\<nameShort>,
  // que e a MESMA pasta nas duas edicoes - e e la que o segredo do canal privado mora. Nada quebra.
  ['userDataFolderName', 'diz em que pasta de %APPDATA% esta edicao guarda os dados (patch 0015); sem ela as duas edicoes voltam a dividir a mesma pasta, sem nenhum erro']
]
const sumiram = OBRIGATORIAS.filter(([k]) => base[k] === undefined || base[k] === null)
if (sumiram.length) {
  console.error('PRODUCT.JSON INVALIDO - build abortado.')
  console.error('Estas chaves sao OBRIGATORIAS para o editor abrir, e sumiram da mesclagem:')
  for (const [k, porque] of sumiram) console.error(`  - ${k}: ${porque}`)
  console.error('Provavel causa: a chave esta na lista __remover do produto/product.json,')
  console.error('ou da camada privada. Tirar de la, ou declarar um valor nosso.')
  process.exit(1)
}

// A edicao com canal de atualizacao NAO pode ficar na pasta de dados da publica: e nela que o
// `canal-privado.txt` mora. Sem esta trava a separacao some sem quebrar nada (ver edicao.mjs).
const errosDaPasta = conferirPastaDaEdicao(base, pastaPublica)
if (errosDaPasta.length) {
  console.error('PASTA DE DADOS INVALIDA - build abortado:')
  for (const e of errosDaPasta) console.error('  - ' + e)
  process.exit(1)
}

// Criterio 3 do plano: identidade legalmente limpa. Verificado aqui, no build,
// e nao so na revisao — e o unico lugar por onde toda compilacao passa.
const erros = conferirIdentidade(base)
if (base.enableTelemetry !== false) erros.push('enableTelemetry deveria ser false')
if (erros.length) {
  console.error('IDENTIDADE INVALIDA - build abortado:')
  for (const e of erros) console.error('  - ' + e)
  process.exit(1)
}

fs.writeFileSync(alvo, JSON.stringify(base, null, '\t') + '\n')
console.log(`product.json mesclado: ${Object.keys(base).length} chaves, nome "${base.nameLong}", exe "${base.applicationName}.exe", telemetria ${base.enableTelemetry}`)
console.log(`edicao: ${edicao} - pasta de dados: %APPDATA%\\${pastaDeDados(base)}`)
