<script setup lang="ts">
/**
 * 统一 Markdown 渲染出口：知识库顶部「预览」tab（AI 助手消费端后续复用）。
 *
 * ✅ 设计文档 §25（撤销 §24 的 A 方案）：本组件不再自己用 markdown-it 渲染，
 *    而是直接继承 md-editor-v3 的默认预览组件 MdPreview —— 与编辑器内置预览
 *    **同一个渲染器、同一套 mermaid 图表解析、同一套代码块/表格样式**，
 *    从根上消除「系统预览 vs 默认预览」表现不一致（图表显示为 bash 代码块等）。
 *
 * 继承默认渲染器后，项目侧的三条既有契约仍需保住：
 *   1. 安全：kbSanitize（DOMPurify）作为项目侧第二层，md-editor-v3 自带 XSS 插件为第一层；
 *   2. 图片：kbPreviewMd 把 ![alt](file:<id>) 换成内网字节接口相对路径、
 *      非法外链替换为可见占位文本；resolveImagesIn/observeImages 带 JWT 拉 blob；
 *      事件委托点击图片弹 ElImageViewer（动态 DOM 也能命中）。
 *   3. 图表：mermaid 实例由 @/utils/kbMarkdown 全局注入（默认 unpkg CDN 不可达），
 *      本组件不传 noMermaid，8 种图表（流程/时序/甘特/类/状态/饼/关系/旅程）全部可解析。
 *
 * ⚠️ 排版样式刻意交给 md-editor-v3 的 preview.css 接管，不再自定义 h1/p/table 等，
 *    否则同优先级 CSS 会因加载顺序不同，让两个预览看起来又「差一点」。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { kbSanitize, kbPreviewMd, KB_NO_KATEX } from '@/utils/kbMarkdown'
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
  // 首次渲染的 img 主动解析一次；MdPreview 后续异步插入的（含 mermaid 后的重绘）
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
    <MdPreview
      :model-value="md"
      :sanitize="kbSanitize"
      :noKatex="KB_NO_KATEX"
    />
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

<!-- 非 scoped：MdPreview 内部是 v-html 注入节点，scoped 属性不会落到这些节点上 -->
<style>
.kb-md-view {
  font-size: 14px;
  color: #303133;
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
