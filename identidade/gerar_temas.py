# -*- coding: utf-8 -*-
"""
Gera os dois temas de cor da OFICINA cobrindo 100% dos tokens que o VS Code registra.

Por que gerador e nao dois JSON escritos a mao:
  - sao 843 tokens hoje e o upstream cria mais a cada versao. Tema escrito a mao
    envelhece calado: a cor nova nasce com o valor da Microsoft e o produto volta a
    ter "buraco" azul sem ninguem perceber.
  - a lista oficial sai do proprio clone (identidade/tokens_oficiais.txt, extraida de
    registerColor no src/vs). O teste de cobertura compara a lista com o que saiu daqui.

Regra do projeto: fundo neutro quente, a BRASA e a unica coisa quente da
tela. Ela marca foco, item ativo, botao primario e cursor -- e nada mais. Por isso a
sintaxe e fria: se o codigo tivesse laranja, o acento pararia de significar alguma coisa.

Uso:  python identidade/gerar_temas.py [--saida DIR]
Saida: extensoes/oficina-temas/temas/oficina-{escuro,claro}.json

O `--saida` existe para o teste anti-drift (testes/temas.mjs): ele regenera os temas num
diretorio temporario e compara com os que estao commitados. Sem isso, uma edicao a mao
num JSON de tema passa nos criterios da regressao e some do gerador na proxima vez que
alguem o rodar.
"""

import argparse
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LISTA = RAIZ / "identidade" / "tokens_oficiais.txt"
SAIDA = RAIZ / "extensoes" / "oficina-temas" / "temas"


# ─────────────────────────────────────────────────────────────────────────────
# PALETA
# ─────────────────────────────────────────────────────────────────────────────

def hsl(h, s, l):
    """HSL -> #rrggbb. s e l em 0..100."""
    s, l = s / 100.0, l / 100.0
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs(((h / 60.0) % 2) - 1))
    m = l - c / 2
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h // 60) % 6]
    return "#%02x%02x%02x" % tuple(round((v + m) * 255) for v in (r, g, b))


def a(cor, alpha):
    """Anexa canal alfa (0..1) a um #rrggbb."""
    return cor[:7] + "%02x" % round(max(0.0, min(1.0, alpha)) * 255)


def mist(c1, c2, t):
    """Mistura dois #rrggbb; t=0 devolve c1, t=1 devolve c2."""
    p = lambda c: tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
    x, y = p(c1), p(c2)
    return "#%02x%02x%02x" % tuple(round(x[i] + (y[i] - x[i]) * t) for i in range(3))


H = 34  # matiz do carvao/papel: quente, nao azulado

ESCURO = dict(
    nome="OFICINA Escuro", tipo="dark",
    # ⚠️ A ESCADA DE SUPERFICIES E MEDIDA, NAO ESCOLHIDA NO OLHO.
    #
    # Os primeiros valores davam ΔL* (CIELAB) de 1,6 a 3,8 entre degraus vizinhos --
    # e uma superficie grande e chapada so le como "outro plano", de relance, a partir
    # de ΔL* ~4. Barra de titulo, lateral e editor ficavam abaixo de 2,6: a tela
    # inteira lia como UMA PLACA, e a unica separacao vinha da borda desenhada. Basta
    # um menu flutuante sem borda para o plano sumir. Achado da revisao visual,
    # 06/09/2026, com ΔL* calculado degrau a degrau.
    #
    # ⚠️ 24/09/2026 — A ESCADA SUBIU INTEIRA, por queixa dele usando o produto: "o bloco de
    # chat, a cor dos textos e o fundo ... ficou escuro demais e um pouco dificil de enxergar",
    # comparando lado a lado com o VS Code. O alvo passou a ser MEDIDO contra o Dark Modern da
    # MESMA tag (1.136.1), em luminancia relativa, e nao clareado no olho.
    #
    # A escada nao foi escolhida: foi DERIVADA. Partindo do piso 8, cada degrau e o primeiro
    # valor de L que da ΔL* >= 3,0 sobre o anterior. Resultado medido, L* de cada superficie:
    # barra 6,81 · lateral 9,88 · editor 12,96 · painel 16,19 · elevado 19,22
    # ΔL* entre vizinhos: 3,07 · 3,08 · 3,23 · 3,03  (piso do teste: 2,8)
    #
    # Contra o VS Code, em luminancia: barra 0,0075 (ele 0,0091) · lateral 0,0111 (0,0091) ·
    # editor 0,0156 (0,0137). Antes desta mudanca a barra era 0,0041 — MENOS DA METADE da dele,
    # e era ela que lia como "quase preto".
    #
    # ⚠️ CUSTO, declarado na mesma frase: o carvao fica menos profundo (o editor era L*7,9 na
    # primeira versao, 10,4 na segunda, 12,96 agora) e o contraste do texto do editor cai de
    # 11,41:1 para 10,75:1 — continua AAA. Dois criterios tiveram de subir junto porque o fundo
    # clareou: o comentario da sintaxe (52 -> 54, estava em 4,4995:1 contra o piso 4,5) e o
    # vermelho de erro (45 -> 50, a borda do botao destrutivo caiu a 2,78:1 contra o piso 3).
    # Piso nenhum foi afrouxado.
    # superficies, do fundo para a frente
    s_fundo=hsl(H, 8, 8),       # barra de titulo, barra de status
    s_lateral=hsl(H, 8, 10.4),     # lateral, abas inativas
    s_editor=hsl(H, 8, 12.9),     # o editor
    s_painel=hsl(H, 8, 15.4),     # terminal, painel
    s_elev=hsl(H, 8, 18),     # widget, menu, input, dropdown
    s_elev2=hsl(H, 8, 20.4),      # hover sobre elevado
    # ⚠️ A BORDA FICA FORA DA ESCADA, mais clara que todas as superficies — como no claro, onde ela e
    # mais escura que todas. A 17% ela tinha a MESMA claridade do elevado (17,5%): 1,01:1. Tudo que se
    # desenha com borda em cima de uma caixa flutuante sumia (cartoes e arvore do mapa dos agentes,
    # trilho do esforco, a borda do campo dentro da paleta). A 25%: 1,35:1 sobre o elevado (o claro da
    # 1,36:1 sobre o branco dele, e ali as mesmas pecas se leem). ⚠️ Com a escada nova (24/09/2026) ela
    # subiu para 28 para nao perder a briga com o elevado, que tambem clareou: MEDIDO agora, 1,50:1 sobre
    # o elevado, 1,78 sobre o editor, 2,03 sobre a barra
    # de titulo. Custo, declarado: toda divisoria do escuro fica mais marcada (lateral/editor, abas,
    # painel: era 1,23:1 sobre o editor). Revisao de beleza de 18/09/2026, cobrado em testes/temas.mjs.
    borda=hsl(H, 10, 28),
    borda_forte=hsl(H, 12, 35),   # continua um degrau acima da borda (era 24 com a borda a 17)
    txt=hsl(38, 20, 91),
    # ⚠️ txt2 e O TEXTO DA INTERFACE (`foreground`, lateral, menu, barra de titulo, terminal,
    # notificacoes). Era 66 — luminancia 0,4101 contra os 0,6038 do #CCCCCC que o VS Code usa no
    # mesmo lugar, ou seja 1,47x mais escuro, e foi a peca que ele descreveu como "dificil de
    # enxergar". A 79: luminancia 0,5996, praticamente o valor dele (1,01x). 24/09/2026.
    txt2=hsl(38, 10, 79),
    # ⚠️ txt3 e TEXTO (descricao, titulo da lateral, barra de status, aba inativa), entao cobra
    # 4,5:1. A 48% dava 4,17:1 no editor e 4,48:1 na lateral (revisao visual de 18/09/2026); a 53%
    # dava 5,68 / 5,34 / 4,97 / 4,51 sobre barra, lateral, editor e painel.
    # ⚠️ 24/09/2026, subiu a 62: o alvo e o secundario do Dark Modern (#9D9D9D, luminancia 0,3372) —
    # o nosso era 0,2570, e a queixa dele foi justamente "a cor dos textos". Agora 0,3545. MEDIDO
    # sobre as cinco superficies: 7,03 / 6,62 / 6,17 / 5,67 / 5,19. A distancia para o txt2 subiu de
    # 1,5:1 para 1,61:1, ou seja a hierarquia dos dois nao se perdeu ao clarear os dois.
    txt3=hsl(38, 8, 62),
    txt4=hsl(38, 9, 52),       # desabilitado. 44 era o piso de 3:1 sobre a lateral ANTIGA; com a
                               # escada nova subiu a 52 e MEDE 5,20 / 4,90 / 4,57 / 4,20 / 3,84
    acento=hsl(27, 76, 54),        # brasa
    acento_claro=hsl(27, 82, 64),
    acento_escuro=hsl(27, 70, 42),
    sobre_acento="#1c1206",        # texto sobre a brasa
    # ⚠️ Erro, aviso e acerto NAO podem se distinguir so pelo matiz.
    #
    # Vermelho (6°), ambar (42°) e a brasa (27°) sao vizinhos na roda de cores --
    # justamente a faixa que protanopia e deuteranopia embaralham (perto de 8% dos
    # homens). O que sobra quando a cor se perde e a CLARIDADE, entao as tres tem
    # luminancia separada de propósito: as claridades abaixo saem de uma busca que
    # exigiu >= 1,45:1 entre cada par E >= 3:1 contra o fundo. Medido: 1,99:1 e 3,17:1.
    # Achado duma revisao independente, 06/09/2026; cobrado em testes/temas.mjs.
    erro=hsl(6, 62, 50), aviso=hsl(42, 72, 79), ok=hsl(142, 44, 47), info=hsl(205, 40, 62),
    add=hsl(142, 44, 47), rem=hsl(6, 62, 50), mod=hsl(205, 40, 55),
    # sintaxe: frios de baixa saturacao
    key=hsl(207, 32, 66), string=hsl(140, 22, 62), num=hsl(258, 26, 71),
    fun=hsl(190, 28, 68), com=hsl(36, 12, 54), var=hsl(38, 14, 82),
    tipo_=hsl(180, 24, 66), punc=hsl(38, 8, 55), const=hsl(258, 26, 71),
    tag=hsl(207, 32, 66), attr=hsl(190, 24, 62), oper=hsl(38, 10, 62),
    sombra="#00000099",
)

