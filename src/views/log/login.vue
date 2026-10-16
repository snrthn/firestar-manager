<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { listLoginLogs } from '@/api/log'
import type { LoginLogVO } from '@/types/log'

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

function statusTagType(s?: string | null) {
  if (s === 'SUCCESS') return 'success'
  if (s === 'KICKED_OUT') return 'warning'
  if (s === 'FAIL') return 'danger'
  return 'info'
}
function statusLabel(s?: string | null) {
  if (s === 'SUCCESS') return '成功'
  if (s === 'KICKED_OUT') return '被顶下线'
  if (s === 'FAIL') return '失败'
  return s || '—'
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
        <el-select v-model="query.status" placeholder="全部" clearable style="width: 140px">
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAIL" />
          <el-option label="被顶下线" value="KICKED_OUT" />
        </el-select>
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

    <el-table v-loading="loading" :data="logList" border>
      <el-table-column prop="username" label="账号" min-width="160">
        <template #default="{ row }">{{ row.username || '—' }}</template>
      </el-table-column>
      <el-table-column label="结果" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.loginStatus)" size="small">{{ statusLabel(row.loginStatus) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="ipAddress" label="IP" width="150" />
      <el-table-column prop="userAgent" label="浏览器 UA" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.userAgent || '—' }}</template>
      </el-table-column>
      <el-table-column prop="failReason" label="失败原因" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.failReason || '—' }}</template>
      </el-table-column>
      <el-table-column prop="loginAt" label="时间" min-width="170">
        <template #default="{ row }">{{ row.loginAt || '—' }}</template>
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
