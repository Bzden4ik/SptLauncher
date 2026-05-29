import React from 'react'
import { LangToggle } from '../i18n'

export default function TitleBar({ sector }: { sector?: string }) {
  return (
    <div className="tbar">
      <div className="tbar-id">
        <span className="tbar-glyph">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="9.5" strokeWidth="1" opacity="0.55" />
            <circle cx="11" cy="11" r="5" strokeWidth="1" />
            <path d="M11 1.5 L11 20.5 M1.5 11 L20.5 11" strokeWidth="0.6" opacity="0.4" />
            <circle cx="11" cy="11" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div>
          <div className="tbar-title">SPT<b>·</b>RECON</div>
          <div className="tbar-sub">{sector ?? 'TARKOV // MOD CONTROL'}</div>
        </div>
      </div>
      <div className="tbar-ctrls">
        <LangToggle />
        <button className="tbar-btn" onClick={() => window.api.window.minimize()} title="Minimize">─</button>
        <button className="tbar-btn" onClick={() => window.api.window.maximize()} title="Maximize">▢</button>
        <button className="tbar-btn x" onClick={() => window.api.window.close()} title="Close">✕</button>
      </div>
    </div>
  )
}
