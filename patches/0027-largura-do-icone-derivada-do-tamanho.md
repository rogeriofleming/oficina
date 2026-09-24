# 0027 — a largura reservada por ícone passa a ser DERIVADA do tamanho dele

**Arquivo tocado:** `titlebarPart.ts` (uma constante vira duas, e o `iconSize` passa a lê-la).

## O defeito

A barra de ícones da barra de título calcula a largura que vai ocupar assim:

```ts
const quantos = barra.getPinnedPaneCompositeIds().length;
const largura = quantos * LARGURA_DO_ICONE_NA_BARRA_DE_TITULO;
```

`LARGURA_DO_ICONE_NA_BARRA_DE_TITULO` nasceu como **26**, no patch 0022, e o valor estava certo:
foi medido na lateral do núcleo quando o ícone tinha **16 px** — os quatro ícones apareciam em
x = 4, 30, 56, 82, ou seja, passo de 26 px.

Os patches 0025 e 0026 subiram o ícone para 20 px. O passo real virou **32 px** (medido no build:
`action-item` de 32×26). A constante continuou em 26.

**Resultado:** a barra reserva 26 px por ícone para ícones que ocupam 32.

| ícones fixados | reservado | necessário | o que acontece |
|---|---|---|---|
| 4 (o padrão do produto) | 104 px | 128 px | ainda coube, por folga do container |
| **5** (alguém fixa a Pesquisa, que nasce solta) | 130 px | 160 px | **dois caem no transbordo** |

Medido na suíte da lateral, no build `V24-B2`: onde o teste esperava
`Explorer, Source Control, Skills, Search, Tokens`, a barra mostrou
`Explorer, Search, Source Control, **Additional Views**`.

## Por que aconteceu

Porque o número era **solto**. Ele descrevia uma consequência do tamanho do ícone, mas estava
escrito como se fosse uma propriedade independente da barra — e um número assim não tem como
avisar que envelheceu. Quem mexeu no tamanho (eu) não tinha por que olhar para ele.

O patch 0022 já dizia, no comentário da constante, que ela era *"o único número mágico deste
patch"*. Estava certo em nomeá-la; o que faltava era **ligá-la à causa**.

## O conserto

```ts
const TAMANHO_DO_ICONE_NA_BARRA_DE_TITULO = 20;
const LARGURA_DO_ICONE_NA_BARRA_DE_TITULO = TAMANHO_DO_ICONE_NA_BARRA_DE_TITULO + 12;
```

E o `iconSize` das opções passa a ler `TAMANHO_DO_ICONE_NA_BARRA_DE_TITULO` em vez de repetir o
`20`. Assim um número só manda nos dois lugares em TypeScript: mexer no tamanho move a largura
junto, e não há como esquecer.

O `+ 12` é a folga lateral do `action-item` (`padding: 0 3px` mais a margem que o núcleo aplica),
conferida na tela: com ícone de 20 px, o item mede 32 px.

## O que continua sendo frágil, e está declarado

**O CSS não dá para ligar daqui.** O tamanho desenhado mora em `titlebarpart.css`, em duas regras —
uma para ícone de imagem (0025) e outra para codicon (0026) —, e um arquivo `.css` não lê constante
de TypeScript. Se alguém mudar `TAMANHO_DO_ICONE_NA_BARRA_DE_TITULO` sem mexer no CSS, a conta e o
desenho voltam a discordar.

O que pega isso é um critério na tela, em `tela_toggle_da_barra.mjs`: *"os quatro ícones da barra
têm o MESMO tamanho"*. Ele não substitui a ligação que não existe, mas transforma a divergência em
vermelho na bateria em vez de defeito silencioso.
