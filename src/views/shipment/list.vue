<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { shipmentPage } from '@/api/shipment'
import type { ShipmentVO } from '@/types/shipment'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'
import { formatDateTime } from '@/utils/datetime'
import ShipmentCreateDialog from './ShipmentCreateDialog.vue'
import ShipmentDetailDialog from './ShipmentDetailDialog.vue'

// 查询条件（批次号 / 项目名 模糊、状态精确；后端 /shipment/page 对齐）
const query = reactive({ batchNo: '', projectName: '', status: '' })

const handleQuery = () => {
  pageNum.value = 1
  loadList()
}
const resetQuery = () => {
  query.batchNo = ''
  query.projectName = ''
  query.status = ''
  pageNum.value = 1
  loadList()
}

// ===== 列表数据（分页：默认每页 10 条） =====
const loading = ref(false)
const list = ref<ShipmentVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadList = async () => {
  loading.value = true
  try {
    const page = await shipmentPage(pageNum.value, pageSize.value, {
      batchNo: query.batchNo || undefined,
      projectName: query.projectName || undefined,
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

// 金额格式化（两位小数点 + 千分位）
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 发货状态字典（标签 + 颜色，字典维护页改色即生效）
const { label: statusLabel, style: statusStyle } = useDictLabels('shipment_status')

// ===== 弹窗 =====
const createVisible = ref(false)
const detailVisible = ref(false)
const detailId = ref<number | null>(null)
// 编辑模式：复用同一个 ShipmentCreateDialog，靠 shipmentId 区分新建/编辑（2026-10-23）
const editVisible = ref(false)
const editId = ref<number | null>(null)

const openCreate = () => {
  createVisible.value = true
}
const openEdit = (row: ShipmentVO) => {
  editId.value = row.id
  editVisible.value = true
}
const openDetail = (row: ShipmentVO) => {
  detailId.value = row.id
  detailVisible.value = true
}

const route = useRoute()

onMounted(() => {
  loadList()
  // 审批中心「查看详情」跳 /shipment?detail={shipmentId}：自动打开对应详情弹窗（2026-10-23）
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
      <el-form-item label="批次号">
        <el-input v-model="query.batchNo" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="项目名称">
        <el-input v-model="query.projectName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="发货状态">
        <DictSelect v-model="query.status" type-code="shipment_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新建发货</el-button>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="batchNo" label="批次号" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.batchNo || '—' }}</template>
      </el-table-column>
      <el-table-column prop="projectNo" label="项目编号" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.projectNo || '—' }}</template>
      </el-table-column>
      <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="customerName" label="客户名称" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.customerName || '—' }}</template>
      </el-table-column>
      <el-table-column label="发货金额" width="120" align="right">
        <template #default="{ row }">{{ formatAmount(row.shipmentAmount) }}</template>
      </el-table-column>
      <el-table-column label="发货状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="statusStyle(row.shipmentStatus) || 'info'" size="small">
            {{ statusLabel(row.shipmentStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="applicantName" label="申请人" min-width="100" show-overflow-tooltip>
        <template #default="{ row }">{{ row.applicantName || '—' }}</template>
      </el-table-column>
      <el-table-column prop="shippedByName" label="发货人" min-width="100" show-overflow-tooltip>
        <template #default="{ row }">{{ row.shippedByName || '—' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <!-- 操作列（2026-10-23 虎哥统一规划）：编辑 + 详情两位固定；
           标记发货/标记收货/撤回等业务动作收在详情弹窗内，避免按钮随状态漂移 -->
      <el-table-column label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <!-- 仅待发货（PENDING）且未审批通过可编辑：审批通过（APPROVED）后锁编辑，直接标记发货；
               已发货/已收货/已驳回/已撤销改内容会与库存、应收冲突（2026-10-24 虎哥：审批通过后不展示编辑入口） -->
          <el-button
            v-if="row.shipmentStatus === 'PENDING' && row.approvalStatus !== 'APPROVED'"
            link type="primary" size="small"
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

  <ShipmentCreateDialog v-model:visible="createVisible" @saved="reloadAfterMutation" />
  <!-- 编辑：与新建同一组件，传 shipmentId 切编辑模式（项目锁定、明细回填、走 PUT） -->
  <ShipmentCreateDialog
    v-model:visible="editVisible"
    :shipment-id="editId"
    @saved="reloadAfterMutation"
  />
  <ShipmentDetailDialog v-model:visible="detailVisible" :shipment-id="detailId" @updated="reloadAfterMutation" />
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
