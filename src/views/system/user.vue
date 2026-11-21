<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useUserStore } from '@/stores/user'
import EmptyState from '@/components/EmptyState.vue'
import type { FormInstance } from 'element-plus'
import { Delete, Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { listUsers, createUser, updateUser, deleteUser } from '@/api/user'
import { listOrgs } from '@/api/org'
import { listRoles } from '@/api/role'
import { listPostOptions } from '@/api/post'
import { listLevelOptions } from '@/api/level'
import type { UserFormData, UserVO } from '@/types/user'
import DictSelect from '@/components/DictSelect.vue'
import type { OrgVO } from '@/types/org'
import type { RoleManageVO } from '@/types/role'
import type { PostOptionVO } from '@/types/post'
import type { LevelOptionVO } from '@/types/level'
import { formatDateTime } from '@/utils/datetime'
import ImportButton from '@/components/ImportButton.vue'
const userStore = useUserStore()
const opVisible = computed(() => userStore.hasAnyPerm(['user:delete', 'user:edit']))

// ===== 查询条件 =====
const query = reactive({
  username: '',
  nickname: '',
  status: '',
  deptId: null as number | null,
})

const handleQuery = () => {
  pageNum.value = 1
  loadUsers()
}

const resetQuery = () => {
  query.username = ''
  query.nickname = ''
  query.status = ''
  query.deptId = null
  pageNum.value = 1
  loadUsers()
}

// ===== 列表数据（分页：默认每页 10 条，el-pagination 标准分页器）=====
const loading = ref(false)
const userList = ref<UserVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadUsers = async () => {
  loading.value = true
  try {
    const page = await listUsers(pageNum.value, pageSize.value, {
      username: query.username || undefined,
      nickname: query.nickname || undefined,
      status: query.status || undefined,
      deptId: query.deptId,
    })
    userList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// 增删后刷新：若把当前页最后一条删空了且不在第一页，自动回退一页，避免停在空白页
const reloadAfterMutation = async () => {
  await loadUsers()
  if (userList.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadUsers()
  }
}

// 切换每页条数时回到第一页（否则可能停在一个不存在的页码上）
const handleSizeChange = () => {
  pageNum.value = 1
  loadUsers()
}

// ===== 部门树（查询 + 表单共用；数据来自组织架构全量树）=====
const orgTree = ref<OrgVO[]>([])

// ===== 角色下拉（新增/修改弹窗用；后端无 /all 接口，按上限 500 拉全量）=====
const roleOptions = ref<RoleManageVO[]>([])

// ===== 岗位下拉（新增/修改弹窗用；轻量 /options 接口）=====
const postOptions = ref<PostOptionVO[]>([])

// ===== 职级下拉（新增/修改弹窗用；轻量 /options 接口；V39 新增）=====
const levelOptions = ref<LevelOptionVO[]>([])

const loadOptions = async () => {
  try {
    orgTree.value = await listOrgs()
    const page = await listRoles(1, 500)
    roleOptions.value = page.records
    postOptions.value = await listPostOptions()
    levelOptions.value = await listLevelOptions()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增用户')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): UserFormData => ({
  username: '',
  nickname: '',
  password: '',
  deptId: null,
  roleIds: [],
  status: 'ENABLED',
  phone: '',
  email: '',
  postId: null,
  levelCode: null,
})

const form = reactive<UserFormData>(emptyForm())

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]*$/,
      message: '必须以小写字母开头，只能包含小写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
  nickname: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入初始密码', trigger: 'blur' }],
  // 手机号非必填：空值放行；填了必须 11 位纯数字
  phone: [
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (!value) return callback()
        if (!/^\d{11}$/.test(value)) return callback(new Error('手机号需为 11 位数字'))
        callback()
      },
      trigger: 'blur',
    },
  ],
  // 邮箱非必填：空值放行；填了需符合基本邮箱格式（与 phone 同款口径，后端不重复校验）
  email: [
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (!value) return callback()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return callback(new Error('邮箱格式不正确'))
        callback()
      },
      trigger: 'blur',
    },
  ],
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  // 同 menu.vue：显式清掉 empty 模板里没有的可选键，防止带着上次编辑的 id 走 update 分支
  form.id = undefined
  dialogTitle.value = '新增用户'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: UserVO) => {
  form.id = row.id
  form.username = row.username
  form.nickname = row.nickname
  // 修改不提供改密码：password 置空且不参与校验（rules 里按 id 是否存在动态摘除）
  form.password = ''
  form.deptId = row.deptId
  form.roleIds = [...row.roleIds]
  form.status = row.status
  form.phone = row.phone || ''
  form.email = row.email || ''
  form.postId = row.postId
  form.levelCode = row.levelCode
  dialogTitle.value = `修改用户 - ${row.nickname}`
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
      await updateUser(id, payload)
      ElMessage.success('用户已保存')
    } else {
      await createUser(payload)
      ElMessage.success('用户已创建（首次登录需修改初始密码）')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: UserVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除用户「${row.nickname}（${row.username}）」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deleteUser(row.id)
    ElMessage.success('删除成功')
    await reloadAfterMutation()
  } catch (e) {
    // 管理员账号 / 当前登录用户 后端拒删，message 即具体原因
    ElMessage.error((e as Error).message)
  }
}

