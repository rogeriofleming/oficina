// REGRESSAO — a memoria dos criterios que ja foram conquistados.
//
// Cada versao da OFICINA acrescenta aqui os SEUS criterios binarios. O revisor
// revisao final roda este arquivo inteiro antes de escrever "PODE SEGUIR": ele responde
// "a versao nova quebrou alguma coisa que ja funcionava?".
//
// Uso: node testes/regressao.mjs [caminho do exe]
import fs from 'node:fs'
import path from 'node:path'
import { conferirIdentidade } from '../scripts/identidade.mjs'
import { acharExe, extensaoForaDeSincronia, temasForaDeSincronia } from './comum.mjs'
import { conferirTexto, ehArquivoDoDetector, EXTENSOES_BINARIAS } from '../scripts/vazamento.mjs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const RAIZ = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const CLONE = path.join(RAIZ, 'vscode')

const res = []
const checar = (versao, criterio, ok, detalhe = '') => {
  res.push({ versao, criterio, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  [${versao}] ${criterio}${detalhe ? '  (' + detalhe + ')' : ''}`)
}

/**
 * Roda uma suite que ABRE O EDITOR e GASTA (o agente de verdade), devolvendo o placar dela.
 *
 * ⚠️ A saida e capturada e reimpressa, em vez de herdada: e do placar que sai o PISO — sem ele um
 * criterio some dessas suites em silencio, que e a forma mais quieta de perder cobertura, e era o
 * caso das duas mais caras (revisao final da V3, 3a rodada).
 */
function rodarSuiteCara(arquivo, exe, tetoMs = 900000) {
  let saida = '', ok = true, como = ''
  try {
    saida = execFileSync(process.execPath, [path.join(REPO, 'testes', arquivo), exe],
      { encoding: 'utf8', timeout: tetoMs })
  } catch (e) {
    ok = false
    saida = String(e.stdout || '') + String(e.stderr || '')
    como = e && (e.signal ? `morreu por sinal ${e.signal}` : `saiu com ${e.status}`)
  }
  process.stdout.write(saida)
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  return {
    ok: ok && !!placar && placar.passou === true,
    total: placar ? placar.total : null,
    // Criterio PULADO nao SUMIU: ele aparece no placar como pulado (nunca como OK). O "nenhum criterio
    // sumiu" tem de somar os dois — a V28 deu vermelho ali com o criterio 6 da abertura pulado por falta
    // de medidores no perfil de teste (26/09/2026).
    pulados: placar && Array.isArray(placar.pulados) ? placar.pulados.length : 0,
    detalhe: placar ? `${placar.total} criterios; falhas: ${(placar.falhas || []).join(' | ') || 'nenhuma'}`
      : `nao li o placar${como ? ' (' + como + ')' : ''}`,
  }
}

// ─────────────── V0 ───────────────

// Criterio 3: identidade legalmente limpa. O nome do produto e do executavel nao
// pode carregar marca de terceiro — e disso depende o direito de distribuir.
{
  const p = path.join(REPO, 'produto', 'product.json')
  const d = JSON.parse(fs.readFileSync(p, 'utf8'))
  // A lista mora em scripts/identidade.mjs. Aqui ela era um SUBCONJUNTO de 6 dos 12
  // campos que o portao de build confere: a revisao final ficava mais fraco que o build,
  // e os dois pareciam verdes. Revisao independente, 05/09/2026.
  const sujos = conferirIdentidade(d)
  checar('V0', 'criterio 3: nenhum nome de terceiro na identidade do produto', sujos.length === 0, sujos.join(' | '))
  checar('V0', 'criterio 4: telemetria desligada no produto', d.enableTelemetry === false)
  // O canal de update de quem opera uma camada privada por cima deste produto (ver a
  // pasta de override, quando existir) e assunto dela, nunca deste arquivo publico: gravar
  // aqui um endereco de update fixo obrigaria QUALQUER pessoa que baixasse esta edicao a
  // bater nesse endereco para sempre. Por isso o produto GENERICO segue sem updateUrl ate
  // que exista um canal publico de verdade (ex.: GitHub Releases) por trás dele.
  checar('V0', 'criterio 4: sem updateUrl no produto generico (canal publico ainda em aberto, de proposito)',
    (d.__remover || []).includes('updateUrl'))
}

// Quem opera uma camada privada por cima (fora deste repositorio) pode trazer o proprio
// updateUrl num override de product.json aplicado no build. Quando essa camada existe ao
// lado (nao entra no repositorio publico), a unica exigencia daqui e que ela nunca aponte
// para um serviço de terceiro (ex.: nao usar o dominio de outro projeto como atalho).
//
// ⚠️ Este bloco só roda quando a camada privada existe ao lado. Fora dela é ausência
// ESPERADA, não defeito — por isso não conta como reprovação quando falta: um repositório
// público que reprova sozinho para qualquer pessoa que o clone não é um critério justo, é
// um alarme falso permanente.
{
  // Mesmo mecanismo do construir.bat: OFICINA_CAMADA, ou o ponteiro camada.local.txt
  // (gitignorado — o repositório conhece o MECANISMO, nunca o caminho de ninguém).
  let camada = process.env.OFICINA_CAMADA || ''
  const ponteiro = path.join(REPO, 'camada.local.txt')
  if (!camada && fs.existsSync(ponteiro)) camada = fs.readFileSync(ponteiro, 'utf8').trim()
  const pOverride = camada ? path.join(camada, 'product.override.json') : ''
  if (pOverride && fs.existsSync(pOverride)) {
    const over = JSON.parse(fs.readFileSync(pOverride, 'utf8'))
    checar('V7', 'override da equipe traz updateUrl proprio (nunca GitHub, nunca vazio)',
      typeof over.updateUrl === 'string' && !over.updateUrl.includes('github'),
      over.updateUrl || '(vazio)')
  }
}

// V7: o que vale e o PRODUTO COMPILADO, nao o fonte.
//
// ⛔ Duas revisoes independentes apontaram a mesma fresta em 12/09/2026: os criterios liam
// `produto/product.json` (o FONTE), e por isso nao viram que o executavel empacotado que estava
// na pasta de saida carregava um `updateUrl` que o fonte ja tinha revertido horas antes. Um
// instalador assim, se circulasse, faria a maquina de qualquer desconhecido consultar um
// endereco que ninguem decidiu expor.
//
// Estes criterios leem o `product.json` que FOI PARA DENTRO do build, e usam o carimbo para
// saber que edicao esperar. Sem pasta de saida (maquina que nunca compilou), eles nao rodam —
// ausencia esperada nao e reprovacao.
{
  const saida = path.join(RAIZ, 'VSCode-win32-x64')
  const pCarimbo = path.join(saida, 'oficina-build.json')
  const pProdutoDoBuild = path.join(saida, 'resources', 'app', 'product.json')

  if (fs.existsSync(pCarimbo) && fs.existsSync(pProdutoDoBuild)) {
    const carimbo = JSON.parse(fs.readFileSync(pCarimbo, 'utf8'))
    const doBuild = JSON.parse(fs.readFileSync(pProdutoDoBuild, 'utf8'))

    // O carimbo tem de dizer a edicao. Carimbo antigo (sem o campo) reprova de proposito: sem
    // ele, ninguem responde se aquele binario tem canal privado ou nao.
    checar('V7', 'o carimbo do build diz a edicao (neutra ou equipe)',
      carimbo.edicao === 'neutra' || carimbo.edicao === 'equipe',
      'carimbo diz: ' + (carimbo.edicao || '(nada)'))

    if (carimbo.edicao === 'neutra') {
      checar('V7', 'build NEUTRO compilado NAO tem updateUrl embutido',
        !doBuild.updateUrl, doBuild.updateUrl ? 'tem: ' + doBuild.updateUrl : 'ausente, como tem de ser')
    } else if (carimbo.edicao === 'equipe') {
      checar('V7', 'build da EQUIPE compilado TEM updateUrl embutido',
        typeof doBuild.updateUrl === 'string' && doBuild.updateUrl.length > 0,
        doBuild.updateUrl ? 'presente' : '(ausente - a camada privada nao foi aplicada)')
    }

    // `quality` decide comportamento em 49 arquivos do nucleo (preferir extensao
    // pre-lancamento, validade do cache de codigo, VSCODE_STABLE, contribuicoes
    // experimentais). Tirar essa string do esperado e o tipo de mudanca que passa calada:
    // aconteceu nesta versao, para escapar do pacote AppX, e uma revisao independente mediu o
    // estrago. Hoje o AppX e dispensado por patch de viabilidade, e `quality` volta a ser o
    // que o produto quer.
    checar('V7', 'quality do build compilado e "stable" (nao foi torcido para escapar do AppX)',
      doBuild.quality === 'stable', 'build diz: ' + (doBuild.quality || '(sem quality)'))
  }
}

// Criterio 13: patch sem explicacao e divida tecnica escondida. Quem subir de versao
// daqui a um ano precisa saber por que cada alteracao no nucleo existe.
{
  // Duas pastas: patches/ sao os NOSSOS (de produto) e patches/viabilidade/ os que
  // existem so porque a build aberta nao tem as pecas fechadas da Microsoft. A regra
  // do .md ao lado vale para as duas — a versao anterior so olhava a primeira, e o
  // primeiro patch do projeto nasceu justamente na segunda.
  const dirs = [path.join(REPO, 'patches'), path.join(REPO, 'patches', 'viabilidade')]
  const patches = dirs.flatMap(d =>
    fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.patch')).map(f => path.join(d, f)) : [])
  const semDoc = patches.filter(f => !fs.existsSync(f.replace(/\.patch$/, '.md')))
  checar('V0', 'criterio 13: todo patch tem o .md do porque ao lado', semDoc.length === 0,
    patches.length ? `${patches.length} patch(es)` : 'nenhum patch ainda')
}

// Os patches tem que CHEGAR INTEIROS na maquina de quem clonar.
//
// Descoberto em 06/09/2026, medindo byte a byte um `git clone` de verdade: os `.patch`
// sao gravados em LF no repositorio e chegavam ao clone em **CRLF**, porque o
// `core.autocrlf=true` do Windows os tratava como texto. E patch em CRLF NAO APLICA —
// os contadores do cabecalho `@@` deixam de bater com o conteudo:
//
//   error: patch failed: src/vs/base/common/product.ts:124
//   error: src/vs/base/common/product.ts: patch does not apply
//
// Valia para os TRES patches de viabilidade, commitados desde a V0: o projeto nao
// compilava num clone novo e ninguem sabia, porque o build so tinha rodado na maquina
// onde os patches nasceram. Este e o tipo de defeito que nenhum teste local pega —
// tudo passa aqui e nada funciona la.
//
// O criterio nao clona (seria caro): cobra a regra que impede a conversao, no lugar
// onde ela vale, perguntando ao proprio git como ele classifica cada arquivo.
{
  const dirs = [path.join(REPO, 'patches'), path.join(REPO, 'patches', 'viabilidade')]
  const patches = dirs.flatMap(d =>
    fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.patch')).map(f => path.join(d, f)) : [])
  const desprotegidos = []
  for (const p of patches) {
    let saida = ''
    try {
      saida = execFileSync('git', ['-C', REPO, 'check-attr', 'text', '--', path.relative(REPO, p)],
        { encoding: 'utf8' })
    } catch { saida = '' }
    // "text: unset" e o que `-text` produz. Qualquer outra coisa (unspecified, set)
    // deixa o autocrlf converter.
    if (!/text:\s*unset/.test(saida)) desprotegidos.push(path.basename(p))
  }
  checar('V1b', 'os patches viajam sem conversao de fim de linha (aplicam num clone novo)',
    patches.length > 0 && desprotegidos.length === 0,
    desprotegidos.length
      ? 'sem "-text" no .gitattributes: ' + desprotegidos.join(', ')
      : `${patches.length} patch(es) protegidos`)
}

// A guarda da mesclagem do product.json, vista FALHANDO.
//
// As chaves obrigatorias nao tem como ser cobradas no produto pronto: ou o editor nem
// abre (e nenhum outro teste chega a rodar), ou — no caso de `configurationDefaults` —
// ele abre perfeito com a cara do upstream e TODOS os outros criterios ficam verdes.
// Por isso o gate e a guarda em si: prova-se que ela aborta, com o cenario exato que
// causou o defeito, e com controle positivo para o script quebrado nao passar.
{
  try {
    execFileSync(process.execPath, [path.join(REPO, 'testes', 'guarda_produto.mjs')],
      { stdio: 'inherit', timeout: 120000 })
    checar('V1b', 'a guarda do product.json aborta quando uma chave obrigatoria some', true)
  } catch (e) {
    checar('V1b', 'a guarda do product.json aborta quando uma chave obrigatoria some', false, 'ver saida acima')
  }
}

// Criterio 5 (V1): os dois temas cobrem 100% dos tokens de cor, sao legiveis, e a
// brasa continua sendo a unica coisa quente da tela.
//
// Roda o arquivo inteiro em vez de repetir os criterios aqui: tema tem 979 cores e
// duplicar a conta e garantir que as duas contas divirjam algum dia. O que este bloco
// prova e o que a regressao precisa saber — "quebrou?" — e a saida detalhada aparece
// acima, com o nome do criterio que caiu.
// ⚠️ CODIGO DE SAIDA NAO BASTA AQUI — o teste pode sair 0 com criterios PULADOS.
//
// `temas.mjs` pula (nunca "passa") o que nao consegue medir nesta maquina: a lista de
// tokens quando o clone nao existe, e o anti-drift quando nao ha python. Julgando so
// pelo codigo de saida, a regressao carimbava esses criterios como OK — foi assim que
// o gate anti-drift sumiu inteiro, com o controle positivo junto, numa maquina sem
// python (medido pela revisao final em 06/09/2026 com `env -i`).
//
// Agora a saida e capturada, o JSON do fim e lido, e criterio pulado vira uma NOTA
// visivel com o motivo — nem OK, nem falha: NAO VERIFICADO.
{
  let saida = ''
  let ok = true
  let porqueFalhou = ''
  try {
    /*
      ⚠️ O PRAZO ERA DE 3 MINUTOS E NAO DAVA PARA O PIOR CASO.

      O `temas.mjs` le TODO arquivo `.ts` de `<clone>/src/vs` para conferir a lista de tokens
      contra o nucleo, e chama o gerador tres vezes. O custo disso nao e estavel: medido em
      20/09/2026, na mesma maquina e no mesmo commit, o teste inteiro levou **2 s, 102 s e 492 s**
      em corridas diferentes, sempre saindo 0 com os 33 criterios verdes e 0 pulados. As corridas
      caras vieram logo depois de um empacotamento, que despeja centenas de MB no cache de arquivos
      do sistema; as baratas, com a arvore do clone ainda quente. (E correlacao medida, nao causa
      instrumentada: nao cronometrei fase a fase.)

      Com 3 minutos, duas das cinco medidas estouravam — e o efeito era o pior possivel: o processo
      morria antes de imprimir uma linha, a saida chegava VAZIA aqui, e o criterio reprovava dizendo
      "os dois temas sem buraco... (ver saida acima)" sem nada acima para ver. Ou seja, o arnes
      acusava os temas de um defeito que era do proprio prazo. O teto agora e o mesmo das outras
      suites caras (900 s, `rodarSuiteCara`).
    */
    saida = execFileSync(process.execPath, [path.join(REPO, 'testes', 'temas.mjs')],
      { encoding: 'utf8', timeout: 900000 })
  } catch (e) {
    ok = false
    saida = String(e.stdout || '') + String(e.stderr || '')
    // Continua VERMELHO (prazo estourado nao e prova de tema certo), mas dizendo o que houve:
    // "reprovou" e "nao consegui medir" levam a acoes diferentes, e confundir os dois foi o defeito.
    porqueFalhou = e && (e.code === 'ETIMEDOUT' || e.killed)
      ? `o teste nao terminou em 900 s e foi interrompido (nao e veredito sobre os temas); saida capturada: ${saida.length} caractere(s)`
      : 'ver saida acima'
  }
  process.stdout.write(saida)
  checar('V1', 'criterio 5: os dois temas sem buraco, legiveis e com a brasa unica', ok,
    ok ? '' : porqueFalhou)

  // A ultima linha do teste e o JSON do veredito.
  // ⚠️ VEREDITO ILEGIVEL REPROVA — nao se engole no catch.
  //
  // A primeira versao disto caia num `catch` vazio: se alguem tirasse a chave `pulados`
  // do JSON, ou se o veredito deixasse de ser parseavel, a nota sumia em silencio com o
  // criterio verde. E a mesma forma de sumico que este bloco existe para matar, uma
  // camada acima (revisao final, 06/09/2026).
  let pulados = null
  let porqueNaoLi = ''
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    const veredito = JSON.parse(linha)
    if (!Array.isArray(veredito.pulados)) throw new Error('o veredito nao traz a chave "pulados"')
    pulados = veredito.pulados
  } catch (e) {
    porqueNaoLi = String(e && e.message || e).split('\n')[0]
  }
  checar('V1', 'criterio 5: o veredito dos temas e legivel e declara os PULADOS',
    pulados !== null, porqueNaoLi || `${pulados.length} pulado(s)`)
  for (const p of (pulados || [])) {
    console.log(`  nota  [V1] criterio 5 / "${p.criterio}": NAO VERIFICADO nesta rodada ` +
      `(${p.porque}) — nao e um OK`)
  }
}

// V1: a tela de boas-vindas e nossa, esta em portugues, e NAO aparece sem ser chamada.
// Este abre o editor, entao custa ~40 s; roda junto com os outros que abrem janela.
{
  try {
    execFileSync(process.execPath, [path.join(REPO, 'testes', 'boas_vindas.mjs')],
      { stdio: 'inherit', timeout: 300000 })
    checar('V1', 'a tela de boas-vindas e nossa, em portugues, e nao abre sozinha', true)
  } catch (e) {
    checar('V1', 'a tela de boas-vindas e nossa, em portugues, e nao abre sozinha', false, 'ver saida acima')
  }
}

// V1: as portas da conversa levam ao destino certo — e quando a extensao oficial falta,
// o caminho de volta pega em vez de a tecla nao fazer nada.
//
// Este criterio existe porque o defeito e invisivel na maquina de quem constroi: aqui a
// extensao esta sempre instalada, e as portas funcionam. Ele so aparece em computador
// recem-instalado, que e exatamente o de quem baixa o produto. O conserto foi feito e
// conferido A MAO duas vezes (06/09/2026, tela de boas-vindas; depois o botao da barra e
// o Ctrl+T) e nada o segurava: um revert de uma linha o desfaria com os 22 criterios verdes.
//
// ⚠️ A PERGUNTA MUDOU NA V23, e a suite chamada aqui abre o programa DUAS vezes agora.
// O destino das portas voltou a ser a conversa da extensao oficial (decisao do dono,
// 21/09/2026), e provar isso exige uma corrida COM ela instalada no perfil descartavel —
// sem isso o teste mede o caminho de volta e fica verde provando o mundo errado. A segunda
// corrida, sem ela, e a que prova que o caminho de volta continua pegando.
{
  // ⚠️ `acharExe()` e nao `acharExeDoBuild()`: aquele so e declarado mais abaixo neste
  // arquivo, e `const` em zona morta temporal quebraria este bloco em tempo de execucao.
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V1', 'as portas levam a conversa OFICIAL, e sem ela o caminho de volta pega (V23: era "abrem o painel nosso")', false, 'sem executavel')
  } else {
    try {
      // ⚠️ O teto subiu de 7 para 15 min na V23, e nao por folga gratuita: a suite passou a
      // INSTALAR a extensao oficial no perfil do teste (ate 180 s, teto do proprio instalador) e
      // a abrir o programa duas vezes, uma com ela e outra sem. Com o teto velho, o vermelho seria
      // do relogio e alguem iria procurar defeito no produto.
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'portas_da_conversa.mjs'), exe],
        { stdio: 'inherit', timeout: 900000 })
      checar('V1', 'as portas levam a conversa OFICIAL, e sem ela o caminho de volta pega (V23: era "abrem o painel nosso")', true)
    } catch {
      checar('V1', 'as portas levam a conversa OFICIAL, e sem ela o caminho de volta pega (V23: era "abrem o painel nosso")', false, 'ver saida acima')
    }
  }
}

// Antes de confiar na varredura, provar que a varredura funciona.
//
// O criterio 14 e a unica coisa entre um dado da casa e um repositorio publico. Ate
// 05/09/2026 ninguem tinha testado as REGRAS — so o resultado delas. A revisao final do
// ciclo achou tres buracos de olho (e-mail nao casava com regra nenhuma; segredo era
// procurado por prefixo conhecido; nome de maquina nao existia). Agora cada regra tem
// caso positivo e negativo, e roda em milissegundos.
{
  try {
    execFileSync(process.execPath, [path.join(REPO, 'testes', 'vazamento_regras.mjs')],
      { stdio: 'inherit', timeout: 60000 })
    checar('V0', 'criterio 14: as REGRAS da varredura passam nos casos conhecidos', true)
  } catch {
    checar('V0', 'criterio 14: as REGRAS da varredura passam nos casos conhecidos', false, 'ver saida acima')
  }
}

// Criterio 14: este repositorio vai ser publico. Nada da casa pode estar nele.
{
  // As regras moram em scripts/vazamento.mjs. Estavam aqui, e a varredura passou a
  // acusar o proprio arquivo que as define — alarme que sempre toca ensina a ignorar
  // o alarme. Aquele arquivo, e SO ele, e pulado; por isso ele so pode conter regras.
  // ⚠️ O que se publica e o que o GIT RASTREIA — nunca a pasta.
  //
  // A varredura anterior percorria o disco, e por isso (a) acusava arquivos que o
  // .gitignore ja tira do repositorio (o camada.local.txt, que aponta a camada da
  // equipe, deixava a regressao VERMELHA por um arquivo que nunca sai daqui) e
  // (b) era CEGA para o historico, que o criterio 14 do plano cobra com estas
  // palavras: "grep do repositorio inteiro (e do historico)".
  const achados = []
  const rastreados = execFileSync('git', ['-C', REPO, 'ls-files'], { encoding: 'utf8' })
    .split('\n').map(l => l.trim()).filter(Boolean)
  for (const rel of rastreados) {
    if (EXTENSOES_BINARIAS.test(rel)) continue
    if (ehArquivoDoDetector(rel)) continue
    let txt
    try { txt = fs.readFileSync(path.join(REPO, rel), 'utf8') } catch { continue }
    for (const oque of conferirTexto(txt)) achados.push(`${rel}: ${oque}`)
  }
  checar('V0', 'criterio 14: nada da casa nos arquivos do repositorio', achados.length === 0,
    achados.slice(0, 3).join(' | '))

  /*
    O GANCHO que confere a MENSAGEM antes de ela virar historia.

    ⚠️ Por que isto e criterio, e nao so um script que existe: a varredura acima le os
    ARQUIVOS da arvore, e mensagem de commit nao e arquivo. Por essa fresta um caminho de
    maquina entrou na historia em 12/09/2026 com a arvore limpa -- e a varredura dizia
    "0 achados", certa sobre o que ela ve. Arquivo se conserta com uma edicao; mensagem so
    se conserta reescrevendo a historia.

    ⚠️ E o criterio que importa e o SEGUNDO: "o arquivo do gancho existe" e facil de
    deixar verde sem medir nada. O que se mede aqui e o mecanismo RECUSANDO de verdade um
    texto com dado da casa, e ACEITANDO um limpo -- os dois, senao um gancho que recusa
    tudo tambem passaria.

    ⚠️ Gancho nao viaja no clone (mora em `.git/hooks`, que nao e versionado). Numa
    maquina onde o instalador nunca rodou este criterio fica vermelho, e a mensagem diz o
    comando. E acionavel em um passo, nao alarme permanente.
  */
  {
    const gancho = path.join(REPO, '.git', 'hooks', 'commit-msg')
    const instalado = fs.existsSync(gancho)
    checar('V0', 'criterio 14: o gancho que confere a mensagem do commit esta instalado', instalado,
      instalado ? gancho : 'rode: node scripts/instalar_ganchos.mjs')

    const conferidor = path.join(REPO, 'scripts', 'conferir_mensagem.mjs')
    const rodarCom = texto => {
      const arq = path.join(os.tmpdir(), `oficina-msg-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
      fs.writeFileSync(arq, texto, 'utf8')
      try {
        execFileSync(process.execPath, [conferidor, arq], { encoding: 'utf8', stdio: 'pipe' })
        return 0
      } catch (e) {
        return e.status ?? 1
      } finally {
        try { fs.rmSync(arq, { force: true }) } catch { }
      }
    }
    // Um caminho de maquina montado aqui, para o proprio arquivo nao virar o vazamento.
    const NL = String.fromCharCode(10), B = String.fromCharCode(92)
    /*
      ⚠️ O TEXTO SUJO TEM DE SER SUJO PELAS REGRAS, e a primeira versao deste criterio
      nao era. Ela montava um caminho GENERICO (`D:\alguma-pasta\log`), que nao
      identifica maquina nenhuma e que as regras nao acusam DE PROPOSITO -- o repositorio esta
      cheio de caminho de exemplo em teste e em documentacao. O criterio reprovou dizendo
      "o gancho esta cego", e quem estava cego era ele: acusava o mecanismo por um texto que
      nunca foi vazamento nenhum.

      As regras de caminho sao NOMINAIS -- pasta de usuario, e os nomes de pasta desta casa.
      Entao o teste usa os dois casos que sao mesmo dado de maquina: uma pasta de usuario, e
      o nome de pasta que apareceu no vazamento de verdade.

      ⚠️ E a limitacao fica DITA, em vez de descoberta depois: caminho de maquina com nome
      de pasta desconhecido passa pelo gancho. E o preco de nao acusar todo caminho de
      exemplo, e e uma escolha, nao um descuido.
    */
    const sujo = 'teste' + NL + NL + 'o log ficou em C:' + B + 'Users' + B + 'alguem' + B + 'x.txt' + NL
    const sujo2 = 'teste' + NL + NL + 'rodei em D:' + B + 'oficina' + '-build' + B + 'log' + NL
    checar('V0', 'criterio 14: e ele RECUSA uma mensagem com pasta de usuario', rodarCom(sujo) !== 0,
      rodarCom(sujo) !== 0 ? 'recusou' : 'ACEITOU -- o gancho esta cego')
    checar('V0', 'criterio 14: e RECUSA a pasta que apareceu no vazamento real', rodarCom(sujo2) !== 0,
      rodarCom(sujo2) !== 0 ? 'recusou' : 'ACEITOU -- o gancho esta cego')
    checar('V0', '⛔ CONTROLE: e ACEITA uma mensagem limpa (senao ele recusa tudo)',
      rodarCom('conserta o teste que abria a paleta errada' + NL + NL + 'O editor nao abria o arquivo.' + NL) === 0)
  }

  // O historico e publico junto com o codigo, e nao se corrige depois que alguem
  // clona. As mensagens de commit entram na mesma varredura.
  //
  // ⚠️ DOIS criterios, nao um. Ate 05/09/2026 isto era uma linha so, e a revisao final do
  // ciclo mostrou o preco: o vermelho do AUTOR e uma decisao do dono do projeto (a
  // autoria e dele, e reescrever historico e destrutivo), enquanto nome ou caminho na
  // MENSAGEM e defeito de quem escreveu o commit, e tem que ser zero. Somados numa
  // linha unica, o vermelho permanente da decisao escondia qualquer vazamento novo em
  // mensagem — que e exatamente o que mais aparece, porque mensagem se escreve todo
  // dia e autor se configura uma vez.
  //
  // ⚠️ E DOIS NAO BASTARAM. A revisao final da V2 (10/09/2026) achou o mesmo defeito uma
  // camada abaixo: a MENSAGEM tambem tinha vermelho que so sai reescrevendo o historico
  // (as quatro que ja estavam la quando a revisao da V0 mediu), e atras dele passaram
  // QUATRO mensagens novas, escritas depois de a medicao dizer "as de hoje estao limpas".
  // O autor tem o mesmo buraco: a identidade neutra e configuracao LOCAL do clone, e um
  // clone novo em outra maquina volta a assinar com o nome civil sem ninguem notar.
  //
  // A regra que sai disso: vermelho que so se conserta com decisao do dono esconde
  // qualquer vermelho novo do mesmo tipo. Entao cada um vira dois — o que JA estava no
  // historico quando foi medido (e so sai com a decisao de reescreve-lo) e o que e NOVO
  // (e tem que ser zero, sempre).
  //
  // As listas abaixo sao o ESCOPO daquela decisao, nao isencao: esses commits continuam
  // acusados, num criterio proprio, ate o historico ser limpo. Depois de uma reescrita os
  // SHAs mudam — commit reescrito que continuar sujo cai no criterio do NOVO, que e o
  // certo, e SHA da lista que sumiu e avisado para a lista ser enxugada.
  const AUTOR_JA_MEDIDO = new Set([
    '50a2207d', 'a042b76d', '4b7eea1a', '003d967f', 'ff8fa980', '781bbf17', 'c63568fd',
    'fdba93f2', '73b9d32e', 'b36bf232', '2329c917', '47f6d7c1', '83420368', '7d2eb9bb',
    '62ebc783', '717351c4', '95423429', '816ebd56', '88d86f8e', '469c56d6', '1ae2c687',
    '696af3d1', '02aa12e4'])
  const MENSAGEM_JA_MEDIDA = new Set([
    // as quatro que a revisao da V0 mediu em 05/09/2026
    '4b7eea1a', '73b9d32e', '83420368', '816ebd56',
    // as quatro que passaram DEPOIS, atras do vermelho permanente — defeito de quem
    // escreveu, registrado como tal; entram aqui porque tambem so saem reescrevendo
    '79ce0018', '0e4ac932', 'efcad603', '71014dc2',
    // as que o vocabulário de revisão passou a acusar (10/09/2026, noite) — escritas
    // ANTES de a regra existir; também só saem reescrevendo
    'e9d37cd6', '7048e6f0', '1d3e30e3', '8ad4bf5e', 'a042b76d', '003d967f', 'ff8fa980',
    '781bbf17', '032159c5', '8f1b0063', '62ebc783', 'daa103a0', '245e017e', '6f4f28f9',
    'af4435d9', 'e1fd78c4', '4396e62c', 'b71488e2', '60c1e036', '867d1151', 'c63568fd',
    // Apanhado em 21/09/2026, ao rodar a regressao INTEIRA no build V20-B2 (a primeira vez desde
    // a V20). Commit de 12/09, com caminho de maquina na mensagem — herdado, nao novo: tambem so
    // sai reescrevendo o historico, que e decisao do dono do projeto.
    'e50c5b99'])

  /** Separa os achados em ja-medidos e novos. Cada achado e `sha: o que`. */
  const separar = (achados, jaMedido) => ({
    herdados: achados.filter(a => jaMedido.has(a.slice(0, 8))),
    novos: achados.filter(a => !jaMedido.has(a.slice(0, 8))),
  })

  const doAutor = []
  const daMensagem = []
  const existentes = new Set()
  let erroDeLeitura = null
  try {
    const bruto = execFileSync('git',
      ['-C', REPO, 'log', '--all', '--format=%H%n%an <%ae>%n%s%n%b%n---FIM---'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    for (const bloco of bruto.split('---FIM---')) {
      const linhas = bloco.trim().split('\n')
      if (!linhas[0]) continue
      const sha = linhas[0].slice(0, 8)
      existentes.add(sha)
      for (const oque of conferirTexto(linhas[1] || '')) doAutor.push(`${sha}: ${oque}`)
      for (const oque of conferirTexto(linhas.slice(2).join('\n'))) daMensagem.push(`${sha}: ${oque}`)
    }
  } catch (e) {
    erroDeLeitura = 'nao consegui ler o historico: ' + String(e).split('\n')[0]
  }
  const resumo = (l) => l.slice(0, 3).join(' | ') + (l.length > 3 ? ` (+${l.length - 3})` : '')

  // O controle positivo da separacao: um achado fora da lista TEM que cair em "novos".
  // Sem isto, um erro no `separar` (prefixo de tamanho errado, por exemplo) mandaria
  // tudo para "herdados" e os dois criterios do NOVO ficariam verdes pelo motivo errado.
  const prova = separar(['00000000: sonda', [...MENSAGEM_JA_MEDIDA][0] + ': sonda'], MENSAGEM_JA_MEDIDA)
  checar('V0', 'criterio 14: a separacao herdado x novo funciona (controle positivo)',
    prova.novos.length === 1 && prova.herdados.length === 1,
    `novos ${prova.novos.length}, herdados ${prova.herdados.length} (esperado 1 e 1)`)

  const autor = separar(doAutor, AUTOR_JA_MEDIDO)
  const mensagem = separar(daMensagem, MENSAGEM_JA_MEDIDA)

  // Estes NAO tem porta de saida: vazamento novo e defeito de quem escreveu o commit.
  checar('V0', 'criterio 14: nenhum commit NOVO com o autor da casa',
    !erroDeLeitura && autor.novos.length === 0, erroDeLeitura || resumo(autor.novos))
  checar('V0', 'criterio 14: nenhuma mensagem de commit NOVA com dado da casa',
    !erroDeLeitura && mensagem.novos.length === 0, erroDeLeitura || resumo(mensagem.novos))

  // Estes podem ficar vermelhos por ESCOLHA do dono do projeto — a seccao "UMA DECISAO
  // SUA" do registro do projeto explica as saidas e o prazo (antes de o repo virar publico).
  checar('V0', 'criterio 14: o AUTOR herdado no historico (decisao do dono)',
    !erroDeLeitura && autor.herdados.length === 0, erroDeLeitura || resumo(autor.herdados))
  checar('V0', 'criterio 14: as MENSAGENS herdadas no historico (decisao do dono)',
    !erroDeLeitura && mensagem.herdados.length === 0, erroDeLeitura || resumo(mensagem.herdados))

  const sumidos = [...AUTOR_JA_MEDIDO, ...MENSAGEM_JA_MEDIDA].filter(s => !existentes.has(s))
  if (!erroDeLeitura && sumidos.length) {
    console.log(`  nota  [V0] criterio 14: ${new Set(sumidos).size} SHA(s) da lista de herdados nao existem ` +
      'mais no historico — se ele foi reescrito, enxugar as listas')
  }
}

// Criterio 14, a metade que faltava: o CONTEUDO do historico.
//
// Os dois criterios acima olham o autor e a MENSAGEM dos commits; a varredura de
// arquivos olha o que o git rastreia HOJE. Ninguem olhava o conteudo dos arquivos como
// eles foram no passado — e e ali que mora o caso classico: comitar um log com caminho
// de maquina, perceber, apagar no commit seguinte, e achar que resolveu. O arquivo
// some do `ls-files`; o blob fica no repositorio e viaja no clone.
//
// ⚠️ RODA POR PADRAO desde a revisao final da V2 (10/09/2026). Antes so rodava a pedido
// (`--historico`), para poupar ~50 s — e o resultado foi o que a revisao mediu: 13 achados
// na V1, 74 na V2, e nenhuma rodada da regressao disse isso, porque a linha que aparecia
// era uma "nota". Criterio que vira nota e criterio que some em silencio. Pular agora
// exige pedir (`--sem-historico`), e o pulo e dito em voz alta.
//
// E sao DOIS criterios, pelo mesmo motivo do autor e da mensagem acima: o que ja estava
// no historico so sai reescrevendo (decisao do dono); o que e NOVO tem que ser zero.
// A linha de base mora em `testes/historico_ja_medido.txt`.
{
  const pulado = process.argv.includes('--sem-historico') || process.env.OFICINA_HISTORICO === '0'
  if (pulado) {
    // ⚠️ Nao e "OK": e um criterio que NAO foi verificado nesta rodada.
    console.log('  nota  [V0] criterio 14 (conteudo do historico) PULADO a pedido ' +
      '(--sem-historico) — NAO foi verificado nesta rodada')
  } else {
    let saida = '', erro = null
    try {
      saida = execFileSync(process.execPath, [path.join(REPO, 'testes', 'vazamento_historico.mjs'), REPO],
        { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 })
    } catch (e) {
      // Sair com 1 e o normal quando ha herdados: o resultado continua no stdout.
      saida = String(e.stdout || '')
      if (!saida.trim()) erro = String(e).split('\n')[0]
    }
    let r = null
    try {
      const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
      r = linha ? JSON.parse(linha) : null
    } catch { }
    // A parte legivel vai para a tela; a linha do JSON nao (ela carrega a lista inteira).
    console.log(saida.split('\n').filter(l => !l.trim().startsWith('{')).join('\n').trim())
    const semResultado = !r || r.erro || typeof r.novos !== 'number'
    const porque = erro || (r && r.erro) || 'nao li o resultado da varredura'
    checar('V0', 'criterio 14: nenhum blob NOVO com dado da casa no historico',
      !semResultado && r.novos === 0, semResultado ? porque : `${r.novos} novo(s)`)
    checar('V0', 'criterio 14: o CONTEUDO herdado no historico (decisao do dono)',
      !semResultado && r.herdados === 0, semResultado ? porque : `${r.herdados} achado(s) em blobs ja medidos`)
  }
}

// Criterio 1: o build existe e o executavel roda. A prova de vida e a fumaca —
// aqui so garantimos que ela FOI rodada nesta maquina neste build.
// O acharExe mora em comum.mjs. Havia uma copia aqui, com a mesma regra escrita
// duas vezes — o anti-padrao que identidade.mjs e vazamento.mjs foram criados para
// matar no mesmo dia. Copia diverge; foi por isso que a regressao ficou mais fraca
// que o portao de build antes.
const acharExeDoBuild = () => acharExe()

{
  const exe = process.argv[2] || acharExeDoBuild()
  checar('V0', 'criterio 1: existe um executavel compilado', !!exe, exe || 'nenhum build encontrado')
  if (exe) {
    try {
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'fumaca.mjs'), exe], { stdio: 'inherit', timeout: 300000 })
      checar('V0', 'criterio 11: fumaca verde', true)
    } catch {
      checar('V0', 'criterio 11: fumaca verde', false, 'ver saida acima')
    }
  }
}

