# 按钮权限盘点清单（任务3 · 待确认命名与范围）

> 目的：收集所有业务/系统页面的功能按钮，按 `模块:动作` 命名建议权限码，挂载到对应页面菜单下，默认分配给相关角色（默认打开）。
> 本文档为**落地前确认稿**，确认后据此批量实现（注册 `v-has-perm` 指令 + 菜单 BUTTON 节点 + 默认授权）。

## 一、决定性事实（已代码核实）

1. **后端 `@RequirePerm` 现状 = 模块级粗粒度**，全项目共约 30 个码，例如：
   `project:manage` `shipment:manage` `invoice:manage` `receipt:manage` `return:manage` `writeoff:manage`
   `process:manage` / `process:view` `dict:manage` `org:manage` `file:manage` / `file:view` `log:view`
   `level:view` `receivable:view` `rbac:user` `rbac:role` `rbac:menu` `rbac:perm` `rbac:post`
   `feedback:list` `system:help` `system:reset` `config:manage` `notify:manage` `notify:template` `dashboard:view`。
   **后端没有按动作细分**（没有 `project:create` vs `project:delete`），写操作统一被 `:manage` 拦截。

2. **前端权限能力**：`userStore.hasPermission(perm)` 方法已存在，但**全项目只有 `help/index.vue` 和 `system/reset.vue` 用过**，且**没有全局 `v-has-perm` 指令**。绝大多数按钮裸奔。

3. 结论：本任务要补的是**按钮级 UI 显隐控制 + 菜单 BUTTON 权限节点**，后端拦截层保持现有模块级（不强制细化，除非选方案 B）。

## 二、命名规范提案

```
格式：  {module}:{action}
action ∈ create | edit | delete | export | import | upload | download
            | approve | reject | receive | reverse | writeoff | sign | cancel | publish | config | deploy | toggle | assign
```

**不纳入权限的"工具/导航"按钮（人人可见，不挂权限）**：
查询、重置、刷新、详情/查看、关闭、取消、返回、全选/清空（角色分配弹窗内）。

## 三、挂载与默认打开机制

- 每个**页面菜单节点**下挂 `menu_type='BUTTON'` 子节点，`perm_code` = 上面建议的码，`name` = 按钮中文名。
- 前端注册全局指令 `v-has-perm="project:create"`，包一层现有 `hasPermission`。
- **默认打开**：新建 BUTTON 节点时，自动分配给 `admin` 角色 + 已拥有该页面菜单权限的角色，确保按钮不凭空消失。

## 四、业务模块按钮盘点

| 页面 | 按钮（动作） | 建议 permCode | 备注 |
|---|---|---|---|
| project/list.vue | 新建立项 | `project:create` | dialog 内「添加货物/带入金额/保存」归入 create |
| project/list.vue | 确认签约 | `project:sign` | 签约动作 |
| shipment/list.vue | 新建发货 | `shipment:create` | |
| shipment/ShipmentDetailDialog | 确认收货 | `shipment:receive` | |
| shipment/ShipmentDetailDialog | 上传签收证据 | `shipment:upload` | |
| invoice/list.vue | 新建发票 | `invoice:create` | |
| invoice/InvoiceCreateDialog | 上传发票 | `invoice:upload` | |
| invoice/InvoiceDetailDialog | 下载 | `invoice:download` | |
| receipt/list.vue | 新建回款 | `receipt:create` | |
| receipt/ReceiptCreateDialog | 上传回单 | `receipt:upload` | |
| receipt/ReceiptDetailDialog | 下载 | `receipt:download` | |
| return/list.vue | 发起退货 | `return:create` | |
| return/list.vue | 撤销 | `return:cancel` | |
| return/ReturnDetailDialog | 通过 / 驳回 | `return:approve` / `return:reject` | 审批动作 |
| writeoff/list.vue | 自动核销 | `writeoff:writeoff` | 差异池配对 |
| writeoff/list.vue | 反核销 | `writeoff:reverse` | |
| approval/list.vue | 审批（打开详情） | 不单独控 | 实际审批动作在各业务 detail 弹窗 |
| process/list.vue | 新建流程 | `process:create` | 后端粗码 `process:manage` |
| process/list.vue | 编辑 | `process:edit` | |
| process/list.vue | 配置节点 | `process:config` | 抽屉内「新增/保存/上移/下移/删除节点」归入 |
| process/list.vue | 部署 | `process:deploy` | 列表 + 抽屉内部署 |
| process/list.vue | 启用/停用 | `process:toggle` | |
| file/list.vue | 上传文件 | `file:upload` | |
| file/list.vue | 下载 | `file:download` | |
| file/list.vue | 别名 | `file:alias` | 归入 edit |
| file/list.vue | 删除 | `file:delete` | |

> 应收 receivable / 审批历史 / 各 detail「详情」= 纯查看，不挂权限（与列表查看同源）。

## 五、系统模块按钮盘点（统一 CRUD 三件套 + 工具按钮排除）

| 页面 | 写动作权限码（建议） |
|---|---|
| system/dict.vue（字典类型） | `dict:create` `dict:edit` `dict:delete` |
| system/dict-data.vue（字典数据） | `dict:data:create` `dict:data:edit` `dict:data:delete` |
| system/level.vue（职级） | `level:create` `level:edit` `level:delete` |
| system/org.vue（部门） | `org:create` `org:edit` `org:delete` |
| system/post.vue（岗位） | `post:create` `post:edit` `post:delete` |
| system/user.vue（用户） | `user:create` `user:edit` `user:delete` |
| system/role.vue（角色） | `role:create` `role:edit` `role:delete` `role:assign`（分配权限） |
| system/menu.vue（菜单） | `menu:create` `menu:edit` `menu:delete` |
| system/permission.vue（权限） | `permission:create` `permission:edit` `permission:delete` |
| system/feedback.vue（反馈） | `feedback:create` `feedback:detail` |
| system/help-manage.vue（帮助维护） | `help:create` `help:edit` `help:delete` `help:toggle`（启停） |
| system/notify-record.vue（通知记录） | `notify:publish`（发布通知） |
| system/notify-template.vue（通知模板） | `notify:template:edit` |
| system/agreement-manage.vue（协议） | `agreement:publish`（发布版本） |
| system/param-setting.vue（参数设置） | `config:create`（新建键值/编辑/确定，后端 `config:manage`） |
| system/reset.vue（初始化重置） | `system:reset`（确认执行重置） |

> 系统各页的「查询/重置/刷新」均排除；role 分配权限弹窗内「全选/清空」排除。

## 六、不纳入（工具/自服务页）

`login/Login.vue` `install/index.vue` `error/403.vue` `dashboard/*` `profile/index.vue` `help/index.vue` —— 登录/安装/报错/首页/个人中心/前台帮助，不做按钮级权限（人人或仅登录可见）。

## 七、待确认决策（见对话提问）

- **决策1 · 粒度**：A 前端细粒度（按钮显隐，后端保持模块级 `:manage` 不细化，推荐，低风险）/ B 后端也按动作补 `@RequirePerm`（真·按动作拦截，工作量大，后续增强）。
- **决策2 · 范围**：仅"写/状态变更"动作挂权限（本文档方案）/ 全按钮（含查询等，不推荐）。
