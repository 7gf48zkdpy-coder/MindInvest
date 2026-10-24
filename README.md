# Mindinvest

Application d'éducation financière (anciennement Invest26k) : cours, quiz chronométrés, rangs, ligues,
actualités du jour, défis actu et préparation à la certification AMF.

- Site statique sans framework, installable sur iPhone (écran d'accueil).
- Les gros fichiers (`index.html`, `cours.json`, `amf.json`, icônes) sont découpés en morceaux dans `src/` :
  à la mise en ligne, Netlify les remet bout à bout (voir `build.js`).
- `news.json` (actus et défis actu) et `parametres.json` sont à la racine.
- `cloud.js` : connexion à Supabase (compte invité automatique, Google, code par e-mail, mot de passe, double sécurité).
- Base de données : projet Supabase `finly` (partagé avec Finly), table `mi_docs` protégée par RLS.
- Hébergement : Netlify, mis à jour automatiquement à chaque modification de ce dépôt.
- Actualités : remplacer `news.json` suffit à mettre à jour l'onglet Actus et les défis actu.
