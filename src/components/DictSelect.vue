<script setup lang="ts">
import { ref, watch } from 'vue'
import { loadDictOptions, type DictOption } from '@/composables/useDict'

/**
 * 字典下拉统一封装（2026-10-16 收口）。
 *
 * 背景：useDict 样板（menu.vue）落地后，业务页仍大量手写枚举 el-option
 * （典型：7 个系统页的「状态」下拉写死 ENABLED/DISABLED，与 common_status
 * 字典双轨维护——字典页停用某项对业务页毫无影响）。本组件是「字典已有但
 * 业务页未消费」问题的标准解法：
 *   - 选项来自 loadDictOptions（只消费 ENABLED、sort_no 升序、会话级缓存）；
 *   - 业务页不再写死选项，字典维护页改完即生效（invalidateDictCache 后）。
 *
 * 用法：
 *   <DictSelect v-model="query.status" type-code="common_status" placeholder="全部" />
 *
 * 注意：仅当字典 value 与库中真实域值一致时才允许切换（useDict 约定 4）；
 * 字典与数据不符的（如 permission_action vs READ/WRITE/EXECUTE）必须先修字典。
 *
 * ⚠️ modelValue 必须声明为可选（2026-10-22 虎哥截图实锤）：
 * 业务页 v-model 绑定的表单字段初始值普遍是 undefined（如 project/list.vue
 * 的 contractStatus）。Vue 3.5 validateProp 对「必填 prop + 值 == null」
 * 不走豁免直接类型校验（`if (value == null && !required) return`），
 * 必填 String 收到 undefined 会刷
 * 「Invalid prop: type check failed for prop "modelValue".
 *  Expected String with value "undefined"」警告。改可选后
 * undefined/null 均豁免；透传给 ElSelect 时其 modelValue 为
 * [Array,String,Number,Boolean,Object] 非必填，同样不 warn。
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    typeCode: string
    placeholder?: string
    clearable?: boolean
    disabled?: boolean
  }>(),
  { placeholder: '请选择', clearable: true, disabled: false },
)
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const options = ref<DictOption[]>([])
watch(
  () => props.typeCode,
  async (code) => {
    options.value = code ? await loadDictOptions(code) : []
  },
  { immediate: true },
)
</script>

<template>
  <el-select
    :model-value="modelValue"
    :placeholder="placeholder"
    :clearable="clearable"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', ($event ?? '') as string)"
    @change="emit('change', ($event ?? '') as string)"
  >
    <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value" />
  </el-select>
</template>
