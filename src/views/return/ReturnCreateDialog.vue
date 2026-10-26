<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { createReturn } from '@/api/return'
import { shipmentDetail, shipmentPage } from '@/api/shipment'
import type { ReturnCreateForm, ReturnLineForm } from '@/types/return'
import type { ShipmentLineVO, ShipmentVO } from '@/types/shipment'

// 发起退货弹窗（V67）：选已审批发货单 → 带出明细行 → 逐行填退货数量 → 原因 → 提交即三级审批。
//
// 两道前端预校验（后端同样硬卡，前端只为即时反馈，以后端为准）：
// ① 发货单必须 approvalStatus=APPROVED（审批中的单货还没发，无退货对象）；
// ② 每行退货上限 = receivedQty - returnedQty（已收货 - 已退货），与后端
//    ReturnServiceImpl.create 第 204 行口径严格一致；注意不是 shipmentQty - returnedQty。
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ saved: [] }>()

const shipmentOptions = ref<ShipmentVO[]>([])
const lineRows = ref<ShipmentLineVO[]>([])
const form = reactive<{ shipmentId: number | null; returnReason: string }>({
  shipmentId: null,
  returnReason: '',
})
/** shipmentLineId → 本次退货数量（仅 >0 的行参与提交） */
const qty = reactive<Record<number, number>>({})
const loadingShipments = ref(false)
const loadingLines = ref(false)
const saving = ref(false)

const loadShipments = async () => {
  loadingShipments.value = true
  try {
    // 只列审批通过（APPROVED）的发货单：后端 create 硬卡此条件，前端下拉就不给别的状态
    const page = await shipmentPage(1, 500, { status: 'APPROVED' })
    shipmentOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingShipments.value = false
  }
}

const resetLines = () => {
  lineRows.value = []
  for (const k of Object.keys(qty)) delete qty[Number(k)]
}

const onShipmentChange = async (sid: number | null) => {
  resetLines()
  if (!sid) return
  loadingLines.value = true
  try {
    const d = await shipmentDetail(sid)
    // 只保留「已收货」的行：receivedQty=0 的行无退货对象（可退额度为 0）
    lineRows.value = (d.lines || []).filter((l) => (l.receivedQty ?? 0) > 0)
    for (const l of lineRows.value) qty[l.id] = 0
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingLines.value = false
  }
}

/** 剩余可退（口径对齐后端：已收货 - 已退货） */
const remaining = (row: ShipmentLineVO) => (row.receivedQty ?? 0) - (row.returnedQty ?? 0)
const lineAmount = (row: ShipmentLineVO) =>
  Number(((qty[row.id] ?? 0) * (row.unitPrice ?? 0)).toFixed(2))

const selectedRows = computed(() => lineRows.value.filter((r) => (qty[r.id] ?? 0) > 0))
const totalAmount = computed(() => selectedRows.value.reduce((s, r) => s + lineAmount(r), 0))

// 金额格式化（两位小数 + 千分位，与 shipment/writeoff 同约定）
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const handleSubmit = async () => {
  if (!form.shipmentId) {
    ElMessage.warning('请选择发货单')
    return
  }
  for (const row of lineRows.value) {
    const q = qty[row.id] ?? 0
    if (q > remaining(row)) {
      ElMessage.error(
        `货物「${row.itemName ?? row.itemId}」退货超量：已收 ${row.receivedQty ?? 0}，已退 ${row.returnedQty ?? 0}，可退 ${remaining(row)}，本次 ${q}`,
      )
      return
    }
  }
  const lines: ReturnLineForm[] = selectedRows.value.map((r) => ({
    shipmentLineId: r.id,
    returnQty: qty[r.id],
  }))
  if (lines.length === 0) {
    ElMessage.warning(
      lineRows.value.length === 0
        ? '该发货单暂无已收货明细，无可退货物'
        : '请至少填写一行退货数量',
    )
    return
  }
  if (!form.returnReason.trim()) {
    ElMessage.warning('请填写退货原因')
    return
  }
  saving.value = true
  try {
    const payload: ReturnCreateForm = { lines, returnReason: form.returnReason.trim() }
    await createReturn(form.shipmentId, payload)
    ElMessage.success('退货申请已提交，进入三级审批（主管 → 财务 → 销售经理）')
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
    form.shipmentId = null
    form.returnReason = ''
    resetLines()
    loadShipments()
  },
)
</script>

