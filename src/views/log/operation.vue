<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { listOperationLogs } from '@/api/log'
import type { AuditLogVO } from '@/types/log'

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

const targetTypeOptions = [
  { label: '用户', value: 'USER' },
  { label: '角色', value: 'ROLE' },
  { label: '菜单', value: 'MENU' },
  { label: '字典类型', value: 'DICT_TYPE' },
  { label: '字典数据', value: 'DICT_DATA' },
  { label: '文件', value: 'FILE' },
]
const operationTypeOptions = [
  { label: '新增', value: 'CREATE' },
  { label: '修改', value: 'UPDATE' },
  { label: '删除', value: 'DELETE' },
  { label: '上传', value: 'UPLOAD' },
]

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

onMounted(loadLogs)
</script>

<template>
  <el-card shadow="never">
    <el-form :inline="true" :model="query" class="query-bar">
      <el-form-item label="操作人">
        <el-input v-model="query.operator" placeholder="模糊匹配账号" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="目标类型">
        <el-select v-model="query.targetType" placeholder="全部" clearable style="width: 140px">
          <el-option v-for="o in targetTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="操作类型">
        <el-select v-model="query.operationType" placeholder="全部" clearable style="width: 140px">
          <el-option v-for="o in operationTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
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
      <el-table-column type="expand">
        <template #default="{ row }">
          <div v-if="hasDiff(row)">
            <el-table :data="diffOf(row)" size="small" border>
              <el-table-column prop="key" label="字段" width="200" />
              <el-table-column label="改前" min-width="200">
                <template #default="{ row: d }">{{ d.before }}</template>
              </el-table-column>
              <el-table-column label="改后" min-width="200">
                <template #default="{ row: d }">{{ d.after }}</template>
              </el-table-column>
            </el-table>
          </div>
          <el-empty v-else description="无关键字段快照" :image-size="60" />
        </template>
      </el-table-column>
      <el-table-column prop="operatorName" label="操作人" width="160">
        <template #default="{ row }">{{ row.operatorName || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="opTagType(row.operationType)" size="small">{{ row.operationType || '—' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="目标类型" width="120" align="center">
        <template #default="{ row }">{{ row.targetType || '—' }}</template>
      </el-table-column>
      <el-table-column prop="targetId" label="目标 ID" width="110" align="center" />
      <el-table-column prop="ipAddress" label="IP" width="150" />
      <el-table-column prop="operatedAt" label="操作时间" min-width="170">
        <template #default="{ row }">{{ row.operatedAt || '—' }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '—' }}</template>
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
