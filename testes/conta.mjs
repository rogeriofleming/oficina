// A CONTA (V26) — `conta.js` em node puro: o parse do `auth status` e os três estados. Sem abrir o editor.
//
// O que precisa ser verdade:
//   1. a ficha de quem está logado vira texto em português (método e plano traduzidos);
//   2. o que o programa não conhece aparece COMO VEIO, em vez de virar "desconhecido";
//   3. "não consegui ler" é um estado próprio, que NÃO se confunde com "fora da conta" — a lição do
//      mostrador de tokens da V24, aplicada aqui antes de a tela existir;
//   4. resposta que não é JSON, JSON que não é ficha, e ficha sem `loggedIn` caem todos em "não sei";
//   5. erro de execução vira "não sei" COM o motivo — a tela nunca recebe um silêncio;
//   6. os argumentos de sair e entrar são uma LISTA (nada vira linha de comando interpretada).
//
// ⚠️ NÃO SE TESTA DESLOGANDO NINGUÉM. A resposta real do CLI com a conta deslogada segue NÃO MEDIDA, e
// está declarada assim no `conta.js`. O que se prova aqui é que os dois caminhos existem e não se
// misturam.
//
// Uso:  node testes/conta.mjs          (tudo com um CLI de mentira)
//       node testes/conta.mjs --real   (e mais uma leitura da conta desta máquina, sem imprimir o e-mail)

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const C = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'conta.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

// A ficha de verdade, medida no CLI 2.1.261 em 24/09/2026 (com outro e-mail, de propósito).
const FICHA = {
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  analyticsDisabled: false,
  // ⚠️ Caminho POSIX de propósito: a varredura anti-vazamento barra caminho de máquina em teste, e
  // ela está certa — o valor aqui não muda nada do que se prova.
  projectsDirectory: '/home/alguem/.claude/projects',
  email: 'alguem@exemplo.com',
  orgId: '00000000-0000-0000-0000-000000000000',
  orgName: "alguem@exemplo.com's Organization",
  subscriptionType: 'max',
}

// ── 1. a ficha vira texto ──
{
  const c = C.analisarConta(JSON.stringify(FICHA))
  checar('conta: está dentro', c.situacao === 'dentro', c.situacao)
  checar('conta: o e-mail aparece', c.email === 'alguem@exemplo.com', c.email)
  checar('conta: o método vira português', c.metodo === 'conta do claude.ai', c.metodo)
  checar('conta: o plano vira o nome dele', c.plano === 'Max', c.plano)
  checar('conta: provedor próprio não vira aviso', c.porApi === null, c.porApi)
  checar('conta: o resumo é uma linha só', C.resumoDaConta(c) === 'alguem@exemplo.com', C.resumoDaConta(c))
}

// ── 2. o que não conhecemos aparece como veio ──
{
  const c = C.analisarConta(JSON.stringify({ ...FICHA, authMethod: 'coisa-nova', subscriptionType: 'ultra' }))
  checar('conta: método novo aparece como veio', c.metodo === 'coisa-nova', c.metodo)
  checar('conta: plano novo aparece como veio', c.plano === 'ultra', c.plano)
}
{
  const c = C.analisarConta(JSON.stringify({ ...FICHA, apiProvider: 'bedrock' }))
  checar('conta: provedor de terceiro é dito', c.porApi === 'bedrock', c.porApi)
}

// ── 3. fora ≠ não sei ──
{
  const fora = C.analisarConta(JSON.stringify({ loggedIn: false }))
  checar('conta: deslogado é "fora"', fora.situacao === 'fora', fora.situacao)
  checar('conta: e o resumo diz isso', C.resumoDaConta(fora) === 'fora da conta', C.resumoDaConta(fora))
  checar('conta: "fora" e "não sei" são estados DIFERENTES', fora.situacao !== 'naoSei')
}

// ── 4. tudo que não dá para ler ──
for (const [entrada, oQue] of [
  ['', 'resposta vazia'],
  ['Error: something went wrong', 'texto que não é JSON'],
  ['[1,2,3]', 'JSON que não é ficha'],
  ['{"email":"x@y.z"}', 'ficha sem o campo loggedIn'],
  ['{"loggedIn":"sim"}', 'loggedIn que não é sim/não'],
]) {
  const c = C.analisarConta(entrada)
  checar(`conta: ${oQue} vira "não sei"`, c.situacao === 'naoSei', c.situacao)
  checar(`conta: ${oQue} diz o motivo`, typeof c.motivo === 'string' && c.motivo.length > 5, c.motivo)
}
checar('conta: "não sei" nunca é apresentado como "fora da conta"',
  C.resumoDaConta(C.analisarConta('lixo')) === 'não consegui ler', C.resumoDaConta(C.analisarConta('lixo')))

// ── 5. erro de execução ──
{
  const c = await C.lerConta({ exe: null, rodarComando: () => { throw new Error('não achei o programa do Claude nesta instalação') } })
  checar('conta: o programa que falta vira "não sei" com o motivo',
    c.situacao === 'naoSei' && /não achei o programa/.test(c.motivo), JSON.stringify(c))
}
{
  const c = await C.lerConta({ exe: 'x', rodarComando: async () => JSON.stringify(FICHA) })
  checar('conta: leitura boa carimba a hora', c.situacao === 'dentro' && typeof c.lidoEm === 'number')
}

