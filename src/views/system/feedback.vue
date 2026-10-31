<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import EmptyState from '@/components/EmptyState.vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import {
  listMyFeedback,
  listReceivedFeedback,
  getFeedback,
  listFeedbackMessages,
  addFeedbackMessage,
  changeFeedbackStatus,
  createFeedback,
  listReceivers,
} from '@/api/feedback'
import { loadDictOptions, useDictLabels, type DictOption } from '@/composables/useDict'
import type {
  FeedbackDetail,
  FeedbackMessageRow,
  FeedbackRow,
  ReceiverOption,
} from '@/types/feedback'
import RichEditor from '@/components/RichEditor.vue'
import RichView from '@/components/RichView.vue'
import DictSelect from '@/components/DictSelect.vue'
import { formatDateTime } from '@/utils/datetime'

/**
 * 问题反馈页（隐藏菜单 /system/feedback，header 头像下拉入口，虎哥 2026-10-20 拍板跳页面）。
 * 双 Tab：我提交的 / 我接收的；抽屉详情 = 富文本正文 + 留言时间线 + 状态操作。
 * 状态走字典 feedback_status；实时事件（FEEDBACK_*）由 realtimeDispatch 弹提醒，
 * 在页内时由 SSE 回调刷新当前 Tab（见 window.__feedbackRefresh 钩子）。
 */

// ===== 字典 =====
const statusOptions = ref<DictOption[]>([])
const { label: statusLabel } = useDictLabels('feedback_status')
loadDictOptions('feedback_status').then((o) => (statusOptions.value = o))
// 问题类别（V34：新建与筛选都消费同一个字典）
const { label: categoryLabel } = useDictLabels('feedback_category')
const categoryOptions = ref<DictOption[]>([])
loadDictOptions('feedback_category').then((o) => (categoryOptions.value = o))

const statusTagType = ref<Record<string, 'warning' | 'primary' | 'success' | 'info'>>({})
loadDictOptions('feedback_status').then(() => {
  // style 值在 dict-data 表里，useDict 的 DictOption 不带 style——按 value 内置映射，
  // 与 V32 种子对齐（改字典请同步此处）
  statusTagType.value = {
    PENDING: 'warning',
    PROCESSING: 'primary',
    RESOLVED: 'success',
    CLOSED: 'info',
  }
})

// ===== 操作列隐藏：角色无 feedback:view 时整列收起（不再渲染空列/占位）=====
const userStore = useUserStore()
const opVisible = computed(() => userStore.hasAnyPerm(['feedback:view']))

// ===== 列表 =====
const activeTab = ref<'my' | 'received'>('my')
const query = reactive({ pageNum: 1, pageSize: 10, status: '', category: '' })
const rows = ref<FeedbackRow[]>([])
const total = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const params = { pageNum: query.pageNum, pageSize: query.pageSize, status: query.status || undefined }
    const page = activeTab.value === 'my' ? await listMyFeedback(params) : await listReceivedFeedback(params)
    rows.value = page.records || []
    total.value = Number(page.total || 0)
  } catch {
    ElMessage.error('加载反馈列表失败')
  } finally {
    loading.value = false
  }
}

function switchTab(tab: string) {
  activeTab.value = tab as 'my' | 'received'
  query.pageNum = 1
  query.status = ''
  query.category = ''
  load()
}

// ===== 通知跳转落位（2026-10-21 需求：从反馈类通知跳进来时自动切对应 Tab）=====
// 后端 linkUrl 按收件人与反馈的关系带 ?tab=my|received；挂载时读一次决定初始 Tab。
// watch 覆盖「已停留在本页、又点一条通知跳同一路由」的场景——vue-router 同路由
// 只更新 query 不重建组件，不监听的话 Tab 不会跟着变。
const route = useRoute()
function applyTabFromQuery(tab: unknown) {
  if (tab === 'received' || tab === 'my') switchTab(tab)
}

