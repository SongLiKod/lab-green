<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, timeAgo, fmtDate, shortSha } from '../utils/misc'
import { addLog } from '../utils/db'
import { mergeRequests, mrChanges, mrCommits, mrNotes, addMrNote, approveMr, mergeMr, updateMr, branches, createMr } from '../api/gitlab'
import DiffView from '../components/DiffView.vue'
import MdRender from '../components/MdRender.vue'
import MdEditor from '../components/MdEditor.vue'
import SourceFilePreview from '../components/SourceFilePreview.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())
const filter = reactive({ state: 'opened', search: '' })
const page = ref(1); const per = 20; const total = ref(0)
const rows = ref<any[]>([])
const loading = ref(false)
const refreshing = ref(false)

async function load() {
  if (!app.target) { rows.value = []; return }
  loading.value = true
  try {
    const r: any = await mergeRequests(app.target.acct, app.target.projectId, { state: filter.state, search: filter.search || undefined, page: page.value, per })
    rows.value = r.rows || []; total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false; refreshing.value = false }
}
watch(() => app.target?.projectId, load)
onMounted(load)

const mrState: Record<string, [string, string, string]> = {
  opened: ['primary', '开启', 'default'], merged: ['success', '已合并', 'success'], closed: ['info', '已关闭', 'default'], locked: ['warning', '锁定', 'warning']
}

