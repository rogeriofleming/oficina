# 0022 — a barra de ícones das vistas vive na BARRA DE TÍTULO

## O pedido, com as palavras dele

> *"esses negócio ao invés de lateral, eu quero em cima, na horizontal, entre a logo na esquerda e
> a barra de pesquisa no centro"* (`t198`)

E, sobre a resposta anterior:

> *"mas NEM FODENDO, não aceito DE JEITO NENHUM, ou é como pedi, ou não terminou."*

## Por que a resposta anterior não servia — medido, não achado

A V20 respondeu com `workbench.activityBar.location: "top"`, que é o que o núcleo oferece de
fábrica. Ela **parece** atender: os ícones ficam numa linha horizontal. Medido no build `V20-B2`:

```
x = 4, 30, 56, 82   (mesmo y)      ← em linha, sim
```

Mas aquela linha fica no **cabeçalho da barra lateral**, e daí vêm os dois defeitos:

1. os ícones **somem junto com a barra lateral**. Com ela fechada, os quatro continuam no DOM com
   altura zero — não sobra ícone nenhum na tela;
2. clicar no ícone da vista ativa **fecha a lateral** — e depois não há o que clicar para reabrir.
   Só atalho ou paleta.

Para um produto cuja navegação inteira são esses quatro ícones, isso é um beco: a única porta
visível se tranca por dentro. Não é "quase o que ele pediu"; é outra coisa.

## O que este patch faz

Uma chave nova de produto, `activityBarInTitleBar`. Quando ligada:

- **`titlebarPart.ts`** cria um `div.titlebar-activity-container` no `titlebar-left` e instancia
  ali uma `ActivityBarCompositeBar` — a **mesma classe** que desenha a barra no cabeçalho da
  lateral. O dono (`paneCompositePart`) é a **parte da barra lateral**, obtida do serviço: clicar
  continua abrindo a vista **nela**;
- **`sidebarPart.ts`** para de desenhar a composite bar dela (senão seriam duas), e a barra de
  atividade **vertical** continua escondida;
- **`panecomposite.ts` / `paneCompositePartService.ts`**: a interface passa a expor
  `getPaneCompositePart(location)`, que era `private`. É só isso que a barra de título precisa.

O núcleo não aprende "OFICINA". Ele aprende que *um produto pode querer a barra de ícones na barra
de título* — o mesmo raciocínio dos patches 0002, 0016, 0017 e 0019.

## O ESTADO NÃO É DUPLICADO

As três chaves de armazenamento (`pinnedViewContainersKey`, `placeholderViewContainersKey`,
`viewContainersWorkspaceStateKey`) são as **mesmas** que a barra lateral e a barra de atividade
vertical já usavam — `ActivitybarPart.*`. Fixar, desafixar, reordenar e esconder um ícone valem
para as três, porque é um estado só, no mesmo lugar do disco.

## As três coisas que quebraram no caminho, e o que cada uma ensinou

Nenhuma apareceu na leitura do código. As três só existiram na tela.

**1. A barra nasceu VAZIA, com largura zero.** O container estava no DOM, na posição certa, e sem
um ícone dentro. Causa: `PaneCompositeBar` não decide sozinha quantos itens mostra — ela espera um
`layout(largura, altura)`, e ninguém o chamava. A parte da lateral faz isso no
`layoutCompositeBar()` dela.

**2. A conta da largura era CIRCULAR.** A primeira versão pediu a largura a
`getVisiblePaneCompositeIds()` — mas "visível" é o que a barra decidiu mostrar **depois** de
receber uma largura. Resultado medido: havia quatro vistas, a conta devolveu 2, a largura saiu
52 px, e a tela mostrou **um** ícone mais um botão de "Additional Views" escondendo três. A fonte
certa é `getPinnedPaneCompositeIds()`, que lê o estado de fixados e não depende de largura nenhuma.

**3. Dois dos quatro ícones saíram com 6×6 px.** Os de FONTE (Explorer, Source Control — codicons)
vieram com 22×22; os de IMAGEM, vindos de extensão (Chat Debug, Skills), colapsaram. Quem dá
tamanho a um `.action-label` que não é codicon é uma regra do `paneCompositePart.css`, **presa ao
seletor `.pane-composite-part`**. Um codicon se dimensiona pela fonte e sobrevive em qualquer
lugar; uma imagem de fundo sem `width`/`height` vira o padding.

> **A lição das três juntas:** mudar um componente de lugar não leva junto o CSS do lugar antigo
> nem as chamadas que o lugar antigo fazia por ele. O que quebra é sempre o que o antigo dono
> fazia em silêncio — e nada disso aparece antes de a tela existir.

E uma quarta, de CSS puro: **o `order` decide a posição, não a ordem do `append`.** Com a ordem do
DOM correta (appicon, menubar, container), a barra apareceu **antes da logo** — porque
`.window-appicon` tem `order: 1`, `.menubar` tem `order: 2`, e um filho sem `order` vale 0. O
container recebeu `order: 3`.

## O `no-drag` não é enfeite

A barra de título inteira é `-webkit-app-region: drag`. Dentro de uma região de arrasto, o Chromium
entrega o `mousedown` ao gerenciador de janelas em vez de ao elemento: o ícone **apareceria e não
clicaria**, e arrastar por cima dele moveria a janela. Todo controle clicável da barra de título
repete essa linha pelo mesmo motivo.

## Custo declarado

- a barra de cima ganha **mais quatro elementos**; em janela estreita ela disputa espaço com o
  centro de comandos. O CSS a deixa encolher (`flex: 0 1 auto; overflow: hidden`) e a própria barra
  recolhe o excedente no transbordo dela;
- `activityBar.location` continua existindo como configuração, mas **deixa de ter efeito** enquanto
  o produto pedir a barra na barra de título. Quem mudar aquela configuração não verá nada
  acontecer — é o preço de o produto decidir, e está dito aqui;
- a largura é calculada por **contagem de ícones × 26 px**. Se uma vista for registrada depois do
  último layout, a barra ficaria curta; por isso o patch escuta `onDidChangeViewContainers` e
  `onDidChangeContainerLocation` e refaz o layout;
- em **janela auxiliar** a barra não é desenhada: não há barra lateral ali para abrir, e ela seria
  um enfeite que não leva a lugar nenhum.

## Prova

`npm run compile-client` com os 22 patches: **0 erros**.

Na tela, `testes/tela_barra_de_icones_em_cima.mjs` — **6/6 critérios**:

```
logo:      x=0   w=35
icones:    x=39, 67, 95, 123   (todos y=7, 28x22)
pesquisa:  x=422
```

- os quatro estão **dentro da barra de título**, em linha, **depois da logo e antes da pesquisa**;
- clicar abre a vista **na barra lateral** (medido: abriu o "Explorer");
- **com a barra lateral FECHADA os quatro continuam na tela** — o critério que reprova o estado
  anterior, e a razão de este patch existir;
- **nenhuma segunda barra** sobrou, nem no cabeçalho da lateral nem na vertical.
