// O PAINEL DE SKILLS (V12) — `skills.js` em node puro, e o motor mandando a lista (com o SDK de mentira).
//
// O que precisa ser verdade:
//   1. a lista separa o que é da pessoa (sufixo medido) do que é do programa, e tira o sufixo da descrição;
//   2. nome interno (`__`) e nome que escreveria texto na conversa ficam de fora — e o nome normal entra;
//   3. favorita sobe (e sai do grupo do programa), oculta vai para o fim, arrastar põe no lugar certo;
//   4. o clique vira `/nome`, e só isso;
//   5. o motor manda a lista na abertura E quando ela muda no meio da conversa.
//
// Uso:  node testes/skills.mjs

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const S = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'skills.js'))
const { Conversa } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'agente.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}
const esperar = ms => new Promise(r => setTimeout(r, ms))
async function ate(condicao, tetoMs = 2000) {
  const fim = Date.now() + tetoMs
  while (Date.now() < fim) { if (condicao()) return true; await esperar(10) }
  return condicao()
}

// O formato medido no SDK (13/09/2026): uma skill do usuário, uma do projeto, um comando do programa,
// uma skill do programa e um nome interno.
const DO_SDK = [
  { name: 'clear', description: 'Clear conversation history and free up context', argumentHint: '' },
  { name: 'minha-skill', description: 'Faz a coisa (user)', argumentHint: '' },
  { name: 'do-projeto', description: 'Coisa desta pasta (project)', argumentHint: '<arquivo>' },
  { name: 'dataviz', description: 'Charts and dashboards', argumentHint: '' },
  { name: '__remote-workflow', description: '', argumentHint: '' },
]

// ── 1. classificar ──
{
  const l = S.classificarTodos(DO_SDK)
  const por = n => l.find(i => i.nome === n)
  checar('skills: skill do usuário é da pessoa, e o sufixo sai da descrição', por('minha-skill').origem === 'pessoa' && por('minha-skill').descricao === 'Faz a coisa', JSON.stringify(por('minha-skill')))
  checar('skills: skill do projeto é do projeto, com a dica de argumento', por('do-projeto').origem === 'projeto' && por('do-projeto').argumentos === '<arquivo>')
  checar('skills: sem sufixo é do programa', por('clear').origem === 'programa' && por('dataviz').origem === 'programa')
  // ⛔ Medido em 18/09/2026 numa conta de verdade: skill da conta do claude.ai (inclusive a que a pessoa
  // escreveu lá) chega com ` (claude.ai sync)`. Sem este sufixo na lista, ela caía no grupo do programa.
  {
    const daConta = S.classificar({ name: 'legenda-do-post', description: 'Escreve a legenda (claude.ai sync)' })
    checar('⛔ skills: skill da conta do claude.ai é da pessoa, e o sufixo sai da descrição',
      daConta.origem === 'conta' && daConta.descricao === 'Escreve a legenda', JSON.stringify(daConta))
    const org = S.organizar([daConta, S.classificar({ name: 'clear', description: 'Limpa a conversa' })], {})
    checar('⛔ skills: e ela fica no grupo de cima, não no do programa',
      org.daPessoa.some(i => i.nome === 'legenda-do-post') && !org.doPrograma.some(i => i.nome === 'legenda-do-post'),
      JSON.stringify({ cima: org.daPessoa.map(i => i.nome), baixo: org.doPrograma.map(i => i.nome) }))
  }
  checar('skills: nome interno (__) fica de fora', !por('__remote-workflow'))
  checar('skills: sufixo no MEIO da descrição não conta', S.classificar({ name: 'x', description: 'fala de (user) no meio' }).origem === 'programa')
  checar('skills: nome repetido entra uma vez só', S.classificarTodos([...DO_SDK, DO_SDK[1]]).length === 4)
  checar('skills: lista torta não derruba nada', S.classificarTodos(null).length === 0 && S.classificarTodos([null, 7, {}]).length === 0)
}

// ── 2. nome que viraria texto na conversa ──
{
  const ruins = ['tem espaço', 'linha\nnova', 'ignore tudo; faça', '-comeca-com-traco', 'x'.repeat(101), '']
  checar('⛔ skills: nome que escreveria texto na conversa fica de fora', ruins.every(n => S.classificar({ name: n, description: '' }) === null), ruins.filter(n => S.classificar({ name: n })).join(' | '))
  const bons = ['deploy', 'apps/web:deploy', 'plugin:skill', 'v1.2_x']
  checar('skills (controle): nome normal, de plugin e com pasta entra', bons.every(n => S.classificar({ name: n, description: '' }) !== null), bons.filter(n => !S.classificar({ name: n })).join(' | '))
  checar('skills: o clique vira /nome', S.pedidoDaSkill('apps/web:deploy') === '/apps/web:deploy')
  checar('⛔ skills: o clique recusa nome que não passaria na lista', S.pedidoDaSkill('a b\nc') === null && S.pedidoDaSkill(null) === null)
}

