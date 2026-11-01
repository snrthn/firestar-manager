import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { hasPerm } from './hasPerm'
import { useUserStore } from '@/stores/user'

beforeEach(() => {
  setActivePinia(createPinia())
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
    const wrapper = mount(Comp, { global: { directives: { 'has-perm': hasPerm } } })
    expect(wrapper.find('button.a').exists()).toBe(true)
    expect(wrapper.find('button.b').exists()).toBe(false)
  })

  it('无任何权限时按钮被移除', () => {
    const store = useUserStore()
    store.permissions = []
    const Comp = defineComponent({ template: '<button v-has-perm="\'x\'">A</button>' })
    const wrapper = mount(Comp, { global: { directives: { 'has-perm': hasPerm } } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('数组形式权限：命中任一即保留', () => {
    const store = useUserStore()
    store.permissions = ['other:manage']
    const Comp = defineComponent({
      template: '<button v-has-perm="[\'a:create\', \'other:manage\']">A</button>',
    })
    const wrapper = mount(Comp, { global: { directives: { 'has-perm': hasPerm } } })
    expect(wrapper.find('button').exists()).toBe(true)
  })
})