// Criterio 3, a parte que faltava: a tela "Sobre".
//
// A identidade ja era cobrada no product.json, no titulo da janela, no nome do exe e
// no instalador. Faltava a unica TELA em que o usuario le o nome do produto por
// extenso — e ela ficou de fora justamente porque nao e HTML: e um dialogo NATIVO do
// Windows, invisivel para o playwright. A uma revisao independente do ciclo tentou, nao
// conseguiu e registrou "nao verificado" em vez de dar por bom; o teste about.mjs
// existe para fechar isso com o instrumento certo (automacao de interface do Windows).
{
  const exe = process.argv[2] || acharExeDoBuild()
  if (!exe) {
    checar('V0', 'criterio 3: a tela "Sobre" mostra o nome proprio', false, 'sem executavel')
  } else {
    try {
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'about.mjs'), exe],
        { stdio: 'inherit', timeout: 300000 })
      checar('V0', 'criterio 3: a tela "Sobre" mostra o nome proprio', true)
    } catch (e) {
      // ⚠️ DIZER COMO O TESTE MORREU. Em 11/09/2026 o `about.mjs` morreu calado na abertura (sem
      // pilha, sem placar, o editor dele ficou órfão) e esta linha disse "o Sobre não mostra o nome"
      // — sobre uma tela que ele nem chegou a pedir. Código e sinal separam "reprovou" de "morreu".
      const como = e && (e.signal ? `morreu por sinal ${e.signal}` : `saiu com ${e.status}`)
      checar('V0', 'criterio 3: a tela "Sobre" mostra o nome proprio', false, `ver saida acima (${como})`)
    }
  }
}

