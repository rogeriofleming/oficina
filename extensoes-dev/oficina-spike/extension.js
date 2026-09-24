// V0.5 — O SPIKE. A pergunta que decide se a V2 existe.
//
// Não é o painel. É a prova de vida do coração 2 do plano: **o Agent SDK carrega e
// responde dentro do host de extensão da OFICINA**, com streaming, e enxerga (ou não)
// o `.claude/settings.json` do projeto aberto. Se isso não acontece, não há painel
// nativo — e o plano B é continuar com a extensão oficial, com o custo de nunca
// consertar a interface que incomoda.
//
// ⚠️ A prova sai para o DISCO, não para a tela: um arquivo `spike_resultado.json` na
// pasta aberta. Padrão da casa — nunca perguntar ao próprio programa se ele
// funcionou. A tela mostra o mesmo, para quem está olhando.
//
// ⚠️ NENHUMA credencial aqui. O SDK usa a que a pessoa já tem na máquina; este código
// não lê, não escreve e não guarda token de ninguém (Anexo B, item 1).
//
// ⚠️ Este arquivo NÃO julga se o resultado é bom. Ele registra o que observou e
// quem montou o cenário (o teste) é que compara. Foi assim que o campo
// `leSettingsDoProjeto` deixou de ser um `null` decorativo: a extensão anota se a
// ferramenta marcadora veio na lista, o teste sabe o que pediu, e a conclusão nasce
// da comparação — não de uma dedução de dentro.

const vscode = require('vscode')
const path = require('path')
const fs = require('fs')

/** Cada etapa é uma pergunta binária. O que não for provado sai como `false`. */
function novoLaudo() {
  return {
    quando: new Date().toISOString(),
    ondeRodou: 'host de extensao da OFICINA',
    versaoEditor: vscode.version,
    sdkCarrega: false,
    versaoSdk: null,
    respondeu: false,
    streaming: false,
    pedacos: 0,
    tipos: [],
    texto: null,
    primeiroPedacoMs: null,
    totalMs: null,
    // O que foi OBSERVADO sobre a configuração do projeto. Quem interpreta é o teste,
    // que sabe qual marcador plantou na pasta aberta.
    observadoDoProjeto: { cwdDoAgente: null, bashNaLista: null, qtdFerramentas: null, agentes: null },
    erro: null
  }
}

/**
 * A versão do SDK, lida do disco.
 *
 * ⚠️ `require('@anthropic-ai/claude-agent-sdk/package.json')` NÃO funciona: o pacote
 * declara `exports` e o Node recusa o subcaminho (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
 * A versão anterior deste arquivo fazia exatamente isso dentro de um `try` vazio — o
 * laudo saía com `versaoSdk: null` sem ninguém saber por quê.
 */
function versaoDoSdk() {
  try {
    const p = path.join(__dirname, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'package.json')
    return JSON.parse(fs.readFileSync(p, 'utf8')).version
  } catch (e) { return 'nao li: ' + String((e && e.message) || e) }
}

