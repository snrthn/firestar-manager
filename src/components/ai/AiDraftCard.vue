<script lang="ts">
/**
 * 业务自定义渲染卡（④）：发货单草稿卡。
 *
 * 这是 AI 助手「业务场景自定义渲染」的注册样板——后端 draft_* 工具下发结构化
 * payload（SSE draft 帧 / 历史会话 tool 行），前端按 itemType 选卡渲染。
 * 新业务卡 = 新增一个本目录下的卡组件 + AiAssistantFab 的 itemType 分发，
 * 数据结构随卡组件自定义，不进通用 markdown 管线。
 */
export interface DraftLine {
  itemId: number
  itemName: string
  specModel?: string
  unit?: string
  quantity?: number
  shippedQty?: number
  remaining?: number
  shipmentQty: number
  unitPrice?: number
  lineAmount?: number
}
export interface DraftPreview {
  projectId: number
  projectNo?: string
  projectName?: string
  customerName?: string
  contractAmount?: number
  lines: DraftLine[]
  totalAmount?: number
  errors?: string[]
  warnings?: string[]
}
export default {}
</script>

<script setup lang="ts">
defineProps<{
  draft: DraftPreview
  created?: boolean
  creating?: boolean
  /** 历史回放卡：确认按钮禁用，防止重复创建发货单 */
  history?: boolean
}>()

const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <div class="ai-draft">
    <div class="ai-draft__hd">
      <span class="ai-draft__title">发货单草稿（待确认）</span>
      <el-tag v-if="created" size="small" type="success">已创建</el-tag>
      <el-tag v-else-if="history" size="small" type="info">历史回放</el-tag>
    </div>
    <div class="ai-draft__proj">
      {{ draft.projectName || '—' }}
      <span class="ai-draft__sub">（{{ draft.projectNo || '—' }}）</span>
      <span class="ai-draft__sub"> · 客户：{{ draft.customerName || '—' }}</span>
    </div>
    <table v-if="draft.lines?.length" class="ai-draft__table">
      <thead>
        <tr>
          <th>货物</th>
          <th>规格</th>
          <th>数量</th>
          <th>单价</th>
          <th>金额</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(l, li) in draft.lines" :key="li">
          <td>{{ l.itemName }}</td>
          <td>{{ l.specModel || '—' }}</td>
          <td>{{ l.shipmentQty }} {{ l.unit || '' }}</td>
          <td>{{ l.unitPrice != null ? l.unitPrice : '—' }}</td>
          <td>{{ l.lineAmount != null ? l.lineAmount : '—' }}</td>
        </tr>
      </tbody>
    </table>
    <div class="ai-draft__total">
      合计：{{ draft.totalAmount != null ? draft.totalAmount : '—' }}
    </div>
    <div v-if="draft.errors?.length" class="ai-draft__err">
      <div v-for="(e, ei) in draft.errors" :key="'e' + ei">{{ e }}</div>
    </div>
    <div v-if="draft.warnings?.length" class="ai-draft__warn">
      <div v-for="(w, wi) in draft.warnings" :key="'w' + wi">{{ w }}</div>
    </div>
    <div class="ai-draft__actions">
      <el-button
        type="primary"
        size="small"
        :loading="!!creating"
        :disabled="!!created || !!draft.errors?.length || !!history"
        :title="history ? '历史回放卡片仅供查看，请回到当时会话或重新生成' : ''"
        @click="emit('confirm')"
      >
        确认创建（存草稿）
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.ai-draft {
  margin: 6px 0 12px;
  padding: 12px;
  border: 1px solid #b3d8ff;
  border-radius: 10px;
  background: #f5f9ff;
  font-size: 13px;
  color: #303133;
}
.ai-draft__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.ai-draft__title {
  font-weight: 600;
  color: #409eff;
}
.ai-draft__proj {
  margin-bottom: 8px;
  line-height: 1.6;
}
.ai-draft__sub {
  color: #909399;
}
.ai-draft__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ai-draft__table th,
.ai-draft__table td {
  border: 1px solid #ebeef5;
  padding: 4px 6px;
  text-align: left;
}
.ai-draft__table th {
  background: #ecf5ff;
  color: #606266;
}
.ai-draft__total {
  margin-top: 8px;
  text-align: right;
  font-weight: 600;
}
.ai-draft__err,
.ai-draft__warn {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  line-height: 1.6;
}
.ai-draft__err {
  background: #fef0f0;
  color: #f56c6c;
}
.ai-draft__warn {
  background: #fdf6ec;
  color: #e6a23c;
}
.ai-draft__actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
</style>
