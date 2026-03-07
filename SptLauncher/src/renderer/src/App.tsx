import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import SetupScreen from './screens/SetupScreen'
import SyncScreen from './screens/SyncScreen'
import MainScreen from './screens/MainScreen'

type Screen = 'setup' | 'sync' | 'main'
type ServerStatus = 'unknown' | 'online' | 'offline'

export default function App() {
  const [screen,       setScreen]       = useState<Screen>('setup')
  const [gamePath,     setGamePath]     = useState('')
  const [serverUrl,    setServerUrl]    = useState('https://127.0.0.1:6969')
  const [username,     setUsername]     = useState('')
  const [serverStatus, setServerStatus] = useState<ServerStatus>('unknown')

  useEffect(() => {
    Promise.all([
      window.api.config.get('gamePath'),
      window.api.config.get('serverUrl'),
      window.api.config.get('username'),
    ]).then(([gp, su, un]) => {
      if (gp && su && un) {
        setGamePath(gp as string)
        setServerUrl(su as string)
        setUsername(un as string)
        setScreen('sync')
      }
    })
  }, [])

  const pingServer = useCallback(async (url: string) => {
    const ok = await window.api.server.ping(url)
    setServerStatus(ok ? 'online' : 'offline')
  }, [])

  useEffect(() => {
    if (screen === 'setup' || !serverUrl) return
    pingServer(serverUrl)
    const id = setInterval(() => pingServer(serverUrl), 15_000)
    return () => clearInterval(id)
  }, [screen, serverUrl, pingServer])

  const handleSetupDone = (gp: string, su: string, un: string) => {
    setGamePath(gp)
    setServerUrl(su)
    setUsername(un)
    setServerStatus('unknown')
    setScreen('sync')
  }

  const isInApp = screen !== 'setup'
  const statusLabel = serverStatus === 'online' ? 'Сервер онлайн'
    : serverStatus === 'offline' ? 'Сервер недоступен' : 'Проверка...'

  return (
    <div className="app-root">
      <TitleBar />

      {!isInApp ? (
        <SetupScreen onNext={handleSetupDone} />
      ) : (
        <>
          <div className="app-layout">
            <nav className="nav-sidebar">
              <div className="nav-items">
                <button
                  className={`nav-item ${screen === 'main' ? 'active' : ''}`}
                  onClick={() => setScreen('main')}
                >
                  <span className="nav-icon">&#9750;</span>
                  <span>ГЛАВНАЯ</span>
                </button>
                <button
                  className={`nav-item ${screen === 'sync' ? 'active' : ''}`}
                  onClick={() => setScreen('sync')}
                >
                  <span className="nav-icon">&#10227;</span>
                  <span>МОДЫ</span>
                </button>
              </div>
              <div className="nav-bottom">
                <button className="nav-item" onClick={() => setScreen('setup')}>
                  <span className="nav-icon">&#9881;</span>
                  <span>НАСТРОЙКИ</span>
                </button>
              </div>
            </nav>

            <div className="app-content">
              {screen === 'sync' && (
                <SyncScreen
                  gamePath={gamePath}
                  serverUrl={serverUrl}
                  onDone={() => setScreen('main')}
                />
              )}
              {screen === 'main' && (
                <MainScreen
                  gamePath={gamePath}
                  serverUrl={serverUrl}
                  username={username}
                  serverOnline={serverStatus === 'online'}
                />
              )}
            </div>
          </div>

          <div className="status-bar">
            <div className="status-left">
              <span className={`status-indicator ${serverStatus === 'online' ? 'online' : serverStatus === 'offline' ? 'offline' : ''}`} />
              <span className="status-text">{statusLabel}</span>
            </div>
            <div className="status-right">
              <span className="status-info">{username}</span>
              <span className="status-sep">|</span>
              <span className="status-info">{serverUrl}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
