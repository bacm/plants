# Garden Manager — Ornementaux

Application mobile **ornementaux uniquement** pour gérer plantes et fleurs : où elles sont, quand elles fleurissent, rappels de soins et historique.

## Lancer le projet

```bash
npm install
npx expo start
```

- **iOS / Android** : scanner le QR code avec Expo Go (recommandé, expérience mobile native).
- **Web** : `npx expo start --web` (stockage SQLite non disponible sur web en l’état).

## Fonctionnalités MVP

- **Catalogue plantes** : ajout/édition, photo, notes, soleil, eau, floraison, couleur, type.
- **Zones** : créer des zones (massifs, bacs…) et y assigner les plantes.
- **Rappels** : rappels récurrents par plante (arrosage, taille, etc.) ; liste « Aujourd’hui / En retard ».
- **Floraison** : mois de floraison ; vue « Ce qui fleurt ce mois ».
- **Historique** : logs de soins et photos par plante.

## Écrans

- **Accueil** : tâches dues, en fleurs ce mois, actions rapides.
- **Zones** : liste des zones, détail avec les plantes.
- **Floraison** : calendrier par mois.
- **Bibliothèque** : recherche et filtres (zone, exposition).
- **Fiche plante** : photos, attributs, rappels, historique, « Enregistrer un soin ».

## Design

- Mode sombre, cartes type glassmorphism, dégradés discrets, typographie lisible.
- Mobile-first, pensé pour une utilisation tactile.

## Stack

- Expo (SDK 55), React Native, Expo Router, SQLite (expo-sqlite), Expo Image Picker, Blur, Linear Gradient.
