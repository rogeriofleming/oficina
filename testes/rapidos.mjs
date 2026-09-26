// OS TESTES RAPIDOS — tudo que prova o produto SEM abrir janela, sem build e sem gastar.
//
// Por que existe: da V8 em diante as versoes sao construidas em sequencia e a revisao inteira fica
// para o fim. O que segura o defeito grosseiro enquanto isso sao estes testes, rodados a cada
// versao. Eles ja existiam soltos; aqui rodam juntos, com um placar so.
//
// ⚠️ O PISO de cada suite NAO mora aqui. Ele e lido da `regressao.mjs` (as constantes nomeadas),
// que e a fonte unica: uma segunda copia dos numeros ficaria velha no primeiro criterio novo.
//
// ⚠️ O historico do git passa com ZERO NOVOS, nao com zero achados: os herdados tem linha de base
// propria (ver `vazamento_historico.mjs`) e so saem reescrevendo a historia.
//
// Uso:  node testes/rapidos.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const regressao = fs.readFileSync(path.join(REPO, 'testes', 'regressao.mjs'), 'utf8')
const piso = nome => {
  // ⚠️ A LEITURA DO PISO NAO PODE ANCORAR NEM NO COMECO NEM NO FIM DA LINHA — os dois jeitos ja
  // cegaram o medidor, e o segundo fui eu que causei consertando o primeiro.
  //
  //   o fim da linha:     a versao original casava `= ([0-9]+) *\r?$`, exigindo fim de linha logo
  //                       apos o numero. Toda constante com comentario ao lado ficava sem piso, e
  //                       uma ficou desde a V21: `const AJUSTES_DA_OFICIAL = 35 // V21: +8 (...)`.
  //                       O efeito nao foi um piso frouxo, foi pior — a suite aparecia como FALHA
  //                       no placar em TODA corrida, com os 35 criterios dela verdes. Vermelho
  //                       rotineiro deixa de ser sinal, e este ja vinha sendo ignorado.
  //
  //   o comeco da linha:  o conserto com `^` derrubou OUTROS OITO pisos de uma vez (motor,
  //                       comando, proposta, sessoes, acoes, ponte, registro, robo), porque essas
  //                       constantes sao declaradas INDENTADAS, dentro de um bloco. O placar
  //                       acusou na corrida seguinte — que e a razao de se rodar o medidor de novo
  //                       depois de mexer nele.
  //
  // ⚠️ E NADA DE `\b` DENTRO DE TEMPLATE LITERAL: ali ele nao e borda de palavra, e o caractere
  // de backspace. A terceira tentativa deixou os 27 pisos sem leitura de uma vez so, e so o placar
  // disse. Por isso aqui nao ha regex montado com texto: a linha e achada por comparacao direta.
  const linha = regressao.split(/\r?\n/).find(l => l.trim().startsWith(`const ${nome} = `))
  if (!linha) return null
  const m = linha.match(/= *([0-9]+)/)
  return m ? Number(m[1]) : null
}

