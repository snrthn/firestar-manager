// 菜单图标注册表 —— 一线 admin 系统（若依 / vue-element-admin）成熟做法：
// 菜单存「Element Plus 图标组件名」（PascalCase 字符串），侧栏 <component :is> 渲染，
// 空值兜底 Folder / Document。本文件集中维护可用图标清单与解析函数。
//
// ⚠️ 约定：与项目其他文件一致，图标按具名导入（不 `import *` 整包，避免把 293 个图标全打进首包）。
//    下列名字均已对照 @element-plus/icons-vue 导出逐一核验存在（仅 Boxes 不存在，已剔除）。
import type { Component } from 'vue'
import {
  Menu, Fold, Expand, HomeFilled, House, Location, Compass, Coordinate, Connection, Share,
  User, UserFilled, Avatar, Postcard, School, OfficeBuilding,
  Files, Folder, FolderOpened, FolderChecked, Document, Notebook, Memo, Collection,
  Box, Goods, ShoppingCart, ShoppingBag,
  Money, Wallet, Coin, CreditCard, Ticket, Stamp, GoldMedal, Medal,
  Setting, Tools, Operation, Management, Lock, Key, Unlock, Bell, Service, Cpu, Monitor,
  Histogram, DataLine, PieChart, TrendCharts, Odometer, DataAnalysis, Grid,
  Search, Plus, Refresh, Edit, Delete, Download, Upload, View, Check, CircleCheck,
  Close, CircleClose, Warning, More, MoreFilled, ArrowDown, ArrowRight,
  Calendar, Clock, Picture, Camera, Phone, Message, Promotion, Star, StarFilled,
  ChatLineRound, ChatDotRound, Notification, Sunny, Lightning, Sugar,
} from '@element-plus/icons-vue'

/** 图标展示顺序（按用途分组，菜单图标选择器按此顺序铺网格） */
export const ICON_NAMES: string[] = [
  'Menu', 'Fold', 'Expand', 'HomeFilled', 'House', 'Location', 'Compass', 'Coordinate', 'Connection', 'Share',
  'User', 'UserFilled', 'Avatar', 'Postcard', 'School', 'OfficeBuilding',
  'Files', 'Folder', 'FolderOpened', 'FolderChecked', 'Document', 'Notebook', 'Memo', 'Collection',
  'Box', 'Goods', 'ShoppingCart', 'ShoppingBag',
  'Money', 'Wallet', 'Coin', 'CreditCard', 'Ticket', 'Stamp', 'GoldMedal', 'Medal',
  'Setting', 'Tools', 'Operation', 'Management', 'Lock', 'Key', 'Unlock', 'Bell', 'Service', 'Cpu', 'Monitor',
  'Histogram', 'DataLine', 'PieChart', 'TrendCharts', 'Odometer', 'DataAnalysis', 'Grid',
  'Search', 'Plus', 'Refresh', 'Edit', 'Delete', 'Download', 'Upload', 'View', 'Check', 'CircleCheck',
  'Close', 'CircleClose', 'Warning', 'More', 'MoreFilled', 'ArrowDown', 'ArrowRight',
  'Calendar', 'Clock', 'Picture', 'Camera', 'Phone', 'Message', 'Promotion', 'Star', 'StarFilled',
  'ChatLineRound', 'ChatDotRound', 'Notification', 'Sunny', 'Lightning', 'Sugar',
]

/** 名字 → 组件 映射（供 <component :is> 动态渲染） */
export const ELEMENT_ICON_MAP: Record<string, Component> = {
  Menu, Fold, Expand, HomeFilled, House, Location, Compass, Coordinate, Connection, Share,
  User, UserFilled, Avatar, Postcard, School, OfficeBuilding,
  Files, Folder, FolderOpened, FolderChecked, Document, Notebook, Memo, Collection,
  Box, Goods, ShoppingCart, ShoppingBag,
  Money, Wallet, Coin, CreditCard, Ticket, Stamp, GoldMedal, Medal,
  Setting, Tools, Operation, Management, Lock, Key, Unlock, Bell, Service, Cpu, Monitor,
  Histogram, DataLine, PieChart, TrendCharts, Odometer, DataAnalysis, Grid,
  Search, Plus, Refresh, Edit, Delete, Download, Upload, View, Check, CircleCheck,
  Close, CircleClose, Warning, More, MoreFilled, ArrowDown, ArrowRight,
  Calendar, Clock, Picture, Camera, Phone, Message, Promotion, Star, StarFilled,
  ChatLineRound, ChatDotRound, Notification, Sunny, Lightning, Sugar,
}

/** 选择器用的有序列表（name + 组件） */
export const ELEMENT_ICON_LIST: { name: string; component: Component }[] = ICON_NAMES.map(
  (name) => ({ name, component: ELEMENT_ICON_MAP[name] }),
)

/** 解析菜单图标：返回对应组件，未配置/不存在时返回 null（调用方兜底默认图标） */
export function resolveMenuIcon(name?: string | null): Component | null {
  if (!name) return null
  return ELEMENT_ICON_MAP[name] ?? null
}
