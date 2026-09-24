# Por que este patch existe

**O que ele faz:** quando um pedido é feito com `followRedirects: 0`, o serviço de requisição passa
a mandar também `redirect: 'error'` para a camada de rede — o que faz a **pilha de rede do
Chromium** recusar o redirecionamento, em vez de segui-lo sozinha.

## ⛔ O conserto anterior NÃO funcionava — e isso foi medido, não suposto

O patch `0007` manda o segredo do canal privado no cabeçalho `Authorization` e, para que ele não
acompanhe um redirecionamento para outro host, passa `followRedirects: 0` nos pedidos que o levam.
Lendo o código, isso bastava: `platform/request/node/requestService.ts` só segue redirect quando
`followRedirects > 0`. O `tsc` passou. Uma revisão de código aceitou.

**Em comportamento, vazou.** Com o produto instalado, um servidor de teste respondeu `302` para um
outro host, e esse outro host recebeu o pedido — **com o `Authorization` e o segredo da máquina** —
duas vezes, uma por verificação de atualização.

## A causa

No processo principal do Electron, o serviço registrado **não é** a classe que foi lida. É
`platform/request/electron-utility/requestService.ts`, uma subclasse que troca a função de
requisição por **`net.request`** do Electron:

```ts
function getRawRequest(options: IRequestOptions): IRawRequestFunction {
    return net.request as any as IRawRequestFunction;
}
```

`net.request` é a pilha de rede do Chromium, e ela **segue redirecionamento por dentro, por
padrão** — antes de a resposta chegar ao callback onde mora a checagem `followRedirects > 0`. A
checagem nunca vê o `302`. Ela não estava errada: ela estava num lugar por onde o pedido nunca
passava com o redirect ainda pendente.

A leitura olhou a classe-base. O que roda é a subclasse. **É o caso mais claro, nesta versão, de
por que conserto lido não é conserto medido.**

## O conserto

`net.request` aceita `redirect: 'follow' | 'error' | 'manual'`. Com `'error'`, o próprio Chromium
recusa o salto e o pedido falha — sem seguir, sem mandar cabeçalho nenhum para lugar nenhum.

O arquivo já tinha o precedente exato: a opção `cache`, que também só existe na pilha do Chromium,
é declarada no mesmo tipo e posta no mesmo objeto. `redirect` entra do mesmo jeito. No caminho de
Node puro a opção é ignorada, e a checagem original continua valendo lá.

## Quem mais é afetado

Ninguém. Conferido por busca no `src` inteiro: o único lugar que usa o `followRedirects` numérico
do serviço de requisição é o próprio patch `0007`. (Existe um `followRedirects` booleano noutro
serviço, o extrator de conteúdo web — é outra opção, de outra API, e este patch não o toca.)

## O que foi verificado, e o que falta

- `git apply --3way` aplica limpo na sequência real do build.
- `tsc --noEmit` no `src` inteiro, com este patch: 0 erros.

**Escrito, não medido** no momento em que este documento foi criado: que, reconstruído e
reinstalado, o produto **não** segue o `302` e o segredo **não** chega ao outro host. A medição é o
mesmo teste que provou o vazamento, rodado de novo — e ele tem controle: antes de testar o app, um
cliente que segue o redirect de propósito precisa aparecer no servidor de captura, para "nada
chegou" significar alguma coisa.
