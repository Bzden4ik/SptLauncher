import React, { useEffect, useState, useCallback, useMemo } from 'react'
import type { ModSyncEntry, ModStatus } from '@shared/types'
import { DEFAULT_PROTECTED_PATTERNS, isProtectedByPattern } from '@shared/types'
import { useI18n } from '../i18n'

interface Props { gamePath: string; serverUrl: string; onDone: () => void }
type SyncState = 'checking' | 'ready' | 'syncing' | 'done' | 'error'
type Filter = 'all' | 'needs' | 'ok' | 'skipped'

const SKIPPED_KEY = 'skippedMods'
const DL_CONCURRENCY = 4   // matches the main-process keepAlive socket cap
const keyForEntry = (m: ModSyncEntry) => `${m.folder}/${m.filename}`
const basename = (p: string) => { const i = p.lastIndexOf('/'); return i >= 0 ? p.slice(i + 1) : p }
const dirname  = (p: string) => { const i = p.lastIndexOf('/'); return i >= 0 ? p.slice(0, i) : '' }
const humanSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

interface Counts { ok: number; missing: number; outdated: number; skipped: number; extra: number; total: number }
interface TFile { type: 'file'; entry: ModSyncEntry }
interface TFolder { type: 'folder'; name: string; path: string; children: (TFile | TFolder)[]; counts: Counts }
const emptyCounts = (): Counts => ({ ok: 0, missing: 0, outdated: 0, skipped: 0, extra: 0, total: 0 })

function buildTree(mods: ModSyncEntry[]): TFolder[] {
  const root: TFolder = { type: 'folder', name: '', path: '', children: [], counts: emptyCounts() }
  for (const m of mods) {
    const segs = [m.folder, ...m.filename.split('/')]
    let node = root
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i], p = segs.slice(0, i + 1).join('/')
      let child = node.children.find(c => c.type === 'folder' && c.name === seg) as TFolder | undefined
      if (!child) { child = { type: 'folder', name: seg, path: p, children: [], counts: emptyCounts() }; node.children.push(child) }
      node = child
    }
    node.children.push({ type: 'file', entry: m })
  }
  computeCounts(root); sortNode(root)
  return root.children.filter(c => c.type === 'folder') as TFolder[]
}
function computeCounts(f: TFolder): Counts {
  const c = emptyCounts()
  for (const ch of f.children) {
    if (ch.type === 'file') {
      c.total++; const s = ch.entry.status
      if (s === 'ok' || s === 'protected') c.ok++; else if (s === 'missing') c.missing++; else if (s === 'outdated') c.outdated++; else if (s === 'skipped') c.skipped++; else if (s === 'extra') c.extra++
    } else { const cc = computeCounts(ch); c.ok += cc.ok; c.missing += cc.missing; c.outdated += cc.outdated; c.skipped += cc.skipped; c.extra += cc.extra; c.total += cc.total }
  }
  f.counts = c; return c
}
function sortNode(f: TFolder) {
  f.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    const an = a.type === 'folder' ? a.name : basename(a.entry.filename)
    const bn = b.type === 'folder' ? b.name : basename(b.entry.filename)
    return an.localeCompare(bn)
  })
  for (const ch of f.children) if (ch.type === 'folder') sortNode(ch)
}
function collectFiles(f: TFolder, out: ModSyncEntry[] = []): ModSyncEntry[] {
  for (const ch of f.children) { if (ch.type === 'file') out.push(ch.entry); else collectFiles(ch, out) }
  return out
}
function collectPaths(folders: TFolder[], out: string[] = []): string[] {
  for (const f of folders) { out.push(f.path); collectPaths(f.children.filter(c => c.type === 'folder') as TFolder[], out) }
  return out
}
function folderDot(c: Counts): ModStatus {
  if (c.missing > 0) return 'missing'; if (c.outdated > 0) return 'outdated'; if (c.extra > 0) return 'extra'
  if (c.total > 0 && c.skipped === c.total) return 'skipped'; return 'ok'
}
function modStats(tops: TFolder[]) {
  let total = 0, ok = 0, needs = 0, skipped = 0
  for (const top of tops) for (const ch of top.children) {
    total++
    let k: 'ok' | 'needs' | 'skipped'
    if (ch.type === 'file') { const s = ch.entry.status; k = (s === 'missing' || s === 'outdated' || s === 'extra') ? 'needs' : s === 'skipped' ? 'skipped' : 'ok' }
    else { const c = ch.counts; k = (c.missing + c.outdated + c.extra > 0) ? 'needs' : (c.total > 0 && c.skipped === c.total) ? 'skipped' : 'ok' }
    if (k === 'needs') needs++; else if (k === 'skipped') skipped++; else ok++
  }
  return { total, ok, needs, skipped }
}

