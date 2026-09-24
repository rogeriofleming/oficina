// O MOTOR do painel — a conversa com o agente, sem uma linha de interface.
//
// ⚠️ POR QUE ISTO É UM ARQUIVO SEPARADO, e não parte da extensão.
//
// Nada aqui usa `require('vscode')`. É de propósito: assim o motor roda em `node`
// puro, e `testes/rodar.mjs` consegue provar a fila de permissões, o cancelamento e o
// estado de login SEM abrir o editor — em segundos, não em minutos. Todo teste que
// precisa do editor aberto é um teste que ninguém roda com frequência.
//
// A regra que mantém isso verdadeiro: se um dia aparecer um `require('vscode')` neste
// arquivo, o teste de motor morre junto. Quem precisa do editor é `extensao.js`.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE FOI MEDIDO ANTES DE ESCREVER (spike 2, 10/09/2026, laudo em
// <pasta de build>/log/spike_v2_*.json — 4 de 4 verdes, com controle positivo):
//
//   1. `canUseTool` É chamado, e recebe: signal, suggestions, blockedPath,
//      decisionReason, title, displayName, description, toolUseID, agentID, requestId.
//      ⚠️ `title` VEIO NULL no pedido de Write. A documentação sugere usá-lo como texto
//      principal do pedido — se eu tivesse confiado nele, o painel mostraria uma
//      permissão sem pergunta. Por isso a frase é montada aqui, e o `title` do SDK é
//      só um upgrade quando existe.
//   2. `deny` bloqueia DE VERDADE: com `deny` o arquivo não nasceu; com `allow`, o
//      MESMO pedido nasceu. Sem esse par, "não aconteceu" não provaria nada — foi
//      exatamente o erro que o V0.5 quase cometeu e está registrado no historico do projeto.
//   3. `abortController.abort()` termina o laço (com exceção `Operation aborted`).
//      ⚠️ MEDIDO: passaram-se ~7 s entre o `abort()` e o laço parar. O botão de parar
//      NÃO pode ficar mudo esperando isso — a UI marca "cancelando" na hora.
//   4. `accountInfo()` responde com { email, organization, subscriptionType,
//      apiProvider }. É daí que sai o "quem está logado" do painel.
//
// ⚠️ CREDENCIAL: este arquivo não lê, não escreve e não guarda token de ninguém. Usa a
// que já está na máquina de quem abriu o editor — cada pessoa na conta dela (F0 do
// plano e termo da Anthropic). O e-mail da conta fica em memória para a UI mostrar, e
// não é gravado em lugar nenhum.

const PACOTE = '@anthropic-ai/claude-agent-sdk'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const P = require('./proposta')
const C = require('./comando')
const M = require('./modelos')
const A = require('./agentes')
// V19 — o nome do método de uso do plano mora num lugar só, porque ele se declara instável.
const { METODO_DE_USO: NOME_DO_METODO_DE_USO } = require('./limite')

/** Estados possíveis de uma conversa. A UI desenha a partir daqui, nunca adivinha. */
const ESTADO = {
  PARADA: 'parada',
  ABRINDO: 'abrindo',
  OCIOSA: 'ociosa',
  PENSANDO: 'pensando',
  ESPERANDO_PERMISSAO: 'esperando_permissao',
  CANCELANDO: 'cancelando',
  ERRO: 'erro',
}

/**
 * Uma fila de mensagens que também é um AsyncIterable.
 *
 * O SDK aceita `prompt` como texto (uma pergunta e acabou) ou como AsyncIterable
 * (conversa viva, várias idas e voltas na MESMA sessão). O painel precisa da segunda:
 * é o que faz a conversa parecer conversa, e não um formulário que reenvia tudo.
 *
 * Esta classe é a ponte: `empurrar()` vem de quem digita; o `for await` de dentro do
 * SDK consome. Quando não há mensagem, o SDK fica esperando aqui — que é o
 * comportamento certo entre um turno e outro.
 */
class FilaDeMensagens {
  constructor() {
    this._pendentes = []
    this._esperando = null
    this._fechada = false
  }

  empurrar(mensagem) {
    if (this._fechada) return false
    if (this._esperando) {
      const resolver = this._esperando
      this._esperando = null
      resolver({ value: mensagem, done: false })
    } else {
      this._pendentes.push(mensagem)
    }
    return true
  }

  fechar() {
    this._fechada = true
    if (this._esperando) {
      const resolver = this._esperando
      this._esperando = null
      resolver({ value: undefined, done: true })
    }
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this._pendentes.length) return Promise.resolve({ value: this._pendentes.shift(), done: false })
        if (this._fechada) return Promise.resolve({ value: undefined, done: true })
        return new Promise(resolver => { this._esperando = resolver })
      },
      return: () => { this.fechar(); return Promise.resolve({ value: undefined, done: true }) },
    }
  }
}

/** Monta a mensagem no formato que o SDK espera (medido no sdk.d.ts, SDKUserMessage). */
function mensagemDoUsuario(texto) {
  return {
    type: 'user',
    message: { role: 'user', content: texto },
    parent_tool_use_id: null,
  }
}

/**
 * A frase do pedido de permissão, em português e sobre o que ELE vai fazer.
 *
 * ⚠️ Por que não uso direto o `title` do SDK: ele veio `null` no spike, para um Write.
 * O `displayName` veio "Write" — nome de ferramenta em inglês, que não diz nada a quem
 * não programa. Quem usa a OFICINA precisa ler o que vai acontecer com os arquivos
 * dele, então a frase nasce aqui e o `title` só entra quando o SDK realmente o manda.
 */
function descreverPedido(nomeFerramenta, entrada, opcoes) {
  if (opcoes && opcoes.title) return opcoes.title

  const e = entrada || {}
  const caminho = e.file_path || e.path || e.notebook_path || null
  const curto = caminho ? String(caminho).split(/[\\/]/).pop() : null

  switch (nomeFerramenta) {
    case 'Write': return curto ? `Escrever o arquivo ${curto}` : 'Escrever um arquivo'
    case 'Edit': return curto ? `Alterar o arquivo ${curto}` : 'Alterar um arquivo'
    case 'Read': return curto ? `Ler o arquivo ${curto}` : 'Ler um arquivo'
    case 'Bash': return e.command ? `Rodar um comando: ${String(e.command).slice(0, 120)}` : 'Rodar um comando'
    case 'WebFetch': return e.url ? `Buscar na internet: ${String(e.url).slice(0, 100)}` : 'Buscar na internet'
    case 'WebSearch': return 'Pesquisar na internet'
    default: return `Usar ${nomeFerramenta}`
  }
}

/**
 * Uma conversa viva com o agente.
 *
 * Quem usa passa `aoEvento`, que recebe tudo o que acontece. A classe NUNCA fala com
 * a tela: ela emite fatos, e quem desenha decide o que fazer. É o que permite testar
 * o motor inteiro sem tela nenhuma.
 */
class Conversa {
  /**
   * @param {object} opcoes
   * @param {string} opcoes.cwd            pasta aberta no editor — o agente enxerga daí
   * @param {(evento: object) => void} opcoes.aoEvento
   * @param {string} [opcoes.id]           identificador desta conversa no painel
   * @param {Function} [opcoes.carregarSdk] injeção para teste; por padrão importa o pacote
   * @param {boolean} [opcoes.permitirPularAprovacao] libera o modo `bypassPermissions`
   * @param {string} [opcoes.retomar]      id de uma conversa de outro dia, para continuar de onde parou
   * @param {boolean} [opcoes.bifurcar]    retomar numa CÓPIA, deixando a conversa original intacta
   */
  constructor({ cwd, aoEvento, id = 'conversa-1', carregarSdk = null, permitirPularAprovacao = false,
    unidadesDeRede = null, executarComando = null, folgaDoExecutorMs = null, retomar = null,
    bifurcar = false, prazoDoPararAgenteMs = null, prazoDoUsoDoPlanoMs = null }) {
    // V19 — quanto se espera pela leitura do limite do plano antes de desistir DAQUELA leitura.
    // Injetável pelo mesmo motivo da folga do executor: o critério que prova a desistência precisa
    // de um método que nunca responde, e 20 s por critério transformaria segundos em minutos.
    this._prazoDoUsoDoPlanoMs = Number.isFinite(prazoDoUsoDoPlanoMs) ? prazoDoUsoDoPlanoMs : 20000
    /*
      A folga que o motor da ao executor ALEM do teto do comando, antes de responder ao agente por
      conta propria (o bloco do `Promise.race`, mais abaixo). E injetavel por um motivo so: o teste
      que prova esse caminho precisa de um executor que NUNCA responde, e esperar 15 s por criterio
      transformaria uma suite de segundos numa de minutos. O padrao e o que vale no produto.
    */
    this._folgaDoExecutorMs = Number.isFinite(folgaDoExecutorMs) ? folgaDoExecutorMs : 15000
    // V16 — quanto o "parando…" de um agente espera o fim confirmado (`stopped`). Injetável pelo mesmo motivo da folga.
    this._prazoDoPararAgenteMs = Number.isFinite(prazoDoPararAgenteMs) ? prazoDoPararAgenteMs : 15000
    /*
      V4 — QUEM RODA O COMANDO.

      Sem esta função injetada, o motor se comporta como na V3: o pedido de `Bash` vira um cartão e
      quem executa é o SDK, por dentro. Com ela, a OFICINA executa — no terminal do editor, com o
      PID na mão para o Parar — e o agente ouve a saída pela mensagem do `deny` (o porquê, e as
      medições que reprovaram a outra porta, estão no cabeçalho de `comando.js`).

      É injetada, e não construída aqui, pela mesma razão que o motor não importa `vscode`: quem
      cria terminal é o editor, e este arquivo precisa continuar rodando em `node` puro.
    */
    this._executarComando = typeof executarComando === 'function' ? executarComando : null
    /** Execuções em curso: id do pedido → execução. É por aqui que o Parar alcança o processo. */
    this._comandos = new Map()
    // As letras de unidade que são REDE (V3, cyber): por padrão, as do `net use` desta máquina; o teste
    // injeta as dele, porque unidade de rede de verdade não existe em toda máquina que roda o teste.
    this._unidadesDeRede = typeof unidadesDeRede === 'function' ? unidadesDeRede : unidadesDeRedeDaMaquina
    this.id = id
    this.cwd = cwd
    this.aoEvento = typeof aoEvento === 'function' ? aoEvento : () => { }
    this._carregarSdk = carregarSdk || (() => import(PACOTE))
    /*
      ⚠️ O MODO QUE PULA APROVAÇÃO SÓ EXISTE COM ESTA CHAVE — igual à extensão oficial,
      que o esconde atrás de `claudeCode.allowDangerouslySkipPermissions`.

      Medido em 10/09/2026, noite, dentro do editor: com o seletor oferecendo
      `bypassPermissions` e o produto sem esta chave, a troca FALHAVA sempre — o SDK exige
      `allowDangerouslySkipPermissions` (documentado no tipo `Options.permissionMode`). A
      tela oferecia um modo que o produto não conseguia ligar, e o teste do pior caso da
      trava ficou verde sem nunca ter ligado o modo.

      A chave vale na CRIAÇÃO da conversa (é opção do `query`): mudar a configuração
      vale a partir da próxima conversa, não da que está aberta.
    */
    this.permitePularAprovacao = permitirPularAprovacao === true

    /*
      V5 — CONTINUAR UMA CONVERSA DE OUTRO DIA.

      O id de uma conversa guardada. Com ele, o SDK carrega o histórico dela e a conversa
      recomeça onde parou; sem ele, nasce uma nova. É só isto: a OFICINA não remonta
      histórico nenhum por conta própria, porque quem guarda conversa é o SDK (o mesmo
      motivo pelo qual `sessoes.js` não tem banco de dados).

      ⚠️ Vale na CRIAÇÃO, como o modo que pula aprovação: retomar é opção do `query`, não
      um botão que se aperta com a conversa aberta. Quem retoma cria outra `Conversa`.
    */
    this.retomando = typeof retomar === 'string' && retomar ? retomar : null

    /*
      Retomar numa CÓPIA: o histórico é carregado igual, mas o que for dito daqui em diante
      é gravado num id novo — a conversa de origem fica exatamente como estava.

      ⚠️ Não é enfeite: foi o que tornou possível MEDIR a retomada de uma conversa de outro
      dia sem escrever dentro de uma conversa real de quem usa o programa. Continuar de
      verdade é o padrão (`bifurcar` desligado); a cópia é para quem quer partir de um ponto
      antigo sem perdê-lo.
    */
    this.bifurcando = bifurcar === true && !!this.retomando

    this.estado = ESTADO.PARADA
    this.sessaoId = null
    // O modelo EM USO (id resolvido, ex.: `claude-opus-5[1m]`) — nunca o primeiro da lista.
    this.modelo = null
    // V15 — o esforço em uso (`low`…`max`), ou `null` quando o agente não disse ou o modelo não tem.
    this.esforco = null
    // V15 — a lista do painel de escolha (`modelos.js`), e o item que a pessoa escolheu nesta conversa.
    this.modelos = []
    this.escolhaDeModelo = null
    // O esforço que a pessoa escolheu nesta conversa (o `escolhaDeModelo` é o par dele): vai junto quando o processo recomeça.
    this.escolhaDeEsforco = null
    // V16 — os agentes em paralelo desta conversa, ao vivo (`agentes.js`). Zerados a cada processo novo.
    this.agentes = new A.AgentesDaConversa()
    this.custoUsd = 0
    this.conta = null
    // O modo comeca no que o produto entrega: perguntar antes de agir.
    this.modo = 'default'

    this._fila = new FilaDeMensagens()
    this._controle = null
    this._consulta = null
    this._laco = null
    // Conta as aberturas e os encerramentos: um `iniciar` que acorda depois de um `encerrar`
    // sabe que perdeu a vez (ver `iniciar`).
    this._aberturas = 0
    // Pedidos de permissão esperando resposta da pessoa: id → { resolver, pedido }
    this._permissoes = new Map()
    this._parouNesteTurno = false
    this._proximoIdPermissao = 1
    // ⚠️ O ID DO PEDIDO É ÚNICO ENTRE CONVERSAS, não só dentro de uma. Revisão de
    // segurança (10/09/2026, noite), medido em node: cada conversa começava em `p1`, e o
    // host entrega a resposta da tela à conversa CORRENTE — um "Permitir" em trânsito do
    // cartão da conversa encerrada aprovava um pedido diferente, que ninguém viu, da nova.
    // Com a geração no id, a resposta velha não acha nada e volta `false`.
    Conversa.geracoes = (Conversa.geracoes || 0) + 1
    this._prefixoPermissao = `c${Conversa.geracoes}-`
  }

