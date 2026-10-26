<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { cancelReturn, returnPage } from '@/api/return'
import type { ReturnVO } from '@/types/return'
import ReturnCreateDialog from './ReturnCreateDialog.vue'
import ReturnDetailDialog from './ReturnDetailDialog.vue'
import DictSelect from '@/components/DictSelect.vue'
import EmptyState from '@/components/EmptyState.vue'
import { formatDateTime } from '@/utils/datetime'

const createVisible = ref(false)
const detailVisible = ref(false)
const currentId = ref<number | null>(null)

const query = reactive({
  projectNo: '',
  projectName: '',
  status: '',
})

const loading = ref(false)
const list = ref<ReturnVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 金额格式化（两位小数 + 千分位，全站同约定）
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const load = async () => {
  loading.value = true
  try {
    const page = await returnPage(pageNum.value, pageSize.value, {
      projectNo: query.projectNo.trim() || undefined,
      projectName: query.projectName.trim() || undefined,
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

const handleQuery = () => {
  pageNum.value = 1
  load()
}
const handleReset = () => {
  query.projectNo = ''
  query.projectName = ''
  query.status = ''
  handleQuery()
}

const openDetail = (row: ReturnVO) => {
  currentId.value = row.id
  detailVisible.value = true
}

/**
 * 撤销按钮显隐：直接吃后端算好的 canCancel。
 * 前端拿不到可靠的当前用户 ID（ProfileVO 只有 username，没有 id），与其让浏览器端
 * 猜「是不是本人」、点了再被后端三道闸弹错，不如后端按 currentUserId 直接算。
 */

const onCancel = async (row: ReturnVO) => {
  try {
    await ElMessageBox.confirm(
      `确认撤销退货申请 ${row.returnNo || ''}？撤销后流程终止，可重新发起。`,
      '撤销退货申请',
      { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await cancelReturn(row.id)
    ElMessage.success('已撤销')
    load()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

onMounted(load)
</script>

<template>
  <!-- 根直接是 el-card：AdminLayout 的 .view-wrap 已给 16px 内容内边距，
       不再包一层 .page-wrap，否则比其他列表页多一圈空白（2026-10-25 统一布局口径） -->
  <el-card shadow="never">
    <!-- 查询区：控件宽度走 pages.css 的 .query-bar 统一规范（200px / 日期 300px），不内联绕过 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="项目编号">
        <el-input v-model="query.projectNo" placeholder="支持模糊" clearable />
      </el-form-item>
      <el-form-item label="项目名称">
        <el-input v-model="query.projectName" placeholder="支持模糊" clearable />
      </el-form-item>
      <el-form-item label="审批状态">
        <DictSelect
          v-model="query.status"
          type-code="approval_status"
          placeholder="全部"
          clearable
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 工具条：主动作 + 刷新（与 shipment/invoice/receipt 列表同款两件套），样式吃全局 .toolbar -->
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="createVisible = true">发起退货</el-button>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <!-- 列表：主列表表格走默认 size（同 receipt/shipment/invoice），不缩到 small -->
    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="returnNo" label="退货单号" min-width="170" fixed="left" show-overflow-tooltip />
      <el-table-column label="项目" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.projectNo || '—' }} {{ row.projectName || '' }}
        </template>
      </el-table-column>
      <el-table-column prop="shipmentBatchNo" label="发货批次" min-width="180" show-overflow-tooltip />
      <el-table-column label="退货金额" min-width="130" align="right">
        <template #default="{ row }">
          <b class="amount">¥{{ formatAmount(row.returnAmount) }}</b>
        </template>
      </el-table-column>
      <el-table-column label="审批状态" width="160" align="center">
        <template #default="{ row }">
          <el-tag :type="(row.approvalStatusStyle as any) || 'info'" size="small">
            {{ row.approvalStatusName || row.approvalStatus || '—' }}
          </el-tag>
          <span v-if="row.approvalStatus === 'APPROVING' && row.currentNodeName"
                style="margin-left: 4px; font-size: 12px; color: #909399">
            {{ row.currentNodeName }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="执行状态" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="(row.executeStatusStyle as any) || 'info'" size="small" effect="plain">
            {{ row.executeStatusName || row.executeStatus || '—' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="applicantName" label="申请人" min-width="110" align="center" />
      <el-table-column label="申请时间" min-width="160" align="center">
        <template #default="{ row }">{{ formatDateTime(row.appliedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right" align="center">
        <template #default="{ row }">
          <!-- 操作按钮一律 size="small"，同 receipt 列表口径 -->
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          <el-button v-if="row.canCancel" link type="danger" size="small" @click="onCancel(row)">撤销</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState description="暂无退货记录" />
      </template>
    </el-table>

    <!-- 分页器：站内统一写法（.pagination-bar 右对齐 + background + 10/20/50/100 四档） -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="load"
        @size-change="handleQuery"
      />
    </div>
  </el-card>

  <ReturnCreateDialog v-model:visible="createVisible" @saved="handleQuery" />
  <ReturnDetailDialog v-model:visible="detailVisible" :return-id="currentId" @refresh="load" />
</template>

<style scoped>
.amount {
  color: var(--el-color-danger);
}
</style>