// ── 6. os argumentos são lista ──
checar('conta: sair é uma lista de argumentos', Array.isArray(C.ARGUMENTOS_PARA_SAIR) && C.ARGUMENTOS_PARA_SAIR.join(' ') === 'auth logout')
checar('conta: entrar é uma lista de argumentos', Array.isArray(C.ARGUMENTOS_PARA_ENTRAR) && C.ARGUMENTOS_PARA_ENTRAR.join(' ') === 'auth login')
/*
  ⛔ ESTE GUARDA OLHAVA O ARQUIVO ERRADO (achado de revisor independente, 24/09/2026). O
  `claude /logout` nunca morou no `conta.js` — ele morava no `sair()`, dentro do `extensao.js`.
  Um teste que lê só o `conta.js` deixa a reincidência passar no arquivo em que ela aconteceu.
  Agora varre os DOIS, e é por isso que ele existe: o defeito não foi digitar errado, foi uma
  instrução envelhecer junto com a ferramenta sem nada ficar vermelho.
*/
{
  const semComentario = arquivo => fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', arquivo), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')
  for (const arquivo of ['conta.js', 'extensao.js', 'telaConta.js']) {
    checar(`⛔ conta: nenhum "/logout" vivo em ${arquivo}`, !/['"\s]\/logout/.test(semComentario(arquivo)))
  }
  checar('⛔ conta: e nenhum "claude /logout" em lugar nenhum da extensão',
    !/claude\s+\/logout/.test(['conta.js', 'extensao.js', 'telaConta.js', 'telaMcps.js', 'mcps.js'].map(semComentario).join('\n')))
}
checar('conta: o comando oficial de sair é o da extensão do Claude',
  C.COMANDO_OFICIAL_DE_SAIR === 'claude-vscode.logout', C.COMANDO_OFICIAL_DE_SAIR)

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// OS ACHADOS DOS REVISORES DE FORA (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── ⛔ `--json` VAI ESCRITO, mesmo sendo o padrão de hoje.
checar('⛔ conta: a leitura pede --json explicitamente (o padrão pode inverter numa versão nova)',
  C.ARGUMENTOS_DA_LEITURA.join(' ') === 'auth status --json', C.ARGUMENTOS_DA_LEITURA.join(' '))

// ── ⛔ UMA LINHA DE AVISO NO STDERR NÃO PODE APAGAR A TELA DA CONTA.
{
  const comAviso = '(node:1234) Warning: alguma coisa\n' + JSON.stringify(FICHA) + '\n'
  const c = C.analisarConta(comAviso)
  checar('⛔ conta: aviso do node ANTES do JSON não derruba a leitura', c.situacao === 'dentro', JSON.stringify(c).slice(0, 120))
  const depois = JSON.stringify(FICHA) + '\nWarning: proxy configurado\n'
  checar('⛔ conta: e aviso DEPOIS do JSON também não', C.analisarConta(depois).situacao === 'dentro')
  checar('conta: o extrator devolve o objeto inteiro, com chaves aninhadas',
    C.primeiroObjetoJson('lixo {"a":{"b":"}"},"c":1} mais lixo') === '{"a":{"b":"}"},"c":1}',
    C.primeiroObjetoJson('lixo {"a":{"b":"}"},"c":1} mais lixo'))
  checar('conta: texto sem objeto nenhum continua virando "não sei"', C.analisarConta('só texto').situacao === 'naoSei')
}

// ── `lerConta` aceita o formato novo de `rodar` (objeto) e o antigo (string).
{
  const a = await C.lerConta({ exe: 'x', rodarComando: async () => ({ texto: JSON.stringify(FICHA), completo: true }) })
  const b = await C.lerConta({ exe: 'x', rodarComando: async () => JSON.stringify(FICHA) })
  checar('conta: lê tanto o objeto de `rodar` quanto uma string crua', a.situacao === 'dentro' && b.situacao === 'dentro')
}

// ── a leitura de verdade, só com --real (e sem imprimir o e-mail) ──
if (process.argv.includes('--real')) {
  const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OFICINA', 'resources', 'app', 'extensions',
    'oficina-claude', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe')
  if (!fs.existsSync(exe)) {
    console.log('  (pulado) --real: não achei o claude.exe da instalação')
  } else {
    const t0 = Date.now()
    const c = await C.lerConta({ exe, cwd: REPO })
    console.log(`  (real) situação: ${c.situacao} · método: ${c.metodo} · plano: ${c.plano} · tem e-mail: ${!!c.email} · ${Date.now() - t0} ms`)
    checar('conta (real): a conta desta máquina foi lida sem parse de texto', c.situacao === 'dentro', c.motivo)
  }
}

// O placar em JSON na última linha — ver a nota em `mcps.mjs`. O piso é o total SEM `--real`.
const falhas = resultados.filter(r => !r.ok).length
console.log(`\nconta: ${resultados.length - falhas}/${resultados.length} critérios`)
console.log(JSON.stringify({ passou: falhas === 0, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(falhas ? 1 : 0)
