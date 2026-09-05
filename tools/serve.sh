#!/usr/bin/env bash
# Previsualisation locale du portfolio.
#
# Deux modes, choisis automatiquement :
#   - live-server si Node est disponible : la page se rafraichit toute seule
#     a chaque sauvegarde (rechargement complet, pas de HMR : le site n'a ni
#     bundler ni modules ES, donc les animations repartent de zero).
#   - python3 sinon : serveur statique simple, rafraichir avec Cmd+R.
#
# Dans les deux cas le rendu est fidele a GitHub Pages : chemins absolus,
# types MIME et requetes ?v=... se comportent comme en production.
set -euo pipefail

PORT="${1:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Lance par un double-clic depuis le Finder, ce script n'est pas un shell de
# connexion : ~/.bash_profile n'est pas lu. On ajoute Node explicitement.
[ -d "$HOME/.local/node/bin" ] && PATH="$HOME/.local/node/bin:$PATH"

cd "$ROOT"

if command -v npx >/dev/null 2>&1; then
  echo "Portfolio sur http://localhost:${PORT} — rechargement automatique actif"
  echo "(Ctrl+C pour arreter)"
  exec npx --yes live-server --port="${PORT}" --quiet
fi

echo "Portfolio sur http://localhost:${PORT} — rafraichir avec Cmd+R"
echo "(Ctrl+C pour arreter)"
open "http://localhost:${PORT}" 2>/dev/null || true
exec python3 -m http.server "${PORT}" --directory "${ROOT}"
