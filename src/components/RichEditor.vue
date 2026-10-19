<script setup lang="ts">
import { watch, ref, computed, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { RichTextStyle } from './extensions/richTextStyle'
import { observeImages } from '@/utils/richImage'

// 富文本编辑组件（Tiptap）：用于协议正文与关于我们等内容的录入。
// 受控：v-model 输出 HTML（经后端存储），外部值变化（如切换协议 / 异步加载）时回填编辑器。
const props = defineProps<{
  modelValue?: string
  placeholder?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', html: string): void }>()

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit.configure({
      // 协议/关于我们场景不需要 h1 之外的超大标题，保留 h2/h3 即可
      heading: { levels: [2, 3] },
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Image,
    RichTextStyle,
  ],
  onUpdate: ({ editor }) => emit('update:modelValue', editor.getHTML()),
})

// 外部值变化（非用户输入）时回填，避免光标跳动 / 死循环
watch(
  () => props.modelValue,
  (v) => {
    if (editor.value && v !== editor.value.getHTML()) {
      editor.value.commands.setContent(v || '', false)
    }
  }
)

function setLink() {
  if (!editor.value) return
  const prev = (editor.value.getAttributes('link').href as string | undefined) || ''
  const url = window.prompt('请输入链接地址', prev || 'https://')
  if (url === null) return
  if (url.trim() === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
}

function addImage() {
  if (!editor.value) return
  const url = window.prompt('请输入图片地址（URL）')
  if (url && url.trim()) {
    editor.value.chain().focus().setImage({ src: url.trim() }).run()
  }
}

function clearFormat() {
  if (!editor.value) return
  editor.value
    .chain()
    .focus()
    .unsetAllMarks()
    .clearNodes()
    .run()
}

// ===== 字号 / 颜色 =====
const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px']
const currentFontSize = computed(() => editor.value?.getAttributes('textStyle').fontSize || '')
const currentColor = computed(() => editor.value?.getAttributes('textStyle').color || '#000000')
function onFontSize(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  editor.value?.chain().focus().setFontSize(v || null).run()
}
function onColor(e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (v) editor.value?.chain().focus().setFontColor(v).run()
}
function onClearColor() {
  editor.value?.chain().focus().setFontColor(null).run()
}

// ===== 编辑器内网图片解析 =====
const contentRef = ref<HTMLElement | null>(null)
let stopObserve: (() => void) | null = null
let tracked: string[] = []
watch(
  editor,
  (ed) => {
    if (ed && !stopObserve) {
      stopObserve = observeImages(contentRef.value, (url) => tracked.push(url))
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => {
  stopObserve?.()
  tracked.forEach((u) => URL.revokeObjectURL(u))
})
</script>

<template>
  <div class="rich-editor">
    <div v-if="editor" class="re-toolbar">
      <button type="button" title="撤销" @click="editor.chain().focus().undo().run()" :disabled="!editor.can().undo()">↶</button>
      <button type="button" title="重做" @click="editor.chain().focus().redo().run()" :disabled="!editor.can().redo()">↷</button>
      <span class="re-sep" />
      <button type="button" :class="{ active: editor.isActive('bold') }" title="加粗" @click="editor.chain().focus().toggleBold().run()"><b>B</b></button>
      <button type="button" :class="{ active: editor.isActive('italic') }" title="斜体" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
      <button type="button" :class="{ active: editor.isActive('strike') }" title="删除线" @click="editor.chain().focus().toggleStrike().run()"><s>S</s></button>
      <button type="button" :class="{ active: editor.isActive('code') }" title="行内代码" @click="editor.chain().focus().toggleCode().run()">&lt;/&gt;</button>
      <button type="button" title="清除格式" @click="clearFormat">⌫</button>
      <span class="re-sep" />
      <select class="re-select" :value="currentFontSize" title="字号" @change="onFontSize">
        <option value="">默认</option>
        <option v-for="s in fontSizes" :key="s" :value="s">{{ s.replace('px', '') }}</option>
      </select>
      <input type="color" class="re-color" title="文字颜色" :value="currentColor" @input="onColor" />
      <button type="button" title="清除颜色" @click="onClearColor">无色</button>
      <span class="re-sep" />
      <button type="button" :class="{ active: editor.isActive('heading', { level: 2 }) }" title="标题" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
      <button type="button" :class="{ active: editor.isActive('heading', { level: 3 }) }" title="小标题" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
      <span class="re-sep" />
      <button type="button" :class="{ active: editor.isActive('bulletList') }" title="无序列表" @click="editor.chain().focus().toggleBulletList().run()">• 列表</button>
      <button type="button" :class="{ active: editor.isActive('orderedList') }" title="有序列表" @click="editor.chain().focus().toggleOrderedList().run()">1. 列表</button>
      <button type="button" :class="{ active: editor.isActive('blockquote') }" title="引用" @click="editor.chain().focus().toggleBlockquote().run()">❝</button>
      <button type="button" :class="{ active: editor.isActive('codeBlock') }" title="代码块" @click="editor.chain().focus().toggleCodeBlock().run()">{ }</button>
      <button type="button" title="分割线" @click="editor.chain().focus().setHorizontalRule().run()">―</button>
      <span class="re-sep" />
      <button type="button" :class="{ active: editor.isActive('link') }" title="链接" @click="setLink">🔗</button>
      <button type="button" title="图片" @click="addImage">🖼</button>
    </div>
    <div ref="contentRef" class="re-content">
      <editor-content :editor="editor" />
    </div>
  </div>
</template>

<style scoped>
.rich-editor {
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  overflow: hidden;
}
.re-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.re-toolbar button {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #515a6e;
  font-size: 13px;
  cursor: pointer;
}
.re-toolbar button:hover:not(:disabled) {
  background: #fff;
  border-color: var(--el-border-color, #dcdfe6);
}
.re-toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.re-toolbar button.active {
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
  border-color: var(--el-color-primary-light-7, #b3d8ff);
}
.re-toolbar .re-select {
  height: 28px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  padding: 0 4px;
  cursor: pointer;
}
.re-toolbar .re-color {
  width: 30px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.re-sep {
  width: 1px;
  height: 18px;
  background: var(--el-border-color-lighter, #ebeef5);
  margin: 0 4px;
}
/* ProseMirror 编辑区 */
.re-content :deep(.ProseMirror) {
  min-height: 220px;
  max-height: 420px;
  overflow: auto;
  padding: 12px;
  line-height: 1.7;
  outline: none;
}
.re-content :deep(.ProseMirror p) {
  margin: 6px 0;
}
.re-content :deep(.ProseMirror img) {
  max-width: 100%;
  border-radius: 4px;
}
.re-content :deep(.ProseMirror:focus) {
  border: none;
}
</style>
