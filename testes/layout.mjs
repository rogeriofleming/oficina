// OS LAYOUTS COM NOME (V11) — `extensoes/oficina-claude/layout.js`, em node puro, com o núcleo de mentira.
//
// O núcleo de mentira faz o que o patch 0011 promete: captura um retrato e, ao aplicar, devolve o que
// ignorou. O que se prova aqui é a extensão: nome, o que é guardado, a ordem de aplicação, o aviso
// quando só metade volta, e que nada é inventado quando o comando do núcleo não existe.
//
// V18: também `tamanhos.js` (a altura da caixa de escrever: limites, guardar, reabrir, automático) e o
// "Voltar ao layout padrão", com um núcleo de mentira COM ESTADO (parte escondida não ganha tamanho, como
// no grid de verdade) e o patch 0013.
//
// Uso:  node testes/layout.mjs

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const L = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'layout.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

function montar({ comNucleo = true, nucleoLanca = false } = {}) {
  const guardado = {}
  const chamadas = []
  const configGlobal = { 'workbench.statusBar.visible': false, 'editor.minimap.enabled': false }
  let retrato = { version: 1, parts: { 'workbench.parts.sidebar': { visible: false, width: 300, height: 800 } }, panelPosition: 2, panelAlignment: 'center', containers: { 'workbench.view.explorer': 0 }, views: {} }
  const deps = {
    armazenamento: { get: k => guardado[k], update: async (k, v) => { guardado[k] = JSON.parse(JSON.stringify(v)) } },
    executar: async (cmd, ...args) => {
      chamadas.push({ cmd, args })
      if (nucleoLanca) throw new Error(`command '${cmd}' not found`)
      if (!comNucleo) return undefined
      if (cmd === L.CAPTURAR) return JSON.parse(JSON.stringify(retrato))
      if (cmd === L.APLICAR) return { applied: ['part x'], skipped: ['view some.removed.view'] }
    },
    configuracao: {
      inspect: k => ({ globalValue: configGlobal[k] }),
      update: async (k, v) => { chamadas.push({ cmd: 'config', args: [k, v] }); if (v === undefined) delete configGlobal[k]; else configGlobal[k] = v },
    },
    agora: (() => { let n = 0; return () => new Date(Date.UTC(2026, 8, 12, 23, n++)) })(),
  }
  return { layouts: new L.Layouts(deps), guardado, chamadas, configGlobal, trocarRetrato: r => { retrato = r } }
}

// ── nome ──
checar('layout: nome vazio é recusado com o motivo', !!L.validarNome('   ').erro)
checar('layout: nome comprido demais é recusado', !!L.validarNome('x'.repeat(L.NOME_MAXIMO + 1)).erro)
checar('layout: espaços sobrando saem do nome', L.validarNome('  Tela   de   escrever ').nome === 'Tela de escrever')

// ── salvar ──
{
  const t = montar()
  const r = await t.layouts.salvar('Escrever')
  checar('layout: salvar com o núcleo diz que é completo', r.nome === 'Escrever' && r.completo === true, JSON.stringify(r))
  const p = t.guardado[L.CHAVE]['Escrever']
  checar('layout: guarda o retrato do núcleo', p.nucleo && p.nucleo.version === 1 && p.nucleo.panelPosition === 2)
  checar('layout: guarda as configurações que a PESSOA definiu', p.config['workbench.statusBar.visible'] === false && p.config['editor.minimap.enabled'] === false)
  checar('layout: configuração nunca definida fica null (o padrão do programa não é congelado)', p.config['workbench.sideBar.location'] === null)
  checar('layout: guarda só as configurações de tela, e nenhuma outra', Object.keys(p.config).sort().join() === [...L.CONFIGURACOES_DO_LAYOUT].sort().join())
  await t.layouts.salvar('Revisar')
  checar('layout: lista do mais recente para o mais antigo', t.layouts.listar().map(x => x.nome).join() === 'Revisar,Escrever')
  checar('layout: nome inválido não grava nada', (await t.layouts.salvar('')).erro && Object.keys(t.guardado[L.CHAVE]).length === 2)
}

