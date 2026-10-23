<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { createShipment, listItems } from '@/api/shipment'
import { projectPage } from '@/api/project'
import type { ItemVO, ShipmentCreateForm, ShipmentLineForm } from '@/types/shipment'
import type { ProjectVO } from '@/types/project'

// 新建发货申请弹窗（提交即发起审批，决策#1）。
// 仅允许从「已审批」项目发起；逐行填写发货数量，前端预校验超发（决策#3）与超合同预警（决策#4，
// 后端仍硬卡，前端仅提示），最终以后端异常为权威闸门。
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ saved: [] }>()

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

/** 剩余可发 = 合同量 - 已发累计（决策#3 超发判定基准，前端预校验与后端一致） */
const remaining = (it: ItemVO) => it.quantity - (it.shippedQty ?? 0)
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
    await createShipment(payload)
    ElMessage.success('发货申请已提交，进入审批')
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
    if (v) {
      loadProjects()
      form.projectId = null
      items.value = []
      for (const k of Object.keys(lines)) delete lines[Number(k)]
    }
  },
)
</script>

<template>
  <!-- 宽度自适应视口（90%，封顶 1100px 防超宽屏过胖）；表格名称列左固定、行金额列右固定，中间列可横滚 -->
  <el-dialog v-model="visible" title="新建发货申请" width="90%" style="max-width: 1100px">
    <el-form label-width="90px" @submit.prevent>
      <el-form-item label="项目" required>
        <el-select
          v-model="form.projectId"
          filterable
          placeholder="选择已审批项目"
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
        </el-table>

        <div class="summary-bar">
          <span>合计发货金额：<b>{{ formatAmount(totalAmount()) }}</b></span>
          <span class="muted">合同金额：{{ formatAmount(contractAmount()) }}</span>
          <span v-if="overContract()" class="over-warn">⚠ 超过合同金额，提交后将由后端硬卡（或经确认放行）</span>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :icon="Plus" @click="handleSubmit">提交发货申请</el-button>
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
</style>
