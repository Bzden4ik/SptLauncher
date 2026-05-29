export interface ModEntry {
  filename: string
  folder: string         // 'plugins' | 'patchers' | other namespaces
  hash: string
  size: number
}

export interface ModManifest {
  generatedAt: string
  modVersion?: string
  sptVersion?: string
  mods: ModEntry[]
}

export type ModStatus =
  | 'ok'         // local matches server
  | 'missing'    // local file doesn't exist
  | 'outdated'   // local hash differs from server
  | 'extra'      // local-only, not in manifest (stale → removable)
  | 'skipped'    // user-flagged to skip (manual hands-off)
  | 'protected'  // runtime/save data — auto-protected, never touched

export interface ModSyncEntry extends ModEntry {
  status: ModStatus
  localHash?: string
}

// Per-client runtime data (saves / progress) that the launcher must never
// download, overwrite or delete. Matched against the file's basename, unless a
// pattern contains "/", in which case it matches the full relative path.
// Conservative defaults — clearly save/user data, low risk of blocking content.
export const DEFAULT_PROTECTED_PATTERNS: string[] = [
  '*savedata*',
  '*save_data*',
  '*_save.json',
  '*.sav',
  '*.save',
  '*playerdata*',
  '*player_data*',
  '*userdata*',
  '*user_data*'
]

function globToRegex(glob: string): RegExp {
  const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + glob.split('*').map(esc).join('.*') + '$', 'i')
}

export function isProtectedByPattern(filename: string, patterns: string[]): boolean {
  const i = filename.lastIndexOf('/')
  const base = i >= 0 ? filename.slice(i + 1) : filename
  for (const p of patterns) {
    const target = p.includes('/') ? filename : base
    try { if (globToRegex(p).test(target)) return true } catch { /* bad pattern → ignore */ }
  }
  return false
}

export interface LauncherConfig {
  gamePath: string
  serverUrl: string
  username: string
}

export interface AudioSettings {
  volume: number   // 0.0 .. 1.0
  muted: boolean
  initialized: boolean  // becomes true once user has interacted at least once
}

export const DEFAULT_AUDIO: AudioSettings = {
  volume: 0.12,
  muted: false,
  initialized: false
}
