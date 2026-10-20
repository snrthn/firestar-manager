<script setup lang="ts">
import { watch, ref, computed, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { RichTextStyle } from './extensions/richTextStyle'
import { observeImages } from '@/utils/richImage'
import { uploadFile } from '@/api/file'
import ElMessage from 'element-plus/es/components/message/index.mjs'

// 富文本编辑组件（Tiptap）：用于协议正文与关于我们等内容的录入。
// 受控：v-model 输出 HTML（经后端存储），外部值变化（如切换协议 / 异步加载）时回填编辑器。
const props = defineProps<{
  modelValue?: string
  placeholder?: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', html: string): void }>()

// 图片扩展补 width/height 属性（渲染为 HTML width/height attr，2026-10-20 需求④）：
// 让插入后的图片可调尺寸——BubbleMenu 改的是这两个属性，不 extend 的话
// updateAttributes 写不进 schema，ProseMirror 会直接丢弃。
const SizeableImage = Image.extend({
  addAttributes() {
    return {
      // ⚠️ 必须展开父类属性（src/alt/title）——override 不带 parent 会整体替换掉
      // Image 默认属性定义，schema 里没有 src → setImage({src}) 静默丢弃 →
      // <img> 渲染成无 src 空图（节点存在、BubbleMenu 照弹、控制台零报错）。
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attributes: Record<string, any>) =>
          attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        renderHTML: (attributes: Record<string, any>) =>
          attributes.height ? { height: attributes.height } : {},
      },
    }
  },
})

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
    Underline,
    // 对齐只作用于段落/标题（行内节点没有对齐概念）
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    SizeableImage,
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

// ===== 链接弹窗（2026-10-20 需求③：浏览器原生 prompt → el-dialog）=====
const linkDialogVisible = ref(false)
const linkUrl = ref('')
function openLinkDialog() {
  if (!editor.value) return
  const prev = (editor.value.getAttributes('link').href as string | undefined) || ''
  linkUrl.value = prev || 'https://'
  linkDialogVisible.value = true
}
function confirmLink() {
  if (!editor.value) return
  const url = linkUrl.value.trim()
  if (url === '') {
    // 留空 = 取消链接（与原 prompt 版本语义一致）
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
  linkDialogVisible.value = false
}

// ===== 图片弹窗（需求③④：URL 插入 + 本地上传，替代原生 prompt）=====
// 交互按成熟系统惯例（Notion / 语雀 / 飞书）：上传与 URL 是互斥入口（Tab 切换），
// 不并存同一面板——两条提交语义不同（上传成功即插入 / URL 点插入才提交），
// 并存会产生「同时填了听谁的」歧义。
const imageDialogVisible = ref(false)
const imageTab = ref<'upload' | 'url'>('upload')
const imageUrl = ref('')
const uploading = ref(false)
function openImageDialog() {
  imageTab.value = 'upload'
  imageUrl.value = ''
  imageDialogVisible.value = true
}
function insertImageUrl() {
  const url = imageUrl.value.trim()
  if (!url) {
    ElMessage.warning('请输入图片地址')
    return
  }
  editor.value?.chain().focus().setImage({ src: url }).run()
  imageDialogVisible.value = false
}
/**
 * 本地上传（el-upload 自定义 http-request）：走系统文件接口存进文件管理，
 * 插入 /files/{id}/raw 相对路径——richImage.observeImages 会自动带 token
 * 拉 blob 渲染（本地存储模式 /raw 要鉴权，<img> 直连会 401）。
 */
async function onUploadImage(option: { file: File }) {
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', option.file)
    const vo = await uploadFile(fd)
    editor.value?.chain().focus().setImage({ src: `/files/${vo.id}/raw` }).run()
    imageDialogVisible.value = false
  } catch (e) {
    ElMessage.error((e as Error).message || '上传失败')
  } finally {
    uploading.value = false
  }
}

// BubbleMenu 仅在选中图片时显示（点空白 / 其它节点不弹）
function shouldShowImageBubble({ editor }: { editor: any }): boolean {
  return editor.isActive('image')
}

// ===== 图片尺寸气泡（需求④：选中图片后在小气泡里调宽度）=====
const IMG_WIDTHS = ['25%', '50%', '75%', '100%']
const currentImgWidth = computed(() => editor.value?.getAttributes('image').width || '')
function setImgWidth(w: string) {
  editor.value?.chain().focus().updateAttributes('image', { width: w || null, height: null }).run()
}

