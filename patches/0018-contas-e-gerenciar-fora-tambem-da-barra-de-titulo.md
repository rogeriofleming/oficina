# 0018 — Contas e Gerenciar fora TAMBÉM da barra de título

## O que muda

Quando o produto liga `hideActivityBarGlobalActions` (a chave que o patch 0014 criou), os dois ícones
globais — **Contas** e **Gerenciar** — deixam de aparecer **também na barra de título**, e não só na
barra de ícones lateral.

- `src/vs/workbench/browser/parts/titlebar/titlebarPart.ts`: `activityActionsEnabled` passa a
  responder `false` quando a chave do produto está ligada.
- Os construtores da barra de título (navegador e Electron, principal e auxiliar) recebem o
  `IProductService`, que eles ainda não tinham.

## O problema — e ele só apareceu na tela

O patch 0014 tirou os dois ícones da barra lateral. Na V20 ele mandou a barra de ícones para o topo
(`t198`: *"esses negócio ao invés de lateral, eu quero em cima, na horizontal"*), e aí o núcleo
desenha os ícones globais **pela barra de título** — por outro caminho, que o 0014 não toca.

Resultado medido no build 1, com o programa aberto: a barra de cima mostrava `Accounts` e `Manage`.
Ou seja, dois ícones que o produto tinha mandado sumir **voltaram por uma porta diferente**. Pior
que nunca tê-los escondido: a pessoa os vê reaparecer sem ter pedido.

⚠️ **Nada disso era visível sem compilar.** Nenhum teste de motor pega: o código do núcleo decide
isso em tempo de desenho, olhando a posição da barra de ícones. Foi a primeira execução do programa
compilado que mostrou.

## Por que aqui, e não uma configuração

A decisão já existe e já tem nome no produto (`hideActivityBarGlobalActions`). O que faltava era ela
valer nos dois lugares em que o núcleo desenha esses ícones. Criar uma segunda chave para dizer a
mesma coisa deixaria as duas fora de passo na primeira vez que uma delas mudasse.

## O que continua funcionando

Os comandos por trás dos dois ícones continuam alcançáveis: a paleta chega às configurações, às
extensões e aos temas; a conta do GitHub, pelo botão "Conectar ao GitHub" da vista do Git.

⚠️ **Custo, o mesmo do 0014:** a engrenagem é também onde o editor mostra "reiniciar para atualizar".
Não medido neste produto se a segunda porta (`update.titleBar`) aparece quando há atualização.

## Prova

`tsc -p src/tsconfig.json --noEmit` no clone com os 18 patches: **0 erros**. O comportamento na tela
é do **build 2** — está escrito, e não medido, até lá.
