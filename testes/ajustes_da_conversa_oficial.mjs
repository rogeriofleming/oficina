// OS AJUSTES NA CONVERSA DA EXTENSÃO OFICIAL (V20, t194 e t200) — em node puro, com disco de mentira.
//
// O que precisa ser verdade:
//   1. aplica o bloco marcado no CSS dela;
//   2. é IDEMPOTENTE: aplicar duas vezes não duplica nem reescreve;
//   3. reaplicar depois de uma versão anterior do bloco TROCA, não empilha;
//   4. desfazer devolve o arquivo ao que era;
//   5. arquivo somente-leitura, ausente ou pacote de outro formato não derrubam nada;
//   6. os seletores são ancorados em TEXTO (title/aria-label), nunca em classe com hash;
//   7. o CSS não usa `!important` em nada além do que precisa esconder/afastar;
//   8. o alvo é a extensão oficial, e nenhuma outra.
//
// Uso:  node testes/ajustes_da_conversa_oficial.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const A = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'ajustesDaConversaOficial.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const ORIGINAL = '.algumaCoisa_aBcDeF { color: red }\n'

/** Um "disco" de mentira: um arquivo só, na memória. */
function disco({ conteudo = ORIGINAL, podeEscrever = true, podeLer = true } = {}) {
  const estado = { conteudo, escritas: 0 }
  return {
    estado,
    ler: () => { if (!podeLer) throw new Error('sem permissao de leitura'); return estado.conteudo },
    escrever: (_alvo, texto) => {
      if (!podeEscrever) throw new Error('somente leitura')
      estado.conteudo = texto; estado.escritas++
    },
  }
}

/** O editor de mentira: `temExtensao` diz se a oficial está instalada. */
const editor = (temExtensao = true, pasta = REPO) => ({
  extensions: { getExtension: id => (temExtensao && id === A.EXTENSAO ? { extensionPath: pasta } : undefined) },
})

// ⚠️ `arquivoDeEstilo` confere o arquivo NO DISCO de verdade. Para o teste, apontamos a "pasta da
// extensão" para uma que tenha `webview/index.css`; como não existe, o caminho esperado é 'semAlvo'
// — e é justamente o caso 5. Os casos 1 a 4 usam as funções puras, que não tocam em disco.

// ── 1, 2, 3, 4 (funções puras) ──
{
  const bloco = t => t.replace(/\s+$/, '') + '\n\n' + A.MARCA_INICIO + '\n' + A.CSS.trim() + '\n' + A.MARCA_FIM + '\n'
  const comBloco = bloco(ORIGINAL)
  checar('1. o bloco entra marcado, com início e fim',
    comBloco.includes(A.MARCA_INICIO) && comBloco.includes(A.MARCA_FIM) && A.jaAplicado(comBloco))
  checar('2. aplicar de novo reconhece que já está lá', A.jaAplicado(comBloco) === true)

  const versaoAntiga = ORIGINAL + '\n' + A.MARCA_INICIO + '\nregra { velha: 1 }\n' + A.MARCA_FIM + '\n'
  const limpo = A.semOBlocoAntigo(versaoAntiga)
  checar('3. um bloco ANTIGO é retirado inteiro antes de escrever o novo',
    !limpo.includes('velha') && !limpo.includes(A.MARCA_INICIO) && limpo.includes('.algumaCoisa_aBcDeF'), limpo)
  checar('4. tirar o bloco devolve o arquivo ao que era',
    A.semOBlocoAntigo(comBloco).replace(/\s+$/, '') === ORIGINAL.replace(/\s+$/, ''),
    JSON.stringify(A.semOBlocoAntigo(comBloco)))
}

