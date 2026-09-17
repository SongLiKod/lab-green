<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AppLayout from './components/AppLayout.vue'
import AppLock from './components/AppLock.vue'
import { useAppStore } from './stores/app'
import { useSettingsStore } from './stores/settings'

const app = useAppStore()
const settings = useSettingsStore()

onMounted(async () => {
  settings.applyTheme()
  await app.load()
  if (settings.s.lockEnabled && app.hasPin()) app.locked = true
})

watch(() => settings.s.theme, () => settings.applyTheme())
watch(() => window.matchMedia('(prefers-color-scheme: dark)'), () => { if (settings.s.theme === 'auto') settings.applyTheme() })
</script>

<template>
  <AppLock v-if="app.locked" />
  <AppLayout v-else-if="!app.booting" />
</template>