onMounted(() => {
  // 有 tab 参数时 switchTab 内部自带 load（且重置筛选），否则走默认 my 列表
  const q = route.query.tab
  if (q === 'received' || q === 'my') switchTab(q)
  else load()
})
watch(() => route.query.tab, applyTabFromQuery)

// ===== 详情抽屉 =====
const drawer = ref(false)
const detailLoading = ref(false)
const detail = ref<FeedbackDetail | null>(null)
const messages = ref<FeedbackMessageRow[]>([])
const messageInput = ref('')
const sending = ref(false)

async function openDetail(row: FeedbackRow) {
  drawer.value = true
  detailLoading.value = true
  try {
    detail.value = await getFeedback(row.id)
    messages.value = await listFeedbackMessages(row.id)
  } catch {
    ElMessage.error('加载反馈详情失败')
    drawer.value = false
  } finally {
    detailLoading.value = false
  }
}

async function sendMessage() {
  if (!detail.value || !messageInput.value.trim()) return
  sending.value = true
  try {
    await addFeedbackMessage(detail.value.id, messageInput.value)
    messageInput.value = ''
    messages.value = await listFeedbackMessages(detail.value.id)
    // 留言可能触发后端状态跃迁（PENDING → PROCESSING，见 FeedbackServiceImpl.addMessage：
    // 接收人首条留言即推进状态），且通知只发给对方、自己前端收不到 SSE 事件——
    // 必须重拉 detail 让抽屉的状态标签/操作按钮与后端同步，否则按旧状态渲染的
    // 按钮会踩后端状态机 400（典型：点「开始处理」→「不允许从 处理中 流转到 处理中」）。
    detail.value = await getFeedback(detail.value.id)
    load()
  } catch (e) {
    ElMessage.error(extractMsg(e) || '留言失败')
  } finally {
    sending.value = false
  }
}

/** 状态操作按钮：按当前状态与角色（创建人/接收人）给可选动作 */
function actions(): Array<{ target: string; label: string; type: 'primary' | 'success' | 'warning' }> {
  if (!detail.value) return []
  const d = detail.value
  const acts: Array<{ target: string; label: string; type: 'primary' | 'success' | 'warning' }> = []
  if (d.status === 'PENDING') {
    if (!d.isCreator) acts.push({ target: 'PROCESSING', label: '开始处理', type: 'primary' })
    acts.push({ target: 'CLOSED', label: '关闭', type: 'warning' })
  } else if (d.status === 'PROCESSING') {
    if (!d.isCreator) acts.push({ target: 'RESOLVED', label: '标记已解决', type: 'success' })
    if (d.isCreator) acts.push({ target: 'CLOSED', label: '关闭', type: 'warning' })
  } else if (d.status === 'RESOLVED') {
    if (d.isCreator) acts.push({ target: 'PROCESSING', label: '重新打开', type: 'warning' })
    if (!d.isCreator) acts.push({ target: 'CLOSED', label: '关闭', type: 'warning' })
  }
  return acts
}

async function doAction(target: string) {
  if (!detail.value) return
  try {
    await changeFeedbackStatus(detail.value.id, target)
    ElMessage.success('状态已更新')
    detail.value = await getFeedback(detail.value.id)
    load()
  } catch (e) {
    ElMessage.error(extractMsg(e) || '状态更新失败')
  }
}

function extractMsg(e: unknown): string {
  const resp = (e as { response?: { data?: { message?: string } } })?.response
  return resp?.data?.message || ''
}

// ===== 新建反馈 =====
const createVisible = ref(false)
const creating = ref(false)
const receivers = ref<ReceiverOption[]>([])
const createForm = reactive({
  title: '',
  content: '',
  receiverId: undefined as number | undefined,
  category: '',
})

async function openCreate() {
  createVisible.value = true
  createForm.title = ''
  createForm.content = ''
  createForm.receiverId = undefined
  // 默认选中字典 is_default 那一项（OTHER），没有则取第一项
  createForm.category =
    categoryOptions.value.length > 0 ? categoryOptions.value[0].value : ''
  if (receivers.value.length === 0) {
    try {
      receivers.value = await listReceivers()
    } catch {
      ElMessage.error('加载接收人列表失败')
    }
  }
}

