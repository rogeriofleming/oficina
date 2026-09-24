# Por que este patch existe

**O que ele faz:** duas coisas, e a segunda foi acrescentada em 12/09/2026, depois de uma
revisão de segurança independente achar o segundo buraco:

1. a atualização automática passa a **exigir** o `sha256hash` no manifesto. Sem ele, a
   atualização é recusada com uma mensagem que diz o motivo — em vez de ser instalada sem
   conferência nenhuma;
2. o pacote que **já estava no cache** também é conferido. Antes, um pacote encontrado em disco
   era aceito **sem hash nenhum**.

## O problema, lido no código da tag 1.136.1

Em `src/vs/platform/update/electron-main/updateService.win32.ts`, logo depois de o pacote ser
baixado, a cadeia era esta:

```js
.then(update.sha256hash ? () => checksum(downloadPath, update.sha256hash) : () => undefined)
```

Ou seja: **a conferência do pacote baixado é opcional, e quem decide é o servidor de atualização.**
Se o manifesto não trouxer o campo `sha256hash`, o ramo `() => undefined` roda, o arquivo é
renomeado para o lugar definitivo e instalado. Sem erro, sem aviso, sem linha no log.

Isso inverte a única coisa que a verificação existe para fazer. A pergunta que ela responde é *"o
que chegou é o que eu publiquei?"* — e a resposta ficava a cargo de quem entrega o pacote, que é
exatamente a parte de quem não se deve depender. Quem consegue responder pelo servidor (ou se pôr no
meio do caminho) desliga a checagem **omitindo um campo**.

⚠️ E há uma ironia no código de origem: `checksum(path, sha256hash)` termina com
`if (hash !== sha256hash) { throw new Error('Hash mismatch') }`. Com `sha256hash` valendo
`undefined`, essa comparação **já falharia sozinha**. É o ternário que impede a proteção natural de
agir — ele desvia da função antes que ela possa recusar.

## O segundo buraco: o pacote que já estava no cache entrava sem hash

Achado por uma revisão de segurança independente em 12/09/2026, depois de a primeira versão
deste patch já estar escrita — e é o mais importante dos dois, porque a promessa da versão
("pacote adulterado é recusado") continuava **falsa** por este caminho:

```js
return pfs.Promises.exists(updatePackagePath).then(exists => {
    if (exists) {
        return Promise.resolve(updatePackagePath);   // <- sem nenhuma conferência
    }
```

O arquivo de cache tem nome **previsível** (ele é derivado do commit, que vem do manifesto) e
mora numa pasta temporária do próprio usuário. Quem consegue escrever ali — uma extensão, um
script, qualquer coisa rodando com o mesmo usuário — planta o seu `.exe` com o nome certo e a
OFICINA o executa como atualização, silenciosamente. Não é escalada de privilégio (é o mesmo
usuário), mas é **exatamente** o caso que a verificação de hash existe para impedir.

Agora o galho do cache confere o hash, e **apaga o arquivo** quando não bate, caindo no download
normal. Um pacote plantado deixa de ser atalho: ele é descartado e o pacote de verdade é baixado.

## Por que não deu para resolver sem tocar no núcleo

Não há configuração, nem campo de `product.json`, que torne a verificação obrigatória: a decisão
está escrita na cadeia de promessas do serviço de update, dentro do processo principal. O
`product.json` só diz **para onde** pedir a atualização (`updateUrl`), nunca **como** conferi-la.

## O que muda para quem usa

Nada, quando o canal funciona: o manifesto da OFICINA sempre traz o hash, então o caminho normal é
idêntico ao de antes.

Quando o manifesto **não** traz o hash, a atualização para e a pessoa vê a mensagem — se ela mesma
tiver clicado em "procurar atualizações". Na verificação automática de fundo, o erro vai só para o
log, que é o comportamento do próprio núcleo para qualquer falha de atualização (mostrar caixa de
erro sozinho, sem ninguém ter pedido, seria pior).

## ⚠️ O que este patch NÃO prova ainda

O patch está **aplicado e conferido na aplicação** (`git apply --check` limpo contra a tag 1.136.1),
e o texto do conserto foi lido linha a linha. Mas o **comportamento** — "um manifesto sem hash é
mesmo recusado pelo app rodando" — **não foi medido**, porque ainda não existe canal de atualização
nenhum: hoje o `product.json` não tem `updateUrl`, e sem ele o serviço de update nem inicia.

A prova de comportamento é parte da própria versão que cria o canal, e são **três** casos, não um:

1. manifesto **sem** `sha256hash` ⇒ recusa (é o que este patch acrescenta);
2. manifesto com hash **errado** ⇒ recusa (isso o núcleo já fazia — e o teste existe para provar que
   o patch não quebrou);
3. manifesto com hash **certo** ⇒ instala (o controle, sem o qual "recusar tudo" passaria nos dois
   primeiros).

Até esses três rodarem contra um servidor de atualização de verdade, o que existe aqui é um conserto
**lido**, não um conserto **medido**.
