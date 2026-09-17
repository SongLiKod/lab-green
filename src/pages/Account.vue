<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAppStore } from '../stores/app'
import { isMobile, fmtDate, downloadText } from '../utils/misc'
import { sshKeys, addSshKey, deleteSshKey } from '../api/gitlab'
import { ElMessage, ElMessageBox } from 'element-plus'

const app = useAppStore()
const mobile = ref(isMobile())

const addDlg = reactive({ show: false, baseUrl: 'https://gitlab.com', token: '', remark: '', group: '', saving: false })
const editDlg = reactive({ show: false, id: '', remark: '', group: '', token: '', baseUrl: '', saving: false })
const sshDlg = reactive({ show: false, acctId: '', list: [] as any[], title: '', key: '', loading: false })

const statusMap: any = { ok: ['success', '正常'], expired: ['warning', '异常'], invalid: ['danger', '失效'], unknown: ['info', '未知'] }
const vanStatus: any = { ok: 'success', expired: 'warning', invalid: 'danger', unknown: 'default' }

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
  } catch (e: any) { ElMessage.error(e.message) } finally { editDlg.saving = false }
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
    sshDlg.title = ''; sshDlg.key = ''
    await openSsh(a)
  } catch (e: any) { ElMessage.error(e.message) }
}
async function doDelSsh(k: any) {
  const a = app.accounts.find((x) => x.id === sshDlg.acctId)!
  await deleteSshKey({ id: a.id, baseUrl: a.baseUrl, token: a.token }, k.id)
  await openSsh(a)
}

function exportBackup() {
  downloadText(`labgreen-backup-${Date.now()}.json`, app.exportBackup())
}
const importText = ref('')
async function importBackup() {
  try {
    await app.importBackup(importText.value)
    ElMessage.success('导入成功')
    importText.value = ''
  } catch (e: any) { ElMessage.error('导入失败：' + e.message) }
}

/* 移动端操作面板 */
const sheet = reactive({ show: false, acct: null as any, showImport: false })
const actions = [
  { name: '切换使用', key: 'use' }, { name: '状态检测', key: 'check' },
  { name: '编辑/更新令牌', key: 'edit' }, { name: 'SSH 公钥', key: 'ssh' },
  { name: '删除账号', key: 'del', color: '#e6493f' }
]
function openSheet(a: any) { sheet.show = true; sheet.acct = a }
function onAction(act: any) {
  const a = sheet.acct
  sheet.show = false
  switch (act.key) {
    case 'use': app.setAccount(a.id); ElMessage.success('已切换'); break
    case 'check': check(a.id); break
    case 'edit': openEdit(a); break
    case 'ssh': openSsh(a); break
    case 'del': remove(a.id); break
  }
}
</script>

