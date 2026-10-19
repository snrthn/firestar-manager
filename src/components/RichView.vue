<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import DOMPurify from 'dompurify'
import { resolveImagesIn } from '@/utils/richImage'

// 富文本展示组件：对后端返回的 HTML（Tiptap 产出）做 DOMPurify 净化后再 v-html，
// 阻断 XSS（协议/关于我们等内容由运营录入，必须经净化，绝对不能直接 v-html 原始串）。
// 净化后解析内网文件图片（带 token 转 blob），使其正确显示。
const props = defineProps<{
  /** 后端返回的富文本 HTML（可能为 null/空） */
  html?: string | null
  /** 透传到根节点的额外 class，便于各场景复用既有样式 */
  className?: string
}>()

const clean = computed(() => (props.html ? DOMPurify.sanitize(props.html) : ''))
const rootRef = ref<HTMLElement | null>(null)
let tracked: string[] = []

watch(
  clean,
  async () => {
    await nextTick()
    // 回收上一轮生成的 blob URL，避免内存泄漏
    tracked.forEach((u) => URL.revokeObjectURL(u))
    tracked = []
    await resolveImagesIn(rootRef.value, tracked)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  tracked.forEach((u) => URL.revokeObjectURL(u))
  tracked = []
})
</script>

<template>
  <div ref="rootRef" class="rich-view" :class="className" v-html="clean" />
</template>

<style scoped>
.rich-view {
  line-height: 1.7;
  color: #303133;
  word-break: break-word;
}
/* 富文本内容通用排版（deep 命中 v-html 注入的节点） */
.rich-view :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
.rich-view :deep(a) {
  color: var(--el-color-primary);
  text-decoration: underline;
}
.rich-view :deep(h1),
.rich-view :deep(h2),
.rich-view :deep(h3) {
  margin: 10px 0 6px;
  line-height: 1.4;
}
.rich-view :deep(p) {
  margin: 6px 0;
}
.rich-view :deep(ul),
.rich-view :deep(ol) {
  padding-left: 22px;
  margin: 6px 0;
}
.rich-view :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--el-border-color);
  color: #909399;
}
</style>
