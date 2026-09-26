// RENOMEAR A CONVERSA PELO MENU DA ABA (V30).
//
// Pedido dele, com o print do menu de botão direito na aba: *"Que merda é essa que eu não consigo
// renomear o nome de uma sessão do Claude?"* (26/09/2026).
//
// ⚠️ O COMANDO JÁ EXISTE — O QUE FALTA É O LUGAR. Medido no manifesto da extensão oficial, nas duas
// versões desta máquina (2.1.278, a que roda dentro da OFICINA, e 2.1.282, a do VS Code dele):
//
//   webview/context   → when: webviewId == 'claudeVSCodePanel'          (botão direito DENTRO da conversa)
//   commandPalette    → when: activeWebviewPanelId == 'claudeVSCodePanel'
//
// O menu do print dele é o `editor/title/context`, do próprio editor, e o comando não está lá. Não é
// defeito da OFICINA: é onde eles escolheram registrar. Este módulo é a PONTE — a OFICINA contribui o
// seu próprio item naquele menu e chama o comando deles.
//
// ⚠️ POR QUE UMA PONTE, E NÃO EDITAR O MANIFESTO DELES. A extensão oficial é rebaixada da Open VSX a
// cada build; qualquer coisa escrita dentro dela se perde na próxima. É o mesmo raciocínio que já
// governa `ajustesDaConversaOficial.js`, só que aqui não precisa escrever no arquivo de ninguém.
//
// ⚠️ E SE O COMANDO DELES SUMIR OU MUDAR DE NOME? Aí a ponte AVISA, em vez de não fazer nada. Um
// comando que falha calado é o defeito que o `verHtml.js` nasceu para consertar (o link do chat que
// não abria nada), e a lição já foi paga aqui: nome de comando de terceiro envelhece — foi o
// `/logout` da V26 (regra 31). Por isso se pergunta ao editor se o comando existe ANTES de chamar.

'use strict'

/** O comando da extensão oficial que renomeia a conversa. */
const COMANDO_OFICIAL = 'claude-vscode.renameSessionTab'

/** O que se diz quando o comando deles não está mais lá. */
const AVISO_SEM_COMANDO =
  'Não achei o comando de renomear da extensão do Claude Code (' + COMANDO_OFICIAL + '). ' +
  'Ele pode ter mudado de nome numa atualização dela. Por enquanto: botão direito DENTRO da conversa.'

/**
 * Renomeia a conversa em foco, chamando o comando da extensão oficial.
 *
 * @param vscode a API do editor (chega por parâmetro, como em `telaSkills.js`, para o módulo se
 *   provar em node puro na `ponte.mjs`)
 * @returns `true` se o comando deles foi chamado; `false` se ele não existe (e a pessoa foi avisada)
 */
async function renomearAConversa(vscode) {
  let disponiveis = []
  try {
    disponiveis = await vscode.commands.getCommands(true)
  } catch {
    // Perguntar falhou (não deveria). Segue-se para a tentativa: melhor tentar e errar com a
    // mensagem do editor do que desistir por causa da pergunta.
    disponiveis = []
  }

  if (disponiveis.length && !disponiveis.includes(COMANDO_OFICIAL)) {
    vscode.window.showWarningMessage(AVISO_SEM_COMANDO)
    return false
  }

  try {
    await vscode.commands.executeCommand(COMANDO_OFICIAL)
    return true
  } catch (e) {
    vscode.window.showWarningMessage(AVISO_SEM_COMANDO)
    return false
  }
}

module.exports = { COMANDO_OFICIAL, AVISO_SEM_COMANDO, renomearAConversa }
