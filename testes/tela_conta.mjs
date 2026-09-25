// A VISTA "CONTA" (V26) — `telaConta.js` com um editor de mentira. Sem abrir o editor.
//
// O que precisa ser verdade:
//   1. a vista mostra em qual conta a pessoa está, com plano e método em português;
//   2. o botão de sair existe SEMPRE que possa servir — inclusive quando não deu para ler a conta;
//   3. ⛔ "não consegui ler" NUNCA é desenhado como "fora da conta", e diz isso por escrito;
//   4. estando fora, a vista oferece entrar (e não oferece sair);
//   5. o botão de sair não promete que a OFICINA apagou credencial nenhuma;
//   6. provedor de terceiro (Bedrock, Vertex) é dito, porque muda o que a conta significa;
//   7. a vista mede sozinha ao aparecer, e REMEDE quando a leitura envelhece (dado velho vestido de novo
//      e o pior defeito possivel numa tela cujo proposito e dizer em qual conta voce esta).
//
// Uso:  node testes/tela_conta.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const { criarTelaDaConta } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'telaConta.js'))
const C = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'conta.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const vscode = {
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class { constructor(label, estado) { this.label = label; this.collapsibleState = estado } },
  ThemeIcon: class { constructor(id, cor) { this.id = id; this.cor = cor } },
  ThemeColor: class { constructor(id) { this.id = id } },
  EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }) } fire() { } dispose() { } },
}

const DENTRO = {
  loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty',
  email: 'alguem@exemplo.com', orgName: "alguem@exemplo.com's Organization", subscriptionType: 'max',
}

function montar(resposta, agora) {
  const registro = { saiu: 0, entrou: 0, vezes: 0 }
  const tela = criarTelaDaConta(vscode, {
    medir: async () => {
      registro.vezes++
      const c = typeof resposta === 'function' ? resposta() : C.analisarConta(JSON.stringify(resposta))
      return { ...c, lidoEm: agora ? agora() : Date.now() }
    },
    sair: () => registro.saiu++,
    entrar: () => registro.entrou++,
    agora,
  })
  return { tela, registro }
}
const raiz = tela => tela.provedor.getChildren()
const rotulos = tela => raiz(tela).map(i => i.label)

// ── 1. dentro ──
{
  const { tela } = montar(DENTRO)
  await tela.atualizar()
  const r = raiz(tela)
  checar('tela conta: mostra o e-mail da conta', r[0].label === 'alguem@exemplo.com', r[0].label)
  checar('tela conta: e o plano com o método, em português', r[0].description === 'Max · conta do claude.ai', r[0].description)
  checar('tela conta: a organização aparece na dica', /Organização:/.test(r[0].tooltip), r[0].tooltip)
  checar('tela conta: o título da vista resume em uma linha, com a hora', /^alguem@exemplo\.com · /.test(tela.descricaoDaVista()), tela.descricaoDaVista())
}

// ── 2 e 5. o botão de sair ──
{
  const { tela, registro } = montar(DENTRO)
  await tela.atualizar()
  const sair = raiz(tela).find(i => /Sair \/ trocar de conta/.test(i.label))
  checar('tela conta: o botão de sair existe', !!sair, rotulos(tela).join(' | '))
  checar('tela conta: e ele diz que quem guarda o login é o Claude, fora da OFICINA',
    /Quem guarda o login é o Claude, fora da OFICINA/.test(sair.tooltip), sair.tooltip)
  // ⚠️ O texto PODE falar em apagar — desde que seja para dizer que a OFICINA NÃO tem o que apagar.
  // O critério cobra a frase certa, em vez de proibir a palavra.
  checar('tela conta: ele diz que a OFICINA não tem credencial sua para apagar',
    /não tem a sua senha nem o seu token para apagar/.test(sair.tooltip), sair.tooltip)
  checar('tela conta: ele aponta por onde se entra em outra conta',
    /Entrar numa conta/.test(sair.tooltip), sair.tooltip)
  tela.sair()
  checar('tela conta: e ele chama quem desconecta de verdade', registro.saiu === 1, registro.saiu)
}

// ── 3. ⛔ não sei ≠ fora ──
{
  const { tela } = montar({ isso: 'não é ficha de conta' })
  await tela.atualizar()
  const r = raiz(tela)
  checar('tela conta: não deu para ler → diz isso', /Não consegui ler a conta/.test(r[0].label), r[0].label)
  checar('tela conta: e explica que NÃO quer dizer estar fora',
    /NÃO quer dizer que você está fora da conta/.test(r[0].tooltip), r[0].tooltip)
  checar('tela conta: a tela do "não sei" não diz "fora da conta" em lugar nenhum',
    !rotulos(tela).some(l => /fora da conta/i.test(l)), rotulos(tela).join(' | '))
  checar('tela conta: oferece tentar de novo', rotulos(tela).some(l => /Tentar de novo/.test(l)))
  checar('tela conta: e o botão de sair continua à mão', rotulos(tela).some(l => /Sair/.test(l)))
}

// ── 4. fora ──
{
  const { tela, registro } = montar({ loggedIn: false })
  await tela.atualizar()
  checar('tela conta: fora da conta é dito', rotulos(tela).some(l => /Você está fora da conta/.test(l)), rotulos(tela).join(' | '))
  checar('tela conta: e oferece entrar', rotulos(tela).some(l => /Entrar numa conta/.test(l)))
  checar('tela conta: estando fora, não oferece sair', !rotulos(tela).some(l => /Sair/.test(l)), rotulos(tela).join(' | '))
  tela.entrar()
  checar('tela conta: o entrar chama quem entra', registro.entrou === 1)
}

