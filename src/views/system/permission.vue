<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import type { FormInstance } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import {
  listPermissionPage,
  createPermission,
  updatePermission,
  deletePermission,
} from '@/api/permission'
import type { PermissionFormData, PermissionVO } from '@/types/permission'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'

// 表格展示标签：资源类型/操作类型/状态全部走字典，不再裸显英文域值或自写硬编码映射。
// permission_action 自 V22 起对齐真实域值 READ/WRITE/EXECUTE（原 VIEW/CREATE/... 与存量数据对不上）。
const { label: resourceLabel } = useDictLabels('permission_resource')
const { label: actionLabel } = useDictLabels('permission_action')
const { label: statusLabel } = useDictLabels('common_status')

// ===== 查询条件 =====
const query = reactive({
  permName: '',
  permCode: '',
  status: '',
})

const handleQuery = () => {
  pageNum.value = 1
  loadPermissions()
}

const resetQuery = () => {
  query.permName = ''
  query.permCode = ''
  query.status = ''
  pageNum.value = 1
  loadPermissions()
}

// ===== 列表数据（分页：默认每页 10 条，el-pagination 标准分页器）=====
const loading = ref(false)
const permList = ref<PermissionVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadPermissions = async () => {
  loading.value = true
  try {
    const page = await listPermissionPage(pageNum.value, pageSize.value, {
      permName: query.permName || undefined,
      permCode: query.permCode || undefined,
      status: query.status || undefined,
    })
    permList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// 增删后刷新：若把当前页最后一条删空了且不在第一页，自动回退一页，避免停在空白页
const reloadAfterMutation = async () => {
  await loadPermissions()
  if (permList.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadPermissions()
  }
}

// 切换每页条数时回到第一页（否则可能停在一个不存在的页码上）
const handleSizeChange = () => {
  pageNum.value = 1
  loadPermissions()
}

// ===== 弹窗表单 =====
// 说明：权限列表已转为标准列表，表单不再展示「上级权限」选择项（避免误导）；
// 但 parentId 字段仍保留（emptyForm 默认 0 = 根级、openEdit 仍回填），后端字段不变。
const dialogVisible = ref(false)
const dialogTitle = ref('新增权限')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): PermissionFormData => ({
  parentId: 0,
  permCode: '',
  permName: '',
  resourceType: 'API',
  actionType: 'EXECUTE',
  status: 'ENABLED',
})

const form = reactive<PermissionFormData>(emptyForm())

const rules = {
  permCode: [{ required: true, message: '请输入权限编码', trigger: 'blur' }],
  permName: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  // emptyForm 不含 id 键，Object.assign 只覆盖不删除——上次编辑残留的 form.id
  // 不清掉的话，「新增」会带着旧 id 走 update 分支（同 menu.vue / org.vue 实录坑）。
  form.id = undefined
  dialogTitle.value = '新增权限'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: PermissionVO) => {
  form.id = row.id
  form.parentId = row.parentId ?? 0
  form.permCode = row.permCode
  form.permName = row.permName
  form.resourceType = row.resourceType
  form.actionType = row.actionType
  form.status = row.status
  dialogTitle.value = `修改权限 - ${row.permName}`
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    // 解构剥出 id：既用于区分新增/修改分支，又让 payload 与后端 PermissionRequest 对齐
    const { id, ...payload } = form
    if (id) {
      await updatePermission(id, payload)
      ElMessage.success('权限已保存')
    } else {
      await createPermission(payload)
      ElMessage.success('权限已创建')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: PermissionVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除权限「${row.permName}」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deletePermission(row.id)
    ElMessage.success('删除成功')
    await reloadAfterMutation()
  } catch (e) {
    // 有子权限 / 被角色引用时后端拒删，message 即具体原因
    ElMessage.error((e as Error).message)
  }
}

onMounted(() => {
  loadPermissions()
})
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar">
      <el-form-item label="权限名称">
        <el-input v-model="query.permName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="权限编码">
        <el-input v-model="query.permCode" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
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
      <el-button type="primary" :icon="Plus" @click="openCreate">新增权限</el-button>
      <el-button :icon="Refresh" @click="loadPermissions">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="permList" border>
      <el-table-column prop="permName" label="权限名称" min-width="160" />
      <el-table-column prop="permCode" label="权限编码" min-width="180" />
      <el-table-column label="上级权限" min-width="140">
        <template #default="{ row }">{{ row.parentName || '根权限' }}</template>
      </el-table-column>
      <el-table-column label="资源类型" width="120" align="center">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ resourceLabel(row.resourceType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作类型" width="120" align="center">
        <template #default="{ row }">
          <el-tag size="small">{{ actionLabel(row.actionType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
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
        @current-change="loadPermissions"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="权限编码" prop="permCode">
        <el-input
          v-model="form.permCode"
          placeholder="如 user:manage（创建后不可修改）"
          :disabled="!!form.id"
          maxlength="64"
        />
        <span v-if="form.id" class="form-tip">创建后不可修改，程序按编码鉴权</span>
      </el-form-item>
      <el-form-item label="权限名称" prop="permName">
        <el-input v-model="form.permName" placeholder="请输入权限名称" maxlength="64" show-word-limit />
      </el-form-item>
      <el-form-item label="资源类型" prop="resourceType">
        <!-- 资源类型：字典 permission_resource（API/MENU/BUTTON，与 V4 权限种子域值一致） -->
        <DictSelect v-model="form.resourceType" type-code="permission_resource" placeholder="请选择资源类型" class="w-full" />
      </el-form-item>
      <!-- 操作类型：字典 permission_action 消费（V22 已将字典对齐真实域值 READ/WRITE/EXECUTE） -->
      <el-form-item label="操作类型" prop="actionType">
        <DictSelect v-model="form.actionType" type-code="permission_action" placeholder="请选择操作类型" class="w-full" />
      </el-form-item>
      <el-form-item label="权限状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio label="ENABLED">启用</el-radio>
          <el-radio label="DISABLED">停用</el-radio>
        </el-radio-group>
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
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
</style>
