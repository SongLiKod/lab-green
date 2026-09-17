<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, fmtDate, shortSha } from '../utils/misc'
import { commits, commitDiff, branches } from '../api/gitlab'
import DiffView from '../components/DiffView.vue'
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

async function load() {
  if (!app.target) return
  loading.value = true
  try {
    const r: any = await commits(app.target.acct, app.target.projectId, { ref_name: refName.value || undefined, search: search.value || undefined, page: page.value, per })
    rows.value = r.rows || []
    total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false }
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
const detail = ref({ show: false, commit: null as any, files: [] as any[], loading: false })
async function openDetail(c: any) {
  detail.value = { show: true, commit: c, files: [], loading: true }
  try {
    detail.value.files = (await commitDiff(app.target!.acct, app.target!.projectId, c.id)) as any
  } catch (e: any) { ElMessage.error(e.message) } finally { detail.value.loading = false }
}
</script>

<template>
  <div>
    <el-alert v-if="!app.target" title="请先选择当前项目" type="info" :closable="false" style="margin-bottom:12px" />
    <template v-else>
      <div class="lg-toolbar">
        <el-select v-model="refName" filterable placeholder="分支" style="width:200px" clearable>
          <el-option v-for="b in branchList" :key="b" :value="b" :label="b" />
        </el-select>
        <el-input v-model="search" placeholder="搜索提交信息" clearable style="width:220px" @keyup.enter="(page = 1, load())" />
        <el-button type="primary" @click="(page = 1, load())">查询</el-button>
      </div>

      <div class="lg-card" v-loading="loading" v-if="!mobile">
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

      <div v-else v-loading="loading">
        <div v-for="c in rows" :key="c.id" class="lg-mcard" @click="openDetail(c)">
          <el-tag size="small" effect="plain">{{ shortSha(c.id) }}</el-tag>
          <div style="margin-top:4px">{{ c.title }}</div>
          <div class="lg-sub">{{ c.author_name }} · {{ fmtDate(c.created_at) }}</div>
        </div>
        <div style="text-align:center;margin-top:10px">
          <van-button v-if="page > 1" size="small" @click="page--, load()">上一页</van-button>
          <span style="margin:0 10px">{{ page }}</span>
          <van-button v-if="page * per < total" size="small" @click="page++, load()">下一页</van-button>
        </div>
      </div>

      <el-dialog v-model="detail.show" :title="'提交详情 ' + shortSha(detail.commit?.id)" width="900px" top="5vh">
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
                {{ f.new_path }}
              </template>
              <DiffView :diff="f.diff" />
            </el-collapse-item>
          </el-collapse>
          <div v-else-if="!detail.loading" class="lg-empty">无文件变更</div>
        </div>
      </el-dialog>
    </template>
  </div>
</template>
