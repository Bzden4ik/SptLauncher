import { useEffect, useState } from 'react'
import { ambientAudio } from './AmbientAudio'
import type { AudioSettings } from '@shared/types'

let initOnce = false

export function useAmbientAudio() {
  const [state, setState] = useState<AudioSettings>(ambientAudio.state)

  useEffect(() => {
    if (!initOnce) {
      initOnce = true
      ambientAudio.init()
    }
    return ambientAudio.subscribe(setState)
  }, [])

  return {
    volume:    state.volume,
    muted:     state.muted,
    setVolume: (v: number) => ambientAudio.setVolume(v),
    setMuted:  (m: boolean) => ambientAudio.setMuted(m),
    toggleMute: () => ambientAudio.toggleMute()
  }
}
