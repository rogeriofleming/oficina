// As regras do critério 14, testadas nos dois sentidos.
//
// Uma regra que nunca ficou vermelha não é regra, e uma que fica vermelha à toa
// ensina a ignorar o alarme. Este teste é a única prova de que a varredura pega o que
// tem que pegar e deixa passar o que é legítimo — e roda em milissegundos, sem abrir
// o programa.
//
// ⚠️ DOIS cuidados, e o segundo é o que faz este arquivo existir do jeito que existe:
//
// 1. Os valores "sujos" aqui são INVENTADOS. Um caso de teste com credencial de
//    verdade publicaria a credencial — a coisa exata que isto existe para impedir.
//
// 2. Eles são MONTADOS em pedaços, e não escritos inteiros. Se estivessem inteiros, a
//    varredura acusaria este arquivo (ela acusou, na primeira rodada), e a saída fácil
//    seria pular mais um arquivo. Só que cada arquivo pulado é um ponto cego, e já há
//    um — o `vazamento.mjs`, que contém os padrões por definição. Montar em runtime
//    testa o valor inteiro sem deixar a cadeia contígua no disco: zero ponto cego novo.
//
// Uso: node testes/vazamento_regras.mjs

import { conferirTexto } from '../scripts/vazamento.mjs'

/** Junta os pedaços. Existe pelo motivo 2 do cabeçalho, não por estilo. */
const montar = (...partes) => partes.join('')

