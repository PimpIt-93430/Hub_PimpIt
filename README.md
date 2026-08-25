# Pimp It Hub

Nouveau site qui regroupe Shopify, Airtable (pin's + commandes fournisseurs) et l'app Pimp It
(Supabase) dans une seule interface. **Ne touche à aucun des deux sites existants** (le thème
Shopify et le serveur admin Node `Shopify Pimp IT/admin`) — projet entièrement séparé.

## Périmètre actuel (première itération)

- Connexion via un compte Supabase existant (même projet que l'app, `role = 'admin'` recommandé).
- **Lecture seule** sur Shopify (catalogue produits) et Airtable (pin's, commandes fournisseurs) —
  la création/modification arrive dans une itération suivante.
- Lecture (et écriture future) sur Supabase via la RLS déjà en place — pas de clé service role,
  le Hub s'appuie sur les mêmes droits que l'app mobile/web.

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # remplir avec les identifiants réels (jamais commités)
npm run dev
```

Ouvre http://localhost:3000 — redirige vers `/login` si pas connecté.

`/api/health` vérifie que les trois connexions (Shopify, Airtable, Supabase) fonctionnent.

## Où sont les identifiants

Mêmes valeurs que `Shopify Pimp IT/admin/.env` (Shopify, Airtable) et que l'app Pimp It (Supabase
URL + clé anon) — copiées dans `.env.local`, jamais partagées en dur avec les autres projets au
runtime.