// ===== 表情（需求②）=====
const emojiVisible = ref(false)
const EMOJIS = [
  '😀', '😄', '😁', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍',
  '😘', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '😴', '🤯',
  '😭', '😤', '😱', '🤝', '👍', '👎', '👏', '🙏', '💪', '🔥',
  '✨', '🎉', '❤️', '💔', '💯', '⭐', '🚀', '⏰', '📌', '📎',
  '✅', '❌', '⚠️', '💡', '📧', '📁', '📝', '🔍',
]
function insertEmoji(e: string) {
  editor.value?.chain().focus().insertContent(e).run()
  emojiVisible.value = false
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
      <button type="button" :class="{ active: editor.isActive('underline') }" title="下划线" @click="editor.chain().focus().toggleUnderline().run()"><u>U</u></button>
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
      <button type="button" :class="{ active: editor.isActive({ textAlign: 'left' }) }" title="左对齐" @click="editor.chain().focus().setTextAlign('left').run()">左</button>
      <button type="button" :class="{ active: editor.isActive({ textAlign: 'center' }) }" title="居中" @click="editor.chain().focus().setTextAlign('center').run()">中</button>
      <button type="button" :class="{ active: editor.isActive({ textAlign: 'right' }) }" title="右对齐" @click="editor.chain().focus().setTextAlign('right').run()">右</button>
      <button type="button" :class="{ active: editor.isActive({ textAlign: 'justify' }) }" title="两端对齐" @click="editor.chain().focus().setTextAlign('justify').run()">两端</button>
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
      <button type="button" :class="{ active: editor.isActive('link') }" title="链接" @click="openLinkDialog">🔗</button>
      <button type="button" title="图片" @click="openImageDialog">🖼</button>
      <!-- 表情：popover 网格，点击即插入到光标处 -->
      <el-popover v-model:visible="emojiVisible" placement="bottom" :width="288" trigger="click">
        <template #reference>
          <button type="button" title="表情">😊</button>
        </template>
        <div class="re-emoji-grid">
          <button
            v-for="e in EMOJIS"
            :key="e"
            type="button"
            class="re-emoji-btn"
            :title="e"
            @click="insertEmoji(e)"
          >{{ e }}</button>
        </div>
      </el-popover>
    </div>

    <!-- 图片尺寸气泡：仅选中图片时出现（shouldShow 过滤），点空白不弹 -->
    <bubble-menu
      v-if="editor"
      class="re-bubble"
      :editor="editor"
      :options="{
        placement: 'top',
        offset: 8,
        shouldShow: shouldShowImageBubble,
      }"
    >
      <span class="re-bubble-label">宽度</span>
      <button
        v-for="w in IMG_WIDTHS"
        :key="w"
        type="button"
        :class="{ active: currentImgWidth === w }"
        @click="setImgWidth(w)"
      >{{ w }}</button>
      <button type="button" :class="{ active: currentImgWidth === '' }" title="恢复原始尺寸" @click="setImgWidth('')">原尺寸</button>
    </bubble-menu>

    <div ref="contentRef" class="re-content">
      <editor-content :editor="editor" />
    </div>

    <!-- 链接弹窗（需求③）-->
    <el-dialog v-model="linkDialogVisible" title="插入链接" width="440px" append-to-body>
      <el-input
        v-model="linkUrl"
        placeholder="https://..."
        clearable
        @keyup.enter="confirmLink"
      />
      <div class="re-dlg-tip">留空并确定 = 取消当前链接。</div>
      <template #footer>
        <el-button @click="linkDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmLink">确定</el-button>
      </template>
    </el-dialog>

    <!-- 图片弹窗（需求③④：本地上传 + URL 插入，Tab 互斥——成熟系统惯例）-->
    <el-dialog v-model="imageDialogVisible" title="插入图片" width="480px" append-to-body>
      <el-tabs v-model="imageTab" stretch>
        <el-tab-pane label="本地上传" name="upload">
          <el-upload
            drag
            accept="image/*"
            :show-file-list="false"
            :disabled="uploading"
            :http-request="onUploadImage"
          >
            <div class="re-upload-inner">
              <div class="re-upload-text">点击或拖拽图片到此处上传</div>
              <div class="re-upload-sub">存入系统文件管理，可跨内容复用</div>
            </div>
          </el-upload>
        </el-tab-pane>
        <el-tab-pane label="图片地址" name="url">
          <div class="re-dlg-url">
            <el-input v-model="imageUrl" placeholder="https://..." clearable @keyup.enter="insertImageUrl" />
            <el-button type="primary" @click="insertImageUrl">插入</el-button>
          </div>
          <div class="re-dlg-tip">填入外链图片地址（https:// 开头），点击插入。</div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
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
/* ===== 图片尺寸气泡（BubbleMenu，2026-10-20 需求④）===== */
.re-bubble {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: #fff;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}
.re-bubble-label {
  font-size: 12px;
  color: #909399;
  margin-right: 4px;
}
.re-bubble button {
  min-width: 30px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #515a6e;
  font-size: 12px;
  cursor: pointer;
}
.re-bubble button:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}
.re-bubble button.active {
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
  border-color: var(--el-color-primary-light-7, #b3d8ff);
}
/* ===== 表情网格（popover 内容）===== */
.re-emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}
.re-emoji-btn {
  border: none;
  background: transparent;
  font-size: 17px;
  line-height: 1;
  padding: 5px 0;
  border-radius: 4px;
  cursor: pointer;
}
.re-emoji-btn:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}
/* ===== 弹窗内部布局 ===== */
.re-dlg-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
.re-dlg-url {
  display: flex;
  gap: 8px;
  padding: 8px 0 4px;
}
.re-dlg-url .el-input {
  flex: 1;
}
.re-upload-inner {
  padding: 8px 0;
}
.re-upload-text {
  font-size: 13px;
  color: #515a6e;
}
.re-upload-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
/* 收紧 el-upload 拖拽区内边距（弹窗里默认太高）*/
:deep(.el-upload-dragger) {
  padding: 16px 0;
}
</style>