function useStatusLabel() {
  const { t } = useI18n()
  return (s: ModStatus): string =>
    s === 'ok' ? t('badge.ok') : s === 'missing' ? t('badge.miss') : s === 'outdated' ? t('badge.upd') : s === 'skipped' ? t('badge.skip') : s === 'extra' ? t('badge.extra') : s === 'protected' ? t('badge.protected') : '—'
}

interface FileProps { entry: ModSyncEntry; depth: number; showPath?: boolean; skipped: Set<string>; onToggleFile: (m: ModSyncEntry) => void }
function FileView({ entry, depth, showPath, skipped, onToggleFile }: FileProps) {
  const { t } = useI18n()
  const label = useStatusLabel()
  const isSkip = skipped.has(keyForEntry(entry)); const dir = dirname(entry.filename)
  return (
    <div className={`row-file ${entry.status}`} style={{ paddingLeft: 16 + depth * 18 }}>
      <span className={`dot ${entry.status}`} />
      <div className="row-info">
        <span className="row-fname">{basename(entry.filename)}</span>
        <span className="row-meta">{showPath && <span className="tag">{entry.folder}{dir ? '/' + dir : ''}</span>}{humanSize(entry.size)}</span>
      </div>
      <span className="spacer" />
      <span className={`badge ${entry.status}`}>{label(entry.status)}</span>
      <button className={`skip${isSkip ? ' on' : ''}`} title={isSkip ? t('skip.enable') : t('skip.skip')} onClick={() => onToggleFile(entry)} />
    </div>
  )
}
interface FolderProps { folder: TFolder; depth: number; expanded: Set<string>; skipped: Set<string>; onToggleExpand: (p: string) => void; onToggleFile: (m: ModSyncEntry) => void; onToggleFolder: (f: TFolder) => void }
function FolderView({ folder, depth, expanded, skipped, onToggleExpand, onToggleFile, onToggleFolder }: FolderProps) {
  const { t } = useI18n()
  const open = expanded.has(folder.path), c = folder.counts
  const needsDl = c.missing + c.outdated, needsRm = c.extra
  const allSkip = c.total > 0 && c.skipped === c.total, someSkip = c.skipped > 0 && !allSkip
  return (
    <div>
      <div className="row-folder" style={{ paddingLeft: 16 + depth * 18 }} onClick={() => onToggleExpand(folder.path)}>
        <span className={`chev${open ? ' open' : ''}`}>▶</span>
        <span className={`dot ${folderDot(c)}`} />
        <span className="row-name">{folder.name}</span>
        <span className="row-count">{c.total}</span>
        <span className="spacer" />
        {needsDl > 0 && <span className="badge outdated">{t('badge.folderUpd', { n: needsDl })}</span>}
        {needsRm > 0 && <span className="badge extra">{t('badge.folderRm', { n: needsRm })}</span>}
        {needsDl === 0 && needsRm === 0 && (allSkip ? <span className="badge skipped">{t('badge.skip')}</span> : <span className="badge ok">{t('badge.ok')}</span>)}
        <button className={`skip${allSkip ? ' on' : someSkip ? ' partial' : ''}`} title={t('skip.folder')} onClick={e => { e.stopPropagation(); onToggleFolder(folder) }} />
      </div>
      {open && (
        <div className="children-in">
          {folder.children.map(ch => ch.type === 'folder'
            ? <FolderView key={'f:' + ch.path} folder={ch} depth={depth + 1} expanded={expanded} skipped={skipped} onToggleExpand={onToggleExpand} onToggleFile={onToggleFile} onToggleFolder={onToggleFolder} />
            : <FileView key={'x:' + keyForEntry(ch.entry)} entry={ch.entry} depth={depth + 1} skipped={skipped} onToggleFile={onToggleFile} />)}
        </div>
      )}
    </div>
  )
}

