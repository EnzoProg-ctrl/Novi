import { STUDY_MATERIALS_BUCKET, supabase } from './supabase'

/** Mirrors the bucket's allowed_mime_types and the materials.source_type check. */
const MIME_TO_SOURCE_TYPE = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'text/plain': 'text',
  'text/markdown': 'text',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
}

/** Matches the bucket's 50 MB file_size_limit. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

export const ACCEPTED_EXTENSIONS =
  '.pdf,.pptx,.ppt,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp,.heic'

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Some browsers report an empty or odd MIME type, so fall back to the extension
 * rather than rejecting a file the bucket would happily accept.
 */
function resolveSourceType(file) {
  const byMime = MIME_TO_SOURCE_TYPE[file.type]
  if (byMime) return byMime

  const ext = file.name.split('.').pop()?.toLowerCase()
  const byExt = {
    pdf: 'pdf',
    pptx: 'pptx', ppt: 'pptx',
    docx: 'docx', doc: 'docx',
    txt: 'text', md: 'text',
    png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', heic: 'image',
  }[ext]
  return byExt ?? null
}

/** Storage keys must be ASCII-safe; keep the extension so previews still work. */
function sanitizeFilename(name) {
  const dot = name.lastIndexOf('.')
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^.\w]/g, '') : ''
  return `${stem || 'material'}${ext}`
}

export function validateFile(file) {
  if (!file) return 'Choose a file first.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_FILE_BYTES) {
    return `That file is ${formatBytes(file.size)}. The limit is 50 MB.`
  }
  if (!resolveSourceType(file)) {
    return 'That file type is not supported yet. Try a PDF, slide deck, document, or image.'
  }
  return null
}

/**
 * Uploads the file, then records it in `materials`.
 *
 * Storage path follows the RLS convention `<user_id>/<material_id>/<filename>`,
 * so the storage policies can check the first folder segment against auth.uid().
 * If the database insert fails we remove the just-uploaded object, otherwise the
 * bucket would slowly collect files no row points at.
 */
export async function uploadMaterial({ userId, file, title, subjectId = null }) {
  const validationError = validateFile(file)
  if (validationError) throw new Error(validationError)

  const materialId = crypto.randomUUID()
  const storagePath = `${userId}/${materialId}/${sanitizeFilename(file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(STUDY_MATERIALS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false })

  if (uploadError) throw uploadError

  const { data, error: insertError } = await supabase
    .from('materials')
    .insert({
      id: materialId,
      user_id: userId,
      subject_id: subjectId,
      title: title?.trim() || file.name,
      source_type: resolveSourceType(file),
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      status: 'uploaded',
    })
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from(STUDY_MATERIALS_BUCKET).remove([storagePath])
    throw insertError
  }

  return data
}

export async function listMaterials(userId) {
  const { data, error } = await supabase
    .from('materials')
    .select('id, title, source_type, status, error_message, file_size_bytes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function deleteMaterial(material) {
  if (material.storage_path) {
    await supabase.storage.from(STUDY_MATERIALS_BUCKET).remove([material.storage_path])
  }
  const { error } = await supabase.from('materials').delete().eq('id', material.id)
  if (error) throw error
}

/**
 * Hands the material to the processing pipeline (extract, chunk, embed,
 * generate). Runs server-side in an Edge Function so the Gemini key never
 * reaches the browser.
 *
 * Takes ~15s, so callers generally fire this and let the dashboard show
 * progress rather than blocking the upload screen on it.
 */
export async function processMaterial(materialId) {
  const { data, error } = await supabase.functions.invoke('process-material', {
    body: { material_id: materialId },
  })
  if (error) throw error
  return data
}
