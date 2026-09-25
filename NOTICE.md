# Avisos de origem

A OFICINA e um fork do nucleo open-source do
[Visual Studio Code](https://github.com/microsoft/vscode) (Code - OSS), licenciado sob a
MIT License, Copyright (c) Microsoft Corporation.

O texto da licenca deste repositorio ([LICENSE](LICENSE)) e o mesmo da licenca original, e o
copyright da Microsoft esta preservado nele, ao lado do dos autores da OFICINA.

## Por que este arquivo existe, e nao um paragrafo dentro do LICENSE

O GitHub identifica a licenca de um repositorio comparando o texto do arquivo `LICENSE` com os
textos padrao conhecidos. Qualquer frase a mais dentro dele quebra a comparacao, e a pagina do
repositorio passa a mostrar **NOASSERTION** em vez de **MIT** - foi o que aconteceu aqui enquanto a
explicacao de origem morava la dentro.

Medido em 24/09/2026: mover o paragrafo para o FIM do arquivo, depois de um separador, **nao
resolveu** - o detector continuou respondendo `NOASSERTION`. O que a pratica comum faz, e o que
passou a valer aqui, e manter o `LICENSE` com o texto padrao puro e por os avisos de origem num
arquivo proprio, como este.

Nada muda juridicamente: a licenca e a mesma, e os dois copyrights continuam declarados.
