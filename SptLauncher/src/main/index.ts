import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as https from 'https'
import * as zlib from 'zlib'
import axios from 'axios'

const store = new Store<any>()

// Sync EVERY file inside BepInEx/plugins and BepInEx/patchers — dll, json, cfg,
// asset bundles, nested folders, the lot. Only obvious OS/runtime junk is skipped.
const IGNORE_FILES    = new Set(['desktop.ini', 'thumbs.db', '.ds_store'])
const isIgnored       = (name: string) => IGNORE_FILES.has(name.toLowerCase())

// Headless-only files that must NEVER be installed onto a client, nor deleted
// from it — the Fika headless plugin is server-side only and breaks a normal
// client. Matched by basename, case-insensitively.
const BLOCKED_FILES   = new Set(['fika.headless.dll'])
const baseNameOf      = (p: string) => { const i = p.lastIndexOf('/'); return i >= 0 ? p.slice(i + 1) : p }
const isBlocked       = (filename: string) => BLOCKED_FILES.has(baseNameOf(filename).toLowerCase())
const APP_VERSION     = app.getVersion()

// SPT использует самоподписанный сертификат
const httpsAgent = new https.Agent({ rejectUnauthorized: false })
const axiosInstance = axios.create({ httpsAgent })

// ── Local hash cache (mtime+size keyed) ────────────────────────────────────
// Re-hashing thousands of files on every scan is the bottleneck. We cache the
// SHA-256 per absolute path and only recompute when mtime or size changes.
type HashCacheEntry = { m: number; s: number; h: string }
let hashCache: Record<string, HashCacheEntry> = {}
let hashCacheDirty = false
function hashCachePath(): string { return path.join(app.getPath('userData'), 'hashcache.json') }
function loadHashCache(): void {
  try { hashCache = JSON.parse(fs.readFileSync(hashCachePath(), 'utf8')) } catch { hashCache = {} }
}
function saveHashCache(): void {
  if (!hashCacheDirty) return
  try { fs.writeFileSync(hashCachePath(), JSON.stringify(hashCache)); hashCacheDirty = false } catch {}
}
function hashFileCached(full: string, st: fs.Stats): string {
  const c = hashCache[full]
  if (c && c.m === st.mtimeMs && c.s === st.size) return c.h
  const h = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')
  hashCache[full] = { m: st.mtimeMs, s: st.size, h }
  hashCacheDirty = true
  return h
}

// ── Convergence.mp3 resolver ───────────────────────────────────────────────
function getTrackPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'Convergence.mp3')
  }
  return join(__dirname, '..', '..', 'resources', 'Convergence.mp3')
}

function getUserBlacklist(): string[] {
  const v = store.get('skippedMods')
  return Array.isArray(v) ? v as string[] : []
}

function isSkipped(folder: string, filename: string): boolean {
  const key = `${folder}/${filename}`
  return getUserBlacklist().includes(key)
}

// Per-client runtime data protection (mirror of shared/types defaults). Files
// matching are never downloaded/overwritten/deleted — a last-line guard so a
// renderer bug can't clobber a save.
const DEFAULT_PROTECTED_PATTERNS = [
  '*savedata*', '*save_data*', '*_save.json', '*.sav', '*.save',
  '*playerdata*', '*player_data*', '*userdata*', '*user_data*'
]
function getProtectedPatterns(): string[] {
  const v = store.get('protectedPatterns')
  return Array.isArray(v) && v.length ? v as string[] : DEFAULT_PROTECTED_PATTERNS
}
function globToRegex(glob: string): RegExp {
  const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + glob.split('*').map(esc).join('.*') + '$', 'i')
}
function isProtectedName(filename: string): boolean {
  const i = filename.lastIndexOf('/')
  const base = i >= 0 ? filename.slice(i + 1) : filename
  return getProtectedPatterns().some(p => {
    const target = p.includes('/') ? filename : base
    try { return globToRegex(p).test(target) } catch { return false }
  })
}

// ── SPT response helpers ───────────────────────────────────────────────────
function sptDecompress(rawBuf: Buffer): string {
  const buf = Buffer.from(rawBuf)
  try { return zlib.inflateSync(buf).toString('utf8').trim() } catch {}
  try { return zlib.inflateRawSync(buf).toString('utf8').trim() } catch {}
  try { return zlib.gunzipSync(buf).toString('utf8').trim() } catch {}
  return buf.toString('utf8').replace(/^﻿/, '').replace(/\0+$/, '').trim()
}

