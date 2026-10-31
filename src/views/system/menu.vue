<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import type { FormInstance } from 'element-plus'
import { Expand, Fold, Plus, Refresh, Folder, Search } from '@element-plus/icons-vue'
// 菜单图标注册表（若依 / vue-element-admin 成熟做法：存图标组件名，<component :is> 渲染，空值兜底 Folder）
import { resolveMenuIcon, ELEMENT_ICON_LIST } from '@/utils/elementIcons'
import DictSelect from '@/components/DictSelect.vue'
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
// 字典消费样板（虎哥 2026-10-15）：菜单类型不再是页面硬编码 radio，
// 改为读 sys_dict_data 的 menu_type——在字典维护页停用某类型，
// 本弹窗实时少一个选项。约定详见 useDict.ts 文件头，后续业务页照此接入。
import { loadDictOptions, type DictOption } from '@/composables/useDict'
import type { MenuFormData, MenuVO } from '@/types/auth'

// ===== 菜单类型选项：字典驱动（消费样板）=====
// 弹窗 radio 的选项来源。字典不可用（接口炸/全被停用）时回退内置四型，
// 保证弹窗永远可用——兜底值即后端 applyForm 白名单，与种子同域。
const menuTypeOptions = ref<DictOption[]>([])
const loadMenuTypeOptions = async () => {
  const options = await loadDictOptions('menu_type')
  menuTypeOptions.value = options.length
    ? options
    : [
        { value: 'CATALOG', label: '目录', style: null },
        { value: 'MENU', label: '菜单', style: null },
        { value: 'BUTTON', label: '按钮', style: null },
        { value: 'LINK', label: '外链', style: null },
      ]
}

// ===== 列表数据 =====
const loading = ref(false)
const menuTree = ref<MenuVO[]>([])

// 展开态受控：el-table 的 expand-row-keys 决定哪些行展开，@expand-change 同步用户操作。
// ⚠️ key 必须是字符串：EP 内部 treeData 是 Record<string, TreeData>，
// updateTreeData 用 Object.keys(nested) 取出的 key 与 expand-row-keys 做 includes
// 比较——传 number[] 时 includes('19') 永远 false，所有行都不展开，
// 表现为「树表只剩顶级目录、点击展开箭头无效」（2026-10-13 虎哥实测，
// 与 EP 官方文档示例 expand-row-keys: ['1'] 的字符串用法对齐）。
const expandRowKeys = ref<string[]>([])

