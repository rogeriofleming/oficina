# Le janelas NATIVAS do Windows que pertencem a uma arvore de processos.
#
# Existe porque o dialogo "Sobre" do editor nao e HTML: o core o monta por
# createNativeAboutDialogDetails + dialog.showMessageBox, ou seja, uma janela do
# proprio Windows. O Playwright dirige o conteudo web e NAO enxerga essa janela --
# entao um teste que so olhe o DOM conclui "nao apareceu dialogo nenhum" quando o
# dialogo esta na tela, na frente de todo mundo.
#
# ⚠️ POR ARVORE DE PROCESSOS, nao por titulo. O processo que o playwright lanca NAO
# possui janela nenhuma (o Electron do VS Code reexecuta a si mesmo); quem desenha e
# um descendente dele. E identificar o dono pelo TITULO nao serve: duas rodadas do
# mesmo teste abrem janelas com o titulo identico, e a revisao final provou, rodando duas
# em paralelo, que as duas resolviam o MESMO processo -- uma reprovava olhando a
# janela da outra. Descendencia de processo e o unico laco que nao confunde
# instancias.
#
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File ler_janelas.ps1 -ProcessoRaiz 1234
# Saida: JSON, uma entrada por janela de topo da arvore, com os textos dela e os
#        dialogos (janelas filhas) separados -- o corpo do dialogo nunca vem
#        misturado com o do editor.

# ⚠️ Com -SoTitulos, devolve APENAS classe e pid de TODAS as janelas da area de
# trabalho -- nunca titulo, nunca conteudo. E o modo de diagnostico ("o dialogo
# apareceu em outro processo?"), e ele nao pode virar uma porta para a tela de quem
# esta no computador: as janelas dos outros programas sao do dono da maquina, nao do
# teste. O titulo saiu daqui de proposito -- nome de documento de terceiro nao
# atravessa este script nem em JSON que ninguem imprime.

param(
  [Parameter(Mandatory = $true)][int]$ProcessoRaiz,
  [switch]$SoTitulos
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$raiz = [System.Windows.Automation.AutomationElement]::RootElement

if ($SoTitulos) {
  $todas = $raiz.FindAll([System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition)
  $lista = @()
  foreach ($j in $todas) {
    $lista += [pscustomobject]@{ classe = $j.Current.ClassName; pid = $j.Current.ProcessId }
  }
  $lista | ConvertTo-Json -Depth 3 -Compress
  exit 0
}

# A arvore de processos a partir da raiz: quem desenha e descendente de quem foi
# lancado, em qualquer profundidade.
$todosProcessos = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId
$filhosPor = @{}
foreach ($p in $todosProcessos) {
  $pai = [int]$p.ParentProcessId
  if (-not $filhosPor.ContainsKey($pai)) { $filhosPor[$pai] = @() }
  $filhosPor[$pai] += [int]$p.ProcessId
}
$daArvore = New-Object 'System.Collections.Generic.HashSet[int]'
$fila = New-Object 'System.Collections.Generic.Queue[int]'
[void]$daArvore.Add($ProcessoRaiz)
$fila.Enqueue($ProcessoRaiz)
while ($fila.Count -gt 0) {
  $atual = $fila.Dequeue()
  if ($filhosPor.ContainsKey($atual)) {
    foreach ($f in $filhosPor[$atual]) {
      if ($daArvore.Add($f)) { $fila.Enqueue($f) }
    }
  }
}

function Textos-De($elemento, $escopo) {
  $saida = @()
  $achados = $elemento.FindAll($escopo, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($a in $achados) {
    $n = $a.Current.Name
    if ($n -and $n.Trim().Length -gt 0) { $saida += $n }
  }
  return $saida
}

$condJanelaFilha = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Window)

$resultado = @()
$deTopo = $raiz.FindAll([System.Windows.Automation.TreeScope]::Children,
  [System.Windows.Automation.Condition]::TrueCondition)
foreach ($j in $deTopo) {
  if (-not $daArvore.Contains([int]$j.Current.ProcessId)) { continue }

  # Os dialogos sao janelas FILHAS. Lidos a parte, para que o corpo do "Sobre" nunca
  # venha misturado com o texto do editor -- foi assim que uma assercao de identidade
  # passou pelo titulo da janela principal em vez de olhar o dialogo.
  $dialogos = @()
  foreach ($d in $j.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condJanelaFilha)) {
    $dialogos += [pscustomobject]@{
      titulo = $d.Current.Name
      classe = $d.Current.ClassName
      textos = @(Textos-De $d ([System.Windows.Automation.TreeScope]::Descendants))
    }
  }

  $resultado += [pscustomobject]@{
    titulo   = $j.Current.Name
    classe   = $j.Current.ClassName
    pid      = $j.Current.ProcessId
    textos   = @(Textos-De $j ([System.Windows.Automation.TreeScope]::Descendants))
    dialogos = $dialogos
  }
}

# ⚠️ Sem virgula na frente. `, $resultado` embrulha a lista dentro de OUTRA lista, e o
# JSON sai [[{...}]] — quem le do outro lado acha "uma janela" cujos campos sao todos
# undefined, e segue calado. Medido: o teste imprimiu "[pid undefined] undefined" e
# ainda assim deu OK. Quem normaliza o caso de um item so e quem le.
$resultado | ConvertTo-Json -Depth 6 -Compress
