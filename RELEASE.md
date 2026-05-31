# Release 1.1.3

One consolidated release for everyone on **1.1.0 – 1.1.2**. It folds in every fix and addition since
1.1.0 plus the full 1.1.0 feature set, so a single download brings any user fully up to date.

From this version on, **the launcher updates itself from GitHub Releases** — no more checking the repo
by hand.

---

## Patch notes since 1.1.0 (1.1.1 → 1.1.3)

**Stability & compatibility**
- **Fixed the white "bloom"/washed-out screen** some users saw in the packaged app. The launcher now
  renders with software compositing (`disableHardwareAcceleration`) and the background canvas paints
  an opaque base every frame, so flaky GPU drivers can no longer smear the UI.
- **Fonts are now bundled** into the app (`Chakra Petch`, `Saira Condensed`, `Spline Sans Mono`).
  The UI no longer depends on Google Fonts / the internet — it looks correct fully offline.
- Removed `backdrop-filter` blur and a blend-mode grain that mis-rendered on some GPUs.
- **Fixed `404` on connect** when the server address was typed **with a trailing slash**
  (`https://host:6969/` → `//launcher/manifest`). The address is now normalized everywhere (trailing
  slashes stripped, protocol added if missing).

**Mod sync reliability**
- **Fixed `socket disconnected before secure TLS connection was established`** when syncing many mods.
  The HTTPS client now uses **keep-alive** (reuses connections instead of a new TLS handshake per
  file), caps concurrent sockets, and **retries** transient drops with exponential backoff. Download
  concurrency tuned to 4.
- The progress bar now shows **overall progress** — `downloaded / total · %` plus the current file
  path — instead of looking per-file.

**New: GitHub auto-update**
- On launch the launcher checks the repo's **latest GitHub release**; if it's newer it shows an
  *Update available* banner with one-click download-and-install. See *Auto-update* below.

---

## Highlights (everything since 1.0.0)

- 🛰 **Recon Console redesign** — living cartographic canvas, deploy compass, audio oscilloscope, boot sequence.
- 🎚 **Ambient soundtrack** (`Convergence.mp3`) — default 12 %, volume/mute **persisted** across launches.
- 🔇 **Auto-mute while the game runs** — and auto-restore on exit (never touches a manual mute).
- 🌐 **Full RU / EN localization** — default Russian, toggle in the title bar & settings, remembered.
- 🧹 **Stale-mod removal** — a mod removed from the server is removed from the client (with heavy safety guards).
- 🛡 **Save-data protection** — generated files (saves/progress) are never overwritten or deleted.
- 📦 **Second mod source** — `LauncherMods` for client-only mods that break the headless server.
- 🗂 **All files sync** — `.json`, asset bundles, nested folders — not just `.dll`/`.cfg`.
- 🚫 **`Fika.Headless.dll` is blocked** — never pushed to or deleted from clients.
- ⚡ **Performance** — SHA-256 hash caching on both ends; the manifest no longer re-hashes everything per request.
- 🔢 **Real SPT version** is detected on the server and shown in the launcher (no longer hard-coded).
- ⬆️ **Self-updating** from GitHub Releases.

---

## Launcher (client)

### Features

- **Ambient audio engine.** `Convergence.mp3` plays through a WebAudio graph. Default volume **12 %**;
  slider + mute in the comms strip and in Settings. **Volume and mute are saved** and restored next
  launch (including when muted). Autoplay unlocks on first interaction.
- **Game-aware auto-mute.** Pressing **DEPLOY** ducks the music to silence; it returns on game exit.
  Transient and never persisted: a mute you set yourself is left muted on exit; a mute we applied is
  lifted.
- **RU / EN localization.** Every string is translated. Default **Russian**; switch with the
  `RU | EN` toggle in the title bar, Settings, or the first-run screen. The choice is saved.
- **GitHub auto-update.** Checks the latest release on start and offers a one-click update.
- **Settings panel** (channel **SYSTEM**): language, ambient volume/mute, connection details, mod
  source, and the **protected-files patterns** editor.

### Redesign — "Recon Console"

A cartographic raid-briefing terminal: an animated topographic iso-line `<canvas>` background with
mouse parallax; a left **dossier rail** (operator card + channel nav `CH.01 DEPLOY` / `CH.02 LOADOUT`);
a morphing center stage; and a bottom **comms strip** with a live **audio oscilloscope**. The launch
control is a circular **insertion core** inside an SVG range-ring compass with a radar sweep. Type:
`Saira Condensed` / `Chakra Petch` / `Spline Sans Mono`. Cold petrol-blue base, single warm amber
accent.

### Mod management

- **A "mod" is a folder or a loose `.dll`.** The list is a **sorted, collapsible folder tree**;
  counts are per-mod, downloads are per-file.
- **Syncs every file** under `BepInEx/plugins` and `BepInEx/patchers` (configs, `.json`, bundles,
  nested folders) — not only `.dll`/`.cfg`.
