# CHANGELOG

Todas as mudanças que importam, versão a versão. Datas em dd/mm/aaaa.

## [v25] — 24/09/2026 — **primeira versão pública**

A primeira versão baixável, e o primeiro dia em que este repositório existe em público. Ela
carrega tudo que foi construído até aqui; as seções abaixo contam versão a versão.

**O que esta versão traz de novo:**

- **O tema escuro ficou legível.** Ele estava mais escuro que o Dark Modern do VS Code em três
  lugares ao mesmo tempo, e o resultado era texto difícil de ler. Agora o alvo é medido, não
  estimado: o texto da interface saiu de 0,41 para 0,60 de luminância (o do VS Code é 0,60), a
  barra de título e a de status deixaram de ser quase preto (0,0041 → 0,0075) e o painel da
  conversa subiu para o mesmo plano do editor, em vez de ficar um degrau abaixo dele. A escada de
  superfícies foi **derivada**: cada plano é o primeiro valor que se separa do anterior por
  ΔL* ≥ 3 no CIELAB.
  *Custo, declarado:* o fundo ficou menos profundo; o contraste do texto no editor caiu de 11,41:1
  para 10,75:1, e segue em AAA.
- **A largura reservada por ícone na barra de cima passou a derivar do tamanho do ícone**
  (patch `0027`), em vez de ser um número fixo. Com ícones de 20 px e o valor antigo de 26,
  fixar um quinto ícone empurrava dois para o menu de transbordo.

## [não lançado] — V24, os quatro ajustes de quem usa (24/09/2026)

- Os **ícones da barra de cima ficaram maiores** (16 → 20 px), e os de fonte crescem junto com os
  de imagem (patches `0025` e `0026`).
- **Clicar de novo no mesmo ícone agora fecha** a barra lateral, como na barra de atividades
  original (patch `0024`). O comportamento existia no núcleo e deixou de ser alcançado quando a
  barra mudou de lugar.
- **A barra da direita não guarda mais a vista de tokens**: a conversa fica no centro.
- **O contador de tokens fica ligado o tempo inteiro**, com três estados — os números, um traço
  com zero quando não há conversa, e um traço com interrogação quando a medição falhou. O
  terceiro existe para não anunciar "zero" quando a verdade é "não sei".

## [não lançado] — V23, uma conversa só (24/09/2026)

O atalho e o botão de boas-vindas passaram a abrir a **conversa da extensão oficial**, caindo no
painel próprio apenas quando ela não responde. Antes o programa abria numa conversa e a tecla
abria outra, as duas com o mesmo nome. Nada foi removido.

## [não lançado] — V22, o rótulo que não empurra (23/09/2026)

O item de texto vivo da barra de título passou a cortar com `…` ao atingir 30% da largura da
janela (patch `0023`), em vez de empurrar o resto da barra.

## [não lançado] — V21, a barra de cima e os ajustes da conversa (21-22/09/2026)

- **Os ícones foram para a barra de título** (patch `0022`).
- O menu `…` da fileira de abas e o "Maximize Group" atrás dele saíram.
- Os grupos de editor não são mais travados pela extensão da conversa (patch `0021`).
- Na conversa: o "Untitled" da segunda linha saiu, a caixa de digitar encostou no rodapé
  (16 px → 4 px) e o seletor de modos ficou só com `Plan` e `Bypass permissions`.

## [não lançado] — V20, a barra de cima e a faixa do limite (21/09/2026)

**A conversa do produto passou a ser a da extensão oficial do Claude Code.** O painel próprio
continua no programa e alcançável, mas deixou de ser o caminho principal. Essa foi a decisão que
reorganizou a versão inteira.

**Na tela:**
- **Faixa nova**, entre a barra de cima e as abas: o limite do plano com barra que enche —
  `5h` e `7d`, com a porcentagem — e um botão que abre o detalhe do consumo. Lê o registro que o
  programa de linha de comando mantém, de 5 em 5 minutos, e nunca apaga o último número conhecido.
- **Barra de cima trocou de conteúdo:** saíram os três botões (Arquivos, Conversa, Layout) e o
  mostrador do limite; entrou o de **tokens da conversa** — nome (quando você escolheu um), contexto,
  total processado, custo estimado e o **relógio do cache**.
- **Os ícones da barra lateral foram para o topo**, na horizontal.
- **A barra da direita não abre mais sozinha**, e não se reabre quando você a fecha.
- **A moldura interna das abas saiu**; a linha de cor no topo da aba ativa ficou.
- Sem a lista de atalhos no editor vazio, e sem os botões de ação no canto das abas.

