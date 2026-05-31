"use strict";
const electron = require("electron");
const path = require("path");
const Store = require("electron-store");
const child_process = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const zlib = require("zlib");
const axios = require("axios");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
const https__namespace = /* @__PURE__ */ _interopNamespaceDefault(https);
const zlib__namespace = /* @__PURE__ */ _interopNamespaceDefault(zlib);
const store = new Store();
electron.app.disableHardwareAcceleration();
const IGNORE_FILES = /* @__PURE__ */ new Set(["desktop.ini", "thumbs.db", ".ds_store"]);
const isIgnored = (name) => IGNORE_FILES.has(name.toLowerCase());
const BLOCKED_FILES = /* @__PURE__ */ new Set(["fika.headless.dll"]);
const baseNameOf = (p) => {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
};
const isBlocked = (filename) => BLOCKED_FILES.has(baseNameOf(filename).toLowerCase());
function apiUrl(serverUrl, pathPart) {
  let base = String(serverUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  return base + pathPart;
}
const APP_VERSION = electron.app.getVersion();
const httpsAgent = new https__namespace.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 4,
  maxFreeSockets: 2,
  timeout: 6e4
});
const axiosInstance = axios.create({ httpsAgent });
let hashCache = {};
let hashCacheDirty = false;
function hashCachePath() {
  return path__namespace.join(electron.app.getPath("userData"), "hashcache.json");
}
function loadHashCache() {
  try {
    hashCache = JSON.parse(fs__namespace.readFileSync(hashCachePath(), "utf8"));
  } catch {
    hashCache = {};
  }
}
function saveHashCache() {
  if (!hashCacheDirty) return;
  try {
    fs__namespace.writeFileSync(hashCachePath(), JSON.stringify(hashCache));
    hashCacheDirty = false;
  } catch {
  }
}
function hashFileCached(full, st) {
  const c = hashCache[full];
  if (c && c.m === st.mtimeMs && c.s === st.size) return c.h;
  const h = crypto__namespace.createHash("sha256").update(fs__namespace.readFileSync(full)).digest("hex");
  hashCache[full] = { m: st.mtimeMs, s: st.size, h };
  hashCacheDirty = true;
  return h;
}
function getTrackPath() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "Convergence.mp3");
  }
  return path.join(__dirname, "..", "..", "resources", "Convergence.mp3");
}
function getUserBlacklist() {
  const v = store.get("skippedMods");
  return Array.isArray(v) ? v : [];
}
function isSkipped(folder, filename) {
  const key = `${folder}/${filename}`;
  return getUserBlacklist().includes(key);
}
const DEFAULT_PROTECTED_PATTERNS = [
  "*savedata*",
  "*save_data*",
  "*_save.json",
  "*.sav",
  "*.save",
  "*playerdata*",
  "*player_data*",
  "*userdata*",
  "*user_data*"
];
function getProtectedPatterns() {
  const v = store.get("protectedPatterns");
  return Array.isArray(v) && v.length ? v : DEFAULT_PROTECTED_PATTERNS;
}
function globToRegex(glob) {
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + glob.split("*").map(esc).join(".*") + "$", "i");
}
function isProtectedName(filename) {
  const i = filename.lastIndexOf("/");
  const base = i >= 0 ? filename.slice(i + 1) : filename;
  return getProtectedPatterns().some((p) => {
    const target = p.includes("/") ? filename : base;
    try {
      return globToRegex(p).test(target);
    } catch {
      return false;
    }
  });
}
function sptDecompress(rawBuf) {
  const buf = Buffer.from(rawBuf);
  try {
    return zlib__namespace.inflateSync(buf).toString("utf8").trim();
  } catch {
  }
  try {
    return zlib__namespace.inflateRawSync(buf).toString("utf8").trim();
  } catch {
  }
  try {
    return zlib__namespace.gunzipSync(buf).toString("utf8").trim();
  } catch {
  }
  return buf.toString("utf8").replace(/^﻿/, "").replace(/\0+$/, "").trim();
}
async function sptGet(url, timeout = 1e4) {
  const resp = await axiosInstance.get(url, { timeout, responseType: "arraybuffer" });
  return JSON.parse(sptDecompress(resp.data));
}
function rawHttpPost(urlStr, body, timeout = 1e4) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === "https:" ? https__namespace : require("http");
    const options = {
      hostname: u.hostname,
      port: Number(u.port) || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": body.length },
      rejectUnauthorized: false
    };
    const timer = setTimeout(() => reject(new Error("timeout")), timeout);
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, data: Buffer.concat(chunks) });
      });
      res.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.write(body);
    req.end();
  });
}
async function launcherPost(url, body, timeout = 1e4) {
  const jsonBuf = Buffer.from(JSON.stringify(body), "utf8");
  const zlibBuf = zlib__namespace.deflateSync(jsonBuf);
  const { status, data } = await rawHttpPost(url, zlibBuf, timeout);
  if (data.length === 0) throw new Error(`Сервер вернул пустой ответ (status=${status})`);
  const text = sptDecompress(data);
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed;
}
async function launcherGet(url, timeout = 1e4) {
  const resp = await axiosInstance.get(url, { timeout, validateStatus: () => true });
  return resp.data;
}
async function getServerBackendUrl(serverUrl) {
  try {
    const data = await launcherPost(apiUrl(serverUrl, "/launcher/server/connect"), {});
    const payload = data?.data ?? data;
    const backendUrl = payload?.backendUrl ?? payload?.BackendUrl ?? null;
    if (typeof backendUrl === "string" && backendUrl) return backendUrl;
  } catch {
  }
  return serverUrl;
}
async function loginToServer(serverUrl, username) {
  const data = await launcherPost(apiUrl(serverUrl, "/launcher/profile/login"), { username, password: "" });
  const sessionId = data?.data ?? data;
  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error(`Логин не удался. Ответ: ${JSON.stringify(data)}`);
  }
  return sessionId;
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1320,
    height: 780,
    minWidth: 1180,
    minHeight: 700,
    frame: false,
    backgroundColor: "#06070b",
    resizable: true,
    icon: path.join(__dirname, "../../resources/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
}
electron.ipcMain.on("window:minimize", () => electron.BrowserWindow.getFocusedWindow()?.minimize());
electron.ipcMain.on("window:maximize", () => {
  const w = electron.BrowserWindow.getFocusedWindow();
  w?.isMaximized() ? w.unmaximize() : w?.maximize();
});
electron.ipcMain.on("window:close", () => electron.BrowserWindow.getFocusedWindow()?.close());
electron.ipcMain.handle("app:getVersion", () => APP_VERSION);
electron.ipcMain.handle("config:get", (_e, key) => store.get(key));
electron.ipcMain.handle("config:set", (_e, key, value) => store.set(key, value));
electron.ipcMain.handle("config:delete", (_e, key) => store.delete(key));
electron.ipcMain.handle("dialog:pickFolder", async () => {
  const result = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
electron.ipcMain.handle("shell:openPath", (_e, p) => electron.shell.openPath(p));
electron.ipcMain.handle("shell:openExternal", (_e, u) => electron.shell.openExternal(u));
electron.ipcMain.handle("audio:loadTrack", async () => {
  const p = getTrackPath();
  if (!fs__namespace.existsSync(p)) throw new Error(`Track not found: ${p}`);
  const buf = fs__namespace.readFileSync(p);
  return buf;
});
electron.ipcMain.handle("game:isPatchApplied", (_e, gamePath) => {
  const bakPath = path__namespace.join(gamePath, "EscapeFromTarkov_Data", "Managed", "Assembly-CSharp.dll.spt-bak");
  return fs__namespace.existsSync(bakPath);
});
electron.ipcMain.handle("game:launch", async (_e, gamePath, serverUrl, username) => {
  const gameExe = path__namespace.join(gamePath, "EscapeFromTarkov.exe");
  if (!fs__namespace.existsSync(gameExe)) throw new Error(`EscapeFromTarkov.exe не найден: ${gameExe}`);
  const sessionId = await loginToServer(serverUrl, username);
  const backendUrl = await getServerBackendUrl(serverUrl);
  const configJson = `{'BackendUrl':'${backendUrl}','Version':'live'}`;
  const launchArgs = `-force-gfx-jobs native -token=${sessionId} -config=${configJson}`;
  const child = child_process.spawn(gameExe, [launchArgs], {
    detached: true,
    stdio: "ignore",
    cwd: gamePath,
    windowsVerbatimArguments: true
  });
  child.on("exit", () => {
    electron.BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send("game:exited");
    });
  });
  child.unref();
  return true;
});
electron.ipcMain.handle("server:ping", async (_e, serverUrl) => {
  const t0 = Date.now();
  try {
    await launcherGet(apiUrl(serverUrl, "/launcher/ping"), 4e3);
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: -1 };
  }
});
electron.ipcMain.handle("server:version", async (_e, serverUrl) => {
  try {
    const data = await sptGet(apiUrl(serverUrl, "/launcher/version"));
    const payload = data?.data ?? data;
    return {
      sptVersion: payload?.SptVersion ?? payload?.sptVersion ?? "unknown",
      modVersion: payload?.ModVersion ?? payload?.modVersion ?? "unknown",
      protocolVersion: payload?.ProtocolVersion ?? payload?.protocolVersion ?? "1",
      minLauncherVersion: payload?.MinLauncherVersion ?? payload?.minLauncherVersion ?? "0.0.0",
      latestLauncherVersion: payload?.LatestLauncherVersion ?? payload?.latestLauncherVersion ?? APP_VERSION,
      launcherDownloadUrl: payload?.LauncherDownloadUrl ?? payload?.launcherDownloadUrl ?? null,
      releaseNotesUrl: payload?.ReleaseNotesUrl ?? payload?.releaseNotesUrl ?? null
    };
  } catch (e) {
    return null;
  }
});
electron.ipcMain.handle("mods:fetchManifest", async (_e, serverUrl) => {
  const data = await sptGet(apiUrl(serverUrl, "/launcher/manifest"), 18e4);
  const payload = data?.data ?? data;
  if (payload && typeof payload === "object" && (payload.error || payload.Error)) {
    throw new Error(String(payload.error ?? payload.Error));
  }
  const rawMods = payload?.Mods ?? payload?.mods ?? [];
  return {
    generatedAt: payload?.GeneratedAt ?? payload?.generatedAt ?? "",
    modVersion: payload?.ModVersion ?? payload?.modVersion ?? "1.0.0",
    sptVersion: payload?.SptVersion ?? payload?.sptVersion ?? "unknown",
    mods: rawMods.map((m) => ({
      filename: m.Filename ?? m.filename ?? "",
      folder: m.Folder ?? m.folder ?? "",
      hash: m.Hash ?? m.hash ?? "",
      size: m.Size ?? m.size ?? 0
    })).filter((m) => !isBlocked(m.filename))
  };
});
function scanFolder(dir, baseDir, folder, out) {
  if (!fs__namespace.existsSync(dir)) return;
  for (const item of fs__namespace.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path__namespace.join(dir, item.name);
    if (item.isDirectory()) {
      scanFolder(fullPath, baseDir, folder, out);
    } else if (!isIgnored(item.name) && !isBlocked(item.name)) {
      try {
        const st = fs__namespace.statSync(fullPath);
        const relPath = path__namespace.relative(baseDir, fullPath).split(path__namespace.sep).join("/");
        out.push({ filename: relPath, folder, hash: hashFileCached(fullPath, st), size: st.size });
      } catch {
      }
    }
  }
}
electron.ipcMain.handle("mods:scanLocal", async (_e, gamePath) => {
  const results = [];
  for (const folder of ["plugins", "patchers"]) {
    const baseDir = path__namespace.join(gamePath, "BepInEx", folder);
    scanFolder(baseDir, baseDir, folder, results);
  }
  saveHashCache();
  return results;
});
electron.ipcMain.handle("mods:download", async (_e, serverUrl, gamePath, folder, filename) => {
  if (isSkipped(folder, filename) || isProtectedName(filename) || isBlocked(filename)) return true;
  const url = apiUrl(serverUrl, `/launcher/mods/${folder}/${filename}`);
  const dest = path__namespace.join(gamePath, "BepInEx", folder, filename.replace(/\//g, path__namespace.sep));
  fs__namespace.mkdirSync(path__namespace.dirname(dest), { recursive: true });
  const MAX_RETRIES = 4;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await sptGet(url, 12e4);
      const payload = data?.data ?? data;
      const b64 = typeof payload === "string" ? payload : JSON.stringify(payload);
      fs__namespace.writeFileSync(dest, Buffer.from(b64, "base64"));
      return true;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        const backoff = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
});
electron.ipcMain.handle("mods:removeExtra", async (_e, gamePath, folder, filename) => {
  if (folder !== "plugins" && folder !== "patchers") return false;
  if (isSkipped(folder, filename) || isProtectedName(filename)) return false;
  const baseDir = path__namespace.resolve(path__namespace.join(gamePath, "BepInEx", folder));
  const target = path__namespace.resolve(path__namespace.join(baseDir, filename.replace(/\//g, path__namespace.sep)));
  if (target === baseDir || !target.startsWith(baseDir + path__namespace.sep)) return false;
  if (!fs__namespace.existsSync(target)) return true;
  try {
    fs__namespace.rmSync(target, { force: true });
  } catch {
    return false;
  }
  let dir = path__namespace.dirname(target);
  while (dir !== baseDir && dir.startsWith(baseDir + path__namespace.sep)) {
    try {
      if (fs__namespace.readdirSync(dir).length === 0) {
        fs__namespace.rmdirSync(dir);
        dir = path__namespace.dirname(dir);
      } else break;
    } catch {
      break;
    }
  }
  return true;
});
const SPT_INSTALLER_URL = "https://ligma.waffle-lord.net/SPTInstaller.exe";
function getInstallerPath() {
  return path__namespace.join(electron.app.getPath("userData"), "SPTInstaller.exe");
}
electron.ipcMain.handle("spt:installerExists", () => fs__namespace.existsSync(getInstallerPath()));
electron.ipcMain.handle("spt:downloadInstaller", async () => {
  const dest = getInstallerPath();
  const win = electron.BrowserWindow.getAllWindows()[0];
  const resp = await axiosInstance.get(SPT_INSTALLER_URL, {
    responseType: "arraybuffer",
    timeout: 12e4,
    onDownloadProgress: (evt) => {
      const pct = evt.total ? Math.round(evt.loaded / evt.total * 100) : -1;
      if (win && !win.isDestroyed()) win.webContents.send("spt:downloadProgress", pct);
    }
  });
  fs__namespace.writeFileSync(dest, Buffer.from(resp.data));
  child_process.spawn(dest, [], { detached: true, stdio: "ignore" }).unref();
  return true;
});
electron.ipcMain.handle("spt:openInstaller", () => {
  const dest = getInstallerPath();
  if (!fs__namespace.existsSync(dest)) throw new Error("Installer not found");
  child_process.spawn(dest, [], { detached: true, stdio: "ignore" }).unref();
  return true;
});
electron.ipcMain.handle("spt:cleanupInstaller", () => {
  const dest = getInstallerPath();
  if (fs__namespace.existsSync(dest)) fs__namespace.unlinkSync(dest);
  return true;
});
const GITHUB_REPO = "Bzden4ik/SptLauncher";
function isVersionNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}
electron.ipcMain.handle("update:checkGithub", async () => {
  try {
    const resp = await axios.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      timeout: 1e4,
      headers: { "User-Agent": "SptLauncher", Accept: "application/vnd.github+json" }
    });
    const rel = resp.data;
    const tag = String(rel?.tag_name ?? "").replace(/^v/i, "").trim();
    if (!tag || !isVersionNewer(tag, APP_VERSION)) return null;
    const asset = (rel.assets ?? []).find((a) => typeof a?.name === "string" && /\.exe$/i.test(a.name));
    return {
      version: tag,
      notes: typeof rel.body === "string" ? rel.body : "",
      htmlUrl: rel.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
      downloadUrl: asset?.browser_download_url ?? null
    };
  } catch {
    return null;
  }
});
electron.ipcMain.handle("update:downloadLauncher", async (_e, downloadUrl) => {
  const dest = path__namespace.join(electron.app.getPath("userData"), "LauncherUpdate.exe");
  const win = electron.BrowserWindow.getAllWindows()[0];
  const resp = await axios.get(downloadUrl, {
    responseType: "arraybuffer",
    timeout: 3e5,
    maxRedirects: 5,
    headers: { "User-Agent": "SptLauncher" },
    onDownloadProgress: (evt) => {
      const pct = evt.total ? Math.round(evt.loaded / evt.total * 100) : -1;
      if (win && !win.isDestroyed()) win.webContents.send("update:progress", pct);
    }
  });
  fs__namespace.writeFileSync(dest, Buffer.from(resp.data));
  child_process.spawn(dest, [], { detached: true, stdio: "ignore" }).unref();
  setTimeout(() => electron.app.quit(), 800);
  return true;
});
electron.app.whenReady().then(() => {
  loadHashCache();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
