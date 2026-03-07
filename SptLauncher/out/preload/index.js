"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  window: {
    minimize: () => electron.ipcRenderer.send("window:minimize"),
    maximize: () => electron.ipcRenderer.send("window:maximize"),
    close: () => electron.ipcRenderer.send("window:close")
  },
  config: {
    get: (key) => electron.ipcRenderer.invoke("config:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("config:set", key, value)
  },
  dialog: {
    pickFolder: () => electron.ipcRenderer.invoke("dialog:pickFolder")
  },
  shell: {
    openPath: (p) => electron.ipcRenderer.invoke("shell:openPath", p)
  },
  server: {
    ping: (serverUrl) => electron.ipcRenderer.invoke("server:ping", serverUrl)
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
    download: (serverUrl, gamePath, folder, filename) => electron.ipcRenderer.invoke("mods:download", serverUrl, gamePath, folder, filename)
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
  }
});