**Debaixo do capô:**
- Patch novo no núcleo (`0017`): a faixa do banner aprendeu a desenhar **medidores** — rótulo,
  barra e porcentagem — lendo um context key cujo nome o produto declara. O núcleo continua sem
  saber o que os medidores medem.
- A conversa aberta passou a ser localizada pelo `sessionId` que o próprio programa registra, e não
  por palpite — é o que fez os tokens e o relógio do cache voltarem a funcionar.

**⚠️ Mudança de comportamento que você precisa saber:** o agente passou a **agir sem pedir
aprovação, de fábrica**. Veja o aviso no [README](README.md).

## [não lançado] — V0, alicerce

- Repositório criado; estrutura de build, produto, patches, testes e extensões.
- `scripts\construir.bat`: compila o núcleo a partir de uma tag fixada em
  `produto/TAG.txt`, com log em arquivo. Modo `--puro` compila o upstream sem
  nenhuma alteração deste projeto (é a linha de base para saber de quem é um defeito).
- `scripts\subir_upstream.bat`: sobe o clone para uma tag nova, reaplica os patches,
  recompila e roda a fumaça.
- `produto/product.json`: nome próprio, extensões pela Open VSX, telemetria desligada.
- `testes/fumaca.mjs` e `testes/regressao.mjs`: verificação do build por automação
  do Electron.

## [não lançado] — V1, identidade

- Dois temas próprios (claro e escuro) cobrindo 100% dos tokens de cor do editor,
  conferidos por script contra a lista oficial.
- Ícones, tela de boas-vindas em português e o layout do produto valendo em perfil
  limpo — com teste que abre o programa e mede.

## [não lançado] — V2, a conversa

- Painel de conversa nativo: o agente vive dentro do editor, sem depender de extensão
  da loja. Streaming da resposta, custo e modelo à vista, e a conta de quem está usando.
- Toda ação do agente que toca arquivo passa por aprovação na tela. (Comando também
  passava, menos os que o próprio agente considerava inócuos — esse buraco só foi
  medido e fechado na V4.)
- As regras de permissão da pasta aberta valem dentro do programa: `permissions.deny`
  por nome de ferramenta, com teste e controle positivo.
- Os modos do agente ficam visíveis e trocáveis; o modo que dispensa aprovação só
  existe com uma configuração ligada de propósito, e nunca é o padrão.

## [não lançado] — V3, a revisão no editor

- Toda mudança de arquivo proposta pelo agente aparece no editor de diff, em linha,
  com aceitar/rejeitar por trecho e as duas decisões inteiras na barra de abas.
- Nada é gravado sem decisão: rejeitar tudo deixa o arquivo byte a byte igual.
- Arquivo com trabalho não salvo nunca é sobrescrito; arquivo que mudou no disco
  durante a revisão faz a proposta ser recusada, em vez de apagar a mudança de fora.
- Arquivo binário e texto que não é UTF-8 são recusados com aviso, não adivinhados.

## [não lançado] — V4, o terminal do agente

- Comando proposto pelo agente vira um cartão com a linha à vista; aprovado, ele roda
  num **terminal do editor**, visível, e a saída volta ao agente.
- **Parar mata só aquele comando** — o processo e os filhos dele, pelo identificador do
  processo, nunca por nome. São três caminhos: o botão **"Parar este comando"** na linha
  daquela execução, o **Parar da conversa** (que alcança todos os comandos dela) e o
  **Ctrl+C dentro do próprio terminal**.
- Todo comando passa pela aprovação, inclusive os que o agente considera inofensivos.
  Comando não tem "sempre permitir": ele sumiria do terminal sem ninguém notar. A única
  exceção é o modo que dispensa aprovação: ligado por quem usa, nada passa pela tela e
  nenhum comando roda no terminal.
- As regras de permissão do disco valem aqui dentro — as da pasta (`.claude/settings.json`
  e `.claude/settings.local.json`) e as suas, globais. Um **hook** da pasta também decide
  antes, e isso está medido com controle positivo.
- Histórico dos comandos da conversa no rodapé do painel, com o resultado de cada um.
- Comando em segundo plano e máquinas sem o interpretador seguem pelo caminho anterior.

## [não lançado] — V5, as conversas de outros dias

- Lista das conversas da pasta aberta (`Ctrl+Shift+H`), com modelo, custo estimado e tamanho.
- Retomar uma conversa continua o contexto dela; renomear, etiquetar e procurar por texto.

