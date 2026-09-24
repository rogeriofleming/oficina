// Baixa da Open VSX o .vsix de cada extensão de extensoes/lista.txt.
//
// Existe para que a instalação das extensões não dependa da rede na hora do
// teste, e para que a versão usada em cada build fique registrada: o cache
// guarda o arquivo com a versão e a plataforma no nome, e o script imprime a
// tabela. O cache fica FORA do repositório (OFICINA_BUILD/extensoes-cache):
// é material reconstruível, não código.
//
// ⚠️ A PLATAFORMA É OBRIGATÓRIA, e foi a armadilha da primeira versão deste
// script: extensões que embutem binário nativo são publicadas uma vez POR
// plataforma, e o endpoint "/latest" sem plataforma devolve uma qualquer. Aqui
// ele devolveu `alpine-arm64` para a extensão do Claude Code — 198 MB de um
// binário ELF ARM64 que jamais rodaria neste Windows, e nada no download
// avisaria. Contar "10 de 10 baixadas" estava certo no número e errado no fato.
// Por isso: pede-se a plataforma primeiro, e o que voltar é CONFERIDO.
//
// Uso:  node scripts/baixar_extensoes.mjs [--so-conferir] [--plataforma win32-x64]

import { readFileSync, mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const CACHE = join(BUILD, 'extensoes-cache')
const SO_CONFERIR = process.argv.includes('--so-conferir')
const iPlat = process.argv.indexOf('--plataforma')
const PLATAFORMA = iPlat >= 0 ? process.argv[iPlat + 1] : 'win32-x64'

const lista = readFileSync(join(RAIZ, 'extensoes', 'lista.txt'), 'utf8')
  .split(/\r?\n/).map(l => l.trim())
  .filter(l => l && !l.startsWith('#'))

if (!SO_CONFERIR) mkdirSync(CACHE, { recursive: true })

/** Busca a versão certa: a da plataforma pedida; se não houver, a universal. */
async function acharVersao(ns, nome) {
  // 1. a da plataforma
  try {
    const r = await fetch(`https://open-vsx.org/api/${ns}/${nome}/${PLATAFORMA}/latest`)
    if (r.ok) {
      const m = await r.json()
      if (m.targetPlatform === PLATAFORMA) return { meta: m, plat: PLATAFORMA }
    }
  } catch { /* cai para a universal */ }

  // 2. a universal — e conferindo que é MESMO universal, não outra plataforma
  const r = await fetch(`https://open-vsx.org/api/${ns}/${nome}/latest`)
  if (!r.ok) return { erro: `HTTP ${r.status}` }
  const m = await r.json()
  const plat = m.targetPlatform || 'universal'
  if (plat !== 'universal') {
    return { erro: `so achei para "${plat}", nao serve em ${PLATAFORMA}` }
  }
  return { meta: m, plat }
}

const linhas = []
let faltando = 0

for (const id of lista) {
  const [ns, nome] = id.split('.')
  if (!ns || !nome) { console.error(`[ERRO] id invalido na lista: ${id}`); faltando++; continue }

  let achado
  try {
    achado = await acharVersao(ns, nome)
  } catch (e) {
    linhas.push([id, 'ERRO DE REDE', '-', e.message]); faltando++; continue
  }
  if (achado.erro) { linhas.push([id, 'INDISPONIVEL', '-', achado.erro]); faltando++; continue }

  const { meta, plat } = achado
  const url = meta.files?.download
  if (!url) { linhas.push([id, meta.version || '?', plat, 'sem arquivo para baixar']); faltando++; continue }

  const destino = join(CACHE, `${id}-${meta.version}-${plat}.vsix`)
  if (SO_CONFERIR) { linhas.push([id, meta.version, plat, 'disponivel (nao baixei)']); continue }

  if (existsSync(destino)) {
    linhas.push([id, meta.version, plat, `ja no cache, ${(statSync(destino).size / 1048576).toFixed(1)} MB`])
    continue
  }
  // ⚠️ Conferir a RESPOSTA antes de gravar. Sem isto, um 404, um 502 ou um portal
  // de rede vira um arquivo .vsix com HTML dentro, o script conta "baixado" e a falha
  // so aparece na instalacao, com uma mensagem sobre zip invalido que nao fala do
  // download. E a mesma licao que o preparar_node.bat ja tinha aprendido com o
  // `curl -f` — ela nao tinha atravessado para este arquivo.
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error(`download recusado (HTTP ${resposta.status}) em ${url}`)
  const bin = Buffer.from(await resposta.arrayBuffer())
  // Todo .vsix e um zip: os dois primeiros bytes sao "PK". Se nao forem, o que veio
  // nao e um pacote, por mais que o servidor tenha respondido 200.
  if (bin.length < 4 || bin[0] !== 0x50 || bin[1] !== 0x4b) {
    throw new Error(`o que veio nao e um pacote (nao comeca com PK): ${url}`)
  }
  writeFileSync(destino, bin)
  linhas.push([id, meta.version, plat, `baixado, ${(bin.length / 1048576).toFixed(1)} MB`])
}

const larg = [0, 1, 2, 3].map(i => Math.max(...linhas.map(l => String(l[i]).length)))
console.log(`\nOpen VSX - ${lista.length} extensoes para ${PLATAFORMA}${SO_CONFERIR ? ' (so conferindo)' : `\ncache: ${CACHE}`}\n`)
for (const l of linhas) console.log(l.map((c, i) => String(c).padEnd(larg[i])).join('  '))
console.log(`\n${lista.length - faltando} de ${lista.length} disponiveis.`)
process.exit(faltando ? 1 : 0)
