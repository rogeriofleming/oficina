# 0014 — o produto tira Contas e Gerenciar da barra lateral

## O que muda

Uma chave nova do `product.json`, `hideActivityBarGlobalActions`. Com ela em `true`, a barra de ícones da
esquerda não mostra os dois ícones globais do pé dela: **Contas** e **Gerenciar** (a engrenagem). A barra
fica só com os contêineres que o produto fixa.

- `src/vs/base/common/product.ts`: a chave é declarada em `IProductConfiguration`.
- `src/vs/workbench/browser/parts/globalCompositeBar.ts`: com a chave ligada, os dois ícones não entram na
  barra, e a preferência "mostrar Contas" (guardada por perfil) não os traz de volta.

## Por que um patch

Contas só se esconde por uma preferência guardada no perfil (`workbench.activity.showAccounts`, no
armazenamento, não nas configurações: `configurationDefaults` não a alcança). Gerenciar não tem chave
nenhuma. Não há como tirar os dois por configuração.

## O que continua funcionando

Os comandos por trás dos dois ícones continuam: a paleta de comandos chega às configurações, às extensões
e aos temas; a conta do GitHub aparece pelo botão "Conectar ao GitHub" da vista do Git.

⚠️ **Custo desta escolha:** a engrenagem é também onde o editor mostra "reiniciar para atualizar". O núcleo
tem uma segunda porta para isso, na barra de título (`update.titleBar`), que este patch não toca. Não
medido: se ela aparece neste produto quando há atualização.

## Verificação

- **Aplica** sobre a tag `1.136.1` depois da série 0001–0013 (os arquivos da tag num diretório descartável,
  sem tocar no clone).
- **Tipos:** `scripts/conferir_tipos_do_patch.mjs`: 689 arquivos no programa; o único erro acusado é o
  `import` do CSS da linha 6 do `globalCompositeBar.ts`, que aparece igual com um patch que só acrescenta
  um comentário no mesmo arquivo (é do verificador, não do patch). `--controle` acusa 2 erros a mais.
- ⛔ **Comportamento: não medido** (exige o núcleo compilado). Prova, no próximo build: perfil limpo → o pé
  da barra lateral sem Contas e sem Gerenciar; fechar e reabrir → continua sem os dois.

## O menu da barra também para de oferecer "Accounts" (19/09/2026)

**Medido no executável com este patch:** o pé da barra saiu sem os dois ícones, como prometido — mas o menu de
contexto da barra lateral continuava listando **"Accounts" marcado**. Marcado e sem efeito: com a chave ligada o
ícone nunca volta, então o item mentia sobre um estado que não existe na tela.

**O conserto:** com a chave ligada, `getContextMenuActions` do `globalCompositeBar.ts` devolve a lista vazia — o
item sai do menu. (O menu do editor já descarta o separador que sobraria.) Sem a chave, nada muda.

- **Critério** (`testes/ponte.mjs`): o trecho do patch roda com um produto de mentira. Com a chave: nenhum item.
  Controle: sem a chave, "Accounts". Vermelho antes (o trecho não estava no patch) e com o `return []` trocado
  por um comentário ("Accounts" com a chave ligada).
- **Aplica:** 20 de 20 na sequência, com `--3way`. **Tipos:** 0012 + 0013 + 0014 juntos, o único erro continua
  sendo o do verificador no `import` de CSS; `--controle` acusa 2 a mais.
- ⛔ **Comportamento no executável: escrito, não medido.** Prova no próximo build: clique direito na barra
  lateral → o menu não tem "Accounts".
