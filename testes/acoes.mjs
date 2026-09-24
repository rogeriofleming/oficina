// AS AÇÕES DO EDITOR — o texto de cada pedido, provado sem abrir o editor.
//
// `acoes.js` não importa `vscode` justamente para caber aqui. O que este arquivo mede é o
// PRODUTO desta parte: o texto que chega ao agente quando alguém seleciona um trecho e pede
// "explicar", "corrigir" ou "gerar teste". Um pedido mal montado é uma resposta ruim que
// ninguém consegue explicar depois.
//
// ⚠️ TODO CRITÉRIO AQUI RESPONDE À PERGUNTA: ele fica VERMELHO se eu desfizer o conserto?
// Onde a resposta não era obviamente sim, há um CONTROLE ao lado.
//
// Uso:  node testes/acoes.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const acoes = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'acoes.js'))
const { ACOES, montar, titulo, porId, enderecar, caminhoParaMostrar, cercaSegura, TETO_DO_TRECHO } = acoes

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok, detalhe: detalhe ?? '' })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + String(detalhe).slice(0, 180) + ')' : ''}`)
}

const CTX = {
  caminho: 'src/conta.js',
  linguagem: 'javascript',
  linhaInicial: 12,
  linhaFinal: 20,
  trecho: 'function somar(a, b) {\n  return a + b\n}',
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AS QUATRO AÇÕES EXISTEM E SÃO DISTINTAS
// ─────────────────────────────────────────────────────────────────────────────
{
  checar('as quatro ações da versão existem', ACOES.length === 4, ACOES.map(a => a.id).join(', '))
  for (const id of ['explicar', 'corrigir', 'testar', 'perguntar']) {
    checar(`a ação "${id}" existe`, !!porId(id))
  }
  checar('ação desconhecida não vira pedido', montar('formatar', CTX) === null)

  const textos = ['explicar', 'corrigir', 'testar'].map(id => montar(id, CTX))
  checar('as três ações prontas montam pedido', textos.every(t => typeof t === 'string' && t.length > 0))
  checar('e os três pedidos são DIFERENTES entre si', new Set(textos).size === 3)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. O QUE CADA PEDIDO CARREGA
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar('explicar', CTX)
  checar('o pedido leva o código selecionado', t.includes('function somar(a, b)'))
  checar('o pedido leva o endereço (arquivo e linhas)', t.includes('src/conta.js:12-20'), t.split('\n')[0])
  checar('o pedido leva a linguagem, para o bloco sair colorido', t.includes('```javascript'))

  // ⚠️ "Explicar" não pode voltar com um diff: quem quer entender não pediu mudança.
  checar('explicar manda NÃO reescrever', /NÃO reescreva/i.test(t))
  // ⛔ CONTROLE: corrigir, ao contrário, MANDA mudar — se as duas dissessem a mesma coisa,
  // o critério acima não estaria medindo nada.
  checar('⛔ CONTROLE: corrigir NÃO diz para não reescrever', !/NÃO reescreva/i.test(montar('corrigir', CTX)))

  // Cada ação carrega a trava contra a resposta de fachada.
  checar('corrigir proíbe inventar melhoria quando não há defeito',
    /não invente melhoria/i.test(montar('corrigir', CTX)))
  checar('gerar teste exige um teste que FALHE se o comportamento mudar',
    /FALHAR se o comportamento mudar/i.test(montar('testar', CTX)))
  checar('gerar teste manda seguir o estilo do projeto, não inventar framework',
    /não invente um framework/i.test(montar('testar', CTX)))
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. O CAMINHO É RELATIVO — a conversa fica gravada em disco
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar('explicar', CTX)
  checar('o pedido NÃO leva caminho absoluto de máquina', !/[A-Z]:[\\/]/.test(t), t.slice(0, 80))
  checar('enderecar com uma linha só não inventa intervalo',
    enderecar({ caminho: 'a.js', linhaInicial: 5 }) === 'a.js:5',
    enderecar({ caminho: 'a.js', linhaInicial: 5 }))
  checar('enderecar com início igual ao fim não repete o número',
    enderecar({ caminho: 'a.js', linhaInicial: 5, linhaFinal: 5 }) === 'a.js:5')
  checar('sem linha, só o arquivo', enderecar({ caminho: 'a.js' }) === 'a.js')
  checar('sem caminho, o pedido ainda diz de onde é',
    enderecar({}) === '(arquivo sem nome)', enderecar({}))
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SELEÇÃO VAZIA NÃO VIRA PEDIDO
// ─────────────────────────────────────────────────────────────────────────────
{
  checar('trecho vazio não vira pedido', montar('explicar', { ...CTX, trecho: '' }) === null)
  checar('trecho só com espaço não vira pedido', montar('explicar', { ...CTX, trecho: '   \n\t ' }) === null)
  checar('trecho ausente não vira pedido', montar('explicar', { caminho: 'a.js' }) === null)
  // ⛔ CONTROLE: com trecho, o MESMO caminho vira pedido — senão o critério acima passaria
  // por qualquer motivo, inclusive por a função estar quebrada.
  checar('⛔ CONTROLE: com trecho, vira pedido',
    typeof montar('explicar', { caminho: 'a.js', trecho: 'x' }) === 'string')
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PERGUNTAR — a única que depende do que a pessoa escreve
// ─────────────────────────────────────────────────────────────────────────────
{
  checar('perguntar sem pergunta não vira pedido', montar('perguntar', CTX) === null)
  checar('perguntar com pergunta em branco não vira pedido',
    montar('perguntar', { ...CTX, pergunta: '   ' }) === null)
  const t = montar('perguntar', { ...CTX, pergunta: 'isso trata número negativo?' })
  checar('a pergunta da pessoa vai LITERAL no pedido', t.includes('isso trata número negativo?'))
  checar('e o trecho vai junto com ela', t.includes('function somar'))
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. O TRECHO GRANDE — o teto, e o que ele troca
// ─────────────────────────────────────────────────────────────────────────────
{
  const enorme = Array.from({ length: 900 }, (_, i) => `  const linha${i} = ${i}`).join('\n')
  checar('o caso de teste é MESMO maior que o teto', enorme.length > TETO_DO_TRECHO,
    `${enorme.length} > ${TETO_DO_TRECHO}`)

  const t = montar('explicar', { ...CTX, trecho: enorme })
  checar('trecho grande NÃO vai inteiro no pedido', !t.includes('const linha500'),
    `${t.length} caracteres`)
  checar('e o pedido fica bem menor que o trecho', t.length < enorme.length / 2,
    `pedido ${t.length} × trecho ${enorme.length}`)
  checar('trecho grande manda o agente LER o arquivo', /Leia direto do arquivo/i.test(t))
  checar('e diz o tamanho, para a pessoa entender por que', /900 linhas/.test(t))
  checar('a amostra mostra o começo', t.includes('const linha0'))
  checar('a amostra mostra o fim', t.includes('const linha899'))
  checar('a instrução da ação continua presente no trecho grande', /Explique o que este código faz/i.test(t))

  // ⛔ CONTROLE: logo ABAIXO do teto, o trecho vai inteiro.
  const cabe = 'x'.repeat(TETO_DO_TRECHO - 10)
  const t2 = montar('explicar', { ...CTX, trecho: cabe })
  checar('⛔ CONTROLE: abaixo do teto, o trecho vai INTEIRO', t2.includes(cabe) && !/Leia direto do arquivo/i.test(t2))
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. A CERCA DO MARKDOWN — trecho com crases não pode partir o pedido
// ─────────────────────────────────────────────────────────────────────────────
{
  checar('cerca padrão são três crases', cercaSegura('nada aqui') === '```', cercaSegura('nada aqui'))
  checar('trecho com ``` recebe cerca maior', cercaSegura('a ``` b') === '````', cercaSegura('a ``` b'))
  checar('trecho com ````` recebe cerca ainda maior',
    cercaSegura('a ````` b') === '``````', cercaSegura('a ````` b'))

  // ⚠️ O caso de verdade: um trecho de markdown com bloco de código dentro. Sem a cerca
  // crescente, o bloco fecha no meio e a INSTRUÇÃO da ação vira texto solto — o agente lê
  // um pedido sem pedido.
  const comBloco = 'Exemplo:\n```js\nconst a = 1\n```\nfim'
  const t = montar('explicar', { ...CTX, trecho: comBloco, linguagem: 'markdown' })
  const cerca = cercaSegura(comBloco)
  checar('trecho que contém bloco de código não parte o pedido', cerca.length > 3, `cerca de ${cerca.length}`)
  const depoisDoTrecho = t.slice(t.lastIndexOf(cerca) + cerca.length)
  checar('a instrução continua DEPOIS do trecho, fora do bloco',
    /Explique o que este código faz/i.test(depoisDoTrecho), JSON.stringify(depoisDoTrecho.slice(0, 60)))
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. O SÍMBOLO (quando a ação vem do CodeLens, em cima de uma função)
// ─────────────────────────────────────────────────────────────────────────────
{
  const t = montar('explicar', { ...CTX, simbolo: 'somar' })
  checar('o pedido nomeia a função quando ela é conhecida', t.includes('`somar`'), t.split('\n')[0])
  checar('e continua dizendo o endereço', t.includes('src/conta.js:12-20'))
  checar('sem símbolo, o pedido não inventa nome',
    !montar('explicar', CTX).includes('undefined'), montar('explicar', CTX).split('\n')[0])
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. O TÍTULO DA ABA
// ─────────────────────────────────────────────────────────────────────────────
{
  checar('o título usa a função quando há uma', titulo('explicar', { ...CTX, simbolo: 'somar' }) === 'Explicar: somar',
    titulo('explicar', { ...CTX, simbolo: 'somar' }))
  checar('sem função, usa o nome do arquivo', titulo('corrigir', CTX) === 'Corrigir: conta.js',
    titulo('corrigir', CTX))
  checar('o título do arquivo não leva a pasta', !titulo('corrigir', CTX).includes('src/'))
  checar('perguntar dá à aba a pergunta da pessoa',
    titulo('perguntar', { ...CTX, pergunta: 'e o negativo?' }) === 'e o negativo?')
  checar('ação desconhecida não tem título', titulo('formatar', CTX) === null)
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. O CAMINHO ABSOLUTO NÃO ENTRA NO PEDIDO
//
// ⚠️ Achado por revisão independente em 12/09/2026, e por LEITURA de código: quem lê a
// seleção só troca o caminho por relativo quando o editor acha uma pasta para aquele
// documento. Arquivo solto, aberto fora da pasta do projeto, não tem pasta — e o absoluto
// seguia para dentro da conversa, que fica GRAVADA no perfil de quem usa.
//
// A garantia estava no comentário e não no código. Agora está nos dois, e aqui.
// ─────────────────────────────────────────────────────────────────────────────
{
  const BARRA = String.fromCharCode(92)
  const WINDOWS = 'C:' + BARRA + 'Users' + BARRA + 'alguem' + BARRA + 'projeto' + BARRA + 'conta.js'
  const REDE = BARRA + BARRA + 'servidor' + BARRA + 'equipe' + BARRA + 'conta.js'

  checar('caminho do Windows vira só o nome do arquivo',
    caminhoParaMostrar(WINDOWS) === 'conta.js', caminhoParaMostrar(WINDOWS))
  checar('caminho do Linux/Mac vira só o nome do arquivo',
    caminhoParaMostrar('/home/alguem/projeto/conta.js') === 'conta.js')
  checar('caminho de rede vira só o nome do arquivo',
    caminhoParaMostrar(REDE) === 'conta.js', caminhoParaMostrar(REDE))

  // ⚠️ CONTROLE: sem isto, "sempre devolver o nome do arquivo" passaria nos três de cima
  // e o critério estaria medindo o vazio. O caminho relativo TEM de sobreviver inteiro — é
  // ele que diz ao agente onde a coisa mora.
  checar('⛔ CONTROLE: o caminho RELATIVO continua inteiro (não vira só o nome)',
    caminhoParaMostrar('src/nucleo/conta.js') === 'src/nucleo/conta.js',
    caminhoParaMostrar('src/nucleo/conta.js'))
  checar('e a barra invertida do Windows vira barra normal no relativo',
    caminhoParaMostrar('src' + BARRA + 'conta.js') === 'src/conta.js')

  // O que importa de verdade: o TEXTO que vai para a conversa.
  const pedido = montar('explicar', { ...CTX, caminho: WINDOWS })
  checar('o pedido montado NÃO leva o caminho absoluto',
    !pedido.includes('C:') && !pedido.includes('alguem'), pedido.split(String.fromCharCode(10))[0])
  checar('mas continua dizendo QUAL arquivo e quais linhas',
    pedido.includes('conta.js:12-20'), pedido.split(String.fromCharCode(10))[0])
  checar('e o título da aba também não leva a pasta de ninguém',
    titulo('corrigir', { ...CTX, caminho: WINDOWS }) === 'Corrigir: conta.js',
    titulo('corrigir', { ...CTX, caminho: WINDOWS }))
}

// ─────────────────────────────────────────────────────────────────────────────
const falhas = resultados.filter(r => !r.ok)
console.log('\n' + JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
process.exit(falhas.length ? 1 : 0)
