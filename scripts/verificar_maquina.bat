@echo off
setlocal enabledelayedexpansion
REM ===================================================================
REM  OFICINA - verificar_maquina.bat
REM  Confere os pre-requisitos ANTES de compilar.
REM
REM  Existe porque a falta de um componente do compilador so aparecia depois de
REM  dez minutos de "npm install", no meio de um log gigante, com um codigo de
REM  erro (MSB8040) que nao diz o que fazer. Falhar em cinco segundos, dizendo o
REM  comando exato, vale muito mais.
REM
REM  Uso: verificar_maquina.bat
REM  Sai com 0 se da para compilar, 1 se falta alguma coisa.
REM ===================================================================
if not defined OFICINA_BUILD set "OFICINA_BUILD=%SystemDrive%\oficina-build"
set "REPO=%~dp0.."
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VSINSTALLER=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vs_installer.exe"
set "FALTA=0"

echo ===================================================
echo OFICINA - conferindo esta maquina
echo pasta de trabalho: %OFICINA_BUILD%
echo ===================================================

REM Truque padrao do cmd para detectar espaco: apagar todos os espacos da
REM variavel e comparar com ela mesma. "find" com aspas nao e confiavel aqui.
if not "%OFICINA_BUILD%"=="%OFICINA_BUILD: =%" (
  echo [FALTA] a pasta de trabalho tem ESPACO no caminho, e o build do nucleo nao aceita.
  echo         Defina OFICINA_BUILD para um caminho sem espaco.
  set "FALTA=1"
) else (
  echo [ok]    caminho de trabalho sem espaco
)

if exist "%OFICINA_BUILD%\node\node.exe" (
  for /f %%v in ('"%OFICINA_BUILD%\node\node.exe" -v') do echo [ok]    node do projeto: %%v
) else (
  echo [FALTA] o node do projeto nao esta em "%OFICINA_BUILD%\node".
  echo         Rode: scripts\preparar_node.bat ^<versao do .nvmrc da tag^>
  set "FALTA=1"
)

git --version >nul 2>&1
if errorlevel 1 (
  echo [FALTA] git nao encontrado no PATH.
  set "FALTA=1"
) else (
  for /f "tokens=3" %%v in ('git --version') do echo [ok]    git %%v
)

python -c "import setuptools" >nul 2>&1
if errorlevel 1 (
  echo [FALTA] python com setuptools. Instale o Python e rode: pip install setuptools
  set "FALTA=1"
) else (
  echo [ok]    python com setuptools
)

if not exist "%VSWHERE%" (
  echo [FALTA] nao achei o Visual Studio Installer. Instale as Build Tools 2022 com C++.
  set "FALTA=1"
) else (
  set "VSDIR="
  for /f "usebackq tokens=*" %%d in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSDIR=%%d"
  if "!VSDIR!"=="" (
    echo [FALTA] Build Tools sem a carga "Desktop development with C++".
    set "FALTA=1"
  ) else (
    echo [ok]    Build Tools com C++ em "!VSDIR!"
    set "TEMSPECTRE=0"
    for /d %%m in ("!VSDIR!\VC\Tools\MSVC\*") do (
      if exist "%%m\lib\spectre" set "TEMSPECTRE=1"
    )
    if "!TEMSPECTRE!"=="1" (
      echo [ok]    bibliotecas com mitigacao de Spectre presentes
    ) else (
      echo [FALTA] as bibliotecas com mitigacao de Spectre NAO estao instaladas.
      echo         Sem elas o "npm install" do nucleo para com o erro MSB8040, e
      echo         nao adianta contornar por propriedade do compilador: o link
      echo         quebra depois procurando delayimp.lib ^(LNK1181^).
      echo.
      echo         Comando para instalar, TUDO NUMA LINHA SO. O Windows vai pedir
      echo         permissao de administrador:
      echo.
      echo         "!VSINSTALLER!" modify --installPath "!VSDIR!" --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --quiet --norestart
      echo.
      set "FALTA=1"
    )
  )
)

REM Espaco em disco: o build do nucleo ocupa varios GB, e esta maquina tambem
REM processa video. Sem esta conferencia, disco cheio aparecia como erro generico
REM do npm install no meio de um build de meia hora, sem dizer a causa.
REM signtool.exe (Windows SDK): o empacotamento do Windows o chama para tirar a
REM assinatura dos binarios nativos antes de reescrever os metadados. Sem ele o
REM build morre com ENOENT no ULTIMO passo, depois de quase 20 minutos. Ele quase
REM nunca esta no PATH; o construir.bat acha e adiciona sozinho. Aqui so avisamos.
REM cmd puro, sem PowerShell: o pipe dentro de "for /f" com crases exige escape que
REM nao sobrevive, e o comando chega ao PowerShell com o acento circunflexo literal.
REM "dir /b /ad /o-n" ja lista as versoes do SDK da mais nova para a mais velha.
set "SIGNOK="
set "SDKBIN=%ProgramFiles(x86)%\Windows Kits\10\bin"
if exist "%SDKBIN%" (
  for /f "delims=" %%D in ('dir /b /ad /o-n "%SDKBIN%" 2^>nul') do (
    if not defined SIGNOK if exist "%SDKBIN%\%%D\x64\signtool.exe" set "SIGNOK=%SDKBIN%\%%D\x64"
  )
)
if defined SIGNOK (
  echo [ok]    signtool do Windows SDK encontrado
) else (
  echo [FALTA] nao achei signtool.exe do Windows SDK ^(Windows Kits 10^).
  echo         O empacotamento falha no ultimo passo sem ele.
  set "FALTA=1"
)

set "LIVRE="
for /f "usebackq" %%G in (`powershell -NoProfile -Command "[math]::Floor((Get-PSDrive ((Split-Path -Qualifier '%OFICINA_BUILD%').TrimEnd(':'))).Free/1GB)"`) do set "LIVRE=%%G"
if not defined LIVRE (
  echo [ok]    espaco em disco: nao consegui medir ^(segue assim mesmo^)
) else (
  if !LIVRE! LSS 25 (
    echo [FALTA] so ha !LIVRE! GB livres no disco da pasta de trabalho.
    echo         Um build completo do nucleo pede bem mais que isso.
    set "FALTA=1"
  ) else (
    echo [ok]    espaco em disco: !LIVRE! GB livres
  )
)

echo ===================================================
if "%FALTA%"=="1" (
  echo FALTA COISA. Resolva os itens marcados [FALTA] antes de compilar.
  endlocal
  exit /b 1
)
echo TUDO PRONTO para compilar.
endlocal
exit /b 0
