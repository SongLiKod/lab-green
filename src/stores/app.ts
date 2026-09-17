import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { encText, decText, sha256, exportKeyMaterial, importKeyMaterial } from '../utils/crypto'
import { uid } from '../utils/misc'
import { verifyToken } from '../api/gitlab'
import type { AcctCtx } from '../api/request'
import { addLog } from '../utils/db'

export interface StoredAccount {
  id: string; baseUrl: string; encToken: string
  username: string; name: string; avatar: string
  remark: string; group: string
  status: 'ok' | 'expired' | 'invalid' | 'unknown'
  updatedAt: number
}

export interface Account extends Omit<StoredAccount, 'encToken'> { token: string }

export interface CurrentProject { accountId: string; id: number; name: string; pathWithNamespace: string; defaultBranch: string }

const KEY = 'labgreen_accounts'
const CUR_ACCT = 'labgreen_cur_acct'
const CUR_PROJ = 'labgreen_cur_project'
const PIN_KEY = 'labgreen_pin'

function readStored(): StoredAccount[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function writeStored(list: StoredAccount[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export const useAppStore = defineStore('app', () => {
  const accounts = ref<Account[]>([])
  const currentAccountId = ref<string>(localStorage.getItem(CUR_ACCT) || '')
  const currentProject = ref<CurrentProject | null>(JSON.parse(localStorage.getItem(CUR_PROJ) || 'null'))
  const locked = ref(false)
  const booting = ref(true)

  const currentAccount = computed(() => accounts.value.find((x) => x.id === currentAccountId.value) || null)
  const ctx = computed<AcctCtx | null>(() => {
    const a = currentAccount.value
    return a && a.token ? { id: a.id, baseUrl: a.baseUrl, token: a.token } : null
  })
  /** 当前页面上下文：账号 + 项目 id */
  const target = computed(() => {
    if (!ctx.value || !currentProject.value || currentProject.value.accountId !== currentAccountId.value) return null
    return { acct: ctx.value, projectId: currentProject.value.id }
  })

  async function load() {
    const list = readStored()
    const out: Account[] = []
    for (const s of list) {
      let token = ''
      try { token = await decText(s.encToken) } catch { /* 无法解密 */ }
      out.push({ ...s, token, status: token ? s.status : 'invalid' })
    }
    accounts.value = out
    if (!out.find((x) => x.id === currentAccountId.value)) currentAccountId.value = out[0]?.id || ''
    booting.value = false
  }

  function setAccount(id: string) {
    currentAccountId.value = id
    localStorage.setItem(CUR_ACCT, id)
  }

  function setProject(p: CurrentProject | null) {
    currentProject.value = p
    if (p) localStorage.setItem(CUR_PROJ, JSON.stringify(p))
    else localStorage.removeItem(CUR_PROJ)
  }

  async function addAccount(baseUrl: string, token: string, remark: string, group: string) {
    const user = await verifyToken(baseUrl, token)
    const stored: StoredAccount = {
      id: uid(), baseUrl: baseUrl.replace(/\/+$/, ''), encToken: await encText(token),
      username: user.username, name: user.name, avatar: user.avatar_url || '',
      remark: remark || user.name, group: group || '', status: 'ok', updatedAt: Date.now()
    }
    writeStored([...readStored(), stored])
    accounts.value.push({ ...stored, token })
    setAccount(stored.id)
    await addLog('账号', `添加账号 ${user.username}`, 'info', baseUrl)
    return stored
  }

  async function updateAccount(id: string, patch: { remark?: string; group?: string; token?: string; baseUrl?: string }) {
    const list = readStored()
    const s = list.find((x) => x.id === id)
    if (!s) throw new Error('账号不存在')
    if (patch.remark !== undefined) s.remark = patch.remark
    if (patch.group !== undefined) s.group = patch.group
    if (patch.baseUrl !== undefined) s.baseUrl = patch.baseUrl.replace(/\/+$/, '')
    if (patch.token) {
      const user = await verifyToken(s.baseUrl, patch.token)
      s.encToken = await encText(patch.token)
      s.username = user.username; s.name = user.name; s.avatar = user.avatar_url || ''; s.status = 'ok'
    }
    s.updatedAt = Date.now()
    writeStored(list)
    const mem = accounts.value.find((x) => x.id === id)
    if (mem) Object.assign(mem, { ...s, token: patch.token || mem.token })
    await addLog('账号', `更新账号 ${s.username}`, 'info')
  }

  async function removeAccount(id: string) {
    const s = readStored().find((x) => x.id === id)
    writeStored(readStored().filter((x) => x.id !== id))
    accounts.value = accounts.value.filter((x) => x.id !== id)
    if (currentAccountId.value === id) setAccount(accounts.value[0]?.id || '')
    if (currentProject.value?.accountId === id) setProject(null)
    await addLog('账号', `删除账号 ${s?.username || id}`, 'warn')
  }

  async function checkAccount(id: string) {
    const a = accounts.value.find((x) => x.id === id)
    if (!a) return
    try {
      await verifyToken(a.baseUrl, a.token)
      a.status = 'ok'
    } catch (e: any) {
      a.status = e?.status === 401 || e?.status === 0 ? 'invalid' : 'expired'
    }
    const list = readStored()
    const s = list.find((x) => x.id === id)
    if (s) { s.status = a.status; writeStored(list) }
    return a.status
  }

  /* ---------- 备份 / 还原（含密钥材料，密文导出） ---------- */
  function exportBackup(): string {
    return JSON.stringify({ app: 'lab-green', version: 1, keys: exportKeyMaterial(), accounts: readStored() })
  }
  async function importBackup(text: string) {
    const obj = JSON.parse(text)
    if (obj.app !== 'lab-green') throw new Error('不是 LabGreen 备份文件')
    importKeyMaterial(obj.keys)
    writeStored(obj.accounts || [])
    await addLog('备份', '导入配置备份', 'warn', `${(obj.accounts || []).length} 个账号`)
    await load()
  }

  /* ---------- 应用锁 ---------- */
  async function setPin(pin: string) {
    localStorage.setItem(PIN_KEY, await sha256('lg:' + pin))
  }
  async function unlock(pin: string): Promise<boolean> {
    const h = localStorage.getItem(PIN_KEY)
    if (!h) return false
    const ok = (await sha256('lg:' + pin)) === h
    if (ok) locked.value = false
    return ok
  }
  /** 仅校验 PIN，不改变锁定状态 */
  async function checkPin(pin: string): Promise<boolean> {
    const h = localStorage.getItem(PIN_KEY)
    if (!h) return false
    return (await sha256('lg:' + pin)) === h
  }
  function hasPin() { return !!localStorage.getItem(PIN_KEY) }
  function clearPin() { localStorage.removeItem(PIN_KEY); locked.value = false }
  function lockNow() { if (hasPin()) locked.value = true }

  return {
    accounts, currentAccountId, currentAccount, ctx, currentProject, target, locked, booting,
    load, setAccount, setProject, addAccount, updateAccount, removeAccount, checkAccount,
    exportBackup, importBackup, setPin, unlock, checkPin, hasPin, clearPin, lockNow
  }
})
