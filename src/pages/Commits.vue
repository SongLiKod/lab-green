<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, fmtDate, shortSha } from '../utils/misc'
import { commits, commitDiff, branches } from '../api/gitlab'
import DiffView from '../components/DiffView.vue'
import SourceFilePreview from '../components/SourceFilePreview.vue'
import { ElMessage } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())
const refName = ref('')
const search = ref('')
const page = ref(1)
const per = 20
const total = ref(0)
const rows = ref<any[]>([])
const branchList = ref<string[]>([])
const loading = ref(false)
const refreshing = ref(false)

async function load() {
  if (!app.target) return
  loading.value = true
  try {
    const r: any = await commits(app.target.acct, app.target.projectId, { ref_name: refName.value || undefined, search: search.value || undefined, page: page.value, per })
    rows.value = r.rows || []
    total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false; refreshing.value = false }
}
async function loadBranches() {
  if (!app.target) return
  try {
    branchList.value = ((await branches(app.target.acct, app.target.projectId)) as any[]).map((b) => b.name)
  } catch { branchList.value = [] }
}
watch(() => app.target?.projectId, () => { refName.value = app.currentProject?.defaultBranch || ''; loadBranches(); load() })
watch(refName, () => { page.value = 1; load() })
onMounted(() => { refName.value = app.currentProject?.defaultBranch || ''; loadBranches(); load() })

/* 提交详情 */
const detail = ref({ show: false, commit: null as any, files: [] as any[], loading: false, expanded: [] as string[] })
async function openDetail(c: any) {
  detail.value = { show: true, commit: c, files: [], loading: true, expanded: [] }
  try {
    detail.value.files = (await commitDiff(app.target!.acct, app.target!.projectId, c.id)) as any
    detail.value.expanded = detail.value.files.slice(0, 3).map((f: any) => f.new_path)
  } catch (e: any) { ElMessage.error(e.message) } finally { detail.value.loading = false }
}

/* 源文件预览 */
const preview = ref({ show: false, path: '' })
function openSource(f: any) {
  if (f.deleted_file) return ElMessage.info('该文件在此提交中已被删除，无法预览')
  preview.value = { show: true, path: f.new_path }
}
</script>

