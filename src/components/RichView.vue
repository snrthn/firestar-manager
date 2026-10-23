<script setup lang="ts">
import { computed, ref, useAttrs, watch, nextTick, onBeforeUnmount } from 'vue'
import DOMPurify from 'dompurify'
import { resolveImagesIn } from '@/utils/richImage'

// 富文本展示组件：对后端返回的 HTML（Tiptap 产出）做 DOMPurify 净化后再 v-html，
// 阻断 XSS（协议/关于我们等内容由运营录入，必须经净化，绝对不能直接 v-html 原始串）。
// 净化后解析内网文件图片（带 token 转 blob），使其正确显示。
//
// ⚠️ inheritAttrs:false + 手动 v-bind="attrs"（2026-10-23 虎哥截图实锤的修复）：
// 本组件模板根是 Fragment（内容 div + 图片查看器两个根），Vue 的自动 attr 继承
// 对 Fragment 根无效——调用方传的 class 会被静默丢弃并刷
// "Extraneous non-props attributes (class) ... Fragment or text or teleport root nodes" 警告。
// 该问题自 10-21 图片预览功能（新增 el-image-viewer 第二根）引入，六个调用方
// （about-notice / a-content / agree-content / agr-content / d-content / msg-content）
// 传的 class 全部没生效。关自动继承、把 attrs 全量绑到内容 div 上，恢复单根时代行为。
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

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
    // 图片解析完成后再绑点击预览（此时 src 已是 blob URL，viewer 直接可用）
    bindImagePreview()
  },
  { immediate: true }
)

// ===== 图片点击预览大图（2026-10-21 需求③）=====
// 展示端交互：点击富文本内图片弹 ElImageViewer（url-list 取当前 DOM 里所有 img.src，
// blob URL 会话内有效）。编辑器端不加此交互（保持编辑行为）。
const viewerVisible = ref(false)
const viewerUrls = ref<string[]>([])
const viewerIndex = ref(0)

function bindImagePreview() {
  const root = rootRef.value
  if (!root) return
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[]
  imgs.forEach((img, i) => {
    img.style.cursor = 'zoom-in'
    img.title = '点击查看大图'
    img.onclick = () => {
      // 点击时现取 src 列表：异步解析可能刚换过 blob，现取保证与视觉一致
      viewerUrls.value = Array.from(root.querySelectorAll('img')).map(
        (im) => (im as HTMLImageElement).src
      )
      viewerIndex.value = i
      viewerVisible.value = true
    }
  })
}

onBeforeUnmount(() => {
  tracked.forEach((u) => URL.revokeObjectURL(u))
  tracked = []
})
</script>

<template>
  <!-- attrs 手动绑到内容 div（inheritAttrs:false，见 script 注释）：调用方 class 恢复落到
       内容节点上——与 10-21 图片预览功能引入第二根之前的单根行为一致 -->
  <div ref="rootRef" class="rich-view" :class="className" v-html="clean" v-bind="attrs" />
  <!-- 图片预览大图（需求③）：全局注册于 main.ts，url-list 为点击时现取的 img.src；
       hide-on-click-modal：点击遮罩即关（2026-10-23 虎哥要求，与其它图片预览交互一致） -->
  <el-image-viewer
    v-if="viewerVisible"
    :url-list="viewerUrls"
    :initial-index="viewerIndex"
    teleported
    hide-on-click-modal
    @close="viewerVisible = false"
  />
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
  cursor: zoom-in;
  transition: opacity 0.15s;
}
.rich-view :deep(img:hover) {
  opacity: 0.85;
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
