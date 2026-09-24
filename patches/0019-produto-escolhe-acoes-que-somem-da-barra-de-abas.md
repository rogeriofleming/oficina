# 0019 — o produto escolhe quais ações somem da barra de abas

## O que muda

Uma chave nova do `product.json`, `editorTitleActionsToHide`: uma **lista de ids de comando** que o
produto quer fora da barra de abas do editor (a fileira de ícones à direita das abas). O núcleo
filtra esses ids da fileira visível **e** do menu de transbordo — para o "…" também sumir quando não
sobrar nada atrás dele.

> ⚠️ **A frase acima já foi falsa, e a correção é parte deste patch.** Na primeira versão, a lista
> só trazia os comandos de dividir e travar — que são os da fileira visível. O menu de transbordo é
> alimentado por tudo que **não** é do grupo `navigation`, e o núcleo registra de fábrica, sempre
> presentes num editor comum: *Show Opened Editors*, *Close All*, *Close Saved*, *Enable Preview
> Editors* e *Configure Editors*, mais o submenu *Reopen Editor With* quando o arquivo abre em mais
> de um tipo de editor. Com aqueles ids, o patch escondia dois dos três ícones que ele apontou e o
> "…" continuava em todo arquivo — enquanto este documento afirmava o contrário. Apanhado numa
> conferência independente do build 1, lendo a origem dos itens de menu.
>
> A lista do produto agora traz esses seis também. **O que fica de propósito**, porque só aparece
> em situação específica e esconder seria tirar função sem pedido: *Inline View* (só em diff) e
> *Maximize Group* (só com mais de um grupo de editor aberto). Nesses dois casos o "…" volta — e é
> a resposta certa, porque aí ele tem conteúdo de verdade.

> ⚠️ **E um id SAIU da lista, pelo mesmo motivo invertido.** `workbench.action.unlockEditorGroup`
> estava sendo escondido — e ele é a **única** ação que o núcleo preserva na barra de um grupo
> **inativo** (`multiEditorTabsControl.ts`: quando as ações do editor não são sempre mostradas, o
> filtro deixa passar só o destravar). Escondê-lo deixava quem travasse um grupo sem indicador e
> sem clique para destravar, restando só a paleta de comandos. Esconder o **cadeado de travar** foi
> o pedido; tirar junto a saída de emergência é a mesma classe de defeito que fez este patch
> existir.

- `src/vs/base/common/product.ts`: a chave é declarada em `IProductConfiguration`.
- `src/vs/workbench/browser/parts/editor/editorTabsControl.ts`: filtra as duas barras da fileira.

## ⚠️ MEDIDO NO BUILD `V20-B2` — o "…" CONTINUA, e o que está atrás dele mudou

Depois de a lista ganhar os seis ids do menu de transbordo, a fileira de ações da aba foi lida na
tela do build, com um arquivo comum aberto:

```
Unlock Group · More Actions… · Claude Code: Open · More Actions…
```

Ou seja: **os itens do núcleo sumiram** (dividir e travar não estão mais lá), e o "…" que resta
guarda o que a EXTENSÃO contribui — que é justamente o que este patch existe para preservar (foi
por esconder "Aceitar tudo / Rejeitar tudo" que ele nasceu).

**Isto não é o que ele pediu, e não vou escrever que é.** Ele apontou três ícones e disse *"NÃO
QUERO essas coisa aqui também"*. Dois saíram; o terceiro continua, com conteúdo diferente. Fechar
esse último significa escolher entre:

1. esconder também as ações de extensão da aba — e aí o "Aceitar tudo / Rejeitar tudo" volta a
   sumir, que é o defeito que este patch conserta;
2. esconder **o botão do transbordo em si** quando só restarem ações de extensão — decisão de
   produto que precisa da opinião dele, e de mais um build para ser medida.

Também apareceu **"Unlock Group"** na fileira: é o botão de destravar, que este patch parou de
esconder de propósito (ver abaixo). Ele só aparece com o grupo travado — e, no build medido,
aparece. Se ele não quiser ver esse cadeado, é outra decisão.

**Nenhuma das duas foi feita: o teto de dois builds da V20 acabou.** Fica escrito, medido e não
resolvido — não "pronto".

## O problema

O pedido dele, apontando os três ícones do canto da aba (dividir, travar e o "…"):

> *"NÃO QUERO essas coisa aqui também"*

A primeira resposta foi a configuração que o próprio editor oferece —
`workbench.editor.editorActionsLocation: "hidden"`. Ela atende o pedido e **leva junto o que não
foi pedido**: aquela fileira é a mesma em que as EXTENSÕES põem os botões delas.

**Medido no build 1, com o programa rodando:**
- o botão **"Nova conversa"** do painel sumiu;
- sumiram os botões **"Aceitar tudo" / "Rejeitar tudo"** que aparecem na barra da aba quando o
  agente propõe mudança num arquivo.

O segundo é grave: é um caminho de **aprovação de mudança em código**. Escondê-lo sem querer é o
tipo de perda que ninguém nota até precisar dele.

⚠️ **Nada disso aparecia antes de compilar.** Os dois defeitos vieram de testes de tela no build.

## Por que uma LISTA no produto, e não um interruptor

Um interruptor ("esconda as ações do núcleo") obrigaria o núcleo a saber **quais** ações são "do
núcleo" — uma lista dentro do código de terceiro, que muda a cada versão do upstream e vira
conflito em toda subida de tag. Com a lista no produto, o núcleo aprendeu uma forma ("esconda estes
ids") e nada além; *quais* ids é decisão nossa, num arquivo nosso, mudável sem recompilar o núcleo.

É o mesmo raciocínio dos patches 0002, 0016 e 0017.

## O que continua funcionando

Tudo o que foi escondido continua na paleta de comandos e nos atalhos. E as ações que as extensões
contribuem para a barra de abas continuam lá — que é o ponto deste patch.

⚠️ **Custo declarado:** a lista é por id. Se o upstream renomear um comando, o item volta a aparecer
em silêncio — nada quebra, ele só reaparece. O teste de tela da barra de abas é o que avisa.

## Prova

`tsc -p src/tsconfig.json --noEmit` no clone com os 19 patches: **0 erros**. O comportamento na tela
é do **build 2** — escrito, e não medido, até lá.