- **Stale-mod removal** with a **REMOVE** badge during *Provision*. Guards: never on a manifest error
  or empty manifest; only inside `BepInEx/{plugins,patchers}`; path-traversal blocked; empty folders
  pruned; a whole mod is removed only when its entire top-level folder is gone from the server.
- **Save-data protection (3 layers):** structural (files generated inside a still-present mod are
  protected automatically), name patterns (`*savedata*`, `*save_data*`, `*_save.json`, `*.sav`,
  `*.save`, `*playerdata*`, `*userdata*` — editable in Settings), and a manual per-file/per-folder
  toggle. Protected files are never downloaded, overwritten or deleted, and carry a **PROTECTED** badge.
- **Per-mod skip list** (replaces the old hard-coded blacklist); persisted.
- **Parallel downloads with keep-alive + retries** for a fast, resilient sync; **overall** progress.
- **`Fika.Headless.dll` is blocked** — never installed to or deleted from a client.

---

## Server plugin

- **`GET /launcher/version`** — reports the **real SPT version** (resolved by reflection on
  `SPTarkov.Server.Core`, then static version types, then `SPT_Data/Server/configs/core.json`) plus
  mod/protocol versions.
- **`/launcher/manifest`** includes `SptVersion` + `ModVersion` and lists **all files** under the
  configured folders (only OS junk excluded). `Fika.Headless.dll` is excluded.
- **Second mod source — `LauncherMods`.** Files under `LauncherMods/BepInEx/{plugins,patchers}` are
  served alongside the primary set and land in the client's normal `BepInEx/{plugins,patchers}`. Use
  it for client-only mods the headless server must not load. Configurable; absolute paths honored.
- **Performance.** SHA-256 cached by `(mtime, size)` in `hashcache.json`; no per-request re-hash. The
  old `wwwroot` mirror copy was removed — files stream directly from their source folders. A locked
  file no longer fails the whole manifest.
- **SPT compatibility** widened to `^4.0.0` (loads on any 4.x); the reported version is the real one.
- Plugin version → **1.1.0** (unchanged in this client patch series).

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/launcher/ping` | Health check — `{ status, modVersion, timestamp }` |
| GET | `/launcher/version` | SPT version, mod/protocol versions |
| GET | `/launcher/manifest` | Full file manifest with SHA-256 hashes (`SptVersion`, `ModVersion`, `Mods[]`) |
| GET | `/launcher/mods/{folder}/{path}` | Download one file (base64 body) |

### Configuration (`user/mods/SptLauncherServer/config.json`)

| Field | Default | Description |
|-------|---------|-------------|
| `AuthMode` | `"none"` | `"none"` open, or `"basic"` login/password |
| `Username` / `Password` | `""` | Credentials for `basic` mode |
| `PluginsRelPath` | `..\BepInEx\plugins` | Primary server plugins folder |
| `PatchersRelPath` | `..\BepInEx\patchers` | Primary server patchers folder |
| `LauncherModsPluginsRelPath` | `..\LauncherMods\BepInEx\plugins` | Client-only plugins (absolute path OK) |
| `LauncherModsPatchersRelPath` | `..\LauncherMods\BepInEx\patchers` | Client-only patchers (absolute path OK) |

> The launcher now updates itself from GitHub, so the server no longer needs to advertise a download
> URL.

---

## Auto-update (GitHub Releases)

On every launch the launcher calls
`https://api.github.com/repos/Bzden4ik/SptLauncher/releases/latest`, compares the release **tag** with
its own version, and — if the tag is newer — shows an **Update available** banner. Clicking **Update**
downloads the release's installer asset, runs it, and closes the launcher; the installer updates in
place. Clicking **Notes** opens the release page.

**To publish an update everyone receives automatically:**
1. Build the installer: `npm run dist` → `dist/SPT Launcher Setup <version>.exe`.
2. Create a GitHub release whose **tag is the version number** (e.g. `1.1.3`), and mark it as the
   **latest** release (not a pre-release/draft).
3. **Attach the `.exe` installer** as a release asset.

Launchers on older versions will then offer and install it. (If no `.exe` asset is attached, the
banner falls back to opening the release page.)

---

## Upgrading

**Launcher** — install the new `SPT Launcher Setup 1.1.3.exe` (or just click **Update** in-app once
the GitHub release is published). Existing `gamePath` / `serverUrl` / `username` / audio / language
settings are kept. The running version is shown at the bottom of the dossier rail
(`РАЗВЕДКОНСОЛЬ v1.1.3`).

**Server** — no change required for this client patch series. If you haven't built the 1.1.0 plugin
yet: `dotnet build -c Release` (the DLL auto-copies to `user/mods/SptLauncherServer/`); on first start
the new `config.json` keys appear with sensible defaults.

### Notes & limitations

- Save/data protection defaults are intentionally conservative; add custom patterns in Settings or use
  the per-file toggle for unusually named data files.
- GitHub API allows 60 unauthenticated checks/hour per IP — the once-per-launch check is well within it.
- The launcher updates mods and itself, but does not install/update the SPT server.

---

## License

MIT
