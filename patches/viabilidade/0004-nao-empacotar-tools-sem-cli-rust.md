# Por que este patch existe

**O que ele faz:** acrescenta `skipifsourcedoesntexist` à linha do `[Files]` do instalador
que copia a pasta `tools\*` — a mesma flag que a linha `policies\*`, logo abaixo, já tem.

## O problema, medido ao empacotar pela primeira vez

`scripts\empacotar.bat` (gulp `vscode-win32-x64-user-setup`) falhou com:

```
Error on line 101 in build\win32\code.iss: No files found matching "...\VSCode-win32-x64\tools\*"
Compile aborted.
```

A pasta `tools\` é onde a pipeline oficial da Microsoft coloca os binários da **CLI em Rust**
do VS Code (`code`/`code-tunnel`), compilados por um passo à parte (Cargo/Rust), que não faz
parte do `gulp vscode-win32-x64-min` que este projeto usa — e não tem por quê fazer: a OFICINA
não embarca essa CLI. O Inno Setup, herdado sem alteração da Microsoft, sempre espera essa
pasta existir; sem a flag, ele recusa compilar o instalador quando ela está ausente.

## Por que é viabilidade, não produto

É a mesma categoria dos patches 0001-0003 desta pasta: uma peça fechada/exclusiva da esteira
oficial (aqui, o binário da CLI Rust) que o upstream aberto pressupõe, mas que uma build feita
fora dessa esteira não tem — e não tem como ter sem construir um projeto Rust à parte, fora do
escopo desta versão. Uma linha adiante, a própria Microsoft já trata o caso análogo de
`policies\*` exatamente com esta flag.

## O que muda para quem usa

Nada. `tools\` continua sendo copiada normalmente **se** existir (a flag só pula quando falta);
o instalador da OFICINA simplesmente não traz uma CLI que ela nunca teve.

## O que este patch NÃO resolve

A OFICINA não tem `code`/`code-tunnel` de linha de comando. Se algum dia isso for pedido, é
feature nova (constrói e embute os binários), não conserto deste patch.
