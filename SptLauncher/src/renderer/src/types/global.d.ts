interface VersionPayload {
  sptVersion: string
  modVersion: string
  protocolVersion: string
  minLauncherVersion: string
  latestLauncherVersion: string
  launcherDownloadUrl: string | null
  releaseNotesUrl: string | null
}

interface PingResult { ok: boolean; latencyMs: number }

interface WindowApi {
  app: { getVersion(): Promise<string> }
  window: { minimize(): void; maximize(): void; close(): void }
  config: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
  }
  dialog: { pickFolder(): Promise<string | null> }
  shell: { openPath(p: string): Promise<string>; openExternal(u: string): Promise<void> }
  audio: { loadTrack(): Promise<Uint8Array> }
  server: {
    ping(serverUrl: string): Promise<PingResult>
    version(serverUrl: string): Promise<VersionPayload | null>
  }
  game: {
    launch(gamePath: string, serverUrl: string, username: string): Promise<boolean>
    isPatchApplied(gamePath: string): Promise<boolean>
    onExited(cb: () => void): () => void
  }
  mods: {
    fetchManifest(serverUrl: string): Promise<import('@shared/types').ModManifest>
    scanLocal(gamePath: string): Promise<import('@shared/types').ModEntry[]>
    download(serverUrl: string, gamePath: string, folder: string, filename: string): Promise<boolean>
    removeExtra(gamePath: string, folder: string, filename: string): Promise<boolean>
  }
  spt: {
    installerExists(): Promise<boolean>
    downloadInstaller(): Promise<boolean>
    openInstaller(): Promise<boolean>
    cleanupInstaller(): Promise<boolean>
    onDownloadProgress(cb: (pct: number) => void): () => void
  }
  update: {
    downloadLauncher(url: string): Promise<boolean>
    onProgress(cb: (pct: number) => void): () => void
  }
}
declare global { interface Window { api: WindowApi } }
export {}
