import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const ensureDir = async (dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true })
}

export const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)

    return true
  } catch {
    return false
  }
}

export const writeJson = async (path: string, data: unknown): Promise<void> => {
  await ensureDir(dirname(path))
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T

export const writeText = async (path: string, text: string): Promise<void> => {
  await ensureDir(dirname(path))
  await writeFile(path, text, 'utf8')
}

export const writeBuffer = async (path: string, data: Buffer | Uint8Array): Promise<void> => {
  await ensureDir(dirname(path))
  await writeFile(path, data)
}

export const sha256 = (data: Buffer | Uint8Array): string => createHash('sha256').update(data).digest('hex')
