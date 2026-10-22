<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import DictSelect from '@/components/DictSelect.vue'
import ApprovalProgressDialog from '@/components/ApprovalProgressDialog.vue'
import { myTasksPage, myStartedPage, myApprovedHistoryPage, completeTask, rejectTask } from '@/api/approval'
import { formatDateTime } from '@/utils/datetime'
import type { ApprovalHistoryVO, TaskInfoVO } from '@/types/approval'
import type { ProjectVO } from '@/types/project'

// ===== 顶部 Tab（2026-10-22 虎哥：审批中心按标准页面改造，我发起的 / 我审批的）=====
const activeTab = ref('approval')

// ===== Tab1 我审批的（待办分页：查询 + 表格 + 分页）=====
const approvalLoading = ref(false)
const approvalList = ref<TaskInfoVO[]>([])
const approvalTotal = ref(0)
const approvalQuery = reactive({
  pageNum: 1,
  pageSize: 10,
  bizTitleKw: '',
  taskNameKw: '',
})

const loadApprovals = async () => {
  approvalLoading.value = true
  try {
    const page = await myTasksPage(approvalQuery.pageNum, approvalQuery.pageSize, {
      bizTitleKw: approvalQuery.bizTitleKw || undefined,
      taskNameKw: approvalQuery.taskNameKw || undefined,
    })
    approvalList.value = page.records
    approvalTotal.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    approvalLoading.value = false
  }
}

const searchApprovals = () => {
  approvalQuery.pageNum = 1
  loadApprovals()
}

const resetApprovals = () => {
  approvalQuery.bizTitleKw = ''
  approvalQuery.taskNameKw = ''
  approvalQuery.pageNum = 1
  loadApprovals()
}

// ===== Tab2 我发起的（项目分页：查询 + 表格 + 分页）=====
const startedLoading = ref(false)
const startedList = ref<ProjectVO[]>([])
const startedTotal = ref(0)
const startedQuery = reactive({
  pageNum: 1,
  pageSize: 10,
  projectName: '',
  approvalStatus: '',
})

const loadStarted = async () => {
  startedLoading.value = true
  try {
    const page = await myStartedPage(startedQuery.pageNum, startedQuery.pageSize, {
      projectName: startedQuery.projectName || undefined,
      approvalStatus: startedQuery.approvalStatus || undefined,
    })
    startedList.value = page.records
    startedTotal.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    startedLoading.value = false
  }
}

const searchStarted = () => {
  startedQuery.pageNum = 1
  loadStarted()
}

const resetStarted = () => {
  startedQuery.projectName = ''
  startedQuery.approvalStatus = ''
  startedQuery.pageNum = 1
  loadStarted()
}

// ===== Tab3 我审批的（历史分页：查询 + 表格 + 分页；2026-10-22 虎哥：看不到自己审批过的记录）=====
const historyLoading = ref(false)
const historyList = ref<ApprovalHistoryVO[]>([])
const historyTotal = ref(0)
const historyQuery = reactive({
  pageNum: 1,
  pageSize: 10,
  bizTitleKw: '',
  taskNameKw: '',
})

const loadHistory = async () => {
  historyLoading.value = true
  try {
    const page = await myApprovedHistoryPage(historyQuery.pageNum, historyQuery.pageSize, {
      bizTitleKw: historyQuery.bizTitleKw || undefined,
      taskNameKw: historyQuery.taskNameKw || undefined,
    })
    historyList.value = page.records
    historyTotal.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    historyLoading.value = false
  }
}

const searchHistory = () => {
  historyQuery.pageNum = 1
  loadHistory()
}

const resetHistory = () => {
  historyQuery.bizTitleKw = ''
  historyQuery.taskNameKw = ''
  historyQuery.pageNum = 1
  loadHistory()
}

// Tab 切换懒加载：发起的/历史的第一次切到才拉（避免进页面三套数据全拉）
const handleTabChange = (name: string) => {
  if (name === 'started' && startedTotal.value === 0 && startedList.value.length === 0) {
    loadStarted()
  }
  if (name === 'history' && historyTotal.value === 0 && historyList.value.length === 0) {
    loadHistory()
  }
}

// ===== 审批进度弹窗（共用组件：卡片化时间线）=====
const progressVisible = ref(false)
const progressProjectId = ref<number | null>(null)
const progressProjectName = ref('')

const openProgress = (projectId: number | null, projectName: string) => {
  progressProjectId.value = projectId
  progressProjectName.value = projectName
  progressVisible.value = true
}

