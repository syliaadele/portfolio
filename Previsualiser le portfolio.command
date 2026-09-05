#!/usr/bin/env bash
# Double-cliquer ce fichier depuis le Finder pour previsualiser le site.
# Aucune connaissance du Terminal n'est requise : macOS ouvre une fenetre,
# lance le serveur local, et le navigateur s'ouvre tout seul.
cd "$(dirname "${BASH_SOURCE[0]}")"
exec bash tools/serve.sh
