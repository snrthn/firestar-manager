<script setup lang="ts">
/**
 * 思考过程折叠组件（自研，替换 vue-element-plus-x 的 Thinking）。
 *
 * 交互对齐成熟系统（DeepSeek R1 / Kimi / 云效）：
 *   - 思考中：标签「思考中…」带流光渐变动画 + 实时用时，内容区展开、流式文本自动滚到底；
 *   - 完成：自动折叠成「已深度思考（用时 N 秒）」，点击可展开回看，内容区灰字 + 左侧竖线；
 *   - 停止：显示「已停止思考」；历史回放（status 一直为 end）不显示用时。
 *
 * 设计取舍：不用现成 Thinking 组件，因为其默认样式是带边框的大色块（用户否掉），
 * 且无法做「流光 + 实时用时 + 完成自动折叠」的组合。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { ArrowDown, Loading, Star } from '@element-plus/icons-vue'
import { cleanAiMarkdown } from '@/utils/aiMarkdown'

const props = defineProps<{
  /** 思考文本（流式增量拼接） */
  content: string
  /** thinking=生成中 | end=完成 | cancel=被停止 | error/start=流异常或未开始（同 end 折叠） */
  status: 'thinking' | 'end' | 'cancel' | 'error' | 'start'
}>()

/** 展开状态：思考中默认展开（含历史回放以外的挂载场景）；完成后/回放默认折叠，用户可点开 */
const open = ref(props.status === 'thinking')
/** 用户是否手动点过折叠/展开（此后不再自动收起） */
let userToggled = false
/** 开始思考的时刻（首个思考 token 到达时记录），用于计算用时 */
let startedAt: number | null = null
/** 用时（秒）：思考中实时跳动，结束后冻结 */
const elapsedSec = ref(0)
let tickTimer: number | null = null

function stopTick() {
  if (tickTimer != null) {
    window.clearInterval(tickTimer)
    tickTimer = null
  }
}

function startTick() {
  stopTick()
  tickTimer = window.setInterval(() => {
    if (startedAt != null) elapsedSec.value = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
  }, 500)
}

const bodyRef = ref<HTMLElement | null>(null)

watch(
  () => props.content,
  (v, old) => {
    // 首个思考 token：起表 + 启动计时
    if (old === '' && v !== '' && props.status === 'thinking' && startedAt == null) {
      startedAt = Date.now()
      startTick()
    }
    // 思考中跟随流式滚动到底部
    if (props.status === 'thinking' && open.value) {
      void nextTick(() => {
        const el = bodyRef.value
        if (el) el.scrollTop = el.scrollHeight
      })
    }
  },
)

watch(
  () => props.status,
  (s, old) => {
    if (old === 'thinking' && s !== 'thinking') {
      // 结束：冻结用时 + 自动折叠（用户手动操作过则尊重用户选择）
      stopTick()
      if (startedAt != null) elapsedSec.value = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
      if (!userToggled) open.value = false
    }
  },
)

onUnmounted(stopTick)

function toggle() {
  userToggled = true
  open.value = !open.value
}

const label = computed(() => {
  if (props.status === 'thinking') return '思考中…'
  if (props.status === 'error') return '思考中断'
  if (props.status === 'cancel') return '已停止思考'
  return '已深度思考'
})

/**
 * 思考文本同样兜底清洗 DSML 噪声：DeepSeek 会把伪工具调用写进 reasoning 通道，
 * 该通道不走正文的 DsmlTokenFilter，历史脏数据回放时曾原样露出 <|DSML|> 标签。
 * computed 保证流式增长过程中每帧都重新清洗。
 */
const cleanedContent = computed(() => cleanAiMarkdown(props.content))
</script>

<template>
  <div class="ai-think" :class="[`is-${status}`, { 'is-open': open }]">
    <button class="ai-think__hd" type="button" @click="toggle">
      <el-icon v-if="status === 'thinking'" class="ai-think__spin is-loading"><Loading /></el-icon>
      <el-icon v-else class="ai-think__ico"><Star /></el-icon>
      <span class="ai-think__label">
        <span class="ai-think__label-text">{{ label }}</span>
        <span v-if="status === 'thinking' && elapsedSec" class="ai-think__sec">（{{ elapsedSec }} 秒）</span>
        <span v-else-if="status !== 'thinking' && elapsedSec" class="ai-think__sec">（用时 {{ elapsedSec }} 秒）</span>
      </span>
      <el-icon class="ai-think__chev"><ArrowDown /></el-icon>
    </button>
    <div v-show="open && cleanedContent" class="ai-think__body">
      <div ref="bodyRef" class="ai-think__text">{{ cleanedContent }}</div>
    </div>
  </div>
</template>

<style scoped>
.ai-think {
  margin: 2px 0 10px;
  font-size: 13px;
}
.ai-think__hd {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #909399;
  font-size: 13px;
  line-height: 22px;
}
.ai-think__hd:hover .ai-think__label-text {
  color: #606266;
}
.ai-think__spin {
  color: #409eff;
}
.ai-think__ico {
  color: #c0c4cc;
  font-size: 12px;
}
.ai-think__label {
  display: inline-flex;
  align-items: baseline;
}
/* 「思考中…」流光：渐变背景 + 位移动画（对齐 DeepSeek R1 标签效果） */
.is-thinking .ai-think__label-text {
  background: linear-gradient(90deg, #909399 0%, #409eff 45%, #909399 90%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: ai-think-shimmer 1.6s linear infinite;
}
@keyframes ai-think-shimmer {
  0% {
    background-position: 0% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
.ai-think__sec {
  color: #c0c4cc;
  font-size: 12px;
}
.ai-think__chev {
  margin-left: 2px;
  color: #c0c4cc;
  font-size: 12px;
  transition: transform 0.18s ease;
}
.is-open .ai-think__chev {
  transform: rotate(0deg);
}
.ai-think:not(.is-open) .ai-think__chev {
  transform: rotate(-90deg);
}
/* 内容区：灰字 + 左侧竖线 + 高度上限滚动（不再是大色块） */
.ai-think__body {
  margin-top: 6px;
  padding-left: 10px;
  border-left: 2px solid var(--el-border-color-lighter, #e4e7ed);
}
.ai-think__text {
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: #8a919f;
  font-size: 12px;
  line-height: 1.8;
}
</style>
