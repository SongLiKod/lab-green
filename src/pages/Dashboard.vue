<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { isMobile, timeAgo } from '../utils/misc'
import { myProjects, issues, mergeRequests, pipelines, currentUser } from '../api/gitlab'
import { ElMessage } from 'element-plus'

const app = useAppStore()
const router = useRouter()
const mobile = ref(isMobile())

const stats = ref({ projects: 0, issues: 0, mrs: 0, pipelines: 0 })
const recent = ref<any[]>([])
const me = ref<any>(null)
const loading = ref(false)

const hasTarget = computed(() => !!app.target)
function host(url: string) { try { return new URL(url).host } catch { return url } }

async function refresh() {
  if (!app.ctx) return
  loading.value = true
  try {
    me.value = await currentUser(app.ctx).catch(() => null)
    const pr: any = await myProjects(app.ctx, { per: 5 })
    stats.value.projects = pr.total
    recent.value = pr.rows || []
    if (app.target) {
      const { acct, projectId } = app.target
      const [i, m, p] = await Promise.all([
        issues(acct, projectId, { state: 'opened', per: 1 }),
        mergeRequests(acct, projectId, { state: 'opened', per: 1 }),
        pipelines(acct, projectId, { per: 1 })
      ])
      stats.value.issues = (i as any).total
      stats.value.mrs = (m as any).total
      stats.value.pipelines = (p as any).total
    } else {
      stats.value.issues = stats.value.mrs = stats.value.pipelines = 0
    }
  } catch (e: any) {
    ElMessage.error(e.message)
  } finally { loading.value = false }
}

watch(() => [app.currentAccountId, app.currentProject?.id], refresh)
onMounted(refresh)

const modules = [
  { path: '/project', title: '项目', icon: 'apps-o' }, { path: '/branch', title: '分支', icon: 'cluster-o' },
  { path: '/commits', title: '提交', icon: 'clock-o' }, { path: '/file', title: '文件', icon: 'description-o' },
  { path: '/issue', title: 'Issue', icon: 'notes-o' }, { path: '/merge', title: '合并请求', icon: 'exchange' },
  { path: '/pipeline', title: '流水线', icon: 'play-circle-o' }, { path: '/release', title: 'Release', icon: 'gift-o' },
  { path: '/repo-setting', title: '仓库设置', icon: 'setting-o' }, { path: '/account', title: '账号', icon: 'manager-o' },
  { path: '/log', title: '日志', icon: 'todo-list-o' }, { path: '/settings', title: '设置', icon: 'setting' }
]
</script>

