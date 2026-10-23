<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { projectPage, createProject, submitProject, projectDetail, updateProject, signProject } from '@/api/project'
import type { ProjectFormData, ProjectSignFormData, ProjectVO } from '@/types/project'
import ApprovalProgressDialog from '@/components/ApprovalProgressDialog.vue'
import { formatDateTime } from '@/utils/datetime'
import { listUserOptions } from '@/api/user'
import type { UserOptionVO } from '@/types/user'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'

// ===== 查询条件 =====
const query = reactive({
  projectNo: '',
  projectName: '',
  approvalStatus: '',
})

const handleQuery = () => {
  pageNum.value = 1
  loadList()
}

const resetQuery = () => {
  query.projectNo = ''
  query.projectName = ''
  query.approvalStatus = ''
  pageNum.value = 1
  loadList()
}

// ===== 列表数据（分页：默认每页 10 条） =====
const loading = ref(false)
const list = ref<ProjectVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadList = async () => {
  loading.value = true
  try {
    const page = await projectPage(pageNum.value, pageSize.value, {
      projectNo: query.projectNo || undefined,
      projectName: query.projectName || undefined,
      approvalStatus: query.approvalStatus || undefined,
    })
    list.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

const reloadAfterMutation = async () => {
  await loadList()
  if (list.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadList()
  }
}

const handleSizeChange = () => {
  pageNum.value = 1
  loadList()
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新建立项')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): ProjectFormData => ({
  projectName: '',
  customerName: '',
  salesManagerId: undefined,
  contractAmount: undefined,
})

const form = reactive<ProjectFormData>(emptyForm())

const rules = {
  projectName: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
}

const userOptions = ref<UserOptionVO[]>([])

const openCreate = () => {
  Object.assign(form, emptyForm())
  form.id = undefined
  dialogTitle.value = '新建立项'
  dialogVisible.value = true
  ensureUserOptions()
}

// 编辑：仅 DRAFT / REJECTED 行有入口（后端 PUT 同语义把关）。先拉详情回填再开窗，
// 保证拿到服务端翻译后的最新值，不拿列表行快照（列表行字段可能滞后）
const openEdit = async (row: ProjectVO) => {
  ensureUserOptions()
  try {
    const detail = await projectDetail(row.id)
    Object.assign(form, emptyForm(), {
      id: detail.id,
      projectName: detail.projectName,
      customerName: detail.customerName ?? undefined,
      salesManagerId: detail.salesManagerId ?? undefined,
      contractAmount: detail.contractAmount ?? undefined,
    })
    dialogTitle.value = '编辑立项'
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const ensureUserOptions = async () => {
  if (userOptions.value.length === 0) {
    userOptions.value = await listUserOptions()
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    const { id, ...payload } = form
    if (id) {
      await updateProject(id, payload)
      ElMessage.success('立项已更新')
    } else {
      await createProject(payload)
      ElMessage.success('立项已创建')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

// ===== 提交审批 =====
const submitting = ref(false)

const handleSubmitApproval = async (row: ProjectVO) => {
  try {
    await ElMessageBox.confirm(`确认提交「${row.projectName}」进入审批流程？`, '提交审批', {
      type: 'warning',
      confirmButtonText: '提交',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  submitting.value = true
  try {
    await submitProject(row.id)
    ElMessage.success('已提交审批')
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    submitting.value = false
  }
}

// ===== 审批进度弹窗（卡片化时间线组件：2026-10-22 虎哥拍板不用 Tab，一条线走完；
//       与审批中心「我发起的」共用 ApprovalProgressDialog，加载逻辑收在组件内） =====
const progressVisible = ref(false)
const progressProjectId = ref<number | null>(null)
const progressProjectName = ref('')

const openProgress = (row: ProjectVO) => {
  progressProjectId.value = row.id
  progressProjectName.value = row.projectName
  progressVisible.value = true
}

// ===== 签约（2026-10-22 虎哥拍板：审批通过后的独立动作，终态不可撤销） =====
const signVisible = ref(false)
const signSaving = ref(false)
const signForm = ref<ProjectSignFormData>({ contractAmount: undefined, contractDesc: '' })
const signRow = ref<ProjectVO | null>(null)

// 仅 APPROVED + UNSIGNED 行有入口（后端同语义把关）
const canSign = (row: ProjectVO) => row.approvalStatus === 'APPROVED' && row.contractStatus === 'UNSIGNED'

const openSign = (row: ProjectVO) => {
  signRow.value = row
  // 金额初始带现值（预估额），允许修正为最终合同额（b 拍板）
  signForm.value = { contractAmount: row.contractAmount ?? undefined, contractDesc: '' }
  signVisible.value = true
}

const handleSign = async () => {
  if (!signRow.value) return
  if (signForm.value.contractAmount != null && Number(signForm.value.contractAmount) < 0) {
    ElMessage.warning('合同金额不能为负')
    return
  }
  signSaving.value = true
  try {
    await signProject(signRow.value.id, {
      contractAmount: signForm.value.contractAmount,
      contractDesc: signForm.value.contractDesc?.trim() || undefined,
    })
    ElMessage.success('已签约')
    signVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    signSaving.value = false
  }
}

// ===== 合同金额格式化（虎哥 2026-10-22：两位小数点；顺带千分位，长金额可读） =====
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 合同状态标签悬浮详情（c 拍板：展示签约时间/人；未签约给出提示文案）。
// 列表列宽放不下多行信息，用原生 title 悬浮展示，鼠标停留即可看全
const signInfo = (row: ProjectVO): string => {
  if (row.contractStatus !== 'SIGNED') return '未签约'
  const at = row.contractSignedAt ? formatDateTime(row.contractSignedAt) : '—'
  const who = row.contractSignedByName || (row.contractSignedBy != null ? String(row.contractSignedBy) : '—')
  return `签约时间：${at}\n签约人：${who}`
}

// 审批状态标签色走后端字典翻译（approvalStatusStyle，V45 补种 style），
// 与合同状态列同链路——字典维护页改色即生效，不再前端硬编码 switch

// 合同签约状态：走字典（project_contract_status，V2 种子 + V7 已归一化 ENABLED），
// label 与 tag 颜色均来自字典（style 列 V44 补种）——字典维护页改完即生效，
// useDictLabels 兜底：空值 '—'、未命中显示原值、style 缺失调用方兜 'info'
const { label: contractStatusLabel, style: contractStatusStyle } = useDictLabels('project_contract_status')

onMounted(loadList)
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="项目编号">
        <el-input v-model="query.projectNo" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="项目名称">
        <el-input v-model="query.projectName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="审批状态">
        <!-- 宽度走 pages.css 的 .query-bar 统一规范（200px），不再内联绕过 -->
        <DictSelect v-model="query.approvalStatus" type-code="project_approval_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新建立项</el-button>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="projectNo" label="项目编号" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.projectNo || '—' }}</template>
      </el-table-column>
      <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="customerName" label="客户名称" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.customerName || '—' }}</template>
      </el-table-column>
      <el-table-column label="销售经理" width="120" align="center">
        <template #default="{ row }">{{ row.salesManagerName || row.salesManagerId || '—' }}</template>
      </el-table-column>
      <el-table-column label="合同状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag
            :type="contractStatusStyle(row.contractStatus) || 'info'"
            size="small"
            :title="signInfo(row)"
          >
            {{ contractStatusLabel(row.contractStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="合同金额" width="150" align="right">
        <template #default="{ row }">{{ formatAmount(row.contractAmount) }}</template>
      </el-table-column>
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
      <el-table-column label="操作" width="260" fixed="right" align="center">
        <template #default="{ row }">
          <template v-if="row.approvalStatus === 'DRAFT' || row.approvalStatus === 'REJECTED'">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button
              link type="primary" size="small"
              :loading="submitting" @click="handleSubmitApproval(row)"
            >提交审批</el-button>
          </template>
          <template v-else-if="canSign(row)">
            <el-button link type="primary" size="small" @click="openSign(row)">签约</el-button>
            <el-button link type="primary" size="small" @click="openProgress(row)">查看进度</el-button>
          </template>
          <el-button
            v-else
            link type="primary" size="small"
            @click="openProgress(row)"
          >查看进度</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 标准分页器：默认每页 10 条，与后端默认值一致 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="loadList"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 审批进度弹窗（卡片化时间线组件：与审批中心「我发起的」共用；
       进行中节点高亮，其之前都是历史（含审批留言），后端 ACT_HI_TASKINST 单源） -->
  <ApprovalProgressDialog
    v-model:visible="progressVisible"
    :project-id="progressProjectId"
    :project-name="progressProjectName"
  />

  <!-- 签约弹窗（2026-10-22 虎哥拍板：审批通过后的独立动作；金额可修正为最终合同额，描述非必填） -->
  <el-dialog v-model="signVisible" :title="`签约 - ${signRow?.projectName ?? ''}`" width="480px">
    <el-form label-width="90px" @submit.prevent>
      <el-form-item label="合同金额">
        <el-input-number v-model="signForm.contractAmount" :min="0" :precision="2" :step="1000"
                         class="amount-left" controls-position="right" style="width: 100%" placeholder="最终合同金额" />
      </el-form-item>
      <el-form-item label="签约描述">
        <el-input v-model="signForm.contractDesc" type="textarea" :rows="3" maxlength="500"
                  show-word-limit placeholder="选填，如付款约定、交付说明等" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="signVisible = false">取消</el-button>
      <el-button type="primary" :loading="signSaving" @click="handleSign">确认签约</el-button>
    </template>
  </el-dialog>

  <!-- 新建立项弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="项目名称" prop="projectName">
        <el-input v-model="form.projectName" placeholder="请输入项目名称" maxlength="128" show-word-limit />
      </el-form-item>
      <el-form-item label="客户名称">
        <el-input v-model="form.customerName" placeholder="选填" maxlength="128" />
      </el-form-item>
      <el-form-item label="销售经理">
        <el-select v-model="form.salesManagerId" filterable placeholder="选择销售经理" style="width: 100%">
          <el-option v-for="u in userOptions" :key="u.id" :label="u.nickname" :value="u.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="合同金额">
        <el-input-number v-model="form.contractAmount" :min="0" :precision="2" :step="1000"
                         class="amount-left" controls-position="right" style="width: 100%" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.toolbar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
}
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
/* ===== 审批进度时间线样式已移至 components/ApprovalProgressDialog.vue（卡片化，两页共用） ===== */

/* 2026-10-23 虎哥：合同金额输入框内容左对齐（el-input-number 默认偏右/居中，强制内部 input 左对齐） */
.amount-left :deep(.el-input__inner) {
  text-align: left;
}
</style>
