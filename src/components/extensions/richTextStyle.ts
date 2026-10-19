import { Mark, mergeAttributes, type RawCommands, type CommandProps } from '@tiptap/core'

// 自研 textStyle 扩展：在 StarterKit 未提供的 textStyle 标记上，附加 fontSize / color
// 两个属性，并暴露 setFontSize / setFontColor 命令。两个命令会从当前选区已有的 textStyle
// 中合并保留另一个属性，避免「设了字号丢了颜色」。无需安装 @tiptap/extension-text-style。
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    richTextStyle: {
      setFontSize: (fontSize: string | null) => ReturnType
      setFontColor: (color: string | null) => ReturnType
    }
  }
}

function readTextStyle(state: any): { fontSize?: string | null; color?: string | null } {
  const { from, to } = state.selection
  const attrs: { fontSize?: string | null; color?: string | null } = {}
  state.doc.nodesBetween(from, to, (node: any) => {
    const ts = node.marks?.find((m: any) => m.type.name === 'textStyle')
    if (ts) {
      if (ts.attrs?.fontSize) attrs.fontSize = ts.attrs.fontSize
      if (ts.attrs?.color) attrs.color = ts.attrs.color
    }
    return true
  })
  return attrs
}

export const RichTextStyle = Mark.create({
  name: 'textStyle',

  parseHTML() {
    return [{ tag: 'span[style]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },

  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize || null,
        renderHTML: (attributes: Record<string, any>) =>
          attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
      },
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.color || null,
        renderHTML: (attributes: Record<string, any>) =>
          attributes.color ? { style: `color: ${attributes.color}` } : {},
      },
    }
  },

  addCommands(): Partial<RawCommands> {
    return {
      setFontSize:
        (fontSize: string | null) =>
        ({ chain, state }: CommandProps) =>
          chain().setMark('textStyle', { ...readTextStyle(state), fontSize }).run(),
      setFontColor:
        (color: string | null) =>
        ({ chain, state }: CommandProps) =>
          chain().setMark('textStyle', { ...readTextStyle(state), color }).run(),
    }
  },
})
