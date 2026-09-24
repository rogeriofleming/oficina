// A TELA DE SKILLS (V12) — `telaSkills.js` com um editor de mentira. Sem abrir o editor.
//
// O que precisa ser verdade:
//   1. sem lista, a vista diz de onde a lista vem (e o clique abre a conversa);
//   2. com a lista, dois grupos: o da pessoa aberto, o do programa recolhido;
//   3. cada linha tem o clique que usa a skill e os botões certos para o estado dela;
//   4. estrela, olho e arrastar gravam no PERFIL e redesenham; a lista fica guardada na PASTA;
//   5. oculta fica cinza pela decoração, e só a oculta;
//   6. lista nova substitui a anterior.
//
// Uso:  node testes/tela_skills.mjs

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const { criarTelaDeSkills, ESQUEMA, MIME } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'telaSkills.js'))
const S = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'skills.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

// ── o editor de mentira ──
let redesenhos = 0
const vscode = {
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class { constructor(label, estado) { this.label = label; this.collapsibleState = estado } },
  ThemeIcon: class { constructor(id) { this.id = id } },
  ThemeColor: class { constructor(id) { this.id = id } },
  Uri: { from: ({ scheme, path: p }) => ({ scheme, path: p }) },
  DataTransferItem: class { constructor(v) { this.value = v } asString() { return Promise.resolve(JSON.stringify(this.value)) } },
  EventEmitter: class {
    constructor() { this.event = () => ({ dispose() { } }) }
    fire() { redesenhos++ }
    dispose() { }
  },
}
const guardado = () => {
  const dados = {}
  return { dados, get: k => dados[k], update: async (k, v) => { dados[k] = JSON.parse(JSON.stringify(v)) } }
}
const transferencia = () => {
  const m = new Map()
  return { set: (k, v) => m.set(k, v), get: k => m.get(k) }
}

const DO_SDK = [
  { name: 'clear', description: 'Clear conversation history', argumentHint: '' },
  { name: 'minha-skill', description: 'Faz a coisa (user)', argumentHint: '' },
  { name: 'do-projeto', description: 'Coisa desta pasta (project)', argumentHint: '<arquivo>' },
  { name: 'dataviz', description: 'Charts', argumentHint: '' },
]

const perfil = guardado()
const pasta = guardado()
const tela = criarTelaDeSkills(vscode, { perfil, pasta })
const raiz = () => tela.provedor.getChildren()
const nomesDe = g => tela.provedor.getChildren(g).map(i => i.label).join()

// 1. sem lista
{
  const r = raiz()
  checar('tela skills: sem lista, a vista diz de onde a lista vem', r.length === 1 && /Abra a conversa/.test(r[0].label), r.map(i => i.label).join())
  checar('tela skills: sem lista, o clique abre a conversa', r[0].command && r[0].command.command === 'oficina.abrirConversaOuExplicar')
}

// 2. com a lista
await tela.receberLista(DO_SDK)
{
  const [daPessoa, doPrograma] = raiz()
  checar('tela skills: dois grupos, com a contagem', /^Suas skills \(2\)$/.test(daPessoa.label) && /^Do programa \(2\)$/.test(doPrograma.label), raiz().map(i => i.label).join(' | '))
  checar('tela skills: o da pessoa nasce aberto, o do programa recolhido', daPessoa.collapsibleState === 2 && doPrograma.collapsibleState === 1)
  checar('tela skills: grupos com id fixo (o editor lembra se estava aberto)', daPessoa.id === 'grupo:pessoa' && doPrograma.id === 'grupo:programa')
  checar('tela skills: a lista foi guardada na PASTA, não no perfil', Array.isArray(pasta.dados[S.CHAVE_DA_LISTA]) && pasta.dados[S.CHAVE_DA_LISTA].length === 4 && perfil.dados[S.CHAVE_DA_LISTA] === undefined)

  // 3. a linha
  const linha = tela.provedor.getChildren(daPessoa).find(i => i.label === 'do-projeto')
  checar('tela skills: clicar na linha usa a skill pelo nome', linha.command.command === 'oficina.skills.usar' && linha.command.arguments[0] === 'do-projeto')
  const ficha = linha.command.arguments[1]
  checar('tela skills (controle): o clique da vista é aceito', tela.cliqueValido('do-projeto', ficha) === true)
  checar('⛔ tela skills: chamada sem a ficha não vale (outra extensão, paleta, link)', tela.cliqueValido('do-projeto') === false && tela.cliqueValido('do-projeto', '') === false)
  checar('⛔ tela skills: ficha errada não vale', tela.cliqueValido('do-projeto', 'f'.repeat(32)) === false)
  checar('⛔ tela skills: com a ficha certa, nome que o agente não listou não vale', tela.cliqueValido('inventada', ficha) === false)
  checar('tela skills: cada vista tem a sua ficha', criarTelaDeSkills(vscode, { perfil: guardado(), pasta: guardado() }).cliqueValido('do-projeto', ficha) === false)
  checar('tela skills: a descrição aparece sem o sufixo', linha.description === 'Coisa desta pasta')
  checar('tela skills: a dica mostra o comando com o argumento', /^\/do-projeto <arquivo>/.test(linha.tooltip), linha.tooltip)
  checar('tela skills: a linha normal oferece favoritar e ocultar', linha.contextValue === 'skill naoFavorita visivel', linha.contextValue)
  checar('tela skills: cada skill tem endereço próprio para a decoração', linha.resourceUri.scheme === ESQUEMA && linha.resourceUri.path === '/do-projeto')
}

