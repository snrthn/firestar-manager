<script setup lang="ts">
import { ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import type { StatsQuery, ProjectRankingVO } from '@/types/stats'
import { statsProject } from '@/api/stats'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ query: StatsQuery; active: boolean }>()
const loading = ref(false)
const data = ref<ProjectRankingVO | null>(null)

const load = async () => {
  loading.value = true
  try {
    data.value = await statsProject(props.query)
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}
watch(
  [() => props.active, () => props.query],
  () => {
    if (props.active) load()
  },
  { deep: true, immediate: true },
)

// 三个完成率展示为迷你进度条（百分比封顶 100，避免超额回款撑爆组件）
const pct = (v: number | null | undefined) => Math.min(100, Math.round((Number(v) || 0) * 100))
</script>

<template>
  <div v-loading="loading">
    <el-alert type="info" :closable="false" show-icon class="rank-tip">
      <template #title>仅统计「已签合同」（approval_status = APPROVED）项目，合同额与 F-01 口径对齐</template>
    </el-alert>

    <el-table :data="data?.rows || []" border stripe :max-height="520" class="rank-table">
      <el-table-column prop="projectNo" label="项目编号" min-width="150" show-overflow-tooltip />
      <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="customerName" label="客户" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.customerName || '—' }}</template>
      </el-table-column>
      <el-table-column label="销售经理" min-width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.managerName || '—' }}</template>
      </el-table-column>
      <el-table-column label="合同额" min-width="140" align="right">
        <template #default="{ row }">{{ formatMoney(row.contractAmount) }}</template>
      </el-table-column>
      <el-table-column label="发货额" min-width="130" align="right">
        <template #default="{ row }">{{ formatMoney(row.shipmentAmount) }}</template>
      </el-table-column>
      <el-table-column label="应收额" min-width="130" align="right">
        <template #default="{ row }">{{ formatMoney(row.receivableAmount) }}</template>
      </el-table-column>
      <el-table-column label="开票额" min-width="130" align="right">
        <template #default="{ row }">{{ formatMoney(row.invoiceAmount) }}</template>
      </el-table-column>
      <el-table-column label="回款额" min-width="130" align="right">
        <template #default="{ row }">{{ formatMoney(row.receiptAmount) }}</template>
      </el-table-column>
      <el-table-column label="发货率" min-width="160">
        <template #default="{ row }">
          <el-progress :percentage="pct(row.shipRate)" :stroke-width="14" />
        </template>
      </el-table-column>
      <el-table-column label="开票率" min-width="160">
        <template #default="{ row }">
          <el-progress :percentage="pct(row.invoiceRate)" :stroke-width="14" color="#e6a23c" />
        </template>
      </el-table-column>
      <el-table-column label="回款率" min-width="160">
        <template #default="{ row }">
          <el-progress :percentage="pct(row.receiptRate)" :stroke-width="14" color="#67c23a" />
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState />
    </template>
    </el-table>

    <div class="rank-foot">共 {{ data?.total || 0 }} 个已签合同项目</div>
  </div>
</template>

<style scoped>
.rank-tip {
  margin-bottom: 12px;
}
.rank-table {
  margin-top: 4px;
}
.rank-foot {
  margin-top: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: right;
}
</style>
