import axios from 'axios'
import { runtime } from '../stores/settings'

export interface AcctCtx { id: string; baseUrl: string; token: string }

export class GlError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 并发门闩 */
let active = 0
const queue: Array<() => void> = []
function gate<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      active++
      try { resolve(await fn()) } catch (e) { reject(e) } finally {
        active--
        queue.shift()?.()
      }
    }
    if (active < runtime.concurrency) run()
    else queue.push(run)
  })
}

const http = axios.create({})

function normalizeMessage(status: number, data: any): string {
  if (!data) return `HTTP ${status}`
  if (typeof data === 'string') return data.slice(0, 200)
  return data.message || data.error || data.error_description || JSON.stringify(data).slice(0, 200)
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

export interface GlOpts {
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch'
  params?: Record<string, any>
  data?: any
  raw?: boolean
  withTotal?: boolean
}

export interface Paged<T> { rows: T[]; total: number; page: number; pages: number }

/** 路径参数编码：group/sub/proj -> group%2Fsub%2Fproj */
export function encId(id: string | number): string {
  const s = String(id)
  if (/^\d+$/.test(s)) return s
  return s.split('/').map(encodeURIComponent).join('%2F')
}

export function gl<T = any>(a: AcctCtx, path: string, opt: GlOpts = {}): Promise<any> {
  return gate(async () => {
    const url = `${a.baseUrl.replace(/\/+$/, '')}/api/v4${path}`
    const method = opt.method || 'get'
    let attempt = 0
    for (;;) {
      try {
        const resp = await http.request({
          url,
          method,
          params: method === 'get' ? opt.params : undefined,
          data: opt.data,
          timeout: runtime.timeout,
          headers: { 'PRIVATE-TOKEN': a.token, 'Content-Type': 'application/json' },
          responseType: opt.raw ? 'text' : 'json',
          transformResponse: opt.raw ? [(d) => d] : undefined,
          validateStatus: (s) => s >= 200 && s < 300
        })
        if (opt.withTotal) {
          return {
            rows: resp.data,
            total: Number(resp.headers['x-total'] ?? (Array.isArray(resp.data) ? resp.data.length : 0)),
            page: Number(resp.headers['x-page'] || 1),
            pages: Number(resp.headers['x-total-pages'] || 1)
          } as T
        }
        return resp.data as T
      } catch (e: any) {
        const status = e?.response?.status || 0
        if ((status === 429 || status >= 500) && attempt < runtime.retries) {
          const ra = Number(e?.response?.headers?.['retry-after'] || 0)
          await sleep(Math.max(ra * 1000, 500 * Math.pow(2, attempt)))
          attempt++
          continue
        }
        if (status === 401) throw new GlError(401, '访问令牌无效或已过期')
        if (status === 403) throw new GlError(403, '没有权限：' + normalizeMessage(status, e?.response?.data))
        if (status === 404) throw new GlError(404, '资源不存在或无权访问')
        if (status === 0) throw new GlError(0, '网络错误或请求超时')
        throw new GlError(status, normalizeMessage(status, e?.response?.data))
      }
    }
  })
}
