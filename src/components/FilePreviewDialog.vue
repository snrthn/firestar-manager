<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download, FullScreen, Link, Refresh } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { downloadFileUrl, fetchFileBlob, previewFileUrl } from '@/api/file'
import { saveBlobAs } from '@/utils/fileDownload'
import { copyText } from '@/utils/clipboard'
import type { FileVO } from '@/types/file'

const props = defineProps<{
  modelValue: boolean
  file: FileVO | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => {
    // 关闭即退出全屏（2026-10-16 虎哥要求）：否则下次打开还是全屏尺寸，
    // 且浏览器 ESC/点遮罩关闭时同样会经过这里，出口只有一个
    if (!v) fullscreen.value = false
    emit('update:modelValue', v)
  },
})

type PreviewMode = 'image' | 'pdf' | 'audio' | 'video' | 'unsupported'
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
// 与后端 ALLOWED_EXT 对齐：白名单内可预览的媒体格式 mp3/mp4；
// wav/m4a/webm/mov 一并支持——浏览器 media 标签原生可播，白名单将来放开时零改动
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'aac']
const VIDEO_EXTS = ['mp4', 'webm', 'mov']

const mode = ref<PreviewMode>('unsupported')
const src = ref('')
const loading = ref(false)
/** 全屏切换（PDF 在 720px 弹窗里字非常小，全屏后 iframe 撑满可视区） */
const fullscreen = ref(false)
/** 仅 blob 路径产生，关闭时必须 revoke，否则内存里挂着整份文件 */
let objectUrl = ''

const displayName = computed(
  () => props.file?.alias || props.file?.originalName || props.file?.fileName || '文件',
)

function extOf(name?: string | null) {
  const i = (name || '').lastIndexOf('.')
  return i < 0 ? '' : name!.slice(i + 1).toLowerCase()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load()
    else cleanup()
  },
)

async function load() {
  const file = props.file
  if (!file) return
  cleanup()

  // 先按扩展名判能不能预览：不支持的格式连请求都不发，直接引导下载
  const ext = extOf(file.originalName || file.fileName)
  if (ext === 'pdf') mode.value = 'pdf'
  else if (IMAGE_EXTS.includes(ext)) mode.value = 'image'
  else if (AUDIO_EXTS.includes(ext)) mode.value = 'audio'
  else if (VIDEO_EXTS.includes(ext)) mode.value = 'video'
  else {
    mode.value = 'unsupported'
    return
  }

  loading.value = true
  try {
    const url = await previewFileUrl(file.id)
    if (url.startsWith('http')) {
      // OSS 签名 URL：免鉴权直连，iframe/img/media 直接加载（跨域加载不拦，只有脚本读取才拦）
      src.value = url
    } else {
      // 本地模式：相对路径必须带 token 取字节，再转 objectURL 本地渲染（否则新页签 403）
      const blob = await fetchFileBlob(url)
      objectUrl = URL.createObjectURL(blob)
      src.value = objectUrl
    }
  } catch (e) {
    ElMessage.error((e as Error).message)
    visible.value = false
  } finally {
    loading.value = false
  }
}

function cleanup() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
  src.value = ''
}

/** 加载失败时重试（媒体/大文件网络抖动比图片更常见） */
function reload() {
  void load()
}

