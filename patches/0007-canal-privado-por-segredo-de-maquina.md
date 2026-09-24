# Por que este patch existe

**O que ele faz:** permite que uma instalação desta OFICINA busque atualização num **canal
privado**, provando quem é com um **segredo próprio daquela máquina** — sem que esse segredo
apareça em log nenhum.

Concretamente: se existir um arquivo `canal-privado.txt` dentro da pasta de dados do usuário
(`userDataPath`, que no Windows é `%APPDATA%\<userDataFolderName, ou nameShort sem ele — ver o
patch 0015>`), o serviço de atualização passa a
enviar o conteúdo dele como `Authorization: Bearer <segredo>` — **e só para o mesmo endereço
configurado em `updateUrl`**. Sem o arquivo, nada muda: nenhum cabeçalho a mais, nenhuma
requisição diferente. É por isso que a edição pública, que não tem esse arquivo, se comporta
exatamente como antes.

## O problema que ele resolve

Um canal de atualização público serve qualquer pessoa — é o que se quer de uma edição pública.
Um canal **privado** (uma compilação que só deve chegar a um grupo pequeno e conhecido) precisa
de alguma prova de quem está pedindo, e precisa poder **cortar o acesso de uma máquina só**,
sem derrubar as outras.

O núcleo não oferece nada para isso: `updateUrl` é um endereço fixo, igual para todos, e a
requisição de atualização não carrega credencial nenhuma. As duas saídas sem tocar no núcleo
seriam ruins:

- **segredo no caminho da URL** (`/canal/<segredo>/api/update/...`): funciona, e **vaza**.
- **um instalador diferente por máquina**, com o segredo embutido no pacote: funciona, e
  transforma o segredo em algo que viaja dentro de um arquivo de centenas de MB.

## ⛔ Por que `Authorization`, e não a URL — isto foi medido no código, não suposto

Dois lugares do próprio núcleo registram a requisição de atualização:

1. `src/vs/platform/request/common/request.ts`, em `AbstractRequestService.logAndRequest`:
   registra `#<n>: <url inteira>` e os cabeçalhos. Os cabeçalhos passam por uma classe
   `LoggableHeaders`, que troca o valor por `*****` em **exatamente dois** nomes:
   `authorization` e `proxy-authorization`. Nada mais é mascarado — **a URL, não**.
2. `src/vs/platform/update/electron-main/abstractUpdateService.ts`, em `doIsLatestVersion`:
   registrava `{ url, headers }` **crus**, sem passar por `LoggableHeaders`.

Ou seja: o único lugar onde um segredo pode viajar e **não** ser escrito em log é o cabeçalho
`Authorization`. Com o segredo no caminho da URL, qualquer execução com `--log trace` o
gravaria no arquivo de log da máquina — e, do outro lado, ele também apareceria nos registros
de quem serve a requisição, que é justamente onde um endereço pedido fica guardado por padrão.

Por isso este patch faz duas coisas, não uma:

- manda o segredo no `Authorization`;
- **tira os cabeçalhos daquele registro cru** em `doIsLatestVersion` (passa a registrar só a
  URL), porque senão a proteção do item 1 seria contornada pelo item 2.

## A guarda que impede o pior caso — e por que ela sozinha NÃO bastava

O pacote a baixar vem de um endereço que **o servidor escolhe** (o campo `url` do manifesto de
atualização). Sem guarda, bastaria um manifesto apontar para outro host para que o segredo da
máquina fosse entregue a esse host junto com o download.

Então o segredo só é anexado quando a origem do endereço pedido é **idêntica** à origem do
`updateUrl` configurado no produto. Qualquer outra origem recebe a requisição sem o cabeçalho.

### ⛔ O buraco que a primeira versão deste patch tinha, e a correção

A primeira versão parava aqui — e **estava furada**. Uma revisão independente (12/09/2026)
mostrou o caminho, lendo `platform/request/node/requestService.ts`:

```js
const followRedirects: number = isNumber(options.followRedirects) ? options.followRedirects : 3;
if (res.statusCode >= 300 && res.statusCode < 400 && followRedirects > 0 && res.headers['location']) {
    nodeRequest({ ...options, url: res.headers['location'], followRedirects: followRedirects - 1 }, token)
```

O serviço de requisição **segue até 3 redirecionamentos por padrão** e repassa `{ ...options }`
inteiro — **cabeçalhos incluídos** — para o endereço novo. A guarda de origem é avaliada **uma
vez**, quando o pedido é montado, e não acompanha o salto. Como quem responde o canal também
escolhe o `Location`, um servidor comprometido responderia `302 -> https://outro.host/x` e
receberia o `Authorization` com o segredo da máquina. Ou seja: a proteção que este documento
afirmava ter fechado estava aberta por outra porta.

**A correção:** quando o pedido leva o segredo, ele vai com `followRedirects: 0` — nenhum salto.
Sem segredo, o padrão de 3 continua valendo, e **precisa** continuar: um canal público servido
por GitHub Releases responde justamente com redirecionamento.

### ⛔ E a correção acima, SOZINHA, também não bastava — medido com o produto instalado

Com o produto reconstruído e instalado, um servidor de teste respondeu `302` para outro host, e
**o outro host recebeu o `Authorization` com o segredo** — duas vezes. O `followRedirects: 0`
estava no pacote compilado; o `tsc` passava; a revisão tinha aceitado.