const CASOS = [
  // [ nome, texto, o que TEM que ser acusado (vazio = tem que passar limpo) ]

  // --- o vocabulário de revisão (10/09/2026, noite) — nos dois sentidos ---
  ['o revisor que fecha a versão', montar('o guard', 'ião mediu na V1'), ['metodo interno (vocabulario de revisao)']],
  ['o mesmo sem acento, como vai em commit', montar('o guard', 'iao reprovou'), ['metodo interno (vocabulario de revisao)']],
  ['a revisão por ângulo', montar('achado pela len', 'te CODIGO'), ['metodo interno (vocabulario de revisao)']],
  ['o ritual', montar('§CI', 'CLO da V2'), ['metodo interno (vocabulario de revisao)']],
  ['o nome da sessão', montar('na Ofi', 'cina 10'), ['metodo interno (nome de sessao)']],
  ['"CICLO" sem o § é palavra comum e passa limpo', 'O CICLO RAPIDO: rodar do fonte', []],
  ['o produto com número de versão passa limpo', 'OFICINA 1.136.1', []],
  ['"ciclo" minúsculo passa limpo', 'no ciclo da V0', []],

  // --- o que tem que passar limpo ---
  ['comentário comum', 'const x = 1 // um comentario sobre o build', []],
  ['sha do upstream (registrado de propósito)', 'a44adf7f53e00964ab890f9f8758a334f1fc15bc', []],
  ['autoria neutra do repositório', 'OFICINA <oficina@localhost>', []],
  ['assinatura de robô', 'Co-Authored-By: Um Robo <noreply@anthropic.com>', []],
  ['caminho de módulo longo', 'node_modules/@opentelemetry/instrumentation-http/build/src', []],

  // Os três falsos positivos que a primeira versão da regra de entropia acusou.
  // Identificador legível é feito de palavras coladas por separador: a entropia sobe
  // pela VARIEDADE, não por aleatoriedade. Ficam aqui para que o limiar não possa ser
  // "melhorado" de volta ao alarme que sempre toca.
  ['id de componente do Visual Studio', 'Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre', []],

  // ARTE EMBUTIDA — o falso positivo que deixou o criterio 14 vermelho sem ninguem ver.
  //
  // `identidade/gerados/oficina.svg` leva o PNG do icone dentro de um data-uri: uma
  // cadeia contigua de milhares de caracteres com caixa e digito misturados, que e
  // exatamente o que a regra de entropia procura. O gate que decide se o repositorio
  // pode ir a publico acusava esse arquivo TODA vez. Achado por uma revisao independente em
  // 06/09/2026, reproduzido antes de ser corrigido.
  //
  // Os dois casos andam juntos de proposito: o primeiro prova que a arte passa; o
  // segundo prova que a correcao nao virou um buraco por onde um segredo de verdade
  // entraria escondido atras dela.
  ['arte embutida em SVG (data-uri base64)',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAF' +
    'k0lEQVR4nO2WW2xUVRSGv7XPmU5bWqbTQqEUKKUXaCkVBAQjBhMTNTHRxAcffPHBxAcfjA8mPvhg' +
    'YkyMMcYYE2NijDEmxhgTY0yMMSbGxBgTY0yMiTHGmBgTY0yMMSbGmBhjYoyJMcbEGGNMjIkxJsaY' +
    'GBNjTIyJMSbGmBhjYkyMMTHGxBgTY0yMMTHGxBgTY0yMMTHGxBgTY0yMMTHGxBgTY0yMMTHGxBgT' +
    'Y0yMMTHGxBgTY0yMMTHGxBgTY0yMMTHGxBgTY0yMMTHG=="/></svg>', []],
  // Os TRES casos que a revisao final mediu passando limpos, em 06/09/2026, por causa do
  // `\s` que havia dentro da classe do base64: a substituicao atravessava a quebra de
  // linha e engolia o que viesse depois. Nao houve vazamento real -- a cauda engolida
  // alem da arte era 0 caractere nos dois arquivos reais -- mas o buraco estava aberto.
  ['segredo na linha DEPOIS da arte (so quebra de linha entre eles)',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAg\nghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
    ['segredo (formato conhecido)', 'segredo (cadeia de alta entropia)']],
  ['data-uri inventado no topo nao cala o arquivo inteiro',
    'data:text/plain;base64,A\nghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8',
    ['segredo (formato conhecido)', 'segredo (cadeia de alta entropia)']],

  ['segredo escondido DEPOIS da arte embutida',
    '<svg><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAg' +
    'CAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAFk0lEQVR4nO2WW2xUVRSGv7XPmU5b' +
    'WqbTQqEUKKUXaCkVBAQjBhMTNTHRxAcffPHBxAcfjA8mPvhgYkyMMcYYE2NijDEmxhgTY0yM' +
    'MSbGxBgTY0yMMSbGmBhjYoyJMcbEGGNMjIkxJsaYGBNjTIyJMSbGmBhjYkyMMTHGxBgTY0yM' +
    'MTHGxBgTY0yMMTHGxBgTY0yMMTHGxBgTY0yM=="/><!-- ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8 --></svg>',
    ['segredo (formato conhecido)', 'segredo (cadeia de alta entropia)']],
  ['classe de CSS gerada', 'monaco-decoration-itemBadge-kkyaq5', []],
  ['e-mail de teste (domínio reservado)', 'git config user.email teste@exemplo.invalido', []],

  // --- o que TEM que ser acusado ---
  ['e-mail de fora da lista de aceitos',
    montar('contato: fulano', '@umdominioqualquer.com.br'), ['e-mail']],
  ['nome de máquina do Windows',
    montar('rodou em DESK', 'TOP-A1B2C3D'), ['nome de maquina']],
  ['caminho de máquina',
    montar('C:', '\\Users\\alguem\\projeto'), ['caminho de maquina']],

  // ─────────────────────────────────────────────────────────────────────────────
  // AS REGRAS QUE MAIS IMPORTAM, E QUE ATÉ 06/09/2026 NÃO TINHAM CASO POSITIVO.
  //
  // Achado por revisor independente: dos seis nomes de pessoa, de cinco dos seis
  // formatos de caminho, do endereço privado e do `LAPTOP-`, **nenhum** era exercido.
  // Quebrar qualquer uma dessas regras — um `\b` a menos, um `i` esquecido, um `|`
  // trocado — mantinha o teste em 16/16. A varredura é a única coisa entre um dado
  // desta casa e um repositório público; ela estava sem prova justamente onde protege.
  //
  // Os nomes vão MONTADOS, pela mesma razão das credenciais (motivo 2 do cabeçalho):
  // escritos inteiros, a varredura acusaria este arquivo, e a saída fácil seria
  // pulá-lo — trocando uma regra sem teste por um ponto cego, que é pior.
  ['nome de pessoa 1', montar('autor: mi', 'rian'), ['nome de pessoa']],
  ['nome de pessoa 2', montar('para a wan', 'essa'), ['nome de pessoa']],
  ['nome de pessoa 3', montar('falar com pa', 'ulo'), ['nome de pessoa']],
  ['nome de pessoa 4', montar('do ro', 'ger'), ['nome de pessoa']],
  ['nome de pessoa 5', montar('avisar o ma', 'no'), ['nome de pessoa']],
  ['nome de pessoa 6', montar('combinado com a', 'lex'), ['nome de pessoa']],

  // Os cinco formatos de caminho que faltavam. Cada um existe porque um deles JÁ
  // apareceu em arquivo de verdade — em log, em JSON de configuração, em saída de
  // script rodado no Git Bash.
  ['caminho de pasta de trabalho da maquina',
    montar('D:', '\\Claude Code\\projeto'), ['caminho de maquina']],
  ['caminho fixo da pasta de build',
    montar('D:', '\\oficina-build\\log'), ['caminho de maquina fixo']],
  ['caminho de usuário no formato do Git Bash',
    montar('/c', '/Users/alguem/projeto'), ['caminho de maquina (Git Bash)']],
  ['caminho de maquina no formato do Git Bash',
    montar('/d', '/Claude Code/projeto'), ['caminho de maquina (Git Bash)']],
  ['caminho escapado dentro de JSON',
    montar('{"raiz": "D:', '\\\\oficina-build"}'), ['caminho de maquina (JSON escapado)']],

  // A outra metade do `(DESKTOP|LAPTOP)`: só a primeira era exercida.
  ['nome de máquina, variante LAPTOP',
    montar('host: LAP', 'TOP-9Z8Y7X6'), ['nome de maquina']],

  // O endereço que só existe nesta casa.
  ['endereço privado',
    montar('https://oficina.rogerio', 'fleming.com.br/algo'), ['endereco privado']],

  // ⚠️ O caso que derrubou a regra antiga: a chave não tem prefixo conhecido.
  // Filtrar segredo por FORMATO é a causa-raiz que a casa já pagou — uma chave de IA
  // usada aqui começa com `AQ.A…` e passava batido por `sk-ant|gho_|ghp_|AIza`.
  ['chave sem prefixo conhecido',
    montar('CHAVE=AQ.Ab8RN6JmXk29QpLzW4', 'vTyH7cNdF3gS1uR5eK0oI'),
    ['segredo (cadeia de alta entropia)']],
  ['token sem prefixo nenhum',
    montar('token = "9xKp2mQw7ZtR4vNc', '8BdF6yHj3sLg5aUe1oI0"'),
    ['segredo (cadeia de alta entropia)']],
  // Hash de integridade do npm: base64, contíguo, mistura caixa e dígito, entropia
  // alta — passa em todos os filtros de segredo e NÃO é segredo. Um `package-lock.json`
  // tem centenas deles, então isto acusava o arquivo inteiro. O reconhecimento é pelo
  // prefixo que vem antes, não por pular o arquivo.
  // ⚠️ O `/` no meio NÃO é enfeite: é o que fez a primeira versão desta regra passar
  // no teste e falhar no arquivo de verdade. Base64 tem `/` e `+`, o que quebra o hash
  // em VÁRIOS blocos contíguos — e a regra antiga só reconhecia o primeiro, o único
  // que tem `sha512-` atrás. O caso-teste sem `/` não reproduzia o formato real e
  // dava um verde que não valia nada.
  ['hash de integridade de package-lock (com / e + no meio, como o npm gera)',
    '"integrity": "sha512-CDG9z14JVKYRHjpp/g6zJ2k8xM5uSoRgjGdpTiK9woLDZxXtXcxV93ipCh55jQ3REj7M7H3GieMsETGZXB/ydw=="',
    []],
  // ⚠️ E o par que prova que a exceção não virou porta: a MESMA cadeia, sem o
  // prefixo de hash, continua sendo acusada.
  ['a mesma cadeia sem o prefixo de hash continua pega',
    '"chave": "' + montar('Zt8Xk2QmR7pLvN4c', 'B9dF3yHj6sWg1aUe0oI5xK') + '"',
    ['segredo (cadeia de alta entropia)']],
  ['prefixo conhecido continua pego',
    montar('gh', 'p_A1b2C3d4E5f6G7h8', 'I9j0K1l2M3n4O5p6'),
    ['segredo (formato conhecido)', 'segredo (cadeia de alta entropia)']]
]

