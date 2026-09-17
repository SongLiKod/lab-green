<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useSettingsStore } from '../stores/settings'
import { isMobile } from '../utils/misc'
import ProjectPicker from './ProjectPicker.vue'
import {
  Odometer, User, Files, Setting, Share, Clock, Folder, ChatDotSquare,
  Sort, Position, Promotion, Tickets, Lock, Sunny, Moon, Monitor, Menu as MenuIcon
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const settings = useSettingsStore()

const mobile = ref(isMobile())
const onResize = () => (mobile.value = isMobile())
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

const menus = [
  { path: '/dashboard', title: '仪表盘', icon: Odometer },
  { path: '/account', title: '账号管理', icon: User },
  { path: '/project', title: '项目管理', icon: Files },
  { path: '/repo-setting', title: '仓库设置', icon: Setting },
  { path: '/branch', title: '分支管理', icon: Share },
  { path: '/commits', title: '提交历史', icon: Clock },
  { path: '/file', title: '文件管理', icon: Folder },
  { path: '/issue', title: 'Issue 管理', icon: ChatDotSquare },
  { path: '/merge', title: '合并请求', icon: Sort },
  { path: '/pipeline', title: '流水线', icon: Position },
  { path: '/release', title: 'Release', icon: Promotion },
  { path: '/log', title: '操作日志', icon: Tickets },
  { path: '/settings', title: '设置', icon: MenuIcon }
]

const tabs = [
  { path: '/dashboard', title: '仪表盘', icon: 'home-o' },
  { path: '/project', title: '项目', icon: 'apps-o' },
  { path: '/issue', title: 'Issue', icon: 'notes-o' },
  { path: '/merge', title: '合并', icon: 'exchange' },
  { path: '/account', title: '我的', icon: 'user-o' }
]

const pageTitle = computed(() => (route.meta.title as string) || 'LabGreen')

function switchAccount(id: string) {
  app.setAccount(id)
  app.setProject(null)
}

/* 主题 */
function cycleTheme() {
  const order = ['light', 'dark', 'auto'] as const
  settings.s.theme = order[(order.indexOf(settings.s.theme) + 1) % 3]
  settings.applyTheme()
}
const themeIcon = computed(() => (settings.s.theme === 'dark' ? Moon : settings.s.theme === 'light' ? Sunny : Monitor))

/* 空闲自动锁 */
let idleTimer: number
function resetIdle() {
  clearTimeout(idleTimer)
  if (!settings.s.lockEnabled || !app.hasPin() || app.locked) return
  idleTimer = window.setTimeout(() => app.lockNow(), Math.max(settings.s.autoLockMin, 1) * 60000)
}
onMounted(() => {
  resetIdle()
  ;['click', 'keydown', 'mousemove'].forEach((ev) => window.addEventListener(ev, resetIdle))
  if (settings.s.lockOnBlur) window.addEventListener('blur', () => { if (settings.s.lockEnabled) app.lockNow() })
})
onUnmounted(() => window.removeEventListener('resize', onResize))

watch(() => settings.s.lockEnabled, resetIdle)

const drawer = ref(0)
</script>

<template>
  <!-- 桌面形态 -->
  <el-container v-if="!mobile" class="lg-layout">
    <el-aside width="210px" class="lg-aside">
      <div class="lg-logo">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="#4ade80"><path d="M6 3a3 3 0 1 0 1 5.83v6.34A3 3 0 1 0 10 18a3 3 0 0 0-.7-1.83V12.7a5 5 0 0 0 3.7-2.2h2.3a3 3 0 1 0 0-2h-3.44A5 5 0 0 0 7 3.99 3 3 0 0 0 6 3zm12 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 13a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>
        <span>LabGreen</span>
      </div>
      <el-menu :default-active="route.path" router class="lg-menu">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="lg-header" height="52px">
        <div class="lg-h-left">
          <el-select :model-value="app.currentAccountId" placeholder="选择账号" size="small" style="width: 200px" @change="switchAccount">
            <el-option v-for="a in app.accounts" :key="a.id" :value="a.id" :label="`${a.remark || a.name} · ${a.username}`">
              <span>{{ a.remark || a.name }}</span>
              <span class="lg-sub" style="float:right">{{ a.username }}</span>
            </el-option>
          </el-select>
          <ProjectPicker />
        </div>
        <div class="lg-h-right">
          <el-tooltip content="主题：浅色/深色/跟随系统">
            <el-button circle size="small" :icon="themeIcon" @click="cycleTheme" />
          </el-tooltip>
          <el-tooltip v-if="app.hasPin()" content="立即锁定">
            <el-button circle size="small" :icon="Lock" @click="app.lockNow()" />
          </el-tooltip>
        </div>
      </el-header>
      <el-main class="lg-main"><router-view /></el-main>
    </el-container>
  </el-container>

  <!-- 移动形态 -->
  <div v-else class="lg-mobile">
    <van-sticky>
      <div class="lg-m-header">
        <div class="lg-m-title">{{ pageTitle }}</div>
        <div class="lg-m-actions">
          <span>{{ app.currentProject?.pathWithNamespace?.split('/').pop() || '未选项目' }}</span>
          <van-icon :name="settings.s.theme === 'dark' ? 'moon' : 'sun-o'" @click="cycleTheme" />
        </div>
      </div>
    </van-sticky>
    <div class="lg-m-body"><router-view /></div>
    <van-tabbar v-model="drawer" route safe-area-inset-bottom>
      <van-tabbar-item v-for="t in tabs" :key="t.path" :to="t.path" :icon="t.icon">{{ t.title }}</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.lg-layout { height: 100%; }
.lg-aside { background: var(--lg-side-bg); display: flex; flex-direction: column; }
.lg-logo { display: flex; align-items: center; gap: 9px; color: #eafff1; font-weight: 700; font-size: 17px; padding: 14px 16px; letter-spacing: .5px; }
.lg-menu { background: transparent !important; flex: 1; overflow-y: auto; }
.lg-menu :deep(.el-menu-item) { color: var(--lg-side-text); height: 44px; }
.lg-menu :deep(.el-menu-item:hover) { background: rgba(22, 163, 74, .18); color: #eafff1; }
.lg-menu :deep(.el-menu-item.is-active) { background: var(--lg-side-active); color: #fff; }
.lg-header { background: var(--lg-card-bg); border-bottom: 1px solid var(--lg-border); display: flex; align-items: center; justify-content: space-between; }
.lg-h-left { display: flex; align-items: center; gap: 10px; }
.lg-main { background: var(--lg-page-bg); padding: 16px; overflow: auto; }
.lg-m-header { background: var(--lg-side-bg); color: #eafff1; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
.lg-m-title { font-weight: 600; }
.lg-m-actions { display: flex; gap: 12px; align-items: center; font-size: 12px; max-width: 55%; }
.lg-m-actions span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-m-body { padding: 12px; min-height: calc(100vh - 108px); }
</style>
