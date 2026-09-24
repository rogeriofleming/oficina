# 0020 — a barra de pesquisa cede largura

## O que muda

Duas medidas no CSS da barra de título: a caixa de pesquisa (o *command center*) passa de
`38vw / max 600px` para `30vw / max 420px`.

- `src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css`

## O problema

Faz parte do mesmo pedido que criou a faixa de medidores (`t199`), e é a metade dele que ficou
para trás:

> *"a barra de pesquisa pode ser menos larga"*

⚠️ **E o registro da versão afirmava que estava feito** — escreveu, na tabela do que a V20
constrói, que *"o command center cede largura (`max-width`)"*. Não havia uma linha sequer: nenhum
patch tocava `max-width`, e o CSS compilado do build 1 trazia os `600px` de origem. Foi apanhado
numa conferência independente do build, item por item, contra as palavras dele.

É exatamente o tipo de "verde que não funciona" que ele já reclamou em pessoa — e o documento
interno chegou a ter o seletor e o número anotados, o que torna o esquecimento pior, não melhor.

## Por que também importa para o resto da barra

Medido no build 1, com o mostrador de tokens na tela: o contêiner da direita fica **fixo em
566 px** em qualquer largura de janela, e quem absorve todo o aperto é a pesquisa. Em janela de
656 px ela caía para **47 px, com o nome da pasta cortado**. Reduzir o teto da pesquisa não
resolve esse estrangulamento sozinho, mas tira a maior parte do desperdício em tela larga, que é
onde ele olha.

## O que este patch NÃO resolve, e está declarado

- **O colapso em janela estreita.** Quem precisa aprender a encolher é o lado direito (o mostrador
  de tokens), e mexer nele exige medir o elemento montado numa tela de verdade — ele não tem
  classe própria no CSS, é um item de menu comum. Sem medida, um seletor escrito de cabeça acerta
  hoje e erra calado amanhã, que é a regra desta casa.
- **O salto de 141 px** da pesquisa quando a conversa ganha sessão (ela sai do centro porque o
  lado direito cresce). Mesma razão: é medida de tela.

## Como conferir depois do build

Com o programa aberto numa janela larga, a caixa de pesquisa não deve passar de 420 px. Antes
passava de 600.
