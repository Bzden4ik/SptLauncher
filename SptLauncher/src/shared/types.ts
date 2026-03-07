export interface ModEntry {
  filename: string
  folder: 'plugins' | 'patchers'
  hash: string
  size: number
}

export interface ModManifest {
  generatedAt: string
  version?: string
  mods: ModEntry[]
}

export type ModStatus = 'ok' | 'missing' | 'outdated' | 'extra'

export interface ModSyncEntry extends ModEntry {
  status: ModStatus
  localHash?: string
}

export interface LauncherConfig {
  gamePath: string
  serverUrl: string
  username: string
}