async function sptGet(url: string, timeout = 10000): Promise<any> {
  const resp = await axiosInstance.get(url, { timeout, responseType: 'arraybuffer' })
  return JSON.parse(sptDecompress(resp.data))
}

function rawHttpPost(urlStr: string, body: Buffer, timeout = 10000): Promise<{ status: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const mod = u.protocol === 'https:' ? https : require('http') as typeof https
    const options: https.RequestOptions = {
      hostname: u.hostname,
      port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      rejectUnauthorized: false
    }
    const timer = setTimeout(() => reject(new Error('timeout')), timeout)
    const req = mod.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks) }) })
      res.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
    })
    req.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
    req.write(body)
    req.end()
  })
}

async function launcherPost(url: string, body: object, timeout = 10000): Promise<any> {
  const jsonBuf = Buffer.from(JSON.stringify(body), 'utf8')
  const zlibBuf = zlib.deflateSync(jsonBuf)
  const { status, data } = await rawHttpPost(url, zlibBuf, timeout)
  if (data.length === 0) throw new Error(`Сервер вернул пустой ответ (status=${status})`)
  const text = sptDecompress(data)
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
  return trimmed
}

async function launcherGet(url: string, timeout = 10000): Promise<any> {
  const resp = await axiosInstance.get(url, { timeout, validateStatus: () => true })
  return resp.data
}

async function getServerBackendUrl(serverUrl: string): Promise<string> {
  try {
    const data = await launcherPost(`${serverUrl}/launcher/server/connect`, {})
    const payload = data?.data ?? data
    const backendUrl = payload?.backendUrl ?? payload?.BackendUrl ?? null
    if (typeof backendUrl === 'string' && backendUrl) return backendUrl
  } catch {}
  return serverUrl
}

async function loginToServer(serverUrl: string, username: string): Promise<string> {
  const data = await launcherPost(`${serverUrl}/launcher/profile/login`, { username, password: '' })
  const sessionId = data?.data ?? data
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new Error(`Логин не удался. Ответ: ${JSON.stringify(data)}`)
  }
  return sessionId
}

// ── Window ─────────────────────────────────────────────────────────────────
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1320, height: 780,
    minWidth: 1180, minHeight: 700,
    frame: false,
    backgroundColor: '#06070b',
    resizable: true,
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' }
  })
}

// ── Window controls ────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window:maximize', () => {
  const w = BrowserWindow.getFocusedWindow()
  w?.isMaximized() ? w.unmaximize() : w?.maximize()
})
ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close())

// ── App meta ───────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => APP_VERSION)

// ── Config ─────────────────────────────────────────────────────────────────
ipcMain.handle('config:get', (_e, key: string) => store.get(key))
ipcMain.handle('config:set', (_e, key: string, value: unknown) => store.set(key, value))
ipcMain.handle('config:delete', (_e, key: string) => store.delete(key))

// ── Dialog ─────────────────────────────────────────────────────────────────
ipcMain.handle('dialog:pickFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

// ── Shell ──────────────────────────────────────────────────────────────────
ipcMain.handle('shell:openPath',     (_e, p: string) => shell.openPath(p))
ipcMain.handle('shell:openExternal', (_e, u: string) => shell.openExternal(u))

// ── Audio: load Convergence.mp3 as ArrayBuffer ─────────────────────────────
ipcMain.handle('audio:loadTrack', async () => {
  const p = getTrackPath()
  if (!fs.existsSync(p)) throw new Error(`Track not found: ${p}`)
  const buf = fs.readFileSync(p)
  // ipc-friendly: return raw Uint8Array buffer (electron serialises efficiently)
  return buf
})

// ── Game patch check ───────────────────────────────────────────────────────
ipcMain.handle('game:isPatchApplied', (_e, gamePath: string) => {
  const bakPath = path.join(gamePath, 'EscapeFromTarkov_Data', 'Managed', 'Assembly-CSharp.dll.spt-bak')
  return fs.existsSync(bakPath)
})

// ── Game launch ────────────────────────────────────────────────────────────
ipcMain.handle('game:launch', async (_e, gamePath: string, serverUrl: string, username: string) => {
  const gameExe = path.join(gamePath, 'EscapeFromTarkov.exe')
  if (!fs.existsSync(gameExe)) throw new Error(`EscapeFromTarkov.exe не найден: ${gameExe}`)

  const sessionId  = await loginToServer(serverUrl, username)
  const backendUrl = await getServerBackendUrl(serverUrl)

  const configJson = `{'BackendUrl':'${backendUrl}','Version':'live'}`
  const launchArgs = `-force-gfx-jobs native -token=${sessionId} -config=${configJson}`

  const child = spawn(gameExe, [launchArgs], {
    detached: true, stdio: 'ignore', cwd: gamePath, windowsVerbatimArguments: true
  })

  child.on('exit', () => {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('game:exited')
    })
  })

  child.unref()
  return true
})

