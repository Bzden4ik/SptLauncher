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

const store = new Store()

const SYNC_EXTENSIONS = ['.dll', '.cfg']
const SYNC_BLACKLIST = ['Fika.Headless.dll', 'QuestMod.dll']

const isBlacklisted = (filename: string) =>
  SYNC_BLACKLIST.some(b => filename === b || filename.endsWith('/' + b))

// SPT использует самоподписанный сертификат
const httpsAgent = new https.Agent({ rejectUnauthorized: false })
const axiosInstance = axios.create({ httpsAgent })

function sptDecompress(rawBuf: Buffer): string {
  const buf = Buffer.from(rawBuf)
  try { return zlib.inflateSync(buf).toString('utf8').trim() } catch {}
  try { return zlib.inflateRawSync(buf).toString('utf8').trim() } catch {}
  try { return zlib.gunzipSync(buf).toString('utf8').trim() } catch {}
  return buf.toString('utf8').replace(/^\uFEFF/, '').replace(/\0+$/, '').trim()
}

async function sptGet(url: string, timeout = 10000): Promise<any> {
  const resp = await axiosInstance.get(url, { timeout, responseType: 'arraybuffer' })
  return JSON.parse(sptDecompress(resp.data))
}

async function sptPost(url: string, body: object, timeout = 10000): Promise<any> {
  const resp = await axiosInstance.post(url, body, {
    timeout,
    responseType: 'arraybuffer',
    headers: { 'Content-Type': 'application/json' }
  })
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
  console.log(`[launcherPost] sending ${zlibBuf.length} bytes, first bytes: ${zlibBuf.slice(0,4).toString('hex')}`)
  const { status, data } = await rawHttpPost(url, zlibBuf, timeout)
  console.log(`[launcherPost] status=${status} response bytes=${data.length} hex=${data.slice(0,8).toString('hex')}`)
  if (data.length === 0) throw new Error(`Сервер вернул пустой ответ (status=${status})`)
  const text = sptDecompress(data)
  console.log(`[launcherPost] text=${text.slice(0, 300)}`)
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
  return trimmed
}

async function launcherGet(url: string, timeout = 10000): Promise<any> {
  const resp = await axiosInstance.get(url, {
    timeout,
    validateStatus: () => true
  })
  return resp.data
}

async function getServerBackendUrl(serverUrl: string): Promise<string> {
  try {
    const data = await launcherPost(`${serverUrl}/launcher/server/connect`, {})
    console.log(`[getServerBackendUrl] raw:`, JSON.stringify(data))
    const payload = data?.data ?? data
    const backendUrl = payload?.backendUrl ?? payload?.BackendUrl ?? null
    if (typeof backendUrl === 'string' && backendUrl) {
      console.log(`[getServerBackendUrl] got: ${backendUrl}`)
      return backendUrl
    }
  } catch (e) {
    console.warn(`[getServerBackendUrl] /launcher/server/connect failed, fallback to serverUrl:`, e)
  }
  return serverUrl
}

async function loginToServer(serverUrl: string, username: string): Promise<string> {
  const data = await launcherPost(`${serverUrl}/launcher/profile/login`, { username, password: '' })
  console.log(`[loginToServer] full data dump:`, JSON.stringify(data))
  const sessionId = data?.data ?? data
  console.log(`[loginToServer] sessionId candidate: "${sessionId}" type=${typeof sessionId}`)
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new Error(`Логин не удался. Ответ: ${JSON.stringify(data)}`)
  }
  return sessionId
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 720,
    minWidth: 1100, minHeight: 660,
    frame: false,
    backgroundColor: '#060810',
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
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Window controls ────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window:maximize', () => {
  const w = BrowserWindow.getFocusedWindow()
  w?.isMaximized() ? w.unmaximize() : w?.maximize()
})
ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close())

// ── Config ─────────────────────────────────────────────────────────────────
ipcMain.handle('config:get', (_e, key: string) => store.get(key))
ipcMain.handle('config:set', (_e, key: string, value: unknown) => store.set(key, value))

// ── Dialog ─────────────────────────────────────────────────────────────────
ipcMain.handle('dialog:pickFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

// ── Shell ──────────────────────────────────────────────────────────────────
ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))

// ── Проверка патча ─────────────────────────────────────────────────────────
ipcMain.handle('game:isPatchApplied', (_e, gamePath: string) => {
  const bakPath = path.join(gamePath, 'EscapeFromTarkov_Data', 'Managed', 'Assembly-CSharp.dll.spt-bak')
  return fs.existsSync(bakPath)
})

