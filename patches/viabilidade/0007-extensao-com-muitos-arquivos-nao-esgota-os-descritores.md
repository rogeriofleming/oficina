# Por que este patch existe

**O que ele faz:** em `build/lib/extensions.ts`, na função `fromLocalNormal` (a que empacota as
extensões embutidas **sem** esbuild), o conteúdo de cada arquivo passa a ser lido na hora
(`fs.readFileSync`) em vez de virar um `fs.createReadStream`.

## O problema

`createReadStream` **abre o arquivo assim que é criado**, e a função cria um por arquivo, todos de
uma vez. Enquanto as extensões embutidas eram as do upstream (poucas dezenas de arquivos cada) e as
nossas (esbuild), isso nunca apareceu.

A V27 embute extensões da loja (`extensoes/embutidas-da-loja.txt`, item 1b). O `vscode-office` tem
**~1750 arquivos**, 1263 deles só de ícones do tema *Material Icon Theme (Office Viewer)*. O build
`V27-B2` (25/09/2026) morreu no passo 6 com:

```
Error: EMFILE: too many open files, open '...\extensions\cweijan.vscode-office\icons\folder-batch.svg'
```

## Por que este conserto, e não o outro

A alternativa era tirar o tema de ícones da cópia embutida. Resolve, mas **tira do produto** uma
coisa que veio com a extensão e que ninguém pediu para tirar. Este patch não muda nada do que vai
para o instalador: muda só a forma de a ferramenta de build ler os arquivos.

**Custo:** o conteúdo dessas extensões fica na memória do build ao mesmo tempo, em vez de ser lido
aos poucos. São arquivos pequenos (ícones, gramáticas, temas): esperado desprezível, **não medido**.
As extensões com esbuild (as nossas e a maioria das do upstream) continuam no caminho de antes.
