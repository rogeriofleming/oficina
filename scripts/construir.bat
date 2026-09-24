@echo off
setlocal enabledelayedexpansion
REM ===================================================================
REM  OFICINA - construir.bat
REM  Compila a OFICINA a partir do nucleo open-source do VS Code.
REM
REM  Uso:
REM    construir.bat                 compila a OFICINA (produto + patches)
REM    construir.bat --puro          compila o upstream SEM alteracao nossa
REM    construir.bat --equipe        aplica por cima uma camada privada
REM    construir.bat --tag 1.136.1   forca uma tag
REM
REM  A pasta de trabalho e OFICINA_BUILD (variavel de ambiente). Sem ela, cai
REM  no disco do sistema. O caminho NAO pode ter espaco: e exigencia do build
REM  do nucleo, nao nossa.
REM
REM  NAO rode isto dentro de uma sessao de chat: e build longo, sai por log.
REM  Comentarios em ASCII puro de proposito: o cmd le este arquivo em cp1252.
REM ===================================================================

if not defined OFICINA_BUILD set "OFICINA_BUILD=%SystemDrive%\oficina-build"
set "RAIZ=%OFICINA_BUILD%"
set "CLONE=%RAIZ%\vscode"
set "NODEDIR=%RAIZ%\node"
REM ATENCAO: "shift", no loop de argumentos abaixo, desloca tambem o %0 -
REM e depois dele "%~dp0" deixa de ser a pasta deste script e passa a ser o
REM diretorio de onde ele foi chamado. Por isso a pasta e guardada AGORA.
set "AQUI=%~dp0"
set "REPO=%~dp0.."
set "MODO=oficina"
set "CONFERIR=1"
set "CAMADA=0"
set "LIMPAR=0"
set "TAG="

:args
if "%~1"=="" goto fim_args
if /i "%~1"=="--puro"   set "MODO=puro"
if /i "%~1"=="--sem-conferir" set "CONFERIR=0"
if /i "%~1"=="--limpar" set "LIMPAR=1"
if /i "%~1"=="--equipe" (
  if defined OFICINA_CAMADA (
    set "CAMADA=!OFICINA_CAMADA!"
  ) else (
    if exist "%REPO%\camada.local.txt" ( set /p CAMADA=<"%REPO%\camada.local.txt" ) else (
      echo ERRO: --equipe pede a variavel OFICINA_CAMADA ou o arquivo camada.local.txt
      exit /b 2
    )
  )
)
if /i "%~1"=="--tag"    ( set "TAG=%~2" & shift )
shift
goto args
:fim_args

if "%TAG%"=="" set /p TAG=<"%REPO%\produto\TAG.txt"

if not exist "%NODEDIR%\node.exe" (
  echo ERRO: nao achei o node em "%NODEDIR%\node.exe".
  echo Rode primeiro: scripts\preparar_node.bat ^<versao do .nvmrc da tag^>
  exit /b 2
)

REM Conferir a maquina ANTES de tudo. Sem isto, a falta de um componente do
REM compilador so aparecia no meio do npm install, dez minutos depois. Quem tiver
REM um motivo para pular usa --sem-conferir.
if "%CONFERIR%"=="0" goto pula_conferencia
call "%AQUI%verificar_maquina.bat"
if errorlevel 1 (
  echo.
  echo Nao vou compilar com pre-requisito faltando: o erro apareceria bem mais
  echo tarde e bem menos claro. Resolva o que esta marcado acima e repita.
  exit /b 4
)
:pula_conferencia

