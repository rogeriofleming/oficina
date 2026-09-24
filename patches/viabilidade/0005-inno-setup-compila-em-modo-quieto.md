# Por que este patch existe

**O que ele faz:** acrescenta `/Qp` (quiet compile, mantendo o progresso no stdout) à chamada
do `ISCC.exe` (o compilador do Inno Setup) em `build/gulpfile.vscode.win32.ts`.

## O problema, visto na tela de quem usa a máquina

`scripts\empacotar.bat` chama `npm run gulp vscode-win32-x64-user-setup`, que roda o
`ISCC.exe` sem nenhuma flag de silêncio. Por padrão, o Inno Setup **abre uma janela de
progresso na tela** durante os minutos que o empacotamento leva (o instalador da OFICINA tem
dezenas de milhares de arquivos) — apareceu na tela de quem estava usando o computador durante
uma corrida real deste script, sem que nada tivesse pedido isso.

## Por que é viabilidade

A pipeline oficial da Microsoft roda em um agente de CI sem ninguém na frente da tela, então
essa janela nunca incomodou lá. Rodando numa máquina de verdade, com gente trabalhando nela,
ela é exatamente o tipo de coisa que este projeto promete não fazer: build pesado nunca aparece
na tela de quem está usando o computador.

## O que muda para quem usa

Nada no instalador final. O compilador continua escrevendo o progresso no log (via stdout, que
`empacotar.bat` já redireciona para arquivo) — só a janela deixa de abrir.

`/Q` (sem o `p`) also silenciaria, mas suprime até o progresso do stdout; `/Qp` foi escolhido
porque mantém o log útil sem abrir nada na tela.
