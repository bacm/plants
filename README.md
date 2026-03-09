# Garden Manager — Ornamentals

Mobile app **for ornamental plants and flowers only** to manage: location, flowering periods, care reminders, and history.

## Installation

1. Copy `.env.model` to `.env`:
   ```bash
   cp .env.model .env
   ```

2. Add your OpenAI API key in `.env`:
   ```
   EXPO_PUBLIC_OPENAI_API_KEY=your_api_key_here
   ```

   Get your API key from [OpenAI Platform](https://platform.openai.com/).

## Running the Project

```bash
npm install
npx expo start
```

- **iOS / Android**: Scan the QR code with Expo Go (recommended, native mobile experience).
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
