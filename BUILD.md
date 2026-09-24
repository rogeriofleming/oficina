# Compilar a OFICINA

A OFICINA é compilada a partir do código-fonte do núcleo do VS Code, numa tag fixa.
Nada é baixado pronto: o que sai daqui é um programa construído na sua máquina.

Hoje só há receita para **Windows x64**.

## O que precisa estar instalado

| O quê | Versão | Por quê |
|---|---|---|
| Node.js | a versão exata do `.nvmrc` da tag (hoje **24.18.0**) | o núcleo é compilado por scripts Node; versão diferente falha de formas confusas |
| Python | 3.x com `setuptools` (`pip install setuptools`) | o `node-gyp` compila módulos nativos com ele |
| Visual Studio Build Tools 2022 | workload *Desktop development with C++*, incluindo o Windows SDK e os componentes **Spectre** das bibliotecas | os módulos nativos são C++ |
| Git | qualquer versão recente | o clone é feito com *partial clone* |

Você **não** precisa trocar o Node instalado na sua máquina: rode
`scripts\preparar_node.bat 24.18.0` e o projeto baixa a versão exata para uma pasta
própria, usada só durante o build.

## Onde as coisas ficam

O build usa uma pasta de trabalho fora deste repositório, porque o clone do núcleo tem
alguns GB e não deve ser versionado. Por padrão é `%SystemDrive%\oficina-build`; para
usar outro lugar, defina a variável de ambiente `OFICINA_BUILD` antes de compilar.

O caminho **não pode ter espaço** — é uma exigência do build do núcleo, não nossa.

```
<OFICINA_BUILD>\
  node\                    o Node da versão exata da tag
  vscode\                  o clone do núcleo, na tag de produto/TAG.txt
  VSCode-win32-x64\        o resultado: o programa compilado
  log\                     um arquivo por build
```

## Compilar

```
scripts\construir.bat            compila a OFICINA
scripts\construir.bat --puro     compila o núcleo SEM nenhuma alteração deste projeto
```

O modo `--puro` existe para uma coisa só, e ela é importante: se um build quebra, ele
responde "o defeito é do upstream ou é nosso?". Rode-o antes de suspeitar do seu código.

O primeiro build baixa o núcleo inteiro e todas as dependências; é o demorado. Os
seguintes reaproveitam o que já está em disco.

Tudo vai para um arquivo de log — o build não é para ser acompanhado pela tela.

## Trocar só a extensão dentro de um build que já existe

```
node scripts\sincronizar_extensao.mjs        copia a extensão do repositório para dentro do executável
```

Um build completo leva horas, e quase toda mudança do dia a dia é na extensão. Este script
copia o que o **git rastreia** em `extensoes/` para dentro do executável compilado — e o
resultado é **provado pelo mesmo critério de sincronia que a regressão usa**, não pela
intenção de quem copiou.

O executável que sai disso é um **híbrido**: núcleo do último build, extensão de agora. É
legítimo para medir a extensão, e a ressalva tem de andar junto sempre que um número sair
dele — já houve defeito de teste que o híbrido escondia e o build de verdade mostrou.

⚠️ Arquivo novo precisa de `git add` **antes**, senão ele não viaja. ⚠️ E nunca monte o caminho
do executável dentro de um `node -e`: uma barra invertida comida entre o shell e o JS já mandou
a cópia para outra pasta, e o critério conferiu a pasta errada — verde falso, com o executável
rodando a extensão de três horas antes.

## Subir de versão

```
scripts\subir_upstream.bat 1.137.0
```

Isso troca a tag do núcleo, reaplica os patches deste projeto, recompila e roda a
fumaça. Se um patch não aplicar, o script **para e diz qual** — é o sinal de que o
upstream mexeu num trecho que alteramos, e o patch precisa ser refeito.

## Empacotar (gerar o instalador Windows)

```
scripts\empacotar.bat            gera dist\OficinaSetup.exe a partir do que está compilado
```

Não recompila nada: empacota o que `construir.bat` já deixou em `VSCode-win32-x64`. O
instalador é gerado pela própria tarefa `gulp vscode-win32-x64-user-setup` do núcleo (Inno
Setup) — por usuário, sem pedir administrador. Ao lado do `.exe` sai um `.sha256.json` com o
hash do arquivo exato que foi gerado; é ele que alimenta o manifesto de atualização.

## Publicar uma versão (canal de atualização)

A OFICINA se atualiza sozinha lendo um manifesto de 5 campos num servidor (o contrato exato
está em `src/vs/platform/update/common/update.ts` do núcleo, e o cliente **recusa** qualquer
manifesto sem o campo `sha256hash` — patch `patches/0006-update-exige-hash.md`). Publicar uma
versão é subir o instalador mais esse manifesto para onde o `updateUrl` do seu `product.json`
aponta.

```
CLOUDFLARE_API_TOKEN=<seu token>       ^
CLOUDFLARE_ACCOUNT_ID=<sua conta>      ^
OFICINA_R2_BUCKET=<seu bucket R2>      ^
scripts\liberar.bat
```

Isso sobe o instalador e o manifesto para o bucket R2 escolhido (um Worker simples, lendo
esses dois objetos e respondendo no formato de 5 campos do `IUpdate`, é o bastante para
servir o canal) e, se achar um remoto `origin` do GitHub, cria/atualiza um **rascunho** de
Release com os mesmos dois arquivos — nunca publica a Release sozinho.

Este repositório **não** conhece conta, bucket nem token de ninguém: essas três variáveis são
sempre a única fonte da verdade sobre onde publicar.

⚠️ **E é por isso que o binário publicado nas Releases NÃO se atualiza sozinho.** O `product.json`
deste repositório traz `updateUrl` na lista `__remover`: a compilação pública sai sem endereço de
atualização, de propósito — um binário distribuído que busca pacote num servidor é um caminho por
onde se entrega código a quem baixou. O mecanismo acima existe inteiro no código e funciona; quem
compila a própria versão aponta o `updateUrl` para o próprio servidor e passa a ter o canal.

## Conferir se o build presta

```
node testes\fumaca.mjs        abre o programa compilado e verifica o básico
node testes\regressao.mjs     roda a fumaça mais todos os critérios já conquistados
```

A fumaça abre o programa de verdade, num perfil descartável — ela nunca toca nas suas
configurações.
