# `extensoes-dev/` — o que NÃO é embutido no produto

Tudo que está em [`extensoes/`](../extensoes/) vira **extensão embutida da OFICINA**:
`scripts/copiar_extensoes.mjs` copia aquela pasta inteira para dentro do build. O que está **aqui**
não — esta pasta é para instrumento de investigação, que se carrega à mão
(`--extensionDevelopmentPath`) e nunca entra no produto.

## Por que ela existe (05/09/2026, e custou um build)

O spike da V0.5 nasceu dentro de `extensoes/`, junto do que é produto. O build morreu no
empacotamento:

```
Error: Command failed: npm list --production --parseable --depth=99999
npm error missing: @anthropic-ai/claude-agent-sdk@^0.3.261, required by oficina-claude@0.0.1
```

**Duas coisas verdadeiras ao mesmo tempo, e é o encontro delas que quebra:**

1. `copiar_extensoes.mjs` **não leva `node_modules`** — de propósito, e está certo: cada build
   reinstala o que precisa.
2. O empacotamento roda `npm list --production` em **cada** extensão embutida, e um pacote
   declarado que não está instalado é erro fatal ali.

**E a saída óbvia era a errada.** Copiar o `node_modules` resolveria o erro e custaria **250 MB** no
produto — 209 deles só do binário do CLI. Seria trocar os 409 MB do Copilot, que acabamos de tirar,
por 250 MB nossos, para embarcar uma coisa que **a V0 nem usa**.

Então o que mudou não foi o build: foi **onde o spike mora**. Ele é instrumento de investigação, não
produto — e agora o lugar dele diz isso.

## A regra

| Pasta | Vai para o produto? | Pode ter `dependencies`? |
|---|---|---|
| `extensoes/` | **sim**, embutida em todo build | ⚠️ **só se o `node_modules` couber no produto** — hoje, na prática, significa: não tenha |
| `extensoes-dev/` | **não** | à vontade |

**Extensão embutida sem código nenhum é normal e é o caso de hoje:** `oficina-claude` é só um
manifesto de atalhos, sem `main`, sem ativação e sem dependência. Não carrega nada, não pesa nada, e
faz o que ele pediu.

## Como rodar o que está aqui

```
node testes/spike_agente.mjs        # abre a OFICINA com a extensão carregada e lê o laudo do disco
```

O teste aponta para esta pasta por `--extensionDevelopmentPath`, que é o caminho que o próprio
editor oferece para extensão não empacotada — sem forjar `extensions.json`, que é formato interno e
muda entre versões.
