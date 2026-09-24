# Por que este patch existe

**O que ele faz:** tira do empacotamento do Windows a etapa `prepareCopilotRipgrepShimTask`, e com
ela a função e o import que ficariam sem uso.

**Por que não dá para viver sem ele.** Na tag `1.136.1`, o empacotamento do VS Code chama essa
etapa **incondicionalmente**, e ela **lança erro de propósito** quando não encontra o SDK do
Copilot em `resources/app/extensions/copilot/node_modules/@github/copilot/sdk`. O comentário do
próprio código diz o motivo: *"Failures throw to fail the build because built-in packaging must
guarantee this artifact is present"*. Numa build feita a partir do código aberto, esse SDK **não
existe** — ele é proprietário e não vem no repositório.

Resultado medido em 05/09/2026: o build completo roda por **36 minutos**, compila tudo, empacota
tudo, e morre no último passo com

```
Error: [prepareBuiltInCopilotRipgrepShim] Copilot SDK directory not found at
<pasta de build>\VSCode-win32-x64\resources\app\extensions\copilot\node_modules\@github\copilot\sdk
```

**Não é invenção nossa.** O VSCodium — o fork open-source mais antigo e mais usado do VS Code —
faz a mesma remoção no patch `53-ext-copilot-remove-it.patch`, que apaga essa mesma função e a
mesma linha da lista de tarefas (mais os filtros do Copilot, que aqui não precisaram sair porque
já toleram ausência). Conferido no repositório VSCodium/vscodium em 05/09/2026.

**Por que ele fica em `patches/viabilidade/` e não em `patches/`.** Os patches de `patches/` são
**nossos, de produto**: existem porque a OFICINA quer algo diferente. Este não — ele existe só
porque a build aberta não tem uma peça fechada. Por isso é aplicado **em todos os modos, inclusive
no `--puro`**, e por isso a "linha de base" do projeto passa a ser *upstream + patches de
viabilidade*, não *upstream cru*.

⚠️ **Este arquivo tem que ser reconferido a cada subida de tag:** se a Microsoft tornar a etapa
condicional, o patch deixa de ser necessário e deve ser apagado, não carregado por inércia.

## ❌ Correção de uma frase que estava aqui e era falsa (05/09/2026)

Este documento afirmava: *"o executável gerado **não** tem o Copilot embutido — o que é o
objetivo"*. **Não é verdade, e ninguém tinha medido.** O patch tira **uma etapa de empacotamento**
(o *shim* do ripgrep para o SDK), não a extensão.

Medido no build carimbado de 05/09/2026, direto na pasta de saída:

| Onde | O que tem |
|---|---|
| `resources/app/extensions/copilot/` da **OFICINA** | a extensão **`copilot-chat` 0.64.1**, publisher **GitHub**, **409 MB**, com `dist/extension.js` de 19,6 MB |
| a mesma pasta no **VS Code oficial 1.136.1** | a mesma extensão, **158 MB** |

Os dois builds trazem **97 extensões embutidas**. Não é algo que este patch remove, e a frase antiga
fazia crer que sim — quem lesse este arquivo concluiria que o assunto estava resolvido.

**É herança do upstream, e a prova é a árvore dele:** `git ls-files extensions/copilot` na tag
1.136.1 devolve **4.129 arquivos versionados no repositório do upstream**. (Dizer "o binário deles
também tem" não provaria isto — provaria apenas que eles distribuem.)

**E os dois números não comparam a mesma coisa.** Medido item a item:

| | esta build | build oficial da mesma tag |
|---|---|---|
| `dist/` (o código da extensão) | 40 MB | **40 MB — idêntico** |
| `node_modules/` | **369 MB** | 109 MB |
| pacotes em `node_modules/` | **185** | **2** |

A diferença de ~250 MB é do **empacotamento daqui**, que leva a árvore de dependências inteira — não
de algo que o upstream tenha inflado. E entre esses 185 pacotes vai a **pilha de telemetria da
Microsoft** (`@microsoft/1ds-*`, `applicationinsights`, `@opentelemetry`, sete `@azure/*`), dentro de
um produto que declara `enableTelemetry: false` e que o build oficial **não** carrega. Nenhuma
chamada foi medida — é registro de cadeia de suprimento, não alarme.

**O que isso significa, e que fica registrado para decisão (não é conserto de V0):**

1. É de onde vem o painel lateral **"CHAT"** com o botão **"Sign In"** que aparece por padrão —
   aquele que ocupa espaço à toa — exatamente a queixa que o dono do projeto já registrou.
2. São **409 MB** de um build de ~1 GB. Peso que o instalador da V7 vai carregar.
3. A tela "Sobre" mostra `@github/copilot: 1.0.81-0` e `@github/copilot-sdk: 1.0.11` ao usuário.
4. **Distribuir** uma edição pública com a extensão da GitHub embutida é assunto de licença, e tem
   prazo: a V8 abre o repositório e publica instalador. O VSCodium remove a extensão inteira
   (`53-ext-copilot-remove-it.patch`) — nós removemos só o gancho de empacotamento.

A diferença entre "o patch tira o gancho" e "o produto não tem Copilot" é a diferença entre o que
foi feito e o que se acreditou ter feito.