// 编辑态不校验密码（修改不提供改密码，见 openEdit）
const dynamicRules = computed(() => (form.id ? { ...rules, password: [] } : rules))

// 时间格式收敛到全局工具（原本地 replace('T',' ').slice 写法与其它页不一致）
const formatTime = formatDateTime

onMounted(() => {
  loadUsers()
  loadOptions()
})
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="用户账号">
        <el-input v-model="query.username" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="用户姓名">
        <el-input v-model="query.nickname" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="所属部门">
        <el-tree-select
          v-model="query.deptId"
          :data="orgTree"
          :props="{ label: 'orgName', value: 'id', children: 'children' }"
          node-key="id"
          check-strictly
          clearable
          placeholder="全部部门"
          class="query-tree-select"
        />
      </el-form-item>
      <el-form-item label="账号状态">
        <!-- 状态：字典 common_status 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.status" type-code="common_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" v-has-perm="'user:create'" @click="openCreate">新增用户</el-button>
      <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
      <ImportButton import-key="user_opening" label="导入期初用户" @imported="loadUsers" />
    </div>

    <el-table v-loading="loading" :data="userList" border>
      <el-table-column prop="username" label="用户名" min-width="140" />
      <el-table-column prop="nickname" label="姓名" min-width="100" />
      <el-table-column label="部门" min-width="140">
        <template #default="{ row }">{{ row.deptName || '—' }}</template>
      </el-table-column>
      <el-table-column label="角色" min-width="160">
        <template #default="{ row }">
          <template v-if="row.roleNames.length">
            <el-tag v-for="name in row.roleNames" :key="name" size="small" style="margin-right: 4px">
              {{ name }}
            </el-tag>
          </template>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="岗位" min-width="120">
        <template #default="{ row }">{{ row.postName || '—' }}</template>
      </el-table-column>
      <el-table-column label="职级" min-width="120">
        <template #default="{ row }">{{ row.levelName || '—' }}</template>
      </el-table-column>
      <el-table-column label="手机号" min-width="140">
        <template #default="{ row }">{{ row.phone || '—' }}</template>
      </el-table-column>
      <el-table-column label="邮箱" min-width="180">
        <template #default="{ row }">{{ row.email || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" min-width="170">
        <template #default="{ row }">{{ formatTime(row.lastLoginAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right" align="center" v-if="opVisible">
        <template #default="{ row }">
          <el-button link type="primary" size="small" v-has-perm="'user:edit'" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" :icon="Delete" v-has-perm="'user:delete'" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState description="暂无用户" />
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
        @current-change="loadUsers"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
    <el-form ref="formRef" :model="form" :rules="dynamicRules" label-width="100px" @submit.prevent>
      <el-form-item label="用户名" prop="username">
        <el-input
          v-model="form.username"
          placeholder="如 zhangsan（创建后不可修改）"
          :disabled="!!form.id"
          maxlength="32"
        />
        <span v-if="form.id" class="form-tip">创建后不可修改，账号是登录标识</span>
      </el-form-item>
      <el-form-item label="姓名" prop="nickname">
        <el-input v-model="form.nickname" placeholder="请输入姓名" maxlength="32" show-word-limit />
      </el-form-item>
      <el-form-item v-if="!form.id" label="初始密码" prop="password">
        <el-input v-model="form.password" type="password" placeholder="至少 6 位，首次登录强制修改" show-password />
      </el-form-item>
      <el-form-item label="所属部门" prop="deptId">
        <el-tree-select
          v-model="form.deptId"
          :data="orgTree"
          :props="{ label: 'orgName', value: 'id', children: 'children' }"
          node-key="id"
          check-strictly
          clearable
          placeholder="选择部门（可空）"
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="角色" prop="roleIds">
        <el-select v-model="form.roleIds" multiple filterable placeholder="选择角色（可空）" class="w-full">
          <el-option v-for="r in roleOptions" :key="r.id" :label="r.roleName" :value="r.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="岗位" prop="postId">
        <el-select v-model="form.postId" clearable filterable placeholder="选择岗位（可空）" class="w-full">
          <el-option v-for="p in postOptions" :key="p.id" :label="p.postName" :value="p.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="职级" prop="levelCode">
        <el-select v-model="form.levelCode" clearable filterable placeholder="选择职级（可空）" class="w-full">
          <el-option v-for="l in levelOptions" :key="l.id" :label="`${l.levelName}（${l.levelCode}）`" :value="l.levelCode" />
        </el-select>
      </el-form-item>
      <el-form-item label="手机号" prop="phone">
        <el-input v-model="form.phone" placeholder="选填，11 位手机号" maxlength="11" />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" placeholder="选填，如 name@example.com" maxlength="128" />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio label="ENABLED">启用</el-radio>
          <el-radio label="DISABLED">停用</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" v-has-perm="'user:create'" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 查询区：inline 表单 + 底部间距，与 toolbar/pagination-bar 同 pages.css 口径 */
.query-bar {
  margin-bottom: 4px;
}
/* 查询控件宽度已由 pages.css 统一为 200px（.query-bar .el-input/.el-select/.el-tree-select） */
.toolbar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
</style>
