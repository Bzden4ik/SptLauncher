import React, { useState, useEffect } from 'react'

interface Props {
  onNext: (gamePath: string, serverUrl: string, username: string) => void
}

type InstallerState = 'idle' | 'exists' | 'downloading' | 'done'

export default function SetupScreen({ onNext }: Props) {
  const [gamePath,       setGamePath]       = useState('')
  const [serverUrl,      setServerUrl]      = useState('https://127.0.0.1:6969')
  const [username,       setUsername]       = useState('')
  const [checking,       setChecking]       = useState(false)
  const [error,          setError]          = useState('')
  const [installerState, setInstallerState] = useState<InstallerState>('idle')
  const [dlProgress,     setDlProgress]     = useState(0)

  useEffect(() => {
    Promise.all([
      window.api.config.get('gamePath'),
      window.api.config.get('serverUrl'),
      window.api.config.get('username'),
    ]).then(([gp, su, un]) => {
      if (gp) setGamePath(gp as string)
      if (su) setServerUrl(su as string)
      if (un) setUsername(un as string)
    })

    window.api.spt.installerExists().then(exists => {
      if (exists) setInstallerState('exists')
    })

    const unsub = window.api.spt.onDownloadProgress(pct => {
      setDlProgress(pct < 0 ? dlProgress : pct)
    })
    return unsub
  }, [])

  const pickFolder = async () => {
    const p = await window.api.dialog.pickFolder()
    if (p) setGamePath(p)
  }

  const connect = async () => {
    if (!gamePath) { setError('Укажи путь к игре'); return }
    if (!username) { setError('Укажи имя профиля'); return }
    setChecking(true); setError('')
    try {
      await window.api.config.set('gamePath',  gamePath)
      await window.api.config.set('serverUrl', serverUrl)
      await window.api.config.set('username',  username)
      await window.api.spt.cleanupInstaller()
      onNext(gamePath, serverUrl, username)
    } catch (e: any) {
      setError('Ошибка: ' + (e?.message ?? e))
    } finally {
      setChecking(false)
    }
  }

  const handleDownload = async () => {
    setInstallerState('downloading')
    setDlProgress(0)
    try {
      await window.api.spt.downloadInstaller()
      setInstallerState('done')
    } catch (e: any) {
      setError('Ошибка загрузки: ' + (e?.message ?? e))
      setInstallerState('idle')
    }
  }

  const handleOpen = async () => {
    try {
      await window.api.spt.openInstaller()
    } catch (e: any) {
      setError('Ошибка запуска: ' + (e?.message ?? e))
    }
  }

  const showInstallerBtn = !gamePath

  return (
    <div className="setup-screen screen">
      <div className="setup-atmosphere" />
      <div className="setup-grid" />

      <div className="setup-card">
        <div className="setup-card-header">
          <div className="setup-logo">
            <span className="setup-logo-accent">SPT</span> Launcher
          </div>
          <div className="setup-subtitle">Escape From Tarkov</div>
        </div>

        <div className="setup-line" />

        <div className="glass-panel">
          <div className="panel-header">
            <div className="status-dot ok" />
            <span className="panel-title">Конфигурация</span>
          </div>
          <div className="panel-body setup-form">

            <div className="input-group">
              <label className="input-label">Путь к игре</label>
              <div className="input-row">
                <input
                  className="input-field"
                  value={gamePath}
                  onChange={e => setGamePath(e.target.value)}
                  placeholder="F:\EscapeFromTarkov"
                  spellCheck={false}
                />
                <button className="btn btn-sm" onClick={pickFolder}>Обзор</button>
              </div>
              <span className="input-hint">Папка с EscapeFromTarkov.exe</span>
            </div>

            {showInstallerBtn && (
              <div className="spt-installer-hint">
                {installerState === 'idle' && (
                  <button className="btn btn-spt-hint" onClick={handleDownload}>
                    Нету SPT?
                  </button>
                )}
                {installerState === 'exists' && (
                  <button className="btn btn-spt-hint btn-spt-hint--exists" onClick={handleOpen}>
                    Попробуй установить SPT
                  </button>
                )}
                {installerState === 'downloading' && (
                  <div className="spt-dl-progress">
                    <div className="spt-dl-bar">
                      <div className="spt-dl-fill" style={{ width: dlProgress >= 0 ? `${dlProgress}%` : '100%' }} />
                    </div>
                    <span className="spt-dl-label">
                      {dlProgress >= 0 ? `Загрузка... ${dlProgress}%` : 'Загрузка...'}
                    </span>
                  </div>
                )}
                {installerState === 'done' && (
                  <button className="btn btn-spt-hint btn-spt-hint--exists" onClick={handleOpen}>
                    Попробуй установить SPT
                  </button>
                )}
              </div>
            )}

            <div className="setup-divider" />

            <div className="input-group">
              <label className="input-label">Адрес сервера</label>
              <div className="input-row">
                <input
                  className="input-field"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                  placeholder="https://127.0.0.1:6969"
                  spellCheck={false}
                />
              </div>
              <span className="input-hint">URL SPT-сервера</span>
            </div>

            <div className="setup-divider" />

            <div className="input-group">
              <label className="input-label">Имя профиля</label>
              <div className="input-row">
                <input
                  className="input-field"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="username"
                  spellCheck={false}
                />
              </div>
              <span className="input-hint">Имя профиля на SPT сервере</span>
            </div>

            {error && <div className="setup-error">{error}</div>}

            <div className="setup-actions">
              <button className="btn btn-primary" onClick={connect} disabled={checking}>
                {checking ? 'Подключение...' : 'Подключиться'}
              </button>
            </div>

          </div>
        </div>

        <div className="setup-footer">
          SPT Launcher v1.0.0
        </div>
      </div>
    </div>
  )
}
