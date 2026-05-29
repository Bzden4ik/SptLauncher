"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  app: {
    getVersion: () => electron.ipcRenderer.invoke("app:getVersion")
  },
  window: {
    minimize: () => electron.ipcRenderer.send("window:minimize"),
    maximize: () => electron.ipcRenderer.send("window:maximize"),
    close: () => electron.ipcRenderer.send("window:close")
  },
  config: {
    get: (key) => electron.ipcRenderer.invoke("config:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("config:set", key, value),
    delete: (key) => electron.ipcRenderer.invoke("config:delete", key)
  },
  dialog: {
    pickFolder: () => electron.ipcRenderer.invoke("dialog:pickFolder")
  },
  shell: {
    openPath: (p) => electron.ipcRenderer.invoke("shell:openPath", p),
    openExternal: (u) => electron.ipcRenderer.invoke("shell:openExternal", u)
  },
  audio: {
    loadTrack: () => electron.ipcRenderer.invoke("audio:loadTrack")
  },
  server: {
    ping: (serverUrl) => electron.ipcRenderer.invoke("server:ping", serverUrl),
    version: (serverUrl) => electron.ipcRenderer.invoke("server:version", serverUrl)
  },
  game: {
    launch: (gamePath, serverUrl, username) => electron.ipcRenderer.invoke("game:launch", gamePath, serverUrl, username),
    isPatchApplied: (gamePath) => electron.ipcRenderer.invoke("game:isPatchApplied", gamePath),
    onExited: (cb) => {
      electron.ipcRenderer.on("game:exited", cb);
      return () => electron.ipcRenderer.removeListener("game:exited", cb);
    }
  },
  mods: {
    fetchManifest: (serverUrl) => electron.ipcRenderer.invoke("mods:fetchManifest", serverUrl),
    scanLocal: (gamePath) => electron.ipcRenderer.invoke("mods:scanLocal", gamePath),
    download: (serverUrl, gamePath, folder, filename) => electron.ipcRenderer.invoke("mods:download", serverUrl, gamePath, folder, filename),
    removeExtra: (gamePath, folder, filename) => electron.ipcRenderer.invoke("mods:removeExtra", gamePath, folder, filename)
  },
  spt: {
    installerExists: () => electron.ipcRenderer.invoke("spt:installerExists"),
    downloadInstaller: () => electron.ipcRenderer.invoke("spt:downloadInstaller"),
    openInstaller: () => electron.ipcRenderer.invoke("spt:openInstaller"),
    cleanupInstaller: () => electron.ipcRenderer.invoke("spt:cleanupInstaller"),
    onDownloadProgress: (cb) => {
      const handler = (_, pct) => cb(pct);
      electron.ipcRenderer.on("spt:downloadProgress", handler);
      return () => electron.ipcRenderer.removeListener("spt:downloadProgress", handler);
    }
  },
  update: {
    downloadLauncher: (url) => electron.ipcRenderer.invoke("update:downloadLauncher", url),
    onProgress: (cb) => {
      const handler = (_, pct) => cb(pct);
      electron.ipcRenderer.on("update:progress", handler);
      return () => electron.ipcRenderer.removeListener("update:progress", handler);
    }
  }
});
