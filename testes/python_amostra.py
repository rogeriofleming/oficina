"""Arquivo de prova para comparar dois servidores de linguagem Python.

Nao e um teste automatico: e o que se abre no editor, dos dois lados, para
comparar o que cada um mostra. Cada bloco abaixo exercita UM recurso, e o
comentario diz o que olhar. Sem isso a comparacao vira opiniao.
"""

from dataclasses import dataclass
from pathlib import Path


# 1. INFERENCIA E DICA DE TIPO EMBUTIDA (inlay hint)
#    Olhar: aparece ": int" ao lado de "total" e "-> int" ao lado da funcao?
def somar(numeros):
    total = 0
    for n in numeros:
        total += n
    return total


# 2. HOVER COM DOCSTRING
#    Olhar: passar o mouse em "somar" mostra a assinatura E o texto abaixo?
def dobrar(valor: int) -> int:
    """Devolve o dobro do valor.

    Args:
        valor: o numero a dobrar.
    """
    return valor * 2


# 3. IR PARA A DEFINICAO DENTRO DA BIBLIOTECA PADRAO (stub)
#    Olhar: F12 em "Path" abre o stub? mostra o codigo ou so o .pyi?
def onde_estou() -> str:
    return str(Path.cwd())


# 4. ESTREITAMENTO DE TIPO (type narrowing)
#    Olhar: dentro do if, o hover em "x" diz "str"? fora dele diz "str | None"?
def tamanho(x: str | None) -> int:
    if x is not None:
        return len(x)
    return 0


# 5. ERRO QUE TEM QUE SER ACUSADO
#    Olhar: sublinha? qual a mensagem? qual a severidade?
def erro_de_tipo() -> int:
    return "isto nao e um int"


# 6. ATRIBUTO QUE NAO EXISTE
#    Olhar: acusa? a mensagem cita o nome parecido?
@dataclass
class Pessoa:
    nome: str
    idade: int


def acessa_errado(p: Pessoa) -> None:
    print(p.nomee)


# 7. COMPLETAR IMPORT AUTOMATICO (auto-import)
#    Olhar: digitar "datetim" e aceitar a sugestao acrescenta o import no topo?
#    (fazer a mao; nao da para deixar escrito no arquivo)


# 8. REFATORACAO: EXTRAIR METODO/VARIAVEL
#    Olhar: selecionar a expressao abaixo e pedir a acao de codigo.
#    Aparece "Extract method"/"Extract variable"? Funciona?
def calcular(a: int, b: int) -> int:
    return (a * 2 + b * 3) - (a * 2 + b * 3) // 2


# 9. DESTAQUE SEMANTICO
#    Olhar: parametro, variavel local, classe e funcao tem cores diferentes?
def pinta(parametro: int) -> int:
    local = parametro + 1
    return local


# 10. ORDENAR/ORGANIZAR IMPORTS
#     Olhar: a acao "Organize imports" existe? de quem ela vem?