// Coracao 1, caso-teste 4: a extensao do Claude Code, instalada DA OPEN VSX, roda
// dentro da OFICINA. A linha de base do projeto inteiro: antes do agente nativo, a
// OFICINA nao pode ser pior que "VS Code + extensao".
//
// Instalar e ativar sao coisas diferentes — o instalador ja disse "10 de 10" num dia
// em que a loja nao instalava nada (o .vsix local nao passa por assinatura). Por isso
// este criterio abre o editor e confere que os comandos dela existem.
{
  const exe = process.argv[2] || acharExeDoBuild()
  if (!exe) {
    checar('V0', 'coracao 1 / caso 4: a extensao do Claude Code roda na OFICINA', false, 'sem executavel')
  } else {
    try {
      execFileSync(process.execPath,
        [path.join(REPO, 'testes', 'extensao_claude.mjs'), path.join(os.homedir(), '.oficina', 'extensions'), exe],
        { stdio: 'inherit', timeout: 300000 })
      checar('V0', 'coracao 1 / caso 4: a extensao do Claude Code roda na OFICINA', true)
    } catch {
      checar('V0', 'coracao 1 / caso 4: a extensao do Claude Code roda na OFICINA', false,
        'ver saida acima — se ela nem esta instalada, rode scripts/instalar_extensoes.mjs')
    }
  }
}

