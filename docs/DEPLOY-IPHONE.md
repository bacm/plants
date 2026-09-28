# Installing the app on an iPhone

Two ways to run the app on a phone:

|         | Expo Go                            | Release build (`npm run deploy:iphone`) |
| ------- | ---------------------------------- | --------------------------------------- |
| Setup   | Install Expo Go from the App Store | Xcode + an Apple ID signed into Xcode   |
| Speed   | Instant, reloads on save           | A few minutes per build                 |
| Data    | Separate from the installed app    | The real app and its data               |
| Use for | Trying a change                    | Daily use                               |

## Expo Go (development)

```bash
npx expo start
```

Scan the QR code with the iPhone camera. The phone and the Mac must be on the
same Wi-Fi. All native modules the app uses (camera, SQLite, sharing…) are
included in Expo Go for SDK 55.

## Release build on the phone

### One-time setup

1. Install Xcode, open it once, and sign in: **Xcode → Settings → Accounts**.
2. Connect the iPhone by USB, unlock it, tap **Trust this computer**.
3. On the iPhone: **Settings → Privacy & Security → Developer Mode** → on
   (the phone restarts).

With a free Apple ID the installed app **expires after 7 days** — deploy again
to renew it. A paid Apple Developer account extends this to a year.

### Plant search

`EXPO_PUBLIC_PLANT_API_URL` is frozen into the build. Set it in `.env` before
building:

- until the server is hosted (ticket 019): this Mac's LAN IP, e.g.
  `http://192.168.1.20:8000` (`ipconfig getifaddr en0`), with the server
  running (`server/README.md`) and the phone on the same Wi-Fi;
- once hosted: the server's public URL.

Without it the app works, but plant search says it is not configured.

### Deploy

```bash
npm run deploy:iphone
```

The script checks that an iPhone is reachable and the search URL is usable,
reminds you to back up, then runs `expo prebuild --clean` and
`expo run:ios --configuration Release --device`.

### Keep your garden

- Deploying over the installed app **keeps its data**. Never delete the app
  from the phone to "reinstall cleanly" — that erases every plant and photo.
- Back up before each deploy: **Réglages → Exporter mon jardin** in the app.
  For a version without export, use **Xcode → Window → Devices and Simulators
  → the iPhone → Plants → ⚙︎ → Download Container…**
- The first launch of a new version runs its migrations (for example, copying
  old photos into app storage, ticket 043). Ticket 040 lists what to check on
  the phone afterwards.
