# Gera TODOS os tamanhos de icone da OFICINA a partir de UMA arte de origem.
#
# Por que existe: o icone do produto aparece em uns dez lugares com nomes e tamanhos
# diferentes (executavel, barra de tarefas, atalho, tiles do Windows, instalador,
# marca d'agua do editor vazio). Cortar e redimensionar cada um a mao e garantir que
# um deles vai ficar diferente dos outros na proxima vez que a arte mudar. Aqui a
# arte tem UMA fonte e todo o resto e derivado dela.
#
# O que ele faz com a arte, e por que:
#   1. RECORTA a moldura de fundo. A arte gerada vem com o quadrado arredondado
#      flutuando dentro de um fundo escuro (medido: 77 px de margem em 1254). Num
#      icone de barra de tarefas essa margem e espaco morto — o desenho aparece menor
#      do que os vizinhos, do mesmo tamanho.
#   2. Aplica a MASCARA de cantos arredondados com transparencia por fora, no mesmo
#      raio que a arte ja tem (medido: ~19,7% do lado). Sem isso o icone fica com um
#      retangulo escuro de fundo aparecendo atras dos cantos.
#   3. Reduz com LANCZOS a partir da resolucao cheia — nunca em cascata, que borra.
#
# Uso:  python scripts/gerar_icones.py [caminho da arte de origem]
#       Sem argumento, usa identidade/logo_oficina.png (a fonte versionada).

import sys
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
FONTE_PADRAO = RAIZ / "identidade" / "logo_oficina.png"
SAIDA = RAIZ / "identidade" / "gerados"

# Os tamanhos que o produto precisa. 16 e 24 sao os que doem: e neles que um desenho
# detalhado vira mancha. Ficam na lista de proposito, para o problema ser VISIVEL.
TAMANHOS_PNG = [16, 24, 32, 48, 64, 128, 192, 256, 512, 1024]
# O .ico do Windows carrega varias resolucoes dentro do mesmo arquivo; o sistema
# escolhe a que couber. Faltando uma, o Windows reduz sozinho, e mal.
TAMANHOS_ICO = [16, 24, 32, 48, 64, 128, 256]

TOLERANCIA_FUNDO = 18

# ⚠️ A MESMA arte nem sempre serve para todos os tamanhos — mas ISSO SE MEDE, nao se
# presume nos dois sentidos.
#
# O mecanismo abaixo permite dar um ENQUADRAMENTO diferente a cada tamanho: o formato
# .ico guarda uma imagem por resolucao e nada obriga as duas a serem o mesmo recorte.
# E o que icone profissional faz ha decadas.
#
# **Ele existiu por necessidade e hoje esta desligado, e as duas coisas foram
# medidas na mesma noite (05/09/2026):**
#
#   - A primeira arte era uma cena com textura, sombra e relevo. Media: 128 e 64 liam
#     bem, 48 ainda dava, 32 borrava e 16 virava uma mancha alaranjada. Ali o recorte
#     fechado na figura salvava os pequenos, e foi o que se usou.
#   - A arte atual e chapada e de alto contraste. Media: a cena INTEIRA se le em todos
#     os tamanhos — em 16 px ainda se reconhece a figura na mesa, melhor do que a arte
#     anterior lia em 24. O recorte fechado passou a ATRAPALHAR: as janelas tinham sido
#     calibradas na figura antiga e, nesta, cortavam no lugar errado.
#
# Por isso `janela_para` devolve a cena inteira. O mecanismo fica: arte nova que volte
# a ser detalhada so precisa recalibrar as janelas e trocar as faixas aqui — nao
# reescrever o gerador. **Antes de mexer, gerar a folha de prova e OLHAR.**
#
# Cada janela e (centro x, centro y, lado), em fracao do lado da arte.
JANELA_CHEIA = (0.50, 0.50, 1.00)

