<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, timeAgo, fmtDate } from '../utils/misc'
import { addLog } from '../utils/db'
import { issues, createIssue, updateIssue, issueNotes, addIssueNote, labels, createLabel, deleteLabel, gl } from '../api/gitlab'
import MdEditor from '../components/MdEditor.vue'
import MdRender from '../components/MdRender.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())

const filter = reactive({ state: 'opened', search: '', labels: [] as string[] })
const page = ref(1); const per = 20; const total = ref(0)
const rows = ref<any[]>([])
const allLabels = ref<any[]>([])
const loading = ref(false)

async function loadLabels() {
  if (!app.target) return
  try { allLabels.value = await labels(app.target.acct, app.target.projectId) as any } catch { allLabels.value = [] }
}
async function load() {
  if (!app.target) { rows.value = []; return }
  loading.value = true
  try {
    const r: any = await issues(app.target.acct, app.target.projectId, {
      state: filter.state, search: filter.search || undefined, labels: filter.labels.join(',') || undefined, page: page.value, per
    })
    rows.value = r.rows || []; total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false }
}
watch(() => app.target?.projectId, () => { loadLabels(); load() })
onMounted(() => { loadLabels(); load() })

/* 标签多选：回车新建、× 删除仓库标签 */
function onLabelChange(vals: string[]) {
  const added = vals.filter((v) => !allLabels.value.find((l) => l.name === v))
  added.forEach(async (name) => {
    const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
    try { await createLabel(app.target!.acct, app.target!.projectId, { name, color }); loadLabels() } catch (e: any) { ElMessage.error(e.message) }
  })
}
async function onLabelRemove(name: string) {
  const l = allLabels.value.find((x) => x.name === name)
  if (!l) return
  await ElMessageBox.confirm(`删除仓库标签「${name}」？将影响所有 Issue/MR。`, '确认', { type: 'warning' })
  await deleteLabel(app.target!.acct, app.target!.projectId, l.id)
  await addLog('Issue', `删除标签 ${name}`, 'warn')
  loadLabels()
}

/* 新建 / 编辑 */
const dlg = reactive({ show: false, id: null as number | null, iid: 0, title: '', desc: '', labelNames: [] as string[], saving: false })
function openCreate() { Object.assign(dlg, { show: true, id: null, iid: 0, title: '', desc: '', labelNames: [] }) }
function openEdit(row: any) { Object.assign(dlg, { show: true, id: row.id, iid: row.iid, title: row.title, desc: row.description || '', labelNames: [...(row.labels || [])] }) }
async function save() {
  if (!app.target || !dlg.title) return ElMessage.warning('请输入标题')
  dlg.saving = true
  try {
    const d = { title: dlg.title, description: dlg.desc, labels: dlg.labelNames.join(',') }
    if (dlg.id) { await updateIssue(app.target.acct, app.target.projectId, dlg.iid, d); await addLog('Issue', `更新 !${dlg.iid}`, 'info') }
    else { await createIssue(app.target.acct, app.target.projectId, d); await addLog('Issue', `新建 ${dlg.title}`, 'info') }
    ElMessage.success('已保存')
    dlg.show = false; load()
  } catch (e: any) { ElMessage.error(e.message) } finally { dlg.saving = false }
}

/* 详情 */
const det = reactive({ show: false, issue: null as any, notes: [] as any[], loading: false, note: '', closedRefs: [] as any[] })
async function openDetail(row: any) {
  const t = app.target!
  Object.assign(det, { show: true, issue: row, notes: [], loading: true, note: '' })
  try {
    const [notes, closed] = await Promise.all([
      issueNotes(t.acct, t.projectId, row.iid),
      gl(t.acct, `/projects/${t.projectId}/issues/${row.iid}/closed_by`).catch(() => [])
    ])
    det.notes = notes as any
    det.closedRefs = closed as any
  } catch (e: any) { ElMessage.error(e.message) } finally { det.loading = false }
}
async function sendNote() {
  if (!det.note.trim()) return
  await addIssueNote(app.target!.acct, app.target!.projectId, det.issue.iid, det.note)
  det.note = ''
  openDetail(det.issue)
}
async function toggleState() {
  const s = det.issue.state === 'opened' ? 'close' : 'reopen'
  await updateIssue(app.target!.acct, app.target!.projectId, det.issue.iid, { state_event: s })
  await addLog('Issue', `${s === 'close' ? '关闭' : '重开'} !${det.issue.iid}`, 'info')
  ElMessage.success('完成')
  det.show = false
  load()
}

