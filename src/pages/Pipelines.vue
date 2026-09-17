<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, fmtDate, shortSha, pipelineTagType, downloadText } from '../utils/misc'
import { addLog } from '../utils/db'
import { pipelines, pipelineJobs, retryPipeline, cancelPipeline, createPipeline, jobTrace, retryJob, cancelJob, playJob, variables, upsertVariable, deleteVariable, branches } from '../api/gitlab'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())
const statusFilter = ref('')
const page = ref(1); const per = 15; const total = ref(0)
const rows = ref<any[]>([])
const loading = ref(false)
const refreshing = ref(false)
const jobsMap = reactive<Record<number, any[]>>({})
const expandedPipes = ref<number[]>([])

const statusOptions = [
  { text: '全部状态', value: '' }, { text: 'success', value: 'success' }, { text: 'failed', value: 'failed' },
  { text: 'running', value: 'running' }, { text: 'pending', value: 'pending' }, { text: 'canceled', value: 'canceled' }
]
const vanTag: any = { success: 'success', failed: 'danger', running: 'primary', pending: 'warning', canceled: 'default', skipped: 'default', manual: 'primary' }

async function load() {
  if (!app.target) { rows.value = []; return }
  loading.value = true
  try {
    const r: any = await pipelines(app.target.acct, app.target.projectId, { status: statusFilter.value || undefined, page: page.value, per })
    rows.value = r.rows || []; total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false; refreshing.value = false }
}
watch(() => app.target?.projectId, load)
onMounted(load)

async function expand(row: any, open?: boolean) {
  if (!app.target) return
  if (jobsMap[row.id] && open !== true) return
  try { jobsMap[row.id] = await pipelineJobs(app.target.acct, app.target.projectId, row.id) as any } catch (e: any) { ElMessage.error(e.message) }
}
function onCollapseChange(names: any[]) {
  const p = rows.value.find((r) => r.iid === names[names.length - 1])
  if (p) expand(p, true)
}

async function doRetry(row: any) { await retryPipeline(app.target!.acct, app.target!.projectId, row.id); await addLog('流水线', `重跑 #${row.id}`, 'info'); load() }
async function doCancel(row: any) { await cancelPipeline(app.target!.acct, app.target!.projectId, row.id); await addLog('流水线', `取消 #${row.id}`, 'warn'); load() }

/* job 操作与日志 */
const logDlg = reactive({ show: false, text: '', jobId: 0, loading: false })
async function showLog(job: any) {
  if (!job?.id) return
  Object.assign(logDlg, { show: true, text: '', jobId: job.id, loading: true })
  try { logDlg.text = await jobTrace(app.target!.acct, app.target!.projectId, job.id) as any } catch (e: any) { ElMessage.error(e.message) } finally { logDlg.loading = false }
}
async function jobAction(job: any, act: 'retry' | 'cancel' | 'play') {
  const t = app.target!
  try {
    await ({ retry: retryJob, cancel: cancelJob, play: playJob }[act])(t.acct, t.projectId, job.id)
    await addLog('流水线', `${act} job ${job.name} (#${job.id})`, 'info')
    expand(job.pipeline || { id: job.pipeline_id }, true)
    load()
  } catch (e: any) { ElMessage.error(e.message) }
}

/* 手动触发 */
const runDlg = reactive({ show: false, ref: '', vars: [] as { key: string; value: string }[], saving: false, branchList: [] as string[] })
async function openRun() {
  if (app.target) runDlg.branchList = ((await branches(app.target.acct, app.target.projectId)) as any[]).map((b) => b.name)
  Object.assign(runDlg, { show: true, ref: app.currentProject?.defaultBranch || '', vars: [] })
}
async function doRun() {
  runDlg.saving = true
  try {
    await createPipeline(app.target!.acct, app.target!.projectId, runDlg.ref, runDlg.vars.filter((v) => v.key))
    await addLog('流水线', `触发流水线 @${runDlg.ref}`, 'info')
    ElMessage.success('已触发')
    runDlg.show = false; load()
  } catch (e: any) { ElMessage.error(e.message) } finally { runDlg.saving = false }
}

/* CI/CD 变量 */
const varDlg = reactive({ show: false, list: [] as any[], key: '', value: '', type: 'env_var', masked: false, loading: false })
async function openVars() {
  varDlg.show = true; varDlg.loading = true
  try { varDlg.list = await variables(app.target!.acct, app.target!.projectId) as any } catch (e: any) { ElMessage.error(e.message) } finally { varDlg.loading = false }
}
async function saveVar() {
  if (!varDlg.key) return
  try {
    await upsertVariable(app.target!.acct, app.target!.projectId, { key: varDlg.key, value: varDlg.value, variable_type: varDlg.type, masked: varDlg.masked })
    await addLog('流水线', `保存变量 ${varDlg.key}`, 'warn')
    varDlg.key = ''; varDlg.value = ''
    openVars()
  } catch (e: any) { ElMessage.error(e.message) }
}
async function delVar(v: any) {
  await ElMessageBox.confirm(`删除变量 ${v.key}？`, '确认', { type: 'warning' })
  await deleteVariable(app.target!.acct, app.target!.projectId, v.key)
  openVars()
}
</script>

