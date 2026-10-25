<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { receivablePage } from '@/api/receivable'
import { projectPage } from '@/api/project'
import type { ReceivableVO } from '@/types/receivable'
import type { ProjectVO } from '@/types/project'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'
import { formatDate } from '@/utils/datetime'
import ReceivableDetailDialog from './ReceivableDetailDialog.vue'

// 应收管理列表页（只读）。
// 应收单由发货「客户已收货」时点自动生成，1 发货 = 1 应收单，后端不暴露写接口，
// 故本页不提供新建/编辑，只做列表 + 详情。
// 查询条件：后端 ReceivableController.page 只声明 projectId / status
// （@RequestParam 未声明的键会被忽略），不做单号模糊查询。
const query = reactive({ projectId: null as number | null, status: '' })

const handleQuery = () => {
  pageNum.value = 1
  loadList()
}
const resetQuery = () => {
  query.projectId = null
  query.status = ''
  pageNum.value = 1
  loadList()
}

const loading = ref(false)
const list = ref<ReceivableVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadList = async () => {
  loading.value = true
  try {
    const page = await receivablePage(pageNum.value, pageSize.value, {
      projectId: query.projectId ?? undefined,
      status: query.status || undefined,
    })
    list.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

const handleSizeChange = () => {
  pageNum.value = 1
  loadList()
}

const projectOptions = ref<ProjectVO[]>([])
const loadProjects = async () => {
  try {
    const page = await projectPage(1, 500, { approvalStatus: 'APPROVED' })
    projectOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const { label: statusLabel, style: statusStyle } = useDictLabels('receivable_status')
const { label: sourceTypeLabel, style: sourceTypeStyle } = useDictLabels('receivable_source')

const detailVisible = ref(false)
const detailId = ref<number | null>(null)

const openDetail = (row: ReceivableVO) => {
  detailId.value = row.id
  detailVisible.value = true
}

onMounted(() => {
  loadProjects()
  loadList()
})
</script>

<template>
  <el-card shadow="never">
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="项目">
        <el-select
          v-model="query.projectId"
          filterable
          clearable
          placeholder="全部项目"
        >
          <el-option
            v-for="p in projectOptions"
            :key="p.id"
            :label="`${p.projectNo || '—'} ${p.projectName}`"
            :value="p.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="应收状态">
        <DictSelect v-model="query.status" type-code="receivable_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <span class="muted">应收单由发货「客户已收货」自动生成，不支持手工新增</span>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column label="应收单号" min-width="170" show-overflow-tooltip>
        <template #default="{ row }">{{ row.receivableNo || '—' }}</template>
      </el-table-column>
      <el-table-column label="项目编号" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ row.projectNo || '—' }}</template>
      </el-table-column>
      <el-table-column label="项目名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.projectName || '—' }}</template>
      </el-table-column>
      <el-table-column label="来源类型" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="sourceTypeStyle(row.sourceType) || 'info'" size="small">
            {{ sourceTypeLabel(row.sourceType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="应收金额" width="140" align="right">
        <template #default="{ row }">{{ formatAmount(row.receivableAmount) }}</template>
      </el-table-column>
      <el-table-column label="已核销" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.writtenOffAmount) }}</template>
      </el-table-column>
      <el-table-column label="未核销" width="130" align="right">
        <template #default="{ row }"><b>{{ formatAmount(row.unwrittenOffAmount) }}</b></template>
      </el-table-column>
      <el-table-column label="已开票" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.invoicedAmount) }}</template>
      </el-table-column>
      <el-table-column label="未开票" width="130" align="right">
        <template #default="{ row }"><b>{{ formatAmount(row.uninvoicedAmount) }}</b></template>
      </el-table-column>
      <el-table-column label="已回款" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.receivedAmount) }}</template>
      </el-table-column>
      <el-table-column label="未回款" width="130" align="right">
        <template #default="{ row }"><b>{{ formatAmount(row.unreceivedAmount) }}</b></template>
      </el-table-column>
      <el-table-column label="应收日期" width="120" align="center">
        <template #default="{ row }">{{ formatDate(row.receivableDate) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="statusStyle(row.status) || 'info'" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
        </template>
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
        @current-change="loadList"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <ReceivableDetailDialog v-model:visible="detailVisible" :receivable-id="detailId" />
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.muted {
  color: #909399;
  font-size: 12px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
</style>
