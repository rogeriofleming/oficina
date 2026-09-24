// QUAL CONVERSA ESTÁ ABERTA (V20, t201) — em node puro, com registros de mentira e os de verdade.
//
// O que precisa ser verdade:
//   1. escolhe a sessão da PASTA ABERTA, e não "a mais recente da máquina";
//   2. sem pasta aberta devolve null — mostrar o gasto de outro projeto é pior que não mostrar;
//   3. sessão de processo MORTO é descartada (medido: há registros velhos na pasta);
//   4. sessão que não nasceu do editor é descartada;
//   5. entre as candidatas, vence a de registro mais novo;
//   6. registro ilegível, sem id, ou arquivo `.key` não derrubam a leitura;
//   7. a pasta compara sem ligar para maiúscula e para o tipo de barra;
//   8. diz se o nome foi ESCOLHIDO ou só derivado da pasta;
//   9. nos registros REAIS desta máquina, a escolha é uma sessão viva desta pasta.
//
// Uso:  node testes/sessao_ativa.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const S = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'sessaoAtiva.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

// ⚠️ MONTADO EM EXECUÇÃO, e não escrito como literal: um caminho absoluto escrito no arquivo é
// exatamente o que o varredor de vazamento procura — e com razão, porque num teste de caminhos
// é fácil deixar cair o da própria máquina sem perceber.
const PASTA = path.join(os.tmpdir(), 'oficina-projeto-de-teste')
const OUTRA = path.join(os.tmpdir(), 'oficina-outro-projeto')
const reg = (o) => ({ pid: 100, sessionId: 'id-' + (o.n || 1), cwd: PASTA, entrypoint: 'claude-vscode', updatedAt: 1000, name: 'n', nameSource: 'derived', status: 'idle', ...o })
const vivoSempre = () => true

// ── 1, 5 ──
{
  const sessoes = [
    reg({ n: 'a', updatedAt: 10 }),
    reg({ n: 'b', updatedAt: 99 }),
    reg({ n: 'c', updatedAt: 50 }),
    reg({ n: 'outra', cwd: OUTRA, updatedAt: 9999 }),
  ]
  const r = S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre })
  checar('1+5. escolhe a da pasta aberta, e entre elas a de registro mais novo',
    r && r.id === 'id-b', JSON.stringify(r))
}

// ── 2 ──
checar('2. sem pasta aberta devolve null',
  S.sessaoDaPasta(null, { sessoes: [reg({})], vivo: vivoSempre }) === null &&
  S.sessaoDaPasta('', { sessoes: [reg({})], vivo: vivoSempre }) === null)

// ── 3 ──
{
  const sessoes = [reg({ n: 'morta', pid: 1, updatedAt: 9999 }), reg({ n: 'viva', pid: 2, updatedAt: 1 })]
  const r = S.sessaoDaPasta(PASTA, { sessoes, vivo: pid => pid === 2 })
  checar('3. sessão de processo morto é descartada, mesmo sendo a mais nova',
    r && r.id === 'id-viva', JSON.stringify(r))
}

// ── 4 ──
{
  const sessoes = [reg({ n: 'terminal', entrypoint: 'cli', updatedAt: 9999 }), reg({ n: 'editor', updatedAt: 1 })]
  const r = S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre })
  checar('4. sessão que não nasceu do editor é descartada',
    r && r.id === 'id-editor', JSON.stringify(r))
}

// ── 6 ──
{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sessoes-'))
  fs.writeFileSync(path.join(pasta, 'a.json'), '{ nao é json')
  fs.writeFileSync(path.join(pasta, 'b.json'), JSON.stringify({ pid: 5, cwd: PASTA, entrypoint: 'claude-vscode' })) // sem sessionId
  fs.writeFileSync(path.join(pasta, 'c.key'), 'isto nao e registro de sessao')
  fs.writeFileSync(path.join(pasta, 'd.json'), JSON.stringify(reg({ n: 'boa', pid: 7 })))
  const todas = S.lerTodas(pasta)
  const r = S.sessaoDaPasta(PASTA, { pasta, vivo: vivoSempre })
  checar('6. ilegível, sem id e `.key` não derrubam a leitura',
    todas.length === 1 && r && r.id === 'id-boa', JSON.stringify({ lidas: todas.length, r }))
  checar('6b. pasta que não existe devolve lista vazia, sem lançar',
    S.lerTodas(path.join(pasta, 'nao-existe')).length === 0)
  fs.rmSync(pasta, { recursive: true, force: true })
}

