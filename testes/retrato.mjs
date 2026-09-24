// RETRATO — a foto do produto TRABALHANDO, para o dossiê visual.
//
// Não é um teste: é o que produz a evidência que a lei dos revisores manda guardar a
// cada versão ("foto da tela real do build carimbado, num dossiê, sem mandar").
//
// Por que existe separado do `interface.mjs`: aquele fotografa a tela de ABERTURA, que
// é vazia de propósito. A revisão de beleza da V1 apontou o buraco com todas as letras:
// numa tela sem aba, sem código, sem terminal e sem item selecionado, **a identidade
// quase toda não aparece** — a brasa marcava 0,025% dos pixels, e o laudo saiu sobre
// três superfícies. Aqui o produto é posto para trabalhar antes do clique.
//
// Uso:  node testes/retrato.mjs [caminho do exe] [--claro]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RAIZ, carregarElectron, acharExe, abrirOficina, esconderJanela, fecharApp, tirarFoto } from './comum.mjs'

const _electron = await carregarElectron()
const claro = process.argv.includes('--claro')
const exe = acharExe(process.argv.slice(2).find(a => !a.startsWith('--')))
if (!exe || !fs.existsSync(exe)) {
  console.log(JSON.stringify({ ok: false, erro: 'nao achei o executavel', procurei: RAIZ }))
  process.exit(1)
}

const area = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-retrato-'))
const projeto = path.join(area, 'projeto')
fs.mkdirSync(projeto)

// ⚠️ O TEMA ENTRA PELO PERFIL, NAO PELA PALETA.
//
// Duas tentativas pela paleta sairam com a foto no tema errado, em silencio: um tema
// nao e comando, entao `>OFICINA Claro` nao casa com nada e o Enter escolhe o
// primeiro item da lista; e `>Preferences: Color Theme` seguido do nome tambem nao
// pegou. Nenhuma das duas ERRA -- as duas fotografam o tema errado, que e pior.
// Aqui a configuracao de usuario e escrita no perfil descartavel antes de abrir, o
// mesmo mecanismo do `--settings=` do interface.mjs.
if (claro) {
  const userDir = path.join(area, 'dados', 'User')
  fs.mkdirSync(userDir, { recursive: true })
  fs.writeFileSync(path.join(userDir, 'settings.json'),
    JSON.stringify({ 'workbench.colorTheme': 'OFICINA Claro' }, null, 2))
}

// Código de verdade, do próprio projeto: comentário, cadeia, número, palavra-chave,
// função, tipo e um erro proposital — para a sintaxe aparecer inteira na foto.
fs.writeFileSync(path.join(projeto, 'aplicar_produto.mjs'), `// as tres chaves que, se sumirem, o build precisa parar
const OBRIGATORIAS = ['nameShort', 'extensionsGallery', 'configurationDefaults']

/**
 * Mescla o nosso product.json por cima do que veio do upstream.
 * @param {string} clone  a pasta do clone
 * @param {string} raiz   a raiz do repositorio
 */
export function aplicarProduto(clone, raiz, camada) {
  const base = lerJson(join(clone, 'product.json'))
  const nosso = lerJson(join(raiz, 'produto', 'product.json'))

  for (const chave of OBRIGATORIAS) {
    if (!(chave in nosso)) {
      throw new Error(\`chave obrigatoria ausente: \${chave}\`)
    }
  }

  // __remover: some do produto sem sumir do upstream
  for (const chave of nosso.__remover ?? []) delete base[chave]

  const final = { ...base, ...nosso }
  delete final.__remover
  gravar(clone, final, 2)
  return Object.keys(final).length
}
`)
fs.writeFileSync(path.join(projeto, 'leia-me.md'), '# projeto de teste\n\nUm arquivo para a arvore ter mais de um item.\n')
fs.mkdirSync(path.join(projeto, 'temas'))
fs.writeFileSync(path.join(projeto, 'temas', 'oficina-escuro.json'), '{ "name": "OFICINA Escuro" }\n')

const respirar = (ms) => new Promise(r => setTimeout(r, ms))
let app
try {
  app = await abrirOficina(_electron, {
    exe, projeto, area,
    // A tela de abertura fecha a lateral e abre a conversa; aqui queremos o editor.
    opcoes: {}
  })
  const win = await app.firstWindow({ timeout: 60000 })
  await esconderJanela(app)
  await win.waitForSelector('.monaco-workbench', { timeout: 60000 })
  await respirar(10000)

  const wb = win.locator('.monaco-workbench').first()
  const paleta = async (texto) => {
    await wb.press('Control+Shift+P')
    await win.waitForSelector('.quick-input-widget', { timeout: 10000 })
    await win.keyboard.type(texto)
    await respirar(1200)
    await win.keyboard.press('Enter')
    await respirar(2500)
  }

  await paleta('>View: Show Explorer')                // a lateral de volta
  await respirar(1500)
  // abre o arquivo pelo nome
  await wb.press('Control+P')
  await win.waitForSelector('.quick-input-widget', { timeout: 10000 })
  await win.keyboard.type('aplicar_produto.mjs')
  await respirar(1500)
  await win.keyboard.press('Enter')
  await respirar(3000)
  await paleta('>View: Toggle Terminal')              // o terminal embaixo
  await respirar(6000)
  // cursor numa linha do meio, para a linha atual e o numero ativo aparecerem
  await win.keyboard.press('Escape')
  await wb.press('Control+g')
  await respirar(800)
  await win.keyboard.type('12')
  await win.keyboard.press('Enter')
  await respirar(1500)
  // ⚠️ a caixa do "ir para a linha" fica na tela depois do Enter e entra na foto:
  // um clique no editor tira o foco dela sem mexer no que esta aberto
  await win.locator('.monaco-editor').first().click({ position: { x: 300, y: 200 } })
  await respirar(2500)

  const destino = path.join(RAIZ, 'log', `retrato_${claro ? 'claro' : 'escuro'}_${Date.now()}.png`)
  await tirarFoto(win, destino)
  console.log('foto: ' + destino)
} catch (e) {
  console.log('ERRO: ' + (e && e.message || e))
  process.exitCode = 1
} finally {
  if (app) await fecharApp(app)
  try { fs.rmSync(area, { recursive: true, force: true }) } catch {}
}