// Telemetria medida POR REDE, nao pela configuracao. O criterio 4 do plano promete
// "verificado por rede: zero chamada a servico da Microsoft durante a fumaca" — e ate
// hoje isso era conferido lendo enableTelemetry no product.json, ou seja, a intencao
// gravada em disco. Mesmo salto que o ciclo corrigiu na identidade do executavel.
{
  const exe = process.argv[2] || acharExeDoBuild()
  if (!exe) {
    checar('V0', 'criterio 4: nenhuma chamada a Microsoft, medido por REDE', false, 'sem executavel')
  } else {
    try {
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'rede.mjs'), exe],
        { stdio: 'inherit', timeout: 300000 })
      checar('V0', 'criterio 4: nenhuma chamada a Microsoft, medido por REDE', true)
    } catch {
      checar('V0', 'criterio 4: nenhuma chamada a Microsoft, medido por REDE', false, 'ver saida acima')
    }
  }
}

// A LOJA instala. Este criterio nasceu do 5o bloqueio da V0: por semanas o projeto
// teria dito "extensoes ok" olhando o instalador por ARQUIVO, enquanto instalar pela
// loja falhava em 100% dos casos. Se o patch de viabilidade 0003 deixar de aplicar
// numa tag futura, e aqui que isso vai aparecer — e nao no dia em que alguem tentar
// instalar uma extensao.
{
  const exe = process.argv[2] || acharExeDoBuild()
  if (!exe) {
    checar('V0', 'a loja instala extensao por id (patch 0003 valendo)', false, 'sem executavel')
  } else {
    try {
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'loja.mjs'), exe],
        { stdio: 'inherit', timeout: 420000 })
      checar('V0', 'a loja instala extensao por id (patch 0003 valendo)', true)
    } catch (e) {
      // ⚠️ Codigo 78 = o teste se PULOU (sem rede). Isso nao e aprovacao, e o criterio
      // fica VERMELHO — antes ele saia 0 e virava um "OK" que nao tinha instalado nada.
      const detalhe = e?.status === 78
        ? 'PULADO por falta de rede — este criterio nao foi verificado'
        : 'ver saida acima'
      checar('V0', 'a loja instala extensao por id (patch 0003 valendo)', false, detalhe)
    }
  }
}

// Git dentro de uma build Code-OSS: o nucleo tem que trazer isso pronto. Sem git
// funcionando o editor nao serve para trabalhar, e nao adianta ser bonito.
{
  const exe = process.argv[2] || acharExeDoBuild()
  if (!exe) {
    // Criterio que SOME nao e criterio: o denominador anda sozinho e o "N de N" de
    // duas rodadas passa a descrever conjuntos diferentes de checagens.
    checar('V0', 'criterio de git: ramo e marcas de alteracao aparecem no editor', false, 'sem executavel')
  } else {
    try {
      // O teste agora sai com codigo != 0 quando reprova — nao se le mais o texto dele.
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'git_no_editor.mjs'), exe],
        { stdio: 'inherit', timeout: 300000 })
      checar('V0', 'criterio de git: ramo e marcas de alteracao aparecem no editor', true)
    } catch (e) {
      checar('V0', 'criterio de git: ramo e marcas de alteracao aparecem no editor', false, 'ver saida acima')
    }
  }
}

// V1b: a TELA. O produto promete um layout, e ate 06/09/2026 nenhum criterio olhava
// para ele — a fumaca cobra que o editor esteja vivo, os criterios 3 e 4 cobram
// identidade e telemetria, e o layout, que e a promessa central, nao tinha gate.
//
// Foi assim que o projeto passou versoes inteiras afirmando, em negrito, que os
// padroes "foram para o produto" enquanto eles valiam so no perfil de quem tinha
// configurado a mao. Um teste de 6 segundos teria desmentido a frase no dia em que
// ela foi escrita.
{
  const exe = process.argv[2] || acharExeDoBuild()
  if (!exe) {
    checar('V1b', 'interface: o layout do produto vale em perfil LIMPO', false, 'sem executavel')
  } else {
    try {
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'interface.mjs'), exe],
        { stdio: 'inherit', timeout: 300000 })
      checar('V1b', 'interface: o layout do produto vale em perfil LIMPO', true)
    } catch (e) {
      checar('V1b', 'interface: o layout do produto vale em perfil LIMPO', false, 'ver saida acima')
    }
  }
}

// Identidade do BUILD, nao a do repositorio. Os criterios 3 e 4 acima leem o
// produto/product.json — que e a INTENCAO. Este le o product.json que foi PARA
// DENTRO do executavel, que e o FATO. Sem ele, um build da OFICINA em que a mescla
// nao aconteceu (ou o binario de uma rodada anterior que sobrou na pasta, que tem
// nome fixo) passava com todos os criterios verdes descrevendo um Code-OSS.
{
  const exe = process.argv[2] || acharExeDoBuild()
  if (!exe) {
    checar('V0', 'identidade: o EXECUTAVEL compilado e a OFICINA', false, 'sem executavel')
  } else {
    let d = null
    try { d = JSON.parse(fs.readFileSync(path.join(path.dirname(exe), 'resources', 'app', 'product.json'), 'utf8')) }
    catch (e) { /* fica nulo e reprova abaixo */ }
    const sujos = d ? conferirIdentidade(d) : ['nao consegui ler o product.json do build']
    const carimbo = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(path.dirname(exe), 'oficina-build.json'), 'utf8')) }
      catch { return null }
    })()
    const ehOficina = d?.nameLong === 'OFICINA' && d?.enableTelemetry === false
    checar('V0', 'identidade: o EXECUTAVEL compilado e a OFICINA, com telemetria desligada',
      ehOficina && sujos.length === 0,
      `${d?.nameLong ?? '?'} | telemetria ${d?.enableTelemetry} | ${sujos.join(', ') || 'limpo'}` +
      (carimbo ? ` | carimbo: ${carimbo.modo} ${carimbo.tag}` : ' | SEM CARIMBO'))
  }
}

// Criterio 2: o clone tem que estar numa TAG conhecida, nunca num commit solto —
// senao ninguem consegue reproduzir o build nem subir de versao depois.
{
  const tagEsperada = fs.readFileSync(path.join(REPO, 'produto', 'TAG.txt'), 'utf8').trim()
  let tagReal = ''
  try { tagReal = execFileSync('git', ['-C', CLONE, 'describe', '--tags', '--exact-match'], { encoding: 'utf8' }).trim() } catch {}
  checar('V0', 'criterio 2: o clone esta exatamente na tag declarada', tagReal === tagEsperada, `${tagReal || 'sem tag'} x ${tagEsperada}`)
}

// ─────────────── V2 ───────────────
//
// O painel do agente. Os critérios de COMPORTAMENTO do motor (fila de permissões,
// cancelamento, streaming, login) moram em `testes/rodar.mjs`, que roda em node puro:
// aqui eles entram por REFERÊNCIA — a regressão roda aquele arquivo e cobra o placar.
//
// ⚠️ Por que rodar outro teste em vez de repetir os critérios: repetir é o caminho
// garantido para as duas listas divergirem, e a versão que divergir vai ser a que
// mente. Já aconteceu neste projeto — o critério 3 dos critérios de pronto conferia 6 dos 12 campos que
// o portão de build conferia, e os dois pareciam verdes (uma revisao independente, 05/09/2026).

