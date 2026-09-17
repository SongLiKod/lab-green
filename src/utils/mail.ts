/** 邮箱提醒与找回：EmailJS REST 直发（用户显式配置，无自建后端）
 *  ① 设置/修改 PIN 时发送口令提醒邮件；② 忘记 PIN 时发送一次性验证码重置 */
import { sha256 } from './crypto'

const API = 'https://api.emailjs.com/api/v1.0/email/send'
const RKEY = 'labgreen_reset'

export interface EmailCfg {
  service: string; template: string; publicKey: string; to: string
  toVar?: string; subjectVar?: string; bodyVar?: string
}

function genCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]
  return String(n % 1000000).padStart(6, '0')
}

/** EmailJS 公开 REST 接口发送 */
export async function sendEmail(cfg: EmailCfg, subject: string, message: string): Promise<void> {
  if (!cfg.service || !cfg.template || !cfg.publicKey || !cfg.to) throw new Error('请先完整填写 EmailJS 配置与收件邮箱')
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: cfg.service,
      template_id: cfg.template,
      user_id: cfg.publicKey,
      template_params: {
        [cfg.toVar || 'to_email']: cfg.to,
        [cfg.subjectVar || 'subject']: subject,
        [cfg.bodyVar || 'message']: message
      }
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`邮件发送失败（HTTP ${res.status}）${text ? '：' + text.slice(0, 120) : ''}`)
  }
}

/** 设置/修改 PIN 时发送提醒邮件 */
export async function sendPinReminder(cfg: EmailCfg, pin: string): Promise<void> {
  await sendEmail(cfg, 'LabGreen 应用锁口令提醒', `你的应用锁 PIN 为：${pin}\n\n请妥善保管，忘记 PIN 可通过锁屏页邮箱验证码重置；清除本地数据后加密凭证将无法恢复。`)
}

/** 忘记 PIN：发送一次性验证码邮件，哈希与有效期存本地 */
export async function sendResetCode(cfg: EmailCfg): Promise<void> {
  const code = genCode()
  await sendEmail(cfg, 'LabGreen 重置口令验证码', `你的重置口令验证码为：${code}\n\n验证码 10 分钟内有效。如非本人操作，请忽略本邮件。`)
  const salt = genCode() + Date.now()
  const hash = await sha256(salt + ':' + code)
  localStorage.setItem(RKEY, JSON.stringify({ salt, hash, exp: Date.now() + 600000, tries: 0 }))
}

/** 校验验证码；成功返回 true 并清除 */
export async function verifyResetCode(code: string): Promise<boolean> {
  const raw = localStorage.getItem(RKEY)
  if (!raw) return false
  const rec = JSON.parse(raw)
  if (Date.now() > rec.exp) { localStorage.removeItem(RKEY); return false }
  if (rec.tries >= 5) { localStorage.removeItem(RKEY); return false }
  rec.tries++
  localStorage.setItem(RKEY, JSON.stringify(rec))
  const h = await sha256(rec.salt + ':' + code)
  if (h === rec.hash) { localStorage.removeItem(RKEY); return true }
  return false
}
