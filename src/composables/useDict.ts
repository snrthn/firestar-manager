import { ref, type Ref } from 'vue'
import { listDictData } from '@/api/dict'
import type { DictDataVO } from '@/types/dict'

/**
 * 字典消费标准入口（业务页读取字典的唯一允许路径）。
 *
 * 背景（虎哥 2026-10-15 拍板「先封闭消费方式」）：
 *   字典种子此前只建不用——管理页（dict.vue / dict-data.vue）自消费，
 *   业务页各自硬编码枚举值（典型：menu.vue 菜单类型 radio 写死四型），
 *   导致在字典维护页停用「外链」选项对业务页毫无影响。
 *   本次拿「菜单弹窗」做第一个消费样板，固化以下约定，后续业务页一律照做：
 *
 *   【约定 1】业务页不直接调 /system/dict/data/list，统一走 loadDictOptions；
 *   【约定 2】只消费 status=ENABLED 的项——「停用」的业务语义就是
 *             从所有业务选项中消失，不需要业务页再判一遍状态；
 *   【约定 3】顺序由字典维护页的 sort_no 决定（升序），业务页不自带顺序；
 *   【约定 4】value 直接进表单/存库，必须与后端校验域值一致——
 *             种子修正走迁移（见 V18：menu_type 的 DIRECTORY→CATALOG），
 *             不要在消费端做值映射糊弄过去；
 *   【约定 5】结果按 typeCode 缓存（种子数据极少变动，避免每个页面
 *             挂载都打一次接口）；字典维护页改完后如要立即生效，
 *             调用 invalidateDictCache(typeCode) 失效对应缓存。
 *   【约定 6】新增表单的默认值不写死在代码里，走 loadDictDefault(typeCode)：
 *             取字典里 is_default=1 的项，没有就留空（见 loadDictDefault 注释）。
 *
 * 用法（样板见 views/system/menu.vue 菜单类型单选组）：
 *   const options = ref<DictOption[]>([])
 *   loadDictOptions('menu_type').then((opts) => { options.value = opts })
 */

/** 业务消费用的字典选项（与 EP 的 label/value 习惯对齐） */
export interface DictOption {
  value: string
  label: string
  /**
   * 字典样式（sys_dict_data.style，字典 dict_style：primary/success/warning/danger/info），
   * 供 el-tag 等标签组件取色；null = 字典未配置（调用方兜底，如 'info'）。
   */
  style: string | null
  /**
   * 是否默认项（sys_dict_data.is_default=1），供 loadDictDefault 预填新增表单。
   *
   * <p>标成可选：业务页「字典不可用时回退内置选项」的字面量（menu.vue / file/list.vue）
   * 是代码兜底值，没有「默认项」概念，不该被迫写 isDefault: false。缺省按「非默认」处理。</p>
   */
  isDefault?: boolean
}

/** typeCode → 已过滤排序的选项；会话级缓存，invalidateDictCache 失效 */
const optionCache = new Map<string, DictOption[]>()

/** typeCode → 进行中的请求；合并并发重复拉取（同类型多个页面同时挂载只打一次） */
const inflight = new Map<string, Promise<DictOption[]>>()

/** 失效缓存（不传 typeCode 清空全部）。字典维护页增删改后调用。 */
export function invalidateDictCache(typeCode?: string): void {
  if (typeCode === undefined) {
    optionCache.clear()
    return
  }
  optionCache.delete(typeCode)
}

/**
 * 按类型编码取「启用中」的字典选项。
 * 失败/空结果不抛到业务层——由调用方决定兜底（样板 menu.vue 回退内置四型），
 * 这里只 console.error 留痕。
 */
export async function loadDictOptions(typeCode: string): Promise<DictOption[]> {
  const cached = optionCache.get(typeCode)
  if (cached) return cached

  const pending = inflight.get(typeCode)
  if (pending) return pending

  const task = (async (): Promise<DictOption[]> => {
    try {
      // pageSize 取 500（后端 clamp 上限），一次拿全该类型，避免翻页拼装
      const page = await listDictData(typeCode, 1, 500)
      const options: DictOption[] = (page.records || [])
        .filter((item: DictDataVO) => item.status === 'ENABLED')
        .sort((a: DictDataVO, b: DictDataVO) => a.sortNo - b.sortNo || a.id - b.id)
        .map((item: DictDataVO) => ({
          value: item.dictValue,
          label: item.dictLabel,
          style: item.style ?? null,
          isDefault: item.isDefault === 1,
        }))
      optionCache.set(typeCode, options)
      return options
    } catch (e) {
      console.error(`[useDict] 加载字典失败 typeCode=${typeCode}:`, e)
      return []
    } finally {
      inflight.delete(typeCode)
    }
  })()

  inflight.set(typeCode, task)
  return task
}