// ── 7 ──
// ⚠️ `String.raw` de propósito: num literal comum, '\C' é só 'C' — a barra some sem avisar, e a
// primeira versão deste teste comparava um caminho quebrado e acusava a função, que estava certa.
checar('7. a pasta compara sem ligar para maiúscula nem para o tipo de barra',
  S.mesmaPasta(String.raw`d:\alguma\Pasta Qualquer`, 'D:/alguma/pasta qualquer/') === true &&
  S.mesmaPasta('d:/a', 'd:/b') === false &&
  S.mesmaPasta(null, 'd:/a') === false)

// ── 8 ──
{
  const derivado = S.sessaoDaPasta(PASTA, { sessoes: [reg({ nameSource: 'derived', name: 'pasta-1f' })], vivo: vivoSempre })
  const escolhido = S.sessaoDaPasta(PASTA, { sessoes: [reg({ nameSource: 'user', name: 'a leva de 21/09/2026' })], vivo: vivoSempre })
  checar('8. diz se o nome foi escolhido ou só derivado da pasta',
    derivado.nomeEscolhido === false && escolhido.nomeEscolhido === true && escolhido.nome === 'a leva de 21/09/2026',
    JSON.stringify({ derivado, escolhido }))
}

// ── 9. os registros REAIS desta máquina ──
{
  const reais = S.lerTodas()
  if (reais.length) {
    const daPasta = reais.filter(s => S.mesmaPasta(s.cwd, REPO) || S.mesmaPasta(s.cwd, path.resolve(REPO, '../..')))
    console.log(`       (registros reais nesta máquina: ${reais.length}; desta árvore: ${daPasta.length})`)
    // ⚠️ A PRIMEIRA VERSÃO DESTE CRITÉRIO NÃO PODIA FALHAR: aceitava `null` OU acerto, e nunca
    // conferia liveness — apesar do título dizer "viva". Era o único critério sobre dados reais, e
    // foi por baixo dele que passaram os defeitos de escolha. Agora ele EXIGE resultado quando há
    // candidata viva, e confere o que promete.
    const alvo = reais[0].cwd
    const vivasDaPasta = reais.filter(x =>
      S.ENTRADAS_DO_EDITOR.includes(x.entrypoint) && S.mesmaPasta(x.cwd, alvo) && S.processoVivo(x.pid))
    const escolhida = S.sessaoDaPasta(alvo)

    /*
      ⚠️ O ESPERADO É CALCULADO AQUI, PELA REGRA DECLARADA — e não copiado do que a função devolveu.
      A regra (desde 21/09/2026, depois de a anterior escolher a conversa errada nesta máquina):
      quem está trabalhando; depois quem escreveu por último no arquivo da conversa; depois o
      registro; empate em qualquer degrau cai para o degrau seguinte, e empate no último devolve
      `null`.
    */
    const semEmpate = (lista, chave) => {
      const valores = lista.map(chave)
      const maior = Math.max(-1, ...valores.map(v => (typeof v === 'number' ? v : -1)))
      const noTopo = lista.filter(x => (typeof chave(x) === 'number' ? chave(x) : -1) === maior)
      return maior >= 0 && noTopo.length === 1 ? noTopo[0] : null
    }
    const trabalhando = vivasDaPasta.filter(x => x.status === 'busy')
    const disputa = trabalhando.length === 1 ? trabalhando : vivasDaPasta
    const esperada = disputa.length === 1 ? disputa[0]
      : (semEmpate(disputa, x => S.escritaDoTranscrito(x.sessionId))
        || semEmpate(disputa, x => (typeof x.updatedAt === 'number' ? x.updatedAt : 0)))

    const porque = trabalhando.length === 1 ? 'está trabalhando'
      : (disputa.length === 1 ? 'única candidata'
        : (semEmpate(disputa, x => S.escritaDoTranscrito(x.sessionId)) ? 'escreveu por último no arquivo da conversa' : 'registro mais novo'))
    console.log(`       (vivas nesta pasta: ${vivasDaPasta.length}; escolhida por: ${vivasDaPasta.length ? porque : '-'})`)

    if (!vivasDaPasta.length) {
      checar('9. sem candidata viva nesta pasta, devolve null', escolhida === null, JSON.stringify(escolhida))
    } else if (!esperada) {
      checar('9. com empate em todos os critérios, devolve null em vez de chutar',
        escolhida === null, JSON.stringify(escolhida))
    } else {
      checar('9. com candidata viva, escolhe a que a regra manda — e ela é da pasta pedida',
        !!escolhida && S.mesmaPasta(escolhida.pasta, alvo) && escolhida.id === esperada.sessionId
        && S.processoVivo(esperada.pid),
        JSON.stringify({ escolhida: escolhida && escolhida.id, esperada: esperada.sessionId, porque }))
    }
  } else {
    checar('9. nos registros reais, a escolha é uma sessão viva da pasta pedida', true, 'nenhuma sessão registrada agora')
  }
}

