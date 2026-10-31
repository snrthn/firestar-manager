<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { useRoute } from 'vue-router'
import { Plus, Refresh, Search, Download } from '@element-plus/icons-vue'
import { downloadViaBackend } from '@/utils/fileDownload'
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
import InvoiceIssueDialog from './InvoiceIssueDialog.vue'

// 查询条件（2026-10-28 补齐，口径对齐核销台账）：项目 / 发票号码 / 项目名称 /
// 发票类型 / 单据方向 / 开票状态 / 开票日期区间。后端 InvoiceController.page 已声明
// 全部参数（未声明的键会被忽略）——按需传即可。
const query = reactive({
  projectId: null as number | null,
  invoiceNo: '',
  projectName: '',
  invoiceType: '',
  docDirection: '',
  status: '',
  dateRange: null as [string, string] | null,
})

const handleQuery = () => {
  pageNum.value = 1
  loadList()
}
const resetQuery = () => {
  query.projectId = null
  query.invoiceNo = ''
  query.projectName = ''
  query.invoiceType = ''
  query.docDirection = ''
  query.status = ''
  query.dateRange = null
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
      invoiceNo: query.invoiceNo.trim() || undefined,
      projectName: query.projectName.trim() || undefined,
      invoiceType: query.invoiceType || undefined,
      docDirection: query.docDirection || undefined,
      status: query.status || undefined,
      dateFrom: query.dateRange?.[0],
      dateTo: query.dateRange?.[1],
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

const onExport = () => {
  const qs = new URLSearchParams()
  if (query.projectId != null) qs.append('projectId', String(query.projectId))
  if (query.invoiceNo.trim()) qs.append('invoiceNo', query.invoiceNo.trim())
  if (query.projectName.trim()) qs.append('projectName', query.projectName.trim())
  if (query.invoiceType) qs.append('invoiceType', query.invoiceType)
  if (query.docDirection) qs.append('docDirection', query.docDirection)
  if (query.status) qs.append('status', query.status)
  if (query.dateRange?.[0]) qs.append('dateFrom', query.dateRange[0])
  if (query.dateRange?.[1]) qs.append('dateTo', query.dateRange[1])
  downloadViaBackend('/invoice/export?' + qs.toString(), 'invoice_export.xlsx')
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
const { label: statusLabel, style: statusStyle } = useDictLabels('approval_status')
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
// 开票模式（V95 发票流程重构）：审批通过 SUBMITTED 的发票，由开票员在此回填票号并上传电子票
const issueVisible = ref(false)
const issueId = ref<number | null>(null)
const issueApplyNo = ref<string | null>(null)
const issueBuyerName = ref<string | null>(null)

const openIssue = (row: InvoiceVO) => {
  issueId.value = row.id
  issueApplyNo.value = row.applyNo ?? null
  issueBuyerName.value = row.buyerName ?? null
  issueVisible.value = true
}

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
      <el-form-item label="关联项目">
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
      <el-form-item label="发票号码">
        <el-input
          v-model="query.invoiceNo"
          placeholder="模糊匹配"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="项目名称">
        <el-input
          v-model="query.projectName"
          placeholder="模糊匹配"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="发票类型">
        <DictSelect v-model="query.invoiceType" type-code="invoice_type" placeholder="全部" />
      </el-form-item>
      <el-form-item label="单据方向">
        <DictSelect v-model="query.docDirection" type-code="doc_direction" placeholder="全部" />
      </el-form-item>
      <el-form-item label="开票状态">
        <DictSelect v-model="query.status" type-code="approval_status" placeholder="全部" />
      </el-form-item>
      <el-form-item label="开票日期">
        <el-date-picker
          v-model="query.dateRange"
          type="daterange"
          range-separator="~"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DD"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" v-has-perm="'invoice:create'" @click="openCreate">新建发票</el-button>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <el-button v-has-perm="'invoice:export'" :icon="Download" @click="onExport">导出</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <!-- 业务单号置首列（V95 2026-11-01）：applyNo 创建即生成、每张单必有；
           而发票号码/代码/日期属于「开票」节点，申请阶段恒为「—」，不适合当首列锚点 -->
      <el-table-column label="业务单号" width="170" show-overflow-tooltip>
        <template #default="{ row }">{{ row.applyNo || '—' }}</template>
      </el-table-column>
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
          <el-tag :type="statusStyle(row.approvalStatus) || 'info'" size="small">
            {{ statusLabel(row.approvalStatus) }}
          </el-tag>
          <span v-if="row.approvalStatus === 'APPROVING' && row.currentNodeName"
                style="margin-left: 4px; font-size: 12px; color: #909399">
            {{ row.currentNodeName }}
          </span>
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
          <!-- 开票（V95）：仅审批通过待开票（SUBMITTED）态显示，受 invoice:issue 权限门禁 -->
          <el-button
            v-if="row.approvalStatus === 'SUBMITTED'"
            v-has-perm="'invoice:issue'"
            link
            type="success"
            size="small"
            @click="openIssue(row)"
          >开票</el-button>
          <!-- 草稿态 + 已驳回态可编辑（驳回=回到编写中，用友范式，可改后重提） -->
          <el-button
            v-if="row.approvalStatus === 'DRAFT' || row.approvalStatus === 'REJECTED'"
            v-has-perm="'invoice:edit'"
            link
            type="primary"
            size="small"
            @click="openEdit(row)"
          >编辑</el-button>
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState />
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
  <!-- 开票（V95）：审批通过 SUBMITTED 的发票，由开票员回填票号并上传电子票 -->
  <InvoiceIssueDialog
    v-model:visible="issueVisible"
    :invoice-id="issueId"
    :apply-no="issueApplyNo"
    :buyer-name="issueBuyerName"
    @issued="reloadAfterMutation"
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
