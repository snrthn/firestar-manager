<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { listLoginLogs, unlockAccount } from '@/api/log'
import { formatDateTime } from '@/utils/datetime'
import type { LoginLogVO } from '@/types/log'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'

// 登录日志：账号模糊 / 状态精确 / 时间区间
const query = reactive({
  username: '',
  status: '',
  timeRange: [] as string[],
})
const handleQuery = () => {
  pageNum.value = 1
  loadLogs()
}
const resetQuery = () => {
  query.username = ''
  query.status = ''
  query.timeRange = []
  pageNum.value = 1
  loadLogs()
}

const loading = ref(false)
const logList = ref<LoginLogVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadLogs = async () => {
  loading.value = true
  const [startTime, endTime] = query.timeRange
  try {
    const page = await listLoginLogs(pageNum.value, pageSize.value, {
      username: query.username || undefined,
      status: query.status || undefined,
      startTime: startTime ? `${startTime} 00:00:00` : undefined,
      endTime: endTime ? `${endTime} 23:59:59` : undefined,
    })
    logList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

const handleSizeChange = () => {
  pageNum.value = 1
  loadLogs()
}

// 详情弹窗 + 解锁（爆破防护闭环的「恢复」入口，权限 log:unlock）
// 弹窗形态对齐操作日志页（views/log/operation.vue）：el-dialog + footer 关闭按钮
const detailVisible = ref(false)
const currentRow = ref<LoginLogVO | null>(null)

function openDetail(row: LoginLogVO) {
  currentRow.value = row
  detailVisible.value = true
}

async function handleUnlock() {
  const row = currentRow.value
  if (!row || !row.username) return
  const confirmed = await ElMessageBox.confirm(
    `确定要解锁账号「${row.username}」吗？解锁后该账号可正常登录。`,
    '解锁确认',
    { type: 'warning', confirmButtonText: '确定解锁', cancelButtonText: '取消' },
  ).then(() => true).catch(() => false)
  if (!confirmed) return
  try {
    await unlockAccount(row.username)
    ElMessage.success(`账号 ${row.username} 已解锁`)
    detailVisible.value = false
    loadLogs()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// 结果标签：字典 login_status 消费（下拉与表格同源，字典页维护即生效）。
// 兜底：空值 '—'，未命中显示原始值（字典缺口一眼可见）。
const { label: statusLabel } = useDictLabels('login_status')
function statusTagType(s?: string | null) {
  if (s === 'SUCCESS') return 'success'
  if (s === 'KICKED_OUT') return 'warning'
  if (s === 'FAIL') return 'danger'
  return 'info'
}

onMounted(loadLogs)
</script>

<template>
  <el-card shadow="never">
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="登录账号">
        <el-input v-model="query.username" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="运行结果">
        <!-- 结果：字典 login_status 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.status" type-code="login_status" placeholder="全部" />
      </el-form-item>
      <el-form-item label="时间区间">
        <el-date-picker
          v-model="query.timeRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 列宽重分配（2026-10-16 虎哥要求：账号/IP/时间收窄，宽度匀给浏览器 UA）：
         账号 admin 内容极短，min-width→width 110 固定；IP 130；UA/失败原因吃弹性剩余；
         时间列 width 固定不参与弹性拉伸——否则 UA 永远吃不饱 -->
    <el-table v-loading="loading" :data="logList" border>
      <el-table-column prop="username" label="登录账号" width="160" align="center">
        <template #default="{ row }">{{ row.username || '—' }}</template>
      </el-table-column>
      <el-table-column label="结果" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.loginStatus)" size="small">{{ statusLabel(row.loginStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="ipAddress" label="IP" width="150" align="center" show-overflow-tooltip />
      <el-table-column prop="userAgent" label="浏览器 UA" min-width="340" show-overflow-tooltip>
        <template #default="{ row }">{{ row.userAgent || '—' }}</template>
      </el-table-column>
      <el-table-column prop="failReason" label="失败原因" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.failReason || '—' }}</template>
      </el-table-column>
      <el-table-column prop="loginAt" label="时间" width="170" align="center">
        <template #default="{ row }">{{ formatDateTime(row.loginAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState description="暂无登录日志" />
    </template>
    </el-table>

    <!-- 详情弹窗：展示该条登录日志明细；账号被锁定时可在此手动解锁（二次确认）。
         形态对齐操作日志页（operation.vue）：el-dialog + footer 关闭按钮 -->
    <el-dialog v-model="detailVisible" title="登录日志详情" width="520px" append-to-body>
      <el-descriptions :column="1" border label-width="110px" v-if="currentRow">
        <el-descriptions-item label="登录账号">{{ currentRow.username || '—' }}</el-descriptions-item>
        <el-descriptions-item label="结果">
          <el-tag :type="statusTagType(currentRow.loginStatus)" size="small">
            {{ statusLabel(currentRow.loginStatus) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="IP">{{ currentRow.ipAddress || '—' }}</el-descriptions-item>
        <el-descriptions-item label="浏览器 UA">{{ currentRow.userAgent || '—' }}</el-descriptions-item>
        <el-descriptions-item label="失败原因">{{ currentRow.failReason || '—' }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ formatDateTime(currentRow.loginAt) }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button
          type="warning"
          v-has-perm="'log:unlock'"
          v-if="currentRow && currentRow.loginStatus === 'LOCKED'"
          @click="handleUnlock"
        >
          解锁该账号
        </el-button>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="loadLogs"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
</style>
