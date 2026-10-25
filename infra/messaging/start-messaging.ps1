$ErrorActionPreference = "Stop"

$composeDirectory = "/mnt/c/Users/Besco/OneDrive/Escritorio/DESARROLLOS/SistemasDeCitas/infra/messaging"

& wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "systemctl start docker && cd '$composeDirectory' && docker compose up -d && exec sleep infinity"