// ── aplicar ──
{
  const t = montar()
  await t.layouts.salvar('Escrever')
  t.configGlobal['workbench.statusBar.visible'] = true          // a tela "desfeita"
  t.configGlobal['workbench.sideBar.location'] = 'right'
  t.chamadas.length = 0
  const r = await t.layouts.aplicar('Escrever')
  checar('layout: aplicar devolve as configurações', t.configGlobal['workbench.statusBar.visible'] === false)
  checar('layout: configuração que não estava definida volta a não estar (sai, em vez de ficar "right")', !('workbench.sideBar.location' in t.configGlobal))
  const ordem = t.chamadas.map(c => c.cmd)
  checar('layout: configurações ANTES do núcleo (a posição da barra desfaria o tamanho dela)', ordem.lastIndexOf('config') < ordem.indexOf(L.APLICAR), ordem.join(','))
  checar('layout: o núcleo recebe o retrato salvo', t.chamadas.find(c => c.cmd === L.APLICAR).args[0].panelPosition === 2)
  checar('layout: o que o núcleo ignorou volta para a tela', r.completo === true && r.ignorados.join() === 'view some.removed.view')
  checar('layout: a frase conta o que ficou de fora, no singular', L.fraseDoResultado(r) === 'Layout "Escrever" aplicado. 1 item não existe mais nesta instalação e ficou de fora.', L.fraseDoResultado(r))
  checar('layout: e no plural', /2 itens não existem mais nesta instalação e ficaram de fora\.$/.test(L.fraseDoResultado({ nome: 'x', completo: true, ignorados: ['a', 'b'] })))
  checar('layout: sem nada ignorado, a frase é curta', L.fraseDoResultado({ nome: 'x', completo: true, ignorados: [] }) === 'Layout "x" aplicado.')
  checar('layout: layout que não existe dá erro com o nome', /Não há layout chamado "Sumiu"/.test((await t.layouts.aplicar('Sumiu')).erro || ''))
}

// ── sem o núcleo ──
{
  const t = montar({ nucleoLanca: true })
  const s = await t.layouts.salvar('Parcial')
  checar('⛔ layout: sem o comando do núcleo, salvar AVISA que não é completo', s.completo === false)
  checar('layout: e não inventa retrato', t.guardado[L.CHAVE]['Parcial'].nucleo === null)
  const a = await t.layouts.aplicar('Parcial')
  checar('⛔ layout: aplicar um salvo sem núcleo diz que só metade voltou', a.completo === false && /só em parte/.test(L.fraseDoResultado(a)), L.fraseDoResultado(a))
  checar('layout: e não chama o núcleo com nada', !t.chamadas.some(c => c.cmd === L.APLICAR))
}
{
  // Salvo completo num build com o patch; aplicado num build SEM ele.
  const t = montar()
  await t.layouts.salvar('Completo')
  t.layouts.executar = async () => { throw new Error('command not found') }
  const a = await t.layouts.aplicar('Completo')
  checar('⛔ layout: núcleo sumiu entre salvar e aplicar: diz que só metade voltou', a.completo === false && /não sabe aplicar/.test(a.motivo), JSON.stringify(a))
}
{
  const t = montar()
  t.trocarRetrato({ version: 2, qualquer: true })
  const s = await t.layouts.salvar('Futuro')
  checar('layout: retrato de formato desconhecido não é guardado como se fosse bom', s.completo === false && t.guardado[L.CHAVE]['Futuro'].nucleo === null)
}

// ── excluir ──
{
  const t = montar()
  await t.layouts.salvar('Um'); await t.layouts.salvar('Dois')
  checar('layout: excluir tira só aquele', (await t.layouts.excluir('Um')) === true && t.layouts.listar().map(x => x.nome).join() === 'Dois')
  checar('layout: excluir o que não existe diz que não excluiu', (await t.layouts.excluir('Nunca')) === false)
}

// ── o patch do núcleo existe e fala os mesmos nomes ──
{
  const fs = await import('node:fs')
  const patch = fs.readFileSync(path.join(REPO, 'patches', '0011-layout-capturar-e-aplicar.patch'), 'utf8')
  checar('layout: o patch 0011 registra os DOIS comandos que a extensão chama', patch.includes(`'${L.CAPTURAR}'`) && patch.includes(`'${L.APLICAR}'`))
  checar('layout: o patch tem o .md do porquê ao lado', fs.existsSync(path.join(REPO, 'patches', '0011-layout-capturar-e-aplicar.md')))
  checar('layout: o patch chega em LF (em CRLF ele não aplica num clone novo)', !patch.includes('\r'))
  // O `setPanelPosition` do núcleo ABRE o painel para movê-lo (e abrir um painel cuja vista é o terminal cria um
  // shell); o `setPanelAlignment` manda para baixo um painel que está ao lado. Chamados sempre, aplicar qualquer
  // layout abria o painel, e um layout com o painel ao lado terminava com ele embaixo.
  const aplicar = patch.slice(patch.indexOf('LAYOUT_SNAPSHOT_PANEL_POSITIONS.includes(s.panelPosition)'))
  checar('⛔ layout: o 0011 só move o painel quando a posição salva é outra (mover abre o painel)',
    /if \(s\.panelPosition !== layoutService\.getPanelPosition\(\)\) \{\s*\+\s*layoutService\.setPanelPosition/.test(aplicar))
  checar('⛔ layout: o 0011 só alinha o painel quando ele está em cima ou embaixo (alinhar manda o de lado para baixo)',
    /Position\.BOTTOM \|\| position === Position\.TOP\) && s\.panelAlignment !== layoutService\.getPanelAlignment\(\)\) \{\s*\+\s*layoutService\.setPanelAlignment/.test(aplicar))
}

