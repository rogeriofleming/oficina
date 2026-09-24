// O REGISTRO EM DISCO (V8) — `extensoes/oficina-claude/registro.js`, em node puro, sem o editor.
//
// O que precisa ser verdade para o registro servir num incidente, e não virar outro problema:
//   1. o evento que importa ENTRA, com a hora;
//   2. o que é da pessoa (o que ela escreveu, o e-mail, token) NUNCA entra;
//   3. o normal fica calado;
//   4. o arquivo tem teto e gira;
//   5. um disco que falha não derruba quem anota.
//
// Uso:  node testes/registro.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const requerer = createRequire(import.meta.url)
const { Registro, limpar } = requerer(path.join(REPO, 'extensoes', 'oficina-claude', 'registro.js'))

const resultados = []
function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok: !!ok })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${nome}${detalhe !== undefined && !ok ? `  (${detalhe})` : ''}`)
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-registro-'))
const ler = arq => fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []

try {
  // 1. entra, com hora
  {
    const pasta = path.join(base, 'um')
    const r = new Registro(pasta, { agora: () => new Date('2026-09-12T23:00:00Z') })
    r.anotar('painel.aberto', { restaurada: false })
    const linhas = ler(r.arquivo)
    checar('registro: o evento entra, e a pasta nasce se não existir', linhas.length === 1 && linhas[0].evento === 'painel.aberto')
    checar('registro: cada linha traz a hora', linhas[0] && linhas[0].hora === '2026-09-12T23:00:00.000Z', linhas[0] && linhas[0].hora)
  }

  // 2. o que é da pessoa nunca entra
  {
    const pasta = path.join(base, 'dois')
    const r = new Registro(pasta)
    r.anotar('teste', { texto: 'segredo que a pessoa escreveu', email: 'pessoa@exemplo.com', conta: { email: 'x' }, token: 'sk-ant-xyz', estado: 'ociosa' })
    const cru = fs.readFileSync(r.arquivo, 'utf8')
    checar('registro: o que a pessoa escreveu não vai para o disco', !cru.includes('segredo que a pessoa escreveu'))
    checar('registro: e-mail e token não vão para o disco', !cru.includes('pessoa@exemplo.com') && !cru.includes('sk-ant-xyz'))
    // Controle positivo: o campo permitido, na MESMA linha, entrou — senão o teste acima passaria com o arquivo vazio.
    checar('registro (controle): o campo permitido da mesma linha entrou', ler(r.arquivo)[0].estado === 'ociosa')
    checar('registro: objeto aninhado não entra (poderia carregar qualquer coisa)', !('conta' in limpar({ conta: { email: 'x' } })))
    // ⚠️ Revisão de código (16/09/2026): erro de módulo ou de processo traz o caminho com o nome de usuário.
    // (Pasta pessoal de exemplo fora do padrão de sistema: a varredura de vazamento barra qualquer caminho real.)
    const pessoal = 'E:\\Perfis\\Fulana'
    const erro = limpar({ mensagem: "Cannot find module 'e:\\perfis\\fulana\\AppData\\x.js' e E:/Perfis/Fulana/y" }, { pastaPessoal: pessoal }).mensagem
    checar('⛔ registro: a pasta pessoal sai da mensagem, nas duas barras e sem diferença de maiúscula', !/fulana/i.test(erro) && /~\\AppData\\x\.js/.test(erro) && /~\/y/.test(erro), erro)
    checar('registro (controle): caminho fora da pasta pessoal continua inteiro', limpar({ mensagem: 'D:\\projeto\\a.js' }, { pastaPessoal: pessoal }).mensagem === 'D:\\projeto\\a.js')
    const longa = limpar({ mensagem: 'x'.repeat(2000) }).mensagem
    checar('registro: mensagem longa é cortada', longa.length <= 501, longa.length)
  }

  // 3. o normal fica calado (os eventos da conversa)
  {
    const pasta = path.join(base, 'tres')
    const r = new Registro(pasta)
    r.anotarDaConversa({ tipo: 'texto', texto: 'Oi' })
    r.anotarDaConversa({ tipo: 'pensando', texto: 'hmm' })
    r.anotarDaConversa({ tipo: 'fim', custoUsd: 0.01, erro: null })
    r.anotarDaConversa({ tipo: 'estado', estado: 'pensando' })
    r.anotarDaConversa({ tipo: 'estado', estado: 'ociosa' })
    checar('registro: texto, pensamento, fim sem erro e o vaivém pensando/ociosa ficam calados', ler(r.arquivo).length === 0)
    r.anotarDaConversa({ tipo: 'estado', estado: 'erro' })
    r.anotarDaConversa({ tipo: 'erro', mensagem: 'Não consegui abrir a conversa: x' })
    r.anotarDaConversa({ tipo: 'semLogin' })
    r.anotarDaConversa({ tipo: 'fim', custoUsd: 0, erro: 'error_during_execution' })
    const eventos = ler(r.arquivo).map(l => l.evento)
    checar('registro: estado, erro, sem login e fim com erro entram',
      eventos.join(',') === 'conversa.estado,conversa.erro,conversa.semLogin,conversa.fim', eventos.join(','))
  }

  // 4. teto e giro
  {
    const pasta = path.join(base, 'quatro')
    const r = new Registro(pasta, { teto: 300 })
    for (let i = 0; i < 20; i++) r.anotar('volta', { i })
    const atual = fs.statSync(r.arquivo).size
    checar('registro: o arquivo atual respeita o teto (mais uma linha, no máximo)', atual < 300 + 100, atual)
    checar('registro: o anterior vira .1', fs.existsSync(r.arquivo + '.1'))
    const ultimas = ler(r.arquivo).map(l => l.i)
    checar('registro: a linha mais recente está no arquivo atual', ultimas[ultimas.length - 1] === 19, ultimas.join(','))
    checar('registro: nunca mais de dois arquivos', fs.readdirSync(pasta).length === 2, fs.readdirSync(pasta).join(','))
  }

  // 5. disco que falha não derruba
  {
    const arquivoNoCaminho = path.join(base, 'cinco-e-arquivo')
    fs.writeFileSync(arquivoNoCaminho, 'não sou pasta')
    const r = new Registro(path.join(arquivoNoCaminho, 'sub'))
    let lancou = false
    let voltou
    try { voltou = r.anotar('x') } catch { lancou = true }
    checar('registro: pasta impossível não lança', !lancou)
    checar('registro: e diz que falhou, em vez de fingir', voltou === false && !!r.falhou, r.falhou)
    // Falha passageira: o caminho volta a existir, e a próxima linha grava.
    fs.rmSync(arquivoNoCaminho)
    checar('registro (controle): com o disco de volta, a linha grava', r.anotar('y') === true)
    checar('⛔ registro: depois de gravar de novo, deixa de dizer que falhou', r.falhou === null, r.falhou)
  }
} finally {
  fs.rmSync(base, { recursive: true, force: true })
}

const passou = resultados.every(r => r.ok)
console.log('\n' + JSON.stringify({ passou, total: resultados.length, falhas: resultados.filter(r => !r.ok).map(r => r.nome) }))
process.exit(passou ? 0 : 1)
