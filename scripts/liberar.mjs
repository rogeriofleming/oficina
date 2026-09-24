// OFICINA — liberar.mjs: publica o que empacotar.bat gerou, no canal de cada edição.
//
// PRÉ-REQUISITO: rodar construir.bat (+ empacotar.bat) da MESMA edição LOGO ANTES. Este
// script confia no relógio, não em conteúdo: ele lê o oficina-build.json que está HOJE em
// VSCode-win32-x64 para saber tag/commit, e o .sha256.json ao lado do instalador em dist\
// para saber o hash. Se alguém empacotou a neutra e a equipe depois sem reconstruir entre
// as duas, o manifesto sai com o commit da build ERRADA — por isso o script imprime os dois
// na cara antes de publicar qualquer coisa.
//
// Este script é GENÉRICO de propósito (é o que vai para o repositório público): ele não
// conhece conta, domínio nem caminho de máquina nenhum — só variáveis de ambiente. Quem tem
// infraestrutura própria escreve seu próprio wrapper, fora deste repositório, que preenche
// essas variáveis (lendo de onde guardar segredo for de direito) e chama este arquivo.
//
// Variáveis de ambiente exigidas (sempre; nenhuma tem valor genérico seguro para chutar):
//   CLOUDFLARE_API_TOKEN     token de Workers/R2 (nunca fazer login interativo com ele —
//                            gera token com escopo, nunca compartilhe a sessão do navegador)
//   CLOUDFLARE_ACCOUNT_ID    id da conta Cloudflare dona do bucket
//   OFICINA_R2_BUCKET        nome do bucket R2 onde o Worker de update lê os dois objetos
//                            (manifest.json e o instalador) e os serve
// Opcional:
//   OFICINA_GH_REPO          "dono/repo" do GitHub para a Release em rascunho da edição
//                            NEUTRA (default: lido de `git remote get-url origin`). Ignorado
//                            com --equipe (a equipe nunca toca em GitHub).
//   OFICINA_RELEASE_TAG      nome de uma Release que JÁ traz o instalador (a do robô da subida,
//                            `oficina-<tag>`). Com ela, o instalador, o hash e o carimbo são baixados
//                            DESSA Release — nada da pasta de build local é publicado — e só o
//                            manifesto é anexado a ela. Sem a variável, uma Release de teste.
//   OFICINA_UPLOADER         comando para subir o INSTALADOR quando ele passa do limite do
//                            endpoint REST do R2 (~300 MiB, medido: acima disso vem
//                            `413 Payload Too Large`). Recebe dois argumentos, nesta ordem:
//                            a chave no bucket e o caminho do arquivo. Sem ele, um instalador
//                            grande faz este script PARAR com a explicação, em vez de publicar
//                            um manifesto apontando para um pacote que não subiu.
//
// Uso:
//   node scripts/liberar.mjs            edição NEUTRA: sobe pro R2 (prefixo neutra/) e cria/
//                                       atualiza um RASCUNHO de GitHub Release (nunca
//                                       publicado por este script).
//   node scripts/liberar.mjs --equipe   edição EQUIPE: só R2 (prefixo equipe/). Nunca toca
//                                       em git nem GitHub — nada da casa pode vazar lá.
import { readFileSync, existsSync, writeFileSync, mkdirSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'

const EQUIPE = process.argv.includes('--equipe')
const RAIZ = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const SAIDA = path.join(RAIZ, 'VSCode-win32-x64')
const DIST = path.join(RAIZ, 'dist')
const NOME = EQUIPE ? 'OficinaEquipeSetup.exe' : 'OficinaSetup.exe'
let EXE = path.join(DIST, NOME)
let SIDECAR = EXE + '.sha256.json'
let CARIMBO = path.join(SAIDA, 'oficina-build.json')
const RELEASE_TAG = EQUIPE ? null : process.env.OFICINA_RELEASE_TAG

const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const BUCKET = process.env.OFICINA_R2_BUCKET
const faltando = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'OFICINA_R2_BUCKET']
	.filter((v) => !process.env[v])
