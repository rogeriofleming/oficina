# Por que este patch existe

**O que ele faz:** acrescenta **uma entrada** à lista de menus que uma extensão pode
preencher pelo `package.json`, apontando para `MenuId.TitleBar` — a barra de ferramentas
da barra de título.

**O que ele NÃO faz:** não coloca botão nenhum. O core continua sem saber quais ícones a
OFICINA quer; ele só passa a aceitar que alguém diga.

## O problema

O pedido do dono do produto, dito item a item:

> *"barra superior, deixa ícone do app, foto de perfil do git, ícone do files, ícone do
> claude, barra de pesquisa, e o 'minimizar e fechar' padrão, só isso."*

Ícone do app, barra de pesquisa e os controles da janela já vinham do core. O que faltava
era **juntar o explorador e a conversa na mesma barra** — e por meses este projeto
registrou isso como *"não existe"*.

**Não era verdade, e a razão de o erro ter durado é instrutiva.** `MenuId.TitleBar`
existe desde sempre e é justamente a barra de ferramentas global daquele lugar: o próprio
core a consome em `titlebarPart.ts:819` e coloca ali os próprios botões (`Toggle Chat`,
`Agent Status`). O que não existia era a **porta**: dos **97** ids de menu abertos ao
`contributes.menus`, nenhum apontava para ela. Procuramos "como pôr um ícone lá" e
concluímos "não dá", quando a pergunta certa era "por que o core consegue e nós não".

## Por que abrir a porta em vez de codificar os botões

A alternativa era um patch que registrasse `Arquivos` e `Conversa` direto no core. Seria
mais curto e teria sido pior:

- amarraria decisão de **produto nosso** dentro do **núcleo de terceiro**, e toda mudança
  de ideia — trocar um ícone, mudar a ordem, tirar um botão — viraria patch novo e build
  de 20 minutos;
- a cada subida de tag, seria mais superfície para conflitar.

Com a porta aberta, *quais* botões aparecem mora no manifesto de
`extensoes/oficina-claude`, onde se muda **sem recompilar nada** — e o patch continua do
tamanho de uma entrada de lista, mesmo que a barra mude por completo.

## Custo, declarado

Qualquer extensão instalada passa a poder contribuir para a barra de título. No VS Code
essa restrição parece deliberada: a barra é área nobre e disputada. Numa OFICINA, onde
quem escolhe o que vem embutido somos nós, o risco é pequeno — mas **existe**, e quem
instalar extensão de terceiro deve saber que ela alcança aquele espaço.

## O que fica do lado de cá

`extensoes/oficina-claude` contribui dois comandos com ícone (`$(files)` e
`$(comment-discussion)`) no grupo `navigation`, e os implementa em `extensao.js`.

⚠️ Os botões **abrem; não alternam.** A API de extensão não expõe se a barra lateral está
visível — só o workbench sabe — e adivinhar esse estado daria um botão que erra assim que
a pessoa mexe na tela por outro caminho (`Ctrl+B`, o "x" do painel). Fechar continua sendo
`Ctrl+B`. Se um dia incomodar, o lugar de resolver é um context key no `when` do
manifesto, não um palpite guardado em memória.

⚠️ **Reconferir a cada subida de tag.** Se o upstream passar a expor `MenuId.TitleBar`
por conta própria, este patch deve ser **apagado**, não carregado por inércia.