// ─────────────────────────────────────────────────────────────────────────────
// V18 — o LAYOUT LIVRE: os tamanhos de dentro da conversa (guardar, restaurar, voltar ao padrão) e o
// "Voltar ao layout padrão", com um núcleo de mentira que se comporta como o patch 0011 (parte escondida não
// ganha tamanho) e responde ao 0013.
// ─────────────────────────────────────────────────────────────────────────────
const T = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'tamanhos.js'))
function armazenamentoFalso(inicial = {}) {
  const guardado = { ...inicial }
  return { guardado, get: k => guardado[k], update: async (k, v) => { if (v === undefined) delete guardado[k]; else guardado[k] = JSON.parse(JSON.stringify(v)) } }
}

// ── os limites ──
checar('⛔ tamanhos: altura abaixo do mínimo sobe para uma linha (32 px)', T.normalizar('caixa', 5).valor === 32)
checar('⛔ tamanhos: altura acima do teto desce para o teto', T.normalizar('caixa', 50000).valor === T.PARTES.caixa.maximo)
checar('tamanhos: fração vira inteiro', T.normalizar('caixa', 180.6).valor === 181)
checar('⛔ tamanhos: nulo é o automático, não zero', T.normalizar('caixa', null).valor === null && T.normalizar('caixa', undefined).valor === null)
checar('tamanhos: texto e parte desconhecida são recusados com o motivo', !!T.normalizar('caixa', 'alta').erro && !!T.normalizar('barraDeCima', 40).erro)
// O nome da parte vem da página: uma chave herdada de Object (`__proto__`, `constructor`, `toString`) não é parte.
checar('⛔ tamanhos: nome herdado de Object não passa por parte (`__proto__`, `constructor`, `toString`)',
  ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].every(p => !!T.normalizar(p, 999).erro),
  JSON.stringify(['__proto__', 'constructor', 'toString'].map(p => T.normalizar(p, 999))))

// ── guardar e restaurar ──
{
  const a = armazenamentoFalso()
  const t = new T.Tamanhos({ armazenamento: a })
  checar('⛔ tamanhos: sem nada guardado, a caixa é automática', t.ler().caixa === null)
  const avisos = []
  t.aoMudar((agora, origem) => avisos.push({ agora, origem }))
  const r = await t.guardar('caixa', 210, 'aba-1')
  checar('⛔ tamanhos: guardar grava no perfil', (a.guardado[T.CHAVE_TAMANHOS] || {}).caixa === 210 && r.valor === 210)
  checar('⛔ tamanhos: e uma instância nova (o programa reaberto) lê o mesmo', new T.Tamanhos({ armazenamento: a }).ler().caixa === 210)
  checar('tamanhos: o aviso leva o novo valor e quem mudou', avisos.length === 1 && avisos[0].agora.caixa === 210 && avisos[0].origem === 'aba-1', JSON.stringify(avisos))
  await t.guardar('caixa', 210, 'aba-1')
  checar('tamanhos: o mesmo valor de novo não grava nem avisa', avisos.length === 1)
  checar('tamanhos: valor recusado não grava', !!(await t.guardar('caixa', 'x')).erro && (a.guardado[T.CHAVE_TAMANHOS] || {}).caixa === 210)
  a.guardado[T.CHAVE_TAMANHOS] = { caixa: 'estragado' }
  checar('tamanhos: valor estragado no disco vira automático, sem lançar', t.ler().caixa === null)
  await t.guardar('caixa', 150)
  await t.voltarAoPadrao()
  checar('⛔ tamanhos: voltar ao padrão tira a chave do perfil e avisa o automático', !(T.CHAVE_TAMANHOS in a.guardado) && avisos[avisos.length - 1].agora.caixa === null)
}

