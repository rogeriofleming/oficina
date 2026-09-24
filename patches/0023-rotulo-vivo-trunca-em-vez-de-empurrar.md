# Por que este patch existe

**O que ele faz:** o item de **rótulo vivo** da barra de título (o que o patch 0016 criou) ganha um
teto de largura relativo — `max-width: 30vw` — e corta o texto com `…` quando esbarra nele.

**O que ele NÃO faz:** não muda o que se lê, não mexe em nenhum outro item da barra, e não toca no
mecanismo do 0016. Um item de menu comum continua exatamente como era.

## O problema

Medido em **22/09/2026**, no build `V21-B1`, com a janela em **676 px** de largura:

| o que acontece | número |
|---|---|
| o item do mostrador chega a | **401 px** |
| a barra de pesquisa é espremida | de 211 px a **zero** |
| a barra de cima passa a **rolar** | 699 contra 676 |
| os botões de minimizar/maximizar/fechar **saem do lugar** | 538 → **561** |

O último é o grave: o mostrador empurra os controles da própria janela.

**Por que só apareceu agora.** Um item de menu comum tem texto **fixo e curto**, vindo do
`package.json` — a barra de título nunca precisou se defender da largura dele. O 0016 abriu a porta
para um **mostrador**, cujo texto vem de um *context key* e cresce com o que estiver acontecendo:
nome de conversa comprido, números grandes, o relógio do cache. O pior caso é legítimo, não
sintético — é o que se vê numa conversa com nome escolhido e limites no alto.

**O gatilho.** Na V21 o `t198` levou três ícones (Arquivos, Git e Skills) para a barra de título.
Eles ocupam **104 px**, e essa era exatamente a folga que absorvia o mostrador. Medido por controle,
na mesma janela e na mesma corrida (`testes/sonda_folga_da_barra.mjs`):

| sonda de 393 px, janela de 676 px | a pesquisa cede | os controles andam | a barra rola |
|---|---|---|---|
| **com** os três ícones | 211 px | sim | sim |
| **sem** os três ícones | 125 px | não | não |

Os 125 px do controle são a medida registrada do build anterior (`V20-B2`). Ou seja: o mostrador
sempre foi largo demais para uma janela estreita; até a V20 a barra tinha espaço para absorvê-lo.

## O que foi medido antes de escrever — e o que NÃO funcionou

Não é "escolhi o CSS que me pareceu certo": os candidatos foram aplicados ao vivo no executável que
já existia (`testes/sonda_viabilidade_truncar.mjs`), antes de qualquer compilação, porque cada
tentativa compilada custa um ciclo.

| candidato | item ficou | a pesquisa cede | empurra os controles |
|---|---|---|---|
| `min-width: 0` + `flex-shrink: 1` no item | **401 px** (nada mudou) | 211 | **sim** |
| o mesmo, e também no contêiner de ações | **401 px** (nada mudou) | 211 | **sim** |
| `max-width: 220px` + `ellipsis` | 220 px | 52 | não |
| **`max-width: 30vw` + `ellipsis`** | **203 px** | **35** | **não** |

⚠️ **`flex-shrink` não resolve, e isso surpreende.** A barra de título não dá a este eixo um
encolhimento que o item possa aproveitar — com `min-width: 0` e `flex-shrink: 1` no item **e** no
contêiner de ações, o item continuou com os mesmos 401 px e os controles continuaram andando. O que
funciona é um **teto**.

⚠️ **E o teto é RELATIVO de propósito.** Um teto fixo conserta a janela estreita e estraga a larga:
medido, `max-width: 220px` corta o texto **também** em 1376 px, onde há espaço de sobra. Com `30vw`:

| janela | item fica com | trunca? |
|---|---|---|
| 676 px | 203 px | sim, e é o que se quer |
| 1376 px | **401 px** | **não** — o texto inteiro aparece |

## Onde ele mexe

`src/vs/workbench/browser/parts/titlebar/titlebarPart.ts`, no `render()` de
`OficinaLiveLabelActionViewItem` (a classe que o 0016 introduziu). Estilo aplicado no elemento, sem
arquivo de CSS novo: menos superfície para a próxima subida de tag quebrar.

A classe `oficina-rotulo-vivo` é acrescentada ao contêiner — não é usada por regra de CSS nenhuma,
existe para que um teste consiga mirar o item real em vez de adivinhar por posição.

## O que se perde

Em janela estreita, o fim do texto do mostrador fica escondido atrás do `…`. **A dica do mouse
continua com o texto inteiro** (o 0016 já mandava para lá tudo depois da primeira linha), e em
janela larga nada muda. É o custo, e ele é menor do que o de empurrar os botões de fechar janela.

⚠️ **Reconferir a cada subida de tag:** se o upstream passar a tratar largura de itens da barra de
título sozinho, este patch deve ser **apagado**, não carregado por inércia.
