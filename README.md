# Mon Bebebou

Application de suivi bébé construite avec Next.js 14, TypeScript, Tailwind CSS et Supabase.

## Structure du projet

```
mon-bebebou/
├── app/           # Pages et routes (App Router)
├── components/    # Composants réutilisables
├── lib/           # Fonctions utilitaires et client Supabase
└── public/        # Images et assets statiques
```

## Prérequis

- Node.js 18.17 ou supérieur
- Un compte [Supabase](https://supabase.com)

## Installation

```bash
npm install
cp .env.example .env.local
# Renseignez vos clés Supabase dans .env.local
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Variables d'environnement

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de votre projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anonyme publique Supabase |

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production
- `npm run start` — démarrer le serveur de production
- `npm run lint` — vérification ESLint