// ── 10. empate: o comentário prometia `null`, o código escolhia a primeira ──
{
  const sessoes = [reg({ n: 'a', updatedAt: 500 }), reg({ n: 'b', updatedAt: 500 })]
  checar('10a. empate no registro mais novo devolve null (e não a primeira da lista)',
    S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre }) === null,
    JSON.stringify(S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre })))

  const semQuando = [reg({ n: 'a', updatedAt: undefined }), reg({ n: 'b', updatedAt: undefined })]
  checar('10b. `updatedAt` ausente em todas também é empate, e devolve null',
    S.sessaoDaPasta(PASTA, { sessoes: semQuando, vivo: vivoSempre }) === null)

  const desempatado = [reg({ n: 'a', updatedAt: 500 }), reg({ n: 'b', updatedAt: 501 })]
  checar('10c. e um único milissegundo de diferença ainda desempata',
    (S.sessaoDaPasta(PASTA, { sessoes: desempatado, vivo: vivoSempre }) || {}).id === 'id-b')
}

// ── 11. `nameSource` ausente não pode virar "nome escolhido" ──
{
  const ausente = S.sessaoDaPasta(PASTA, { sessoes: [reg({ nameSource: undefined, name: 'pasta-xyz' })], vivo: vivoSempre })
  const desconhecido = S.sessaoDaPasta(PASTA, { sessoes: [reg({ nameSource: 'algo-novo', name: 'pasta-xyz' })], vivo: vivoSempre })
  checar('11. nome sem origem conhecida NÃO conta como escolhido (falha para o lado de não mostrar)',
    ausente.nomeEscolhido === false && desconhecido.nomeEscolhido === false,
    JSON.stringify({ ausente: ausente.nomeEscolhido, desconhecido: desconhecido.nomeEscolhido }))
  checar('11b. e a lista do que conta como escolhido é explícita',
    Array.isArray(S.NOMES_ESCOLHIDOS) && S.NOMES_ESCOLHIDOS.includes('user'), JSON.stringify(S.NOMES_ESCOLHIDOS))
}