// 收集所有「有 children 的目录节点」id —— 展开全部的可选集合
const collectCatalogIds = (nodes: MenuVO[]): string[] => {
  const ids: string[] = []
  const walk = (list: MenuVO[]) => {
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

const allCatalogIds = computed(() => collectCatalogIds(menuTree.value))
const allExpanded = computed(
  () => allCatalogIds.value.length > 0 && allCatalogIds.value.every((id) => expandRowKeys.value.includes(id))
)

const toggleExpandAll = () => {
  expandRowKeys.value = allExpanded.value ? [] : allCatalogIds.value
}

const onExpandChange = (row: MenuVO, expanded: boolean) => {
  const key = String(row.id)
  const ids = new Set(expandRowKeys.value)
  if (expanded) {
    ids.add(key)
  } else {
    ids.delete(key)
  }
  expandRowKeys.value = [...ids]
}

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
    const firstLoad = menuTree.value.length === 0
    menuTree.value = tree
    rebuildSiblings(tree)
    if (firstLoad) {
      // 虎哥 2026-10-14：菜单管理页树默认折叠（仅用户手动点开的目录才展开），不再首次全展开
      expandRowKeys.value = []
    } else {
      // 刷新：保留用户当前展开态，仅剔除已不存在的节点（删掉的菜单/目录）
      const alive = new Set<string>()
      const walk = (list: MenuVO[]) => {
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

// ===== 查询条件（树表本地过滤：菜单名称关键字 + 状态；命中节点的子孙整体保留）=====
const query = reactive({ menuName: '', status: '' })
const appliedQuery = reactive({ menuName: '', status: '' })

const handleQuery = () => {
  appliedQuery.menuName = query.menuName
  appliedQuery.status = query.status
}
const resetQuery = () => {
  query.menuName = ''
  query.status = ''
  handleQuery()
}

const matchMenu = (n: MenuVO) => {
  const nameHit = !appliedQuery.menuName || (n.menuName || '').includes(appliedQuery.menuName)
  const statusHit = !appliedQuery.status || n.status === appliedQuery.status
  return nameHit && statusHit
}

// 递归过滤：自身命中 → 整棵子树保留；否则保留「子孙有命中」的路径节点
const filterMenuTree = (nodes: MenuVO[]): MenuVO[] =>
  nodes
    .map((n) => {
      if (matchMenu(n)) return n
      const children = n.children?.length ? filterMenuTree(n.children) : []
      return children.length ? { ...n, children } : null
    })
    .filter((n): n is MenuVO => n !== null)

const filteredMenuTree = computed(() =>
  appliedQuery.menuName || appliedQuery.status ? filterMenuTree(menuTree.value) : menuTree.value
)

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增菜单')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): MenuFormData => ({
  parentId: 0,
  menuName: '',
  routePath: '',
  linkUrl: '',
  component: '',
  permCode: '',
  menuType: 'MENU',
  sortNo: 0,
  visible: 1,
  status: 'ENABLED',
  isCache: 0,
  icon: '',
})

// 图标选择器：弹层可见态 + 搜索关键字 + 当前选中图标预览（空值兜底 Folder）
const iconPopoverVisible = ref(false)
const iconKeyword = ref('')
const currentIconComp = computed(() => resolveMenuIcon(form.icon) || Folder)
const filteredIcons = computed(() =>
  iconKeyword.value
    ? ELEMENT_ICON_LIST.filter((i) => i.name.toLowerCase().includes(iconKeyword.value.toLowerCase()))
    : ELEMENT_ICON_LIST,
)
const selectIcon = (name: string) => {
  form.icon = name
  iconPopoverVisible.value = false
}
const clearIcon = () => {
  form.icon = ''
  iconPopoverVisible.value = false
}

const form = reactive<MenuFormData>(emptyForm())

// 外链地址正则：只放行 http/https 协议 + 非空白主体（与后端 MenuServiceImpl
// applyForm 同款——双端校验，绕过前端直发也要挡住 javascript:/data: 等危险协议）
const LINK_URL_PATTERN = /^https?:\/\/\S+$/i

const rules = {
  menuName: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
  // 上级菜单：后端无强约束，前端按逐级下挂规则兜底拦截（防越级/逆向反挂）
  parentId: [
    {
      validator: (_rule: unknown, value: number, callback: (err?: Error) => void) => {
        if (value == null) {
          callback(new Error('请选择上级菜单'))
          return
        }
        if (value === 0) {
          if (form.menuType === 'BUTTON') {
            callback(new Error('按钮不可置于顶级，必须挂在菜单下'))
            return
          }
          callback()
          return
        }
        const p = findNode(menuTree.value, value)
        const allowed = allowedParentTypes(form.menuType)
        if (!p || !p.menuType || !allowed.includes(p.menuType)) {
          callback(
            new Error(
              `${menuTypeLabel(form.menuType)}只能挂在 ${allowed.map(menuTypeLabel).join('/')} 下`,
            ),
          )
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  // 路由地址：仅「菜单」型必填（其它类型走 validator 动态判断；目录允许为空）
  routePath: [
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (form.menuType === 'MENU' && !value) {
          callback(new Error('菜单类型为「菜单」时，路由地址必填'))
        } else if (value && /^https?:\/\//i.test(value)) {
          callback(new Error('路由地址请填站内相对路径；外部链接请选择「外链」类型'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  // 链接地址：仅「外链」型必填 + 协议白名单校验（防乱填）
  linkUrl: [
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (form.menuType === 'LINK') {
          if (!value) {
            callback(new Error('菜单类型为「外链」时，链接地址必填'))
          } else if (!LINK_URL_PATTERN.test(value)) {
            callback(new Error('链接地址须以 http:// 或 https:// 开头，且不能含空白字符'))
          } else {
            callback()
          }
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  // 权限编码：仅「按钮」型必填（按钮型菜单的存在意义就是权限节点）
  permCode: [
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (form.menuType === 'BUTTON' && !value) {
          callback(new Error('菜单类型为「按钮」时，权限编码必填'))
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
  menuType?: string
  disabled?: boolean
  children?: ParentNode[]
}

// 逐级下挂规则：当前菜单类型允许挂在哪些父类型下（不可越级、不可逆向反挂）。
// 目录/菜单/外链 → 目录 / 顶级 / 菜单（菜单可挂菜单：放开「主菜单页的二级页」，
//   种子里「字典数据」(MENU) 即挂在「字典管理」(MENU) 下，属合法的多级菜单形态；
//   若不放开，该存量数据在编辑器里父级被灰掉、保存还会被 parentId 校验器驳回）；
// 按钮 → 菜单（按钮必须挂在菜单下，二级页同样可挂按钮）。
const allowedParentTypes = (type: string): string[] => {
  switch (type) {
    case 'CATALOG':
    case 'MENU':
    case 'LINK':
      return ['CATALOG', 'ROOT', 'MENU']
    case 'BUTTON':
      return ['MENU']
    default:
      return []
  }
}

const findNode = (nodes: MenuVO[], id: number): MenuVO | null => {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const f = findNode(n.children, id)
      if (f) return f
    }
  }
  return null
}

// ===== 正向下挂规则（父级类型 → 允许的子类型）：驱动「菜单类型」单选随已选父级冻结 =====
// 这是用户 2026-10-30 明确的交互方向：先选父级，再据此冻结非法的子类型选项。
// 与 allowedParentTypes（子→父，反向约束，父级下拉兜底）互为镜像：
//   父=主类目(ROOT) → 子可为 目录/菜单/外链（按钮必须挂菜单下，故按钮禁）
//   父=目录(CATALOG) → 子可为 目录/菜单/外链（目录允许嵌套目录，是合法形态；按钮禁）
//   父=菜单(MENU)    → 子可为 菜单(主菜单的二级页)/按钮（即用户举例「父级是菜单，目录冻结不能选」；
//                       并放开「页面下也能挂页面」，二级页视觉归属更干净）
//   父=外链(LINK)/按钮(BUTTON) → 叶子，不可再下挂（列表上其「新增」按钮已隐藏）
// 注意：目录套目录、菜单套菜单 均放行（与反向 allowedParentTypes 保持一致），否则 watch
//       会把这些合法嵌套的类型自动改回，等于变相堵死。
const allowedChildTypes = (parentType: string): string[] => {
  switch (parentType) {
    case 'ROOT':
      return ['CATALOG', 'MENU', 'LINK']
    case 'CATALOG':
      return ['CATALOG', 'MENU', 'LINK']
    case 'MENU':
      return ['MENU', 'BUTTON']
    case 'LINK':
    case 'BUTTON':
      return []
    default:
      return ['CATALOG', 'MENU', 'LINK', 'BUTTON']
  }
}

// 已选父级的类型（主类目视为 ROOT）；用于驱动「菜单类型」单选的可选项冻结
const selectedParentType = computed<string>(() => {
  if (form.parentId === 0) return 'ROOT'
  const p = findNode(menuTree.value, form.parentId)
  return (p?.menuType as string) ?? ''
})

// 某菜单类型在「当前已选父级」下是否非法（应在单选里冻结）
const isTypeDisabled = (type: string): boolean =>
  !allowedChildTypes(selectedParentType.value).includes(type)

// 父级类型 → 默认子类型（保证起点即合法，与 openCreate 推导一致）
const defaultTypeForParent = (parentType: string): MenuFormData['menuType'] | '' => {
  switch (parentType) {
    case 'ROOT':
      return 'CATALOG'
    case 'CATALOG':
    case 'MENU':
      return 'MENU'
    default:
      return ''
  }
}

// 切换父级时：若当前菜单类型在新父级下非法，自动回落到该父级下的默认类型，
// 避免表单停在「类型被冻结却已选中」的非法态（如父级从主类目切到某菜单，目录即被冻结）
watch(
  () => form.parentId,
  () => {
    const allowed = allowedChildTypes(selectedParentType.value)
    if (allowed.length && !allowed.includes(form.menuType)) {
      const d = defaultTypeForParent(selectedParentType.value)
      if (d) form.menuType = d
    }
  },
)

// 按当前 form.menuType 给每个候选父节点打 disabled：非法的父类型一律禁用
const buildParentTree = (nodes: MenuVO[]): ParentNode[] =>
  nodes.map((n) => ({
    id: n.id,
    menuName: n.menuName,
    menuType: n.menuType,
    disabled: !allowedParentTypes(form.menuType).includes(n.menuType ?? ''),
    children: n.children?.length ? buildParentTree(n.children) : undefined,
  }))

// 编辑时把「自己及子孙」从父菜单树里摘掉，防止把父菜单设成自己的后代造成死循环
const excludeById = (nodes: MenuVO[], excludeId: number): MenuVO[] =>
  nodes
    .filter((n) => n.id !== excludeId)
    .map((n) => ({
      ...n,
      children: n.children?.length ? excludeById(n.children, excludeId) : undefined,
    }))

// 父级下拉：编辑态排除自身子树（防逆向反挂成环）；按当前类型禁用非法父选项（逐级下挂）。
// 改为 computed：随 form.id / form.menuType / menuTree 自动重算，无需 dialogVisible watch。
const parentTreeData = computed<ParentNode[]>(() => {
  const src = form.id ? excludeById(menuTree.value, form.id) : menuTree.value
  return [
    {
      id: 0,
      menuName: '主类目',
      menuType: 'ROOT',
      disabled: !allowedParentTypes(form.menuType).includes('ROOT'),
      children: buildParentTree(src),
    },
  ]
})

const openCreate = (parentId: number) => {
  Object.assign(form, emptyForm())
  // emptyForm 不含 id 键，Object.assign 只覆盖不删除——上次编辑残留的 form.id
  // 不清掉的话，「新增」会带着旧 id 走 update 分支，把那条菜单改成新表单内容。
  form.id = undefined
  form.parentId = parentId
  // 默认类型按父级推导，保证「新增」起点即合法：顶级→目录；其余（目录/菜单/外链父级）→菜单。
  // 父级是菜单时即「主菜单的二级页」，与放开页面下挂页面的约定一致（仍可在弹窗里改成按钮）。
  if (parentId === 0) {
    form.menuType = 'CATALOG'
  } else {
    form.menuType = 'MENU'
  }
  dialogTitle.value = parentId ? '新增子菜单' : '新增顶级菜单'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: MenuVO) => {
  form.id = row.id
  form.parentId = row.parentId
  form.menuName = row.menuName
  form.routePath = row.routePath || ''
  form.linkUrl = row.linkUrl || ''
  form.component = row.component || ''
  form.permCode = row.permCode || ''
  form.menuType = row.menuType || 'MENU'
  form.sortNo = row.sortNo
  form.visible = row.visible
  form.status = row.status || 'ENABLED'
  form.isCache = row.isCache ?? 0
  form.icon = row.icon || ''
  dialogTitle.value = `修改菜单 - ${row.menuName}`
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    // 解构剥出 id：既用于区分新增/修改分支，又让 payload 与后端 MenuRequest 对齐
    const { id, ...rest } = form
    // 按类型净化 payload：表单按类型隐藏的字段一律置空/归一，避免隐藏字段带旧值
    // 撞后端强校验（如非 MENU 型残留 routePath → 「仅菜单类型可填路由地址」）。
    // 用户在弹窗里来回切类型时不清空（体验优先），净化集中在提交口。
    const payload: MenuFormData = { ...rest }
    if (payload.menuType !== 'MENU') {
      payload.routePath = ''
      payload.component = ''
      payload.isCache = 0
    }
    if (payload.menuType !== 'LINK') payload.linkUrl = ''
    if (payload.menuType === 'CATALOG' || payload.menuType === 'LINK') payload.permCode = ''
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

// 菜单类型展示辅助（列表 tag 用；域值与后端 applyForm 白名单对齐）
const MENU_TYPE_META: Record<string, { label: string; tag: 'warning' | 'success' | 'danger' | 'info' }> = {
  CATALOG: { label: '目录', tag: 'warning' },
  MENU: { label: '菜单', tag: 'success' },
  BUTTON: { label: '按钮', tag: 'danger' },
  LINK: { label: '外链', tag: 'info' },
}
const menuTypeLabel = (t: string) => MENU_TYPE_META[t]?.label ?? t
const menuTypeTagType = (t: string): 'warning' | 'success' | 'danger' | 'info' => MENU_TYPE_META[t]?.tag ?? 'info'

onMounted(() => {
  loadMenus()
  loadMenuTypeOptions()
})
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区（树表本地过滤） -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="菜单名称">
        <el-input
          v-model="query.menuName"
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
      <el-button type="primary" :icon="Plus" v-has-perm="'menu:create'" @click="openCreate(0)">新增顶级菜单</el-button>
      <el-button :icon="allExpanded ? Fold : Expand" @click="toggleExpandAll">
        {{ allExpanded ? '折叠全部' : '展开全部' }}
      </el-button>
      <el-button :icon="Refresh" @click="loadMenus">刷新</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="filteredMenuTree"
      row-key="id"
      :expand-row-keys="expandRowKeys"
      :tree-props="{ children: 'children' }"
      @expand-change="onExpandChange"
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
      <el-table-column label="链接地址" min-width="140">
        <template #default="{ row }">
          <span v-if="row.linkUrl" class="link-url" :title="row.linkUrl">{{ row.linkUrl }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="组件路径" min-width="140">
        <template #default="{ row }">{{ row.component || '—' }}</template>
      </el-table-column>
      <el-table-column label="权限编码" min-width="130">
        <template #default="{ row }">{{ row.permCode || '—' }}</template>
      </el-table-column>
      <el-table-column label="类型" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="menuTypeTagType(row.menuType)" size="small">
            {{ menuTypeLabel(row.menuType) }}
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
      <el-table-column label="缓存" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isCache === 1 ? 'warning' : 'info'" size="small">
            {{ row.isCache === 1 ? '缓存' : '—' }}
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
          <el-button
            link
            type="primary"
            size="small"
            v-has-perm="'menu:create'"
            v-if="row.menuType === 'CATALOG' || row.menuType === 'MENU'"
            @click="openCreate(row.id)"
          >新增</el-button>
          <el-button link type="primary" size="small" v-has-perm="'menu:edit'" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" v-has-perm="'menu:delete'" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState description="暂无菜单" />
    </template>
    </el-table>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="菜单类型" prop="menuType">
        <!-- 选项来自字典 menu_type（启用中、按 sort_no 升序）：
             停用「外链」后这里只剩三个选项，字典维护即业务生效 -->
        <el-radio-group v-model="form.menuType">
          <el-radio v-for="opt in menuTypeOptions" :key="opt.value" :label="opt.value" :disabled="isTypeDisabled(opt.value)">
            {{ opt.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="上级菜单" prop="parentId">
        <el-tree-select
          v-model="form.parentId"
          :data="parentTreeData"
          :props="{ label: 'menuName', value: 'id', children: 'children', disabled: 'disabled' }"
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
      <!-- 字段按类型联动显隐（降低心智，同 RuoYi menu 页思路）：
           按钮型是权限节点，不占侧栏位置 → 无图标/无显示状态；
           外链走 <a target=_blank> → 无路由/组件/缓存；
           缓存仅菜单型有意义（目录/按钮/外链无 SPA 页面可缓存） -->
      <el-form-item v-if="form.menuType !== 'BUTTON'" label="菜单图标" prop="icon">
        <el-popover v-model:visible="iconPopoverVisible" :width="380" trigger="click" placement="bottom-start">
          <template #reference>
            <el-button :icon="currentIconComp" plain>{{ form.icon || '选择图标' }}</el-button>
          </template>
          <div class="icon-picker">
            <el-input v-model="iconKeyword" placeholder="搜索图标" clearable size="small" class="icon-search" />
            <div class="icon-grid">
              <div
                v-for="item in filteredIcons"
                :key="item.name"
                class="icon-cell"
                :class="{ active: form.icon === item.name }"
                @click="selectIcon(item.name)"
              >
                <el-icon :size="18"><component :is="item.component" /></el-icon>
                <span class="icon-name">{{ item.name }}</span>
              </div>
            </div>
          </div>
        </el-popover>
        <el-button v-if="form.icon" link type="primary" size="small" class="clear-icon" @click="clearIcon">清除</el-button>
      </el-form-item>
      <el-form-item label="显示排序" prop="sortNo">
        <el-input-number v-model="form.sortNo" :min="0" :max="9999" controls-position="right" />
        <span class="form-tip">同级内数字越小越靠前</span>
      </el-form-item>
      <el-form-item v-if="form.menuType === 'MENU'" label="路由地址" prop="routePath">
        <el-input
          v-model="form.routePath"
          placeholder="如 /system/user（菜单必填）"
        />
      </el-form-item>
      <el-form-item v-if="form.menuType === 'MENU'" label="组件路径" prop="component">
        <el-input v-model="form.component" placeholder="如 system/user（菜单必填）" />
      </el-form-item>
      <el-form-item v-if="form.menuType === 'LINK'" label="链接地址" prop="linkUrl">
        <el-input
          v-model="form.linkUrl"
          placeholder="如 https://example.com（须以 http(s):// 开头）"
        />
        <span class="form-tip">侧栏渲染为图标+文字，点击新标签页打开</span>
      </el-form-item>
      <el-form-item v-if="form.menuType === 'MENU' || form.menuType === 'BUTTON'" label="权限编码" prop="permCode">
        <el-input
          v-model="form.permCode"
          :placeholder="form.menuType === 'BUTTON' ? '如 system:user:add（按钮必填）' : '如 system:user（可空）'"
        />
      </el-form-item>
      <el-form-item v-if="form.menuType === 'MENU'" label="页面缓存" prop="isCache">
        <el-switch v-model="form.isCache" :active-value="1" :inactive-value="0" />
        <span class="form-tip">开启后切走再切回该页保留状态（页签来回切换不清空）</span>
      </el-form-item>
      <el-form-item v-if="form.menuType !== 'BUTTON'" label="显示状态" prop="visible">
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
      <el-button type="primary" :loading="saving" v-has-perm="'menu:create'" @click="handleSubmit">保存</el-button>
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
.sort-no {
  display: inline-block;
  min-width: 28px;
  margin-right: 4px;
  color: #606266;
}
.link-url {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
.w-full {
  width: 100%;
}
.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.icon-search {
  margin-bottom: 4px;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.icon-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 6px;
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 4px;
  background: #fff;
  color: #606266;
  cursor: pointer;
  transition: all 0.15s;
}
.icon-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.icon-cell:hover {
  color: var(--fs-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
}
.icon-cell.active {
  color: #fff;
  background: var(--fs-primary);
  border-color: var(--fs-primary);
}
.icon-cell.clear {
  font-size: 12px;
}
</style>
