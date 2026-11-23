<script setup lang="ts">
/**
 * 知识库「预览」tab 的 Markdown 渲染出口（懒加载，不进 knowledge 首屏）。
 *
 * 2026-11-23 二次反转（虎哥拍板）：x-markdown-vue 的渲染效果不如 md-editor-v3
 * 原生预览（代码块 / 表格样式细节差距明显，官网效果与我们页面上不一致），预览
 * 统一方向改为 **以 md-editor-v3 原生渲染为准**：本组件渲染核心从 x-markdown-vue
 * 切回 MdPreview。此前（2026-11-18）曾迁到 x-markdown-vue 以对齐 AI 助手；现知识库
 * 两条出口（编辑器内置预览 + 本组件）统一回 md-editor-v3 一条管线，效果天然一致。
 * AI 助手仍用 x-markdown-vue（流式对话场景，与文档预览解耦，不受本次反转影响）。
 *
 * 既有契约全部保住（MdPreview 同样支持）：
 *  1. 安全：kbPreviewMd 预处理把正文图片收窄为 ![alt](file:<id>)，外链 / data: /
 *     相对路径全替换为可见占位文本（不静默破图），渲染结果 <img src> 只可能是
 *     `${apiBase}/files/<id>/raw`；kbSanitize（DOMPurify）渲染后兜底第二层。
 *  2. 图片：resolveImagesIn / observeImages 带 JWT 拉 blob 回填 src；事件委托点击
 *     图片弹 ElImageViewer（动态 DOM / blob 换 src 后依然命中）。
 *  3. 图表：mermaid 运行时由 @/utils/kbMarkdown 注入本地实例（默认 unpkg CDN
 *     不可达），import 本模块即触发 config；MdPreview 与编辑器共用同一实例。
 *  4. 公式：KB_NO_KATEX=true 与编辑器同值，两端必须一致，否则「编辑器能渲、
 *     系统预览不能渲」的不一致又会回来。
 *
 * ⚠️ 本组件不承载滚动：滚动容器是 knowledge.vue 的 .kb-preview 原生 div（高度链在那里闭合）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { kbPreviewMd, kbSanitize, KB_NO_KATEX } from '@/utils/kbMarkdown'
import { observeImages, resolveImagesIn } from '@/utils/richImage'

const props = defineProps<{
  /** Markdown 正文（不可信文本：用户录入或模型输出） */
  content?: string | null
}>()

/** 图片协议白名单预处理；跳过围栏代码块，不会破坏 ```mermaid 图表源码 */
const md = computed(() => kbPreviewMd(props.content ?? ''))

const rootRef = ref<HTMLElement | null>(null)
const tracked: string[] = []
let stopObserve: (() => void) | null = null

onMounted(async () => {
  // 首次渲染的 img 主动解析一次；渲染器后续插入的 img（含 mermaid 渲染后的重绘）
  // 交给 MutationObserver 自动兜住
  await resolveImagesIn(rootRef.value, tracked)
  stopObserve = observeImages(rootRef.value, (url) => tracked.push(url))
})

onBeforeUnmount(() => {
  stopObserve?.()
  tracked.forEach((u) => URL.revokeObjectURL(u))
  tracked.length = 0
})

// 点击放大：事件委托而非逐张绑 onclick，动态 DOM / blob 换 src 后依然有效
const viewerVisible = ref(false)
const viewerUrls = ref<string[]>([])
const viewerIndex = ref(0)
function onRootClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target || target.tagName !== 'IMG' || !rootRef.value) return
  const imgs = Array.from(rootRef.value.querySelectorAll('img'))
  const idx = imgs.indexOf(target as HTMLImageElement)
  if (idx < 0) return
  viewerUrls.value = imgs.map((im) => (im as HTMLImageElement).src)
  viewerIndex.value = idx
  viewerVisible.value = true
}
</script>

<template>
  <div ref="rootRef" class="kb-md-view" @click="onRootClick">
    <!-- MdPreview 与编辑器内置预览同一渲染器：kbSanitize 渲染后兜底 +
         noKatex 同值，安全 / 公式契约与编辑器一致。
         MdPreview 是同步组件（渲染器随 chunk 已就位），无需 Suspense 骨架；
         chunk 下载期骨架由 knowledge.vue 的 defineAsyncComponent loadingComponent 承担。 -->
    <MdPreview :model-value="md" :sanitize="kbSanitize" :noKatex="KB_NO_KATEX" />
    <el-image-viewer
      v-if="viewerVisible"
      :url-list="viewerUrls"
      :initial-index="viewerIndex"
      teleported
      hide-on-click-modal
      @close="viewerVisible = false"
    />
  </div>
</template>

<!-- 非 scoped：渲染器动态注入节点带不到 scoped 属性 -->
<style>
.kb-md-view {
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-word;
}
.kb-md-view img {
  max-width: 100%;
  border-radius: 4px;
  cursor: zoom-in;
  transition: opacity 0.15s;
}
.kb-md-view img:hover {
  opacity: 0.85;
}
</style>
