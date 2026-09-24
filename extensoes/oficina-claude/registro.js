// O REGISTRO — o que a OFICINA grava em disco para que um incidente tenha causa, e não palpite.
//
// ⚠️ POR QUE EXISTE (V8). Até aqui tudo que dava errado ia para `console.log`, que só aparece no
// log do host de extensão — um lugar que quem usa o programa não sabe que existe. Quando a conversa
// parava de responder, não havia uma linha sequer para ler depois. Sem registro, a pergunta "o que
// aconteceu?" só tem palpite como resposta.
//
// ⚠️ O QUE ENTRA, E O QUE NUNCA ENTRA.
//   - Entra: mudança de estado da conversa, erro, falta de login ou de pasta, painel aberto/fechado,
//     comando que não rodou, ação da tela de socorro. Uma linha JSON por evento, com a hora.
//   - NUNCA entra: o que a pessoa escreve, o que o agente responde, conteúdo de arquivo, e-mail da
//     conta, token. `limpar()` corta os campos que poderiam trazer isso, e o teste prova.
//   - O que é normal fica calado: pedaço de texto, pensamento, custo de cada turno. Registro que
//     anota tudo vira ruído, e ruído ensina a não ler.
//
// ⚠️ TAMANHO COM TETO. Passou do limite, o arquivo atual vira `.1` (o `.1` anterior some) e começa
// um novo. Nunca cresce sem fim num programa que fica aberto o dia inteiro.
//
// Nada aqui usa `require('vscode')`: o registro roda em node puro, e `testes/registro.mjs` o prova
// sem abrir o editor.

const fs = require('fs')
const path = require('path')

const NOME = 'oficina.log'
const TETO_PADRAO = 512 * 1024

/** Os eventos da conversa que valem uma linha. O resto (texto, pensando, custo) é o normal. */
const EVENTOS_QUE_ENTRAM = new Set(['estado', 'erro', 'semLogin', 'semPasta', 'cancelado', 'fim'])
/** Dos estados, só os que mudam a história (os nomes são os de `ESTADO`, em `agente.js`). */
const ESTADOS_QUE_ENTRAM = new Set(['abrindo', 'parada', 'erro'])

/** Campos que podem trazer conteúdo da pessoa ou da conta — nunca vão para o disco. */
const CAMPOS_PROIBIDOS = new Set(['texto', 'entrada', 'pedido', 'conteudo', 'conta', 'email', 'mensagemDaPessoa', 'prompt', 'token'])

/**
 * ⚠️ A PASTA PESSOAL SAI DO TEXTO (revisão de código, 16/09/2026). Mensagem de erro de módulo que não
 * carregou ou de processo que não abriu traz o caminho inteiro — com o nome de usuário do computador — e o
 * socorro pede para anexar este arquivo quando for pedir ajuda. A pasta pessoal vira `~`, nas duas grafias
 * de barra e sem diferença de maiúscula (o Windows não diferencia).
 */
function semPastaPessoal(texto, pastaPessoal = require('os').homedir()) {
  if (!pastaPessoal || typeof texto !== 'string') return texto
  const variantes = new Set([pastaPessoal, pastaPessoal.replace(/\\/g, '/'), pastaPessoal.replace(/\//g, '\\')])
  let saida = texto
  for (const v of variantes) {
    const escapada = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    saida = saida.replace(new RegExp(escapada, 'gi'), '~')
  }
  return saida
}

function limpar(dados, { pastaPessoal } = {}) {
  if (!dados || typeof dados !== 'object') return {}
  const saida = {}
  for (const [chave, valor] of Object.entries(dados)) {
    if (CAMPOS_PROIBIDOS.has(chave)) continue
    if (valor === null || ['string', 'number', 'boolean'].includes(typeof valor)) {
      const texto = typeof valor === 'string' ? semPastaPessoal(valor, pastaPessoal) : valor
      // Mensagem de erro pode ser longa (pilha inteira): o começo basta para achar a causa.
      saida[chave] = typeof texto === 'string' && texto.length > 500 ? texto.slice(0, 500) + '…' : texto
    }
  }
  return saida
}

class Registro {
  /**
   * @param {string} pasta  onde gravar (na extensão, `context.logUri`)
   * @param {{ teto?: number, agora?: () => Date }} opcoes
   */
  constructor(pasta, { teto = TETO_PADRAO, agora = () => new Date() } = {}) {
    this.pasta = pasta
    this.arquivo = path.join(pasta, NOME)
    this.teto = teto
    this.agora = agora
    // Registro que falha não pode derrubar o programa que ele existe para explicar.
    this.falhou = null
  }

  /** Anota um evento. Nunca lança. */
  anotar(evento, dados = {}) {
    try {
      fs.mkdirSync(this.pasta, { recursive: true })
      this._girarSePreciso()
      const linha = JSON.stringify({ hora: this.agora().toISOString(), evento, ...limpar(dados) })
      fs.appendFileSync(this.arquivo, linha + '\n', 'utf8')
      // ⚠️ Falha passageira não é falha para sempre (revisão de código, 16/09/2026): um arquivo preso por um
      // instante (antivírus, giro do arquivo) deixava o socorro dizendo "não consegui gravar o registro"
      // até fechar o programa, com o arquivo recebendo linhas normalmente.
      this.falhou = null
      return true
    } catch (e) {
      this.falhou = String((e && e.message) || e)
      return false
    }
  }

  /** Um evento da conversa: só os que valem uma linha, e `fim` só quando terminou com erro. */
  anotarDaConversa(evento) {
    if (!evento || !EVENTOS_QUE_ENTRAM.has(evento.tipo)) return false
    if (evento.tipo === 'fim' && !evento.erro) return false
    // Pensando/ociosa/esperando acontecem a cada mensagem: são o normal. Abrir, parar e dar erro contam a história.
    if (evento.tipo === 'estado' && !ESTADOS_QUE_ENTRAM.has(evento.estado)) return false
    const { tipo, ...resto } = evento
    return this.anotar('conversa.' + tipo, resto)
  }

  _girarSePreciso() {
    let tamanho = 0
    try { tamanho = fs.statSync(this.arquivo).size } catch { return }
    if (tamanho < this.teto) return
    const anterior = this.arquivo + '.1'
    try { fs.rmSync(anterior, { force: true }) } catch { }
    fs.renameSync(this.arquivo, anterior)
  }
}

module.exports = { Registro, limpar, NOME, EVENTOS_QUE_ENTRAM }