// ── 5. o que não pode derrubar ──
{
  const d = disco()
  const r1 = A.aplicar(editor(false), { ler: d.ler, escrever: d.escrever })
  checar('5a. extensão oficial não instalada → não faz nada, sem lançar', r1 === 'semAlvo', r1)

  const r2 = A.aplicar(editor(true, path.join(REPO, 'nao-existe')), { ler: d.ler, escrever: d.escrever })
  checar('5b. pacote sem `webview/index.css` → não faz nada, sem lançar', r2 === 'semAlvo', r2)

  checar('5c. nada foi escrito em nenhum dos casos', d.estado.escritas === 0, String(d.estado.escritas))

  const r3 = A.desfazer(editor(false), {})
  checar('5d. desfazer sem alvo também não lança', r3 === 'semAlvo', r3)
}

// ── 5e a 5j. O CAMINHO QUE ESCREVE — com pacote de verdade em disco ──
//
// ⚠️ APANHADO NUMA CONFERÊNCIA INDEPENDENTE (21/09/2026), e era grave: as únicas chamadas a
// `aplicar` nesta suíte passavam um editor SEM a extensão instalada, ou seja, só exercitavam o
// retorno `semAlvo`. O caminho feliz — escrever o bloco, reconhecer que já está, trocar um bloco
// antigo — não tinha um caso sequer. Na prova, DUAS mutilações passaram 21/21: esvaziar o `try`
// que escreve o arquivo, e trocar `semOBlocoAntigo(texto)` por `String(texto)` (o que faria o
// bloco EMPILHAR para sempre, a cada abertura do programa).
//
// Aqui o pacote é uma pasta de verdade, criada e apagada pelo teste, com a forma que o código
// procura: `<pasta>/webview/index.css`.
{
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-pacote-falso-'))
  fs.mkdirSync(path.join(pasta, 'webview'), { recursive: true })
  const alvo = path.join(pasta, 'webview', 'index.css')
  const ORIGINAL = '.dela { color: red; }' + String.fromCharCode(10)
  const editorComAExtensao = { extensions: { getExtension: id => (id === A.EXTENSAO ? { extensionPath: pasta } : undefined) } }

  fs.writeFileSync(alvo, ORIGINAL, 'utf8')
  const r1 = A.aplicar(editorComAExtensao)
  const depois1 = fs.readFileSync(alvo, 'utf8')
  checar('5e. com o pacote em disco, aplicar ESCREVE mesmo o bloco',
    r1 === 'aplicado' && depois1.includes(A.MARCA_INICIO) && depois1.includes(A.MARCA_FIM)
    && depois1.includes(A.CSS.trim()), `${r1} · ${depois1.length} bytes`)
  checar('5f. e o CSS que já estava lá continua inteiro',
    depois1.startsWith('.dela { color: red; }'), depois1.slice(0, 40))

  const r2 = A.aplicar(editorComAExtensao)
  const depois2 = fs.readFileSync(alvo, 'utf8')
  checar('5g. aplicar de novo reconhece que já está, e NÃO escreve nada',
    r2 === 'jaEstava' && depois2 === depois1, `${r2} · mudou: ${depois2 !== depois1}`)

  // ⚠️ O CASO QUE A MUTILAÇÃO REVELOU: um bloco de uma versão ANTERIOR do ajuste tem que SAIR,
  // não empilhar. Sem isto, cada abertura do programa acrescentaria mais um bloco ao arquivo dela.
  const LN = String.fromCharCode(10)
  fs.writeFileSync(alvo, ORIGINAL + LN + A.MARCA_INICIO + LN + '.velho { display: none; }' + LN + A.MARCA_FIM + LN, 'utf8')
  const r3 = A.aplicar(editorComAExtensao)
  const depois3 = fs.readFileSync(alvo, 'utf8')
  const quantosBlocos = depois3.split(A.MARCA_INICIO).length - 1
  checar('5h. bloco de versão anterior SAI antes do novo entrar (não empilha)',
    r3 === 'aplicado' && quantosBlocos === 1 && !depois3.includes('.velho'),
    `${r3} · ${quantosBlocos} bloco(s) · tem o velho: ${depois3.includes('.velho')}`)

  // Desfazer devolve o arquivo ao que era.
  const r4 = A.desfazer(editorComAExtensao)
  const depois4 = fs.readFileSync(alvo, 'utf8')
  checar('5i. desfazer tira o bloco e deixa o CSS dela como estava',
    !depois4.includes(A.MARCA_INICIO) && depois4.trim() === ORIGINAL.trim(),
    `${r4} · ${JSON.stringify(depois4.slice(0, 60))}`)

  // Arquivo somente-leitura: não pode derrubar a abertura do programa.
  fs.writeFileSync(alvo, ORIGINAL, 'utf8')
  const r5 = A.aplicar(editorComAExtensao, { escrever: () => { throw new Error('somente leitura') } })
  checar('5j. escrita que falha volta como estado, sem lançar, e sem estragar o arquivo',
    r5 === 'naoEscreveu' && fs.readFileSync(alvo, 'utf8') === ORIGINAL, String(r5))

  fs.rmSync(pasta, { recursive: true, force: true })
}

