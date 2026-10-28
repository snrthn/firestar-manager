<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import type { StatsQuery, InvoiceSummaryVO } from '@/types/stats'
import { statsInvoice } from '@/api/stats'
import { formatMoney, formatPercent, formatWan } from '@/utils/format'
import StatCard from '@/components/StatCard.vue'
import EChart from '@/components/EChart.vue'

const props = defineProps<{ query: StatsQuery; active: boolean }>()
const loading = ref(false)
const data = ref<InvoiceSummaryVO | null>(null)

const load = async () => {
  loading.value = true
  try {
    data.value = await statsInvoice(props.query)
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
    legend: { data: ['金额'], bottom: 0 },
    grid: { left: 70, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: ['开票额(含税)', '不含税开票额', '本期回款额'] },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatWan(v) } },
    series: [
      {
        name: '金额',
        type: 'bar',
        data: [d.invoiceAmount, d.invoiceAmountNet, d.receiptAmount],
        itemStyle: { color: '#909399', borderRadius: [4, 4, 0, 0] },
        barWidth: '46%',
      },
    ],
  }
})
</script>

<template>
  <div v-loading="loading">
    <el-row :gutter="12" class="kpi-grid">
      <el-col :span="6"><StatCard label="本期开票额 (F-04)" :value="data?.invoiceAmount" :format="formatMoney" /></el-col>
      <el-col :span="6"><StatCard label="本期税额 (F-06)" :value="data?.taxAmount" :format="formatMoney" accent="#e6a23c" /></el-col>
      <el-col :span="6"><StatCard label="不含税开票额 (F-05)" :value="data?.invoiceAmountNet" :format="formatMoney" /></el-col>
      <el-col :span="6"><StatCard label="待开票余额 (B-02)" :value="data?.uninvoicedBalance" :format="formatMoney" accent="#e6a23c" /></el-col>
      <el-col :span="6"><StatCard label="开票率 (D-02)" :value="data?.invoiceRate" :format="formatPercent" accent="#409eff" /></el-col>
      <el-col :span="6"><StatCard label="红字发票率 (D-10)" :value="data?.redInvoiceRate" :format="formatPercent" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="本期回款额 (F-07)" :value="data?.receiptAmount" :format="formatMoney" accent="#67c23a" /></el-col>
    </el-row>

    <el-card shadow="never" class="chart-card">
      <template #header><span class="chart-h">票款对比（单位：元）</span></template>
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
