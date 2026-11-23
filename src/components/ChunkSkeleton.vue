<script setup lang="ts">
/**
 * 异步 chunk 加载骨架（defineAsyncComponent 的 loadingComponent）。
 *
 * 为什么需要它：defineAsyncComponent 不传 loadingComponent 时，chunk 下载期间
 * 挂载点渲染为空——本机 dev 网络 0ms 感知不到，生产慢网下编辑器 / 渲染器
 * （md-editor-v3 + mermaid、x-markdown-vue + Shiki 都是 MB 级 chunk）要卡数秒白板。
 * 2026-11-23 生产反馈「骨架屏看不到效果」的根因就是只有组件内初始化骨架、
 * 没有 chunk 下载期骨架，两层补齐后才覆盖慢网全链路。
 *
 * delay=200 由调用方（knowledge.vue）配置：加载在 200ms 内完成则不闪骨架。
 */
defineProps<{
  /** 可选固定高度（如 '480px'）；不传则自适应内容行数 */
  height?: string
  /** 骨架占位行数，默认 6 */
  rows?: number
}>()
</script>

<template>
  <div class="chunk-skeleton" :style="height ? { height, overflow: 'hidden' } : undefined">
    <el-skeleton animated :rows="rows ?? 6" />
  </div>
</template>

<style scoped>
.chunk-skeleton {
  padding: 16px;
  box-sizing: border-box;
}
</style>
