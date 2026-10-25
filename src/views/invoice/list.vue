<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { invoicePage } from '@/api/invoice'
import { projectPage } from '@/api/project'
import type { InvoiceVO } from '@/types/invoice'
import type { ProjectVO } from '@/types/project'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'
import { formatDate, formatDateTime } from '@/utils/datetime'
import InvoiceCreateDialog from './InvoiceCreateDialog.vue'
import InvoiceDetailDialog from './InvoiceDetailDialog.vue'

// 查询条件：后端 InvoiceController.page 只声明 projectId / receivableId / status
// （@RequestParam 未声明的键会被忽略），故这里不做发票号/项目名模糊查询，避免「看起来能搜其实无效」。
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

// ===== 列表数据（分页：默认每页 10 条） =====
const loading = ref(false)
const list = ref<InvoiceVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadList = async () => {
  loading.value = true
  try {
    const page = await invoicePage(pageNum.value, pageSize.value, {
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

const reloadAfterMutation = async () => {
  await loadList()
  if (list.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadList()
  }
}

const handleSizeChange = () => {
  pageNum.value = 1
  loadList()
}

// 项目下拉（用于筛选）：跟随项目页口径，只列已审批项目
const projectOptions = ref<ProjectVO[]>([])
const loadProjects = async () => {
  try {
    const page = await projectPage(1, 500, { approvalStatus: 'APPROVED' })
    projectOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// 金额格式化（两位小数点 + 千分位）
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 字典翻译（开票状态 / 发票类型；字典维护页改色即生效）
const { label: statusLabel, style: statusStyle } = useDictLabels('invoice_status')
const { label: typeLabel, style: typeStyle } = useDictLabels('invoice_type')

// ===== 弹窗 =====
const createVisible = ref(false)
const detailVisible = ref(false)
const detailId = ref<number | null>(null)
// 编辑模式：复用同一个 InvoiceCreateDialog，靠 invoiceId 区分新建/编辑
const editVisible = ref(false)
const editId = ref<number | null>(null)
// 红冲模式（2026-10-25 红冲入口）：复用新建弹窗，靠 originalInvoiceId 切红冲模式
const redFlushVisible = ref(false)
const redFlushOriginalId = ref<number | null>(null)

const openCreate = () => {
  createVisible.value = true
}
const openEdit = (row: InvoiceVO) => {
  editId.value = row.id
  editVisible.value = true
}
const openDetail = (row: InvoiceVO) => {
  detailId.value = row.id
  detailVisible.value = true
}
/** 详情弹窗「红冲」：以红冲模式打开新建弹窗（先关详情，避免双层弹窗遮罩混乱） */
const openRedFlush = (invoiceId: number) => {
  detailVisible.value = false
  redFlushOriginalId.value = invoiceId
  redFlushVisible.value = true
}

const route = useRoute()

onMounted(() => {
  loadProjects()
  loadList()
  // 审批中心「查看详情」跳 /invoice?detail={invoiceId}：自动打开对应详情弹窗
  const detail = route.query.detail
  if (detail && !Number.isNaN(Number(detail))) {
    detailId.value = Number(detail)
    detailVisible.value = true
  }
})
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
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
      <el-form-item label="开票状态">
        <DictSelect v-model="query.status" type-code="invoice_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新建发票</el-button>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="invoiceNo" label="发票号码" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.invoiceNo || '—' }}</template>
      </el-table-column>
      <el-table-column prop="invoiceCode" label="发票代码" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.invoiceCode || '—' }}</template>
      </el-table-column>
      <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
      <el-table-column label="关联应收单" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.receivableNo || '—' }}</template>
      </el-table-column>
      <el-table-column label="发票类型" width="130" align="center">
        <template #default="{ row }">
          <el-tag :type="typeStyle(row.invoiceType) || 'info'" size="small">
            {{ typeLabel(row.invoiceType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="开票金额" width="150" align="right">
        <template #default="{ row }">{{ formatAmount(row.invoiceAmount) }}</template>
      </el-table-column>
      <el-table-column label="税额" width="140" align="right">
        <template #default="{ row }">{{ formatAmount(row.taxAmount) }}</template>
      </el-table-column>
      <el-table-column label="开票日期" width="120" align="center">
        <template #default="{ row }">{{ formatDate(row.invoiceDate) }}</template>
      </el-table-column>
      <el-table-column label="开票状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="statusStyle(row.invoiceStatus) || 'info'" size="small">
            {{ statusLabel(row.invoiceStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="开票人" min-width="100" show-overflow-tooltip>
        <template #default="{ row }">{{ row.clerkName || '—' }}</template>
      </el-table-column>
      <el-table-column prop="applicantName" label="申请人" min-width="100" show-overflow-tooltip>
        <template #default="{ row }">{{ row.applicantName || '—' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <!-- 操作列：编辑 + 详情两位固定；提交/撤回等业务动作收在详情弹窗内 -->
      <el-table-column label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <!-- 草稿态 + 已驳回态可编辑（驳回=回到编写中，用友范式，可改后重提） -->
          <el-button
            v-if="row.invoiceStatus === 'PENDING' || row.invoiceStatus === 'REJECTED'"
            link
            type="primary"
            size="small"
            @click="openEdit(row)"
          >编辑</el-button>
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

  <InvoiceCreateDialog v-model:visible="createVisible" @saved="reloadAfterMutation" />
  <!-- 编辑：与新建同一组件，传 invoiceId 切编辑模式 -->
  <InvoiceCreateDialog
    v-model:visible="editVisible"
    :invoice-id="editId"
    @saved="reloadAfterMutation"
  />
  <!-- 红冲：与新建同一组件，传 originalInvoiceId 切红冲模式（2026-10-25） -->
  <InvoiceCreateDialog
    v-model:visible="redFlushVisible"
    :original-invoice-id="redFlushOriginalId"
    @saved="reloadAfterMutation"
  />
  <InvoiceDetailDialog
    v-model:visible="detailVisible"
    :invoice-id="detailId"
    @updated="reloadAfterMutation"
    @red-flush="openRedFlush"
  />
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.toolbar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
</style>
