<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="流程编码">
        <el-input v-model="query.processCode" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="流程名称">
        <el-input v-model="query.processName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="状态">
        <!-- 状态：字典 common_status 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.status" type-code="common_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新建流程</el-button>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="processCode" label="流程编码" min-width="160" />
      <el-table-column prop="processName" label="流程名称" min-width="160" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="defVersion" label="版本" width="80" align="center" />
      <el-table-column prop="flowableDeploymentId" label="部署ID" min-width="180" show-overflow-tooltip />
      <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
      <el-table-column label="操作" width="300" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="warning" size="small" @click="openNodes(row)">配置节点</el-button>
          <el-button link type="success" size="small" @click="onDeploy(row)">部署</el-button>
          <el-button link :type="row.status === 'ENABLED' ? 'danger' : 'success'" size="small" @click="onToggle(row)">
            {{ row.status === 'ENABLED' ? '停用' : '启用' }}
          </el-button>
          <el-button link type="info" size="small" @click="openVersions(row)">版本</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState />
      </template>
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

    <!-- 新建流程 -->
    <el-dialog v-model="createVisible" title="新建流程" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="流程编码" required>
          <el-input v-model="form.processCode" placeholder="如 project_approval（字母数字下划线）" />
        </el-form-item>
        <el-form-item label="流程名称" required>
          <el-input v-model="form.processName" placeholder="如 项目立项审批" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onCreate">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑流程：仅改名称/备注，不动节点、不重新部署，对在跑业务零影响 -->
    <el-dialog v-model="editVisible" title="编辑流程" width="480px">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="流程编码">
          <el-input :model-value="editForm.processCode" disabled />
        </el-form-item>
        <el-form-item label="流程名称" required>
          <el-input v-model="editForm.processName" placeholder="如 项目立项审批" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onEdit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 配置节点抽屉 -->
    <el-drawer v-model="nodeDrawer" title="配置节点" size="640px" @open="onNodeDrawerOpen">
      <template v-if="current">
        <el-alert
          :title="`当前流程：${current.processName}（${current.processCode}）`"
          type="info" :closable="false" style="margin-bottom: 12px"
        />
        <div class="node-toolbar">
          <el-button type="primary" size="small" @click="addNode">+ 新增节点</el-button>
          <el-button size="small" :loading="saving" @click="onSaveNodes">保存节点</el-button>
          <el-button type="success" size="small" :loading="deploying" @click="onDeployFromDrawer">
            保存并部署
          </el-button>
        </div>
        <el-table :data="editingNodes" border>
          <el-table-column label="#" width="35">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="节点名称" width="120">
            <template #default="{ row }">
              <el-input v-model="row.name" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <el-select v-model="row.type" size="small" @change="onTypeChange(row)">
                <el-option label="指定人" value="USER" />
                <el-option label="角色" value="ROLE" />
                <el-option label="职级" value="LEVEL" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="审批人 / 候选" min-width="120">
            <template #default="{ row }">
              <el-select
                v-if="row.type === 'USER'" v-model="row.assignee" size="small"
                filterable placeholder="选择用户" style="width: 100%"
              >
                <el-option v-for="u in userOptions" :key="u.id" :label="u.nickname" :value="String(u.id)" />
              </el-select>
              <el-select
                v-else-if="row.type === 'ROLE'" v-model="row.assignee" size="small"
                filterable placeholder="选择角色" style="width: 100%"
              >
                <el-option v-for="r in roleOptions" :key="r.roleCode" :label="r.roleName" :value="r.roleCode" />
              </el-select>
              <el-select
                v-else-if="row.type === 'LEVEL'" v-model="row.assignee" size="small"
                filterable placeholder="选择职级" style="width: 100%"
              >
                <el-option
                  v-for="l in levelOptions" :key="l.levelCode"
                  :label="`${l.levelName}（${l.levelCode}）`" :value="l.levelCode"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="可驳回" width="70" align="center">
            <template #default="{ row }">
              <el-checkbox v-model="row.rejectable" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center">
            <template #default="{ $index }">
              <el-button link type="primary" size="small" :disabled="$index === 0" @click="move($index, -1)">上移</el-button>
              <el-button link type="primary" size="small" :disabled="$index === editingNodes.length - 1" @click="move($index, 1)">下移</el-button>
              <el-button link type="danger" size="small" @click="removeNode($index)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState description="尚未配置节点，点「新增节点」" />
          </template>
        </el-table>
      </template>
    </el-drawer>

    <!-- 版本抽屉 -->
    <el-drawer v-model="versionDrawer" title="历史版本" size="640px">
      <el-table :data="versions" v-loading="versionLoading" border>
        <el-table-column prop="version" label="版本" width="55" />
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column label="状态" width="70">
          <template #default="{ row }">
            <el-tag :type="row.suspended ? 'info' : 'success'">{{ row.suspended ? '挂起' : '激活' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="deploymentId" label="部署ID" min-width="130" show-overflow-tooltip />
        <el-table-column prop="deploymentTime" label="部署时间" min-width="150" />
        <template #empty>
          <EmptyState description="暂无部署版本" />
        </template>
      </el-table>
    </el-drawer>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import DictSelect from '@/components/DictSelect.vue'
import {
  listProcessDefPage,
  createProcessDef,
  updateProcessDef,
  deployProcessDef,
  toggleProcessDef,
  listProcessDefVersions,
} from '@/api/process'
import { listUserOptions } from '@/api/user'
import { listRoles } from '@/api/role'
import { listLevelOptions } from '@/api/level'
import type { ProcessDef, NodeCfg, ProcessDefVersionVO } from '@/types/process'
import type { UserOptionVO } from '@/types/user'
import type { RoleManageVO } from '@/types/role'
import type { LevelOptionVO } from '@/types/level'

// ===== 查询条件 =====
const query = reactive({
  processCode: '',
  processName: '',
  status: '',
})

const handleQuery = () => {
  pageNum.value = 1
  loadList()
}

const resetQuery = () => {
  query.processCode = ''
  query.processName = ''
  query.status = ''
  pageNum.value = 1
  loadList()
}

// ===== 列表数据（分页：默认每页 10 条，el-pagination 标准分页器）=====
const loading = ref(false)
const list = ref<ProcessDef[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadList = async () => {
  loading.value = true
  try {
    const page = await listProcessDefPage(pageNum.value, pageSize.value, {
      processCode: query.processCode || undefined,
      processName: query.processName || undefined,
      status: query.status || undefined,
    })
    list.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// 增删后刷新：若把当前页最后一条删空了且不在第一页，自动回退一页，避免停在空白页
const reloadAfterMutation = async () => {
  await loadList()
  if (list.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadList()
  }
}

// 切换每页条数时回到第一页（否则可能停在一个不存在的页码上）
const handleSizeChange = () => {
  pageNum.value = 1
  loadList()
}

const saving = ref(false)
const deploying = ref(false)

const createVisible = ref(false)
const form = ref<Partial<ProcessDef>>({ processCode: '', processName: '', remark: '' })

const editVisible = ref(false)
const editForm = ref<Partial<ProcessDef>>({ processCode: '', processName: '', remark: '' })

const nodeDrawer = ref(false)
const versionDrawer = ref(false)
const current = ref<ProcessDef | null>(null)
const editingNodes = ref<NodeCfg[]>([])
const versions = ref<ProcessDefVersionVO[]>([])
const versionLoading = ref(false)

const userOptions = ref<UserOptionVO[]>([])
const roleOptions = ref<RoleManageVO[]>([])
const levelOptions = ref<LevelOptionVO[]>([])

async function ensureOptions() {
  if (userOptions.value.length === 0) userOptions.value = await listUserOptions()
  if (roleOptions.value.length === 0) {
    const r = await listRoles(1, 9999)
    roleOptions.value = r.records
  }
  if (levelOptions.value.length === 0) levelOptions.value = await listLevelOptions()
}

function openCreate() {
  form.value = { processCode: '', processName: '', remark: '' }
  createVisible.value = true
}

function openEdit(row: ProcessDef) {
  editForm.value = {
    id: row.id,
    processCode: row.processCode,
    processName: row.processName,
    remark: row.remark,
  }
  editVisible.value = true
}

async function onEdit() {
  const id = editForm.value.id
  if (!id || !editForm.value.processName) {
    ElMessage.warning('流程名称必填')
    return
  }
  saving.value = true
  try {
    // 只传 processName / remark：后端 update 仅在 nodeList 非空时才覆盖节点，
    // 这里不传 nodeList，故在跑流程的节点配置与 Flowable 部署版本均不受影响
    await updateProcessDef(id, {
      processName: editForm.value.processName,
      remark: editForm.value.remark,
    })
    ElMessage.success('保存成功')
    editVisible.value = false
    await loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onCreate() {
  if (!form.value.processCode || !form.value.processName) {
    ElMessage.warning('流程编码与流程名称必填')
    return
  }
  saving.value = true
  try {
    await createProcessDef(form.value)
    ElMessage.success('创建成功')
    createVisible.value = false
    await reloadAfterMutation()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '创建失败')
  } finally {
    saving.value = false
  }
}

function openNodes(row: ProcessDef) {
  current.value = row
  nodeDrawer.value = true
}

async function onNodeDrawerOpen() {
  await ensureOptions()
  editingNodes.value = (current.value?.nodeList || []).map((n) => ({ ...n }))
}

function addNode() {
  const seq = editingNodes.value.length + 1
  editingNodes.value.push({
    seq,
    nodeId: 'node_' + seq,
    name: '节点' + seq,
    type: 'USER',
    assignee: '',
    rejectable: false,
  })
}

function removeNode(i: number) {
  editingNodes.value.splice(i, 1)
}

function move(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= editingNodes.value.length) return
  const arr = editingNodes.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

function onTypeChange(row: NodeCfg) {
  row.assignee = ''
}

async function persistNodes() {
  if (!current.value?.id) return
  editingNodes.value.forEach((n, i) => {
    n.seq = i + 1
    n.nodeId = 'node_' + (i + 1)
  })
  await updateProcessDef(current.value.id, {
    processName: current.value.processName,
    remark: current.value.remark,
    nodeList: editingNodes.value,
  })
}

async function onSaveNodes() {
  if (!current.value?.id) return
  saving.value = true
  try {
    await persistNodes()
    ElMessage.success('节点已保存')
    await loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onDeployFromDrawer() {
  if (!current.value?.id) return
  deploying.value = true
  try {
    await persistNodes()
    await deployProcessDef(current.value.id)
    ElMessage.success('部署成功')
    nodeDrawer.value = false
    await loadList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '部署失败')
  } finally {
    deploying.value = false
  }
}

async function onDeploy(row: ProcessDef) {
  try {
    await ElMessageBox.confirm(`确认部署流程「${row.processName}」？将生成新版本。`, '部署', { type: 'warning' })
  } catch {
    return
  }
  deploying.value = true
  try {
    await deployProcessDef(row.id!)
    ElMessage.success('部署成功')
    await reloadAfterMutation()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '部署失败')
  } finally {
    deploying.value = false
  }
}

async function onToggle(row: ProcessDef) {
  const action = row.status === 'ENABLED' ? '停用' : '启用'
  const tip =
    row.status === 'ENABLED'
      ? `停用后新单据将无法发起该流程，已在审批中的单据不受影响。确认停用「${row.processName}」？`
      : `确认启用流程「${row.processName}」？`
  try {
    await ElMessageBox.confirm(tip, `${action}确认`, { type: 'warning' })
  } catch {
    return
  }
  try {
    await toggleProcessDef(row.id!)
    ElMessage.success('操作成功')
    await reloadAfterMutation()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

async function openVersions(row: ProcessDef) {
  current.value = row
  versionDrawer.value = true
  versionLoading.value = true
  try {
    versions.value = await listProcessDefVersions(row.id!)
  } finally {
    versionLoading.value = false
  }
}

onMounted(loadList)
</script>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.toolbar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
.node-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
</style>