<template>
  <!-- ================= 桌面 ================= -->
  <div v-if="!mobile">
    <div class="lg-toolbar">
      <el-button type="primary" @click="addDlg.show = true">添加账号</el-button>
      <span class="grow"></span>
      <el-button plain @click="exportBackup" :disabled="!app.accounts.length">导出加密备份</el-button>
    </div>
    <div class="lg-card">
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
      <el-empty v-if="!app.accounts.length" description="暂无账号，点击「添加账号」开始使用" :image-size="60" />
    </div>
    <div class="lg-card" style="margin-top:14px">
      <div class="lg-title">导入加密备份</div>
      <el-input v-model="importText" type="textarea" :rows="3" placeholder="粘贴备份 JSON（含密文凭证与密钥材料，可跨设备还原）" />
      <el-button style="margin-top:8px" type="warning" plain @click="importBackup" :disabled="!importText">导入并覆盖本地账号</el-button>
    </div>
  </div>

  <!-- ================= 移动（Vant） ================= -->
  <div v-else>
    <van-cell-group inset class="m-group">
      <van-cell v-for="a in app.accounts" :key="a.id" is-link :class="{ 'm-cur': a.id === app.currentAccountId }"
        :title="a.remark || a.name" :label="a.username + ' · ' + a.baseUrl" @click="openSheet(a)">
        <template #value>
          <van-tag :type="vanStatus[a.status]">{{ statusMap[a.status]?.[1] }}</van-tag>
        </template>
      </van-cell>
      <van-empty v-if="!app.accounts.length" description="暂无账号" :image-size="60" />
    </van-cell-group>

    <div class="m-btns">
      <van-button type="success" block round icon="plus" @click="addDlg.show = true">添加账号</van-button>
      <van-button plain type="primary" block round icon="down" @click="exportBackup" :disabled="!app.accounts.length">导出加密备份</van-button>
      <van-button plain type="warning" block round icon="upgrade" @click="importText = ''; sheet.showImport = true">导入备份</van-button>
    </div>

    <van-action-sheet v-model:show="sheet.show" :actions="actions" cancel-text="取消" close-on-click-action @select="onAction" :description="sheet.acct ? (sheet.acct.remark || sheet.acct.name) : ''" />

    <van-popup v-model:show="sheet.showImport" position="bottom" round style="padding:16px">
      <div class="m-pop-title">导入加密备份</div>
      <van-field v-model="importText" type="textarea" rows="5" placeholder="粘贴备份 JSON" />
      <van-button type="warning" block round style="margin-top:12px" @click="sheet.showImport = false; importBackup()">导入并覆盖</van-button>
    </van-popup>
  </div>

  <!-- ============ 共用弹窗（桌面 el-dialog / 移动自动全屏） ============ -->
  <el-dialog v-model="addDlg.show" title="添加 GitLab 账号" width="460px" :fullscreen="mobile">
    <el-form label-width="90px">
      <el-form-item label="实例地址"><el-input v-model="addDlg.baseUrl" placeholder="https://gitlab.com 或自建实例地址" /></el-form-item>
      <el-form-item label="访问令牌"><el-input v-model="addDlg.token" type="password" show-password placeholder="Personal Access Token（需 read_api）" /></el-form-item>
      <el-form-item label="备注"><el-input v-model="addDlg.remark" placeholder="如：公司 / 个人" /></el-form-item>
      <el-form-item label="分组"><el-input v-model="addDlg.group" placeholder="可选" /></el-form-item>
    </el-form>
    <div class="lg-sub">令牌仅以 AES-256-GCM 加密存储在本机，不经过任何第三方服务器。</div>
    <template #footer><el-button @click="addDlg.show = false">取消</el-button><el-button type="primary" :loading="addDlg.saving" @click="doAdd">校验并保存</el-button></template>
  </el-dialog>

  <el-dialog v-model="editDlg.show" title="编辑账号" width="440px" :fullscreen="mobile">
    <el-form label-width="90px">
      <el-form-item label="备注"><el-input v-model="editDlg.remark" /></el-form-item>
      <el-form-item label="分组"><el-input v-model="editDlg.group" /></el-form-item>
      <el-form-item label="实例地址"><el-input v-model="editDlg.baseUrl" /></el-form-item>
      <el-form-item label="更新令牌"><el-input v-model="editDlg.token" type="password" placeholder="留空则不更新" show-password /></el-form-item>
    </el-form>
    <template #footer><el-button @click="editDlg.show = false">取消</el-button><el-button type="primary" @click="doEdit">保存</el-button></template>
  </el-dialog>

  <el-dialog v-model="sshDlg.show" title="SSH 公钥管理" width="560px" :fullscreen="mobile">
    <div v-loading="sshDlg.loading">
      <van-cell-group inset>
        <van-cell v-for="k in sshDlg.list" :key="k.id" :title="k.title" :label="fmtDate(k.created_at)">
          <template #right-icon><van-button size="mini" color="#e6493f" @click="doDelSsh(k)">删除</van-button></template>
        </van-cell>
        <van-empty v-if="!sshDlg.list.length" description="暂无公钥" :image-size="50" />
      </van-cell-group>
      <el-form label-width="60px" style="margin-top:12px">
        <el-form-item label="标题"><el-input v-model="sshDlg.title" /></el-form-item>
        <el-form-item label="公钥"><el-input v-model="sshDlg.key" type="textarea" :rows="3" placeholder="ssh-ed25519 AAAA..." /></el-form-item>
      </el-form>
      <el-button type="primary" @click="doAddSsh" :disabled="!sshDlg.title || !sshDlg.key">添加公钥</el-button>
    </div>
  </el-dialog>
</template>

<style scoped>
.m-group { margin-bottom: 12px; }
.m-cur { border-left: 3px solid var(--lg-primary); }
.m-btns { display: flex; flex-direction: column; gap: 10px; padding: 0 16px; }
.m-pop-title { font-weight: 600; margin-bottom: 10px; }
</style>
