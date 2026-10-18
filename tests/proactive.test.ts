import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stateStore } from '../src/main/store/state'
import { useProfile } from './helpers'

// The float window records offers; the active window is "Zoom".
const shown: { id: string; text: string }[] = []
vi.mock('../src/main/windows/floatWindow', () => ({
  getFloatWindow: () => ({ webContents: { send: (ch: string, o: { id: string; text: string }) => ch === 'offer:show' && shown.push(o) } }),
  setFloatExpanded: () => {}
}))
vi.mock('../src/main/proactive/activeWindow', () => ({
  pollActiveWindow: async () => ({ app: 'zoom.us', title: '', since: Date.now() }),
  forgetActiveWindow: () => {}
}))

const { refreshProactive, resetProactiveState, respondOffer, setChatSender } = await import('../src/main/proactive/engine')
const sent: string[] = []
setChatSender((t) => sent.push(t))

const tick = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
  shown.length = 0
  sent.length = 0
  useProfile([]) // proactive: true by default; Downloads not approved, so no watcher
  stateStore.set({ enabled: true, quietMode: false })
  resetProactiveState()
  refreshProactive()
})
afterEach(() => {
  stateStore.set({ enabled: false, quietMode: false })
  refreshProactive() // stop timers
  vi.useRealTimers()
})

describe('proactive offers', () => {
  it('offers help during a meeting; accept sends a normal chat message', async () => {
    await tick(10_000)
    expect(shown).toHaveLength(1)
    expect(shown[0].text).toMatch(/meeting/i)
    respondOffer(shown[0].id, 'accept')
    expect(sent).toEqual(['Remind me to write my meeting notes in 30 minutes'])
  })

  it('dismiss keeps that rule quiet for hours', async () => {
    await tick(10_000)
    respondOffer(shown[0].id, 'dismiss')
    await tick(60 * 60_000)
    expect(shown).toHaveLength(1)
  })

  it('snooze brings the offer back after 15 minutes', async () => {
    await tick(10_000)
    respondOffer(shown[0].id, 'snooze')
    await tick(10 * 60_000)
    expect(shown).toHaveLength(1)
    await tick(6 * 60_000)
    expect(shown).toHaveLength(2)
  })

  it('quiet mode and the off switch stop all offers', async () => {
    stateStore.set({ enabled: true, quietMode: true })
    refreshProactive()
    await tick(30_000)
    stateStore.set({ enabled: false, quietMode: false })
    refreshProactive()
    await tick(30_000)
    expect(shown).toHaveLength(0)
  })

  it('ignores answers for offers that are not showing', async () => {
    respondOffer('made-up-id', 'accept')
    expect(sent).toHaveLength(0)
  })
})
