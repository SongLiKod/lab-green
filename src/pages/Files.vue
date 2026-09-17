<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, b64ToText, textToB64, isImage } from '../utils/misc'
import { addLog } from '../utils/db'
import { tree, fileContent, createFileB64, upsertFile, deleteFile, branches } from '../api/gitlab'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())
const refName = ref('')
const branchList = ref<string[]>([])
const curPath = ref('')
const items = ref<any[]>([])
const loading = ref(false)

const editor = ref({ show: false, path: '', content: '', isNew: false, saving: false, isImage: false, blobUrl: '' })

async function loadBranches() {
  if (!app.target) return
  try { branchList.value = ((await branches(app.target.acct, app.target.projectId)) as any[]).map((b) => b.name) } catch { branchList.value = [] }
}

async function loadTree() {
  if (!app.target) return
  loading.value = true
  try {
    const r: any = await tree(app.target.acct, app.target.projectId, { path: curPath.value, ref: refName.value })
    items.value = (r || []).sort((a: any, b: any) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1))
  } catch (e: any) { ElMessage.error(e.message); items.value = [] } finally { loading.value = false }
}

watch(() => app.target?.projectId, () => { refName.value = app.currentProject?.defaultBranch || ''; curPath.value = ''; loadBranches(); loadTree() })
watch(refName, loadTree)
onMounted(() => { refName.value = app.currentProject?.defaultBranch || ''; loadBranches(); loadTree() })

const crumbs = computed(() => curPath.value ? curPath.value.split('/') : [])
function gotoCrumb(i: number) { curPath.value = crumbs.value.slice(0, i + 1).join('/'); loadTree() }

function open(row: any) {
  if (row.type === 'tree') { curPath.value = curPath.value ? curPath.value + '/' + row.name : row.name; loadTree() }
  else viewFile(row.name)
}
const fullPath = (name: string) => (curPath.value ? curPath.value + '/' + name : name)

async function viewFile(name: string) {
  const t = app.target!
  const path = fullPath(name)
  if (isImage(name)) {
    try {
      const resp = await fetch(`${t.acct.baseUrl}/api/v4/projects/${t.projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(refName.value)}`, { headers: { 'PRIVATE-TOKEN': t.acct.token } })
      const blob = await resp.blob()
      editor.value = { show: true, path, content: '', isNew: false, saving: false, isImage: true, blobUrl: URL.createObjectURL(blob) }
    } catch (e: any) { ElMessage.error('预览失败：' + e.message) }
    return
  }
  try {
    const f: any = await fileContent(t.acct, t.projectId, path, refName.value)
    editor.value = { show: true, path, isNew: false, saving: false, isImage: false, blobUrl: '', content: f.encoding === 'base64' ? b64ToText(f.content) : f.content }
  } catch (e: any) { ElMessage.error(e.message) }
}

async function saveFile() {
  const t = app.target!
  editor.value.saving = true
  try {
    const msg = await ElMessageBox.prompt('提交信息', '保存文件', { inputValue: `Update ${editor.value.path}` }).then((r) => r.value).catch(() => null)
    if (msg === null) { editor.value.saving = false; return }
    const data = { branch: refName.value, content: textToB64(editor.value.content), commit_message: msg }
    if (editor.value.isNew) await createFileB64(t.acct, t.projectId, editor.value.path, data)
    else await upsertFile(t.acct, t.projectId, editor.value.path, data)
    await addLog('文件', `${editor.value.isNew ? '新建' : '更新'}文件 ${editor.value.path}`, 'info', refName.value)
    ElMessage.success('已提交到远程仓库')
    editor.value.show = false
    loadTree()
  } catch (e: any) { if (e?.message) ElMessage.error(e.message) } finally { editor.value.saving = false }
}

async function delFile(name: string) {
  const t = app.target!
  const path = fullPath(name)
  const msg = await ElMessageBox.prompt(`将删除 ${path}，请输入提交信息`, '删除', { inputValue: `Delete ${path}` }).then((r) => r.value).catch(() => null)
  if (msg === null) return
  await deleteFile(t.acct, t.projectId, path, { branch: refName.value, commit_message: msg })
  await addLog('文件', `删除文件 ${path}`, 'warn')
  loadTree()
}

const newDlg = ref({ show: false, name: '', isFolder: false })
async function doNew() {
  const t = app.target!
  const name = newDlg.value.name.trim()
  if (!name) return
  const isFolder = newDlg.value.isFolder
  try {
    if (isFolder) {
      await createFileB64(t.acct, t.projectId, fullPath(name) + '/.gitkeep', { branch: refName.value, content: '', commit_message: `Add folder ${name}` })
      newDlg.value = { show: false, name: '', isFolder: false }
      loadTree()
    } else {
      editor.value = { show: true, path: fullPath(name), content: '', isNew: true, saving: false, isImage: false, blobUrl: '' }
      newDlg.value = { show: false, name: '', isFolder: false }
    }
  } catch (e: any) { ElMessage.error(e.message) }
}
</script>