REM Carimbo de tempo por arquivo temporario: "for /f" com aspas aninhadas falha
REM calado e deixa todo build escrevendo no MESMO log, sobrescrevendo o anterior.
REM O nome do arquivo temporario leva %RANDOM%: com nome FIXO, duas rodadas ao mesmo
REM tempo se sobrescrevem, o STAMP sai vazio nas duas e as duas escrevem no MESMO log
REM - exatamente o problema que este carimbo de tempo existe para evitar.
set "STAMPTMP=%TEMP%\oficina_stamp_%RANDOM%%RANDOM%.txt"
"%NODEDIR%\node.exe" -e "console.log(new Date().toISOString().replace(/[:.]/g,'-').slice(0,19))" > "%STAMPTMP%"
set /p STAMP=<"%STAMPTMP%"
del "%STAMPTMP%" 2>nul
if "%STAMP%"=="" set "STAMP=sem-data"

if not exist "%RAIZ%\log" mkdir "%RAIZ%\log"
set "LOG=%RAIZ%\log\build_%MODO%_%STAMP%.txt"

REM O node da pasta vem PRIMEIRO no PATH: a tag exige uma versao exata e nao
REM queremos trocar o node instalado na maquina, que e de quem usa o computador.
set "PATH=%NODEDIR%;%PATH%"

call :log "==================================================="
call :log "OFICINA - build modo=%MODO% tag=%TAG%"
call :log "raiz=%RAIZ%"
call :log "inicio: %DATE% %TIME%"
call :log "==================================================="
>>"%LOG%" node -v 2>&1

if exist "%RAIZ%\Directory.Build.targets" (
  call :log "ATENCAO: existe Directory.Build.targets na raiz de build."
  call :log "         Vale a mesma ressalva do .props abaixo: este build NAO e o padrao."
)
if exist "%RAIZ%\Directory.Build.props" (
  call :log "ATENCAO: existe Directory.Build.props na raiz de build."
  call :log "         Este build NAO e o padrao - alguma propriedade do compilador"
  call :log "         foi alterada nesta maquina. Veja o arquivo antes de confiar."
)

REM O empacotamento do Windows chama signtool.exe (ele REMOVE a assinatura de cada
REM binario nativo antes de o rcedit reescrever os metadados). O signtool vem do
REM Windows SDK e quase nunca esta no PATH: sem ele o build morre com
REM "spawn signtool.exe ENOENT" - depois de 18 minutos, no ultimo passo.
REM Ele existe nesta maquina; so precisa ser encontrado. Pegamos a versao mais nova.
set "SIGNDIR="
set "SDKBIN=%ProgramFiles(x86)%\Windows Kits\10\bin"
if exist "%SDKBIN%" (
  for /f "delims=" %%D in ('dir /b /ad /o-n "%SDKBIN%" 2^>nul') do (
    if not defined SIGNDIR if exist "%SDKBIN%\%%D\x64\signtool.exe" set "SIGNDIR=%SDKBIN%\%%D\x64"
  )
)
if defined SIGNDIR (
  set "PATH=%SIGNDIR%;%PATH%"
  call :log "signtool encontrado e adicionado ao PATH deste build"
) else (
  call :log "ATENCAO: nao achei signtool.exe do Windows SDK."
  call :log "         O empacotamento do Windows vai falhar no ultimo passo."
)

REM ---------- 1. clone / checkout da tag ----------
if not exist "%CLONE%\.git" (
  if exist "%CLONE%\*" (
    call :log "ERRO: a pasta do clone existe, tem conteudo, e nao e um clone git."
    call :log "      Provavelmente sobrou de um clone interrompido. Apague-a e repita."
    echo FALHOU ^(pasta de clone suja^). Log: %LOG%
    endlocal
    exit /b 6
  )
  call :log "[1/6] clonando o upstream na tag %TAG%"
  git clone --filter=blob:none --no-checkout https://github.com/microsoft/vscode.git "%CLONE%" >>"%LOG%" 2>&1
  if errorlevel 1 goto erro
) else (
  call :log "[1/6] clone ja existe - buscando tags"
  REM Unica chamada de rede do script. Sem conferir o codigo, rede caida vira
  REM "tag nao encontrada" no passo seguinte - erro que aponta para o lugar errado.
  git -C "%CLONE%" fetch --tags --filter=blob:none origin >>"%LOG%" 2>&1
  if errorlevel 1 goto erro_rede
)
call :log "[1/6] checkout da tag %TAG%, descartando alteracoes nossas anteriores"
git -C "%CLONE%" checkout -f "tags/%TAG%" >>"%LOG%" 2>&1
if errorlevel 1 goto erro
git -C "%CLONE%" reset --hard >>"%LOG%" 2>&1

