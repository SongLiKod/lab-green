<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, fmtDate, shortSha } from '../utils/misc'
import { addLog } from '../utils/db'
import { branches, createBranch, deleteBranch, protectedBranches, protectBranch, unprotectBranch, compare } from '../api/gitlab'
import DiffView from '../components/DiffView.vue'
import SourceFilePreview from '../components/SourceFilePreview.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())
const rows = ref<any[]>([])
const protecteds = ref<any[]>([])
const loading = ref(false)
const keyword = ref('')

async function load() {
  if (!app.target) { rows.value = []; return }
  loading.value = true
  try {
    const [b, p] = await Promise.all([
      branches(app.target.acct, app.target.projectId, keyword.value || undefined),
      protectedBranches(app.target.acct, app.target.projectId).catch(() => [])
    ])
    rows.value = b as any
    protecteds.value = (p as any) || []
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false }
}
watch(() => [app.target?.projectId, keyword.value], load)
onMounted(load)

const isProtected = (name: string) => protecteds.value.find((p) => p.name === name)

const createDlg = ref({ show: false, name: '', ref: '' })
async function doCreate() {
  const t = app.target!
  try {
    await createBranch(t.acct, t.projectId, createDlg.value.name, createDlg.value.ref || app.currentProject?.defaultBranch || 'main')
    await addLog('分支', `创建分支 ${createDlg.value.name}`, 'info')
    ElMessage.success('已创建')
    createDlg.value.show = false
    load()
  } catch (e: any) { ElMessage.error(e.message) }
}

async function doDelete(b: any) {
  const t = app.target!
  await ElMessageBox.confirm(`删除分支 ${b.name}？`, '确认', { type: 'warning' })
  await deleteBranch(t.acct, t.projectId, b.name)
  await addLog('分支', `删除分支 ${b.name}`, 'warn')
  load()
}
async function toggleProtect(b: any) {
  const t = app.target!
  const pb = isProtected(b.name)
  if (pb) { await unprotectBranch(t.acct, t.projectId, pb.id); await addLog('分支', `取消保护 ${b.name}`, 'warn') }
  else { await protectBranch(t.acct, t.projectId, b.name); await addLog('分支', `启用保护 ${b.name}`, 'info') }
  load()
}

/* 差异对比 */
const cmp = ref({ show: false, from: '', to: '', data: null as any, loading: false, tab: 0 })
const cmpOpen = ref<string[]>([])
function openCompare(from?: string, to?: string) {
  cmp.value.show = true; cmp.value.data = null
  cmp.value.from = from || app.currentProject?.defaultBranch || ''
  cmp.value.to = to || ''
  if (cmp.value.from && cmp.value.to) doCompare()
}
async function doCompare() {
  const t = app.target!
  if (!cmp.value.from || !cmp.value.to) return ElMessage.warning('请选择两个分支')
  cmp.value.loading = true
  try {
    cmp.value.data = await compare(t.acct, t.projectId, cmp.value.from, cmp.value.to)
  } catch (e: any) { ElMessage.error(e.message) } finally { cmp.value.loading = false }
}

/* 源文件预览 */
const preview = ref({ show: false, path: '' })
function openSource(d: any) {
  if (d.deleted_file) return ElMessage.info('文件已删除，无法预览')
  preview.value = { show: true, path: d.new_path }
}
</script>

