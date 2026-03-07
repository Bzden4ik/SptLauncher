import React, { useState, useMemo, useEffect } from 'react'

interface Props {
  gamePath: string
  serverUrl: string
  username: string
  serverOnline: boolean
}

export default function MainScreen({ gamePath, serverUrl, username, serverOnline }: Props) {
  const [launching,    setLaunching]    = useState(false)
  const [launched,     setLaunched]     = useState(false)
  const [patchWarning, setPatchWarning] = useState(false)
  const [launchError,  setLaunchError]  = useState('')

  const particles = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      delay: `${Math.random() * 20}s`,
      duration: `${18 + Math.random() * 24}s`,
      size: Math.random() > 0.5 ? 2 : 1,
    }))
  , [])

  useEffect(() => {
    const unsubscribe = window.api.game.onExited(() => {
      setLaunched(false)
      setLaunching(false)
    })
    return unsubscribe
  }, [])

  const launch = async () => {
    const patched = await window.api.game.isPatchApplied(gamePath)
    if (!patched) { setPatchWarning(true); return }
    setPatchWarning(false)
    setLaunchError('')
    setLaunching(true)
    try {
      await window.api.game.launch(gamePath, serverUrl, username)
      setLaunched(true)
      setLaunching(false)
    } catch (e: any) {
      setLaunchError(e?.message ?? 'Ошибка запуска')
      setLaunching(false)
    }
  }

  const btnClass = [
    'play-btn',
    launching && 'play-btn--launching',
    launched && 'play-btn--launched',
  ].filter(Boolean).join(' ')

  return (
    <div className="main-screen screen">
      <div className="main-atmosphere">
        <div className="main-atmosphere-base" />
        <div className="main-atmosphere-glow" />
        <div className="main-atmosphere-vignette" />
        <div className="main-noise" />
      </div>

      <div className="particles">
        {particles.map(p => (
          <span key={p.id} className="particle"
            style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, width: p.size, height: p.size }}
          />
        ))}
      </div>

      <div className="main-content">
        <div className="main-title-group">
          <span className="main-title-pre">Escape From</span>
          <span className="main-title-big">TARKOV</span>
          <div className="main-title-sub">
            <span className="main-title-line" />
            <span className="main-title-spt">Single Player</span>
            <span className="main-title-line" />
          </div>
        </div>

        <button
          className={btnClass}
          onClick={launch}
          disabled={launching || !serverOnline}
          title={!serverOnline ? 'Сервер недоступен' : undefined}
        >
          <span className="play-btn-text">
            {launched ? 'ЗАПУЩЕНО' : launching ? 'ВХОД...' : 'ИГРАТЬ'}
          </span>
        </button>

        {patchWarning && (
          <div className="main-patch-warning">
            ⚠ Assembly-CSharp.dll не пропатчен.<br />
            Запусти SPT.Launcher.exe хотя бы один раз, чтобы применить патч.
          </div>
        )}

        {launchError && (
          <div className="main-patch-warning">⚠ {launchError}</div>
        )}

        <div className="main-version-bar">
          <div className="main-version-item">
            <span className="main-version-label">Версия</span>
            <span className="main-version-value">SPT 4.0.12</span>
          </div>
          <span className="main-version-sep" />
          <div className="main-version-item">
            <span className="main-version-label">Профиль</span>
            <span className="main-version-value">{username}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
