<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { Delete } from '@element-plus/icons-vue'
import { createChange } from '@/api/change'
import type { ChangeItemReq } from '@/types/change'
import type { ItemVO } from '@/types/shipment'

/**
 * 合同变更弹窗（V220）：立项详情「发起变更」入口。
 *
 * 设计：保留手填合同金额的弹性，但把「改金额 / 增减明细」收进一条受控审批动作。
 * 明细编辑采用「目标态」交互——用户直接改数量/单价/删行/加行，提交时前端对比原始明细
 * 算出 ADD/MODIFY/DELETE 增量 diff 交给后端（后端 applyChange 只认 diff，保护 shippedQty）。
 */
const props = defineProps<{
  projectId: number
  projectName: string
  currentAmount: number | null
  /** 当前明细（详情回填） */
  items: ItemVO[]
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ created: [] }>()

const saving = ref(false)
const changeReason = ref('')
const newAmount = ref<number | null>(null)

interface EditRow {
  key: number
  itemId: number | null
  itemName: string
  specModel: string
  unit: string
  quantity: number
  unitPrice: number | null
  shippedQty: number
  isNew: boolean
  removed: boolean
}

let seq = 0
const rows = ref<EditRow[]>([])

/** 打开时把当前明细铺成可编辑目标态 */
watch(
  () => visible.value,
  (open) => {
    if (!open) return
    rows.value = (props.items || []).map((it) => ({
      key: ++seq,
      itemId: it.id,
      itemName: it.itemName ?? '',
      specModel: it.specModel ?? '',
      unit: it.unit ?? '',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      shippedQty: it.shippedQty ?? 0,
      isNew: false,
      removed: false,
    }))
    newAmount.value = props.currentAmount
    changeReason.value = ''
  },
)

const activeRows = computed(() => rows.value.filter((r) => !r.removed))
const targetTotal = computed(() =>
  activeRows.value.reduce((s, r) => s + (Number(r.unitPrice) || 0) * (Number(r.quantity) || 0), 0),
)

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const addRow = () => {
  rows.value.push({
    key: ++seq,
    itemId: null,
    itemName: '',
    specModel: '',
    unit: '',
    quantity: 1,
    unitPrice: null,
    shippedQty: 0,
    isNew: true,
    removed: false,
  })
}

const removeRow = (r: EditRow) => {
  if (!r.isNew && r.shippedQty > 0) {
    ElMessage.warning(`「${r.itemName}」已发 ${r.shippedQty} 件，不能删除（已发占用受保护）`)
    return
  }
  r.removed = true
}

/** 对比原始 items 与编辑后 rows，算出增量 diff */
const buildDiff = (): ChangeItemReq[] => {
  const diff: ChangeItemReq[] = []
  // MODIFY：原有行（非新增、未删）字段变化
  for (const r of rows.value) {
    if (r.isNew || r.removed || r.itemId == null) continue
    const origin = (props.items || []).find((it) => it.id === r.itemId)
    if (!origin) continue
    const changed =
      Number(r.quantity) !== Number(origin.quantity) ||
      Number(r.unitPrice) !== Number(origin.unitPrice) ||
      r.itemName !== origin.itemName ||
      r.specModel !== (origin.specModel ?? '') ||
      r.unit !== (origin.unit ?? '')
    if (changed) {
      diff.push({
        opType: 'MODIFY',
        itemId: r.itemId,
        itemName: r.itemName.trim(),
        specModel: r.specModel || undefined,
        unit: r.unit || undefined,
        quantity: Number(r.quantity),
        unitPrice: Number(r.unitPrice),
        // 服务行 goodsId=0；货物行沿用原值
        goodsId: (origin as ItemVO & { goodsId?: number }).goodsId ?? 0,
      })
    }
  }
  // DELETE：原有行被标记删除
  for (const r of rows.value) {
    if (r.removed && !r.isNew && r.itemId != null) {
      diff.push({ opType: 'DELETE', itemId: r.itemId })
    }
  }
  // ADD：新增行（未删）
  for (const r of rows.value) {
    if (r.isNew && !r.removed) {
      diff.push({
        opType: 'ADD',
        itemName: r.itemName.trim(),
        specModel: r.specModel || undefined,
        unit: r.unit || undefined,
        quantity: Number(r.quantity),
        unitPrice: Number(r.unitPrice),
        goodsId: 0,
      })
    }
  }
  return diff
}

