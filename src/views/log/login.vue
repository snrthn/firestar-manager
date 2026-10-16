<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { listLoginLogs } from '@/api/log'
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
    <el-form :inline="true" :model="query" class="query-bar">
      <el-form-item label="账号">
        <el-input v-model="query.username" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="结果">
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
      <el-table-column prop="username" label="账号" width="160" align="center">
        <template #default="{ row }">{{ row.username || '—' }}</template>
      </el-table-column>
      <el-table-column label="结果" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.loginStatus)" size="small">{{ statusLabel(row.loginStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="ipAddress" label="IP" width="130" align="center" show-overflow-tooltip />
      <el-table-column prop="userAgent" label="浏览器 UA" min-width="340" show-overflow-tooltip>
        <template #default="{ row }">{{ row.userAgent || '—' }}</template>
      </el-table-column>
      <el-table-column prop="failReason" label="失败原因" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.failReason || '—' }}</template>
      </el-table-column>
      <el-table-column prop="loginAt" label="时间" width="170" align="center">
        <template #default="{ row }">{{ formatDateTime(row.loginAt) }}</template>
      </el-table-column>
    </el-table>

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
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