// ── 6, 7, 8 ──
{
  // ⚠️ O `aria-label` saiu junto com o t200, que foi retirado por apontar para o elemento errado.
  // O que continua valendo é a regra: âncora é TEXTO que a pessoa lê, nunca classe com hash.
  checar('6a. os seletores são ancorados em texto (title ou aria-label)',
    /\[title="/.test(A.CSS) || /\[aria-label="/.test(A.CSS), A.CSS)
  // Uma classe com hash é `.algo_XxXxXx`: letra, underscore, seis caracteres de hash.
  checar('6b. nenhum seletor de classe com hash de build',
    !/\.[a-zA-Z][a-zA-Z0-9]*_[A-Za-z0-9]{6}/.test(A.CSS), A.CSS)
  const importantes = (A.CSS.match(/!important/g) || []).length
  const regras = (A.CSS.match(/\{/g) || []).length
  checar('7. `!important` só onde há regra, e nada além',
    // V29: a regra que esconde o cabecalho (historico + nova sessao) dispensa a flag de
    // prioridade — especificidade 0,2,0 contra 0,1,0 do `.header_` dela, e vem depois no arquivo.
    // O que o criterio protege continua: nenhuma flag a mais que o numero de regras.
    importantes <= regras && regras >= 1, `${importantes} em ${regras} regras`)
  checar('8. o alvo é a extensão oficial, e nenhuma outra',
    A.EXTENSAO === 'anthropic.claude-code', A.EXTENSAO)
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ CONTRA O PACOTE REAL — o caso que faltava, e que deixou passar um seletor errado
//
// A primeira versão deste arquivo provava a FORMA do CSS (tem `[title=`, não tem classe com hash,
// conta os `!important`) e nunca abria o pacote da extensão oficial. Resultado: o seletor do `+`
// apontava para `[title="Add files or folders to the conversation"]`, que existe no pacote — mas
// como título de um ITEM DE DENTRO do menu que o `+` abre, não do botão. A regra escondia a opção
// "Add context" e deixava o `+` onde estava. 12/12 verde.
//
// ⚠️ REGRA QUE FICA: âncora em software de terceiro se prova CONTRA o software de terceiro. E o
// critério tem de ficar VERMELHO quando a âncora sumir — é esse o aviso que se quer receber antes
// do build, e não depois, na tela.
// ─────────────────────────────────────────────────────────────────────────────
{
  const candidatas = [
    path.join(os.homedir(), '.oficina', 'extensions'),
    path.join(os.homedir(), '.vscode', 'extensions'),
  ]
  let pacote = null
  for (const base of candidatas) {
    let nomes = []
    try { nomes = fs.readdirSync(base) } catch { continue }
    const dela = nomes.filter(n => n.startsWith('anthropic.claude-code')).sort()
    for (const n of dela) {
      const js = path.join(base, n, 'webview', 'index.js')
      if (fs.existsSync(js)) { pacote = { nome: n, js } }
    }
    if (pacote) break
  }

  if (!pacote) {
    checar('PACOTE REAL. a extensão oficial está instalada para conferir as âncoras', false,
      'não achei `anthropic.claude-code*/webview/index.js` em nenhuma pasta de extensões')
  } else {
    const bundle = fs.readFileSync(pacote.js, 'utf8')
    console.log(`       (conferido contra ${pacote.nome})`)

    // Os valores de `title=`/`aria-label=` que o nosso CSS usa como âncora.
    const ancoras = [...A.CSS.matchAll(/\[(title|aria-label)="([^"]+)"\]/g)].map(m => ({ attr: m[1], valor: m[2] }))
    checar('PACOTE REAL 1. o nosso CSS tem pelo menos uma âncora para conferir', ancoras.length > 0)

    for (const a of ancoras) {
      // No bundle, um `title` de verdade aparece como `title:"..."`; um aria-label como
      // `"aria-label":"..."`. Se a âncora não aparecer nessa forma, ela não é atributo do elemento.
      // O valor pode ter caracteres de expressão regular; monta-se a busca escapando-os.
      // Busca LITERAL, sem expressão regular: no pacote, um `title` de verdade aparece como
      // `title:"..."` e um aria-label como `"aria-label":"..."`. Se a âncora não aparecer nessa
      // forma, ela não é atributo daquele elemento — foi esse o erro que custou o item.
      // V29: o aria-label tambem chega ao elemento POR COMPONENTE — o botao de icone do
      // pacote recebe `ariaLabel:"..."` e o repassa como `"aria-label"` (medido no `Ly1` da 2.1.278).
      // Essa forma so vale se o pacote tiver um componente que faca o repasse; senao, `ariaLabel`
      // poderia ser so uma prop que ninguem desenha.
      const repassa = /\{[^{}]*ariaLabel:([A-Za-z_$][\w$]*)[^{}]*\}[\s\S]{0,400}?"aria-label":\1\b/.test(bundle)
      const direta = a.attr === 'title'
        ? 'title:' + JSON.stringify(a.valor)
        : JSON.stringify('aria-label') + ':' + JSON.stringify(a.valor)
      const porComponente = 'ariaLabel:' + JSON.stringify(a.valor)
      const forma = a.attr === 'aria-label' && !bundle.includes(direta) && repassa && bundle.includes(porComponente)
        ? porComponente : direta
      const achou = bundle.includes(forma)
      let quantas = 0
      for (let k = bundle.indexOf(forma); k !== -1; k = bundle.indexOf(forma, k + 1)) quantas++
      checar(`PACOTE REAL 2. a âncora ${a.attr}="${a.valor}" existe como ATRIBUTO no pacote dela`,
        achou, `achou=${achou}`)
      checar(`PACOTE REAL 3. e é única (${a.valor}) — senão esconderia outro elemento junto`,
        quantas === 1, `ocorrências: ${quantas}`)
    }

    // ⛔ O CASO EXATO QUE PASSOU BATIDO, agora com critério próprio.
    //
    // A frase longa do menu de anexos existe no pacote como `title` de um item DE DENTRO do menu.
    // Usá-la como âncora esconde a linha do menu e deixa o `+` onde está. O que se cobra aqui é que
    // o nosso CSS ancore no título do BOTÃO, e não naquela frase.
    const fraseDoMenu = 'Add files or folders to the conversation'
    checar('PACOTE REAL 4. o CSS NÃO ancora na frase do item de menu',
      !A.CSS.includes(fraseDoMenu), A.CSS)
    checar('PACOTE REAL 4b. (controle) a frase do menu existe mesmo no pacote — o risco era real',
      bundle.includes(fraseDoMenu),
      'o controle não se reproduz nesta versão do pacote: reavaliar o critério 4')
    checar('PACOTE REAL 4c. e o CSS ancora no título do botão, que é o que se quer esconder',
      A.CSS.includes('button[title="Add"]'), A.CSS)

    // ─────────────────────────────────────────────────────────────────────────
    // ⛔ AS ÂNCORAS POR NOME-BASE DE CLASSE (`[class*="nome_"]`) — a via que destravou
    //    `t192`, `t200` e "só bypass e plan".
    //
    // Até 21/09/2026 a regra do projeto era "âncora é TEXTO, nunca classe com hash", e ela
    // está certa: `.header_aqhumA` quebra em toda recompilação dela. Mas o que muda é o
    // SUFIXO, não o nome — e `[class*="header_"]` casa com qualquer hash. O critério 6b
    // continua proibindo o hash; estes aqui cobram que o nome-base exista de verdade no
    // pacote, pelo mesmo motivo do critério 2: âncora em software de terceiro se prova
    // contra o software de terceiro.
    // ─────────────────────────────────────────────────────────────────────────
    const basesDeClasse = [...A.CSS.matchAll(/\[class\*="([A-Za-z][A-Za-z0-9]*)_"\]/g)].map(m => m[1])
    checar('PACOTE REAL 5. o CSS usa pelo menos uma âncora por nome-base de classe',
      basesDeClasse.length > 0, basesDeClasse.join(', '))
    for (const base of basesDeClasse) {
      // No bundle, a classe aparece com o hash colado: `titleGroup_aqhumA`. Se o nome-base
      // sumir (eles renomearem o componente), este critério fica VERMELHO antes do build —
      // que é exatamente o aviso que se quer.
      const comHash = new RegExp('\\b' + base + '_[A-Za-z0-9]{4,}\\b')
      checar(`PACOTE REAL 6. o nome-base "${base}_" existe no pacote dela`,
        comHash.test(bundle), `procurei /${base}_<hash>/`)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ⛔ A DERIVAÇÃO DAS POSIÇÕES DO SELETOR DE MODOS
    //
    // CSS não seleciona por texto, e os cinco modos são `<button>` idênticos: o que
    // distingue "Plan" de "Auto" é o texto dentro. Escrever `nth-child` à mão acertaria
    // hoje e esconderia o modo ERRADO amanhã, em silêncio. Por isso a posição é derivada
    // da tabela de modos do próprio pacote, e o que se cobra aqui é a derivação.
    // ─────────────────────────────────────────────────────────────────────────
    const pastaDoPacote = path.dirname(path.dirname(pacote.js))
    const cssModos = A.cssDosModos(pastaDoPacote)
    checar('PACOTE REAL 7. a derivação leu a tabela de modos do pacote e produziu CSS',
      !!cssModos && /nth-child\(\d+\)/.test(cssModos),
      cssModos ? cssModos.replace(/\s+/g, ' ').slice(0, 150) : '(vazio — não derivou)')

    const posicoes = [...String(cssModos).matchAll(/nth-child\((\d+)\)/g)].map(m => Number(m[1]))
    checar('PACOTE REAL 8. ela esconde exatamente os modos que NÃO ficam',
      posicoes.length > 0 && posicoes.length === new Set(posicoes).size,
      `posições: ${posicoes.join(', ')}`)

    // O contrário do critério 8: os que FICAM não podem estar na lista de esconder. Como a
    // derivação é por posição, a prova é recalcular a posição deles e conferir a ausência.
    {
      const re = /([A-Za-z]+):\{icon:[\s\S]{0,300}?label:"([^"]+)"/g
      const ordem = []
      let m
      while ((m = re.exec(bundle)) !== null) if (!ordem.some(o => o.chave === m[1])) ordem.push(m[1])
      const noMenu = ordem.filter(c => c !== 'dontAsk')
      const posicaoDe = chave => noMenu.indexOf(chave) + 2 // +1 do índice, +1 do menuHeader
      const ficam = A.MODOS_QUE_FICAM.map(c => ({ chave: c, nth: posicaoDe(c) }))
      checar('PACOTE REAL 9. os modos que FICAM existem na tabela do pacote',
        ficam.every(f => f.nth >= 2), ficam.map(f => `${f.chave}@${f.nth}`).join(', '))
      checar('PACOTE REAL 10. e NENHUM deles está entre os escondidos',
        ficam.every(f => !posicoes.includes(f.nth)),
        `ficam em ${ficam.map(f => f.nth).join(',')} · esconde ${posicoes.join(',')}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ AS CONFIGURAÇÕES `claudeCode.*` QUE O PRODUTO DEFINE EXISTEM NA EXTENSÃO DELA?
//
// Configuração de extensão com nome que a extensão não declara é ignorada **em silêncio**. A V20
// pôs `claudeCode.attachOpenFile: false` no produto e contou o item como resolvido — e a versão
// que o build instala não tem essa chave (ela só aparece a partir da 2.1.273). Um revisor
// independente mediu. Nada ficava vermelho.
//
// ⚠️ E o build NÃO fixa a versão: `baixar_extensoes.mjs` pede `/latest` à Open VSX. Logo, a versão
// em que as âncoras e as chaves foram medidas pode não ser a que sobe. Este critério é o aviso.
// ─────────────────────────────────────────────────────────────────────────────
{
  // Chaves que sabemos não existir na versão em cache, e por quê. Entrar aqui é decisão consciente:
  // a configuração fica no produto à espera da versão nova, e o critério continua verde — mas o
  // nome fica ESCRITO, em vez de o item passar por entregue.
  const AGUARDANDO_VERSAO_NOVA = {
    'claudeCode.attachOpenFile': 'só existe a partir da 2.1.273; na versão em cache é inerte (t194, parte do “▣”)',
  }

  const candidatas = [
    path.join(os.homedir(), '.oficina', 'extensions'),
    path.join(os.homedir(), '.vscode', 'extensions'),
  ]
  let manifestoDela = null
  let versao = null
  for (const base of candidatas) {
    let nomes = []
    try { nomes = fs.readdirSync(base) } catch { continue }
    for (const n of nomes.filter(x => x.startsWith('anthropic.claude-code')).sort()) {
      const m = path.join(base, n, 'package.json')
      if (fs.existsSync(m)) { manifestoDela = m; versao = n }
    }
    if (manifestoDela) break
  }

  if (!manifestoDela) {
    checar('CONFIG. a extensão oficial está instalada para conferir as chaves', false, 'não achei o manifesto dela')
  } else {
    const dela = JSON.parse(fs.readFileSync(manifestoDela, 'utf8'))
    const props = ((dela.contributes || {}).configuration || {}).properties || {}
    const produto = JSON.parse(fs.readFileSync(path.join(REPO, 'produto', 'product.json'), 'utf8'))
    const nossas = Object.keys(produto.configurationDefaults || {}).filter(k => k.startsWith('claudeCode.'))
    const inertes = nossas.filter(k => !(k in props))
    const naoDeclaradas = inertes.filter(k => !(k in AGUARDANDO_VERSAO_NOVA))

    console.log(`       (conferido contra o manifesto de ${versao}; ${nossas.length} chaves nossas, ${inertes.length} inerte(s))`)
    checar('CONFIG 1. toda `claudeCode.*` do produto existe na extensão — ou está declarada como pendente',
      naoDeclaradas.length === 0,
      `sem efeito e sem declaração: ${naoDeclaradas.join(', ')}`)
    for (const k of inertes) {
      console.log(`       ⚠️ INERTE nesta versão: ${k} — ${AGUARDANDO_VERSAO_NOVA[k] || 'sem motivo declarado'}`)
    }
    checar('CONFIG 2. (controle) o critério enxerga mesmo as chaves da extensão',
      Object.keys(props).some(k => k.startsWith('claudeCode.')), `${Object.keys(props).length} propriedades lidas`)
    // As duas que fazem o produto pular aprovação TÊM de existir, senão a decisão dele não vale nada.
    checar('CONFIG 3. as chaves que definem o modo padrão existem de verdade na extensão',
      ('claudeCode.initialPermissionMode' in props) && ('claudeCode.allowDangerouslySkipPermissions' in props),
      JSON.stringify(nossas.filter(k => k.includes('ermission'))))
  }
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