CLARO = dict(
    nome="OFICINA Claro", tipo="light",
    # mesma medicao no claro, onde a escada estava ainda mais fechada: editor 97% e
    # widget 99,5% davam ΔL* de 1,98, com a sombra a 15% como unico separador -- um
    # menu flutuante ia parecer parte da pagina. Aqui a escada desce a partir do
    # papel, e o que flutua fica MAIS CLARO que ele.
    s_fundo=hsl(H, 26, 88),
    s_lateral=hsl(H, 26, 92),
    s_editor=hsl(H, 30, 96),
    s_painel=hsl(H, 26, 92),
    s_elev=hsl(H, 40, 100),
    s_elev2=hsl(H, 26, 90),
    borda=hsl(H, 20, 86),
    borda_forte=hsl(H, 18, 74),
    txt=hsl(30, 14, 14),
    txt2=hsl(30, 8, 36),
    # ⚠️ txt3 a 39%, e nao 50% (revisao visual de 18/09/2026): a 50% o texto secundario dava de
    # 3,00:1 (barra de status) a 3,59:1 (editor) — e ficava com a MESMA claridade do txt4, o
    # desabilitado, entao secundario e desabilitado se confundiam. A 39%: 4,57 / 5,00 / 5,46 / 5,00
    # sobre barra, lateral, editor e painel. Custo, declarado: no claro o secundario fica quase tao
    # escuro quanto o txt2 (1,11:1 entre os dois) — a hierarquia passa a depender do tamanho e do
    # peso da letra, como no tema claro de fabrica do editor.
    txt3=hsl(30, 6, 39),
    txt4=hsl(30, 7, 50),
    acento=hsl(24, 82, 36),
    acento_claro=hsl(24, 76, 46),
    acento_escuro=hsl(24, 80, 32),
    sobre_acento="#fffaf3",
    # mesma regra do escuro, resolvida para fundo de papel: 1,98:1 entre pares e
    # 3,31:1 contra o fundo
    erro=hsl(6, 62, 20), aviso=hsl(42, 72, 26), ok=hsl(142, 44, 42), info=hsl(205, 52, 38),
    add=hsl(142, 44, 42), rem=hsl(6, 62, 20), mod=hsl(205, 48, 40),
    key=hsl(207, 44, 40), string=hsl(140, 38, 28), num=hsl(258, 38, 44),
    # ⚠️ `com` = 41% de luz, nao 46%. A 46 o comentario dava 3,92:1 sobre o papel do
    # editor -- abaixo do 4,5:1 que o WCAG pede para texto pequeno. Comentario e
    # CONTEUDO: e a linha que explica por que o codigo e assim, e quem le codigo le
    # comentario o dia inteiro. A 41 sao 4,79:1, quase o mesmo do tema escuro (4,87:1).
    # Custo declarado: o comentario fica menos apagado, entao a hierarquia "codigo em
    # primeiro plano, comentario atras" passa a depender mais do ITALICO e menos da
    # claridade. Foi a troca escolhida em 06/09/2026, quando o texto do projeto
    # ("comentario nao tem isencao de contraste") e o teste (isencao de 3,0) estavam
    # se contradizendo -- e as duas versoes nao podiam coexistir.
    fun=hsl(196, 46, 32), com=hsl(36, 14, 41), var=hsl(30, 16, 22),
    tipo_=hsl(184, 44, 28), punc=hsl(30, 8, 44), const=hsl(258, 38, 44),
    tag=hsl(207, 44, 40), attr=hsl(196, 40, 34), oper=hsl(30, 10, 38),
    sombra="#3a2a1a3d",
)


