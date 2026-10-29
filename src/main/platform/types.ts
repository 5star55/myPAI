import type { FieldInfo, HelperReply } from '../compose/helper'

export type PlatformId = 'mac' | 'windows' | 'linux'

/** Reading and writing text boxes in other apps (needs a native helper). */
export interface TextAccess {
  /** True when the native helper exists and can run on this system. */
  available(): boolean
  /** What to tell the person when it isn't available. */
  unavailableMessage(): string
  readField(): Promise<FieldInfo>
  insertText(text: string): Promise<HelperReply>
  /** Is the system permission granted? prompt=true asks the system to show its own prompt. */
  isTrusted(prompt?: boolean): Promise<boolean>
  /** Open the system page where the person grants that permission. */
  openPermissionSettings(): Promise<void>
  stop(): void
}

export interface Platform {
  id: PlatformId
  /** What works on this system. Features check this and hide themselves when false. */
  supports: { completeText: boolean }
  /** Global hotkey for "Complete my text": the Electron accelerator and how to show it to people. */
  composeHotkey: { accelerator: string; label: string }
  text: TextAccess
}