import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion')
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close')
  },
  config: {
    get:    (key: string)                     => ipcRenderer.invoke('config:get', key),
    set:    (key: string, value: unknown)     => ipcRenderer.invoke('config:set', key, value),
    delete: (key: string)                     => ipcRenderer.invoke('config:delete', key)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder')
  },
  shell: {
    openPath:     (p: string) => ipcRenderer.invoke('shell:openPath',     p),
    openExternal: (u: string) => ipcRenderer.invoke('shell:openExternal', u)
  },
  audio: {
    loadTrack: () => ipcRenderer.invoke('audio:loadTrack')
  },
  server: {
    ping:    (serverUrl: string) => ipcRenderer.invoke('server:ping',    serverUrl),
    version: (serverUrl: string) => ipcRenderer.invoke('server:version', serverUrl)
  },
  game: {
    launch:          (gamePath: string, serverUrl: string, username: string) =>
      ipcRenderer.invoke('game:launch', gamePath, serverUrl, username),
    isPatchApplied:  (gamePath: string) => ipcRenderer.invoke('game:isPatchApplied', gamePath),
    onExited:        (cb: () => void) => {
      ipcRenderer.on('game:exited', cb)
      return () => ipcRenderer.removeListener('game:exited', cb)
    }
  },
  mods: {
    fetchManifest: (serverUrl: string)            => ipcRenderer.invoke('mods:fetchManifest', serverUrl),
    scanLocal:     (gamePath: string)             => ipcRenderer.invoke('mods:scanLocal',     gamePath),
    download:      (serverUrl: string, gamePath: string, folder: string, filename: string) =>
      ipcRenderer.invoke('mods:download', serverUrl, gamePath, folder, filename),
    removeExtra:   (gamePath: string, folder: string, filename: string) =>
      ipcRenderer.invoke('mods:removeExtra', gamePath, folder, filename)
  },
  spt: {
    installerExists:    () => ipcRenderer.invoke('spt:installerExists'),
    downloadInstaller:  () => ipcRenderer.invoke('spt:downloadInstaller'),
    openInstaller:      () => ipcRenderer.invoke('spt:openInstaller'),
    cleanupInstaller:   () => ipcRenderer.invoke('spt:cleanupInstaller'),
    onDownloadProgress: (cb: (pct: number) => void) => {
      const handler = (_: any, pct: number) => cb(pct)
      ipcRenderer.on('spt:downloadProgress', handler)
      return () => ipcRenderer.removeListener('spt:downloadProgress', handler)
    }
  },
  update: {
    downloadLauncher: (url: string)               => ipcRenderer.invoke('update:downloadLauncher', url),
    onProgress:       (cb: (pct: number) => void) => {
      const handler = (_: any, pct: number) => cb(pct)
      ipcRenderer.on('update:progress', handler)
      return () => ipcRenderer.removeListener('update:progress', handler)
    }
  }
})