<template>
  <!-- 宽度走全站 L 档 1000px；限高滚动与 ShipmentCreateDialog 同口径 -->
  <el-dialog v-model="visible" title="发起退货申请" width="1000px" top="7vh">
    <div class="dialog-scroll">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="发货单" required>
          <el-select
            v-model="form.shipmentId"
            filterable
            placeholder="选择已审批的发货单"
            style="width: 100%"
            :loading="loadingShipments"
            @change="onShipmentChange"
          >
            <el-option
              v-for="s in shipmentOptions"
              :key="s.id"
              :label="`${s.batchNo || '—'} · ${s.projectName || ''}`"
              :value="s.id"
            />
          </el-select>
          <div class="muted">仅列出审批通过的发货单；退货针对「已收货」数量，未收货的行不展示</div>
        </el-form-item>
        <el-form-item label="退货原因" required>
          <el-input
            v-model="form.returnReason"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="填写退货原因（如：货物破损 / 规格不符 / 客户取消）"
          />
        </el-form-item>
      </el-form>

      <div v-loading="loadingLines" class="lines-wrap">
        <el-empty
          v-if="!lineRows.length && !loadingLines"
          :description="
            form.shipmentId ? '该发货单暂无已收货明细，无可退货物' : '请先选择发货单'
          "
          :image-size="60"
        />
        <template v-else>
          <el-table :data="lineRows" border size="small">
            <el-table-column prop="itemName" label="货物名称" min-width="160" fixed="left" show-overflow-tooltip />
            <el-table-column prop="specModel" label="规格" min-width="120" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column label="已发货" width="90" align="right">
              <template #default="{ row }">{{ row.shipmentQty }}</template>
            </el-table-column>
            <el-table-column label="已收货" width="90" align="right">
              <template #default="{ row }">{{ row.receivedQty ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="已退货" width="90" align="right">
              <template #default="{ row }">{{ row.returnedQty ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="剩余可退" width="100" align="right">
              <template #default="{ row }">
                <span :class="{ danger: remaining(row) <= 0 }">{{ remaining(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="本次退货" width="150" align="center">
              <template #default="{ row }">
                <el-input-number
                  v-model="qty[row.id]"
                  :min="0"
                  :max="remaining(row)"
                  :precision="0"
                  :controls-position="'right'"
                  style="width: 120px"
                />
              </template>
            </el-table-column>
            <el-table-column prop="unitPrice" label="单价" width="110" align="right">
              <template #default="{ row }">{{ formatAmount(row.unitPrice) }}</template>
            </el-table-column>
            <el-table-column label="行金额" width="120" fixed="right" align="right">
              <template #default="{ row }">
                <b>{{ formatAmount(lineAmount(row)) }}</b>
              </template>
            </el-table-column>
          <template #empty>
            <EmptyState />
          </template>
          </el-table>

          <div class="summary-bar">
            <span>合计退货金额：<b>{{ formatAmount(totalAmount) }}</b></span>
            <span class="muted">
              审批通过后自动生成：红字应收单 → 红字发票（已开票时）→ 退款单（已回款时）
            </span>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">提交退货申请</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.muted {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}
.lines-wrap {
  min-height: 120px;
}
.danger {
  color: var(--el-color-danger);
  font-weight: 600;
}
.summary-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 14px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 14px;
}
/* 限高滚动 + 迷你滚动条：与 ShipmentCreateDialog 同款（公式 280 同源），改必须同步维护 */
.dialog-scroll {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  padding-right: 4px;
}
.dialog-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.dialog-scroll::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}
.dialog-scroll::-webkit-scrollbar-thumb:hover {
  background: #909399;
}
.dialog-scroll::-webkit-scrollbar-track {
  background: transparent;
}
</style>
