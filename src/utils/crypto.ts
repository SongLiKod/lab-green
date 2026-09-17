/** 本地加密：随机 32 字节主密钥 MK，用设备密钥（PBKDF2 派生）AES-GCM 包装后存本机 */
const MK_KEY = 'labgreen_mk'
const SALT_KEY = 'labgreen_salt'
const DEVICE_SECRET = 'labgreen::device::v1'

let mkCache: CryptoKey | null = null

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deviceKey(salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(DEVICE_SECRET), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function getMK(): Promise<CryptoKey> {
  if (mkCache) return mkCache
  let salt = localStorage.getItem(SALT_KEY)
  let wrapped = localStorage.getItem(MK_KEY)
  if (!salt || !wrapped) {
    salt = b64(crypto.getRandomValues(new Uint8Array(16)))
    localStorage.setItem(SALT_KEY, salt)
  }
  const dk = await deviceKey(fromB64(salt))
  if (!wrapped) {
    const mkRaw = crypto.getRandomValues(new Uint8Array(32))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, dk, mkRaw as BufferSource)
    localStorage.setItem(MK_KEY, b64(iv) + ':' + b64(ct))
    mkCache = await crypto.subtle.importKey('raw', mkRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    return mkCache
  }
  const [ivB, ctB] = wrapped.split(':')
  const mkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB) as BufferSource }, dk, fromB64(ctB) as BufferSource)
  mkCache = await crypto.subtle.importKey('raw', mkRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return mkCache
}

export async function encText(plain: string): Promise<string> {
  const mk = await getMK()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, mk, new TextEncoder().encode(plain))
  return b64(iv) + ':' + b64(ct)
}

export async function decText(cipher: string): Promise<string> {
  const mk = await getMK()
  const [ivB, ctB] = cipher.split(':')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB) as BufferSource }, mk, fromB64(ctB) as BufferSource)
  return new TextDecoder().decode(pt)
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return b64(d)
}

/** 导出密钥材料（用于跨设备还原备份） */
export function exportKeyMaterial() {
  return { salt: localStorage.getItem(SALT_KEY), wrapped: localStorage.getItem(MK_KEY) }
}

export function importKeyMaterial(m: { salt: string; wrapped: string }) {
  if (m?.salt && m?.wrapped) {
    localStorage.setItem(SALT_KEY, m.salt)
    localStorage.setItem(MK_KEY, m.wrapped)
    mkCache = null
  }
}
