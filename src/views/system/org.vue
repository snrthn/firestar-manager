<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import type { FormInstance } from 'element-plus'
import { Expand, Fold, Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { listOrgs, createOrg, updateOrg, deleteOrg } from '@/api/org'
import { listUserOptions } from '@/api/user'
import type { OrgFormData, OrgVO } from '@/types/org'
import type { UserOptionVO } from '@/types/user'
import DictSelect from '@/components/DictSelect.vue'

// ===== 列表数据 =====
const loading = ref(false)
const orgTree = ref<OrgVO[]>([])

// 展开态受控：el-table 的 expand-row-keys 决定哪些行展开，@expand-change 同步用户操作。
// ⚠️ key 必须是字符串：EP 内部 treeData 是 Record<string, TreeData>，
// updateTreeData 用 Object.keys(nested) 取出的 key 与 expand-row-keys 做 includes
// 比较——传 number[] 时 includes('19') 永远 false，所有行都不展开
// （2026-10-13 虎哥实测，同 menu.vue；EP 官方示例 expand-row-keys: ['1'] 即字符串）。
const expandRowKeys = ref<string[]>([])

// 收集所有「有 children 的部门节点」id —— 展开全部的可选集合
const collectOrgIds = (nodes: OrgVO[]): string[] => {
  const ids: string[] = []
  const walk = (list: OrgVO[]) => {
    for (const n of list) {
      if (n.children?.length) {
        ids.push(String(n.id))
        walk(n.children)
      }
    }
  }
  walk(nodes)
  return ids
}

const allOrgIds = computed(() => collectOrgIds(orgTree.value))
const allExpanded = computed(
  () => allOrgIds.value.length > 0 && allOrgIds.value.every((id) => expandRowKeys.value.includes(id))
)

const toggleExpandAll = () => {
  expandRowKeys.value = allExpanded.value ? [] : allOrgIds.value
}

const onExpandChange = (row: OrgVO, expanded: boolean) => {
  const key = String(row.id)
  const ids = new Set(expandRowKeys.value)
  if (expanded) {
    ids.add(key)
  } else {
    ids.delete(key)
  }
  expandRowKeys.value = [...ids]
}

const loadOrgs = async () => {
  loading.value = true
  try {
    const tree = await listOrgs()
    const firstLoad = orgTree.value.length === 0
    orgTree.value = tree
    if (firstLoad) {
      // 首次加载展开全部有子级的部门（若依默认行为）
      expandRowKeys.value = collectOrgIds(tree)
    } else {
      // 刷新：保留用户当前展开态，仅剔除已不存在的节点（删掉的部门）
      const alive = new Set<string>()
      const walk = (list: OrgVO[]) => {
        for (const n of list) {
          alive.add(String(n.id))
          if (n.children?.length) walk(n.children)
        }
      }
      walk(tree)
      expandRowKeys.value = expandRowKeys.value.filter((id) => alive.has(id))
    }
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// ===== 负责人下拉（启用用户选项，随页面加载一次；新增/修改弹窗共用）=====
const leaderOptions = ref<UserOptionVO[]>([])

const loadLeaderOptions = async () => {
  try {
    leaderOptions.value = await listUserOptions()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// ===== 查询条件（树表本地过滤：部门名称关键字 + 状态；命中节点的子孙整体保留）=====
const query = reactive({ orgName: '', status: '' })
const appliedQuery = reactive({ orgName: '', status: '' })

const handleQuery = () => {
  appliedQuery.orgName = query.orgName
  appliedQuery.status = query.status
}
const resetQuery = () => {
  query.orgName = ''
  query.status = ''
  handleQuery()
}

const matchOrg = (n: OrgVO) => {
  const nameHit = !appliedQuery.orgName || (n.orgName || '').includes(appliedQuery.orgName)
  const statusHit = !appliedQuery.status || n.status === appliedQuery.status
  return nameHit && statusHit
}

// 递归过滤：自身命中 → 整棵子树保留；否则保留「子孙有命中」的路径节点
const filterOrgTree = (nodes: OrgVO[]): OrgVO[] =>
  nodes
    .map((n) => {
      if (matchOrg(n)) return n
      const children = n.children?.length ? filterOrgTree(n.children) : []
      return children.length ? { ...n, children } : null
    })
    .filter((n): n is OrgVO => n !== null)

const filteredOrgTree = computed(() =>
  appliedQuery.orgName || appliedQuery.status ? filterOrgTree(orgTree.value) : orgTree.value
)

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增部门')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): OrgFormData => ({
  parentId: 0,
  orgName: '',
  leaderId: null,
  sortNo: 0,
  status: 'ENABLED',
})

const form = reactive<OrgFormData>(emptyForm())

const rules = {
  orgName: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
}

// 上级部门下拉：el-tree-select 只要 id/orgName/children 三兄弟，与 OrgVO 解耦
interface ParentNode {
  id: number
  orgName: string
  children?: ParentNode[]
}

const toParentNodes = (nodes: OrgVO[]): ParentNode[] =>
  nodes.map((n) => ({
    id: n.id,
    orgName: n.orgName,
    children: n.children?.length ? toParentNodes(n.children) : undefined,
  }))

// 编辑时把「自己及子孙」从上级部门树里摘掉，防止把上级设成自己的后代造成死循环
const excludeById = (nodes: OrgVO[], excludeId: number): OrgVO[] =>
  nodes
    .filter((n) => n.id !== excludeId)
    .map((n) => ({
      ...n,
      children: n.children?.length ? excludeById(n.children, excludeId) : undefined,
    }))

const parentTreeData = ref<ParentNode[]>([{ id: 0, orgName: '主部门' }])

const openCreate = (parentId: number) => {
  Object.assign(form, emptyForm())
  // emptyForm 不含 id 键，Object.assign 只覆盖不删除——上次编辑残留的 form.id
  // 不清掉的话，「新增」会带着旧 id 走 update 分支（同 menu.vue 2026-10 实录坑）。
  form.id = undefined
  form.parentId = parentId
  dialogTitle.value = parentId ? '新增子部门' : '新增主部门'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: OrgVO) => {
  form.id = row.id
  form.parentId = row.parentId
  form.orgName = row.orgName
  form.leaderId = row.leaderId
  form.sortNo = row.sortNo
  form.status = row.status || 'ENABLED'
  dialogTitle.value = `修改部门 - ${row.orgName}`
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

// dialog 打开瞬间用最新部门树重建上级下拉（编辑态排除自身子树）
watch(dialogVisible, (visible) => {
  if (!visible) return
  const tree = form.id ? excludeById(orgTree.value, form.id) : orgTree.value
  parentTreeData.value = [{ id: 0, orgName: '主部门', children: toParentNodes(tree) }]
})

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    // 解构剥出 id：既用于区分新增/修改分支，又让 payload 与后端 OrgRequest 对齐
    const { id, ...payload } = form
    if (id) {
      await updateOrg(id, payload)
      ElMessage.success('部门已保存')
    } else {
      await createOrg(payload)
      ElMessage.success('部门已创建')
    }
    dialogVisible.value = false
    await loadOrgs()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: OrgVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除部门「${row.orgName}」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deleteOrg(row.id)
    ElMessage.success('删除成功')
    await loadOrgs()
  } catch (e) {
    // 有子部门 / 有关联用户时后端拒删，message 即具体原因
    ElMessage.error((e as Error).message)
  }
}

onMounted(() => {
  loadOrgs()
  loadLeaderOptions()
})
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区（树表本地过滤） -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="部门名称">
        <el-input
          v-model="query.orgName"
          placeholder="模糊匹配"
          clearable
          @keyup.enter="handleQuery"
          @clear="handleQuery"
        />
      </el-form-item>
      <el-form-item label="状态">
        <!-- 状态：字典 common_status 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.status" type-code="common_status" placeholder="全部" @change="handleQuery" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" v-has-perm="'org:create'" @click="openCreate(0)">新增主部门</el-button>
      <el-button :icon="allExpanded ? Fold : Expand" @click="toggleExpandAll">
        {{ allExpanded ? '折叠全部' : '展开全部' }}
      </el-button>
      <el-button :icon="Refresh" @click="loadOrgs">刷新</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="filteredOrgTree"
      row-key="id"
      :expand-row-keys="expandRowKeys"
      :tree-props="{ children: 'children' }"
      @expand-change="onExpandChange"
      border
    >
      <el-table-column prop="orgName" label="部门名称" min-width="180" />
      <el-table-column label="负责人" min-width="120">
        <template #default="{ row }">{{ row.leaderName || '—' }}</template>
      </el-table-column>
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
      <el-table-column label="操作" width="180" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" v-has-perm="'org:create'" @click="openCreate(row.id)">新增</el-button>
          <el-button link type="primary" size="small" v-has-perm="'org:edit'" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" v-has-perm="'org:delete'" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState />
    </template>
    </el-table>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="上级部门" prop="parentId">
        <el-tree-select
          v-model="form.parentId"
          :data="parentTreeData"
          :props="{ label: 'orgName', value: 'id', children: 'children' }"
          node-key="id"
          check-strictly
          default-expand-all
          placeholder="选择上级部门（主部门选「主部门」）"
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="部门名称" prop="orgName">
        <el-input v-model="form.orgName" placeholder="请输入部门名称" maxlength="32" show-word-limit />
      </el-form-item>
      <el-form-item label="部门负责人" prop="leaderId">
        <el-select v-model="form.leaderId" placeholder="选择负责人（可空）" clearable class="w-full">
          <el-option
            v-for="u in leaderOptions"
            :key="u.id"
            :label="u.nickname"
            :value="u.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="显示排序" prop="sortNo">
        <el-input-number v-model="form.sortNo" :min="0" :max="9999" controls-position="right" />
        <span class="form-tip">同级内数字越小越靠前</span>
      </el-form-item>
      <el-form-item label="部门状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio label="ENABLED">启用</el-radio>
          <el-radio label="DISABLED">停用</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" v-has-perm="'org:create'" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.sort-no {
  display: inline-block;
  min-width: 28px;
  color: #606266;
}
</style>
