# Por que este patch existe

**O que ele faz:** tira da tela "Sobre" as duas linhas que anunciam a versão de um produto de
terceiro (`@github/copilot` e `@github/copilot-sdk`). O resto do diálogo — versão, commit, data,
Electron, Chromium, Node.js, V8 e sistema operacional — continua igual.

## O problema, medido

A tela "Sobre" é a única em que o nome do produto aparece por extenso. Nela, a OFICINA anunciava:

```
@github/copilot: 1.0.81-0
@github/copilot-sdk: 1.0.11
```

**Duas informações falsas.** A OFICINA não embute nenhum dos dois: o empacotamento remove as
extensões de terceiro da saída, e o produto desliga os recursos de chat do upstream
(`chat.disableAIFeatures`). O que a tela mostrava era a versão travada no `package-lock.json` do
núcleo, não algo que exista dentro do programa.

## Por que não deu para resolver pelo `product.json` — a parte que estava registrada errada

O projeto vinha tratando isso como "herança do upstream, decisão de identidade". A causa real é
outra, e são **duas** camadas, as duas verificadas no fonte da tag 1.136.1:

1. **O empacotamento carimba a chave de volta.** `build/gulpfile.vscode.ts:342` escreve
   `json.copilotVersions = { runtime: getLockedPackageVersion('@github/copilot'), … }` no
   `product.json` que vai para dentro do build. Nosso `__remover` tira a chave do `product.json`
   do clone — e o gulp a repõe depois. Medido no build de 06/09/2026: o `product.json` do
   repositório não tem a chave, e o `resources/app/product.json` do executável tem.
   *(E, rodando do fonte, `src/vs/platform/product/common/product.ts:61` faz o mesmo em runtime,
   lendo as dependências do `package.json`.)*
2. **As duas linhas são fixas no template do diálogo.** `dialog.ts` monta o texto com
   `@github/copilot: {8}` escrito na string e `copilotVersions?.runtime || 'Unknown'` como
   argumento. Ou seja: mesmo que a remoção do `product.json` funcionasse, a tela continuaria
   mostrando as duas linhas — com a palavra **Unknown** no lugar do número. Some o dado, fica o
   nome do produto de terceiro.

Por isso a porta é o patch no núcleo, e não `product.json` nem extensão embutida: é no núcleo que
o texto existe.

## O custo, declarado

- **Mais um patch para reaplicar a cada subida de tag.** Este é pequeno (uma string e duas linhas
  de argumento) e mexe numa função que raramente muda, mas conflito de patch é o preço conhecido
  do modelo — e agora são cinco.
- **A chave `copilotVersions` continua no `product.json` do build.** Este patch não a remove:
  ninguém a vê, e mexer no empacotamento para tirá-la seria um segundo patch para um sintoma que
  já não aparece na tela. Se um dia ela precisar sumir de verdade (repositório público, V8), o
  lugar é `build/gulpfile.vscode.ts`.
- **Se a OFICINA um dia embutir algo que dependa dessas versões**, a linha volta — e aí ela será
  verdadeira.

## Como conferir que ele está valendo

`node testes/about.mjs` abre o diálogo nativo do Windows e lê o corpo dele. O critério
"o corpo do Sobre não anuncia produto de terceiro que a OFICINA não embute" reprova se qualquer
linha com `copilot` voltar.
