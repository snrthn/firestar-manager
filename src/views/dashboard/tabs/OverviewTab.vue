<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import type { StatsQuery, OverviewVO } from '@/types/stats'
import { statsOverview } from '@/api/stats'
import { formatMoney, formatNumber, formatWan } from '@/utils/format'
import StatCard from '@/components/StatCard.vue'
import EChart from '@/components/EChart.vue'

const props = defineProps<{ query: StatsQuery; active: boolean }>()
const loading = ref(false)
const data = ref<OverviewVO | null>(null)

const load = async () => {
  loading.value = true
  try {
    data.value = await statsOverview(props.query)
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
    xAxis: {
      type: 'category',
      data: ['合同额', '发货额', '应收发生', '开票额', '回款额', '核销额', '应收余额'],
      axisLabel: { interval: 0, fontSize: 11 },
    },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatWan(v) } },
    series: [
      {
        type: 'bar',
        data: [
          d.contractAmount,
          d.shipmentAmount,
          d.receivableOccurred,
          d.invoiceAmount,
          d.receiptAmount,
          d.writeOffAmount,
          d.arBalance,
        ],
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
        barWidth: '48%',
      },
    ],
  }
})
</script>

<template>
  <div v-loading="loading">
    <el-row :gutter="12" class="kpi-grid">
      <el-col :span="6"><StatCard label="合同签约额 (F-01)" :value="formatMoney(data?.contractAmount)" /></el-col>
      <el-col :span="6"><StatCard label="本期发货额 (F-02)" :value="formatMoney(data?.shipmentAmount)" /></el-col>
      <el-col :span="6"><StatCard label="本期应收发生 (F-03)" :value="formatMoney(data?.receivableOccurred)" /></el-col>
      <el-col :span="6"><StatCard label="本期开票额 (F-04)" :value="formatMoney(data?.invoiceAmount)" /></el-col>
      <el-col :span="6"><StatCard label="本期税额 (F-06)" :value="formatMoney(data?.taxAmount)" /></el-col>
      <el-col :span="6"><StatCard label="本期回款额 (F-07)" :value="formatMoney(data?.receiptAmount)" accent="#67c23a" /></el-col>
      <el-col :span="6"><StatCard label="本期核销额 (F-08)" :value="formatMoney(data?.writeOffAmount)" accent="#67c23a" /></el-col>
      <el-col :span="6">
        <StatCard
          label="差异池 (F-09)"
          :value="formatMoney(data?.diffPool)"
          :accent="(data?.diffPool ?? 0) < 0 ? '#e6a23c' : '#909399'"
          :sub="(data?.diffPool ?? 0) < 0 ? '收款未核销' : '—'"
        />
      </el-col>
      <el-col :span="6"><StatCard label="应收余额 (B-01)" :value="formatMoney(data?.arBalance)" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="待开票余额 (B-02)" :value="formatMoney(data?.uninvoicedBalance)" accent="#e6a23c" /></el-col>
      <el-col :span="6"><StatCard label="逾期金额 (B-03)" :value="formatMoney(data?.overdueAmount)" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="项目总数" :value="formatNumber(data?.projectCount)" /></el-col>
      <el-col :span="6"><StatCard label="客户总数" :value="formatNumber(data?.customerCount)" /></el-col>
      <el-col :span="6"><StatCard label="货物总数" :value="formatNumber(data?.goodsCount)" /></el-col>
    </el-row>

    <el-card shadow="never" class="chart-card">
      <template #header><span class="chart-h">流量指标对比（单位：元）</span></template>
      <EChart :option="option" height="340px" />
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
