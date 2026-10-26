<script setup lang="ts">
// 轻量 ECharts 包装件：option 变更自动重绘；容器尺寸变化（含 el-tabs 切换 display:none→block）自动 resize
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  option: Record<string, unknown>
  height?: string
}>()

const el = ref<HTMLDivElement>()
const chart = shallowRef<echarts.ECharts>()
let ro: ResizeObserver | null = null

// 容器尺寸为 0（隐藏态）时不 resize，避免无意义重绘与告警；可见后尺寸>0 才自适应
const doResize = () => {
  const dom = el.value
  if (!chart.value || !dom) return
  if (dom.clientWidth === 0 || dom.clientHeight === 0) return
  chart.value.resize()
}

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  chart.value.setOption(props.option)
  window.addEventListener('resize', doResize)
  // 关键修复：tab 切换使容器从 display:none 变为可见时，content box 尺寸变化会触发此处 resize
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => doResize())
    ro.observe(el.value)
  }
})

watch(
  () => props.option,
  (opt) => {
    chart.value?.setOption(opt, true)
    // 数据更新后，若容器已可见，立即按当前尺寸重绘，防止隐藏期初始化的宽度塌陷残留
    nextTick(() => doResize())
  },
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', doResize)
  if (ro) {
    ro.disconnect()
    ro = null
  }
  chart.value?.dispose()
})
</script>

<template>
  <div ref="el" :style="{ width: '100%', height: height || '320px' }" />
</template>
