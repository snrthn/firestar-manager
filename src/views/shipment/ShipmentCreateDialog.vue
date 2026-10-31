<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { Plus } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { createShipment, listItems, shipmentDetail, updateShipment } from '@/api/shipment'
import { projectPage } from '@/api/project'
import type { ItemVO, ShipmentCreateForm, ShipmentLineForm } from '@/types/shipment'
import type { ProjectVO } from '@/types/project'

// 发货申请弹窗：新建（保存草稿，审批由详情触发）/ 编辑（2026-10-23 虎哥补入口，仅 DRAFT/REJECTED 可改）。
// 仅允许从「已审批」项目发起；逐行填写发货数量，前端预校验超发（决策#3）与超合同预警（决策#4，
// 后端仍硬卡，前端仅提示），最终以后端异常为权威闸门。
//
// 编辑模式要点：item.shippedQty 在「申请创建时」就已占用本单数量（后端 create 累加），
// 故剩余可发须把本单占用扣回来算，否则改动数量会被自己的旧占用误判为超发。
const visible = defineModel<boolean>('visible', { required: true })
const props = defineProps<{ shipmentId?: number | null }>()
const emit = defineEmits<{ saved: [] }>()

/** 编辑模式：本单原有明细数量（剩余量计算时扣回，避免自我占用误判超发） */
const ownQty = reactive<Record<number, number>>({})
const isEdit = () => props.shipmentId != null

const projectOptions = ref<ProjectVO[]>([])
const form = reactive<{ projectId: number | null }>({ projectId: null })
const items = ref<ItemVO[]>([])
/** itemId → 本次发货数量（仅 >0 的行参与提交） */
const lines = reactive<Record<number, number>>({})
const loadingProjects = ref(false)
const loadingItems = ref(false)
const saving = ref(false)

const loadProjects = async () => {
  loadingProjects.value = true
  try {
    // 只列已审批项目：未审批/草稿项目不可发起发货（业务口径，前端把关 + 后端不强制）
    const page = await projectPage(1, 500, { approvalStatus: 'APPROVED' })
    projectOptions.value = page.records
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingProjects.value = false
  }
}

const onProjectChange = async (pid: number | null) => {
  items.value = []
  for (const k of Object.keys(lines)) delete lines[Number(k)]
  if (!pid) return
  loadingItems.value = true
  try {
    const list = await listItems(pid)
    items.value = list
    // 初始化每行数量（reactive 对象动态键亦可响应式）
    for (const it of list) lines[it.id] = 0
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingItems.value = false
  }
}

/**
 * 剩余可发（决策#3 超发判定基准，与后端口径一致）：
 * 合同量 -（已发累计 - 本单已占用）。编辑模式下必须扣回本单占用——后端 update 也是先
 * releaseItemOccupancy 再校验，两边口径必须一致，否则减量/增量编辑会被自己的旧占用卡住。
 */
const remaining = (it: ItemVO) => it.quantity - ((it.shippedQty ?? 0) - (ownQty[it.id] ?? 0))
const lineAmount = (it: ItemVO) => Number(((lines[it.id] ?? 0) * (it.unitPrice ?? 0)).toFixed(2))

const selectedProject = () => projectOptions.value.find((p) => p.id === form.projectId) ?? null
const totalAmount = () => items.value.reduce((s, it) => s + lineAmount(it), 0)
const contractAmount = () => selectedProject()?.contractAmount ?? null
/** 超合同预警（决策#4：后端硬卡，前端仅提示，允许带着预警提交） */
const overContract = () => {
  const c = contractAmount()
  return c != null && totalAmount() > c
}

