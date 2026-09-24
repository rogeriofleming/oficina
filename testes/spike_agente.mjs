// V0.5 — o spike do agente, medido DENTRO da OFICINA compilada.
//
// A pergunta que este teste responde é a que decide se a V2 existe: **o Agent SDK
// carrega e responde dentro do host de extensão da OFICINA?** Se não responde, não há
// painel nativo nosso, e os quatro requisitos de layout que ele ditou usando o editor
// (uma barra em vez de duas, nome da conversa na guia, ícone no lugar de "Remote
// Control", abrir direto na conversa) ficam sem lugar onde acontecer.
//
// ⚠️ Este teste NÃO olha a tela. Ele lê o laudo que a extensão grava no disco. Nunca
// perguntar ao próprio programa se ele funcionou — padrão da casa.
//
// ⚠️ E ele traz o CONTROLE NEGATIVO junto: a mesma medição num projeto sem
// `.claude/settings.json`. Sem o controle, "a ferramenta não apareceu na lista" não
// prova que a configuração do projeto foi lida — pode ser que ela nunca estivesse lá.
// Foi exatamente esse o erro das duas primeiras tentativas de medir isto fora do
// editor, em 05/09/2026.
//
// Uso:  node testes/spike_agente.mjs [caminho do exe] [--oficina|--linha-de-base]
//       OFICINA_BUILD e OFICINA_PLAYWRIGHT no ambiente.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { RAIZ, carregarElectron, acharExe, lerCarimbo, ambienteLimpo, argumentosDeTeste, esconderJanela, fecharApp } from './comum.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
// ⚠️ `extensoes-dev/`, não `extensoes/`: o que mora em `extensoes/` é embutido no
// produto, e uma extensão embutida com dependência que o build não instala derruba o
// empacotamento inteiro. O porquê está em `extensoes-dev/LEIA.md`.
const EXTENSAO = path.resolve(AQUI, '..', 'extensoes-dev', 'oficina-spike')
const ESPERA_MAX_MS = 240000   // o SDK levou ~14 s fora do editor; a folga é para a subida do editor