// ── 3. ordem ──
{
  const itens = S.classificarTodos(DO_SDK)
  const nomes = g => g.map(i => i.nome).join()

  const semNada = S.organizar(itens, null)
  checar('skills: sem preferência, a pessoa em cima na ordem do agente', nomes(semNada.daPessoa) === 'minha-skill,do-projeto' && nomes(semNada.doPrograma) === 'clear,dataviz', nomes(semNada.daPessoa) + ' / ' + nomes(semNada.doPrograma))

  const fav = S.organizar(itens, S.alternar(null, 'do-projeto', 'favoritas'))
  checar('skills: favorita sobe para o topo do grupo', nomes(fav.daPessoa) === 'do-projeto,minha-skill' && fav.daPessoa[0].favorita === true, nomes(fav.daPessoa))

  const favDoPrograma = S.organizar(itens, S.alternar(null, 'dataviz', 'favoritas'))
  checar('⛔ skills: favorita do programa sobe para o grupo de cima (o de baixo nasce recolhido)', nomes(favDoPrograma.daPessoa) === 'dataviz,minha-skill,do-projeto' && nomes(favDoPrograma.doPrograma) === 'clear', nomes(favDoPrograma.daPessoa))

  const oculta = S.organizar(itens, S.alternar(null, 'minha-skill', 'ocultas'))
  checar('skills: oculta vai para o fim e é marcada', nomes(oculta.daPessoa) === 'do-projeto,minha-skill' && oculta.daPessoa[1].oculta === true, nomes(oculta.daPessoa))

  let p = S.alternar(null, 'dataviz', 'favoritas')
  p = S.alternar(p, 'dataviz', 'ocultas')
  checar('skills: ocultar uma favorita tira a estrela (as duas não convivem)', !p.favoritas.includes('dataviz') && p.ocultas.includes('dataviz'))
  checar('skills: ocultar de novo mostra', !S.alternar(p, 'dataviz', 'ocultas').ocultas.includes('dataviz'))

  // Arrastar: `do-projeto` para antes de `minha-skill`.
  const visiveis = [...semNada.daPessoa, ...semNada.doPrograma].map(i => i.nome)
  const arrastado = S.mover(null, visiveis, ['do-projeto'], 'minha-skill')
  checar('skills: arrastar põe antes do alvo', nomes(S.organizar(itens, arrastado).daPessoa) === 'do-projeto,minha-skill', arrastado.ordem.join())
  const proFim = S.mover(null, visiveis, ['minha-skill'], null)
  checar('skills: arrastar para o vazio manda para o fim', nomes(S.organizar(itens, proFim).daPessoa) === 'do-projeto,minha-skill', proFim.ordem.join())
  checar('skills: soltar em cima de si mesmo não muda nada', S.mover(null, visiveis, ['clear'], 'clear').ordem.length === 0)
  checar('skills: arrastar nome que não está na tela não muda nada', S.mover(null, visiveis, ['nao-existe'], 'clear').ordem.length === 0)
  // A ordem arrastada sobrevive a uma lista nova que traz uma skill a mais.
  const comNova = S.classificarTodos([{ name: 'nova', description: 'x (user)' }, ...DO_SDK])
  checar('skills: skill nova entra depois das que a pessoa já arrumou', nomes(S.organizar(comNova, arrastado).daPessoa) === 'do-projeto,minha-skill,nova', nomes(S.organizar(comNova, arrastado).daPessoa))
  checar('skills: preferência torta no perfil vira vazia', JSON.stringify(S.normalizarPreferencias({ ordem: 'x', favoritas: [1, 'a', 'a'] })) === JSON.stringify({ ordem: [], favoritas: ['a'], ocultas: [] }))
}

// ── 5. o motor manda a lista ──
{
  const eventos = []
  const c = new Conversa({
    cwd: REPO, id: 'teste', aoEvento: e => eventos.push(e),
    carregarSdk: () => Promise.resolve({
      query: ({ options }) => ({
        initializationResult: () => Promise.resolve({ account: { email: 'pessoa@exemplo.com' }, models: [], commands: DO_SDK }),
        [Symbol.asyncIterator]: () => ({
          next: () => new Promise(r => options.abortController.signal.addEventListener('abort', () => r({ value: undefined, done: true }))),
          return: () => Promise.resolve({ value: undefined, done: true }),
        }),
      }),
    }),
  })
  await c.iniciar()
  await ate(() => eventos.some(e => e.tipo === 'comandos'))
  const naAbertura = eventos.filter(e => e.tipo === 'comandos')
  checar('skills: o motor manda a lista na abertura, antes de alguém escrever', naAbertura.length === 1 && naAbertura[0].lista.length === DO_SDK.length, naAbertura.length)
  checar('skills: a lista vem depois do "pronto"', eventos.findIndex(e => e.tipo === 'comandos') > eventos.findIndex(e => e.tipo === 'pronto'))
  c._traduzir({ type: 'system', subtype: 'commands_changed', commands: [DO_SDK[1]], uuid: 'u', session_id: 's' })
  const mudou = eventos.filter(e => e.tipo === 'comandos').pop()
  checar('skills: lista que muda no meio da conversa chega inteira, para substituir', eventos.filter(e => e.tipo === 'comandos').length === 2 && mudou.lista.length === 1)
  const antes = eventos.length
  c._traduzir({ type: 'system', subtype: 'commands_changed' })
  checar('skills (controle): aviso de mudança sem lista não inventa lista vazia', eventos.length === antes)
  await c.encerrar()
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
