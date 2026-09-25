# Por que este patch existe

**O que ele faz:** os medidores do limite (a faixa do patch 0017) sobem para a **barra de título**,
logo depois dos ícones das vistas, **quando cabem**. A pesquisa sai do centro e fica menor (35% da
largura que tinha), depois dos medidores. Quando a janela estreita e eles não cabem, voltam sozinhos
para a faixa de baixo.

**O que ele NÃO faz:** não desenha medidor nenhum na barra de título. Quem desenha continua sendo a
faixa (`bannerPart.ts`); a barra de título só **oferece um lugar** (`gaugesSlot.ts`) e o retira quando
falta espaço. O núcleo continua sem saber o que os medidores medem.

## O pedido

O dono do produto, sobre a faixa numa linha própria: *"e se os limites da sessão ficarem na barra
superior, após os ícones, e antes da barra de pesquisa e a barra de pesquisa for cortado o comprimento
dela pela metade?"*. Uma linha inteira de altura volta para o código.

## Medido antes de escrever — e a especificação mudou por causa da medida

A primeira conta saiu de um print, e dava folga. Medida na janela real (sonda
`testes/sonda_limites_na_barra.mjs`, build anterior, monitor de 1360 px):

| | tela cheia (1376) | meia tela (696) |
|---|---|---|
| fim dos ícones (6 de fábrica) | 263 | 230 |
| pesquisa | 478→892 (415 px), centro ~685 | 240→450 |
| espaço à esquerda com a pesquisa −65% **centralizada** | 349 | 78 |
| medidores (barrinhas −10%, vão 12 px) | 332 | 332 |

Com mais ícones fixados (a barra dele tem 8), não cabia nem em tela cheia. E encolher mais a pesquisa
quase não ajudava: **centralizada, ela só cede à esquerda metade do que encolhe** — com largura zero
sobravam ~358 px. Daí a decisão dele: **a pesquisa sai do centro**. A ordem vira ícones → medidores →
pesquisa → direita.

## Por que "cabe?" é conta de largura natural, e não "a barra rolou"

A pesquisa tem `min-width: 0` e o rótulo de tokens trunca (patch 0023): quando falta espaço, os dois
encolhem calados, e o estouro nunca apareceria como rolagem. Então a barra soma:
- os filhos da esquerda (sem o encaixe) e a largura dos medidores;
- a pesquisa com a largura FIXA que ela terá com eles (145 px) — não a de agora, porque sem os medidores
  ela volta ao tamanho normal;
- cada filho da direita pelo MAIOR entre o que ocupa e o que pediria (`scrollWidth`), para o rótulo de
  tokens já truncado não parecer menor do que é;
- 20 px de margens da pesquisa e 16 de respiro, para não oscilar a cada pixel.

Cabe **e há medidor** → liga a classe que tira a pesquisa do centro e oferece o encaixe. Deixou de caber,
ou os medidores sumiram → retira os dois,
e a faixa volta a desenhar embaixo **com a barra de título exatamente como era antes**.

## Achados da revisão de fora (25/09/2026), consertados antes do build

- **A conta só rodava no redimensionamento.** Entrando ícone novo (o instalador da primeira abertura
  acrescenta vistas) ou mudando a largura dos medidores, a pesquisa era espremida até zero até o próximo
  redimensionamento. Agora a conta roda também em `onDidChangeViewContainers` e a cada redesenho dos
  medidores no encaixe (`gaugesSlot.onDidRender`).
- **A classe ficava sempre ligada**, mesmo com os medidores embaixo — e o `flex-shrink: 0` da esquerda
  anulava o encolhimento dos ícones de que o 0022 depende. Agora ela liga e desliga com o encaixe.
- **A conta usava larguras já encolhidas** (pesquisa e rótulo de tokens), subestimando o necessário.

## Achado da sonda na janela real (25/09/2026), consertado antes do build

- **O encaixe era oferecido sem medidor nenhum.** Num perfil sem uso registrado a faixa estava vazia e,
  mesmo assim, em tela cheia a classe ligava e a pesquisa encolhia para 147 px ao lado de um encaixe
  vazio. A barra de título só sabia "cabe?", não "tem o quê?". Agora a faixa anuncia a cada atualização,
  seja qual for o lugar onde desenha, se há medidor (`gaugesSlot.setTemMedidores`, **antes** de ler o
  encaixe, porque a barra pode oferecer ou retirar o encaixe nessa mesma chamada), e a barra só oferece
  quando cabe **e** há. **Medido nos dois sentidos na mesma janela:** com um registro de uso que depois
  some, aos 3 s havia 2 medidores na barra (classe ligada, encaixe visível) e, quando sumiram, a classe
  desligou e o encaixe escondeu sem ninguém redimensionar. Com o registro real: tela cheia → medidores na
  barra, pesquisa 147 px; meia tela → de volta à linha de baixo, pesquisa 211 px.
- ⚠️ **Armadilha de medida, não defeito:** na janela de DESENVOLVIMENTO (`OFICINA_DEV=1`) a pesquisa às
  vezes mede **0 px** — ali o núcleo liga a barra unificada de agentes (`unified-agents-bar` no `body`),
  que esconde a pesquisa por `display: none !important`, com ou sem este patch. A build instalada não
  liga (`chat.disableAIFeatures` do produto → `chatIsEnabled` falso; medido: pesquisa 519 px). Por isso
  o gate de tela da build real tem de conferir **pesquisa visível** — a janela de desenvolvimento não prova isso.

## Custos, declarados

- **A pesquisa deixa de ficar no meio** e fica com ~145 px **enquanto os medidores estão na barra** (sem
  eles, volta ao normal) — vira quase um botão; o nome da pasta que ela
  mostra aparece cortado. Aceito por ele.
- **A alça de arrastar a janela diminui** pelo tamanho dos medidores. Eles continuam sendo alça (sem
  `no-drag`); só o botão de expandir deixa de ser.
- **Com um aviso na faixa** (mensagem do editor), os medidores continuam na barra de título e o aviso usa a
  linha de baixo — antes, o aviso tirava os medidores da tela até ser fechado.
- **De carona, um vazamento consertado:** o 0017 registrava ouvintes novos de clique a cada redesenho e
  nunca soltava os antigos. Agora eles vivem num `DisposableStore` limpo a cada redesenho.

## Chave do produto

`titleBarGauges: true` em `product.json`. Sem ela, nada muda: a barra de título não oferece encaixe e a
faixa fica onde sempre esteve.
