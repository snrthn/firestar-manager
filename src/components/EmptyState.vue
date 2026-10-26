<script setup lang="ts">
/**
 * 统一空数据兜底组件（2026-10-26 引入）。
 *
 * 背景：全站 el-table 列表页的空状态此前不一致——
 *   有的页吃默认「暂无数据」纯文字（发货/发票/收款/项目/文件/日志/系统管理等），
 *   有的页用 <el-empty> 插画（退货列表）；下拉/表格对不齐、观感割裂。
 * 本组件把「带图标」的风格收敛到一处，所有列表页的 #empty 插槽统一包它，
 * 后续要调插画尺寸/样式只动这一处。
 *
 * 用法：
 *   <el-table ...>
 *     ...el-table-column...
 *     <template #empty><EmptyState description="暂无发货记录" /></template>
 *   </el-table>
 *
 * 默认 description=暂无数据、image-size=80（与退货列表页对照基准一致）；
 * 默认插槽可放操作按钮（如「新建」），一般列表页不需要。
 */
withDefaults(
  defineProps<{
    /** 兜底文案（保留各页原有语义，如「暂无退货记录」「暂无部署版本」） */
    description?: string
    /** 插画尺寸，默认 80 与对照基准一致 */
    imageSize?: number
  }>(),
  {
    description: '暂无数据',
    imageSize: 80,
  },
)
</script>

<template>
  <el-empty :image-size="imageSize" :description="description">
    <template v-if="$slots.default" #default>
      <slot />
    </template>
  </el-empty>
</template>
