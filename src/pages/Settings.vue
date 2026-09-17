<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useAppStore } from '../stores/app'
import { addLog } from '../utils/db'
import { ElMessage, ElMessageBox } from 'element-plus'

const settings = useSettingsStore()
const app = useAppStore()

function resetReq() { settings.s.concurrency = 4; settings.s.timeout = 20000; settings.s.retries = 1 }

/* 应用锁 */
const pinDlg = reactive({ show: false, p1: '', p2: '' })
function onLockToggle(v: boolean) {
  if (v && !app.hasPin()) { pinDlg.show = true; pinDlg.p1 = ''; pinDlg.p2 = '' }
  else if (!v) { app.clearPin(); addLog('设置', '关闭应用锁', 'warn') }
}
async function savePin() {
  if (!/^\d{4,8}$/.test(pinDlg.p1)) return ElMessage.warning('PIN 需为 4-8 位数字')
  if (pinDlg.p1 !== pinDlg.p2) return ElMessage.warning('两次输入不一致')
  await app.setPin(pinDlg.p1)
  addLog('设置', '设置/更新应用锁 PIN', 'warn')
  ElMessage.success('PIN 已保存，请牢记；忘记将无法解密数据')
  pinDlg.show = false
}

function lockNow() { app.lockNow() }

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
</script>

<template>
  <div style="max-width:640px">
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
        <el-form-item label="并发上限">
          <el-input-number v-model="settings.s.concurrency" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="超时（毫秒）">
          <el-input-number v-model="settings.s.timeout" :min="5000" :max="120000" :step="5000" />
        </el-form-item>
        <el-form-item label="失败重试次数">
          <el-input-number v-model="settings.s.retries" :min="0" :max="5" />
        </el-form-item>
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
        <el-form-item label="启用应用锁">
          <el-switch :model-value="settings.s.lockEnabled" @update:model-value="onLockToggle" />
        </el-form-item>
        <template v-if="settings.s.lockEnabled">
          <el-form-item label="空闲自动锁(分)"><el-input-number v-model="settings.s.autoLockMin" :min="1" :max="120" /></el-form-item>
          <el-form-item label="失焦即锁"><el-switch v-model="settings.s.lockOnBlur" /></el-form-item>
          <el-form-item>
            <el-button plain @click="pinDlg.show = true; pinDlg.p1 = ''; pinDlg.p2 = ''">修改 PIN</el-button>
            <el-button type="warning" plain @click="lockNow">立即锁定</el-button>
          </el-form-item>
        </template>
      </el-form>
    </div>

    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">危险操作</div>
      <el-button type="danger" plain @click="wipeAll">清除全部本地数据</el-button>
    </div>

    <el-dialog v-model="pinDlg.show" title="设置解锁 PIN" width="360px">
      <el-form label-width="80px">
        <el-form-item label="PIN"><el-input v-model="pinDlg.p1" type="password" maxlength="8" show-password /></el-form-item>
        <el-form-item label="确认"><el-input v-model="pinDlg.p2" type="password" maxlength="8" show-password /></el-form-item>
      </el-form>
      <div class="lg-sub">忘记 PIN 将无法解密本地凭证，只能清除数据重新配置。</div>
      <template #footer><el-button @click="pinDlg.show = false">取消</el-button><el-button type="primary" @click="savePin">保存</el-button></template>
    </el-dialog>
  </div>
</template>
