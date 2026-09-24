# Patch 0004 — a aba do walkthrough mostra o título dele, e não "Welcome"

**O que faz:** duas coisas, e as duas são necessárias — a primeira sozinha não resolve:

1. o setter de `walkthroughPageTitle`, em `GettingStartedInput`, passa a disparar
   `_onDidChangeLabel` — como o setter de `selectedCategory`, três linhas acima, já fazia;
2. o caminho que abre um walkthrough **pelo id** passa a **atribuir** esse título, que ele nunca
   atribuía.

**Dois arquivos, quatro linhas.**

---

## Por que ele existe

A tela de boas-vindas da OFICINA é inteira nossa e em português: título "A OFICINA", quatro
passos, o texto todo. **Mas a aba, no topo, dizia "Welcome"** — em inglês, o tempo inteiro em que
a tela ficasse aberta.

Não é detalhe de tradução: é a única palavra visível daquela tela que não é nossa, e ela fica
justamente na moldura, ao lado do nosso ícone. Um produto que se anuncia em português com a aba
em inglês desmente a si mesmo.

## O mecanismo, medido no fonte

`getName()` (linha 81) já sabe fazer a coisa certa:

```ts
return this.walkthroughPageTitle
  ? localize('walkthroughPageTitle', 'Walkthrough: {0}', this.walkthroughPageTitle)
  : localize('getStarted', "Welcome");
```

E `gettingStarted.ts` **de fato** preenche esse campo ao abrir uma categoria. O que faltava era o
aviso: o editor só relê o nome da aba quando o input dispara `onDidChangeLabel`, e o setter de
`walkthroughPageTitle` era o único do arquivo que mudava algo lido por `getName()` **sem
disparar**. O valor mudava por dentro; a aba nunca era avisada para redesenhar.

**É defeito do upstream, não nosso.** Conferido: nenhum dos patches 0001, 0002 e 0003 toca este
arquivo. A OFICINA só é atingida mais que o VS Code porque, nela, a tela de boas-vindas é uma
peça de identidade — no upstream, "Welcome" na aba do walkthrough do próprio VS Code não destoa
de nada.

## ⚠️ A primeira versão deste patch não resolveu — e o teste mostrou

O primeiro corte tinha só o item 1. O build saiu, o teste rodou, e a aba continuava dizendo
**"Welcome"**: o evento passou a ser disparado, mas não havia o que ler — no caminho que a nossa
tela usa, `walkthroughPageTitle` **nunca era atribuído**.

Ele é atribuído em dois lugares (`scrollToCategory` e o ramo `openToFirstCategory`), e em nenhum
dos dois passa quem abre um walkthrough **por id**, que é como o comando "Boas-vindas da OFICINA"
funciona. Por isso os walkthroughs do upstream mostravam "Walkthrough: GitHub Copilot" na aba, e o
nosso não: eles eram abertos pelo seletor, o nosso por id.

**A lição, que vale além deste patch:** eu tinha uma explicação coerente do fonte — o setter sem
`fire()` — e ela estava **certa e incompleta**. Só o build provou. Explicação que fecha no papel
não substitui a medição.

## Como foi descoberto

Pela **uma revisao independente** da rodada de revisores da V1 (06/09/2026), usando o produto e
fotografando a tela — não por teste automático. Os testes conferiam o **conteúdo** do walkthrough
(título, passos, idioma) e passavam verdes; nenhum olhava o nome da **aba**.

## Risco

**Baixo.** É o mesmo padrão que o arquivo já usa no setter vizinho, no mesmo evento, para o mesmo
fim. O efeito colateral possível é um redesenho a mais do rótulo da aba quando o título muda — que
é exatamente o que se quer.

Quem sobe de versão: se o upstream corrigir isto (o comportamento atual parece descuido, não
escolha), o patch deixa de aplicar e deve ser **apagado**, não carregado por inércia.
