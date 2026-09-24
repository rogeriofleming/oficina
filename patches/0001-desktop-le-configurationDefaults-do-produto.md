# Por que este patch existe

**O que ele faz:** faz a build de **desktop** ler `configurationDefaults` do `product.json`. São
dez linhas em dois arquivos: a chave passa a existir no tipo `IProductConfiguration`, e o
`DefaultConfiguration` do workbench a registra no construtor — na linha de cima de onde o VS Code
**web** já registra a mesma coisa vinda do embedder.

**O que ele NÃO faz:** não inventa mecanismo. `registerDefaultConfigurations` é do upstream, o
ponto de chamada é do upstream, e o formato do dicionário é o mesmo que o web aceita há anos. O
patch estende ao desktop uma porta que só estava aberta para o web.

## O problema que ele resolve

A OFICINA é um produto cuja promessa **é o layout**: menu fechado, sem barra de status, sem painel
à direita, sem tela de boas-vindas. Esses padrões precisam valer **na primeira abertura de uma
instalação nova** — que é a abertura que forma a impressão de quem usa.

Foram tentados dois caminhos antes deste, e os dois falharam por motivos diferentes:

| tentativa | o que aconteceu |
|---|---|
| `configurationDefaults` no `product.json` | **inerte no desktop.** A chave só é lida no VS Code web, via `IWorkbenchConstructionOptions` do embedder. O `NativeWorkbenchEnvironmentService` não tem `options`, e a chave nem estava declarada em `IProductConfiguration` |
| `contributes.configurationDefaults` numa extensão embutida | **chega tarde demais para metade das chaves** — ver abaixo |

### Por que a extensão embutida não serve, e não é questão de gosto

Medido em 06/09/2026, perfil limpo, binário carimbado: com os padrões na extensão, a barra de
status e a barra de atividade somem, mas **o menu e o painel secundário continuam visíveis**.

A causa não é a que este projeto escreveu primeiro (*"são lidos pelo processo principal do
Electron, onde extensão não alcança"*). Essa explicação está **errada**, e o fonte a desmente: os
dois são lidos **no workbench**, no renderer, onde uma extensão alcançaria —
`layout.ts:3102` lê `workbench.secondarySideBar.defaultVisibility`, e
`menubarControl.ts:217` lê `window.menuBarVisibility`. O processo principal também os lê
(`themeMainServiceImpl.ts:47`, `windowImpl.ts:1539`), mas só para a tela de carregamento e para a
janela nativa — não é ali que a decisão da tela é tomada.

A causa real é **ordem de inicialização**. Uma extensão é registrada *depois* que o layout e a
barra de título já decidiram o que mostrar. Os padrões dela só alcançam a primeira pintura por um
**cache** (`DefaultConfiguration.cachedConfigurationDefaultsOverrides`, gravado no storage do
perfil) — e num perfil novo esse cache está **vazio**. Daí o comportamento que parecia
inexplicável: as configurações lidas *continuamente* (barra de status, barra de atividade) pegam,
porque reagem à mudança que chega atrasada; as lidas **uma vez, na largada** (`menuBarVisibility`,
`secondarySideBar.defaultVisibility`, `startupEditor`) simplesmente ignoram a extensão.

⚠️ **A consequência mais séria disso é sobre o que parecia funcionar.** Nada garantia que a barra
de status e a barra de atividade sumissem *a tempo* — elas venciam uma corrida, não uma regra. Este
patch tira as três chaves problemáticas da corrida **e também as outras onze**, porque agora todas
são registradas antes de a primeira delas ser lida.

O próprio upstream nomeia o problema, num comentário em `themeMainServiceImpl.ts`:

> `// in the main process, defaults are not known to the configuration service, so we need to define them here`

## Precedência — o que este patch NÃO muda

`registerDefaultConfigurations` registra **padrões**. Continua valendo, na ordem de sempre:
`default (core) < default (produto) < default (extensão) < usuário < workspace < política`.

Quem usa a OFICINA e quiser o menu de volta muda em Settings, como em qualquer editor, e ganha do
produto. Isso foi verificado, não suposto: a sonda de interface injeta um `settings.json` de
usuário e o valor do usuário prevalece.

## O que este patch tem de risco

**A superfície é pequena, mas não é zero.** `IProductConfiguration` é lido em todo lugar, e passar
a registrar padrões cedo significa que um `product.json` malformado agora pode alterar
comportamento antes do workbench existir. Duas defesas:

1. A guarda de `scripts/aplicar_produto.mjs` cobra `configurationDefaults` na lista de chaves
   **obrigatórias**: se ela sumir da mesclagem, o build **aborta antes de compilar**. Sem essa
   guarda o modo de falha seria mudo — o editor abriria perfeito, com a cara do VS Code cru, e
   todos os testes automáticos passariam verdes.
2. `testes/interface.mjs` mede a tela real, em perfil limpo, e é critério de regressão.

⚠️ **Reconferir a cada subida de tag.** Se o upstream passar a ler `product.configurationDefaults`
por conta própria, este patch deve ser **apagado**, não carregado por inércia.

## Por que fica em `patches/` e não em `patches/viabilidade/`

Porque é **nosso, de produto**: existe porque a OFICINA quer algo diferente, não porque a build
aberta esteja quebrada. Logo, **não** é aplicado no `--puro` — a linha de base continua sendo o
upstream mais os patches de viabilidade, e nada mais.


---

## Acréscimo de 06/09/2026: a segunda chave, e por que ela mora AQUI

Este patch passou a declarar também **`hideBuiltinWalkthroughs`** em `IProductConfiguration`
— a chave que o patch 0003 consome para o produto dispensar os walkthroughs do upstream.

**Por que a declaração não ficou no 0003, que é quem a usa.** O 0003 tocaria `product.ts`, que
este patch já toca. Um patch gerado por cima de outro tem **pré-imagem derivada**: o blob de base
dele só existe depois que o primeiro é aplicado, e nenhum clone novo o tem. Na primeira tag do
upstream que mexesse naquele arquivo, o `git apply --3way` ficaria **sem a rede de segurança** que
motivou escolher o `--3way` — exatamente o achado nº 7 do ciclo de revisores da V0.

Com a declaração aqui, cada patch toca um conjunto de arquivos que **nenhum outro toca**, e as
três pré-imagens são blobs do próprio upstream. Provado antes de fechar: com os três arquivos
restaurados ao HEAD, `git apply --3way --check` aplica os três limpo, um a um.

**O custo, declarado:** este patch deixou de ser "uma coisa só". Ele agora é *"o produto ganha
decisões que o desktop respeita"* — cabem aqui as chaves de produto que o workbench precisa ler,
e nada além disso. Se a lista crescer a ponto de o `.md` não conseguir explicar todas em uma
frase, é sinal de que ela virou depósito e precisa ser dividida por assunto — aceitando aí o
custo da pré-imagem derivada, conscientemente.

---

## Acréscimo da barra lateral: a terceira chave

Este patch passou a declarar também **`defaultUnpinnedViewContainers`** — a lista que o patch 0012
consome para o produto escolher quais ícones da barra lateral nascem soltos. Mora aqui pela mesma razão
da `hideBuiltinWalkthroughs`: só este patch toca `product.ts`.

A frase do `.md` continua valendo com três chaves: *"o produto ganha decisões que o desktop respeita"*.
Provado antes de fechar: com os arquivos da tag, os dezoito patches aplicam em ordem com `--3way`, e o
verificador de tipos passa com 0 erros no 0001 sozinho e no 0001 + 0012.