// ── Server ping ────────────────────────────────────────────────────────────
ipcMain.handle('server:ping', async (_e, serverUrl: string) => {
  const t0 = Date.now()
  try {
    await launcherGet(`${serverUrl}/launcher/ping`, 4000)
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch { return { ok: false, latencyMs: -1 } }
})

// ── Version info (real SPT version + update gate) ──────────────────────────
ipcMain.handle('server:version', async (_e, serverUrl: string) => {
  try {
    const data    = await sptGet(`${serverUrl}/launcher/version`)
    const payload = data?.data ?? data
    return {
      sptVersion:            payload?.SptVersion            ?? payload?.sptVersion            ?? 'unknown',
      modVersion:            payload?.ModVersion            ?? payload?.modVersion            ?? 'unknown',
      protocolVersion:       payload?.ProtocolVersion       ?? payload?.protocolVersion       ?? '1',
      minLauncherVersion:    payload?.MinLauncherVersion    ?? payload?.minLauncherVersion    ?? '0.0.0',
      latestLauncherVersion: payload?.LatestLauncherVersion ?? payload?.latestLauncherVersion ?? APP_VERSION,
      launcherDownloadUrl:   payload?.LauncherDownloadUrl   ?? payload?.launcherDownloadUrl   ?? null,
      releaseNotesUrl:       payload?.ReleaseNotesUrl       ?? payload?.releaseNotesUrl       ?? null
    }
  } catch (e: any) {
    return null
  }
})

// ── Fetch server manifest ──────────────────────────────────────────────────
ipcMain.handle('mods:fetchManifest', async (_e, serverUrl: string) => {
  // Large modlists (thousands of files) take the server a while to assemble on
  // a cold cache — give it generous headroom so we don't AxiosError-timeout.
  const data    = await sptGet(`${serverUrl}/launcher/manifest`, 180_000)
  const payload = data?.data ?? data
  // Guard: a server-side error must NOT look like an empty manifest, otherwise
  // the client would treat every local file as "extra" and wipe them.
  if (payload && typeof payload === 'object' && (payload.error || payload.Error)) {
    throw new Error(String(payload.error ?? payload.Error))
  }
  const rawMods = payload?.Mods ?? payload?.mods ?? []
  return {
    generatedAt: payload?.GeneratedAt ?? payload?.generatedAt ?? '',
    modVersion:  payload?.ModVersion  ?? payload?.modVersion  ?? '1.0.0',
    sptVersion:  payload?.SptVersion  ?? payload?.sptVersion  ?? 'unknown',
    mods: rawMods
      .map((m: any) => ({
        filename: m.Filename ?? m.filename ?? '',
        folder:   m.Folder   ?? m.folder   ?? '',
        hash:     m.Hash     ?? m.hash     ?? '',
        size:     m.Size     ?? m.size     ?? 0
      }))
      // Drop blocked files even if an older server still advertises them.
      .filter((m: any) => !isBlocked(m.filename))
  }
})

// ── Scan local mods ────────────────────────────────────────────────────────
function scanFolder(dir: string, baseDir: string, folder: string,
                    out: Array<{filename:string;folder:string;hash:string;size:number}>) {
  if (!fs.existsSync(dir)) return
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      scanFolder(fullPath, baseDir, folder, out)
    } else if (!isIgnored(item.name) && !isBlocked(item.name)) {
      // isBlocked → leave the file completely untouched (not synced, not flagged
      // extra, never deleted). Fika.Headless.dll on a client is left as-is.
      try {
        const st = fs.statSync(fullPath)
        const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/')
        out.push({ filename: relPath, folder, hash: hashFileCached(fullPath, st), size: st.size })
      } catch { /* locked files */ }
    }
  }
}

ipcMain.handle('mods:scanLocal', async (_e, gamePath: string) => {
  const results: Array<{filename:string;folder:string;hash:string;size:number}> = []
  for (const folder of ['plugins', 'patchers']) {
    const baseDir = path.join(gamePath, 'BepInEx', folder)
    scanFolder(baseDir, baseDir, folder, results)
  }
  saveHashCache()
  return results
})