## [não lançado] — V6, o Claude no editor

- Com um trecho selecionado: **Explicar** (`Ctrl+Alt+E`), **Corrigir** (`Ctrl+Alt+C`),
  **Gerar teste** (`Ctrl+Alt+T`) e **Perguntar sobre a seleção** (`Ctrl+Alt+P`), também no menu
  do botão direito. O pedido chega à conversa aberta, ou abre uma.

## [não lançado] — V7, instalador e atualização

- Instalador por usuário, sem pedir administrador.
- Atualização automática: o programa confere se há versão nova, baixa e **exige** o hash
  SHA-256 do pacote antes de instalar. Pacote sem hash, ou com hash diferente, é recusado.
- A pasta de cache da atualização leva o nome do produto, e não colide mais com a do editor
  de origem.

## [não lançado] — V8, a estreia

- Primeiro uso: quem nunca entrou numa conta ganha um aviso em português e o botão que abre o
  login oficial do Claude, em vez de um erro em inglês sem saída.
- **Socorro** (paleta e botão de todo erro): reabrir a conversa, abrir o registro, mostrar a
  pasta do registro, recarregar a janela.
- Registro em disco dos erros e mudanças de estado, com teto de tamanho, sem conteúdo da
  conversa e sem dados da conta.

## [não lançado] — V9, a subida automática do núcleo

- `scripts/robo_upstream.mjs` escolhe a versão estável mais nova do editor de origem, reaplica os
  patches, roda a regressão e empacota. Patch que não aplica vira relatório com o arquivo e o trecho
  em conflito.
- O robô só prepara: abre o pull request e a release **em rascunho**, e nunca toca no canal de
  atualização. Publicar continua sendo ato de uma pessoa.
- Workflow do GitHub trimestral e por botão, sem segredo além do token da própria execução, com as
  actions fixadas por SHA. O agendamento nasce desligado e só roda com a variável
  `OFICINA_ROBO_LIGADO=true`.
- O ciclo completo no runner do GitHub ainda não rodou nenhuma vez.

## [não lançado] — V10, os tokens da conversa

- Barra de status com três números da conversa aberta: o **contexto agora** (o tamanho dela), o
  **total processado** e o **custo estimado** pela tabela de preços da API (em assinatura, é quanto
  custaria, não uma cobrança). Configurável: `oficina.tokens.mostrar`.
- Vista **Tokens** na barra lateral: os mesmos números, por modelo, quanto cada subagente gastou e
  quais skills a conversa carregou.
- O disco só é relido enquanto o agente trabalha, e só o pedaço novo do arquivo da conversa.

## [não lançado] — V11, o layout com nome

- Botão **Layout** na barra de cima: personalizar a tela (mostrar, esconder e mudar partes de lugar),
  **salvar a tela como…** um nome seu, aplicar um layout salvo e excluir.
- O layout salvo guarda o que está visível, o tamanho e o lugar de cada parte, onde fica o painel e
  para onde cada vista foi arrastada (pelo patch `0011`), mais as configurações que mudam a cara da
  tela. Ao aplicar, diz o que não existe mais e ficou de fora. Se só metade puder voltar, diz isso.
- `scripts/conferir_tipos_do_patch.mjs`: confere os tipos de um patch do núcleo em segundos, sem
  compilar, com controle positivo.

## [não lançado] — V12, o painel de skills

- Vista **Skills** na barra lateral, com as skills que o agente conhece na pasta aberta: as da pessoa
  e da pasta em cima, as que vêm com o programa num grupo recolhido embaixo.
- **Clicar** numa skill manda `/nome` para a conversa, como se fosse digitado, e abre a conversa se
  ela estiver fechada.
- **Estrela** favorita (sobe para o topo), **olho** oculta (fica cinza e vai para o fim), **arrastar**
  muda a ordem. A arrumação vale no perfil inteiro; a lista fica guardada por pasta, e muda sozinha
  quando o agente encontra uma skill nova no meio do trabalho.
- Nome de skill com espaço, quebra de linha ou símbolo fora do padrão não entra na lista, para um
  clique nunca escrever uma instrução inteira na conversa.

## [não lançado] — V13, a barra lateral com botões

- A **barra lateral volta**, com três botões de fábrica: **Arquivos** (o explorador, com as cores do Git
  para modificado, novo e ignorado), **Git** (mudanças, commit, empurrar e puxar) e **Skills**. Um
  clique abre, outro fecha.