  _mudarEstado(novo, extra = {}) {
    this.estado = novo
    this.aoEvento({ tipo: 'estado', conversa: this.id, estado: novo, ...extra })
  }

  /**
   * Abre a conversa. Não manda nada ainda — só deixa o canal pronto e descobre quem
   * está logado, que é o primeiro dado que o painel mostra.
   */
  async iniciar() {
    if (this.estado !== ESTADO.PARADA && this.estado !== ESTADO.ERRO) return
    // ⚠️ ENCERRAR DURANTE A ABERTURA NÃO PODE DEIXAR SESSÃO ÓRFÃ. Revisão de código
    // (10/09/2026, noite), medido: se `encerrar` rodasse enquanto o SDK carregava (fechar a
    // aba, "Nova conversa" — e o primeiro import é o frio), esta função acordava depois e
    // criava a sessão mesmo assim: viva, sem dono, e o estado dizendo "ociosa". Cada
    // abertura guarda a sua vez; `encerrar` passa a vez adiante.
    const abertura = ++this._aberturas
    this._mudarEstado(ESTADO.ABRINDO)

    let query
    try {
      const sdk = await this._carregarSdk()
      query = sdk.query
      if (typeof query !== 'function') throw new Error('o pacote carregou mas não expõe query()')
    } catch (e) {
      if (abertura !== this._aberturas) return
      this._mudarEstado(ESTADO.ERRO)
      this.aoEvento({ tipo: 'erro', conversa: this.id, mensagem: 'Não consegui carregar o agente: ' + descreverErro(e) })
      return
    }

    // Encerrada enquanto o SDK carregava: não nasce sessão nenhuma.
    if (abertura !== this._aberturas) return

    this._controle = new AbortController()
    this._fila = new FilaDeMensagens()
    // V16 — processo novo, lista nova: a doc do SDK manda zerar a lista das tarefas vivas quando o processo
    // (re)começa, porque ele não repete o que já tinha avisado. Os agentes da conversa anterior, se houver, vêm do
    // disco (`tokens.js`), como terminados.
    this.agentes.zerar()
    this._avisarAgentes()

    try {
      this._consulta = query({
        prompt: this._fila,
        options: {
          cwd: this.cwd,
          abortController: this._controle,
          // ⚠️ Item 8 do checklist da P1 e critério 7 dos critérios de pronto: as regras de permissao do projeto
          // (hooks e permissions.deny do .claude/settings.json da pasta aberta) têm
          // que valer DENTRO da OFICINA. Medido no V0.5: nesta versão do SDK o
          // arquivo do projeto é lido mesmo sem a opção — mas pedir é o contrato,
          // não a sorte. Se um dia o padrão mudar, esta linha é o que segura.
          //
          // ⚠️ `local` ENTROU NA OFICINA 15, e a razao e o proprio tipo do SDK instalado
          // (`sdk.d.ts`): `'project'` e o `.claude/settings.json` da pasta, mas `'local'` e o
          // `.claude/settings.local.json` — que e da MESMA pasta, e e onde o CLI grava o que a
          // pessoa decidiu naquele projeto. Carregar so `project` deixava um `deny` escrito no
          // `settings.local.json` SEM VALER aqui dentro, enquanto o produto anuncia que "as regras
          // de permissao da pasta valem dentro do programa". `user` (`~/.claude/settings.json`) e o
          // mesmo caso, uma camada acima: e o que a pessoa configurou para todo lugar, e omitir a
          // opcao (o padrao do CLI) carrega os tres. Aqui os tres sao pedidos POR ESCRITO, para o
          // contrato nao depender do padrao de amanha — que e o motivo pelo qual esta linha existe
          // desde o V0.5.
          //
          // ⚠️ O que isso NAO muda: o `ask` que a OFICINA passa na camada do SDK continua acima de
          // um `allow` do disco (medido na rodada H do spike da V4, contra o `allow` do projeto) —
          // ou seja, carregar mais fontes nao tira comando nenhum do terminal. O que ele acrescenta
          // e `deny` e hook que antes eram ignorados. ⚠️ NAO MEDIDO: o mesmo cruzamento com um
          // `allow` vindo de `user`/`local` (a rodada H usou `project`).
          settingSources: ['user', 'project', 'local'],
          // A resposta aparece enquanto é gerada. Sem isto, o `assistant` chega
          // inteiro de uma vez (medido no V0.5: 4 pedaços, um deles a resposta
          // completa) — e o painel viraria um formulário que demora.
          includePartialMessages: true,
          // ⚠️ NUNCA 'bypassPermissions' por padrão. O prompt da V2 proíbe, e a razão
          // é simples: quem instala a OFICINA não escolheu isso. O modo que pula
          // aprovação existe no produto, mas por escolha explícita e visível.
          permissionMode: this.modo,
          // Só com a configuração ligada de propósito (ver o construtor).
          ...(this.permitePularAprovacao ? { allowDangerouslySkipPermissions: true } : {}),
          // V5 — o histórico da conversa escolhida na lista. Ausente, nasce conversa nova.
          ...(this.retomando ? { resume: this.retomando } : {}),
          ...(this.bifurcando ? { forkSession: true } : {}),
          /*
            V4 — TODO COMANDO PASSA PELA PORTA, e não só o que o CLI considera perigoso.

            ⚠️ MEDIDO (spike da V4, 11/09/2026): sem esta linha, um `echo alfa` NÃO chega ao
            `canUseTool` — o CLI o aprova sozinho, e ele roda dentro do SDK, sem cartão e sem
            terminal. Metade dos comandos de uma sessão real é assim. Com o `ask` desta camada (a
            de maior prioridade entre as do usuário), o mesmo `echo` passou pela porta e rodou à
            vista (rodada E).

            ⚠️ Custo desta escolha, medido na rodada H: um `permissions.allow` que a pessoa tenha
            escrito no projeto para comandos deixa de valer DENTRO da OFICINA — ela vai ver o
            cartão assim mesmo. O `deny` dela continua ganhando de tudo, e disso depende a trava
            do projeto (rodada F: o comando negado nem chega aqui).

            Só existe quando há quem execute: sem executor, mudar a política seria cobrar uma
            aprovação a mais sem entregar nada em troca.
          */
          ...(this._executarComando ? { settings: { permissions: { ask: [...C.FERRAMENTAS] } } } : {}),
          /*
            V16 — O RESUMO DE PROGRESSO DOS AGENTES FICA DESLIGADO, por escrito (o padrão do SDK é desligado).

            Ligado, o agente "bifurca a conversa do subagente a cada ~30 s" para escrever uma linha do que ele faz
            (doc do SDK): cada resumo relê do cache o contexto INTEIRO daquele subagente. Estimativa, NÃO medida:
            num Opus com 150 mil tokens de contexto, 150k × US$ 0,50/M ≈ US$ 0,075 por resumo, perto de US$ 9 por
            hora por agente — e em assinatura isso sai do limite de uso. Em duas sondas ao vivo (18/09/2026, com a
            opção ligada, agentes de 6 s e de 50 s) nenhum resumo chegou, então o custo não pôde ser medido.
            O que o mapa mostra no lugar, de graça: a atividade corrente (`task_progress.description`), a última
            ferramenta, e o resumo final que vem no fim de cada agente (`task_notification.summary`).
          */
          agentProgressSummaries: false,
          /*
            V15 — A ESCOLHA DA PESSOA SOBREVIVE AO PROCESSO QUE RECOMEÇA NA MESMA CONVERSA ("Tentar de novo", a tela
            que volta com a conversa parada). Sem isto o processo novo nascia no modelo configurado e o botão voltava
            a ele sem aviso. Vai pela opção da sessão (a mesma camada do `setModel`), não por arquivo. Sem escolha
            (ou com "Padrão"), nada é imposto e vale o configurado.
          */
          ...(this.escolhaDeModelo && this.escolhaDeModelo !== 'default' ? { model: this.escolhaDeModelo } : {}),
          ...(this.escolhaDeEsforco ? { effort: this.escolhaDeEsforco } : {}),
          canUseTool: (nome, entrada, opcoes) => this._pedirPermissao(nome, entrada, opcoes),
        },
      })
    } catch (e) {
      this._mudarEstado(ESTADO.ERRO)
      this.aoEvento({ tipo: 'erro', conversa: this.id, mensagem: 'Não consegui abrir a conversa: ' + descreverErro(e) })
      return
    }

    this._laco = this._consumir()
    this._mudarEstado(ESTADO.OCIOSA)
    this._descobrirConta()
    this._prepararAntesDaPrimeiraMensagem()
  }

