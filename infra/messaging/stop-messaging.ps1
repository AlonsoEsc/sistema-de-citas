$ErrorActionPreference = "Stop"

$composeDirectory = "/mnt/c/Users/Besco/OneDrive/Escritorio/DESARROLLOS/SistemasDeCitas/infra/messaging"

& wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "cd '$composeDirectory' && docker compose down"
& wsl.exe --terminate Ubuntu-24.04
