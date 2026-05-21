#!/bin/bash
# Script para resetar banco de dados completamente

echo "🔄 Parando containers..."
docker compose down

echo "🧹 Removendo volumes (banco de dados antigo)..."
docker volume rm escalas-plus_pgdata 2>/dev/null || true

echo "🚀 Iniciando containers novamente..."
docker compose up -d

echo "⏳ Aguardando PostgreSQL ficar pronto..."
sleep 5

echo "✅ Reset completo! Banco, migrations e seed serão executados automaticamente."
echo "💡 Dica: Acesse http://localhost:3000 após alguns segundos"
