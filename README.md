# Portfolio — Sylia Adèle

Site portfolio statique (HTML / CSS / JS) hébergé sur GitHub Pages, accessible sur **syliaadele.com**.

## 📁 Structure
```
portfolio/
├── index.html      # Contenu du site
├── style.css       # Styles (couleurs, mise en page)
├── script.js       # Menu mobile + animations
├── CNAME           # Domaine personnalisé (syliaadele.com)
└── .nojekyll       # Désactive le traitement Jekyll de GitHub
```

## ✏️ Personnaliser le contenu
Tout se modifie dans `index.html` :
- **Textes** : présentation, projets, compétences, contact.
- **Email** : remplace `contact@syliaadele.com` (balise `<a href="mailto:...">`).
- **Réseaux sociaux** : remplace les `href="#"` de la section Contact par tes vrais liens.
- **Ta photo** : ajoute ton image dans le dossier (ex. `photo.jpg`) puis remplace le bloc
  `<div class="photo-placeholder">SA</div>` par `<img src="photo.jpg" alt="Sylia Adèle" class="about-photo-img" />`.
- **Couleurs** : variables `--c1`, `--c2`, `--c3`, `--c4` en haut de `style.css`.

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
