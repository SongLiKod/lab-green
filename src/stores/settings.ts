import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface Settings {
  theme: 'light' | 'dark' | 'auto'
  concurrency: number
  timeout: number
  retries: number
  logDays: number
  lockEnabled: boolean
  autoLockMin: number
  lockOnBlur: boolean
}

const KEY = 'labgreen_settings'

const defaults: Settings = {
  theme: 'auto',
  concurrency: 4,
  timeout: 20000,
  retries: 1,
  logDays: 30,
  lockEnabled: false,
  autoLockMin: 10,
  lockOnBlur: false
}

export const useSettingsStore = defineStore('settings', () => {
  const s = ref<Settings>({ ...defaults, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) })

  watch(s, (v) => {
    localStorage.setItem(KEY, JSON.stringify(v))
    applyRuntime(v)
  }, { deep: true })

  function applyRuntime(v: Settings) {
    // 供请求层读取的运行时配置
    runtime.concurrency = v.concurrency
    runtime.timeout = v.timeout
    runtime.retries = v.retries
  }

  function applyTheme() {
    const dark = s.value.theme === 'dark' || (s.value.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }

  applyRuntime(s.value)
  return { s, applyTheme, applyRuntime }
})

/** 请求层运行时配置（并发/超时/重试） */
export const runtime = { concurrency: 4, timeout: 20000, retries: 1 }
