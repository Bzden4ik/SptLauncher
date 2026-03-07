import React from 'react'

export default function TitleBar() {
  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-brand">
          <span className="titlebar-logo">SPT</span>
          <span className="titlebar-name">Launcher</span>
        </div>
      </div>
      <div className="titlebar-controls">
        <button onClick={() => window.api.window.minimize()} title="Свернуть">&#x2500;</button>
        <button onClick={() => window.api.window.maximize()} title="Развернуть">&#x25A1;</button>
        <button className="close" onClick={() => window.api.window.close()} title="Закрыть">&#x2715;</button>
      </div>
    </div>
  )
}
