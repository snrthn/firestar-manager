<script setup lang="ts">
/**
 * AI 回答的 Markdown 渲染出口（懒加载，不进首屏）。
 *
 * 选型：x-markdown-vue（Element Plus X 官方拆分出的独立渲染包），
 * 与 Element Plus X 的 BubbleList 同源，支持 GFM / Shiki 代码高亮 / LaTeX / 流式增量。
 *
 * ⚠️ 安全基线（与 utils/markdown.ts 的知识库管线同一红线）：
 *   AI 输出属于**不可信文本**（prompt injection 可以让模型吐出 <img onerror>），
 *   因此 allowHtml 必须保持 false，并显式打开 sanitize（该包 sanitize 默认是 false，
 *   忘了写就等于裸奔）。
 *
 * ⚠️ enableMermaid 默认关闭：mermaid 运行时 3MB+，财务后台的 AI 回答基本用不到；
 *   如确实需要图表，改成 true 即可（代价是抽屉首次打开会多拉一个巨大的 chunk）。
 */
import { MarkdownRendererAsync } from 'x-markdown-vue'
import 'x-markdown-vue/style'
import 'katex/dist/katex.min.css'
import { computed } from 'vue'
import { cleanAiMarkdown } from '@/utils/aiMarkdown'

const props = withDefaults(
  defineProps<{
    content?: string
    /** 流式输出中的雾化打字效果（结束后关掉可省一次重绘） */
    animate?: boolean
  }>(),
  { content: '', animate: false },
)
/**
 * 渲染边界兜底清洗：后端已剥离 DSML 伪调用块，但历史脏数据与运行期换模型仍可能漏出，
 * 这里按行过滤。原始 props.content 不动（复制/下载由调用方按同一规则清洗）。
 */
const cleaned = computed(() => cleanAiMarkdown(props.content))
</script>

<template>
  <!-- MarkdownRendererAsync 内部是 async setup：必须包一层 Suspense，
       否则每次挂载都会报「setup returned a promise but no async boundary」警告 -->
  <Suspense>
    <MarkdownRendererAsync
      class="ai-md"
      :markdown="cleaned"
      :allow-html="false"
      :sanitize="true"
      :enable-animate="animate"
      :enable-latex="true"
      :enable-gfm="true"
      :enable-breaks="true"
      :enable-shiki="true"
      :enable-mermaid="false"
      :show-code-block-header="true"
      :enable-code-line-number="false"
      :code-max-height="'360px'"
    />
  </Suspense>
</template>

<style>
/* 非 scoped：Markdown 节点由渲染器动态注入，scoped 命中不到 */
.ai-md {
  font-size: 14px;
  line-height: 1.7;
  color: #303133;
  word-break: break-word;
}
.ai-md .x-md-code-block,
.ai-md pre {
  margin: 8px 0;
  border-radius: 8px;
  overflow: hidden;
}
/* 代码块横向溢出修复：库样式 .x-md-renderer pre:has(.x-md-code-header-wrapper--sticky)
   {overflow:unset} 优先级高于上面的 .ai-md pre，且 :has 命中 sticky header 代码块后
   把横向滚动关掉——长代码行（如带缩进的路径/命令）不换行，直接撑破气泡宽度，
   视觉上「飘」到 AI 面板外、盖住相邻表格。这里按同样的 :has 结构提权，把
   代码块限制在气泡宽度内并恢复横向滚动；外层 overflow 保持 visible 以保留
   sticky header，仅对代码体 pre 做 overflow-x:auto。 */
.ai-md .x-md-code-block,
.ai-md .x-md-code-block:has(.x-md-code-header-wrapper--sticky) {
  max-width: 100%;
  box-sizing: border-box;
}
.ai-md .x-md-renderer pre:has(.x-md-code-header-wrapper--sticky),
.ai-md .x-md-code-body pre,
.ai-md pre {
  overflow-x: auto !important;
  overflow-y: hidden;
  max-width: 100%;
}
/* sticky 代码块头是「长文档阅读」场景的功能，在气泡消息列表里会脱离代码块
   粘到滚动容器顶部，视觉上飘到面板上方盖住别的消息/表格。AI 回答气泡不需要，
   强制回 static。外层 hidden 也让它失去可滚动祖先，双保险。 */
.ai-md .x-md-code-header-wrapper--sticky {
  position: static !important;
}
.ai-md {
  max-width: 100%;
  overflow-x: hidden;
}
.ai-md p {
  margin: 0 0 8px;
}
.ai-md p:last-child {
  margin-bottom: 0;
}
.ai-md ul,
.ai-md ol {
  margin: 6px 0;
  padding-left: 20px;
}
.ai-md table {
  border-collapse: collapse;
  font-size: 13px;
  margin: 8px 0;
}
.ai-md th,
.ai-md td {
  border: 1px solid #ebeef5;
  padding: 5px 8px;
}
.ai-md th {
  background: #f5f7fa;
}
.ai-md blockquote {
  margin: 8px 0;
  padding: 4px 10px;
  border-left: 3px solid #dcdfe6;
  color: #606266;
  background: #fafafa;
}
</style>
