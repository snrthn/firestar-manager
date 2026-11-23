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
 *    顶部「预览」tab 也复用同一个渲染器 MdPreview（MarkdownView.vue 已于
 *    2026-11-23 从 x-markdown-vue 切回，虎哥拍板：原生渲染效果为准，x-markdown-vue
 *    的代码块/表格渲染观感不佳）。因此编辑器内置预览、页面「预览」tab 两端对
 *    mermaid 图表（流程图/时序图/甘特图/类图/状态图/饼图/关系图/旅程图）与
 *    代码块/表格表现完全一致，不再有「原生预览 vs 自定义预览」割裂。
 *    mermaid 运行时由 @/utils/kbMarkdown 注入本地实例（默认 unpkg CDN 不可达），
 *    本组件只需 import 该模块触发 config。
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
  /* 异步组件（defineAsyncComponent chunk）与 md-editor 内部初始化完成前，外层空 div 高度为 0
     → 页面整体塌陷跳动。给外层保底高度，加载完成后仍由父级 flex 链接管 */
  min-height: 120px;
  /* 创建局部层叠上下文：md-editor-v3 代码块头是 position:sticky + z-index:10000，
     不隔离就会盖过 Teleport 到 body、z-index:2100 的 AI 面板（2026-11-21 截图实锤）。
     isolation 把内部 10000 关进本组件，对外部只按本容器（auto）参与比较，
     于是吸顶功能保留、面板照样盖在其上——比强制 position:static 砍掉吸顶更正确。 */
  isolation: isolate;
}
/* 默认：固定高度，避免弹窗等场景撑出视口 */
.kb-md-editor :deep(.md-editor) {
  height: 460px;
}
/* fill：由父级 flex 分配高度（父需给 flex:1 + min-height:0），编辑器内部自行滚动。
   选择器多一个 .is-fill，优先级高于上面的固定高度，无需 !important。 */
.kb-md-editor.is-fill {
  display: flex;
  /* 编辑器（md-editor-v3 内部工具栏/正文区初始化完成前）高度塌陷的保底：
     加载完成前至少站住一屏可用高度，加载后 flex:1 继续接管实际分配 */
  min-height: 480px;
}
.kb-md-editor.is-fill :deep(.md-editor) {
  height: auto;
  flex: 1;
  min-height: 0;
}

/* ===== 代码块横向限宽（2026-11-21 修复） =====
   md-editor-v3 7.1.0 的代码块头是 position:sticky + z-index:10000，吸顶是它的正常功能，
   必须保留。层级逃逸已由容器 isolation:isolate 隔离解决（见上），这里只处理横向溢出：
   代码块本体限宽，长行在块内横向滚动，不撑破预览区。不再强制 position:static。 */
.kb-md-editor :deep(.md-editor-preview .md-editor-code) {
  max-width: 100%;
  box-sizing: border-box;
}
.kb-md-editor :deep(.md-editor-preview .md-editor-code pre) {
  max-width: 100%;
  overflow-x: auto;
}
</style>

<style>
/* ===== 全屏层级修正（2026-11-23 虎哥截图实锤） =====
 * 上面 .kb-md-editor 的 isolation:isolate 把全屏编辑器（.md-editor-fullscreen，
 * position:fixed + z-index:10000）关进了本容器的层叠上下文——对外整个子树只按
 * z-index:auto 参与，被 header.app-header（position:relative + z-index:20）压住，
 * 表现为全屏后工具栏被顶栏挡住。
 * 修法：全屏时把本容器抬到全站最高层（isolation 保留，代码块吸顶防逃逸不回退）。
 * 4000 > header(20) / AI 面板(2100) / AppTabs 固定层(3000)。
 * 非 scoped：:has 里套深层组件类，scoped 编译会错位。 */
.kb-md-editor:has(.md-editor-fullscreen) {
  position: relative;
  z-index: 4000;
}
</style>
