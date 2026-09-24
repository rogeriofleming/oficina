// CONFERIR ANTES DO BUILD — o que tem de estar certo para o checkpoint merecer ser gasto.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE. Em 24/09/2026 foram gastos TRES builds da OFICINA onde a ordem
// do dono tinha sido UM. As tres causas foram diferentes e nenhuma precisava de compilacao para
// ser vista:
//
//   1. um `.patch` editado como TEXTO (a contagem do bloco `@@` deixou de bater) — o build morreu
//      dizendo "um patch nosso nao aplicou na tag", mensagem que acusa o upstream;
//   2. um seletor CSS terminado em `:not(.codicon)` que alcancava so metade dos icones;
//   3. uma constante de largura medida quando o icone tinha outro tamanho.
//
// As tres sao a mesma: UM NUMERO MEDIDO E FILHO DE UMA CONDICAO. Mudou a condicao, os filhos dela
// envelhecem em silencio, porque numero solto nao tem como avisar.
//
// Este script roda o que e barato e REPROVA antes de qualquer compilacao. Ele nao substitui o
// build: o build prova a tela, o executavel e o instalador. Ele responde outra pergunta —
// "este checkpoint merece ser gasto?".
//
// Uso:  node scripts/conferir_antes_do_build.mjs
// Saida: codigo 0 se pode compilar, 1 se nao.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BUILD = process.env.OFICINA_BUILD || path.join(process.env.SystemDrive || 'C:', 'oficina-build')
const CLONE = path.join(BUILD, 'vscode')

/**
 * A IMPRESSAO DIGITAL DO CLONE — para este script provar que nao encostou nele.
 *
 * ⚠️ ISTO EXISTE PORQUE A PRIMEIRA VERSAO DESTE CONFERIDOR QUEBROU O CLONE. Ela rodava
 * `git reset --hard` ali dentro, e isso nao desfez so os patches: desfez o `product.json` mesclado
 * e a logo, que sao etapas do build. O empacotamento seguinte morreu com "Source file
 * Code - OSS.exe does not exist".
 *
 * Uma ferramenta feita para proteger nao pode ser a que danifica. Entao ela mede o clone ANTES e
 * DEPOIS e reprova se alguma coisa mudou — inclusive por culpa dela. O `product.json` entra na
 * conta de proposito: foi exatamente ele que se perdeu, e ele nao aparece em `git status` como
 * modificado quando o reset o "restaurou" para o upstream.
 */
function digitalDoClone() {
  if (!fs.existsSync(CLONE)) return 'sem clone'
  const partes = []
  try {
    const st = spawnSync('git', ['-C', CLONE, 'status', '--porcelain'], { encoding: 'utf8' })
    partes.push('status:' + (st.stdout || '').trim().length)
  } catch { partes.push('status:?') }
  for (const rel of ['product.json', 'build/win32/code.iss']) {
    try {
      const b = fs.readFileSync(path.join(CLONE, rel))
      partes.push(rel + ':' + b.length)
    } catch { partes.push(rel + ':ausente') }
  }
  try {
    const d = JSON.parse(fs.readFileSync(path.join(CLONE, 'product.json'), 'utf8'))
    partes.push('nome:' + d.nameLong)
  } catch { partes.push('nome:?') }
  return partes.join(' | ')
}

const DIGITAL_ANTES = digitalDoClone()

const res = []
const checar = (nome, ok, detalhe = '') => {
  res.push({ nome, ok: !!ok, detalhe })
  console.log(`${ok ? '  OK  ' : ' FALHA'}  ${nome}${detalhe ? '  (' + detalhe + ')' : ''}`)
}

