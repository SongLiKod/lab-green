<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, timeAgo, fmtDate, shortSha } from '../utils/misc'
import { addLog } from '../utils/db'
import { mergeRequests, mrChanges, mrCommits, mrNotes, addMrNote, approveMr, mergeMr, updateMr, branches, createMr } from '../api/gitlab'
import DiffView from '../components/DiffView.vue'
import MdRender from '../components/MdRender.vue'
import MdEditor from '../components/MdEditor.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())
const filter = reactive({ state: 'opened', search: '' })
const page = ref(1); const per = 20; const total = ref(0)
const rows = ref<any[]>([])
const loading = ref(false)

async function load() {
  if (!app.target) { rows.value = []; return }
  loading.value = true
  try {
    const r: any = await mergeRequests(app.target.acct, app.target.projectId, { state: filter.state, search: filter.search || undefined, page: page.value, per })
    rows.value = r.rows || []; total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false }
}
watch(() => app.target?.projectId, load)
onMounted(load)

const mrState: Record<string, [string, string]> = {
  opened: ['primary', '开启'], merged: ['success', '已合并'], closed: ['info', '已关闭'], locked: ['warning', '锁定']
}

/* 详情 */
const det = reactive({
  show: false, mr: null as any, tab: 'changes', changes: [] as any[], commits: [] as any[],
  notes: [] as any[], loading: false, note: '', expanded: {} as Record<string, boolean>
})
async function openDetail(row: any) {
  const t = app.target!
  Object.assign(det, { show: true, mr: row, tab: 'changes', changes: [], commits: [], notes: [], loading: true, note: '' })
  try {
    const [c, cm, n] = await Promise.all([
      mrChanges(t.acct, t.projectId, row.iid),
      mrCommits(t.acct, t.projectId, row.iid),
      mrNotes(t.acct, t.projectId, row.iid)
    ])
    det.changes = (c as any).changes || []
    det.commits = cm as any
    det.notes = (n as any).filter((x: any) => !x.system)
  } catch (e: any) { ElMessage.error(e.message) } finally { det.loading = false }
}
async function sendNote() {
  if (!det.note.trim()) return
  await addMrNote(app.target!.acct, app.target!.projectId, det.mr.iid, det.note)
  det.note = ''
  openDetail(det.mr)
}
async function doApprove() {
  try {
    await approveMr(app.target!.acct, app.target!.projectId, det.mr.iid)
    await addLog('MR', `审核通过 !${det.mr.iid}`, 'info')
    ElMessage.success('已审核')
  } catch (e: any) { ElMessage.error(e.message) }
}
async function doMerge() {
  const v = await ElMessageBox.confirm('合并该请求？', '确认合并', {
    distinguishCancelAndClose: true, confirmButtonText: '合并并删除源分支', cancelButtonText: '仅合并', type: 'warning'
  }).then(() => true).catch((a) => (a === 'cancel' ? false : null))
  if (v === null) return
  try {
    await mergeMr(app.target!.acct, app.target!.projectId, det.mr.iid, { should_remove_source_branch: v, merge_when_pipeline_succeeds: false })
    await addLog('MR', `合并 !${det.mr.iid}`, 'warn')
    ElMessage.success('已合并')
    det.show = false; load()
  } catch (e: any) { ElMessage.error(e.message) }
}
async function doClose() {
  await updateMr(app.target!.acct, app.target!.projectId, det.mr.iid, { state_event: 'close' })
  await addLog('MR', `关闭 !${det.mr.iid}`, 'warn')
  ElMessage.success('已关闭')
  det.show = false; load()
}

