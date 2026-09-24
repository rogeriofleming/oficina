#!/usr/bin/env node
// Instala os ganchos do git DESTE repositório nesta máquina.
//
// ⚠️ Gancho do git NÃO viaja no clone: ele mora em `.git/hooks`, que não é versionado. Por
// isso a instalação é um script versionado, e não um arquivo commitado — máquina nova roda
// isto uma vez. Sem ele, a conferência existe e ninguém a chama.
//
// Hoje instala um só:
//   commit-msg → `scripts/conferir_mensagem.mjs`, que aplica as regras de vazamento à
//   MENSAGEM do commit. A varredura normal lê os arquivos da árvore; a mensagem não é um
//   arquivo, e foi por essa fresta que um caminho de máquina entrou na história em
//   12/09/2026 — com a árvore limpa e o varredor certo sobre o que ele vê.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pastaGit = execFileSync('git', ['-C', REPO, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
const destino = path.resolve(REPO, pastaGit, 'hooks')
fs.mkdirSync(destino, { recursive: true })

const gancho = path.join(destino, 'commit-msg')
const corpo = [
  '#!/bin/sh',
  '# Instalado por scripts/instalar_ganchos.mjs. Nao editar a mao: rode o instalador.',
  '# A mensagem do commit passa pelas mesmas regras de vazamento que os arquivos.',
  'exec node "$(git rev-parse --show-toplevel)/scripts/conferir_mensagem.mjs" "$1"',
  '',
].join('\n')

fs.writeFileSync(gancho, corpo, { encoding: 'utf8' })
try { fs.chmodSync(gancho, 0o755) } catch { /* no Windows nao faz falta */ }
console.log(JSON.stringify({ instalado: ['commit-msg'], onde: destino }, null, 2))
