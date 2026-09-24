# Por que este patch existe

**O que ele faz:** acrescenta a chave de produto **`userDataFolderName`** — a pasta, dentro do
diretório de dados de aplicativo da plataforma, onde o build guarda os dados de quem usa. Ausente, a
pasta continua sendo `nameShort`, exatamente como no código de origem.

Três linhas, em três arquivos:

| Arquivo | O quê |
|---|---|
| `src/main.ts` | `getUserDataPath(args, product.userDataFolderName ?? product.nameShort ?? 'code-oss-dev')` |
| `src/vs/platform/environment/node/environmentService.ts` | o mesmo, em `NativeEnvironmentService` (o processo de janela) |
| `build/gulpfile.vscode.win32.ts` | a definição `UserDataFolderName` para o instalador, com a mesma conta |

A declaração do tipo (`IProductConfiguration.userDataFolderName?: string`) fica no **patch 0001**, que
é o único que toca `src/vs/base/common/product.ts` — mesma regra do `hideBuiltinWalkthroughs` e do
`defaultUnpinnedViewContainers`.

## O problema

Este produto é distribuído em **duas edições** compiladas do mesmo código: a pública e a da equipe (a
que tem canal de atualização privado). As duas tinham o mesmo `nameShort`, logo a mesma
`%APPDATA%\OFICINA` — e é lá que mora o `canal-privado.txt`, o segredo de máquina do canal
(patches 0007 e 0008). Uma revisão independente apontou isso em 19/09/2026: numa máquina
que rodou as duas, o arquivo de uma fica ao alcance da outra.

Havia duas travas no código (a edição sem `updateUrl` nem abre o arquivo; o segredo só viaja para a
origem configurada), mas as duas são **defesa em profundidade sobre a mesma pasta**. A causa de raiz é
a pasta compartilhada.

## Por que uma chave nova, e não `nameShort`

Trocar o `nameShort` de uma das edições resolveria a pasta — é assim que o upstream separa os canais
dele — **e levaria junto muito mais do que se pediu**: `nameShort` é o nome do EXECUTÁVEL
(`gulpfile.vscode.win32.ts`: `ExeBasename: product.nameShort`), aparece na tela em mais de uma dúzia
de mensagens do editor, e nomeia o produto no relatório de falhas. O pedido era separar a pasta de
dados; o resto do produto tem de continuar idêntico nas duas edições.

**O que este patch deliberadamente NÃO muda, e por quê:**

- **`applicationName`, `win32AppId`, `win32MutexName` e os demais identificadores do Windows.** Eles
  são a identidade de INSTALAÇÃO (entrada de desinstalar, associação de arquivo, protocolo, comando de
  linha). Mexer neles é outra mudança, com outras consequências, e ninguém a pediu.
  ⚠️ **Limite declarado:** com o mesmo `win32AppId`, as duas edições continuam sendo "o mesmo
  aplicativo" para o Windows — instalar uma por cima da outra continua sendo uma substituição, não uma
  instalação lado a lado. O que mudou é que os DADOS não se misturam mais.
- **`dataFolderName`** (`~/.oficina`): é onde ficam as extensões que a pessoa instala e o `argv.json`.
  Não há segredo ali, e separá-lo obrigaria a reinstalar as extensões ao trocar de edição. Fica
  compartilhado, de propósito.
- **A CLI em Rust** (`cli/src/tunnels/user_data_path.rs`) usa uma constante própria. Ela **não é
  empacotada** neste produto (ver `patches/viabilidade/0004`), então não há o que ajustar.

## Efeito colateral bem-vindo (não medido)

Com pastas de dados diferentes, o canal de comunicação entre instâncias — que o núcleo deriva do
`userDataPath` — também passa a ser diferente. **Esperado:** as duas edições podem ficar abertas ao
mesmo tempo, em vez de a segunda entregar a pasta para a janela da primeira. **Não medido:** exige as
duas instaladas e abertas.

## Verificação

- **Aplica:** a série inteira, **21 de 21** patches (6 de viabilidade + 15 de produto), em ordem, com
  `--3way`, num repositório de rascunho com os arquivos da tag `1.136.1`. O clone só foi lido.
- **Tipos** (`scripts/conferir_tipos_do_patch.mjs`, TypeScript 6.0.3 do próprio clone), sobre o
  conjunto `0001 + 0015` (os patches dependem um do outro): **1.021 arquivos no programa, 0 erros**.
  - Controle positivo do instrumento: `--controle` acusa 2 erros.
  - **Controle dirigido:** o 0015 **sem** o 0001 acusa exatamente 2 erros, um em cada ponto tocado —
    *"Property 'userDataFolderName' does not exist on type 'IProductService'. Did you mean
    'dataFolderName'?"*. É a prova de que a chave lida é a declarada, e não um campo solto.
  - ⚠️ `build/gulpfile.vscode.win32.ts` fica **fora** dessa conta: arquivos de `build/` são checados
    contra o `tsconfig` do `src` e acusam erros que já existem na tag (importação com extensão `.ts`,
    `@types` ausentes). Medido: um patch de viabilidade que toca `build/gulpfile.vscode.ts` acusa 29
    erros do mesmo tipo, sem nenhuma alteração nossa. O instrumento não cobre `build/`.
- **Guarda do produto** (`testes/guarda_produto.mjs`): `userDataFolderName` entrou na lista de chaves
  obrigatórias da mesclagem (sem ela, as duas edições voltam a dividir a pasta **sem nenhum erro**), e
  a mesclagem **aborta** quando a edição com canal ficaria na pasta da pública.
- ⛔ **Comportamento: não medido.** Que o programa compilado escreva em `%APPDATA%\OFICINA Equipe`, que
  o instalador deposite o segredo lá e que o desinstalador o apague de lá só se provam com um build e
  uma instalação. A prova fica para o build da V19.