// ── Game launch ────────────────────────────────────────────────────────────
ipcMain.handle('game:launch', async (_e, gamePath: string, serverUrl: string, username: string) => {
  const gameExe = path.join(gamePath, 'EscapeFromTarkov.exe')
  if (!fs.existsSync(gameExe)) {
    throw new Error(`EscapeFromTarkov.exe не найден: ${gameExe}`)
  }

  const sessionId = await loginToServer(serverUrl, username)
  const backendUrl = await getServerBackendUrl(serverUrl)

  const configJson = `{'BackendUrl':'${backendUrl}','Version':'live'}`
  const launchArgs = `-force-gfx-jobs native -token=${sessionId} -config=${configJson}`
  console.log(`[game:launch] gameExe=${gameExe}`)
  console.log(`[game:launch] backendUrl=${backendUrl}`)
  console.log(`[game:launch] args=${launchArgs}`)

  const child = spawn(gameExe, [launchArgs], {
    detached: true,
    stdio: 'ignore',
    cwd: gamePath,
    windowsVerbatimArguments: true
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
  try {
    await launcherGet(`${serverUrl}/launcher/ping`, 4000)
    return true
  } catch {
    return false
  }
})

// ── Fetch manifest ─────────────────────────────────────────────────────────
ipcMain.handle('mods:fetchManifest', async (_e, serverUrl: string) => {
  const data = await sptGet(`${serverUrl}/launcher/manifest`)
  const payload = data?.data ?? data
  const rawMods = payload?.Mods ?? payload?.mods ?? []
  return {
    generatedAt: payload?.GeneratedAt ?? payload?.generatedAt ?? '',
    version:     payload?.Version     ?? payload?.version     ?? '1.0.0',
    mods: rawMods.map((m: any) => ({
      filename: m.Filename ?? m.filename ?? '',
      folder:   m.Folder   ?? m.folder   ?? '',
      hash:     m.Hash     ?? m.hash     ?? '',
      size:     m.Size     ?? m.size     ?? 0
    }))
  }
})

// ── Scan local mods ────────────────────────────────────────────────────────
ipcMain.handle('mods:scanLocal', async (_e, gamePath: string) => {
  const results: Array<{ filename: string; folder: string; hash: string; size: number }> = []

  const scanDir = (dir: string, baseDir: string, folder: string) => {
    if (!fs.existsSync(dir)) return
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        scanDir(fullPath, baseDir, folder)
      } else if (SYNC_EXTENSIONS.some(ext => item.name.endsWith(ext))) {
        try {
          const buf = fs.readFileSync(fullPath)
          const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/')
          results.push({
            filename: relPath, folder,
            hash: crypto.createHash('sha256').update(buf).digest('hex'),
            size: buf.length
          })
        } catch { /* пропускаем заблокированные */ }
      }
    }
  }

  for (const folder of ['plugins', 'patchers']) {
    const baseDir = path.join(gamePath, 'BepInEx', folder)
    scanDir(baseDir, baseDir, folder)
  }
  return results
})

// ── Download mod ───────────────────────────────────────────────────────────
ipcMain.handle('mods:download', async (_e, serverUrl: string, gamePath: string, folder: string, filename: string) => {
  if (isBlacklisted(filename)) return true
  const url  = `${serverUrl}/launcher/mods/${folder}/${filename}`
  const dest = path.join(gamePath, 'BepInEx', folder, filename.replace(/\//g, path.sep))

  fs.mkdirSync(path.dirname(dest), { recursive: true })

  const data    = await sptGet(url, 120_000)
  const payload = data?.data ?? data
  const b64     = typeof payload === 'string' ? payload : JSON.stringify(payload)
  fs.writeFileSync(dest, Buffer.from(b64, 'base64'))
  return true
})

// ── SPT Installer ──────────────────────────────────────────────────────────
const SPT_INSTALLER_URL = 'https://ligma.waffle-lord.net/SPTInstaller.exe'

function getInstallerPath(): string {
  return path.join(app.getPath('userData'), 'SPTInstaller.exe')
}

ipcMain.handle('spt:installerExists', () => {
  return fs.existsSync(getInstallerPath())
})

ipcMain.handle('spt:downloadInstaller', async (_e) => {
  const dest = getInstallerPath()
  const win = BrowserWindow.getAllWindows()[0]

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

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