/* 详情 */
const det = reactive({
  show: false, mr: null as any, tab: 'changes', changes: [] as any[], commits: [] as any[],
  notes: [] as any[], loading: false, note: '', expanded: {} as Record<string, boolean>
})
async function openDetail(row: any) {
  const t = app.target!
  Object.assign(det, { show: true, mr: row, tab: 'changes', changes: [], commits: [], notes: [], loading: true, note: '', expanded: {} })
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

/* 源文件预览 */
const preview = ref({ show: false, path: '' })
function openSource(f: any) {
  if (f.deleted_file) return ElMessage.info('文件已删除，无法预览')
  preview.value = { show: true, path: f.new_path }
}

async function doApprove() {
  try {
    await approveMr(app.target!.acct, app.target!.projectId, det.mr.iid)
    await addLog('MR', `审核通过 !${det.mr.iid}`, 'info')
    ElMessage.success('已审核')
  } catch (e: any) { ElMessage.error(e.message) }
}
async function doMerge(removeBranch: boolean | null = null) {
  let v = removeBranch
  if (v === null) {
    v = await ElMessageBox.confirm('合并该请求？', '确认合并', {
      distinguishCancelAndClose: true, confirmButtonText: '合并并删除源分支', cancelButtonText: '仅合并', type: 'warning'
    }).then(() => true).catch((a) => (a === 'cancel' ? false : null))
    if (v === null) return
  }
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

/* 移动端合并确认：action sheet */
const mergeSheet = reactive({ show: false })
const mergeActions = [
  { name: '合并并删除源分支', key: true },
  { name: '仅合并', key: false }
]
function pickMerge(a: any) { mergeSheet.show = false; doMerge(a.key) }
</script>

<template>
  <div v-if="!app.target && !mobile" style="margin-bottom:12px"><el-alert title="请先选择当前项目" type="info" :closable="false" /></div>
  <van-empty v-else-if="!app.target && mobile" description="请先在「项目」页选择当前项目" />

  <!-- ================= 桌面 ================= -->
  <template v-if="app.target && !mobile">
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
      <el-table :data="rows" size="small" @row-click="openDetail" style="cursor:pointer">
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
        <el-table-column label="更新" width="100"><template #default="{ row }">{{ timeAgo(row.updated_at) }}</template></el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag size="small" :type="(mrState[row.state] || ['info'])[0]">{{ (mrState[row.state] || ['info', row.state])[1] }}</el-tag></template>
        </el-table-column>
      </el-table>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <el-pagination layout="prev, pager, next, total" :total="total" :page-size="per" v-model:current-page="page" @current-change="load" small />
      </div>
    </div>
  </template>

  <!-- ================= 移动（Vant） ================= -->
  <template v-if="app.target && mobile">
    <van-tabs v-model:active="filter.state" type="card" line-width="0" title-active-color="#fff" color="#16a34a" @change="(page = 1, load())" style="margin-bottom:10px">
      <van-tab title="开启" name="opened" />
      <van-tab title="已合并" name="merged" />
      <van-tab title="已关闭" name="closed" />
      <van-tab title="全部" name="all" />
    </van-tabs>
    <van-pull-refresh v-model="refreshing" @refresh="(page = 1, load())">
      <div v-for="row in rows" :key="row.id" class="lg-mcard" @click="openDetail(row)">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <b style="flex:1">!{{ row.iid }} {{ row.title }}</b>
          <van-tag :type="(mrState[row.state] || ['', '','default'])[2] as any">{{ (mrState[row.state] || ['','' ,row.state])[1] }}</van-tag>
        </div>
        <div class="lg-sub" style="margin-top:4px">{{ row.source_branch }} → {{ row.target_branch }}</div>
        <div class="lg-sub">{{ row.author?.username }} · {{ timeAgo(row.updated_at) }}</div>
      </div>
      <van-empty v-if="!loading && !rows.length" description="暂无合并请求" :image-size="60" />
    </van-pull-refresh>
    <div style="text-align:center;padding:10px 0 20px">
      <van-button v-if="page > 1" size="small" plain @click="page--, load()">上一页</van-button>
      <span style="margin:0 12px;font-size:13px">{{ page }} / {{ Math.max(1, Math.ceil(total / per)) }}</span>
      <van-button v-if="page * per < total" size="small" plain @click="page++, load()">下一页</van-button>
    </div>
    <van-floating-bubble axis="xy" icon="exchange" magnetic="x" @click="openCreate" />
  </template>

  <!-- 详情：桌面抽屉 -->
  <el-drawer v-if="!mobile" v-model="det.show" :title="`!${det.mr?.iid} ${det.mr?.title || ''}`" size="62%" :close-on-click-modal="false">
    <div v-loading="det.loading">
      <template v-if="det.mr">
        <div class="lg-mcard" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <el-tag size="small" :type="(mrState[det.mr.state] || ['info'])[0]">{{ (mrState[det.mr.state] || ['info', det.mr.state])[1] }}</el-tag>
          <span class="lg-sub">{{ det.mr.source_branch }} → {{ det.mr.target_branch }} · {{ det.mr.author?.username }} · {{ fmtDate(det.mr.created_at) }}</span>
          <span class="grow"></span>
          <template v-if="det.mr.state === 'opened'">
            <el-button size="small" type="success" plain @click="doApprove">审核通过</el-button>
            <el-button size="small" type="primary" @click="doMerge()">合并</el-button>
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
                <a class="file-link" @click.stop="openSource(f)">{{ f.new_path }}</a>
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

  <!-- 详情：移动全屏弹层 -->
  <van-popup v-else v-model:show="det.show" position="bottom" :style="{ height: '94%' }" round>
    <div class="m-det" v-if="det.mr">
      <div class="m-det-head">
        <van-icon name="cross" size="18" @click="det.show = false" />
        <b class="m-det-title">!{{ det.mr.iid }} {{ det.mr.title }}</b>
      </div>
      <div class="lg-sub" style="padding:8px 16px 0">{{ det.mr.source_branch }} → {{ det.mr.target_branch }} · {{ det.mr.author?.username }} · {{ fmtDate(det.mr.created_at) }}</div>
      <van-tabs v-model:active="det.tab" shrink style="margin:6px 0">
        <van-tab title="描述" name="desc" />
        <van-tab :title="`变更 ${det.changes.length}`" name="changes" />
        <van-tab :title="`提交 ${det.commits.length}`" name="commits" />
        <van-tab :title="`评论 ${det.notes.length}`" name="notes" />
      </van-tabs>
      <div class="m-det-body" v-loading="det.loading">
        <MdRender v-if="det.tab === 'desc'" :src="det.mr.description || '（无描述）'" />
        <template v-if="det.tab === 'changes'">
          <div v-for="f in det.changes" :key="f.new_path" class="diff-file">
            <div class="diff-head" @click="det.expanded[f.new_path] = !det.expanded[f.new_path]">
              <van-tag :type="f.new_file ? 'success' : f.deleted_file ? 'danger' : 'warning'">{{ f.new_file ? 'A' : f.deleted_file ? 'D' : 'M' }}</van-tag>
              <span class="file-link" @click.stop="openSource(f)">{{ f.new_path }}</span>
            </div>
            <DiffView v-show="det.expanded[f.new_path]" :diff="f.diff" />
          </div>
        </template>
        <template v-if="det.tab === 'commits'">
          <div v-for="c in det.commits" :key="c.id" class="lg-mcard">
            <van-tag plain>{{ shortSha(c.id) }}</van-tag> {{ c.title }}
            <div class="lg-sub">{{ c.author_name }} · {{ fmtDate(c.created_at) }}</div>
          </div>
        </template>
        <template v-if="det.tab === 'notes'">
          <div v-for="n in det.notes" :key="n.id" class="lg-mcard">
            <div class="lg-sub"><b>{{ n.author?.username }}</b> · {{ fmtDate(n.created_at) }}</div>
            <MdRender :src="n.body" />
          </div>
          <van-field v-model="det.note" type="textarea" rows="3" autosize placeholder="评论…" style="margin-top:10px;background:var(--lg-page-bg);border-radius:8px" />
          <van-button block type="success" round style="margin-top:8px" @click="sendNote">发送</van-button>
        </template>
      </div>
      <div class="m-det-foot" v-if="det.mr.state === 'opened'">
        <van-button block plain type="success" @click="doApprove">审核</van-button>
        <van-button block type="success" style="margin:0 8px" :disabled="det.mr.has_conflicts" @click="mergeSheet.show = true">合并</van-button>
        <van-button block plain type="warning" @click="doClose">关闭</van-button>
      </div>
    </div>
  </van-popup>
  <van-action-sheet v-model:show="mergeSheet.show" :actions="mergeActions" cancel-text="取消" close-on-click-action @select="pickMerge" description="选择合并方式" />

  <!-- 新建 MR -->
  <el-dialog v-model="dlg.show" title="新建合并请求" width="640px" :fullscreen="mobile">
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

  <SourceFilePreview v-model:show="preview.show" :ctx="app.ctx" :project-id="app.target?.projectId || 0" :path="preview.path" :ref-name="det.mr?.sha || ''" />
</template>

<style scoped>
.grow { flex: 1; }
.diff-file { margin-bottom: 10px; }
.diff-head { display: flex; gap: 8px; align-items: center; padding: 8px 10px; background: var(--lg-page-bg); border: 1px solid var(--lg-border); border-radius: 6px; cursor: pointer; font-size: 13px; }
.diff-head .lg-sub { margin-left: auto; }
.file-link { color: var(--lg-primary); cursor: pointer; }
.m-det { display: flex; flex-direction: column; height: 100%; }
.m-det-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 6px; }
.m-det-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-det-body { flex: 1; overflow: auto; padding: 4px 16px 16px; }
.m-det-foot { display: flex; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--lg-border); }
</style>
