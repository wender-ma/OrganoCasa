#!/usr/bin/env bash
# ==============================================================================
# ORGANOCASA - SCRIPT DE AUTOMAÇÃO DE COMMIT, PUSH & DEPLOY
# ==============================================================================
# Executa validação de tipos, build de produção, commit automático, push para
# o GitHub e deploy para o Vercel.
# ==============================================================================

set -e

echo "🚀 [1/4] Validando TypeScript e gerando Build de Produção..."
npm run build

echo "📦 [2/4] Verificando alterações no Git..."
git add .

COMMIT_MSG="${1:-feat: atualização automática do OrganoCasa ($(date '+%Y-%m-%d %H:%M:%S'))}"

if git diff-index --quiet HEAD --; then
  echo "ℹ️ Nenhuma alteração pendente para commit."
else
  echo "💾 [3/4] Criando commit: '$COMMIT_MSG'..."
  git commit -m "$COMMIT_MSG"
fi

echo "🌐 [4/4] Enviando para o GitHub (Push)..."
git push origin main

echo ""
echo "=============================================================================="
echo "✅ Sucesso! Código enviado para o GitHub (main)."
echo "📡 O GitHub Actions e a Vercel iniciarão a publicação automática em instantes!"
echo "=============================================================================="
