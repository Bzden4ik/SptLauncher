import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Lang = 'ru' | 'en'

type Dict = Record<string, string>

const RU: Dict = {
  'sector.deploy': 'СЕКТОР // ВЫСАДКА',
  'sector.loadout': 'СЕКТОР // СНАРЯЖЕНИЕ',
  'sector.intake': 'СЕКТОР // ПРИЁМ',
  'tbar.sub': 'ТАРКОВ // КОНТРОЛЬ МОДОВ',

  'dossier.operator': 'ОПЕРАТОР',
  'dossier.role': 'ПМК ОПЕРАТОР',
  'dossier.uplink': 'СВЯЗЬ',
  'dossier.spt': 'SPT',
  'dossier.server': 'СЕРВЕР',
  'common.unknown': 'НЕИЗВЕСТНО',

  'link.nolink': 'НЕТ СВЯЗИ',
  'link.scan': 'СКАН',

  'chan.label': 'КАНАЛЫ',
  'chan.deploy': 'ВЫСАДКА',
  'chan.loadout': 'СНАРЯГА',
  'chan.system': 'СИСТЕМА',
  'chan.console': 'РАЗВЕДКОНСОЛЬ v{v}',
  'chan.mod': 'МОД {v}',

  'banner.title': 'ДОСТУПНО ОБНОВЛЕНИЕ',
  'banner.sub': 'v{a} · текущая v{b}',
  'banner.notes': 'ЧТО НОВОГО',
  'banner.update': 'ОБНОВИТЬ',

  'comms.uplink': 'СВЯЗЬ',
  'comms.sptcore': 'ЯДРО SPT',
  'comms.mod': 'МОД',
  'audio.mute': 'Заглушить',
  'audio.unmute': 'Включить',

  'deploy.pre': 'ESCAPE FROM',
  'deploy.coords': 'ВЫСАДКА В РЕЙД · ОДИНОЧНЫЙ ТЕАТР',
  'deploy.core.deploy': 'В РЕЙД',
  'deploy.core.insert': 'ВЫСАДКА',
  'deploy.core.live': 'В РЕЙДЕ',
  'deploy.core.inraid': 'НА ЗАДАНИИ',
  'deploy.datum.spt': 'ЯДРО SPT',
  'deploy.datum.operator': 'ОПЕРАТОР',
  'deploy.datum.uplink': 'СВЯЗЬ',
  'deploy.uplink.est': 'УСТАНОВЛЕНА',
  'deploy.uplink.sev': 'ПОТЕРЯНА',
  'deploy.tip.nolink': 'Нет связи с сервером',
  'deploy.alert.patch': 'Assembly-CSharp.dll не пропатчен. Запусти SPT.Launcher.exe хотя бы раз, чтобы применить патч.',
  'launch.fail': 'Ошибка запуска',

  'lo.pre': 'ГРУЗОВОЙ МАНИФЕСТ',
  'lo.sub': 'мод = папка или одиночный .dll · обновление точечное',
  'lo.g.acquired': 'АКТУАЛЬНО',
  'lo.g.acquired.sub': 'в норме',
  'lo.g.pending': 'К СИНКУ',
  'lo.g.pending.sub': 'обновить / удалить',
  'lo.g.total': 'ВСЕГО',
  'lo.g.total.sub': '{n} файлов · {s} проп.',
  'f.all': 'Все',
  'f.needs': 'Нужно',
  'f.ok': 'OK',
  'f.skipped': 'Пропуски',
  'lo.collapse': 'Свернуть',
  'lo.expand': 'Развернуть',
  'lo.countMods': '{n} модов',
  'lo.countFiles': '{n} файлов',
  'lo.head.equip': 'Снаряжение',
  'lo.head.files': 'Файлы',
  'lo.meta': 'plugins / patchers · sha-256 · тумблер = пропуск',
  'ui.scanning': 'сканирую…',
  'ui.empty': 'пусто',
  'badge.ok': 'OK',
  'badge.miss': 'НЕТ',
  'badge.upd': 'ОБН',
  'badge.skip': 'ПРОПУСК',
  'badge.extra': 'УДАЛИТЬ',
  'badge.protected': 'ЗАЩИЩЁН',
  'badge.folderUpd': '{n} ОБН',
  'badge.folderRm': '{n} УДАЛ',
  'skip.enable': 'Включить',
  'skip.skip': 'Пропускать',
  'skip.folder': 'Пропускать весь мод',
  'lo.done': 'Снаряжение укомплектовано',
  'lo.err.download': 'Ошибка загрузки: {e}',
  'lo.err.manifest': 'Не удалось получить манифест: {e}',
  'btn.retry': 'Повтор',
  'lo.provision': 'Снарядить · {n}',
  'btn.deploy': 'В рейд',

  'intake.stamp': 'ПРИЁМ В РЕЙД · ТРЕБУЕТСЯ ДОПУСК',
  'intake.t1': 'ИНСТРУК',
  'intake.t2': 'ТАЖ',
  'intake.desc': 'Один раз настрой связь — дальше консоль ведёт всё сама.',
  'f.gamepath': 'Путь к игре',
  'f.gamepath.hint': 'Папка с EscapeFromTarkov.exe',
  'btn.browse': 'Обзор',
  'spt.nospt': 'Нет SPT?',
  'spt.download': 'Скачать installer',
  'spt.exists': 'Установщик скачан',
  'spt.run': 'Запустить',
  'spt.done': 'Готово',
  'f.server': 'Адрес сервера',
  'f.server.hint': 'URL SPT-сервера · https с самоподписанным сертификатом ок',
  'f.callsign': 'Позывной',
  'f.callsign.hint': 'Имя профиля на сервере',
  'err.pickgame': 'Укажи путь к игре',
  'err.pickname': 'Укажи позывной (имя профиля)',
  'err.generic': 'Ошибка: {e}',
  'btn.connect': 'Установить связь',
  'btn.connecting': 'Связь…',
  'intake.foot': 'SPT · РАЗВЕДКОНСОЛЬ',

  'cfg.title': 'КОНФИГ СИСТЕМЫ',
  'cfg.ambient': 'Окружающий сигнал',
  'cfg.muted': 'ЗАГЛУШЕНО',
  'cfg.ambient.hint': 'Convergence · фоновая композиция. Громкость и mute сохраняются между запусками.',
  'cfg.uplink': 'Связь',
  'btn.change': 'Изменить',
  'cfg.modsrc': 'Источник модов',
  'cfg.modsrc.hint': 'Все моды приходят с сервера — обычные из BepInEx\\plugins плюс клиентские из серверной LauncherMods (те, что ломают headless). Консоль раскладывает их в твои BepInEx\\plugins / patchers.',
  'cfg.protect': 'Защита данных',
  'cfg.protect.hint': 'Сейвы/прогресс не качаются, не перезаписываются и не удаляются. Срабатывает по шаблонам имени, по ручному тумблеру, и для файлов, появившихся внутри ещё живого мода. Шаблоны (через запятую):',
  'cfg.lang': 'Язык',

  'boot.title': 'СИСТЕМА ГОТОВА',
  'boot.skip': 'КЛИК — ПРОПУСТИТЬ'
}

