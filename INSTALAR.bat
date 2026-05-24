@echo off
chcp 1252 > nul
setlocal enabledelayedexpansion

REM Detectar caminho atual
set "SCRIPT_PATH=%~dp0"
set "PROJECT_PATH=!SCRIPT_PATH:~0,-1!"

echo ===============================================
echo Dona Menina Beauty Bar - Instalacao v1.3
echo ===============================================
echo.
echo Pasta do projeto: !PROJECT_PATH!
echo.

REM Verificar se as pastas existem
if not exist "!PROJECT_PATH!\backend\" (
    echo ERRO: Pasta backend nao encontrada em:
    echo !PROJECT_PATH!\backend\
    echo.
    echo Verifique se extraiu o ZIP corretamente.
    pause
    exit /b 1
)

if not exist "!PROJECT_PATH!\frontend\" (
    echo ERRO: Pasta frontend nao encontrada em:
    echo !PROJECT_PATH!\frontend\
    echo.
    pause
    exit /b 1
)

echo Pastas detectadas corretamente!
echo.

REM Instalar dependencias do backend
echo Instalando dependencias do backend...
cd /d "!PROJECT_PATH!\backend"
if errorlevel 1 (
    echo ERRO: Nao conseguiu acessar pasta backend
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias do backend
    pause
    exit /b 1
)

REM Instalar dependencias do frontend
echo.
echo Instalando dependencias do frontend...
cd /d "!PROJECT_PATH!\frontend"
if errorlevel 1 (
    echo ERRO: Nao conseguiu acessar pasta frontend
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias do frontend
    pause
    exit /b 1
)

echo.
echo ===============================================
echo Instalacao concluida com sucesso!
echo ===============================================
echo.
echo Proximos passos:
echo 1. Abra: scripts\Abrir Dona Menina.bat
echo 2. Aguarde 10 segundos
echo 3. O app abriu em http://localhost:3000
echo.
pause
