import React, { useState, useEffect } from 'react'
import { useAmbientAudio } from '../audio/useAmbientAudio'
import { useI18n, LangToggle } from '../i18n'
import { DEFAULT_PROTECTED_PATTERNS } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
  serverUrl: string
  gamePath: string
  username: string
  onEditConnection: () => void
}

export default function SettingsOverlay({ open, onClose, serverUrl, gamePath, username, onEditConnection }: Props) {
  const { t } = useI18n()
  const { volume, muted, setVolume, toggleMute } = useAmbientAudio()
  const [patterns, setPatterns] = useState('')

  useEffect(() => {
    if (!open) return
    window.api.config.get('protectedPatterns').then(v => {
      setPatterns(Array.isArray(v) && v.length ? (v as string[]).join(', ') : DEFAULT_PROTECTED_PATTERNS.join(', '))
    })
  }, [open])

  const savePatterns = (txt: string) => {
    setPatterns(txt)
    const arr = txt.split(',').map(s => s.trim()).filter(Boolean)
    window.api.config.set('protectedPatterns', arr)
  }

  if (!open) return null
  const pct = Math.round(volume * 100)
  const sliderVal = muted ? 0 : pct
  return (
    <div className="overlay" onClick={onClose}>
      <div className="cfg" onClick={e => e.stopPropagation()}>
        <div className="cfg-h">
          <span className="t">{t('cfg.title')}</span>
          <button className="tbar-btn" onClick={onClose} title="✕">✕</button>
        </div>
        <div className="cfg-b">

          <div className="cfg-row">
            <div className="cfg-row-h">
              <span className="cfg-lab">{t('cfg.lang')}</span>
              <LangToggle />
            </div>
          </div>

          <div className="cfg-row">
            <div className="cfg-row-h">
              <span className="cfg-lab">{t('cfg.ambient')}</span>
              <span className="cfg-val">{muted ? t('cfg.muted') : `${pct}%`}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className={`scope-mute ${muted ? 'muted' : ''}`} onClick={toggleMute} title={muted ? t('audio.unmute') : t('audio.mute')}>{muted ? '✕' : '♪'}</button>
              <input type="range" min={0} max={100} className={`slider${muted ? ' muted' : ''}`} value={sliderVal}
                style={{ ['--p' as any]: `${sliderVal}%` }} onChange={e => setVolume(Number(e.target.value) / 100)} />
            </div>
            <div className="cfg-hint">{t('cfg.ambient.hint')}</div>
          </div>

          <div className="cfg-row">
            <div className="cfg-row-h">
              <span className="cfg-lab">{t('cfg.uplink')}</span>
              <button className="btn btn-sm btn-ghost" onClick={onEditConnection}>{t('btn.change')}</button>
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
              <div><span style={{ color: 'var(--ink-4)' }}>server  </span>{serverUrl}</div>
              <div><span style={{ color: 'var(--ink-4)' }}>game    </span>{gamePath}</div>
              <div><span style={{ color: 'var(--ink-4)' }}>callsign</span> {username}</div>
            </div>
          </div>

          <div className="cfg-row">
            <div className="cfg-row-h">
              <span className="cfg-lab">{t('cfg.modsrc')}</span>
              <span className="cfg-val">SERVER</span>
            </div>
            <div className="cfg-hint">{t('cfg.modsrc.hint')}</div>
          </div>

          <div className="cfg-row">
            <div className="cfg-row-h">
              <span className="cfg-lab">{t('cfg.protect')}</span>
              <span className="cfg-val">🛡</span>
            </div>
            <div className="cfg-hint">{t('cfg.protect.hint')}</div>
            <input className="field" value={patterns} spellCheck={false}
              style={{ fontSize: 12 }} onChange={e => savePatterns(e.target.value)} />
          </div>

        </div>
      </div>
    </div>
  )
}
