/**
 * 내보내기/가져오기 모듈
 *
 * - OTP 데이터를 암호화된 .gw-otp 파일로 내보내기
 * - .gw-otp 파일에서 데이터를 복호화하여 가져오기
 *
 * 이 모듈은 순수 TypeScript이며 UI 관련 의존성이 없다.
 */

import type { BackupFile, OTPEntry, Tag } from '@/types'
import {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  bufferToBase64,
  base64ToBuffer,
} from '@/core/crypto'
import { loadEntries, loadTags, loadOrder, saveEntries, saveTags, saveOrder } from '@/core/storage'

/** 백업 파일 포맷 버전 */
const BACKUP_VERSION = 1

// ─── Export Types ────────────────────────────────────────────────────────────

interface ExportData {
  entries: OTPEntry[]
  tags: Tag[]
  order: string[]
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * 현재 저장된 모든 OTP 데이터를 암호화하여 BackupFile로 생성한다.
 *
 * @param password - 내보내기 비밀번호
 * @param sessionKey - 현재 세션의 CryptoKey (entries secret 복호화용)
 * @returns BackupFile 객체 (JSON 직렬화 가능)
 */
export async function createBackup(
  password: string,
  sessionKey: CryptoKey
): Promise<BackupFile> {
  // 1. 현재 데이터 로드
  const [entries, tags, order] = await Promise.all([
    loadEntries(),
    loadTags(),
    loadOrder(),
  ])

  // 2. entries의 encryptedSecret을 복호화하여 평문으로 변환
  const decryptedEntries: OTPEntry[] = await Promise.all(
    entries.map(async (entry) => {
      const plainSecret = await decrypt(entry.encryptedSecret, sessionKey)
      return { ...entry, encryptedSecret: plainSecret } // 임시로 평문 저장
    })
  )

  // 3. 전체 데이터를 JSON으로 직렬화
  const exportData: ExportData = {
    entries: decryptedEntries,
    tags,
    order,
  }
  const jsonData = JSON.stringify(exportData)

  // 4. 내보내기 비밀번호로 암호화
  const saltBytes = generateSalt()
  const key = await deriveKey(password, saltBytes)
  const encryptedData = await encrypt(jsonData, key)

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    salt: bufferToBase64(saltBytes),
    encryptedData,
  }
}

/**
 * BackupFile을 JSON 문자열로 변환하여 다운로드 가능한 Blob URL을 생성한다.
 *
 * @param backup - BackupFile 객체
 * @returns { url, filename } - 다운로드 URL과 파일명
 */
export function createDownloadURL(backup: BackupFile): {
  url: string
  filename: string
} {
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `gw-otp-backup-${date}.gw-otp`
  return { url, filename }
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * .gw-otp 파일을 파싱한다.
 *
 * @param fileContent - 파일 내용 (JSON 문자열)
 * @returns BackupFile 객체
 * @throws 형식이 잘못된 경우
 */
export function parseBackupFile(fileContent: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(fileContent)
  } catch {
    throw new Error('잘못된 백업 파일 형식입니다.')
  }

  const backup = parsed as BackupFile
  if (!backup || backup.version !== BACKUP_VERSION) {
    throw new Error(`지원하지 않는 백업 버전입니다: ${(backup as { version?: unknown })?.version}`)
  }
  if (!backup.salt || !backup.encryptedData) {
    throw new Error('백업 파일에 필수 데이터가 누락되었습니다.')
  }

  return backup
}

/**
 * BackupFile에서 데이터를 복호화하여 반환한다.
 *
 * @param backup - BackupFile 객체
 * @param password - 내보내기 시 사용한 비밀번호
 * @returns 복호화된 ExportData
 * @throws 비밀번호가 틀린 경우
 */
export async function decryptBackup(
  backup: BackupFile,
  password: string
): Promise<ExportData> {
  const saltBytes = base64ToBuffer(backup.salt)
  const key = await deriveKey(password, saltBytes)

  let jsonData: string
  try {
    jsonData = await decrypt(backup.encryptedData, key)
  } catch {
    throw new Error('비밀번호가 올바르지 않습니다.')
  }

  const data = JSON.parse(jsonData) as ExportData
  if (!Array.isArray(data.entries) || !Array.isArray(data.tags) || !Array.isArray(data.order)) {
    throw new Error('백업 데이터 구조가 올바르지 않습니다.')
  }

  return data
}

/**
 * 복호화된 백업 데이터를 현재 storage에 병합한다.
 * entries의 평문 secret을 현재 sessionKey로 재암호화하여 저장한다.
 *
 * @param data - 복호화된 ExportData (entries의 encryptedSecret은 실제 평문)
 * @param sessionKey - 현재 세션의 CryptoKey
 * @param mode - 'merge' (기존 유지 + 추가) 또는 'replace' (전체 교체)
 */
export async function importBackup(
  data: ExportData,
  sessionKey: CryptoKey,
  mode: 'merge' | 'replace' = 'merge'
): Promise<{ imported: number; skipped: number }> {
  // entries의 평문 secret을 현재 키로 재암호화
  const reEncryptedEntries: OTPEntry[] = await Promise.all(
    data.entries.map(async (entry) => {
      const encryptedSecret = await encrypt(entry.encryptedSecret, sessionKey)
      return { ...entry, encryptedSecret }
    })
  )

  if (mode === 'replace') {
    await saveEntries(reEncryptedEntries)
    await saveTags(data.tags)
    await saveOrder(data.order)
    return { imported: reEncryptedEntries.length, skipped: 0 }
  }

  // merge 모드: 기존 데이터 + 새 데이터 병합
  const [existingEntries, existingTags, existingOrder] = await Promise.all([
    loadEntries(),
    loadTags(),
    loadOrder(),
  ])

  const existingIds = new Set(existingEntries.map((e) => e.id))
  const newEntries = reEncryptedEntries.filter((e) => !existingIds.has(e.id))
  const skipped = reEncryptedEntries.length - newEntries.length

  // entries 병합
  const mergedEntries = [...existingEntries, ...newEntries]
  await saveEntries(mergedEntries)

  // tags 병합 (ID 기준 중복 제거)
  const existingTagIds = new Set(existingTags.map((t) => t.id))
  const newTags = data.tags.filter((t) => !existingTagIds.has(t.id))
  await saveTags([...existingTags, ...newTags])

  // order 병합 (새 항목 끝에 추가)
  const newOrderIds = newEntries.map((e) => e.id)
  await saveOrder([...existingOrder, ...newOrderIds])

  return { imported: newEntries.length, skipped }
}