// 4. estrela, olho, arrastar
{
  const [daPessoa, doPrograma] = raiz()
  const dataviz = tela.provedor.getChildren(doPrograma).find(i => i.label === 'dataviz')
  const antes = redesenhos
  await tela.alternarFavorita(dataviz)
  checar('tela skills: favoritar grava no perfil', perfil.dados[S.CHAVE_DAS_PREFERENCIAS].favoritas.includes('dataviz'))
  checar('tela skills: favoritar redesenha a vista', redesenhos > antes)
  checar('tela skills: a favorita sobe para o topo do grupo de cima', nomesDe(raiz()[0]) === 'dataviz,minha-skill,do-projeto', nomesDe(raiz()[0]))
  const estrela = tela.provedor.getChildren(raiz()[0])[0]
  checar('tela skills: a favorita oferece tirar a estrela', estrela.contextValue === 'skill favorita visivel' && estrela.iconPath.id === 'star-full', estrela.contextValue)

  await tela.alternarOculta('minha-skill')
  const oculta = tela.provedor.getChildren(raiz()[0]).find(i => i.label === 'minha-skill')
  checar('tela skills: ocultar manda para o fim e escreve "oculta"', nomesDe(raiz()[0]).endsWith('minha-skill') && oculta.description === 'oculta', nomesDe(raiz()[0]))
  checar('tela skills: a oculta oferece mostrar de novo', oculta.contextValue === 'skill naoFavorita oculta', oculta.contextValue)

  // 5. a decoração
  const cinza = tela.decoracao.provideFileDecoration({ scheme: ESQUEMA, path: '/minha-skill' })
  checar('⛔ tela skills: a oculta fica cinza', !!cinza && cinza.color.id === 'disabledForeground')
  checar('tela skills (controle): a que não está oculta não fica cinza', tela.decoracao.provideFileDecoration({ scheme: ESQUEMA, path: '/do-projeto' }) === undefined)
  checar('tela skills (controle): endereço de outro esquema é ignorado', tela.decoracao.provideFileDecoration({ scheme: 'file', path: '/minha-skill' }) === undefined)

  // Arrastar do-projeto para antes de dataviz, passando pelo controlador de verdade.
  const [g] = raiz()
  const doProjeto = tela.provedor.getChildren(g).find(i => i.label === 'do-projeto')
  const alvo = tela.provedor.getChildren(g).find(i => i.label === 'dataviz')
  const t = transferencia()
  tela.arrastar.handleDrag([doProjeto], t)
  checar('tela skills: arrastar leva o nome no tipo da vista', !!t.get(MIME) && t.get(MIME).value.join() === 'do-projeto')
  await tela.arrastar.handleDrop(alvo, t)
  // A favorita continua no topo: arrastar muda a ordem DENTRO da faixa, e dataviz está numa faixa acima.
  checar('tela skills: arrastar para cima de uma favorita não rouba a estrela dela', nomesDe(raiz()[0]) === 'dataviz,do-projeto,minha-skill', nomesDe(raiz()[0]))
  await tela.alternarFavorita('dataviz')
  const t2 = transferencia()
  tela.arrastar.handleDrag([tela.provedor.getChildren(raiz()[0]).find(i => i.label === 'do-projeto')], t2)
  await tela.arrastar.handleDrop(tela.provedor.getChildren(raiz()[1]).find(i => i.label === 'clear'), t2)
  const ordem = perfil.dados[S.CHAVE_DAS_PREFERENCIAS].ordem
  checar('tela skills: a ordem arrastada fica gravada no perfil', ordem.indexOf('do-projeto') === ordem.indexOf('clear') - 1, ordem.join())
  const t3 = transferencia()
  await tela.arrastar.handleDrop(null, t3)
  checar('tela skills (controle): soltar sem nada arrastado não grava', perfil.dados[S.CHAVE_DAS_PREFERENCIAS].ordem.join() === ordem.join())

  await tela.recomecar()
  const p = perfil.dados[S.CHAVE_DAS_PREFERENCIAS]
  checar('tela skills: recomeçar limpa ordem, favoritas e ocultas', p.ordem.length === 0 && p.favoritas.length === 0 && p.ocultas.length === 0)
}

// 6. lista nova
await tela.receberLista([DO_SDK[1]])
checar('tela skills: lista nova SUBSTITUI a anterior', raiz().length === 1 && nomesDe(raiz()[0]) === 'minha-skill', raiz().map(i => i.label).join())

// A vista nasce com a lista guardada na pasta (segunda abertura do programa).
{
  const outra = criarTelaDeSkills(vscode, { perfil, pasta })
  checar('tela skills: reabrir o programa já mostra a última lista desta pasta', outra.quantas === 1)
  const vazia = criarTelaDeSkills(vscode, { perfil, pasta: guardado() })
  checar('tela skills (controle): outra pasta não herda a lista', vazia.quantas === 0)
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
