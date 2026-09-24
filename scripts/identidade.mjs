// Fonte ÚNICA da regra de identidade do produto.
//
// Por que existe: a mesma regra estava escrita em dois lugares — no
// aplicar_produto.mjs (que aborta o build) e no regressao.mjs (que a revisao final
// roda) — e as duas listas tinham divergido: 12 campos de um lado, 6 do outro.
// A revisao final ficava mais fraco que o portão de build, e ninguém percebia porque
// os dois estavam "verdes". Duas cópias de uma regra é uma cópia que envelhece.
//
// Achado por uma revisao independente/REGRESSÃO do ciclo da V0, em 05/09/2026.

// Marcas de terceiro que não podem aparecer na identidade do produto: disso
// depende o direito de distribuir o fork.
// "vs code" (com espaço) entra porque é a forma que mais se digita sem pensar.
export const MARCAS_PROIBIDAS = [
  'visual studio code', 'vs code', 'vscode', 'code - oss',
  'claude', 'anthropic', 'microsoft'
]

// Todo campo do product.json que vira nome visível, pasta, chave de registro,
// mutex ou protocolo. Um nome de terceiro em qualquer um deles é o mesmo problema.
export const CAMPOS_DE_NOME = [
  // `userDataFolderName` entrou em 20/09/2026 (patch 0015): ele nomeia a pasta de %APPDATA% de cada
  // edição, e pasta é nome visível — a mesma razão de `dataFolderName` estar aqui desde o começo.
  'nameShort', 'nameLong', 'applicationName', 'dataFolderName', 'userDataFolderName',
  'win32DirName', 'win32NameVersion', 'win32RegValueName', 'win32ShellNameShort',
  'win32MutexName', 'win32AppUserModelId', 'urlProtocol', 'serverApplicationName'
]

/** Devolve a lista de violações (vazia = limpo). */
export function conferirIdentidade(produto) {
  const erros = []
  for (const campo of CAMPOS_DE_NOME) {
    const valor = String(produto[campo] ?? '').toLowerCase()
    for (const marca of MARCAS_PROIBIDAS) {
      if (valor.includes(marca)) erros.push(`${campo} = "${produto[campo]}" contem "${marca}"`)
    }
  }
  return erros
}
