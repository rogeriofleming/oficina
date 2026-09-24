# Por que este patch existe

**O que ele faz:** registra dois comandos internos no workbench:

- `_workbench.layout.captureSnapshot` devolve um retrato do layout: **o tamanho da janela**;
  visibilidade e tamanho da barra lateral, do painel e da barra secundária; posição e alinhamento do
  painel; em que lugar está cada contêiner de vistas e em que contêiner está cada vista.
- `_workbench.layout.applySnapshot(retrato)` põe a tela de volta nesse estado e devolve o que
  aplicou e o que ignorou.

## O problema

A OFICINA oferece presets de layout com nome ("salvar a tela do jeito que eu deixei, e trazer de
volta quando algo desfizer"). Quase tudo que um preset precisa restaurar mora no armazenamento do
workbench (`workbench.sideBar.size`, `workbench.panel.position`, `views.customizations`…), que
**nenhuma extensão lê nem escreve**. A API de extensão só alcança configurações e comandos que
alternam: e alternar sem saber o estado atual é o botão que erra justamente quando a tela está
bagunçada.

## Como ele evita ser frágil

- Usa só métodos **públicos** de `IWorkbenchLayoutService` e `IViewDescriptorService`
  (`isVisible`, `getSize`, `setSize`, `setPartHidden`, `getPanelPosition`, `setPanelPosition`,
  `getPanelAlignment`, `setPanelAlignment`, `getViewContainersByLocation`, `getViewContainerModel`,
  `moveViewContainerToLocation`, `moveViewsToContainer`, `moveViewToLocation`). Não lê chave de armazenamento por nome.
- Um bloco só, no **fim** de `layoutActions.ts`, mais dois nomes nos `import` do topo. Uma subida de
  tag que mexer no meio do arquivo não derruba o patch.
- O `apply` confere cada campo: formato desconhecido é recusado; parte, contêiner ou vista que não
  existe mais é **ignorado e reportado** (extensão desinstalada, vista removida), nunca adivinhado;
  tamanho fora de 50 a 10.000 px não é aplicado.
- Ordem de aplicação: primeiro onde as coisas moram (contêineres, vistas), depois posição do painel,
  depois visibilidade, e só então tamanho (parte escondida não se redimensiona).
- **A posição do painel só é aplicada quando muda** (corrigido em 18/09/2026, por revisão de código): o
  `setPanelPosition` do núcleo mostra o painel para movê-lo, mesmo quando ele já está no lugar salvo — e
  mostrar um painel cuja vista é o terminal cria um shell. Chamado sempre, aplicar qualquer layout com o
  painel fechado fazia o painel piscar e podia deixar um shell aberto. Tipos reconferidos com a guarda
  (`scripts/conferir_tipos_do_patch.mjs`: 653 arquivos, 0 erros; `--controle` acusa 2). Comportamento: não medido.
- **O alinhamento do painel só é aplicado com o painel em cima ou embaixo** (corrigido em 18/09/2026, por
  revisão de código): o `setPanelAlignment` do núcleo leva para baixo um painel que está ao lado. Chamado
  sempre, um layout salvo com o painel à direita terminava com ele embaixo (o alinhamento desfazia a
  posição aplicada logo antes). Tipos reconferidos: 0 erros. Comportamento: não medido.
- **Contêiner gerado** (corrigido em 16/09/2026, por revisão de código): uma vista arrastada para um lugar
  novo mora num contêiner que o próprio serviço cria, com id `workbench.views.service.<lugar>.<uuid>`, e
  apaga quando ele esvazia ou quando as posições das vistas voltam ao padrão (lido em
  `viewDescriptorService.ts` da tag). Esse id não volta. A primeira versão tratava o contêiner sumido
  como "não existe mais nesta instalação" — justamente no caso que o preset existe para cobrir. Agora a
  primeira vista do grupo cria um contêiner novo no lugar salvo (`moveViewToLocation`) e as outras vão
  para ele.

## O tamanho da janela no retrato (acrescentado em 20/09/2026)

O retrato passou a trazer `window: { width, height }`, de `layoutService.mainContainerDimension`.

**Por quê:** o próprio workbench dimensiona as partes como uma FRAÇÃO da janela — o padrão de fábrica
da barra lateral e da barra secundária é `Math.min(300, largura da janela / 4)` (`layout.ts`,
`LayoutStateKeys`). Um produto que queira devolver as partes ao padrão precisa refazer essa conta, e
**uma extensão não tem como medir a janela**: a API de extensão não expõe dimensão de janela, e a
página de uma webview só enxerga a si mesma. Sem este campo, "voltar ao padrão" só sabe mandar um
número fixo — e numa janela estreita o número fixo é MAIOR que o padrão de fábrica.

É **só captura**: o `apply` ignora o campo (nada no núcleo redimensiona a janela por aqui), e o
retrato antigo, sem ele, continua sendo aceito — quem lê é que decide o que fazer sem o dado.

Tipos reconferidos: 653 arquivos, **0 erros**; `--controle` acusa 2. Controle dirigido: com
`mainContainerDimensionz` no lugar do nome certo, o verificador acusa 1 erro na linha certa
("Property 'mainContainerDimensionz' does not exist on type 'IWorkbenchLayoutService'"), que é a prova
de que o campo lido existe mesmo no serviço. ⛔ Comportamento: não medido (exige build).

## O que NÃO está aqui, de propósito

Configurações (barra de status, barra de atividades, abas, minimapa): a extensão já lê e grava pela
API dela, e é lá que elas são capturadas.

## Verificação

- **Aplica** sobre a tag `1.136.1` (`git apply --check` no clone, sem alterar nada).
- **Tipos:** o arquivo com o patch passa no verificador TypeScript do próprio clone (6.0.3), com o
  `tsconfig` do `src`, lendo o arquivo patchado da memória: 653 arquivos no programa, **0 erros**.
  Controle positivo: com um erro de tipo proposital no `setPanelPosition`, o mesmo verificador acusa
  1 erro na linha certa.
- ⛔ **Comportamento: não medido** (exige o programa rodando). A prova fica para o próximo build, com o programa rodando.
