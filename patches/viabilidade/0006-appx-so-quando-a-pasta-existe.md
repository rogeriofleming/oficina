# Por que este patch existe

**O que ele faz:** o bloco do `gulpfile.vscode.win32.ts` que define os pacotes **AppX** para o
instalador passa a exigir que a pasta `appx` **exista na saída do build**, além da condição de
`quality` que o upstream já tinha.

```ts
const temPastaAppx = fs.existsSync(path.join(sourcePath, 'appx'));
if ((quality === 'stable' || quality === 'insider') && temPastaAppx) {
```

## O problema

Os pacotes AppX (o menu de contexto do Windows 11 e a DLL que o acompanha) são montados e
assinados por uma esteira fechada da Microsoft. Uma compilação aberta não os tem. Mas, quando
`quality` é `stable` ou `insider`, o gulpfile define `AppxPackageName` — e aí a linha
`Source: "appx\{#AppxPackage}"` do `code.iss` (dentro de um `#ifdef AppxPackageName`) entra no
script do Inno Setup, que **recusa compilar** porque o arquivo não existe.

## ⛔ Por que isto nasceu consertando um conserto ERRADO (e a conta do anterior)

A primeira saída para esse problema, nesta mesma versão, foi **tirar a `quality` de
`"stable"`** — pôr outro valor fazia a condição do upstream ser falsa e o AppX sumir. Funcionou,
e estava **errado**: uma revisão independente mediu o preço e ele é alto.

**49 arquivos do núcleo** comparam `quality` com `'stable'`/`'insider'`. Sair dessa string liga,
entre outras coisas:

| onde | o que muda |
|---|---|
| `abstractExtensionManagementService.ts`, `extensionGalleryService.ts`, `extensionManagementCLI.ts` | o produto passa a **preferir versão pré-lançamento** das extensões |
| `codeCacheCleaner.ts`, `languagePackCachedDataCleaner.ts` | cache de código expira em **1 semana** em vez de 3 meses |
| `terminalEnvironment.ts` | `VSCODE_STABLE=0` em **todo terminal** do editor |
| `extensionsScannerService.ts` | desliga a atualização automática das extensões embutidas |
| dezenas de contribuições | entram caminhos **experimentais** marcados `quality !== 'stable'` |

Nada disso aparece em teste de fumaça. Um editor que silenciosamente instala extensão
pré-lançamento é exatamente o tipo de mudança que ninguém relaciona, meses depois, com "a gente
trocou uma string para o instalador compilar".

Este patch ataca o problema onde ele mora: o instalador. A `quality` do produto volta a ser a
que o produto quer.

## O que foi verificado

- `git apply --3way` aplica limpo na sequência real do build, depois do outro patch de
  viabilidade que também toca este arquivo.
- O arquivo transpila sem diagnóstico (`ts.transpileModule`, 0 diagnósticos) — ele fica fora do
  `tsconfig` do `src`, então o typecheck do núcleo não o cobre.
- A condição usa `path` e `fs`, que o arquivo já importava.

**Não medido:** que o empacotamento volta a funcionar com `quality: "stable"` + este patch. Isso
exige rodar o empacotador, e a rodada que escreveu este patch não podia abrir janela (o
compilador do Inno Setup abre uma, e há um patch de viabilidade só para isso). É a primeira
coisa a provar na próxima rodada com build.
