<!--
  审批处理面板（表单区，无按钮）。
  2026-10-24 虎哥二次反馈：取消/提交按钮上移到弹窗 footer（与其余弹窗按钮位一致），
  本组件只渲染「审批结果 + 审批意见」两行表单。

  状态共享：useTaskApproval 是模块级单例（同一时刻只有一个审批弹窗活动），
  本组件的 v-model 与父级 footer 按钮读到的是同一份 action/saving；
  提交逻辑（submit）由父级 footer 的 handleApprovalConfirm 调用，
  见 ProjectDetailDialog / ShipmentDetailDialog。

  用法：挂在详情弹窗 body 内容区末尾，父级先渲染 `<h4 class="block-title">当前审批</h4>`
  （复用父级分区标题样式，避免第三处复制）。

  布局：grid 两列「76px label 列 + 控件列」，行间距 14px——两个 label 左对齐成一列，
  控件全部从同一竖线起步（虎哥 2026-10-24：间隔/对齐要规整）。
-->
<script setup lang="ts">
import { watch } from 'vue'
import type { TaskInfoVO } from '@/types/approval'
import { useTaskApproval, isShipmentTask } from '@/composables/useTaskApproval'

const props = defineProps<{ task: TaskInfoVO }>()

const { action, comment, rejectTarget, reset } = useTaskApproval()

// 切换任务时清空上一单的输入（同一弹窗会被不同单据复用）
watch(
  () => props.task?.taskId,
  () => reset(),
  { immediate: true },
)

const needTarget = () => !isShipmentTask(props.task) && action.value === 'reject'
</script>

<template>
  <div class="approval-panel">
    <div class="approval-grid">
      <!-- 第一行：审批结果 + 退回节点（仅立项多节点驳回时出现） -->
      <span class="approval-label">审批结果</span>
      <div class="approval-result">
        <el-radio-group v-model="action">
          <el-radio value="approve">通过</el-radio>
          <el-radio value="reject">驳回</el-radio>
        </el-radio-group>
        <el-select
          v-if="needTarget()"
          v-model="rejectTarget"
          placeholder="请选择退回节点"
          class="approval-target"
        >
          <el-option v-for="n in task.rejectTargets || []" :key="n.nodeId" :label="n.nodeName" :value="n.nodeId" />
        </el-select>
      </div>

      <!-- 第二行：审批意见（驳回必填，通过选填；placeholder 随结果切换提示口径）。
           label 顶部对齐 textarea 首行（align-self:start + 32px 行高 ≈ 控件第一行中心） -->
      <span class="approval-label approval-label-top">审批意见</span>
      <el-input
        v-model="comment"
        type="textarea"
        :rows="3"
        maxlength="200"
        show-word-limit
        :placeholder="
          action === 'reject'
            ? '请填写驳回理由，将通知申请人（必填）'
            : '审批意见（选填，通过时也可留言）'
        "
      />
    </div>
  </div>
</template>

<style scoped>
/* 面板卡片：浅橙色系（虎哥 2026-10-24：与蓝色时间线卡片拉开层次，突出「这里是操作区」），
   用 EP warning 色阶变量，主题切换时自动跟随 */
.approval-panel {
  border: 1px solid var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
  border-radius: 6px;
  padding: 16px 20px;
}
/* grid 两列：label 定宽列 + 控件自适应列。行距 14px、列距 12px，
   两个 label 左对齐成一列，控件同一起步线（虎哥 2026-10-24：间隔布局要规整） */
.approval-grid {
  display: grid;
  grid-template-columns: 76px 1fr;
  row-gap: 14px;
  column-gap: 12px;
  align-items: center;
}
.approval-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
/* 审批意见行 label 与 textarea 首行对齐：textarea 有 5px 上内边距，
   32px 行高的文本中心（16px）与其首行中心基本重合 */
.approval-label-top {
  align-self: start;
  line-height: 32px;
}
.approval-result {
  display: flex;
  align-items: center;
  gap: 16px;
}
.approval-target {
  width: 200px;
}
</style>
