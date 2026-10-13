<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import {
  listMenus,
  createMenu,
  updateMenu,
  deleteMenu,
  moveMenu,
} from '@/api/menu'
import type { MenuFormData, MenuVO } from '@/types/auth'

// ===== 列表数据 =====
const loading = ref(false)
const menuTree = ref<MenuVO[]>([])
// 刷新时自增：重挂载 el-table，让 default-expand-all 对刷新后的数据重新生效
// （default-expand-all 只在 table 首次挂载时求值，单纯换 data 不会重新展开）
const tableKey = ref(0)

// 同级邻居表：parentId → 按 sortNo/id 升序的兄弟节点，用于上移/下移按钮的禁用判断
const siblingsMap = ref<Map<number, MenuVO[]>>(new Map())

const rebuildSiblings = (nodes: MenuVO[]) => {
  const map = new Map<number, MenuVO[]>()
  const walk = (list: MenuVO[]) => {
    for (const n of list) {
      if (!map.has(n.parentId)) map.set(n.parentId, [])
      map.get(n.parentId)!.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  for (const list of map.values()) {
    list.sort((a, b) => a.sortNo - b.sortNo || a.id - b.id)
  }
  siblingsMap.value = map
}

const canMove = (row: MenuVO, dir: 'up' | 'down') => {
  const list = siblingsMap.value.get(row.parentId)
  if (!list) return false
  const idx = list.findIndex((n) => n.id === row.id)
  return dir === 'up' ? idx > 0 : idx >= 0 && idx < list.length - 1
}

const loadMenus = async () => {
  loading.value = true
  try {
    const tree = await listMenus()
    menuTree.value = tree
    rebuildSiblings(tree)
    tableKey.value++
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增菜单')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): MenuFormData => ({
  parentId: 0,
  menuName: '',
  routePath: '',
  component: '',
  permCode: '',
  menuType: 'MENU',
  sortNo: 0,
  visible: 1,
  status: 'ENABLED',
})

const form = reactive<MenuFormData>(emptyForm())

const rules = {
  menuName: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
  // 菜单类型为「菜单」时路由必填；目录允许为空（走 validator 动态判断）
  routePath: [
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (form.menuType === 'MENU' && !value) {
          callback(new Error('菜单类型为「菜单」时，路由地址必填'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

// 父菜单下拉：el-tree-select 只要 id/menuName/children 三兄弟，与 MenuVO 解耦
interface ParentNode {
  id: number
  menuName: string
  children?: ParentNode[]
}

const toParentNodes = (nodes: MenuVO[]): ParentNode[] =>
  nodes.map((n) => ({
    id: n.id,
    menuName: n.menuName,
    children: n.children?.length ? toParentNodes(n.children) : undefined,
  }))

// 编辑时把「自己及子孙」从父菜单树里摘掉，防止把父菜单设成自己的后代造成死循环
const excludeById = (nodes: MenuVO[], excludeId: number): MenuVO[] =>
  nodes
    .filter((n) => n.id !== excludeId)
    .map((n) => ({
      ...n,
      children: n.children?.length ? excludeById(n.children, excludeId) : undefined,
    }))

const parentTreeData = ref<ParentNode[]>([{ id: 0, menuName: '主类目' }])

const openCreate = (parentId: number) => {
  Object.assign(form, emptyForm())
  // emptyForm 不含 id 键，Object.assign 只覆盖不删除——上次编辑残留的 form.id
  // 不清掉的话，「新增」会带着旧 id 走 update 分支，把那条菜单改成新表单内容。
  form.id = undefined
  form.parentId = parentId
  dialogTitle.value = parentId ? '新增子菜单' : '新增顶级菜单'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: MenuVO) => {
  form.id = row.id
  form.parentId = row.parentId
  form.menuName = row.menuName
  form.routePath = row.routePath || ''
  form.component = row.component || ''
  form.permCode = row.permCode || ''
  form.menuType = (row.menuType as 'CATALOG' | 'MENU') || 'MENU'
  form.sortNo = row.sortNo
  form.visible = row.visible
  form.status = row.status || 'ENABLED'
  dialogTitle.value = `修改菜单 - ${row.menuName}`
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

// dialog 打开瞬间用最新菜单树重建父级下拉（编辑态排除自身子树）
watch(
  dialogVisible,
  (visible) => {
    if (!visible) return
    const tree = form.id ? excludeById(menuTree.value, form.id) : menuTree.value
    parentTreeData.value = [{ id: 0, menuName: '主类目', children: toParentNodes(tree) }]
  },
)

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    // 解构剥出 id：既用于区分新增/修改分支，又让 payload 与后端 MenuRequest 对齐
    const { id, ...payload } = form
    if (id) {
      await updateMenu(id, payload)
      ElMessage.success('菜单已保存')
    } else {
      await createMenu(payload)
      ElMessage.success('菜单已创建')
    }
    dialogVisible.value = false
    await loadMenus()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleMove = async (row: MenuVO, dir: 'up' | 'down') => {
  try {
    await moveMenu(row.id, dir)
    await loadMenus()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const handleDelete = async (row: MenuVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除菜单「${row.menuName}」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deleteMenu(row.id)
    ElMessage.success('删除成功')
    await loadMenus()
  } catch (e) {
    // 有子菜单时后端拒删，message 即具体原因
    ElMessage.error((e as Error).message)
  }
}

onMounted(loadMenus)
</script>

<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate(0)">新增顶级菜单</el-button>
      <el-button :icon="Refresh" @click="loadMenus">刷新</el-button>
    </div>

    <el-table
      :key="tableKey"
      v-loading="loading"
      :data="menuTree"
      row-key="id"
      :tree-props="{ children: 'children' }"
      default-expand-all
      border
    >
      <el-table-column prop="menuName" label="菜单名称" min-width="180" />
      <el-table-column label="排序" width="150" align="center">
        <template #default="{ row }">
          <span class="sort-no">{{ row.sortNo }}</span>
          <el-button
            link
            type="primary"
            size="small"
            :disabled="!canMove(row, 'up')"
            @click="handleMove(row, 'up')"
          >
            上移
          </el-button>
          <el-button
            link
            type="primary"
            size="small"
            :disabled="!canMove(row, 'down')"
            @click="handleMove(row, 'down')"
          >
            下移
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="路由地址" min-width="140">
        <template #default="{ row }">{{ row.routePath || '—' }}</template>
      </el-table-column>
      <el-table-column label="组件路径" min-width="140">
        <template #default="{ row }">{{ row.component || '—' }}</template>
      </el-table-column>
      <el-table-column label="权限编码" min-width="130">
        <template #default="{ row }">{{ row.permCode || '—' }}</template>
      </el-table-column>
      <el-table-column label="类型" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.menuType === 'CATALOG' ? 'warning' : 'success'" size="small">
            {{ row.menuType === 'CATALOG' ? '目录' : '菜单' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="显示" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.visible === 1 ? 'success' : 'info'" size="small">
            {{ row.visible === 1 ? '显示' : '隐藏' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openCreate(row.id)">新增</el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="菜单类型" prop="menuType">
        <el-radio-group v-model="form.menuType">
          <el-radio label="CATALOG">目录</el-radio>
          <el-radio label="MENU">菜单</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="上级菜单" prop="parentId">
        <el-tree-select
          v-model="form.parentId"
          :data="parentTreeData"
          :props="{ label: 'menuName', value: 'id', children: 'children' }"
          node-key="id"
          check-strictly
          default-expand-all
          placeholder="选择上级菜单（顶级选「主类目」）"
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="菜单名称" prop="menuName">
        <el-input v-model="form.menuName" placeholder="请输入菜单名称" maxlength="32" show-word-limit />
      </el-form-item>
      <el-form-item label="显示排序" prop="sortNo">
        <el-input-number v-model="form.sortNo" :min="0" :max="9999" controls-position="right" />
        <span class="form-tip">同级内数字越小越靠前</span>
      </el-form-item>
      <el-form-item label="路由地址" prop="routePath">
        <el-input
          v-model="form.routePath"
          :placeholder="form.menuType === 'MENU' ? '如 /system/user（菜单必填）' : '目录可不填'"
        />
      </el-form-item>
      <el-form-item label="组件路径" prop="component">
        <el-input v-model="form.component" placeholder="如 system/user（目录可不填）" />
      </el-form-item>
      <el-form-item label="权限编码" prop="permCode">
        <el-input v-model="form.permCode" placeholder="如 system:user（可空）" />
      </el-form-item>
      <el-form-item label="显示状态" prop="visible">
        <el-radio-group v-model="form.visible">
          <el-radio :label="1">显示</el-radio>
          <el-radio :label="0">隐藏</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="菜单状态" prop="status">
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
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.sort-no {
  display: inline-block;
  min-width: 28px;
  margin-right: 4px;
  color: #606266;
}
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
.w-full {
  width: 100%;
}
</style>
