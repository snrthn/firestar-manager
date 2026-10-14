<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import type { FormInstance } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listRolePermIds,
  assignRolePerms,
  listRoleMenuIds,
  assignRoleMenus,
} from '@/api/role'
import { listPermissions } from '@/api/permission'
import { listMenus } from '@/api/menu'
import type { RoleFormData, RoleManageVO } from '@/types/role'
import type { PermissionVO } from '@/types/permission'
import type { MenuVO } from '@/types/auth'

// ===== 查询条件 =====
const query = reactive({
  roleName: '',
  status: '',
})

const handleQuery = () => {
  pageNum.value = 1
  loadRoles()
}

const resetQuery = () => {
  query.roleName = ''
  query.status = ''
  pageNum.value = 1
  loadRoles()
}

// ===== 列表数据（分页：默认每页 10 条，el-pagination 标准分页器）=====
const loading = ref(false)
const roleList = ref<RoleManageVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadRoles = async () => {
  loading.value = true
  try {
    const page = await listRoles(pageNum.value, pageSize.value, {
      roleName: query.roleName || undefined,
      status: query.status || undefined,
    })
    roleList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// 增删后刷新：若把当前页最后一条删空了且不在第一页，自动回退一页，避免停在空白页
const reloadAfterMutation = async () => {
  await loadRoles()
  if (roleList.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadRoles()
  }
}

// 切换每页条数时回到第一页（否则可能停在一个不存在的页码上）
const handleSizeChange = () => {
  pageNum.value = 1
  loadRoles()
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增角色')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): RoleFormData => ({
  roleCode: '',
  roleName: '',
  sortNo: 0,
  status: 'ENABLED',
  remark: '',
})

const form = reactive<RoleFormData>(emptyForm())

const rules = {
  roleCode: [
    { required: true, message: '请输入角色编码', trigger: 'blur' },
    {
      pattern: /^[A-Za-z][A-Za-z0-9_]*$/,
      message: '必须以字母开头，只能包含字母、数字、下划线',
      trigger: 'blur',
    },
  ],
  roleName: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  // 同 menu.vue：显式清掉 empty 模板里没有的可选键，防止带着上次编辑的 id 走 update 分支
  form.id = undefined
  dialogTitle.value = '新增角色'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: RoleManageVO) => {
  form.id = row.id
  form.roleCode = row.roleCode
  form.roleName = row.roleName
  form.sortNo = row.sortNo
  form.status = row.status
  form.remark = row.remark || ''
  dialogTitle.value = `修改角色 - ${row.roleName}`
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    // 解构剥出 id：区分新增/修改分支，且不让 id 进请求体（后端从路径取）
    const { id, ...payload } = form
    if (id) {
      await updateRole(id, payload)
      ElMessage.success('角色已保存')
    } else {
      await createRole(payload)
      ElMessage.success('角色已创建')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: RoleManageVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除角色「${row.roleName}」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deleteRole(row.id)
    ElMessage.success('删除成功')
    await reloadAfterMutation()
  } catch (e) {
    // 管理员角色 / 有关联用户 后端拒删，message 即具体原因
    ElMessage.error((e as Error).message)
  }
}

// ===== 分配权限 + 菜单弹窗（两棵树：菜单树在上、权限树在下；整体替换语义）=====
const permDialogVisible = ref(false)
const permSaving = ref(false)
const permTree = ref<PermissionVO[]>([])
const checkedPermIds = ref<number[]>([])
const menuTree = ref<MenuVO[]>([])
const checkedMenuIds = ref<number[]>([])
const permRoleName = ref('')
/** 当前正在分配的角色行（提交用） */
const assignTarget = ref<RoleManageVO | null>(null)

// 两棵树各自的引用 + 筛选关键字（分配弹窗左右双栏：菜单树在左、操作权限树在右）
// el-tree 实例只需用到 filter 方法，这里用最小接口描述，避免引入 element-plus 深层类型
interface ElTreeExpose {
  filter: (value: string) => void
}
const menuTreeRef = ref<ElTreeExpose | null>(null)
const permTreeRef = ref<ElTreeExpose | null>(null)
const menuFilter = ref('')
const permFilter = ref('')
const filterMenu = (v: string) => menuTreeRef.value?.filter(v)
const filterPerm = (v: string) => permTreeRef.value?.filter(v)
// el-tree filter-node-method：按展示文案（目录/菜单=menuName，权限=permName）包含匹配
const menuNodeFilter = (value: string, data: { menuName?: string }) =>
  !value || (data.menuName ?? '').includes(value)
const permNodeFilter = (value: string, data: { permName?: string }) =>
  !value || (data.permName ?? '').includes(value)

const openAssignPerms = async (row: RoleManageVO) => {
  assignTarget.value = row
  try {
    // 先取四份数据（全量权限树 / 已授权权限 / 全量菜单树 / 已授权菜单），就绪后再开弹窗，
    // 避免弹窗先渲染空树、数据回来再重建造成的勾选闪烁
    const [ptree, pids, mtree, mids] = await Promise.all([
      listPermissions(),
      listRolePermIds(row.id),
      listMenus(),
      listRoleMenuIds(row.id),
    ])
    permTree.value = ptree
    checkedPermIds.value = pids
    menuTree.value = mtree
    checkedMenuIds.value = mids
    permRoleName.value = row.roleName
    permDialogVisible.value = true
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const handleAssignSubmit = async () => {
  const row = assignTarget.value
  if (!row) return
  permSaving.value = true
  try {
    // 权限与菜单整体替换语义：分别先删后插，同事务（后端）；前端一次并发提交
    await Promise.all([
      assignRolePerms(row.id, { permIds: checkedPermIds.value }),
      assignRoleMenus(row.id, { menuIds: checkedMenuIds.value }),
    ])
    ElMessage.success(`角色「${row.roleName}」权限与菜单已更新`)
    permDialogVisible.value = false
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    permSaving.value = false
  }
}

// 勾选变化同步：default-checked-keys 只是初始值，用户后续勾选必须靠 @check 回写，
// 否则保存提交的还是打开弹窗时的旧集合（2026-10 自查修复）
const onPermCheck = (_data: unknown, payload: { checkedKeys: (string | number)[] }) => {
  checkedPermIds.value = payload.checkedKeys.map(Number)
}

const onMenuCheck = (_data: unknown, payload: { checkedKeys: (string | number)[] }) => {
  checkedMenuIds.value = payload.checkedKeys.map(Number)
}

onMounted(loadRoles)
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar">
      <el-form-item label="角色名称">
        <el-input v-model="query.roleName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="query.status" placeholder="全部" clearable>
          <el-option label="启用" value="ENABLED" />
          <el-option label="停用" value="DISABLED" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增角色</el-button>
      <el-button :icon="Refresh" @click="loadRoles">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="roleList" border>
      <el-table-column prop="roleName" label="角色名称" min-width="160" />
      <el-table-column prop="roleCode" label="角色编码" min-width="160" />
      <el-table-column label="排序" width="90" align="center">
        <template #default="{ row }">
          <span class="sort-no">{{ row.sortNo }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="180">
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">修改</el-button>
          <el-button link type="primary" size="small" @click="openAssignPerms(row)">分配权限</el-button>
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
        @current-change="loadRoles"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="角色编码" prop="roleCode">
        <el-input
          v-model="form.roleCode"
          placeholder="如 role_finance（创建后不可修改）"
          :disabled="!!form.id"
          maxlength="64"
        />
        <span v-if="form.id" class="form-tip">创建后不可修改，程序按编码引用角色</span>
      </el-form-item>
      <el-form-item label="角色名称" prop="roleName">
        <el-input v-model="form.roleName" placeholder="请输入角色名称" maxlength="64" show-word-limit />
      </el-form-item>
      <el-form-item label="显示排序" prop="sortNo">
        <el-input-number v-model="form.sortNo" :min="0" :max="9999" controls-position="right" />
        <span class="form-tip">同级内数字越小越靠前</span>
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio label="ENABLED">启用</el-radio>
          <el-radio label="DISABLED">停用</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="选填" maxlength="512" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>

  <!-- 分配权限 + 菜单弹窗（左右双栏：菜单树在左、操作权限树在右；整体替换语义） -->
  <el-dialog v-model="permDialogVisible" :title="`分配权限与菜单 - ${permRoleName}`" width="760px">
    <div class="assign-cols">
      <!-- 左栏：菜单权限 -->
      <div class="assign-col">
        <div class="assign-title">菜单权限<span class="assign-sub">（控制侧边栏可见菜单）</span></div>
        <el-input
          v-model="menuFilter"
          class="assign-filter"
          placeholder="筛选菜单"
          clearable
          :prefix-icon="Search"
          @input="filterMenu"
        />
        <div class="tree-wrap">
          <el-tree
            ref="menuTreeRef"
            :data="menuTree"
            :props="{ label: 'menuName', children: 'children' }"
            node-key="id"
            show-checkbox
            :default-checked-keys="checkedMenuIds"
            default-expand-all
            :expand-on-click-node="false"
            :filter-node-method="menuNodeFilter"
            @check="onMenuCheck"
          />
        </div>
      </div>
      <!-- 右栏：操作权限 -->
      <div class="assign-col">
        <div class="assign-title">操作权限<span class="assign-sub">（按钮级 API 权限）</span></div>
        <el-input
          v-model="permFilter"
          class="assign-filter"
          placeholder="筛选权限"
          clearable
          :prefix-icon="Search"
          @input="filterPerm"
        />
        <div class="tree-wrap">
          <el-tree
            ref="permTreeRef"
            :data="permTree"
            :props="{ label: 'permName', children: 'children' }"
            node-key="id"
            show-checkbox
            :default-checked-keys="checkedPermIds"
            default-expand-all
            :expand-on-click-node="false"
            :filter-node-method="permNodeFilter"
            @check="onPermCheck"
          />
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="permDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="permSaving" @click="handleAssignSubmit">保存</el-button>
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
.sort-no {
  display: inline-block;
  min-width: 28px;
  color: #606266;
}
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
.assign-cols {
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.assign-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.assign-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.assign-sub {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}
.assign-filter {
  margin-bottom: 8px;
}
.tree-wrap {
  flex: 1;
  min-height: 0;
  max-height: 360px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px;
}
</style>