# ⛔ DECISAO DELE (05/09/2026), depois de ver os tres niveis lado a lado: **figura
# maior, moldura menor.** Eu tinha recomendado a cena inteira — o zoom ganha pouca
# legibilidade e come a moldura arredondada, que e o que da cara de icone de app. Ele
# escolheu o contrario, e a escolha e dele: quem usa o produto o dia inteiro e ele.
#
# ⚠️ ESTA JANELA ESTA EM 1.00 DESDE 06/09/2026 — o enquadramento nao se faz mais por
# zoom. Ver `crescer_figura`: a figura e recortada e recolocada maior dentro do quadro,
# o que da o mesmo ganho de tamanho SEM comer a moldura arredondada. O mecanismo de
# janela continua aqui porque resolve outro problema (dar recorte diferente por
# tamanho, quando a arte for detalhada demais para os pequenos).
JANELA_PADRAO = (0.50, 0.50, 1.00)

# ⛔ DECISAO DELE (06/09/2026): a figura ocupa 96% do quadro, sem contorno.
#
# *"o icone pequeno na barra de tarefas ta com o desenho pequeno... da pra perceber que
# bastante e borda-moldura, e poderia ser removido pra ficar so o icone e assim ficar
# maior e mais visivel"* — e, quando perguntado se a moldura devia ficar: *"nao precisa
# manter a moldura na real, ela pode ser bem pequeninha"*.
#
# Escolhido entre cinco niveis vistos lado a lado, nos tamanhos reais de 16 e 32 px.
FIGURA_OCUPA = 0.96

# ⛔ AJUSTE OPTICO (06/09/2026) — o icone nao pode ser MAIOR que os vizinhos.
#
# *"te liga na proporcao do tamanho do icone comparado aos outros"*, olhando a barra
# de tarefas. Medido, e ele tinha razao, com folga. Area de fato pintada, no mesmo
# quadro de 64 px:
#
#     OFICINA  94,8%   |   Chrome 79,0%   Discord 78,8%   Explorer 81,7%   VS Code 56,8%
#
# A causa nao e o desenho: e a FORMA. Chrome e Discord sao circulos inscritos, e um
# circulo ocupa 78,5% do quadrado que o contem — exatamente o numero medido. O nosso
# e um quadrado de cantos arredondados quase cheio, que pinta 20 pontos a mais de
# area e por isso parece maior mesmo tendo o mesmo lado.
#
# Conserto: o card recua para 91% do lado, com o canto mais aberto (24%), e o resto
# do quadro fica transparente. Isso poe a area em ~79% — a mesma dos vizinhos.
#
# ⚠️ CUSTO, declarado: a figura dentro do card encolhe junto (96% do card = ~87% do
# quadro, contra 96% antes). Ela continua MUITO maior do que era antes da decisao de
# 06/09 (76,2%), entao o ganho que ele pediu naquele dia se mantem — mas nao e de
# graca, e o pedido de hoje e por proporcao, nao por tamanho.
# ⚠️ SEGUNDA RODADA, no mesmo dia: 0,91 de lado com canto de 24% corrigiu a area mas
# ENCOLHEU o desenho -- *"agora ficou menor de novo porra"*. Ele esta certo, e as duas
# exigencias sao compativeis; eu e que tinha pago a area com o lado.
#
# A area de um quadrado de canto arredondado e  s² - (4-pi)·r².  Ou seja: da para
# tirar area pelo CANTO em vez de tirar pelo LADO. Com lado 0,96 e canto 42%, a conta
# fecha em ~78% -- a mesma dos vizinhos -- e o desenho fica praticamente do tamanho
# que ele aprovou, porque o card quase encosta na borda.
#
#     lado 0,91 · canto 24%  ->  area 78,4%, figura a 87% do quadro   (encolheu)
#     lado 0,96 · canto 42%  ->  area 78,2%, figura a 92% do quadro   (o que vale)
CARD_OCUPA = 0.96   # quanto do lado o card arredondado ocupa
CARD_RAIO = 0.42    # raio do canto, em fracao do lado do CARD


