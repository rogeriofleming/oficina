@echo off
setlocal enabledelayedexpansion
REM ===================================================================
REM  OFICINA - empacotar.bat
REM  Gera o instalador Windows (Inno Setup) a partir do que JA ESTA compilado
REM  em OFICINA_BUILD\VSCode-win32-x64 (ou seja: rode construir.bat ANTES).
REM
REM  Uso:
REM    scripts\construir.bat            (edicao neutra)
REM    scripts\empacotar.bat            -> dist\OficinaSetup.exe
REM
REM    scripts\construir.bat --equipe   (edicao da equipe)
REM    scripts\empacotar.bat --equipe   -> dist\OficinaEquipeSetup.exe
REM
REM  Este script NAO recompila nada: ele so empacota o que ja esta na pasta de
REM  saida. Se a pasta tiver a edicao ERRADA (neutra quando voce queria equipe,
REM  ou vice-versa), o instalador sai errado sem aviso - por isso ele confere o
REM  carimbo (oficina-build.json) e imprime o que vai empacotar ANTES de rodar.
REM
REM  Empacotar e um passo CARO (o gulp de setup demora minutos por cima do build ja
REM  feito) - reserve para quando quiser um instalador de verdade, nao a cada mudanca
REM  pequena. NAO rode isto dentro de uma sessao de chat: sai por log.
REM  Comentarios em ASCII puro de proposito: o cmd le este arquivo em cp1252.
REM ===================================================================

if not defined OFICINA_BUILD set "OFICINA_BUILD=%SystemDrive%\oficina-build"
set "RAIZ=%OFICINA_BUILD%"
set "CLONE=%RAIZ%\vscode"
set "NODEDIR=%RAIZ%\node"
set "SAIDA=%RAIZ%\VSCode-win32-x64"
set "DIST=%RAIZ%\dist"
set "AQUI=%~dp0"
set "REPO=%~dp0.."
set "EQUIPE=0"
set "NOMEEXE=OficinaSetup.exe"

:args
if "%~1"=="" goto fim_args
if /i "%~1"=="--equipe" ( set "EQUIPE=1" & set "NOMEEXE=OficinaEquipeSetup.exe" )
shift
goto args
:fim_args

if not exist "%NODEDIR%\node.exe" (
  echo ERRO: nao achei o node em "%NODEDIR%\node.exe". Rode preparar_node.bat primeiro.
  exit /b 2
)
if not exist "%SAIDA%\OFICINA.exe" (
  echo ERRO: nao achei "%SAIDA%\OFICINA.exe". Rode scripts\construir.bat antes de empacotar.
  exit /b 2
)
if not exist "%SAIDA%\oficina-build.json" (
  echo ERRO: "%SAIDA%\oficina-build.json" nao existe - a pasta de saida nao foi carimbada.
  echo Isto significa que ninguem confirma de que build ela realmente e. Rode construir.bat.
  exit /b 2
)

set "PATH=%NODEDIR%;%PATH%"

REM signtool: so importa se algum dia ligarmos --sign no gulp (F0.6 = nao pago hoje).
REM Mesmo sem precisar, deixamos no PATH por igualdade com o construir.bat.
set "SDKBIN=%ProgramFiles(x86)%\Windows Kits\10\bin"
if exist "%SDKBIN%" (
  for /f "delims=" %%D in ('dir /b /ad /o-n "%SDKBIN%" 2^>nul') do (
    if not defined SIGNDIR if exist "%SDKBIN%\%%D\x64\signtool.exe" set "SIGNDIR=%SDKBIN%\%%D\x64"
  )
)
if defined SIGNDIR set "PATH=%SIGNDIR%;%PATH%"

