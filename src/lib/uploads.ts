import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyRequest } from 'fastify'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import type { AppDeps } from '../app.ts'
import { randomToken } from './crypto.ts'

export type StoredFile = {
  id: number
  user_id: number
  key: string
  kind: 'image' | 'file'
  original_name: string
  mime: string
  size: number
  sha256: string
  created_at: number
}

export class UploadError extends Error {
  readonly key: string
  constructor(key: string) {
    super(key)
    this.key = key
  }
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

export function uploadPath(deps: AppDeps, key: string): string {
  return join(deps.config.dataDir, 'uploads', key.slice(0, 2), key)
}

function save(deps: AppDeps, key: string, buf: Buffer): void {
  const p = uploadPath(deps, key)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, buf)
}

function insert(deps: AppDeps, f: Omit<StoredFile, 'id'>): StoredFile {
  const info = deps.db
    .prepare(
      `INSERT INTO files (user_id, key, kind, original_name, mime, size, sha256, created_at)
       VALUES (@user_id, @key, @kind, @original_name, @mime, @size, @sha256, @created_at)`,
    )
    .run(f)
  return { id: Number(info.lastInsertRowid), ...f }
}

function cleanName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f/\\]/g, '').slice(0, 200) || 'archivo'
}

/**
 * Imagen subida por el usuario: se verifica el tipo real por firma y se re-codifica a WEBP
 * (quita metadatos EXIF/GPS, limita dimensiones). Nunca se sirve el archivo original.
 */
export async function storeImage(
  deps: AppDeps,
  userId: number,
  buf: Buffer,
  originalName: string,
  opts: { maxDim?: number; square?: boolean } = {},
): Promise<StoredFile> {
  const type = await fileTypeFromBuffer(buf)
  if (!type || !IMAGE_TYPES.has(type.mime)) throw new UploadError('err.upload_not_image')
  const maxDim = opts.maxDim ?? 1600
  let out: Buffer
  try {
    const img = sharp(buf, { animated: type.mime === 'image/gif' || type.mime === 'image/webp', limitInputPixels: 50_000_000 })
      .rotate()
      .resize(opts.square ? { width: maxDim, height: maxDim, fit: 'cover' } : { width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    out = await img.webp({ quality: 85 }).toBuffer()
  } catch {
    throw new UploadError('err.upload_not_image')
  }
  const key = randomToken(18) + '.webp'
  save(deps, key, out)
  return insert(deps, {
    user_id: userId,
    key,
    kind: 'image',
    original_name: cleanName(originalName),
    mime: 'image/webp',
    size: out.length,
    sha256: createHash('sha256').update(out).digest('hex'),
    created_at: deps.now(),
  })
}

/** Archivo para un enlace tipo "Archivo": se guarda tal cual y se sirve siempre como descarga. */
export async function storeFile(deps: AppDeps, userId: number, buf: Buffer, originalName: string): Promise<StoredFile> {
  if (buf.length === 0) throw new UploadError('err.upload_empty')
  const type = await fileTypeFromBuffer(buf)
  const mime = type?.mime ?? 'application/octet-stream'
  const key = randomToken(18)
  save(deps, key, buf)
  return insert(deps, {
    user_id: userId,
    key,
    kind: 'file',
    original_name: cleanName(originalName),
    mime,
    size: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    created_at: deps.now(),
  })
}

export function findFile(deps: AppDeps, id: number): StoredFile | undefined {
  return deps.db.prepare('SELECT * FROM files WHERE id = ?').get(id) as StoredFile | undefined
}

export function findFileByKey(deps: AppDeps, key: string): StoredFile | undefined {
  return deps.db.prepare('SELECT * FROM files WHERE key = ?').get(key) as StoredFile | undefined
}

export function deleteStoredFile(deps: AppDeps, file: StoredFile): void {
  deps.db.prepare('DELETE FROM files WHERE id = ?').run(file.id)
  rmSync(uploadPath(deps, file.key), { force: true })
}

/** Borra del disco todos los archivos del usuario (la BD los borra en cascada) */
export function deleteUserFiles(deps: AppDeps, userId: number): void {
  const keys = deps.db.prepare('SELECT key FROM files WHERE user_id = ?').pluck().all(userId) as string[]
  for (const k of keys) rmSync(uploadPath(deps, k), { force: true })
}

export function imageUrl(key: string | null | undefined): string | null {
  return key ? `/_/u/${key}` : null
}

export type MultipartData = {
  fields: Record<string, string | string[]>
  files: { field: string; filename: string; buffer: Buffer }[]
}

/** Lee un formulario multipart completo; los archivos vacíos (input sin elegir) se ignoran. */
export async function readMultipart(req: FastifyRequest): Promise<MultipartData> {
  const fields: Record<string, string | string[]> = {}
  const files: MultipartData['files'] = []
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer()
      if (part.file.truncated) throw new UploadError('err.upload_too_big')
      if (buffer.length > 0) files.push({ field: part.fieldname, filename: part.filename, buffer })
    } else {
      const v = String(part.value ?? '')
      const prev = fields[part.fieldname]
      fields[part.fieldname] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
    }
  }
  return { fields, files }
}