// ── 1. TODO PATCH APLICA, EM SEQUENCIA, NUM WORKTREE DESCARTAVEL ────────────
//
// ⚠️ NAO SE TOCA NO CLONE DE TRABALHO. A primeira versao deste script conferia dentro do proprio
// clone, com `git reset --hard` antes e depois — e isso DESTRUIU o estado que o build deixa la.
// O `reset` nao desfaz so os patches: desfaz tambem o `product.json` mesclado e a logo, que sao
// etapas do build (3, 3c). O empacotamento seguinte morreu com "Source file Code - OSS.exe does
// not exist", porque o clone tinha voltado a ser o upstream cru.
//
// Custou uma restauracao na mao (`aplicar_produto.mjs` + `aplicar_icones.mjs`) e quase custou um
// build inteiro. A licao e a mesma da regra da casa sobre ferramenta que reescreve em massa:
// TESTAR NUM CLONE DESCARTAVEL, nunca no original.
//
// `git worktree` da uma arvore separada a partir do mesmo repositorio, sem copiar o historico e
// sem encostar na arvore principal. Ela e criada no temporario e removida no fim.
{
  const daPasta = (...sub) => {
    const d = path.join(REPO, ...sub)
    return fs.existsSync(d)
      ? fs.readdirSync(d).filter(f => f.endsWith('.patch')).sort().map(f => path.join(d, f))
      : []
  }
  /*
    ⚠️ A ORDEM E A DO BUILD, E ELA COMECA PELOS DE VIABILIDADE.

    O script de build aplica `patches/viabilidade/*.patch` ANTES de `patches/*.patch`. A primeira
    versao deste conferidor pulou essa pasta e reprovou o patch 0008, que toca o mesmo arquivo de
    instalador que um de viabilidade prepara — acusou um patch CORRETO, por conferir numa ordem
    que o build nunca usa. Conferidor que acusa inocente treina quem le a ignorar o vermelho.
  */
  const patches = [...daPasta('patches', 'viabilidade'), ...daPasta('patches')]

  const arvore = path.join(os.tmpdir(), 'oficina-confere-patches-' + process.pid)
  const gitClone = (...args) => spawnSync('git', ['-C', CLONE, ...args], { encoding: 'utf8' })
  const gitArvore = (...args) => spawnSync('git', ['-C', arvore, ...args], { encoding: 'utf8' })

  if (!fs.existsSync(CLONE)) {
    checar('o clone do nucleo existe (sem ele nao da para conferir os patches)', false, CLONE)
  } else if (!patches.length) {
    checar('ha patches para conferir', false, 'nenhum .patch em patches/')
  } else {
    // `--detach` para nao criar ramo; `-f` porque a arvore pode ter sobrado de uma corrida morta.
    const criou = gitClone('worktree', 'add', '-f', '--detach', arvore, 'HEAD')
    if (criou.status !== 0) {
      checar('a arvore descartavel para conferir os patches foi criada', false,
        (criou.stderr || '').trim().slice(0, 160))
    } else try {
      const naoAplicaram = []
      for (const arquivo of patches) {
        const check = gitArvore('apply', '--check', arquivo)
        if (check.status !== 0) {
          naoAplicaram.push(`${path.basename(arquivo)}: ${(check.stderr || '').trim().slice(0, 160)}`)
          break // do primeiro que falha em diante, o resto nao significa nada
        }
        gitArvore('apply', '--index', arquivo)
      }
      checar(`os ${patches.length} patches aplicam em sequencia (viabilidade primeiro, como o build)`,
        naoAplicaram.length === 0, naoAplicaram.join(' | '))

      /*
        ⚠️ O TAMANHO DO ICONE TEM DE SER O MESMO NUMERO NO TYPESCRIPT E NO CSS.

        Este criterio existe porque esta divergencia EXATA custou dois builds em 24/09/2026:

          - o `iconSize` das opcoes e o que a barra usa para CALCULAR a largura que vai ocupar;
          - o CSS e o que DESENHA o icone na tela;
          - e os dois sao a mesma decisao escrita em dois arquivos que nao se leem.

        Subir so um faz a conta e o desenho discordarem: ou os icones transbordam para a gaveta de
        "Additional Views", ou sobra buraco no meio da barra. Foi o que aconteceu duas vezes —
        primeiro o CSS subiu so para icone de IMAGEM (o seletor termina em `:not(.codicon)`, e os
        de fonte ficaram para tras), depois a largura reservada por icone continuou no valor medido
        com o tamanho ANTIGO.

        A leitura e feita nos ARQUIVOS JA COM TODOS OS PATCHES APLICADOS (por isso aqui, dentro
        desta arvore), e nao nos `.patch` soltos: patch posterior sobrescreve o anterior, entao
        somar os `+` de todos daria o conjunto errado. O que vale e o estado final.
      */
      if (naoAplicaram.length === 0) {
        const ler = rel => { try { return fs.readFileSync(path.join(arvore, rel), 'utf8') } catch { return '' } }
        const ts = ler('src/vs/workbench/browser/parts/titlebar/titlebarPart.ts')
        const css = ler('src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css')

        const numeros = new Set()
        const anotar = (rotulo, valor) => { if (valor != null) numeros.add(`${rotulo}=${valor}`) }
        const pegar = (texto, re) => { const m = re.exec(texto); return m ? m[1] : null }

        anotar('TAMANHO(ts)', pegar(ts, /TAMANHO_DO_ICONE_NA_BARRA_DE_TITULO\s*=\s*(\d+)/))
        // `iconSize` pode ser literal ou a constante; quando e a constante, ja esta coberto acima.
        const iconSize = pegar(ts, /iconSize:\s*(\d+)/)
        if (iconSize) anotar('iconSize(ts)', iconSize)

        // No CSS, so as regras da barra de icones da barra de titulo.
        const trechoDaBarra = css.split('titlebar-activity-container').slice(1).join(' ')
        for (const m of trechoDaBarra.matchAll(/(?:width|font-size|background-size):\s*(\d+)px/g)) {
          // 3px e a folga lateral do item, nao o tamanho do icone.
          if (m[1] !== '3') numeros.add(`css=${m[1]}`)
        }

        const valores = [...numeros].map(x => x.split('=')[1])
        const distintos = [...new Set(valores)]
        checar('o tamanho do icone e o MESMO numero no TypeScript e no CSS (o erro que custou 2 builds)',
          valores.length >= 2 && distintos.length === 1,
          `${[...numeros].join(' · ')}`)
      }

    } finally {
      /*
        ⚠️ A ARVORE SAI NO `finally`, e isso nao e zelo — e a licao do dano que este script ja
        causou. Qualquer excecao no meio (patch estranho, disco cheio, teclado) deixaria uma arvore
        pendurada no `.git` do clone, e a proxima corrida acharia lixo da anterior. `prune` limpa o
        registro mesmo se a pasta ja tiver sumido por outro caminho.
      */
      gitClone('worktree', 'remove', '--force', arvore)
      try { fs.rmSync(arvore, { recursive: true, force: true }) } catch { }
      gitClone('worktree', 'prune')
    }
  }
}