# ─────────────────────────────────────────────────────────────────────────────
# QUAL SUPERFICIE CADA FAMILIA OCUPA
# A chave e o primeiro segmento do id (antes do primeiro ponto); ids sem ponto
# entram inteiros. Nao esta aqui -> cai no fallback, que usa a superficie do editor.
# ─────────────────────────────────────────────────────────────────────────────

SUPERFICIE = {
    # o chao
    "titleBar": "s_fundo", "statusBar": "s_fundo", "statusBarItem": "s_fundo",
    "commandCenter": "s_elev",
    # ⚠️ O BANNER NAO E WIDGET FLUTUANTE NESTE PRODUTO — e a FAIXA do limite do plano (t199), uma
    # tira fixa entre a barra de titulo e a fileira de abas. Como `s_elev` (a superficie de menu e
    # caixa de texto), ela saia BRANCO PURO no tema claro: medida numa conferencia independente do
    # build 1, era o elemento mais claro da janela inteira, lendo como uma tarja cortando a tela
    # (contraste 1,30 com a barra de titulo e 1,19 com as abas). Em `s_lateral` ela pertence a
    # regiao onde esta (contraste ~1,05 para os dois lados) e o texto continua legivel: 5,3 no
    # claro, 7,7 no escuro.
    # O custo, declarado: o banner de AVISO do editor (raro, e que substitui a faixa quando
    # aparece) fica discreto em vez de destacado.
    "banner": "s_lateral",
    # as laterais
    "activityBar": "s_lateral", "activityBarBadge": "s_lateral", "activityBarTop": "s_lateral",
    "modernActivityBar": "s_lateral", "modernActivityBarItem": "s_lateral",
    "sideBar": "s_lateral", "sideBarSectionHeader": "s_lateral", "sideBarTitle": "s_lateral",
    "sideBarActivityBarTop": "s_lateral", "sideBarStickyScroll": "s_lateral",
    "auxiliaryBar": "s_lateral",
    # o meio
    "editor": "s_editor", "editorGroup": "s_editor", "editorGroupHeader": "s_lateral",
    "editorPane": "s_editor", "editorStickyScroll": "s_editor", "breadcrumb": "s_editor",
    "breadcrumbPicker": "s_elev", "tab": "s_lateral", "modernTab": "s_lateral",
    "modernEditorTab": "s_lateral", "editorLineNumber": "s_editor",
    "editorGutter": "s_editor", "minimap": "s_editor", "minimapGutter": "s_editor",
    "minimapSlider": "s_editor", "editorOverviewRuler": "s_editor",
    "editorUnnecessaryCode": "s_editor", "editorRuler": "s_editor",
    # paineis
    "panel": "s_painel", "panelTitle": "s_painel", "panelSection": "s_painel",
    "panelSectionHeader": "s_painel", "panelInput": "s_elev", "panelStickyScroll": "s_painel",
    "terminal": "s_painel", "terminalCursor": "s_painel", "terminalCommandDecoration": "s_painel",
    "terminalOverviewRuler": "s_painel", "terminalStickyScrollHover": "s_elev",
    "terminalCommandGuide": "s_painel", "terminalSymbolIcon": "s_painel",
    "debugToolBar": "s_elev", "debugView": "s_lateral", "debugConsole": "s_painel",
    "debugExceptionWidget": "s_elev",
    # o que flutua
    "menu": "s_elev", "menubar": "s_fundo", "dropdown": "s_elev", "input": "s_elev",
    "inputOption": "s_elev", "inputValidation": "s_elev", "quickInput": "s_elev",
    "quickInputList": "s_elev", "quickInputTitle": "s_elev", "pickerGroup": "s_elev",
    "editorWidget": "s_elev", "editorSuggestWidget": "s_elev", "editorHoverWidget": "s_elev",
    "editorGhostText": "s_editor", "editorMarkerNavigation": "s_elev",
    "peekView": "s_elev", "peekViewEditor": "s_painel", "peekViewResult": "s_elev",
    "peekViewTitle": "s_elev", "notifications": "s_elev", "notificationCenter": "s_elev",
    "notificationToast": "s_elev", "notificationCenterHeader": "s_elev",
    "notificationLink": "s_elev", "notificationsErrorIcon": "s_elev",
    "notificationsWarningIcon": "s_elev", "notificationsInfoIcon": "s_elev",
    "widget": "s_elev", "toolbar": "s_elev", "actionBar": "s_elev", "editorActionList": "s_elev",
    "keybindingTable": "s_elev", "welcomePage": "s_editor", "walkThrough": "s_editor",
    "walkthrough": "s_editor", "profileBadge": "s_lateral", "chat": "s_editor",
    "inlineChat": "s_elev", "inlineChatInput": "s_elev", "inlineChatDiff": "s_editor",
    "interactive": "s_lateral", "settings": "s_editor", "extensionButton": "s_elev",
    "extensionBadge": "s_lateral", "extensionIcon": "s_lateral", "notebook": "s_editor",
    "notebookStatusSuccessIcon": "s_editor", "notebookStatusErrorIcon": "s_editor",
    "notebookStatusRunningIcon": "s_editor", "notebookScrollbarSlider": "s_editor",
    "searchEditor": "s_editor", "search": "s_lateral", "scmGraph": "s_lateral",
    "simpleFindWidget": "s_elev", "multiDiffEditor": "s_editor", "diffEditor": "s_editor",
    "merge": "s_editor", "mergeEditor": "s_editor", "testing": "s_editor",
    "gitDecoration": "s_lateral", "gitlens": "s_editor", "problemsErrorIcon": "s_painel",
    "problemsWarningIcon": "s_painel", "problemsInfoIcon": "s_painel",
    "list": "s_lateral", "listFilterWidget": "s_elev", "tree": "s_lateral",
    "treeStickyScroll": "s_lateral", "sash": "s_editor", "scrollbar": "s_editor",
    "scrollbarSlider": "s_editor", "progressBar": "s_editor", "badge": "s_lateral",
    "button": "s_elev", "checkbox": "s_elev", "radio": "s_elev", "toggle": "s_elev",
    "keybindingLabel": "s_elev", "ports": "s_painel", "remoteHub": "s_fundo",
    "statusBarDebuggingBackground": "s_fundo", "commentsView": "s_lateral",
    "editorCommentsWidget": "s_elev", "comments": "s_editor", "commentThread": "s_elev",
    "accountEntitlement": "s_lateral", "sideBySideEditor": "s_editor",
}

# ids cuja cor e semantica, nao de superficie
FAMILIA_ERRO = ("error", "Error", "deleted", "Deleted", "removed", "Removed", "failed", "Failed",
                "conflict", "Conflict", "untracked", "invalid", "Invalid", "danger", "unsupported")
