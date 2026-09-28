# Garden Manager — Ornamentals

Mobile app **for ornamental plants and flowers only** to manage: location, flowering periods, care reminders, and history.

## Installation

1. Copy `.env.model` to `.env`:

   ```bash
   cp .env.model .env
   ```

2. Set `EXPO_PUBLIC_PLANT_API_URL` in `.env` to point at the plant search
   server, then start that server — see [`server/README.md`](server/README.md)
   for setup and how to run it. The OpenAI key goes only in the server's
   environment, never in the app's `.env`.

## Running the Project

```bash
npm install
npx expo start
```

- **iOS / Android**: Scan the QR code with Expo Go (recommended, native mobile experience).
- **Install on your iPhone** (Release build, keeps your data): see [`docs/DEPLOY-IPHONE.md`](docs/DEPLOY-IPHONE.md).
- **Web**: `npx expo start --web` (SQLite storage not available on web as is).

## MVP Features

- **Plant Catalog**: Add/edit, photo, notes, sun, water, flowering, color, type.
- **Zones**: Create zones (beds, containers…) and assign plants to them.
- **Reminders**: Recurring reminders per plant (watering, pruning, etc.); "Today / Overdue" list.
- **Flowering**: Flowering months; "What's blooming this month" view.
- **History**: Care logs and photos per plant.

## Screens

- **Home**: Due tasks, blooming this month, quick actions.
- **Zones**: List of zones, detail with plants.
- **Flowering**: Calendar by month.
- **Library**: Search and filters (zone, exposure).
- **Plant Detail**: Photos, attributes, reminders, history, "Log Care".

## Design

- Dark mode, glassmorphism cards, subtle gradients, readable typography.
- Mobile-first, designed for touch use.

## Stack

- Expo (SDK 55), React Native, Expo Router, SQLite (expo-sqlite), Expo Image Picker, Blur, Linear Gradient.
