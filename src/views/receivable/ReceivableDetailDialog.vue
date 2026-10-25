<script setup lang="ts">
import { ref, watch } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { receivableDetail } from '@/api/receivable'
import type { ReceivableVO } from '@/types/receivable'
import { useDictLabels } from '@/composables/useDict'
import { formatDate } from '@/utils/datetime'

// 应收单详情弹窗（只读）。
// 应收单由发货「客户已收货」时点自动生成，无审批流，故本弹窗不做时间线与任何动作。
// 项目编号/名称由 ReceivableServiceImpl 关联 fin_project 带出（page 侧批量预取，非逐条查）。
const props = defineProps<{ receivableId: number | null }>()
const visible = defineModel<boolean>('visible', { required: true })

const loading = ref(false)
const detail = ref<ReceivableVO | null>(null)

const { label: statusLabel, style: statusStyle } = useDictLabels('receivable_status')
const { label: docDirectionLabel, style: docDirectionStyle } = useDictLabels('doc_direction')
const { label: sourceTypeLabel, style: sourceTypeStyle } = useDictLabels('receivable_source')

const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const load = async (id: number) => {
  loading.value = true
  try {
    detail.value = await receivableDetail(id)
  } catch (e) {
    ElMessage.error((e as Error).message)
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.receivableId] as const,
  ([open, id]) => {
    if (open && id != null) load(id)
  },
)
</script>

<template>
  <!-- 宽度/垂直位置走全站详情档 1000px + top 7vh（2026-10-25 与立项/发货/回款/发票/退货统一） -->
  <el-dialog v-model="visible" title="应收单详情" width="1000px" top="7vh">
    <div v-loading="loading" class="detail-scroll">
      <el-empty v-if="!detail" description="暂无数据" :image-size="60" />
      <template v-else>
        <el-descriptions :column="3" border size="small" class="head-desc kv-desc">
          <el-descriptions-item label="应收单号">{{ detail.receivableNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusStyle(detail.status) || 'info'" size="small">
              {{ statusLabel(detail.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="单据方向">
            <el-tag :type="docDirectionStyle(detail.docDirection) || 'info'" size="small">
              {{ docDirectionLabel(detail.docDirection) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="来源类型">
            <el-tag :type="sourceTypeStyle(detail.sourceType) || 'info'" size="small">
              {{ sourceTypeLabel(detail.sourceType) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="项目编号">{{ detail.projectNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="项目名称">{{ detail.projectName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="来源发货单">{{ detail.shipmentId ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="应收日期">{{ formatDate(detail.receivableDate) }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="block-title">金额构成</h4>
        <el-descriptions :column="3" border size="small" class="kv-desc">
          <el-descriptions-item label="应收金额">
            <b>{{ formatAmount(detail.receivableAmount) }}</b>
          </el-descriptions-item>
          <el-descriptions-item label="已核销">{{ formatAmount(detail.writtenOffAmount) }}</el-descriptions-item>
          <el-descriptions-item label="未核销">{{ formatAmount(detail.unwrittenOffAmount) }}</el-descriptions-item>
          <el-descriptions-item label="已开票">{{ formatAmount(detail.invoicedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="未开票">{{ formatAmount(detail.uninvoicedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="已回款">{{ formatAmount(detail.receivedAmount) }}</el-descriptions-item>
          <el-descriptions-item label="未回款">{{ formatAmount(detail.unreceivedAmount) }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* .head-desc / .block-title 已上提到 styles/pages.css 全局（2026-10-25），本文件不再留本地副本 */
.detail-scroll {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  padding-right: 4px;
}
.detail-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.detail-scroll::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}
.detail-scroll::-webkit-scrollbar-thumb:hover {
  background: #909399;
}
.detail-scroll::-webkit-scrollbar-track {
  background: transparent;
}
</style>