def recuar_card(icone, ocupa=CARD_OCUPA, raio=CARD_RAIO):
    """Poe o card num quadro transparente, menor que o quadro — o recuo optico.

    Feito no MESTRE, antes de qualquer reducao, para que .ico, PNGs, tiles e o SVG da
    barra superior saiam todos com o mesmo recuo. Aplicar por tamanho traria de volta
    o problema que a `janela_para` ja teve.
    """
    L = icone.size[0]
    lado = max(1, int(round(L * ocupa)))
    peca = icone.resize((lado, lado), Image.LANCZOS)
    peca = peca.copy()
    peca.putalpha(mascara_arredondada(lado, raio * lado))
    quadro = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    canto = (L - lado) // 2
    quadro.paste(peca, (canto, canto), peca)
    return quadro


def janela_para(tamanho):
    """Qual enquadramento cada tamanho recebe. Hoje: o mesmo para todos — ver acima."""
    return JANELA_PADRAO


def parecido(c, d, tol=TOLERANCIA_FUNDO):
    return all(abs(int(a) - int(b)) <= tol for a, b in zip(c[:3], d[:3]))


def caixa_da_arte(im):
    """Onde a arte comeca e termina dentro da moldura de fundo.

    A varredura e feita pelas linhas do MEIO (horizontal e vertical), nao pelos
    cantos: nos cantos o quadrado arredondado ja se afastou da borda, e medir por la
    daria uma caixa maior do que a arte.
    """
    L, A = im.size
    px = im.load()
    fundo = px[0, 0]
    meio_y, meio_x = A // 2, L // 2
    # Sem fallback, um `next()` vazio estoura StopIteration cru -- e a mensagem do
    # Python nao diria a causa (arte com fundo em gradiente, vinheta, ou o canto [0,0]
    # de cor diferente do fundo real). Aqui o erro diz o que fazer.
    try:
        esq = next(x for x in range(L) if not parecido(px[x, meio_y], fundo))
        dir_ = next(x for x in range(L - 1, -1, -1) if not parecido(px[x, meio_y], fundo))
        topo = next(y for y in range(A) if not parecido(px[meio_x, y], fundo))
        base = next(y for y in range(A - 1, -1, -1) if not parecido(px[meio_x, y], fundo))
    except StopIteration:
        raise SystemExit(
            "nao consegui separar a arte do fundo: a linha do meio inteira tem a cor do "
            f"canto {fundo[:3]}. A arte de origem precisa do desenho sobre um fundo de cor "
            "uniforme. Se o fundo for gradiente ou vinheta, recorte a arte antes.")
    return esq, topo, dir_, base


def raio_relativo(im, esq, topo, dir_):
    """O raio dos cantos, em fracao do lado — lido da propria arte, nao chutado."""
    px = im.load()
    fundo = px[0, 0]
    linha = topo + 1
    L = im.size[0]
    try:
        x = next(i for i in range(L) if not parecido(px[i, linha], fundo))
        return (x - esq) / float(dir_ - esq + 1)
    except StopIteration:
        return 0.20


def recortar_quadrado(im, esq, topo, dir_, base):
    """Corta a arte num QUADRADO centrado — nunca esticando para caber."""
    cx, cy = (esq + dir_) / 2.0, (topo + base) / 2.0
    lado = max(dir_ - esq + 1, base - topo + 1)
    meio = lado / 2.0
    caixa = (int(round(cx - meio)), int(round(cy - meio)),
             int(round(cx + meio)), int(round(cy + meio)))
    # Se a arte encostar na borda da imagem, o crop do Pillow preenche com preto;
    # por isso o quadrado e limitado ao que existe.
    caixa = (max(0, caixa[0]), max(0, caixa[1]),
             min(im.size[0], caixa[2]), min(im.size[1], caixa[3]))
    return im.crop(caixa)


