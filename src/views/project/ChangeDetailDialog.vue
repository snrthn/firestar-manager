<script setup lang="ts">
import { ref, watch } from 'vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { changeDetail, changeTimeline, cancelChange } from '@/api/change'
import type { ChangeVO } from '@/types/change'
import type { TaskInfoVO } from '@/types/approval'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import ApprovalActionForm from '@/components/ApprovalActionForm.vue'
import { useTaskApproval } from '@/composables/useTaskApproval'

/**
 * 项目变更单详情弹窗（V220）：审批中心「待我审批」点变更任务时打开。
 * 审批模式下内容照旧（变更前后金额 + 明细 diff + 审批进度），footer 换成审批表单，
 * 审批人一边看改了什么一边决定通过/驳回。
 */
const props = defineProps<{
  changeId: number | null
  approvalTask?: TaskInfoVO | null
  readonly?: boolean
}>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ approved: [ok: boolean]; updated: [] }>()

const { action, saving, submit } = useTaskApproval()
const loading = ref(false)
const detail = ref<ChangeVO | null>(null)
const timeline = ref<ReturnType<typeof changeTimeline> extends Promise<infer T> ? T : never>([])

const dialogTitle = () =>
  props.approvalTask
    ? `审批 - ${props.approvalTask.bizTitle || props.approvalTask.taskName || '项目变更'}`
    : '项目变更详情'

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const load = async (id: number) => {
  loading.value = true
  try {
    const [d, tl] = await Promise.all([changeDetail(id), changeTimeline(id)])
    detail.value = d
    timeline.value = tl
  } catch (e) {
    ElMessage.error((e as Error).message)
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.changeId] as const,
  ([open, id]) => { if (open && id != null) load(id) },
  { immediate: true },
)

const handleApprovalConfirm = async () => {
  if (!props.approvalTask) return
  const ok = await submit(props.approvalTask)
  if (ok) visible.value = false
  emit('approved', ok)
}

const handleCancel = async () => {
  if (!detail.value) return
  try {
    await cancelChange(detail.value.id)
    ElMessage.success('已撤销变更申请')
    visible.value = false
    emit('updated')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const opLabel = (op: string) => ({ ADD: '新增', MODIFY: '修改', DELETE: '删除' })[op] || op
</script>

<template>
  <el-dialog v-model="visible" :title="dialogTitle()" width="900px" top="8vh">
    <div v-loading="loading" class="change-detail-scroll">
      <template v-if="detail">
        <h4 class="detail-block-title">变更信息</h4>
        <div class="info-grid">
          <div class="info-cell"><span class="label">变更单号</span><span class="value">{{ detail.changeNo }}</span></div>
          <div class="info-cell"><span class="label">所属项目</span><span class="value">{{ detail.projectName || '—' }}</span></div>
          <div class="info-cell"><span class="label">变更窗口</span><span class="value">{{ detail.windowType === 'A' ? 'A · 无下游单据' : 'B · 已有下游单据' }}</span></div>
          <div class="info-cell"><span class="label">审批状态</span><span class="value">{{ detail.approvalStatusName || detail.approvalStatus }}</span></div>
          <div class="info-cell"><span class="label">发起人</span><span class="value">{{ detail.applicantName || '—' }}</span></div>
          <div class="info-cell"><span class="label">申请时间</span><span class="value">{{ detail.appliedAt || '—' }}</span></div>
        </div>

        <h4 class="detail-block-title">金额变化</h4>
        <div class="amount-change">
          <span>{{ fmt(detail.oldContractAmount) }}</span>
          <span class="arrow">→</span>
          <span class="after">{{ fmt(detail.newContractAmount ?? detail.oldContractAmount) }}</span>
        </div>

        <h4 class="detail-block-title">变更原因</h4>
        <p class="reason-text">{{ detail.changeReason }}</p>

        <h4 class="detail-block-title">明细变更（增量 diff）</h4>
        <el-table :data="detail.items || []" border size="small">
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <span :class="'op-' + row.opType.toLowerCase()">{{ opLabel(row.opType) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="itemName" label="名称" min-width="150" show-overflow-tooltip />
          <el-table-column label="数量" width="90" align="right">
            <template #default="{ row }">{{ row.opType === 'DELETE' ? '—' : row.quantity }}</template>
          </el-table-column>
          <el-table-column label="单价" width="110" align="right">
            <template #default="{ row }">{{ row.opType === 'DELETE' ? '—' : fmt(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column label="原行ID" width="90" align="center">
            <template #default="{ row }">{{ row.itemId ?? '—' }}</template>
          </el-table-column>
          <template #empty><div style="padding:12px;color:#999">本次未变更明细</div></template>
        </el-table>

        <h4 class="detail-block-title">审批进度</h4>
        <ApprovalTimeline :timeline="timeline" :collapse-after="4"
                          empty-text="暂无审批记录" />

        <template v-if="approvalTask">
          <h4 class="detail-block-title">当前审批</h4>
          <ApprovalActionForm :task="approvalTask" />
        </template>
      </template>
    </div>
    <template #footer>
      <template v-if="approvalTask">
        <el-button @click="visible = false">取消</el-button>
        <el-button :type="action === 'reject' ? 'danger' : 'primary'" :loading="saving"
                   @click="handleApprovalConfirm">
          {{ action === 'reject' ? '确定驳回' : '确认通过' }}
        </el-button>
      </template>
      <template v-else>
        <el-button v-if="detail && detail.canCancel && !readonly" type="danger" plain @click="handleCancel">撤销申请</el-button>
        <el-button @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.change-detail-scroll { max-height: 68vh; overflow-y: auto; padding-right: 4px; }
.detail-block-title { margin: 14px 0 8px; font-size: 14px; font-weight: 600; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
.info-cell { display: flex; gap: 10px; font-size: 13px; }
.info-cell .label { color: var(--el-text-color-secondary); min-width: 70px; }
.info-cell .value { color: var(--el-text-color-primary); }
.amount-change { display: flex; align-items: center; gap: 16px; font-size: 16px; }
.amount-change .arrow { color: var(--el-text-color-secondary); }
.amount-change .after { color: var(--el-color-primary); font-weight: 600; }
.reason-text { font-size: 13px; line-height: 1.6; margin: 0; }
.op-add { color: var(--el-color-success); }
.op-modify { color: var(--el-color-warning); }
.op-delete { color: var(--el-color-danger); }
</style>
