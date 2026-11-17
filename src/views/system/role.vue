<script setup lang="ts">
import {nextTick, onMounted, reactive, ref, computed} from 'vue'
import { useUserStore } from '@/stores/user'
import EmptyState from '@/components/EmptyState.vue'
import type { FormInstance } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import DictSelect from '@/components/DictSelect.vue'
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
const userStore = useUserStore()
const opVisible = computed(() => userStore.hasAnyPerm(['role:assign', 'role:delete', 'role:edit']))

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
  /** leafOnly=true 只勾叶子节点，父节点按联动自动呈半选/全选（回显语义正确） */
  setCheckedKeys: (keys: number[], leafOnly?: boolean) => void
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
    // 勾选态一次性编程式初始化。两条 EP 源码级教训（虎哥 2026-10-15 两次实测）：
    // ① 切勿把回写集合绑到 :default-checked-keys 做受控——组件 watch 该 prop，
    //    变化即走 setDefaultCheckedKey → 对父节点 setChecked(true, deep) 级联勾所有子孙，
    //    表现为「取消一个子项、兄弟全被勾上，再点一次才生效」。
    // ② setCheckedKeys 自身也有同一缺陷：_setCheckedKeys 对「集合内的父节点」先执行
    //    setChecked(true, deep=true) 深度勾整棵子树（tree-store.mjs:194），leafOnly 的
    //    事后修正只回溯非叶子子孙、叶子子孙被永久勾上，最后 reInitChecked 把父组恢复全选。
    //    而 onMenuCheck 合并 halfCheckedKeys 提交使半选父组 id 必然在库里——原样回显即
    //    「只勾了 B，重开窗口 B、C 全勾上」。
    // 故回显集合必须先 filterLeafIds 筛出纯叶子 id：只传叶子时 _setCheckedKeys 走
    // setChecked(true, false)，父组由 Node.setChecked → reInitChecked(parent) 自动半选/全选。
    // 之后用户操作只靠 @check 回写本地 ref（提交用），不再喂给树的任何 prop。
    await nextTick()
    // 右侧操作权限树：保持原非严格 + filterLeafIds 回显（分组父节点靠 reInitChecked 半选，无 bug）
    permTreeRef.value?.setCheckedKeys(filterLeafIds(permTree.value, pids), true)
    // 左侧菜单树：用完整 mids（不过滤父节点）初始化真相集，再手动投射 checked/indeterminate。
    // 修旧 bug：filterLeafIds 把「挂了按钮后变父节点」的页面误剥 → 侧栏丢页面。
    const allIds = collectAllIds(menuTree.value)
    menuCheckedSet = new Set(mids.filter((id) => allIds.has(id)))
    checkedMenuIds.value = [...menuCheckedSet]
    buildMenuDescLeafMap(menuTree.value)
    reconcilePageNodes()
    applyMenuTreeState()
    // 重开弹窗时把筛选关键字重新投射到树上：
    // 每次 openAssignPerms 都会整体替换 menuTree/permTree 数据 → el-tree 收到新 data 后
    // 重建节点树，内部筛选态（node.visible）随之丢失；而输入框是 v-model 绑在组件级 ref 上、
    // 弹窗未设 destroy-on-close，文字仍留在框里。结果就是「框里还有关键字、树却显示全量」。
    // 故这里在树数据/勾选态就绪后，按输入框当前值再调一次 filter，兑现「关闭再打开仍保持过滤」。
    // 关键字为空字符串时 filter('') 会走 filterNodeMethod 的 !value 短路 → 恢复全量，无副作用。
    menuTreeRef.value?.filter(menuFilter.value)
    permTreeRef.value?.filter(permFilter.value)
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

