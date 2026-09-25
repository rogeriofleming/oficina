# Os atalhos da conversa — o que existe, o que custou, o que não dá

> Pedido dele, com o editor aberto: *"tem como add atalhos no oficina pra mexer no claude, tipo o
> ctrl w, ctrl t, ctrl tab (diferente do shift tab) e tals?"*
>
> Estado do produto e o porquê de cada decisão: o registro de versoes do projeto.
> Os padrões de interface que acompanham estes atalhos moram no **`produto/product.json`**, em
> `configurationDefaults` — e é de lá que valem, desde o patch `0001`, que faz o desktop ler essa chave
> do produto. ⚠️ **Esta linha já disse o contrário** ("moram no `package.json` desta extensão"): era
> verdade por algumas horas de 06/09/2026, e deixou de ser no mesmo dia, quando se mediu que uma
> extensão **não consegue** cumprir esse papel — ela é registrada depois que o layout e a barra de
> título já decidiram o que mostrar. O porquê inteiro está no `__porqueNaoTemMaisConfiguracao` do
> [`package.json`](package.json).

**Dá.** E dá de três formas diferentes, que não custam a mesma coisa. Esta é a lista do que foi
verificado no manifesto da extensão instalada (`anthropic.claude-code` **2.1.261**, lida em
05/09/2026) — não é o que se supõe que exista.

## O que a extensão do Claude já expõe: 26 comandos

Os que importam para atalho:

| Comando | O que faz |
|---|---|
| `claude-vscode.editor.open` | abre uma conversa em **aba nova** |
| `claude-vscode.newConversation` | conversa nova **dentro** do painel que está aberto |
| `claude-vscode.reopenClosedSession` | **reabre a última conversa fechada** |
| `claude-vscode.focus` / `.blur` | pula para o campo de escrever, e volta |
| `claude-vscode.editor.openLast` | reabre a última |
| `claude-vscode.toggleFocusView` | esconde/mostra o resto da tela |
| `claude-vscode.renameSessionTab` | renomeia a guia da conversa |
| `claude-vscode.markSessionUnread` | marca como não lida |

## O que passa a valer no produto

Declarado em `contributes.keybindings` **desta** extensão, que é embutida no build — ou seja, vale
para o produto, não para o perfil de ninguém.

| Tecla | O que faz | O que ela CUSTA |
|---|---|---|
| **Ctrl+T** | abre a conversa — pelo comando **nosso**, `oficina.abrirConversaOuExplicar`, que desde a V23 leva à conversa da extensão oficial. Se já houver uma aberta, ele traz ESSA para a frente em vez de abrir outra | toma o lugar de *"Ir para Símbolo no Workspace"*, que continua acessível por **Ctrl+P** e depois `#` |
| **Ctrl+Shift+T** | reabre a última conversa fechada | ⚠️ a tecla **já era** `workbench.action.reopenClosedEditor` no editor (`editorActions.ts:1702`). O nosso só vence quando a última coisa fechada foi uma conversa (`when: claude-vscode.lastClosedWasSession`) — mas nesse caso, quem queria reabrir o **arquivo** fechado antes dela não o recebe |

## ⚠️ As portas da conversa — e para onde elas levam hoje

São **duas** portas para a mesma coisa — o primeiro botão da tela de boas-vindas e o **Ctrl+T** — e
as duas passam por `oficina.abrirConversaOuExplicar`. (Eram três: o botão **Conversa** da barra de cima
saiu na V20, por ordem do dono, junto com os outros dois botões de lá.)

**Desde a V23 esse comando abre a conversa da extensão OFICIAL**, por decisão do dono em 21/09/2026.
O programa já abria assim desde a V20; o que faltava era a tecla concordar com a abertura — até a V22,
apertar Ctrl+T dava uma conversa de um tipo e iniciar o programa dava a de outro, e as duas se
chamavam "a conversa da OFICINA".

**O painel próprio NÃO foi removido — ele virou o caminho de volta.** Continua dentro do programa,
e a porta cai nele quando a extensão oficial não responde (ausente num build de teste, desativada,
ou quebrada no meio de um trabalho). Ninguém fica sem conversa por causa de uma loja.