/**
 * 取字典的「默认项」值（sys_dict_data.is_default=1），供新增表单预填。
 *
 * <p>【约定 6】业务页不要再把某个域值写死成新增默认值（典型：模型配置页把供应商
 * 默认写成 'coze'）。默认值属于运营配置，应该在【字典管理 → 字典数据】里勾选
 * 「默认」，改字典即生效；字典里没勾默认 → 这里返回 null，表单保持留空，
 * 由用户自己选，而不是由代码替运营做决定。</p>
 *
 * <p>多个默认项时取 sort_no 最小的那个（loadDictOptions 已按 sort_no 升序）。</p>
 */
export async function loadDictDefault(typeCode: string): Promise<string | null> {
  const opts = await loadDictOptions(typeCode)
  return opts.find((o) => o.isDefault)?.value ?? null
}

/**
 * 字典标签映射（表格/详情展示用）：value → 中文 label。
 *
 * 背景：下拉选项走了字典，但列表列、Tag 仍在显示原始英文域值
 * （SUCCESS / NORMAL / LOCAL / CREATE...），或各页自写 statusLabel 硬编码
 * 中文映射——同样是「字典已有但未消费」。本 composable 复用 loadDictOptions
 * 的缓存，只加一层 value→label 反查，展示端与字典页一处维护。
 *
 * 用法（样板见 views/log/login.vue / views/file/list.vue）：
 *   const { label: statusLabel } = useDictLabels('login_status')
 *   <el-tag>{{ statusLabel(row.loginStatus) }}</el-tag>
 *
 * 兜底语义：空值 → placeholder（默认 '—'）；未命中 → 显示原始值
 * （字典被删/漏配时不至于整列空白，且一眼可发现字典缺口）。
 */
export interface DictLabeler {
  /** 字典是否已加载完成（可用于骨架/闪烁控制，一般无需关心） */
  ready: Ref<boolean>
  /** value → 字典 label；空值返回 placeholder，未命中返回原始值 */
  label: (value?: string | null, placeholder?: string) => string
  /** value → 字典 style（el-tag 取色用）；空值/未命中/字典未配置/**style 非法** 返回 null，由调用方兜底 */
  style: (value?: string | null) => string | null
}

/**
 * Element Plus <el-tag> 的合法 type 白名单。
 *
 * 【为什么需要白名单】el-tag 只接受 primary/success/info/warning/danger 五个值，
 * 传其它值（如 'error'）页面不报错，但 Vue 会刷：
 *   [Vue warn]: Invalid prop: validation failed for prop "type" ...
 * 字典 style 是运营在【字典管理】页自由填的，DB 里出现一个非法值就会全站刷警告。
 * 这里在出口处收敛：非法 style 一律返回 null，由调用方 `|| 'info'` 兜底。
 */
const EL_TAG_TYPES = new Set(['primary', 'success', 'info', 'warning', 'danger'])

export function useDictLabels(typeCode: string): DictLabeler {
  const labelMap = ref<Record<string, string>>({})
  const styleMap = ref<Record<string, string | null>>({})
  const ready = ref(false)

  loadDictOptions(typeCode).then((opts) => {
    const map: Record<string, string> = {}
    const styles: Record<string, string | null> = {}
    for (const o of opts) {
      map[o.value] = o.label
      styles[o.value] = o.style
    }
    labelMap.value = map
    styleMap.value = styles
    ready.value = true
  })

  function label(value?: string | null, placeholder = '—'): string {
    if (value == null || value === '') return placeholder
    return labelMap.value[value] || value
  }

  function style(value?: string | null): string | null {
    if (value == null || value === '') return null
    const s = styleMap.value[value]
    // 非 el-tag 合法 type 的 style 一律丢弃（见 EL_TAG_TYPES 注释）
    return s && EL_TAG_TYPES.has(s) ? s : null
  }

  return { ready, label, style }
}