- Os outros ícones de fábrica do editor (Pesquisa, Executar e Depurar, Extensões, Testes, Remoto,
  Referências) e o de **Tokens** nascem **soltos**: continuam abrindo pelo comando e pelo atalho, e a
  pessoa os fixa de novo pelo menu da barra. O que a pessoa já arrumou no perfil não é tocado. Isso não
  tem configuração no editor: é o patch `0012`, que lê a lista `defaultUnpinnedViewContainers` do produto.
- Comando **Conectar ao GitHub** (também no título da vista do Git): explica em português o código de
  uso único antes de o GitHub mostrá-lo, e depois conecta a conta que clonar e publicar repositórios
  usam. Empurrar e puxar seguem pelo Git.
- O guia de boas-vindas apresenta os três botões.
- `defaultUnpinnedViewContainers` passa a ser chave obrigatória do `product.json` (o build aborta sem ela).

## [não lançado] — V14, tokens fixos e relógio do cache

- Os **tokens da conversa** (contexto agora · processado · custo estimado) ficam **sempre** no pé da conversa,
  os mesmos números da vista Tokens. O clique abre o detalhe. Saiu a configuração `oficina.tokens.mostrar`:
  não há mais modo que esconda ou corte os números.
- O pé deixa de mostrar o custo que o agente devolve ao fim de cada turno: era um segundo número de custo,
  contado de outro jeito que o da vista.
- **Relógio do cache** no pé: um anel e os minutos até o cache da conversa vencer. Começa na última
  resposta, e cada resposta recomeça. O tempo sai da própria resposta (cache de 1 hora ou de 5 minutos);
  sem esse dado, 60 minutos, e a dica diz que é suposição. Vencido, muda de cor e avisa que a próxima
  mensagem relê a conversa inteira e custa mais. Conversa retomada parte da hora da última resposta.
- No pé estreito, o e-mail da conta é o que encolhe (inteiro na dica); os tokens e o relógio ficam.

## [não lançado] — V15, modelo e esforço

- **Um botão no pé da conversa** mostra o modelo e o esforço em uso ("Opus 5 (1M) · alto"). Os dois vêm do
  agente, não do primeiro item da lista, e são relidos depois de cada troca.
- O botão abre um **painel de escolha**: a lista de modelos que o agente oferece (nome, descrição, o em uso
  realçado e marcado) e, abaixo, o **esforço** num controle de cinco pontos (baixo, médio, alto, extra-alto,
  máximo), só com os que o modelo aceita. Modelo sem nível de esforço: o controle some e o painel diz por quê.
  Pelo teclado: setas, Enter escolhe, Esc fecha.
- As trocas valem no meio da conversa, só nela. Com o cache quente, **trocar de modelo pergunta antes**
  e diz quanto custa reescrever o cache no modelo novo. Trocar o esforço avisa, com o cache quente, que a
  próxima mensagem reescreve parte do cache.
- Conserto: ao abrir, o modelo ficava em branco até a primeira mensagem.
- No pé estreito, o "(1M)" sai do botão (continua na dica e na lista).

## [não lançado] — V16, agentes em paralelo

- **O botão "N agentes"** no pé da conversa diz quantos agentes estão rodando agora, em qualquer nível. Ele
  aparece no primeiro agente da conversa e fica (com "0 agentes" quando nenhum roda).
- O botão abre o **mapa dos agentes**: a conversa à esquerda, e em árvore um cartão por agente, com o estado
  (rodando, em pausa, terminou, falhou, parado — em cor e em forma), o tempo andando e os tokens. Um clique
  abre o detalhe: tipo, o que está fazendo agora, a última ferramenta, quantas usou, tokens, duração, o resumo
  do fim, e os agentes que ele mesmo lançou. Fecha com o ✕ ou com Esc.
- **Parar um agente** pelo cartão dele, com uma pergunta antes (o foco fica em "Deixar rodando").
- Conversa retomada: os agentes de antes aparecem, lidos do disco, como terminados.
- Conserto: na vista Tokens, o agente lançado por outro agente aparecia como "subagente xxxxxx". Agora tem
  o nome, em qualquer nível.
- No pé estreito, o seletor do modo tem a largura da opção escolhida; se ainda não couber tudo, a linha quebra
  em vez de cortar.
- No pé estreito, o e-mail da conta sai da linha (continua na dica): o que a V14 dizia que encolhia agora sai.

## [não lançado] — V17, navegador integrado com tamanhos de tela

