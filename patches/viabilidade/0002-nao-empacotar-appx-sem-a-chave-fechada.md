# Por que este patch existe

**O que ele faz:** só entra no bloco de empacotamento **AppX** (o pacote da Loja da Microsoft)
quando o `product.json` realmente tem a chave `win32ContextMenu` daquela arquitetura.

**Por que não dá para viver sem ele.** A linha 586 do `build/gulpfile.vscode.ts`, na tag `1.136.1`,
escreve o CLSID do menu de contexto do Explorador usando **asserção de não-nulo**:

```ts
.pipe(replace('@@FileExplorerContextMenuCLSID@@',
  (product as { win32ContextMenu?: Record<string, { clsid: string }> }).win32ContextMenu![arch].clsid))
```

`win32ContextMenu` é uma das chaves que **só existem no `product.json` fechado da Microsoft** — a
DLL do menu de contexto do Explorador é componente assinado deles. Numa build aberta ela não
existe, e o build morre com

```
TypeError: Cannot read properties of undefined (reading 'x64')
    at task (build/gulpfile.vscode.ts:586:143)
```

Medido em 05/09/2026: **11 minutos** de build, tudo compilado, e o erro no passo de empacotamento —
o mesmo padrão do patch 0001 (a fila de defeitos de um pipeline longo é serial).

**Por que o build de linha de base (`--puro`) não tinha esbarrado nisso.** O `product.json` do
Code-OSS **não declara `quality`**, e o bloco só roda com `quality === 'stable' || 'insider'`. Quem
liga o bloco é o **nosso** `product.json`, que declara `"quality": "stable"`.

**E por que não simplesmente tirar o `quality` do nosso produto** — a saída que parecia mais óbvia,
e que seria mais barata: `quality` **não é enfeite de build, é comportamento de produto**. Na mesma
tag:

- `extensionGalleryService.ts:1986` — `preRelease: this.productService.quality !== 'stable'`. Sem o
  `"stable"`, o editor passaria a **instalar versões pre-release das extensões por padrão**.
- `extensionsScannerService.ts:424` — filtra extensões embutidas pela qualidade do produto.
- `abstractUpdateService.ts` — a qualidade compõe a URL do canal de atualização (assunto da V7).

Trocar comportamento de produto para contornar um passo de empacotamento seria pagar no lugar
errado. O patch mexe onde o problema é: no **empacotamento**.

**Por que ele é seguro para o upstream.** Duas linhas adiante, em
`build/gulpfile.vscode.win32.ts:120`, o **próprio upstream** já faz exatamente esta verificação
antes de usar a chave (`if (ctxMenu && ctxMenu[arch])`). Ou seja: o cuidado que falta na linha 586
já existe no arquivo irmão — o patch só torna os dois consistentes. Numa build da Microsoft, onde a
chave existe, o comportamento é **idêntico ao de antes**.

**O que se perde:** a OFICINA não gera pacote AppX (Loja da Microsoft). Não é perda real: distribuir
na Loja exige conta de publicador e assinatura, o que não está em nenhuma versão do plano.
