# Script PowerShell para resetar banco de dados completamente

Write-Host "🔄 Parando containers..." -ForegroundColor Yellow
docker compose down

Write-Host "🧹 Removendo volumes (banco de dados antigo)..." -ForegroundColor Yellow
docker volume rm escalas-plus_pgdata 2>$null

Write-Host "🚀 Iniciando containers novamente..." -ForegroundColor Yellow
docker compose up -d

Write-Host "⏳ Aguardando PostgreSQL ficar pronto..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "✅ Reset completo! Banco, migrations e seed serão executados automaticamente." -ForegroundColor Green
Write-Host "💡 Dica: Acesse http://localhost:3000 após alguns segundos" -ForegroundColor Cyan
