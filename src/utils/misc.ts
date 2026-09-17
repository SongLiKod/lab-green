export function isMobile(): boolean {
  const ua = navigator.userAgent.toLowerCase()
  const androidNative = !!(window as any).AndroidBridge
  const small = window.innerWidth <= 768
  return androidNative || (ua.includes('android') && small) || small
}

export function isElectron(): boolean {
  return !!(window as any).electronAPI
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export function shortSha(sha?: string): string {
  return sha ? sha.slice(0, 8) : ''
}

export function fmtDate(s?: string | number): string {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function timeAgo(s?: string | number): string {
  if (!s) return '-'
  const t = new Date(s).getTime()
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  const d = Math.floor(h / 24)
  if (d < 30) return d + ' 天前'
  return fmtDate(s).slice(0, 10)
}

export function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function b64ToText(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export function textToB64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

export function isImage(name: string): boolean {
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(name || '')
}

export function pipelineTagType(s?: string): string {
  switch (s) {
    case 'success': return 'success'
    case 'failed': return 'danger'
    case 'running': case 'pending': return 'warning'
    case 'canceled': case 'skipped': return 'info'
    default: return 'primary'
  }
}
