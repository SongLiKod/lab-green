import { createRouter, createWebHashHistory } from 'vue-router'

const routes: any[] = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: () => import('../pages/Dashboard.vue'), meta: { title: '仪表盘' } },
  { path: '/account', component: () => import('../pages/Account.vue'), meta: { title: '账号管理' } },
  { path: '/project', component: () => import('../pages/Projects.vue'), meta: { title: '项目管理' } },
  { path: '/repo-setting', component: () => import('../pages/RepoSetting.vue'), meta: { title: '仓库设置' } },
  { path: '/branch', component: () => import('../pages/Branches.vue'), meta: { title: '分支管理' } },
  { path: '/commits', component: () => import('../pages/Commits.vue'), meta: { title: '提交历史' } },
  { path: '/file', component: () => import('../pages/Files.vue'), meta: { title: '文件管理' } },
  { path: '/issue', component: () => import('../pages/Issues.vue'), meta: { title: 'Issue 管理' } },
  { path: '/merge', component: () => import('../pages/MergeRequests.vue'), meta: { title: '合并请求' } },
  { path: '/pipeline', component: () => import('../pages/Pipelines.vue'), meta: { title: '流水线' } },
  { path: '/release', component: () => import('../pages/Releases.vue'), meta: { title: 'Release 管理' } },
  { path: '/log', component: () => import('../pages/Logs.vue'), meta: { title: '操作日志' } },
  { path: '/settings', component: () => import('../pages/Settings.vue'), meta: { title: '设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.afterEach((to) => {
  document.title = (to.meta.title ? to.meta.title + ' - ' : '') + 'LabGreen'
})

export default router
