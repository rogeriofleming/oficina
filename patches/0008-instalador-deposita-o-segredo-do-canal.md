# Por que este patch existe

**O que ele faz:** duas linhas no instalador do Windows (Inno Setup). Se houver um arquivo
`canal-privado.txt` **na mesma pasta de onde o instalador foi aberto**, ele é copiado para a
pasta de dados do usuário — que é exatamente onde o núcleo o procura (ver
[`0007`](0007-canal-privado-por-segredo-de-maquina.md)). E o desinstalador apaga esse arquivo.

```
[Files]
Source: "{src}\canal-privado.txt"; DestDir: "{userappdata}\{#NameShort}"; \
  Flags: external skipifsourcedoesntexist ignoreversion

[UninstallDelete]
Type: files; Name: "{userappdata}\{#NameShort}\canal-privado.txt"
```

## Por que assim, e não com um script

A primeira ideia era um passo `[Run]` chamando um script (PowerShell) depois da instalação, que
gerasse o segredo, registrasse no servidor e escrevesse o resultado. Três coisas a derrubaram:

1. **Um `[Run]` de script no instalador de um editor de código é um cheiro ruim** — e, na
   edição pública, rodaria (ou pareceria rodar) em toda instalação. Duas linhas declarativas de
   cópia de arquivo são auditáveis numa olhada; um script não.
2. **Janela.** Qualquer processo lançado pelo instalador pode piscar na tela de quem instala, e
   este projeto já pagou esse preço duas vezes no mesmo dia (o compilador do Inno Setup abrindo
   janela, e um instalador que rodou com interface porque as flags de silêncio foram mangled
   pelo shell). Zero processo é melhor que um processo escondido.
3. **O segredo não precisa nascer na máquina de destino.** Ele é criado por quem opera o canal,
   na máquina de quem opera, e entregue como arquivo. Assim a credencial de administração do
   canal **nunca** viaja dentro do instalador — se o instalador circular, não leva nada com ele.

## O que cada flag faz (e por que cada uma importa)

- `external`: a origem é um arquivo **da máquina de quem instala**, lido na hora, e não algo
  embutido no instalador. Sem isso, o arquivo teria de existir no momento de **compilar** o
  instalador — ou seja, um instalador por máquina.
- `skipifsourcedoesntexist`: sem o arquivo ao lado, o instalador **não faz nada e não reclama**.
  É o que mantém a edição pública intocada e o que permite reinstalar sem o arquivo sem perder
  o segredo que já está guardado.
- `ignoreversion`: com o arquivo ao lado, ele substitui o que houver. Trocar o segredo de uma
  máquina é reinstalar com o arquivo novo ao lado.
- A linha do `[UninstallDelete]`: segredo esquecido em disco depois de o programa sair da
  máquina é risco sem dono.

## O que foi verificado — e o que NÃO foi

**Verificado (estático):** `git apply --3way` aplica limpo na sequência real do build, depois
do patch de viabilidade que também toca este arquivo. O destino (`{userappdata}\{#UserDataFolderName}`)
foi conferido **contra o código** que resolve a pasta de dados do usuário
(`platform/environment/node/userDataPath.ts`: `join(%APPDATA%, <nome do produto>)`), e não por
semelhança de nome.

### O destino mudou em 20/09/2026, e por quê (patch 0015)

As duas linhas deste patch — a que deposita o segredo e a que o apaga ao desinstalar — apontavam para
`{userappdata}\{#NameShort}`, que era a **mesma pasta nas duas edições**. Desde o patch 0015 cada
edição tem a sua, e as duas linhas passaram a apontar para `{#UserDataFolderName}`, a definição nova
que o `gulpfile.vscode.win32.ts` monta com a **mesma** conta do núcleo
(`userDataFolderName`, e sem ele `nameShort`).

**O que isso garante:** o instalador escreve exatamente onde o programa daquela edição vai ler, e
cada edição apaga, ao desinstalar, só o que ela mesma depositou — nunca o da outra.

**⚠️ O que isso NÃO faz, declarado:** o arquivo que uma instalação ANTERIOR ao 0015 deixou em
`%APPDATA%\OFICINA` **não** é apagado por ninguém. Nenhuma linha de `[InstallDelete]` foi acrescentada
de propósito: ela rodaria nas duas edições e apagaria, na pasta da pública, um arquivo que um dia pode
ser legítimo (se a edição pública ganhar canal próprio). A limpeza desse resto é ato de quem opera a
máquina, e está registrada como tal.

**⛔ ESCRITO, NÃO MEDIDO:** nenhuma instalação foi feita com este patch. Não há prova de que o
arquivo é copiado, de que o destino está certo na prática, nem de que a atualização em segundo
plano (quando `{src}` é uma pasta temporária, sem o arquivo ao lado) realmente **preserva** o
segredo já guardado, como o desenho prevê. Isso exige rodar o instalador, o que esta rodada não
podia fazer.

## Limite conhecido

Se alguém rodar o programa com a pasta de dados trocada (`--user-data-dir`, modo portátil, ou a
variável de ambiente que o núcleo respeita), o núcleo vai procurar o segredo **lá**, e não onde
o instalador o depositou. É o comportamento esperado de quem troca a pasta de dados de
propósito — mas vale saber, porque é exatamente o caso de qualquer teste automatizado, que usa
uma pasta descartável.