// ===== 审批弹窗（通过/驳回合并——2026-10-22 虎哥拍板）=====
// 一个弹窗办两种事：默认选中「通过」，留言选填；切到「驳回」时留言变必填
// （即驳回理由），并要选退回节点。
const dialogVisible = ref(false)
const action = ref<'approve' | 'reject'>('approve')
const comment = ref('')
const rejectTarget = ref('')
const saving = ref(false)
const currentTask = ref<TaskInfoVO | null>(null)

// act 预选：列表「通过」按钮直接开窗即通过态；「驳回」按钮开窗即驳回态
const openDialog = (row: TaskInfoVO, act: 'approve' | 'reject') => {
  currentTask.value = row
  action.value = act
  comment.value = ''
  rejectTarget.value = ''
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!currentTask.value) return
  if (action.value === 'reject') {
    if (!rejectTarget.value) {
      ElMessage.warning('请选择退回节点')
      return
    }
    if (!comment.value.trim()) {
      ElMessage.warning('请填写驳回理由')
      return
    }
  }
  saving.value = true
  try {
    if (action.value === 'approve') {
      // 留言选填：空串后端不落评论（complete 内 comment blank 才 addComment）
      await completeTask(currentTask.value.taskId, { comment: comment.value.trim() })
      ElMessage.success('已通过')
    } else {
      await rejectTask(currentTask.value.taskId, rejectTarget.value, comment.value.trim())
      ElMessage.success('已驳回')
    }
    dialogVisible.value = false
    await loadApprovals()
  } catch (e) {
    ElMessage.error((e as Error).message)
    // 失败也刷新列表（2026-10-22 虎哥实测：旧 taskId 被「重新提交」终结后点通过报错，
    // 列表还是陈的，用户找不到新待办）。典型场景：项目被驳回重提 → 旧实例任务全死 →
    // 旧页面点审批 → 后端 400「任务已结束（项目重新提交审批…）请刷新待办列表」。
    // 此处直接替用户刷新，切到当前 Tab 的真实待办（新 taskId）。
    if (activeTab.value === 'approval') {
      await loadApprovals()
    } else if (activeTab.value === 'history') {
      await loadHistory()
    }
  } finally {
    saving.value = false
  }
}

onMounted(loadApprovals)
</script>

