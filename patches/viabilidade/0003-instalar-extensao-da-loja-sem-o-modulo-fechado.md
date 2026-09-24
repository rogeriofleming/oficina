# Por que este patch existe

**O que ele faz:** deixa de exigir verificação de assinatura ao instalar uma extensão vinda da
loja.

## O problema, medido (05/09/2026)

Numa build da OFICINA recém-compilada, instalar qualquer extensão **pela loja** falha:

```
> oficina --install-extension mechatroner.rainbow-csv
Installing extension 'mechatroner.rainbow-csv'...
Error while installing extension mechatroner.rainbow-csv: Signature verification was not executed.
Failed Installing Extensions: mechatroner.rainbow-csv
```

A mesma extensão instalada **de arquivo `.vsix`** entra sem reclamar — o caminho do arquivo local
nem passa por assinatura. Foi por isso que o instalador do projeto (que usa o cache local) marcou
*8 de 10* e o problema quase passou como "duas extensões chatas": **8 delas entraram porque eram
arquivo, não porque a loja funcionava.** A loja não funcionava para nenhuma.

## A causa

`ExtensionSignatureVerificationService.verify()` carrega o módulo **`@vscode/vsce-sign`** — que é
**proprietário da Microsoft e não existe numa build aberta**. Conferido nesta máquina: a pasta não
está nem no clone (`node_modules`) nem no build (`resources/app/node_modules`).

Sem o módulo, `verify()` devolve `undefined` — "a verificação não foi executada" — e o
`downloadExtension` trata isso como falha e apaga o download:

```ts
if (!verificationStatus) {
    throw new ExtensionManagementError('Signature verification was not executed.',
        ExtensionManagementErrorCode.SignatureVerificationInternal);
}
```

⚠️ **E não adianta a Open VSX assinar.** O downloader só devolve `NotSigned` (que seria tolerado)
quando a extensão **não tem** assinatura; quando ela tem — e a Open VSX assina —, ele tenta
verificar, não consegue, e o resultado é o `undefined` acima. Ou seja: **extensão assinada quebra
mais do que extensão sem assinatura**, o oposto do que se esperaria.

## Por que não bastou a configuração

Existe a chave `extensions.verifySignature`, mas o padrão dela é `true` **fixado no código**
(`extensions.contribution.ts`, `default: true`) — não vem do `product.json`. A OFICINA nasceria com
a loja quebrada até alguém descobrir sozinho a configuração e desligá-la. Alicerce não se entrega
com armadilha embutida.

## Precedente

O **VSCodium** faz exatamente isto, no patch `00-extension-disable-signature-verification`
(conferido no repositório deles em 05/09/2026): troca a leitura da configuração por
`verifySignature = false`. O nosso é o mesmo ponto, com o comentário do porquê no lugar.

## ⚠️ O CUSTO — declarado, porque é troca e não melhoria

**A OFICINA não verifica a assinatura das extensões que instala.** O que se ganha: a loja funciona.
O que se perde: uma camada de checagem — se a Open VSX (ou o caminho até ela) entregasse um pacote
adulterado, o editor não teria como perceber pela assinatura.

O que **continua** de pé: o download é por HTTPS, o pacote é validado como zip com
`extension/package.json`, e o `product.json` da OFICINA aponta para **uma** galeria conhecida
(Open VSX) — não para qualquer endereço.

**Três consequências que o texto acima não contava, e que a revisão de fora apontou:**

1. **A configuração `extensions.verifySignature` vira enfeite.** Ela continua registrada nas
   Configurações, com a descrição *"When enabled, extensions are verified to be signed before
   getting installed"* — e depois deste patch **ligá-la não faz mais nada**. Quem abrir as
   configurações da OFICINA lê uma promessa que o produto não cumpre. Corrigir isso é mexer no
   schema (`extensions.contribution.ts`), o que este patch de propósito não faz; fica declarado
   aqui e vira item da V1b, quando os padrões da casa forem decididos.
2. **A exigência de assinatura para extensão privada cai junto.** Todo o bloco de recusa, inclusive
   o `shouldRequireRepositorySignatureFor`, está sob o mesmo `verifySignature`. Hoje não morde (uma
   galeria só, nada privado), mas a V7/V8 herdariam isso sem saber.
3. **"Uma galeria conhecida" tem nuance:** o `product.json` aponta para `open-vsx.org`, mas os bytes
   do `.vsix` vêm do endereço que a **resposta da galeria** informa. O TLS garante o host que ela
   nomear — não que esse host seja `open-vsx.org`.

**Existe alternativa?** O verificador da Microsoft (`@vscode/vsce-sign`) é peça fechada, e é por
isso que nenhuma build aberta usa ele. Mas dizer "não há outro jeito" seria afirmar um negativo sem
ter procurado: a revisão de segurança apontou o **`node-ovsx-sign`**, projeto de terceiro que se
propõe a verificar exatamente a assinatura que a Open VSX aplica.

**Ele não foi avaliado** — não sei se funciona, se é mantido, nem se é confiável o bastante para
entrar num produto. O que dá para afirmar é isto: *a alternativa conhecida não foi avaliada*, e não
*não existe alternativa*. Fica na pauta da **P3** (distribuir com segurança), que já existe no
plano e roda antes da V7.

## O que este patch NÃO cobre

`remoteExtensionManagementService.ts:57` faz a mesma leitura da configuração para extensões
instaladas **no lado remoto** (SSH/WSL/dev container). Não foi tocado: o caminho remoto não é usado
nem testado nesta fase, e patch sem teste é dívida. Fica escrito aqui para quem chegar na versão
que usar remoto — o sintoma será idêntico.

## Correcao de 06/09/2026 — o patch deixava uma propriedade orfa, e isso bloqueava o modo de desenvolvimento

Ao remover a leitura de `VerifyExtensionSignatureConfigKey`, este patch apagou o **unico**
uso que a classe fazia de `this.configurationService`. A propriedade continuou declarada
como `private readonly` no construtor, sem ninguem para le-la.

O empacotamento nunca reclamou — ele transpila sem essa checagem. A **compilacao de
desenvolvimento** (`npm run compile`), que e a que permite ver uma alteracao em segundos
em vez de 20 minutos, para com:

```
src/vs/platform/extensionManagement/node/extensionManagementService.ts(89,43):
error TS6138: Property 'configurationService' is declared but its value is never read.
```

⚠️ **O efeito era maior que o erro.** O ciclo rapido de trabalho ficou indisponivel
desde a V0 e ninguem soube, porque o projeto so usava o build empacotado — o unico
caminho que tolera o defeito. Cada mudanca de layout custou 20 minutos por causa de uma
linha.

**Conserto:** o parametro continua na assinatura (mexer na ordem de injecao de servicos
seria alteracao de verdade no core), mas deixa de ser `private readonly` — e recebido e
descartado, com o porque escrito ao lado.