<template>
  <div v-if="!app.target && !mobile" style="margin-bottom:12px"><el-alert title="请先选择当前项目" type="info" :closable="false" /></div>
  <van-empty v-else-if="!app.target && mobile" description="请先在「项目」页选择当前项目" />

  <template v-if="app.target">
    <!-- ================= 桌面 ================= -->
    <template v-if="!mobile">
      <div class="lg-toolbar">
        <el-select v-model="refName" filterable placeholder="分支" style="width:200px" clearable>
          <el-option v-for="b in branchList" :key="b" :value="b" :label="b" />
        </el-select>
        <el-input v-model="search" placeholder="搜索提交信息" clearable style="width:220px" @keyup.enter="(page = 1, load())" />
        <el-button type="primary" @click="(page = 1, load())">查询</el-button>
      </div>
      <div class="lg-card" v-loading="loading">
        <el-table :data="rows" size="small" @row-click="openDetail" style="cursor:pointer">
          <el-table-column label="SHA" width="110"><template #default="{ row }"><el-tag size="small" effect="plain">{{ shortSha(row.id) }}</el-tag></template></el-table-column>
          <el-table-column label="提交信息" min-width="260">
            <template #default="{ row }">
              <div>{{ row.title }}</div>
              <div class="lg-sub" v-if="row.message && row.message !== row.title">{{ row.message.split('\n').slice(1).join(' ').slice(0, 80) }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="author_name" label="作者" width="140" />
          <el-table-column label="时间" width="160"><template #default="{ row }">{{ fmtDate(row.created_at) }}</template></el-table-column>
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
          <van-dropdown-item v-model="refName" :options="branchList.map(b => ({ text: b, value: b }))" />
        </van-dropdown-menu>
        <van-search v-model="search" shape="round" placeholder="搜索提交" style="flex:1.4" @search="(page = 1, load())" />
      </div>
      <van-pull-refresh v-model="refreshing" @refresh="(page = 1, load())">
        <div v-for="c in rows" :key="c.id" class="lg-mcard" @click="openDetail(c)">
          <div style="display:flex;align-items:center;gap:8px">
            <van-tag plain type="success">{{ shortSha(c.id) }}</van-tag>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.title }}</span>
          </div>
          <div class="lg-sub" style="margin-top:4px">{{ c.author_name }} · {{ fmtDate(c.created_at) }}</div>
        </div>
        <van-empty v-if="!loading && !rows.length" description="无提交" :image-size="60" />
      </van-pull-refresh>
      <div style="text-align:center;padding:10px 0 20px">
        <van-button v-if="page > 1" size="small" plain @click="page--, load()">上一页</van-button>
        <span style="margin:0 12px;font-size:13px">{{ page }} / {{ Math.max(1, Math.ceil(total / per)) }}</span>
        <van-button v-if="page * per < total" size="small" plain @click="page++, load()">下一页</van-button>
      </div>
    </template>

    <!-- 提交详情：桌面 -->
    <el-dialog v-if="!mobile" v-model="detail.show" :title="'提交详情 ' + shortSha(detail.commit?.id)" width="900px" top="5vh">
      <div v-loading="detail.loading" style="max-height:70vh;overflow:auto">
        <div class="lg-mcard">
          <b>{{ detail.commit?.title }}</b>
          <div class="lg-sub">{{ detail.commit?.author_name }} &lt;{{ detail.commit?.author_email }}&gt; · {{ fmtDate(detail.commit?.created_at) }}</div>
          <div style="white-space:pre-wrap;margin-top:6px" class="lg-sub">{{ detail.commit?.message }}</div>
        </div>
        <el-collapse v-if="detail.files.length">
          <el-collapse-item v-for="f in detail.files" :key="f.new_path" :name="f.new_path">
            <template #title>
              <el-tag size="small" :type="f.new_file ? 'success' : f.deleted_file ? 'danger' : 'warning'" style="margin-right:8px">{{ f.new_file ? '新增' : f.deleted_file ? '删除' : '修改' }}</el-tag>
              <a class="file-link" @click.stop="openSource(f)">{{ f.new_path }}</a>
            </template>
            <DiffView :diff="f.diff" />
          </el-collapse-item>
        </el-collapse>
        <div v-else-if="!detail.loading" class="lg-empty">无文件变更</div>
      </div>
    </el-dialog>

    <!-- 提交详情：移动全屏弹层 -->
    <van-popup v-else v-model:show="detail.show" position="bottom" :style="{ height: '92%' }" round>
      <div class="m-det" v-if="detail.commit">
        <div class="m-det-head">
          <van-icon name="cross" size="18" @click="detail.show = false" />
          <b class="m-det-title">{{ detail.commit.title }}</b>
        </div>
        <div class="lg-sub" style="padding:6px 16px">{{ detail.commit.author_name }} · {{ fmtDate(detail.commit.created_at) }} · <van-tag plain>{{ shortSha(detail.commit.id) }}</van-tag></div>
        <div class="m-det-body" v-loading="detail.loading">
          <van-collapse v-model="detail.expanded">
            <van-collapse-item v-for="f in detail.files" :key="f.new_path" :name="f.new_path">
              <template #title>
                <van-tag :type="f.new_file ? 'success' : f.deleted_file ? 'danger' : 'warning'" style="margin-right:6px">{{ f.new_file ? 'A' : f.deleted_file ? 'D' : 'M' }}</van-tag>
                <span class="file-link" @click.stop="openSource(f)">{{ f.new_path.split('/').pop() }}</span>
              </template>
              <DiffView :diff="f.diff" />
            </van-collapse-item>
          </van-collapse>
          <van-empty v-if="!detail.loading && !detail.files.length" description="无文件变更" :image-size="50" />
        </div>
      </div>
    </van-popup>

    <SourceFilePreview v-model:show="preview.show" :ctx="app.ctx" :project-id="app.target?.projectId || 0" :path="preview.path" :ref-name="detail.commit?.id || refName || ''" />
  </template>
</template>

<style scoped>
.file-link { color: var(--lg-primary); cursor: pointer; }
.m-det { display: flex; flex-direction: column; height: 100%; }
.m-det-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 4px; }
.m-det-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-det-body { flex: 1; overflow: auto; padding: 8px 12px 20px; }
</style>