/* 新建 MR */
const brs = ref<string[]>([])
const dlg = reactive({ show: false, source: '', target: '', title: '', desc: '', saving: false })
async function openCreate() {
  if (app.target) brs.value = ((await branches(app.target.acct, app.target.projectId)) as any[]).map((b) => b.name)
  Object.assign(dlg, { show: true, source: '', target: app.currentProject?.defaultBranch || '', title: '', desc: '' })
}
async function doCreate() {
  if (!dlg.source || !dlg.target || !dlg.title) return ElMessage.warning('请填写完整')
  dlg.saving = true
  try {
    await createMr(app.target!.acct, app.target!.projectId, { source_branch: dlg.source, target_branch: dlg.target, title: dlg.title, description: dlg.desc })
    await addLog('MR', `新建 ${dlg.title}`, 'info')
    ElMessage.success('已创建')
    dlg.show = false; load()
  } catch (e: any) { ElMessage.error(e.message) } finally { dlg.saving = false }
}
</script>

<template>
  <div>
    <el-alert v-if="!app.target" title="请先选择当前项目" type="info" :closable="false" style="margin-bottom:12px" />
    <template v-else>
      <div class="lg-toolbar">
        <el-radio-group v-model="filter.state" size="small" @change="(page = 1, load())">
          <el-radio-button value="opened">开启</el-radio-button>
          <el-radio-button value="merged">已合并</el-radio-button>
          <el-radio-button value="closed">已关闭</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
        </el-radio-group>
        <el-input v-model="filter.search" placeholder="搜索" size="small" clearable style="width:180px" @keyup.enter="(page = 1, load())" />
        <span class="grow"></span>
        <el-button size="small" type="primary" @click="openCreate">新建合并请求</el-button>
      </div>

      <div class="lg-card" v-loading="loading">
        <el-table v-if="!mobile" :data="rows" size="small" @row-click="openDetail" style="cursor:pointer">
          <el-table-column prop="iid" label="#" width="60" />
          <el-table-column label="标题" min-width="260">
            <template #default="{ row }">
              <div>{{ row.title }}</div>
              <div class="lg-sub">{{ row.author?.username }} · !{{ row.iid }}</div>
            </template>
          </el-table-column>
          <el-table-column label="分支" min-width="200">
            <template #default="{ row }"><span class="lg-sub">{{ row.source_branch }} → {{ row.target_branch }}</span></template>
          </el-table-column>
          <el-table-column label="流水线" width="100">
            <template #default="{ row }"><el-tag size="small" :type="row.detailed_status?.icon ? (row.detailed_status.group === 'success' ? 'success' : row.detailed_status.group === 'failed' ? 'danger' : 'warning') : 'info'">{{ row.detailed_status?.label || '-' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="更新" width="100"><template #default="{ row }">{{ timeAgo(row.updated_at) }}</template></el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag size="small" :type="(mrState[row.state] || ['info'])[0]">{{ (mrState[row.state] || ['info', row.state])[1] }}</el-tag></template>
          </el-table-column>
        </el-table>
        <template v-else>
          <div v-for="row in rows" :key="row.id" class="lg-mcard" @click="openDetail(row)">
            <div style="display:flex;justify-content:space-between"><b>!{{ row.iid }} {{ row.title }}</b>
              <el-tag size="small" :type="(mrState[row.state] || ['info'])[0]">{{ (mrState[row.state] || ['info', row.state])[1] }}</el-tag>
            </div>
            <div class="lg-sub">{{ row.source_branch }} → {{ row.target_branch }} · {{ row.author?.username }} · {{ timeAgo(row.updated_at) }}</div>
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

      <!-- 详情抽屉 -->
      <el-drawer v-model="det.show" :title="`!${det.mr?.iid} ${det.mr?.title || ''}`" size="62%" :close-on-click-modal="false">
        <div v-loading="det.loading">
          <template v-if="det.mr">
            <div class="lg-mcard" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <el-tag size="small" :type="(mrState[det.mr.state] || ['info'])[0]">{{ (mrState[det.mr.state] || ['info', det.mr.state])[1] }}</el-tag>
              <span class="lg-sub">{{ det.mr.source_branch }} → {{ det.mr.target_branch }} · {{ det.mr.author?.username }} · {{ fmtDate(det.mr.created_at) }}</span>
              <span class="grow"></span>
              <template v-if="det.mr.state === 'opened'">
                <el-button size="small" type="success" plain @click="doApprove">审核通过</el-button>
                <el-button size="small" type="primary" :disabled="!det.mr.mergeable && det.mr.has_conflicts" @click="doMerge">合并</el-button>
                <el-button size="small" type="warning" plain @click="doClose">关闭</el-button>
              </template>
              <el-tag v-if="det.mr.has_conflicts" type="danger" size="small">存在冲突</el-tag>
            </div>
            <el-tabs v-model="det.tab" style="margin-top:10px">
              <el-tab-pane label="描述" name="desc"><MdRender :src="det.mr.description || '（无描述）'" /></el-tab-pane>
              <el-tab-pane :label="`文件变更 (${det.changes.length})`" name="changes">
                <div v-for="f in det.changes" :key="f.new_path" class="diff-file">
                  <div class="diff-head" @click="det.expanded[f.new_path] = !det.expanded[f.new_path]">
                    <el-tag size="small" :type="f.new_file ? 'success' : f.deleted_file ? 'danger' : 'warning'">{{ f.new_file ? 'A' : f.deleted_file ? 'D' : 'M' }}</el-tag>
                    {{ f.new_path }}
                    <span class="lg-sub">{{ det.expanded[f.new_path] ? '收起' : '展开 diff' }}</span>
                  </div>
                  <DiffView v-show="det.expanded[f.new_path]" :diff="f.diff" />
                </div>
              </el-tab-pane>
              <el-tab-pane :label="`提交 (${det.commits.length})`" name="commits">
                <div v-for="c in det.commits" :key="c.id" class="lg-mcard">
                  <el-tag size="small" effect="plain">{{ shortSha(c.id) }}</el-tag> {{ c.title }}
                  <div class="lg-sub">{{ c.author_name }} · {{ fmtDate(c.created_at) }}</div>
                </div>
              </el-tab-pane>
              <el-tab-pane :label="`评论 (${det.notes.length})`" name="notes">
                <div v-for="n in det.notes" :key="n.id" class="lg-mcard">
                  <div class="lg-sub"><b>{{ n.author?.username }}</b> · {{ fmtDate(n.created_at) }}</div>
                  <MdRender :src="n.body" />
                </div>
                <div style="margin-top:10px">
                  <MdEditor v-model="det.note" placeholder="评论，Ctrl+Enter 发送" @submit="sendNote" />
                  <el-button type="primary" style="margin-top:8px" @click="sendNote">发送</el-button>
                </div>
              </el-tab-pane>
            </el-tabs>
          </template>
        </div>
      </el-drawer>

      <el-dialog v-model="dlg.show" title="新建合并请求" width="640px">
        <el-form label-width="80px">
          <el-form-item label="源分支">
            <el-select v-model="dlg.source" filterable style="width:100%"><el-option v-for="b in brs" :key="b" :value="b" :label="b" /></el-select>
          </el-form-item>
          <el-form-item label="目标分支">
            <el-select v-model="dlg.target" filterable style="width:100%"><el-option v-for="b in brs" :key="b" :value="b" :label="b" /></el-select>
          </el-form-item>
          <el-form-item label="标题"><el-input v-model="dlg.title" /></el-form-item>
          <el-form-item label="描述"><MdEditor v-model="dlg.desc" style="width:100%" /></el-form-item>
        </el-form>
        <template #footer><el-button @click="dlg.show = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="doCreate">创建</el-button></template>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped>
.grow { flex: 1; }
.diff-file { margin-bottom: 10px; }
.diff-head { display: flex; gap: 8px; align-items: center; padding: 8px 10px; background: var(--lg-page-bg); border: 1px solid var(--lg-border); border-radius: 6px; cursor: pointer; font-size: 13px; }
.diff-head .lg-sub { margin-left: auto; }
</style>
