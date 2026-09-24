// A LOJA funciona: instalar extensão por ID, da galeria, numa pasta limpa.
//
// ⚠️ Este teste existe porque o defeito mais perigoso da V0 passou despercebido por
// falta dele. O instalador do projeto usa o cache de `.vsix`, e **arquivo local não
// passa por verificação de assinatura**: ele marcava "8 de 10 instaladas" enquanto a
// loja não instalava absolutamente nada (o verificador é módulo proprietário, ausente
// numa build aberta). As 8 entravam porque eram arquivo — não porque a loja andava.
//
// Por isso a asserção aqui é o caminho que a pessoa usa de verdade: `--install-extension
// <id>`, sem arquivo nenhum, com a pasta de extensões vazia.
//
// ⚠️ LIMITE DECLARADO — o que este teste NÃO cobre.
//
// `--install-extension <id>` é instalação **não interativa**, e por isso **pula o
// diálogo de confiança no publisher**. Quem instala pela interface (o caminho de
// quem usa o editor no dia a dia) leva um passo a mais: ao clicar "Install" numa
// extensão de um publisher ainda não confiado, abre um modal — *"Do you trust the
// publisher 'X'? … X is not verified"* — com "Trust Publisher & Install" / "Cancel".
// Só depois do clique a extensão entra.
//
// Isso foi exercitado à mão por uma revisao independente do ciclo da V0 (05/09/2026), pela
// UI, com clique de verdade, e a extensão de fato instalou — está provado, só não
// está automatizado aqui. Como a Open VSX não tem publisher "verificado" como a loja
// da Microsoft, é de esperar que **toda primeira instalação de um publisher novo pela
// interface** mostre o aviso. Não é bloqueio; é um clique que a frase "a loja
// funciona" não descreve, e que precisa estar no guia de primeiro uso da V8.
//
// Está escrito aqui, e não só no relatório da revisão, porque é exatamente o formato
// do defeito que quase passou na V0: um teste verde por exercitar o caminho que a
// pessoa NÃO usa.
//
// Precisa de rede (a galeria é a Open VSX). Sem rede, diz isso em vez de acusar o
// produto.
//
// Uso: node testes/loja.mjs [caminho do exe]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { acharExe, ambienteLimpo } from './comum.mjs'

// Uma extensão pequena, sem dependências, que existe na Open VSX. Trocar aqui se ela
// sair do ar — a ideia é que o teste seja rápido e não dependa de nada pesado.
const ALVO = 'mechatroner.rainbow-csv'

const exe = acharExe(process.argv[2])
if (!exe || !fs.existsSync(exe)) { console.log('nao achei o executavel compilado'); process.exit(1) }

// O CLI vem do product.json do PRÓPRIO build — nunca chutado pelo nome.
const pastaBuild = path.dirname(exe)
let applicationName = ''
try {
  applicationName = JSON.parse(
    fs.readFileSync(path.join(pastaBuild, 'resources', 'app', 'product.json'), 'utf8')).applicationName
} catch { /* fica vazio e reprova abaixo */ }
const cli = applicationName ? path.join(pastaBuild, 'bin', applicationName + '.cmd') : null

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}

checar('o build informa o proprio nome de linha de comando', !!cli && fs.existsSync(cli),
  cli || 'nao consegui ler applicationName do product.json do build')

if (cli && fs.existsSync(cli)) {
  // Pasta de extensões DESCARTÁVEL: o teste não pode passar porque a extensão já
  // estava no perfil de quem usa o computador — foi assim que o defeito se escondeu.
  const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-loja-'))
  try {
    let saida = ''
    let deuErro = false
    try {
      // `cmd /c` com argumentos SEPARADOS: chamar o .cmd direto da EINVAL no Node 24
      // do Windows, e `shell: true` concatenaria tudo sem aspas (espaco no caminho
      // quebra). Assim quem monta a linha de comando e o proprio Windows.
      saida = execFileSync('cmd', ['/c', cli, '--install-extension', ALVO, '--extensions-dir', area],
        { encoding: 'utf8', timeout: 300000, env: ambienteLimpo() })
    } catch (e) {
      deuErro = true
      saida = (e.stdout || '') + (e.stderr || '') || String(e)
    }

    // ⚠️ Falta de rede NAO acusa o produto — mas TAMBEM NAO o aprova.
    //
    // Este bloco saia com codigo 0, e quem chama (regressao.mjs) le SO o codigo de
    // saida: um `execFileSync` que volta 0 virava `checar(..., true)` e o criterio
    // aparecia como "OK a loja instala extensao por id (patch 0003 valendo)" — sem ter
    // instalado nada. Maquina offline, ou a Open VSX fora do ar, davam VERDE no
    // criterio que o plano chama de bloqueio mais perigoso da V0.
    //
    // Codigo 78 = "pulado", e nao 0 nem 1: quem chama distingue os tres. Achado por
    // revisor independente em 05/09/2026.
    //
    // ⚠️ O reconhecimento continua sendo por texto e continua sendo frouxo: /network/i
    // casa com qualquer saida que contenha a palavra. Se o patch 0003 parar de aplicar
    // numa tag futura e o erro mencionar "network", isto vira "pulado" em vez de
    // vermelho. Agora ao menos "pulado" nao e mais confundido com aprovado.
    const semRede = /getaddrinfo|ENOTFOUND|ECONNREFUSED|network|ETIMEDOUT/i.test(saida)
    if (semRede) {
      console.log('  PULADO  parece falta de rede — este teste precisa da galeria. Nao acuso o produto, e nao o aprovo.')
      console.log('\n' + JSON.stringify({ passou: null, motivo: 'sem rede' }))
      process.exit(78)
    }

    checar('instalar da LOJA por id, sem arquivo local', !deuErro && /successfully installed/i.test(saida),
      saida.split('\n').filter(l => l.trim() && !/Deprecation/i.test(l)).slice(-2).join(' | '))

    // Instalou de verdade, ou só disse que sim?
    const registro = path.join(area, 'extensions.json')
    let entrou = false
    try {
      entrou = JSON.parse(fs.readFileSync(registro, 'utf8'))
        .some(e => e.identifier?.id?.toLowerCase() === ALVO)
    } catch { /* fica falso */ }
    checar('a extensao ficou registrada na pasta limpa', entrou, ALVO)

    // A mensagem do 5º bloqueio não pode voltar calada.
    checar('nenhuma recusa por verificacao de assinatura',
      !/Signature verification/i.test(saida),
      /Signature verification/i.test(saida) ? 'o patch de viabilidade 0003 nao esta valendo neste build' : '')
  } finally {
    try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* some no proximo boot */ }
  }
}

const falhas = resultados.filter(r => !r.ok)
console.log('\n' + JSON.stringify({ passou: falhas.length === 0, falhas: falhas.map(f => f.nome) }))
process.exit(falhas.length ? 1 : 0)
