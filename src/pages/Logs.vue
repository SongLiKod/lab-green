<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { queryLogs, clearLogs, pruneLogs, type OpLog } from '../utils/db'
import { useSettingsStore } from '../stores/settings'
import { isMobile, fmtDate, downloadText } from '../utils/misc'
import { ElMessage } from 'element-plus'

const settings = useSettingsStore()
const mobile = ref(isMobile())
const filter = reactive({ module: '', level: '', keyword: '' })
const rows = ref<OpLog[]>([])
const modules = ['账号', '项目', '仓库设置', '分支', '文件', 'Issue', 'MR', '流水线', 'Release', '备份', 'SSH', '设置']

async function load() { rows.value = await queryLogs(filter) }
onMounted(load)

async function exportCsv() {
  const head = 'time,module,action,level,detail\n'
  const body = rows.value.map((r) => [fmtDate(r.ts), r.module, r.action, r.level, (r.detail || '').replace(/[,|\n]/g, ' ')].join(',')).join('\n')
  downloadText(`labgreen-logs-${Date.now()}.csv`, head + body)
}
async function prune() {
  await pruneLogs(settings.s.logDays)
  ElMessage.success(`已清理 ${settings.s.logDays} 天前的日志`)
  load()
}
async function clearAll() { await clearLogs(); load() }
</script>

<template>
  <div>
    <div class="lg-toolbar" v-if="!mobile">
      <el-select v-model="filter.module" placeholder="模块" clearable size="small" style="width:130px" @change="load">
        <el-option v-for="m in modules" :key="m" :value="m" :label="m" />
      </el-select>
      <el-select v-model="filter.level" placeholder="级别" clearable size="small" style="width:110px" @change="load">
        <el-option value="info" label="info" /><el-option value="warn" label="warn" /><el-option value="error" label="error" />
      </el-select>
      <el-input v-model="filter.keyword" placeholder="关键词" size="small" clearable style="width:180px" @input="load" />
      <span class="grow"></span>
      <el-button size="small" @click="exportCsv">导出 CSV</el-button>
      <el-button size="small" @click="prune">按保留天数清理</el-button>
      <el-button size="small" type="danger" plain @click="clearAll">清空</el-button>
    </div>

    <div class="lg-card" v-if="!mobile">
      <el-table :data="rows" size="small" max-height="calc(100vh - 190px)">
        <el-table-column label="时间" width="160"><template #default="{ row }">{{ fmtDate(row.ts) }}</template></el-table-column>
        <el-table-column prop="module" label="模块" width="100" />
        <el-table-column prop="action" label="动作" min-width="220" />
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.level === 'error' ? 'danger' : row.level === 'warn' ? 'warning' : 'success'">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" min-width="200" show-overflow-tooltip />
      </el-table>
      <div v-if="!rows.length" class="lg-empty">暂无日志</div>
    </div>
    <template v-else>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <van-dropdown-menu active-color="#16a34a" style="flex:1;border-radius:8px;overflow:hidden">
          <van-dropdown-item v-model="filter.module" :options="[{text:'全部模块',value:''}, ...modules.map(m => ({ text: m, value: m }))]" @change="load" />
        </van-dropdown-menu>
        <van-dropdown-menu active-color="#16a34a" style="width:110px;border-radius:8px;overflow:hidden">
          <van-dropdown-item v-model="filter.level" :options="[{text:'级别',value:''},{text:'info',value:'info'},{text:'warn',value:'warn'},{text:'error',value:'error'}]" @change="load" />
        </van-dropdown-menu>
      </div>
      <van-search v-model="filter.keyword" shape="round" placeholder="搜索日志" @search="load" />
      <div style="display:flex;gap:8px;padding:0 16px 10px">
        <van-button size="small" round plain @click="exportCsv">导出</van-button>
        <van-button size="small" round plain @click="prune">按期清理</van-button>
        <van-button size="small" round plain type="danger" @click="clearAll">清空</van-button>
      </div>
      <div v-for="(r, i) in rows" :key="i" class="lg-mcard">
        <div style="display:flex;justify-content:space-between">
          <b>{{ r.module }} · {{ r.action }}</b>
          <van-tag :type="r.level === 'error' ? 'danger' : r.level === 'warn' ? 'warning' : 'success'">{{ r.level }}</van-tag>
        </div>
        <div class="lg-sub">{{ fmtDate(r.ts) }} {{ r.detail }}</div>
      </div>
      <van-empty v-if="!rows.length" description="暂无日志" :image-size="60" />
    </template>
  </div>
</template>
