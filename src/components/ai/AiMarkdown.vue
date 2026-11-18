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

withDefaults(
  defineProps<{
    content?: string
    /** 流式输出中的雾化打字效果（结束后关掉可省一次重绘） */
    animate?: boolean
  }>(),
  { content: '', animate: false },
)
</script>

<template>
  <!-- MarkdownRendererAsync 内部是 async setup：必须包一层 Suspense，
       否则每次挂载都会报「setup returned a promise but no async boundary」警告 -->
  <Suspense>
    <MarkdownRendererAsync
      class="ai-md"
      :markdown="content"
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
