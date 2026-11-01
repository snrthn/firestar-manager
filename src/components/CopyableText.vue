<script setup lang="ts">
// 可复制文本：编号/批号等高频复制字段统一挂载复制入口。
// 复用 @/utils/clipboard 的 copyText（已处理 http 内网降级）；空值不渲染图标、不可点。
import { computed } from 'vue'
import { CopyDocument } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { copyText } from '@/utils/clipboard'

const props = withDefaults(
  defineProps<{
    value?: string | number | null
    /** 空值占位，默认 '—' */
    placeholder?: string
  }>(),
  { placeholder: '—' },
)

const text = computed(() => (props.value == null ? '' : String(props.value)))
const display = computed(() => (text.value === '' ? props.placeholder : text.value))
const disabled = computed(() => text.value === '')

async function handleCopy() {
  if (disabled.value) return
  const ok = await copyText(text.value)
  if (ok) ElMessage.success('已复制')
  else ElMessageBox.alert(text.value, '复制失败，请手动复制', { type: 'warning' })
}
</script>

<template>
  <span class="copyable-text">
    <span class="copyable-text__value">{{ display }}</span>
    <el-icon
      v-if="!disabled"
      class="copyable-text__icon"
      title="复制"
      @click.stop="handleCopy"
    >
      <CopyDocument />
    </el-icon>
  </span>
</template>

<style scoped>
.copyable-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}
.copyable-text__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copyable-text__icon {
  cursor: pointer;
  color: var(--el-color-primary);
  opacity: 0.5;
  transition: opacity 0.15s;
  flex: none;
}
.copyable-text__icon:hover {
  opacity: 1;
}
</style>
