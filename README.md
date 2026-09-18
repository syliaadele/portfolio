# Portfolio — Sylia Adèle

Site portfolio statique (HTML / CSS / JS) hébergé sur GitHub Pages, accessible sur **syliaadele.com**.

## 📁 Structure
```
portfolio/
├── index.html      # La page d'accueil actuelle — « site en construction »
├── test2/          # Le nouveau site, en cours de construction
│   ├── index.html  # Sa page d'accueil
│   ├── work/       # Une page par projet
│   ├── media/      # Images, en webp, deux tailles par visuel
│   ├── style.css   # Mise en page et composants, pour les deux sites
│   ├── sky.css     # Le ciel et ses nuages
│   ├── work.css    # Les pages de projet
│   ├── sky.js      # Le ciel interactif
│   ├── script.js   # Le défilement, le héros, les interactions
│   ├── hello-glass.js   # Le « hello » en verre, et les figures qui lui succèdent
│   ├── hello-raster.js  # Son repli sans WebGL
│   ├── sun3d.js    # Le soleil, chargé à la demande
│   ├── nav.js      # Le menu
│   └── sound.js    # L'ambiance sonore
├── tools/          # Outils de build ; rien d'ici n'est servi au visiteur
├── CNAME           # Domaine personnalisé (syliaadele.com)
└── .nojekyll       # Désactive le traitement Jekyll de GitHub
```

La page d'accueil et le nouveau site **partagent tout `test2/`** : une
modification dans ce dossier se voit sur les deux, il faut donc les regarder
toutes les deux.

## ✏️ Modifier le site
- **Aperçu local** : `npm run dev`, ou double-clic sur
  « Previsualiser le portfolio.command ».
- **Textes** : dans le `index.html` concerné. Les traductions vivent dans
  l'attribut `data-fr` de chaque élément ; l'anglais est le contenu écrit.
- **Couleurs et rythme** : les variables en haut de `test2/style.css`.
- **Cache** : chaque feuille et chaque script est appelé avec `?v=<horodatage>`.
  Après une modification, remplacer cette valeur partout par une nouvelle,
  sinon les navigateurs continuent de servir l'ancien fichier.

## 🚀 Mise en ligne (GitHub Pages)

### 1. Créer le dépôt
- Sur GitHub : **New repository**, par exemple nommé `portfolio` (public).

### 2. Envoyer les fichiers
Depuis ce dossier, dans le terminal :
```bash
git init
git add .
git commit -m "Mon portfolio"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/portfolio.git
git push -u origin main
```
> Remplace `TON-PSEUDO` par ton nom d'utilisateur GitHub.
> (Tu peux aussi simplement glisser-déposer les fichiers via l'interface web de GitHub.)

### 3. Activer GitHub Pages
Dans le dépôt : **Settings → Pages**
- *Source* : `Deploy from a branch`
- *Branch* : `main` / `/ (root)` → **Save**

### 4. Brancher le domaine syliaadele.com
- Dans **Settings → Pages → Custom domain** : saisis `syliaadele.com` → Save.
- Chez ton fournisseur de domaine (où tu l'as acheté), configure le DNS :

  **Domaine racine (syliaadele.com)** — 4 enregistrements de type `A` :
  ```
  185.199.108.153
  185.199.109.153
  185.199.110.153
  185.199.111.153
  ```
  **Sous-domaine www** — 1 enregistrement `CNAME` :
  ```
  www  →  TON-PSEUDO.github.io
  ```
- Coche **Enforce HTTPS** une fois le certificat généré (quelques minutes à 24 h).

La propagation DNS peut prendre jusqu'à 24 h. Une fois terminée, ton site est en ligne sur https://syliaadele.com 🎉