- **Botão "Navegador" na barra lateral**, fixado ao lado de Arquivos, Git e Skills. A vista abre um endereço
  (ou o `.html` aberto no editor) no navegador do próprio editor, ao lado.
- **Lista de aparelhos** em cinco grupos: Desktop (1366×768, 1920×1080), Widescreen (2560×1080, 3440×1440),
  Tablet (iPad mini, iPad Pro 11, Galaxy Tab S9), iOS (iPhone SE 4,7", iPhone 15 6,1", iPhone 15 Pro Max 6,7")
  e Android (Galaxy S24 6,2", Pixel 8 6,2", Galaxy A55 6,6", Pixel 8 Pro 6,7"). Um clique aplica a tela, a
  densidade, o agente do navegador e o toque do aparelho; "Girar" troca retrato e paisagem.
- A vista diz, na tela, o limite: iOS e Android são imitação — o motor é o Chromium, não o Safari.

## [não lançado] — V18, layout livre

- **A caixa de escrever ganha uma alça** na borda de cima: arrastar para cima aumenta, para baixo diminui
  (de uma linha até 70% da janela). Pelo teclado: setas na alça (Shift, passos maiores), Home e End; duplo
  clique ou Delete voltam ao automático (a caixa cresce com o texto, como antes).
- **O tamanho fica guardado sozinho**, sem botão: volta igual ao fechar e reabrir, e vale para as outras abas
  de conversa. Barra lateral, painel e grupos de editor o próprio editor já redimensiona pelas bordas e guarda.
- **"Voltar ao layout padrão…"** no botão Layout, com confirmação: volta o lugar e o tamanho das partes e das
  vistas, a caixa de escrever, os ícones da barra lateral de fábrica e as configurações de tela. Os layouts com
  nome não são apagados, e a tela diz o que não conseguiu voltar.
- **"Barra de ícones compacta"** no botão Layout: a largura da barra de ícones não se arrasta (o editor só tem
  dois tamanhos, 48 e 36 px); o item troca entre eles.
- Os layouts com nome passam a guardar também a altura da caixa de escrever.
- **O que ainda não se redimensiona nem muda de lugar:** a altura da barra de cima, a da barra de título da
  conversa (a aba com o nome dela) e a do pé da conversa; a largura da barra de ícones, que só troca entre os
  dois tamanhos acima; e as barras fixas (a de cima, a de ícones e a da conversa), que não se arrastam para
  outro lugar. Na barra de título da conversa, a altura parece fixa no editor, mas isso ainda não foi
  confirmado.

## [não lançado] — depois da V18, consertos de revisão

- **A barra lateral fica só com Arquivos, Git e Skills.** O Navegador abre pela paleta de comandos
  ("Navegador"); Contas e Gerenciar saem do pé da barra (patch 0014). A conta do GitHub segue pelo botão da
  vista do Git; configurações e extensões, pela paleta.
- **A vista Tokens inteira fica sempre à vista**, na barra da direita, que nasce aberta; se for escondida, volta
  sozinha, sem tirar o foco de onde você estava. Os três números no pé continuam.
- Navegador: a altura de cada celular é a da área da página (no iPhone 15, 659 de 852 px), e a dica mostra a
  tela inteira; a fonte de cada número diz de onde ele veio de verdade.
- Conectar ao GitHub: a janela explica a pergunta do editor ("Allow") e o token de acesso pessoal; recusar a
  pergunta do editor é cancelar, não erro.
- Consertos: o trabalho de um subagente não quebra mais a resposta principal em pedaços; Ctrl+C e "Parar"
  tentam de novo quando a primeira tentativa de parar falha; "parando…" de um agente tem prazo; o modelo e o
  esforço escolhidos sobrevivem a "Tentar de novo"; a altura escolhida da caixa volta numa janela maior; um
  layout salvo com o painel ao lado não o manda mais para baixo, e aplicar um layout não abre o painel à toa;
  "Voltar ao layout padrão" só diz que as configurações voltaram se voltaram.

## [não lançado] — depois da V18, segunda leva de consertos

- **Fechar a janela encerra o que o agente deixou rodando**: os comandos em curso no terminal do agente e o que o
  agente lançou em segundo plano (antes, os dois ficavam vivos depois de fechar). Comando que já terminou e deixou
  um servidor rodando de propósito continua rodando. A janela leva cerca de 0,7 s a mais para fechar quando houve
  conversa.
- **O mapa dos agentes se vê no tema escuro**: cartões, linhas da árvore e o trilho do esforço tinham a mesma
  claridade do fundo. As divisórias do tema escuro ficaram um pouco mais marcadas.
- Mapa estreito: sem o vão entre a sessão e os agentes, a sessão numa linha, nomes inteiros (quebram em vez de
  cortar); uma coluna até 560 px.
- Pé da conversa: o relógio do cache tem o círculo de referência visível; o arco e o ícone dos agentes saem da cor
  de destaque; o e-mail nunca vira uma letra solta e nada passa da borda (quando não cabe, a conta e o "Sair"
  descem para uma segunda linha).
- Nas confirmações ("Trocar mesmo assim", "Parar o agente"), o botão destacado é o que não custa nem destrói.
- "Parar este agente…" com texto legível; abas de grupos sem foco legíveis nos dois temas.
- Ctrl+Alt+B (esconder a barra da direita) não tira mais o cursor da caixa de escrever.
- A barra de cima não ganha mais o botão do navegador do editor quando uma página está aberta.
- Barra lateral: "Voltar ao layout padrão" solta na hora o ícone que estava aberto; o menu da barra não oferece
  mais "Accounts".
- A edição sem canal de atualização não lê o arquivo de acesso do canal privado, mesmo que ele exista na máquina.

## [não lançado] — V19

- **O limite do plano fica à vista na barra de cima, o tempo todo.** Dois números, no canto direito:
  `5h 7% · 7d 65%` — quanto já se gastou da janela de 5 horas e quanto da semana. Passando o mouse,
  a hora exata em que cada uma vira, e de onde veio o número.
  A barra **nasce com número**, lido do registro que o programa de linha de comando deixa neste
  computador (custo zero, sem rede); enquanto o agente trabalha, ela se atualiza **no instante** em
  que o percentual muda; e, com o programa parado, uma leitura a cada 5 minutos mantém o número em
  dia. Nada disso gasta mensagem.
  A partir de 90% o número apertado ganha um `!`, e o que o mouse mostra diz qual janela é e quando
  ela vira. Clicar pede uma leitura na hora; se ainda não der, o programa diz em quanto tempo dá.
  ⚠️ Limite, e ele é do servidor: **só existe percentual**. Não há como dizer quanto falta em tokens
  nem em dinheiro — quem informa esses campos manda-os vazios.
  ⚠️ Quando o número passa de 10 minutos, a barra diz a idade dele (`· há 12 min`) em vez de
  apresentá-lo como se fosse de agora; passada 1 hora, ele sai da tela e volta o traço. Número velho
  vestido de novo é pior que traço.
  ⚠️ Em conta sem limite de plano (chave de interface e outros provedores), o mostrador simplesmente
  não aparece — não há limite de plano a mostrar.
- **A barra do título da conversa fica só com a guia e o ícone de nova conversa.** O botão
  "Conversas desta pasta" saiu dali; a lista continua a um comando de distância — pela paleta
  ("Conversas desta pasta") e pelo atalho `Ctrl+Shift+H`, como sempre esteve.
- **A vista Tokens não nasce mais roubando a conversa em janela estreita.** "Voltar ao layout padrão"
  passa a devolver à barra da direita (e à barra da esquerda) a largura de fábrica do próprio editor —
  **um quarto da janela, no máximo 300 px**, com o piso de 170 px que o editor já impõe. Antes voltava
  sempre a 300 px: numa janela de 656 px isso deixava a vista maior do que a conversa merecia.
  ⚠️ Custo: numa janela estreita a vista fica com cerca de 170 px e as linhas dela quebram.
  ⚠️ A largura que **você** ajustou continua valendo: a conta só vale ao voltar ao padrão (e no
  nascimento do perfil, onde o editor já a fazia). Encolher a janela depois de aberta não encolhe a vista.
- **Cada edição passa a ter a sua pasta de dados.** A edição pública continua em
  `%APPDATA%\OFICINA`; a da equipe passa a usar `%APPDATA%\OFICINA Equipe`. Era a mesma pasta nas
  duas — e é nela que mora o arquivo de acesso do canal de atualização privado.
  ⚠️ Custo: **quem trocar de edição começa do zero** (configurações, layouts com nome, histórico do
  editor), e quem já tem a edição da equipe instalada também. O nome do programa, o executável e os
  atalhos não mudam; só a pasta onde os dados ficam.
  ⚠️ Limite: para o Windows as duas continuam sendo o mesmo aplicativo (mesmo identificador de
  instalação), então instalar uma por cima da outra continua substituindo. O que não se mistura mais
  são os dados. As extensões que você instala continuam compartilhadas (`~/.oficina`).
