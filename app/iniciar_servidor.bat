@echo off
title Cargo Stats Server
cd /d "%~dp0"
echo [%date% %time%] Iniciando Cargo Stats Server...
node server.js >> server.log 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERRO: Servidor encerrou com codigo %errorlevel%
    pause
)
