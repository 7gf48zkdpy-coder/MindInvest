# Mindinvest — ce qu'il faut savoir

## Installer sur l'iPhone
Ouvrez le lien dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.

## Comptes
- À la première ouverture, chacun est connecté automatiquement en « invité » : la progression est sauvegardée en ligne.
- **Outils → Mon compte** (ou le rond en haut à droite) : **Continuer avec Google**, **code par e-mail** ou **e-mail + mot de passe**.
  La progression d'invité est gardée et rattachée au compte.
- Le compte créateur est le même que sur Finly (même base Supabase).

## À régler une fois dans Supabase (projet `finly`)
- **Authentication → URL Configuration → Redirect URLs** : ajouter l'adresse Netlify de Mindinvest
  (sinon, après Google, on revient sur Finly).
- **Authentication → Sign In / Providers → Google** : activer et coller l'identifiant client Google (commun à Finly et Mindinvest).

## Bon à savoir
- L'IA intégrée était une fonction de claude.ai : l'appli affiche ses textes de secours à la place.
