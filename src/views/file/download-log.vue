<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { listAllDownloadLogs } from '@/api/file'
import { useDictLabels } from '@/composables/useDict'
import { formatDateTime } from '@/utils/datetime'
import type { FileDownloadLogVO } from '@/types/file'

// 业务类型展示走字典（file_biz_type），与文件列表页口径一致，不再裸显英文域值
const { label: bizTypeLabel } = useDictLabels('file_biz_type')

// 下载记录（全局，不按文件过滤；菜单「下载记录」独立入口）
const query = reactive({ keyword: '' })
const handleQuery = () => {
  pageNum.value = 1
  loadLogs()
}
const resetQuery = () => {
  query.keyword = ''
  pageNum.value = 1
  loadLogs()
}

const loading = ref(false)
const logList = ref<FileDownloadLogVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadLogs = async () => {
  loading.value = true
  try {
    const page = await listAllDownloadLogs(pageNum.value, pageSize.value, query.keyword || undefined)
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

onMounted(loadLogs)
</script>

<template>
  <el-card shadow="never">
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="文件名">
        <el-input v-model="query.keyword" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="logList" border>
      <el-table-column prop="fileName" label="文件名" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.fileName || '—' }}</template>
      </el-table-column>
      <el-table-column label="别名" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.alias || '—' }}</template>
      </el-table-column>
      <el-table-column prop="bizType" label="业务类型" width="120">
        <template #default="{ row }">{{ bizTypeLabel(row.bizType || 'common') }}</template>
      </el-table-column>
      <el-table-column prop="downloaderName" label="下载人" width="140" />
      <el-table-column prop="downloadIp" label="下载 IP" width="150" show-overflow-tooltip />
      <el-table-column prop="downloadedAt" label="下载时间" min-width="100">
        <template #default="{ row }">{{ formatDateTime(row.downloadedAt) }}</template>
      </el-table-column>
    <template #empty>
      <EmptyState description="暂无下载记录" />
    </template>
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
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
</style>
