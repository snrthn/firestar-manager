import type { App, Directive, DirectiveBinding } from 'vue'
import { useUserStore } from '@/stores/user'

/**
 * v-has-perm 指令：按钮级权限控制（任务3）。
 *
 * 用法：<el-button v-has-perm="'project:create'">新建立项</el-button>
 * 语义：当前用户权限集（userStore.permissions，来自后端 sys_role_permission）
 *       包含该 permCode 时才渲染按钮；否则从 DOM 移除（与若依 hasPermi 同款行为）。
 *
 * 权限集来源：ProfileVO.permissions → AuthServiceImpl.loadPermissions
 *   （role → sys_role_permission → sys_permission.perm_code），
 * 与后端 @RequirePerm 鉴权同源（PermissionResolverImpl）。
 * 默认打开：新权限点创建后由迁移脚本分配给 ROLE_ADMIN（+ 持有模块 :manage 的角色），
 * 故存量用户不会凭空丢失按钮。
 */
export const hasPerm: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
    const required = binding.value
    if (!required) return
    const codes = Array.isArray(required) ? required : [required]
    const store = useUserStore()
    const has = codes.some((c) => store.hasPermission(c))
    if (!has) {
      el.parentNode?.removeChild(el)
    }
  },
}

export function registerHasPermDirective(app: App) {
  app.directive('has-perm', hasPerm)
}