  /**
   * O que dá para saber ANTES da primeira mensagem.
   *
   * ⚠️ MEDIDO EM 10/09/2026, e foi uma surpresa que mudou o produto: em modo de entrada
   * contínua (o `prompt` como AsyncIterable, que é o que faz a conversa ser conversa),
   * **o SDK não manda NADA enquanto ninguém falar** — nem o `system/init`. Testado com
   * uma fila que nunca entrega: 20 s, zero mensagens.
   *
   * Consequência prática: o modelo e o modo ficariam em branco no topo até a pessoa
   * escrever a primeira frase — a tela pareceria "meio carregada" logo na abertura, que
   * é justamente a primeira impressão do produto.
   *
   * `initializationResult()` é um canal de CONTROLE: responde sem consumir a fila e sem
   * gastar uma mensagem. Ele traz conta, modelos, comandos e o modo — mas ⚠️ **não traz
   * `tools`** (conferido campo a campo). A lista de ferramentas continua vindo só no
   * `init`, depois da primeira mensagem, e é por isso que o teste da regra de permissao do projeto
   * precisa mandar uma.
   */
  async _prepararAntesDaPrimeiraMensagem() {
    try {
      if (!this._consulta || typeof this._consulta.initializationResult !== 'function') return
      const r = await this._consulta.initializationResult()
      if (!r) return

      /*
        V15 — O MODELO DA ABERTURA É O EM USO, E NÃO O PRIMEIRO DA LISTA.

        ⚠️ DEFEITO MEDIDO (SDK 0.3.261, 18/09/2026): este trecho lia `models[0].id || models[0].name`. Só que
        `models` é a lista de ESCOLHAS (`ModelInfo`: `value`, `displayName`…), sem `id` nem `name` — então o
        modelo da abertura saía sempre `null`, e o pé ficava sem modelo até a primeira mensagem. E, mesmo
        lido pelo campo certo, `models[0]` é o item "Padrão (recomendado)", não o que a conversa usa (quem
        configurou outro modelo veria o errado). O em uso vem de `getSettings().applied`.
      */
      this.modelos = M.listaDeModelos(r.models)
      await this._lerModeloEEsforco()
      if (r.current_permission_mode) this.modo = r.current_permission_mode

      this.aoEvento({
        tipo: 'pronto', conversa: this.id, sessao: this.sessaoId,
        modelo: this.modelo, modo: this.modo, retomada: this.retomando, bifurcada: this.bifurcando,
        // ⚠️ `null`, e não `[]`: a lista ainda NÃO é conhecida, e um array vazio diria
        // "o agente não tem ferramenta nenhuma" — que é outra coisa, e falsa.
        ferramentas: null, listaDeFerramentas: null,
      })
      this._avisarModelo()
      // V12 — a lista de skills e comandos que o agente conhece nesta pasta, para a vista "Skills".
      // Vai só para o host (ver `extensao.js`): a tela da conversa não desenha lista nenhuma.
      if (Array.isArray(r.commands)) this.aoEvento({ tipo: 'comandos', conversa: this.id, lista: r.commands })
      // V8 — quem nunca entrou na conta fica sabendo ANTES de escrever. Depois do `pronto`, de
      // propósito: o cartão de login não pode ser apagado por quem desenha a abertura.
      if (estaSemLogin(r.account)) this._avisarSemLogin()
    } catch (e) {
      // Sem isto o painel só fica sem o nome do modelo por alguns segundos. Não é
      // motivo para impedir ninguém de trabalhar.
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'não li a inicialização: ' + descreverErro(e) })
    }
  }

  /**
   * V15 — lê do agente o modelo e o esforço EM USO (`getSettings().applied`). Nunca lança.
   *
   * Sem a leitura (SDK sem `getSettings`, ou ela falhou), o modelo fica como estava: `null` na abertura
   * — a tela não mostra modelo nenhum em vez de mostrar um que pode ser o errado — ou o do último
   * `system/init`. ⚠️ `getSettings` existe no pacote e responde (medido), mas NÃO está no `sdk.d.ts`:
   * é método sem contrato escrito, e por isso o código confere se ele existe antes de chamar.
   */
  async _lerModeloEEsforco() {
    try {
      if (!this._consulta || typeof this._consulta.getSettings !== 'function') return false
      const s = await this._consulta.getSettings()
      const a = s && s.applied
      if (!a || typeof a !== 'object') return false
      if (typeof a.model === 'string' && a.model) this.modelo = a.model
      this.esforco = M.NIVEIS.includes(a.effort) ? a.effort : null
      return true
    } catch (e) {
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'não li o modelo em uso: ' + descreverErro(e) })
      return false
    }
  }

  /** V15 — o que a barra e o painel de escolha desenham, tudo do estado EM USO. */
  estadoDoModelo() {
    const item = M.itemEmUso(this.modelos, this.modelo, this.escolhaDeModelo)
    const esforco = M.esforcoMostrado(this.esforco, item)
    const nome = M.nomeDoModelo(this.modelo)
    return {
      modelo: this.modelo,
      nome,
      rotulo: M.rotuloDoBotao(nome, esforco.nivel),
      partes: M.partesDoBotao(nome, esforco.nivel),
      esforco: esforco.nivel,
      esforcoSuposto: esforco.suposto,
      emUso: item ? item.valor : null,
      aceitaEsforco: item ? item.aceitaEsforco : null,
      esforcos: item ? item.esforcos : [],
      modelos: this.modelos,
      // Os cinco pontos do controle e os rótulos em português: um lugar só (`modelos.js`), a tela só desenha.
      niveis: M.NIVEIS.map(n => ({ nivel: n, rotulo: M.ROTULOS[n] })),
    }
  }

  /** V15 — conta à tela o modelo e o esforço que VALEM. `ok` diz se a troca pedida valeu. */
  _avisarModelo(ok) {
    this.aoEvento({ tipo: 'modelo', conversa: this.id, ...this.estadoDoModelo(), ...(ok === undefined ? {} : { ok }) })
    return ok
  }

  /**
   * V15 — troca o modelo no meio da conversa (`setModel`, no modo de entrada contínua, que é o da OFICINA).
   *
   * ⚠️ O EVENTO SAI SEMPRE e leva o que está VALENDO, relido do agente depois da troca — a mesma regra
   * do `trocarModo`: a tela desenha o que voltou, então não tem como mostrar um modelo que não ligou.
   * Só se pede ao agente um item da lista que ele mesmo deu; um nome qualquer é recusado aqui
   * (medido: o agente recusa id desconhecido com erro, e o erro não diz nada à pessoa).
   * O aviso do custo com o cache quente é do host, ANTES de chegar aqui (`modelos.js`, `avisoDaTroca`).
   * Custo desta escolha: vale nesta conversa; a próxima nasce no modelo configurado.
   */
  async trocarModelo(valor) {
    if (typeof valor !== 'string' || !this.modelos.some(i => i.valor === valor)) return this._avisarModelo(false)
    if (!this._consulta || typeof this._consulta.setModel !== 'function') return this._avisarModelo(false)
    try {
      // `default` volta ao modelo padrão: o caminho medido é chamar sem argumento.
      // ⚠️ MEDIDO (SDK 0.3.261, pasta de configuração descartável com `model: sonnet` e `effortLevel: low` e as mesmas
      // fontes de configuração deste arquivo): o "Padrão" leva ao item `default` DA LISTA (ali, Opus 5 1M), e não ao
      // modelo que a pessoa configurou. E nenhuma troca — modelo, esforço, "Padrão" — gravou no `settings.json` dela
      // (hash igual antes e depois de cada passo): a troca vale só na sessão.
      await this._consulta.setModel(valor === 'default' ? undefined : valor)
    } catch (e) {
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'não troquei o modelo: ' + descreverErro(e) })
      await this._lerModeloEEsforco()
      return this._avisarModelo(false)
    }
    this.escolhaDeModelo = valor
    const leu = await this._lerModeloEEsforco()
    const item = this.modelos.find(i => i.valor === valor)
    // O esforço escolhido antes só segue valendo se o modelo novo o aceita.
    if (this.escolhaDeEsforco && !(item && item.aceitaEsforco && item.esforcos.includes(this.escolhaDeEsforco))) this.escolhaDeEsforco = null
    // Sem a releitura, o modelo pedido é o que o agente aceitou (ele recusa com erro o que não aceita).
    if (!leu && item) this.modelo = item.resolvido || item.valor
    return this._avisarModelo(!leu || this.modelo === (item.resolvido || item.valor))
  }

  /**
   * V15 — troca o esforço no meio da conversa (`applyFlagSettings({ effortLevel })`, camada da sessão:
   * não grava em arquivo de configuração nenhum).
   *
   * ⚠️ O NÍVEL QUE O MODELO NÃO ACEITA É RECUSADO AQUI. Medido: no Haiku 4.5 (sem esforço) o agente
   * ACEITA o pedido em silêncio e o ignora (`applied.effort` continua `null`) — a tela mostraria um
   * esforço que não existe. `ok` é a releitura dizendo o nível pedido, não o `applyFlagSettings` sem erro.
   */
  async trocarEsforco(nivel) {
    if (!M.NIVEIS.includes(nivel)) return this._avisarModelo(false)
    const item = M.itemEmUso(this.modelos, this.modelo, this.escolhaDeModelo)
    if (!item || !item.aceitaEsforco || !item.esforcos.includes(nivel)) return this._avisarModelo(false)
    if (!this._consulta || typeof this._consulta.applyFlagSettings !== 'function') return this._avisarModelo(false)
    try {
      await this._consulta.applyFlagSettings({ effortLevel: nivel })
    } catch (e) {
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'não troquei o esforço: ' + descreverErro(e) })
      await this._lerModeloEEsforco()
      return this._avisarModelo(false)
    }
    const leu = await this._lerModeloEEsforco()
    if (!leu) this.esforco = nivel
    if (this.esforco === nivel) this.escolhaDeEsforco = nivel
    return this._avisarModelo(this.esforco === nivel)
  }

  /**
   * V8 — sem login.
   *
   * ⚠️ O TURNO SEMPRE AVISA DE NOVO (revisão de código, 16/09/2026). A primeira versão avisava uma vez por
   * conversa. Só que o cartão da abertura SOME: o botão "Entrar na minha conta" o tira da tela, e a tela
   * recarregada nasce sem ele. Quem escrevia depois disso recebia um turno sem texto, sem erro e sem botão
   * — o beco sem saída que a V8 existe para fechar. Não empilhar dois cartões iguais é trabalho da tela
   * (ela não desenha um segundo cartão logo abaixo do primeiro); decidir se o turno responde é daqui.
   * `semLogin` fica guardado para o host redesenhar o cartão quando a tela recarrega.
   */
  _avisarSemLogin({ doTurno = false } = {}) {
    if (this.semLogin && !doTurno) return
    this.semLogin = true
    this.aoEvento({ tipo: 'semLogin', conversa: this.id })
  }

  /** Quem está logado. Falha aqui não derruba a conversa — só deixa o canto vazio. */
  async _descobrirConta() {
    try {
      if (this._consulta && typeof this._consulta.accountInfo === 'function') {
        const info = await this._consulta.accountInfo()
        if (info) {
          this.conta = {
            email: info.email || null,
            organizacao: info.organization || null,
            assinatura: info.subscriptionType || null,
          }
          this.aoEvento({ tipo: 'conta', conversa: this.id, conta: this.conta })
        }
      }
    } catch (e) {
      // Sem conta legível o painel mostra "não identificado" — não é motivo para
      // impedir alguém de trabalhar.
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'não li a conta: ' + descreverErro(e) })
    }
  }

  /**
   * O laço que lê tudo que vem do agente e traduz em eventos para a UI.
   *
   * ⚠️ Este método NUNCA lança. Uma exceção aqui subiria como "unhandled rejection"
   * dentro do host de extensão do editor — que é o jeito de derrubar a janela inteira
   * de quem está trabalhando por causa de uma resposta malformada.
   */
  async _consumir() {
    try {
      for await (const msg of this._consulta) {
        this._traduzir(msg)
      }
      this._mudarEstado(ESTADO.PARADA)
    } catch (e) {
      const texto = descreverErro(e)
      // Cancelar é ato da pessoa, não defeito: `Operation aborted` é a resposta
      // esperada do SDK quando o abortController dispara (medido no spike 2).
      if (/abort/i.test(texto)) {
        this.aoEvento({ tipo: 'cancelado', conversa: this.id })
        this._mudarEstado(ESTADO.PARADA)
      } else {
        this.aoEvento({ tipo: 'erro', conversa: this.id, mensagem: texto })
        this._mudarEstado(ESTADO.ERRO)
      }
    } finally {
      // Ninguém pode ficar preso esperando uma permissão de uma conversa que morreu.
      this._descartarPermissoesPendentes('a conversa terminou')
      // V16 — o processo acabou, e os agentes dele com ele: nenhum pode seguir "rodando" no botão.
      if (this.agentes.processoAcabou()) this._avisarAgentes()
    }
  }

  /** V16 — conta ao host os agentes ao vivo (o host junta com o disco e desenha o mapa). */
  _avisarAgentes() {
    this.aoEvento({ tipo: 'agentes', conversa: this.id, rodando: this.agentes.rodando, vivos: this.agentes.lista() })
  }

  /** V16 — a lista ao vivo, para a página que recarregou com a conversa de pé. */
  estadoDosAgentes() {
    return this.agentes.lista()
  }

  /**
   * V16 — PARA UM AGENTE (`stopTask`), a pedido da pessoa no mapa.
   *
   * ⚠️ AÇÃO DESTRUTIVA: o que o agente ainda não fez não será feito. Quem pergunta antes é a tela (confirmação no
   * próprio cartão, com o foco em "Deixar rodando"); aqui só se confere que o pedido faz sentido — um agente VIVO
   * desta conversa, que ainda não está parando. O fim chega pelo caminho normal (`task_notification` com
   * `stopped`), e é ele que muda o cartão; o `parando` só existe até lá. ⚠️ NÃO MEDIDO contra o agente de verdade
   * (a sonda da V16 não gastou uma mensagem para isso): o tipo do SDK promete o `stopped`.
   */
  async pararAgente(id) {
    if (typeof id !== 'string' || !this.agentes.podeParar(id)) return false
    if (!this._consulta || typeof this._consulta.stopTask !== 'function') return false
    this.agentes.marcarParando(id)
    this._avisarAgentes()
    try {
      await this._consulta.stopTask(id)
    } catch (e) {
      this.agentes.desmarcarParando(id)
      this._avisarAgentes()
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'não parei o agente: ' + descreverErro(e) })
      return false
    }
    /*
      ⚠️ O "PARANDO…" TEM PRAZO. Só o fim confirmado (`task_notification`/`task_updated`) tira o agente de
      "parando". Se o `stopTask` resolver e o fim não vier, o cartão ficaria em "parando…" para sempre — e, como
      quem está parando não pode ser parado, sem segunda tentativa. Passado o prazo, o cartão volta a poder ser
      parado e a tela diz que a parada não se confirmou.
    */
    const prazo = setTimeout(() => {
      if (!this.agentes.estaParando(id)) return
      this.agentes.desmarcarParando(id)
      this._avisarAgentes()
      this.aoEvento({ tipo: 'agenteNaoParou', conversa: this.id, id, motivo: 'semConfirmacao' })
    }, this._prazoDoPararAgenteMs)
    if (prazo && typeof prazo.unref === 'function') prazo.unref()
    return true
  }

  /**
   * V19 — A LEITURA DO LIMITE DO PLANO, pelo objeto de consulta que já está de pé.
   *
   * ⚠️ O MÉTODO SE DECLARA EXPERIMENTAL NO PRÓPRIO NOME, e o tipo avisa, com todas as letras,
   * que o nome MUDA quando a interface estabilizar. Por isso ele é perguntado antes de ser
   * chamado, e a ausência dele volta como um estado NORMAL (`semMetodo`) — não como erro. Quem
   * chama cai para o registro local do programa de linha de comando e a barra continua viva.
   *
   * ⚠️ `skipBehaviors: true` NÃO É ENFEITE. Sem ele, o agente varre todos os arquivos de conversa
   * tocados nos últimos 7 dias só para preencher uma seção que a barra não usa.
   *
   * ⚠️ ESTE MÉTODO NUNCA LANÇA, e não emite evento de erro. Falha de leitura de limite não pode
   * virar mensagem vermelha na cara de quem está trabalhando: ela vira "tentar de novo mais
   * tarde", e o número que já está na tela continua lá, com a idade dele.
   *
   * ⚠️ TEM PRAZO. Uma chamada que nunca responde deixaria a leitura seguinte presa para sempre,
   * e a barra congelada sem ninguém saber por quê. Passado o prazo, esta leitura desiste — a
   * próxima tenta de novo.
   */
  async lerUsoDoPlano() {
    const consulta = this._consulta
    if (!consulta) return { estado: 'semConversa' }
    const metodo = consulta[NOME_DO_METODO_DE_USO]
    if (typeof metodo !== 'function') return { estado: 'semMetodo' }
    let prazo = null
    try {
      const resposta = await Promise.race([
        metodo.call(consulta, { skipBehaviors: true }),
        new Promise(resolver => {
          prazo = setTimeout(() => resolver({ __semResposta: true }), this._prazoDoUsoDoPlanoMs)
          if (prazo && typeof prazo.unref === 'function') prazo.unref()
        }),
      ])
      if (resposta && resposta.__semResposta) {
        return { estado: 'falhou', erro: new Error('a leitura do limite passou do prazo') }
      }
      return { estado: 'ok', resposta }
    } catch (e) {
      return { estado: 'falhou', erro: e }
    } finally {
      if (prazo) clearTimeout(prazo)
    }
  }

  /** Traduz uma mensagem do SDK em evento do painel. O que não interessa é ignorado. */
  _traduzir(m) {
    if (!m || !m.type) return

    /*
      V19 — O LIMITE DO PLANO MUDOU.

      Chega de graça: vem de um cabeçalho que o agente já recebe a cada chamada ao modelo, sem
      custar mensagem nenhuma. É o que mantém a barra de cima certa no instante em que o número
      muda, enquanto o trabalho acontece.

      ⚠️ ELE NÃO É BATIMENTO POR TURNO — o tipo diz "emitido quando a informação de limite MUDA", e
      é literal: medido, dois turnos seguidos geraram UM aviso só, porque o segundo não mexeu no
      percentual arredondado. Quem recebe isto não pode usá-lo como relógio.

      ⚠️ AS UNIDADES AQUI SÃO OUTRAS (fração, e a virada em segundos). A tradução mora num lugar
      só, em `limite.js`; aqui o conteúdo passa inteiro, sem ser interpretado.
    */
    if (m.type === 'rate_limit_event') {
      this.aoEvento({ tipo: 'limite', conversa: this.id, aviso: m.rate_limit_info || null })
      return
    }

    // V16 — os agentes em paralelo. Os eventos de tarefa são só do mapa (não são fala da conversa); a mensagem
    // de DENTRO de um subagente segue adiante como antes, mas passa antes por aqui: é nela que o segundo nível
    // acha o pai (ver `agentes.js`).
    if (m.type === 'system' && (/^task_/.test(String(m.subtype)) || m.subtype === 'background_tasks_changed')) {
      if (this.agentes.receber(m)) this._avisarAgentes()
      return
    }
    if (m.type === 'assistant' && m.parent_tool_use_id && this.agentes.receber(m)) this._avisarAgentes()
    /*
      ⚠️ O QUE ACONTECE DENTRO DE UM SUBAGENTE NÃO É FALA DO AGENTE PRINCIPAL. Depois de alimentar o mapa (acima), a
      mensagem para aqui. Seguindo adiante, cada ferramenta do subagente virava uma linha da conversa — e a linha
      fecha o balão da resposta principal que ainda está sendo escrita: a resposta saía picada, com "Leu x" no meio,
      atribuído ao principal, e às vezes depois do fim do turno (os subagentes em segundo plano seguem trabalhando).
      A atividade do subagente mora no mapa (última ferramenta, atividade). Permissão e comando do subagente não
      passam por aqui (vêm pelo `canUseTool`), então continuam com cartão e terminal.
      Custo desta escolha: no modo que pula aprovação, o comando rodado por um subagente deixa de ter linha na conversa.
    */
    if ((m.type === 'assistant' || m.type === 'stream_event') && m.parent_tool_use_id) return

    if (m.type === 'system' && m.subtype === 'init') {
      this.sessaoId = m.session_id || null
      // V15 — o `init` volta a cada turno (medido), com o modelo que respondeu, mas SEM o esforço. Modelo
      // diferente do que a barra mostra (troca por fora, ou volta automática do agente): relê os dois e avisa.
      const doInit = m.model || null
      // ⚠️ O mesmo modelo sem o `[1m]` NÃO é troca: o contexto longo é opção da sessão, e o `init` pode trazer o id
      // sem ela. Tratado como troca, o botão perdia o "(1M)" e o ✓ quando a releitura falta, e relia a cada turno.
      const semLongo = id => String(id || '').replace(/\[1m\]$/i, '')
      if (doInit && doInit !== this.modelo && !(this.modelo && semLongo(doInit) === semLongo(this.modelo))) {
        this.modelo = doInit
        this._lerModeloEEsforco().then(() => this._avisarModelo(), () => { })
      }
      // ⚠️ A LISTA de ferramentas viaja, não só a contagem — e é o que torna a trava do
      // projeto TESTÁVEL de dentro do editor sem gastar uma chamada à API.
      //
      // Quando o `.claude/settings.json` da pasta aberta nega uma ferramenta, ela some
      // desta lista já no `init` — antes de qualquer mensagem ser enviada. Comparar a
      // lista de uma pasta com `deny` contra a de uma pasta limpa é a prova do critério
      // 7 dos critérios de pronto ("a regra de permissao bloqueia comando lançado de dentro da OFICINA"), com o
      // controle positivo embutido: se a pasta limpa também não tiver a ferramenta, o
      // teste não prova nada — e foi exatamente esse o erro que o V0.5 quase cometeu.
      this.ferramentas = Array.isArray(m.tools) ? m.tools : []
      this.aoEvento({
        tipo: 'pronto', conversa: this.id, sessao: this.sessaoId, modelo: this.modelo,
        retomada: this.retomando,
        ferramentas: this.ferramentas.length,
        listaDeFerramentas: this.ferramentas,
      })
      return
    }

    // V12 — skill que apareceu no meio do trabalho (o agente entrou numa subpasta com skills próprias).
    // O SDK manda a lista INTEIRA de novo, e diz para substituir a anterior, não somar.
    if (m.type === 'system' && m.subtype === 'commands_changed') {
      if (Array.isArray(m.commands)) this.aoEvento({ tipo: 'comandos', conversa: this.id, lista: m.commands })
      return
    }

    // O streaming de verdade: pedaço de texto conforme é gerado.
    if (m.type === 'stream_event' && m.event) {
      const ev = m.event
      if (ev.type === 'content_block_delta' && ev.delta) {
        if (ev.delta.type === 'text_delta' && ev.delta.text) {
          this.aoEvento({ tipo: 'texto', conversa: this.id, texto: ev.delta.text })
        } else if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
          this.aoEvento({ tipo: 'pensando', conversa: this.id, texto: ev.delta.thinking })
        }
      }
      return
    }

    if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
      for (const bloco of m.message.content) {
        if (bloco.type === 'tool_use') {
          // ⚠️ V4: comando que a OFICINA vai executar NÃO vira linha de ferramenta. Ele já tem
          // duas peças na tela — o cartão que pede a aprovação e a linha que mostra a execução —
          // e uma terceira dizendo "Rodou: …" apareceria ANTES de ele rodar, afirmando um fato
          // que ainda não aconteceu. No modo que pula aprovação nada disso existe (o pedido não
          // chega ao `canUseTool`), e aí a linha é o único registro: ela volta.
          if (this._executarComando && C.ehFerramentaDeComando(bloco.name) &&
            this.modo !== 'bypassPermissions') continue
          const entrada = bloco.input || {}
          this.aoEvento({
            tipo: 'ferramenta', conversa: this.id, id: bloco.id,
            nome: bloco.name, entrada,
            // So para a TELA: a `entrada` continua inteira para quem precisa do caminho de verdade.
            mostrar: caminhoParaMostrar(entrada.file_path || entrada.path, this.cwd),
          })
        }
      }
      return
    }

    if (m.type === 'result') {
      if (typeof m.total_cost_usd === 'number') this.custoUsd = m.total_cost_usd
      // ⚠️ PARAR NÃO É ERRO. Medido no SDK real (revisão final, 11/09/2026): depois de um
      // `interrupt()` o turno termina com `is_error: true`, `subtype: 'error_during_execution'`
      // e `terminal_reason: 'aborted_streaming'`. O tipo do SDK prevê também `aborted_tools` (Parar
      // no meio de uma ferramenta): nesse caso a TELA foi medida no executável, o motivo não foi lido.
      // A tela avisa turno com erro — e todo "Parar" virava "deu um erro no meio do trabalho".
      // Vale qualquer um dos dois sinais: o `terminal_reason`, ou a pessoa ter parado este turno.
      // Custo desta escolha: um erro real no próprio turno que a pessoa parou não é avisado — ela parou.
      const abortado = /^aborted_/.test(String(m.terminal_reason || ''))
      const interrompido = this._parouNesteTurno || abortado
      this._parouNesteTurno = false
      // V8 — SEM LOGIN NÃO É "ERRO NO MEIO DO TRABALHO". Medido no SDK 0.3.261 (12/09/2026, pasta
      // de configuração vazia): o turno volta com `subtype: 'success'`, `is_error: true` e o texto
      // inglês "Not logged in · Please run /login" num `assistant` INTEIRO — que este tradutor não
      // desenha, porque o texto só chega à tela pelos pedaços do streaming. A tela recebia um
      // `fim` com erro `success` e dizia "terminou com um erro (success)": beco sem saída, e
      // mentira sobre o que aconteceu. Aqui o turno termina sem erro e a tela ganha o caminho.
      const semLogin = m.is_error && ehRespostaSemLogin(m.result)
      if (semLogin) this._avisarSemLogin({ doTurno: true })
      // Turno que o agente respondeu de verdade: a conta funciona (a pessoa entrou por fora e tentou de novo).
      // Sem isto, a tela recarregada voltava a mostrar "você ainda não entrou" com a conversa andando.
      else if (!m.is_error) this.semLogin = false
      this.aoEvento({
        tipo: 'fim', conversa: this.id,
        custoUsd: this.custoUsd,
        duracaoMs: m.duration_ms || null,
        erro: m.is_error && !interrompido && !semLogin ? (m.subtype || 'erro') : null,
      })
      // ⚠️ O FIM DO TURNO PARADO NÃO APAGA O TURNO NOVO. A pessoa pode escrever durante
      // "Parando…": o `enviar` já pôs a conversa em PENSANDO, e o `result` atrasado do turno
      // parado a jogava para OCIOSA — a tela sem o Parar, com o agente trabalhando (revisão
      // final, 11/09/2026, medido no motor). Custo, não medido: numa janela de ~30 ms (o que
      // separa o `interrupt` do `result`, medido), esse `fim` pode fechar o balão do turno novo.
      const turnoNovoRodando = this.estado === ESTADO.PENSANDO || this.estado === ESTADO.ESPERANDO_PERMISSAO
      if (!(abortado && turnoNovoRodando)) this._mudarEstado(ESTADO.OCIOSA)
      return
    }
  }

  /**
   * O pedido de permissão: devolve uma Promise que só resolve quando a pessoa
   * responder na tela. É isto que faz a aprovação ser DA PESSOA e não do programa.
   *
   * ⚠️ O `signal` que o SDK manda é respeitado: se a conversa for cancelada enquanto
   * uma permissão está na tela, o pedido morre junto em vez de ficar pendurado.
   */
  _pedirPermissao(nomeFerramenta, entrada, opcoes) {
    return new Promise(resolver => {
      // ⚠️ Com uma parte ALEATÓRIA (cyber da V3): os comandos da revisão recebem o id, e um id em sequência
      // (`c12-p3`) se adivinha — num link `command:` de um texto qualquer, por exemplo.
      const id = `${this._prefixoPermissao}p${this._proximoIdPermissao++}-${crypto.randomBytes(4).toString('hex')}`

      // V3: mudança de arquivo vira PROPOSTA — o antes, o depois e os trechos, para o editor mostrar
      // e a pessoa aceitar ou rejeitar um a um. Sem proposta (erro, caminho de rede, grande demais),
      // o pedido segue como na V2: um cartão com Permitir / Não.
      const proposta = PODE_TER_DIFF.includes(nomeFerramenta) ? montarProposta(nomeFerramenta, entrada, this._unidadesDeRede) : null
      if (proposta && proposta.binario) {
        const nome = path.basename(proposta.caminho)
        this.aoEvento({ tipo: 'nota', conversa: this.id,
          texto: `O agente quis mudar ${nome}, que é um arquivo binário. Recusei: a OFICINA só revisa mudança de texto.` })
        resolver({ behavior: 'deny', message: `O arquivo ${nome} é binário: a OFICINA não mostra nem aplica mudança de texto nele. Nada foi gravado.` })
        return
      }

      // V4: comando vira EXECUÇÃO DA OFICINA — o cartão mostra a linha, e quem roda somos nós.
      // `null` quando a OFICINA não deve executar (segundo plano, sem interpretador nesta
      // máquina): aí o pedido segue exatamente como na V3, com o SDK executando.
      const comando = this._executarComando ? C.montarPedidoDeComando(nomeFerramenta, entrada) : null

      const pedido = {
        id,
        ferramenta: nomeFerramenta,
        frase: descreverPedido(nomeFerramenta, entrada, opcoes),
        detalhe: (opcoes && opcoes.description) || null,
        motivo: (opcoes && opcoes.decisionReason) || null,
        entrada: entrada || {},
        // Para o botão "sempre permitir": é o próprio SDK que diz qual regra escrever, e
        // inventar essa regra do nosso lado seria adivinhar. Mas não vão cruas — ver
        // `prepararSugestoes`.
        ...prepararSugestoes(opcoes && opcoes.suggestions),
        ...(proposta ? { proposta } : {}),
        ...(comando ? { comando } : {}),
      }

      /*
        ⚠️ COMANDO NÃO TEM "SEMPRE PERMITIR", e a razão não é rigor: é coerência.

        O "sempre" do SDK para `Bash` é uma regra de ALLOW. Uma vez escrita, o comando seguinte
        deixa de chegar ao `canUseTool` — ou seja, deixa de rodar no terminal e some da tela, sem
        ninguém perceber. O botão apagaria justamente a coisa que esta versão entrega, e a promessa
        quebraria em silêncio. Custo desta escolha: quem quer o agente rodando comando sem perguntar
        escolhe isso no seletor de modo, onde a tela mostra o tempo todo que está assim.
      */
      if (comando) { pedido.podeSempre = false; pedido.sugestoes = null; pedido.modoSugerido = null }

      // ⚠️ O OUVINTE E REMOVIDO NA MAO, e nao so por `{once:true}`.
      //
      // Achado por uma revisao independente em 10/09/2026: `{once:true}` so limpa quando o abort
      // ACONTECE. Permissao respondida normalmente — o caso comum — deixava o ouvinte
      // pendurado segurando o `id`, o `resolver` e o `this`. Se o SDK entrega o MESMO
      // AbortSignal da conversa em todas as chamadas (nao verificado no SDK real; e o
      // que o duble faz), a partir da 11a ferramenta aprovada o Node comeca a imprimir
      // MaxListenersExceededWarning dentro do host de extensao, numa sessao longa de
      // trabalho de verdade.
      const sinal = opcoes && opcoes.signal
      let limpar = null
      if (sinal && typeof sinal.addEventListener === 'function') {
        const aoAbortar = () => {
          if (this._permissoes.has(id)) {
            this._permissoes.delete(id)
            this.aoEvento({ tipo: 'permissao_retirada', conversa: this.id, id })
            resolver({ behavior: 'deny', message: 'cancelado antes de responder' })
          }
        }
        sinal.addEventListener('abort', aoAbortar, { once: true })
        limpar = () => { try { sinal.removeEventListener('abort', aoAbortar) } catch { } }
      }

      // ⚠️ O PEDIDO EXISTE ANTES DE ALGUÉM OUVIR FALAR DELE. Até a V3 o evento saía primeiro e o
      // registro vinha depois — e quem respondesse DENTRO do evento (a revisão recusando um arquivo
      // sujo na hora) não achava o pedido: a resposta voltava `false` e o agente ficava esperando para
      // sempre. Achado pelo teste de ponte da V3 (11/09/2026).
      this._permissoes.set(id, { resolver, pedido, limpar })
      this._mudarEstado(ESTADO.ESPERANDO_PERMISSAO)
      this.aoEvento({ tipo: 'permissao', conversa: this.id, pedido })
    })
  }

  /**
   * A resposta da pessoa. `decisao` é 'permitir', 'permitir_sempre' ou 'negar'.
   * Devolve `false` quando o id não existe — o que acontece de verdade: a pessoa
   * clica duas vezes, ou clica num pedido que o cancelamento já retirou.
   */
  responderPermissao(id, decisao, mensagemDaRecusa) {
    const item = this._permissoes.get(id)
    if (!item) return false
    this._permissoes.delete(id)
    if (item.limpar) item.limpar()

    // ⚠️ FALHA FECHADA: só as duas respostas de "sim" aprovam; qualquer outra coisa NEGA.
    // Até 10/09/2026 o `else` final aprovava tudo que não fosse 'negar' ou 'permitir_sempre'
    // — `undefined`, `""`, até `"NEGAR"` maiúsculo (revisão de segurança, medido em node).
    // Hoje os três botões mandam valores fixos; a regra é para o próximo botão ou atalho
    // que mandar errado, e o padrão do resto do motor já é recusar o que não reconhece.
    // V4: o "sim" de um comando não vira `allow` — vira EXECUÇÃO nossa. O `resolver` só é chamado
    // quando o processo termina (ou quando alguém o para), com a saída dentro da mensagem.
    if (item.pedido.comando && decisao !== 'negar') {
      this._rodarComando(item)
      if (this._permissoes.size === 0 && this.estado === ESTADO.ESPERANDO_PERMISSAO) {
        this._mudarEstado(ESTADO.PENSANDO)
      }
      return true
    }

    if (decisao === 'permitir_sempre') {
      // O modo sugerido passa pela MESMA porta do seletor: a tela é avisada e desenha o
      // modo que vale (ver `prepararSugestoes`).
      if (item.pedido.modoSugerido) this.trocarModo(item.pedido.modoSugerido)
      item.resolver({
        behavior: 'allow',
        updatedInput: item.pedido.entrada,
        // Só manda `updatedPermissions` se o SDK tiver sugerido — é ele que sabe a
        // forma da regra. Sem sugestão, "sempre" vale para esta sessão e pronto.
        ...(item.pedido.sugestoes ? { updatedPermissions: item.pedido.sugestoes } : {}),
      })
    } else if (decisao === 'permitir') {
      item.resolver({ behavior: 'allow', updatedInput: item.pedido.entrada })
    } else {
      // A mensagem vem do HOST (a revisão no editor sabe o que houve); nunca da tela.
      item.resolver({ behavior: 'deny', message: (typeof mensagemDaRecusa === 'string' && mensagemDaRecusa) || 'Você não permitiu esta ação.' })
    }

    if (this._permissoes.size === 0 && this.estado === ESTADO.ESPERANDO_PERMISSAO) {
      this._mudarEstado(ESTADO.PENSANDO)
    }
    return true
  }

  /**
   * Roda o comando aprovado e só então responde ao agente.
   *
   * ⚠️ Este método NUNCA lança e SEMPRE resolve o pedido — nas três saídas. Um caminho que
   * esquecesse de resolver deixaria o agente esperando por uma permissão que ninguém mais vai
   * responder (o SDK não tem prazo para prompt de permissão: está escrito no tipo `CanUseTool`).
   */
  async _rodarComando(item) {
    const pedido = item.pedido
    const c = pedido.comando
    const responder = mensagem => {
      try { item.resolver({ behavior: 'deny', message: mensagem }) } catch { }
    }

    let execucao = null
    try {
      execucao = this._executarComando({
        id: pedido.id, ferramenta: c.ferramenta, linha: c.linha,
        interpretador: c.interpretador, cwd: this.cwd, tetoMs: c.tetoMs,
      })
    } catch (e) {
      execucao = null
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'nao abri o terminal: ' + descreverErro(e) })
    }
    if (!execucao || typeof execucao.pronto !== 'object' || typeof execucao.pronto.then !== 'function') {
      // O host não conseguiu abrir o terminal. Nada rodou — e o agente ouve isso, em vez de esperar.
      responder(C.mensagemDoComando({ linha: c.linha, erro: 'a OFICINA não conseguiu abrir o terminal', codigo: null }))
      return
    }

    this._comandos.set(pedido.id, { execucao, linha: c.linha, ferramenta: c.ferramenta })
    this.aoEvento({
      tipo: 'comando_inicio', conversa: this.id, id: pedido.id,
      linha: c.linha, ferramenta: c.ferramenta, tetoMs: c.tetoMs,
    })

    /*
      ⚠️ O MOTOR NÃO CONFIA NO EXECUTOR. Se a promessa nunca resolver — um terminal quebrado, um
      processo que some sem avisar — o `canUseTool` fica esperando SEM PRAZO: está escrito no tipo do
      SDK que prompt de permissão não tem prazo. O agente pararia ali, para sempre, e a conversa
      inteira com ele. O teto daqui é o do comando com uma folga: passou disso, manda parar, responde
      ao agente e segue. Achado por um revisor independente em 11/09/2026, que mostrou o caminho real
      para isso acontecer (um comando que deixa descendente segurando a saída).
    */
    const FOLGA_MS = this._folgaDoExecutorMs
    let r
    try {
      r = await Promise.race([
        execucao.pronto,
        new Promise(resolve => setTimeout(() => {
          try { execucao.cancelar('tempo') } catch { }
          resolve({
            linha: c.linha, codigo: null, cancelado: true, motivo: 'tempo',
            duracaoMs: c.tetoMs + FOLGA_MS, saida: '', semResposta: true,
          })
        }, c.tetoMs + FOLGA_MS)),
      ])
    } catch (e) {
      r = { linha: c.linha, erro: descreverErro(e), codigo: null }
    }
    this._comandos.delete(pedido.id)
    r = { ...r, linha: c.linha }

    this.aoEvento({
      tipo: 'comando_fim', conversa: this.id, id: pedido.id, linha: c.linha,
      codigo: typeof r.codigo === 'number' ? r.codigo : null,
      cancelado: !!r.cancelado, motivo: r.motivo || null,
      duracaoMs: typeof r.duracaoMs === 'number' ? r.duracaoMs : null,
      erro: r.erro || null, cortou: !!r.cortou,
    })
    responder(C.mensagemDoComando(r))
  }

  /**
   * Para UM comando pelo id do pedido — o botão da linha de execução.
   *
   * ⚠️ DEVOLVE O QUE O CANCELAMENTO DISSE, e não `true` por otimismo. O retorno era jogado fora, e
   * `false` (a execução já tinha sido cancelada e o processo não morreu) chegava à tela como
   * sucesso: o botão ficava desabilitado em "parando…" para sempre, que é exatamente o que a porta
   * do `comandoNaoParou` existe para evitar (revisor independente, 11/09/2026).
   */
  pararComando(id) {
    const item = this._comandos.get(id)
    if (!item || !item.execucao || typeof item.execucao.cancelar !== 'function') return false
    return item.execucao.cancelar('parar') !== false
  }

  /**
   * Os comandos rodando agora — a tela recarregada precisa desenhá-los de novo.
   * ⚠️ Com a LINHA junto: o id sozinho não dá para redesenhar nada. Este método existia devolvendo
   * só as chaves, sem um único chamador, e o comentário prometia uma tela que ninguém reconstruía.
   */
  comandosEmCurso() {
    return [...this._comandos.entries()].map(([id, item]) => ({
      id, linha: item.linha, ferramenta: item.ferramenta,
    }))
  }

  /** Para TODOS os comandos desta conversa. Usado pelo Parar e pelo encerramento. */
  _pararComandos(motivo) {
    for (const item of this._comandos.values()) {
      try { item.execucao.cancelar(motivo) } catch { }
    }
  }

  /**
   * O pedido ainda está de pé? Quem grava por fora do motor (a revisão no editor, no parcial) precisa
   * conferir isto ANTES de mexer no arquivo: entre a decisão da pessoa e a gravação há um `await`, e
   * nele cabe o botão Parar — que responde ao agente "você cancelou" e some com o pedido. Gravar depois
   * disso muda o arquivo com o agente convencido de que nada mudou (revisão de código da V3).
   */
  temPermissao(id) { return this._permissoes.has(id) }

  /**
   * A resposta da revisão no editor (V3). `final` é o texto que ficou depois dos trechos aceitos.
   *
   * - igual ao que o agente propôs → `allow` com a entrada ORIGINAL: quem grava é o SDK, e o agente
   *   ouve "sucesso", que é verdade (o desfazer continua uma operação — medido, M1 da V3);
   * - igual ao de antes → `deny`: nada grava (critério 8 sai de nunca ter gravado);
   * - parcial → quem JÁ gravou foi o editor. Aqui se CONFERE no disco, e o agente ouve num `deny`
   *   exatamente o que ficou — o `allow` não leva mensagem, e com ele o agente acreditaria que gravou
   *   tudo (medido no SDK real, M2 da V3).
   */
  responderProposta(id, final, { aceitos = null } = {}) {
    const item = this._permissoes.get(id)
    const p = item && item.pedido.proposta
    if (!p || p.erro || typeof final !== 'string') return false
    const classe = P.classificar(p.antes, p.depois, final)
    if (classe === 'tudo') return this.responderPermissao(id, 'permitir')
    const nome = path.basename(p.caminho)
    if (classe === 'nada') {
      return this.responderPermissao(id, 'negar', `A pessoa rejeitou todas as mudanças propostas em ${nome}. O arquivo ficou como estava.`)
    }
    let conferido = false
    try { conferido = P.normalizar(fs.readFileSync(p.caminho, 'utf8')) === P.normalizar(final) } catch { }
    return this.responderPermissao(id, 'negar', P.mensagemDoParcial(nome, p.trechos.length, aceitos, conferido))
  }

  _descartarPermissoesPendentes(motivo) {
    for (const [id, item] of this._permissoes) {
      if (item.limpar) item.limpar()
      item.resolver({ behavior: 'deny', message: motivo })
      this.aoEvento({ tipo: 'permissao_retirada', conversa: this.id, id })
    }
    this._permissoes.clear()
  }

  /**
   * Troca o modo de permissão — o item "os modos do SDK visíveis" do prompt da V2.
   *
   * ⚠️ `bypassPermissions` é o único que muda a natureza do produto: com ele o agente
   * escreve e roda sem perguntar. Ele EXISTE porque há trabalho em que parar a cada
   * arquivo é inviável, mas nunca é o padrão e nunca é silencioso — quem escolhe é a
   * pessoa, na tela, e o painel mostra que está ligado enquanto estiver.
   *
   * ⚠️ O QUE ESTÁ MEDIDO, E O QUE NÃO ESTÁ — leia antes de confiar nesta garantia.
   *
   * **MEDIDO** (`testes/trava_de_permissao.mjs`, com controle positivo): quando o
   * `.claude/settings.json` da pasta aberta nega uma ferramenta por nome
   * (`permissions.deny`), ela some da lista que o SDK anuncia.
   *
   * ⚠️ Este comentário dizia também "e continua fora mesmo com `bypassPermissions`
   * ligado". Era FALSO até 10/09/2026, noite: o modo nunca ligava (faltava
   * `allowDangerouslySkipPermissions`) e o teste não conferia se tinha ligado. O pior caso
   * só vale como medido quando o teste o disser — ele agora exige a confirmação do host.
   *
   * **MEDIDO desde 11/09/2026** (`ciclo_v4/spikes/hook.mjs`, 3 rodadas, 4 critérios, US$ 0,41):
   * um **hook `PreToolUse`** do projeto DISPARA aqui dentro e decide **antes** do nosso
   * `canUseTool`. Com o hook negando, o pedido não chega a este código (e o próprio hook
   * grava um arquivo, que é a prova de que ele rodou); na MESMA pasta sem o hook, o pedido
   * chega — é o controle positivo, sem o qual "não chegou" não provaria nada.
   *
   * ⚠️ Esta observação existe porque a versão anterior deste comentário afirmava
   * "hooks e `permissions.deny` … medido no V0.5 e coberto pelo teste" — e a revisao final
   * mostrou, com `grep`, que a palavra "hook" não aparecia **uma única vez** no registro
   * do projeto, V0.5 inclusive. A frase estava certa sobre metade e mentia sobre a
   * outra, no comentário que sustenta a garantia mais forte do produto. O caminho foi
   * MEDIR, não apagar a frase — e a lição fica: não afirme até medir.
   *
   * ⚠️ Ainda NÃO MEDIDO: um hook que **aprove** por fora (`permissionDecision: 'allow'`).
   * Se ele puder decidir sozinho, o comando não chega ao `canUseTool` e some do terminal —
   * é o mesmo modo de falha do "sempre permitir", que esta versão tirou de propósito.
   *
   * O que o modo daqui faz é decidir se NÓS perguntamos — ele não desliga o
   * `permissions.deny`, e isso está provado.
   */
  async trocarModo(modo) {
    const validos = ['default', 'acceptEdits', 'plan', 'bypassPermissions']

    // ⚠️ O EVENTO SAI SEMPRE, e leva o modo QUE ESTÁ VALENDO — nunca o que foi pedido.
    //
    // A primeira versão só avisava a tela quando dava certo. Isso deixava a tela
    // mostrando o modo pedido enquanto o motor continuava no anterior: exatamente a
    // mentira que uma revisao independente pegou noutro ponto desta mesma costura
    // (10/09/2026). Respondendo sempre com `this.modo`, a tela não tem como divergir —
    // ela desenha o que voltou, e o que volta é o estado real.
    const responder = ok => {
      this.aoEvento({ tipo: 'modo', conversa: this.id, modo: this.modo, ok })
      return ok
    }

    if (!validos.includes(modo)) return responder(false)

    // Sem a configuração, o modo que pula aprovação é recusado AQUI, sem chegar ao SDK:
    // pedir a ele um modo que ele vai recusar só troca uma resposta clara por um erro.
    if (modo === 'bypassPermissions' && !this.permitePularAprovacao) {
      this.aoEvento({ tipo: 'aviso', conversa: this.id,
        mensagem: 'o modo que pula aprovacao exige oficina.permitirPularAprovacao' })
      return responder(false)
    }

    try {
      if (this._consulta && typeof this._consulta.setPermissionMode === 'function') {
        await this._consulta.setPermissionMode(modo)
        this.modo = modo
        return responder(true)
      }
      // Sem conversa de pé ainda, o modo vale como escolha inicial: é ele que vai para
      // o `permissionMode` quando a query nascer.
      if (this.estado === ESTADO.PARADA) {
        this.modo = modo
        return responder(true)
      }
    } catch (e) {
      this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'não troquei o modo: ' + descreverErro(e) })
    }
    return responder(false)
  }

  /** Manda uma mensagem. Devolve false se a conversa não estiver de pé. */
  enviar(texto) {
    if (!texto || !String(texto).trim()) return false
    if (this.estado === ESTADO.PARADA || this.estado === ESTADO.ERRO || this.estado === ESTADO.ABRINDO) return false
    const ok = this._fila.empurrar(mensagemDoUsuario(String(texto)))
    if (ok) { this._parouNesteTurno = false; this._mudarEstado(ESTADO.PENSANDO) }
    return ok
  }

  /** Os pedidos de permissão ainda sem resposta — a tela recarregada precisa desenhá-los de novo. */
  permissoesPendentes() {
    return [...this._permissoes.values()].map(item => item.pedido)
  }

  /**
   * Para o que está acontecendo.
   *
   * ⚠️ Muda o estado para CANCELANDO na HORA, antes de o SDK confirmar. Medido no
   * spike 2: entre o `abort()` e o laço parar passaram-se ~7 s. Um botão que fica mudo
   * por sete segundos é um botão que a pessoa aperta de novo, achando que não pegou.
   */
  cancelar() {
    // ⚠️ SÓ HÁ O QUE PARAR COM TRABALHO EM CURSO. Revisão de código (10/09/2026, noite),
    // medido: depois de um erro, "Parar" pela paleta tirava a conversa de ERRO — o "Tentar
    // de novo" deixava de abrir, e a mensagem seguinte era aceita e sumia com a tela em
    // "pensando" para sempre. Com a conversa ociosa, escrevia "Você parou." sem nada parado.
    if (this.estado !== ESTADO.PENSANDO && this.estado !== ESTADO.ESPERANDO_PERMISSAO) return false
    // ⚠️ V4: o Parar tem de alcançar o PROCESSO, não só o turno. Um `npm test` aprovado continuaria
    // rodando — com a conversa já parada e a pessoa sem nenhum botão para ele — e a resposta dele
    // chegaria depois, a um agente que não a pediu mais. O processo morre pelo PID, com os filhos
    // (critério 9); é `comando.js` quem faz isso, e nunca por nome.
    this._pararComandos('parar')
    this._parouNesteTurno = true   // o `result` que vem depois não é erro (ver o `result`)
    this._mudarEstado(ESTADO.CANCELANDO)
    // ⚠️ O QUE O AGENTE OUVE QUANDO A PESSOA PARA. Era só "você cancelou" — uma frase que não diz o
    // que houve nem o que fazer, e a revisão funcional da V3 viu o agente VOLTAR sozinho ao pedido
    // interrompido quando a mensagem seguinte era sobre outro arquivo. Quem decide isso é o modelo,
    // dentro da sessão do SDK que o `interrupt()` mantém viva: o único que a OFICINA tem aqui é o
    // texto. ⚠️ NÃO MEDIDO com o agente de verdade que este texto mude a escolha dele.
    this._descartarPermissoesPendentes('A pessoa apertou Parar e retirou este pedido: nada foi feito. ' +
      'Não repita esta ação por conta própria — espere ela pedir de novo.')

    // ⚠️ `interrupt()` E NÃO `abort()` — a diferença é a conversa continuar existindo.
    //
    // Até 10/09/2026 este método disparava o `abortController`, e uma revisao independente
    // mostrou o estrago com um caso reproduzido: abortar encerra a SESSÃO inteira do
    // SDK. Depois de um "Parar", a conversa ficava PARADA para sempre — `enviar()`
    // devolvia `false`, a tela continuava com o Enviar habilitado, desenhava o balão da
    // pessoa, e **a mensagem sumia no vácuo, sem erro e sem aviso**. A única saída era
    // fechar a aba, e nada dizia isso.
    //
    // O SDK separa as duas coisas, e eu tinha escolhido a errada: `interrupt()` "para o
    // processamento e devolve o controle ao chamador" — o turno morre, a sessão vive.
    // `abort()` continua sendo usado, mas só onde ele faz sentido: em `encerrar()`.
    //
    // "Parar" é botão de uso corriqueiro. Um botão corriqueiro que quebra o programa em
    // silêncio é pior que um botão que não existe.
    const parar = async () => {
      try {
        if (this._consulta && typeof this._consulta.interrupt === 'function') {
          await this._consulta.interrupt()
          if (this.estado === ESTADO.CANCELANDO) this._mudarEstado(ESTADO.OCIOSA)
          this.aoEvento({ tipo: 'cancelado', conversa: this.id })
          return
        }
      } catch (e) {
        this.aoEvento({ tipo: 'aviso', conversa: this.id, mensagem: 'interrupt falhou: ' + descreverErro(e) })
      }
      // Sem `interrupt` (ou se ele falhar), resta abortar — e aí a conversa acaba
      // mesmo. A tela é avisada para poder oferecer a volta.
      try { this._controle && this._controle.abort() } catch { }
    }
    parar()
    return true
  }

  /** Fecha para valer. Depois disto a conversa não serve mais. */
  async encerrar() {
    this._aberturas++   // uma abertura em andamento perde a vez (ver `iniciar`)
    // Fechar a aba ou trocar de conversa não pode deixar um comando rodando sozinho: a conversa que
    // o pediu já não existe, e ninguém teria mais como pará-lo.
    this._pararComandos('encerrada')
    this._fila.fechar()
    try { this._controle && this._controle.abort() } catch { }
    this._descartarPermissoesPendentes('a conversa foi fechada')
    try { await this._laco } catch { }
    this._mudarEstado(ESTADO.PARADA)
  }
}