// ── os retratos do padrão (o que o patch 0011 recebe) ──
{
  const P = L.PARTE
  const atual = { version: 1, parts: { [P.lateral]: { visible: true, width: 420, height: 700 }, [P.secundaria]: { visible: false, width: 0, height: 0 }, [P.painel]: { visible: true, width: 900, height: 356 } } }
  const m = L.retratoDoPadrao('mostrar', atual)
  checar('⛔ padrão, fase 1: barra lateral e secundária ficam visíveis (parte escondida não ganha tamanho)', m.parts[P.lateral].visible && m.parts[P.secundaria].visible)
  checar('padrão, fase 1: o painel fica aberto se estava, e vai para baixo, centralizado, se não sabia onde estava', m.parts[P.painel].visible === true && m.panelPosition === 2 && m.panelAlignment === 'center')
  checar('padrão, fase 1: sem nenhum tamanho (o 0011 só aplica tamanho de 50 a 10.000)', Object.values(m.parts).every(p => p.width === 0 && p.height === 0))
  const d = L.retratoDoPadrao('medidas', atual)
  // ⚠️ Este `atual` NÃO traz o tamanho da janela (é o retrato de um núcleo anterior à V19). Sem o dado, a
  // largura fica no teto — o comportamento de antes, que é o que um build velho consegue fazer.
  checar('⛔ padrão, fase 2: sem o tamanho da janela no retrato, a largura fica no teto (300) e a outra dimensão fica como está',
    d.parts[P.lateral].width === 300 && d.parts[P.lateral].height === 700)
  checar('⛔ padrão, fase 2: o painel aberto volta a 300 de altura, com a largura que tem', d.parts[P.painel].height === 300 && d.parts[P.painel].width === 900)
  checar('padrão, fase 2: parte que não abriu não recebe tamanho', !(P.secundaria in d.parts))
  const dFechado = L.retratoDoPadrao('medidas', { version: 1, parts: { [P.painel]: { visible: false, width: 0, height: 0 } } })
  checar('⛔ padrão, fase 2: o painel FECHADO não é aberto para medir', !(P.painel in dFechado.parts))
  const e = L.retratoDoPadrao('esconder', atual)
  // ⚠️ V20 (t197): a secundária volta FECHADA. Até a V19 este critério exigia o contrário — ela
  // aberta, porque era onde a vista Tokens morava "sempre à vista". Ele desfez isso: *"esse negócio
  // inteiro na direita não faz sentido, não quero ele assim"*. Os números foram para a barra de
  // cima (t196), e "voltar ao padrão" não pode reabrir o que ele mandou fechar.
  checar('⛔ V20, padrão fase 3: barra lateral, painel E secundária fechados — como a OFICINA abre agora',
    [P.lateral, P.painel, P.secundaria].every(n => e.parts[n].visible === false))
  checar('padrão: nenhum retrato move contêiner ou vista (isso é do comando do editor)', [m, d, e].every(r => !Object.keys(r.containers).length && !Object.keys(r.views).length))
  // Medido na V18 (executável da V12): `setPanelPosition` abre o painel e o remonta no grid mesmo sem mudar de
  // lugar — o painel fechado abria e a largura da barra lateral não ficava.
  const noLugar = L.retratoDoPadrao('mostrar', { ...atual, panelPosition: 2, panelAlignment: 'center' })
  checar('⛔ padrão: painel já embaixo e centralizado → a fase 1 NÃO manda posição (ela abriria o painel)',
    !('panelPosition' in noLugar) && !('panelAlignment' in noLugar), JSON.stringify(noLugar))
  checar('⛔ padrão: as fases 2 e 3 nunca mandam a posição do painel', [d, e].every(r => !('panelPosition' in r) && !('panelAlignment' in r)))
  const doLado = L.retratoDoPadrao('mostrar', { ...atual, panelPosition: 1, panelAlignment: 'center' })
  checar('padrão: painel à direita → a fase 1 o põe embaixo', doLado.panelPosition === 2 && !('panelAlignment' in doLado))
}

// ── V19: a largura padrão das barras é a conta do núcleo (um quarto da janela, teto 300, piso 170) ──
//
// Até a V18 o "voltar ao padrão" mandava 300 fixo. Medido no executável da V18, numa janela de 656 px: a
// barra da direita (onde a vista Tokens fica sempre aberta) ficava com 218 px e a conversa com 390 px —
// o "padrão" do reset era MAIOR que o padrão de fábrica do próprio editor, que numa janela dessas dá 170.
{
  const P = L.PARTE
  const comJanela = largura => ({
    version: 1,
    window: { width: largura, height: 900 },
    parts: { [P.lateral]: { visible: true, width: 420, height: 700 }, [P.secundaria]: { visible: true, width: 350, height: 700 } }
  })
  const largo = L.retratoDoPadrao('medidas', comJanela(1600))
  const medio = L.retratoDoPadrao('medidas', comJanela(1000))
  const estreito = L.retratoDoPadrao('medidas', comJanela(640))
  checar('⛔ V19: janela LARGA (1600) → a vista Tokens volta ao teto de 300 px (um quarto seriam 400)',
    largo.parts[P.secundaria].width === 300, String(largo.parts[P.secundaria].width))
  checar('⛔ V19: janela MÉDIA (1000) → a vista Tokens volta a 250 px (um quarto da janela)',
    medio.parts[P.secundaria].width === 250, String(medio.parts[P.secundaria].width))
  checar('⛔ V19: janela ESTREITA (640) → a vista Tokens volta a 170 px, o piso (um quarto seriam 160)',
    estreito.parts[P.secundaria].width === 170, String(estreito.parts[P.secundaria].width))
  checar('⛔ V19: a barra lateral segue a MESMA conta do núcleo (as duas têm o mesmo padrão de fábrica)',
    largo.parts[P.lateral].width === 300 && medio.parts[P.lateral].width === 250 && estreito.parts[P.lateral].width === 170,
    [largo, medio, estreito].map(r => r.parts[P.lateral].width).join(' '))
  checar('V19: a altura de cada parte continua sendo a que ela já tinha',
    [largo, medio, estreito].every(r => r.parts[P.secundaria].height === 700 && r.parts[P.lateral].height === 700))
  // A conta, sozinha: teto, piso, proporção e o que ela faz sem dado nenhum.
  // ⚠️ Com GUARDA: sem a função (produto de antes) o critério tem de ficar VERMELHO, não derrubar a suíte —
  // suíte que cai não marca vermelho, e foi assim que duas mutações da V18 quase passaram sem separar nada.
  const conta = typeof L.larguraPadraoDaBarra === 'function' ? L.larguraPadraoDaBarra : () => 'a função não existe'
  checar('⛔ V19: a conta é min(300, janela ÷ 4) com piso de 170',
    conta(2000) === 300 && conta(1200) === 300 && conta(1100) === 275 && conta(680) === 170 && conta(300) === 170,
    [2000, 1200, 1100, 680, 300].map(w => `${w}→${conta(w)}`).join(' '))
  checar('⛔ V19: janela desconhecida (núcleo sem o campo) fica no teto, nunca num chute',
    typeof L.larguraPadraoDaBarra === 'function' && [undefined, null, 0, -1, NaN, 'grande'].every(v => conta(v) === 300))
}

