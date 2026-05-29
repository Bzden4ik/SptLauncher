import React, { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

const LINES: Array<{ t: string; tag: string; cls: string }> = [
  { t: 'recon.core',      tag: 'OK',   cls: 'ok'   },
  { t: 'ambient.signal',  tag: 'OK',   cls: 'ok'   },
  { t: 'chart.render',    tag: 'OK',   cls: 'ok'   },
  { t: 'server.uplink',   tag: 'SCAN', cls: 'stby' }
]

export default function BootSequence({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [out, setOut] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 1500)
    const t2 = setTimeout(onDone, 2050)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  const skip = () => onDone()

  return (
    <div className={`boot${out ? ' out' : ''}`} onClick={skip}>
      <div className="boot-inner">
        <div className="boot-glyph">
          <svg width="46" height="46" viewBox="0 0 46 46" fill="none" stroke="currentColor">
            <circle cx="23" cy="23" r="20" strokeWidth="1" opacity="0.5" />
            <circle cx="23" cy="23" r="13" strokeWidth="1" opacity="0.8" />
            <path d="M23 3 L23 43 M3 23 L43 23" strokeWidth="0.75" opacity="0.4" />
            <path d="M23 8 L27 23 L23 23 Z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="boot-lines">
          {LINES.map((l, i) => (
            <div className="boot-line" key={l.t} style={{ animationDelay: `${0.15 + i * 0.22}s` }}>
              <span>› {l.t}{' '}{'.'.repeat(Math.max(2, 22 - l.t.length))}</span>
              <span className={l.cls}>{l.tag}</span>
            </div>
          ))}
        </div>
        <div className="boot-title">{t('boot.title')}</div>
      </div>
      <div className="boot-skip">{t('boot.skip')}</div>
    </div>
  )
}