async function submitCreate() {
  if (!createForm.title.trim()) return ElMessage.warning('请填写标题')
  if (!createForm.content.trim()) return ElMessage.warning('请填写问题描述')
  if (!createForm.receiverId) return ElMessage.warning('请选择接收人')
  creating.value = true
  try {
    await createFeedback({
      title: createForm.title,
      content: createForm.content,
      receiverId: createForm.receiverId,
      category: createForm.category || undefined,
    })
    ElMessage.success('反馈已提交')
    createVisible.value = false
    if (activeTab.value !== 'my') switchTab('my')
    else load()
  } catch (e) {
    ElMessage.error(extractMsg(e) || '提交失败')
  } finally {
    creating.value = false
  }
}

// ===== SSE 联动：realtimeDispatch 收到 FEEDBACK_* 事件时若本页挂载则刷新 =====
// 用 window 钩子避免引入全局事件总线（页内轻量做法，卸载时摘除）
;(window as unknown as Record<string, unknown>).__feedbackRefresh = () => {
  if (drawer.value && detail.value) {
    getFeedback(detail.value.id).then((d) => (detail.value = d))
    listFeedbackMessages(detail.value.id).then((m) => (messages.value = m))
  }
  load()
}
</script>

<template>
  <div class="feedback-page">
    <div class="toolbar">
      <el-tabs :model-value="activeTab" class="tabs" @tab-change="switchTab">
        <el-tab-pane label="我提交的" name="my" />
        <el-tab-pane label="我接收的" name="received" />
      </el-tabs>
      <div class="toolbar-right">
        <DictSelect
          v-model="query.category"
          type-code="feedback_category"
          placeholder="全部类别"
          class="filter-select"
          @change="((query.pageNum = 1), load())"
        />
        <DictSelect
          v-model="query.status"
          type-code="feedback_status"
          placeholder="全部状态"
          class="filter-select"
          @change="((query.pageNum = 1), load())"
        />
        <el-button type="primary" v-has-perm="'feedback:create'" @click="openCreate">新建反馈</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="id" label="#" width="70" />
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="问题类别" width="110" align="center">
        <template #default="{ row }">
          <el-tag type="info" effect="plain">{{ categoryLabel(row.category) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType[row.status] || 'primary'">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="center" v-if="opVisible">
        <template #default="{ row }">
          <el-button link type="primary" v-has-perm="'feedback:view'" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState description="暂无反馈记录" />
    </template>
    </el-table>

    <!-- 分页器：与全站同写法（.pagination-bar 已在 pages.css 全局；原自造 .pager 少写
         display:flex，导致 justify-content:flex-end 失效、分页条实际左对齐） -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="query.pageNum"
        v-model:page-size="query.pageSize"
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        background
        @current-change="load"
        @size-change="((query.pageNum = 1), load())"
      />
    </div>

    <!-- 详情抽屉 -->
    <el-drawer v-model="drawer" :title="detail ? `问题反馈 #${detail.id}` : '问题反馈'" size="640px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <h3 class="d-title">{{ detail.title }}</h3>
          <div class="d-meta">
            <el-tag :type="statusTagType[detail.status] || 'primary'">
              {{ statusLabel(detail.status) }}
            </el-tag>
            <el-tag v-if="detail.category" type="info" effect="plain">
              {{ categoryLabel(detail.category) }}
            </el-tag>
            <span class="d-meta-text">
              {{ detail.creator }} 提交 → 接收人 {{ detail.receiver }} · {{ formatDateTime(detail.createdAt) }}
            </span>
          </div>

          <RichView :html="detail.content" class="d-content" />

          <div v-if="actions().length" class="d-actions">
            <el-button
              v-for="a in actions()"
              :key="a.target"
              :type="a.type"
              size="small"
              @click="doAction(a.target)"
            >
              {{ a.label }}
            </el-button>
          </div>

          <div class="d-msg-title">沟通留言</div>
          <div class="msg-list">
            <div v-if="messages.length === 0" class="msg-empty">暂无留言</div>
            <div
              v-for="m in messages"
              :key="m.id"
              class="msg-item"
              :class="{ self: m.isSelf }"
            >
              <div class="msg-head">
                <span class="msg-sender">{{ m.sender }}</span>
                <span class="msg-time">{{ formatDateTime(m.createdAt) }}</span>
              </div>
              <RichView :html="m.content" class="msg-content" />
            </div>
          </div>

          <div v-if="detail.status !== 'CLOSED'" class="msg-input">
            <RichEditor v-model="messageInput" placeholder="输入留言（支持富文本与截图粘贴）" />
            <el-button type="primary" :loading="sending" class="msg-send" @click="sendMessage">
              发送
            </el-button>
          </div>
          <div v-else class="msg-closed">反馈已关闭，无法继续留言</div>
        </template>
      </div>
    </el-drawer>

    <!-- 新建反馈 -->
    <el-dialog v-model="createVisible" title="新建问题反馈" width="640px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="createForm.title" maxlength="100" placeholder="一句话描述问题" />
        </el-form-item>
        <el-form-item label="问题类别">
          <DictSelect
            v-model="createForm.category"
            type-code="feedback_category"
            placeholder="请选择类别"
            :clearable="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="接收人" required>
          <el-select
            v-model="createForm.receiverId"
            filterable
            placeholder="选择处理人"
            style="width: 100%"
          >
            <el-option
              v-for="u in receivers"
              :key="u.id"
              :label="u.nickname ? `${u.nickname}（${u.username}）` : u.username"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="问题描述" required>
          <RichEditor v-model="createForm.content" placeholder="详细描述问题，可粘贴截图" />
        </el-form-item>
      </el-form>
      <template #footer>
      <el-button @click="createVisible = false">取消</el-button>
      <el-button type="primary" :loading="creating" v-has-perm="'feedback:create'" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.feedback-page {
  padding: 16px;
  /* 内容容器白色背景（虎哥 2026-10-21） */
  background: #fff;
  border-radius: 8px;
  min-height: calc(100vh - var(--fs-header-height, 56px) - 68px);
}
.toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.tabs {
  flex: 1;
}
.tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
}
/* 类别/状态筛选下拉：不给定宽度时 el-select 在 flex 容器里塌陷成最小宽（2026-10-21 实锤）。
   DictSelect 的根元素就是 el-select，class 直接落在它身上即可定宽。
   2026-10-23 虎哥：统一拉齐到全站规范 200px（原 150px 与 .filter-select 并存，
   同权重靠先后顺序才勉强生效，容易踩坑——两处一并改为 200px）。 */
.toolbar-right :deep(.el-select) {
  width: 200px;
}
.filter-select {
  width: 200px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
/* 详情抽屉 */
.detail-body {
  min-height: 200px;
}
.d-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #303133;
}
.d-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.d-meta-text {
  font-size: 12px;
  color: #909399;
}
.d-content {
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
}
.d-actions {
  margin: 14px 0;
  display: flex;
  gap: 8px;
}
.d-msg-title {
  margin: 16px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}
.msg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg-empty {
  text-align: center;
  color: #909399;
  font-size: 13px;
  padding: 12px 0;
}
.msg-item {
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}
.msg-item.self {
  background: var(--el-color-primary-light-9, #ecf5ff);
  border-color: transparent;
}
.msg-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
}
.msg-sender {
  color: #303133;
  font-weight: 600;
}
.msg-time {
  color: #909399;
}
.msg-content {
  font-size: 13px;
  line-height: 1.6;
}
.msg-input {
  margin-top: 14px;
}
.msg-send {
  margin-top: 10px;
}
.msg-closed {
  margin-top: 14px;
  text-align: center;
  font-size: 13px;
  color: #909399;
}
</style>