const handleSubmit = async () => {
  if (!changeReason.value.trim()) {
    ElMessage.warning('请填写变更原因')
    return
  }
  // 逐行校验（单价必填 >0、数量 >0、名称非空）
  for (const r of activeRows.value) {
    if (!r.itemName.trim()) {
      ElMessage.warning('存在未填写名称的明细行')
      return
    }
    if (!r.quantity || r.quantity <= 0) {
      ElMessage.warning(`「${r.itemName}」数量必须大于 0`)
      return
    }
    if (r.unitPrice == null || Number(r.unitPrice) <= 0) {
      ElMessage.warning(`「${r.itemName}」单价必须大于 0`)
      return
    }
  }
  const diff = buildDiff()
  const amountChanged = newAmount.value != null && Number(newAmount.value) !== Number(props.currentAmount)
  if (!amountChanged && diff.length === 0) {
    ElMessage.warning('金额与明细至少变更一项')
    return
  }
  if (amountChanged && Number(newAmount.value) < 0) {
    ElMessage.warning('合同金额不能为负')
    return
  }
  saving.value = true
  try {
    await createChange(props.projectId, {
      changeReason: changeReason.value.trim(),
      newContractAmount: amountChanged ? Number(newAmount.value) : null,
      items: diff,
    })
    ElMessage.success('变更申请已提交，等待审批')
    visible.value = false
    emit('created')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="`发起合同变更 - ${projectName}`" width="1000px" top="6vh">
    <div class="change-scroll">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="变更将发起两级审批（主管 → 经理），审批通过后金额与明细才会应用到项目。审批期间原单据不变。"
        class="change-tip"
      />

      <div class="change-amount-row">
        <div class="amount-cell">
          <span class="amount-label">当前合同金额</span>
          <span class="amount-value">{{ fmt(currentAmount) }}</span>
        </div>
        <div class="amount-cell">
          <span class="amount-label">变更后金额（不改请留空一致）</span>
          <el-input-number v-model="newAmount" :min="0" :precision="2" :step="1000"
                           controls-position="right" style="width: 220px" placeholder="合同金额" />
        </div>
        <div class="amount-cell">
          <span class="amount-label">明细合计（目标态）</span>
          <span class="amount-value strong">{{ fmt(targetTotal) }}</span>
        </div>
      </div>

      <h4 class="change-block-title">货物 / 服务明细（直接改，提交时自动算增减）</h4>
      <el-table :data="activeRows" border>
        <el-table-column label="货物 / 服务名称" min-width="200">
          <template #default="{ row }">
            <el-input v-model="row.itemName" placeholder="货物或服务名，如安装费" />
          </template>
        </el-table-column>
        <el-table-column label="规格" min-width="120">
          <template #default="{ row }">
            <el-input v-model="row.specModel" placeholder="选填" />
          </template>
        </el-table-column>
        <el-table-column label="单位" width="80">
          <template #default="{ row }">
            <el-input v-model="row.unit" placeholder="选填" />
          </template>
        </el-table-column>
        <el-table-column label="数量" width="110" align="right">
          <template #default="{ row }">
            <el-input-number v-model="row.quantity" :min="1" :precision="0"
                             controls-position="right" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="单价" width="130" align="right">
          <template #default="{ row }">
            <el-input-number v-model="row.unitPrice" :min="0.01" :precision="2"
                             controls-position="right" style="width: 100%" />
          </template>
        </el-table-column>
        <el-table-column label="已发" width="70" align="center">
          <template #default="{ row }">{{ row.shippedQty }}</template>
        </el-table-column>
        <el-table-column label="" width="50" align="center">
          <template #default="{ row }">
            <el-button type="danger" link :icon="Delete" @click="removeRow(row)" />
          </template>
        </el-table-column>
        <template #empty>
          <div style="padding:16px;color:#999">暂无明细，点下方「加一行」新增（服务费也可作为一行录入）</div>
        </template>
      </el-table>
      <div class="change-add-row">
        <el-button link type="primary" @click="addRow">+ 加一行（货物或服务）</el-button>
      </div>

      <el-form-item label="变更原因" class="change-reason">
        <el-input v-model="changeReason" type="textarea" :rows="3" maxlength="500" show-word-limit
                  placeholder="必填。说明为什么变更，如：修正立项金额录入错误 / 增补安装服务费" />
      </el-form-item>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" v-has-perm="'project:change'" @click="handleSubmit">
        提交变更审批
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.change-scroll { max-height: 66vh; overflow-y: auto; padding-right: 4px; }
.change-tip { margin-bottom: 16px; }
.change-amount-row { display: flex; gap: 32px; align-items: flex-end; margin-bottom: 18px; flex-wrap: wrap; }
.amount-cell { display: flex; flex-direction: column; gap: 6px; }
.amount-label { font-size: 12px; color: var(--el-text-color-secondary); }
.amount-value { font-size: 18px; font-weight: 600; }
.amount-value.strong { color: var(--el-color-primary); }
.change-block-title { margin: 6px 0 10px; font-size: 14px; font-weight: 600; }
.change-add-row { margin-top: 10px; }
.change-reason { margin-top: 18px; }
</style>