// ── 6. provedor de terceiro ──
{
  const { tela } = montar({ ...DENTRO, apiProvider: 'bedrock' })
  await tela.atualizar()
  checar('tela conta: passar por Bedrock/Vertex é dito na tela',
    rotulos(tela).some(l => /Passando por bedrock/.test(l)), rotulos(tela).join(' | '))
}

// ── 7. medir ao aparecer, e REMEDIR quando envelhece ──
//
// ⛔ ESTE BLOCO DIZIA "mede uma vez só" E CIMENTAVA UM DEFEITO. A vista media uma vez na vida da
// janela e nunca mais: a pessoa saía da conta e a tela seguia mostrando o e-mail antigo, com ícone
// verde, até reiniciar o programa. Dois revisores independentes acharam a mesma coisa. O critério
// certo não é "uma vez só", é "uma vez por leitura válida".
{
  let relogio = 1_000_000
  const { tela, registro } = montar(DENTRO, () => relogio)
  await tela.aoAparecer()
  checar('tela conta: mede sozinha na primeira vez que aparece', registro.vezes === 1, registro.vezes)
  await tela.aoAparecer()
  checar('tela conta: aparecer de novo logo depois NÃO remede', registro.vezes === 1, registro.vezes)
  relogio += 6 * 60 * 1000
  await tela.aoAparecer()
  checar('⛔ tela conta: mas remede quando a leitura envelhece', registro.vezes === 2, registro.vezes)
}

// ── ⛔ O TÍTULO CARIMBA A HORA: dado sem idade vira dado velho vestido de novo.
{
  let relogio = 1_000_000
  const { tela } = montar(DENTRO, () => relogio)
  await tela.atualizar()
  checar('⛔ tela conta: o resumo traz a hora da leitura', /· agora$/.test(tela.descricaoDaVista()), tela.descricaoDaVista())
  relogio += 4 * 60 * 1000
  checar('⛔ tela conta: e ela envelhece sozinha', /há 4 min$/.test(tela.descricaoDaVista()), tela.descricaoDaVista())
}

/*
  ── ⛔ TODO BOTÃO QUE O TEXTO MANDA PROCURAR EXISTE DE VERDADE.

  Irmão do critério que existe na vista de conexões, e pelo mesmo motivo: mandar procurar um botão
  que não existe quebra a confiança igual a um botão que não faz nada. Aqui a regra é um pouco mais
  larga, e de propósito — o que a pessoa vê na tela é o RÓTULO DA LINHA, que nem sempre é igual ao
  título do comando no manifesto ("Entrar numa conta" na linha, "Entrar numa conta do Claude" na
  paleta). Então o nome citado vale se existir num dos dois lugares.
*/
{
  const manifesto = JSON.parse(fs.readFileSync(path.join(REPO, 'extensoes', 'oficina-claude', 'package.json'), 'utf8'))
  const nomes = new Set(manifesto.contributes.commands.map(c => c.title))
  for (const resposta of [DENTRO, { loggedIn: false }, { isso: 'lixo' }]) {
    const { tela } = montar(resposta)
    await tela.atualizar()
    raiz(tela).forEach(i => nomes.add(i.label))
  }
  const { tela } = montar(DENTRO)
  await tela.atualizar()
  const textos = raiz(tela).map(i => i.tooltip || '').join('\n')
  const citados = [...new Set([...textos.matchAll(/"([^"\n]{3,60})"/g)].map(m => m[1]))]
    .filter(t => /^[A-ZÀ-Ý]/.test(t) && t.split(' ').length <= 6)
  const inexistentes = citados.filter(t => !nomes.has(t))
  checar('⛔ tela conta: todo botão citado no texto EXISTE na tela ou na paleta',
    inexistentes.length === 0, `citados: ${citados.join(' · ')} || não existem: ${inexistentes.join(' · ')}`)
}

// ── ⛔ O BOTÃO DE SAIR NÃO PROMETE O QUE NINGUÉM MEDIU.
{
  const { tela } = montar(DENTRO)
  await tela.atualizar()
  const sair = raiz(tela).find(i => /Sair \/ trocar de conta/.test(i.label))
  checar('⛔ tela conta: a dica NÃO afirma que a conversa pedirá a conta de novo',
    !/conversa pede a conta/.test(sair.tooltip), sair.tooltip)
  checar('⛔ tela conta: ela aponta o caminho que existe nesta tela',
    /botão "Entrar numa conta"/.test(sair.tooltip), sair.tooltip)
}
{
  const { tela } = montar(() => { throw new Error('o Claude sumiu') })
  await tela.atualizar()
  checar('tela conta: medição que estoura vira "não sei", e não quebra a vista',
    /Não consegui ler a conta/.test(raiz(tela)[0].label), rotulos(tela).join(' | '))
}

// O placar em JSON na última linha — ver a nota em `mcps.mjs`.
const falhas = resultados.filter(r => !r.ok).length
console.log(`\ntela conta: ${resultados.length - falhas}/${resultados.length} critérios`)
console.log(JSON.stringify({ passou: falhas === 0, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(falhas ? 1 : 0)