const EN: Dict = {
  'sector.deploy': 'SECTOR // DEPLOY',
  'sector.loadout': 'SECTOR // LOADOUT',
  'sector.intake': 'SECTOR // INTAKE',
  'tbar.sub': 'TARKOV // MOD CONTROL',

  'dossier.operator': 'OPERATOR',
  'dossier.role': 'PMC OPERATOR',
  'dossier.uplink': 'UPLINK',
  'dossier.spt': 'SPT',
  'dossier.server': 'SERVER',
  'common.unknown': 'UNKNOWN',

  'link.nolink': 'NO LINK',
  'link.scan': 'SCAN',

  'chan.label': 'CHANNELS',
  'chan.deploy': 'DEPLOY',
  'chan.loadout': 'LOADOUT',
  'chan.system': 'SYSTEM',
  'chan.console': 'RECON CONSOLE v{v}',
  'chan.mod': 'MOD {v}',

  'banner.title': 'UPDATE AVAILABLE',
  'banner.sub': 'v{a} · current v{b}',
  'banner.notes': 'NOTES',
  'banner.update': 'UPDATE',

  'comms.uplink': 'UPLINK',
  'comms.sptcore': 'SPT CORE',
  'comms.mod': 'MOD',
  'audio.mute': 'Mute',
  'audio.unmute': 'Unmute',

  'deploy.pre': 'ESCAPE FROM',
  'deploy.coords': 'RAID INSERTION · SINGLE-PLAYER THEATRE',
  'deploy.core.deploy': 'DEPLOY',
  'deploy.core.insert': 'INSERT',
  'deploy.core.live': 'LIVE',
  'deploy.core.inraid': 'IN RAID',
  'deploy.datum.spt': 'SPT CORE',
  'deploy.datum.operator': 'OPERATOR',
  'deploy.datum.uplink': 'UPLINK',
  'deploy.uplink.est': 'ESTABLISHED',
  'deploy.uplink.sev': 'SEVERED',
  'deploy.tip.nolink': 'No server link',
  'deploy.alert.patch': 'Assembly-CSharp.dll is not patched. Run SPT.Launcher.exe at least once to apply the patch.',
  'launch.fail': 'Launch failed',

  'lo.pre': 'CARGO MANIFEST',
  'lo.sub': 'mod = a folder or a single .dll · per-file updates',
  'lo.g.acquired': 'ACQUIRED',
  'lo.g.acquired.sub': 'in sync',
  'lo.g.pending': 'PENDING',
  'lo.g.pending.sub': 'update / remove',
  'lo.g.total': 'TOTAL',
  'lo.g.total.sub': '{n} files · {s} skip.',
  'f.all': 'All',
  'f.needs': 'Needs',
  'f.ok': 'OK',
  'f.skipped': 'Skipped',
  'lo.collapse': 'Collapse',
  'lo.expand': 'Expand',
  'lo.countMods': '{n} mods',
  'lo.countFiles': '{n} files',
  'lo.head.equip': 'Equipment',
  'lo.head.files': 'Files',
  'lo.meta': 'plugins / patchers · sha-256 · toggle = skip',
  'ui.scanning': 'scanning…',
  'ui.empty': 'empty',
  'badge.ok': 'OK',
  'badge.miss': 'MISS',
  'badge.upd': 'UPD',
  'badge.skip': 'SKIP',
  'badge.extra': 'REMOVE',
  'badge.protected': 'PROTECTED',
  'badge.folderUpd': '{n} UPD',
  'badge.folderRm': '{n} RM',
  'skip.enable': 'Enable',
  'skip.skip': 'Skip',
  'skip.folder': 'Skip whole mod',
  'lo.done': 'Loadout provisioned',
  'lo.err.download': 'Download error: {e}',
  'lo.err.manifest': 'Failed to fetch manifest: {e}',
  'btn.retry': 'Retry',
  'lo.provision': 'Provision · {n}',
  'btn.deploy': 'Deploy',

  'intake.stamp': 'RAID INTAKE · CLEARANCE REQUIRED',
  'intake.t1': 'BRIEF',
  'intake.t2': 'ING',
  'intake.desc': 'Set up the link once — the console handles the rest.',
  'f.gamepath': 'Game path',
  'f.gamepath.hint': 'Folder containing EscapeFromTarkov.exe',
  'btn.browse': 'Browse',
  'spt.nospt': 'No SPT?',
  'spt.download': 'Download installer',
  'spt.exists': 'Installer downloaded',
  'spt.run': 'Run',
  'spt.done': 'Done',
  'f.server': 'Server uplink',
  'f.server.hint': 'SPT server URL · https with a self-signed cert is fine',
  'f.callsign': 'Callsign',
  'f.callsign.hint': 'Profile name on the server',
  'err.pickgame': 'Set the game path',
  'err.pickname': 'Set your callsign (profile name)',
  'err.generic': 'Error: {e}',
  'btn.connect': 'Establish link',
  'btn.connecting': 'Linking…',
  'intake.foot': 'SPT · RECON CONSOLE',

  'cfg.title': 'SYSTEM CONFIG',
  'cfg.ambient': 'Ambient signal',
  'cfg.muted': 'MUTED',
  'cfg.ambient.hint': 'Convergence · ambient track. Volume and mute persist between launches.',
  'cfg.uplink': 'Uplink',
  'btn.change': 'Change',
  'cfg.modsrc': 'Mod source',
  'cfg.modsrc.hint': "All mods come from the server — regular ones from BepInEx\\plugins plus client-only ones from the server's LauncherMods (the ones that break headless). The console places them into your BepInEx\\plugins / patchers.",
  'cfg.protect': 'Protected files',
  'cfg.protect.hint': 'Saves / progress are never downloaded, overwritten or deleted. Triggered by name patterns, the manual toggle, and any file that appears inside a still-present mod. Patterns (comma-separated):',
  'cfg.lang': 'Language',

  'boot.title': 'SYSTEM ONLINE',
  'boot.skip': 'CLICK TO SKIP'
}

const DICTS: Record<Lang, Dict> = { ru: RU, en: EN }

interface I18nValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue>({ lang: 'ru', setLang: () => {}, t: (k) => k })

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ru')

  useEffect(() => {
    window.api.config.get('lang').then(v => {
      if (v === 'en' || v === 'ru') setLangState(v)
    })
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    window.api.config.set('lang', l).catch(() => {})
  }, [])

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const d = DICTS[lang]
    return interpolate(d[key] ?? EN[key] ?? key, vars)
  }, [lang])

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n() { return useContext(I18nContext) }

/** Compact RU|EN segmented toggle. */
export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n()
  return (
    <div className={`lang-toggle${className ? ' ' + className : ''}`}>
      <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>RU</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  )
}
