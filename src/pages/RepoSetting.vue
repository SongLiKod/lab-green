<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { addLog } from '../utils/db'
import { getProject, updateProject, projectMembers, removeMember, addMember, gl } from '../api/gitlab'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const proj = ref<any>(null)
const loading = ref(false)
const saving = ref(false)

const form = reactive({ name: '', description: '', visibility: 'private', issues: true, mr: true, wiki: true, jobs: true, snippets: true })

async function load() {
  if (!app.target) { proj.value = null; return }
  loading.value = true
  try {
    const p = await getProject(app.target.acct, app.target.projectId)
    proj.value = p
    Object.assign(form, {
      name: p.name, description: p.description || '', visibility: p.visibility,
      issues: p.issues_enabled !== false, mr: p.merge_requests_enabled !== false,
      wiki: p.wiki_enabled !== false, jobs: p.jobs_enabled !== false, snippets: p.snippets_enabled !== false
    })
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false }
}
watch(() => app.target?.projectId, load)
onMounted(load)

async function save() {
  if (!app.target) return
  saving.value = true
  try {
    await updateProject(app.target.acct, app.target.projectId, {
      name: form.name, description: form.description, visibility: form.visibility,
      issues_enabled: form.issues, merge_requests_enabled: form.mr, wiki_enabled: form.wiki,
      jobs_enabled: form.jobs, snippets_enabled: form.snippets
    })
    await addLog('仓库设置', `更新项目 ${app.currentProject?.pathWithNamespace}`, 'warn')
    ElMessage.success('已保存')
    load()
  } catch (e: any) { ElMessage.error(e.message) } finally { saving.value = false }
}

/* 协作者 */
const members = ref<any[]>([])
const addDlg = reactive({ show: false, username: '', access: 30, loading: false })
const ACCESS: Record<number, string> = { 10: 'Guest', 20: 'Reporter', 30: 'Developer', 40: 'Maintainer', 50: 'Owner' }
async function loadMembers() {
  if (!app.target) return
  try { members.value = await projectMembers(app.target.acct, app.target.projectId) as any } catch (e) { members.value = [] }
}
watch(() => app.target?.projectId, loadMembers)

async function doAdd() {
  if (!app.target) return
  addDlg.loading = true
  try {
    const users: any = await gl(app.target.acct, '/users', { params: { username: addDlg.username, per_page: 5 } })
    if (!users.length) throw new Error('用户不存在：' + addDlg.username)
    await addMember(app.target.acct, app.target.projectId, { user_id: users[0].id, access_level: addDlg.access })
    await addLog('协作者', `添加 ${users[0].username} (${ACCESS[addDlg.access]})`, 'info')
    addDlg.show = false
    loadMembers()
  } catch (e: any) { ElMessage.error(e.message) } finally { addDlg.loading = false }
}
async function doRemove(m: any) {
  await ElMessageBox.confirm(`移除协作者 ${m.username}？`, '确认', { type: 'warning' })
  await removeMember(app.target!.acct, app.target!.projectId, m.id)
  await addLog('协作者', `移除 ${m.username}`, 'warn')
  loadMembers()
}
</script>

<template>
  <div v-loading="loading">
    <el-alert v-if="!app.target" title="请先在顶部选择当前项目（项目管理页点击行可切换）" type="info" :closable="false" style="margin-bottom:12px" />
    <template v-else>
      <div class="lg-card">
        <div class="lg-title">基本信息</div>
        <el-form label-width="100px" style="max-width:560px">
          <el-form-item label="项目 ID"><el-input :model-value="String(proj?.id)" disabled /></el-form-item>
          <el-form-item label="路径"><el-input :model-value="proj?.path_with_namespace" disabled /></el-form-item>
          <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
          <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="可见性">
            <el-radio-group v-model="form.visibility">
              <el-radio-button value="private">私有</el-radio-button>
              <el-radio-button value="internal">内部</el-radio-button>
              <el-radio-button value="public">公开</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="功能开关">
            <div style="display:flex;gap:18px;flex-wrap:wrap">
              <el-checkbox v-model="form.issues" label="Issues" />
              <el-checkbox v-model="form.mr" label="合并请求" />
              <el-checkbox v-model="form.wiki" label="Wiki" />
              <el-checkbox v-model="form.jobs" label="CI/CD" />
              <el-checkbox v-model="form.snippets" label="代码片段" />
            </div>
          </el-form-item>
          <el-form-item><el-button type="primary" :loading="saving" @click="save">保存设置</el-button></el-form-item>
        </el-form>
      </div>

      <div class="lg-card" style="margin-top:14px">
        <div class="lg-title">协作者管理
          <el-button size="small" type="primary" plain style="margin-left:auto" @click="addDlg.show = true">添加协作者</el-button>
        </div>
        <el-table :data="members" size="small">
          <el-table-column prop="name" label="姓名" min-width="120" />
          <el-table-column prop="username" label="用户名" min-width="120" />
          <el-table-column label="角色" width="120"><template #default="{ row }"><el-tag size="small" effect="plain">{{ ACCESS[row.access_level] || row.access_level }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button v-if="row.username !== app.currentAccount?.username" size="small" link type="danger" @click="doRemove(row)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-dialog v-model="addDlg.show" title="添加协作者" width="420px">
        <el-form label-width="70px">
          <el-form-item label="用户名"><el-input v-model="addDlg.username" placeholder="GitLab 登录用户名" /></el-form-item>
          <el-form-item label="角色">
            <el-select v-model="addDlg.access" style="width:100%">
              <el-option v-for="(v, k) in ACCESS" :key="k" :value="Number(k)" :label="v" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer><el-button @click="addDlg.show = false">取消</el-button><el-button type="primary" :loading="addDlg.loading" @click="doAdd">添加</el-button></template>
      </el-dialog>
    </template>
  </div>
</template>
