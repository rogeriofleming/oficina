# OFICINA

Um editor de código construído a partir do núcleo open-source do
[Visual Studio Code](https://github.com/microsoft/vscode) (licença MIT).

A OFICINA não é o Visual Studio Code: é uma compilação própria desse núcleo, com nome,
identidade e comportamento padrão próprios, sem a telemetria e sem as marcas do binário
oficial da Microsoft. As extensões vêm da [Open VSX](https://open-vsx.org), o registro
aberto da Eclipse Foundation — a loja da Microsoft, pelos termos dela, é só para os
produtos dela.

## Estado

Em construção, versão por versão. O que existe hoje está no [CHANGELOG.md](CHANGELOG.md).

## Instalar

Baixe o instalador (`OficinaSetup.exe`) na aba [Releases](../../releases) e abra. Ele instala
sozinho, sem pedir pasta nem privilégio de administrador.

**Se o Windows mostrar a tela azul "O Windows protegeu o computador"**, clique em
**"Mais informações" → "Executar assim mesmo"**. Isso aparece porque este instalador não tem
certificado de assinatura de código pago (um custo recorrente que não compensa hoje — veja o
porquê no histórico do projeto) — não porque haja algo errado com o arquivo. A integridade de
cada atualização é conferida por hash (SHA-256) antes de instalar, com ou sem esse aviso.

**Esta versão não se atualiza sozinha.** Para trocar de versão, baixe o instalador novo na aba
[Releases](../../releases) e abra — ele instala por cima, sem desinstalar a anterior. O canal de
atualização automática existe no código (o programa sabe avisar, baixar e conferir o hash antes de
aplicar), mas ele depende de um endereço de distribuição, e esta compilação sai sem nenhum: um
binário público que busca atualização num servidor é um caminho por onde se entrega código a quem
baixou, e isso não se abre sem assinatura.

Cada Release traz, ao lado do instalador, o `.sha256.json` com o hash do arquivo. Para conferir no
PowerShell:

```powershell
Get-FileHash .\OficinaSetup.exe -Algorithm SHA256
```

## Primeiro uso

1. **Abra uma pasta.** O agente trabalha nos arquivos dela, e as regras de permissão da pasta
   valem dentro do programa.
2. **Entre na sua própria conta do Claude.** A conversa mostra o caminho de entrada quando esta
   máquina ainda não entrou numa conta. A OFICINA não faz login por você, não guarda senha nem
   token, e não serve para usar a conta de outra pessoa.
3. **Escolha o tema**, claro ou escuro, pela paleta de comandos (`Ctrl+Shift+P` → "tema").

## ⚠️ O agente age sem pedir aprovação, de fábrica

A OFICINA vem configurada para o agente **editar arquivos e rodar comandos sem parar para pedir
licença** a cada passo. É o modo de trabalho que o dono do produto escolheu, e vale desde a
primeira mensagem.

**O que isso significa na prática:** numa pasta sua, é velocidade. Numa pasta que você apenas
abriu para olhar — um repositório que você baixou, uma pasta de cliente, um pendrive — o agente
lê os arquivos daquele projeto, e instrução escondida dentro deles pode virar comando executado.
Não há, hoje, trava que limite o modo a pastas confiáveis.

Para trabalhar com aprovação a cada passo, troque o modo no seletor da conversa. A mudança vale
da próxima conversa em diante.

## Quando algo não responde

`Ctrl+Shift+P` → **"OFICINA: Socorro"** (o mesmo botão aparece embaixo de todo erro da
conversa). Quatro ações separadas: reabrir a conversa, abrir o registro, mostrar a pasta do
registro e recarregar a janela. O registro anota erros e mudanças de estado, com a hora, e
**não** guarda o que você escreveu, nem a sua conta.

## Compilar

Veja [BUILD.md](BUILD.md). Resumo: Windows x64, Node na versão do `.nvmrc` da tag,
Python com `setuptools`, Visual Studio Build Tools com C++ (incluindo os componentes
Spectre) — e então `scripts\construir.bat`.

## Licença

MIT — veja [LICENSE](LICENSE). O núcleo do VS Code é MIT © Microsoft Corporation; as
marcas "Visual Studio Code" e o ícone oficial **não** são MIT e não são usados aqui.

## Sem suporte

Este repositório é publicado como está, sem garantia e **sem suporte**. Se a OFICINA
for útil para você, ótimo; se quebrar, os dois pedaços são seus.

---

**English:** OFICINA is a code editor built from the open-source core of Visual Studio
Code (MIT). It is not Visual Studio Code: it is an independent build with its own name,
identity and defaults, no Microsoft telemetry and no Microsoft branding. Extensions come
from Open VSX. Provided as is, **without support**.