// 菜单树勾选：check-strictly 下完全手控。三态循环（页面有按钮子集时）：
// 空 → 半（页面可见、按钮保持当前/空）→ 全（连带全部按钮）→ 空。
// 渲染出来若是半选→再点全选；全选→再点空选；空选→再点半选（状态驱动，与到达方式无关）。
// 无按钮的纯页面 / 目录 / 外链：整段两态（全选/清空），不出现半选。
const onMenuCheck = (data: MenuVO) => {
  const btnKids = (data.children ?? []).filter((c) => c.menuType === 'BUTTON')
  if (data.menuType === 'BUTTON') {
    // 按钮独立 toggle，随后对账所属页面节点的 pageId 进/出集（页面可见性随按钮联动）
    if (menuCheckedSet.has(data.id)) menuCheckedSet.delete(data.id)
    else menuCheckedSet.add(data.id)
    reconcilePageNodes()
  } else if (data.menuType === 'MENU' && btnKids.length > 0) {
    // 页面节点（可能同时挂有子页面，如 字典管理(17)→字典数据(22)）：用整段后代 leafIds
    // 做三态，避免只动直接按钮而漏控子页面子树。
    //   EMPTY（页面未在集）→ 只加自身：半选（页面可见、按钮/子页空）
    //   HALF（页面在集但后代未全）→ leafIds 整段全加：全选
    //   FULL（页面+后代全在集）→ leafIds 整段全删：空选
    const inSet = menuCheckedSet.has(data.id)
    const allBtns = btnKids.every((c) => menuCheckedSet.has(c.id))
    const state: 'EMPTY' | 'HALF' | 'FULL' = !inSet ? 'EMPTY' : allBtns ? 'FULL' : 'HALF'
    const leafIds = menuDescLeafMap.get(data.id) ?? []
    if (state === 'EMPTY') {
      menuCheckedSet.add(data.id) // → 半选（页面可见，按钮保持当前/空）
    } else {
      // HALF → 全选（整段后代全加）；FULL → 清空（整段后代全删）
      leafIds.forEach((id) => (state === 'FULL' ? menuCheckedSet.delete(id) : menuCheckedSet.add(id)))
    }
  } else {
    // 目录 / 外链 / 无按钮纯页面：整段两态
    const leafIds = menuDescLeafMap.get(data.id) ?? []
    const allOn = leafIds.length > 0 && leafIds.every((id) => menuCheckedSet.has(id))
    if (allOn) leafIds.forEach((id) => menuCheckedSet.delete(id))
    else leafIds.forEach((id) => menuCheckedSet.add(id))
  }
  checkedMenuIds.value = [...menuCheckedSet]
  applyMenuTreeState()
}

// ===== 全选 / 清空（菜单树与权限树各自独立）=====
// 递归收集整棵树所有节点 id（含父与子）：默认非 check-strictly（父子联动）下，
// 这与「手动把每个节点逐个勾上」完全等价，保存提交的集合与手动全勾一致。
const collectTreeIds = (nodes: { id: number; children?: unknown }[]): number[] => {
  const ids: number[] = []
  const walk = (list: { id: number; children?: unknown }[]) => {
    for (const n of list) {
      ids.push(n.id)
      const kids = n.children
      if (Array.isArray(kids) && kids.length) {
        walk(kids as { id: number; children?: unknown }[])
      }
    }
  }
  walk(nodes)
  return ids
}

// 从树数据中筛出「纯叶子」节点 id（无 children 或 children 为空数组即叶子）。
// 用途：回显前过滤掉集合里的半选/全选父组 id——理由见 openAssignPerms 内注释
// （EP _setCheckedKeys 对集合内的父节点会深度勾选整棵子树，leafOnly 挡不住）
const filterLeafIds = (
  nodes: { id: number; children?: unknown }[],
  ids: number[],
): number[] => {
  const leafIds = new Set<number>()
  const walk = (list: { id: number; children?: unknown }[]) => {
    for (const n of list) {
      const kids = n.children
      if (Array.isArray(kids) && kids.length) {
        walk(kids as { id: number; children?: unknown }[])
      } else {
        leafIds.add(n.id)
      }
    }
  }
  walk(nodes)
  return ids.filter((id) => leafIds.has(id))
}

