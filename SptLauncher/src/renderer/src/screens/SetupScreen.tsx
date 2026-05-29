import React, { useState, useEffect } from 'react'
import { useI18n, LangToggle } from '../i18n'

interface Props { onNext: (gamePath: string, serverUrl: string, username: string) => void }
type InstallerState = 'idle' | 'exists' | 'downloading' | 'done'

export default function SetupScreen({ onNext }: Props) {
  const { t } = useI18n()
  const [gamePath, setGamePath]   = useState('')
  const [serverUrl, setServerUrl] = useState('https://127.0.0.1:6969')
  const [username, setUsername]   = useState('')
  const [checking, setChecking]   = useState(false)
  const [error, setError]         = useState('')
  const [inst, setInst]           = useState<InstallerState>('idle')
  const [dl, setDl]               = useState(0)
  const [appVer, setAppVer]       = useState('1.1.0')

  useEffect(() => {
    Promise.all([
      window.api.config.get('gamePath'), window.api.config.get('serverUrl'),
      window.api.config.get('username'), window.api.app.getVersion()
    ]).then(([gp, su, un, v]) => {
      if (gp) setGamePath(gp as string); if (su) setServerUrl(su as string)
      if (un) setUsername(un as string); setAppVer(v as string)
    })
    window.api.spt.installerExists().then(e => { if (e) setInst('exists') })
    return window.api.spt.onDownloadProgress(p => setDl(p < 0 ? dl : p))
  }, [])

  const pick = async () => { const p = await window.api.dialog.pickFolder(); if (p) setGamePath(p) }
  const connect = async () => {
    if (!gamePath) { setError(t('err.pickgame')); return }
    if (!username) { setError(t('err.pickname')); return }
    setChecking(true); setError('')
    try {
      await window.api.config.set('gamePath', gamePath)
      await window.api.config.set('serverUrl', serverUrl)
      await window.api.config.set('username', username)
      await window.api.spt.cleanupInstaller()
      onNext(gamePath, serverUrl, username)
    } catch (e: any) { setError(t('err.generic', { e: e?.message ?? e })) } finally { setChecking(false) }
  }

  return (
    <div className="setup">
      <div className="intake">
        <div className="intake-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="intake-stamp">{t('intake.stamp')}</div>
            <LangToggle />
          </div>
          <div className="intake-title">{t('intake.t1')}<b>{t('intake.t2')}</b></div>
          <div className="intake-desc">{t('intake.desc')}</div>
        </div>

        <div className="intake-body">
          <div className="field-grp">
            <label className="field-lab">{t('f.gamepath')}</label>
            <div className="field-row">
              <input className="field" value={gamePath} onChange={e => setGamePath(e.target.value)} placeholder="F:\EscapeFromTarkov" spellCheck={false} />
              <button className="btn btn-sm btn-ghost" onClick={pick}>{t('btn.browse')}</button>
            </div>
            <span className="field-hint">{t('f.gamepath.hint')}</span>
          </div>

          {!gamePath && (
            <div className="spt-hint">
              {inst === 'idle' && (<><span className="l">{t('spt.nospt')}</span>
                <button className="btn btn-sm btn-ghost" onClick={async () => { setInst('downloading'); setDl(0); try { await window.api.spt.downloadInstaller(); setInst('done') } catch (e: any) { setError(t('err.generic', { e: e?.message ?? e })); setInst('idle') } }}>{t('spt.download')}</button></>)}
              {inst === 'exists' && (<><span className="l">{t('spt.exists')}</span><button className="btn btn-sm btn-ghost" onClick={() => window.api.spt.openInstaller()}>{t('spt.run')}</button></>)}
              {inst === 'downloading' && (<><span className="l" style={{ flex: 0 }}>DL</span><div className="bar"><div className="f" style={{ width: dl >= 0 ? `${dl}%` : '100%' }} /></div><span className="l" style={{ flex: 0 }}>{dl >= 0 ? `${dl}%` : '…'}</span></>)}
              {inst === 'done' && (<><span className="l">{t('spt.done')}</span><button className="btn btn-sm btn-ghost" onClick={() => window.api.spt.openInstaller()}>{t('spt.run')}</button></>)}
            </div>
          )}

          <div className="intake-sep" />

          <div className="field-grp">
            <label className="field-lab">{t('f.server')}</label>
            <input className="field" value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder="https://127.0.0.1:6969" spellCheck={false} />
            <span className="field-hint">{t('f.server.hint')}</span>
          </div>

          <div className="intake-sep" />

          <div className="field-grp">
            <label className="field-lab">{t('f.callsign')}</label>
            <input className="field" value={username} onChange={e => setUsername(e.target.value)} placeholder="username" spellCheck={false} />
            <span className="field-hint">{t('f.callsign.hint')}</span>
          </div>

          {error && <div className="alert danger">{error}</div>}

          <div className="intake-actions">
            <button className="btn btn-primary" onClick={connect} disabled={checking}>{checking ? t('btn.connecting') : t('btn.connect')}</button>
          </div>
        </div>

        <div className="intake-foot"><span>{t('intake.foot')}</span><span>v{appVer}</span></div>
      </div>
    </div>
  )
}