// [arquivo, constante do piso na regressao (ou null), como ler o "passou"]
const SUITES = [
  ['rodar.mjs', 'MOTOR'],
  ['comando.mjs', 'COMANDO'],
  ['proposta.mjs', 'PROPOSTA'],
  ['sessoes.mjs', 'SESSOES'],
  ['acoes.mjs', 'ACOES'],
  ['ponte.mjs', 'PONTE'],
  ['registro.mjs', 'REGISTRO'],
  ['robo.mjs', 'ROBO'],
  ['tokens.mjs', 'TOKENS'],
  ['tela_tokens.mjs', 'TELA_TOKENS'],
  ['layout.mjs', 'LAYOUT'],
  ['skills.mjs', 'SKILLS'],
  ['tela_skills.mjs', 'TELA_SKILLS'],
  ['relogio_cache.mjs', 'RELOGIO_CACHE'],
  ['limite.mjs', 'LIMITE'],
  ['tela_limite.mjs', 'TELA_LIMITE'],
  // ⚠️ AS SEIS DA V20. Elas foram escritas, passavam à mão, e NÃO estavam em bateria nenhuma —
  // ou seja, quebrar qualquer uma delas não deixaria nada vermelho. Um revisor independente pegou.
  // Suíte fora de bateria é suíte que não protege nada.
  ['uso_do_plano.mjs', 'USO_DO_PLANO'],
  ['titulo_da_conversa.mjs', 'TITULO_DA_CONVERSA'],
  ['faixa_do_limite.mjs', 'FAIXA_DO_LIMITE'],
  // ⚠️ ESTA PRECISA DE REDE E CUSTA ~10 s — e fica na bateria assim mesmo. Ela é a única que prova
  // que a faixa mostra o número de AGORA: sem ela, voltar a ler só o registro local (parado em
  // 29% por 50 min, medido) passaria verde em tudo.
  ['consulta_de_uso.mjs', 'CONSULTA_DE_USO'],
  // O padrão de fábrica que a conversa oficial não enxerga (o bypass que lia "Auto" na tela).
  ['padrao_da_conversa_oficial.mjs', 'PADRAO_DA_OFICIAL'],
  ['sessao_ativa.mjs', 'SESSAO_ATIVA'],
  ['pasta_de_sempre.mjs', 'PASTA_DE_SEMPRE'],
  ['ver_html.mjs', 'VER_HTML'],
  ['extensoes_que_faltam.mjs', 'EXTENSOES_QUE_FALTAM'],
  ['mostrador_de_tokens.mjs', 'MOSTRADOR_DE_TOKENS'],
  ['tela_do_consumo.mjs', 'TELA_DO_CONSUMO'],
  ['ajustes_da_conversa_oficial.mjs', 'AJUSTES_DA_OFICIAL'],
  ['guarda_produto.mjs', 'GUARDA_PRODUTO'],
  ['temas.mjs', 'TEMAS'],
  // ⚠️ AS QUATRO DA V26. Elas rodam SEM `--real`: a bateria não depende de haver uma conta logada
  // nem de o CLI da instalação existir nesta máquina. O modo real (`node testes/mcps.mjs --real`)
  // acrescenta um critério e é rodado à mão, quando se quer provar contra o Claude de verdade.
  ['mcps.mjs', 'MCPS'],
  ['tela_mcps.mjs', 'TELA_MCPS'],
  ['conta.mjs', 'CONTA'],
  ['tela_conta.mjs', 'TELA_CONTA'],
  ['vazamento_regras.mjs', null],
  ['vazamento_historico.mjs', null, p => p.novos === 0],
]

const linhas = []
let tudoVerde = true
for (const [arquivo, nomeDoPiso, passouSe] of SUITES) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [path.join(REPO, 'testes', arquivo)], { encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 })
  const saida = String(r.stdout || '')
  let placar = null
  try { placar = JSON.parse(saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()) } catch { }
  const passou = !!placar && (passouSe ? passouSe(placar) : placar.passou === true && r.status === 0)
  const esperado = nomeDoPiso ? piso(nomeDoPiso) : null
  const pisoOk = !nomeDoPiso || (esperado !== null && placar && placar.total === esperado)
  const pulados = placar && Array.isArray(placar.pulados) ? placar.pulados.length : 0
  const ok = passou && pisoOk
  if (!ok) tudoVerde = false
  linhas.push({ arquivo, ok, total: placar ? (placar.total ?? placar.casos ?? null) : null, piso: esperado, pulados,
    falhas: placar ? (placar.falhas && placar.falhas.length !== undefined ? placar.falhas : placar.listaNovos || []) : ['sem placar'],
    segundos: Math.round((Date.now() - t0) / 1000) })
}

// A varredura da arvore de hoje (o que sera publicado).
const v = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'varrer_vazamento.mjs')], { encoding: 'utf8' })
const vazamentoOk = v.status === 0
if (!vazamentoOk) tudoVerde = false