<template>
  <div v-if="!app.target && !mobile" style="margin-bottom:12px"><el-alert title="请先选择当前项目" type="info" :closable="false" /></div>
  <van-empty v-else-if="!app.target && mobile" description="请先在「项目」页选择当前项目" />

  <template v-if="app.target">
    <!-- ================= 桌面 ================= -->
    <template v-if="!mobile">
      <div class="lg-toolbar">
        <el-select v-model="refName" filterable style="width:190px" placeholder="分支">
          <el-option v-for="b in branchList" :key="b" :value="b" :label="b" />
        </el-select>
        <el-breadcrumb separator="/" style="flex:1">
          <el-breadcrumb-item><a @click="curPath = ''; loadTree()">{{ app.currentProject?.pathWithNamespace }}</a></el-breadcrumb-item>
          <el-breadcrumb-item v-for="(c, i) in crumbs" :key="i"><a @click="gotoCrumb(i)">{{ c }}</a></el-breadcrumb-item>
        </el-breadcrumb>
        <el-button size="small" @click="newDlg.show = true; newDlg.isFolder = false">新建文件</el-button>
        <el-button size="small" @click="newDlg.show = true; newDlg.isFolder = true">新建目录</el-button>
        <el-button size="small" @click="loadTree">刷新</el-button>
      </div>
      <div class="lg-card" v-loading="loading">
        <el-table :data="items" size="small" @row-click="(r: any) => open(r)" style="cursor:pointer">
          <el-table-column label="名称" min-width="260">
            <template #default="{ row }">
              <span :style="{ color: row.type === 'tree' ? 'var(--lg-primary)' : '' }">{{ row.type === 'tree' ? '📁' : '📄' }} {{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="90"><template #default="{ row }">{{ row.type === 'tree' ? '目录' : '文件' }}</template></el-table-column>
          <el-table-column prop="path" label="路径" min-width="220" show-overflow-tooltip />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.type === 'blob'" size="small" link @click.stop="viewFile(row.name)">查看</el-button>
              <el-button size="small" link type="danger" @click.stop="delFile(row.name)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <!-- ================= 移动（Vant） ================= -->
    <template v-else>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <van-dropdown-menu active-color="#16a34a" style="flex:1;border-radius:8px;overflow:hidden">
          <van-dropdown-item v-model="refName" :options="branchList.map(b => ({ text: b, value: b }))" />
        </van-dropdown-menu>
        <van-icon name="replay" size="18" @click="loadTree" />
        <van-icon name="add-o" size="22" color="#16a34a" @click="newDlg.show = true; newDlg.isFolder = false" />
        <van-icon name="bag-o" size="22" color="#16a34a" @click="newDlg.show = true; newDlg.isFolder = true" />
      </div>
      <van-cell icon="up" :border="false" :title="curPath ? '..' : '📦 ' + (app.currentProject?.pathWithNamespace || '')" v-if="curPath" @click="curPath = curPath.split('/').slice(0, -1).join('/'); loadTree()" />
      <van-divider v-else style="margin:6px 0" />
      <van-cell-group inset style="margin-bottom:70px">
        <van-cell v-for="row in items" :key="row.path" :border="false" :title="(row.type === 'tree' ? '📁 ' : '📄 ') + row.name" :label="row.type === 'tree' ? '目录' : row.path" is-link @click="open(row)">
          <template #right-icon>
            <van-button v-if="row.type === 'blob'" size="mini" plain type="danger" @click.stop="delFile(row.name)">删除</van-button>
          </template>
        </van-cell>
        <van-empty v-if="!loading && !items.length" description="空目录" :image-size="50" />
      </van-cell-group>
    </template>

    <!-- 文件编辑器 -->
    <el-dialog v-model="editor.show" :title="(editor.isNew ? '新建文件 ' : '编辑文件 ') + editor.path" width="860px" top="4vh" :fullscreen="mobile">
      <div v-if="editor.isImage" style="text-align:center"><img :src="editor.blobUrl" style="max-width:100%" /></div>
      <el-input v-else v-model="editor.content" type="textarea" :autosize="{ minRows: 14, maxRows: 26 }" class="code-area" />
      <template #footer>
        <span class="lg-sub" style="float:left;line-height:32px">目标分支：{{ refName }}</span>
        <el-button @click="editor.show = false">取消</el-button>
        <el-button type="primary" :loading="editor.saving" :disabled="editor.isImage" @click="saveFile">提交保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="newDlg.show" :title="newDlg.isFolder ? '新建目录' : '新建文件'" width="400px">
      <el-input v-model="newDlg.name" :placeholder="newDlg.isFolder ? '目录名' : '文件名（如 README.md）'" @keyup.enter="doNew" />
      <template #footer><el-button @click="newDlg.show = false">取消</el-button><el-button type="primary" @click="doNew">确定</el-button></template>
    </el-dialog>
  </template>
</template>

<style scoped>
.code-area :deep(textarea) { font-family: Consolas, Monaco, monospace; font-size: 13px; }
</style>
