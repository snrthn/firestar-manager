<script setup lang="ts">
import { computed, ref, watch } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { Plus } from '@element-plus/icons-vue'
import { allocateReceipt } from '@/api/receipt'
import { receivablePage } from '@/api/receivable'
import type { AllocationItem } from '@/types/receipt'
import type { ReceivableVO } from '@/types/receivable'

/**
 * 核销分配编辑器（2026-10-25 虎哥拍板 A：已收款单的事后核销）。
 *
 * 用途：收款单审批通过（RECEIVED）后，把钱分配到具体应收单——修复两类历史缺口：
 *   ① V65 上线前审批通过的老单（创建时没有 allocations 概念）；
 *    ② 创建时选「预收未指定」的新单，钱到账后再补核销。
 * 这对应用友/金蝶的「独立核销环节」：收款通过只说明钱到账，分到哪张应收是核销界面的事。
 *
 * 提交语义 = 全量替换：rows 整体覆盖旧分配；后端把消失/金额变化的旧行置 REVERSED
 * 并回滚应收单数字，新行立即滚入。允许部分分配（Σ ≤ 收款金额，余额留在「未核销」）。
 */
const props = defineProps<{
  receiptId: number
  /** 收款单所属项目（加载该项目下应收单；理论必填，类型上防御可空） */
  projectId: number | null
  /** 收款单总金额（分配上限） */
  receiptAmount: number
  /** 初始分配（编辑已部分核销的单时回填；历史老单传空数组） */
  currentAllocations?: AllocationItem[]
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ saved: [] }>()

interface AllocRow {
  receivableId: number | null
  amount: number | null
}

const rows = ref<AllocRow[]>([])
const receivableOptions = ref<ReceivableVO[]>([])
const loadingReceivables = ref(false)
const saving = ref(false)

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 已分配合计（金额纪律：null 当 0） */
const allocSum = computed(() =>
  rows.value.reduce((s, r) => s + (r.amount == null ? 0 : Number(r.amount)), 0),
)

/** 未核销余额 = 收款金额 - 已分配（≥0 合法；<0 前端预检拦下，后端同样会拦） */
const unwritten = computed(() => props.receiptAmount - allocSum.value)

const loadReceivables = async () => {
  if (props.projectId == null) {
    ElMessage.error('收款单缺少项目信息，无法加载应收单')
    return
  }
  loadingReceivables.value = true
  try {
    const page = await receivablePage(1, 200, { projectId: props.projectId })
    receivableOptions.value = (page.records || []).filter((r) => r.status === 'CONFIRMED')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingReceivables.value = false
  }
}

const addRow = () => {
  rows.value.push({ receivableId: null, amount: null })
}

const removeRow = (idx: number) => {
  rows.value.splice(idx, 1)
}

const handleSubmit = async () => {
  if (rows.value.length === 0) {
    ElMessage.warning('请至少添加一条分配明细')
    return
  }
  const seen = new Set<number>()
  for (const r of rows.value) {
    if (r.receivableId == null) {
      ElMessage.warning('请选择应收单')
      return
    }
    if (seen.has(r.receivableId)) {
      ElMessage.warning('同一应收单重复分配，请合并为一行')
      return
    }
    seen.add(r.receivableId)
    if (r.amount == null || Number(r.amount) <= 0) {
      ElMessage.warning('分配金额必须大于 0')
      return
    }
  }
  if (allocSum.value > props.receiptAmount) {
    ElMessage.warning(`分配总额 ${formatAmount(allocSum.value)} 超过收款金额 ${formatAmount(props.receiptAmount)}`)
    return
  }
  const items: AllocationItem[] = rows.value.map((r) => ({
    receivableId: r.receivableId!,
    amount: Number(r.amount),
  }))
  saving.value = true
  try {
    await allocateReceipt(props.receiptId, items)
    ElMessage.success('核销分配已保存')
    visible.value = false
    emit('saved')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

watch(
  () => visible.value,
  (v) => {
    if (!v) return
    // 初始分配回填（无则给一行空行）；金额控件清空时传 null 的兜底在提交校验处理
    rows.value = (props.currentAllocations || []).map((a) => ({
      receivableId: a.receivableId,
      amount: a.amount,
    }))
    if (rows.value.length === 0) {
      addRow()
    }
    loadReceivables()
  },
)
</script>

<template>
  <el-dialog v-model="visible" title="核销分配" width="600px" top="8vh">
    <div class="alloc-editor">
      <div class="alloc-summary">
        收款金额：<b>{{ formatAmount(receiptAmount) }}</b>
        ｜ 已分配：<b>{{ formatAmount(allocSum) }}</b>
        ｜ 未核销余额：<b :class="{ over: unwritten < 0 }">{{ formatAmount(unwritten) }}</b>
        <span class="muted">（可部分分配，余额留在未核销）</span>
      </div>
      <div v-for="(row, idx) in rows" :key="idx" class="alloc-row">
        <el-select
          v-model="row.receivableId"
          filterable
          placeholder="选择应收单"
          style="flex: 1.4"
          :loading="loadingReceivables"
        >
          <el-option
            v-for="rv in receivableOptions"
            :key="rv.id"
            :label="`${rv.receivableNo}（未回款 ${formatAmount(rv.unreceivedAmount)}）`"
            :value="rv.id"
          />
        </el-select>
        <el-input-number
          v-model="row.amount"
          :min="0"
          :precision="2"
          controls-position="right"
          placeholder="分配金额"
          style="flex: 1"
        />
        <el-button link type="danger" size="small" @click="removeRow(idx)">移除</el-button>
      </div>
      <el-button link type="primary" size="small" :icon="Plus" @click="addRow">添加分配行</el-button>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">保存分配</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.alloc-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.alloc-summary {
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 13px;
}
.alloc-summary .over {
  color: var(--el-color-danger);
}
.alloc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.muted {
  color: #909399;
}
</style>