/**
 * O que o "Sempre permitir" pode fazer com as sugestões do SDK — e o que NÃO pode.
 *
 * ⚠️ MEDIDO NO SDK REAL (10/09/2026, noite): num `Write` a sugestão é `setMode: acceptEdits`
 * (sessão); num `Bash`, `addRules` com destino `localSettings` + um `addDirectories` de sessão.
 * Repassadas cruas: (1) o `setMode` trocava o modo POR FORA do seletor — a tela seguia em
 * "pergunta sempre" e o próximo arquivo nascia sem cartão (visto pela revisão funcional);
 * (2) a regra ia para o DISCO (`.claude/settings.local.json` do projeto), e a tela promete
 * "nesta conversa".
 *
 * Agora: o modo passa pelo `trocarModo` (a tela é avisada, como em qualquer troca) e nunca
 * vai para o modo que pula aprovação; toda regra vale só nesta conversa (`session`). Sem
 * nada utilizável, `podeSempre` é falso e a tela não oferece o botão.
 * Custo desta escolha: diferente da extensão oficial, a permissão não sobrevive à conversa.
 */
const MODOS_DO_SEMPRE = ['acceptEdits']

/** As ferramentas cuja mudança a V3 mostra como diff. `NotebookEdit` fica com o cartão da V2. */
const PODE_TER_DIFF = ['Write', 'Edit']
// Acima disto, sem diff: ler e recortar em trechos um arquivo enorme dentro do host de extensão
// trava a conversa. O pedido cai no cartão da V2 — nada grava sem a pessoa, do mesmo jeito.
const MAIOR_ARQUIVO_COM_DIFF = 5 * 1024 * 1024

