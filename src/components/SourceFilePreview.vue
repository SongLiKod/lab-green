<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { fileContent } from '../api/gitlab'
import { b64ToText, isImage, downloadText } from '../utils/misc'
import { ElMessage } from 'element-plus'
import type { AcctCtx } from '../api/request'

const props = defineProps<{ show: boolean; ctx: AcctCtx | null; projectId: number; path: string; refName: string }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()

const content = ref('')
const blobUrl = ref('')
const loading = ref(false)
const meta = ref<any>(null)
const winWidth = ref(window.innerWidth)
onMounted(() => window.addEventListener('resize', onR))
onUnmounted(() => window.removeEventListener('resize', onR))
function onR() { winWidth.value = window.innerWidth }

watch(() => [props.show, props.path, props.refName], async () => {
  if (!props.show || !props.ctx || !props.path) return
  loading.value = true
  content.value = ''; blobUrl.value = ''; meta.value = null
  const t = props.ctx
  try {
    if (isImage(props.path)) {
      const resp = await fetch(`${t.baseUrl}/api/v4/projects/${props.projectId}/repository/files/${encodeURIComponent(props.path)}/raw?ref=${encodeURIComponent(props.refName)}`, { headers: { 'PRIVATE-TOKEN': t.token } })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      blobUrl.value = URL.createObjectURL(await resp.blob())
    } else {
      const f = await fileContent(t, props.projectId, props.path, props.refName) as any
      meta.value = f
      if (f.content) content.value = f.encoding === 'base64' ? b64ToText(f.content) : f.content
      else {
        const resp = await fetch(`${t.baseUrl}/api/v4/projects/${props.projectId}/repository/files/${encodeURIComponent(props.path)}/raw?ref=${encodeURIComponent(props.refName)}`, { headers: { 'PRIVATE-TOKEN': t.token } })
        content.value = await resp.text()
      }
    }
  } catch (e: any) {
    ElMessage.error('加载失败：' + e.message)
  } finally { loading.value = false }
})

function download() {
  if (blobUrl.value) {
    const a = document.createElement('a')
    a.href = blobUrl.value; a.download = props.path.split('/').pop() || 'file'; a.click()
  } else downloadText(props.path.split('/').pop() || 'file', content.value)
}
</script>

<template>
  <el-dialog :model-value="show" @update:model-value="emit('update:show', $event)" :title="path" width="900px" top="4vh" :fullscreen="winWidth < 768">
    <div class="sfp-bar">
      <el-tag size="small" effect="plain">{{ refName }}</el-tag>
      <span class="lg-sub" v-if="meta">大小 {{ (meta.size / 1024).toFixed(1) }} KB · 最后提交 {{ meta.last_commit_id?.slice(0, 8) }}</span>
      <span class="grow"></span>
      <el-button size="small" @click="download">下载</el-button>
    </div>
    <div v-loading="loading" class="sfp-body">
      <img v-if="blobUrl" :src="blobUrl" style="max-width:100%" />
      <pre v-else class="sfp-code">{{ content }}</pre>
    </div>
  </el-dialog>
</template>

<style scoped>
.sfp-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.grow { flex: 1; }
.sfp-body { max-height: 66vh; overflow: auto; background: var(--lg-page-bg); border: 1px solid var(--lg-border); border-radius: 8px; }
.sfp-code { margin: 0; padding: 12px; font-family: Consolas, Monaco, monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--lg-text); }
</style>
