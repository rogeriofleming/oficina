// As extensões de terceiro que a OFICINA NÃO embarca.
//
// Por que isto existe, e por que é uma decisão de produto e não um patch:
//
// O upstream versiona a extensão do Copilot Chat dentro do próprio repositório
// (`git ls-files extensions/copilot` na tag 1.136.1 devolve 4.129 arquivos), então
// todo build feito do código aberto a embarca por padrão — 409 MB, com a árvore de
// dependências inteira, incluindo pilha de telemetria de terceiro. O patch de
// viabilidade 0001 removeu apenas o GANCHO DE EMPACOTAMENTO dela; a extensão
// continuava entrando, e o `.md` daquele patch chegou a afirmar o contrário.
//
// O dono do projeto viu o resultado disso na tela — um botão de login que não é dele,
// um painel de chat que não é o dele ocupando a lateral, e uma janela que não abre no
// que ele quer — e mandou tirar. Não é ajuste de configuração no perfil de ninguém: é
// o produto que muda.
//
// Também resolve, de uma vez: os 409 MB no instalador da V7 e a questão de licença de
// redistribuir a extensão da GitHub num repositório público (V8).
//
// ## ⚠️ POR QUE ELE PASSOU A MEXER NA SAÍDA, E NÃO NO FONTE (05/09/2026)
//
// A primeira versão apagava `extensions/copilot` do CLONE, antes de compilar. Parecia
// o caminho óbvio — e **quebrou o build**, com uma mensagem que não fala do assunto:
//
//     spawn C:\WINDOWS\system32\cmd.exe ENOENT
//     npm error command failed ... node build/npm/postinstall.ts
//
// Causa medida no fonte da tag 1.136.1: `build/npm/dirs.ts` traz `extensions/copilot`
// numa lista fixa (linha 18) e o `postinstall.ts` roda `npm install` dentro de CADA
// pasta dessa lista, com `shell: true` — e um `cwd` que não existe faz o spawn do
// próprio `cmd.exe` morrer. Parece problema de PATH e não é.
//
// Tirar aquela linha exigiria patch no core. E o levantamento seguinte mostrou que
// não seria UM patch: `build/lib/extensions.ts` também cita a pasta em dois lugares
// (linhas 319 e 473). Cada patch desses é dívida — tem que ser reconferido a cada
// subida de tag, e a única forma de descobrir o próximo ponto que quebra é gastar
// mais 36 minutos de build por tentativa.
//
// Então a remoção mudou de lugar: acontece **depois do empacotamento**, na pasta de
// saída, onde o resultado é o mesmo para quem usa e o build não é contrariado.
//
// **O custo, declarado:** o build continua baixando, instalando e compilando a
// extensão que vai ser jogada fora — ou seja, isto **não** deixa o build mais rápido
// nem mais leve em disco durante a compilação. Ele só garante que o PRODUTO não a
// tem. Se um dia o tempo de build virar o problema, o caminho é o patch no core (é o
// que o VSCodium faz, em `53-ext-copilot-remove-it.patch`) — e aí com os três pontos
// já mapeados aqui.
//
// ⚠️ Reversível por construção: nada aqui é destrutivo para o repositório. A pasta de
// saída é refeita a cada build, e basta tirar o nome da lista abaixo para voltar a
// embarcar. NÃO roda no modo `--puro`: a linha de base tem que continuar sendo o
// upstream (mais os patches de viabilidade), senão a comparação perde o sentido.
//
// Uso: node scripts/remover_extensoes.mjs <pasta de saida do build>
//      node scripts/remover_extensoes.mjs <clone> --fonte     (o caminho antigo, que
//                                                              quebra o npm install)

import fs from 'node:fs'
import path from 'node:path'

// Pasta dentro de `extensions/` → por que ela não entra.
const NAO_EMBARCAR = [
  ['copilot', 'Copilot Chat da GitHub: 409 MB, marca e login de terceiro na interface, e licenca a resolver antes do repo virar publico']
]

const alvo = process.argv[2]
const noFonte = process.argv.includes('--fonte')

if (!alvo || !fs.existsSync(alvo)) {
  console.log('uso: node scripts/remover_extensoes.mjs <pasta de saida do build> [--fonte]')
  process.exit(1)
}

// No fonte as extensões ficam em `extensions/`; na saída empacotada, dentro de
// `resources/app/extensions/`.
const base = noFonte ? path.join(alvo, 'extensions') : path.join(alvo, 'resources', 'app', 'extensions')

if (!fs.existsSync(base)) {
  console.log('ERRO: nao achei a pasta de extensoes em ' + base +
    (noFonte ? '' : '\nA saida do build parece incompleta - o empacotamento chegou ao fim?'))
  process.exit(1)
}

let removidas = 0
for (const [pasta, porque] of NAO_EMBARCAR) {
  const caminho = path.join(base, pasta)
  if (!fs.existsSync(caminho)) {
    console.log(`  ja nao estava la: ${pasta}`)
    continue
  }
  fs.rmSync(caminho, { recursive: true, force: true })
  removidas++
  console.log(`  removida do produto: ${pasta}  (${porque})`)
}

// ⚠️ Conferir o resultado, e não confiar no que o laço acha que fez.
const sobrou = NAO_EMBARCAR.map(([p]) => p).filter(p => fs.existsSync(path.join(base, p)))
if (sobrou.length) {
  console.log('ERRO: ainda existem em ' + base + ': ' + sobrou.join(', '))
  process.exit(1)
}

console.log(`  ${removidas} removida(s); nenhuma da lista sobrou em ${base}`)
