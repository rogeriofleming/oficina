# 0025 — os ícones da barra de cima, um pouco maiores

**Arquivos tocados:** `titlebarPart.ts` (uma linha) e `titlebarpart.css` (três).

## O pedido

Dele, em 24/09/2026, com a V24 recém-instalada e o print na mão:

> *"os ícones lá de cima da barrinha, além de estarem muito pequenos, eu gostaria deles um pouco
> maiores"*

16 px → **20 px**.

## Por que são dois arquivos, e por que sobem JUNTOS

| onde | o que é |
|---|---|
| `opcoesDaBarraDeIcones().iconSize` | o número com que a barra **calcula a largura** que vai ocupar |
| o CSS (`width`/`height`/`background-size`) | o que a tela **desenha** |

Mexer num só faz a conta e o desenho discordarem: ou a barra reserva menos espaço do que os ícones
ocupam (e eles transbordam para a gaveta de `…`), ou reserva a mais (e sobra buraco no meio da
barra). Os dois são a mesma decisão escrita em dois lugares — e por isso este patch toca os dois.

> O CSS não existe por capricho: um ícone que vem de extensão é imagem de fundo, não *codicon*, e
> imagem de fundo sem `width`/`height` colapsa no padding. É o que o próprio patch 0022 registra,
> depois de os ícones saírem com 6×6 px na primeira tentativa.

## ⚠️ O custo, declarado

**Ícone maior come folga da barra de cima**, e foi exatamente a falta de folga que o patch 0023
resolveu na V22 — lá, em janela estreita, a barra de pesquisa cedia 211 px contra um teto de 130.

São 4 px a mais por ícone, vezes o número de ícones, saindo do mesmo espaço. E na V24 há um ícone
**a mais** que antes: a vista Tokens saiu da barra da direita e virou o quarto da barra de cima.

Quem julga isso é `tela_limite_barra.mjs` (48 critérios), no executável. Se o teto estourar, a saída
não é desistir do tamanho: é o mesmo caminho do 0023 — o que cede, cede com limite declarado.

## Por que um patch NOVO e não uma edição do 0022

Porque **editar um `.patch` à mão quebra o patch**. Foi o que aconteceu na primeira tentativa desta
versão: as linhas de comentário que eu acrescentei ao 0022 mudaram a contagem do bloco sem mudar o
cabeçalho `@@`, e o build parou com *"um patch nosso nao aplicou na tag 1.136.1"* — mensagem que
aponta para o upstream ter mexido no trecho, quando a causa era minha.

A regra que fica: **patch se gera com `git diff` a partir do clone**, nunca se edita como texto. É
como o 0024 nasceu, e é como este nasceu depois do erro.
