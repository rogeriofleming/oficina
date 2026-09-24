// QUEM É A EDIÇÃO, E ONDE ELA GUARDA OS DADOS — um lugar só.
//
// ⚠️ POR QUE ISTO EXISTE. Três scripts respondiam (ou precisavam responder) à mesma pergunta:
// `aplicar_produto.mjs` (que monta o produto), `carimbar_build.mjs` (que diz o que a pasta de saída é)
// e `conferir_edicao.mjs` (que recusa empacotar a edição errada). Com a resposta escrita em cada um,
// basta uma delas envelhecer para o carimbo dizer uma coisa e o binário ser outra — que é exatamente o
// defeito que o carimbo existe para impedir (achado de 12/09/2026, `conferir_edicao.mjs`).
//
// ⛔ A EDIÇÃO É DERIVADA DO ARTEFATO, nunca da bandeira de quem chamou. Quem tem `updateUrl` é a camada
// privada; o produto público não traz esse campo de propósito. Guardamos o FATO (tem ou não tem canal),
// nunca o endereço.

/** 'equipe' quando o produto mesclado tem canal de atualização; 'neutra' quando não tem. */
export function edicaoDoProduto(produto) {
  return produto && produto.updateUrl ? 'equipe' : 'neutra'
}

/**
 * A pasta, dentro de `%APPDATA%`, onde ESTE produto guarda os dados de quem usa (configurações, layout,
 * armazenamento do editor) — e onde o `canal-privado.txt` mora.
 *
 * A conta é a mesma do núcleo com o patch 0015: `userDataFolderName`, e sem ele `nameShort`. Se mudar
 * lá, muda aqui, e o critério que compara as duas acusa.
 */
export function pastaDeDados(produto) {
  if (!produto) return null
  return produto.userDataFolderName || produto.nameShort || null
}

/**
 * Aplica sobre o produto o bloco da edição, quando é a da equipe.
 *
 * O bloco (`__equipe` no `produto/product.json`) vive no repositório PÚBLICO de propósito: quem decide
 * que as duas edições não dividem a pasta de dados é o produto, não a camada privada. A camada continua
 * responsável só pelo endereço do canal — e é ela que, ao trazer `updateUrl`, define a edição.
 */
export function aplicarBlocoDaEdicao(base, blocoDaEquipe, chavesDaCamada = []) {
  if (edicaoDoProduto(base) !== 'equipe' || !blocoDaEquipe) return []
  const daCamada = new Set(chavesDaCamada)
  const aplicadas = []
  for (const [chave, valor] of Object.entries(blocoDaEquipe)) {
    // ⚠️ A CAMADA PRIVADA TEM A ÚLTIMA PALAVRA. Este bloco roda DEPOIS dela (é o `updateUrl` dela
    // que diz qual edição está sendo construída), então, sem esta guarda, um valor posto à mão na
    // camada seria sobrescrito pelo padrão do repositório em silêncio — e quem o pôs não saberia.
    // A trava da pasta, logo adiante, continua valendo sobre o RESULTADO, venha ele de onde vier.
    if (daCamada.has(chave)) continue
    base[chave] = valor
    aplicadas.push(chave)
  }
  return aplicadas
}

/**
 * O que impede as duas edições de voltarem a dividir a pasta: com canal de atualização, a pasta TEM de
 * ser outra. Devolve a lista de erros (vazia = está certo).
 *
 * ⚠️ Modo de falha que isto cobre: a chave sumir do bloco da edição, ou alguém apagá-la da camada
 * privada. O build sairia perfeito, o programa abriria perfeito, e as duas edições voltariam a escrever
 * no mesmo `%APPDATA%\OFICINA` — onde mora o segredo do canal. Nada quebraria; só a separação sumiria.
 */
export function conferirPastaDaEdicao(base, pastaPublica) {
  const erros = []
  const pasta = pastaDeDados(base)
  if (!pasta) {
    erros.push('o produto não diz em que pasta de dados ele guarda as coisas (userDataFolderName/nameShort)')
    return erros
  }
  if (edicaoDoProduto(base) === 'equipe' && pastaPublica && pasta === pastaPublica) {
    erros.push(`a edição com canal de atualização ficaria na MESMA pasta de dados da pública ("${pasta}") — ` +
      'é lá que o segredo do canal mora. Declare userDataFolderName no bloco __equipe do produto.')
  }
  return erros
}