// O motor, sem abrir o editor. Se um critério dele cair, a regressão cai junto. (Quantos são mora no
// piso abaixo, e só lá — este comentário dizia "47" com o piso em 66.)
{
  const arquivo = path.join(REPO, 'testes', 'rodar.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  // A última linha é o JSON do placar. Ler o placar, e não o código de saída, é o que
  // permite dizer QUAL critério caiu no detalhe desta linha.
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { /* fica nulo e reprova abaixo */ }

  checar('V2', 'motor do painel: testes/rodar.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')

  // ⚠️ O placar não pode ENCOLHER em silêncio. Sem esta linha, apagar um teste do
  // `rodar.mjs` deixaria a regressão verde — que é a forma mais silenciosa de perder
  // cobertura. Mesmo espírito do critério PULADO que nasceu na V1.
  //
  // ⚠️ IGUAL, NÃO "PELO MENOS" (revisão final, 11/09/2026). Com `>=` o piso ficava para trás a
  // cada critério novo — três vezes neste projeto — e os critérios acima dele podiam sumir sem
  // ninguém ver. Critério novo no `rodar.mjs` deixa esta linha vermelha até o número subir
  // junto: o esquecimento vira vermelho, em vez de buraco.
  // 119 -> 131 em 12/09/2026 (V8): a conta sem login, com controles (chave de API, e-mail, erro de outro tipo).
  // 138 -> 142 em 18/09/2026 (revisao de tela): o caminho relativo na linha de ferramenta.
  // 142 -> 171 (V15): modelo e esforco em uso, as trocas com os argumentos certos, o defeito do primeiro da lista e o aviso do custo.
  // 171 -> 197 (V16): os eventos de tarefa viram o estado dos agentes (lista que substitui, primeiro plano, segundo nivel, parar, zerar) e o mapa junto com o disco.
  // 209 -> 220 (V19): o aviso de limite que chega de graca no laco, e a leitura sob encomenda com o
  // metodo experimental presente, ausente, recusado, mudo, e sem conversa de pe.
  const MOTOR = 220
  checar('V2', 'motor do painel: nenhum criterio sumiu do rodar.mjs',
    !!placar && placar.total === MOTOR, placar ? `${placar.total} (esperado ${MOTOR})` : 'sem placar')
}

// V4 — o motor que EXECUTA o comando: processo de verdade, cancelamento pelo PID, teto de tempo.
//
// ⚠️ Este e o unico teste do projeto que cria processo de sistema, e e onde o criterio 9 dos
// criterios de pronto ("cancelar nao deixa orfao") e medido — com um NETO, e com o controle
// positivo de que os dois estavam vivos antes. Roda em node puro, em segundos, sem gastar nada.
{
  const arquivo = path.join(REPO, 'testes', 'comando.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 300000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  process.stdout.write(saida)
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V4', 'o motor do comando: testes/comando.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  // Igual ao placar, como as outras suites (ver o motor, acima).
  const COMANDO = 65
  checar('V4', 'o motor do comando: nenhum criterio sumiu', !!placar && placar.total === COMANDO,
    placar ? `${placar.total} (esperado ${COMANDO})` : 'sem placar')
}

// V3 — a PROPOSTA de mudança (antes/depois/trechos, combinar, classificar), em node puro.
{
  const arquivo = path.join(REPO, 'testes', 'proposta.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V3', 'a proposta de mudanca: testes/proposta.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  // Igual ao placar, como o motor e a ponte (ver o motor, acima).
  const PROPOSTA = 43
  checar('V3', 'a proposta: nenhum criterio sumiu', !!placar && placar.total === PROPOSTA,
    placar ? `${placar.total} (esperado ${PROPOSTA})` : 'sem placar')
}

// V5 — as CONVERSAS de outros dias (lista, medida de custo, renomear, etiquetar, busca,
// e o `resume` que o motor manda), em node puro.
{
  const arquivo = path.join(REPO, 'testes', 'sessoes.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V5', 'as conversas de outros dias: testes/sessoes.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  // Igual ao placar, como as outras suites (ver o motor, acima).
  // 69 -> 73 em 18/09/2026 (revisao visual): a resposta repetida em varias linhas conta uma vez.
  const SESSOES = 73
  checar('V5', 'as conversas: nenhum criterio sumiu', !!placar && placar.total === SESSOES,
    placar ? `${placar.total} (esperado ${SESSOES})` : 'sem placar')
}

// V8 — o REGISTRO em disco (o que entra, o que nunca entra, teto e giro), em node puro.
{
  const arquivo = path.join(REPO, 'testes', 'registro.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V8', 'o registro em disco: testes/registro.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  // Igual ao placar, como as outras suites (ver o motor, acima).
  const REGISTRO = 19
  checar('V8', 'o registro: nenhum criterio sumiu', !!placar && placar.total === REGISTRO,
    placar ? `${placar.total} (esperado ${REGISTRO})` : 'sem placar')
}

// Pisos da V10 (constantes nomeadas: e assim que o conferidor de documentos os acha).
// V14: tokens 31 -> 30 (os tres criterios dos modos da barra viraram um: nao ha modo que esconda);
// tela_tokens 22 -> 32 (sai o modo da barra, entram a falta de configuracao, o pe e o relogio do cache).
// V16: tokens 30 -> 38 (a ficha `.meta.json` do subagente: nome do segundo nivel, pai, e o que o mapa le do disco).
const TOKENS = 44 // V29: +6, o nome da conversa com a regra do painel (titulo dado, automatico, ultimo pedido, id)
const TELA_TOKENS = 32
// Piso da V11.
// V18: 30 -> 77 (os tamanhos da conversa: guardar, restaurar, voltar ao padrao; o voltar ao padrao em tres fases, e o patch 0013).
// V19: 84 -> 96 (a largura padrao das barras e um quarto da janela, com teto de 300 e piso de 170, e o retrato do 0011 traz a janela).
const LAYOUT = 97
// Pisos da V12.
// 27 -> 29 em 18/09/2026: skill da conta do claude.ai ("(claude.ai sync)", medido numa conta real) e da pessoa.
const SKILLS = 29
const TELA_SKILLS = 33
// Piso da V14: o relogio do cache (motor em node puro).
const RELOGIO_CACHE = 30
// Piso da V19: o limite do plano (as tres fontes, a juncao, o texto da barra e a cota), em node puro.
const LIMITE = 62
// Piso da V19: o mostrador (o relogio, a cota, o clique e o que vai para as chaves da barra de cima).
const TELA_LIMITE = 43
// Pisos da V20 (21/09/2026). Estas seis suites existiam e NAO rodavam em bateria nenhuma: passavam
// a mao e ninguem as cobrava. Um revisor independente pegou. Suite fora de bateria nao protege nada.
const USO_DO_PLANO = 14
// Piso da V20, depois do conserto do numero errado (21/09/2026): a consulta AO VIVO, medida sem
// duble nenhum contra o agente de verdade. Ela precisa de rede e custa ~10 s — e e a unica suite
// que prova que o numero da faixa e o de agora, e nao o do registro parado.
const CONSULTA_DE_USO = 8
// Piso da V20, rodada 2 de revisores: o padrao de fabrica que a conversa oficial nao enxerga.
// Um revisor leu "Auto" na tela do build 1, tres vezes, com o produto declarando o contrario.
const PADRAO_DA_OFICIAL = 11
// Pisos que faltavam (21/09/2026): estas duas suites nao emitiam `total`, e por isso a bateria as
// marcava como "sem piso" — apagar um criterio de qualquer uma nao deixava nada vermelho. O
// `guarda_produto` e quem guarda o product.json e as pastas de dados das edicoes.
const GUARDA_PRODUTO = 30
const TEMAS = 33 // V24: 32 -> 33, o total passou a contar o criterio PULADO (estavel com e sem clone)
// Piso da V20: o nome da conversa (a linha `ai-title` do transcrito).
const TITULO_DA_CONVERSA = 10
const FAIXA_DO_LIMITE = 29
const SESSAO_ATIVA = 20
const PASTA_DE_SEMPRE = 24 // V27: sem pasta, nada de conversa automatica; abre a pasta de sempre ou pergunta
const VER_HTML = 24 // V27: as duas opcoes de um .html -- ver a pagina e ver o codigo · +4: os leitores de documento embutidos (1b) · +4: celular e computador lado a lado (1c)
const EXTENSOES_QUE_FALTAM = 21 // V27: a primeira abertura instala o que falta (Claude Code primeiro)
const MOSTRADOR_DE_TOKENS = 52 // V29: 50 -> 52, todas as conversas pelo nome e os degraus quando nao cabe · V24: 20 -> 23, os tres estados do mostrador (numeros, vazio, falhou) · V26-B2: 23 -> 26, sem pasta aberta procura na pasta pessoal · V27: 26 -> 42, formato do painel, conversas da janela pelo processo pai, aviso sem pasta
const TELA_DO_CONSUMO = 15
const AJUSTES_DA_OFICIAL = 38 // V29: +3, a ancora aria-label do cabecalho (2) e o nome-base header_ (1) · V21: +8 (ancoras [class*=] e a derivacao dos modos)
// Pisos da V26 (24/09/2026): os MCPs e a conta — o estado de uma ferramenta de TERCEIRO, que e o
// lugar onde este produto ja se enganou duas vezes (o mostrador que diria "0" quando a medicao
// falhava, e o `/logout` que envelheceu junto com o CLI). Por isso os criterios que mais importam
// nestas quatro suites sao os do NAO SEI: "nao consegui medir" nunca pode ser desenhado como
// "desconectado" nem como "fora da conta".
// Os totais sao os do modo normal; `--real` acrescenta um criterio em MCPS e em CONTA.
// Os numeros subiram na REVISAO (mesma sessao): tres revisores de fora acharam 32 coisas, e cada
// conserto virou criterio. Os maiores: o laco infinito que travava o editor inteiro com um nome de
// servidor vindo de .mcp.json; a lista parcial entregue como completa; "nao ha nenhum servidor"
// afirmado sem a prova do CLI; o botao que matava a conversa antes de perguntar.
const MCPS = 72
const TELA_MCPS = 58
const CONTA = 38
const TELA_CONTA = 28

// V10 — o MEDIDOR DE TOKENS (motor) e a TELA dele (barra e vista), em node puro.
{
  for (const [arquivo, nomeDoPiso, piso] of [['tokens.mjs', 'o medidor de tokens', TOKENS], ['tela_tokens.mjs', 'a tela de tokens', TELA_TOKENS], ['layout.mjs', 'os layouts com nome (V11)', LAYOUT], ['skills.mjs', 'a lista de skills (V12)', SKILLS], ['tela_skills.mjs', 'a vista de skills (V12)', TELA_SKILLS], ['relogio_cache.mjs', 'o relogio do cache (V14)', RELOGIO_CACHE], ['uso_do_plano.mjs', 'o uso do plano (V20)', USO_DO_PLANO], ['titulo_da_conversa.mjs', 'o nome da conversa (V20)', TITULO_DA_CONVERSA], ['faixa_do_limite.mjs', 'a faixa do limite (V20)', FAIXA_DO_LIMITE], ['consulta_de_uso.mjs', 'a consulta de uso ao vivo (V20)', CONSULTA_DE_USO], ['padrao_da_conversa_oficial.mjs', 'o padrao de fabrica da conversa oficial (V20)', PADRAO_DA_OFICIAL], ['sessao_ativa.mjs', 'qual conversa esta aberta (V20)', SESSAO_ATIVA], ['pasta_de_sempre.mjs', 'a pasta de sempre (V27)', PASTA_DE_SEMPRE], ['ver_html.mjs', 'ver a pagina e ver o codigo (V27)', VER_HTML], ['extensoes_que_faltam.mjs', 'as extensoes que faltam (V27)', EXTENSOES_QUE_FALTAM], ['mostrador_de_tokens.mjs', 'o mostrador de tokens da barra (V20)', MOSTRADOR_DE_TOKENS], ['tela_do_consumo.mjs', 'a tela do consumo (V20)', TELA_DO_CONSUMO], ['ajustes_da_conversa_oficial.mjs', 'os ajustes na conversa oficial (V20)', AJUSTES_DA_OFICIAL], ['mcps.mjs', 'a leitura dos MCPs (V26)', MCPS], ['tela_mcps.mjs', 'a vista de conexoes (V26)', TELA_MCPS], ['conta.mjs', 'a leitura da conta (V26)', CONTA], ['tela_conta.mjs', 'a vista da conta (V26)', TELA_CONTA]]) {
    let saida = '', codigo = 0
    try {
      saida = execFileSync(process.execPath, [path.join(REPO, 'testes', arquivo)], { encoding: 'utf8', timeout: 120000 })
    } catch (e) {
      codigo = e.status ?? 1
      saida = String(e.stdout || '') + String(e.stderr || '')
    }
    let placar = null
    try {
      const linha = saida.trim().split(/\r?\n/).filter(l => l.trim().startsWith('{')).pop()
      placar = linha ? JSON.parse(linha) : null
    } catch { }
    checar('V10', `${nomeDoPiso}: testes/${arquivo} verde`, !!placar && placar.passou === true && codigo === 0,
      placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
    checar('V10', `${nomeDoPiso}: nenhum criterio sumiu`, !!placar && placar.total === piso,
      placar ? `${placar.total} (esperado ${piso})` : 'sem placar')
  }
}

// V19 — O LIMITE DO PLANO (motor), em node puro: as tres fontes com unidades diferentes, a juncao,
// o texto da barra de cima, a idade do dado e a cota da consulta. Sem rede: o dado verdadeiro vem de
// um servidor com cota apertada, e os casos que interessam (numero velho, recusa, conta sem plano)
// nao se produzem sob encomenda la.
{
  const arquivo = path.join(REPO, 'testes', 'limite.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split(/\r?\n/).filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V19', 'o limite do plano: testes/limite.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  checar('V19', 'o limite do plano: nenhum criterio sumiu', !!placar && placar.total === LIMITE,
    placar ? `${placar.total} (esperado ${LIMITE})` : 'sem placar')
}

// V19 — O MOSTRADOR do limite (o tempo: quando consultar, quando nao, quando repintar porque o
// numero envelheceu), com editor de mentira e relogio na mao.
{
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [path.join(REPO, 'testes', 'tela_limite.mjs')], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split(/\r?\n/).filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V19', 'o mostrador do limite: testes/tela_limite.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  checar('V19', 'o mostrador do limite: nenhum criterio sumiu', !!placar && placar.total === TELA_LIMITE,
    placar ? `${placar.total} (esperado ${TELA_LIMITE})` : 'sem placar')
}

// V9 — o ROBO da subida de versao (tag estavel, conflito com o git de verdade, trava do rascunho,
// workflow sem segredo), em node puro. O ciclo completo numa tag real so se prova compilando.
{
  const arquivo = path.join(REPO, 'testes', 'robo.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V9', 'o robo da subida: testes/robo.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  const ROBO = 55
  checar('V9', 'o robo: nenhum criterio sumiu', !!placar && placar.total === ROBO,
    placar ? `${placar.total} (esperado ${ROBO})` : 'sem placar')
}

/**
 * O código, sem os comentários.
 *
 * ⚠️ Isto não é detalhe de implementação — foi o que deu DOIS vermelhos falsos na
 * primeira corrida destes critérios (10/09/2026). Os arquivos da V2 explicam por
 * escrito por que `require('vscode')` e `unsafe-inline` são proibidos, e os regex
 * encontravam exatamente essas frases. O teste reprovava o produto por causa do
 * comentário que documenta a regra que o produto cumpre.
 *
 * A armadilha maior é a inversa, e por isso vale a função existir num lugar só: um
 * critério assim pode ficar VERDE por acidente se a proibição estiver só num
 * comentário e nunca no código. Comentário não é comportamento — nem para condenar,
 * nem para absolver.
 */
const semComentarios = arquivo =>
  fs.readFileSync(arquivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

// O motor não pode depender do editor — é o que o torna testável em segundos.
{
  const motor = semComentarios(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  checar('V2', 'o motor nao importa `vscode` (senao o teste rapido morre)',
    !/require\(\s*['"]vscode['"]\s*\)/.test(motor))
}

// A webview não pode montar HTML com texto que veio do agente.
{
  const semComentario = semComentarios(path.join(REPO, 'extensoes', 'oficina-claude', 'painel', 'painel.js'))
  checar('V2', 'a tela nao usa innerHTML/outerHTML (texto do agente nao vira HTML)',
    !/\.(inner|outer)HTML\s*=/.test(semComentario) && !/insertAdjacentHTML/.test(semComentario))
  checar('V2', 'a tela nao usa eval nem Function()',
    !/\beval\s*\(/.test(semComentario) && !/new\s+Function\s*\(/.test(semComentario))
}

// A CSP da webview: o texto que vai para a página, conferido na fonte.
{
  const ext = semComentarios(path.join(REPO, 'extensoes', 'oficina-claude', 'extensao.js'))
  checar('V2', 'a CSP nega tudo por padrao', /default-src 'none'/.test(ext))
  checar('V2', 'a CSP nao tem unsafe-inline nem unsafe-eval', !/unsafe-inline|unsafe-eval/.test(ext))
  checar('V2', 'o script da webview so roda com nonce', /script-src 'nonce-/.test(ext))
  checar('V2', 'a webview so enxerga a pasta painel/ (localResourceRoots)',
    /localResourceRoots/.test(ext) && /'painel'/.test(ext))
  // ⚠️ O modo que pula aprovação não pode ser o padrão. É o único jeito de o painel
  // escrever em arquivo sem a pessoa ver, e o prompt da V2 o proíbe por escrito.
  const motor = semComentarios(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))
  // ⚠️ O padrão é cobrado onde ele MORA — `this.modo = 'default'` no construtor — e não
  // na linha que o entrega ao SDK. Desde que o painel deixa a pessoa trocar de modo,
  // aquela linha é `permissionMode: this.modo`, e um teste que a procurasse literal
  // ficaria vermelho com o produto certo. O que não pode existir em lugar nenhum do
  // motor é `bypassPermissions` como valor inicial.
  //
  // ⚠️ SÓ ATRIBUIÇÃO. O regex antigo (`/=\s*'bypassPermissions'/`) casava também a COMPARAÇÃO
  // `modo === 'bypassPermissions'` (revisão final, 11/09/2026): ficou vermelho com o produto
  // certo desde 10/09/2026 — e ninguém viu: não há regressão INTEIRA registrada no log depois disso.
  // O `(?<![=!<>])` deixa de fora `===`, `!==` e `==`; o controle positivo abaixo prova as duas metades.
  const atribuiBypass = t => /(?<![=!<>])=\s*'bypassPermissions'/.test(t)
  checar('V2', 'o modo que pula aprovacao NAO e o padrao',
    /this\.modo\s*=\s*'default'/.test(motor) && !atribuiBypass(motor))
  checar('V2', 'CONTROLE POSITIVO: o detector pega a atribuicao e deixa passar a comparacao',
    atribuiBypass("this.modo = 'bypassPermissions'") && !atribuiBypass("if (modo === 'bypassPermissions')") &&
    !atribuiBypass("s.mode !== 'bypassPermissions'"))
  checar('V2', 'a pessoa pode trocar o modo (os modos do SDK visiveis)',
    /setPermissionMode/.test(motor) && /acceptEdits/.test(motor) && /plan/.test(motor))

  /*
    ⛔ O MODO PADRAO DO PRODUTO — o buraco que a V20 abriu e ninguem viu.

    Os dois criterios acima olham o MOTOR do painel proprio (`agente.js`) e a configuracao da nossa
    extensao. Na V20 o padrao de fabrica passou a vir de outro lugar: o `product.json`, com
    `claudeCode.initialPermissionMode`. Resultado medido por um revisor independente: o produto
    passou a PULAR APROVACAO de fabrica, para qualquer um que o instale, em qualquer pasta — e os
    dois criterios continuaram VERDES, porque nao olham ali.

    Este criterio nao PROIBE o bypass: e decisao do dono, e ele a tomou com o custo declarado. O que
    ele faz e nao deixar a decisao passar calada — exige que o valor de fabrica esteja escrito no
    registro da versao. Mudar o padrao sem registrar deixa isto vermelho, que e o ponto.
  */
  {
    const produtoJson = JSON.parse(fs.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
    const padroes = produtoJson.configurationDefaults || {}
    const modo = padroes['claudeCode.initialPermissionMode']
    const liberado = padroes['claudeCode.allowDangerouslySkipPermissions'] === true
    const pulaDeFabrica = modo === 'bypassPermissions'
    // ⚠️ A DECLARAÇÃO TEM DE SER PÚBLICA, e no próprio repositório. A primeira versão deste
    // critério lia o registro interno da versão — que não viaja com o produto e cujo nome não pode
    // sequer ser citado aqui (o varredor de vazamento acusa, e com razão). Quem instala o programa
    // não lê documento nosso: lê o README. É lá que o aviso tem de estar.
    let leiaMe = ''
    try { leiaMe = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8') } catch { leiaMe = '' }
    const avisado = /sem pedir aprova/i.test(leiaMe) && /de f[áa]brica/i.test(leiaMe)
    checar('V2', 'se o produto pula aprovacao de fabrica, o README avisa quem instala',
      !pulaDeFabrica || avisado,
      `modo=${modo} | liberado=${liberado} | README avisa=${avisado}`)
    checar('V2', 'CONTROLE: o criterio enxerga o product.json, e nao so o motor do painel',
      modo !== undefined, `initialPermissionMode=${modo}`)
  }
  // As TRES fontes do disco, e nao so `project`: `local` (`.claude/settings.local.json`) e da mesma
  // pasta, e `user` e o global da pessoa. Ate 11/09/2026 so `project` era pedido, e um `deny`
  // escrito no `settings.local.json` nao valia dentro da OFICINA (achado da guarda do coracao 2 no
  // `rodar.mjs`). A ordem nao importa; a presenca das tres, sim.
  checar('V2', 'as regras de permissao do disco sao pedidas ao SDK (user, project e local)',
    /settingSources:\s*\[[^\]]*'user'[^\]]*\]/.test(motor) &&
    /settingSources:\s*\[[^\]]*'project'[^\]]*\]/.test(motor) &&
    /settingSources:\s*\[[^\]]*'local'[^\]]*\]/.test(motor))
}

// A PONTE entre a tela e o motor — o teste que faltava, e onde o defeito grave morava.
//
// ⚠️ Ele roda em node puro (milissegundos) e cobre a camada que os outros dois deixam
// de fora: `rodar.mjs` para no motor, `painel.mjs` para no DOM, e o FIO entre os dois
// nao tinha um criterio sequer. Foi la que o `case 'modo'` faltou a versao inteira, com
// 55 criterios verdes por cima.
{
  const arquivo = path.join(REPO, 'testes', 'ponte.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V2', 'a ponte tela<->motor: testes/ponte.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  // ⚠️ O piso anda JUNTO com o placar. Ficou em 33 com a ponte em 42 (revisão de código,
  // 10/09/2026, noite): nove critérios — os da aba restaurada e o do tempo do padrão de
  // caminho entre eles — podiam ser apagados sem a regressão notar. E ficou de novo em 60 com a
  // ponte em 66 (revisão final, 11/09/2026). Agora é IGUAL — ver o motor, acima.
  // 114 -> 132 em 12/09/2026 (V8): o socorro (quatro acoes, reabrir que monta de novo) e o login pelo claude embutido.
  // 132 -> 137 em 12/09/2026 (V10): a vista e a barra de tokens ligadas na ativacao.
  // 137 -> 148 em 12/09/2026 (V11): o botao Layout (personalizar, salvar, aplicar, excluir).
  // 148 -> 160 em 16/09/2026 (V12): a vista Skills (lista vinda do motor, clique que vira pedido, recomecar).
  // 160 -> 161 em 16/09/2026 (revisao de seguranca): o comando chamado sem o clique da vista nao manda pedido.
  // 167 -> 170 em 18/09/2026 (revisao visual): nenhum botao novo nas barras de composicao definida, e o guia leva a Tokens e Skills.
  // 170 -> 187 (V13): a barra lateral volta (produto, lista dos soltos, chave igual nos dois patches) e o "Conectar ao GitHub".
  // 187 -> 191 (V14): os tokens e o relogio do cache chegam ao pe da conversa, e voltam no `pronto` da pagina que recarregou.
  // 191 -> 197 (V15): esforco e modelo pela tela, a pergunta do custo com o cache quente, e o modelo de volta na pagina que recarregou.
  // 197 -> 207 (V16): o mapa dos agentes do motor e do disco ate a tela, o parar pela tela, e o mapa de volta na pagina que recarregou.
  // 207 -> 237 (V17): o Navegador (contêiner fixado, API proposta, aparelhos completos e coerentes, o que vai ao navegador por CDP).
  // 237 -> 259 (V18): a altura da caixa guardada e repassada as outras abas, o Voltar ao layout padrao e a barra de icones compacta.
  // 278 -> 280 (V19): o botao do historico sai do titulo da conversa, e a lista continua na paleta e no atalho.
  // 280 -> 282 (V19): o aviso de limite do plano nao e fala da conversa (com controle positivo pelo mesmo caminho).
  // 282 -> 291 (V19): o mostrador do limite na barra de cima -- a composicao autorizada, a costura entre o
  // manifesto e o patch 0016 (o nome do context key dos dois lados), e o aviso que chega ao mostrador.
  // 291 -> 298 (V20, a leva de 21/09/2026): a barra de cima trocou de conteudo (t188 tirou os tres botoes e o
  // mostrador do limite; t196 pos o de tokens), a barra secundaria deixou de nascer aberta (t197), a
  // lateral foi para o topo (t198) e o limite virou a FAIXA de medidores (t199) -- cujo fio inteiro,
  // do arquivo no disco ate a chave que o nucleo le, passou a ter criterio proprio.
  const PONTE = 306 // V24: +3 no total, os criterios de forcarConversaNoCentro e o fechamento da barra da direita
  checar('V2', 'a ponte: nenhum criterio sumiu', !!placar && placar.total === PONTE,
    placar ? `${placar.total} (esperado ${PONTE})` : 'sem placar')
}

// O modo que pula aprovação só existe com uma configuração ligada DE PROPÓSITO, e ela
// nasce desligada — igual à extensão oficial (decisão de 10/09/2026, noite).
{
  let padrao = '(nao achei)', escopo = '(nao achei)'
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
    const prop = pj.contributes.configuration.properties['oficina.permitirPularAprovacao']
    padrao = prop.default
    escopo = prop.scope
  } catch { }
  checar('V2', 'a configuracao que libera o modo que pula aprovacao nasce DESLIGADA',
    padrao === false, String(padrao))
  // ⚠️ E so a PESSOA pode liga-la. Sem `scope`, o VS Code aceita a chave no
  // `.vscode/settings.json` da PASTA aberta — um repositorio clonado ligaria o modo mais
  // perigoso do produto por conta propria. A extensao oficial declara `machine` para a
  // chave equivalente (medido no package.json dela, 2.1.261). Achado pela revisao de
  // suposicoes, 10/09/2026, noite.
  checar('V2', 'a configuracao so pode ser ligada pela pessoa, nao pela pasta aberta (scope machine)',
    escopo === 'machine', String(escopo))
}

// CONTROLE do critério de sincronia: perdoar o `package-lock.json` que o empacotamento não leva
// (11/09/2026) não pode virar perdão geral. Um "executável" de mentira, com tudo menos o lock e o
// `agente.js`, tem que ser acusado de EXATAMENTE uma coisa: o `agente.js`.
{
  const falso = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || REPO, 'oficina-sinc-'))
  try {
    const destino = path.join(falso, 'resources', 'app', 'extensions', 'oficina-claude')
    const rastreados = execFileSync('git', ['-C', REPO, 'ls-files', 'extensoes/oficina-claude'], { encoding: 'utf8' })
      .split('\n').map(l => l.trim()).filter(Boolean).map(l => l.slice('extensoes/oficina-claude/'.length))
    for (const sub of rastreados) {
      if (sub === 'package-lock.json' || sub === 'agente.js') continue
      fs.mkdirSync(path.dirname(path.join(destino, sub)), { recursive: true })
      fs.copyFileSync(path.join(REPO, 'extensoes', 'oficina-claude', sub), path.join(destino, sub))
    }
    const acusou = extensaoForaDeSincronia(path.join(falso, 'OFICINA.exe'), REPO)
    checar('V2', 'CONTROLE: a sincronia perdoa so o lock que o empacotamento nao leva, e acusa o resto',
      acusou.length === 1 && acusou[0] === 'agente.js (falta no executavel)', acusou.join(', ') || 'nada')
  } finally {
    fs.rmSync(falso, { recursive: true, force: true })
  }
}

// ⚠️ ANTES DE QUALQUER CRITÉRIO DE TELA: a extensão dentro do executável é a do repositório?
//
// Achado em 10/09/2026, noite: o executável dos testes de tela tinha a extensão de dois
// commits antes. Os critérios abaixo ficavam verdes testando código velho, enquanto
// motor e ponte (acima) testavam o novo — as duas metades da regressão mediam programas
// diferentes e o placar somava as duas como se fossem um.
{
  const exe = process.argv[2] || acharExe()
  const fora = exe ? extensaoForaDeSincronia(exe, REPO) : ['sem executavel']
  checar('V2', 'a extensao DENTRO do executavel e a do repositorio (senao a tela testa codigo velho)',
    fora.length === 0, fora.slice(0, 5).join(', ') + (fora.length > 5 ? ` (+${fora.length - 5})` : ''))
}

// A fumaça do painel DENTRO do editor. É o único critério da V2 que abre o programa —
// e é o que prova que a peça existe de verdade, não só que o código está escrito.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V2', 'o painel abre e responde dentro da OFICINA', false, 'sem executavel')
  } else {
    // A tela também tem piso (revisão final, 11/09/2026: era a única suíte sem nenhum). A saída é
    // capturada para ler o placar, e reimpressa inteira.
    // ⚠️ O `catch` engolia o erro, e o detalhe do criterio dizia so "ver saida acima" — que era
    // MENTIRA quando nao havia saida acima: na revisao final da V3 (5a rodada) este passo morreu
    // com um criterio impresso, sem stack em lugar nenhum, e ninguem conseguiu dizer por que. Agora
    // o erro (mensagem, status, sinal) e o que o teste escreveu no stderr entram no detalhe.
    let saida = '', ok = true, porque = ''
    try {
      // ⚠️ `maxBuffer` explicito: o padrao do execFileSync e 1 MiB POR fluxo, e estourar
      // nao devolve saida truncada -- LANCA ENOBUFS e MATA o filho com SIGTERM, que e a
      // forma exata do sintoma que este passo existe para relatar. Com o stderr em `pipe`
      // (antes era `inherit`, sem teto), o teto passou a existir tambem para ele.
      saida = execFileSync(process.execPath, [path.join(REPO, 'testes', 'painel.mjs'), exe],
        { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 420000, maxBuffer: 64 * 1024 * 1024 })
    } catch (e) {
      ok = false
      saida = String(e.stdout || '')
      const fim = String(e.stderr || '').trim().split('\n').slice(-3).join(' / ')
      porque = `${e.message || e}${e.status != null ? ` status=${e.status}` : ''}` +
        `${e.signal ? ` sinal=${e.signal}` : ''}${fim ? ` stderr: ${fim}` : ' (stderr vazio)'}`
    }
    process.stdout.write(saida)
    let placar = null
    try {
      const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
      placar = linha ? JSON.parse(linha) : null
    } catch { }
    const TELA = 31
    checar('V2', 'a tela: nenhum criterio sumiu do painel.mjs', !!placar && placar.total === TELA,
      placar ? `${placar.total} (esperado ${TELA})` : 'sem placar')
    if (ok) {
      checar('V2', 'o painel abre e responde dentro da OFICINA', true)
    } else {
      checar('V2', 'o painel abre e responde dentro da OFICINA', false, porque.slice(0, 400))
    }
  }
}

// V3 — a refatoração REAL de 3 arquivos, com o agente de verdade: critério 8 (tudo rejeitado → hash
// igual) e a troca aceita conferida arquivo a arquivo. ⚠️ GASTA na conta de quem roda, como o critério 7.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V3', 'refatoracao real de 3 arquivos e criterio 8', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('refatoracao.mjs', exe)
    checar('V3', 'refatoracao real de 3 arquivos e criterio 8', r.ok, r.detalhe)
    // ⚠️ PISO, como as suites de node tem. Estas duas GASTAM e mesmo assim nao tinham: um criterio
    // podia sumir delas em silencio, e o ⛔ do caminho misto nasceu justamente aqui (revisao final da
    // V3, 3a rodada). Igual, nao "pelo menos".
    checar('V3', 'a refatoracao: nenhum criterio sumiu', r.total === 7,
      `${r.total === null ? 'sem placar' : r.total} (esperado 7)`)
  }
}

// O mesmo para a extensao de TEMAS — o portao tinha um ponto cego de uma pasta ao lado (revisao final
// da V3): a sincronia so olhava a `oficina-claude`, e um executavel com o tema VELHO passava com `[]`,
// deixando todo criterio de cor medir a versao anterior.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V1', 'os TEMAS dentro do executavel sao os do repositorio', false, 'sem executavel')
  } else {
    const fora = temasForaDeSincronia(exe, REPO)
    checar('V1', 'os TEMAS dentro do executavel sao os do repositorio', fora.length === 0, fora.join(', ') || 'iguais')
  }
}

// V3 — a ficha do cartao leva ao diff que JA esta aberto, medido no editor de verdade.
//
// ⚠️ GASTA (uma mensagem curta e uma edicao), como a refatoracao acima e o criterio 7 abaixo. Entra na
// regressao mesmo assim: o defeito que ele mede (clicar na ficha abria um SEGUNDO diff da mesma proposta)
// foi achado NO EDITOR, 2 de 2, e o conserto tinha prova so em dubles — e nenhum duble sabe o que o
// `vscode.diff` do nucleo faz com a mesma entrada na mesma coluna. Prova que nao mora no portao apodrece.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V3', 'a ficha do cartao leva ao diff aberto (nao abre um segundo)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('ficha_leva_ao_diff.mjs', exe, 600000)   // o teto que ela sempre teve
    checar('V3', 'a ficha do cartao leva ao diff aberto (nao abre um segundo)', r.ok, r.detalhe)
    checar('V3', 'a ficha do cartao: nenhum criterio sumiu', r.total === 6,
      `${r.total === null ? 'sem placar' : r.total} (esperado 6)`)
  }
}

