@echo off
setlocal enabledelayedexpansion
REM ===================================================================
REM  OFICINA - liberar.bat
REM  Publica o instalador que empacotar.bat gerou (rode-o antes).
REM
REM  Uso:
REM    scripts\liberar.bat            edicao NEUTRA (R2 + rascunho de GitHub Release)
REM    scripts\liberar.bat --equipe   edicao EQUIPE (so R2, prefixo equipe/)
REM
REM  Exige as variaveis de ambiente (ver BUILD.md, "publicar uma versao"):
REM    CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, OFICINA_R2_BUCKET
REM  Este .bat NAO sabe de onde elas vem - quem tem infraestrutura propria escreve o
REM  proprio wrapper que as define e chama este arquivo (o repositorio publico nao
REM  conhece nem conta, nem bucket, nem token de ninguem).
REM
REM  NUNCA `wrangler login`: as credenciais sao sempre por token.
REM ===================================================================

if "%CLOUDFLARE_API_TOKEN%"=="" (
  echo ERRO: defina CLOUDFLARE_API_TOKEN antes de chamar este script.
  exit /b 2
)
if "%CLOUDFLARE_ACCOUNT_ID%"=="" (
  echo ERRO: defina CLOUDFLARE_ACCOUNT_ID antes de chamar este script.
  exit /b 2
)
if "%OFICINA_R2_BUCKET%"=="" (
  echo ERRO: defina OFICINA_R2_BUCKET antes de chamar este script.
  exit /b 2
)

node "%~dp0liberar.mjs" %*
exit /b %errorlevel%
