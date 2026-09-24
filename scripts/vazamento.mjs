// Fonte ÚNICA das regras de "nada da casa no repositório público" (critério 14).
//
// Por que este arquivo existe separado: o arquivo que DEFINE os padrões contém,
// por definição, os próprios padrões — e a varredura passou a se acusar sozinha
// assim que ficou boa o bastante. Um alarme que sempre toca ensina a ignorar o
// alarme. Então as regras moram aqui, e a varredura pula ESTE arquivo e só ele,
// declaradamente: é curto, e cabe inteiro numa revisão de olho.
//
// ⚠️ Justamente por ser o único ponto cego, nada além das regras pode entrar aqui.
//
// Achado no ciclo da V0, em 05/09/2026, por duas revisões independentes.

// O nome deste arquivo, para a varredura poder se pular sem adivinhar.
export const ARQUIVO_DAS_REGRAS = 'vazamento.mjs'

/**
 * Os arquivos do PROPRIO detector, que a varredura tem que pular.
 *
 * Eles contem exemplos de segredo de proposito: e assim que se prova que a regra
 * pega o que deve. Varre-los e garantir alarme permanente -- e alarme que sempre
 * toca ensina a ignorar o alarme, que e exatamente o que este arquivo diz na
 * primeira linha.
 *
 * ⚠️ A lista e NOMINAL e curta de proposito. Nao vira padrao ("pule tudo que se
 * chama *_teste"), porque ai bastaria nomear um arquivo assim para esconder um
 * segredo de verdade dentro dele. Dois arquivos, os dois do mecanismo:
 *   - `vazamento.mjs`      as regras (os padroes moram no codigo);
 *   - `vazamento_regras.mjs` os casos que provam as regras.
 *
 * Achado em 06/09/2026, rodando a regressao no build carimbado: o criterio 14
 * estava vermelho por DOIS motivos, e o segundo (este) ninguem tinha visto porque o
 * primeiro (a arte embutida no SVG) ja o deixava vermelho.
 */
export const ARQUIVOS_DO_DETECTOR = [
  'scripts/vazamento.mjs',
  'testes/vazamento_regras.mjs',
]

/**
 * O arquivo e do proprio detector? Casa por CAMINHO, nunca por nome.
 *
 * A primeira versao comparava `path.basename(rel)`, e a revisao final provou o buraco:
 * `extensoes/oficina-claude/vazamento.mjs` era PULADO. Ou seja, o mecanismo que o
 * comentario acima diz evitar ("bastaria nomear um arquivo assim para esconder
 * segredo") existia do mesmo jeito -- so que com dois nomes em vez de um padrao.
 */
export function ehArquivoDoDetector(caminhoRelativo) {
  const normal = String(caminhoRelativo).replace(/\\/g, '/')
  return ARQUIVOS_DO_DETECTOR.includes(normal)
}

/**
 * O que NAO se varre por ser binario.
 *
 * ⚠️ Esta lista mora AQUI porque ja custou caro estar em dois lugares: `regressao.mjs`
 * e `vazamento_historico.mjs` tinham copias divergentes -- uma varria `.svg`, a outra
 * pulava -- e foi essa divergencia que deixou o criterio 14 vermelho por semanas sem
 * ninguem ver. Eu declarei o conserto como feito e tinha unificado so METADE: o
 * revisao final mediu e a lista de binarios continuava duplicada.
 *
 * ⚠️ `.svg` NAO entra: SVG e texto e precisa ser varrido nos dois lugares (arquivos e
 * historico). Um segredo commitado dentro de um `.svg` no passado era invisivel para
 * a varredura de historico enquanto ela o pulava. Quem trata a ARTE embutida em SVG e
 * `tirarArteEmbutida`, abaixo -- que tira a arte, nao o arquivo.
 */
export const EXTENSOES_BINARIAS = /\.(png|ico|jpg|jpeg|gif|webp|zip|exe|asar|node|woff2?|ttf|pdf|vsix|mp4)$/i