REM ---------- tag + SHA ----------
REM Tag e um rotulo movel: ela pode ser remarcada no repositorio de origem, e o
REM checkout traria outro codigo com o mesmo nome, sem nada aqui perceber. O Anexo B
REM do plano pede upstream fixado por tag E SHA - e este e o lugar de cobrar.
REM O arquivo produto\SHA.txt guarda "<tag> <sha>" - o SHA precisa estar AMARRADO a
REM tag, senao toda subida de versao falharia aqui, porque a tag nova aponta para
REM outro commit por definicao. Tag diferente da registrada: anota a nova e segue.
for /f "delims=" %%H in ('git -C "%CLONE%" rev-parse HEAD') do set "SHAREAL=%%H"
set "TAGREG="
set "SHAREG="
if exist "%REPO%\produto\SHA.txt" (
  REM ATENCAO: usebackq + aspas. Sem os dois, o cmd parte o caminho do repositorio
  REM nos espacos ("Program Files", "Meus Projetos"), nao acha o arquivo e pula
  REM CALADO - deixando TAGREG vazia e esta guarda inteira sem efeito. Ficou assim
  REM por 17 builds: "SHA confere" nunca apareceu em log nenhum.
  for /f "usebackq tokens=1,2" %%A in ("%REPO%\produto\SHA.txt") do (
    set "TAGREG=%%A"
    set "SHAREG=%%B"
  )
)
if "!TAGREG!"=="%TAG%" (
  if not "!SHAREG!"=="!SHAREAL!" (
    call :log "ERRO: a tag %TAG% aponta para um commit DIFERENTE do registrado."
    call :log "      registrado: !SHAREG!"
    call :log "      veio agora: !SHAREAL!"
    call :log "      Ou a tag foi remarcada na origem, ou este clone nao e o que se pensa."
    call :log "      Nao vou compilar codigo que nao e o que este projeto declarou."
    echo FALHOU ^(tag remarcada ou clone trocado^). Log: %LOG%
    endlocal
    exit /b 9
  )
  call :log "[1/6] SHA confere com o registrado para a tag %TAG%: !SHAREAL!"
) else (
  > "%REPO%\produto\SHA.txt" echo %TAG% !SHAREAL!
  call :log "[1/6] tag %TAG% ainda nao registrada: SHA !SHAREAL! anotado em produto\SHA.txt"
)
REM Nao usar "git clean -xfd" aqui: apagaria node_modules e mataria o build
REM incremental, que e um dos casos-teste do projeto.

REM ---------- 2. patches ----------
REM VIABILIDADE primeiro, e em TODOS os modos: sao os patches que existem apenas
REM porque a build aberta nao tem as pecas fechadas da Microsoft. Sem eles nem o
REM upstream compila - logo a "linha de base" do projeto e upstream + viabilidade,
REM nao upstream cru. O porque de cada um esta no .md ao lado do .patch.
if exist "%REPO%\patches\viabilidade\*.patch" (
  for %%p in ("%REPO%\patches\viabilidade\*.patch") do (
    call :log "[2/6] viabilidade: %%~nxp"
    git -C "%CLONE%" apply --3way "%%~fp" >>"%LOG%" 2>&1
    if errorlevel 1 goto erro_patch
  )
)
if "%MODO%"=="puro" (
  call :log "[2/6] modo LINHA DE BASE: nenhum patch nosso de produto"
) else (
  call :log "[2/6] aplicando patches"
  if exist "%REPO%\patches\*.patch" (
    for %%p in ("%REPO%\patches\*.patch") do (
      call :log "    patch: %%~nxp"
      git -C "%CLONE%" apply --3way "%%~fp" >>"%LOG%" 2>&1
      if errorlevel 1 goto erro_patch
    )
  ) else (
    call :log "    nenhum patch ainda - nada a aplicar"
  )
)