const resultados = []
const checar = (nome, ok, detalhe = '') => {
  resultados.push({ nome, ok: !!ok, detalhe: String(detalhe) })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 200) + ')' : ''}`)
}
const respirar = (ms) => new Promise(r => setTimeout(r, ms))

const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ passou: false, erro: 'nao achei o executavel compilado', procurei: RAIZ }))
  process.exit(1)
}
if (!fs.existsSync(path.join(EXTENSAO, 'node_modules', '@anthropic-ai', 'claude-agent-sdk'))) {
  console.log(JSON.stringify({
    passou: false,
    erro: 'o Agent SDK nao esta instalado na extensao do spike',
    oQueFazer: 'npm install em ' + EXTENSAO
  }))
  process.exit(1)
}

// Qual build é este? Entrada, nunca dedução — a pasta de saída tem nome fixo e recebe
// tanto a linha de base quanto a OFICINA.
const carimbo = lerCarimbo(exe)
const modo = process.argv.includes('--linha-de-base') ? 'puro'
  : process.argv.includes('--oficina') ? 'oficina'
    : (carimbo?.modo || null)
if (!modo) {
  console.log(JSON.stringify({
    passou: false,
    erro: 'este build nao tem carimbo (oficina-build.json) e ninguem disse o que ele deveria ser',
    oQueFazer: 'recompile pelo construir.bat (ele carimba), ou rode com --oficina / --linha-de-base'
  }))
  process.exit(1)
}
console.log('executavel: ' + exe)
console.log('carimbo: ' + (carimbo
  ? `modo ${carimbo.modo}, tag ${carimbo.tag}, sha ${String(carimbo.sha).slice(0, 12)}, de ${carimbo.quando}`
  : 'sem carimbo — modo informado na linha de comando'))

const _electron = await carregarElectron()

/**
 * Uma rodada: abre a OFICINA numa área descartável, deixa a extensão do spike rodar
 * sozinha (variável no ambiente — a paleta é o caminho da pessoa, não o do teste) e
 * espera o laudo aparecer no disco.
 *
 * `comMarcador` planta um `.claude/settings.json` que nega a ferramenta `Bash`. Se o
 * agente, lá dentro, não listar `Bash`, é porque leu a configuração daquele projeto.
 */
async function rodada(rotulo, comMarcador) {
  const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-spike-'))
  const projeto = path.join(area, 'projeto')
  fs.mkdirSync(projeto)
  fs.writeFileSync(path.join(projeto, 'exemplo.txt'), 'arquivo qualquer\n')
  if (comMarcador) {
    fs.mkdirSync(path.join(projeto, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(projeto, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { deny: ['Bash'] } }, null, 2), 'utf8')
  }
  const laudoPath = path.join(area, 'laudo.json')

  const env = ambienteLimpo()
  env.OFICINA_SPIKE_AUTO = '1'
  env.OFICINA_SPIKE_SAIDA = laudoPath

  console.log(`\n--- rodada: ${rotulo}`)
  let app = null
  let laudo = null
  let falha = null
  const t0 = Date.now()
  try {
    app = await _electron.launch({
      executablePath: exe,
      env,
      args: [
        ...argumentosDeTeste(projeto, area),
        // A extensão do spike não é empacotada nem publicada: entra pelo caminho que
        // o próprio editor oferece para extensão em desenvolvimento. Assim o teste não
        // precisa forjar um `extensions.json` de instalação, que é formato interno e
        // muda entre versões.
        '--extensionDevelopmentPath=' + EXTENSAO
      ],
      timeout: 120000
    })
    const win = await app.firstWindow({ timeout: 60000 })
    await esconderJanela(app)
    await win.waitForSelector('.monaco-workbench', { timeout: 60000 })

    while (Date.now() - t0 < ESPERA_MAX_MS && !fs.existsSync(laudoPath)) await respirar(1000)
    if (fs.existsSync(laudoPath)) laudo = JSON.parse(fs.readFileSync(laudoPath, 'utf8'))
    else falha = `o laudo nao apareceu em ${Math.round((Date.now() - t0) / 1000)}s`
  } catch (e) {
    falha = String(e).split('\n')[0]
  } finally {
    if (app) { try { await fecharApp(app) } catch { /* segue */ } }
  }

  try { fs.rmSync(area, { recursive: true, force: true }) } catch { /* some no proximo boot */ }
  return { laudo, falha, projeto, segundos: Math.round((Date.now() - t0) / 1000) }
}

const marcada = await rodada('projeto COM .claude/settings.json (deny Bash)', true)
if (marcada.laudo) console.log('  laudo: ' + JSON.stringify(marcada.laudo))
checar('a extensao ativou e gravou o laudo no disco', !!marcada.laudo,
  marcada.falha || `${marcada.segundos}s`)

if (marcada.laudo) {
  const l = marcada.laudo
  checar('o Agent SDK carrega dentro do host de extensao', l.sdkCarrega, 'versao ' + l.versaoSdk)
  // ⚠️ "respondeu" sozinho NAO prova resposta.
  //
  // Na extensao, `respondeu = true` e marcado no PRIMEIRO item do `for await`, seja
  // ele qual for. Numa maquina sem credencial ou com cota estourada, o CLI sobe,
  // emite `rate_limit_event` + `system/init` (que nao dependem de autenticacao, e sao
  // de onde saem o `cwd` e a lista de ferramentas) e SO ENTAO falha. Resultado: os
  // sete criterios verdes, o `erro` do SDK impresso ao lado de um OK, e o veredito
  // "V0.5: VAI" com o agente mudo.
  //
  // Por isso o criterio agora exige as tres coisas: sem erro, respondeu, e o TEXTO
  // pedido de volta. Achado por revisor independente em 05/09/2026 — o teste era meu.
  const disseVivo = typeof l.texto === 'string' && /vivo/i.test(l.texto)
  checar('o agente RESPONDEU de dentro da OFICINA (sem erro, e com o texto pedido)',
    l.respondeu && !l.erro && disseVivo,
    l.erro ? 'erro do SDK: ' + l.erro
      : `${l.pedacos} pedaco(s), texto: ${JSON.stringify(l.texto)}`)
  checar('a resposta chega em pedacos (streaming)', l.streaming,
    `${l.pedacos} pedaco(s): ${(l.tipos || []).join(' > ')}`)
  checar('o agente enxerga a pasta aberta no editor',
    !!l.observadoDoProjeto?.cwdDoAgente &&
    path.resolve(l.observadoDoProjeto.cwdDoAgente).toLowerCase() === path.resolve(marcada.projeto).toLowerCase(),
    'cwd do agente: ' + l.observadoDoProjeto?.cwdDoAgente)
}

// O CONTROLE: sem o marcador, a ferramenta tem que VOLTAR. Sem esta rodada, a ausência
// dela na rodada de cima não prova nada.
const controle = await rodada('projeto LIMPO (controle negativo)', false)
if (controle.laudo) console.log('  laudo: ' + JSON.stringify(controle.laudo.observadoDoProjeto))
checar('o controle negativo tambem rodou', !!controle.laudo, controle.falha || `${controle.segundos}s`)

const bashComMarcador = marcada.laudo?.observadoDoProjeto?.bashNaLista
const bashSemMarcador = controle.laudo?.observadoDoProjeto?.bashNaLista
checar('o .claude/settings.json do projeto VALE dentro da OFICINA',
  bashComMarcador === false && bashSemMarcador === true,
  `Bash na lista — com marcador: ${bashComMarcador}, sem marcador: ${bashSemMarcador}`)

const falhas = resultados.filter(r => !r.ok)
const veredito = falhas.length === 0 ? 'VAI' : 'NAO VAI'
console.log(`\n=== V0.5: ${veredito}`)

const laudoFinal = {
  quando: new Date().toISOString(),
  veredito,
  exe,
  carimbo,
  rodadaComMarcador: marcada.laudo || { falhou: marcada.falha },
  rodadaControle: controle.laudo?.observadoDoProjeto || { falhou: controle.falha },
  criterios: resultados
}
try {
  const destino = path.join(RAIZ, 'log')
  fs.mkdirSync(destino, { recursive: true })
  const arquivo = path.join(destino, 'spike_v05_' + Date.now() + '.json')
  fs.writeFileSync(arquivo, JSON.stringify(laudoFinal, null, 2), 'utf8')
  console.log('laudo gravado em: ' + arquivo)
} catch (e) { console.log('nao consegui gravar o laudo final: ' + e.message) }

console.log(JSON.stringify({ passou: falhas.length === 0, veredito, falhas: falhas.map(f => f.nome) }))
process.exit(falhas.length ? 1 : 0)
