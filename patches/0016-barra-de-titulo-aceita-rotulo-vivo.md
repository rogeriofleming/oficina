# Por que este patch existe

**O que ele faz:** um item da barra de título cujo **título curto** contenha `${chave}` passa a
desenhar o texto que estiver nesse *context key* — e a se redesenhar sozinho quando a chave muda.
A primeira linha desse texto é o que se lê na barra; o resto é o que o mouse mostra. O núcleo
também passa a dizer, por um *context key* próprio (`titleBarLiveLabel`), que sabe fazer isso.

**O que ele NÃO faz:** não coloca nada na barra. O núcleo continua sem saber que existe "limite",
"token" ou qualquer conteúdo nosso.

## O problema

O pedido do dono do produto:

> *"eu pedi alguma coisa que mostrasse na barra superior o limite da sessao e semanal, o tempo
> todo na tela?"* — e, ao ser perguntado: *"então faz"*.

Dois números que mudam ao longo do dia, sempre visíveis, na barra de cima. O patch 0002 já abriu
aquela barra à contribuição por manifesto, e é por ali que entram os ícones do explorador e da
conversa. Só que **o que entra por ali tem texto fixo**: o título vem do `package.json` e não muda
enquanto o programa roda. Serve para um botão; não serve para um mostrador.

## O que foi procurado antes de escrever — e não existe

Não é "não achei": é a lista do que foi verificado, no código da versão que este produto usa.

| Caminho | O que se mediu |
|---|---|
| `contributes.commands` | `title` e `shortTitle` são texto fixo, e `ICommandAction` não tem templating nem callback. |
| Campo de dica no manifesto | **não existe**: `ICommandAction` tem `tooltip`, mas `contributes.commands` só aceita `title`, `shortTitle`, `category`, `icon` e `enablement`. Por isso a dica não pode ser uma segunda chave — ela viaja no mesmo texto, depois da primeira quebra de linha. |
| API proposta | nenhuma das definições publicadas em `src/vscode-dts/` cita a barra de título. |
| `registerWindowTitleVariable` | existe e é alcançável por comando, mas escreve no **título da janela** — que vai para a barra de tarefas do sistema e que, com a barra de pesquisa ligada, vira o rótulo **dela**. Usá-lo sequestraria a barra de pesquisa, que é parte da composição que o dono definiu. |
| Serviço interno de itens customizados | é como o próprio núcleo desenha coisa viva ali — e é interno ao workbench, fora do alcance de qualquer extensão. |
| Vários comandos e `when` (um por faixa de porcentagem) | funciona sem patch nenhum, e foi recusado: 0 a 100 em duas janelas são centenas de comandos no manifesto, todos aparecendo em paleta e atalhos, para mostrar dois números. |

## Por que uma regra genérica, e não "desenhe o limite aqui"

A alternativa era ensinar ao núcleo o que é o nosso mostrador. Seria mais curto e seria pior,
pelo mesmo motivo do patch 0002: amarraria decisão de **produto nosso** dentro do **núcleo de
terceiro**, e toda mudança de ideia — outro texto, outro limite, outro item — viraria patch novo e
build. Com a regra genérica, *o que* se mostra mora na extensão embutida, onde se muda sem
recompilar nada.

É pelo mesmo motivo que o **aviso de "falta pouco" é marca de texto, e não cor**: pintar exigiria
que o núcleo soubesse a partir de que porcentagem este produto considera a janela apertada.

## Por que o título curto, e não o título

`title` continua sendo o nome de gente do comando — é ele que a paleta de comandos e a tela de
atalhos mostram. Se a substituição morasse ali, a pessoa veria `${oficina.limite}` escrito nos
dois lugares. `shortTitle` existe justamente para "o texto com que o comando se representa na
interface", e não é usado por paleta nem por atalhos.

## Por que o `titleBarLiveLabel`

Sem ele, um item com `${chave}` no título curto apareceria com o `${chave}` **escrito na tela**
num editor que não tem este patch. Com ele, o manifesto pede a chave no `when` e o item
simplesmente não aparece onde não há como desenhá-lo.

## Custo, declarado

- Qualquer extensão instalada passa a poder desenhar texto vivo na barra de título, e a ler
  qualquer *context key* por esse caminho. Numa OFICINA, onde quem escolhe o que vem embutido
  somos nós, o risco é pequeno — mas **existe**.
- O item se redesenha a cada mudança das chaves que ele cita. O ouvinte é filtrado por essas
  chaves, e não geral, **porque um ouvinte cego acordaria a barra de título a cada tecla digitada
  em qualquer lugar do editor**. Quem escreve na chave também precisa escrever só quando o texto
  muda — e isso é responsabilidade de quem contribui, não do núcleo.
- O texto de duas partes é uma convenção, não um tipo: quem puser duas linhas sem querer verá a
  segunda virar dica.

## O que fica do lado de cá

`extensoes/oficina-claude` contribui um comando sem ícone com
`shortTitle: "${oficina.limite}"`, sob `when: "titleBarLiveLabel && oficina.limite.aMostrar"`, e
escreve nas duas chaves a partir de `mostradorDoLimite.js`.

⚠️ **Reconferir a cada subida de tag.** Se o upstream passar a expor um caminho próprio para
conteúdo vivo na barra de título, este patch deve ser **apagado**, não carregado por inércia.

## O que foi conferido

- **Tipos:** 987 arquivos no programa, **1 erro** — e esse único erro é da própria tag: um patch
  de controle que só acrescenta uma linha de comentário ao mesmo arquivo acusa exatamente o mesmo
  (o import de folha de estilo, que o verificador não resolve). `--controle` acusa 2 a mais, e um
  controle dirigido (trocar o nome do método que lê o *context key*) acusa 1 erro na linha certa.
- **Comportamento: NÃO MEDIDO.** Que o texto apareça na barra, que o mouse mostre o resto e que o
  item suma num editor sem o patch só se prova com build.
