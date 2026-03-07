import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close')
  },
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder')
  },
  shell: {
    openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p)
  },
  server: {
    ping: (serverUrl: string) => ipcRenderer.invoke('server:ping', serverUrl)
  },
  game: {
    launch: (gamePath: string, serverUrl: string, username: string) =>
      ipcRenderer.invoke('game:launch', gamePath, serverUrl, username),
    isPatchApplied: (gamePath: string) =>
      ipcRenderer.invoke('game:isPatchApplied', gamePath),
    onExited: (cb: () => void) => {
      ipcRenderer.on('game:exited', cb)
      return () => ipcRenderer.removeListener('game:exited', cb)
    }
  },
  mods: {
    fetchManifest: (serverUrl: string) =>
      ipcRenderer.invoke('mods:fetchManifest', serverUrl),
    scanLocal: (gamePath: string) =>
      ipcRenderer.invoke('mods:scanLocal', gamePath),
    download: (serverUrl: string, gamePath: string, folder: string, filename: string) =>
      ipcRenderer.invoke('mods:download', serverUrl, gamePath, folder, filename)
  },
  spt: {
    installerExists: () => ipcRenderer.invoke('spt:installerExists'),
    downloadInstaller: () => ipcRenderer.invoke('spt:downloadInstaller'),
    openInstaller: () => ipcRenderer.invoke('spt:openInstaller'),
    cleanupInstaller: () => ipcRenderer.invoke('spt:cleanupInstaller'),
    onDownloadProgress: (cb: (pct: number) => void) => {
      const handler = (_: any, pct: number) => cb(pct)
      ipcRenderer.on('spt:downloadProgress', handler)
      return () => ipcRenderer.removeListener('spt:downloadProgress', handler)
    }
  }
})