if (faltando.length) {
	console.error('ERRO: faltam variaveis de ambiente: ' + faltando.join(', '))
	console.error('Ver BUILD.md - "publicar uma versao" - para o que cada uma precisa ser.')
	process.exit(2)
}

/*
  ⚠️ COM OFICINA_RELEASE_TAG, O QUE SE PUBLICA É O QUE ESTÁ NA RELEASE (revisão de código, 16/09/2026).
  A Release do robô da subida traz o instalador que foi montado no CI e revisado. A primeira versão deste
  script lia mesmo assim o instalador e o carimbo da pasta de build LOCAL — outro build, de outro commit —,
  subia esse para o R2 e ainda trocava o instalador da Release com `--clobber`. Agora os três arquivos vêm da
  Release, o hash do instalador baixado é conferido contra o do próprio `.sha256.json` antes de qualquer
  envio, e nada da Release é sobrescrito além do `manifest.json`.
*/
function repositorioGitHub() {
	if (process.env.OFICINA_GH_REPO) return process.env.OFICINA_GH_REPO
	try {
		const remoto = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
		const m = remoto.match(/[/:]([^/:]+\/[^/.]+?)(\.git)?$/)
		return m ? m[1] : null
	} catch { return null }
}

if (RELEASE_TAG) {
	const repo = repositorioGitHub()
	if (!repo) {
		console.error('ERRO: OFICINA_RELEASE_TAG pede os arquivos da Release, mas nao sei o repositorio (defina OFICINA_GH_REPO).')
		process.exit(3)
	}
	const pasta = path.join(DIST, 'release-' + RELEASE_TAG.replace(/[^A-Za-z0-9._-]/g, '_'))
	mkdirSync(pasta, { recursive: true })
	console.log(`baixando instalador, hash e carimbo da Release "${RELEASE_TAG}" (${repo})...`)
	const baixar = spawnSync('gh', ['release', 'download', RELEASE_TAG, '--repo', repo, '--dir', pasta, '--clobber',
		'--pattern', NOME, '--pattern', NOME + '.sha256.json', '--pattern', 'oficina-build.json'], { stdio: 'inherit' })
	if (baixar.status !== 0) {
		console.error('ERRO: nao consegui baixar os arquivos da Release. Nada foi publicado.')
		process.exit(3)
	}
	EXE = path.join(pasta, NOME)
	SIDECAR = EXE + '.sha256.json'
	CARIMBO = path.join(pasta, 'oficina-build.json')
}

for (const p of [CARIMBO, EXE, SIDECAR]) {
	if (!existsSync(p)) {
		console.error(`ERRO: nao achei "${p}".`)
		console.error(EQUIPE
			? 'Rode: construir.bat --equipe && empacotar.bat --equipe'
			: 'Rode: construir.bat && empacotar.bat')
		process.exit(3)
	}
}

const carimbo = JSON.parse(readFileSync(CARIMBO, 'utf8'))
const sidecar = JSON.parse(readFileSync(SIDECAR, 'utf8'))

if (RELEASE_TAG) {
	// O arquivo baixado tem que ser o que o `.sha256.json` descreve: download cortado ou corrompido não sobe.
	// ⚠️ Não protege contra quem troca o instalador E o hash na Release (os dois vêm do mesmo lugar): isso é
	// papel da revisão do rascunho e das permissões de quem publica no repositório.
	const hash = createHash('sha256')
	await new Promise((ok, falha) => createReadStream(EXE).on('data', p => hash.update(p)).on('end', ok).on('error', falha))
	const medido = hash.digest('hex')
	if (medido !== sidecar.sha256) {
		console.error(`ERRO: o instalador baixado tem sha256 ${medido}, e o .sha256.json da Release diz ${sidecar.sha256}.`)
		console.error('Nada foi publicado.')
		process.exit(3)
	}
	console.log('  ok, o instalador baixado confere com o hash da Release.')
}