REM ---------- 3. product.json ----------
if "%MODO%"=="puro" (
  call :log "[3/6] modo PURO: product.json do upstream intocado"
) else (
  call :log "[3/6] mesclando o nosso product.json"
  node "%REPO%\scripts\aplicar_produto.mjs" "%CLONE%" "%REPO%" "%CAMADA%" >>"%LOG%" 2>&1
  if errorlevel 1 goto erro
)

REM ---------- 3c. a logo ----------
REM A arte do produto entra no FONTE antes de compilar, toda vez. Nao adianta
REM trocar os arquivos uma vez: subir_upstream.bat recria a pasta do clone e a
REM identidade voltaria a ser a do Code-OSS sem ninguem notar - regressao que so
REM apareceria com o executavel pronto. Nao roda no modo puro: a linha de base tem
REM que continuar sendo o upstream, inclusive na cara dele.
if not "%MODO%"=="puro" (
  call :log "[3c/6] aplicando a logo da OFICINA no fonte"
  node "%REPO%\scripts\aplicar_icones.mjs" "%CLONE%" >>"%LOG%" 2>&1
  if errorlevel 1 goto erro
)

REM ---------- 3d. o clone volta a ser o upstream ----------
REM ATENCAO: roda em TODOS os modos, --puro inclusive. "git checkout -f" e "reset
REM --hard" governam so o que o git RASTREIA - as extensoes que copiamos para o
REM clone nunca foram rastreadas e ficavam la para sempre, fazendo o --puro
REM embarcar as nossas extensoes e qualquer build carregar a camada privada.
REM O porque completo esta no proprio limpar_extensoes_do_clone.mjs.
call :log "[3d/6] tirando do clone o que nao e do upstream"
node "%REPO%\scripts\limpar_extensoes_do_clone.mjs" "%CLONE%" >>"%LOG%" 2>&1
if errorlevel 1 goto erro

REM ---------- 4. extensoes embutidas ----------
if "%MODO%"=="puro" (
  call :log "[4/6] modo PURO: nenhuma extensao nossa"
) else (
  call :log "[4/6] copiando extensoes embutidas"
  node "%REPO%\scripts\copiar_extensoes.mjs" "%CLONE%" "%REPO%" "%CAMADA%" >>"%LOG%" 2>&1
  if errorlevel 1 goto erro
)

REM ---------- 5. dependencias ----------
REM --limpar apaga node_modules antes. Existe porque um "npm install" que falha no
REM meio deixa modulos nativos pela metade (pasta build/Release criada, .node nunca
REM gerado) e os installs seguintes NAO os refazem: para o npm o pacote ja esta
REM instalado. O build inteiro passa, empacota, e o app morre no primeiro segundo
REM com um erro sobre "bindings file" que nao fala do install de duas horas antes.
if "%LIMPAR%"=="1" (
  call :log "[5/6] --limpar: apagando node_modules para um install do zero"
  if exist "%CLONE%\node_modules" rmdir /s /q "%CLONE%\node_modules"
  if exist "%CLONE%\remote\node_modules" rmdir /s /q "%CLONE%\remote\node_modules"
)
call :log "[5/6] npm install (a primeira vez demora muito mais)"
pushd "%CLONE%"
call npm install >>"%LOG%" 2>&1
if errorlevel 1 ( popd & goto erro_deps )
popd

