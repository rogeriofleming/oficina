@echo off
setlocal
REM ===================================================================
REM  OFICINA - subir_upstream.bat
REM  Sobe o nucleo para uma tag nova do upstream, reaplica os patches deste
REM  projeto, recompila e roda a fumaca. E o teste que responde a pergunta que
REM  decide se este fork e mantivel: "a versao nova quebrou o que e nosso?"
REM
REM  Uso: subir_upstream.bat 1.137.0
REM
REM  Nada e publicado aqui. Se tudo passar, grava a tag nova em produto\TAG.txt
REM  e para: quem decide publicar e uma pessoa.
REM ===================================================================
if not defined OFICINA_BUILD set "OFICINA_BUILD=%SystemDrive%\oficina-build"
set "REPO=%~dp0.."
set "NOVA=%~1"
if "%NOVA%"=="" (
  echo Uso: subir_upstream.bat ^<tag^>   ex: subir_upstream.bat 1.137.0
  exit /b 2
)
set /p ATUAL=<"%REPO%\produto\TAG.txt"

echo ===================================================
echo OFICINA - subida de versao:  %ATUAL%  ---^>  %NOVA%
echo ===================================================

call "%~dp0construir.bat" --tag %NOVA%
set "SAIDA=%ERRORLEVEL%"

if "%SAIDA%"=="3" (
  echo.
  echo PAROU: um patch nosso nao aplicou na tag %NOVA%.
  echo Isto NAO e defeito do build: e o aviso de que o upstream mexeu num trecho
  echo que este projeto altera. Veja o log, ache o patch, leia o .md dele e
  echo refaca o patch sobre a tag nova.
  exit /b 3
)
if not "%SAIDA%"=="0" (
  echo.
  echo PAROU: o build falhou na tag %NOVA% ^(codigo %SAIDA%^). Veja o log.
  exit /b %SAIDA%
)

echo.
echo Build da tag %NOVA% ok. Rodando a fumaca...
"%OFICINA_BUILD%\node\node.exe" "%REPO%\testes\fumaca.mjs"
if errorlevel 1 (
  echo.
  echo PAROU: compilou, mas a fumaca reprovou na tag %NOVA%.
  echo A tag ANTIGA continua declarada em produto\TAG.txt de proposito.
  exit /b 4
)

REM A tag e gravada pelo node, nao por `echo^|set /p`: com redirecionamento, o cmd
REM corta a linha no pipe antes de resolver o `>`, e quem escreve no arquivo e um
REM `echo` SEM argumento - que grava "ECHO esta ativado." no lugar da tag. Aconteceu
REM no primeiro ensaio real de subida (05/09/2026); quem pegou foi a regressao.
"%OFICINA_BUILD%\node\node.exe" -e "require('fs').writeFileSync(process.argv[1], process.argv[2])" "%REPO%\produto\TAG.txt" "%NOVA%"
if errorlevel 1 (
  echo PAROU: nao consegui gravar a tag nova em produto\TAG.txt.
  exit /b 5
)
REM Conferir o que FICOU escrito, nao o que se mandou escrever.
set /p GRAVADA=<"%REPO%\produto\TAG.txt"
if not "%GRAVADA%"=="%NOVA%" (
  echo PAROU: TAG.txt ficou com "%GRAVADA%" em vez de "%NOVA%".
  exit /b 5
)
echo.
echo ===================================================
echo SUBIDA OK: %ATUAL% ---^> %NOVA%
echo produto\TAG.txt atualizado. Falta commitar e decidir publicar.
echo ===================================================
endlocal
exit /b 0