// As letras mapeadas para rede, pelo `net use` — lido uma vez e guardado por 60 s (um processo a mais na
// primeira proposta, e não em todas). Sem conseguir ler, a lista fica vazia: o `\\` e os links continuam
// barrados; a letra mapeada, não — e isso está dito no comentário de `montarProposta`.
let redeGuardada = { quando: 0, letras: [] }
function unidadesDeRedeDaMaquina() {
  if (process.platform !== 'win32') return []
  if (Date.now() - redeGuardada.quando < 60000) return redeGuardada.letras
  let letras = []
  try {
    const saida = execFileSync('net', ['use'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    letras = [...saida.matchAll(/(?:^|\s)([A-Za-z]):\s+\\\\\S+/gm)].map(m => m[1].toUpperCase())
  } catch { }
  redeGuardada = { quando: Date.now(), letras }
  return letras
}

/**
 * Algum pedaço do caminho é um link ou junção que aponta para REDE? Segue peça por peça com `lstat`, que
 * lê o link sem abrir o alvo — o alvo de rede é justamente o que não se toca.
 * ⚠️ Não testado com um link de verdade para `\\`: criar um exige privilégio que o teste não tem. O
 * controle (junção para pasta local continua com diff) está em `testes/rodar.mjs`.
 */
function passaPorLinkDeRede(caminho) {
  const partes = path.resolve(caminho).split(path.sep).filter(Boolean)
  if (!partes.length) return false
  let atual = partes[0] + path.sep
  for (const parte of partes.slice(1)) {
    atual = path.join(atual, parte)
    let info
    try { info = fs.lstatSync(atual) } catch { return false }
    if (!info.isSymbolicLink()) continue
    let alvo = ''
    try { alvo = fs.readlinkSync(atual) } catch { return true }   // link que não se lê: não arrisca
    if (/^[\\/]{2}/.test(alvo) || /^\\\\\?\\UNC\\/i.test(alvo)) return true
  }
  return false
}

/**
 * Monta a proposta de um Edit/Write: `{ caminho, novo, antes, depois, trechos }`, ou `{ caminho, erro }`
 * quando não dá para mostrar como diff, ou `{ caminho, binario: true }`. Só LÊ — nunca grava.
 */
function montarProposta(ferramenta, entrada, unidadesDeRede = unidadesDeRedeDaMaquina) {
  const caminho = entrada && typeof entrada.file_path === 'string' ? entrada.file_path : null
  if (!caminho) return null
  // ⚠️ Caminho de rede não é tocado, nem para ler: no Windows, abrir um arquivo de rede pode negociar
  // SMB e entregar o hash da senha (NTLM). A mesma regra do link citado (revisão de segurança da V2).
  // O QUE ESTÁ COBERTO (cyber da V3 — até ali só o `\\` literal era): o `\\servidor` e o `//`; a letra
  // de unidade MAPEADA para rede (`net use`); e o link ou junção, em qualquer ponto do caminho, que
  // aponta para `\\`. O que NÃO está: unidade mapeada nos últimos 60 s (o `net use` fica guardado),
  // `subst` de uma pasta de rede, e unidade de rede montada por outro meio que o `net use` não lista.
  if (/^[\\/]{2}/.test(caminho)) return { caminho, erro: 'caminho de rede' }
  if (!path.isAbsolute(caminho)) return { caminho, erro: 'caminho relativo' }
  const letra = /^([A-Za-z]):/.exec(caminho)
  let rede = []
  try { rede = (unidadesDeRede() || []).map(x => String(x).toUpperCase()) } catch { }
  if (letra && rede.includes(letra[1].toUpperCase())) return { caminho, erro: 'caminho de rede' }
  if (passaPorLinkDeRede(caminho)) return { caminho, erro: 'caminho de rede' }
  let bruto = null
  try {
    const info = fs.statSync(caminho)
    if (!info.isFile()) return { caminho, erro: 'nao e um arquivo' }
    if (info.size > MAIOR_ARQUIVO_COM_DIFF) return { caminho, erro: 'grande demais para mostrar como diff' }
    bruto = fs.readFileSync(caminho)
    // O tamanho que vale é o do que foi LIDO: entre o `stat` e a leitura o arquivo pode ter crescido
    // (cyber da V3 — medido interceptando o `stat`).
    if (bruto.length > MAIOR_ARQUIVO_COM_DIFF) return { caminho, erro: 'grande demais para mostrar como diff' }
  } catch (e) {
    if (!e || e.code !== 'ENOENT') return { caminho, erro: 'nao consegui ler o arquivo' }
  }
  if (bruto && P.ehBinario(bruto)) return { caminho, binario: true }
  // Texto que não é UTF-8 (Windows-1252, UTF-16): sem diff — o cartão da V2, com o conteúdo à vista.
  if (bruto && !P.ehUtf8(bruto)) return { caminho, erro: 'codificacao que o diff nao mostra (nao e UTF-8)' }
  const antes = bruto ? bruto.toString('utf8') : null
  const r = P.simular(ferramenta, entrada, antes)
  if (r.erro) return { caminho, erro: r.erro }
  const base = antes == null ? '' : P.normalizar(antes)
  return { caminho, novo: antes == null, antes: base, depois: r.depois, trechos: P.calcularTrechos(base, r.depois) }
}

function prepararSugestoes(lista) {
  const regras = []
  let modo = null
  for (const s of Array.isArray(lista) ? lista : []) {
    if (!s || typeof s !== 'object') continue
    if (s.type === 'setMode') {
      // Só o modo que CUMPRE a promessa do botão ("não pergunto mais por isso"): `acceptEdits`,
      // o único medido como sugestão (num `Write`). `dontAsk`/`auto` o `trocarModo` recusa;
      // `default` voltaria a perguntar; `plan` nem deixa editar (revisão final, 11/09/2026). Lista
      // de aceitos, não de proibidos. Custo: se o SDK sugerir outro modo, o "Sempre" não aparece.
      if (MODOS_DO_SEMPRE.includes(s.mode)) modo = s.mode
      continue
    }
    regras.push({ ...s, destination: 'session' })
  }
  return { sugestoes: regras.length ? regras : null, modoSugerido: modo, podeSempre: regras.length > 0 || modo !== null }
}

function descreverErro(e) {
  return String((e && (e.message || e.stack)) || e)
}

/**
 * V8 — a conta NÃO tem como falar com o Claude: ninguém entrou nela nesta máquina.
 *
 * Medido no SDK 0.3.261 (12/09/2026), com a pasta de configuração vazia:
 *   - sem nada:                 { tokenSource: 'none', apiProvider: 'firstParty' }
 *   - com `ANTHROPIC_API_KEY`:  { tokenSource: 'none', apiKeySource: 'ANTHROPIC_API_KEY', ... }
 * Ou seja, `tokenSource: 'none'` sozinho acusaria quem usa chave de API — por isso a chave
 * também tem que faltar. ⚠️ NÃO MEDIDO: Bedrock/Vertex. Provedor que não é o da Anthropic fica
 * de fora de propósito: na dúvida, não se acusa ninguém (a resposta do turno ainda pega).
 */
function estaSemLogin(conta) {
  if (!conta || typeof conta !== 'object') return false
  if (conta.email || conta.apiKeySource) return false
  if (conta.apiProvider && conta.apiProvider !== 'firstParty') return false
  return conta.tokenSource === 'none'
}

/**
 * O texto que o CLI devolve no turno quando não há login (medido; ver `estaSemLogin`).
 *
 * ⚠️ NO COMEÇO do texto, e não em qualquer lugar (revisão de suposições, 16/09/2026). O binário embutido
 * tem várias frases com "not logged in": as da conta do Claude COMEÇAM com ela ("Not logged in · Please
 * run /login", "Not logged in · Run /login", "Not logged in. Run claude auth login…"), e há uma do GitHub
 * CLI (`gh auth status`) que a traz no meio. Casando em qualquer lugar, um `gh` sem login dentro de um
 * comando podia virar o cartão "Entrar na minha conta" com a conta do Claude funcionando.
 */
function ehRespostaSemLogin(texto) {
  const t = String(texto || '').trim()
  return /^not logged in\b/i.test(t) && !/\bgh auth\b/i.test(t)
}

/**
 * O caminho de um arquivo como a pessoa o reconhece: relativo a pasta aberta, quando esta dentro dela.
 *
 * O agente manda caminho absoluto, e a linha da conversa dizia "Leu d:\\pasta\\do\\projeto\\conta.js"
 * (revisao de tela, 18/09/2026) — o nome do arquivo no fim de uma linha que ninguem le inteira.
 * Fora da pasta aberta, o caminho fica inteiro: ali ele e a informacao. No Windows a comparacao
 * ignora maiusculas (o agente escreve `d:`, o editor `D:`), que e o que `path.relative` faz la.
 * Devolve `null` quando nao ha o que encurtar, e a tela mostra o que ja mostrava.
 */
function caminhoParaMostrar(alvo, cwd) {
  if (!alvo || !cwd || typeof alvo !== 'string' || !path.isAbsolute(alvo)) return null
  const rel = path.relative(cwd, alvo)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel
}

module.exports = { Conversa, FilaDeMensagens, ESTADO, descreverPedido, estaSemLogin, ehRespostaSemLogin, caminhoParaMostrar }
