/**
 * images.ts — turn picked, pasted or dropped pictures into data URLs the model can read.
 * Big pictures are scaled down first (vision models don't need more, and it keeps chats small).
 */
import { CHAT_LIMITS, isImageDataUrl } from '@shared/ipc'

const MAX_SIDE = 1600
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export const IMAGE_ACCEPT = ACCEPTED.join(',')

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/** One picture as a data URL, scaled to at most 1600 px on its long side. */
export async function toImageDataUrl(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error(`"${file.name}" is not a PNG, JPEG, WebP or GIF picture.`)
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const original = scale === 1 && file.type !== 'image/gif' ? await readAsDataUrl(file) : null
  if (original && original.length <= CHAT_LIMITS.maxImageChars / 2) {
    bitmap.close()
    return original
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // Screenshots stay PNG (sharp text); photos become JPEG (much smaller).
  let url = file.type === 'image/png' ? canvas.toDataURL('image/png') : ''
  if (!url || url.length > CHAT_LIMITS.maxImageChars / 2) url = canvas.toDataURL('image/jpeg', 0.85)
  if (!isImageDataUrl(url)) throw new Error(`"${file.name}" is too large.`)
  return url
}

/** The pictures among some files (from a picker, a paste or a drop). */
export const pictureFiles = (files: FileList | File[] | null | undefined): File[] => [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