/** Um núcleo de mentira com estado: o 0011 (parte escondida não ganha tamanho) e, se pedido, o 0013. */
function nucleoComEstado({ com0011 = true, com0013 = true, painelAberto = false, reabrePainel = 0, janela = 1600, retratoComJanela = true } = {}) {
  const P = L.PARTE
  const partes = { [P.lateral]: { visible: false, width: 420, height: 700 }, [P.secundaria]: { visible: false, width: 350, height: 700 }, [P.painel]: { visible: painelAberto, width: 900, height: 356 } }
  const chamadas = []
  const isSize = v => typeof v === 'number' && v >= 50 && v <= 10000
  const executar = async (cmd, arg) => {
    chamadas.push(cmd)
    if (cmd === L.CAPTURAR) {
      if (!com0011) throw new Error('not found')
      const retrato = { version: 1, parts: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(partes).map(([k, p]) => [k, p.visible ? p : { ...p, width: 0, height: 0 }])))) }
      // O núcleo da V19 diz de que tamanho é a janela; o anterior não (`retratoComJanela: false`).
      if (retratoComJanela) retrato.window = { width: janela, height: 900 }
      return retrato
    }
    if (cmd === L.APLICAR) {
      if (!com0011) throw new Error('not found')
      const painelAntes = partes[P.painel].visible
      for (const [n, s] of Object.entries(arg.parts || {})) {
        partes[n].visible = s.visible
        if (s.visible && isSize(s.width) && isSize(s.height)) { partes[n].width = s.width; partes[n].height = s.height }
      }
      // Medido no build 1 da V18: com o TERMINAL no painel, o núcleo reabre o painel ~12 ms depois de ele ser fechado
      // logo após um redimensionamento (a classe `nopanel` entra e sai). `reabrePainel` imita isso N vezes.
      if (painelAntes && !partes[P.painel].visible && reabrePainel > 0) { reabrePainel--; setTimeout(() => { partes[P.painel].visible = true }, 12) }
      return { applied: [], skipped: [] }
    }
    if (cmd === L.RESETAR_BARRA) { if (!com0013) throw new Error('not found'); return { pinned: ['workbench.view.explorer'], unpinned: [] } }
    return undefined
  }
  return { executar, partes, chamadas }
}

