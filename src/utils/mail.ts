/** 邮箱找回：通过 EmailJS REST（用户自备公钥，无自建后端）发送验证码，本地校验后重置 PIN */
import { sha256 } from './crypto'

const API = 'https://api.emailjs.com/api/v1.0/email/send'
const RKEY = 'labgreen_reset'

export interface EmailCfg { service: string; template: string; publicKey: string; to: string; toVar?: string; subjectVar?: string; bodyVar?: string }

function genCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]
  return String(n % 1000000).padStart(6, '0')
}

/** 发送验证码邮件；模板变量名可自定义（收件人/主题/正文），成功后把哈希与有效期存本地 */
export async function sendResetCode(cfg: EmailCfg): Promise<void> {
  if (!cfg.service || !cfg.template || !cfg.publicKey || !cfg.to) throw new Error('EmailJS 配置不完整')
  const code = genCode()
  const toVar = cfg.toVar || 'to_email'
  const subjectVar = cfg.subjectVar || 'subject'
  const bodyVar = cfg.bodyVar || 'message'
  const params: Record<string, string> = {
    [toVar]: cfg.to,
    [subjectVar]: 'LabGreen 找回密码验证码',
    [bodyVar]: `您的验证码是 ${code}，10 分钟内有效，请勿泄露给他人。`
  }
  const resp = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: cfg.service,
      template_id: cfg.template,
      user_id: cfg.publicKey,
      template_params: params
    })
  })
  if (!resp.ok) throw new Error('邮件发送失败：' + (await resp.text()).slice(0, 120))
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
  const h = await sha256(rec.salt + ':' + code.trim())
  if (h === rec.hash) { localStorage.removeItem(RKEY); return true }
  return false
}