<template>
  <div v-if="!app.target && !mobile" style="margin-bottom:12px"><el-alert title="请先选择当前项目" type="info" :closable="false" /></div>
  <van-empty v-else-if="!app.target && mobile" description="请先在「项目」页选择当前项目" />

  <template v-if="app.target">
    <!-- ================= 桌面 ================= -->
    <template v-if="!mobile">
      <div class="lg-toolbar">
        <el-input v-model="keyword" placeholder="搜索分支" clearable style="width:200px" />
        <el-button type="primary" @click="createDlg.show = true; createDlg.ref = app.currentProject?.defaultBranch">新建分支</el-button>
        <el-button plain @click="openCompare()">分支差异对比</el-button>
        <el-button plain @click="load">刷新</el-button>
      </div>
      <div class="lg-card" v-loading="loading">
        <el-table :data="rows" size="small">
          <el-table-column label="分支" min-width="200">
            <template #default="{ row }">
              <b>{{ row.name }}</b>
              <el-tag v-if="row.name === app.currentProject?.defaultBranch" size="small" type="success" effect="plain" style="margin-left:6px">默认</el-tag>
              <el-tag v-if="isProtected(row.name)" size="small" type="warning" style="margin-left:6px">已保护</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最新提交" min-width="240">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ shortSha(row.commit.id) }}</el-tag>
              {{ row.commit.title }}
              <div class="lg-sub">{{ row.commit.author_name }} · {{ fmtDate(row.commit.created_at) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link :disabled="row.default" @click="openCompare(app.currentProject?.defaultBranch, row.name)">对比默认</el-button>
              <el-button size="small" link @click="toggleProtect(row)">{{ isProtected(row.name) ? '取消保护' : '保护' }}</el-button>
              <el-button size="small" link type="danger" :disabled="row.default || isProtected(row.name)" @click="doDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <!-- ================= 移动（Vant） ================= -->
    <template v-else>
      <van-search v-model="keyword" shape="round" placeholder="搜索分支" />
      <div style="display:flex;gap:8px;padding:0 16px 10px">
        <van-button size="small" type="success" round icon="plus" @click="createDlg.show = true; createDlg.ref = app.currentProject?.defaultBranch">新建</van-button>
        <van-button size="small" round plain @click="openCompare()">差异对比</van-button>
        <van-button size="small" round plain icon="replay" @click="load">刷新</van-button>
      </div>
      <van-swipe-cell v-for="b in rows" :key="b.name">
        <van-cell :border="false" :title="b.name" :label="shortSha(b.commit.id) + ' ' + b.commit.title + ' · ' + fmtDate(b.commit.created_at)">
          <template #value>
            <van-tag v-if="b.name === app.currentProject?.defaultBranch" type="success">默认</van-tag>
            <van-tag v-if="isProtected(b.name)" type="warning" style="margin-left:4px">保护</van-tag>
          </template>
        </van-cell>
        <template #right>
          <van-button square type="warning" :text="isProtected(b.name) ? '取消保护' : '保护'" class="m-swipe-btn" @click="toggleProtect(b)" />
          <van-button square type="danger" text="删除" :disabled="b.default || isProtected(b.name)" class="m-swipe-btn" @click="doDelete(b)" />
        </template>
      </van-swipe-cell>
      <van-empty v-if="!loading && !rows.length" description="无匹配分支" :image-size="60" />
    </template>

    <!-- 新建分支 -->
    <el-dialog v-model="createDlg.show" title="新建分支" width="420px" :fullscreen="mobile">
      <el-form label-width="80px">
        <el-form-item label="分支名"><el-input v-model="createDlg.name" placeholder="feature/xxx" /></el-form-item>
        <el-form-item label="基于">
          <el-select v-model="createDlg.ref" filterable style="width:100%" :fullscreen="false">
            <el-option v-for="b in rows" :key="b.name" :value="b.name" :label="b.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="createDlg.show = false">取消</el-button><el-button type="primary" :disabled="!createDlg.name" @click="doCreate">创建</el-button></template>
    </el-dialog>

    <!-- 差异对比 -->
    <el-dialog v-model="cmp.show" title="分支差异对比" width="860px" top="5vh" :fullscreen="mobile">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <el-select v-model="cmp.from" filterable placeholder="源分支(from)" style="width:200px">
          <el-option v-for="b in rows" :key="b.name" :value="b.name" :label="b.name" />
        </el-select>
        <span>→</span>
        <el-select v-model="cmp.to" filterable placeholder="目标分支(to)" style="width:200px">
          <el-option v-for="b in rows" :key="b.name" :value="b.name" :label="b.name" />
        </el-select>
        <el-button type="primary" :loading="cmp.loading" @click="doCompare">对比</el-button>
      </div>
      <div v-if="cmp.data" v-loading="cmp.loading" style="max-height:60vh;overflow:auto">
        <el-tabs v-if="!mobile">
          <el-tab-pane :label="`提交 (${cmp.data.commits?.length || 0})`">
            <div v-for="c in cmp.data.commits" :key="c.id" class="lg-mcard">
              <el-tag size="small" effect="plain">{{ shortSha(c.id) }}</el-tag> {{ c.title }}
              <div class="lg-sub">{{ c.author_name }} · {{ fmtDate(c.created_at) }}</div>
            </div>
            <div v-if="!cmp.data.commits?.length" class="lg-empty">无提交差异</div>
          </el-tab-pane>
          <el-tab-pane :label="`文件变更 (${cmp.data.diffs?.length || 0})`">
            <el-collapse>
              <el-collapse-item v-for="d in cmp.data.diffs" :key="d.new_path">
                <template #title>
                  <el-tag size="small" :type="d.new_file ? 'success' : d.deleted_file ? 'danger' : 'warning'" style="margin-right:8px">{{ d.new_file ? 'A' : d.deleted_file ? 'D' : 'M' }}</el-tag>
                  <a class="file-link" @click.stop="openSource(d)">{{ d.new_path }}</a>
                </template>
                <DiffView :diff="d.diff" />
              </el-collapse-item>
            </el-collapse>
          </el-tab-pane>
        </el-tabs>
        <van-tabs v-else v-model:active="cmp.tab" shrink>
          <van-tab :title="`提交 ${cmp.data.commits?.length || 0}`">
            <div v-for="c in cmp.data.commits" :key="c.id" class="lg-mcard">
              <van-tag plain>{{ shortSha(c.id) }}</van-tag> {{ c.title }}
              <div class="lg-sub">{{ c.author_name }} · {{ fmtDate(c.created_at) }}</div>
            </div>
          </van-tab>
          <van-tab :title="`变更 ${cmp.data.diffs?.length || 0}`">
            <van-collapse v-model="cmpOpen">
              <van-collapse-item v-for="d in cmp.data.diffs" :key="d.new_path" :name="d.new_path" :title="d.new_path">
                <DiffView :diff="d.diff" />
              </van-collapse-item>
            </van-collapse>
          </van-tab>
        </van-tabs>
      </div>
    </el-dialog>

    <SourceFilePreview v-model:show="preview.show" :ctx="app.ctx" :project-id="app.target?.projectId || 0" :path="preview.path" :ref-name="cmp.to || app.currentProject?.defaultBranch || ''" />
  </template>
</template>

<style scoped>
.m-swipe-btn { height: 100%; }
.file-link { color: var(--lg-primary); cursor: pointer; }
</style>
