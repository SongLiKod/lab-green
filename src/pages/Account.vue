<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, fmtDate, downloadText } from '../utils/misc'
import { addLog } from '../utils/db'
import { sshKeys, addSshKey, deleteSshKey } from '../api/gitlab'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())

const addDlg = reactive({ show: false, baseUrl: 'https://gitlab.com', token: '', remark: '', group: '', saving: false })
const editDlg = reactive({ show: false, id: '', remark: '', group: '', token: '', baseUrl: '', saving: false })
const sshDlg = reactive({ show: false, acctId: '', list: [] as any[], title: '', key: '', loading: false })

const statusMap: any = { ok: ['success', '正常'], expired: ['warning', '异常'], invalid: ['danger', '失效'], unknown: ['info', '未知'] }

async function doAdd() {
  if (!/^https?:\/\//.test(addDlg.baseUrl)) return ElMessage.warning('实例地址需以 http(s):// 开头')
  if (!addDlg.token) return ElMessage.warning('请输入 Personal Access Token')
  addDlg.saving = true
  try {
    await app.addAccount(addDlg.baseUrl, addDlg.token, addDlg.remark, addDlg.group)
    ElMessage.success('账号添加成功')
    Object.assign(addDlg, { show: false, token: '', remark: '', group: '' })
  } catch (e: any) {
    ElMessage.error('校验失败：' + e.message)
  } finally { addDlg.saving = false }
}

async function doEdit() {
  editDlg.saving = true
  try {
    await app.updateAccount(editDlg.id, {
      remark: editDlg.remark, group: editDlg.group,
      baseUrl: editDlg.baseUrl || undefined, token: editDlg.token || undefined
    })
    ElMessage.success('已更新')
    editDlg.show = false
  } catch (e: any) {
    ElMessage.error(e.message)
  } finally { editDlg.saving = false }
}

async function check(id: string) {
  const st = await app.checkAccount(id)
  ElMessage[st === 'ok' ? 'success' : 'warning']('状态：' + (statusMap[st]?.[1] || st))
}

async function remove(id: string) {
  await ElMessageBox.confirm('删除后该账号的本地加密凭证将被清除，不可恢复。继续？', '警告', { type: 'warning' })
  await app.removeAccount(id)
}

function openEdit(a: any) {
  Object.assign(editDlg, { show: true, id: a.id, remark: a.remark, group: a.group, token: '', baseUrl: a.baseUrl })
}

async function openSsh(a: any) {
  sshDlg.show = true; sshDlg.acctId = a.id; sshDlg.loading = true
  try {
    sshDlg.list = await sshKeys({ id: a.id, baseUrl: a.baseUrl, token: a.token })
  } catch (e: any) { ElMessage.error(e.message) } finally { sshDlg.loading = false }
}
async function doAddSsh() {
  const a = app.accounts.find((x) => x.id === sshDlg.acctId)!
  try {
    await addSshKey({ id: a.id, baseUrl: a.baseUrl, token: a.token }, sshDlg.title, sshDlg.key)
    await addLog('SSH', '添加 SSH 公钥 ' + sshDlg.title, 'info')
    sshDlg.title = ''; sshDlg.key = ''
    await openSsh(a)
  } catch (e: any) { ElMessage.error(e.message) }
}
async function doDelSsh(k: any) {
  const a = app.accounts.find((x) => x.id === sshDlg.acctId)!
  await deleteSshKey({ id: a.id, baseUrl: a.baseUrl, token: a.token }, k.id)
  await openSsh(a)
}

/* 备份 / 还原 */
function exportBackup() {
  downloadText(`labgreen-backup-${Date.now()}.json`, app.exportBackup())
  addLog('备份', '导出加密备份', 'warn')
}
const importText = ref('')
async function importBackup() {
  try {
    await app.importBackup(importText.value)
    ElMessage.success('导入成功')
    importText.value = ''
  } catch (e: any) { ElMessage.error('导入失败：' + e.message) }
}
</script>

<template>
  <div>
    <div class="lg-toolbar">
      <el-button type="primary" @click="addDlg.show = true">添加账号</el-button>
      <span class="grow"></span>
      <el-button plain @click="exportBackup" :disabled="!app.accounts.length">导出加密备份</el-button>
    </div>

    <!-- 桌面表格 -->
    <div class="lg-card" v-if="!mobile">
      <el-table :data="app.accounts" size="small">
        <el-table-column label="备注/名称" min-width="150">
          <template #default="{ row }">
            <b>{{ row.remark || row.name }}</b>
            <div class="lg-sub">{{ row.name }}（{{ row.username }}）</div>
          </template>
        </el-table-column>
        <el-table-column prop="baseUrl" label="实例地址" min-width="180" show-overflow-tooltip />
        <el-table-column prop="group" label="分组" width="100" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><el-tag :type="statusMap[row.status]?.[0]" size="small">{{ statusMap[row.status]?.[1] }}</el-tag></template>
        </el-table-column>
        <el-table-column label="更新时间" width="150"><template #default="{ row }">{{ fmtDate(row.updatedAt) }}</template></el-table-column>
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="app.setAccount(row.id)">{{ app.currentAccountId === row.id ? '当前使用' : '切换' }}</el-button>
            <el-button size="small" link @click="check(row.id)">状态检测</el-button>
            <el-button size="small" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" link @click="openSsh(row)">SSH 公钥</el-button>
            <el-button size="small" link type="danger" @click="remove(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!app.accounts.length" class="lg-empty">暂无账号，点击「添加账号」开始使用</div>
    </div>

    <!-- 移动卡片 -->
    <template v-else>
      <div v-for="a in app.accounts" :key="a.id" class="lg-mcard">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>{{ a.remark || a.name }}</b>
          <el-tag :type="statusMap[a.status]?.[0]" size="small">{{ statusMap[a.status]?.[1] }}</el-tag>
        </div>
        <div class="lg-sub">{{ a.username }} · {{ a.baseUrl }}</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <van-button size="small" type="success" @click="app.setAccount(a.id)">{{ app.currentAccountId === a.id ? '当前' : '切换' }}</van-button>
          <van-button size="small" @click="check(a.id)">检测</van-button>
          <van-button size="small" @click="openEdit(a)">编辑</van-button>
          <van-button size="small" @click="exportBackup">备份</van-button>
          <van-button size="small" color="#e6493f" @click="remove(a.id)">删除</van-button>
        </div>
      </div>
      <div v-if="!app.accounts.length" class="lg-empty">暂无账号</div>
    </template>

    <!-- 导入备份 -->
    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">导入加密备份</div>
      <el-input v-model="importText" type="textarea" :rows="3" placeholder="粘贴备份 JSON（含密文凭证与密钥材料，可跨设备还原）" />
      <el-button style="margin-top:8px" type="warning" plain @click="importBackup" :disabled="!importText">导入并覆盖本地账号</el-button>
    </div>

    <!-- 添加账号 -->
    <el-dialog v-model="addDlg.show" title="添加 GitLab 账号" width="460px">
      <el-form label-width="90px">
        <el-form-item label="实例地址"><el-input v-model="addDlg.baseUrl" placeholder="https://gitlab.com 或自建实例地址" /></el-form-item>
        <el-form-item label="访问令牌"><el-input v-model="addDlg.token" type="password" show-password placeholder="Personal Access Token（需 read_api / write 权限）" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="addDlg.remark" placeholder="如：公司 / 个人" /></el-form-item>
        <el-form-item label="分组"><el-input v-model="addDlg.group" placeholder="可选，用于账号归类" /></el-form-item>
      </el-form>
      <div class="lg-sub">令牌仅以 AES-256-GCM 加密存储在本机，不经过任何第三方服务器。</div>
      <template #footer><el-button @click="addDlg.show = false">取消</el-button><el-button type="primary" :loading="addDlg.saving" @click="doAdd">校验并保存</el-button></template>
    </el-dialog>

    <!-- 编辑账号 -->
    <el-dialog v-model="editDlg.show" title="编辑账号" width="440px">
      <el-form label-width="90px">
        <el-form-item label="备注"><el-input v-model="editDlg.remark" /></el-form-item>
        <el-form-item label="分组"><el-input v-model="editDlg.group" /></el-form-item>
        <el-form-item label="实例地址"><el-input v-model="editDlg.baseUrl" /></el-form-item>
        <el-form-item label="更新令牌"><el-input v-model="editDlg.token" type="password" placeholder="留空则不更新" show-password /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editDlg.show = false">取消</el-button><el-button type="primary" @click="doEdit">保存</el-button></template>
    </el-dialog>

    <!-- SSH 公钥 -->
    <el-dialog v-model="sshDlg.show" title="SSH 公钥管理" width="560px">
      <div v-loading="sshDlg.loading">
        <el-table :data="sshDlg.list" size="small" max-height="220">
          <el-table-column prop="title" label="标题" min-width="140" />
          <el-table-column prop="created_at" label="创建时间" width="150"><template #default="{ row }">{{ fmtDate(row.created_at) }}</template></el-table-column>
          <el-table-column label="操作" width="80"><template #default="{ row }"><el-button size="small" link type="danger" @click="doDelSsh(row)">删除</el-button></template></el-table-column>
        </el-table>
        <el-form label-width="60px" style="margin-top:12px">
          <el-form-item label="标题"><el-input v-model="sshDlg.title" /></el-form-item>
          <el-form-item label="公钥"><el-input v-model="sshDlg.key" type="textarea" :rows="3" placeholder="ssh-ed25519 AAAA..." /></el-form-item>
        </el-form>
        <el-button type="primary" @click="doAddSsh" :disabled="!sshDlg.title || !sshDlg.key">添加公钥</el-button>
      </div>
    </el-dialog>
  </div>
</template>