def caixa_da_figura(im, faixa_perimetro=0.12):
    """Onde esta o DESENHO (pessoa, mesa, cadeira) — nao a moldura em volta dele.

    ⚠️ A diferenca entre esta funcao e `caixa_da_arte` e o que fez a primeira tentativa
    de conserto sair errada. `caixa_da_arte` acha o quadrado do icone dentro do fundo da
    imagem; esta acha a figura dentro do quadrado. Medindo sem separar as duas coisas, o
    CONTORNO amarelo do quadrado entra na conta como se fosse desenho, a medicao diz
    "a figura ocupa 99,5%" e qualquer ajuste feito em cima disso encolhe o icone inteiro
    em vez de crescer a figura. Foi exatamente o que aconteceu em 06/09/2026.

    Por isso uma faixa do perimetro fica de fora da varredura: e la que o contorno mora,
    e o canto arredondado avanca mais para dentro do que a lateral.
    """
    L, A = im.size
    px = im.load()
    faixa = int(L * faixa_perimetro)

    # ⚠️ A POLARIDADE DA ARTE NAO E SUPOSICAO: e medida aqui.
    #
    # A versao anterior procurava a figura por "pixel claro" (brilho > 90), o que so
    # vale para a arte de hoje -- figura amarela sobre fundo escuro. Arte nova com
    # figura ESCURA sobre fundo claro faria a funcao marcar o FUNDO INTEIRO como
    # figura, devolver uma caixa do tamanho do quadro e o `crescer_figura` nao crescer
    # nada. Sem excecao, sem aviso: rodaria e sairia errado.
    #
    # Agora o brilho do fundo (medido no canto do quadro, ja dentro do card) decide o
    # sentido da comparacao. Achado duma revisao independente, 06/09/2026.
    canto = px[faixa, faixa]
    fundo_claro = (canto[0] + canto[1] + canto[2]) / 3 > 128
    LIMIAR = 90

    def eh_figura(p):
        r, g, b = p[0], p[1], p[2]
        a = p[3] if len(p) > 3 else 255
        if a <= 40:
            return False
        brilho = (r + g + b) / 3
        return brilho < (255 - LIMIAR) if fundo_claro else brilho > LIMIAR

    esq, topo, dir_, base = L, A, 0, 0
    for y in range(faixa, A - faixa):
        for x in range(faixa, L - faixa):
            if eh_figura(px[x, y]):
                if x < esq: esq = x
                if x > dir_: dir_ = x
                if y < topo: topo = y
                if y > base: base = y
    if dir_ <= esq or base <= topo:
        return None
    # Caixa do tamanho da area varrida = a funcao nao separou figura de fundo. Melhor
    # parar do que devolver um enquadramento que o resto do script vai obedecer.
    varrido = (L - 2 * faixa)
    if (dir_ - esq + 1) >= varrido * 0.995 and (base - topo + 1) >= varrido * 0.995:
        print("[icones] AVISO: a figura ocupa TODA a area varrida — provavelmente a arte "
              "nova tem outra polaridade ou fundo nao uniforme. Confira a folha de prova.")
        return None
    return esq, topo, dir_, base