// ── voltar ao layout padrão ──
{
  const presets = { 'Minha tela': { salvoEm: 'x', nucleo: null, config: {} } }
  const a = armazenamentoFalso({ [L.CHAVE]: presets, [T.CHAVE_TAMANHOS]: { caixa: 240 } })
  const configGlobal = { 'workbench.statusBar.visible': true, 'workbench.activityBar.compact': true, 'editor.fontSize': 18 }
  const n = nucleoComEstado()
  const ordem = []
  const tamanhos = new T.Tamanhos({ armazenamento: a })
  const layouts = new L.Layouts({
    armazenamento: a, tamanhos,
    executar: async (cmd, ...args) => { ordem.push(cmd); return n.executar(cmd, ...args) },
    configuracao: { inspect: k => ({ globalValue: configGlobal[k] }), update: async (k, v) => { ordem.push('config'); if (v === undefined) delete configGlobal[k]; else configGlobal[k] = v } },
  })
  const r = await layouts.voltarAoPadrao()
  const P = L.PARTE
  checar('⛔ padrão: a caixa de escrever volta ao automático', tamanhos.ler().caixa === null)
  checar('⛔ padrão: numa janela larga (1600), a barra lateral escondida volta a 300 px, e fechada', n.partes[P.lateral].width === 300 && n.partes[P.lateral].visible === false, JSON.stringify(n.partes[P.lateral]))
  // ⚠️ V20 (t197): fechada. A conta da largura continua valendo e é cobrada na barra LATERAL, logo
  // abaixo — o que mudou foi qual parte nasce aberta, não como se calcula o tamanho.
  checar('⛔ V20, padrão: a barra secundária volta FECHADA (t197)', n.partes[P.secundaria].visible === false, JSON.stringify(n.partes[P.secundaria]))
  checar('⛔ padrão: painel fechado guarda a altura que tinha, e a frase conta isso', n.partes[P.painel].height === 356 && r.painelFechado === true && /painel de baixo estava fechado/.test(L.fraseDoPadrao(r)))
  checar('⛔ padrão: as configurações de tela saem (inclusive a barra compacta)', !('workbench.statusBar.visible' in configGlobal) && !('workbench.activityBar.compact' in configGlobal))
  checar('padrão (controle): configuração que não é de tela fica', configGlobal['editor.fontSize'] === 18)
  checar('⛔ padrão: os layouts com nome NÃO são tocados', JSON.stringify(a.guardado[L.CHAVE]) === JSON.stringify(presets))
  const i = c => ordem.indexOf(c)
  checar('⛔ padrão: configurações → vistas → ícones da barra → partes (a ordem que não desfaz o anterior)',
    ordem.lastIndexOf('config') < i(L.RESETAR_VISTAS) && i(L.RESETAR_VISTAS) < i(L.RESETAR_BARRA) && i(L.RESETAR_BARRA) < i(L.CAPTURAR), ordem.join(','))
  checar('padrão: três aplicações do retrato, uma captura entre a primeira e a segunda, e uma de conferência no fim',
    ordem.filter(c => c === L.APLICAR).length === 3 && ordem.filter(c => c === L.CAPTURAR).length === 3 &&
    ordem.lastIndexOf(L.CAPTURAR) > ordem.lastIndexOf(L.APLICAR), ordem.join(','))
  checar('padrão: os grupos do editor ficam iguais', ordem.includes(L.IGUALAR_GRUPOS))
  checar('⛔ padrão: com o núcleo completo, nada faltou e a frase é curta', r.faltou.length === 0 &&
    L.fraseDoPadrao(r).startsWith('A tela voltou ao layout padrão.') && /Os layouts com nome continuam salvos\.$/.test(L.fraseDoPadrao(r)), L.fraseDoPadrao(r))
}
{
  // A frase só diz que as configurações voltaram se voltaram: a gravação que falha, e o valor da PASTA aberta (que o
  // "voltar" no perfil não alcança e continua valendo), entram no que faltou.
  const n = nucleoComEstado()
  const layouts = new L.Layouts({ armazenamento: armazenamentoFalso(), executar: n.executar, configuracao: {
    inspect: k => (k === 'editor.minimap.enabled' ? { globalValue: true, workspaceValue: false } : {}),
    update: async k => { if (k === 'workbench.statusBar.visible') throw new Error('arquivo de configuração só de leitura') } } })
  const r = await layouts.voltarAoPadrao()
  const f = L.fraseDoPadrao(r)
  checar('⛔ padrão: configuração que não gravou NÃO é dita como voltou, e a frase diz qual',
    !r.voltou.includes('as configurações da tela') && /workbench\.statusBar\.visible/.test(f) && /não consegui gravar/.test(f), f)
  checar('⛔ padrão: valor definido pela pasta aberta (que continua valendo) é dito, com onde ele mora',
    /editor\.minimap\.enabled/.test(f) && /\.vscode/.test(f), f)
}
{
  const n = nucleoComEstado({ painelAberto: true })
  const layouts = new L.Layouts({ armazenamento: armazenamentoFalso(), executar: n.executar, configuracao: { inspect: () => ({}), update: async () => { } } })
  const r = await layouts.voltarAoPadrao()
  checar('⛔ padrão: painel aberto volta a 300 px de altura, e fecha', n.partes[L.PARTE.painel].height === 300 && n.partes[L.PARTE.painel].visible === false && r.painelFechado === false)
}
// ── V19, o caminho inteiro: "voltar ao padrão" em janela estreita, média e num núcleo sem o campo ──
{
  const P = L.PARTE
  const voltar = async opcoes => {
    const n = nucleoComEstado(opcoes)
    const layouts = new L.Layouts({ armazenamento: armazenamentoFalso(), executar: n.executar, configuracao: { inspect: () => ({}), update: async () => { } } })
    await layouts.voltarAoPadrao()
    return n.partes
  }
  const estreita = await voltar({ janela: 640 })
  // ⚠️ V20: a conta é a mesma da V19 (um quarto da janela, teto 300, piso 170) — mudou a PARTE que
  // nasce aberta. Quem responde por ela agora é a barra lateral; a secundária volta fechada.
  checar('⛔ V20: "voltar ao padrão" numa janela de 640 px dá 170 px à barra aberta, não 300',
    estreita[P.lateral].width === 170, JSON.stringify(estreita[P.lateral]))
  checar('⛔ V20: e a secundária volta fechada, em qualquer largura de janela (t197)',
    estreita[P.secundaria].visible === false, JSON.stringify(estreita[P.secundaria]))
  const media = await voltar({ janela: 1000 })
  checar('⛔ V20: numa janela de 1000 px, a barra aberta fica com 250 px (um quarto)',
    media[P.lateral].width === 250, String(media[P.lateral].width))
  const semCampo = await voltar({ janela: 640, retratoComJanela: false })
  checar('⛔ V19: num núcleo que não diz o tamanho da janela, o "voltar" pede o teto (300) — o comportamento de antes',
    semCampo[P.secundaria].width === 300, String(semCampo[P.secundaria].width))
}
{
  // O terminal no painel: o núcleo o reabre logo depois de a fase 3 fechá-lo. O "voltar" confere e fecha de novo.
  const n = nucleoComEstado({ painelAberto: true, reabrePainel: 1 })
  const layouts = new L.Layouts({ armazenamento: armazenamentoFalso(), executar: n.executar, configuracao: { inspect: () => ({}), update: async () => { } } })
  await layouts.voltarAoPadrao()
  await new Promise(r => setTimeout(r, 60))
  checar('⛔ padrão: com o terminal (o núcleo reabre o painel logo depois de fechar), o painel termina fechado',
    n.partes[L.PARTE.painel].visible === false && n.partes[L.PARTE.painel].height === 300, JSON.stringify(n.partes[L.PARTE.painel]))
}
{
  const n = nucleoComEstado({ com0011: false, com0013: false })
  const a = armazenamentoFalso({ [T.CHAVE_TAMANHOS]: { caixa: 240 } })
  const layouts = new L.Layouts({ armazenamento: a, tamanhos: new T.Tamanhos({ armazenamento: a }), executar: n.executar, configuracao: { inspect: () => ({}), update: async () => { } } })
  const r = await layouts.voltarAoPadrao()
  const f = L.fraseDoPadrao(r)
  checar('⛔ padrão sem os patches 0011 e 0013: a frase DIZ o que não voltou', /menos/.test(f) && /ícones fixados na barra lateral/.test(f) && /tamanho e a visibilidade das partes/.test(f), f)
  checar('padrão sem os patches: o que é nosso volta mesmo assim', new T.Tamanhos({ armazenamento: a }).ler().caixa === null)
  checar('padrão sem o 0011: não chama o aplicar às cegas', !n.chamadas.includes(L.APLICAR))
}

