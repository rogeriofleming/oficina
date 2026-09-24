# Por que este patch existe

**O que ele faz:** a pasta temporária onde o serviço de atualização do Windows guarda o pacote
baixado passa a ter o **nome do produto** (`applicationName`) em vez do literal `vscode`.

```ts
// antes
path.join(tmpdir(), `vscode-${quality}-${target}-${arch}`)
// depois
path.join(tmpdir(), `${applicationName}-${quality}-${target}-${arch}`)
```

## ⛔ O problema — medido numa máquina real, com o VS Code oficial instalado ao lado

Com o prefixo fixo, uma compilação que usa `quality: "stable"` e instalador por usuário usa
**exatamente a mesma pasta** que o VS Code oficial: `%TEMP%\vscode-stable-user-x64`.

Em 12/09/2026, rodando o teste de atualização de verdade, o registro do próprio núcleo mostrou:

```
update#unlink: failed to unlink CodeSetup-stable-645f29cc....exe
  EBUSY: resource busy or locked
```

`645f29cc...` **não era um commit deste produto**: era o pacote de atualização pendente do VS Code
oficial instalado na mesma máquina. A rotina de limpeza deste serviço tentou **apagá-lo** — e só
não apagou porque um instalador do próprio VS Code, travado havia dias, mantinha o arquivo aberto.
Numa máquina sem esse acaso, **o pacote de atualização do VS Code teria sumido**.

E a pasta não divide só pacotes. Ela divide **nomes fixos** entre os dois produtos:

| arquivo | o que um produto faz com o do outro |
|---|---|
| `update-metadata.json` | o último a escrever ganha; o outro lê metadados que não são dele |
| `cancel.flag` | um produto sinalizando "cancelar" cancela a atualização em andamento do outro |
| `update-progress`, `session-ending.flag` | um lê o progresso e o encerramento do outro |
| todo `*.tmp` | a limpeza de um apaga o **download em andamento** do outro |

Nada disso aparece em teste feito numa máquina sem o VS Code instalado. Aparece exatamente na
máquina de quem mais provavelmente vai usar um fork do VS Code: alguém que já usa o VS Code.

## Por que o nome do produto

Cada produto passa a ter a sua pasta (`<applicationName>-stable-user-x64`), e a colisão deixa de
ser possível por construção — não por sorte de nome. O `applicationName` já é o campo que dá nome
ao executável e aos dados do produto; ele é, por definição, diferente para produtos diferentes.

*Por que isto nasceu agora, e não antes:* até esta mesma rodada, o produto usava outro valor de
`quality`, e a pasta não colidia. Esse valor foi revertido para `"stable"` por uma boa razão (ver o
patch de viabilidade que dispensa o AppX) — e a reversão reabriu a colisão, que ninguém tinha
previsto. É o tipo de defeito que só um teste na camada real, na máquina real, pega.

## O que foi verificado

- `git apply --3way` aplica limpo na sequência real do build, depois dos outros dois patches que
  tocam o mesmo arquivo.
- `tsc --noEmit` no `src` inteiro, com este patch: 0 erros.
- `applicationName` é campo obrigatório do produto (a compilação inteira depende dele para nomear o
  executável).

**Escrito, não medido** no momento em que este documento foi criado: que o serviço de atualização,
rodando instalado, passa a usar a pasta com o nome do produto e deixa a do VS Code intocada. A
medição dessa parte vem na mesma rodada, com o produto reconstruído e reinstalado.
