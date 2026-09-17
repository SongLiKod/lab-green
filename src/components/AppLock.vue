<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../stores/app'
import { ElMessage } from 'element-plus'

const app = useAppStore()
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
</script>

<template>
  <div class="lock-wrap">
    <div class="lock-card">
      <svg viewBox="0 0 24 24" width="44" height="44" fill="#16a34a"><path d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z"/></svg>
      <div class="lock-title">LabGreen 已锁定</div>
      <input v-model="pin" type="password" class="lock-input" placeholder="输入 PIN 解锁" @keyup.enter="submit" :disabled="Date.now() < cooldownUntil" />
      <button class="lock-btn" @click="submit">解 锁</button>
      <div class="lg-sub" style="margin-top:10px">忘记 PIN？在设置中清除全部本地数据后重新配置</div>
    </div>
  </div>
</template>

<style scoped>
.lock-wrap { position: fixed; inset: 0; background: var(--lg-side-bg); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.lock-card { background: var(--lg-card-bg); border-radius: 14px; padding: 34px 30px; width: 320px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
.lock-title { margin: 12px 0 18px; font-weight: 600; }
.lock-input { width: 100%; padding: 10px 12px; border: 1px solid var(--lg-border); border-radius: 8px; font-size: 15px; letter-spacing: 4px; background: var(--lg-page-bg); color: var(--lg-text); outline: none; }
.lock-input:focus { border-color: var(--lg-primary); }
.lock-btn { margin-top: 16px; width: 100%; padding: 10px; border: none; border-radius: 8px; background: var(--lg-primary); color: #fff; font-size: 15px; cursor: pointer; }
.lock-btn:hover { background: var(--lg-primary-deep); }
</style>