const checkAllMenu = () => {
  collectAuthorizableIds(menuTree.value).forEach((id) => menuCheckedSet.add(id))
  checkedMenuIds.value = [...menuCheckedSet]
  applyMenuTreeState()
}
const clearMenu = () => {
  menuCheckedSet.clear()
  checkedMenuIds.value = []
  applyMenuTreeState()
}
const checkAllPerm = () => {
  const ids = collectTreeIds(permTree.value)
  permTreeRef.value?.setCheckedKeys(ids)
  checkedPermIds.value = ids
}
const clearPerm = () => {
  permTreeRef.value?.setCheckedKeys([])
  checkedPermIds.value = []
}

// ===== 菜单树三态（check-strictly 手动状态机，2026-10-30 改造）=====
// 单一真相集：所有「在集」id 即最终写回 sys_role_menu 的集合，含页面 id（半选/全选态）
// 与按钮 id（已勾选）。后端 menus() 无叶子剪枝——页面 id 在集即返回该页 → 侧栏可见，
// 与按钮子集是否为空无关（满足「页面已选、按钮一个不选也要看到页面」）。
let menuCheckedSet = new Set<number>()
// 每个节点的「可授权叶子」集合（含自身可授权 id + 全部后代可授权 id），用于推导半选/全选
const menuDescLeafMap = new Map<number, number[]>()