/*
  ⛔ TODO ARQUIVO DE CÓDIGO AO MENOS ABRE — inclusive os que esta bateria NÃO roda.

  ⚠️ POR QUE ISTO PRECISOU EXISTIR (20/09/2026). Uma linha de `regressao.mjs` ficou com uma
  expressão regular partida ao meio por um erro de ferramenta, e o arquivo deixou de abrir: a
  regressão inteira morria na primeira linha. E esta bateria continuou VERDE nas 21 suítes,
  porque ela LÊ o `regressao.mjs` como TEXTO (é de lá que saem os pisos) e nunca o executa. O
  instrumento que mede o produto estava quebrado, e o placar do produto dizia que estava tudo bem.

  A conferência é a mais barata que existe (o próprio Node abre o arquivo e não roda nada), e
  cobre também scripts e módulos da extensão que só são exercitados em outro momento.
*/
const arquivosDeCodigo = []
for (const [pasta, ext] of [['testes', '.mjs'], ['scripts', '.mjs'], [path.join('extensoes', 'oficina-claude'), '.js']]) {
  const dir = path.join(REPO, pasta)
  if (!fs.existsSync(dir)) continue
  for (const f of fs.readdirSync(dir)) if (f.endsWith(ext)) arquivosDeCodigo.push(path.join(dir, f))
}
const naoAbrem = []
for (const f of arquivosDeCodigo) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) naoAbrem.push(`${path.relative(REPO, f)}: ${String(r.stderr || '').split('\n').find(l => /Error/.test(l)) || 'nao abre'}`)
}
// Guarda contra o critério encolher em silêncio: uma lista vazia de arquivos daria "0 problemas".
const sintaxeOk = naoAbrem.length === 0 && arquivosDeCodigo.length >= 40
if (!sintaxeOk) tudoVerde = false

/*
  ⛔ TODA SUÍTE ESTÁ EM ALGUMA BATERIA — o guarda que faltava.

  ⚠️ POR QUE ISTO PRECISOU EXISTIR (21/09/2026). Duas vezes seguidas o mesmo buraco: na V20, SEIS
  suítes existiam, passavam à mão e não estavam em bateria nenhuma — quebrá-las não deixava nada
  vermelho. Foram postas nas baterias, e na rodada seguinte um revisor independente achou o mesmo
  problema com a `abertura_v20.mjs`, que é justamente o teste de aceitação da V20 na tela.
  Consertar caso a caso não resolve: o que resolve é um critério que COBRE a lista.

  As sondas (que existem para rodar à mão, com o build ou com o agente de verdade) ficam de fora
  por nome, uma a uma, e cada uma com a razão escrita — é a única forma de a exceção ser visível.
*/
const SONDAS_FORA_DE_BATERIA = {
  'comum.mjs': 'não é suíte: são as ferramentas que as outras usam',
  'retrato.mjs': 'sonda manual: tira foto da tela para olho humano',
  'retrato_painel.mjs': 'sonda manual: foto do painel próprio',
  'sonda_python.mjs': 'sonda manual: exige ambiente de Python montado',
  'spike_agente.mjs': 'sonda manual: sobe agente de verdade para medir o SDK',
  'retomar_de_verdade.mjs': 'cara demais para bateria: retoma conversa real (declarado)',
  // As tres sondas da V22, declaradas aqui na V23. Elas nao tem UM `checar()` sequer: existem
  // para responder uma pergunta de investigacao e morrer, e por isso nao ha o que ficar verde
  // ou vermelho nelas. Ficaram apontadas como orfas desde que nasceram, e orfa que nao tem
  // conserto possivel so ensina a ignorar a lista.
  'sonda_folga_da_barra.mjs': 'sonda de controle: mede a folga da barra de cima ao vivo',
  'sonda_limites_na_barra.mjs': 'sonda de medida (V27): cabem os medidores do limite na barra de cima, em tela cheia e meia tela',
  'sonda_vao_da_barra.mjs': 'sonda de medida (V29): quem ocupa cada trecho da barra de cima, e a largura do bloco de icones contra o que ele desenhou',
  'antes_do_longo.mjs': 'conferidor (V29): o que se prova em segundos ANTES de regressao ou empacotamento — ele RODA esta bateria, nao pertence a ela',
  'sonda_skills_na_barra.mjs': 'sonda de controle: conta os icones da barra de cima',
  'sonda_viabilidade_truncar.mjs': 'sonda de viabilidade: testa estilos candidatos antes do patch',
  'sonda_dom_da_barra.mjs': 'sonda de leitura: imprime o DOM da barra de cima para o seletor sair de medicao',
  'regressao.mjs': 'é a outra bateria',
  'rapidos.mjs': 'é esta bateria',
}
const suitesNaRapida = new Set(SUITES.map(([a]) => a))
const textoDaRegressao = fs.readFileSync(path.join(REPO, 'testes', 'regressao.mjs'), 'utf8')
const orfas = []
for (const f of fs.readdirSync(path.join(REPO, 'testes'))) {
  if (!f.endsWith('.mjs')) continue
  if (suitesNaRapida.has(f) || SONDAS_FORA_DE_BATERIA[f]) continue
  // A regressão chama as suítes pelo nome do arquivo, em texto.
  if (textoDaRegressao.includes(f)) continue
  orfas.push(f)
}
const orfasOk = orfas.length === 0
if (!orfasOk) tudoVerde = false

