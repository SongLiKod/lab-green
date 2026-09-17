<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useAppStore } from '../stores/app'
import { isMobile } from '../utils/misc'
import { addLog } from '../utils/db'
import { sendResetCode, sendPinReminder } from '../utils/mail'
import { ElMessage, ElMessageBox } from 'element-plus'

const settings = useSettingsStore()
const app = useAppStore()
const mobile = ref(isMobile())

function resetReq() { settings.s.concurrency = 4; settings.s.timeout = 20000; settings.s.retries = 1 }

/* 应用锁 */
const pinDlg = reactive({ show: false, old: '', p1: '', p2: '', hasOld: false })
function openPinDlg() {
  pinDlg.show = true; pinDlg.old = ''; pinDlg.p1 = ''; pinDlg.p2 = ''
  pinDlg.hasOld = app.hasPin()
}
async function onLockToggle(v: boolean) {
  if (v) {
    settings.s.lockEnabled = true
    if (!app.hasPin()) openPinDlg()
  } else {
    if (app.hasPin()) {
      const { value } = await ElMessageBox.prompt('请输入当前 PIN 以关闭应用锁', '关闭应用锁', { inputType: 'password', inputPattern: /^\d{4,8}$/, inputErrorMessage: '4-8 位数字' }).catch(() => ({ value: null as string | null }))
      if (value === null || value === undefined) return
      if (!(await app.checkPin(value))) { ElMessage.error('PIN 错误，无法关闭应用锁'); return }
    }
    settings.s.lockEnabled = false
    app.clearPin()
    addLog('设置', '关闭应用锁', 'warn')
  }
}
function cancelPin() {
  pinDlg.show = false
  if (!app.hasPin()) settings.s.lockEnabled = false
}
async function savePin() {
  if (pinDlg.hasOld && !(await app.checkPin(pinDlg.old))) { ElMessage.error('原 PIN 错误'); return }
  if (!/^\d{4,8}$/.test(pinDlg.p1)) return ElMessage.warning('PIN 需为 4-8 位数字')
  if (pinDlg.p1 !== pinDlg.p2) return ElMessage.warning('两次输入不一致')
  await app.setPin(pinDlg.p1)
  settings.s.lockEnabled = true
  addLog('设置', pinDlg.hasOld ? '验证原 PIN 后修改 PIN' : '设置应用锁 PIN', 'warn')
  pinDlg.show = false
  if (settings.s.emailEnabled) {
    try {
      await sendPinReminder({
        service: settings.s.emailService, template: settings.s.emailTemplate, publicKey: settings.s.emailPublicKey, to: settings.s.emailTo,
        toVar: settings.s.emailToVar, subjectVar: settings.s.emailSubjectVar, bodyVar: settings.s.emailBodyVar
      }, pinDlg.p1)
      ElMessage.success('PIN 已保存，口令提醒邮件已发送至 ' + settings.s.emailTo)
    } catch (e: any) {
      ElMessage.warning('PIN 已保存，但提醒邮件发送失败：' + e.message)
    }
  } else {
    ElMessage.success('PIN 已保存，应用锁已启用；忘记可通过邮箱验证码或清除数据找回')
  }
}
function lockNow() { app.lockNow() }

/* 邮箱找回 */
const mailTesting = ref(false)
const L = '{{', R = '}}'
const hintTo = computed(() => L + (settings.s.emailToVar || 'to_email') + R)
const hintSubject = computed(() => L + (settings.s.emailSubjectVar || 'subject') + R)
const hintBody = computed(() => L + (settings.s.emailBodyVar || 'message') + R)
async function testMail() {
  mailTesting.value = true
  try {
    await sendResetCode({
      service: settings.s.emailService, template: settings.s.emailTemplate, publicKey: settings.s.emailPublicKey, to: settings.s.emailTo,
      toVar: settings.s.emailToVar, subjectVar: settings.s.emailSubjectVar, bodyVar: settings.s.emailBodyVar
    })
    ElMessage.success('测试验证码已发送，请查收邮箱')
    addLog('设置', '发送 EmailJS 测试邮件', 'info')
  } catch (e: any) { ElMessage.error(e.message) } finally { mailTesting.value = false }
}

async function wipeAll() {
  await ElMessageBox.confirm('将删除所有账号、设置与日志（不可恢复）。输入 clear 确认：', '危险操作', {
    type: 'error', inputValidator: (v) => (v === 'clear' ? true : '输入不匹配')
  })
  localStorage.clear()
  const { clearLogs } = await import('../utils/db')
  await clearLogs()
  ElMessage.success('已清除，刷新中…')
  setTimeout(() => location.reload(), 600)
}

