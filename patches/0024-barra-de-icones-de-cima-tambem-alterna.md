# 0024 — a barra de ícones de cima também ALTERNA

**Arquivo tocado:** `src/vs/workbench/browser/parts/paneCompositeBar.ts` (uma condição).

## O que ele viu

Com as palavras dele, em 24/09/2026:

> *"quando eu clico, abre, quando eu clico em outro, troca para o outro que eu cliquei, mas quando
> eu clico de novo no mesmo, ele não fecha (…) uma vez aberta aquela aba lateral ela fica aberta o
> tempo inteiro e eu não consigo fechar ela para deixar o chat na tela cheia inteira novamente"*

## A causa, lida no núcleo

`ViewContainerActivityAction.run()` já tem o comportamento de alternar — e ele é guardado por um
teste de qual parte da tela pediu a ação:

```ts
if (this.part === Parts.ACTIVITYBAR_PART) {
    const sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
    const activeViewlet = this.paneCompositePart.getActivePaneComposite();
    if (sideBarVisible && activeViewlet?.getId() === this.compositeBarActionItem.id) {
        // 'toggle' (o padrão): esconde a lateral
        this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
        return;
    }
}
await this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
```

O **patch 0022** moveu a barra de ícones para a barra de título e a criou passando
`Parts.TITLEBAR_PART`. Como não é `ACTIVITYBAR_PART`, o bloco inteiro é **pulado**, e a execução cai
na última linha — `openPaneComposite`, que **sempre abre**.

Ou seja: o comportamento que ele pediu nunca foi removido. Ele deixou de ser **alcançado** quando a
barra mudou de lugar, e isso passou despercebido porque um `if` que não entra não deixa rastro.

## O conserto

```ts
if (this.part === Parts.ACTIVITYBAR_PART || this.part === Parts.TITLEBAR_PART) {
```

**Não há comportamento novo:** é o mesmo toggle do núcleo, alcançando a barra que mudou de lugar. A
lateral escondida continua sendo a `SIDEBAR_PART`, porque é ela que esta barra abre — o patch 0022
a cria com `ViewContainerLocation.Sidebar`.

E a preferência `workbench.activityBar.iconClickBehavior` continua valendo: quem a puser em `focus`
recebe foco em vez de fechamento, exatamente como na barra vertical.

## Por que não foi resolvido na extensão

Havia um caminho mais curto — fazer os nossos comandos (`oficina.abrirArquivos` e irmãos) checarem
se a vista já está visível e fecharem. Ele foi descartado por dois motivos:

1. **Os ícones que ele clica não são os nossos comandos.** São os da barra de atividades nativa,
   movida para cima; nossos comandos são outra porta para as mesmas vistas. Consertar os comandos
   deixaria o clique no ícone — que é o que ele faz — exatamente como estava.
2. **Duplicaria a regra.** O núcleo já sabe alternar, e já respeita a configuração de quem usa.
   Reescrever isso na extensão criaria uma segunda fonte para a mesma decisão, que é como se
   ganham dois comportamentos diferentes para o mesmo clique.

## O que este patch NÃO faz

Não mexe na barra vertical, não muda o que acontece ao clicar num ícone **diferente** do ativo
(continua trocando de vista, sem fechar), e não toca na barra da direita.
