// V2 — SPIKE 2: o que o painel precisa e o V0.5 NÃO mediu.
//
// O V0.5 respondeu "o SDK carrega, responde e faz streaming dentro da OFICINA".
// Isso destravou a V2, mas deixou de fora as três peças de que o PAINEL depende —
// e desenhar tela sobre elas sem medir seria construir sobre "acho que dá":
//
//   1. `canUseTool` é mesmo chamado? Com quais campos? (é a permissão pela UI)
//   2. `abortController` cancela de verdade? (é o botão "parar")
//   3. `accountInfo()` diz quem está logado? (é o login/logout do painel)
//
// ⚠️ CONTROLE POSITIVO OBRIGATÓRIO. A lição mais cara do V0.5 está registrada no
// historico do projeto: mediu-se "a ferramenta negada sumiu da lista" usando como marcador uma
// ferramenta que JÁ ESTAVA fora antes de qualquer `deny` — deu verde sem provar nada.
// Aqui, "o deny bloqueou" só vale se o MESMO pedido, com `allow`, tiver escrito o
// arquivo. Sem o par, "não aconteceu" não é evidência de nada.
//
// ⚠️ ONDE ELE MEXE. O agente recebe uma pasta TEMPORÁRIA e descartável como `cwd`.
// Nunca uma pasta de trabalho de verdade. Este spike escreve fora dele de propósito.
//
// ⚠️ NENHUMA credencial aqui: usa-se a que já está na máquina de quem roda.
//
// Uso:  node extensoes-dev/oficina-spike/spike_v2_permissoes.mjs
// Saída: laudo em JSON no stdout e em <OFICINA_BUILD>/log/spike_v2_*.json

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SDK = '@anthropic-ai/claude-agent-sdk'

/** Cada pergunta é binária. O que não for provado sai `false`, nunca `null` decorativo. */
const laudo = {
  quando: new Date().toISOString(),
  ondeRodou: 'node puro, fora do editor',
  versaoNode: process.version,
  permissao: {
    // O par que dá sentido um ao outro.
    negado_naoEscreveu: false,
    permitido_escreveu: false,
    canUseToolFoiChamado: false,
    ferramentaPedida: null,
    camposRecebidos: [],
    titulo: null,
    nomeCurto: null,
  },
  cancelamento: {
    abortouEmMs: null,
    laçoTerminou: false,
    comoTerminou: null,
  },
  conta: {
    respondeu: false,
    campos: [],
    temEmail: false,
    tipoAssinatura: null,
  },
  erros: [],
}

function pastaDescartavel(nome) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), `oficina-spike-${nome}-`))
  return p
}

/**
 * Cenário de escrita: pede ao agente para criar um arquivo e decide na mão se
 * deixa. Devolve se o arquivo NASCEU — que é o fato observável, não a opinião do
 * agente sobre o que ele fez.
 */
async function cenarioEscrita(query, { deixar }) {
  const pasta = pastaDescartavel(deixar ? 'permitido' : 'negado')
  const alvo = path.join(pasta, 'prova.txt')
  let chamou = false

  const resposta = query({
    prompt: `Crie o arquivo prova.txt nesta pasta com o texto: oficina. Use a ferramenta Write. Não pergunte nada.`,
    options: {
      cwd: pasta,
      maxTurns: 3,
      settingSources: ['project'],
      // ⚠️ 'default' e não 'plan': em 'plan' o agente não tenta escrever, e o
      // canUseTool nunca seria chamado — o teste passaria a medir o próprio setup.
      permissionMode: 'default',
      canUseTool: async (nomeFerramenta, entrada, opcoes) => {
        chamou = true
        if (!laudo.permissao.canUseToolFoiChamado) {
          laudo.permissao.canUseToolFoiChamado = true
          laudo.permissao.ferramentaPedida = nomeFerramenta
          laudo.permissao.camposRecebidos = Object.keys(opcoes || {})
          laudo.permissao.titulo = (opcoes && opcoes.title) || null
          laudo.permissao.nomeCurto = (opcoes && opcoes.displayName) || null
        }
        return deixar
          ? { behavior: 'allow', updatedInput: entrada }
          : { behavior: 'deny', message: 'O spike negou de propósito.' }
      },
    },
  })

  let fim = null
  for await (const msg of resposta) {
    if (msg && msg.type === 'result') fim = msg.subtype || 'result'
  }

  const nasceu = fs.existsSync(alvo)
  try { fs.rmSync(pasta, { recursive: true, force: true }) } catch { }
  return { nasceu, chamou, fim }
}

