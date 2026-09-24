# 0026 — e os ícones de FONTE crescem junto

**Arquivo tocado:** `titlebarpart.css` (uma regra nova).

## O que o patch 0025 deixou pela metade

O 0025 subiu os ícones da barra de cima de 16 px para 20 px, mexendo em duas coisas: o `iconSize`
das opções e esta regra do CSS —

```css
… .action-item.icon .action-label:not(.codicon) { width: 20px; height: 20px; background-size: 20px; }
```

Repare no fim do seletor: **`:not(.codicon)`**.

A exclusão é correta e o próprio 0022 explica por quê: um ícone de **imagem** (os que vêm de
extensão) precisa de `width`/`height`, senão colapsa no padding; um **codicon** não precisa, porque
se dimensiona pela fonte.

Só que *"não precisa de `width`"* não é *"não precisa crescer"*. Subindo só aquela regra:

| ícone | de onde vem | ficou |
|---|---|---|
| Arquivos | codicon (núcleo) | **22×22**, fonte 16px |
| Git | codicon (núcleo) | **22×22**, fonte 16px |
| Tokens | imagem (extensão) | **26×26**, 20px |
| Skills | imagem (extensão) | **26×26**, 20px |

Quatro ícones lado a lado na mesma barra, dois de um tamanho e dois de outro — **mais desigual do
que antes do conserto**, porque antes os quatro tinham o mesmo tamanho (o errado).

## Como isso apareceu

Não foi revisão de código: foi medição na tela do build, com uma sonda que lê cada `action-item` e
reporta rótulo, tamanho e se é codicon. O CSS "estava certo" lendo o diff — ele faz exatamente o
que diz. O que estava errado era a minha conclusão de que ele alcançava os quatro ícones.

> A sonda nasceu por outro motivo: a suíte do toggle não achava os ícones, e antes de trocar o
> seletor por palpite eu fui ler o DOM. O seletor estava certo (o filtro do teste é que estava
> cego) — e a medição de passagem entregou este defeito.

## O conserto

```css
… .action-item.icon .action-label.codicon {
    font-size: 20px;   /* o que dá tamanho ao glifo */
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
}
```

`font-size` é o que faz o glifo crescer. `width`/`height` mantêm a caixa quadrada, para os quatro
ficarem alinhados e com a mesma área de clique.

## O custo, que é o mesmo do 0025

Ícone maior come folga da barra de cima, e agora os **quatro** crescem, não dois. Quem julga é
`tela_limite_barra.mjs`, no executável.
