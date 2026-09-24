# Patch 0013 — a barra lateral volta ao padrão do produto

**O que faz:** registra um comando interno, `_workbench.activityBar.resetToProductDefaults`, na barra de
composição da **barra lateral primária** (`PaneCompositeBar` com `ViewContainerLocation.Sidebar`). Ele
deixa a barra como um perfil novo a recebe: **todo contêiner fixado, menos os que o produto lista em
`defaultUnpinnedViewContainers`** (a lista do patch 0012), na **ordem que os contêineres declaram**; e
grava na hora. Devolve `{ pinned, unpinned }` com os ids.

## O problema

A OFICINA oferece "Voltar ao layout padrão" no menu Layout. Quase tudo que ele desfaz tem caminho de
extensão (configurações) ou de comando do núcleo (`workbench.action.resetViewLocations`, os comandos do
patch 0011). O que a pessoa **fixou e soltou** na barra lateral, e a **ordem** em que arrastou os ícones,
não: mora na chave de perfil `workbench.activity.pinnedViewlets2`, que só esta classe escreve, e o
serviço público (`IPaneCompositePartService`) só **lê** (`getPinnedPaneCompositeIds`). Lido no fonte da
tag 1.136.1: não há comando nem método público que fixe, solte ou reordene.

## Como ele evita ser frágil

- **Um bloco no construtor e um método privado**, mais um `import`. Usa só o que a própria classe já usa:
  `compositeBar.getCompositeBarItems`, `compositeBar.setCompositeBarItems` (o mesmo caminho que
  `updateCompositeBarItemsFromStorage` usa quando o armazenamento muda por fora) e
  `saveCachedViewContainers`.
- **Grava explicitamente.** `setCompositeBarItems` chama `updateCompositeSwitcher(true)`, que **não**
  dispara o evento que salva. Sem a chamada a `saveCachedViewContainers`, a barra voltaria ao padrão só
  até a janela fechar.
- **Ordem:** pela `order` declarada de cada contêiner; empate (ou contêiner sem ordem, ou já desinstalado
  e só no cache) mantém a posição relativa em que estava. Nada é adivinhado.
- **Não toca no ramo do 0012** (o contêiner novo que nasce solto): o `import` fica longe das linhas dele, e
  o patch aplica com ou sem o 0012 antes. Sem o 0012, `product.defaultUnpinnedViewContainers` não existe e
  o `?? []` fixa tudo — o comportamento do editor de base.
- **Só a barra primária.** Painel e barra secundária não registram o comando.
- Se a barra lateral estiver no topo (`workbench.activityBar.location: top`), a barra da lateral também é um
  `PaneCompositeBar` da mesma localização: o comando fica registrado duas vezes, vale o registro mais novo,
  e as duas compartilham a mesma chave de armazenamento (a outra relê pelo `onDidChangeValue`).

## O que NÃO está aqui, de propósito

- Visibilidade e tamanho das partes, posição das vistas: já têm caminho (patch 0011 e
  `resetViewLocations`), e é a extensão que os chama, na ordem certa.
- **Largura da barra de ícones e altura da barra de cima por arrasto** (pedido de 18/09/2026): **não**
  escritos. Medido no executável da V12: as duas têm `sash` no grid, **desabilitado**, porque o tamanho
  mínimo e o máximo são o mesmo número (`ActivitybarPart.minimumWidth === maximumWidth`, 48 ou 36 px;
  `BrowserTitlebarPart.minimumHeight === maximumHeight`, 35 ou 30 px). Soltar esse travamento exigiria
  redimensionar por dentro os ícones (48/28 px de altura de item, fixos) e o conteúdo da barra de cima,
  cuja altura casa com a dos botões nativos da janela no Windows (`titleBarOverlay.height: 29`, fixado
  quando a janela nasce, `windows.ts`). Risco alto num patch que só se prova em build.

## Verificação

- **Aplica** na sequência inteira (6 de viabilidade + 13 de produto), em ordem, com `--3way`, numa cópia
  descartável dos arquivos da tag: 19 de 19, nenhum conflito.
- **Tipos:** 0001 + 0012 + 0013 juntos (o 0001 declara a chave do produto), TypeScript 6.0.3 do clone,
  `tsconfig` do `src`: 616 arquivos no programa, **0 erros**. Controles: `--controle` acusa 2 erros; com
  `setCompositeBarItemz` no lugar do nome certo, acusa 1 erro na linha certa do `paneCompositeBar.ts`.
- ⛔ **Comportamento: não medido** (exige o núcleo compilado). Prova, no próximo build com o núcleo compilado: soltar Skills e fixar
  Pesquisa pelo menu da barra, arrastar Git para o topo, "Voltar ao layout padrão" → Arquivos, Git e
  Skills fixados, nessa ordem, Pesquisa e Navegador soltos; fechar e reabrir → continua assim.

## O ícone que era o ATIVO na hora do padrão (19/09/2026)

**Medido no executável com este patch:** fixar a Pesquisa pelo menu da barra (o que também a ABRE), soltar
Skills e "Voltar ao layout padrão" → a barra continuava com Arquivos, **Pesquisa**, Git e Skills até reabrir
o programa, com o menu dizendo que a Pesquisa não estava fixada. A mesma sequência com Arquivos clicado
antes do padrão (outro ícone ativo) → Arquivos, Git e Skills, certo. Quem decidia era o ícone ativo.

**A causa, lida no núcleo** (`compositeBar.ts`): `setCompositeBarItems` troca os itens do modelo por objetos
novos, mas o `activeItem` do modelo seguia apontando para o objeto **velho** (fixado). Logo em seguida o
padrão fecha a barra lateral; ao desativar o ícone, o núcleo só redesenha se o ativo "não estiver fixado" —
e perguntava ao objeto velho, que dizia que estava. Nada redesenhava; o ícone solto ficava desenhado.

**O conserto:** o mesmo patch passa a tocar `compositeBar.ts`: depois de trocar os itens, o item ativo passa a
ser o objeto novo com o mesmo id. Vale também para o outro chamador do núcleo (a barra relida do
armazenamento quando outra janela muda os ícones), que tinha o mesmo defeito latente.

- **Critério** (`testes/layout.mjs`): o trecho do patch roda contra um modelo de mentira com a mesma forma;
  depois de trocar os itens, o ativo tem de ser o objeto novo (solto). Vermelho sem as duas linhas (o objeto
  velho, "fixado: true"), verde com elas.
- **Aplica:** 20 de 20 na sequência (6 + 14), com `--3way`, num repositório de rascunho com os arquivos da tag.
- **Tipos:** 0012 + 0013 + 0014 juntos: `compositeBar.ts` e `paneCompositeBar.ts` sem erro; o único erro é o do
  verificador no `import` de CSS do `globalCompositeBar.ts` (0014), o mesmo de antes.
- ⛔ **Comportamento no executável: escrito, não medido** (exige o núcleo compilado). Prova no próximo build: a
  sequência acima, sem arrastar nada → Arquivos, Git, Skills, já sem reabrir.
