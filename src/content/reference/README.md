# 参考示例（不属于站点内容）

这里存放的是 Firefly 主题自带的演示文章与配图。它们**不会**出现在站点上，因为
`src/content.config.ts` 里的 `posts` 集合只扫描 `src/content/posts`，而本目录是
`src/content/reference`，不在任何集合的 glob 范围内。

之所以保留而不是删除，是因为它们是这个主题最完整的「写法词典」：

| 文件 | 能学到什么 |
| --- | --- |
| `guide/index.md` | 文章 front-matter 全部字段、目录、系列、置顶等基础玩法 |
| `guide/firefly-layout-system.md` | 首页/列表/网格布局系统的配置方式 |
| `guide/firefly-wiki-link.md` | 双链 `[[wiki link]]` 语法 |
| `markdown-tutorial.md` | Markdown 基础与主题扩展语法 |
| `markdown-extended.md` | 提示框、代码组、标签页等扩展组件 |
| `markdown-mermaid.md` / `markdown-plantuml.md` | 图表渲染写法 |
| `katex-math-example.md` | 数学公式（KaTeX）写法 |
| `code-examples.md` | 代码块、行号、折叠、语言徽标 |
| `video.md` | 视频嵌入 |
| `encrypted-demo.md` | 文章加密（`password` / `passwordHint`） |
| `mdx-example.mdx` | 在文章里使用 MDX 组件 |
| `draft.md` | `draft: true` 草稿的隐藏机制 |
| `obsidian-callout-syntax.md` | Obsidian callout（提醒框）语法：27 种类型、折叠、嵌套与常见坑 |
| `images/` | 上述文章引用的配图 |

## 想重新看到它们

把需要的文件复制回 `src/content/posts/` 即可，配图目录也要一起复制（文章里的
`image: "./images/xxx.avif"` 是相对当前 Markdown 文件的路径）。