// ⚠️ A comparação é de CONJUNTO, não "o esperado está contido no achado".
//
// A primeira versão só cobrava rótulo a mais nos casos que deviam passar limpos — nos
// casos que acusam algo, um rótulo EXTRA era invisível. A revisao final provou:
// um caminho de usuário do Windows com um nome de pessoa dentro devolve DOIS rótulos
// (nome de pessoa e caminho de
// máquina), o caso esperava um só, e o teste passava. Um teste de regra que não
// enxerga o que a regra faz a mais não está medindo a regra: está medindo a
// expectativa de quem o escreveu.
const mesmoConjunto = (a, b) => {
  const x = [...new Set(a)].sort()
  const y = [...new Set(b)].sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

let falhas = 0
for (const [nome, texto, esperado] of CASOS) {
  const achado = conferirTexto(texto)
  const ok = mesmoConjunto(achado, esperado)
  if (!ok) falhas++
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}  ->  [${achado.join(', ') || 'limpo'}]` +
    (ok ? '' : `  (esperava exatamente: [${esperado.join(', ') || 'limpo'}])`))
}

// ⚠️ O QUE ESTE PLACAR NÃO DIZ.
//
// "14 de 14 verdes" se lê como "a varredura está boa", e o que foi medido é "as
// regras passam nos 14 casos que ALGUÉM AQUI escolheu". A revisao final mediu cinco
// formatos plausíveis de segredo que passam limpos, de propósito, e é o preço de não
// ter um alarme que sempre toca:
//
//   · hexadecimal de 32 a 64 caracteres  (a guarda que protege hash de commit o dispensa)
//   · bloco contíguo com menos de 24 caracteres
//   · só maiúscula + dígito, ou só minúscula + dígito  (a exigência de caixa mista)
//   · chave quebrada por separador a cada 8 caracteres
//
// Esta varredura nunca foi a única defesa — a passada de cyber da V8 é que fecha.
console.log('\n' + JSON.stringify({
  passou: falhas === 0,
  casos: CASOS.length,
  falhas,
  oQueIstoMede: 'as regras passam nos casos conhecidos deste arquivo — nao que a varredura seja completa'
}))
process.exit(falhas ? 1 : 0)