console.log('=== o que vou publicar ===')
console.log('edicao:        ', EQUIPE ? 'EQUIPE' : 'NEUTRA')
console.log('exe:           ', EXE)
console.log('tag:           ', carimbo.tag)
console.log('commit (sha):  ', carimbo.sha)
console.log('produto:       ', carimbo.produto)
console.log('carimbado em:  ', carimbo.quando)
console.log('sha256 do exe: ', sidecar.sha256)
console.log('tamanho:       ', sidecar.tamanho, 'bytes')
console.log('===========================')

if (carimbo.modo !== 'oficina') {
	console.error(`ERRO: oficina-build.json diz modo="${carimbo.modo}", nao "oficina". Isto e`)
	console.error('um build --puro (upstream sem nada nosso) - nao e para publicar.')
	process.exit(4)
}

// ⚠️ A EDIÇÃO do carimbo vem do product.json que foi para DENTRO do build; a flag vem de quem
// chamou. Publicar no canal de uma edição um pacote construído como a outra é o tipo de erro
// que só aparece quando alguém nota que a máquina nunca atualiza. Achado por uma revisão
// independente em 12/09/2026.
const edicaoEsperada = EQUIPE ? 'equipe' : 'neutra'
if (carimbo.edicao !== edicaoEsperada) {
	console.error(`ERRO: voce pediu o canal "${edicaoEsperada}", mas o pacote em dist\\ foi`)
	console.error(`construido como edicao "${carimbo.edicao || '(carimbo antigo, sem edicao)'}".`)
	console.error('Reconstrua a edicao certa antes de publicar (construir.bat + empacotar.bat).')
	process.exit(7)
}

const manifesto = {
	version: carimbo.sha,                          // contrato do IUpdate: version = commit
	productVersion: `${carimbo.tag}-oficina`,
	timestamp: Date.now(),
	arquivo: NOME,
	sha256hash: sidecar.sha256
}
console.log('manifesto:', JSON.stringify(manifesto))

const PREFIXO = EQUIPE ? 'equipe' : 'neutra'

