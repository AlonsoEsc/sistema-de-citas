$ErrorActionPreference = "Stop"

# Ruta de esta carpeta traducida a WSL, para no depender de donde este clonado el repo.
$composeDirectory = (& wsl.exe -d Ubuntu-24.04 wslpath -a ($PSScriptRoot -replace "\\", "/")).Trim()

& wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "systemctl start docker && cd '$composeDirectory' && docker compose up -d && exec sleep infinity"