**Desde a V27, o Ctrl+T não abre conversa numa janela SEM PASTA.** Sem pasta, a conversa rodaria na
pasta pessoal, e as instruções, skills e regras que moram dentro da pasta do projeto não seriam
carregadas. Nesse caso o Ctrl+T pergunta qual pasta abrir (e oferece a "pasta de sempre", se houver).
Com pasta aberta, nada muda. E a primeira abertura do programa instala sozinha o Claude Code, se ele
faltar — é por isso que o painel próprio só aparece quando a instalação não deu certo.

**⚠️ A porta usa `claude-vscode.focus`, e a escolha do comando não é detalhe.** Os títulos dos comandos
dela enganam, e os três foram lidos no corpo das funções, no pacote 2.1.278:

| comando dela | o título promete | o que ele faz de verdade |
|---|---|---|
| `editor.open` | "Open in New Tab" | sem id de sessão, cria uma webview NOVA a cada chamada — e regrava a preferência de local de quem usava a barra lateral |
| `editor.openLast` | "Open" | não reabre a última: só escolhe entre lateral e editor conforme a preferência, e delega |
| **`focus`** | "Focus input" | pergunta primeiro se já existe conversa: usa a visível, REVELA a escondida, e só abre quando não há nenhuma |

É por isso que a rajada de Ctrl+T continua abrindo **uma só** — com `editor.open` no lugar, cada toque
seria uma sessão de agente nova.

**Efeito colateral declarado, e desejado:** com texto selecionado, o Ctrl+T leva a seleção para a caixa
como referência. Quem seleciona um trecho e aperta a tecla quer falar daquele trecho. Sem seleção, só abre.

> **O que esta seção dizia antes, e por que o histórico fica.** Até a V1 a conversa vinha da extensão
> da loja, que **não viaja no instalador**: numa instalação recém-baixada, quem clicasse recebia um
> *"não" mudo* — o comando não existia, nada acontecia na tela, nenhum aviso aparecia. Achado por uma
> revisao independente em 06/09/2026, usando o produto. A V2 removeu a causa fazendo a conversa ser
> nossa, e os seis critérios que cobravam a explicação foram substituídos, um a um, por *"a porta ABRE
> o painel?"*.
>
> **A V23 volta para a oficial — mas sem o defeito de 06/09**, e essa é a diferença que importa: o
> painel próprio fica como caminho de volta, então não existe mais o cenário "a extensão falta e a
> tecla não faz nada". Os critérios foram substituídos de novo, um a um, em
> `testes/portas_da_conversa.mjs`.

**O comando explícito do caminho de volta continua na paleta:** *"OFICINA: Abrir a conversa da
extensão oficial (caminho de volta)"* (`oficina.abrirConversaOficial`). Desde a V23 ele leva ao mesmo
lugar que as portas; o que ele tem de próprio é **oferecer a loja** quando a extensão falta — coisa
que a porta não faz, porque uma tecla de atalho que abre caixa de diálogo atrapalha mais do que ajuda.

**Ctrl+Shift+T continua apontando direto** para `claude-vscode.reopenClosedSession`, e isso está certo:
o `when` dele (`claude-vscode.lastClosedWasSession`) só é verdadeiro quando a extensão está rodando —
sem ela, a tecla nem chega a ser nossa, e volta a ser o "reabrir aba fechada" do editor.

## ❌ Um atalho foi RETIRADO daqui — e o motivo é uma correção, não um ajuste

A primeira versão desta lista trazia **Ctrl+Shift+Espaço** para `claude-vscode.focus` (pular para o campo
de escrever), com o custo declarado como ***"nenhum"***. As duas coisas estavam erradas:

1. **A tecla já é do editor:** `editor.action.triggerParameterHints`
   (`vs/editor/contrib/parameterHints/browser/parameterHints.ts:84`) — é o que mostra a assinatura da
   função enquanto se digita uma chamada.
