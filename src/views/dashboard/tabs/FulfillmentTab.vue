<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import type { StatsQuery, FulfillmentVO } from '@/types/stats'
import { statsFulfillment } from '@/api/stats'
import { formatMoney, formatPercent, formatNumber, formatWan } from '@/utils/format'
import StatCard from '@/components/StatCard.vue'
import EChart from '@/components/EChart.vue'

const props = defineProps<{ query: StatsQuery; active: boolean }>()
const loading = ref(false)
const data = ref<FulfillmentVO | null>(null)

const load = async () => {
  loading.value = true
  try {
    data.value = await statsFulfillment(props.query)
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

const option = computed<Record<string, unknown>>(() => {
  const d = data.value
  if (!d) return {}
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatMoney(v) },
    grid: { left: 70, right: 20, top: 30, bottom: 36 },
    xAxis: { type: 'category', data: ['已发货额', '累计退货额'] },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatWan(v) } },
    series: [
      {
        type: 'bar',
        data: [d.shipmentAmountTotal, d.returnAmountTotal],
        itemStyle: { color: '#909399', borderRadius: [4, 4, 0, 0] },
        barWidth: '40%',
      },
    ],
  }
})
</script>

<template>
  <div v-loading="loading">
    <el-row :gutter="12" class="kpi-grid">
      <el-col :span="6"><StatCard label="退货率 (D-09)" :value="formatPercent(data?.returnRate)" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="累计退货额" :value="formatMoney(data?.returnAmountTotal)" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="已发货额" :value="formatMoney(data?.shipmentAmountTotal)" /></el-col>
      <el-col :span="6"><StatCard label="在途超期批次 (E-04)" :value="formatNumber(data?.inTransitOverdueCount)" suffix="批" accent="#e6a23c" /></el-col>
      <el-col :span="6"><StatCard label="红冲率 (D-10)" :value="formatPercent(data?.redRate)" accent="#f56c6c" /></el-col>
    </el-row>

    <el-card shadow="never" class="chart-card">
      <template #header><span class="chart-h">发货 vs 退货（单位：元）</span></template>
      <EChart :option="option" height="320px" />
    </el-card>
  </div>
</template>

<style scoped>
.kpi-grid {
  margin-bottom: 4px;
}
.kpi-grid .el-col {
  margin-bottom: 12px;
}
.chart-card {
  margin-top: 8px;
}
.chart-h {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
</style>
