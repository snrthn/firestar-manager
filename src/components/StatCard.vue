<script setup lang="ts">
// 看板 KPI 指标卡（公共件，4 个 Tab 复用）。
// V80：新增可选 format prop —— 传入时 value 视为原始数值，内部用 @vueuse/core 的
// useTransition 做 600ms 缓动（easeOutCubic），数字变化时平滑滚动，避免生硬跳变。
// 不传 format 时维持原行为（直接显示 value，兼容字符串入参）。
import { computed, ref, watch } from 'vue'
import { useTransition, TransitionPresets } from '@vueuse/core'

const props = defineProps<{
  label: string
  /** 原始数值（传 format 时按数值缓动）；未传 format 时也可直接传格式化字符串 */
  value?: number | string | null
  suffix?: string
  sub?: string
  accent?: string
  /** 传入时 value 视为原始数值，内部缓动后由 format 格式化（看板数字滚动效果） */
  format?: (n: number) => string
}>()

const source = ref(0)
watch(
  () => props.value,
  (v) => {
    const n = typeof v === 'number' ? v : Number(v)
    source.value = Number.isFinite(n) ? n : 0
  },
  { immediate: true },
)
const output = useTransition(source, { duration: 600, transition: TransitionPresets.easeOutCubic })

const display = computed(() => {
  if (props.format) return props.format(output.value)
  return props.value ?? ''
})
</script>

<template>
  <el-card shadow="hover" class="stat-card">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value" :style="accent ? { color: accent } : undefined">
      {{ display }}<span v-if="suffix" class="stat-suffix">{{ suffix }}</span>
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
  font-variant-numeric: tabular-nums;
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