A causa: no processo principal do Electron, a requisição sai pela pilha de rede do **Chromium**
(`net.request`), que segue redirect **por dentro**, antes de a checagem `followRedirects > 0` ver o
`302`. O conserto completo é o patch [`0010`](0010-sem-redirect-quando-pedido-na-pilha-do-chromium.md),
que traduz `followRedirects: 0` em `redirect: 'error'` para o Chromium. **Este patch não protege
contra redirect sem aquele.** A lição fica registrada nos dois: uma leitura de código que olha a
classe-base não prova nada sobre a subclasse que de fato roda.

## Formato e falha segura

- O arquivo é de uma linha, e o conteúdo precisa casar com `^[A-Za-z0-9._~-]{16,512}$`. Um
  arquivo vazio, com texto solto ou malformado é tratado como "não existe" — nunca viaja.
- Qualquer erro de leitura resulta em "sem canal privado". A atualização continua funcionando
  pelo caminho normal; ninguém fica sem update por causa deste patch.
- O arquivo mora **fora** da pasta do programa, de propósito: a pasta do programa é substituída
  inteira a cada atualização, e um segredo guardado lá desapareceria na primeira subida de
  versão. Em `userDataPath` ele sobrevive.

## ⛔ A segunda trava: a edição sem canal de update nem lê o arquivo (19/09/2026)

"A edição pública não tem esse arquivo" (o topo deste documento) vale para quem baixa do zero, e
**não** para uma máquina que já rodou a edição da equipe: as duas edições tinham o mesmo `nameShort`,
logo a **mesma** pasta de dados do usuário, e o arquivo deixado pela da equipe ficava ao alcance da
outra. Medido numa máquina assim: o arquivo existe na pasta de dados comum, e o código que o lê está
no núcleo das duas edições. A única trava era a guarda de origem — a edição sem `updateUrl` falha a
comparação e não manda nada.

> **Atualização de 20/09/2026 (patch 0015):** a causa de raiz foi atacada — cada edição passou a ter a
> **sua** pasta de dados (`userDataFolderName`), então a edição pública instalada do zero não enxerga
> mais o arquivo da outra. A trava abaixo **continua**, e continua valendo, por dois motivos: numa
> máquina que rodou a edição da equipe **antes** do 0015, o arquivo ficou na pasta que hoje é a da
> pública; e defesa em profundidade não se desliga porque a camada de baixo melhorou.

**O que mudou:** `lerSegredoDoCanal()` devolve "sem segredo" **antes de abrir o arquivo** quando o
produto não tem `updateUrl`. É defesa em profundidade: com isto, a edição sem canal de update não lê
nem envia o segredo em hipótese nenhuma, mesmo que alguém mude a guarda de origem depois.
Critério (`testes/ponte.mjs`): o corpo do método é tirado do texto deste patch e roda contra uma
pasta com um segredo válido — sem `updateUrl`, devolve `undefined` e **não lê o arquivo**; com
`updateUrl`, devolve o segredo (controle). Vermelho antes desta mudança: sem `updateUrl` o método
devolvia o segredo.

**O que ela NÃO cobre, dito:** se a edição pública ganhar um dia um canal de update próprio (um
`updateUrl` público), esta trava deixa de separar as edições, e numa máquina que rodou as duas o
segredo seria lido e enviado à origem do canal **público**. O remédio completo é separar a pasta de
dados por edição (um `nameShort`/`dataFolderName` diferente na da equipe), com o custo de quem trocar
de edição perder as configurações — decisão do dono, não tomada aqui.

## O que foi verificado — e o que NÃO foi

**Verificado (estático, medido):**

- `git apply --3way` aplica este patch limpo, na sequência real do build, depois do
  `0006`: conferido do zero (checkout da tag → todos os patches de viabilidade → `0001` a
  `0008`), todos "applied cleanly".
- `tsc --noEmit` no `src` inteiro, com este patch aplicado: **0 erros**. Isso não é detalhe:
  a primeira versão deste patch tinha **dois** erros de tipo reais (`url` e `update.url` são
  `string | undefined`), e o **empacotamento não os acusaria** — ele transpila sem checar tipo.
  Um import que sobrou (`getUpdateRequestHeaders`, que deixou de ser usado neste arquivo)
  também foi removido pelo mesmo motivo.
- A afirmação central deste documento (o que é e o que não é mascarado em log) foi lida no
  código das duas classes citadas, não deduzida.
- O buraco do redirecionamento (acima) foi achado por **revisão independente**, não por mim. Fica
  dito porque é a lição mais útil deste patch: uma guarda avaliada **uma vez** não protege um
  caminho que se **repete** a cada salto, e o documento chegou a afirmar o contrário.

**⛔ ESCRITO, NÃO MEDIDO** — nada abaixo tem prova de comportamento:

- que uma instalação com o arquivo presente realmente envia o cabeçalho;
- que o servidor do canal privado aceita essa requisição e recusa quem não a apresenta
  (o lado do servidor foi medido por HTTP, mas **não** contra o app de verdade);
- que o download do pacote também chega autenticado;
- que o segredo, com `--log trace` ligado, de fato **não** aparece no arquivo de log.

Os quatro dependem de rodar o programa instalado, o que exige uma janela de teste que esta
rodada não tinha. Enquanto não rodarem, o patch é um conserto **lido**, não medido.

## Alternativa considerada e recusada (por enquanto)

Fazer o instalador reescrever o `updateUrl` dentro do `product.json` instalado, colando o
segredo ali. Recusada por dois motivos: (a) o `product.json` é substituído a cada atualização,
então a reescrita teria de acontecer de novo toda vez, e um único passo que falhasse deixaria a
máquina sem canal; (b) o segredo voltaria a viver dentro de uma URL, que é exatamente o que
este patch existe para evitar.