/*
  ⛔ OS FONTES SÃO TEXTO — e este critério estava na bateria ERRADA.

  Ele existe desde a V4, mas só dentro da `regressao.mjs`, que exige um build. A bateria rápida —
  a que se roda dezenas de vezes por sessão — não o tinha. Em 24/09/2026 isso custou: escapes de
  texto viraram BYTES de controle dentro de uma regex, tudo continuou verde aqui (e o conferidor
  pré-build liberou o build), e quem denunciou foi um `grep` respondendo "Binary file … matches".

  Um arquivo de código com byte de controle dentro funciona e vira **binário para o git**: sem
  diff legível, sem revisão possível — num repositório público. A checagem custa milissegundos e o
  lugar dela é aqui, no ciclo curto, ao lado da que confere se todo arquivo abre.
*/
const sujos = []
for (const rel of arquivosDeCodigo) {
  let bruto
  try { bruto = fs.readFileSync(path.join(REPO, rel)) } catch { continue }
  if (bruto.some(b => b < 9 || b === 11 || b === 12 || (b > 13 && b < 32) || b === 127)) sujos.push(rel)
}
const textoOk = sujos.length === 0
if (!textoOk) tudoVerde = false

for (const l of linhas) {
  const piso = l.piso === null ? '' : ` (piso ${l.piso})`
  const pul = l.pulados ? `  ⚠️ ${l.pulados} PULADO(S)` : ''
  console.log(`  ${l.ok ? 'OK  ' : 'FALHA'} ${l.arquivo.padEnd(24)} ${String(l.total ?? '-').padStart(4)}${piso}  ${l.segundos}s${pul}`)
  if (!l.ok) for (const f of [].concat(l.falhas).slice(0, 5)) console.log(`         ${typeof f === 'string' ? f : JSON.stringify(f)}`)
}
console.log(`  ${vazamentoOk ? 'OK  ' : 'FALHA'} varrer_vazamento.mjs`)
console.log(`  ${sintaxeOk ? 'OK  ' : 'FALHA'} todo arquivo de codigo abre    ${arquivosDeCodigo.length} arquivos`)
for (const p of naoAbrem) console.log('         ' + p)
console.log(`  ${orfasOk ? 'OK  ' : 'FALHA'} toda suite esta em bateria`)
for (const f of orfas) console.log(`         ORFA: ${f} — nao roda em bateria nenhuma (quebra-la nao deixa nada vermelho)`)
console.log(`  ${textoOk ? 'OK  ' : 'FALHA'} todo fonte e TEXTO (sem byte de controle)   ${arquivosDeCodigo.length} arquivos`)
for (const p of sujos) console.log(`         BINARIO PARA O GIT: ${p} — sem diff legivel, sem revisao possivel`)
console.log(JSON.stringify({ passou: tudoVerde, suites: linhas.length + 3,
  falhas: linhas.filter(l => !l.ok).map(l => l.arquivo)
    .concat(vazamentoOk ? [] : ['varrer_vazamento.mjs'])
    .concat(sintaxeOk ? [] : ['sintaxe: ' + (naoAbrem.join(' | ') || 'o criterio nao mediu arquivo nenhum')])
    .concat(orfasOk ? [] : ['suites orfas: ' + orfas.join(', ')])
    .concat(textoOk ? [] : ['fonte com byte de controle: ' + sujos.join(', ')]),
  pulados: linhas.reduce((n, l) => n + l.pulados, 0) }))
process.exit(tudoVerde ? 0 : 1)