const collectAllIds = (nodes: MenuVO[]): Set<number> => {
  const s = new Set<number>()
  const walk = (list: MenuVO[]) => {
    for (const n of list) {
      s.add(n.id)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return s
}

// 可授权单元：
//  - BUTTON：自身即一个可授权单元；
//  - MENU 且下挂按钮：视为「页面节点」，可授权集合 = 自身 + 全部 BUTTON 子节点；
//  - 纯页面 MENU / LINK（无按钮子集、且无任何可授权后代）：自身即为可授权单元
//    （修复：旧逻辑对「无按钮子节点的 MENU」走入 kids.forEach(walk) 透传，叶子页无子节点
//     导致既不被收集、menuDescLeafMap 又为空 → 全选勾不上、鼠标也勾不上）；
//  - CATALOG / 含子菜单的 MENU：递归收集后代可授权 id（容器本身不直接授权）。
const collectAuthorizableIds = (nodes: MenuVO[]): number[] => {
  const out: number[] = []
  const walk = (n: MenuVO): number[] => {
    const kids = n.children ?? []
    const btnKids = kids.filter((c) => c.menuType === 'BUTTON')
    if (n.menuType === 'BUTTON') {
      return [n.id]
    }
    if (n.menuType === 'MENU' && btnKids.length > 0) {
      // 自身 + 全部后代可授权 id（按钮孩子 + 其他页面/子页面孩子都要递归）。
      // 旧逻辑只递归按钮孩子，会漏掉「既挂按钮又挂子页面」的混合节点（见字典管理(17)→字典数据(22)），
      // 导致子页面子树既不进全选集合、也不进 menuDescLeafMap → 全选勾不上、点击也空操作。
      return [n.id, ...kids.flatMap((c) => walk(c))]
    }
    // CATALOG / 纯页面 MENU / LINK / 含子菜单的 MENU：递归后代
    const desc = kids.flatMap((c) => walk(c))
    if (desc.length === 0 && (n.menuType === 'MENU' || n.menuType === 'LINK')) {
      // 无后代可授权 id：自身是页面/外链 → 自身即授权单元；CATALOG 纯容器则忽略
      return [n.id]
    }
    return desc
  }
  nodes.forEach((n) => out.push(...walk(n)))
  return out
}

// 与 collectAuthorizableIds 同口径：为每个节点算出「其子树内的可授权 id 集合」，
// 用于 applyMenuTreeState 推导 全选/半选 与 onMenuCheck 的整段 toggle。
// 关键修复：纯页面 MENU / LINK（无按钮、无后代可授权 id）自身也要进集合，
// 否则该节点 leafIds 为空 → 全选勾不上、点击 toggle 空操作。
const buildMenuDescLeafMap = (nodes: MenuVO[]) => {
  menuDescLeafMap.clear()
  const walk = (n: MenuVO): number[] => {
    const kids = n.children ?? []
    const btnKids = kids.filter((c) => c.menuType === 'BUTTON')
    let ids: number[]
    if (n.menuType === 'BUTTON') {
      ids = [n.id]
    } else if (n.menuType === 'MENU' && btnKids.length > 0) {
      // 同 collectAuthorizableIds：递归全部孩子而非仅按钮孩子，保证子页面子树不漏
      ids = [n.id, ...kids.flatMap((c) => walk(c))]
    } else {
      const desc = kids.flatMap((c) => walk(c))
      if (desc.length === 0 && (n.menuType === 'MENU' || n.menuType === 'LINK')) {
        ids = [n.id]
      } else {
        ids = desc
      }
    }
    menuDescLeafMap.set(n.id, ids)
    return ids
  }
  nodes.forEach(walk)
}

// 页面节点一致性对账：带按钮的 MENU 页，只要「全部按钮勾选 / 部分按钮勾选 / 页面自身已在集」
// 任一成立即视为页面可见，pageId 必须进集（否则后端 menus() 不返回该页 → 侧栏看不见、
// 其上按钮也就无从使用）；三者皆否则从集移除（页面不可见）。
// 这是修复「勾完按钮父页面仍半选、到不了已选」的关键：按钮勾选态必须同步反映到页面节点。
const reconcilePageNodes = () => {
  const walk = (n: MenuVO) => {
    const kids = n.children ?? []
    const btnKids = kids.filter((c) => c.menuType === 'BUTTON')
    if (n.menuType === 'MENU' && btnKids.length > 0) {
      const allBtns = btnKids.every((c) => menuCheckedSet.has(c.id))
      const someBtns = btnKids.some((c) => menuCheckedSet.has(c.id))
      // 页面可见性 = 全按钮勾选 / 部分按钮勾选 / 页面自身已在集(onSelf)。
      // 用 onSelf 替代旧的 pageAuthBase 初始化快照：旧快照在用户点「清空」后不失效，导致
      // 「全选→清空→勾一个按钮」时所有原本全选的页面被拉回集合（虎哥 2026-10-31 复现：
      // 勾用户创建却多提交 25 个页面节点）。onSelf 只认当前实时集合，清空后页面出集、
      // 勾按钮只联动其直接父页面，不再牵连兄弟/跨模块页面。
      const onSelf = menuCheckedSet.has(n.id)
      const visible = allBtns || someBtns || onSelf
      if (visible) menuCheckedSet.add(n.id)
      else menuCheckedSet.delete(n.id)
    }
    kids.forEach(walk)
  }
  menuTree.value.forEach(walk)
}
const applyMenuTreeState = () => {
  const tree = menuTreeRef.value as unknown as {
    store: { nodesMap: Record<string, { data: MenuVO; key: number; indeterminate: boolean }> }
    setChecked: (key: number, checked: boolean, deep?: boolean) => void
  } | null
  if (!tree) return
  for (const node of Object.values(tree.store.nodesMap)) {
    const data = node.data
    const leafIds = menuDescLeafMap.get(data.id) ?? []
    const anyOn = leafIds.some((id) => menuCheckedSet.has(id))
    const allOn = leafIds.length > 0 && leafIds.every((id) => menuCheckedSet.has(id))
    const btnKids = (data.children ?? []).filter((c) => c.menuType === 'BUTTON')
    const isPageWithBtns = data.menuType === 'MENU' && btnKids.length > 0
    let checked: boolean
    let indeterminate: boolean
    if (isPageWithBtns) {
      const on = menuCheckedSet.has(data.id)
      checked = on
      // 半选 = 页面在集但按钮未全选；防御：页面不在集但存在已勾按钮也呈半选
      indeterminate = on ? !allOn : anyOn
    } else {
      checked = allOn
      indeterminate = anyOn && !allOn
    }
    tree.setChecked(node.key, checked, false)
    // setChecked 会复位 indeterminate，故其后显式写回（严格模式手动控制）
    node.indeterminate = indeterminate
  }
}

onMounted(loadRoles)
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="角色名称">
        <el-input v-model="query.roleName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="角色状态">
        <!-- 状态：字典 common_status 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.status" type-code="common_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" v-has-perm="'role:create'" @click="openCreate">新增角色</el-button>
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
      <el-table-column prop="remark" label="备注" min-width="260">
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right" align="center" v-if="opVisible">
        <template #default="{ row }">
          <el-button link type="primary" size="small" v-has-perm="'role:edit'" @click="openEdit(row)">修改</el-button>
          <el-button link type="primary" size="small" v-has-perm="'role:assign'" @click="openAssignPerms(row)">分配权限</el-button>
          <el-button link type="danger" size="small" v-has-perm="'role:delete'" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState description="暂无角色" />
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
        @current-change="loadRoles"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
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
      <el-button type="primary" :loading="saving" v-has-perm="'role:create'" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>

  <!-- 分配权限 + 菜单弹窗（左右双栏：菜单树在左、操作权限树在右；整体替换语义） -->
  <el-dialog v-model="permDialogVisible" :title="`分配权限与菜单 - ${permRoleName}`" width="1000px">
    <div class="assign-cols">
      <!-- 左栏：菜单权限 -->
      <div class="assign-col">
        <div class="assign-title">菜单权限<span class="assign-sub">（控制侧边栏可见菜单）</span></div>
        <div class="filter-row">
          <el-input
            v-model="menuFilter"
            class="assign-filter"
            placeholder="筛选菜单"
            clearable
            :prefix-icon="Search"
            @input="filterMenu"
          />
          <div class="tree-actions">
            <el-button @click="checkAllMenu">全选</el-button>
            <el-button @click="clearMenu">清空</el-button>
          </div>
        </div>
        <div class="tree-wrap">
          <!-- check-on-click-node：EP 默认只有叶子行整行可勾选（check-on-click-leaf 默认 true），
               目录节点行内除勾框外点击无效；显式开启后勾框+文本区域统一可点（展开图标仍独立） -->
          <el-tree
            ref="menuTreeRef"
            :data="menuTree"
            :props="{ label: 'menuName', children: 'children' }"
            node-key="id"
            show-checkbox
            check-strictly
            check-on-click-node
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
        <div class="filter-row">
          <el-input
            v-model="permFilter"
            class="assign-filter"
            placeholder="筛选权限"
            clearable
            :prefix-icon="Search"
            @input="filterPerm"
          />
          <div class="tree-actions">
            <el-button @click="checkAllPerm">全选</el-button>
            <el-button @click="clearPerm">清空</el-button>
          </div>
        </div>
        <div class="tree-wrap">
          <!-- check-on-click-node：EP 默认只有叶子行整行可勾选（check-on-click-leaf 默认 true），
               目录节点行内除勾框外点击无效；显式开启后勾框+文本区域统一可点（展开图标仍独立） -->
          <el-tree
            ref="permTreeRef"
            :data="permTree"
            :props="{ label: 'permName', children: 'children' }"
            node-key="id"
            show-checkbox
            check-on-click-node
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
      <el-button type="primary" :loading="permSaving" v-has-perm="'role:assign'" @click="handleAssignSubmit">保存</el-button>
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
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
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
/* 筛选输入框 + 全选/清空 同一行：输入框撑满剩余宽，按钮组贴右 */
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
/* 全选 / 清空：与底部取消同款默认按钮（32px 高，和筛选输入框等高对齐）。
   间距由 EP 相邻按钮自带 margin-left 提供，叠 gap 会双倍 */
.tree-actions {
  display: flex;
  flex-shrink: 0;
}
/* EP 相邻按钮默认 margin-left:12px，这里压到 6px 让两个按钮更紧凑。
   el-button 是子组件根元素，能继承父组件 scope 属性，无需 :deep() */
.tree-actions .el-button + .el-button {
  margin-left: 6px;
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
  flex: 1;
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
