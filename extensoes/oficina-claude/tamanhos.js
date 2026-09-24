// OS TAMANHOS DA TELA DA CONVERSA (V18) — o que a pessoa arrastou, guardado sozinho, sem botão.
//
// ⚠️ SÓ O QUE É NOSSO. Barra lateral, painel, grupos de editor e a posição das vistas o próprio editor
// redimensiona e guarda (medido na V18: a largura arrastada da barra lateral e a altura do painel voltam
// iguais depois de fechar e reabrir). Aqui mora o que ele não alcança: as partes de DENTRO da conversa,
// que é uma página nossa.
//
// ⚠️ NULO É "AUTOMÁTICO", NÃO ZERO. A caixa de escrever nasce crescendo com o texto (de uma linha até 40%
// da janela). Quem arrasta a alça escolhe a altura dela em repouso; quem volta ao padrão volta ao
// automático. Por isso o padrão não é um número: um número congelaria a altura de uma linha que a fonte
// da pessoa pode não ter.
//
// ⚠️ Salvar é automático aqui, ao contrário dos layouts com nome (`layout.js`): lá o caso era "um bug
// desfez a arrumação" e salvar sozinho gravaria a tela desfeita por cima da boa; aqui é o estado de
// agora, e o pedido é "salve do jeito que eu deixar".
//
// Nada aqui usa `require('vscode')`: `testes/layout.mjs` prova tudo em node puro.

'use strict'

const CHAVE_TAMANHOS = 'oficina.layout.tamanhos'

/** As partes redimensionáveis e os limites de cada uma, em px. */
const PARTES = {
  // Mínimo: uma linha de texto com o respiro de cima e de baixo (o `#entrada` tem 6 px de cada lado e
  // linha de 1,5). Máximo: um teto de sanidade para o valor GUARDADO — na tela, quem manda é a altura da
  // janela (a página não deixa passar de 70% dela).
  caixa: { minimo: 32, maximo: 1200 },
}

/** O valor como vai ser guardado: inteiro dentro dos limites, `null` (automático), ou o motivo de não servir. */
function normalizar(parte, valor) {
  // `Object.hasOwn`, e não `PARTES[parte]` sozinho: o nome vem da página, e `PARTES['__proto__']` (ou `constructor`,
  // `toString`) devolve o que o objeto HERDA — que passava por parte válida e gravava `NaN` no perfil.
  const limites = typeof parte === 'string' && Object.hasOwn(PARTES, parte) ? PARTES[parte] : null
  if (!limites) return { erro: `parte desconhecida: ${parte}` }
  if (valor === null || valor === undefined) return { valor: null }
  const n = Number(valor)
  if (!Number.isFinite(n)) return { erro: `tamanho inválido para ${parte}` }
  return { valor: Math.min(limites.maximo, Math.max(limites.minimo, Math.round(n))) }
}

class Tamanhos {
  /** @param {{ armazenamento: { get(chave: string): any, update(chave: string, valor: any): Promise<void> } }} deps */
  constructor({ armazenamento }) {
    this.armazenamento = armazenamento
    this._ouvintes = new Set()
  }

  /** Todos os tamanhos, com `null` onde é automático. O que estiver estragado no disco vira automático. */
  ler() {
    const guardado = this.armazenamento.get(CHAVE_TAMANHOS)
    const r = {}
    for (const parte of Object.keys(PARTES)) {
      const v = guardado && typeof guardado === 'object' ? normalizar(parte, guardado[parte]) : { valor: null }
      r[parte] = v.erro ? null : v.valor
    }
    return r
  }

  /**
   * Guarda um tamanho. Devolve `{ parte, valor }` (o valor já normalizado) ou `{ erro }`. `origem` (a tela que
   * mudou) vai junto no aviso, para ela não receber o próprio eco.
   */
  async guardar(parte, valor, origem) {
    const v = normalizar(parte, valor)
    if (v.erro) return v
    const atual = this.ler()
    if (atual[parte] === v.valor) return { parte, valor: v.valor, igual: true }
    await this.armazenamento.update(CHAVE_TAMANHOS, { ...atual, [parte]: v.valor })
    this._avisar(origem)
    return { parte, valor: v.valor }
  }

  /** Põe vários de uma vez (um layout com nome aplicado). Parte desconhecida é ignorada. */
  async aplicar(tamanhos) {
    const novo = this.ler()
    for (const parte of Object.keys(PARTES)) {
      if (!tamanhos || !(parte in tamanhos)) continue
      const v = normalizar(parte, tamanhos[parte])
      if (!v.erro) novo[parte] = v.valor
    }
    await this.armazenamento.update(CHAVE_TAMANHOS, novo)
    this._avisar()
  }

  /** Tudo de volta ao automático. */
  async voltarAoPadrao() {
    await this.armazenamento.update(CHAVE_TAMANHOS, undefined)
    this._avisar()
  }

  /** Quem precisa redesenhar quando um tamanho muda (as telas de conversa abertas). */
  aoMudar(fn) {
    this._ouvintes.add(fn)
    return { dispose: () => this._ouvintes.delete(fn) }
  }

  _avisar(origem) {
    const agora = this.ler()
    for (const fn of [...this._ouvintes]) { try { fn(agora, origem) } catch { } }
  }
}

module.exports = { Tamanhos, normalizar, PARTES, CHAVE_TAMANHOS }