FAMILIA_AVISO = ("warning", "Warning", "modified", "Modified", "renamed", "Renamed", "pending",
                 "Pending", "queued", "Queued", "stale", "Stale")
FAMILIA_OK = ("added", "Added", "success", "Success", "passed", "Passed", "insert", "Insert",
              "current", "Current", "verified", "Verified")
FAMILIA_INFO = ("info", "Info", "hint", "Hint", "incoming", "Incoming", "remote", "Remote")


def cor_semantica(pal, ident):
    for p in FAMILIA_ERRO:
        if p in ident:
            return pal["erro"]
    for p in FAMILIA_AVISO:
        if p in ident:
            return pal["aviso"]
    for p in FAMILIA_OK:
        if p in ident:
            return pal["ok"]
    for p in FAMILIA_INFO:
        if p in ident:
            return pal["info"]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# O MAPA EXPLICITO — o que decide a CARA do produto.
# Tudo que nao esta aqui e derivado por regra; o que aparece na tela toda hora esta aqui.
# ─────────────────────────────────────────────────────────────────────────────

def mapa_explicito(p):
    ac, txt, txt2, txt3 = p["acento"], p["txt"], p["txt2"], p["txt3"]
    return {
        # cromo geral
        "foreground": txt2,
        "descriptionForeground": txt3,
        "disabledForeground": p["txt4"],
        "errorForeground": p["erro"],
        "focusBorder": a(ac, 0.55),
        "contrastBorder": p["borda"],
        # V20 (t190) — TRANSPARENTE, DE PROPOSITO, E NAO AUSENTE.
        #
        # Este token existe para os temas de ALTO CONTRASTE: o editor o usa como moldura do item
        # ativo e como anel de foco pontilhado. Pintado num tema normal, ele desenha borda por cima
        # de tudo que ja tem cor propria — e foi exatamente a queixa dele na leva de 21/09/2026:
        #   "nao faz sentido a sessao ativa de claude ter uma linha laranja na borda superior e ao
        #    mesmo tempo uma borda laranja interna que nao apaga, tira a borda interna e deixa so a
        #    linha superior"
        #   "e a borda laranja interna pontilhada na sessao nao ativa tbm nao faz sentido"
        #
        # Medido no CSS compilado do proprio produto: `border:1px dotted var(--vscode-contrastActiveBorder)`
        # e a pontilhada da aba nao ativa; o `outline` solido da ativa sai do mesmo token.
        #
        # Fica TRANSPARENTE em vez de sair do arquivo porque o criterio de cobertura exige que o
        # tema responda por 100% dos tokens oficiais. Ausente, o token vira buraco de cobertura;
        # transparente, ele esta respondido e nao pinta nada.
        #
        # A linha laranja DE CIMA, que ele quer manter, e outro token: `tab.activeBorderTop`.
        "contrastActiveBorder": "#00000000",
        "widget.border": p["borda"],
        "widget.shadow": p["sombra"],
        "selection.background": a(ac, 0.30),
        "icon.foreground": txt2,
        "sash.hoverBorder": a(ac, 0.6),
        "textLink.foreground": ac,
        "textLink.activeForeground": p["acento_claro"],
        "textPreformat.foreground": ac,
        "textPreformat.background": a(ac, 0.12),
        "textBlockQuote.background": p["s_lateral"],
        "textBlockQuote.border": a(ac, 0.5),
        "textCodeBlock.background": p["s_lateral"],
        "textSeparator.foreground": p["borda"],

        # janela
        "titleBar.activeBackground": p["s_fundo"],
        "titleBar.inactiveBackground": p["s_fundo"],
        "titleBar.activeForeground": txt2,
        "titleBar.inactiveForeground": p["txt4"],
        "titleBar.border": p["borda"],
        "commandCenter.background": p["s_elev"],
        "commandCenter.activeBackground": p["s_elev2"],
        "commandCenter.foreground": txt2,
        "commandCenter.activeForeground": txt,
        "commandCenter.border": p["borda"],
        "commandCenter.activeBorder": a(ac, 0.5),
        "commandCenter.inactiveBorder": p["borda"],
        "commandCenter.debuggingBackground": a(ac, 0.18),

        # editor
        "editor.background": p["s_editor"],
        "editor.foreground": p["var"],
        "editorLineNumber.foreground": p["txt3"],
        "editorLineNumber.activeForeground": ac,
        "editorCursor.foreground": ac,
        "editorCursor.background": p["s_editor"],
        "editor.selectionBackground": a(ac, 0.22),
        "editor.inactiveSelectionBackground": a(ac, 0.12),
        "editor.selectionHighlightBackground": a(ac, 0.14),
        "editor.wordHighlightBackground": a(p["info"], 0.16),
        "editor.wordHighlightStrongBackground": a(p["info"], 0.24),
        "editor.findMatchBackground": a(ac, 0.42),
        "editor.findMatchHighlightBackground": a(ac, 0.20),
        "editor.findRangeHighlightBackground": a(ac, 0.10),
        "editor.hoverHighlightBackground": a(ac, 0.12),
        # 4% e imperceptivel (1,03:1): a linha atual e orientacao, nao acento
        "editor.lineHighlightBackground": a(p["txt"], 0.08),
        "editor.lineHighlightBorder": "#00000000",
        "editor.rangeHighlightBackground": a(ac, 0.09),
        "editorWhitespace.foreground": a(p["txt"], 0.14),
        "editorIndentGuide.background1": a(p["txt"], 0.08),
        "editorIndentGuide.activeBackground1": a(ac, 0.35),
        # ⚠️ Os niveis 2..6 caiam na regra do "active" e saiam com a BRASA OPACA --
        # uma listra laranja da altura do bloco inteiro, atras do codigo. E os seis
        # guias de par de colchete saiam TODOS com a mesma cor, o que anula a unica
        # coisa que eles servem para dizer: em que profundidade voce esta.
        "editorIndentGuide.background2": a(p["txt"], 0.08),
        "editorIndentGuide.background3": a(p["txt"], 0.08),
        "editorIndentGuide.background4": a(p["txt"], 0.08),
        "editorIndentGuide.background5": a(p["txt"], 0.08),
        "editorIndentGuide.background6": a(p["txt"], 0.08),
        "editorIndentGuide.activeBackground2": a(p["txt"], 0.22),
        "editorIndentGuide.activeBackground3": a(p["txt"], 0.22),
        "editorIndentGuide.activeBackground4": a(p["txt"], 0.22),
        "editorIndentGuide.activeBackground5": a(p["txt"], 0.22),
        "editorIndentGuide.activeBackground6": a(p["txt"], 0.22),
        "editorBracketPairGuide.background1": a(p["key"], 0.22),
        "editorBracketPairGuide.background2": a(p["fun"], 0.22),
        "editorBracketPairGuide.background3": a(p["num"], 0.22),
        "editorBracketPairGuide.background4": a(p["tipo_"], 0.22),
        "editorBracketPairGuide.background5": a(p["attr"], 0.22),
        "editorBracketPairGuide.background6": a(p["string"], 0.22),
        "editorBracketPairGuide.activeBackground1": a(p["key"], 0.55),
        "editorBracketPairGuide.activeBackground2": a(p["fun"], 0.55),
        "editorBracketPairGuide.activeBackground3": a(p["num"], 0.55),
        "editorBracketPairGuide.activeBackground4": a(p["tipo_"], 0.55),
        "editorBracketPairGuide.activeBackground5": a(p["attr"], 0.55),
        "editorBracketPairGuide.activeBackground6": a(p["string"], 0.55),
        "editorRuler.foreground": a(p["txt"], 0.10),
        "editorBracketMatch.background": a(ac, 0.18),
        "editorBracketMatch.border": a(ac, 0.6),
        "editorLink.activeForeground": ac,
        "editorGutter.background": p["s_editor"],
        "editorGutter.modifiedBackground": p["mod"],
        "editorGutter.addedBackground": p["add"],
        "editorGutter.deletedBackground": p["rem"],
        "editorError.foreground": p["erro"],
        "editorWarning.foreground": p["aviso"],
        "editorInfo.foreground": p["info"],
        "editorHint.foreground": p["txt3"],
        # ⚠️ txt2, NAO txt4. O txt4 e a cor de "inativo/desabilitado" (3,62:1 no escuro e 3,58:1 no
        # claro sobre o fundo do editor, medido) — abaixo dos 4,5:1 do WCAG. Isso passava enquanto
        # CodeLens era so metadado de IDE; na V3 ele virou o CONTROLE por trecho, o unico lugar da
        # tela onde se aceita ou rejeita um pedaco da mudanca. Com txt2: 7,44:1 e 6,06:1 (medido).
        # TROCA: todo CodeLens do produto fica mais forte, inclusive os de terceiros (referencias,
        # testes), que hoje somem de proposito. Revisao de beleza da V3.
        "editorCodeLens.foreground": p["txt2"],
        "editorInlayHint.background": a(p["txt"], 0.06),
        "editorInlayHint.foreground": p["txt3"],
        "editorStickyScroll.background": p["s_lateral"],
        "editorStickyScrollHover.background": p["s_elev"],

        # grupos e abas
        "editorGroupHeader.tabsBackground": p["s_lateral"],
        "editorGroupHeader.noTabsBackground": p["s_lateral"],
        "editorGroupHeader.tabsBorder": p["borda"],
        "editorGroup.border": p["borda"],
        "editorGroup.emptyBackground": p["s_editor"],
        "tab.activeBackground": p["s_editor"],
        "tab.inactiveBackground": p["s_lateral"],
        "tab.activeForeground": txt,
        # Aba inativa e controle CLICAVEL, nao desabilitado: o WCAG so isenta o desabilitado.
        "tab.inactiveForeground": p["txt3"],
        # ⚠️ O grupo SEM foco caia na regra do "inativo" (txt4, a cor de desabilitado): 3,89:1 no escuro e 3,28:1
        # no claro. Com a conversa ao lado do editor, e a aba DELA que fica num grupo sem foco a maior parte do
        # tempo. Aba de grupo sem foco e controle clicavel como qualquer outra: a ativa fica um degrau abaixo da
        # ativa com foco (txt2), a inativa igual a inativa com foco (txt3). Revisao de beleza de 18/09/2026.
        "tab.unfocusedActiveForeground": txt2,
        "tab.unfocusedInactiveForeground": p["txt3"],
        "tab.unfocusedHoverForeground": txt2,
        "tab.border": p["borda"],
        "tab.activeBorder": "#00000000",
        "tab.activeBorderTop": ac,
        "tab.unfocusedActiveBorderTop": a(ac, 0.45),
        "tab.hoverBackground": p["s_elev"],
        "tab.hoverForeground": txt,
        "tab.lastPinnedBorder": p["borda"],
        "tab.dragAndDropBorder": ac,

        # laterais
        "sideBar.background": p["s_lateral"],
        "sideBar.foreground": txt2,
        "sideBar.border": p["borda"],
        "sideBarTitle.foreground": txt3,
        "sideBarSectionHeader.background": p["s_lateral"],
        "sideBarSectionHeader.foreground": txt3,
        "sideBarSectionHeader.border": p["borda"],
        "activityBar.background": p["s_lateral"],
        "activityBar.foreground": ac,
        "activityBar.inactiveForeground": p["txt4"],
        "activityBar.border": p["borda"],
        "activityBar.activeBorder": ac,
        "activityBar.activeBackground": a(ac, 0.10),
        "activityBarBadge.background": ac,
        "activityBarBadge.foreground": p["sobre_acento"],
        "badge.background": ac,
        "badge.foreground": p["sobre_acento"],

        # listas e arvore
        "list.activeSelectionBackground": a(ac, 0.18),
        "list.activeSelectionForeground": txt,
        "list.activeSelectionIconForeground": ac,
        "list.inactiveSelectionBackground": a(p["txt"], 0.06),
        "list.inactiveSelectionForeground": txt,
        "list.hoverBackground": a(p["txt"], 0.05),
        "list.hoverForeground": txt,
        "list.focusBackground": a(ac, 0.16),
        "list.focusForeground": txt,
        "list.focusOutline": a(ac, 0.5),
        "list.highlightForeground": ac,
        "list.focusHighlightForeground": ac,
        "list.dropBackground": a(ac, 0.12),
        "tree.indentGuidesStroke": a(p["txt"], 0.14),
        "tree.inactiveIndentGuidesStroke": a(p["txt"], 0.07),

        # barra de status
        "statusBar.background": p["s_fundo"],
        "statusBar.foreground": txt3,
        "statusBar.border": p["borda"],
        "statusBar.noFolderBackground": p["s_fundo"],
        "statusBar.noFolderForeground": txt3,
        "statusBar.debuggingBackground": p["acento_escuro"],
        "statusBar.debuggingForeground": p["sobre_acento"],
        "statusBarItem.hoverBackground": a(p["txt"], 0.08),
        "statusBarItem.activeBackground": a(p["txt"], 0.12),
        "statusBarItem.prominentBackground": a(ac, 0.20),
        "statusBarItem.prominentForeground": txt,
        "statusBarItem.remoteBackground": ac,
        "statusBarItem.remoteForeground": p["sobre_acento"],

        # entrada
        "input.background": p["s_elev"],
        "input.foreground": txt,
        "input.border": p["borda"],
        "input.placeholderForeground": p["txt4"],
        "inputOption.activeBackground": a(ac, 0.22),
        "inputOption.activeBorder": a(ac, 0.6),
        "inputOption.activeForeground": txt,
        "dropdown.background": p["s_elev"],
        "dropdown.listBackground": p["s_elev"],
        "dropdown.foreground": txt,
        "dropdown.border": p["borda"],
        "button.background": ac,
        "button.foreground": p["sobre_acento"],
        # ⚠️ No claro, clarear o botao PIORA a leitura: com o texto claro por cima,
        # o hover caia para 3,73:1 (reprova AA) enquanto o repouso dava 5,45:1.
        # `acento_claro` foi pensado para o escuro, onde clarear = destacar.
        "button.hoverBackground": p["acento_claro"] if p["tipo"] == "dark" else p["acento_escuro"],
        "button.border": "#00000000",
        "button.secondaryBackground": p["s_elev2"],
        "button.secondaryForeground": txt,
        "button.secondaryHoverBackground": p["borda_forte"],
        "checkbox.background": p["s_elev"],
        "checkbox.foreground": txt,
        "checkbox.border": p["borda_forte"],
        "checkbox.selectBackground": a(ac, 0.2),
        "checkbox.selectBorder": ac,

        # menus e paletas
        "menu.background": p["s_elev"],
        "menu.foreground": txt2,
        "menu.selectionBackground": a(ac, 0.20),
        "menu.selectionForeground": txt,
        "menu.separatorBackground": p["borda"],
        "menu.border": p["borda"],
        "menubar.selectionBackground": a(p["txt"], 0.08),
        "menubar.selectionForeground": txt,
        "quickInput.background": p["s_elev"],
        "quickInput.foreground": txt2,
        "quickInputList.focusBackground": a(ac, 0.18),
        "quickInputList.focusForeground": txt,
        "quickInputList.focusIconForeground": ac,
        "quickInputTitle.background": p["s_elev"],
        "pickerGroup.foreground": ac,
        "pickerGroup.border": p["borda"],
        "keybindingLabel.background": a(p["txt"], 0.08),
        "keybindingLabel.foreground": txt2,
        "keybindingLabel.border": p["borda"],
        "keybindingLabel.bottomBorder": p["borda_forte"],

        # paineis e terminal
        "panel.background": p["s_painel"],
        "panel.border": p["borda"],
        "panelTitle.activeForeground": txt,
        "panelTitle.inactiveForeground": p["txt3"],
        "panelTitle.activeBorder": ac,
        "panelInput.border": p["borda"],
        "terminal.background": p["s_painel"],
        "terminal.foreground": txt2,
        "terminal.selectionBackground": a(ac, 0.22),
        "terminalCursor.foreground": ac,
        "terminalCursor.background": p["s_painel"],
        "terminal.border": p["borda"],

        # widgets flutuantes
        "editorWidget.background": p["s_elev"],
        "editorWidget.foreground": txt2,
        "editorWidget.border": p["borda"],
        "editorSuggestWidget.background": p["s_elev"],
        "editorSuggestWidget.border": p["borda"],
        "editorSuggestWidget.foreground": txt2,
        "editorSuggestWidget.selectedBackground": a(ac, 0.18),
        "editorSuggestWidget.selectedForeground": txt,
        "editorSuggestWidget.highlightForeground": ac,
        "editorSuggestWidget.focusHighlightForeground": ac,
        "editorHoverWidget.background": p["s_elev"],
        "editorHoverWidget.border": p["borda"],
        "editorHoverWidget.foreground": txt2,
        "peekView.border": a(ac, 0.5),
        "peekViewEditor.background": p["s_painel"],
        "peekViewResult.background": p["s_elev"],
        "peekViewTitle.background": p["s_elev"],
        "peekViewEditor.matchHighlightBackground": a(ac, 0.30),
        "peekViewResult.selectionBackground": a(ac, 0.18),

        # notificacoes
        "notifications.background": p["s_elev"],
        "notifications.foreground": txt2,
        "notifications.border": p["borda"],
        "notificationCenterHeader.background": p["s_elev"],
        "notificationLink.foreground": ac,
        "notificationToast.border": p["borda"],

        # rolagem
        "scrollbar.shadow": p["sombra"],
        "scrollbarSlider.background": a(p["txt"], 0.10),
        "scrollbarSlider.hoverBackground": a(p["txt"], 0.16),
        "scrollbarSlider.activeBackground": a(ac, 0.40),
        "progressBar.background": ac,
        "minimap.selectionHighlight": a(ac, 0.35),
        "minimap.findMatchHighlight": a(ac, 0.55),
        "minimapSlider.background": a(p["txt"], 0.08),
        "minimapSlider.hoverBackground": a(p["txt"], 0.13),
        "minimapSlider.activeBackground": a(ac, 0.30),

        # git e diff
        "gitDecoration.modifiedResourceForeground": p["aviso"],
        "gitDecoration.addedResourceForeground": p["ok"],
        "gitDecoration.deletedResourceForeground": p["erro"],
        "gitDecoration.untrackedResourceForeground": p["ok"],
        "gitDecoration.ignoredResourceForeground": p["txt4"],
        "gitDecoration.conflictingResourceForeground": p["erro"],
        "gitDecoration.stageModifiedResourceForeground": p["aviso"],
        "gitDecoration.stageDeletedResourceForeground": p["erro"],
        "gitDecoration.submoduleResourceForeground": p["info"],
        "diffEditor.insertedTextBackground": a(p["add"], 0.14),
        "diffEditor.removedTextBackground": a(p["rem"], 0.14),
        # ⚠️ As DUAS bordas em opacidade cheia, e nao nos 60% da regra geral de borda semantica.
        # Medido (WCAG pede 3:1 para elemento nao-textual, sobre o fundo do editor): a 60% davam
        # 2,99 / 1,84 no escuro e 1,96 / 3,94 no claro — tres dos quatro reprovados, cada tema
        # falhando num lado diferente. A 100%: 6,01 / 3,02 / 3,23 / 12,68, os quatro passam (o
        # removido do escuro raspando). No diff EM LINHA, que a V3 tornou padrao, nao ha coluna
        # separada dizendo de que lado esta cada coisa: a borda e o fundo SAO o sinal.
        # TROCA: o contorno fica desenhado em vez de discreto. Revisao de beleza da V3.
        "diffEditor.insertedTextBorder": p["add"],
        "diffEditor.removedTextBorder": p["rem"],
        "diffEditor.insertedLineBackground": a(p["add"], 0.10),
        "diffEditor.removedLineBackground": a(p["rem"], 0.10),
        "diffEditor.border": p["borda"],
        "diffEditor.diagonalFill": a(p["txt"], 0.10),

        # boas-vindas
        "welcomePage.background": p["s_editor"],
        "welcomePage.tileBackground": p["s_lateral"],
        "welcomePage.tileHoverBackground": p["s_elev"],
        "welcomePage.tileBorder": p["borda"],
        "welcomePage.progress.background": a(p["txt"], 0.10),
        "welcomePage.progress.foreground": ac,
        "walkThrough.embeddedEditorBackground": p["s_painel"],

        # terminal ANSI: os frios da sintaxe, para a brasa nao competir
        "terminal.ansiBlack": p["s_fundo"] if p["tipo"] == "dark" else p["txt"],
        "terminal.ansiRed": p["erro"],
        "terminal.ansiGreen": p["string"],
        "terminal.ansiYellow": p["aviso"],
        "terminal.ansiBlue": p["key"],
        "terminal.ansiMagenta": p["num"],
        "terminal.ansiCyan": p["fun"],
        "terminal.ansiWhite": p["txt"] if p["tipo"] == "dark" else p["txt3"],
        "terminal.ansiBrightBlack": p["txt4"],
        "terminal.ansiBrightRed": mist(p["erro"], "#ffffff", 0.18),
        "terminal.ansiBrightGreen": mist(p["string"], "#ffffff", 0.18),
        # ⚠️ era a BRASA. Todo `npm WARN`, todo aviso de log saia na cor da marca --
        # e ainda por cima errado: a brasa e laranja (27°), amarelo e ~45°.
        "terminal.ansiBrightYellow": mist(p["aviso"], "#ffffff", 0.25),
        "terminal.ansiBrightBlue": mist(p["key"], "#ffffff", 0.18),
        "terminal.ansiBrightMagenta": mist(p["num"], "#ffffff", 0.18),
        "terminal.ansiBrightCyan": mist(p["fun"], "#ffffff", 0.18),
        "terminal.ansiBrightWhite": "#ffffff" if p["tipo"] == "dark" else p["txt"],

        # pares de colchete: variacao fria + uma brasa
        "editorBracketHighlight.foreground1": p["key"],
        "editorBracketHighlight.foreground2": p["fun"],
        "editorBracketHighlight.foreground3": p["num"],
        "editorBracketHighlight.foreground4": p["tipo_"],
        # nivel 5 era a brasa: laranja DENTRO do codigo, o que o §9 proibe
        "editorBracketHighlight.foreground5": p["attr"],
        "editorBracketHighlight.foreground6": p["string"],
        "editorBracketHighlight.unexpectedBracket.foreground": p["erro"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# REGRA: como derivar um id que nao esta no mapa
# ─────────────────────────────────────────────────────────────────────────────

SUFIXOS_FUNDO = ("background", "Background")
SUFIXOS_BORDA = ("border", "Border", "Stroke", "stroke", "Outline", "outline", "separator",
                 "Separator", "divider", "Divider")
SUFIXOS_SOMBRA = ("shadow", "Shadow")


def deriva(pal, ident):
    """Cor para um id que o mapa explicito nao cobre.

    ⚠️ A ARMADILHA QUE ESTA FUNCAO JA CAIU: a palavra "inactive" CONTEM "active".

    A primeira versao testava `"active" in ident` antes de `"inactive" in ident`, e
    como a segunda contem a primeira, TODO token de estado inativo casava com o ramo
    do acento: `tab.unfocusedInactiveForeground`, `radio.inactiveForeground`,
    `modernEditorTab.inactiveBackground` e mais 27 saiam pintados de BRASA -- ou seja,
    a cor que significa "e aqui que voce esta" marcando exatamente o que nao esta. As
    linhas que tratavam inativo viravam codigo morto, nunca alcancado.
    Achado por uma revisao visual, 06/09/2026; cobrado agora em testes/temas.mjs.

    Por isso o estado e resolvido UMA VEZ, no topo, e na ordem certa: primeiro o que
    nega (inativo/desabilitado), depois o que afirma (ativo/foco/selecao).
    """
    fam = ident.split(".")[0]
    sup = pal[SUPERFICIE.get(fam, "s_editor")]
    ultimo = ident.split(".")[-1]
    baixo = ident.lower()

    inativo = any(q in baixo for q in ("inactive", "unfocused", "disabled", "placeholder"))
    ativo = (not inativo) and any(q in baixo for q in ("active", "focus", "selected", "selection"))
    destaque = any(q in baixo for q in ("highlight", "match"))
    hover = "hover" in baixo

    if any(ultimo.endswith(s) for s in SUFIXOS_SOMBRA):
        return pal["sombra"]

    sem = cor_semantica(pal, ident)

    if any(ultimo.endswith(s) for s in SUFIXOS_BORDA):
        if sem:
            return a(sem, 0.6)
        if inativo:
            return pal["borda"]
        if ativo:
            return a(pal["acento"], 0.55)
        return pal["borda"]

    if any(ultimo.endswith(s) for s in SUFIXOS_FUNDO):
        if sem:
            return a(sem, 0.16)
        if inativo:
            return pal["s_lateral"]
        if ativo:
            return a(pal["acento"], 0.16)
        if hover:
            return a(pal["txt"], 0.06)
        if destaque:
            return a(pal["acento"], 0.22)
        return sup

    # sem sufixo conhecido = primeiro plano (foreground, icone, texto)
    if sem:
        return sem
    if inativo:
        return pal["txt4"]
    if ativo or destaque:
        return pal["acento"]
    if fam in ("symbolIcon", "terminalSymbolIcon", "debugIcon", "debugTokenExpression",
               "debugConsole", "charts", "editorOverviewRuler", "scmGraph"):
        return icone_ou_grafico(pal, ident)
    return pal["txt2"]


# Icone de simbolo e grafico: a mesma familia fria da sintaxe, para o editor
# nao virar arco-iris. A ordem e estavel: o mesmo id recebe sempre a mesma cor.
GIRO = ("key", "fun", "string", "num", "tipo_", "info", "attr", "oper")


def icone_ou_grafico(pal, ident):
    sem = cor_semantica(pal, ident)
    if sem:
        return sem
    alvo = ident.split(".")[-1]
    if any(w in alvo.lower() for w in ("function", "method", "constructor")):
        return pal["fun"]
    if any(w in alvo.lower() for w in ("class", "interface", "struct", "type", "enum")):
        return pal["tipo_"]
    if any(w in alvo.lower() for w in ("string", "text")):
        return pal["string"]
    if any(w in alvo.lower() for w in ("number", "numeric", "constant", "boolean")):
        return pal["num"]
    if any(w in alvo.lower() for w in ("keyword", "operator", "key")):
        return pal["key"]
    if any(w in alvo.lower() for w in ("variable", "field", "property", "parameter")):
        return pal["var"]
    if "foreground" in ident.lower() or "Icon" in ident:
        return pal[GIRO[sum(ord(c) for c in ident) % len(GIRO)]]
    return pal["txt2"]


# ─────────────────────────────────────────────────────────────────────────────
# SINTAXE (TextMate) e tokens semanticos
# ─────────────────────────────────────────────────────────────────────────────

def token_colors(p):
    r = lambda nome, escopo, cor, estilo=None: {
        "name": nome,
        "scope": escopo,
        "settings": ({"foreground": cor, "fontStyle": estilo} if estilo else {"foreground": cor}),
    }
    return [
        r("Comentario", ["comment", "punctuation.definition.comment"], p["com"], "italic"),
        r("Texto", ["text", "source", "variable.other.readwrite", "punctuation.definition.variable"], p["var"]),
        r("Texto simples", ["meta.embedded", "source.groovy.embedded", "string meta.image.inline.markdown"], p["var"]),
        r("Cadeia", ["string", "string.quoted", "punctuation.definition.string"], p["string"]),
        r("Cadeia com codigo", ["string.template", "string.interpolated"], p["string"]),
        r("Expressao regular", ["string.regexp", "constant.character.escape"], p["tipo_"]),
        r("Numero", ["constant.numeric", "constant.language", "constant.character",
                     "keyword.other.unit"], p["num"]),
        r("Constante", ["variable.other.constant", "entity.name.constant", "support.constant"], p["const"]),
        r("Palavra-chave", ["keyword", "keyword.control", "keyword.operator.new",
                            "keyword.operator.expression", "storage", "storage.type",
                            "storage.modifier"], p["key"]),
        r("Operador", ["keyword.operator", "punctuation.accessor"], p["oper"]),
        r("Pontuacao", ["punctuation", "meta.brace", "punctuation.separator",
                        "punctuation.terminator", "punctuation.definition.parameters"], p["punc"]),
        r("Funcao", ["entity.name.function", "support.function", "meta.function-call.generic",
                     "variable.function"], p["fun"]),
        r("Tipo e classe", ["entity.name.type", "entity.name.class", "entity.name.namespace",
                            "entity.other.inherited-class", "support.type", "support.class",
                            "entity.name.scope-resolution"], p["tipo_"]),
        r("Parametro", ["variable.parameter", "meta.function.parameters"], p["var"]),
        r("Propriedade", ["variable.other.property", "variable.other.object.property",
                          "meta.object-literal.key", "support.type.property-name"], p["attr"]),
        r("Variavel de linguagem", ["variable.language", "variable.language.this"], p["key"], "italic"),
        r("Etiqueta", ["entity.name.tag", "punctuation.definition.tag"], p["tag"]),
        r("Atributo", ["entity.other.attribute-name", "meta.attribute"], p["attr"]),
        r("Decorador", ["meta.decorator", "punctuation.decorator", "entity.name.function.decorator"],
          p["acento"]),
        r("Seletor CSS", ["entity.other.attribute-name.class.css",
                          "entity.other.attribute-name.id.css",
                          "entity.name.tag.css"], p["tipo_"]),
        r("Propriedade CSS", ["support.type.property-name.css", "support.type.vendored.property-name"],
          p["attr"]),
        r("Chave JSON", ["support.type.property-name.json", "string.json support.type.property-name"],
          p["key"]),
        r("Titulo Markdown", ["markup.heading", "entity.name.section"], p["fun"], "bold"),
        r("Negrito", ["markup.bold"], p["var"], "bold"),
        r("Italico", ["markup.italic"], p["var"], "italic"),
        r("Riscado", ["markup.strikethrough"], p["txt4"], "strikethrough"),
        r("Ligacao", ["markup.underline.link", "string.other.link"], p["acento"]),
        r("Citacao", ["markup.quote"], p["txt3"], "italic"),
        r("Codigo embutido", ["markup.inline.raw", "markup.raw", "markup.fenced_code"], p["string"]),
        r("Lista", ["markup.list", "beginning.punctuation.definition.list"], p["key"]),
        r("Diferenca inserida", ["markup.inserted", "meta.diff.header.to-file"], p["add"]),
        r("Diferenca removida", ["markup.deleted", "meta.diff.header.from-file"], p["rem"]),
        r("Diferenca alterada", ["markup.changed", "meta.diff.header"], p["mod"]),
        r("Invalido", ["invalid", "invalid.illegal"], p["erro"]),
        r("Obsoleto", ["invalid.deprecated"], p["com"], "strikethrough"),
        r("Cabecalho de shell", ["entity.name.function.shell", "support.function.builtin.shell"], p["fun"]),
        r("Variavel de ambiente", ["variable.other.normal.shell", "punctuation.definition.variable.shell"],
          p["num"]),
        r("Marcador de conflito", ["meta.diff", "meta.separator"], p["mod"]),
        r("Nao usado", ["comment.unused"], p["txt4"]),
    ]


def semantic_tokens(p):
    return {
        "enabled": True,
        "namespace": p["tipo_"],
        "class": p["tipo_"],
        "interface": p["tipo_"],
        "enum": p["tipo_"],
        "enumMember": p["const"],
        "type": p["tipo_"],
        "typeParameter": p["tipo_"],
        "struct": p["tipo_"],
        "function": p["fun"],
        "method": p["fun"],
        "macro": p["acento"],
        "decorator": p["acento"],
        "variable": p["var"],
        "variable.readonly": p["const"],
        "parameter": p["var"],
        "property": p["attr"],
        "property.readonly": p["attr"],
        "event": p["attr"],
        "keyword": p["key"],
        "modifier": p["key"],
        "string": p["string"],
        "number": p["num"],
        "regexp": p["tipo_"],
        "operator": p["oper"],
        "comment": {"foreground": p["com"], "fontStyle": "italic"},
        "*.declaration": {"bold": True},
        "*.deprecated": {"strikethrough": True},
        "*.defaultLibrary": {"foreground": p["key"]},
    }


# ─────────────────────────────────────────────────────────────────────────────

def gerar(pal):
    ids = [l.strip() for l in LISTA.read_text(encoding="utf-8").splitlines() if l.strip()]
    explicito = mapa_explicito(pal)
    cores = {}
    for ident in ids:
        cores[ident] = explicito.get(ident) or deriva(pal, ident)
    # o mapa pode trazer id que a lista nao tem (ex.: cor de extensao); entra tambem
    for ident, cor in explicito.items():
        cores.setdefault(ident, cor)
    return {
        "$schema": "vscode://schemas/color-theme",
        "name": pal["nome"],
        "type": pal["tipo"],
        "semanticHighlighting": True,
        "colors": dict(sorted(cores.items())),
        "tokenColors": token_colors(pal),
        "semanticTokenColors": semantic_tokens(pal),
    }


def main():
    ap = argparse.ArgumentParser(description="Gera os dois temas da OFICINA.")
    ap.add_argument("--saida", help="diretorio de saida (padrao: extensoes/oficina-temas/temas)")
    saida = Path(ap.parse_args().saida or SAIDA)
    saida.mkdir(parents=True, exist_ok=True)
    for pal, arq in ((ESCURO, "oficina-escuro.json"), (CLARO, "oficina-claro.json")):
        tema = gerar(pal)
        (saida / arq).write_text(json.dumps(tema, indent=2, ensure_ascii=False) + "\n",
                                 encoding="utf-8")
        print("%-22s %4d cores  %2d regras de sintaxe" % (arq, len(tema["colors"]),
                                                          len(tema["tokenColors"])))


if __name__ == "__main__":
    main()
