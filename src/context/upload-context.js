import { createContext, useContext } from 'react'

export const UploadContext = createContext(null)

/**
 * `openUpload()` shows the add-material pop-up from anywhere in the signed-in
 * app. `uploads` counts finished uploads, so a page listing materials can
 * reload when it changes.
 */
export function useUpload() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be used inside <UploadProvider>')
  return ctx
}