REM Conferir AQUI que todo modulo nativo virou .node de verdade. Sem isto o defeito
REM so aparece ao abrir o programa, no ponto mais distante possivel da causa.
call :log "[5/6] conferindo os modulos nativos"
"%NODEDIR%\node.exe" "%REPO%\scripts\conferir_nativos.mjs" "%CLONE%" >>"%LOG%" 2>&1
if errorlevel 1 goto erro_nativos

REM ---------- 6. compilar ----------
call :log "[6/6] gulp vscode-win32-x64-min"
pushd "%CLONE%"
call npm run gulp vscode-win32-x64-min >>"%LOG%" 2>&1
if errorlevel 1 ( popd & goto erro )
popd

REM Carimbar a saida com o que ela E. Sem isto nada liga o executavel ao build que
REM acabou de rodar: a pasta tem nome fixo e recebe tanto o --puro quanto a OFICINA,
REM entao um build que falha antes do empacotamento deixa o binario ANTERIOR ali e a
REM fumaca seguinte roda nele, verde. Achado por uma revisao independente em 05/09/2026.
REM ---------- 6b. extensoes de terceiro que NAO embarcamos ----------
REM Decisao de produto, nao patch. ATENCAO: roda DEPOIS de empacotar, na pasta de
REM saida, e nao no clone: apagar extensions/copilot antes do npm install mata o build
REM inteiro com "spawn cmd.exe ENOENT", porque build/npm/dirs.ts roda npm dentro
REM de cada pasta de uma lista fixa que cita essa. O porque completo, e o custo
REM que esta escolha tem, estao no proprio remover_extensoes.mjs.
if not "%MODO%"=="puro" (
  call :log "[6b/6] removendo do produto as extensoes de terceiro"
  node "%REPO%\scripts\remover_extensoes.mjs" "%RAIZ%\VSCode-win32-x64" >>"%LOG%" 2>&1
  if errorlevel 1 goto erro
)

"%NODEDIR%\node.exe" "%REPO%\scripts\carimbar_build.mjs" "%RAIZ%\VSCode-win32-x64" "%MODO%" "%TAG%" "%CLONE%" >>"%LOG%" 2>&1
if errorlevel 1 (
  call :log "ERRO: nao consegui carimbar a pasta de saida - os testes vao recusar este build."
  goto erro
)

call :log "==================================================="
call :log "BUILD OK - fim: %DATE% %TIME%"
call :log "saida em %RAIZ%\VSCode-win32-x64"
call :log "==================================================="
echo BUILD OK. Log: %LOG%
endlocal
exit /b 0

:erro_deps
call :log "ERRO ao instalar dependencias."
call :log "Se o log tiver MSB8040, faltam as bibliotecas Spectre das Build Tools:"
call :log "instale o componente C++ x64/x86 Spectre-mitigated libs (v143) e repita."
echo FALHOU (dependencias). Log: %LOG%
endlocal
exit /b 5

:erro_rede
call :log "ERRO ao buscar as tags do upstream (rede? proxy? repositorio movido?)."
call :log "Parei aqui: sem as tags, o checkout diria 'tag nao existe' e apontaria errado."
echo FALHOU ^(rede^). Log: %LOG%
endlocal
exit /b 7

:erro_nativos
call :log "ERRO: faltam modulos nativos compilados (a lista esta acima, no log)."
call :log "Quase sempre e restolho de um install que falhou no meio: o npm considera"
call :log "o pacote instalado e nao o refaz. Rode de novo com --limpar."
echo FALHOU ^(modulos nativos^). Log: %LOG%
endlocal
exit /b 8

:erro_patch
call :log "ERRO: um patch nosso nao aplicou na tag %TAG%."
call :log "Isso significa que o upstream mexeu num trecho que alteramos."
echo FALHOU (patch). Log: %LOG%
endlocal
exit /b 3

:erro
call :log "ERRO no build. As ultimas linhas do log dizem onde."
echo FALHOU. Log: %LOG%
endlocal
exit /b 1

:log
echo %~1
>>"%LOG%" echo %~1
goto :eof
