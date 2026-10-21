<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import ElMessage from 'element-plus/es/components/message/index.mjs'

// 头像裁切弹窗（2026-10-21 需求②）：选图后在本弹窗内拖拽/缩放裁切，
// 正方形 1:1（虎哥拍板），确认后 canvas 导出 256×256 PNG blob 交还调用方。
// 交互边界：el-upload 只做「选文件 + 类型/大小校验」，上传动作由裁切确认后触发，
// 保证落库的头像一定是裁切产物（避免绕过弹窗直传原图）。
const props = defineProps<{
  modelValue: boolean
  file: File | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', blob: Blob): void
}>()

const imgRef = ref<HTMLImageElement>()
const objectUrl = ref('')
const saving = ref(false)
let cropper: Cropper | null = null

function close() {
  emit('update:modelValue', false)
}

function destroyCropper() {
  cropper?.destroy()
  cropper = null
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = ''
  }
}

// 在 dialog 打开动画结束后初始化：el-dialog 内容 lazy 渲染，watch+nextTick
// 时机太早（DOM 未插入），@opened 时内容必然已挂载，imgRef 可用。
async function onOpened() {
  if (!props.file || !imgRef.value) return
  objectUrl.value = URL.createObjectURL(props.file)
  await nextTick()
  cropper?.destroy()
  cropper = new Cropper(imgRef.value, {
    aspectRatio: 1, // 正方形 1:1
    viewMode: 1, // 限制裁切框不超出图片边界
    autoCropArea: 0.9, // 初始裁切区占图片 90%
    background: false, // 不渲染棋盘格底纹（头像场景干净些）
    movable: true,
    zoomable: true,
    rotatable: false,
    scalable: false,
  })
}

async function confirm() {
  if (!cropper) return
  saving.value = true
  try {
    const canvas = cropper.getCroppedCanvas({
      width: 256,
      height: 256,
      imageSmoothingQuality: 'high',
    })
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    )
    if (!blob) {
      ElMessage.error('裁切导出失败，请重试')
      return
    }
    emit('confirm', blob)
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(destroyCropper)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="裁剪头像"
    width="480px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
    @opened="onOpened"
    @closed="destroyCropper"
  >
    <div class="ac-body">
      <img ref="imgRef" class="ac-img" :src="objectUrl" alt="待裁剪图片" />
    </div>
    <div class="ac-tip">拖动调整位置，滚轮缩放，裁切结果为正方形头像</div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="saving" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* cropperjs 要求容器有确定高度；图片 max 尺寸约束由 cropper 内部接管 */
.ac-body {
  height: 360px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
  overflow: hidden;
}
.ac-img {
  max-width: 100%;
  display: block;
}
.ac-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}
</style>