def crescer_figura(arte, alvo, raio_fracao):
    """Recompoe a arte com a FIGURA ocupando `alvo` do quadro.

    ⛔ DECISAO DELE (06/09/2026), olhando cinco niveis lado a lado nos tamanhos reais de
    16 e 32 px: **0,96 sem o contorno amarelo** — *"nao precisa manter a moldura na
    real, ela pode ser bem pequeninha"*.

    O que mudou em relacao ao mecanismo anterior: crescer por ZOOM (a `janela_para`
    abaixo) aumenta a figura CORTANDO o quadro, e leva a moldura arredondada junto —
    dando um icone que perde a cara de app. Aqui a figura e recortada, reescalada e
    recolocada num quadro do tamanho original: ela cresce e o canto arredondado
    continua inteiro.

    Medido na arte atual: a figura ocupava 76,2% da largura e apenas **65,1% da
    altura** — mais de um terco da altura era moldura morta. Foi o que ele viu na barra
    de tarefas e nomeou antes de qualquer medicao nossa.
    """
    caixa = caixa_da_figura(arte)
    if caixa is None:
        print("[icones] AVISO: nao encontrei a figura dentro da arte; mantive como estava")
        return arte
    esq, topo, dir_, base = caixa
    L = arte.size[0]
    larg, alt = dir_ - esq + 1, base - topo + 1
    print(f"[icones] figura: {larg}x{alt} ({100.0 * larg / L:.1f}% x {100.0 * alt / L:.1f}% do quadro)"
          f" -> crescendo para {alvo * 100:.0f}%")

    fundo = arte.convert("RGB").load()[0, 0]
    figura = arte.crop((esq, topo, dir_ + 1, base + 1))
    quadro = Image.new("RGBA", (L, L), fundo + (255,))
    escala = (alvo * L) / max(larg, alt)
    nova = (max(1, int(larg * escala)), max(1, int(alt * escala)))
    peca = figura.resize(nova, Image.LANCZOS)
    quadro.paste(peca, ((L - nova[0]) // 2, (L - nova[1]) // 2), peca)
    quadro.putalpha(mascara_arredondada(L, raio_fracao * L))
    return quadro


def mascara_arredondada(lado, raio, escala=4):
    """Cantos arredondados com borda limpa.

    Desenhada em 4x e reduzida: o `rounded_rectangle` do Pillow nao suaviza a curva,
    e sem isso a borda do icone fica serrilhada em 256 px e um degrau em 32.
    """
    m = Image.new("L", (lado * escala, lado * escala), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        (0, 0, lado * escala - 1, lado * escala - 1),
        radius=int(raio * escala), fill=255)
    return m.resize((lado, lado), Image.LANCZOS)


def main():
    fonte = Path(sys.argv[1]) if len(sys.argv) > 1 else FONTE_PADRAO
    if not fonte.exists():
        raise SystemExit(f"nao achei a arte de origem: {fonte}")

    original = Image.open(fonte).convert("RGB")
    esq, topo, dir_, base = caixa_da_arte(original)
    fr = raio_relativo(original, esq, topo, dir_)
    print(f"arte: {original.size[0]}x{original.size[1]} | caixa {esq},{topo} .. {dir_},{base} "
          f"| raio {fr * 100:.1f}% do lado")

    arte = recortar_quadrado(original, esq, topo, dir_, base)
    L_arte = min(arte.size)
    arte = arte.resize((L_arte, L_arte), Image.LANCZOS).convert("RGBA")
    arte.putalpha(mascara_arredondada(L_arte, fr * L_arte))
    print(f"recortado para {L_arte}x{L_arte}, cantos arredondados com transparencia")

    # A figura cresce ANTES de qualquer redimensionamento: assim todos os tamanhos, o
    # .ico, os tiles e o SVG da barra superior saem do mesmo enquadramento. Fazer isso
    # por tamanho traria de volta o problema que o `janela_para` ja teve — recortes
    # calibrados numa arte e aplicados a outra.
    arte = crescer_figura(arte, FIGURA_OCUPA, fr)
    arte = recuar_card(arte)
    print(f"[icones] card recuado para {CARD_OCUPA * 100:.0f}% do quadro "
          f"(canto {CARD_RAIO * 100:.0f}%) — para o icone nao pesar mais que os vizinhos")

    SAIDA.mkdir(parents=True, exist_ok=True)
    mestre = SAIDA / "oficina_mestre.png"
    arte.save(mestre)

    def na_medida(t):
        """A arte no tamanho `t`, com o enquadramento que aquele tamanho aguenta."""
        cx, cy, f = janela_para(t)
        lado = int(round(L_arte * f))
        x = max(0, min(int(round(L_arte * cx - lado / 2)), L_arte - lado))
        y = max(0, min(int(round(L_arte * cy - lado / 2)), L_arte - lado))
        peca = arte.crop((x, y, x + lado, y + lado)) if f < 1.0 else arte
        # Os cantos sao redesenhados no recorte: a curva da arte original ficou de
        # fora quando a janela fechou, e sem isto o icone pequeno sairia quadrado.
        if f < 1.0:
            peca = peca.copy()
            peca.putalpha(mascara_arredondada(lado, fr * lado))
        return peca.resize((t, t), Image.LANCZOS)

    for t in TAMANHOS_PNG:
        na_medida(t).save(SAIDA / f"oficina_{t}.png")

    # ⚠️ O .ico e montado com as imagens JA reduzidas por nos. Entregar so a de 1024
    # e deixar o `save` reduzir sozinho piora os tamanhos pequenos — que sao
    # justamente os que a pessoa ve o dia inteiro na barra de tarefas, e desfaria o
    # enquadramento por tamanho.
    quadros = [na_medida(t) for t in TAMANHOS_ICO]
    ico = SAIDA / "oficina.ico"
    quadros[-1].save(ico, format="ICO",
                     sizes=[(t, t) for t in TAMANHOS_ICO],
                     append_images=quadros[:-1])

    # Os tiles do Windows NAO sao quadrados cheios: o sistema desenha o icone dentro
    # de um retangulo com folga. Sem a folga, o desenho encosta na borda do tile.
    for nome, (lx, ly), folga in [("oficina_70x70.png", (70, 70), 0.10),
                                  ("oficina_150x150.png", (150, 150), 0.16)]:
        tile = Image.new("RGBA", (lx, ly), (0, 0, 0, 0))
        interno = int(min(lx, ly) * (1 - 2 * folga))
        peca = na_medida(interno)
        tile.paste(peca, ((lx - interno) // 2, (ly - interno) // 2), peca)
        tile.save(SAIDA / nome)

    # O icone da BARRA SUPERIOR do editor, que e o unico que a pessoa ve enquanto
    # trabalha — e que ficou de fora ate 06/09/2026.
    #
    # Ele nao vem do .exe nem do .ico: o workbench o desenha por CSS, a partir de
    # `src/vs/workbench/browser/media/code-icon.svg`. Trocar so o executavel deixa a
    # logo certa na barra de tarefas e no instalador, e o desenho do VS Code no canto
    # superior esquerdo da janela aberta. Foi exatamente o que aconteceu, e foi o dono
    # do projeto quem viu — olhando a tela, nao o log.
    #
    # Por que um SVG com PNG embutido, e nao um SVG de verdade: a arte de origem e um
    # PNG (foi ele quem a mandou assim). Gravar o PNG cru com extensao .svg NAO
    # funciona — o CSS o carrega como imagem SVG e nada aparece. Um `<image>` com o
    # PNG em base64 e SVG valido, renderiza em qualquer tamanho e nao depende de
    # vetorizar arte que nao e vetorial.
    from base64 import b64encode
    lado_svg = 128  # o icone e desenhado com ~20px; 128 cobre tela HiDPI sem inflar o CSS
    png_svg = SAIDA / f"oficina_{lado_svg}.png"
    dados = b64encode(png_svg.read_bytes()).decode("ascii")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {lado_svg} {lado_svg}" width="{lado_svg}" height="{lado_svg}">'
        f'<image width="{lado_svg}" height="{lado_svg}" '
        f'xlink:href="data:image/png;base64,{dados}"/>'
        f'</svg>'
    )
    alvo_svg = SAIDA / "oficina.svg"
    alvo_svg.write_text(svg, encoding="utf-8")
    # Prova, e nao "ok" impresso: o arquivo tem que ser SVG e trazer a arte dentro.
    conferido = alvo_svg.read_text(encoding="utf-8")
    assert conferido.startswith("<svg") and conferido.rstrip().endswith("</svg>"), \
        "o oficina.svg nao saiu como SVG"
    assert "data:image/png;base64," in conferido and len(dados) > 1000, \
        "o oficina.svg saiu sem a arte embutida"

    gerados = sorted(p.name for p in SAIDA.iterdir())
    print(f"gerados {len(gerados)} arquivos em {SAIDA}:")
    for g in gerados:
        print("  " + g)

    assert ico.exists() and ico.stat().st_size > 0, "o .ico nao foi gravado"
    assert (SAIDA / "oficina_16.png").exists(), "faltou o menor tamanho"
    assert arte.getchannel("A").getextrema()[0] == 0, "a mascara nao deixou canto transparente"
    print("OK")


if __name__ == "__main__":
    main()
