<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../stores/app'
import { useSettingsStore } from '../stores/settings'
import { sendResetCode, verifyResetCode } from '../utils/mail'
import { addLog } from '../utils/db'
import { ElMessage } from 'element-plus'

const app = useAppStore()
const settings = useSettingsStore()

const pin = ref('')
const fails = ref(0)
const cooldownUntil = ref(0)

async function submit() {
  if (Date.now() < cooldownUntil.value) return
  if (!pin.value) return
  const ok = await app.unlock(pin.value)
  if (ok) { pin.value = ''; fails.value = 0; return }
  fails.value++
  if (fails.value >= 5) { cooldownUntil.value = Date.now() + 60000; fails.value = 0 }
  ElMessage.error(fails.value >= 5 ? '失败过多，冷却 60 秒' : 'PIN 错误')
  pin.value = ''
}
const cooling = computed(() => Date.now() < cooldownUntil.value)

/* ---------- 邮箱验证码重置 PIN ---------- */
const mailMode = ref(false)
const code = ref('')
const newPin = ref('')
const sendTip = ref('')
const sending = ref(false)
const cdSec = ref(0)
let cdTimer: number

const emailReady = computed(() => settings.s.emailEnabled && settings.s.emailService && settings.s.emailTemplate && settings.s.emailPublicKey && settings.s.emailTo)

async function sendCode() {
  sending.value = true
  try {
    await sendResetCode({
      service: settings.s.emailService, template: settings.s.emailTemplate, publicKey: settings.s.emailPublicKey, to: settings.s.emailTo,
      toVar: settings.s.emailToVar, subjectVar: settings.s.emailSubjectVar, bodyVar: settings.s.emailBodyVar
    })
    sendTip.value = '验证码已发送，10 分钟内有效'
    addLog('设置', '发送邮箱找回验证码', 'warn')
    cdSec.value = 60
    clearInterval(cdTimer)
    cdTimer = window.setInterval(() => { cdSec.value--; if (cdSec.value <= 0) clearInterval(cdTimer) }, 1000)
  } catch (e: any) { sendTip.value = e.message } finally { sending.value = false }
}
async function resetByCode() {
  if (!/^\d{6}$/.test(code.value)) return ElMessage.warning('请输入 6 位验证码')
  if (!/^\d{4,8}$/.test(newPin.value)) return ElMessage.warning('新 PIN 需为 4-8 位数字')
  const ok = await verifyResetCode(code.value)
  if (!ok) return ElMessage.error('验证码错误或已过期')
  await app.setPin(newPin.value)
  app.locked = false
  mailMode.value = false
  addLog('设置', '通过邮箱验证码重置 PIN', 'warn')
  ElMessage.success('PIN 已重置')
}
</script>

<template>
  <div class="lock-wrap">
    <div class="lock-card">
      <template v-if="!mailMode">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="#16a34a"><path d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z"/></svg>
        <div class="lock-title">LabGreen 已锁定</div>
        <input v-model="pin" type="password" class="lock-input" placeholder="输入 PIN 解锁" @keyup.enter="submit" :disabled="cooling" />
        <button class="lock-btn" @click="submit">解 锁</button>
        <div v-if="cooling" class="lg-sub" style="margin-top:8px">冷却中…</div>
        <template v-if="emailReady">
          <div class="lock-link" @click="mailMode = true">忘记密码？邮箱验证码重置</div>
        </template>
        <div v-else class="lg-sub" style="margin-top:10px">忘记 PIN？在设置中清除全部本地数据后重新配置</div>
      </template>

      <template v-else>
        <div class="lock-title">邮箱验证码重置 PIN</div>
        <div class="lock-row">
          <input v-model="code" class="lock-input" placeholder="6 位邮箱验证码" maxlength="6" />
          <button class="lock-send" :disabled="sending || cdSec > 0" @click="sendCode">{{ cdSec > 0 ? cdSec + 's' : '发送验证码' }}</button>
        </div>
        <div class="lock-row" style="margin-top:10px">
          <input v-model="newPin" type="password" class="lock-input" placeholder="新 PIN（4-8 位数字）" maxlength="8" @keyup.enter="resetByCode" />
        </div>
        <div v-if="sendTip" class="lg-sub" style="margin-top:8px;text-align:left">{{ sendTip }}</div>
        <button class="lock-btn" @click="resetByCode">重置并解锁</button>
        <div class="lock-link" @click="mailMode = false">返回 PIN 解锁</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lock-wrap { position: fixed; inset: 0; background: var(--lg-side-bg); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.lock-card { background: var(--lg-card-bg); border-radius: 14px; padding: 34px 30px; width: 340px; max-width: 92vw; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
.lock-title { margin: 12px 0 18px; font-weight: 600; }
.lock-input { width: 100%; padding: 10px 12px; border: 1px solid var(--lg-border); border-radius: 8px; font-size: 15px; letter-spacing: 2px; background: var(--lg-page-bg); color: var(--lg-text); outline: none; }
.lock-input:focus { border-color: var(--lg-primary); }
.lock-row { display: flex; gap: 8px; align-items: center; }
.lock-row .lock-input { flex: 1; }
.lock-send { border: none; border-radius: 8px; padding: 10px 12px; background: var(--lg-primary); color: #fff; font-size: 13px; cursor: pointer; white-space: nowrap; }
.lock-send:disabled { background: #9ca8a0; }
.lock-btn { margin-top: 16px; width: 100%; padding: 10px; border: none; border-radius: 8px; background: var(--lg-primary); color: #fff; font-size: 15px; cursor: pointer; }
.lock-btn:hover { background: var(--lg-primary-deep); }
.lock-link { margin-top: 14px; color: var(--lg-primary); font-size: 13px; cursor: pointer; }
</style>