const commitNotes = computed(() => det.notes.filter((n: any) => n.commit_id))
</script>

<template>
  <div>
    <el-alert v-if="!app.target" title="请先选择当前项目" type="info" :closable="false" style="margin-bottom:12px" />
    <template v-else>
      <div class="lg-toolbar">
        <el-radio-group v-model="filter.state" size="small" @change="(page = 1, load())">
          <el-radio-button value="opened">开启</el-radio-button>
          <el-radio-button value="closed">已关闭</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
        </el-radio-group>
        <el-select v-model="filter.labels" multiple collapse-tags placeholder="标签筛选" size="small" style="width:200px" @change="(page = 1, load())">
          <el-option v-for="l in allLabels" :key="l.id" :value="l.name" :label="l.name" />
        </el-select>
        <el-input v-model="filter.search" placeholder="搜索标题/描述" size="small" clearable style="width:200px" @keyup.enter="(page = 1, load())" />
        <el-button size="small" type="primary" @click="(page = 1, load())">查询</el-button>
        <span class="grow"></span>
        <el-button size="small" plain @click="loadLabels">刷新标签</el-button>
        <el-button size="small" type="primary" @click="openCreate">新建 Issue</el-button>
      </div>

      <div class="lg-card" v-loading="loading">
        <el-table v-if="!mobile" :data="rows" size="small" @row-click="openDetail" style="cursor:pointer">
          <el-table-column prop="iid" label="#" width="70" />
          <el-table-column label="标题" min-width="260">
            <template #default="{ row }">
              <div>{{ row.title }}</div>
              <div class="lg-sub">{{ row.user?.username }} 创建于 {{ timeAgo(row.created_at) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="标签" min-width="160">
            <template #default="{ row }">
              <el-tag v-for="l in row.labels" :key="l" size="small" effect="plain" style="margin-right:4px">{{ l }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="关联提交" width="110">
            <template #default="{ row }"><span class="lg-sub">详见详情</span></template>
          </el-table-column>
          <el-table-column label="更新" width="110"><template #default="{ row }">{{ timeAgo(row.updated_at) }}</template></el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }"><el-tag :type="row.state === 'opened' ? 'success' : 'info'" size="small">{{ row.state === 'opened' ? '开启' : '关闭' }}</el-tag></template>
          </el-table-column>
        </el-table>
        <template v-else>
          <div v-for="row in rows" :key="row.id" class="lg-mcard" @click="openDetail(row)">
            <div style="display:flex;justify-content:space-between"><b>#{{ row.iid }} {{ row.title }}</b>
              <el-tag :type="row.state === 'opened' ? 'success' : 'info'" size="small">{{ row.state === 'opened' ? '开启' : '关闭' }}</el-tag>
            </div>
            <div class="lg-sub">{{ row.user?.username }} · {{ timeAgo(row.updated_at) }}</div>
            <div><el-tag v-for="l in row.labels" :key="l" size="small" effect="plain" style="margin-right:4px">{{ l }}</el-tag></div>
          </div>
        </template>
        <div style="margin-top:10px;display:flex;justify-content:flex-end">
          <el-pagination v-if="!mobile" layout="prev, pager, next, total" :total="total" :page-size="per" v-model:current-page="page" @current-change="load" small />
          <template v-else>
            <van-button v-if="page > 1" size="small" @click="page--, load()">上一页</van-button>
            <van-button v-if="page * per < total" size="small" style="margin-left:8px" @click="page++, load()">下一页</van-button>
          </template>
        </div>
      </div>

      <!-- 新建/编辑 -->
      <el-dialog v-model="dlg.show" :title="dlg.id ? `编辑 Issue #${dlg.iid}` : '新建 Issue'" width="720px" top="5vh">
        <el-form label-width="60px">
          <el-form-item label="标题"><el-input v-model="dlg.title" /></el-form-item>
          <el-form-item label="标签">
            <el-select v-model="dlg.labelNames" multiple filterable allow-create default-first-option placeholder="选择或输入回车新建标签" style="width:100%" @change="onLabelChange">
              <el-option v-for="l in allLabels" :key="l.id" :value="l.name" :label="l.name">
                <span class="label-dot" :style="{ background: l.color }"></span>{{ l.name }}
                <el-button class="label-del" link type="danger" size="small" @click.prevent.stop="onLabelRemove(l.name)">×</el-button>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="描述"><MdEditor v-model="dlg.desc" placeholder="支持 Markdown" style="width:100%" @submit="save" /></el-form-item>
        </el-form>
        <template #footer><el-button @click="dlg.show = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="save">保存</el-button></template>
      </el-dialog>

      <!-- 详情抽屉 -->
      <el-drawer v-model="det.show" :title="`#${det.issue?.iid} ${det.issue?.title || ''}`" size="52%">
        <div v-loading="det.loading">
          <template v-if="det.issue">
            <div class="lg-mcard">
              <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <el-tag :type="det.issue.state === 'opened' ? 'success' : 'info'" size="small">{{ det.issue.state === 'opened' ? '开启' : '关闭' }}</el-tag>
                <el-tag v-for="l in det.issue.labels" :key="l" size="small" effect="plain">{{ l }}</el-tag>
                <span class="grow"></span>
                <el-button size="small" @click="openEdit(det.issue)">编辑</el-button>
                <el-button size="small" :type="det.issue.state === 'opened' ? 'warning' : 'success'" @click="toggleState">{{ det.issue.state === 'opened' ? '关闭' : '重新打开' }}</el-button>
              </div>
              <div class="lg-sub" style="margin:6px 0">{{ det.issue.author?.username }} · {{ fmtDate(det.issue.created_at) }}</div>
              <MdRender :src="det.issue.description || '（无描述）'" />
            </div>

            <div class="lg-title" style="margin-top:14px">评论（{{ det.notes.length }}）</div>
            <div v-for="n in det.notes" :key="n.id" class="lg-mcard" :style="n.system ? 'opacity:.7' : ''">
              <div class="lg-sub"><b>{{ n.author?.username }}</b> · {{ fmtDate(n.created_at) }}<span v-if="n.system">（系统）</span></div>
              <MdRender v-if="!n.system" :src="n.body" />
              <div v-else style="font-size:13px">{{ n.body.slice(0, 120) }}</div>
            </div>
            <div v-if="commitNotes.length" class="lg-sub">关联提交：{{ commitNotes.map((n: any) => n.commit_id.slice(0, 8)).join(' , ') }}</div>
            <div v-if="det.closedRefs.length" class="lg-sub">由提交关闭：{{ det.closedRefs.map((c: any) => c.id.slice(0, 8)).join(' , ') }}</div>

            <div style="margin-top:14px">
              <MdEditor v-model="det.note" placeholder="输入评论，Ctrl+Enter 发送" @submit="sendNote" />
              <el-button type="primary" style="margin-top:8px" @click="sendNote">发送评论</el-button>
            </div>
          </template>
        </div>
      </el-drawer>
    </template>
  </div>
</template>

<style scoped>
.label-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.label-del { float: right; margin-top: 2px; }
.grow { flex: 1; }
</style>