export const REGRAS = [
  // As quatro pessoas da equipe. A borda de palavra protege o dono do
  // repositório: o nome solto é proibido, mas a conta pública dele não casa,
  // porque dentro do nome de usuário não há borda.
  // ⚠️ MÉTODO INTERNO — a categoria que faltava, e que deixou 48 ocorrências passarem.
  //
  // O §2 do plano proíbe no repositório público, com estas palavras: "cliente, caminho
  // de máquina, **método interno**, menção a pessoas". As regras abaixo cobriam nome,
  // caminho e segredo — e nada cobria o vocabulário. Resultado, medido por uma revisão
  // independente em 10/09/2026: 26 ocorrências de uma palavra do jargão interno e 22
  // referências a documentos que só existem no repositório privado, espalhadas por 16
  // arquivos rastreados, **com a varredura passando limpa por cima**.
  //
  // Não é segredo nem dado pessoal — é como a casa chama as coisas, e o nome dos
  // documentos onde as decisões moram. Num repositório aberto, isso descreve para
  // estranhos um método que não é deles, e aponta para arquivos que eles nunca terão.
  //
  // As duas primeiras têm limite de palavra para não pegar "cofrinho" ou nomes de
  // variável que só contenham o pedaço.
  { re: /\bcofres?\b/i, oque: 'metodo interno (vocabulario da casa)' },
  { re: /\boficina-interno\b/i, oque: 'metodo interno (repositorio privado citado)' },
  // 24/09/2026, na estreia: o repositorio de trabalho passou a se chamar `oficina-privado`, e o
  // nome `oficina` ficou com o PUBLICO. O nome novo e tao sensivel quanto a pasta interna --
  // um documento publico que o cite entrega onde mora o historico com a identidade da casa.
  { re: /\boficina-privado\b/i, oque: 'repositorio privado citado pelo nome' },
  { re: /\bVERSOES\.md\b/, oque: 'metodo interno (documento privado citado)' },
  { re: /\bPLANO_V1(\.md)?\b/, oque: 'metodo interno (documento privado citado)' },

  // ⚠️ E O VOCABULÁRIO DE REVISÃO — a mesma categoria, incompleta pela segunda vez
  // (revisão de código, 10/09/2026, noite). Uma limpeza anterior tirou estas palavras à
  // mão e elas voltaram em 12 linhas, com a varredura verde por cima: o nome do revisor
  // que fecha a versão, o das revisões por ângulo, o do ritual e o das sessões. O ritual
  // só com o `§`: "o ciclo rápido" de desenvolvimento é palavra comum, e acusá-la
  // ensinaria a ignorar o alarme.
  { re: /\bguardi[ãa]o(es|ões)?\b/i, oque: 'metodo interno (vocabulario de revisao)' },
  { re: /\blentes?\b/i, oque: 'metodo interno (vocabulario de revisao)' },
  { re: /§\s*CICLO\b/, oque: 'metodo interno (vocabulario de revisao)' },
  { re: /\bOficina \d+\b/, oque: 'metodo interno (nome de sessao)' },

  { re: /\bmirian\b/i, oque: 'nome de pessoa' },
  { re: /\bwanessa\b/i, oque: 'nome de pessoa' },
  { re: /\bpaulo\b/i, oque: 'nome de pessoa' },
  { re: /\broger\b/i, oque: 'nome de pessoa' },
  { re: /\bmano\b/i, oque: 'nome de pessoa' },
  { re: /\balex\b/i, oque: 'nome de pessoa' },

  // Caminho de máquina, nos QUATRO formatos em que ele aparece de verdade.
  // Cobrir menos que os quatro deixa passar exatamente a fração que falta — foi
  // o que aconteceu duas vezes: primeiro só a barra do Windows (e o vazamento
  // estava com a do JavaScript), depois as duas (e o formato do Git Bash, que é
  // o que esta máquina usa o dia inteiro, continuava passando).
  { re: /C:[\\/]Users[\\/]/i, oque: 'caminho de maquina' },              // C:\Users e C:/Users
  { re: /[A-Z]:[\\/]Claude Code/i, oque: 'caminho de maquina' },
  { re: /[A-Z]:[\\/]oficina-build/i, oque: 'caminho de maquina fixo' },
  { re: /\/[a-z]\/Users\//i, oque: 'caminho de maquina (Git Bash)' },     // /c/Users/...
  { re: /\/[a-z]\/Claude Code/i, oque: 'caminho de maquina (Git Bash)' },
  { re: /[A-Z]:\\\\(Users|Claude Code|oficina-build)/i, oque: 'caminho de maquina (JSON escapado)' },

  // Nome de máquina do Windows. Vaza em log, em erro de build e em caminho.
  { re: /\b(DESKTOP|LAPTOP)-[A-Z0-9]{7}\b/i, oque: 'nome de maquina' },

  // Endereço privado.
  { re: /oficina\.rogeriofleming\.com\.br/i, oque: 'endereco privado' },

  // ⚠️ E-MAIL: por PADRÃO, não por valor.
  //
  // A revisao final achou o buraco certo — os e-mails da casa não casavam com
  // regra nenhuma (`\bmirian\b` não pega `…@mirianwanda.com.br`, porque não há borda
  // de palavra entre as duas partes) — e propôs listar os dois endereços aqui. Fazer
  // isso seria **escrever os e-mails no repositório público**: este arquivo é o único
  // que a varredura pula, e ele vai publicado como todos os outros. O remédio
  // publicaria a doença.
  //
  // Então a regra é a inversa e cobre mais: **qualquer e-mail** é suspeito, menos os
  // de domínios que não pertencem a ninguém da casa e aparecem legitimamente em
  // cabeçalho de licença, autoria neutra e nota de robô.
  {
    fn: (txt) => {
      // Domínios que não pertencem a ninguém: os reservados para exemplo e teste
      // (RFC 2606 e o equivalente em português que os testes daqui usam), o
      // `localhost` da autoria neutra deste repositório, e os de robô/licença.
      const ACEITOS = /@(localhost|(example|exemplo)\.[a-z]+|[a-z0-9.-]*\.(invalid|invalido|test|example)|anthropic\.com|users\.noreply\.github\.com|github\.com)$/i
      const achados = txt.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
      return achados.some(e => !ACEITOS.test(e))
    },
    oque: 'e-mail'
  },

  // ⚠️ SEGREDO: por ENTROPIA, não por prefixo conhecido.
  //
  // A regra antiga procurava `sk-ant|gho_|ghp_|AIza` — filtrar por FORMATO é
  // exatamente a causa-raiz que a casa já pagou duas vezes: uma chave real de IA
  // usada aqui começa com `AQ.A…` e passaria batido por esta lista, e um token pode
  // não ter prefixo nenhum. Os prefixos continuam (são baratos e pegam o caso óbvio),
  // mas quem decide é a entropia da cadeia.
  { re: /\b(sk-ant|gho_|ghp_|github_pat_|AIza|xox[baprs]-)[A-Za-z0-9_-]{8,}/, oque: 'segredo (formato conhecido)' },
  {
    fn: (txt) => {
      // ⚠️ Blocos CONTÍGUOS, sem `.`, `-`, `_` ou `/` dentro.
      //
      // A primeira versão media a entropia da cadeia inteira com os separadores, e
      // acusou três coisas inocentes na primeira rodada:
      // `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` (id de componente do
      // Visual Studio), `monaco-decoration-itemBadge-kkyaq5` (classe de CSS) e um
      // caminho de módulo. Identificador legível é feito de palavras curtas coladas
      // por separador — a entropia sobe por causa da VARIEDADE, não porque haja
      // aleatoriedade. Segredo é uma tira contígua de caracteres sem sentido.
      // Medir bloco a bloco separa os dois casos sem baixar o limiar, e um alarme
      // que sempre toca ensina a ignorar o alarme.
      // ⚠️ Hash de integridade de `package-lock.json` NÃO é segredo — é o hash do
      // pacote PÚBLICO, e o npm escreve um por dependência. Mas ele é base64, não hex:
      // mistura caixa e dígito, passa de 24 caracteres contíguos e tem entropia alta.
      // Cai em todos os filtros abaixo e acusa um arquivo inteiro de uma vez — alarme
      // que sempre toca.
      //
      // O valor INTEIRO sai do texto antes da varredura, e não por pular o arquivo:
      // pular arquivo cria ponto cego, e um segredo de verdade não mora atrás de um
      // prefixo de hash.
      //
      // ⚠️ E tem que ser o valor inteiro, não o primeiro pedaço dele. A primeira versão
      // desta regra olhava só o que vinha ANTES do bloco (`sha512-`) e continuou
      // acusando o arquivo real: base64 tem `/` e `+` no meio, então o npm produz
      // VÁRIOS blocos contíguos por hash, e do segundo em diante não há prefixo nenhum
      // atrás. Pior: o caso-teste que eu tinha escrito passava, porque a cadeia
      // inventada não tinha `/` — teste que não reproduz o formato real não prova nada.
      const limpo = txt.replace(/\b(sha512|sha384|sha256|sha1)-[A-Za-z0-9+/=]+/g, '')

      for (const bloco of limpo.match(/[A-Za-z0-9]{24,}/g) || []) {
        // Hash de commit e hash de arquivo NÃO são segredo, e este projeto registra
        // os do upstream de propósito (produto/SHA.txt, o carimbo do build).
        if (/^[0-9a-f]{32,64}$/i.test(bloco)) continue
        // Segredo de verdade mistura caixa e dígito. Palavra longa em texto corrido
        // e nome de arquivo não misturam — e são o grosso do falso positivo.
        if (!(/[a-z]/.test(bloco) && /[A-Z]/.test(bloco) && /[0-9]/.test(bloco))) continue
        if (entropia(bloco) >= 3.9) return true
      }
      return false
    },
    oque: 'segredo (cadeia de alta entropia)'
  }
]

/** Entropia de Shannon, em bits por caractere. */
function entropia(s) {
  const conta = new Map()
  for (const c of s) conta.set(c, (conta.get(c) || 0) + 1)
  let h = 0
  for (const n of conta.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/** Devolve as violações de um texto (vazio = limpo). */
/**
 * Arte embutida NAO e segredo — mas parece, para a regra de entropia.
 *
 * `identidade/gerados/oficina.svg` carrega o PNG do icone dentro de um
 * `data:image/png;base64,...`: uma cadeia contigua de milhares de caracteres com
 * caixa e digito misturados, que e exatamente o que a regra de entropia procura. O
 * criterio 14 vinha ACUSANDO esse arquivo — o gate que decide se o repositorio pode
 * ir a publico estava permanentemente vermelho, e ninguem tinha registrado isso.
 *
 * A saida NAO e pular arquivos `.svg`: SVG e texto, e um segredo de verdade colado
 * ali dentro passaria batido. Aqui so o CORPO do data-uri sai de cena — o resto do
 * arquivo continua sendo varrido, inclusive o que vier depois da arte.
 *
 * Achado por uma revisao independente em 06/09/2026, reproduzido antes de ser corrigido: a
 * varredura acusava 1 arquivo, `identidade/gerados/oficina.svg`.
 */
function tirarArteEmbutida(txt) {
  // ⚠️ SEM `\s` DENTRO DA CLASSE.
  //
  // A primeira versao aceitava espaco em branco no meio do base64 -- inclusive QUEBRA
  // DE LINHA -- e por isso a substituicao atravessava o fim da arte e engolia o que
  // viesse depois. A revisao final provou com tres casos que passavam limpos: um segredo,
  // um nome de pessoa e um e-mail da casa, cada um numa linha logo abaixo do data-uri.
  // Um `data:text/plain;base64,A` inventado no topo calava o arquivo inteiro.
  //
  // Nao havia vazamento real (medi: a cauda engolida alem da arte era 0 caractere nos
  // dois arquivos com data-uri), mas era buraco esperando o primeiro arquivo com arte
  // no meio. Aqui a cadeia para no primeiro caractere que nao e base64 -- inclusive na
  // quebra de linha. Os tres casos entraram em vazamento_regras.mjs.
  return txt.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
    'data:<arte embutida, retirada da varredura>')
}

export function conferirTexto(txt) {
  txt = tirarArteEmbutida(txt)
  return REGRAS.filter(r => (r.fn ? r.fn(txt) : r.re.test(txt))).map(r => r.oque)
}
