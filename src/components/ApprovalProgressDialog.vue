<script setup lang="ts">
import { ref, watch } from 'vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { projectTimeline } from '@/api/project'
import type { TimelineNodeVO } from '@/types/project'
import { formatDateTime } from '@/utils/datetime'

// 审批进度弹窗（立项列表 / 审批中心「我发起的」共用，2026-10-22 抽组件）。
// 卡片化时间线：EP 默认「文字行 inline 宽 + 灰框 block 背景宽出 padding」的视觉错位
// （虎哥截图实锤「左右间距不一致」）——节点内容整体包进卡片后，
// 时间戳 / 卡片 / 卡片内部文字三者走同一条左基线（EP wrapper 的 padding-left 内）。
const props = defineProps<{
  projectId: number | null
  projectName?: string
}>()

const visible = defineModel<boolean>('visible', { required: true })

const loading = ref(false)
const timeline = ref<TimelineNodeVO[]>([])

const load = async (projectId: number) => {
  loading.value = true
  try {
    timeline.value = await projectTimeline(projectId)
  } catch (e) {
    ElMessage.error((e as Error).message)
    timeline.value = []
  } finally {
    loading.value = false
  }
}

// 弹窗打开 / 切换单据时加载；projectId 为 null（无流程实例）不请求
watch(
  () => [visible.value, props.projectId] as const,
  ([open, id]) => {
    if (open && id != null) load(id)
  },
)

// 「流程结束」合成节点（后端 appendEndNode 追加）：handlerNames[0] 放结论文案，
// 据此定标签色——审批通过 success / 审批未通过 danger
const endedPassed = (n: TimelineNodeVO) => n.handlerNames?.[0] === '审批通过'

// 时间线节点 → 展示样式：进行中高亮（primary），已驳回 danger，已通过 success
const nodeType = (n: TimelineNodeVO) => {
  if (n.result === 'ACTIVE') return 'primary'
  if (n.result === 'ENDED') return endedPassed(n) ? 'success' : 'danger'
  if (n.result === 'REJECTED') return 'danger'
  return 'success'
}

// 卡片色调：ACTIVE 主色浅底 / REJECTED 红色浅底 / DONE 白底 / ENDED 按结论取色
const cardTone = (n: TimelineNodeVO) => {
  if (n.result === 'ACTIVE') return 'active'
  if (n.result === 'REJECTED') return 'rejected'
  if (n.result === 'ENDED') return endedPassed(n) ? 'done' : 'rejected'
  return 'done'
}
</script>

<template>
  <el-dialog v-model="visible" :title="`审批进度 - ${projectName ?? ''}`" width="640px">
    <div v-loading="loading" class="timeline-wrap">
      <el-timeline v-if="timeline.length">
        <el-timeline-item
          v-for="(n, i) in timeline"
          :key="`${n.nodeId}-${n.startTime}-${i}`"
          :type="nodeType(n)"
          :hollow="n.result === 'ACTIVE'"
          :timestamp="formatDateTime(n.endTime || n.startTime)"
          placement="top"
        >
          <div class="tl-card" :class="`tl-card--${cardTone(n)}`">
            <div class="tl-card-head">
              <span class="tl-node-name">{{ n.nodeName }}</span>
              <el-tag v-if="n.result === 'ACTIVE'" type="primary" size="small" effect="dark">待审批</el-tag>
              <el-tag v-else-if="n.result === 'ENDED'" :type="endedPassed(n) ? 'success' : 'danger'" size="small">
                {{ endedPassed(n) ? '已结束' : '已驳回' }}
              </el-tag>
              <el-tag v-else-if="n.result === 'REJECTED'" type="danger" size="small">已驳回</el-tag>
              <el-tag v-else type="success" size="small">已通过</el-tag>
            </div>
            <div v-if="n.result !== 'ENDED'" class="tl-meta">
              处理人：
              <template v-if="n.handlerNames && n.handlerNames.length">
                <el-tag v-for="(h, hi) in n.handlerNames" :key="hi" size="small" class="tl-tag">{{ h }}</el-tag>
              </template>
              <span v-else>—</span>
            </div>
            <div v-if="n.comment" class="tl-comment">
              <template v-if="n.result === 'ENDED'">{{ n.comment }}</template>
              <template v-else>审批意见：{{ n.comment }}</template>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无审批记录（未提交审批或流程未开始）" :image-size="60" />
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.timeline-wrap {
  max-height: 420px;
  overflow-y: auto;
  /* 左侧间距：轴线/圆点离弹窗内容左缘留气口（虎哥 2026-10-22 截图实锤贴边） */
  padding: 10px 8px 4px;
}
/* EP 默认 .el-timeline { padding-left: 50px }（devtools 实锤）——叠上 wrap padding 后
   轴线离弹窗缘一大条空白（虎哥 2026-10-22「太丑」）。清掉，左缘层级归 wrap 管：
   弹窗缘 → 8px → 轴线(node left:4px) → 24px → 卡片(wrapper padding-left:28px) */
:deep(.el-timeline) {
  padding-left: 0;
}
/* 条目间距：卡片底部 → 下一条时间戳（EP 默认 20px，调疏） */
:deep(.el-timeline-item) {
  padding-bottom: 16px;
}
/* 时间戳与卡片的间距（EP 默认 is-top margin-bottom 8px） */
:deep(.el-timeline-item__timestamp.is-top) {
  margin-bottom: 10px;
  padding-top: 2px;
}
/* 卡片化：时间戳与卡片左缘天然对齐（同在 EP wrapper 的 padding-left 内），
   卡片内部节点名 / 处理人 / 审批意见全部走同一左缘 */
.tl-card {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  /* 虎哥 2026-10-22：卡片 padding 加大 */
  padding: 14px 16px;
}
/* 待审批：主色浅底高亮（虎哥：当前待审批一条高亮） */
.tl-card--active {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}
/* 已驳回：红色浅底 */
.tl-card--rejected {
  border-color: var(--el-color-danger-light-8);
  background: var(--el-color-danger-light-9);
}
/* 节点名 + 状态标签：两端对齐，标签右对齐到卡片右缘（虎哥 2026-10-22） */
.tl-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tl-node-name {
  font-size: 14px;
  font-weight: 600;
}
.tl-meta {
  margin-top: 6px;
  font-size: 13px;
  color: #606266;
}
/* 处理人标签（会签候选集合横排） */
.tl-tag {
  margin: 2px;
}
/* 审批意见：卡内第二区块，顶部虚线分隔——不再用通栏灰框（间距错位感来源） */
.tl-comment {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #ebeef5;
  font-size: 13px;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