<template>
  <el-card shadow="never">
    <!-- 查询条件：顶部一套，按当前 Tab 显示对应表单（虎哥 2026-10-22：Tab 栏放到查询条件下、表格上） -->
    <el-form v-if="activeTab === 'approval'" :inline="true" :model="approvalQuery" class="query-bar" @submit.prevent>
      <el-form-item label="业务名称">
        <el-input v-model="approvalQuery.bizTitleKw" placeholder="模糊匹配" clearable style="width: 200px" @keyup.enter="searchApprovals" />
      </el-form-item>
      <el-form-item label="节点名称">
        <el-input v-model="approvalQuery.taskNameKw" placeholder="模糊匹配" clearable style="width: 200px" @keyup.enter="searchApprovals" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="searchApprovals">查询</el-button>
        <el-button :icon="Refresh" @click="resetApprovals">重置</el-button>
      </el-form-item>
    </el-form>
    <el-form v-else-if="activeTab === 'started'" :inline="true" :model="startedQuery" class="query-bar" @submit.prevent>
      <el-form-item label="项目名称">
        <el-input v-model="startedQuery.projectName" placeholder="模糊匹配" clearable style="width: 200px" @keyup.enter="searchStarted" />
      </el-form-item>
      <el-form-item label="审批状态">
        <DictSelect v-model="startedQuery.approvalStatus" type-code="project_approval_status" placeholder="全部" style="width: 200px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="searchStarted">查询</el-button>
        <el-button :icon="Refresh" @click="resetStarted">重置</el-button>
      </el-form-item>
    </el-form>
    <el-form v-else-if="activeTab === 'history'" :inline="true" :model="historyQuery" class="query-bar" @submit.prevent>
      <el-form-item label="业务名称">
        <el-input v-model="historyQuery.bizTitleKw" placeholder="模糊匹配" clearable style="width: 200px" @keyup.enter="searchHistory" />
      </el-form-item>
      <el-form-item label="节点名称">
        <el-input v-model="historyQuery.taskNameKw" placeholder="模糊匹配" clearable style="width: 200px" @keyup.enter="searchHistory" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="searchHistory">查询</el-button>
        <el-button :icon="Refresh" @click="resetHistory">重置</el-button>
      </el-form-item>
    </el-form>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- Tab1 我审批的：当前登录用户的 active 待办（三线合并） -->
      <el-tab-pane label="待我审批" name="approval">
        <el-table v-loading="approvalLoading" :data="approvalList" border empty-text="暂无待办">
          <el-table-column prop="bizTitle" label="业务" min-width="200" show-overflow-tooltip />
          <el-table-column prop="taskName" label="当前节点" min-width="140" />
          <el-table-column label="处理人" min-width="160">
            <template #default="{ row }">
              <template v-if="row.handlerNames && row.handlerNames.length">
                <el-tag v-for="(n, i) in row.handlerNames" :key="i" size="small" class="handler-tag">{{ n }}</el-tag>
              </template>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="到达时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openDialog(row, 'approve')">通过</el-button>
              <el-button link type="danger" size="small" @click="openDialog(row, 'reject')">驳回</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="approvalQuery.pageNum"
            v-model:page-size="approvalQuery.pageSize"
            :total="approvalTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadApprovals"
            @size-change="searchApprovals"
          />
        </div>
      </el-tab-pane>

      <!-- Tab2 我发起的：当前用户发起过流程的立项单（服务端过滤，排除草稿）；查询表单在 Tab 栏上方 -->
      <el-tab-pane label="我发起的" name="started">
        <el-table v-loading="startedLoading" :data="startedList" border empty-text="暂无发起记录">
          <el-table-column prop="projectNo" label="项目编号" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.projectNo || '—' }}</template>
          </el-table-column>
          <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
          <el-table-column label="审批状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.approvalStatusStyle || 'info'" size="small">
                {{ row.approvalStatusName || row.approvalStatus }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openProgress(row.id, row.projectName)">查看进度</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="startedQuery.pageNum"
            v-model:page-size="startedQuery.pageSize"
            :total="startedTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadStarted"
            @size-change="searchStarted"
          />
        </div>
      </el-tab-pane>

      <!-- Tab3 我审批的：我处理过的历史任务（taskCompletedBy，按处理时间倒序） -->
      <el-tab-pane label="我审批的" name="history">
        <el-table v-loading="historyLoading" :data="historyList" border empty-text="暂无审批记录">
          <el-table-column prop="bizTitle" label="业务" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bizTitle || '—' }}</template>
          </el-table-column>
          <el-table-column prop="taskName" label="审批节点" min-width="140" show-overflow-tooltip />
          <el-table-column label="我的结果" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.result === 'REJECTED' ? 'danger' : 'success'" size="small">
                {{ row.result === 'REJECTED' ? '已驳回' : '已通过' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="审批意见" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.comment || '—' }}</template>
          </el-table-column>
          <el-table-column label="处理时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.endTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                size="small"
                :disabled="!row.bizKey"
                @click="openProgress(Number(row.bizKey), row.bizTitle || '')"
              >
                查看进度
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="historyQuery.pageNum"
            v-model:page-size="historyQuery.pageSize"
            :total="historyTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadHistory"
            @size-change="searchHistory"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 审批弹窗：通过/驳回合并（默认通过；留言选填，驳回时必填且需选退回节点） -->
    <el-dialog v-model="dialogVisible" :title="`审批 - ${currentTask?.bizTitle || currentTask?.taskName || ''}`" width="480px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="审批结果">
          <el-radio-group v-model="action">
            <el-radio label="approve">通过</el-radio>
            <el-radio label="reject">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="action === 'reject'" label="退回节点" required>
          <el-select v-model="rejectTarget" placeholder="请选择退回节点" style="width: 100%">
            <el-option
              v-for="n in currentTask?.rejectTargets || []"
              :key="n.nodeId"
              :label="n.nodeName"
              :value="n.nodeId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="审批意见" :required="action === 'reject'">
          <el-input
            v-model="comment"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            :placeholder="action === 'reject' ? '请填写驳回理由，将通知申请人' : '选填，通过时也可留言'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button :type="action === 'reject' ? 'danger' : 'primary'" :loading="saving" @click="handleSubmit">
          {{ action === 'reject' ? '确定驳回' : '确认通过' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 审批进度（卡片化时间线，与立项列表共用组件） -->
    <ApprovalProgressDialog v-model:visible="progressVisible" :project-id="progressProjectId" :project-name="progressProjectName" />
  </el-card>
</template>

<style scoped>
/* 查询表单与 Tab 栏之间的间距（表单挪到 Tab 上方后需要留气口） */
.query-bar {
  margin-bottom: 0px;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
/* 处理人标签（集合时多个标签横排，虎哥 2026-10-22 要求） */
.handler-tag {
  margin: 2px;
}
</style>