async function subirR2(chave, dados, contentType) {
	const resp = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${chave}`,
		{ method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': contentType }, body: dados }
	)
	if (!resp.ok) throw new Error(`R2 PUT ${chave} -> HTTP ${resp.status}: ${await resp.text()}`)
	return resp.status
}

// ⚠️ LIMITE MEDIDO: o endpoint REST de objeto do R2 recusa corpo acima de ~300 MiB com
// `413 Payload Too Large` (e o `wrangler r2 object put` recusa antes de tentar, com a mesma
// fronteira). O instalador deste produto passa disso, porque leva o binário do agente embutido.
// Por isso existe o gancho OFICINA_UPLOADER: quem publica aponta ali o seu próprio caminho para
// objeto grande (multipart), e este script não precisa conhecer infraestrutura de ninguém.
const LIMITE_REST = 300 * 1024 * 1024
const UPLOADER = process.env.OFICINA_UPLOADER

const tamanhoExe = sidecar.tamanho
console.log(`subindo ${PREFIXO}/${NOME} para o R2 (${tamanhoExe} bytes)...`)
if (UPLOADER) {
	// ⚠️ OFICINA_UPLOADER e UM CAMINHO, nunca uma linha de comando. A primeira versao daqui
	// fazia `UPLOADER.split(' ')` para aceitar "node caminho\script.mjs" — e isso EXPLODIU na
	// primeira corrida de verdade, porque o caminho tem espaco: o comando virou `node` +
	// `D:\Claude` + `Code\...` e o node tentou executar "D:\Claude" como script. Quem precisa de
	// argumento fixo escreve um script proprio; aqui nunca se divide texto em pedaco.
	const ehScriptNode = /\.(mjs|js|cjs)$/i.test(UPLOADER)
	const executavel = ehScriptNode ? process.execPath : UPLOADER
	const argumentos = ehScriptNode
		? [UPLOADER, `${PREFIXO}/${NOME}`, EXE]
		: [`${PREFIXO}/${NOME}`, EXE]
	const r = spawnSync(executavel, argumentos, { stdio: 'inherit' })
	if (r.error) {
		console.error('ERRO: nao consegui executar OFICINA_UPLOADER: ' + (r.error.code || r.error.message))
		process.exit(5)
	}
	if (r.status !== 0) {
		console.error(`ERRO: OFICINA_UPLOADER saiu com ${r.status} - o instalador NAO foi publicado.`)
		console.error('Parando ANTES do manifesto: manifesto publicado apontando para um pacote que')
		console.error('nao subiu seria pior do que nao publicar nada.')
		process.exit(5)
	}
} else {
	if (tamanhoExe > LIMITE_REST) {
		console.error(`ERRO: o instalador tem ${tamanhoExe} bytes e o endpoint REST do R2 recusa`)
		console.error(`acima de ${LIMITE_REST} (413 Payload Too Large). Defina OFICINA_UPLOADER com`)
		console.error('um comando que saiba subir objeto grande (multipart) e rode de novo.')
		process.exit(5)
	}
	await subirR2(`${PREFIXO}/${NOME}`, readFileSync(EXE), 'application/octet-stream')
}
console.log('  ok, instalador no R2.')
await subirR2(`${PREFIXO}/manifest.json`, Buffer.from(JSON.stringify(manifesto)), 'application/json')
console.log('  ok, manifest.json no R2.')

if (!EQUIPE) {
	const ghRepo = repositorioGitHub()
	if (!ghRepo) {
		// ⚠️ Sai com ERRO, nao com 0. Publicacao PELA METADE (R2 sim, rascunho nao) reportada
		// como sucesso e o tipo de verde que faz alguem marcar a versao como liberada sem ela
		// estar. Achado por uma revisao independente em 12/09/2026.
		console.error('ERRO: o R2 foi publicado, mas NAO consegui descobrir o repositorio GitHub')
		console.error('(defina OFICINA_GH_REPO). O rascunho de Release NAO foi criado - a')
		console.error('publicacao ficou pela metade, e por isso isto sai com erro.')
		process.exit(6)
	}

	// GitHub Release em RASCUNHO — nunca publicada por este script (critério do plano).
	// V9: quando a versão veio do robô da subida, a Release dele já existe (`oficina-<tag>`) e é nela
	// que os arquivos entram — OFICINA_RELEASE_TAG diz qual. Sem a variável, o nome de teste de antes.
	const tagRelease = RELEASE_TAG || `teste-v7-${carimbo.sha.slice(0, 10)}`
	console.log(`criando/atualizando a Release "${tagRelease}" em ${ghRepo}...`)
	const manifestoTmp = path.join(DIST, 'manifest.json')
	writeFileSync(manifestoTmp, JSON.stringify(manifesto, null, 2))
	let rascunho = true
	try {
		const info = JSON.parse(execFileSync('gh', ['release', 'view', tagRelease, '--repo', ghRepo, '--json', 'isDraft'], { encoding: 'utf8' }))
		rascunho = info.isDraft === true
		// A Release indicada JÁ TEM o instalador revisado (foi dela que ele veio): só o manifesto entra.
		const arquivos = RELEASE_TAG ? [manifestoTmp] : [EXE, manifestoTmp]
		execFileSync('gh', [
			'release', 'upload', tagRelease, ...arquivos, '--repo', ghRepo, '--clobber'
		], { stdio: 'inherit' })
	} catch {
		if (RELEASE_TAG) {
			console.error(`ERRO: o R2 foi publicado, mas nao consegui anexar o manifesto a Release "${tagRelease}".`)
			process.exit(6)
		}
		execFileSync('gh', [
			'release', 'create', tagRelease, EXE, manifestoTmp,
			'--repo', ghRepo, '--draft',
			'--title', `OFICINA - build de teste (${carimbo.sha.slice(0, 10)}) - NAO PUBLICAR`,
			'--notes', 'Rascunho gerado por liberar.mjs para medir o canal de update. So publicar com decisao explicita.'
		], { stdio: 'inherit' })
	}
	console.log(rascunho ? 'rascunho pronto (permanece DRAFT).' : `a Release "${tagRelease}" ja estava publicada: so o manifesto foi anexado.`)
}

console.log('OK.')