async function editNum(key: 'timeout' | 'retries' | 'logDays' | 'autoLockMin', title: string, min: number, max: number) {
  const { value } = await ElMessageBox.prompt(title, { inputValue: String((settings.s as any)[key]), inputPattern: /^\d+$/, inputErrorMessage: `需为 ${min}-${max} 的数字` }).catch(() => ({ value: '' }))
  const n = Number(value)
  if (!value || isNaN(n) || n < min || n > max) return
  ;(settings.s as any)[key] = n
}
</script>

<template>
  <!-- ================= 桌面 ================= -->
  <div style="max-width:640px" v-if="!mobile">
    <div class="lg-card">
      <div class="lg-title">外观</div>
      <el-form label-width="110px">
        <el-form-item label="主题">
          <el-radio-group v-model="settings.s.theme" @change="settings.applyTheme()">
            <el-radio-button value="light">浅色</el-radio-button>
            <el-radio-button value="dark">深色</el-radio-button>
            <el-radio-button value="auto">跟随系统</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </div>

    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">请求</div>
      <el-form label-width="110px">
        <el-form-item label="并发上限"><el-input-number v-model="settings.s.concurrency" :min="1" :max="60" /></el-form-item>
        <el-form-item label="超时（毫秒）"><el-input-number v-model="settings.s.timeout" :min="5000" :max="120000" :step="5000" /></el-form-item>
        <el-form-item label="失败重试次数"><el-input-number v-model="settings.s.retries" :min="0" :max="5" /></el-form-item>
        <el-form-item><el-button plain @click="resetReq">恢复默认</el-button></el-form-item>
      </el-form>
    </div>

    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">日志</div>
      <el-form label-width="110px">
        <el-form-item label="保留天数"><el-input-number v-model="settings.s.logDays" :min="1" :max="365" /></el-form-item>
      </el-form>
    </div>

    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">应用锁</div>
      <el-form label-width="110px">
        <el-form-item label="启用应用锁"><el-switch :model-value="settings.s.lockEnabled" @update:model-value="onLockToggle" /></el-form-item>
        <template v-if="settings.s.lockEnabled">
          <el-form-item label="空闲自动锁(分)"><el-input-number v-model="settings.s.autoLockMin" :min="1" :max="120" /></el-form-item>
          <el-form-item label="失焦即锁"><el-switch v-model="settings.s.lockOnBlur" /></el-form-item>
          <el-form-item>
            <el-button plain @click="openPinDlg">修改 PIN</el-button>
            <el-button type="warning" plain @click="lockNow">立即锁定</el-button>
          </el-form-item>
        </template>
      </el-form>
    </div>

    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">邮箱找回（EmailJS，无自建后端）</div>
      <el-form label-width="110px">
        <el-form-item label="启用邮箱找回"><el-switch v-model="settings.s.emailEnabled" /></el-form-item>
        <template v-if="settings.s.emailEnabled">
          <el-form-item label="Service ID"><el-input v-model="settings.s.emailService" placeholder="如 service_xxxx" /></el-form-item>
          <el-form-item label="Template ID"><el-input v-model="settings.s.emailTemplate" placeholder="EmailJS 模板 ID" /></el-form-item>
          <el-form-item label="Public Key"><el-input v-model="settings.s.emailPublicKey" placeholder="EmailJS Account 公钥（user_xxx）" /></el-form-item>
          <el-form-item label="接收邮箱"><el-input v-model="settings.s.emailTo" placeholder="接收验证码的邮箱" /></el-form-item>
          <el-form-item label="收件人变量"><el-input v-model="settings.s.emailToVar" placeholder="to_email" /></el-form-item>
          <el-form-item label="主题变量"><el-input v-model="settings.s.emailSubjectVar" placeholder="subject" /></el-form-item>
          <el-form-item label="正文变量"><el-input v-model="settings.s.emailBodyVar" placeholder="message" /></el-form-item>
          <el-form-item>
            <el-button plain :loading="mailTesting" @click="testMail">发送测试邮件</el-button>
            <span class="lg-sub" style="margin-left:10px">锁定后可在锁屏页用验证码重置 PIN</span>
          </el-form-item>
        </template>
      </el-form>
      <div class="lg-sub" style="padding:0 0 0 110px;line-height:1.9">
        EmailJS 侧必须满足：<br>
        ① 模板 Content 的 <b>To</b> 字段填 <b>{{ hintTo }}</b>（与收件人变量名一致，否则收不到）；<br>
        ② 主题放 <b>{{ hintSubject }}</b>、正文放 <b>{{ hintBody }}</b>；<br>
        ③ 启用后：设置/修改 PIN、验证码重置 PIN 都会发送<b>口令提醒邮件</b>（含新 PIN，请妥善保管）；<br>
        ④ 发送成功仍没收到时，先检查邮箱<b>垃圾箱</b>。
      </div>
    </div>

    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">危险操作</div>
      <el-button type="danger" plain @click="wipeAll">清除全部本地数据</el-button>
    </div>
  </div>

  <!-- ================= 移动（Vant） ================= -->
  <div v-else style="padding-bottom:20px">
    <van-cell-group inset title="外观" class="m-sec">
      <van-cell title="主题">
        <template #value>
          <van-radio-group v-model="settings.s.theme" direction="horizontal" icon-size="16" @change="settings.applyTheme()">
            <van-radio name="light">浅色</van-radio><van-radio name="dark">深色</van-radio><van-radio name="auto">系统</van-radio>
          </van-radio-group>
        </template>
      </van-cell>
    </van-cell-group>

    <van-cell-group inset title="请求" class="m-sec">
      <van-cell title="并发上限" :value="settings.s.concurrency">
        <template #label><van-slider v-model="settings.s.concurrency" :min="1" :max="30" button-size="18px" /></template>
      </van-cell>
      <van-cell title="超时" :value="settings.s.timeout + ' ms'" is-link @click="editNum('timeout', '请求超时(ms)', 5000, 120000)" />
      <van-cell title="重试次数" :value="settings.s.retries" is-link @click="editNum('retries', '失败重试次数', 0, 5)" />
      <van-cell title="日志保留(天)" :value="settings.s.logDays" is-link @click="editNum('logDays', '日志保留天数', 1, 365)" />
    </van-cell-group>

    <van-cell-group inset title="应用锁" class="m-sec">
      <van-cell title="启用应用锁"><van-switch :model-value="settings.s.lockEnabled" size="20" @update:model-value="onLockToggle" /></van-cell>
      <template v-if="settings.s.lockEnabled">
        <van-cell title="空闲自动锁(分)" :value="settings.s.autoLockMin" is-link @click="editNum('autoLockMin', '空闲自动锁定(分钟)', 1, 120)" />
        <van-cell title="失焦即锁"><van-switch v-model="settings.s.lockOnBlur" size="20" /></van-cell>
        <van-cell title="修改 PIN" is-link @click="openPinDlg" />
        <van-cell title="立即锁定" is-link @click="lockNow" />
      </template>
    </van-cell-group>

    <van-cell-group inset title="邮箱找回（EmailJS）" class="m-sec">
      <van-cell title="启用邮箱找回"><van-switch v-model="settings.s.emailEnabled" size="20" /></van-cell>
      <template v-if="settings.s.emailEnabled">
        <van-field v-model="settings.s.emailService" label="Service" placeholder="service_xxxx" />
        <van-field v-model="settings.s.emailTemplate" label="Template" placeholder="EmailJS 模板 ID" />
        <van-field v-model="settings.s.emailPublicKey" label="公钥" placeholder="EmailJS Public Key（user_xxx）" />
        <van-field v-model="settings.s.emailTo" label="邮箱" placeholder="接收验证码的邮箱" />
        <van-field v-model="settings.s.emailToVar" label="收件人变量" placeholder="to_email" />
        <van-field v-model="settings.s.emailSubjectVar" label="主题变量" placeholder="subject" />
        <van-field v-model="settings.s.emailBodyVar" label="正文变量" placeholder="message" />
        <div class="lg-sub" style="padding:8px 16px;line-height:1.8">模板 To 字段必须填 {{ hintTo }}；仅需 Public Key；收不到先查垃圾箱。</div>
        <van-cell>
          <van-button size="small" round type="success" :loading="mailTesting" @click="testMail">发送测试邮件</van-button>
        </van-cell>
      </template>
    </van-cell-group>

    <van-cell-group inset title="危险操作" class="m-sec">
      <van-cell title="清除全部本地数据" title-style="color:#e6493f" is-link @click="wipeAll" />
    </van-cell-group>
  </div>

  <!-- 共用：PIN 弹窗 -->
  <el-dialog v-model="pinDlg.show" :title="pinDlg.hasOld ? '修改解锁 PIN' : '设置解锁 PIN'" width="360px">
    <el-form label-width="80px">
      <el-form-item v-if="pinDlg.hasOld" label="原 PIN"><el-input v-model="pinDlg.old" type="password" maxlength="8" show-password /></el-form-item>
      <el-form-item label="新 PIN"><el-input v-model="pinDlg.p1" type="password" maxlength="8" show-password /></el-form-item>
      <el-form-item label="确认"><el-input v-model="pinDlg.p2" type="password" maxlength="8" show-password /></el-form-item>
    </el-form>
    <div class="lg-sub">修改 PIN 必须验证原 PIN；忘记可通过「邮箱找回」验证码重置，或清除数据重新配置。</div>
    <template #footer><el-button @click="cancelPin">取消</el-button><el-button type="primary" @click="savePin">保存</el-button></template>
  </el-dialog>
</template>

<style scoped>
.m-sec { margin-bottom: 12px; }
</style>
