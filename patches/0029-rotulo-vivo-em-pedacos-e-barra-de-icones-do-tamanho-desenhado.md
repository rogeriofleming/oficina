# 0029 — o contador de tokens com as cores do painel, e a barra de ícones sem vão

Duas mudanças no mesmo arquivo (`src/vs/workbench/browser/parts/titlebar/titlebarPart.ts`), as duas
pedidas na mesma mensagem (V29, 26/09/2026), com print.

## 1. O rótulo vivo é desenhado em pedaços

**O pedido:** *"o design do contador de tokens meu não tá a mesma coisa do design do contador de
tokens lá de cima na barra superior (...) A principal diferença é um pouco da cor"*. O "meu" é o
painel flutuante de tokens (ferramenta à parte, fora deste repositório).

**Por que precisa do núcleo:** o 0016 escrevia o rótulo com `textContent` — uma cor só para a linha
inteira. Cor por parte exige elementos por parte, e quem desenha é o núcleo.

**O que faz:** `oficinaDesenharEmPedacos()` corta a primeira linha do texto nos separadores que a
extensão já usa (` │ ` entre conversas, dois espaços entre as partes de uma) e dá a cada parte a
cor do painel pelo FORMATO:

| parte | reconhecida por | cor (do `index.html` do painel) |
|---|---|---|
| nome | o resto | `#a8afb9` |
| custo | começa com `$` | `#f2f4f6`, peso 600 |
| tokens | número com `k`/`M`, com ou sem `/` | `#949ba6`, 0,9em |
| separador | ` │ ` | `rgba(255,255,255,0.28)` |

Texto sem separador sai numa parte só, com a cor do nome: o conteúdo de nada que já existia muda.

⚠️ **Os espaços ficam DENTRO do texto, não em margem.** A primeira versão separava as partes com
`margin`, e o `textContent` do rótulo virou `Conversa de teste$?0.0k/0.0k` — é o que leitor de tela e
copiar/colar recebem, e a regressão (V19) reprovou. Agora cada separador é o próprio texto (dois
espaços, ` │ `) e o rótulo usa `white-space: pre`, que mostra os dois espaços sem colapsar. O texto do
elemento é, byte a byte, o que a extensão escreveu.
A dica do mouse (as linhas depois da primeira) não é tocada.

**Custo:** as cores são as do painel, que é escuro. Num tema claro ficariam apagadas; a OFICINA hoje
só tem tema escuro, e isto fica dito para quando tiver outro.

## 2. A barra de ícones fica do tamanho do que ela desenhou

**O pedido:** *"entre os ícones e as barras de limite da sessão tem um espaço enorme"*.

**A causa, medida:** o 0022 dá ao contêiner a largura `fixados × 32 px` e a aplica inline. Mas a
barra não desenha todo fixado (pula o que não tem vista ativa). Medido em 26/09/2026:

| onde | ícones na tela | largura reservada | vão |
|---|---|---|---|
| perfil descartável (`testes/sonda_vao_da_barra.mjs`) | 6 (192 px) | 224 px | 32 px |
| print dele | 8 (~256 px) | ~390 px | ~130 px |

**O que faz:** a reserva continua sendo a largura PEDIDA — é ela que impede a conta de ficar
circular, o motivo de o 0022 usar os fixados. Depois de `barra.layout()`, o contêiner encolhe até a
borda direita do último item com largura. Só encolhe, nunca cresce.

**Custo:** uma leitura de geometria (`getBoundingClientRect`) por item a cada layout da barra de
título. São menos de 15 itens e a barra já faz leituras assim na conta do 0028.

## Aplicado SEM build no instalado (26/09/2026)

O dono pediu para não esperar um build. As duas mudanças foram aplicadas no
`workbench.desktop.main.js` compilado da V28 instalada, por troca de texto ESTRITA (cada trecho
tinha de casar exatamente uma vez). O checksum desse arquivo no `product.json` foi recalculado com a
fórmula provada antes contra o arquivo intacto, para o programa não acusar instalação corrompida.
Os originais ficaram em `<OFICINA_BUILD>\_hotpatch_0029_instalado`. O próximo build traz este patch
pelo caminho normal e sobrescreve o instalado.

## Prova

- `git apply --reverse --check` deste patch contra o clone (estado 0001–0029): casa.
- Tipos: `scripts/conferir_tipos_do_patch.mjs` sobre o acumulado do arquivo → 1 erro, o mesmo
  `import './media/titlebarpart.css'` que aparece **sem** este patch (controle), e o controle
  positivo (`--controle`) acusa o erro plantado. Este patch acrescenta zero erros.