// ── o layout com nome leva a caixa ──
{
  const t = montar()
  const a = armazenamentoFalso({ [T.CHAVE_TAMANHOS]: { caixa: 190 } })
  const tamanhos = new T.Tamanhos({ armazenamento: a })
  t.layouts.tamanhos = tamanhos
  await t.layouts.salvar('Com caixa')
  checar('⛔ layout: salvar leva a altura da caixa', (t.guardado[L.CHAVE]['Com caixa'].tamanhos || {}).caixa === 190)
  await tamanhos.voltarAoPadrao()
  await t.layouts.aplicar('Com caixa')
  checar('⛔ layout: aplicar devolve a altura da caixa', tamanhos.ler().caixa === 190)
  await tamanhos.guardar('caixa', 90)
  t.guardado[L.CHAVE]['Antigo'] = { salvoEm: 'x', nucleo: null, config: {} }
  await t.layouts.aplicar('Antigo')
  checar('layout: um layout salvo antes da V18 (sem tamanhos) não mexe na caixa', tamanhos.ler().caixa === 90)
}
checar('layout: a barra de ícones compacta é configuração de tela (entra no layout e no padrão)', L.CONFIGURACOES_DO_LAYOUT.includes('workbench.activityBar.compact'))

// ── V19: o patch 0011 entrega o tamanho da janela, e a extensão faz a conta com ele ──
//
// Uma extensão NÃO mede a janela (a API não tem dimensão de janela, e a página de uma webview só enxerga a
// si mesma). Sem este campo no retrato, "voltar ao padrão" só sabe mandar um número fixo. Aqui o RETORNO do
// `captureSnapshot`, tirado do texto do patch, roda contra um serviço de mentira, e o que ele devolve entra
// no `retratoDoPadrao` de verdade: é o caminho inteiro, do núcleo à largura pedida.
{
  const fs = await import('node:fs')
  const patch = fs.readFileSync(path.join(REPO, 'patches', '0011-layout-capturar-e-aplicar.patch'), 'utf8')
  const linhas = patch.split('\n')
  const captura = linhas.findIndex(l => l.includes("registerCommand('_workbench.layout.captureSnapshot'"))
  const ini = captura < 0 ? -1 : linhas.findIndex((l, i) => i > captura && /^\+\treturn \{$/.test(l))
  const fim = ini < 0 ? -1 : linhas.findIndex((l, i) => i > ini && /^\+\t\};$/.test(l))
  let retrato = null
  if (ini >= 0 && fim > ini) {
    const corpo = linhas.slice(ini, fim + 1).map(l => l.slice(1)).join('\n')
    const layoutService = {
      mainContainerDimension: { width: 777.4, height: 555.6 },
      getPanelPosition: () => 2, getPanelAlignment: () => 'center',
    }
    // eslint-disable-next-line no-new-func
    try { retrato = new Function('layoutService', 'parts', 'containers', 'views', corpo)(layoutService, {}, {}, {}) } catch { retrato = null }
  }
  checar('⛔ 0011: o retrato do núcleo diz de que tamanho é a janela, em número inteiro',
    !!retrato && retrato.window && retrato.window.width === 777 && retrato.window.height === 556,
    JSON.stringify(retrato && retrato.window) || 'o trecho não está no patch')
  const P = L.PARTE
  const comRetratoDeVerdade = retrato && L.retratoDoPadrao('medidas', {
    ...retrato, parts: { [P.secundaria]: { visible: true, width: 350, height: 700 } }
  })
  checar('⛔ 0011 → extensão: com a janela de 777 px que o núcleo informou, a vista Tokens volta a 194 px',
    !!comRetratoDeVerdade && comRetratoDeVerdade.parts[P.secundaria].width === 194,
    comRetratoDeVerdade ? String(comRetratoDeVerdade.parts[P.secundaria].width) : 'sem retrato')
}

