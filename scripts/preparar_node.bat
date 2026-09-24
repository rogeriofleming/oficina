@echo off
setlocal
REM ===================================================================
REM  OFICINA - preparar_node.bat
REM  Baixa a versao EXATA de Node que a tag do upstream exige (.nvmrc) para uma
REM  pasta propria, sem trocar o Node instalado no sistema: o computador pode ser
REM  de mais gente, e trocar o Node global quebraria o trabalho dela.
REM
REM  Uso: preparar_node.bat 24.18.0
REM  A pasta de trabalho vem de OFICINA_BUILD; sem ela, usa o disco do sistema.
REM ===================================================================
if not defined OFICINA_BUILD set "OFICINA_BUILD=%SystemDrive%\oficina-build"
set "RAIZ=%OFICINA_BUILD%"
set "VERSAO=%~1"
if "%VERSAO%"=="" (
  echo Uso: preparar_node.bat ^<versao^>   ex: preparar_node.bat 24.18.0
  exit /b 2
)
set "ZIP=%RAIZ%\node-v%VERSAO%-win-x64.zip"
set "PASTA=%RAIZ%\node"

if not exist "%RAIZ%" mkdir "%RAIZ%"
echo Baixando Node v%VERSAO% ...
REM -f (--fail): sem ele, uma pagina de erro HTTP 404 seria BAIXADA como se fosse
REM o zip, e o erro so apareceria dois passos adiante, no Expand-Archive, com uma
REM mensagem que nao aponta a causa. Melhor falhar aqui, onde a causa esta.
curl -fsSL -o "%ZIP%" "https://nodejs.org/dist/v%VERSAO%/node-v%VERSAO%-win-x64.zip"
if errorlevel 1 (
  echo ERRO ao baixar o node v%VERSAO% ^(versao inexistente? rede? proxy?^).
  exit /b 3
)
REM ---------- integridade ----------
REM Este node.exe vira o interpretador de TODO o pipeline de build (gulp e todos os
REM .mjs), rodando com os privilegios de quem compila. Baixar e executar sem conferir
REM o que veio e confiar em cada intermediario do caminho. O nodejs.org publica um
REM SHASUMS256.txt por versao; conferir contra ele custa dois segundos.
REM
REM Declarado, para nao virar falsa seguranca: isto protege contra CDN, cache ou
REM proxy que troquem o arquivo no caminho. NAO protege contra o proprio nodejs.org
REM comprometido, porque a lista de hashes vem da mesma origem. Para isso seria
REM preciso conferir a assinatura PGP do SHASUMS256.txt - fica registrado como o
REM proximo passo, nao feito.
echo Conferindo a integridade do download ...
curl -fsSL -o "%RAIZ%\SHASUMS256.txt" "https://nodejs.org/dist/v%VERSAO%/SHASUMS256.txt"
if errorlevel 1 (
  echo ERRO: nao consegui baixar a lista de hashes oficial. Nao vou executar um
  echo binario que nao pude conferir.
  del "%ZIP%" 2>nul
  exit /b 4
)
powershell -NoProfile -Command "$esperado = (Select-String -Path '%RAIZ%\SHASUMS256.txt' -Pattern 'node-v%VERSAO%-win-x64.zip' | Select-Object -First 1).Line.Split(' ')[0]; $real = (Get-FileHash -Algorithm SHA256 -Path '%ZIP%').Hash.ToLower(); if (-not $esperado) { Write-Output 'SEM HASH NA LISTA'; exit 1 }; if ($esperado -ne $real) { Write-Output ('HASH DIFERENTE: esperado ' + $esperado + ' veio ' + $real); exit 1 }; Write-Output ('hash confere: ' + $real)"
if errorlevel 1 (
  echo ERRO: o arquivo baixado NAO bate com o hash publicado. Nao vou extrair nem
  echo executar nada. Apagando o download.
  del "%ZIP%" 2>nul
  del "%RAIZ%\SHASUMS256.txt" 2>nul
  exit /b 5
)
del "%RAIZ%\SHASUMS256.txt" 2>nul

powershell -NoProfile -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%RAIZ%' -Force"
if errorlevel 1 ( echo ERRO ao extrair. & exit /b 1 )
if exist "%PASTA%" rmdir /s /q "%PASTA%"
move "%RAIZ%\node-v%VERSAO%-win-x64" "%PASTA%" >nul
del "%ZIP%" 2>nul
"%PASTA%\node.exe" -v
echo Node pronto em "%PASTA%".
endlocal
exit /b 0
