<script setup lang="ts">
/**
 * 知识库「预览」tab 的 Markdown 渲染出口（懒加载，不进 knowledge 首屏）。
 *
 * 2026-11-18：渲染核心从 md-editor-v3 的 MdPreview 迁移到 x-markdown-vue
 * （与 AI 助手气泡同一个渲染器），兑现设计文档「知识库预览与 AI 回答共用渲染器」的约定。
 * 迁移动机：md-editor-v3 的预览走 CDN 加载 mermaid（内网不可达，靠注入本地实例绕过），
 * 且两套渲染器的代码块/表格样式细节对不齐；x-markdown-vue 动态 import 本地 mermaid 包，
 * 零 CDN 依赖，知识库与 AI 助手从此真正共用同一条渲染管线。
 *
 * 三条既有契约全部保住：
 *  1. 安全：allowHtml=false（raw HTML 根本不进渲染管线）+ sanitize=true（rehype-sanitize
 *     + DOMPurify）。知识库正文属于不可信文本，这条红线不放松。
 *  2. 图片：kbPreviewMd 把 ![alt](file:<id>) 换成内网字节接口相对路径、非法外链替换为
 *     可见占位文本；渲染后的 img 由 resolveImagesIn/observeImages 带 JWT 拉 blob；
 *     事件委托点击图片弹 ElImageViewer（动态 DOM 也能命中）。
 *  3. 图表：enable-mermaid=true，mermaid 11.x 走 npm 包（已在依赖里，md-editor-v3
 *     编辑器同版本），构建时拆独立 chunk 懒加载，不进首屏。
 *
 * ⚠️ 编辑器（MarkdownEditor.vue）仍用 md-editor-v3：x-markdown-vue 只管渲染不管输入，
 *    编辑与预览是两个职责，预览出口统一到本组件即可。
 * ⚠️ enable-latex=false 与原 KB_NO_KATEX=true 契约一致：公式渲染原来就不启用，
 *    两端必须同值，否则「编辑器能渲、系统预览不能渲」的不一致又会回来。
 * ⚠️ 本组件不承载滚动：滚动容器是 knowledge.vue 的 .kb-preview 原生 div（高度链在那里闭合）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MarkdownRendererAsync } from 'x-markdown-vue'
import 'x-markdown-vue/style'
import { kbPreviewMd } from '@/utils/kbMarkdown'
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
  // 首次渲染的 img 主动解析一次；渲染器后续异步插入的 img（含 mermaid 渲染后的重绘）
  // 交给 MutationObserver 自动兜住（x-markdown-vue 是异步渲染器，首帧后仍会持续 patch）
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
    <!-- MarkdownRendererAsync 是 async setup（Shiki / mermaid chunk 懒加载）：
         加载期间必须有固定高度占位 + Loading，否则切到「预览」tab 会白屏塌陷。
         fallback 用纯 CSS 骨架，不依赖 el-skeleton（测试环境未注册会告警）。 -->
    <Suspense>
      <MarkdownRendererAsync
        :markdown="md"
        :allow-html="false"
        :sanitize="true"
        :enable-animate="false"
        :enable-gfm="true"
        :enable-breaks="false"
        :enable-latex="false"
        :enable-shiki="true"
        :enable-mermaid="true"
        :show-code-block-header="true"
      />
      <template #fallback>
        <div class="kb-md-loading" role="status" aria-label="正在加载文档预览">
          <div class="kb-md-loading__bar" />
          <div class="kb-md-loading__bar kb-md-loading__bar--mid" />
          <div class="kb-md-loading__bar" />
          <div class="kb-md-loading__bar kb-md-loading__bar--short" />
          <span class="kb-md-loading__text">正在加载文档预览…</span>
        </div>
      </template>
    </Suspense>
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
/* 预览加载骨架：固定占位高度，切 tab / 首次渲染期间不塌陷 */
.kb-md-loading {
  min-height: 420px;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.kb-md-loading__bar {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f2f4f7 25%, #e8ebf0 37%, #f2f4f7 63%);
  background-size: 400% 100%;
  animation: kb-md-shimmer 1.4s ease-in-out infinite;
}
.kb-md-loading__bar--mid {
  width: 78%;
}
.kb-md-loading__bar--short {
  width: 55%;
}
.kb-md-loading__text {
  margin-top: 6px;
  font-size: 12px;
  color: #a8abb2;
}
@keyframes kb-md-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
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