async function pool<T>(items: T[], limit: number, worker: (it: T) => Promise<void>, onTick: (d: number) => void) {
  let i = 0, done = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { await worker(items[i++]); onTick(++done) }
  }))
}

export default function LoadoutScreen({ gamePath, serverUrl, onDone }: Props) {
  const { t } = useI18n()
  const [state, setState]       = useState<SyncState>('checking')
  const [mods, setMods]         = useState<ModSyncEntry[]>([])
  const [skipped, setSkipped]   = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['plugins', 'patchers']))
  const [filter, setFilter]     = useState<Filter>('all')
  const [current, setCurrent]   = useState('')
  const [progress, setProgress] = useState(0)
  const [done, setDone]         = useState(0)
  const [total, setTotal]       = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const loadSkipped = useCallback(async (): Promise<Set<string>> => {
    const raw = await window.api.config.get(SKIPPED_KEY)
    return new Set(Array.isArray(raw) ? raw as string[] : [])
  }, [])
  const persistSkipped = useCallback(async (n: Set<string>) => { await window.api.config.set(SKIPPED_KEY, Array.from(n)) }, [])
  const recompute = (m: ModSyncEntry): ModStatus => m.localHash == null ? 'missing' : m.localHash !== m.hash ? 'outdated' : 'ok'

  const checkMods = useCallback(async () => {
    setState('checking'); setErrorMsg('')
    try {
      const skipSet = await loadSkipped(); setSkipped(skipSet)
      const patRaw = await window.api.config.get('protectedPatterns')
      const patterns = Array.isArray(patRaw) && patRaw.length ? patRaw as string[] : DEFAULT_PROTECTED_PATTERNS

      const [manifest, local] = await Promise.all([window.api.mods.fetchManifest(serverUrl), window.api.mods.scanLocal(gamePath)])
      const localMap = new Map(local.map(m => [`${m.folder}/${m.filename}`, m]))
      // top-level mod for each manifest entry → lets us tell "mod removed" from
      // "data generated inside a still-present mod".
      const liveMods = new Set(manifest.mods.map(m => `${m.folder}/${m.filename.split('/')[0]}`))

      const result: ModSyncEntry[] = manifest.mods.map(m => {
        const loc = localMap.get(`${m.folder}/${m.filename}`)
        const e: ModSyncEntry = { ...m, status: 'ok', localHash: loc?.hash }
        e.status = skipSet.has(keyForEntry(e)) ? 'skipped'
          : isProtectedByPattern(m.filename, patterns) ? 'protected'   // never overwrite save/data files
          : recompute(e)
        return e
      })

      // Stale files: present locally but no longer on the server.
      // Guarded by manifest.mods.length > 0 so a (successful) empty manifest, or
      // any glitch, can never trigger a mass wipe.
      if (manifest.mods.length > 0) {
        const mkeys = new Set(manifest.mods.map(m => `${m.folder}/${m.filename}`))
        for (const loc of local) {
          const key = `${loc.folder}/${loc.filename}`
          if (mkeys.has(key)) continue
          const topMod = `${loc.folder}/${loc.filename.split('/')[0]}`
          const status: ModStatus =
            skipSet.has(key) ? 'skipped'
            : isProtectedByPattern(loc.filename, patterns) ? 'protected'  // name says it's save/data
            : liveMods.has(topMod) ? 'protected'                          // generated inside a live mod
            : 'extra'                                                     // whole mod gone → removable
          result.push({ filename: loc.filename, folder: loc.folder, hash: loc.hash, size: loc.size, status, localHash: loc.hash })
        }
      }

      setMods(result); setState('ready')
    } catch (e: any) { setErrorMsg(t('lo.err.manifest', { e: e?.message ?? e })); setState('error') }
  }, [gamePath, serverUrl, loadSkipped, t])
  useEffect(() => { checkMods() }, [checkMods])

  const applySkip = async (keys: string[], skip: boolean) => {
    const ks = new Set(keys); const next = new Set(skipped)
    for (const k of keys) { if (skip) next.add(k); else next.delete(k) }
    setSkipped(next); await persistSkipped(next)
    setMods(prev => prev.map(m => ks.has(keyForEntry(m)) ? { ...m, status: skip ? 'skipped' : recompute(m) } : m))
  }
  const toggleFile = (m: ModSyncEntry) => { const k = keyForEntry(m); applySkip([k], !skipped.has(k)) }
  const toggleFolder = (f: TFolder) => {
    const keys = collectFiles(f).map(keyForEntry)
    const allSkip = keys.length > 0 && keys.every(k => skipped.has(k))
    applySkip(keys, !allSkip)
  }
  const toggleExpand = (p: string) => setExpanded(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })

  const syncMods = async () => {
    const toDl = mods.filter(m => m.status === 'missing' || m.status === 'outdated')
    const toRm = mods.filter(m => m.status === 'extra')
    type Op = { kind: 'dl' | 'rm'; m: ModSyncEntry }
    const ops: Op[] = [...toDl.map(m => ({ kind: 'dl' as const, m })), ...toRm.map(m => ({ kind: 'rm' as const, m }))]
    if (!ops.length) { onDone(); return }
    setState('syncing'); setProgress(0); setDone(0); setTotal(ops.length)
    try {
      await pool(ops, DL_CONCURRENCY,
        async (op) => {
          setCurrent(`${op.kind === 'rm' ? '− ' : ''}${op.m.folder}/${op.m.filename}`)
          if (op.kind === 'dl') await window.api.mods.download(serverUrl, gamePath, op.m.folder, op.m.filename)
          else await window.api.mods.removeExtra(gamePath, op.m.folder, op.m.filename)
        },
        (d) => { setDone(d); setProgress(Math.round((d / ops.length) * 100)) })
      const dlKeys = new Set(toDl.map(keyForEntry))
      const rmKeys = new Set(toRm.map(keyForEntry))
      setMods(prev => prev
        .filter(m => !rmKeys.has(keyForEntry(m)))
        .map(m => dlKeys.has(keyForEntry(m)) ? { ...m, status: 'ok' } : m))
      setProgress(100); setCurrent(''); setState('done'); setTimeout(onDone, 1000)
    } catch (e: any) { setErrorMsg(t('lo.err.download', { e: e?.message ?? e })); setState('error') }
  }

  const fullTree = useMemo(() => buildTree(mods), [mods])
  const ms = useMemo(() => modStats(fullTree), [fullTree])
  const filtered = useMemo(() => {
    switch (filter) {
      case 'needs':   return mods.filter(m => m.status === 'missing' || m.status === 'outdated' || m.status === 'extra')
      case 'ok':      return mods.filter(m => m.status === 'ok')
      case 'skipped': return mods.filter(m => m.status === 'skipped' || m.status === 'protected')
      default:        return mods
    }
  }, [mods, filter])
  const allPaths = useMemo(() => collectPaths(fullTree), [fullTree])
  const allOpen = allPaths.length > 0 && allPaths.every(p => expanded.has(p))
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(allPaths))

  return (
    <div className="loadout">
      <div className="loadout-head">
        <div className="lo-title">
          <span className="lo-pre">{t('lo.pre')}</span>
          <span className="lo-h">LOAD<b>OUT</b></span>
          <span className="lo-sub">{t('lo.sub')}</span>
        </div>
        <div className="gauge ok"><span className="k">{t('lo.g.acquired')}</span><span className="v">{String(ms.ok).padStart(2, '0')}</span><span className="s">{t('lo.g.acquired.sub')}</span></div>
        <div className="gauge pend"><span className="k">{t('lo.g.pending')}</span><span className="v">{String(ms.needs).padStart(2, '0')}</span><span className="s">{t('lo.g.pending.sub')}</span></div>
        <div className="gauge tot"><span className="k">{t('lo.g.total')}</span><span className="v">{String(ms.total).padStart(2, '0')}</span><span className="s">{t('lo.g.total.sub', { n: mods.length, s: ms.skipped })}</span></div>
      </div>

      <div className="lo-bar">
        <div className="seg">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{t('f.all')}</button>
          <button className={filter === 'needs' ? 'on' : ''} onClick={() => setFilter('needs')}>{t('f.needs')}</button>
          <button className={filter === 'ok' ? 'on' : ''} onClick={() => setFilter('ok')}>{t('f.ok')}</button>
          <button className={filter === 'skipped' ? 'on' : ''} onClick={() => setFilter('skipped')}>{t('f.skipped')}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {filter === 'all' && allPaths.length > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={toggleAll}>{allOpen ? t('lo.collapse') : t('lo.expand')}</button>
          )}
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
            {filter === 'all' ? t('lo.countMods', { n: ms.total }) : t('lo.countFiles', { n: filtered.length })}
          </span>
        </div>
      </div>

      <div className="manifest">
        <div className="manifest-h">
          <span className="t">{filter === 'all' ? t('lo.head.equip') : t('lo.head.files')}</span>
          <span className="meta">{t('lo.meta')}</span>
        </div>
        <div className="manifest-list">
          {state === 'checking' && <div className="loading"><span className="spinner" /><span style={{ fontFamily: 'var(--f-mono)', fontSize: 13 }}>{t('ui.scanning')}</span></div>}
          {state !== 'checking' && filter === 'all' && fullTree.length === 0 && <div className="empty">{t('ui.empty')}</div>}
          {state !== 'checking' && filter === 'all' && fullTree.length > 0 && fullTree.map(f => (
            <FolderView key={'f:' + f.path} folder={f} depth={0} expanded={expanded} skipped={skipped}
              onToggleExpand={toggleExpand} onToggleFile={toggleFile} onToggleFolder={toggleFolder} />
          ))}
          {state !== 'checking' && filter !== 'all' && (filtered.length === 0
            ? <div className="empty">{t('ui.empty')}</div>
            : filtered.map(m => <FileView key={'x:' + keyForEntry(m)} entry={m} depth={0} showPath skipped={skipped} onToggleFile={toggleFile} />))}
        </div>

        {state === 'syncing' && (
          <div className="provision">
            <div className="provision-track"><div className="provision-fill" style={{ width: `${progress}%` }} /></div>
            <div className="provision-txt"><span className="w">{current}</span><span>{done} / {total} · {progress}%</span></div>
          </div>
        )}
      </div>

      <div className="lo-foot">
        <div>
          {state === 'done' && <div className="lo-msg"><span className="dot ok" /> {t('lo.done')}</div>}
          {errorMsg && <div className="alert danger" style={{ maxWidth: 'none' }}>{errorMsg}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {state === 'error' && <button className="btn btn-ghost" onClick={checkMods}>{t('btn.retry')}</button>}
          {state === 'ready' && ms.needs > 0 && <button className="btn btn-primary" onClick={syncMods}>{t('lo.provision', { n: ms.needs })}</button>}
          {state === 'ready' && ms.needs === 0 && <button className="btn btn-primary" onClick={onDone}>{t('btn.deploy')}</button>}
        </div>
      </div>
    </div>
  )
}