/** Cancelamento: dispara algo longo e aborta. O que se mede é o laço PARAR. */
async function cenarioCancelamento(query) {
  const pasta = pastaDescartavel('cancelar')
  const controle = new AbortController()
  const t0 = Date.now()

  const resposta = query({
    prompt: 'Conte devagar de 1 até 500, um número por linha, sem pressa.',
    options: { cwd: pasta, maxTurns: 1, abortController: controle, settingSources: [] },
  })

  // Aborta no meio do caminho — depois que a resposta começou a chegar.
  setTimeout(() => controle.abort(), 2500)

  try {
    for await (const _ of resposta) { /* consumir até parar */ }
    laudo.cancelamento.comoTerminou = 'o laço acabou sozinho'
  } catch (e) {
    // O SDK sinaliza o aborto por exceção; é comportamento esperado, não falha.
    laudo.cancelamento.comoTerminou = 'exceção: ' + String((e && e.message) || e).slice(0, 120)
  }
  laudo.cancelamento.abortouEmMs = Date.now() - t0
  laudo.cancelamento.laçoTerminou = true
  try { fs.rmSync(pasta, { recursive: true, force: true }) } catch { }
}

/** Quem está logado — o dado que o painel mostra no canto. */
async function cenarioConta(query) {
  const pasta = pastaDescartavel('conta')
  const resposta = query({
    prompt: 'oi',
    options: { cwd: pasta, maxTurns: 1, settingSources: [] },
  })
  try {
    if (typeof resposta.accountInfo === 'function') {
      const info = await resposta.accountInfo()
      laudo.conta.respondeu = !!info
      laudo.conta.campos = info ? Object.keys(info) : []
      // ⚠️ O e-mail NÃO vai para o laudo: só o FATO de existir. Laudo é artefato
      // que pode ser commitado; dado de conta de pessoa não entra nele.
      laudo.conta.temEmail = !!(info && (info.email || (info.account && info.account.email)))
      laudo.conta.tipoAssinatura = (info && (info.subscriptionType || info.subscription_type)) || null
    } else {
      laudo.erros.push('a Query não expõe accountInfo() nesta versão')
    }
  } catch (e) {
    laudo.erros.push('accountInfo falhou: ' + String((e && e.message) || e).slice(0, 200))
  }
  try { await resposta.interrupt?.() } catch { }
  try { for await (const _ of resposta) { } } catch { }
  try { fs.rmSync(pasta, { recursive: true, force: true }) } catch { }
}

async function principal() {
  let query
  try {
    ({ query } = await import(SDK))
  } catch (e) {
    laudo.erros.push('não carreguei o SDK: ' + String((e && e.message) || e))
    return
  }

  // 1 e 2 — o par. O negado PRIMEIRO, para que um eventual arquivo deixado para
  // trás pelo permitido não possa ser confundido com falha do deny.
  try {
    const negado = await cenarioEscrita(query, { deixar: false })
    laudo.permissao.negado_naoEscreveu = negado.chamou && !negado.nasceu
    if (!negado.chamou) laudo.erros.push('canUseTool NÃO foi chamado no cenário negado')
  } catch (e) {
    laudo.erros.push('cenário negado falhou: ' + String((e && e.message) || e).slice(0, 200))
  }

  try {
    const permitido = await cenarioEscrita(query, { deixar: true })
    laudo.permissao.permitido_escreveu = permitido.nasceu
    if (!permitido.nasceu) {
      laudo.erros.push('CONTROLE POSITIVO FALHOU: com allow o arquivo também não nasceu — ' +
        'logo o "negado" acima não prova nada sobre o deny')
    }
  } catch (e) {
    laudo.erros.push('cenário permitido falhou: ' + String((e && e.message) || e).slice(0, 200))
  }

  try { await cenarioCancelamento(query) } catch (e) {
    laudo.erros.push('cancelamento falhou: ' + String((e && e.message) || e).slice(0, 200))
  }

  try { await cenarioConta(query) } catch (e) {
    laudo.erros.push('conta falhou: ' + String((e && e.message) || e).slice(0, 200))
  }
}

await principal()

const veredito = {
  '1. canUseTool é chamado': laudo.permissao.canUseToolFoiChamado,
  '2. deny bloqueia DE VERDADE (com controle positivo)':
    laudo.permissao.negado_naoEscreveu && laudo.permissao.permitido_escreveu,
  '3. cancelamento para o laço': laudo.cancelamento.laçoTerminou,
  '4. accountInfo() responde': laudo.conta.respondeu,
}
laudo.veredito = veredito

// ⚠️ Sem caminho DESTA máquina escrito no código: o repositório vira público na V8, e o
// critério 14 reprova caminho fixo — foi ele que pegou esta linha em 10/09/2026. Sem a
// variável, o laudo cai na pasta temporária do sistema, que existe em qualquer máquina.
const destino = path.join(process.env.OFICINA_BUILD || os.tmpdir(), 'log')
try {
  fs.mkdirSync(destino, { recursive: true })
  fs.writeFileSync(path.join(destino, `spike_v2_${Date.now()}.json`), JSON.stringify(laudo, null, 2), 'utf8')
} catch (e) {
  laudo.erros.push('não gravei o laudo: ' + String(e))
}

console.log(JSON.stringify(laudo, null, 2))
console.log('\n───────────── VEREDITO ─────────────')
for (const [k, v] of Object.entries(veredito)) console.log(`${v ? '  OK  ' : ' FALHA'}  ${k}`)
if (laudo.erros.length) console.log('\nERROS:\n- ' + laudo.erros.join('\n- '))