/** 弹窗内下载：OSS 直连 / 本地带 token 取 blob，都不起新页签 */
async function handleDownload() {
  const file = props.file
  if (!file) return
  try {
    const url = await downloadFileUrl(file.id)
    if (url.startsWith('http')) {
      const a = document.createElement('a')
      a.href = url
      a.download = displayName.value
      document.body.appendChild(a)
      a.click()
      a.remove()
      return
    }
    const blob = await fetchFileBlob(url)
    saveBlobAs(blob, displayName.value)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

/**
 * 复制资源链接（2026-10-16 虎哥要求：从列表操作列收敛到预览弹窗，操作频次不高）。
 * 语义：把该文件的资源地址写进剪贴板，贴到 IM / 工单 / 配置里用。
 * 复用 preview 接口签发地址——preview=1 只影响 Content-Disposition（inline），
 * 不累加下载数、不写下载记录（预览≠下载的口径）。
 * 两种存储模式的链接可用性不同，复制成功的提示必须说清（否则用户拿去打不开）：
 *   OSS 模式：后端返回免鉴权签名 URL，可直接打开，但限时有效；
 *   本地模式：raw 接口要 Bearer Token，链接需配合登录态 / 接口工具使用。
 * 与预览是否成功无关（unsupported 格式也能复制），故不放 v-if。
 */
async function handleCopyLink() {
  const file = props.file
  if (!file) return
  try {
    const url = await previewFileUrl(file.id)
    let absolute: string
    let hint: string
    if (url.startsWith('http')) {
      absolute = url
      hint = 'OSS 签名地址（限时有效）已复制'
    } else {
      // 本地模式：后端签的是相对路径，补上前端 origin + /api 代理前缀才是完整可访问地址
      const base = import.meta.env.VITE_API_BASE || '/api'
      absolute = `${window.location.origin}${base}${url}`
      hint = '链接已复制（本地模式接口需 Bearer Token 访问）'
    }
    const ok = await copyText(absolute)
    if (ok) {
      ElMessage.success(hint)
    } else {
      ElMessageBox.alert(absolute, '复制失败，请手动复制', { type: 'warning' })
    }
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`预览 - ${displayName}`"
    width="720px"
    :fullscreen="fullscreen"
    append-to-body
  >
    <!-- is-media：PDF/视频给稳定最小高度（加载中容器不塌）；
         图片/音频 hug 内容——全局 min-height 会让宽扁图片下方一片留白（2026-10-16 虎哥实测） -->
    <div
      v-loading="loading"
      class="preview-body"
      :class="{ 'is-full': fullscreen, 'is-media': mode === 'pdf' || mode === 'video' }"
    >
      <img v-if="mode === 'image' && src" :src="src" :alt="displayName" class="preview-img" />
      <iframe v-else-if="mode === 'pdf' && src" :src="src" class="preview-pdf" frameborder="0" />
      <audio v-else-if="mode === 'audio' && src" :src="src" class="preview-media preview-audio" controls preload="auto" />
      <video v-else-if="mode === 'video' && src" :src="src" class="preview-media preview-media--video" controls preload="metadata" playsinline />
      <el-empty v-else-if="!loading" description="该格式不支持在线预览（图片 / PDF / 音频 / 视频），请下载后查看">
        <el-button type="primary" :icon="Download" @click="handleDownload">下载文件</el-button>
      </el-empty>
    </div>
    <template #footer>
      <el-button v-if="mode !== 'unsupported'" :icon="Refresh" @click="reload">重新加载</el-button>
      <el-button :icon="Download" @click="handleDownload">下载</el-button>
      <el-button :icon="Link" @click="handleCopyLink">复制链接</el-button>
      <!-- 全屏按钮放底部（2026-10-16 虎哥要求：header 图标位置和 × 挨太近容易误点），
           与关闭按钮同排、在其前面；文字常驻，全屏态显示「退出全屏」 -->
      <el-button :icon="FullScreen" @click="fullscreen = !fullscreen">
        {{ fullscreen ? '退出全屏' : '全屏' }}
      </el-button>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* ⚠️ 全屏样式不要用 :deep(.el-dialog.is-fullscreen)：dialog 是 append-to-body
   teleport 到 body 的，scoped 编译出的后代选择器永远匹配不到它的根元素，
   规则会静默失效（2026-10-16 实锤——上一版这么写的，「全屏高度撑开」从未生效）。
   正解：给自己渲染的 .preview-body 绑动态 class，scoped 直接命中。 */
.preview-body.is-full {
  height: calc(100vh - 125px); /* 全屏 dialog 的 header+footer+body padding 近似值 */
  background: #000; /* 播放器黑底：contain 下 16:9 视频在超宽屏两侧留黑边而非白边 */
}
.preview-body.is-full .preview-pdf,
.preview-body.is-full .preview-media--video {
  width: 100%;
  height: 100%;
  max-height: none; /* 清掉默认 60vh——不显式清的话 height 会被 max-height 锁死 */
}
.preview-body.is-full .preview-img {
  max-width: 100%;
  max-height: 100%;
}
.preview-body {
  display: flex;
  align-items: center;
  justify-content: center;
}
/* PDF/视频保留稳定最小高度（加载中容器不塌陷）；图片/音频 hug 内容。
   2026-10-16 虎哥实测：min-height 320px 挂在全局时，宽扁图片（如发票扫描件）
   被 flex 居中后下方一片留白——故只给需要占位的媒体模式 */
.preview-body.is-media {
  min-height: 320px;
}
.preview-img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}
.preview-pdf {
  width: 100%;
  height: 60vh;
  border: none;
}
.preview-media {
  width: 100%;
  max-height: 60vh;
  outline: none;
}
/* 音频控件固定宽度居中（2026-10-16 虎哥要求）：width:100% 拉通整个弹窗，
   一段 50s 的录音条横跨 720px 显得空且不好看；480px 居中展示，max-width 防窄屏溢出 */
.preview-audio {
  width: 480px;
  max-width: 100%;
  display: block;
  margin: 0 auto;
}
</style>
