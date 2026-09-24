# 0021 — a lista do produto alcança também o GRUPO DE EDITOR VAZIO

## O que muda

O patch 0019 deu ao produto a chave `editorTitleActionsToHide` e a usou para filtrar a **fileira
de ações da aba** (`MenuId.EditorTitle` e `MenuId.EditorTitleLayout`). Este estende o alcance da
**mesma lista** para os dois lugares que sobraram no grupo de editor vazio:

- `MenuId.EmptyEditorGroupContext` — o menu do botão direito num grupo vazio;
- `MenuId.EmptyEditorGroup` — a barra de ferramentas desse grupo (janela auxiliar).

`src/vs/workbench/browser/parts/editor/editorGroupView.ts`: injeta o `IProductService`, filtra as
ações dos dois menus por um helper só, e passa a montar o menu de contexto aqui em vez de entregar
o `menuId` ao serviço.

## O problema — e ele foi MEDIDO, não deduzido

O pedido dele foi *"sem opção de lock group"*. O conserto óbvio era pôr
`workbench.action.unlockEditorGroup` na lista do 0019, e foi o que se fez. Só que o 0019 tinha
tirado esse id da lista **de propósito**: o destravar é a única ação que o núcleo preserva na barra
de um grupo inativo, e escondê-lo deixaria quem travasse um grupo sem saída pelo clique.

Então a pergunta certa não era "escondo ou não escondo o cadeado", e sim **"ainda dá para travar um
grupo clicando?"**. Medido na tela em 21/09/2026, com o programa aberto:

| onde | tem "Lock Group"? |
|---|---|
| botão direito na **aba** | não (11 itens, nenhum é lock) |
| botão direito na **faixa das abas** | não (12 itens) |
| botão direito num **grupo vazio** | **SIM** |
| paleta de comandos | sim — e continua, de propósito |

Ou seja: havia uma porta de clique para TRAVAR e nenhuma para DESTRAVAR. Esse estado teria sido
criado por mim nesta versão, e não existia antes.

⚠️ **A leitura do código sozinha teria errado o alvo.** Ela apontava três menus candidatos; a tela
mostrou que dois deles nunca aparecem no uso normal e que o terceiro aparece. Se eu tivesse
"consertado" os três sem medir, teria escrito mais código do que o necessário e não saberia dizer
qual linha resolvia o problema dele.

## A causa RAIZ, achada depois — e por que este patch continua existindo

Lendo o manifesto da extensão oficial do Claude Code (22/09/2026) apareceu a configuração
**`claudeCode.lockEditorGroups`**: é ELA que trava o grupo onde a conversa abre. Era daí que vinha
o "Unlock Group" que ele viu na fileira da aba — não de um acidente do núcleo.

O produto passou a trazer `"claudeCode.lockEditorGroups": false`, o que ataca a origem. Este patch
**fica** como cinto de segurança, por dois motivos concretos:

1. a configuração é da extensão; se ela mudar o nome da chave, o travamento volta em silêncio;
2. o menu do grupo vazio oferece o "Lock Group" **independentemente** da extensão — qualquer clique
   ali recriaria o estado sem saída.

Cinto e freio atacam a mesma falha por caminhos diferentes. Nenhum dos dois é redundante quando o
custo do freio é uma função de seis linhas.

## Por que montar o menu aqui, em vez de passar o `menuId`

`IContextMenuService.showContextMenu` aceita `menuId` **ou** `getActions`, e o `getActions` do
delegate **prepende** ações extras — não substitui as do menu. Com o `menuId`, a montagem acontece
dentro do serviço, onde não há por onde tirar um item. Montar o menu no chamador é o que torna o
filtro possível, e é o mesmo caminho que outras partes do núcleo já usam.

## O que continua funcionando

Travar e destravar continuam na **paleta de comandos** (`View: Lock Editor Group`, `View: Toggle
Editor Group Lock`) — medido. Quem travar de propósito por lá destrava por lá. O que sai é o
caminho de travar sem querer.

## Custo declarado

A chave se chama `editorTitleActionsToHide` e agora vale para mais do que a barra de abas. O nome
ficou estreito para o que ela faz. **Foi escolha, não descuido:** duas listas para a mesma intenção
("estes comandos de editor não aparecem por clique") violariam a lei da fonte única — uma delas
envelheceria, e a divergência apareceria como um item reaparecendo sem explicação.

## Prova

`npm run compile-client` no clone com os 22 patches: **0 erros**. Na tela, depois do patch: a
fileira da aba ficou com um único item, o da nossa extensão ("Nova conversa"), sem botão "…" e sem
cadeado — medido por `testes/tela_fileira_da_aba.mjs`, 4/4 critérios.