<template>
  <div v-if="!app.target && !mobile" style="margin-bottom:12px"><el-alert title="请先选择当前项目" type="info" :closable="false" /></div>
  <van-empty v-else-if="!app.target && mobile" description="请先在「项目」页选择当前项目" />

  <template v-if="app.target">
    <!-- ================= 桌面 ================= -->
    <template v-if="!mobile">
      <div class="lg-toolbar">
        <el-select v-model="statusFilter" placeholder="状态筛选" clearable size="small" style="width:140px" @change="(page = 1, load())">
          <el-option v-for="s in ['success', 'failed', 'running', 'pending', 'canceled', 'skipped']" :key="s" :value="s" :label="s" />
        </el-select>
        <span class="grow"></span>
        <el-button size="small" plain @click="openVars">CI/CD 变量</el-button>
        <el-button size="small" type="primary" @click="openRun">手动触发流水线</el-button>
      </div>
      <div class="lg-card" v-loading="loading">
        <el-table :data="rows" size="small">
          <el-table-column type="expand" @expand-change="expand">
            <template #default="{ row }">
              <el-table :data="jobsMap[row.id] || []" size="small" style="margin:6px 12px;width:auto">
                <el-table-column prop="name" label="Job" min-width="160" />
                <el-table-column label="阶段" width="120"><template #default="s">{{ s.row.stage }}</template></el-table-column>
                <el-table-column label="状态" width="100"><template #default="s"><el-tag size="small" :type="pipelineTagType(s.row.status)">{{ s.row.status }}</el-tag></template></el-table-column>
                <el-table-column label="操作" width="240">
                  <template #default="s">
                    <el-button size="small" link type="primary" @click="showLog(s.row)">日志</el-button>
                    <el-button v-if="s.row.status === 'failed'" size="small" link @click="jobAction(s.row, 'retry')">重跑</el-button>
                    <el-button v-if="s.row.status === 'manual'" size="small" link @click="jobAction(s.row, 'play')">执行</el-button>
                    <el-button v-if="['running', 'pending'].includes(s.row.status)" size="small" link type="danger" @click="jobAction(s.row, 'cancel')">取消</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </el-table-column>
          <el-table-column prop="iid" label="#" width="60" />
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag size="small" :type="pipelineTagType(row.status)">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column prop="ref" label="分支/标签" min-width="140" />
          <el-table-column label="提交" width="110"><template #default="{ row }"><el-tag size="small" effect="plain">{{ shortSha(row.sha) }}</el-tag></template></el-table-column>
          <el-table-column label="触发者" width="120"><template #default="{ row }">{{ row.user?.username }}</template></el-table-column>
          <el-table-column label="时间" width="150"><template #default="{ row }">{{ fmtDate(row.created_at) }}</template></el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link @click="doRetry(row)" :disabled="row.status === 'running' || row.status === 'pending'">重跑</el-button>
              <el-button size="small" link type="danger" @click="doCancel(row)" :disabled="!['running', 'pending'].includes(row.status)">取消</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div style="margin-top:10px;display:flex;justify-content:flex-end">
          <el-pagination layout="prev, pager, next, total" :total="total" :page-size="per" v-model:current-page="page" @current-change="load" small />
        </div>
      </div>
    </template>

    <!-- ================= 移动（Vant） ================= -->
    <template v-else>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <van-dropdown-menu active-color="#16a34a" style="flex:1;border-radius:8px;overflow:hidden">
          <van-dropdown-item v-model="statusFilter" :options="statusOptions" @change="(page = 1, load())" />
        </van-dropdown-menu>
        <van-button size="small" round type="success" @click="openRun">触发</van-button>
        <van-button size="small" round plain @click="openVars">变量</van-button>
      </div>
      <van-pull-refresh v-model="refreshing" @refresh="(page = 1, load())">
        <van-collapse v-model="expandedPipes" @change="onCollapseChange">
          <van-collapse-item v-for="row in rows" :key="row.iid" :name="row.iid">
            <template #title>
              <div style="display:flex;align-items:center;gap:6px;width:100%">
                <b>#{{ row.iid }}</b>
                <van-tag :type="vanTag[row.status] || 'default'">{{ row.status }}</van-tag>
                <span class="lg-sub" style="flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ row.ref }}</span>
              </div>
            </template>
            <div class="lg-sub" style="margin-bottom:8px">{{ shortSha(row.sha) }} · {{ row.user?.username }} · {{ fmtDate(row.created_at) }}</div>
            <van-cell v-for="j in jobsMap[row.id] || []" :key="j.id" :title="j.name" :label="j.stage" :border="false" style="padding:8px 0">
              <template #value>
                <van-tag :type="vanTag[j.status] || 'default'">{{ j.status }}</van-tag>
              </template>
              <template #label>
                <span class="m-job-acts">
                  <a @click.stop="showLog(j)">日志</a>
                  <a v-if="j.status === 'failed'" @click.stop="jobAction(j, 'retry')">重跑</a>
                  <a v-if="j.status === 'manual'" @click.stop="jobAction(j, 'play')">执行</a>
                  <a v-if="['running', 'pending'].includes(j.status)" style="color:#e6493f" @click.stop="jobAction(j, 'cancel')">取消</a>
                </span>
              </template>
            </van-cell>
            <div style="display:flex;gap:8px;margin-top:8px">
              <van-button size="mini" plain :disabled="row.status === 'running' || row.status === 'pending'" @click.stop="doRetry(row)">重跑流水线</van-button>
              <van-button size="mini" plain type="danger" :disabled="!['running', 'pending'].includes(row.status)" @click.stop="doCancel(row)">取消</van-button>
            </div>
          </van-collapse-item>
        </van-collapse>
        <van-empty v-if="!loading && !rows.length" description="暂无流水线" :image-size="60" />
      </van-pull-refresh>
      <div style="text-align:center;padding:10px 0 20px">
        <van-button v-if="page > 1" size="small" plain @click="page--, load()">上一页</van-button>
        <span style="margin:0 12px;font-size:13px">{{ page }} / {{ Math.max(1, Math.ceil(total / per)) }}</span>
        <van-button v-if="page * per < total" size="small" plain @click="page++, load()">下一页</van-button>
      </div>
    </template>

    <!-- Job 日志 -->
    <el-dialog v-model="logDlg.show" :title="`Job #${logDlg.jobId} 日志`" width="860px" top="5vh" :fullscreen="mobile">
      <div v-loading="logDlg.loading" class="trace">{{ logDlg.text || '（空）' }}</div>
      <template #footer><el-button @click="downloadText(`job-${logDlg.jobId}.log`, logDlg.text)" :disabled="!logDlg.text">下载日志</el-button><el-button type="primary" @click="logDlg.show = false">关闭</el-button></template>
    </el-dialog>

    <!-- 触发 -->
    <el-dialog v-model="runDlg.show" title="手动触发流水线" width="520px" :fullscreen="mobile">
      <el-form label-width="70px">
        <el-form-item label="Ref">
          <el-select v-model="runDlg.ref" filterable allow-create style="width:100%"><el-option v-for="b in runDlg.branchList" :key="b" :value="b" :label="b" /></el-select>
        </el-form-item>
        <el-form-item label="变量">
          <div style="width:100%">
            <div v-for="(v, i) in runDlg.vars" :key="i" style="display:flex;gap:6px;margin-bottom:6px">
              <el-input v-model="v.key" placeholder="KEY" style="width:160px" />
              <el-input v-model="v.value" placeholder="value" />
              <el-button @click="runDlg.vars.splice(i, 1)">×</el-button>
            </div>
            <el-button size="small" plain @click="runDlg.vars.push({ key: '', value: '' })">+ 添加变量</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="runDlg.show = false">取消</el-button><el-button type="primary" :loading="runDlg.saving" @click="doRun">触发</el-button></template>
    </el-dialog>

    <!-- 变量管理 -->
    <el-dialog v-model="varDlg.show" title="CI/CD 变量" width="640px" :fullscreen="mobile">
      <div v-loading="varDlg.loading">
        <van-cell-group inset>
          <van-cell v-for="v in varDlg.list" :key="v.key" :title="v.key" :label="v.variable_type + (v.masked ? ' · masked' : '')">
            <template #right-icon><van-button size="mini" plain type="danger" @click="delVar(v)">删除</van-button></template>
          </van-cell>
          <van-empty v-if="!varDlg.list.length" description="暂无变量" :image-size="50" />
        </van-cell-group>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <el-input v-model="varDlg.key" placeholder="KEY" style="width:150px" />
          <el-input v-model="varDlg.value" placeholder="值" style="flex:1;min-width:140px" />
          <el-select v-model="varDlg.type" style="width:100px"><el-option value="env_var" label="变量" /><el-option value="file" label="文件" /></el-select>
          <el-checkbox v-model="varDlg.masked">masked</el-checkbox>
          <el-button type="primary" @click="saveVar">保存</el-button>
        </div>
      </div>
    </el-dialog>
  </template>
</template>

<style scoped>
.grow { flex: 1; }
.trace { max-height: 60vh; overflow: auto; background: #0d1117; color: #c9d1d9; font-family: Consolas, monospace; font-size: 12px; padding: 12px; border-radius: 8px; white-space: pre-wrap; }
.m-job-acts a { color: var(--lg-primary); margin-right: 10px; font-size: 12px; }
</style>
