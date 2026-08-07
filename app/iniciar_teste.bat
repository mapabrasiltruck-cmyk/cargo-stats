@echo off
title CargoStats - Servidor Local
cd /d "%~dp0"

echo ========================================
echo  CARGO STATS - SERVIDOR LOCAL
echo ========================================
echo.
echo  O servidor vai iniciar na rede local.
echo  Outros dispositivos na mesma rede podem
echo  acessar pelo IP deste computador.
echo.
echo  Pressione Ctrl+C para encerrar.
echo ========================================
echo.

node server.js
