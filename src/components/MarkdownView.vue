<script setup lang="ts">
/**
 * 统一 Markdown 渲染出口：知识库正文预览 + AI 助手回答共用这一条管线。
 *
 * 只负责「MD → 安全 HTML」这一层；展示层直接复用 RichView，因此自动继承：
 *   - DOMPurify 二次净化（RichView 自身还有一道）；
 *   - 内网 /api/files/<id>/raw 图片带 JWT 拉 blob（resolveImagesIn）；
 *   - 点击图片 ElImageViewer 放大。
 * 复用而非复制：上面三件事在 RichView 里已经跑稳，再写一份只会制造两套口径。
 *
 * ⚠️ 编辑器的实时预览不走这里（md-editor-v3 自带预览），但页面提供「预览」tab
 *    调本组件，保证 `![alt](file:123)` 在预览态能正确显示签名 URL 图片。
 */
import { computed } from 'vue'
import RichView from '@/components/RichView.vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  /** Markdown 正文（不可信文本：用户录入或模型输出） */
  content?: string | null
}>()

const html = computed(() => renderMarkdown(props.content ?? ''))
</script>

<template>
  <!-- class 由 RichView 的 inheritAttrs:false + 手动 v-bind 落到内部内容 div 上 -->
  <RichView :html="html" class="kb-md-view" />
</template>

<!-- 非 scoped：RichView 内部是 v-html 注入节点，scoped 属性不会落到这些节点上 -->
<style>
.kb-md-view {
  line-height: 1.75;
  color: #303133;
  word-break: break-word;
  font-size: 14px;
}
.kb-md-view h1,
.kb-md-view h2,
.kb-md-view h3,
.kb-md-view h4,
.kb-md-view h5,
.kb-md-view h6 {
  margin: 18px 0 10px;
  line-height: 1.4;
  font-weight: 600;
  scroll-margin-top: 16px;
}
.kb-md-view h1 {
  font-size: 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 8px;
}
.kb-md-view h2 {
  font-size: 20px;
}
.kb-md-view h3 {
  font-size: 16px;
}
.kb-md-view p {
  margin: 8px 0;
}
.kb-md-view ul,
.kb-md-view ol {
  padding-left: 24px;
  margin: 8px 0;
}
.kb-md-view blockquote {
  margin: 10px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--el-border-color);
  color: #909399;
}
.kb-md-view code {
  background: var(--el-fill-color-light);
  border-radius: 3px;
  padding: 1px 5px;
  font-family: Consolas, Monaco, monospace;
  font-size: 0.92em;
}
.kb-md-view pre {
  background: #f6f8fa;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 10px 0;
}
.kb-md-view pre code {
  background: none;
  padding: 0;
}
.kb-md-view table {
  border-collapse: collapse;
  margin: 10px 0;
  width: 100%;
}
.kb-md-view th,
.kb-md-view td {
  border: 1px solid var(--el-border-color-lighter);
  padding: 6px 10px;
  text-align: left;
}
.kb-md-view th {
  background: var(--el-fill-color-light);
}
.kb-md-view a {
  color: var(--el-color-primary);
  text-decoration: underline;
}
</style>
