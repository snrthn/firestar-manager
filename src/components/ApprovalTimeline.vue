<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import type { TimelineNodeVO } from '@/types/project'
import { formatDateTime } from '@/utils/datetime'

// 审批时间线纯展示组件：
// 只负责渲染，数据由调用方加载后传入 —— 这样同一份时间线既能装在独立弹窗里
// （审批中心「我发起的」），也能内联进业务详情弹窗（虎哥拍板：进度合并进详情，
// 不弹中弹——弹中弹在 EP 2.14 的 dialog 多根 Fragment 下样式/层级都不稳）。
const props = defineProps<{
  /** 时间线节点（后端 ACT_HI_TASKINST 单源，含合成的流程结束节点） */
  timeline: TimelineNodeVO[]
  /** 无数据时的空态文案 */
  emptyText?: string
  /**
   * 超过多少条时默认收起，0 = 不折叠（默认）。
   * 2026-10-24 虎哥：审批进度超过 3 条就先收起，点一下能展开看全部——
   * 反复驳回重提的单子会堆成十几条，铺开会把详情内容顶到看不见。
   */
  collapseAfter?: number
}>()

// ===== 折叠（收起时展示**最新** collapseAfter 条：审批人关心的是「现在卡在第几步」，
//       起点那一两步已经不重要；展开后可再收起）=====
const expanded = ref(false)
const collapsible = computed(() => (props.collapseAfter ?? 0) > 0 && props.timeline.length > (props.collapseAfter ?? 0))
const hiddenCount = computed(() => props.timeline.length - (props.collapseAfter ?? 0))
const visibleNodes = computed(() =>
  collapsible.value && !expanded.value ? props.timeline.slice(-(props.collapseAfter ?? 0)) : props.timeline,
)
// 换单据时回到收起态（同一弹窗会被不同单据复用）
watch(
  () => props.timeline,
  () => {
    expanded.value = false
  },
)

// 「流程结束」合成节点（后端 appendEndNode 追加）：handlerNames[0] 放结论文案，
// 据此定标签色——审批通过 success / 审批未通过 danger
const endedPassed = (n: TimelineNodeVO) => n.handlerNames?.[0] === '审批通过'

// 时间线节点 → 展示样式：进行中高亮（primary），已驳回 danger，已撤回 info，已通过 success
const nodeType = (n: TimelineNodeVO) => {
  if (n.result === 'ACTIVE') return 'primary'
  if (n.result === 'ENDED') return endedPassed(n) ? 'success' : 'danger'
  if (n.result === 'REJECTED') return 'danger'
  if (n.result === 'WITHDRAWN') return 'info'
  return 'success'
}

// 卡片色调：ACTIVE 主色浅底 / REJECTED 红色浅底 / WITHDRAWN 灰色浅底 / DONE 白底 / ENDED 按结论取色
const cardTone = (n: TimelineNodeVO) => {
  if (n.result === 'ACTIVE') return 'active'
  if (n.result === 'REJECTED') return 'rejected'
  if (n.result === 'WITHDRAWN') return 'withdrawn'
  if (n.result === 'ENDED') return endedPassed(n) ? 'done' : 'rejected'
  return 'done'
}
</script>

<template>
  <div class="timeline-wrap">
    <el-timeline v-if="props.timeline.length">
      <!-- 折叠条（2026-10-24 虎哥：提示合并为一行、两边对齐——左边展开/收起按钮，
           右边「以下为最近 N 条」说明；展开后右侧说明消失，只留「收起」） -->
      <div v-if="collapsible" class="tl-fold-bar">
        <el-button
          link
          type="primary"
          size="small"
          :icon="expanded ? ArrowUp : ArrowDown"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收起' : `展开查看全部 ${props.timeline.length} 条（已折叠 ${hiddenCount} 条）` }}
        </el-button>
        <span v-if="!expanded" class="tl-fold-hint">以下为最近 {{ props.collapseAfter }} 条审批动态</span>
      </div>
      <el-timeline-item
        v-for="(n, i) in visibleNodes"
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
            <el-tag v-else-if="n.result === 'WITHDRAWN'" type="info" size="small">已撤回</el-tag>
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
            <template v-if="n.result === 'ENDED' || n.result === 'WITHDRAWN'">{{ n.comment }}</template>
            <template v-else>审批意见：{{ n.comment }}</template>
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else :description="props.emptyText || '暂无审批记录'" :image-size="60" />
  </div>
</template>

<style scoped>
.timeline-wrap {
  /* 不做内部限高滚动（2026-10-24 虎哥）：时间线一律由所在详情弹窗的 body 统一滚动，
     内嵌滚动条会出现双滚动条且太宽。此前 420px 限高是独立进度弹窗时代的遗产 */
  padding: 0px;
}
/* EP 默认 .el-timeline { padding-left: 50px }（devtools 实锤）——叠上 wrap padding 后
   轴线离容器缘一大条空白（虎哥「太丑」）。清掉，左缘层级归 wrap 管 */
:deep(.el-timeline) {
  padding-left: 0;
}
:deep(.el-timeline-item) {
  padding-bottom: 0x;
}
:deep(.el-timeline-item__timestamp.is-top) {
  margin-bottom: 10px;
  padding-top: 2px;
}
/* 折叠条：一行两端对齐（虎哥 2026-10-24）——展开按钮靠左、最近条数说明靠右 */
.tl-fold-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.tl-fold-hint {
  font-size: 12px;
  position: relative;
  top: 3px;
  color: #909399;
}
.tl-card {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  padding: 14px 16px;
}
.tl-card--active {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}
.tl-card--rejected {
  border-color: var(--el-color-danger-light-8);
  background: var(--el-color-danger-light-9);
}
/* WITHDRAWN（申请人撤回，2026-10-25 新增）：灰色浅底——既不是驳回（红）也不是通过（绿） */
.tl-card--withdrawn {
  border-color: var(--el-color-info-light-8);
  background: var(--el-color-info-light-9);
}
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
.tl-tag {
  margin: 2px;
}
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
