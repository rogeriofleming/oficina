# Patch 0003 — o produto pode dispensar os walkthroughs do upstream

**O que faz:** quando `hideBuiltinWalkthroughs` é verdadeira no `product.json`,
`WalkthroughsService.registerWalkthroughs()` deixa de registrar os walkthroughs que vêm dentro do
fonte do workbench. Tudo que **produto e extensões** contribuem continua igual.

**Um arquivo, oito linhas.** A declaração da chave em `IProductConfiguration` mora no patch 0001
— ver lá o porquê (pré-imagem derivada: dois patches não podem tocar o mesmo arquivo do upstream
sem que o segundo perca a rede do `--3way`).

⚠️ **Numeração:** nasceu como `0002` e colidiu com o patch de mesmo número que já existia. Achado
duma revisao independente em 06/09/2026. O glob do `construir.bat` aplicaria os dois assim mesmo (tocam
arquivos disjuntos), mas dois patches com o mesmo número tornam impossível falar de "o patch 0002"
sem ambiguidade.

---

## Por que ele existe

A OFICINA tem uma tela de boas-vindas própria, em português, contribuída pela extensão embutida
`oficina-claude`. Mas o walkthrough do upstream continuava lá, **e era ele que abria**: título
**"Get started with VS Code"**, com cartões de Copilot, vídeo hospedado na Microsoft e a oferta de
recursos que este build não entrega.

Isso não é preferência de design. É o **critério 3** do plano (identidade legalmente limpa) valendo
onde mais importa: na tela que a pessoa vê. O nome do produto de terceiro está fora do `.exe`, do
instalador, do `product.json` e do título da janela — e estava dentro da primeira tela que o menu
"Ajuda" abre.

## Como foi descoberto

Pela **foto**, não pelo teste. `boas_vindas.mjs` tinha acabado de sair verde quando a captura da
mesma execução mostrou "Get started with VS Code" ocupando o editor. O critério procurava o texto
da OFICINA em `document.body.innerText` — e o corpo inteiro do workbench contém o nome do produto
em outros lugares, então ele casava com a página errada. O teste foi apertado no mesmo dia (passou
a exigir o **título** do walkthrough aberto, e a **ausência** de walkthrough do upstream na lista).

## Por que não deu para resolver por configuração

Procurado antes de escrever qualquer linha:

- `workbench.welcomePage.walkthroughs.openOnInstall` decide se um walkthrough **abre sozinho**
  depois de instalar extensão — não se ele **existe**.
- `workbench.startupEditor: none` (que a OFICINA já usa) impede a abertura automática, e é por isso
  que nada aparecia na inicialização. Não tira o walkthrough da lista de "Bem-vindo".
- A lista embutida é uma constante de módulo (`walkthroughs`, em `gettingStartedContent.ts`),
  registrada direto no construtor do serviço. Não há ponto de extensão, chave de produto ou
  contexto que a filtre.

## Precedência: por que esta forma, e não outra

Mesma do patch 0001 — **estender uma porta que já existe, e não inventar mecanismo**. O
`IProductConfiguration` já carrega decisões de produto sobre esta mesma tela
(`walkthroughMetadata`, `featuredExtensions`), e o `IProductService` já é injetado em dezenas de
serviços do workbench. O patch acrescenta uma chave ao lado das que já estão lá e uma guarda de
três linhas no ponto exato onde a lista é consumida.

A alternativa que o VSCodium usa para caso parecido é apagar o conteúdo do arquivo. Fica pior de
manter: todo `subir_upstream` traria conflito no corpo do `gettingStartedContent.ts`, que a
Microsoft edita a cada versão. A guarda no consumidor não encosta nesse arquivo.

## Risco

**Baixo, e do tipo silencioso — por isso está coberto por teste.** Se a chave sumir da mesclagem do
`product.json`, nada quebra: o produto volta a mostrar o walkthrough do upstream e todos os testes
de layout continuam verdes. É o mesmo perfil de falha do `configurationDefaults`, e a resposta é a
mesma: `testes/boas_vindas.mjs` cobra, na janela aberta, que **nenhum** walkthrough do upstream
esteja na lista e que o nosso abra pelo título.

Quem sobe de versão: se o upstream mover `registerWalkthroughs` ou trocar o nome da constante, o
patch falha ao aplicar — que é o comportamento desejado (parar em vez de voltar a mostrar marca
alheia em silêncio).


## Um erro meu, no primeiro corte deste patch

A guarda era um `return` cedo, no topo de `registerWalkthroughs()`. Só que esse método **também
instala, mais abaixo, o handler do ponto de extensão `walkthroughs`** — então o `return` levava
junto todos os walkthroughs contribuídos por extensão, **inclusive o do próprio produto**. Medido
pelo seletor nativo do editor: a lista ficou literalmente vazia.

A versão que ficou troca a lista embutida por uma vazia (`const embutidos = ... ? [] : walkthroughs`)
e não interrompe o método. É a diferença entre "não registre estes" e "não registre nada".
