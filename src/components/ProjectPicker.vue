<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { myProjects } from '../api/gitlab'
import { ElMessage } from 'element-plus'

const app = useAppStore()
const keyword = ref('')
const loading = ref(false)
const options = ref<any[]>([])
const visible = ref(false)

const display = computed(() =>
  app.currentProject && app.currentProject.accountId === app.currentAccountId
    ? app.currentProject.pathWithNamespace
    : (app.currentAccountId ? '选择项目' : '请先选择账号')
)

async function loadProjects() {
  const a = app.ctx
  if (!a) return
  loading.value = true
  try {
    const r: any = await myProjects(a, { search: keyword.value || undefined, per: 30 })
    options.value = (r.rows || []).map((p: any) => ({ value: p.id, label: p.path_with_namespace, def: p.default_branch, name: p.name }))
  } catch (e: any) {
    ElMessage.error(e.message)
  } finally { loading.value = false }
}

watch(visible, (v) => { if (v) loadProjects() })

function pick(o: any) {
  app.setProject({ accountId: app.currentAccountId, id: o.value, name: o.name, pathWithNamespace: o.label, defaultBranch: o.def })
  visible.value = false
}
</script>
<template>
  <div class="lg-picker" @click="visible = true">
    <el-popover v-model:visible="visible" placement="bottom-start" :width="320" trigger="manual">
      <template #reference>
        <el-button size="small" plain class="picker-btn">
          <span class="dot"></span>{{ display }}
        </el-button>
      </template>
      <el-input v-model="keyword" size="small" placeholder="搜索项目，回车确认" clearable @keyup.enter="pick(options[0])" />
      <div v-loading="loading" class="picker-list">
        <div v-for="o in options" :key="o.value" class="picker-item" @click="pick(o)">{{ o.label }}</div>
        <div v-if="!loading && !options.length" class="lg-sub" style="padding:8px">无匹配项目</div>
      </div>
    </el-popover>
  </div>
</template>

<style scoped>
.picker-btn { max-width: 320px; overflow: hidden; }
.picker-btn .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--lg-primary); margin-right: 6px; }
.picker-list { max-height: 280px; overflow: auto; margin-top: 8px; }
.picker-item { padding: 7px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.picker-item:hover { background: var(--el-color-primary-light-9); color: var(--lg-primary); }
</style>
