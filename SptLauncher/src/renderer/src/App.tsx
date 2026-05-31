import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import ReconMap from './components/ReconMap'
import SignalScope from './components/SignalScope'
import BootSequence from './components/BootSequence'
import SettingsOverlay from './components/SettingsOverlay'
import SetupScreen from './screens/SetupScreen'
import LoadoutScreen from './screens/SyncScreen'
import DeployScreen from './screens/MainScreen'
import { useAmbientAudio } from './audio/useAmbientAudio'
import { useI18n } from './i18n'

type Screen = 'setup' | 'loadout' | 'deploy'
type Ping = { ok: boolean | null; latencyMs: number }
interface ServerVersion {
  sptVersion: string; modVersion: string
  latestLauncherVersion: string; launcherDownloadUrl: string | null; releaseNotesUrl: string | null
}

interface GhUpdate { version: string; notes: string; htmlUrl: string; downloadUrl: string | null }

function gridRef(seed: number): string {
  const n = (s: number, m: number) => String(Math.floor((Math.sin(seed * s) * 0.5 + 0.5) * m)).padStart(3, '0')
  return `37T ${n(1.7, 900)} ${n(3.1, 900)}`
}

export default function App() {
  const { t } = useI18n()
  const [booting,      setBooting]      = useState(true)
  const [screen,       setScreen]       = useState<Screen>('setup')
  const [gamePath,     setGamePath]     = useState('')
  const [serverUrl,    setServerUrl]    = useState('https://127.0.0.1:6969')
  const [username,     setUsername]     = useState('')
  const [ping,         setPing]         = useState<Ping>({ ok: null, latencyMs: -1 })
  const [serverVer,    setServerVer]    = useState<ServerVersion | null>(null)
  const [appVer,       setAppVer]       = useState('1.1.0')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ghUpdate,     setGhUpdate]     = useState<GhUpdate | null>(null)
  const [updPct,       setUpdPct]       = useState<number | null>(null)

  const audio = useAmbientAudio()

  useEffect(() => {
    Promise.all([
      window.api.config.get('gamePath'),
      window.api.config.get('serverUrl'),
      window.api.config.get('username'),
      window.api.app.getVersion()
    ]).then(([gp, su, un, ver]) => {
      setAppVer(ver as string)
      if (gp && su && un) {
        setGamePath(gp as string); setServerUrl(su as string); setUsername(un as string)
        setScreen('loadout')
      }
    })
  }, [])

  const refresh = useCallback(async (url: string) => {
    const p = await window.api.server.ping(url)
    setPing(p as Ping)
    if (p.ok) { const v = await window.api.server.version(url); if (v) setServerVer(v as ServerVersion) }
  }, [])

  useEffect(() => {
    if (screen === 'setup' || !serverUrl) return
    refresh(serverUrl)
    const id = setInterval(() => refresh(serverUrl), 15_000)
    return () => clearInterval(id)
  }, [screen, serverUrl, refresh])

  const onSetupDone = (gp: string, su: string, un: string) => {
    setGamePath(gp); setServerUrl(su); setUsername(un)
    setPing({ ok: null, latencyMs: -1 }); setScreen('loadout')
  }

  // Check GitHub Releases for a newer launcher on launch.
  useEffect(() => {
    window.api.update.checkGithub().then(u => { if (u) setGhUpdate(u as GhUpdate) })
    return window.api.update.onProgress(p => setUpdPct(p < 0 ? null : p))
  }, [])

  const onUpdate = async () => {
    if (!ghUpdate) return
    if (ghUpdate.downloadUrl) {
      setUpdPct(0)
      try { await window.api.update.downloadLauncher(ghUpdate.downloadUrl) }
      catch (e) { console.error(e); setUpdPct(null) }
    } else {
      window.api.shell.openExternal(ghUpdate.htmlUrl)
    }
  }

  const pingTxt = ping.ok === null ? t('link.scan') : ping.ok ? `${ping.latencyMs}ms` : t('link.nolink')
  const linkCls = ping.ok ? 'live' : ping.ok === false ? 'dead' : ''
  const sector = screen === 'deploy' ? t('sector.deploy') : screen === 'loadout' ? t('sector.loadout') : t('sector.intake')

  return (
    <div className="console">
      <ReconMap />
      <div className="recon-grid" />
      <div className="recon-vignette" />

      <TitleBar sector={sector} />

      <span className="frame-mark tl" /><span className="frame-mark tr" />
      <span className="frame-mark bl" /><span className="frame-mark br" />
      <span className="frame-coord tl">{gridRef(11)}</span>
      <span className="frame-coord br">ALT 000 · BRG {Math.floor((Date.now() / 600) % 360)}</span>

      {screen === 'setup' ? (
        <SetupScreen onNext={onSetupDone} />
      ) : (
        <>
          <div className="console-body">
            <aside className="rail">
              <div className="dossier">
                <div className="dossier-tab">{t('dossier.operator')}</div>
                <div className="dossier-top">
                  <div className="dossier-sigil">{(username || '?').slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="dossier-name">{username || t('common.unknown')}</div>
                    <div className="dossier-role">{t('dossier.role')}</div>
                  </div>
                </div>
                <div className="dossier-rows">
                  <div className="dossier-row"><span className="k">{t('dossier.uplink')}</span><span className={`v ${linkCls}`}>{pingTxt}</span></div>
                  <div className="dossier-row"><span className="k">{t('dossier.spt')}</span><span className="v">{serverVer?.sptVersion ?? '—'}</span></div>
                  <div className="dossier-row"><span className="k">{t('dossier.server')}</span><span className="v">{serverUrl.replace(/^https?:\/\//, '')}</span></div>
                </div>
              </div>

              <nav className="channels">
                <div className="chan-label">{t('chan.label')}</div>
                <button className={`chan ${screen === 'deploy' ? 'on' : ''}`} onClick={() => setScreen('deploy')}>
                  <span className="num">CH.01</span><span className="nm">{t('chan.deploy')}</span>
                </button>
                <button className={`chan ${screen === 'loadout' ? 'on' : ''}`} onClick={() => setScreen('loadout')}>
                  <span className="num">CH.02</span><span className="nm">{t('chan.loadout')}</span>
                </button>
                <div className="spacer" />
                <button className="chan" onClick={() => setSettingsOpen(true)}>
                  <span className="num">CFG</span><span className="nm">{t('chan.system')}</span>
                </button>
                <div className="chan-foot">
                  <span className="ver">{t('chan.console', { v: appVer })}</span>
                  <span className="ver">{t('chan.mod', { v: serverVer?.modVersion ?? '—' })}</span>
                </div>
              </nav>
            </aside>

            <main className="stage">
              {ghUpdate && (
                <div className="banner">
                  <span className="dot ok" />
                  <div className="banner-t">
                    <div className="h">{t('banner.title')}</div>
                    <div className="s">{t('banner.sub', { a: ghUpdate.version, b: appVer })}</div>
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => window.api.shell.openExternal(ghUpdate.htmlUrl)}>{t('banner.notes')}</button>
                  <button className="btn btn-sm btn-primary" onClick={onUpdate}>
                    {updPct == null ? t('banner.update') : `${updPct}%`}
                  </button>
                </div>
              )}
              <div className="stage-inner" key={screen}>
                {screen === 'loadout' && <LoadoutScreen gamePath={gamePath} serverUrl={serverUrl} onDone={() => setScreen('deploy')} />}
                {screen === 'deploy'  && <DeployScreen gamePath={gamePath} serverUrl={serverUrl} username={username} serverOnline={ping.ok === true} sptVersion={serverVer?.sptVersion ?? null} />}
              </div>
            </main>
          </div>

          <div className="comms">
            <div className="comms-datums">
              <div className="datum"><span className="k">{t('comms.uplink')}</span><span className="v"><span className={`datum-dot ${linkCls}`} />{pingTxt}</span></div>
              <span className="comms-sep" />
              <div className="datum"><span className="k">{t('comms.sptcore')}</span><span className="v">{serverVer?.sptVersion ?? '—'}</span></div>
              <span className="comms-sep" />
              <div className="datum"><span className="k">{t('comms.mod')}</span><span className="v">{serverVer?.modVersion ?? '—'}</span></div>
            </div>

            <div />

            <div className="scope">
              <div className="scope-frame"><SignalScope muted={audio.muted || audio.volume === 0} /></div>
              <div className="scope-ctrls">
                <span className="scope-gain">{audio.muted ? 'MUTE' : `${Math.round(audio.volume * 100)}%`}</span>
                <button className={`scope-mute ${audio.muted ? 'muted' : ''}`} onClick={audio.toggleMute} title={audio.muted ? t('audio.unmute') : t('audio.mute')}>
                  {audio.muted ? '✕' : '♪'}
                </button>
              </div>
            </div>
          </div>

          <SettingsOverlay
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            serverUrl={serverUrl} gamePath={gamePath} username={username}
            onEditConnection={() => { setSettingsOpen(false); setScreen('setup') }}
          />
        </>
      )}

      {booting && <BootSequence onDone={() => setBooting(false)} />}
    </div>
  )
}