// ── 2. TODO PATCH TEM O .md DO PORQUE ────────────────────────────────────────
// O mesmo criterio da regressao, adiantado para antes do build: um patch sem explicacao e divida
// tecnica escondida, e descobri-la depois de compilar nao adianta nada.
{
  const dirs = [path.join(REPO, 'patches'), path.join(REPO, 'patches', 'viabilidade')]
  const patches = dirs.flatMap(d =>
    fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.patch')).map(f => path.join(d, f)) : [])
  const semDoc = patches.filter(f => !fs.existsSync(f.replace(/\.patch$/, '.md')))
  checar('todo patch tem o .md do porque ao lado', semDoc.length === 0,
    semDoc.map(f => path.basename(f)).join(', '))
}

// ── 3. OS PATCHES VIAJAM SEM CONVERSAO DE FIM DE LINHA ───────────────────────
// Patch em CRLF nao aplica num clone novo. Vale conferir aqui porque um patch recem-criado e
// justamente o que pode ter nascido fora da regra do .gitattributes.
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
    if (!/text:\s*unset/.test(saida)) desprotegidos.push(path.basename(p))
  }
  checar('os patches estao protegidos contra conversao de fim de linha',
    patches.length > 0 && desprotegidos.length === 0, desprotegidos.join(', '))
}

