// CONECTAR AO GITHUB — o comando que explica antes e chama o único caminho de entrada que funciona.
//
// O editor já traz o módulo de conta do GitHub, mas com o esquema de endereço deste programa o
// GitHub não devolve a pessoa ao editor depois de entrar, e o programa não tem segredo de cliente.
// Sobra o CÓDIGO DE DISPOSITIVO: o editor mostra um código, a pessoa o cola numa página do GitHub no
// navegador e autoriza. Sem aviso, esse fluxo aparece como uma janela em inglês com um código solto
// — e era isso que a pessoa via quando o login disparava sozinho. Aqui a pessoa é avisada, em
// português, do que vai acontecer, e só então o fluxo começa.
//
// Os ESCOPOS são os mesmos que a extensão do GitHub pede para clonar e publicar: assim a sessão
// criada aqui é a mesma que ela reaproveita, e a pessoa entra uma vez só.
//
// ⚠️ Empurrar e puxar NÃO passam por esta sessão: a autenticação do Git pela conta do GitHub fica
// desligada no produto (ela insistia em pedir login sozinha). O Git usa o gerenciador de credenciais
// dele. O texto diz isso, para ninguém achar que conectou uma coisa e ligou outra.
//
// Sem `require('vscode')` aqui: o módulo recebe a API, e o teste o exercita sem o editor.

const ESCOPOS = Object.freeze(['repo', 'workflow', 'user:email', 'read:user'])
const PROVEDOR = 'github'

const TEXTOS = Object.freeze({
  explicacao: 'Conectar ao GitHub',
  detalhe:
    'Primeiro o editor pergunta, em inglês, se pode entrar usando o GitHub: responda "Allow" (permitir).\n\n' +
    'Depois o GitHub vai mostrar um código de uso único. Copie o código, cole na página do GitHub que abre ' +
    'no navegador e autorize. A página mostra o nome do editor em que a OFICINA se baseia: é por ele ' +
    'que o GitHub reconhece o pedido.\n\n' +
    'Se o código não der certo, o editor pode oferecer outro caminho, também em inglês: criar um token de ' +
    'acesso pessoal ("personal access token") no site do GitHub e colá-lo aqui. Esse token funciona como uma ' +
    'senha da sua conta para programas: guarde-o como guardaria a senha. Na dúvida, recuse e tente o código ' +
    'de novo.\n\n' +
    'Com a conta conectada, clonar e publicar repositórios do GitHub passam a usá-la. Empurrar e ' +
    'puxar continuam pelo Git, que pode pedir a entrada no navegador na primeira vez.',
  continuar: 'Continuar',
  abrirGit: 'Abrir o Git',
  clonar: 'Clonar um repositório',
})

/** O nome da conta, ou `null` sem sessão. Nunca abre fluxo de entrada. */
async function contaConectada(vscode) {
  try {
    const sessao = await vscode.authentication.getSession(PROVEDOR, ESCOPOS, { silent: true })
    return sessao ? (sessao.account && sessao.account.label) || '(sem nome)' : null
  } catch {
    return null
  }
}

/** O motivo da falha, em português, a partir do erro que o módulo de conta devolve. */
function motivoDaFalha(erro) {
  const msg = String((erro && erro.message) || erro || '')
  // "did not consent": a pessoa recusou a janela do próprio editor ("…wants to sign in using GitHub" → Allow).
  // É desistência como o cancelar do código, não falha — e a mensagem crua viria em inglês numa janela de erro.
  if (/cancel|did not consent/i.test(msg)) return { cancelou: true, texto: 'Conexão com o GitHub cancelada. Nada mudou.' }
  if (/no authentication provider|provider .*not found|não há provedor/i.test(msg)) {
    return { cancelou: false, texto: 'Este programa está sem o módulo de conta do GitHub: não há como conectar por aqui.' }
  }
  return { cancelou: false, texto: `Não consegui conectar ao GitHub: ${msg || 'erro sem mensagem'}` }
}

/**
 * O comando. Devolve o que aconteceu (para o teste e para o registro):
 * `ja-conectado` | `desistiu` | `conectado` | `cancelou` | `falhou`.
 */
async function conectarAoGithub(vscode, anotar = () => { }) {
  const ja = await contaConectada(vscode)
  if (ja) {
    const escolha = await vscode.window.showInformationMessage(
      `Já conectado ao GitHub como ${ja}.`, TEXTOS.abrirGit, TEXTOS.clonar)
    await seguir(vscode, escolha)
    return { resultado: 'ja-conectado', conta: ja }
  }
  const ok = await vscode.window.showInformationMessage(TEXTOS.explicacao, { modal: true, detail: TEXTOS.detalhe }, TEXTOS.continuar)
  if (ok !== TEXTOS.continuar) return { resultado: 'desistiu' }
  try {
    const sessao = await vscode.authentication.getSession(PROVEDOR, ESCOPOS, { createIfNone: true })
    const conta = (sessao && sessao.account && sessao.account.label) || '(sem nome)'
    anotar('github.conectou', {})
    const escolha = await vscode.window.showInformationMessage(
      `Conectado ao GitHub como ${conta}.`, TEXTOS.abrirGit, TEXTOS.clonar)
    await seguir(vscode, escolha)
    return { resultado: 'conectado', conta }
  } catch (e) {
    const motivo = motivoDaFalha(e)
    anotar('github.falhou', { cancelou: motivo.cancelou })
    if (motivo.cancelou) await vscode.window.showInformationMessage(motivo.texto)
    else await vscode.window.showErrorMessage(motivo.texto)
    return { resultado: motivo.cancelou ? 'cancelou' : 'falhou', texto: motivo.texto }
  }
}

async function seguir(vscode, escolha) {
  const comando = escolha === TEXTOS.abrirGit ? 'workbench.view.scm' : escolha === TEXTOS.clonar ? 'git.clone' : null
  if (!comando) return
  try { await vscode.commands.executeCommand(comando) } catch { /* o Git pode estar desligado; a mensagem já foi dada */ }
}

module.exports = { conectarAoGithub, contaConectada, motivoDaFalha, ESCOPOS, PROVEDOR, TEXTOS }
