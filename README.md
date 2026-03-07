# SptLauncherServer

Server-side plugin for SPT (Single Player Tarkov) that exposes HTTP endpoints for the SPT Launcher client.
The plugin scans BepInEx mod folders, builds a file manifest with SHA-256 checksums, and serves mod files for download.

---

## Repository structure

```
SptLauncherServer/          — C# SPT server plugin (.NET 9)
  LauncherServerModule.cs   — Plugin entry point, logs registered endpoints on load
  ModMetadata.cs            — Plugin metadata (version, SPT compatibility range)
  Models/Models.cs          — Shared data models: ModEntry, ModManifest, LauncherConfig
  Routes/
    LauncherManifestRouter.cs — GET /launcher/ping, GET /launcher/manifest
    LauncherDownloadRouter.cs — GET /launcher/mods/:folder/:file
  SptLauncherServer.csproj
  SptLauncherServer.sln

SptLauncher/                — Electron + React launcher application
  src/
    main/index.ts           — Electron main process, all IPC handlers
    preload/index.ts        — contextBridge, exposes window.api to renderer
    shared/types.ts         — Shared TypeScript types
    renderer/src/
      App.tsx               — Screen router: setup / sync / main
      screens/
        SetupScreen.tsx     — Initial configuration (game path, server URL, profile)
        SyncScreen.tsx      — Mod sync UI: diff, progress, download
        MainScreen.tsx      — Game launch screen
      styles/global.css     — Design system, Tarkov-inspired dark theme
      types/global.d.ts     — Window.api type declarations
  resources/
    icon.ico                — Application icon (all sizes)
  package.json
  electron.vite.config.ts
```

---

## Server plugin

### Requirements

- SPT 4.x (tested against ~4.0.0)
- .NET 9 SDK (for building from source)

### How it works

On every `GET /launcher/manifest` request the plugin:

1. Walks `BepInEx/plugins/` and `BepInEx/patchers/` (paths are configurable)
2. Collects all `.dll` and `.cfg` files recursively, including subdirectories
3. Computes SHA-256 for each file
4. Returns a JSON manifest and syncs the files into its own `wwwroot/mods/` folder

File downloads are served from `wwwroot/mods/` as base64-encoded response bodies
via `GET /launcher/mods/{plugins|patchers}/{relative/path/to/file.dll}`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/launcher/ping` | Server health check, returns `{ status: "ok", timestamp }` |
| GET | `/launcher/manifest` | Full mod manifest with SHA-256 hashes |
| GET | `/launcher/mods/:folder/:file` | Download a single mod file (base64 body) |

### Installation

1. Build the project: in Visual Studio open `SptLauncherServer.sln`, set configuration to **Release**, build.
   The post-build step automatically copies the DLL to `user/mods/SptLauncherServer/`.
2. Or copy `SptLauncherServer.dll` manually to `<SPT root>/user/mods/SptLauncherServer/`.
3. Start the SPT server. On load you will see in the console:

```
[SptLauncherServer] Loaded.
[SptLauncherServer] Endpoint: GET /launcher/manifest
[SptLauncherServer] Files at:  /mods/plugins/<file.dll>
[SptLauncherServer] Files at:  /mods/patchers/<file.dll>
```

### Configuration

On first run the plugin creates `user/mods/SptLauncherServer/config.json`:

```json
{
  "AuthMode": "none",
  "Username": "",
  "Password": "",
  "PluginsRelPath": "..\\BepInEx\\plugins",
  "PatchersRelPath": "..\\BepInEx\\patchers"
}
```

| Field | Description |
|-------|-------------|
| `AuthMode` | `"none"` — open access, `"basic"` — require login/password |
| `Username` / `Password` | Credentials for `basic` mode |
| `PluginsRelPath` | Path to BepInEx plugins folder relative to SPT root |
| `PatchersRelPath` | Path to BepInEx patchers folder relative to SPT root |

---

## Launcher client

### Requirements

- Node.js 18+
- npm

### Install and run (development)

```bat
cd SptLauncher
npm install
npm run dev
```

### Build installer

```bat
cd SptLauncher
npm run dist
```

Output: `SptLauncher/dist/SPT Launcher Setup 1.0.0.exe`

### How sync works

1. Launcher fetches `GET /launcher/manifest` — receives list of all mod files with SHA-256 hashes
2. Launcher scans local `BepInEx/plugins/` and `BepInEx/patchers/` — computes SHA-256 for every local file
3. Compares the two lists:
   - File missing locally — `missing`, will be downloaded
   - SHA-256 differs — `outdated`, will be re-downloaded
   - SHA-256 matches — `ok`, skipped
4. Downloads only the changed or missing files
5. Files in the blacklist (`Fika.Headless.dll`, `QuestMod.dll`) are never touched

### Game launch

The launcher authenticates against the SPT server (`/launcher/profile/login`),
retrieves the backend URL (`/launcher/server/connect`), then starts the game with:

```
EscapeFromTarkov.exe -force-gfx-jobs native -token=<sessionId> -config={'BackendUrl':'...','Version':'live'}
```

This matches the behaviour of the official `SPT.Launcher.exe`.

---

## License

MIT