// V4 — o TERMINAL do agente no executavel, com o agente de verdade: o comando aprovado roda, o
// efeito aparece no DISCO, o terminal do editor mostra a linha e a saida, e parar nao deixa orfao.
//
// ⚠️ GASTA (duas mensagens curtas), como a refatoracao da V3 e o criterio 7. Entra na regressao
// porque o que ele mede so existe na camada de verdade: o duble da ponte nao sabe o que o terminal
// do editor faz, e foi exatamente ali que a V4 achou um defeito que todos os testes com duble
// deixavam passar (a linha do comando, escrita antes de o terminal abrir, caia no vazio).
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V4', 'o terminal do agente no executavel (o comando roda, o terminal mostra, parar nao deixa orfao)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('terminal_no_editor.mjs', exe, 900000)
    checar('V4', 'o terminal do agente no executavel (o comando roda, o terminal mostra, parar nao deixa orfao)', r.ok, r.detalhe)
    // 17 → 18 em 11/09/2026: o controle do instrumento de processos virou criterio proprio (ele
    // prova que a consulta acha um processo vivo e NAO acha um inexistente). O piso e igualdade
    // exata de proposito — foi assim que se viu que um criterio novo tinha entrado sem
    // o piso subir junto.
    checar('V4', 'o terminal no editor: nenhum criterio sumiu', r.total === 18,
      `${r.total === null ? 'sem placar' : r.total} (esperado 18)`)
  }
}

