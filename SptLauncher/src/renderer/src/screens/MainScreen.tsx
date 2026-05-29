import React, { useState, useEffect } from 'react'
import { useI18n } from '../i18n'
import { ambientAudio } from '../audio/AmbientAudio'

interface Props {
  gamePath: string
  serverUrl: string
  username: string
  serverOnline: boolean
  sptVersion: string | null
}

function Ticks() {
  const ticks: React.ReactElement[] = []
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2
    const major = i % 9 === 0
    const r1 = 150, r2 = major ? 138 : 144
    const x1 = 160 + Math.cos(a) * r1, y1 = 160 + Math.sin(a) * r1
    const x2 = 160 + Math.cos(a) * r2, y2 = 160 + Math.sin(a) * r2
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? 'tick-major' : 'tick'} strokeWidth={major ? 1.4 : 0.8} />)
  }
  return <>{ticks}</>
}

export default function MainScreen({ gamePath, serverUrl, username, serverOnline, sptVersion }: Props) {
  const { t } = useI18n()
  const [launching, setLaunching] = useState(false)
  const [launched,  setLaunched]  = useState(false)
  const [patchWarn, setPatchWarn] = useState(false)
  const [error,     setError]     = useState('')
  const [typed,     setTyped]     = useState(false)

  useEffect(() => {
    const unsub = window.api.game.onExited(() => {
      setLaunched(false); setLaunching(false)
      ambientAudio.setGameRunning(false)   // game closed → lift the auto-mute
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!sptVersion) { setTyped(false); return }
    setTyped(false); const tm = setTimeout(() => setTyped(true), 380); return () => clearTimeout(tm)
  }, [sptVersion])

  const launch = async () => {
    const patched = await window.api.game.isPatchApplied(gamePath)
    if (!patched) { setPatchWarn(true); return }
    setPatchWarn(false); setError(''); setLaunching(true)
    try {
      await window.api.game.launch(gamePath, serverUrl, username)
      setLaunched(true); setLaunching(false)
      ambientAudio.setGameRunning(true)    // game launched → auto-mute (unless user already muted)
    } catch (e: any) { setError(e?.message ?? t('launch.fail')); setLaunching(false) }
  }

  const coreLabel = launched ? t('deploy.core.live') : launching ? '···' : t('deploy.core.deploy')
  const coreSub   = launched ? t('deploy.core.inraid') : t('deploy.core.insert')
  const sptDisplay = !serverOnline ? t('link.nolink') : (sptVersion ?? '····')

  return (
    <div className="deploy">
      <div className="deploy-main">
        <div className="deploy-heading">
          <div className="deploy-pre">{t('deploy.pre')}</div>
          <div className="deploy-title">TARKOV</div>
          <div className="deploy-coords">{t('deploy.coords')}</div>
        </div>

        <div className="compass">
          <div className="compass-sweep" />
          <svg viewBox="0 0 320 320">
            <circle className="ring-static" cx="160" cy="160" r="150" />
            <circle className="ring-static" cx="160" cy="160" r="118" opacity="0.5" />
            <g className="bearing">
              <circle className="ring-bear" cx="160" cy="160" r="150" strokeDasharray="2 10" opacity="0.7" />
              <Ticks />
            </g>
            <circle className="ring-static" cx="160" cy="160" r="96" opacity="0.3" strokeDasharray="1 7" />
            <text className="cardinal" x="160" y="26" textAnchor="middle">N</text>
            <text className="cardinal" x="160" y="302" textAnchor="middle">S</text>
            <text className="cardinal" x="300" y="164" textAnchor="middle">E</text>
            <text className="cardinal" x="20" y="164" textAnchor="middle">W</text>
          </svg>

          <button
            className={`deploy-core ${launched ? 'live' : ''}`}
            onClick={launch}
            disabled={launching || !serverOnline}
            title={!serverOnline ? t('deploy.tip.nolink') : undefined}
          >
            <span style={{ display: 'grid', placeItems: 'center' }}>
              <span className="lab">{coreLabel}</span>
              <span className="sub">{coreSub}</span>
            </span>
          </button>
        </div>

        <div className="deploy-alerts">
          {patchWarn && <div className="alert">{t('deploy.alert.patch')}</div>}
          {error && <div className="alert danger">{error}</div>}
        </div>
      </div>

      <div className="deploy-datums">
        <div className="deploy-datum">
          <span className="k">{t('deploy.datum.spt')}</span>
          <span className="v amber">{sptDisplay}{!typed && sptVersion && serverOnline && <span className="cur" />}</span>
        </div>
        <div className="deploy-datum">
          <span className="k">{t('deploy.datum.operator')}</span>
          <span className="v">{username}</span>
        </div>
        <div className="deploy-datum">
          <span className="k">{t('deploy.datum.uplink')}</span>
          <span className="v">{serverOnline ? t('deploy.uplink.est') : t('deploy.uplink.sev')}</span>
        </div>
      </div>
    </div>
  )
}
