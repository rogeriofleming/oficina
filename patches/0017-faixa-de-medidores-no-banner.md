# Por que este patch existe

**O que ele faz:** a faixa do banner passa a saber desenhar **medidores** — rótulo, barra que enche
e porcentagem — em vez de só uma mensagem. Qual *context key* carrega esses medidores é o
**produto** quem diz, no campo novo `bannerGaugesContextKey`.

**O que ele NÃO faz:** não coloca nada na faixa. O núcleo continua sem saber que existe "limite",
"plano", "5h" ou "7 dias" — ele desenha rótulo e porcentagem, e nunca pergunta o que medem.

## O problema

O pedido do dono do produto, com as palavras dele:

> *"vc vai criar uma TERCEIRA barra, ENTRE ELAS"* — entre a barra de cima (logo, pesquisa, botões
> do Windows) e a barra das abas. *"nessa barra do meio vai ficar: Botão de expandir para ver mais
> detalhes sobre o consumo dos limites no que ta gastando, 5h + barra que vai sendo preenchida
> conforme uso + porcentagem, 7d + barra que vai sendo preenchida conforme uso + porcentagem"*.

O patch 0016 já ensinou a **barra de título** a mostrar texto vivo, e é por ali que o limite da V19
aparece. Mas o que ele pediu agora não é texto: é **barra que enche**. Um item de barra de título é
uma ação com rótulo — não tem como desenhar uma barra de progresso dentro dele.

## O que foi procurado antes de escrever — e por que a faixa do banner

Não é "não achei": é o que foi verificado no código da versão que este produto usa (`1.136.1`,
SHA `a44adf7f53e`).

| Caminho | O que se mediu |
|---|---|
| Criar uma **parte nova** no workbench | É o que a leitura do pedido sugere ("uma terceira barra"). Custo real: `Parts`, o grid do layout, `layout.ts`, serialização de estado, `setPartHidden`, CSS — uma parte nova é dezenas de pontos de contato no núcleo, e **cada um deles é conflito na próxima subida de tag**. |
| **`workbench.parts.banner`** | Já existe, já é uma `Part`, já mede `height: 26`, já entra no layout **exatamente entre a barra de título e o resto** (`layout.ts:257`: o topo do resto começa depois do banner). Zero ponto de contato novo com o grid. |
| Barra de status | Fica embaixo, e este produto a desliga de fábrica (`workbench.statusBar.visible: false`). Não é o lugar que ele apontou. |
| Uma extensão desenhar ali | Não alcança: `IBannerService` é interno ao workbench. |

Escolhida a faixa do banner. **O custo desta escolha, declarado:** a faixa é compartilhada com os
avisos do editor. A regra de convivência está no código e é explícita — **um aviso sempre ganha da
faixa**: uma mensagem que a pessoa precisa ler não pode ser empurrada para fora da tela por um
mostrador permanente. Quando o aviso é fechado, os medidores voltam sozinhos (`close()` chama
`updateGauges()`).

## Por que uma regra genérica, e não "desenhe o limite aqui"

O mesmo motivo dos patches 0002 e 0016: amarrar decisão de **produto nosso** dentro do **núcleo de
terceiro** faz com que toda mudança de ideia — outro rótulo, outra janela, um medidor a mais — vire
patch novo e build novo. Aqui o núcleo aprendeu uma forma (medidores numa faixa) e nada além disso:
*o que* se mede mora na extensão embutida, onde se muda sem recompilar.

É por isso também que o **nome da chave vem do `product.json`**, e não está escrito no núcleo.

## O que o núcleo garante, e por quê

- **Valor torto não derruba a janela.** `readGauges()` nunca lança: JSON inválido, campo faltando,
  porcentagem que não é número — tudo isso vira lista vazia. Isto roda a cada mudança de contexto;
  um valor ruim não pode quebrar o workbench.
- **Porcentagem é presa entre 0 e 100.** Um valor fora da faixa pintaria a barra para fora do
  trilho. O motor da extensão já prende; o núcleo prende de novo, porque quem desenha é ele.
- **A faixa some quando não há número.** Lista vazia esconde a parte inteira, em vez de ocupar
  26 px desenhando nada.
- **Leitor de tela lê rótulo e número juntos**, como uma frase só (`aria-label` no medidor).

## Prova

`tsc -p src/tsconfig.json --noEmit` no clone com os 17 patches: **0 erros** — com controle positivo
(trocar `fill.style.width = \`${gauge.pct}%\`` por `= gauge.pct` faz o verificador acusar
`TS2322` na linha 189, e o erro some ao desfazer). Comportamento é do build e do teste de tela.
