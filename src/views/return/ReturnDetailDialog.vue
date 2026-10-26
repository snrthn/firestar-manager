<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Close } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import EmptyState from '@/components/EmptyState.vue'
import { completeReturnTask, rejectReturnTask, returnDetail } from '@/api/return'
import type { ReturnVO } from '@/types/return'

// 退货详情（V67）：基本信息 + 退货明细 + 三级审批时间线 + 三冲减结果。
// 审批操作：myPendingTaskId 非空（当前用户在该实例上有待办）才显示通过/驳回按钮。
const visible = defineModel<boolean>('visible', { required: true })
const props = defineProps<{ returnId?: number | null }>()
const emit = defineEmits<{ refresh: [] }>()

const detail = ref<ReturnVO | null>(null)
const loading = ref(false)
const acting = ref(false)

// 金额格式化（两位小数 + 千分位，全站同约定）
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const formatTime = (v: string | null | undefined): string =>
  v ? v.replace('T', ' ').slice(0, 16) : '—'

/** 明细行合计（挂分区标题右侧，与立项/发货详情「标题左 + 合计右」同款） */
const linesTotal = computed(() =>
  (detail.value?.lines || []).reduce((s, l) => s + Number(l.lineAmount ?? 0), 0),
)

const load = async (id: number) => {
  loading.value = true
  try {
    detail.value = await returnDetail(id)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

/** 三级审批通过（末节点通过后后端自动执行三冲减链，这里只需提示结果） */
const onApprove = async () => {
  const taskId = detail.value?.myPendingTaskId
  if (!taskId) return
  try {
    await ElMessageBox.confirm(
      '通过后将继续推进审批流程；若为末节点，系统将自动生成红字应收单/红字发票/退款单。',
      '审批通过',
      { type: 'warning', confirmButtonText: '确认通过', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  acting.value = true
  try {
    await completeReturnTask(taskId)
    ElMessage.success('已通过')
    await load(props.returnId!)
    emit('refresh')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    acting.value = false
  }
}

/** 审批驳回（终结实例 + REJECTED + 通知申请人，不执行任何冲减） */
const onReject = async () => {
  const taskId = detail.value?.myPendingTaskId
  if (!taskId) return
  let comment = ''
  try {
    const r = await ElMessageBox.prompt('请填写驳回意见', '审批驳回', {
      inputType: 'textarea',
      inputPlaceholder: '驳回原因（必填）',
      inputValidator: (v: string) => (v && v.trim() ? true : '驳回意见不能为空'),
    })
    comment = r.value.trim()
  } catch {
    return
  }
  acting.value = true
  try {
    await rejectReturnTask(taskId, comment)
    ElMessage.success('已驳回')
    await load(props.returnId!)
    emit('refresh')
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    acting.value = false
  }
}

watch(
  () => visible.value,
  (v) => {
    if (v && props.returnId) load(props.returnId)
    else if (!v) detail.value = null
  },
)
</script>

<template>
  <!-- 宽度走全站 L 档 1000px；限高滚动与 receipts/invoices 详情弹窗同口径 -->
  <el-dialog v-model="visible" title="退货详情" width="1000px" top="7vh">
    <div v-loading="loading" class="dialog-scroll">
      <template v-if="detail">
        <el-descriptions :column="3" border size="small" class="head-desc kv-desc">
          <el-descriptions-item label="退货单号">{{ detail.returnNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="项目">
            {{ detail.projectNo || '—' }} {{ detail.projectName || '' }}
          </el-descriptions-item>
          <el-descriptions-item label="发货批次">{{ detail.shipmentBatchNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="退货金额">
            <b class="amount">¥{{ formatAmount(detail.returnAmount) }}</b>
          </el-descriptions-item>
          <el-descriptions-item label="审批状态">
            <el-tag :type="(detail.approvalStatusStyle as any) || 'info'" size="small">
              {{ detail.approvalStatusName || detail.approvalStatus || '—' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="(detail.executeStatusStyle as any) || 'info'" size="small" effect="plain">
              {{ detail.executeStatusName || detail.executeStatus || '—' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.applicantName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="申请时间">{{ formatTime(detail.appliedAt) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="退货原因" :span="3">
            {{ detail.returnReason || '—' }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 退货明细行（分区标题走全局 .block-title，与立项/发货详情同一套） -->
        <h4 class="block-title">
          <span>退货明细</span>
          <span v-if="detail.lines?.length" class="items-total">
            合计：¥{{ formatAmount(linesTotal) }}
          </span>
        </h4>
        <el-table :data="detail.lines || []" border size="small">
          <el-table-column prop="itemName" label="货物名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="退货数量" width="110" align="right">
            <template #default="{ row }">{{ row.returnQty }}</template>
          </el-table-column>
          <el-table-column label="单价" width="120" align="right">
            <template #default="{ row }">¥{{ formatAmount(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column label="行金额" min-width="130" align="right">
            <template #default="{ row }"><b>¥{{ formatAmount(row.lineAmount) }}</b></template>
          </el-table-column>
          <template #empty>
            <EmptyState />
          </template>
        </el-table>

        <!-- 三级审批时间线 -->
        <h4 class="block-title">审批进度</h4>
        <ApprovalTimeline
          :timeline="detail.timeline || []"
          :collapse-after="3"
          empty-text="暂无审批记录"
        />

        <!-- 三冲减结果（审批通过并执行后由 ReturnServiceImpl.executeReturn 自动生成） -->
        <template v-if="detail.writeoffDetail">
          <h4 class="block-title">自动冲减结果</h4>
          <el-descriptions :column="3" border size="small" class="kv-desc">
            <el-descriptions-item label="红字应收单">
              {{ detail.writeoffDetail.redReceivableNo || '—' }}
              <span v-if="detail.writeoffDetail.originalReceivableNo" class="muted">
                （原 {{ detail.writeoffDetail.originalReceivableNo }}）
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="红字应收金额">
              ¥{{ formatAmount(detail.writeoffDetail.redReceivableAmount) }}
            </el-descriptions-item>
            <el-descriptions-item label="红字发票">
              {{ detail.writeoffDetail.redInvoiceNo || '未开票，未生成' }}
              <span v-if="detail.writeoffDetail.originalInvoiceNo" class="muted">
                （原 {{ detail.writeoffDetail.originalInvoiceNo }}）
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="红字发票金额">
              ¥{{ formatAmount(detail.writeoffDetail.redInvoiceAmount) }}
            </el-descriptions-item>
            <el-descriptions-item label="退款单">
              {{ detail.writeoffDetail.redReceiptNo || '未回款，未生成' }}
              <span v-if="detail.writeoffDetail.originalReceiptNo" class="muted">
                （原 {{ detail.writeoffDetail.originalReceiptNo }}）
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="退款金额">
              ¥{{ formatAmount(detail.writeoffDetail.refundAmount) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.writeoffDetail.reverseWriteOffNos.length" label="反向核销" :span="3">
              <el-tag
                v-for="no in detail.writeoffDetail.reverseWriteOffNos"
                :key="no"
                size="small"
                class="tag-gap"
              >{{ no }}</el-tag>
              <span class="muted">（可在「核销管理」台账查看，红冲/退款自动落 REVERSED 留痕）</span>
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.writeoffDetail.executionNotes.length" label="执行说明" :span="3">
              <div v-for="(n, i) in detail.writeoffDetail.executionNotes" :key="i" class="note-line">
                {{ n }}
              </div>
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </template>
      <el-empty v-else-if="!loading" description="请选择一条退货记录" :image-size="60" />
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <template v-if="detail?.myPendingTaskId">
        <el-button type="danger" :icon="Close" :loading="acting" @click="onReject">驳回</el-button>
        <el-button type="primary" :icon="Check" :loading="acting" @click="onApprove">通过</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.amount {
  color: var(--el-color-danger);
  font-size: 15px;
}
.muted {
  color: #909399;
  font-size: 12px;
}
.tag-gap {
  margin-right: 6px;
}
.note-line {
  font-size: 13px;
  line-height: 1.8;
  color: #606266;
}
/* 分区标题吃全局 styles/pages.css 的 .block-title / .head-desc（2026-10-25），
   与立项/发货详情同一套，本文件不再自造 .section-title。 */
/* 限高滚动 + 迷你滚动条（公式 280 同源），改必须同步维护 */
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
