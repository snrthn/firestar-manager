import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { hasPerm } from './hasPerm'
import { useUserStore } from '@/stores/user'

beforeEach(() => {
  setActivePinia(createPinia())
})

// 指令的语义是 el.parentNode.removeChild(el)：节点被移出 DOM 后，
// Vue Test Utils 的 wrapper.element 仍持有该游离节点，wrapper.find() 会匹配根节点自身
// → exists() 仍为 true（既有 2 个断言失败的根因，并非指令失灵）。
// 因此把组件 attachTo document.body，直接查真实 DOM 判定是否真的被移除。
afterEach(() => {
  document.body.innerHTML = ''
})

describe('v-has-perm 指令（P1 RBAC 按钮级权限）', () => {
  it('有权限的按钮保留，无权限的从 DOM 移除', () => {
    const store = useUserStore()
    store.permissions = ['project:create']
    const Comp = defineComponent({
      template:
        '<button class="a" v-has-perm="\'project:create\'">A</button>' +
        '<button class="b" v-has-perm="\'project:delete\'">B</button>',
    })
    mount(Comp, { attachTo: document.body, global: { directives: { 'has-perm': hasPerm } } })
    expect(document.body.querySelector('button.a')).not.toBeNull()
    expect(document.body.querySelector('button.b')).toBeNull()
  })

  it('无任何权限时按钮被移除', () => {
    const store = useUserStore()
    store.permissions = []
    const Comp = defineComponent({ template: '<button v-has-perm="\'x\'">A</button>' })
    mount(Comp, { attachTo: document.body, global: { directives: { 'has-perm': hasPerm } } })
    expect(document.body.querySelector('button')).toBeNull()
  })

  it('数组形式权限：命中任一即保留', () => {
    const store = useUserStore()
    store.permissions = ['other:manage']
    const Comp = defineComponent({
      template: '<button v-has-perm="[\'a:create\', \'other:manage\']">A</button>',
    })
    mount(Comp, { attachTo: document.body, global: { directives: { 'has-perm': hasPerm } } })
    expect(document.body.querySelector('button')).not.toBeNull()
  })
})
