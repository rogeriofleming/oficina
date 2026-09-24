# Patch 0012 — o produto escolhe quais ícones da barra lateral nascem soltos

**O que faz:** quando um contêiner de vistas aparece numa barra de composição (a barra lateral, o
painel) **pela primeira vez, sem estado guardado**, o `PaneCompositeBar` o fixa — sempre. Com este
patch, se o id dele está na lista `defaultUnpinnedViewContainers` do `product.json`, ele nasce
**solto**: existe, abre pelo comando e pelo atalho, aparece enquanto está aberto, e a pessoa o fixa de
novo pelo menu da barra. Tudo o mais continua igual.

**Um arquivo: onze linhas entram, três mudam.** A declaração da chave em `IProductConfiguration` mora no patch 0001
(mesma razão do 0003: dois patches tocando `product.ts` perderiam a rede do `--3way`).

---

## Por que ele existe

A barra lateral nascia oculta pelo produto. O pedido novo pede botões nela — **Arquivos** (o explorador,
com as cores do Git), **Git** (o controle de versão) e **Skills** — e não a lista inteira de fábrica do
editor. Medido num perfil limpo com a barra ligada: nascem **sete** ícones (Explorer, Search, Source
Control, Run and Debug, Extensions, Tokens, Skills).

## Por que não deu para resolver por configuração

Procurado antes de escrever qualquer linha, no fonte da tag:

- `workbench.activityBar.location` só escolhe **onde** a barra fica (`default | top | bottom | hidden`).
- O estado de cada ícone (`{id, pinned, visible, order}`) mora no armazenamento do perfil
  (`workbench.activity.pinnedViewlets2`) e só muda pelo menu de contexto da barra. Não há configuração,
  chave de produto nem contexto que o preencha.
- Uma extensão só consegue esconder o **próprio** contêiner (`when` + `setContext`), e esconder não é
  soltar: um contêiner escondido por `when` não volta pelo menu da barra.
- Gravar `pinnedViewlets2` no armazenamento inicial seria mexer em estado da pessoa por fora do editor,
  com o formato interno de hoje, que muda sem aviso.

## Onde a guarda fica, e por quê

No único ponto em que o upstream decide "é novo, então fixa" (`onDidRegisterViewContainers`, o ramo
`if (!cachedViewContainer)`). Isso dá as três garantias que o produto precisa, sem código novo para elas:

1. **Estado guardado ganha.** Contêiner que já tem estado no perfil (a pessoa fixou, soltou, ou o padrão
   já foi salvo na primeira abertura) nunca chega a este ramo.
2. **Só na primeira vez.** Na primeira abertura o estado "solto" é salvo pelo próprio upstream
   (`saveCachedViewContainers`); da segunda em diante, vale o item 1.
3. **Mudar de lugar não é registrar.** Quem arrasta um contêiner para outra barra entra por
   `onDidChangeViewContainerLocation`, que agora avisa (`moved = true`): ali vale o comportamento do
   upstream (fixa), porque a pessoa acabou de pedir aquele contêiner ali.

O que o patch **não** toca, de propósito: o ramo de `updateCompositeBarItemsFromStorage` que também
fixa um contêiner desconhecido. Ele roda quando o armazenamento muda por fora (outra janela, sincronização
de perfil); ali o contêiner pode ter sido fixado de propósito em outro lugar, e o produto não deve adivinhar.
**Custo:** nesse caso raro, um contêiner da lista pode nascer fixado.

## A lista (no `product.json`, não aqui)

Pesquisa, Executar e Depurar, Extensões, Testes, Remoto, Referências e Tokens. Os três que ficam são os
pedidos. Contêiner que uma extensão instalada depois trouxer **nasce fixado**, como no upstream: a lista
é de exclusão, não de permissão — um ícone que não aparece depois de instalar uma extensão seria uma
surpresa pior do que um ícone a mais.

## Risco

**Baixo, e do tipo silencioso.** Se a chave sumir da mesclagem do `product.json`, nada quebra: a barra
nasce com os sete ícones. Por isso a chave é **obrigatória** em `scripts/aplicar_produto.mjs` (o build
aborta antes de compilar, com `testes/guarda_produto.mjs` provando que aborta), a ponte confere que o
nome da chave é o mesmo no produto, no 0001 e no 0012, e `testes/tela_lateral.mjs` mede a barra na
janela, inclusive reabrindo com o mesmo perfil.

Quem sobe de versão: se o upstream mover o ramo `if (!cachedViewContainer)` ou renomear
`onDidRegisterViewContainers`, o patch falha ao aplicar — que é o desejado.

## Verificação

- **Aplica** sobre a tag `1.136.1`: `git apply --check` no clone; e os dezoito patches (seis de
  viabilidade e doze de produto), em ordem, com `--3way`, numa cópia descartável dos arquivos da tag.
- **Tipos:** `scripts/conferir_tipos_do_patch.mjs` sobre 0001 + 0012 juntos (o 0012 sozinho não compila,
  e isso é esperado: a chave é declarada no 0001): 616 arquivos no programa, **0 erros**. Controles: o
  0012 sozinho acusa a chave inexistente, e com o nome trocado (`...Containerz`) acusa 1 erro na linha certa.
- ⛔ **Comportamento: não medido** (exige o núcleo compilado). `testes/tela_lateral.mjs` é quem mede no build.