// ── 12 a 14. QUAL CONVERSA, COM VÁRIAS ABAS VIVAS NA MESMA PASTA ──
//
// ⚠️ ACHADO NUMA CONFERÊNCIA INDEPENDENTE DO BUILD 1 ("o nome na barra não era o da conversa que eu
// estava usando") e medido depois nesta máquina, com sete sessões vivas — todas na mesma pasta e,
// o que desmontou a primeira hipótese, todas FILHAS DO MESMO processo do editor: não são janelas
// diferentes, são abas da mesma janela.
//
//     pid    sessao    status   registro   transcrito
//     27428  2b9ee332  idle      19,0 min    19,0 min   <- a que o `updatedAt` escolhia
//     18928  53990c45  busy      22,1 min     0,0 min   <- a que estava em uso naquele instante
//
// O registro daquela sessão não era reescrito havia 22 minutos ENQUANTO ela trabalhava. Por isso a
// ordem passou a ser: quem está trabalhando, depois quem escreveu por último no arquivo da
// conversa, e só então o `updatedAt`.
{
  // 12. o registro mente, o `status` não.
  const sessoes = [
    reg({ n: 'parada', updatedAt: 9000, status: 'idle' }),
    reg({ n: 'trabalhando', updatedAt: 1000, status: 'busy' }),
  ]
  const r = S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre, escritaEm: () => null })
  checar('12. quem está trabalhando ganha de quem tem o registro mais novo',
    r && r.id === 'id-trabalhando', JSON.stringify(r && r.id))

  // e duas trabalhando ao mesmo tempo não é desempate: volta para os outros critérios
  const duasBusy = [
    reg({ n: 'x', updatedAt: 1000, status: 'busy' }),
    reg({ n: 'y', updatedAt: 9000, status: 'busy' }),
  ]
  const r2 = S.sessaoDaPasta(PASTA, { sessoes: duasBusy, vivo: vivoSempre, escritaEm: () => null })
  checar('12b. duas trabalhando: não vira desempate, e o critério seguinte decide',
    r2 && r2.id === 'id-y', JSON.stringify(r2 && r2.id))
}

{
  // 13. sem ninguém trabalhando, quem escreveu por último no arquivo da conversa ganha.
  const sessoes = [
    reg({ n: 'velha', updatedAt: 9000 }),
    reg({ n: 'escrevendo', updatedAt: 1000 }),
  ]
  const escritaEm = id => (id === 'id-escrevendo' ? 50_000 : 10_000)
  const r = S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre, escritaEm })
  checar('13. o arquivo da conversa ganha do registro (é ele que é escrito a cada turno)',
    r && r.id === 'id-escrevendo', JSON.stringify(r && r.id))

  // 13b. sem transcrito nenhum, o comportamento de antes continua valendo
  const r2 = S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre, escritaEm: () => null })
  checar('13b. sem transcrito, cai no registro (o que valia antes continua valendo)',
    r2 && r2.id === 'id-velha', JSON.stringify(r2 && r2.id))

  // 13c. empate no transcrito não inventa vencedor
  const r3 = S.sessaoDaPasta(PASTA, { sessoes, vivo: vivoSempre, escritaEm: () => 50_000 })
  checar('13c. empate no arquivo da conversa cai para o registro, e não escolhe a primeira da lista',
    r3 && r3.id === 'id-velha', JSON.stringify(r3 && r3.id))
}

{
  // 14. E a peça que lê o arquivo de verdade existe e não lança com id inventado.
  checar('14. a leitura do arquivo da conversa é real e não lança com id que não existe',
    S.escritaDoTranscrito('00000000-0000-0000-0000-000000000000') === null
    && S.escritaDoTranscrito(null) === null && S.escritaDoTranscrito('lixo') === null)
}

const falhas = resultados.filter(r => !r.ok)
console.log(`
  ${resultados.length - falhas.length}/${resultados.length} OK`)
if (falhas.length) console.log('  FALHARAM: ' + falhas.map(f => f.nome).join(', '))
// ⚠️ O PLACAR EM JSON, na última linha: é por ele que a bateria (`rapidos.mjs`) e a regressão leem
// o resultado e conferem o piso. Sem esta linha, a suíte roda, passa, e a bateria a marca como
// "sem placar" — ou seja, não protege nada. Foi o que aconteceu com as seis suítes da V20.
console.log(JSON.stringify({ passou: falhas.length === 0, total: resultados.length, falhas: falhas.map(f => f.nome) }))
if (falhas.length) process.exit(1)