set "STAMPTMP=%TEMP%\oficina_pkg_stamp_%RANDOM%%RANDOM%.txt"
"%NODEDIR%\node.exe" -e "console.log(new Date().toISOString().replace(/[:.]/g,'-').slice(0,19))" > "%STAMPTMP%"
set /p STAMP=<"%STAMPTMP%"
del "%STAMPTMP%" 2>nul
if "%STAMP%"=="" set "STAMP=sem-data"
if not exist "%RAIZ%\log" mkdir "%RAIZ%\log"
set "LOG=%RAIZ%\log\empacotar_%STAMP%.txt"

call :log "==================================================="
call :log "OFICINA - empacotar equipe=%EQUIPE% saida=%NOMEEXE%"
call :log "saida compilada: %SAIDA%"
call :log "inicio: %DATE% %TIME%"
call :log "==================================================="
type "%SAIDA%\oficina-build.json" >> "%LOG%"

REM ---------- 0. a EDICAO compilada e a que foi pedida? ----------
REM Sem esta conferencia, "--equipe" sobre um build neutro gerava um instalador com nome de
REM equipe e SEM canal de atualizacao, calado. A edicao vem do product.json que foi para
REM DENTRO do build (carimbo), nunca da flag.
if "%EQUIPE%"=="1" ( set "EDICAO=equipe" ) else ( set "EDICAO=neutra" )
"%NODEDIR%\node.exe" "%REPO%\scripts\conferir_edicao.mjs" "%SAIDA%" "%EDICAO%" >>"%LOG%" 2>&1
if errorlevel 1 (
  call :log "ERRO: a edicao compilada nao e a que voce pediu - veja o log. Abortei de proposito."
  goto erro
)

REM ---------- 1. gulp: gera o instalador Inno (task oficial do upstream) ----------
REM vscode-win32-x64-user-setup = instalador POR USUARIO, sem prompt de admin -
REM baixou, abriu, instalou, sem pedir pasta nem senha de administrador.
call :log "[1/2] gulp vscode-win32-x64-user-setup"
pushd "%CLONE%"
call npm run gulp vscode-win32-x64-user-setup >>"%LOG%" 2>&1
if errorlevel 1 ( popd & goto erro )
popd

set "GERADO=%CLONE%\.build\win32-x64\user-setup\VSCodeSetup.exe"
if not exist "%GERADO%" (
  call :log "ERRO: gulp terminou sem erro mas nao achei %GERADO%"
  goto erro
)

REM ---------- 2. renomear pro nome da OFICINA e mover para dist\ ----------
if not exist "%DIST%" mkdir "%DIST%"
set "ALVO=%DIST%\%NOMEEXE%"
if exist "%ALVO%" del /f /q "%ALVO%"
copy /y "%GERADO%" "%ALVO%" >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: nao consegui copiar para %ALVO%" & goto erro )

REM ---------- 3. hash + tamanho, para o manifesto do liberar.bat ----------
"%NODEDIR%\node.exe" "%REPO%\scripts\gerar_sha256.mjs" "%ALVO%" >>"%LOG%" 2>&1
if errorlevel 1 ( call :log "ERRO: falha ao calcular sha256 de %ALVO%" & goto erro )

call :log "==================================================="
call :log "EMPACOTADO OK: %ALVO%"
call :log "fim: %DATE% %TIME%"
call :log "==================================================="
echo EMPACOTADO OK: %ALVO%
echo Log: %LOG%
endlocal
exit /b 0

:erro
call :log "FALHOU."
echo FALHOU. Veja o log: %LOG%
endlocal
exit /b 1

:log
REM ATENCAO: o redirecionamento vem ANTES do echo de proposito. Escrito como
REM `echo %~1>>"%LOG%"`, o cmd le o ULTIMO CARACTERE da mensagem como numero de handle
REM quando ele e um digito (`1>>` = redireciona o fluxo 1), e a linha chega ao log sem ele.
REM Mordia toda linha terminada em digito - inclusive as de `inicio:`/`fim:` com a hora.
REM Achado por uma revisao independente em 12/09/2026.
echo %~1
>>"%LOG%" echo %~1
exit /b 0