// ── 4. O CICLO RAPIDO INTEIRO ────────────────────────────────────────────────
// Tudo que se prova sem abrir janela. Se isto esta vermelho, compilar so adia a noticia.
{
  const r = spawnSync(process.execPath, [path.join(REPO, 'testes', 'rapidos.mjs')],
    { encoding: 'utf8', timeout: 20 * 60 * 1000 })
  const linha = (r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{')).pop()
  let placar = null
  try { placar = linha ? JSON.parse(linha) : null } catch { }
  checar('o ciclo rapido esta verde', !!placar && placar.passou === true,
    placar ? `${placar.suites} suites, falhas: ${(placar.falhas || []).join(' | ') || 'nenhuma'}`
      : 'nao li o placar do ciclo rapido')
}

// ── 5. O LEMBRETE QUE NENHUM SCRIPT CONSEGUE VERIFICAR ───────────────────────
//
// ⚠️ ISTO NAO E CRITERIO, E PERGUNTA — e esta aqui de proposito. O que causou os tres builds de
// 24/09/2026 nao foi nada que um script pegasse: foi eu nao ter perguntado o que a minha propria
// mudanca invalidava. Um script confere o que sabe procurar; esta pergunta e para o que nao.
console.log(`
  ───────────────────────────────────────────────────────────────────────────
  ANTES DE COMPILAR, RESPONDA (a leitura resolve; o build so cobra caro):

    • Mexi em algum TAMANHO, contagem ou limite?
      -> que numeros foram MEDIDOS com o valor antigo e continuam escritos por ai?

    • Mexi em algum SELETOR ou filtro?
      -> ele alcanca quem eu acho que alcanca? li ele ate o fim?

    • Mexi em algum COMPORTAMENTO que um teste ja descrevia?
      -> ha criterio gravando o jeito ANTIGO como esperado? (ele vai ficar vermelho, e o
         vermelho vai parecer regressao sendo acerto)

    • Algum texto do produto (guia, ATALHOS, boas-vindas) afirma o que acabou de mudar?

  Se a frase "o build vai me dizer" apareceu no seu raciocinio: pare e leia de novo.
  ───────────────────────────────────────────────────────────────────────────
`)

/*
  ⚠️ O ULTIMO CRITERIO E SOBRE ESTE PROPRIO SCRIPT.

  Se o clone saiu daqui diferente de como entrou, a ferramenta de proteger virou a ferramenta de
  quebrar — e quem for compilar em seguida vai pagar por isso. Melhor reprovar aqui, com a
  instrucao de conserto na mao, do que descobrir no empacotamento.
*/
{
  const depois = digitalDoClone()
  checar('o clone saiu EXATAMENTE como entrou (esta ferramenta nao pode quebrar o que protege)',
    depois === DIGITAL_ANTES,
    depois === DIGITAL_ANTES ? '' :
      `antes [${DIGITAL_ANTES}] · depois [${depois}] — restaure com: node scripts/aplicar_produto.mjs <clone> . <camada> && node scripts/aplicar_icones.mjs <clone>`)
}

const passou = res.every(r => r.ok)
console.log(JSON.stringify({ passou, falhas: res.filter(r => !r.ok).map(r => r.nome) }))
console.log(passou
  ? '\nPODE COMPILAR.'
  : '\nNAO COMPILE: conserte o que esta vermelho acima. Um checkpoint gasto nao volta.')
process.exit(passou ? 0 : 1)
