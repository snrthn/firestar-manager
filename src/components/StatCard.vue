<script setup lang="ts">
// 看板 KPI 指标卡（公共件，5 个 Tab 复用）
defineProps<{
  label: string
  value: string | number
  suffix?: string
  sub?: string
  accent?: string
}>()
</script>

<template>
  <el-card shadow="hover" class="stat-card">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value" :style="accent ? { color: accent } : undefined">
      {{ value }}<span v-if="suffix" class="stat-suffix">{{ suffix }}</span>
    </div>
    <div v-if="sub" class="stat-sub">{{ sub }}</div>
  </el-card>
</template>

<style scoped>
.stat-card {
  border-radius: 8px;
}
.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.15;
  word-break: break-all;
}
.stat-suffix {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
}
.stat-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
