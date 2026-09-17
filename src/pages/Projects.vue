<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, timeAgo } from '../utils/misc'
import { addLog } from '../utils/db'
import { myProjects, createProject, deleteProject, gl } from '../api/gitlab'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())

const keyword = ref('')
const onlyOwned = ref(false)
const page = ref(1)
const total = ref(0)
const per = 20
const rows = ref<any[]>([])
const loading = ref(false)
const refreshing = ref(false)

/* 本地置顶/收藏元数据 */
const META_KEY = 'labgreen_repo_meta'
const meta = reactive<Record<string, { pin?: boolean; fav?: boolean }>>(JSON.parse(localStorage.getItem(META_KEY) || '{}'))
function saveMeta() { localStorage.setItem(META_KEY, JSON.stringify(meta)) }
function m(id: number) { return (meta[id] ||= {}) }

async function load() {
  if (!app.ctx) { rows.value = []; return }
  loading.value = true
  try {
    const r: any = await myProjects(app.ctx, { search: keyword.value || undefined, page: page.value, per, owned: onlyOwned.value })
    rows.value = r.rows || []
    total.value = r.total
  } catch (e: any) { ElMessage.error(e.message) } finally { loading.value = false; refreshing.value = false }
}
watch(() => [app.currentAccountId, onlyOwned.value], () => { page.value = 1; load() })
onMounted(load)

function sorted() {
  return [...rows.value].sort((a, b) => (m(b.id).pin ? 1 : 0) - (m(a.id).pin ? 1 : 0) || (m(b.id).fav ? 1 : 0) - (m(a.id).fav ? 1 : 0))
}

function use(row: any) {
  app.setProject({ accountId: app.currentAccountId, id: row.id, name: row.name, pathWithNamespace: row.path_with_namespace, defaultBranch: row.default_branch })
  ElMessage.success(`已切换到项目 ${row.path_with_namespace}`)
}

async function toggleStar(row: any) {
  if (!app.ctx) return
  try {
    if (row.star_count) await gl(app.ctx, `/projects/${row.id}/unstar`, { method: 'post' }).catch(() => {})
    const r: any = await gl(app.ctx, `/projects/${row.id}/star`, { method: 'post' })
    row.star_count = r.star_count
  } catch (e: any) { ElMessage.error(e.message) }
}

const createDlg = reactive({ show: false, name: '', path: '', description: '', visibility: 'private', readme: true, saving: false })
async function doCreate() {
  if (!app.ctx) return ElMessage.warning('请先选择账号')
  createDlg.saving = true
  try {
    const p: any = await createProject(app.ctx, {
      name: createDlg.name, path: createDlg.path || undefined,
      description: createDlg.description, visibility: createDlg.visibility,
      initialize_with_readme: createDlg.readme
    })
    await addLog('项目', `新建项目 ${p.path_with_namespace}`, 'info')
    ElMessage.success('创建成功')
    createDlg.show = false
    Object.assign(createDlg, { name: '', path: '', description: '' })
    load()
  } catch (e: any) { ElMessage.error(e.message) } finally { createDlg.saving = false }
}

async function remove(row: any) {
  await ElMessageBox.confirm(`将永久删除远程项目 ${row.path_with_namespace}，不可恢复！输入项目路径最后一段确认：`, '危险操作', {
    type: 'error', inputValidator: (v) => (v === row.path ? true : '名称不匹配')
  })
  await deleteProject(app.ctx!, row.id)
  await addLog('项目', `删除远程项目 ${row.path_with_namespace}`, 'error')
  if (app.currentProject?.id === row.id) app.setProject(null)
  load()
}
</script>

