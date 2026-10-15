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
 *
 * 用法（样板见 views/system/menu.vue 菜单类型单选组）：
 *   const options = ref<DictOption[]>([])
 *   loadDictOptions('menu_type').then((opts) => { options.value = opts })
 */

/** 业务消费用的字典选项（与 EP 的 label/value 习惯对齐） */
export interface DictOption {
  value: string
  label: string
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
        .map((item: DictDataVO) => ({ value: item.dictValue, label: item.dictLabel }))
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