// ── o patch 0013 fala o nome que a extensão chama ──
{
  const fs = await import('node:fs')
  const nome = '0013-barra-lateral-volta-ao-padrao-do-produto'
  const patch = fs.readFileSync(path.join(REPO, 'patches', nome + '.patch'), 'utf8')
  checar('⛔ layout: o patch 0013 registra o comando que a extensão chama', patch.includes(`'${L.RESETAR_BARRA}'`))
  checar('layout: o 0013 lê a mesma lista de soltos do produto que o 0012, e grava', patch.includes('product.defaultUnpinnedViewContainers') && patch.includes('this.saveCachedViewContainers()'))
  checar('layout: o 0013 tem o .md do porquê e chega em LF', fs.existsSync(path.join(REPO, 'patches', nome + '.md')) && !patch.includes('\r'))
  // ⛔ O ícone que era o ATIVO na hora do padrão sumia só ao reabrir (medido no executável: Pesquisa fixada pelo menu
  // — o que também a abre —, Skills solta, "voltar ao padrão" → a Pesquisa continuava desenhada; com outro ícone
  // ativo antes, o padrão ficava certo). O `setCompositeBarItems` do núcleo troca os itens do modelo por objetos
  // novos e deixava o "item ativo" apontando para o objeto VELHO (fixado): ao fechar a barra, o núcleo perguntava ao
  // velho se ele estava fixado, ouvia "sim", e não redesenhava. Aqui o trecho do patch roda contra um modelo de
  // mentira com a mesma forma: depois de trocar os itens, o ativo tem de ser o objeto NOVO.
  {
    const linhas = patch.split('\n')
    const ini = linhas.findIndex(l => /^[ +]\tsetCompositeBarItems\(items: ICompositeBarItem\[\]\): void \{/.test(l))
    const fim = ini < 0 ? -1 : linhas.findIndex((l, i) => i > ini && /^[ +]\t\}\s*$/.test(l))
    let ativoDepois = 'o trecho não está no patch'
    if (ini >= 0 && fim > ini) {
      const corpo = linhas.slice(ini + 1, fim).filter(l => !l.startsWith('-')).map(l => l.slice(1)).join('\n')
      const modelo = {
        _items: [], activeItem: null,
        setItems(itens) { this._items = itens.map(i => ({ ...i })) },
        findItem(id) { return this._items.filter(i => i.id === id)[0] },
      }
      modelo.setItems([{ id: 'busca', pinned: true }, { id: 'arquivos', pinned: true }])
      modelo.activeItem = modelo.findItem('busca')
      const barra = { model: modelo, updateCompositeSwitcher() { } }
      // eslint-disable-next-line no-new-func
      new Function('items', corpo).call(barra, [{ id: 'busca', pinned: false }, { id: 'arquivos', pinned: true }])
      ativoDepois = modelo.activeItem && modelo.activeItem === modelo.findItem('busca') ? `novo (fixado: ${modelo.activeItem.pinned})` : 'o objeto velho (fixado: true)'
    }
    checar('⛔ 0013: trocar os itens da barra leva o item ATIVO junto (o ícone solto some ao fechar a barra, sem reabrir)',
      /^novo \(fixado: false\)$/.test(ativoDepois), ativoDepois)
  }
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