<template>
  <div v-loading="loading">
    <!-- 账号卡片 -->
    <div class="lg-card acct-card">
      <template v-if="app.currentAccount">
        <div class="avatar">{{ (me?.name || app.currentAccount.name || '?').trim().slice(0, 1) }}</div>
        <div class="acct-info">
          <div class="acct-name">{{ me?.name || app.currentAccount.name }}
            <el-tag v-if="!mobile" size="small" type="success" effect="plain">{{ app.currentAccount.status === 'ok' ? '正常' : '异常' }}</el-tag>
          </div>
          <div class="lg-sub">{{ app.currentAccount.username }} @ {{ host(app.currentAccount.baseUrl) }}</div>
        </div>
        <div class="acct-proj lg-sub">当前项目：{{ app.currentProject?.pathWithNamespace || '未选择' }}</div>
      </template>
      <template v-else>
        <div class="acct-info">
          <div class="acct-name">尚未添加 GitLab 账号</div>
          <div class="lg-sub">添加账号（PAT 仅本机加密存储）后即可管理项目、Issue、合并请求与流水线</div>
        </div>
      </template>
      <el-button v-if="!mobile" type="primary" @click="router.push('/account')">{{ app.currentAccount ? '账号管理' : '去添加账号' }}</el-button>
    </div>

    <!-- 统计（桌面） -->
    <div class="stat-row" v-if="app.currentAccount && !mobile">
      <div class="lg-card stat" v-for="s in [
        { k: '项目总数', v: stats.projects, to: '/project' },
        { k: '开启 Issue', v: stats.issues, to: '/issue' },
        { k: '开启合并请求', v: stats.mrs, to: '/merge' },
        { k: '流水线总数', v: stats.pipelines, to: '/pipeline' }
      ]" :key="s.k" @click="router.push(s.to)">
        <div class="stat-num">{{ s.v }}</div>
        <div class="lg-sub">{{ s.k }}<span v-if="s.k !== '项目总数' && !hasTarget">（需选择项目）</span></div>
      </div>
    </div>

    <!-- 统计（移动 van-grid） -->
    <van-grid v-else-if="app.currentAccount" :column-num="4" :border="false" class="m-stat">
      <van-grid-item v-for="s in [
        { k: '项目', v: stats.projects, to: '/project' },
        { k: 'Issue', v: stats.issues, to: '/issue' },
        { k: '合并', v: stats.mrs, to: '/merge' },
        { k: '流水线', v: stats.pipelines, to: '/pipeline' }
      ]" :key="s.k" @click="router.push(s.to)">
        <div class="m-stat-num">{{ s.v }}</div>
        <div class="lg-sub">{{ s.k }}</div>
      </van-grid-item>
    </van-grid>

    <!-- 最近项目 -->
    <div class="lg-card" style="margin-top:14px" v-if="app.currentAccount">
      <div class="lg-title">最近活跃项目</div>
      <el-table v-if="!mobile" :data="recent" size="small" @row-click="(row: any) => { app.setProject({ accountId: app.currentAccountId, id: row.id, name: row.name, pathWithNamespace: row.path_with_namespace, defaultBranch: row.default_branch }); router.push('/branch') }" style="cursor:pointer">
        <el-table-column prop="path_with_namespace" label="项目" min-width="220" />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column prop="default_branch" label="默认分支" width="120" />
        <el-table-column label="最后活动" width="150"><template #default="{ row }">{{ timeAgo(row.last_activity_at) }}</template></el-table-column>
      </el-table>
      <template v-else>
        <div v-for="p in recent" :key="p.id" class="lg-mcard" @click="app.setProject({ accountId: app.currentAccountId, id: p.id, name: p.name, pathWithNamespace: p.path_with_namespace, defaultBranch: p.default_branch }); router.push('/branch')">
          <div style="font-weight:600">{{ p.path_with_namespace }}</div>
          <div class="lg-sub">{{ p.description || '无描述' }} · {{ timeAgo(p.last_activity_at) }}</div>
        </div>
      </template>
      <div v-if="!recent.length" class="lg-empty">暂无项目</div>
    </div>

    <!-- 移动端模块宫格 -->
    <van-grid v-if="mobile" :column-num="4" :border="false" class="lg-card m-mod">
      <van-grid-item v-for="m in modules" :key="m.path" :icon="m.icon" :text="m.title" @click="router.push(m.path)" />
    </van-grid>
  </div>
</template>

<style scoped>
.acct-card { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.avatar { width: 46px; height: 46px; border-radius: 50%; background: var(--lg-primary); color: #fff; font-size: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.acct-name { font-size: 16px; font-weight: 600; display: flex; gap: 8px; align-items: center; }
.acct-proj { margin-left: auto; }
.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 14px; }
.stat { text-align: center; cursor: pointer; transition: .15s; }
.stat:hover { transform: translateY(-2px); border-color: var(--lg-primary); }
.stat-num { font-size: 26px; font-weight: 700; color: var(--lg-primary); }
.mod-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.mod { background: var(--lg-page-bg); border: 1px solid var(--lg-border); border-radius: 8px; padding: 16px 0; text-align: center; font-size: 13px; }
.m-stat { margin-top: 12px; border-radius: 10px; overflow: hidden; }
.m-stat-num { font-size: 20px; font-weight: 700; color: var(--lg-primary); }
.m-mod { margin-top: 12px; }
</style>
