<script setup lang="ts">
/**
 * 通用「导入」入口按钮 + 内嵌 ImportDrawer。
 * 各业务页只需一行：<ImportButton import-key="project_opening" label="导入期初项目" />
 * 导入成功后 emit imported，页面可据此刷新列表。
 */
import { computed, ref } from 'vue'
import { Upload } from '@element-plus/icons-vue'
import ImportDrawer from './ImportDrawer.vue'

const props = withDefaults(defineProps<{
  /** 固定导入类型（对应后端 Handler key + 权限码 import:{key}） */
  importKey: string
  /** 按钮文案 */
  label?: string
  /** 导入类型展示名（抽屉标题/类型标签用；不传则取 label 去掉「导入」前缀） */
  name?: string
  /** 权限码（默认用 import:{key}） */
  perm?: string
}>(), {
  label: '导入',
  name: undefined,
  perm: undefined
})

const emit = defineEmits<{
  (e: 'imported'): void
}>()

const visible = ref(false)
const effectivePerm = props.perm || `import:${props.importKey}`
/** 类型展示名：优先 name，其次 label 去掉「导入」前缀（如「导入期初用户」→「期初用户」） */
const typeName = computed(() => props.name || props.label.replace(/^导入/, ''))
</script>

<template>
  <el-button type="warning" :icon="Upload" v-has-perm="effectivePerm" @click="visible = true">{{ label }}</el-button>
  <ImportDrawer
    v-model:visible="visible"
    :fixed-key="importKey"
    :fixed-name="typeName"
    @imported="emit('imported')"
  />
</template>