// V6 — as ACOES do editor ("explicar", "corrigir", "gerar teste", "perguntar"), em node puro.
//
// O motor entra aqui; a mesma versao tem um teste de TELA logo abaixo, que e outro assunto e por
// isso e outro bloco: este roda em node puro, em segundos, e nao custa nada.
{
  const arquivo = path.join(REPO, 'testes', 'acoes.mjs')
  let saida = '', codigo = 0
  try {
    saida = execFileSync(process.execPath, [arquivo], { encoding: 'utf8', timeout: 120000 })
  } catch (e) {
    codigo = e.status ?? 1
    saida = String(e.stdout || '') + String(e.stderr || '')
  }
  let placar = null
  try {
    const linha = saida.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
    placar = linha ? JSON.parse(linha) : null
  } catch { }
  checar('V6', 'as acoes do editor: testes/acoes.mjs verde',
    !!placar && placar.passou === true && codigo === 0,
    placar ? `${placar.total} criterios; falhas: ${placar.falhas.join(' | ') || 'nenhuma'}` : 'nao li o placar')
  // 51 -> 59 em 12/09/2026: a revisao de fora achou, por leitura de codigo, que o caminho
  // ABSOLUTO da maquina entrava no pedido quando o arquivo aberto estava fora da pasta do
  // projeto. O conserto tem barreira propria no montador do texto, e os oito criterios novos
  // medem isso -- inclusive o controle que prova que o caminho RELATIVO sobrevive inteiro.
  const ACOES = 59
  checar('V6', 'as acoes: nenhum criterio sumiu', !!placar && placar.total === ACOES,
    placar ? `${placar.total} (esperado ${ACOES})` : 'sem placar')
}

// V6 — as ACOES DENTRO DO EDITOR de verdade: selecionar, pedir pela paleta, e o pedido chegar a
// conversa com o codigo, o endereco e a instrucao da acao.
//
// ⚠️ GASTA (quatro mensagens, paradas assim que o pedido aparece), como o terminal da V4 e a
// ficha da V3. Entra na regressao porque o que ela mede so existe nesta camada: entre a funcao que
// monta o texto e a pessoa ha o comando registrado, a selecao virar contexto, o painel abrir se
// estiver fechado e o pedido esperar a tela subir — e nada disso aparece no teste de motor.
//
// ⚠️ Ela entrou so depois de ficar verde, em 12/09/2026. Antes disso estava fora de proposito:
// por em pe uma suite que reprova por construcao deixaria a regressao vermelha por padrao, e alarme
// que sempre toca ensina a ignorar o alarme.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V6', 'as acoes no editor (o pedido sai da selecao e chega a conversa)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('acoes_no_editor.mjs', exe, 900000)
    checar('V6', 'as acoes no editor (o pedido sai da selecao e chega a conversa)', r.ok, r.detalhe)
    // Piso por igualdade exata, como as outras suites de tela. Constante nomeada de proposito:
    // e por ela que a conferencia de documentos acha o piso para comparar com o que esta escrito.
    // 30 -> 36 em 12/09/2026: a revisao de fora achou duas promessas da versao sem teste
    // nenhum -- o ATALHO de teclado (a suite inteira ia pela paleta) e o CLIQUE no botao da
    // funcao (media-se que ele aparece, nunca que clicar funciona). O clique tem controle
    // proprio: clica-se no botao da segunda funcao com a PRIMEIRA selecionada, entao um
    // pedido sobre a primeira acusa que o botao perdeu para a selecao.
    const ACOES_NO_EDITOR = 36
    checar('V6', 'as acoes no editor: nenhum criterio sumiu', r.total === ACOES_NO_EDITOR,
      `${r.total === null ? 'sem placar' : r.total} (esperado ${ACOES_NO_EDITOR})`)
  }
}

// V5 — a LISTA das conversas dentro do executavel: ela abre, mostra as conversas da pasta,
// e cada linha traz modelo, custo (sempre como estimativa) e tamanho.
//
// ⚠️ ENTRA NA REGRESSAO porque o defeito que ela mede so existe nesta camada: o caminho da
// pasta so vem com barra invertida quando quem o entrega e o EDITOR. Medido em 12/09/2026:
// com barra invertida, `listSessions` devolve zero sem erro — e a lista abriria vazia com 18
// conversas no disco. O teste de motor nao alcanca isso, porque la o caminho e escolhido
// pelo teste.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V5', 'a lista das conversas no executavel (abre, lista, mostra modelo e custo)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('tela_sessoes.mjs', exe, 900000)
    checar('V5', 'a lista das conversas no executavel (abre, lista, mostra modelo e custo)', r.ok, r.detalhe)
    // Piso por igualdade exata, como as outras suites.
    // Constante nomeada, e nao numero solto: e assim que o `conferir_documentos.py` acha o
    // piso para comparar com o que o documento afirma. Numero inline fica fora da conferencia.
    const TELA_SESSOES = 13
    checar('V5', 'a lista das conversas: nenhum criterio sumiu', r.total === TELA_SESSOES,
      `${r.total === null ? 'sem placar' : r.total} (esperado ${TELA_SESSOES})`)
  }
}

// de convite; e Tokens e Skills alcancaveis sem botao nas barras de composicao definida (o custo no pe
// abre Tokens), porque as barras de atividade e de
// status nasciam ocultas (desde a V13 a de atividade volta, com Skills e sem Tokens). Os tres defeitos so apareceram com o programa aberto: motor e ponte
// estavam verdes com eles. Sem gasto: a pasta de configuracao do agente e vazia e descartavel.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V8', 'o primeiro uso no executavel (cartao de login, portas de Tokens e Skills)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('tela_primeiro_uso.mjs', exe, 900000)
    checar('V8', 'o primeiro uso no executavel (cartao de login, portas de Tokens e Skills)', r.ok, r.detalhe)
    // 13 -> 15 no mesmo dia: o pe estreito (modelo e custo numa linha so).
    // 15 -> 19: o ponto sem login (dois temas) e o titulo da lateral que nao se repete.
    // 19 -> 21 -> 19: Tokens e Skills fora das duas barras de composicao definida; o custo no pe abre Tokens.
    // 19 -> 24 (V14): o relogio do cache no pe (anel, minutos, vencido) e o pe estreito com tudo dentro.
    // 24 -> 35 (V15): o botao do modelo e o painel de escolha (lista, marca, esforco, teclado, confirmacao, Esc).
    // 35 -> 51 (V16): o botao dos agentes e o mapa (arvore, cartoes, cor e forma do estado, tempo andando, detalhe, parar, Esc) e o pe de 506 px com ele nos quatro modos.
    // 55 -> 56 em 23/09/2026: o criterio do "Skills" virou TRES (ver o cabecalho de la).
    const TELA_PRIMEIRO_USO = 56
    checar('V8', 'o primeiro uso: nenhum criterio sumiu', r.total === TELA_PRIMEIRO_USO,
      `${r.total === null ? 'sem placar' : r.total} (esperado ${TELA_PRIMEIRO_USO})`)
  }
}

// V13 — a BARRA LATERAL com os tres botoes de fabrica (Arquivos, Git, Skills), dentro do executavel.
//
// O que ela mede so existe com o nucleo compilado: o patch 0012 le a lista do produto e deixa soltos os
// outros icones de fabrica, e o estado que a pessoa guardou ganha da lista (a suite reabre com o mesmo
// perfil). As cores do Git no explorador vem do tema aplicado sobre um repositorio de verdade. Sem gasto.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V13', 'a barra lateral no executavel (quatro icones, cores do Git, estado guardado)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('tela_lateral.mjs', exe, 900000)
    checar('V13', 'a barra lateral no executavel (quatro icones, cores do Git, estado guardado)', r.ok, r.detalhe)
    // 15 -> 19 (21/09/2026): o t198 tirou a barra de icones da lateral, e os criterios passaram a
    // medir o que existe — os icones em linha no topo, e o que acontece com a lateral fechada.
    const TELA_LATERAL = 20 // V24: +1, o "mesmo icone traz de volta" (o toggle alterna, nao so fecha)
    checar('V13', 'a barra lateral: nenhum criterio sumiu', r.total === TELA_LATERAL,
      `${r.total === null ? 'sem placar' : r.total} (esperado ${TELA_LATERAL})`)
  }
}

// V17 — o NAVEGADOR com tamanhos de tela, dentro do executavel, medido de dentro da pagina.
//
// O que ele mede so existe com o programa aberto: o navegador do editor e um WebContentsView no processo
// principal, e a emulacao (tela, densidade, agente, toque) e dele. A pagina e local (127.0.0.1) e a
// medida e `innerWidth`, `devicePixelRatio`, `navigator.userAgent` e o toque, lidos dentro dela. Sem gasto.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V17', 'o navegador no executavel (botao, aparelhos medidos de dentro da pagina)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('tela_navegador.mjs', exe, 900000)
    checar('V17', 'o navegador no executavel (botao, aparelhos medidos de dentro da pagina)', r.ok, r.detalhe)
    const TELA_NAVEGADOR = 18
    checar('V17', 'o navegador: nenhum criterio sumiu', r.total === TELA_NAVEGADOR,
      `${r.total === null ? 'sem placar' : r.total} (esperado ${TELA_NAVEGADOR})`)
  }
}

// V18 — o LAYOUT LIVRE, dentro do executavel: a alca da caixa de escrever (arrastar e teclado), a altura guardada
// sozinha que volta ao reabrir, e o "Voltar ao layout padrao" (caixa no automatico, barra lateral fechada e com
// 300 px pelo patch 0011, configuracao de tela fora do perfil). A confirmacao e desenhada pelo editor. Sem gasto.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V18', 'o layout livre no executavel (alca da caixa, guardado ao reabrir, voltar ao padrao)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('tela_layout_livre.mjs', exe, 900000)
    checar('V18', 'o layout livre no executavel (alca da caixa, guardado ao reabrir, voltar ao padrao)', r.ok, r.detalhe)
    // V19: 15 -> 16 (a barra da direita, onde a vista Tokens mora, tambem volta a largura de fabrica).
    const TELA_LAYOUT_LIVRE = 16
    checar('V18', 'o layout livre: nenhum criterio sumiu', r.total === TELA_LAYOUT_LIVRE,
      `${r.total === null ? 'sem placar' : r.total} (esperado ${TELA_LAYOUT_LIVRE})`)
  }
}

