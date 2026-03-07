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
const SYNC_EXTENSIONS = [".dll", ".cfg"];
const SYNC_BLACKLIST = ["Fika.Headless.dll", "QuestMod.dll"];
const isBlacklisted = (filename) => SYNC_BLACKLIST.some((b) => filename === b || filename.endsWith("/" + b));
const httpsAgent = new https__namespace.Agent({ rejectUnauthorized: false });
const axiosInstance = axios.create({ httpsAgent });
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
  return buf.toString("utf8").replace(/^\uFEFF/, "").replace(/\0+$/, "").trim();
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
  console.log(`[launcherPost] sending ${zlibBuf.length} bytes, first bytes: ${zlibBuf.slice(0, 4).toString("hex")}`);
  const { status, data } = await rawHttpPost(url, zlibBuf, timeout);
  console.log(`[launcherPost] status=${status} response bytes=${data.length} hex=${data.slice(0, 8).toString("hex")}`);
  if (data.length === 0) throw new Error(`Сервер вернул пустой ответ (status=${status})`);
  const text = sptDecompress(data);
  console.log(`[launcherPost] text=${text.slice(0, 300)}`);
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed;
}
async function launcherGet(url, timeout = 1e4) {
  const resp = await axiosInstance.get(url, {
    timeout,
    validateStatus: () => true
  });
  return resp.data;
}
async function getServerBackendUrl(serverUrl) {
  try {
    const data = await launcherPost(`${serverUrl}/launcher/server/connect`, {});
    console.log(`[getServerBackendUrl] raw:`, JSON.stringify(data));
    const payload = data?.data ?? data;
    const backendUrl = payload?.backendUrl ?? payload?.BackendUrl ?? null;
    if (typeof backendUrl === "string" && backendUrl) {
      console.log(`[getServerBackendUrl] got: ${backendUrl}`);
      return backendUrl;
    }
  } catch (e) {
    console.warn(`[getServerBackendUrl] /launcher/server/connect failed, fallback to serverUrl:`, e);
  }
  return serverUrl;
}
async function loginToServer(serverUrl, username) {
  const data = await launcherPost(`${serverUrl}/launcher/profile/login`, { username, password: "" });
  console.log(`[loginToServer] full data dump:`, JSON.stringify(data));
  const sessionId = data?.data ?? data;
  console.log(`[loginToServer] sessionId candidate: "${sessionId}" type=${typeof sessionId}`);
  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error(`Логин не удался. Ответ: ${JSON.stringify(data)}`);
  }
  return sessionId;
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1100,
    minHeight: 660,
    frame: false,
    backgroundColor: "#060810",
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
    win.webContents.openDevTools();
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
electron.ipcMain.handle("config:get", (_e, key) => store.get(key));
electron.ipcMain.handle("config:set", (_e, key, value) => store.set(key, value));
electron.ipcMain.handle("dialog:pickFolder", async () => {
  const result = await electron.dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
electron.ipcMain.handle("shell:openPath", (_e, p) => electron.shell.openPath(p));
electron.ipcMain.handle("game:isPatchApplied", (_e, gamePath) => {
  const bakPath = path__namespace.join(gamePath, "EscapeFromTarkov_Data", "Managed", "Assembly-CSharp.dll.spt-bak");
  return fs__namespace.existsSync(bakPath);
});
electron.ipcMain.handle("game:launch", async (_e, gamePath, serverUrl, username) => {
  const gameExe = path__namespace.join(gamePath, "EscapeFromTarkov.exe");
  if (!fs__namespace.existsSync(gameExe)) {
    throw new Error(`EscapeFromTarkov.exe не найден: ${gameExe}`);
  }
  const sessionId = await loginToServer(serverUrl, username);
  const backendUrl = await getServerBackendUrl(serverUrl);
  const configJson = `{'BackendUrl':'${backendUrl}','Version':'live'}`;
  const launchArgs = `-force-gfx-jobs native -token=${sessionId} -config=${configJson}`;
  console.log(`[game:launch] gameExe=${gameExe}`);
  console.log(`[game:launch] backendUrl=${backendUrl}`);
  console.log(`[game:launch] args=${launchArgs}`);
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
  try {
    await launcherGet(`${serverUrl}/launcher/ping`, 4e3);
    return true;
  } catch {
    return false;
  }
});
electron.ipcMain.handle("mods:fetchManifest", async (_e, serverUrl) => {
  const data = await sptGet(`${serverUrl}/launcher/manifest`);
  const payload = data?.data ?? data;
  const rawMods = payload?.Mods ?? payload?.mods ?? [];
  return {
    generatedAt: payload?.GeneratedAt ?? payload?.generatedAt ?? "",
    version: payload?.Version ?? payload?.version ?? "1.0.0",
    mods: rawMods.map((m) => ({
      filename: m.Filename ?? m.filename ?? "",
      folder: m.Folder ?? m.folder ?? "",
      hash: m.Hash ?? m.hash ?? "",
      size: m.Size ?? m.size ?? 0
    }))
  };
});
electron.ipcMain.handle("mods:scanLocal", async (_e, gamePath) => {
  const results = [];
  const scanDir = (dir, baseDir, folder) => {
    if (!fs__namespace.existsSync(dir)) return;
    for (const item of fs__namespace.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path__namespace.join(dir, item.name);
      if (item.isDirectory()) {
        scanDir(fullPath, baseDir, folder);
      } else if (SYNC_EXTENSIONS.some((ext) => item.name.endsWith(ext))) {
        try {
          const buf = fs__namespace.readFileSync(fullPath);
          const relPath = path__namespace.relative(baseDir, fullPath).replace(/\\/g, "/");
          results.push({
            filename: relPath,
            folder,
            hash: crypto__namespace.createHash("sha256").update(buf).digest("hex"),
            size: buf.length
          });
        } catch {
        }
      }
    }
  };
  for (const folder of ["plugins", "patchers"]) {
    const baseDir = path__namespace.join(gamePath, "BepInEx", folder);
    scanDir(baseDir, baseDir, folder);
  }
  return results;
});
electron.ipcMain.handle("mods:download", async (_e, serverUrl, gamePath, folder, filename) => {
  if (isBlacklisted(filename)) return true;
  const url = `${serverUrl}/launcher/mods/${folder}/${filename}`;
  const dest = path__namespace.join(gamePath, "BepInEx", folder, filename.replace(/\//g, path__namespace.sep));
  fs__namespace.mkdirSync(path__namespace.dirname(dest), { recursive: true });
  const data = await sptGet(url, 12e4);
  const payload = data?.data ?? data;
  const b64 = typeof payload === "string" ? payload : JSON.stringify(payload);
  fs__namespace.writeFileSync(dest, Buffer.from(b64, "base64"));
  return true;
});
const SPT_INSTALLER_URL = "https://ligma.waffle-lord.net/SPTInstaller.exe";
function getInstallerPath() {
  return path__namespace.join(electron.app.getPath("userData"), "SPTInstaller.exe");
}
electron.ipcMain.handle("spt:installerExists", () => {
  return fs__namespace.existsSync(getInstallerPath());
});
electron.ipcMain.handle("spt:downloadInstaller", async (_e) => {
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
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
