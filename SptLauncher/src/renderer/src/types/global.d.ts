interface WindowApi {
  window: { minimize(): void; maximize(): void; close(): void }
  config: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
  dialog: { pickFolder(): Promise<string | null> }
  shell: { openPath(p: string): Promise<string> }
  server: { ping(serverUrl: string): Promise<boolean> }
  game: {
    launch(gamePath: string, serverUrl: string, username: string): Promise<boolean>
    isPatchApplied(gamePath: string): Promise<boolean>
    onExited(cb: () => void): () => void
  }
  mods: {
    fetchManifest(serverUrl: string): Promise<import('@shared/types').ModManifest>
    scanLocal(gamePath: string): Promise<import('@shared/types').ModEntry[]>
    download(serverUrl: string, gamePath: string, folder: string, filename: string): Promise<boolean>
  }
  spt: {
    installerExists(): Promise<boolean>
    downloadInstaller(): Promise<boolean>
    openInstaller(): Promise<boolean>
    cleanupInstaller(): Promise<boolean>
    onDownloadProgress(cb: (pct: number) => void): () => void
  }
}
declare global { interface Window { api: WindowApi } }
export {}
