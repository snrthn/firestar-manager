<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ChatDotRound, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { streamChat, fetchLatestDraft } from '@/api/ai'
import request from '@/api/request'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** 降级提示：true 时气泡显示兜底说明而非 AI 正文 */
  fallback?: boolean
  typing?: boolean
}

/** 草稿预览结构（与后端 ShipmentDraftPreview 对齐） */
interface DraftLine {
  itemId: number
  itemName: string
  specModel?: string
  unit?: string
  quantity?: number
  shippedQty?: number
  remaining?: number
  shipmentQty: number
  unitPrice?: number
  lineAmount?: number
}
interface DraftPreview {
  projectId: number
  projectNo?: string
  projectName?: string
  customerName?: string
  contractAmount?: number
  lines: DraftLine[]
  totalAmount?: number
  errors?: string[]
  warnings?: string[]
}

const visible = ref(false)
const messages = ref<ChatMessage[]>([])
const input = ref('')
const streaming = ref(false)
const scrollRef = ref<HTMLElement | null>(null)

// ===== 阶段二·草稿态 =====
const convId = ref<number | null>(null)
const draft = ref<DraftPreview | null>(null)
const draftReceived = ref(false)
const creating = ref(false)

const SUGGESTIONS = [
  '帮我查一下正在进行的项目',
  '最近一笔出库单的状态',
  '本月的应收回款情况',
  '解释一下项目毛利怎么算',
]

function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function openDrawer() {
  visible.value = true
  if (messages.value.length === 0) {
    messages.value.push({
      role: 'assistant',
      content:
        '您好，我是火星财务 AI 助手。可以基于您的权限，为您查询项目、出库、退货、应收等业务数据，也能解答财务口径问题。敏感字段已自动脱敏。',
    })
  }
  scrollToBottom()
}

async function send(text?: string) {
  const content = (text ?? input.value).trim()
  if (!content || streaming.value) return
  input.value = ''
  messages.value.push({ role: 'user', content })
  const assistantIdx = messages.value.length
  messages.value.push({ role: 'assistant', content: '', typing: true })
  // 关键：push 之后必须从响应式数组里取回 proxy 引用再修改，
  // 否则改的是 push 前的原始对象，Vue 追踪不到变更 → 表现为“最后一刻一把吐出”。
  const assistant = messages.value[assistantIdx]
  streaming.value = true
  // 重置本轮回话的草稿态
  draft.value = null
  draftReceived.value = false
  scrollToBottom()

  try {
    await streamChat(content, {
      onToken: (t) => {
        assistant.typing = false
        if (assistant.content === '' && t) {
          // 首个有效 token 剥掉前导空白/换行，避免气泡首行被空出
          assistant.content = t.replace(/^\s+/, '')
        } else {
          assistant.content += t
        }
        scrollToBottom()
      },
      onMeta: (id) => {
        convId.value = id
      },
      onDraft: (payload) => {
        draftReceived.value = true
        try {
          draft.value = JSON.parse(payload.resultJson) as DraftPreview
        } catch {
          draft.value = null
        }
      },
      onDone: () => {
        assistant.typing = false
        streaming.value = false
        scrollToBottom()
        // Coze 模式：流内不经过草稿结果，按会话拉取最新草稿
        if (!draftReceived.value && convId.value != null) {
          fetchLatestDraft(convId.value)
            .then((rj) => {
              if (rj) {
                try {
                  draft.value = JSON.parse(rj) as DraftPreview
                } catch {
                  draft.value = null
                }
              }
            })
            .catch(() => {
              /* 忽略拉取失败 */
            })
        }
      },
      onError: (msg) => {
        assistant.typing = false
        assistant.content = msg || '对话出错，请稍后重试。'
        streaming.value = false
        ElMessage.error(msg || '对话出错')
      },
      onFallback: (mode, reason) => {
        assistant.typing = false
        assistant.fallback = true
        assistant.content =
          mode === 'search'
            ? 'AI 服务暂时不可用，已为您切换到普通搜索模式：您可在对应业务页使用筛选与关键字查询。'
            : `AI 服务暂时不可用（${reason || '未知原因'}），请稍后重试。`
        streaming.value = false
        scrollToBottom()
      },
    })
  } catch (e: any) {
    assistant.typing = false
    assistant.content = e?.message || '对话出错，请稍后重试。'
    streaming.value = false
  }
}

