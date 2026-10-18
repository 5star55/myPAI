import type { PaiApi } from '@shared/ipc'

declare global {
  interface Window {
    pai: PaiApi
  }
}

export {}