async function rodarSpike() {
  const laudo = novoLaudo()
  const t0 = Date.now()
  laudo.versaoSdk = versaoDoSdk()

  const pasta = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
  const cwd = pasta ? pasta.uri.fsPath : undefined

  let query
  try {
    // O SDK é ESM; `import()` funciona a partir de CommonJS e não derruba o host de
    // extensão se o pacote não estiver lá.
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    query = sdk.query
    laudo.sdkCarrega = typeof query === 'function'
  } catch (e) {
    laudo.erro = 'nao consegui carregar o SDK: ' + String((e && e.message) || e)
    return laudo
  }

  if (!laudo.sdkCarrega) {
    laudo.erro = 'o pacote carregou mas nao expoe query()'
    return laudo
  }

  try {
    // Pergunta mínima e barata. O conteúdo não importa — o que se mede é se a
    // resposta CHEGA, e se chega em pedaços (streaming) ou de uma vez só.
    const resposta = query({
      prompt: 'Responda apenas com a palavra: vivo',
      options: {
        maxTurns: 1,
        cwd,
        // ⚠️ Pedido explicitamente, que é o item 9 do checklist da P1. Medido fora do
        // editor em 05/09/2026: no SDK 0.3.261 o `.claude/settings.json` do projeto é
        // lido MESMO SEM esta opção — mas pedir é o contrato, não o acaso.
        settingSources: ['project'],
        permissionMode: 'plan'
      }
    })

    for await (const msg of resposta) {
      if (laudo.pedacos === 0) laudo.primeiroPedacoMs = Date.now() - t0
      laudo.pedacos++
      laudo.respondeu = true
      if (msg && msg.type) laudo.tipos.push(msg.type)
      if (msg && msg.type === 'system' && msg.subtype === 'init') {
        const ferramentas = msg.tools || []
        laudo.observadoDoProjeto = {
          cwdDoAgente: msg.cwd || null,
          bashNaLista: ferramentas.includes('Bash'),
          qtdFerramentas: ferramentas.length,
          agentes: msg.agents || []
        }
      }
      if (msg && msg.type === 'result' && typeof msg.result === 'string') {
        laudo.texto = msg.result.slice(0, 200)
      }
    }
    laudo.streaming = laudo.pedacos > 1
    laudo.totalMs = Date.now() - t0
  } catch (e) {
    laudo.erro = 'o SDK carregou, mas a consulta falhou: ' + String((e && e.message) || e)
  }

  return laudo
}

/** Onde o laudo cai: o teste manda pelo ambiente; a pessoa recebe na pasta aberta. */
function destinoDoLaudo() {
  if (process.env.OFICINA_SPIKE_SAIDA) return process.env.OFICINA_SPIKE_SAIDA
  const pasta = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
  return pasta
    ? path.join(pasta.uri.fsPath, 'spike_resultado.json')
    : path.join(require('os').tmpdir(), 'spike_resultado.json')
}

async function executarEGravar() {
  const destino = destinoDoLaudo()
  vscode.window.setStatusBarMessage('OFICINA: perguntando ao agente...', 5000)

  let laudo
  try {
    laudo = await rodarSpike()
  } catch (e) {
    // Sem isto, uma exceção fora do `try` interno deixaria o teste esperando um
    // arquivo que nunca chega — e "não apareceu" viraria "o SDK não responde".
    laudo = novoLaudo()
    laudo.erro = 'excecao fora do previsto: ' + String((e && e.stack) || e)
  }

  // Prova no disco, fora da UI. Gravação atômica: o teste fica de olho neste arquivo
  // e não pode ler um JSON pela metade.
  try {
    fs.writeFileSync(destino + '.parcial', JSON.stringify(laudo, null, 2), 'utf8')
    fs.renameSync(destino + '.parcial', destino)
  } catch (e) {
    vscode.window.showErrorMessage('Spike: nao consegui gravar o laudo: ' + String(e))
  }

  const resumo = laudo.respondeu
    ? `VIVO — ${laudo.pedacos} pedaco(s), 1o em ${laudo.primeiroPedacoMs}ms`
    : `NAO RESPONDEU — ${laudo.erro || 'sem erro registrado'}`
  vscode.window.showInformationMessage('Spike do agente: ' + resumo)
  return laudo
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('oficina-claude.spike', executarEGravar))

  // ⚠️ Modo automático, para o teste não depender da paleta de comandos.
  //
  // Disparar pela paleta é o caminho da PESSOA e continua valendo. Mas como medida
  // ele é ruim: se a paleta não abrir, se o filtro difuso trouxer outro item, se o
  // idioma da interface mudar o texto, o laudo não sai — e "o SDK não respondeu"
  // seria a leitura errada de um problema de teclado. Com a variável no ambiente, o
  // spike roda sozinho quando o editor termina de subir.
  if (process.env.OFICINA_SPIKE_AUTO) {
    setTimeout(() => { executarEGravar() }, 1500)
  }
}

function deactivate() { }

module.exports = { activate, deactivate }
