import React, { useEffect, useState, useCallback } from 'react'
import type { ModSyncEntry } from '@shared/types'

// Файлы, которые не трогаем — не скачиваем и не обновляем
const BLACKLIST = ['Fika.Headless.dll', 'QuestMod.dll']
const isBlacklisted = (filename: string) =>
  BLACKLIST.some(b => filename === b || filename.endsWith('/' + b))

interface Props {
  gamePath: string
  serverUrl: string
  onDone: () => void
}

type SyncState = 'checking' | 'ready' | 'syncing' | 'done' | 'error'

export default function SyncScreen({ gamePath, serverUrl, onDone }: Props) {
  const [state,    setState]    = useState<SyncState>('checking')
  const [mods,     setMods]     = useState<ModSyncEntry[]>([])
  const [current,  setCurrent]  = useState('')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const checkMods = useCallback(async () => {
    setState('checking')
    setErrorMsg('')
    try {
      const [manifest, local] = await Promise.all([
        window.api.mods.fetchManifest(serverUrl),
        window.api.mods.scanLocal(gamePath)
      ])
      const localMap = new Map(local.map(m => [`${m.folder}/${m.filename}`, m]))
      const result: ModSyncEntry[] = manifest.mods.map(m => {
        const key = `${m.folder}/${m.filename}`
        const loc = localMap.get(key)
        // Заблокированные файлы всегда показываем как 'locked' — не трогаем
        if (isBlacklisted(m.filename)) {
          return { ...m, status: 'locked' as any, localHash: loc?.hash }
        }
        const status = !loc ? 'missing' : loc.hash !== m.hash ? 'outdated' : 'ok'
        return { ...m, status, localHash: loc?.hash }
      })
      setMods(result)
      setState('ready')
    } catch (e: any) {
      setErrorMsg('Не удалось подключиться: ' + (e?.message ?? e))
      setState('error')
    }
  }, [gamePath, serverUrl])

  useEffect(() => { checkMods() }, [checkMods])

  const syncMods = async () => {
    const toUpdate = mods.filter(m => m.status === 'missing' || m.status === 'outdated')
    if (!toUpdate.length) { onDone(); return }
    setState('syncing')
    for (let i = 0; i < toUpdate.length; i++) {
      const mod = toUpdate[i]
      setCurrent(`${mod.folder}/${mod.filename}`)
      setProgress(Math.round((i / toUpdate.length) * 100))
      try {
        await window.api.mods.download(serverUrl, gamePath, mod.folder, mod.filename)
        setMods(prev => prev.map(m =>
          m.filename === mod.filename && m.folder === mod.folder
            ? { ...m, status: 'ok' } : m
        ))
      } catch (e: any) {
        setErrorMsg(`Ошибка загрузки ${mod.filename}: ` + (e?.message ?? e))
        setState('error'); return
      }
    }
    setProgress(100); setCurrent('')
    setState('done')
    setTimeout(onDone, 1200)
  }

  // locked не попадает в очередь обновления
  const needsUpdate = mods.filter(m => m.status === 'missing' || m.status === 'outdated')
  const okCount     = mods.filter(m => m.status === 'ok').length

  const statusLabel = (s: string) => {
    switch (s) {
      case 'ok': return 'OK'
      case 'missing': return 'ОТСУТСТВУЕТ'
      case 'outdated': return 'ОБНОВИТЬ'
      case 'locked': return '🔒 ЗАЩИЩЁН'
      default: return 'ЛИШНИЙ'
    }
  }

  return (
    <div className="sync-screen screen">

      {/* Stats bar */}
      <div className="sync-stats-bar">
        <div className="glass-panel sync-stat-card">
          <div className="sync-stat-icon ok">&#10003;</div>
          <div className="sync-stat-info">
            <span className="sync-stat-value">{okCount}</span>
            <span className="sync-stat-label">Актуальных</span>
          </div>
        </div>
        <div className="glass-panel sync-stat-card">
          <div className="sync-stat-icon warn">&#9888;</div>
          <div className="sync-stat-info">
            <span className="sync-stat-value">{needsUpdate.length}</span>
            <span className="sync-stat-label">Обновить</span>
          </div>
        </div>
        <div className="glass-panel sync-stat-card">
          <div className="sync-stat-icon total">&#9776;</div>
          <div className="sync-stat-info">
            <span className="sync-stat-value">{mods.length}</span>
            <span className="sync-stat-label">Всего</span>
          </div>
        </div>
      </div>

      {/* Mod list */}
      <div className="glass-panel sync-list-panel">
        <div className="panel-header sync-list-header">
          <span className="panel-title">Файлы модов</span>
          <span className="sync-count">{mods.length} файлов</span>
        </div>
        <div className="sync-list">
          {state === 'checking' && (
            <div className="sync-loading">
              <div className="sync-spinner" />
              <span>Сканирование модов...</span>
            </div>
          )}
          {mods.map((m, i) => (
            <div key={i} className={`sync-item sync-item--${m.status}`}>
              <div className={`status-dot ${m.status}`} />
              <div className="sync-item-info">
                <span className="sync-item-name">{m.filename.includes('/') ? m.filename.split('/').pop() : m.filename}</span>
                <span className="sync-item-folder">{m.folder}{m.filename.includes('/') ? '/' + m.filename.substring(0, m.filename.lastIndexOf('/')) : ''}</span>
              </div>
              <span className={`sync-item-badge badge--${m.status}`}>
                {statusLabel(m.status)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress */}
      {state === 'syncing' && (
        <div className="glass-panel sync-progress-panel">
          <div className="panel-body">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-label">{progress}% &mdash; {current}</div>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div className="sync-done-msg">
          <span className="status-dot ok" />
          Все моды актуальны
        </div>
      )}

      {errorMsg && <div className="sync-error">{errorMsg}</div>}

      {/* Bottom actions */}
      <div className="sync-bottom">
        <div />
        <div className="sync-btn-group">
          {state === 'error' && (
            <button className="btn" onClick={checkMods}>Повтор</button>
          )}
          {state === 'ready' && needsUpdate.length > 0 && (
            <button className="btn btn-primary" onClick={syncMods}>
              Обновить ({needsUpdate.length})
            </button>
          )}
          {state === 'ready' && needsUpdate.length === 0 && (
            <button className="btn btn-primary" onClick={onDone}>
              Играть
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
