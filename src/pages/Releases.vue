<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, fmtDate } from '../utils/misc'
import { addLog } from '../utils/db'
import { releases, createRelease, updateRelease, deleteRelease, tags, branches } from '../api/gitlab'
import MdRender from '../components/MdRender.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())
const rows = ref<any[]>([])
const loading = ref(false)
const refOptions = ref<string[]>([])

async function load() {
  if (!app.target) { rows.value = []; return }
  loading.value = true
  try {
    rows.value = await releases(app.target.acct, app.target.projectId) as any
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false }
}
async function loadRefs() {
  if (!app.target) return
  try {
    const [t, b] = await Promise.all([tags(app.target.acct, app.target.projectId).catch(() => []), branches(app.target.acct, app.target.projectId).catch(() => [])])
    refOptions.value = [...(t as any[]).map((x) => x.name), ...(b as any[]).map((x) => x.name)]
  } catch { refOptions.value = [] }
}
watch(() => app.target?.projectId, () => { load(); loadRefs() })
onMounted(() => { load(); loadRefs() })

const dlg = reactive({ show: false, editing: false, tag: '', name: '', ref: '', desc: '', links: [] as { name: string; url: string }[], saving: false })
function openCreate() { Object.assign(dlg, { show: true, editing: false, tag: '', name: '', ref: '', desc: '', links: [] }) }
function openEdit(r: any) {
  Object.assign(dlg, {
    show: true, editing: true, tag: r.tag_name, name: r.name || '', ref: r.commit?.id || r.tag_name,
    desc: r.description || '', links: (r.assets?.links || []).map((l: any) => ({ name: l.name, url: l.url }))
  })
}
async function save() {
  if (!dlg.tag) return ElMessage.warning('请输入 Tag')
  dlg.saving = true
  const t = app.target!
  try {
    const d: any = { name: dlg.name || undefined, description: dlg.desc || undefined, assets: { links: dlg.links.filter((l) => l.name && l.url) } }
    if (dlg.editing) { await updateRelease(t.acct, t.projectId, dlg.tag, d) }
    else { await createRelease(t.acct, t.projectId, { ...d, tag_name: dlg.tag, ref: dlg.ref || undefined }) }
    await addLog('Release', `${dlg.editing ? '更新' : '发布'} ${dlg.tag}`, 'info')
    ElMessage.success('已保存')
    dlg.show = false; load()
  } catch (e: any) { ElMessage.error(e.message) } finally { dlg.saving = false }
}
async function remove(r: any) {
  await ElMessageBox.confirm(`删除 Release ${r.tag_name}（不删除 Tag）？`, '确认', { type: 'warning' })
  await deleteRelease(app.target!.acct, app.target!.projectId, r.tag_name)
  await addLog('Release', `删除 ${r.tag_name}`, 'warn')
  load()
}
</script>

<template>
  <div>
    <el-alert v-if="!app.target" title="请先选择当前项目" type="info" :closable="false" style="margin-bottom:12px" />
    <template v-else>
      <div class="lg-toolbar">
        <el-button type="primary" @click="openCreate">新建 Release</el-button>
        <el-button plain @click="load">刷新</el-button>
      </div>

      <div v-loading="loading">
        <el-empty v-if="!rows.length && !loading" description="暂无 Release" />
        <div v-for="r in rows" :key="r.tag_name" class="lg-card rel-card">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <b style="font-size:15px">{{ r.name || r.tag_name }}</b>
            <el-tag size="small" type="success" effect="plain">{{ r.tag_name }}</el-tag>
            <span class="lg-sub">{{ fmtDate(r.created_at) }}</span>
            <span class="grow"></span>
            <el-button size="small" link type="primary" @click="openEdit(r)">编辑</el-button>
            <el-button size="small" link type="danger" @click="remove(r)">删除</el-button>
          </div>
          <MdRender v-if="r.description" :src="r.description" style="margin-top:8px" />
          <div v-if="r.assets?.links?.length" style="margin-top:8px">
            <a v-for="l in r.assets.links" :key="l.url" :href="l.url" target="_blank" class="asset-link">📎 {{ l.name }}</a>
          </div>
        </div>
      </div>

      <el-dialog v-model="dlg.show" :title="dlg.editing ? '编辑 Release' : '新建 Release'" width="640px" top="6vh">
        <el-form label-width="80px">
          <el-form-item label="Tag">
            <el-input v-model="dlg.tag" :disabled="dlg.editing" placeholder="如 v1.0.0" />
          </el-form-item>
          <el-form-item v-if="!dlg.editing" label="创建自">
            <el-select v-model="dlg.ref" filterable allow-create placeholder="分支/Tag（留空则要求已存在）" style="width:100%">
              <el-option v-for="o in refOptions" :key="o" :value="o" :label="o" />
            </el-select>
          </el-form-item>
          <el-form-item label="标题"><el-input v-model="dlg.name" /></el-form-item>
          <el-form-item label="说明">
            <div style="width:100%">
              <el-input v-model="dlg.desc" type="textarea" :rows="4" placeholder="支持 Markdown" />
              <div class="lg-sub">预览：<MdRender :src="dlg.desc || '（无）'" /></div>
            </div>
          </el-form-item>
          <el-form-item label="资产链接">
            <div style="width:100%">
              <div v-for="(l, i) in dlg.links" :key="i" style="display:flex;gap:6px;margin-bottom:6px">
                <el-input v-model="l.name" placeholder="名称" style="width:150px" />
                <el-input v-model="l.url" placeholder="https://..." />
                <el-button @click="dlg.links.splice(i, 1)">×</el-button>
              </div>
              <el-button size="small" plain @click="dlg.links.push({ name: '', url: '' })">+ 添加链接</el-button>
            </div>
          </el-form-item>
        </el-form>
        <template #footer><el-button @click="dlg.show = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="save">保存</el-button></template>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped>
.grow { flex: 1; }
.rel-card { margin-bottom: 12px; }
.asset-link { display: inline-block; margin-right: 14px; color: var(--lg-primary); font-size: 13px; }
</style>