// V19 — o MOSTRADOR DO LIMITE dentro do executavel: o que so a janela responde. Uma sonda com a cara do item e
// inserida na barra de cima NO LUGAR do item de verdade (que e escondido antes da medida), e se mede se ela CABE
// (os controles da janela nao andam, a barra nao rola, a sonda ocupa espaco de verdade e fica dentro da barra),
// se DA PARA LER (contraste do que o navegador calculou, nos dois temas, medido no ITEM REAL quando ele existe) e
// se o item APARECE (nucleo com o patch 0016, da V19 em diante) ou SOME (nucleo sem ele), sem deixar marcador
// escrito na tela. Sem gasto: nenhuma mensagem vai ao agente.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V19', 'o mostrador do limite no executavel (cabe, da para ler, degrada limpo)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('tela_limite_barra.mjs', exe, 900000)
    checar('V19', 'o mostrador do limite no executavel (cabe, da para ler, degrada limpo)', r.ok, r.detalhe)
    // 46 -> 48 em 23/09/2026: o patch 0023 trouxe o criterio do item REAL, um por tema.
    const TELA_LIMITE_BARRA = 48
    checar('V19', 'o mostrador do limite na tela: nenhum criterio sumiu', r.total === TELA_LIMITE_BARRA,
      `${r.total === null ? 'sem placar' : r.total} (esperado ${TELA_LIMITE_BARRA})`)
  }
}

// V20 — A ABERTURA dentro do executavel: o que ele ve quando clica no icone (t187, t197, t198, t199).
//
// ⚠️ ESTA SUITE ESTAVA ORFA, e foi um revisor independente que pegou (21/09/2026): ela e o teste de
// ACEITACAO da V20 na tela, e nao rodava em bateria nenhuma — quebra-la nao deixava nada vermelho.
// E o mesmo buraco das seis suites da V20, repetido. Agora ha tambem um criterio em `rapidos.mjs`
// que cobre a LISTA inteira, para nao depender de alguem lembrar de cada arquivo.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V20', 'a abertura no executavel (conversa aberta, barra em cima, faixa do limite)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('abertura_v20.mjs', exe, 900000)
    checar('V20', 'a abertura no executavel (conversa aberta, barra em cima, faixa do limite)', r.ok, r.detalhe)
    const ABERTURA_V20 = 8
    checar('V20', 'a abertura: nenhum criterio sumiu', r.total !== null && r.total + r.pulados === ABERTURA_V20,
      `${r.total === null ? 'sem placar' : r.total}${r.pulados ? ` + ${r.pulados} pulado(s)` : ''} (esperado ${ABERTURA_V20})`)
  }
}

// V28 — A ABERTURA COMO A PESSOA ABRE: confianca da pasta LIGADA (toda outra suite a desliga). A V27
// instalada abriu em Modo Restrito e a extensao da OFICINA sumiu inteira; nenhum teste viu.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V28', 'a abertura com a confianca da pasta ligada (a extensao da OFICINA viva)', false, 'sem executavel')
  } else {
    const r = rodarSuiteCara('abertura_como_ele_abre.mjs', exe, 300000)
    checar('V28', 'a abertura com a confianca da pasta ligada (a extensao da OFICINA viva)', r.ok, r.detalhe)
    // 3 sempre + 1 (a ordem) quando os limites sobem para a barra; sem eles, o 4o e PULADO e o placar fica em 3.
    const COMO_ELE_ABRE = [3, 4]
    checar('V28', 'a abertura como ele abre: nenhum criterio sumiu', r.total !== null && COMO_ELE_ABRE.includes(r.total + r.pulados),
      `${r.total === null ? 'sem placar' : r.total} (esperado ${COMO_ELE_ABRE.join(' ou ')})`)
  }
}

// V21: as DUAS suites de tela que nasceram na V21 e nunca entraram em bateria nenhuma.
//
// ⚠️ NAO FOI DECISAO, FOI ESQUECIMENTO. As duas foram escritas, medidas (6/6 e 4/4) e registradas
// na entrega da V21 — e ficaram fora de toda bateria desde entao. Quebra-las nao deixava nada
// vermelho. O criterio de orfas do `rapidos.mjs` vinha apontando as duas a cada corrida, junto com
// as sondas, e o vermelho rotineiro deixou de ser lido. Medidas de novo na V23 antes de entrar:
// continuam verdes.
//
// ⚠️ E AS DUAS NAO IMPRIMIAM PLACAR EM JSON. Postas aqui como estavam, o `rodarSuiteCara` devolveria
// "nao li o placar" e a regressao as reprovaria VERDES. O placar foi acrescentado as duas na mesma
// leva — a ausencia nunca tinha doido justamente porque ninguem as chamava.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V21', 'os icones das vistas na barra de cima (t198), na tela', false, 'sem executavel')
    checar('V21', 'a fileira de acoes da aba, na tela (patch 0019)', false, 'sem executavel')
  } else {
    // V26: 6 -> 8. Entraram os dois criterios que PAGAM a divida do patch 0027 (todo icone fixado
    // de fabrica esta na barra e nada caiu no transbordo; o passo entre eles e o mesmo). Ate aqui a
    // suite media "ha pelo menos dois icones em linha", que quatro cumpriam sem provar nada — e era
    // por isso que o 0027 seguia "escrito, nao medido" mesmo depois de dois builds.
    const ICONES_EM_CIMA = 8
    const a = rodarSuiteCara('tela_barra_de_icones_em_cima.mjs', exe, 600000)
    checar('V21', 'os icones das vistas na barra de cima (t198), na tela', a.ok, a.detalhe)
    checar('V21', 'os icones na barra de cima: nenhum criterio sumiu', a.total === ICONES_EM_CIMA,
      `${a.total === null ? 'sem placar' : a.total} (esperado ${ICONES_EM_CIMA})`)

    /*
      V26: as duas vistas novas, NA TELA. As 194 assercoes em node puro provam o motor com um
      editor de mentira; nenhuma delas prova que o editor DE VERDADE registra os conteineres,
      desenha os icones e abre as vistas. A historia deste projeto e feita de coisas que so
      existiram na tela (a barra que nasceu vazia, os icones de 6x6 px, o `order` do CSS).
    */
    const CONEXOES_E_CONTA = 11
    const c = rodarSuiteCara('tela_conexoes_e_conta.mjs', exe, 600000)
    checar('V26', 'as vistas Conexoes e Conta, na tela', c.ok, c.detalhe)
    checar('V26', 'as vistas Conexoes e Conta: nenhum criterio sumiu', c.total === CONEXOES_E_CONTA,
      `${c.total === null ? 'sem placar' : c.total} (esperado ${CONEXOES_E_CONTA})`)

    const FILEIRA_DA_ABA = 4
    const b = rodarSuiteCara('tela_fileira_da_aba.mjs', exe, 600000)
    checar('V21', 'a fileira de acoes da aba, na tela (patch 0019)', b.ok, b.detalhe)
    checar('V21', 'a fileira da aba: nenhum criterio sumiu', b.total === FILEIRA_DA_ABA,
      `${b.total === null ? 'sem placar' : b.total} (esperado ${FILEIRA_DA_ABA})`)
  }
}

// V24: o segundo clique no MESMO icone da barra de cima FECHA a lateral (patch 0024).
//
// ⚠️ SO O EXECUTAVEL PROVA ISTO. O conserto e uma condicao em TypeScript do nucleo — nao existe
// nada para medir em node puro, e um teste que lesse o `.patch` provaria que a linha foi ESCRITA,
// nao que o clique fecha a lateral. O defeito foi achado pelo dono usando o produto, e e nessa
// camada que ele se prova.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V24', 'a barra de icones de cima ALTERNA: o 2o clique fecha (patch 0024)', false, 'sem executavel')
  } else {
    const TOGGLE_DA_BARRA = 9
    const t = rodarSuiteCara('tela_toggle_da_barra.mjs', exe, 600000)
    checar('V24', 'a barra de icones de cima ALTERNA: o 2o clique fecha (patch 0024)', t.ok, t.detalhe)
    checar('V24', 'o toggle da barra: nenhum criterio sumiu', t.total === TOGGLE_DA_BARRA,
      `${t.total === null ? 'sem placar' : t.total} (esperado ${TOGGLE_DA_BARRA})`)
  }
}

// O fonte do produto e TEXTO — sem byte de controle solto.
//
// ⚠️ Criterio nascido de um estrago de ferramenta (11/09/2026): uma classe de caracteres escrita
// como escape Unicode foi gravada com os BYTES REAIS dentro do arquivo, e o `terminal.js` virou
// "binario" para o git — diff ilegivel, e a varredura de vazamento (que pula binario) passaria a
// ignorar o arquivo inteiro. O codigo continuava funcionando, que e o que torna isto invisivel.
{
  const rastreados = execFileSync('git', ['-C', REPO, 'ls-files', 'extensoes/oficina-claude', 'testes', 'scripts'],
    { encoding: 'utf8' }).split('\n').map(l => l.trim()).filter(Boolean)
    .filter(f => /\.(js|mjs|css|html|json|md)$/.test(f))
  const sujos = []
  for (const rel of rastreados) {
    let bruto
    try { bruto = fs.readFileSync(path.join(REPO, rel)) } catch { continue }
    // Tudo abaixo de 0x20 menos tab, CR e LF. O escape de cor do terminal tambem conta: no fonte
    // ele se escreve como texto, nunca como byte.
    const achado = bruto.find(b => b < 9 || b === 11 || b === 12 || (b > 13 && b < 32))
    if (achado !== undefined) sujos.push(rel)
  }
  checar('V4', 'os fontes do produto sao TEXTO (nenhum byte de controle gravado no arquivo)',
    sujos.length === 0, sujos.slice(0, 5).join(', ') || `${rastreados.length} arquivos limpos`)
}

// Critério 7 dos critérios de pronto — CORAÇÃO 2: a regra de permissao do projeto vale dentro da OFICINA.
//
// ⚠️ Este é o único critério da regressão que GASTA na conta de quem roda (duas
// mensagens curtas). Está declarado no cabeçalho de `trava_de_permissao.mjs`, com a medição
// que mostra por que não há caminho de graça: a lista de ferramentas só existe no
// `system/init`, e o `init` não vem antes da primeira mensagem.
{
  const exe = process.argv[2] || acharExe()
  if (!exe) {
    checar('V2', 'criterio 7: a regra de permissao do projeto bloqueia dentro da OFICINA', false, 'sem executavel')
  } else {
    try {
      execFileSync(process.execPath, [path.join(REPO, 'testes', 'trava_de_permissao.mjs'), exe],
        { stdio: 'inherit', timeout: 600000 })
      checar('V2', 'criterio 7: a regra de permissao do projeto bloqueia dentro da OFICINA', true)
    } catch {
      checar('V2', 'criterio 7: a regra de permissao do projeto bloqueia dentro da OFICINA', false, 'ver saida acima')
    }
  }
}

// Critério 6 dos critérios de pronto: nenhuma credencial em arquivo do projeto.
//
// ⚠️ O que este critério mede é o NOSSO código não guardar segredo — não é uma
// varredura do repositório inteiro (essa é o critério 14, que já roda acima).
// ⚠️ SÓ O CÓDIGO, sem os comentários (16/09/2026). A V8 escreveu, num comentário do `agente.js`, o
// formato de conta que ela MEDIU no SDK — e ali aparece o nome da variável de ambiente da chave. O
// critério acusou esse comentário como credencial. Nenhuma regressão tinha rodado depois da V8, então
// o falso vermelho só apareceu agora. Comentário é onde se explica por que o código não guarda
// segredo: cobrar dele o silêncio empurraria a explicação para fora do arquivo.
{
  const pasta = path.join(REPO, 'extensoes', 'oficina-claude')
  const arquivos = ['agente.js', 'extensao.js', path.join('painel', 'painel.js')]
    .map(f => path.join(pasta, f))
  const semComentarios = t => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const acusar = txt => {
    const achados = []
    // Grava? Lê variável de ambiente de chave? Escreve token em disco?
    if (/ANTHROPIC_API_KEY|apiKey\s*[:=]|sk-ant-/.test(txt)) achados.push('chave')
    if (/writeFileSync\([^)]*token/i.test(txt)) achados.push('grava token')
    return achados
  }
  const suspeitos = []
  for (const f of arquivos) {
    for (const oque of acusar(semComentarios(fs.readFileSync(f, 'utf8')))) suspeitos.push(path.basename(f) + ': ' + oque)
  }
  checar('V2', 'criterio 6: o painel nao guarda nem carrega credencial', suspeitos.length === 0, suspeitos.join(' | '))
  // CONTROLE POSITIVO: sem isto, um erro no corta-comentários deixaria o critério cego e verde.
  const codigoSujo = 'const k = process.env.ANTHROPIC_API_KEY\nfs.writeFileSync(p, token)\n'
  checar('V2', 'CONTROLE POSITIVO: credencial em CÓDIGO continua sendo acusada',
    acusar(semComentarios(codigoSujo)).join() === 'chave,grava token', acusar(semComentarios(codigoSujo)).join())
  checar('V2', 'CONTROLE: o corta-comentários não engole o código em volta',
    semComentarios('const a = 1 // ANTHROPIC_API_KEY\nconst b = 2\n').includes('const a = 1') &&
    !acusar(semComentarios('const a = 1 // ANTHROPIC_API_KEY\n')).length)
}

const falhas = res.filter(r => !r.ok)
console.log('\n' + JSON.stringify({ passou: falhas.length === 0, total: res.length, falhas: falhas.map(f => `[${f.versao}] ${f.criterio}`) }))
process.exit(falhas.length ? 1 : 0)