// ── Download mod (server-side) ─────────────────────────────────────────────
ipcMain.handle('mods:download', async (_e, serverUrl: string, gamePath: string, folder: string, filename: string) => {
  if (isSkipped(folder, filename) || isProtectedName(filename) || isBlocked(filename)) return true
  const url  = `${serverUrl}/launcher/mods/${folder}/${filename}`
  const dest = path.join(gamePath, 'BepInEx', folder, filename.replace(/\//g, path.sep))

  fs.mkdirSync(path.dirname(dest), { recursive: true })

  const data    = await sptGet(url, 120_000)
  const payload = data?.data ?? data
  const b64     = typeof payload === 'string' ? payload : JSON.stringify(payload)
  fs.writeFileSync(dest, Buffer.from(b64, 'base64'))
  return true
})

// ── Remove a stale local file (present on client but no longer on server) ───
// Hard-guarded: only inside BepInEx/{plugins,patchers}, never a skipped file,
// and prunes the now-empty parent folders up to the managed root.
ipcMain.handle('mods:removeExtra', async (_e, gamePath: string, folder: string, filename: string) => {
  if (folder !== 'plugins' && folder !== 'patchers') return false
  if (isSkipped(folder, filename) || isProtectedName(filename)) return false

  const baseDir = path.resolve(path.join(gamePath, 'BepInEx', folder))
  const target  = path.resolve(path.join(baseDir, filename.replace(/\//g, path.sep)))
  // traversal guard — target must stay strictly inside baseDir
  if (target === baseDir || !target.startsWith(baseDir + path.sep)) return false
  if (!fs.existsSync(target)) return true

  try { fs.rmSync(target, { force: true }) } catch { return false }

  // prune empty parent directories, but never the managed root itself
  let dir = path.dirname(target)
  while (dir !== baseDir && dir.startsWith(baseDir + path.sep)) {
    try {
      if (fs.readdirSync(dir).length === 0) { fs.rmdirSync(dir); dir = path.dirname(dir) }
      else break
    } catch { break }
  }
  return true
})

// ── SPT Installer ──────────────────────────────────────────────────────────
const SPT_INSTALLER_URL = 'https://ligma.waffle-lord.net/SPTInstaller.exe'
function getInstallerPath(): string {
  return path.join(app.getPath('userData'), 'SPTInstaller.exe')
}

ipcMain.handle('spt:installerExists', () => fs.existsSync(getInstallerPath()))

ipcMain.handle('spt:downloadInstaller', async () => {
  const dest = getInstallerPath()
  const win  = BrowserWindow.getAllWindows()[0]

  const resp = await axiosInstance.get(SPT_INSTALLER_URL, {
    responseType: 'arraybuffer',
    timeout: 120_000,
    onDownloadProgress: (evt) => {
      const pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : -1
      if (win && !win.isDestroyed()) win.webContents.send('spt:downloadProgress', pct)
    }
  })

  fs.writeFileSync(dest, Buffer.from(resp.data))
  spawn(dest, [], { detached: true, stdio: 'ignore' }).unref()
  return true
})

ipcMain.handle('spt:openInstaller', () => {
  const dest = getInstallerPath()
  if (!fs.existsSync(dest)) throw new Error('Installer not found')
  spawn(dest, [], { detached: true, stdio: 'ignore' }).unref()
  return true
})

ipcMain.handle('spt:cleanupInstaller', () => {
  const dest = getInstallerPath()
  if (fs.existsSync(dest)) fs.unlinkSync(dest)
  return true
})

// ── Launcher self-update ───────────────────────────────────────────────────
ipcMain.handle('update:downloadLauncher', async (_e, downloadUrl: string) => {
  const dest = path.join(app.getPath('userData'), 'LauncherUpdate.exe')
  const win  = BrowserWindow.getAllWindows()[0]

  const resp = await axiosInstance.get(downloadUrl, {
    responseType: 'arraybuffer', timeout: 300_000,
    onDownloadProgress: (evt) => {
      const pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : -1
      if (win && !win.isDestroyed()) win.webContents.send('update:progress', pct)
    }
  })
  fs.writeFileSync(dest, Buffer.from(resp.data))
  spawn(dest, [], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 800)
  return true
})

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  loadHashCache()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