// 金额格式化（两位小数点 + 千分位，与 project/list 同约定）
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const handleSubmit = async () => {
  if (!form.projectId) {
    ElMessage.warning('请选择项目')
    return
  }
  // 超发硬卡（与后端一致，提交前即时拦截）
  for (const it of items.value) {
    const q = lines[it.id] ?? 0
    if (q > remaining(it)) {
      ElMessage.error(`货物「${it.itemName}」超发：合同量 ${it.quantity}，已发 ${it.shippedQty ?? 0}，剩余 ${remaining(it)}，本次 ${q}`)
      return
    }
  }
  const ls: ShipmentLineForm[] = items.value
    .filter((it) => (lines[it.id] ?? 0) > 0)
    .map((it) => ({ itemId: it.id, shipmentQty: lines[it.id] }))
  if (ls.length === 0) {
    ElMessage.warning(items.value.length === 0 ? '该项目暂无货物明细，无法发起发货' : '请至少填写一行发货数量')
    return
  }
  if (overContract()) {
    try {
      await ElMessageBox.confirm(
        `本次发货金额 ${formatAmount(totalAmount())} 将超过合同金额 ${formatAmount(contractAmount())}，仍要提交？`,
        '超合同预警',
        { type: 'warning', confirmButtonText: '仍然提交', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  saving.value = true
  try {
    const payload: ShipmentCreateForm = { projectId: form.projectId, lines: ls }
    if (isEdit()) {
      await updateShipment(props.shipmentId!, payload)
      ElMessage.success('发货单已更新')
    } else {
      await createShipment(payload)
      ElMessage.success('发货申请已保存为草稿')
    }
    visible.value = false
    emit('saved')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

/** 清空全部行状态（开窗/切换模式时重置，防上一单数据残留） */
const resetLines = () => {
  items.value = []
  for (const k of Object.keys(lines)) delete lines[Number(k)]
  for (const k of Object.keys(ownQty)) delete ownQty[Number(k)]
}

/** 编辑模式回填：项目锁定 + 明细行数量带出（后端禁止换项目，故禁用选择器） */
const loadForEdit = async (id: number) => {
  loadingItems.value = true
  try {
    const d = await shipmentDetail(id)
    form.projectId = d.projectId ?? null
    resetLines()
    if (form.projectId) {
      const list = await listItems(form.projectId)
      items.value = list
      for (const it of list) {
        lines[it.id] = 0
        ownQty[it.id] = 0
      }
      // 本单原有明细 → 行数量 + 本单占用（剩余量计算用）
      for (const ln of d.lines || []) {
        lines[ln.itemId] = ln.shipmentQty ?? 0
        ownQty[ln.itemId] = ln.shipmentQty ?? 0
      }
    }
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loadingItems.value = false
  }
}

watch(
  () => visible.value,
  (v) => {
    if (!v) return
    loadProjects()
    if (isEdit()) {
      loadForEdit(props.shipmentId!)
    } else {
      form.projectId = null
      resetLines()
    }
  },
)
</script>

<template>
  <!-- 宽度走全站 L 档 1000px（2026-10-24 统一口径，原 90%+max-width:1100px 特例已废）；
       表格名称列左固定、行金额列右固定，中间列可横滚。
       限高滚动与立项新建/详情弹窗同口径（2026-10-24）：top + 内层 .dialog-scroll -->
  <el-dialog
    v-model="visible"
    :title="isEdit() ? '编辑发货申请' : '新建发货申请'"
    width="1000px"
    top="7vh"
  >
    <div class="dialog-scroll">
    <el-form label-width="90px" @submit.prevent>
      <el-form-item label="项目" required>
        <el-select
          v-model="form.projectId"
          filterable
          :disabled="isEdit()"
          :placeholder="isEdit() ? '编辑不可更换项目' : '选择已审批项目'"
          style="width: 100%"
          :loading="loadingProjects"
          @change="onProjectChange"
        >
          <el-option
            v-for="p in projectOptions"
            :key="p.id"
            :label="`${p.projectNo || '—'} ${p.projectName}`"
            :value="p.id"
          />
        </el-select>
        <div v-if="selectedProject()" class="proj-meta">
          合同金额：<b>{{ formatAmount(contractAmount()) }}</b>
          <span class="muted">（仅展示已审批项目；草稿/审批中项目不可发起发货）</span>
        </div>
      </el-form-item>
    </el-form>

    <div v-loading="loadingItems" class="items-wrap">
      <!-- 空态区分两种情况：未选项目 / 项目无货物明细（fin_item 为空不可发货，需先维护货物） -->
      <el-empty
        v-if="!items.length && !loadingItems"
        :description="form.projectId ? '该项目暂无货物明细，无法发起发货（请先在项目中维护货物）' : '请先选择项目'"
        :image-size="60"
      />
      <template v-else>
        <el-table :data="items" border size="small">
          <el-table-column prop="itemName" label="货物名称" min-width="160" fixed="left" show-overflow-tooltip />
          <el-table-column prop="specModel" label="规格" min-width="120" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" width="70" align="center" />
          <el-table-column label="合同数量" width="90" align="right">
            <template #default="{ row }">{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="已发累计" width="90" align="right">
            <template #default="{ row }">{{ row.shippedQty ?? 0 }}</template>
          </el-table-column>
          <el-table-column label="剩余可发" width="90" align="right">
            <template #default="{ row }">
              <span :class="{ danger: remaining(row) <= 0 }">{{ remaining(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="本次发货" width="150" align="center">
            <template #default="{ row }">
              <el-input-number
                v-model="lines[row.id]"
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
          <EmptyState description="暂无可发货明细" />
        </template>
        </el-table>

        <div class="summary-bar">
          <span>合计发货金额：<b>{{ formatAmount(totalAmount()) }}</b></span>
          <span class="muted">合同金额：{{ formatAmount(contractAmount()) }}</span>
          <span v-if="overContract()" class="over-warn">⚠ 超过合同金额，提交后将由后端硬卡（或经确认放行）</span>
        </div>
      </template>
    </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :icon="Plus" v-has-perm="'shipment:create'" @click="handleSubmit">
        {{ isEdit() ? '保存修改' : '保存草稿' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.proj-meta {
  margin-top: 6px;
  font-size: 13px;
  color: #303133;
}
.muted {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
.items-wrap {
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
.over-warn {
  color: var(--el-color-danger);
  font-weight: 600;
}
/* 限高滚动 + 迷你滚动条：与立项新建/详情弹窗同款（公式 280 同源），改必须同步维护 */
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