2. **E o nosso ganhava dela em qualquer contexto**, porque foi declarado **sem `when`** e numa extensão
   **embutida**, que pesa mais que um atalho do editor (`BuiltinExtension` 300 × `EditorContrib` 100,
   `keybindingService.ts:633`). Ou seja: com o cursor dentro do código, apertar Ctrl+Shift+Espaço
   deixaria de mostrar a assinatura do parâmetro e jogaria o foco para o Claude.

**O conserto não foi pôr um `when`, foi apagar o atalho:** a própria extensão do Claude **já oferece
`Ctrl+Esc`** para exatamente essa função (`claude-vscode.focus`, declarado no manifesto dela com
`win: ctrl+escape`). O atalho era redundante — ganho zero, custo real.

Achado por revisor independente em 05/09/2026, lendo o fonte. Eu tinha escrito "custo: nenhum" sem
conferir se a tecla já tinha dono — que é o mesmo erro de afirmar um negativo sem verificar.

## O que já funcionava e não precisou de nada

- **Ctrl+W fecha a conversa** — desde que ela esteja como **aba de editor**. É o `Ctrl+W` normal do
  editor fechando a aba ativa. ⚠️ Com o Claude na **barra lateral**, esse mesmo Ctrl+W fecha o
  **arquivo de código**, não a conversa: não existe "fechar o painel lateral" nessa tecla.
- **Ctrl+Tab alterna entre as conversas** — pelo mesmo motivo: são abas, e o editor já alterna abas
  do grupo com Ctrl+Tab. Se houver arquivo de código aberto no mesmo grupo, ele entra no rodízio
  junto; para o rodízio ser só de conversas, elas precisam ficar num grupo separado.
- **Ctrl+Alt+F** esconde o resto da tela (`toggleFocusView`), já vem da extensão.

## O que foi LIGADO por configuração (e não é atalho nosso)

⚠️ **Mora no `configurationDefaults` do `produto/product.json`.** O desktop de fábrica de fato **não**
lê essa chave (ela só valia no VS Code web) — quem a faz valer aqui é o patch
[`0001`](../../patches/0001-desktop-le-configurationDefaults-do-produto.md), que é a razão de ela ter
voltado da extensão para o produto.

`claudeCode.enableNewConversationShortcut` vem **desligado** de fábrica. Ligado ali, ele faz **Ctrl+N** abrir conversa nova **quando o Claude está com o foco** —
e só nesse caso; com o foco no código, Ctrl+N continua criando arquivo novo. O `when` que garante
isso é da própria extensão.

## O que NÃO dá, e por quê

- **Shift+Tab continua sendo dela.** Ele pediu explicitamente algo *"diferente do shift tab"* — e
  está certo: Shift+Tab é o alternador de modo do Claude Code, desenhado **dentro da webview**.
  ⚠️ **O que está PROVADO é o mais fraco:** não existe `shift+tab` nos 9 atalhos do manifesto dela, e
  não dá para impedir o que a webview faz com a tecla. **Não testei** se um atalho nosso com
  `when: activeWebviewPanelId == 'claudeVSCodePanel'` chegaria antes — então "não é remapeável" é
  **não achei como**, não um fato medido.
- ~~**Nada que dependa de mudar o que a webview desenha.** Atalho chega até o comando; o que acontece
  na tela depois é HTML de terceiro. É a mesma parede dos quatro requisitos de layout — e o lugar
  onde ela cai é a **V2**.~~
  ✅ **A parede caiu na V2 (10/09/2026).** A webview da conversa passou a ser nossa, então o que
  aparece na tela é decisão do produto, não de terceiro. O que **continua** valendo é a parte de
  cima: atalho chega até o comando — só que agora o comando é nosso do outro lado também
  (`oficina.pararAgente`, por exemplo, para o que o agente estiver fazendo).
- ⚠️ **Ctrl+Shift+Esc** aparece no manifesto da extensão (abrir em aba nova), mas **o Windows come
  essa tecla antes**: é o atalho do Gerenciador de Tarefas do sistema. Não adianta contar com ela.
