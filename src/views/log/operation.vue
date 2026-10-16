<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { listOperationLogs } from '@/api/log'
import { formatDateTime } from '@/utils/datetime'
import type { AuditLogVO } from '@/types/log'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'

// 操作审计：操作人模糊 / 目标类型精确 / 操作类型精确 / 时间区间
const query = reactive({
  operator: '',
  targetType: '',
  operationType: '',
  timeRange: [] as string[],
})
const handleQuery = () => {
  pageNum.value = 1
  loadLogs()
}
const resetQuery = () => {
  query.operator = ''
  query.targetType = ''
  query.operationType = ''
  query.timeRange = []
  pageNum.value = 1
  loadLogs()
}

// 目标类型：字典 audit_target_type 消费（V22 新增，与后端 @Auditable 真实落库的
// 6 个目标类型 USER/ROLE/MENU/DICT_TYPE/DICT_DATA/FILE 一一对应）。
const { label: targetTypeLabel } = useDictLabels('audit_target_type')
// 操作类型：字典 audit_operation 消费（下拉 + 表格标签同源）。
// V21 已为字典补 UPLOAD 项（后端 FileServiceImpl @Auditable("UPLOAD") 真实落库值）。
const { label: opLabel } = useDictLabels('audit_operation')

const loading = ref(false)
const logList = ref<AuditLogVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadLogs = async () => {
  loading.value = true
  const [startTime, endTime] = query.timeRange
  try {
    const page = await listOperationLogs(pageNum.value, pageSize.value, {
      operator: query.operator || undefined,
      targetType: query.targetType || undefined,
      operationType: query.operationType || undefined,
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

function opTagType(op?: string | null) {
  if (op === 'CREATE') return 'success'
  if (op === 'UPDATE') return 'warning'
  if (op === 'DELETE') return 'danger'
  if (op === 'UPLOAD') return 'primary'
  return 'info'
}
// before/after 关键字段 diff
interface DiffRow {
  key: string
  before: unknown
  after: unknown
}
function diffOf(row: AuditLogVO): DiffRow[] {
  const before = row.beforeValue || {}
  const after = row.afterValue || {}
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)])
  return [...keys].map((k) => ({
    key: k,
    before: before[k] ?? '—',
    after: after[k] ?? '—',
  }))
}

const hasDiff = (row: AuditLogVO) => !!(row.beforeValue || row.afterValue)

// ===== 详情弹窗（2026-10-16 虎哥要求：由 expand 折叠改为弹窗，区域感更强）=====
const detailVisible = ref(false)
const detailRow = ref<AuditLogVO | null>(null)

const openDetail = (row: AuditLogVO) => {
  detailRow.value = row
  detailVisible.value = true
}

onMounted(loadLogs)
</script>

<template>
  <el-card shadow="never">
    <el-form :inline="true" :model="query" class="query-bar">
      <el-form-item label="操作人">
        <el-input v-model="query.operator" placeholder="模糊匹配账号" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="目标类型">
        <!-- 目标类型：字典 audit_target_type 消费（DictSelect 统一封装），不再本地枚举 -->
        <DictSelect v-model="query.targetType" type-code="audit_target_type" placeholder="全部" />
      </el-form-item>
      <el-form-item label="操作类型">
        <!-- 操作类型：字典 audit_operation 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.operationType" type-code="audit_operation" placeholder="全部" />
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

    <!-- 列宽重分配（2026-10-16 虎哥要求：备注/操作时间收窄，往前面各列匀）：
         操作人/目标类型/目标 ID/IP 各 +10~20 固定宽；备注 min-width 提到 200 吃弹性；
         操作时间 width 固定不再膨胀（原来 min-width 会把富余全吞了） -->
    <el-table v-loading="loading" :data="logList" border>
      <el-table-column prop="operatorName" label="操作人" width="180">
        <template #default="{ row }">{{ row.operatorName || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="opTagType(row.operationType)" size="small">{{ opLabel(row.operationType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="目标类型" width="130" align="center">
        <template #default="{ row }">{{ targetTypeLabel(row.targetType) }}</template>
      </el-table-column>
      <el-table-column prop="targetId" label="目标 ID" width="120" align="center" />
      <el-table-column prop="ipAddress" label="IP" width="160" align="center" />
      <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
      <!-- 操作时间放数据列末位（2026-10-16 虎哥要求：时间列靠后读起来更顺，列分布更均匀）；
           详情为 fixed right 操作列，仍保持最右。时间 width 固定不参与弹性拉伸 -->
      <el-table-column prop="operatedAt" label="操作时间" width="170" align="center">
        <template #default="{ row }">{{ formatDateTime(row.operatedAt) }}</template>
      </el-table-column>
      <el-table-column label="详情" width="90" align="center" fixed="right">
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
        @current-change="loadLogs"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 详情弹窗：完整字段 + 关键字段 diff（由 expand 折叠改造而来） -->
  <el-dialog v-model="detailVisible" title="操作日志详情" width="720px" append-to-body>
    <el-descriptions v-if="detailRow" :column="2" border>
      <el-descriptions-item label="操作人">{{ detailRow.operatorName || '—' }}</el-descriptions-item>
      <el-descriptions-item label="操作">
        <el-tag :type="opTagType(detailRow.operationType)" size="small">{{ opLabel(detailRow.operationType) }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="目标类型">{{ targetTypeLabel(detailRow.targetType) }}</el-descriptions-item>
      <el-descriptions-item label="目标 ID">{{ detailRow.targetId ?? '—' }}</el-descriptions-item>
      <el-descriptions-item label="IP 地址">{{ detailRow.ipAddress || '—' }}</el-descriptions-item>
      <el-descriptions-item label="操作时间">{{ formatDateTime(detailRow.operatedAt) }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ detailRow.remark || '—' }}</el-descriptions-item>
    </el-descriptions>
    <template v-if="detailRow">
      <div v-if="hasDiff(detailRow)" class="detail-diff-title">关键字段变更</div>
      <el-table v-if="hasDiff(detailRow)" :data="diffOf(detailRow)" size="small" border>
        <el-table-column prop="key" label="字段" width="200" />
        <el-table-column label="改前" min-width="200">
          <template #default="{ row: d }">{{ d.before }}</template>
        </el-table-column>
        <el-table-column label="改后" min-width="200">
          <template #default="{ row: d }">{{ d.after }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="无关键字段快照" :image-size="60" />
    </template>
    <template #footer>
      <el-button @click="detailVisible = false">关闭</el-button>
    </template>
  </el-dialog>
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
.detail-diff-title {
  margin: 16px 0 8px;
  font-weight: 600;
}
</style>
