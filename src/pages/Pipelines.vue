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
const jobsMap = reactive<Record<number, any[]>>({})

async function load() {
  if (!app.target) { rows.value = []; return }
  loading.value = true
  try {
    const r: any = await pipelines(app.target.acct, app.target.projectId, { status: statusFilter.value || undefined, page: page.value, per })
    rows.value = r.rows || []; total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false }
}
watch(() => app.target?.projectId, load)
onMounted(load)

async function expand(row: any, open: boolean) {
  if (!open || !app.target) return
  try { jobsMap[row.id] = await pipelineJobs(app.target.acct, app.target.projectId, row.id) as any } catch (e: any) { ElMessage.error(e.message) }
}

async function doRetry(row: any) { await retryPipeline(app.target!.acct, app.target!.projectId, row.id); await addLog('流水线', `重跑 #${row.id}`, 'info'); load() }
async function doCancel(row: any) { await cancelPipeline(app.target!.acct, app.target!.projectId, row.id); await addLog('流水线', `取消 #${row.id}`, 'warn'); load() }

/* job 操作与日志 */
const logDlg = reactive({ show: false, text: '', jobId: 0, pipelineId: 0, loading: false })
async function showLog(job: any) {
  Object.assign(logDlg, { show: true, text: '', jobId: job.id, loading: true })
  try { logDlg.text = await jobTrace(app.target!.acct, app.target!.projectId, job.id) as any } catch (e: any) { ElMessage.error(e.message) } finally { logDlg.loading = false }
}
function downloadLog() { downloadText(`job-${logDlg.jobId}.log`, logDlg.text) }
async function jobAction(job: any, act: 'retry' | 'cancel' | 'play') {
  const t = app.target!
  try {
    await ({ retry: retryJob, cancel: cancelJob, play: playJob }[act])(t.acct, t.projectId, job.id)
    await addLog('流水线', `${act} job ${job.name} (#${job.id})`, 'info')
    if (jobsMap[job.pipeline?.id]) expand(job.pipeline, true)
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
  <div>
    <el-alert v-if="!app.target" title="请先选择当前项目" type="info" :closable="false" style="margin-bottom:12px" />
    <template v-else>
      <div class="lg-toolbar">
        <el-select v-model="statusFilter" placeholder="状态筛选" clearable size="small" style="width:140px" @change="(page = 1, load())">
          <el-option v-for="s in ['success', 'failed', 'running', 'pending', 'canceled', 'skipped']" :key="s" :value="s" :label="s" />
        </el-select>
        <span class="grow"></span>
        <el-button size="small" plain @click="openVars">CI/CD 变量</el-button>
        <el-button size="small" type="primary" @click="openRun">手动触发流水线</el-button>
      </div>

      <div class="lg-card" v-loading="loading">
        <el-table v-if="!mobile" :data="rows" size="small">
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
        <template v-else>
          <div v-for="row in rows" :key="row.id" class="lg-mcard">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>#{{ row.iid }} <el-tag size="small" :type="pipelineTagType(row.status)">{{ row.status }}</el-tag></b>
              <span class="lg-sub">{{ fmtDate(row.created_at) }}</span>
            </div>
            <div class="lg-sub">{{ row.ref }} · {{ row.user?.username }}</div>
            <div style="margin-top:6px">
              <van-button size="mini" @click="expand(row, true)">加载Job</van-button>
              <van-button size="mini" style="margin-left:6px" @click="doRetry(row)">重跑</van-button>
              <van-button size="mini" style="margin-left:6px" @click="jobsMap[row.id] ? null : expand(row, true)">{{ jobsMap[row.id] ? '收起Job' : '展开Job' }}</van-button>
            </div>
            <div v-if="jobsMap[row.id]" class="lg-sub" style="margin-top:6px">
              <div v-for="j in jobsMap[row.id]" :key="j.id">
                {{ j.name }} <el-tag size="small" :type="pipelineTagType(j.status)">{{ j.status }}</el-tag>
                <a style="margin-left:6px;color:var(--lg-primary)" @click="showLog(j)">日志</a>
              </div>
            </div>
          </div>
        </template>
        <div style="margin-top:10px;display:flex;justify-content:flex-end">
          <el-pagination layout="prev, pager, next, total" :total="total" :page-size="per" v-model:current-page="page" @current-change="load" small />
        </div>
      </div>

      <!-- 日志 -->
      <el-dialog v-model="logDlg.show" :title="`Job #${logDlg.jobId} 日志`" width="860px" top="5vh" :fullscreen="mobile">
        <div v-loading="logDlg.loading" class="trace">{{ logDlg.text || '（空）' }}</div>
        <template #footer><el-button @click="downloadLog" :disabled="!logDlg.text">下载日志</el-button><el-button type="primary" @click="logDlg.show = false">关闭</el-button></template>
      </el-dialog>

      <!-- 触发 -->
      <el-dialog v-model="runDlg.show" title="手动触发流水线" width="520px">
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
      <el-dialog v-model="varDlg.show" title="CI/CD 变量" width="640px">
        <div v-loading="varDlg.loading">
          <el-table :data="varDlg.list" size="small" max-height="240">
            <el-table-column prop="key" label="Key" min-width="140" />
            <el-table-column prop="variable_type" label="类型" width="90" />
            <el-table-column label="masked" width="70"><template #default="{ row }">{{ row.masked ? '是' : '否' }}</template></el-table-column>
            <el-table-column label="操作" width="80"><template #default="{ row }"><el-button size="small" link type="danger" @click="delVar(row)">删除</el-button></template></el-table-column>
          </el-table>
          <div style="display:flex;gap:8px;margin-top:12px">
            <el-input v-model="varDlg.key" placeholder="KEY" style="width:160px" />
            <el-input v-model="varDlg.value" placeholder="值（敏感值建议勾选 masked）" />
            <el-select v-model="varDlg.type" style="width:110px"><el-option value="env_var" label="变量" /><el-option value="file" label="文件" /></el-select>
            <el-checkbox v-model="varDlg.masked">masked</el-checkbox>
            <el-button type="primary" @click="saveVar">保存</el-button>
          </div>
        </div>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped>
.grow { flex: 1; }
.trace { max-height: 60vh; overflow: auto; background: #0d1117; color: #c9d1d9; font-family: Consolas, monospace; font-size: 12px; padding: 12px; border-radius: 8px; white-space: pre-wrap; }
</style>
