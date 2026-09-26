# 0030 — o painel de tokens ganha uma linha própria, com botões

**O que ele faz:** a faixa (`workbench.parts.banner`, a mesma do patch 0017) aprende a desenhar um
**rótulo vivo** — o texto de uma *context key* que o produto nomeia — em pedaços coloridos, com
**botões** ao lado, escolhendo sozinha o degrau de texto que cabe na largura que ela tem.

**O que ele NÃO faz:** não sabe o que o texto mede. Não há "token", "custo" nem "conversa" no núcleo:
o produto nomeia a chave (`bannerLiveLabelContextKey`) e o comando do clique
(`bannerLiveLabelCommand`), uma extensão preenche, e só os dois sabem o que aquilo significa — a
mesma regra dos patches 0016 e 0017.

## O pedido

> *"o painel de tokens lá em cima ele resume e comprime para caber porque tem pouco espaço sobrando
> na barra de cima. Então ele está escondendo a informação de metade do token (...) e ele está
> mostrando só os tokens de contexto, o que é metade da informação. Além disso, ele corta o nome das
> conversas"* — ele, 26/09/2026.

> *"Linha do topo: logo, ícone, limites de sessão, barra de pesquisa, botões do Windows. Segunda
> linha: painel de tokens, com o nome da conversa, o valor em dólar, os tokens de contexto e os
> tokens totais da conversa. Terceira linha: as sessões do Claude com o respectivo nome de cada
> conversa. E abaixo disso, a conversa em si."* — ele, 26/09/2026.

## Medido antes de escrever

Sonda `testes/sonda_tokens_em_linha_propria.mjs`, na janela real (saída neutra da V28 + hotpatch
0029), 26/09/2026:

| | tela cheia (1376 px) | meia tela (696 px) |
|---|---|---|
| teto do rótulo na barra (`30vw`, patch 0023) | **413 px** | 209 px |
| o texto com 1 conversa | 303 px | 303 px |
| **com 2 conversas** | **511 px** | 511 px |
| com 4 conversas | 998 px | 998 px |
| com 5 conversas | 1253 px | 1253 px |
| a faixa | **altura 0 — escondida** (os medidores subiram na V27) | 26 px, com os medidores |

**Com duas conversas o texto já pedia 511 px contra 413 de teto.** Não era defeito de desenho: era a
política de encolhimento funcionando num espaço que nunca coube. Numa linha própria a largura vai de
413 para ~1350 px (**3,3×**) e cinco conversas cabem inteiras.

## As três decisões deste patch, e o custo de cada uma

### 1. A faixa hospeda o rótulo; os medidores ficam na barra de título

Os papéis do patch 0028 se invertem: quem tem linha própria agora é o rótulo, e os medidores só
descem quando a janela é estreita demais para eles em cima. Nesse caso os dois **dividem** a faixa,
e aí o rótulo volta a encolher — o encolhimento não morre, deixa de ser o caso normal.

**Custo:** uma linha permanente a mais = **26 px a menos de editor**. É exatamente a linha que o 0028
tinha devolvido na V27, e é o preço direto do que ele pediu. **Custo 2:** a faixa é compartilhada com
os avisos do editor, e a regra do 0017 é que **um aviso sempre ganha** — quando houver um, o painel
some enquanto ele estiver lá. Hoje isso já acontece com os medidores.

### 2. O produto publica uma ESCADA de textos; o núcleo mede e escolhe

Até a V29 a extensão contava caracteres (`LIMITE_DA_LINHA = 78`) contra uma largura que ela não
enxerga. Um palpite assim erra dos dois lados e envelhece sozinho. Agora a **extensão** é dona da
política (o que cede primeiro: o total processado, depois a soma, e o nome por último) e o **núcleo**
é dono da medida, porque só ele sabe a largura. `oficinaEscolherDegrau` desenha cada candidato e lê o
`scrollWidth` — medir, e não estimar, porque fonte, espaçamento e o `0.9em` dos números estão no CSS.

**Custo:** até nove desenhos de DOM por ajuste. Mitigado por cache (largura + assinatura dos degraus)
e pela deduplicação dos degraus iguais do lado da extensão.

### 3. Os botões existem sempre

Ordem dele, 26/09/2026: *"se não tiver nenhuma conversa rodando e também não tiver nenhum subagente
ligado (...) não vai mostrar nada, né? Mas ele existe"*. Isso **inverte, só nesta linha**, a regra de
24/09 (*"onde não há o que fazer, não há botão"*). Quem abre um botão vazio é avisado por **quem
abre**, nunca pelo botão sumir.

O ícone vem do produto como **id de codicon** e é filtrado por `/^[a-z0-9-]+$/` antes de virar classe
de CSS — o que o produto escreve ali vai para dentro de um seletor.

## O desenho em pedaços saiu do titlebarPart para um módulo

`oficinaRotuloVivo.ts` é novo e guarda o que o patch 0029 tinha escrito dentro do `titlebarPart.ts`:
as cores do painel de tokens e o corte do texto nos separadores. Agora o rótulo tem **duas casas** (a
barra de título e a faixa) e as duas têm de desenhar igual — o pedido que criou o 0029 foi *"quero o
mesmo do meu painel"*, e uma cópia começaria a divergir na primeira cor mudada de um lado só.

## Números que mudaram na barra de título (o espaço que o rótulo devolveu)

| peça | antes | agora |
|---|---|---|
| trilho de cada medidor | 81 px | **110 px** |
| vão entre os medidores | 12 px | **24 px** |
| vão interno de cada medidor | 6 px | **8 px** |
| barra de pesquisa (`LARGURA_DA_PESQUISA` + CSS) | 145 px | **280 px** |

Conta de folga pela fórmula do 0028, com os 8 ícones da barra dele: esquerda 291 + medidores ~434 +
pesquisa 280 + margens 20 + direita 142 + respiro 16 = **1183 px** contra 1376 → folga de ~193 px.

⚠️ **`LARGURA_DA_PESQUISA` (TS) e o `width` do CSS têm de bater.** Se discordarem, a conta de "cabe?"
mente e os medidores oscilam entre a barra e a faixa.

## O que ficou sem uso, e por que não foi removido

O patch **0016** (rótulo vivo na barra de título) continua no lugar, com os 0023, 0028 e 0029 em cima
dele — só a extensão deixou de contribuir o item no menu `titleBar`. Removê-lo obrigaria a mexer em
quatro patches encadeados para desfazer um caminho que ainda funciona e que pode voltar a ser útil em
janela larga. Fica declarado como dívida, não escondido.

## Prova

- **Tipos:** `tmp/conferir_tipos_no_clone.mjs` sobre o estado real do clone (0001–0030) → os mesmos
  **2 erros de `import './media/*.css'`** que aparecem **sem** este patch. Provado que são da
  conferência e não do patch: `statusbarPart.ts`, que este patch não toca, acusa o mesmo erro. O
  controle positivo (`--controle`) acusou o erro plantado.
- **Suítes:** `testes/ponte.mjs` 308/308 · `testes/mostrador_de_tokens.mjs` 70/70 (inclui os blocos
  novos 14 — corte por inatividade — e 15 — o mapa dos agentes).
- ⚠️ **O que ainda NÃO foi provado quando este arquivo foi escrito:** o comportamento na tela (a faixa
  desenhada, os botões, a escolha do degrau ao redimensionar). Isso exige o build, e é o que a rodada
  de revisores sobre o build tem de cobrir.
