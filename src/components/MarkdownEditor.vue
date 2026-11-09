<script setup lang="ts">
/**
 * 知识库 MD 编辑器封装（md-editor-v3，原生 Vue3，spike 结论见设计文档 §3.3 修订）
 *
 * 为什么不是 Cherry / Vditor：
 *   - cherry-markdown 55.7MB（含 mermaid/echarts），且 WYSIWYG 只覆盖图片与表格，
 *     不是全文所见即所得；Vue3 需手写容器适配层；
 *   - vditor 23.6MB，全文 WYSIWYG 最完整，但同样非 Vue3 原生、无 AI 流式渲染；
 *   - md-editor-v3 605KB、Vue3 原生组件、自带预览/目录/上传钩子，且 sanitize
 *     钩子可接 DOMPurify。P0 用「工具栏 + 实时预览」降低写作门槛，
 *     后续若确需全文 WYSIWYG，只需替换本文件，页面与渲染管线不动。
 *
 * 上传契约（V206 classify）：图片/附件直传 /files/upload，bizType=kb_doc、
 * bizId=docId（新建时无 id 则不传），**不带 classify** → 后端一律 ATTACHMENT。
 * 正文只回写 ![name](file:<fileId>)；保存时由 collectFileRefs 交给后端建立
 * sys_kb_attachment 的 INLINE 关系（新建文档也能补关联）。
 *
 * ✅ 设计文档 §25（撤销 §24 的 A 方案）：编辑器**默认双栏预览必须保留**。
 *    顶部「预览」tab 改为复用同一个渲染器 MdPreview，因此两边对 mermaid 图表
 *    （流程图/时序图/甘特图/类图/状态图/饼图/关系图/旅程图）表现完全一致，
 *    不再是「系统预览一套 markdown-it、默认预览另一套」。
 *    mermaid 运行时由 @/utils/kbMarkdown 注入本地实例（默认 unpkg CDN 不可达），
 *    本组件只需 import 该模块触发 config，并去掉 noMermaid 开关。
 *
 * 工具栏「保存」按钮：md-editor-v3 的 save 只往外抛 onSave，不自带任何保存动作，
 *    不监听就是「点了没反应」。这里转成 save 事件交给页面，与顶部「保存草稿」
 *    共用同一个 save()，避免两套口径 / 误以为已保存。
 */
import { MdEditor } from 'md-editor-v3'
import type { UploadImgCallBackParam } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { uploadFile } from '@/api/file'
// 副作用：注入本地 mermaid 实例（跳过 unpkg CDN），并共享 sanitize / noKatex 口径
import { kbSanitize, KB_NO_KATEX } from '@/utils/kbMarkdown'

const props = defineProps<{
  modelValue: string
  /** 已保存文档的 id；新建为空（保存后由后端按正文 file: 引用回填附件关系） */
  docId?: number | null
  /** 撑满父容器（知识库页两栏等高时使用）；不传则保持固定 460px，兼容其它场景 */
  fill?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** 工具栏「保存」按钮 → 页面真实保存（与顶部「保存草稿」共用同一逻辑） */
  save: []
}>()

/** onSave 是 prop 型回调（(v: string, html: Promise<string>) => void），
 *  与 :onUploadImg 同样用 :onSave 传入；不消费 html，避免引入第二套渲染结果。 */
function handleSave() {
  emit('save')
}

/** sanitize 与顶部「预览」tab 共用 kbSanitize，保证两端安全口径一致 */
async function handleUploadImg(files: File[], callback: (urls: UploadImgCallBackParam) => void) {
  const uploaded: Array<{ url: string; alt: string; title: string }> = []
  for (const f of files) {
    const form = new FormData()
    form.append('file', f)
    form.append('bizType', 'kb_doc')
    if (props.docId) form.append('bizId', String(props.docId))
    // 关键：不带 classify，服务端按 V206 契约一律落 ATTACHMENT
    try {
      const vo = await uploadFile(form)
      uploaded.push({ url: `file:${vo.id}`, alt: f.name, title: f.name })
    } catch {
      ElMessage.error(`图片上传失败：${f.name}`)
    }
  }
  callback(uploaded)
}
</script>

<template>
  <div class="kb-md-editor" :class="{ 'is-fill': props.fill }">
    <MdEditor
      :model-value="modelValue"
      :onUploadImg="handleUploadImg"
      :onSave="handleSave"
      :sanitize="kbSanitize"
      :noKatex="KB_NO_KATEX"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.kb-md-editor {
  width: 100%;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  overflow: hidden;
}
/* 默认：固定高度，避免弹窗等场景撑出视口 */
.kb-md-editor :deep(.md-editor) {
  height: 460px;
}
/* fill：由父级 flex 分配高度（父需给 flex:1 + min-height:0），编辑器内部自行滚动。
   选择器多一个 .is-fill，优先级高于上面的固定高度，无需 !important。 */
.kb-md-editor.is-fill {
  display: flex;
}
.kb-md-editor.is-fill :deep(.md-editor) {
  height: auto;
  flex: 1;
  min-height: 0;
}
</style>
