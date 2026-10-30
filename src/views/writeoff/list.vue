<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MagicStick, Refresh, Search, Download } from '@element-plus/icons-vue'
import { downloadViaBackend } from '@/utils/fileDownload'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import {
  autoMatch,
  differencePool,
  reverseLedger,
  writeoffLedgerPage,
} from '@/api/writeoff'
import { projectPage } from '@/api/project'
import type { AutoMatchResultVO, DifferencePoolVO, WriteOffLedgerVO } from '@/types/writeoff'
import type { ProjectVO } from '@/types/project'
import DictSelect from '@/components/DictSelect.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDictLabels } from '@/composables/useDict'
import { formatDate, formatDateTime } from '@/utils/datetime'

// ===== Tab：核销台账 / 差异池 =====
const activeTab = ref('ledger')

// ===== 项目下拉（两个 Tab 的筛选共用） =====
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

// ===== 核销台账 =====
const query = reactive({
  projectId: null as number | null,
  ledgerType: '',
  status: '',
  keyword: '',
  dateRange: null as [string, string] | null,
})

const loading = ref(false)
const list = ref<WriteOffLedgerVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadLedger = async () => {
  loading.value = true
  try {
    const page = await writeoffLedgerPage(pageNum.value, pageSize.value, {
      projectId: query.projectId ?? undefined,
      ledgerType: query.ledgerType || undefined,
      status: query.status || undefined,
      keyword: query.keyword.trim() || undefined,
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

const handleQuery = () => {
  pageNum.value = 1
  loadLedger()
}
const resetQuery = () => {
  query.projectId = null
  query.ledgerType = ''
  query.status = ''
  query.keyword = ''
  query.dateRange = null
  pageNum.value = 1
  loadLedger()
}
const onExport = () => {
  const qs = new URLSearchParams()
  if (query.projectId != null) qs.append('projectId', String(query.projectId))
  if (query.ledgerType) qs.append('ledgerType', query.ledgerType)
  if (query.status) qs.append('status', query.status)
  if (query.keyword.trim()) qs.append('keyword', query.keyword.trim())
  if (query.dateRange?.[0]) qs.append('dateFrom', query.dateRange[0])
  if (query.dateRange?.[1]) qs.append('dateTo', query.dateRange[1])
  downloadViaBackend('/writeoff/export?' + qs.toString(), 'writeoff_export.xlsx')
}

const handleSizeChange = () => {
  pageNum.value = 1
  loadLedger()
}

// 字典翻译（核销状态；字典维护页改色即生效）
const { label: statusLabel, style: statusStyle } = useDictLabels('writeoff_status')

// 台账类型 / 核销方式标签（无对应字典查询场景，前端直映射）
const ledgerTypeLabel = (t: string | null): string =>
  t === 'RECEIPT' ? '回款核销' : t === 'INVOICE' ? '开票核销' : '—'
const ledgerTypeTag = (t: string | null): string =>
  t === 'RECEIPT' ? 'success' : t === 'INVOICE' ? 'warning' : 'info'
const methodLabel = (m: string | null): string =>
  m === 'AUTO' ? '自动' : m === 'MANUAL' ? '手工' : '—'

// ===== 反核销 =====
const reverseVisible = ref(false)
const reverseRow = ref<WriteOffLedgerVO | null>(null)
const reverseReason = ref('')
const reverseSubmitting = ref(false)

const openReverse = (row: WriteOffLedgerVO) => {
  reverseRow.value = row
  reverseReason.value = ''
  reverseVisible.value = true
}

const submitReverse = async () => {
  if (!reverseRow.value) return
  if (!reverseReason.value.trim()) {
    ElMessage.warning('反核销原因不能为空')
    return
  }
  reverseSubmitting.value = true
  try {
    await reverseLedger({
      ledgerType: reverseRow.value.ledgerType,
      ledgerId: reverseRow.value.id,
      reason: reverseReason.value.trim(),
    })
    ElMessage.success('已反核销，应收单数字已回滚')
    reverseVisible.value = false
    await loadLedger()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    reverseSubmitting.value = false
  }
}

// ===== 差异池 =====
const poolLoading = ref(false)
const pools = ref<DifferencePoolVO[]>([])

const loadPool = async () => {
  poolLoading.value = true
  try {
    pools.value = await differencePool(query.projectId ?? undefined)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    poolLoading.value = false
  }
}

const switchTab = (tab: string) => {
  if (tab === 'pool') loadPool()
}

// ===== 自动核销 =====
const matchSubmittingId = ref<number | null>(null)
const matchResultVisible = ref(false)
const matchResult = ref<AutoMatchResultVO | null>(null)

const runAutoMatch = async (pool: DifferencePoolVO) => {
  try {
    await ElMessageBox.confirm(
      `将对项目 ${pool.projectNo || pool.projectId} 内的未核销收款单 × 未回款应收单按「金额贪心、日期优先」自动配对核销，配对结果立即生效。确认执行？`,
      '自动核销确认',
      { type: 'warning', confirmButtonText: '执行核销', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  matchSubmittingId.value = pool.projectId
  try {
    const result = await autoMatch(pool.projectId)
    matchResult.value = result
    matchResultVisible.value = true
    ElMessage.success(`自动核销完成：${result.matchCount} 笔，合计 ${formatAmount(result.totalAmount)}`)
    await loadPool()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    matchSubmittingId.value = null
  }
}

onMounted(() => {
  loadProjects()
  loadLedger()
})
</script>

<template>
  <el-card shadow="never">
    <el-tabs v-model="activeTab" @tab-change="switchTab">
      <!-- ===== 核销台账 ===== -->
      <el-tab-pane label="核销台账" name="ledger">
        <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
          <el-form-item label="关联项目">
            <el-select v-model="query.projectId" filterable clearable placeholder="全部项目">
              <el-option
                v-for="p in projectOptions"
                :key="p.id"
                :label="`${p.projectNo || '—'} ${p.projectName}`"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="类型">
            <!-- 宽度走 pages.css 的 .query-bar 统一规范（200px），不再内联绕过 -->
            <el-select v-model="query.ledgerType" clearable placeholder="全部">
              <el-option label="回款核销" value="RECEIPT" />
              <el-option label="开票核销" value="INVOICE" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <DictSelect v-model="query.status" type-code="writeoff_status" placeholder="全部" />
          </el-form-item>
          <el-form-item label="核销单号">
            <el-input v-model="query.keyword" clearable placeholder="WO-/IA- 单号模糊" />
          </el-form-item>
          <el-form-item label="核销日期">
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
          <span class="toolbar-tip">所有核销动作（手工 / 自动 / 反核销）按时间序一屏可查</span>
          <el-button :icon="Refresh" @click="loadLedger">刷新</el-button>
          <el-button v-has-perm="'writeoff:export'" :icon="Download" @click="onExport">导出</el-button>
        </div>

        <el-table v-loading="loading" :data="list" border>
          <el-table-column prop="ledgerNo" label="核销单号" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.ledgerNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="类型" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="ledgerTypeTag(row.ledgerType)" size="small">
                {{ ledgerTypeLabel(row.ledgerType) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="projectNo" label="项目编号" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.projectNo || '—' }}</template>
          </el-table-column>
          <el-table-column prop="bizNo" label="主单（收款/发票）" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bizNo || '—' }}</template>
          </el-table-column>
          <el-table-column prop="receivableNo" label="应收单" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.receivableNo || '—' }}</template>
          </el-table-column>
          <el-table-column label="核销金额" width="130" align="right">
            <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="方式" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.method === 'AUTO'" type="success" size="small" effect="plain">自动</el-tag>
              <span v-else>{{ methodLabel(row.method) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="statusStyle(row.status) || 'info'" size="small">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="核销日期" width="120" align="center">
            <template #default="{ row }">{{ formatDate(row.ledgerDate) }}</template>
          </el-table-column>
          <el-table-column prop="createdByName" label="创建人" width="100" align="center">
            <template #default="{ row }">{{ row.createdByName || '—' }}</template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right" align="center">
            <template #default="{ row }">
              <!-- 反核销：仅 NORMAL 行可操作（REVERSED 已是终态；红冲单的核销行反核销=加回，后端处理方向） -->
              <el-button
                v-if="row.status === 'NORMAL'"
                v-has-perm="'writeoff:reverse'"
                link
                type="danger"
                size="small"
                @click="openReverse(row)"
              >反核销</el-button>
              <span v-else class="op-done">—</span>
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
            @current-change="loadLedger"
            @size-change="handleSizeChange"
          />
        </div>
      </el-tab-pane>

      <!-- ===== 差异池 ===== -->
      <el-tab-pane label="差异池" name="pool">
        <el-form :inline="true" class="query-bar" @submit.prevent>
          <el-form-item label="关联项目">
            <el-select v-model="query.projectId" filterable clearable placeholder="全部项目" @change="loadPool">
              <el-option
                v-for="p in projectOptions"
                :key="p.id"
                :label="`${p.projectNo || '—'} ${p.projectName}`"
                :value="p.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button :icon="Refresh" @click="loadPool">刷新</el-button>
          </el-form-item>
        </el-form>

        <div class="toolbar">
          <span class="toolbar-tip">「有钱没分」的收款单 × 「有账没收」的应收单，自动核销只同项目内配对</span>
        </div>

        <el-table v-loading="poolLoading" :data="pools" border>
          <el-table-column prop="projectNo" label="项目编号" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.projectNo || `#${row.projectId}` }}</template>
          </el-table-column>
          <el-table-column label="未核销收款单" min-width="320">
            <template #default="{ row }">
              <template v-if="row.receipts.length">
                <el-tag
                  v-for="r in row.receipts"
                  :key="r.id"
                  size="small"
                  type="success"
                  effect="plain"
                  class="pool-tag"
                >
                  {{ r.no }}｜余 {{ formatAmount(r.unmatchedAmount) }}
                </el-tag>
              </template>
              <span v-else class="pool-empty">已配平</span>
            </template>
          </el-table-column>
          <el-table-column label="未回款应收单" min-width="320">
            <template #default="{ row }">
              <template v-if="row.receivables.length">
                <el-tag
                  v-for="v in row.receivables"
                  :key="v.id"
                  size="small"
                  type="warning"
                  effect="plain"
                  class="pool-tag"
                >
                  {{ v.no }}｜余 {{ formatAmount(v.unmatchedAmount) }}
                </el-tag>
              </template>
              <span v-else class="pool-empty">已配平</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                size="small"
                v-has-perm="'writeoff:writeoff'"
                :disabled="!row.receipts.length || !row.receivables.length"
                :loading="matchSubmittingId === row.projectId"
                @click="runAutoMatch(row)"
              >
                <el-icon v-if="matchSubmittingId !== row.projectId" class="el-icon--left"><MagicStick /></el-icon>
                自动核销
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState description="没有待配平的差异（所有项目钱票两清）" />
          </template>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-card>

  <!-- ===== 反核销弹窗 ===== -->
  <el-dialog v-model="reverseVisible" title="反核销确认" width="480px">
    <el-alert type="warning" :closable="false" show-icon class="reverse-alert">
      反核销后该核销行置为「已反核销」留痕，应收单已回款/已开票数字同步回滚，主单已核销口径重算。原单为红冲单时回滚方向自动取反。
    </el-alert>
    <el-descriptions v-if="reverseRow" :column="1" border size="small" style="margin-top: 12px">
      <el-descriptions-item label="核销单号">{{ reverseRow.ledgerNo }}</el-descriptions-item>
      <el-descriptions-item label="类型">{{ ledgerTypeLabel(reverseRow.ledgerType) }}</el-descriptions-item>
      <el-descriptions-item label="应收单">{{ reverseRow.receivableNo }}</el-descriptions-item>
      <el-descriptions-item label="核销金额">{{ formatAmount(reverseRow.amount) }}</el-descriptions-item>
    </el-descriptions>
    <el-form label-position="top" style="margin-top: 12px">
      <el-form-item label="反核销原因（必填，留痕）">
        <el-input v-model="reverseReason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="如：收付款双方对账差异，撤销该笔核销" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="reverseVisible = false">取消</el-button>
      <el-button type="danger" :loading="reverseSubmitting" v-has-perm="'writeoff:reverse'" @click="submitReverse">确认反核销</el-button>
    </template>
  </el-dialog>

  <!-- ===== 自动核销结果弹窗 ===== -->
  <el-dialog v-model="matchResultVisible" title="自动核销结果" width="640px">
    <el-descriptions v-if="matchResult" :column="2" border size="small">
      <el-descriptions-item label="配对笔数">{{ matchResult.matchCount }} 笔</el-descriptions-item>
      <el-descriptions-item label="核销总金额">{{ formatAmount(matchResult.totalAmount) }}</el-descriptions-item>
    </el-descriptions>
    <el-table v-if="matchResult" :data="matchResult.pairs" border size="small" style="margin-top: 12px">
      <el-table-column prop="writeOffNo" label="核销单号" min-width="160" show-overflow-tooltip />
      <el-table-column prop="receiptNo" label="收款单" min-width="150" show-overflow-tooltip />
      <el-table-column prop="receivableNo" label="应收单" min-width="150" show-overflow-tooltip />
      <el-table-column label="金额" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
      </el-table-column>
      <template #empty>
        <EmptyState />
      </template>
    </el-table>
    <template #footer>
      <el-button type="primary" @click="matchResultVisible = false">知道了</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.toolbar-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
.pool-tag {
  margin: 2px 4px 2px 0;
}
.pool-empty {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.op-done {
  color: var(--el-text-color-placeholder);
}
.reverse-alert {
  margin-bottom: 4px;
}
</style>