<template>
  <!-- ================= 桌面 ================= -->
  <div v-if="!mobile">
    <div class="lg-toolbar">
      <el-input v-model="keyword" placeholder="全局搜索项目名称" clearable style="width:240px" @keyup.enter="(page = 1, load())" @clear="(page = 1, load())">
        <template #append><el-button @click="(page = 1, load())">搜索</el-button></template>
      </el-input>
      <el-checkbox v-model="onlyOwned" @change="(page = 1, load())">仅我拥有的</el-checkbox>
      <span class="grow"></span>
      <el-button type="primary" @click="createDlg.show = true">新建项目</el-button>
    </div>
    <div class="lg-card" v-loading="loading">
      <el-table :data="sorted()" size="small" @row-click="(row: any) => use(row)" style="cursor:pointer">
        <el-table-column width="46">
          <template #default="{ row }">
            <el-button size="small" link :type="m(row.id).pin ? 'primary' : 'info'" @click.stop="m(row.id).pin = !m(row.id).pin, saveMeta()">置顶</el-button>
          </template>
        </el-table-column>
        <el-table-column width="46">
          <template #default="{ row }">
            <span class="fav" :class="{ on: m(row.id).fav }" @click.stop="m(row.id).fav = !m(row.id).fav, saveMeta()">★</span>
          </template>
        </el-table-column>
        <el-table-column label="项目" min-width="220">
          <template #default="{ row }">
            <b>{{ row.path_with_namespace }}</b>
            <el-tag v-if="app.currentProject?.id === row.id" size="small" type="success" style="margin-left:6px">当前</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
        <el-table-column label="可见性" width="90"><template #default="{ row }"><el-tag size="small" effect="plain">{{ row.visibility }}</el-tag></template></el-table-column>
        <el-table-column label="星标" width="70"><template #default="{ row }">{{ row.star_count }}</template></el-table-column>
        <el-table-column label="最后活动" width="120"><template #default="{ row }">{{ timeAgo(row.last_activity_at) }}</template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click.stop="use(row)">设为当前</el-button>
            <el-button size="small" link @click.stop="toggleStar(row)">加星</el-button>
            <el-button size="small" link type="danger" @click.stop="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <el-pagination layout="prev, pager, next, total" :total="total" :page-size="per" v-model:current-page="page" @current-change="load" small />
      </div>
    </div>
  </div>

  <!-- ================= 移动（Vant） ================= -->
  <div v-else>
    <van-search v-model="keyword" shape="round" placeholder="搜索项目名称" @search="(page = 1, load())" @clear="(page = 1, load())" />
    <div style="display:flex;align-items:center;padding:0 16px 8px;font-size:13px">
      <van-checkbox v-model="onlyOwned" shape="square" icon-size="16">仅我拥有的</van-checkbox>
      <span style="flex:1"></span>
      <van-button size="small" type="success" round icon="plus" @click="createDlg.show = true">新建项目</van-button>
    </div>
    <van-pull-refresh v-model="refreshing" @refresh="(page = 1, load())">
      <van-swipe-cell v-for="row in sorted()" :key="row.id">
        <van-cell :border="false" class="m-proj" :class="{ 'm-cur': app.currentProject?.id === row.id }" @click="use(row)">
          <template #title>
            <span class="fav" :class="{ on: m(row.id).fav }" @click.stop="m(row.id).fav = !m(row.id).fav, saveMeta()">★</span>
            <b>{{ row.name }}</b>
            <span class="lg-sub"> / {{ row.path_with_namespace.split('/').slice(0, -1).join('/') }}</span>
          </template>
          <template #label>
            <div class="m-desc">{{ row.description || '无描述' }}</div>
            <div><van-tag plain>{{ row.visibility }}</van-tag> <van-tag v-if="m(row.id).pin" type="primary" style="margin-left:4px">置顶</van-tag> <span class="lg-sub" style="margin-left:6px">★{{ row.star_count }} · {{ timeAgo(row.last_activity_at) }}</span></div>
          </template>
        </van-cell>
        <template #right>
          <van-button square type="success" text="设为当前" class="m-swipe-btn" @click="use(row)" />
          <van-button square type="danger" text="删除" class="m-swipe-btn" @click="remove(row)" />
        </template>
      </van-swipe-cell>
      <van-empty v-if="!loading && !rows.length" description="暂无项目" />
    </van-pull-refresh>
    <van-pagination v-if="total > per" v-model="page" :total-items="total" :items-per-page="per" simple @change="load" style="padding:12px 16px" />
  </div>

  <el-dialog v-model="createDlg.show" title="新建远程项目" width="460px" :fullscreen="mobile">
    <el-form label-width="90px">
      <el-form-item label="名称"><el-input v-model="createDlg.name" /></el-form-item>
      <el-form-item label="路径"><el-input v-model="createDlg.path" placeholder="留空自动生成" /></el-form-item>
      <el-form-item label="描述"><el-input v-model="createDlg.description" /></el-form-item>
      <el-form-item label="可见性">
        <el-select v-model="createDlg.visibility" style="width:100%">
          <el-option value="private" label="私有 private" /><el-option value="internal" label="内部 internal" /><el-option value="public" label="公开 public" />
        </el-select>
      </el-form-item>
      <el-form-item label="初始化"><el-switch v-model="createDlg.readme" active-text="生成 README" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="createDlg.show = false">取消</el-button><el-button type="primary" :loading="createDlg.saving" @click="doCreate">创建</el-button></template>
  </el-dialog>
</template>

<style scoped>
.fav { cursor: pointer; color: #b8c4bc; font-size: 16px; margin-right: 4px; }
.fav.on { color: #f59e0b; }
.m-proj.m-cur { border-left: 3px solid var(--lg-primary); }
.m-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70vw; }
.m-swipe-btn { height: 100%; }
</style>