/** 确认创建：调原 POST /shipment（原 shipment:create 权限 + 原 Flowable 审批），仅落 DRAFT */
async function confirmDraft() {
  if (!draft.value) return
  creating.value = true
  try {
    const payload = {
      projectId: draft.value.projectId,
      lines: (draft.value.lines || []).map((l: DraftLine) => ({
        itemId: l.itemId,
        shipmentQty: l.shipmentQty,
      })),
    }
    const res = await request.post('/shipment', payload)
    const id = res?.data?.data
    ElMessage.success(`已生成发货单草稿（ID ${id}），请到发货管理页提交审批`)
    draft.value = null
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败，请检查权限或数据')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <!-- 悬浮入口：右下角固定按钮 -->
  <button class="ai-fab" :title="'AI 助手'" @click="openDrawer">
    <el-icon :size="22"><ChatDotRound /></el-icon>
    <span class="ai-fab__label">AI 助手</span>
  </button>

  <el-drawer
    v-model="visible"
    title="AI 助手"
    direction="rtl"
    size="600px"
    :append-to-body="true"
    class="ai-drawer"
  >
    <div class="ai-chat">
      <div ref="scrollRef" class="ai-chat__scroll">
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="ai-msg"
          :class="m.role === 'user' ? 'ai-msg--user' : 'ai-msg--bot'"
        >
          <div class="ai-msg__bubble" :class="{ 'ai-msg__bubble--fallback': m.fallback }">
            <span v-if="m.typing" class="ai-typing">
              <el-icon class="is-loading"><Loading /></el-icon> 思考中…
            </span>
            <span v-else style="white-space: pre-wrap; word-break: break-word">{{ m.content }}</span>
          </div>
        </div>

        <!-- 阶段二·草稿态：「待确认表单」卡片 -->
        <div v-if="draft" class="ai-draft-card">
          <div class="ai-draft-card__head">
            <span class="ai-draft-card__title">📝 发货单草稿（待确认）</span>
          </div>
          <div class="ai-draft-card__proj">
            {{ draft.projectName || '—' }}
            <span class="ai-draft-card__sub">（{{ draft.projectNo }}）</span>
            <span class="ai-draft-card__sub"> · 客户：{{ draft.customerName || '—' }}</span>
          </div>
          <table class="ai-draft-card__table" v-if="draft.lines && draft.lines.length">
            <thead>
              <tr>
                <th>货物</th>
                <th>规格</th>
                <th>数量</th>
                <th>单价</th>
                <th>金额</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, i) in draft.lines" :key="i">
                <td>{{ l.itemName }}</td>
                <td>{{ l.specModel || '—' }}</td>
                <td>{{ l.shipmentQty }} {{ l.unit || '' }}</td>
                <td>{{ l.unitPrice != null ? l.unitPrice : '—' }}</td>
                <td>{{ l.lineAmount != null ? l.lineAmount : '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="ai-draft-card__total">合计：{{ draft.totalAmount != null ? draft.totalAmount : '—' }}</div>
          <div v-if="draft.errors && draft.errors.length" class="ai-draft-card__err">
            <div v-for="(e, i) in draft.errors" :key="'e' + i">⚠️ {{ e }}</div>
          </div>
          <div v-if="draft.warnings && draft.warnings.length" class="ai-draft-card__warn">
            <div v-for="(w, i) in draft.warnings" :key="'w' + i">ℹ️ {{ w }}</div>
          </div>
          <div class="ai-draft-card__actions">
            <el-button
              type="primary"
              size="small"
              :loading="creating"
              :disabled="(draft.errors && draft.errors.length > 0) || streaming"
              @click="confirmDraft"
            >
              确认创建（存草稿）
            </el-button>
            <el-button size="small" :disabled="creating" @click="draft = null">取消</el-button>
          </div>
        </div>
      </div>

      <!-- 建议问题 -->
      <div v-if="messages.length <= 1 && !streaming" class="ai-suggest">
        <button
          v-for="s in SUGGESTIONS"
          :key="s"
          class="ai-suggest__item"
          @click="send(s)"
        >
          {{ s }}
        </button>
      </div>

      <div class="ai-input">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          resize="none"
          :disabled="streaming"
          placeholder="输入您的问题，回车发送（Shift+Enter 换行）"
          @keydown.enter.exact.prevent="send()"
        />
        <el-button
          type="primary"
          :loading="streaming"
          :disabled="!input.trim()"
          @click="send()"
        >
          发送
        </el-button>
      </div>
      <div class="ai-disclaimer">AI 基于您的账号权限读取业务数据，敏感字段已脱敏。回答仅供参考。</div>
    </div>
  </el-drawer>
</template>

<style scoped>
.ai-fab {
  position: fixed;
  right: 20px;
  bottom: 32px;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #409eff, #6a5acd);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(64, 158, 255, 0.4);
  transition: transform 0.15s ease;
}
.ai-fab:hover {
  transform: translateY(-2px);
}
.ai-fab__label {
  line-height: 1;
}

.ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.ai-chat__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 4px;
}
.ai-msg {
  display: flex;
  margin-bottom: 12px;
}
.ai-msg--user {
  justify-content: flex-end;
}
.ai-msg--bot {
  justify-content: flex-start;
}
.ai-msg__bubble {
  max-width: 82%;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  background: #f4f4f5;
  color: #303133;
}
.ai-msg--user .ai-msg__bubble {
  background: #409eff;
  color: #fff;
}
.ai-msg__bubble--fallback {
  background: #fdf6ec;
  color: #e6a23c;
}
.ai-typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #909399;
}

/* 阶段二·草稿态卡片 */
.ai-draft-card {
  margin: 4px 0 12px;
  padding: 12px;
  border: 1px solid #409eff;
  border-radius: 10px;
  background: #f5f9ff;
  font-size: 13px;
  color: #303133;
}
.ai-draft-card__head {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}
.ai-draft-card__title {
  font-weight: 600;
  color: #409eff;
}
.ai-draft-card__proj {
  margin-bottom: 8px;
  line-height: 1.6;
}
.ai-draft-card__sub {
  color: #909399;
  font-weight: 400;
}
.ai-draft-card__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.ai-draft-card__table th,
.ai-draft-card__table td {
  border: 1px solid #ebeef5;
  padding: 4px 6px;
  text-align: left;
}
.ai-draft-card__table th {
  background: #ecf5ff;
  color: #606266;
}
.ai-draft-card__total {
  margin-top: 8px;
  text-align: right;
  font-weight: 600;
}
.ai-draft-card__err {
  margin-top: 8px;
  padding: 6px 8px;
  background: #fef0f0;
  border-radius: 6px;
  color: #f56c6c;
  line-height: 1.6;
}
.ai-draft-card__warn {
  margin-top: 6px;
  padding: 6px 8px;
  background: #fdf6ec;
  border-radius: 6px;
  color: #e6a23c;
  line-height: 1.6;
}
.ai-draft-card__actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.ai-suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0 8px;
}
.ai-suggest__item {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  background: #fff;
  color: #606266;
  border-radius: 14px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}
.ai-suggest__item:hover {
  border-color: #409eff;
  color: #409eff;
}

.ai-input {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.ai-disclaimer {
  margin-top: 6px;
  font-size: 11px;
  color: #c0c4cc;
  text-align: center;
}
</style>
