<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import type { StatsQuery, ArSummaryVO, AgeingVO } from '@/types/stats'
import { statsAr, statsAgeing } from '@/api/stats'
import { formatMoney, formatPercent, formatNumber, formatWan } from '@/utils/format'
import StatCard from '@/components/StatCard.vue'
import EChart from '@/components/EChart.vue'

const props = defineProps<{ query: StatsQuery; active: boolean }>()
const loading = ref(false)
const ar = ref<ArSummaryVO | null>(null)
const ageing = ref<AgeingVO | null>(null)

const load = async () => {
  loading.value = true
  try {
    const [a, g] = await Promise.all([statsAr(props.query), statsAgeing(props.query)])
    ar.value = a
    ageing.value = g
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
  const g = ageing.value
  if (!g || !g.segments || g.segments.length === 0) return {}
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => formatMoney(v) },
    grid: { left: 70, right: 20, top: 30, bottom: 36 },
    xAxis: { type: 'category', data: g.segments.map((s) => s.label), axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatWan(v) } },
    series: [
      {
        type: 'bar',
        data: g.segments.map((s) => s.amount),
        itemStyle: { color: '#f56c6c', borderRadius: [4, 4, 0, 0] },
        barWidth: '48%',
        label: { show: true, position: 'top', formatter: (p: any) => formatWan(p.value) },
      },
    ],
  }
})
</script>

<template>
  <div v-loading="loading">
    <el-row :gutter="12" class="kpi-grid">
      <el-col :span="6"><StatCard label="应收余额 (B-01)" :value="ar?.arBalance" :format="formatMoney" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="逾期金额 (B-03)" :value="ar?.overdueAmount" :format="formatMoney" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="逾期率" :value="ar?.overdueRate" :format="formatPercent" accent="#f56c6c" /></el-col>
      <el-col :span="6"><StatCard label="平均逾期天数 (ADD)" :value="ageing?.add" :format="formatNumber" suffix="天" /></el-col>
      <el-col :span="6"><StatCard label="逾期笔数" :value="ageing?.overdueCount" :format="formatNumber" suffix="笔" /></el-col>
      <el-col :span="6"><StatCard label="本期回款·单据 (F-07)" :value="ar?.receiptPeriod" :format="formatMoney" accent="#67c23a" /></el-col>
      <el-col :span="6"><StatCard label="本期应收发生 (F-03)" :value="ar?.receivablePeriod" :format="formatMoney" /></el-col>
      <el-col :span="6"><StatCard label="回款率 (D-01)" :value="ar?.collectionRate" :format="formatPercent" accent="#67c23a" /></el-col>
      <el-col :span="6"><StatCard label="本期核销额 (F-08)" :value="ar?.writeOffPeriod" :format="formatMoney" accent="#67c23a" /></el-col>
      <el-col :span="6"><StatCard label="差异池 (F-09)" :value="ar?.diffPool" :format="formatMoney" :accent="(ar?.diffPool ?? 0) < 0 ? '#e6a23c' : '#909399'" /></el-col>
      <el-col :span="6"><StatCard label="DSO 应收周转天数 (D-03)" :value="ageing?.dso" :format="formatNumber" suffix="天" accent="#409eff" /></el-col>
      <el-col :span="6"><StatCard label="年化周转率 (D-04)" :value="ageing?.turnover" :format="formatNumber" suffix="次" accent="#409eff" /></el-col>
    </el-row>

    <el-card shadow="never" class="chart-card">
      <template #header>
        <span class="chart-h">账龄五段分布（FIFO 法 · 单位：元）</span>
        <el-tag size="small" type="info" effect="plain" class="method-tag">算法：{{ ageing?.method || 'FIFO' }}</el-tag>
      </template>
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
.method-tag {
  margin-left: 10px;
}
</style>
