# Obsidian Callout 语法参考

本站的提醒框由 [rehype-callouts](https://github.com/lin-stephanie/rehype-callouts) 渲染，
主题已设为 `obsidian`（见 `src/config/siteConfig.ts` 的 `post.rehypeCallouts.theme`），
因此**写法与 Obsidian 完全一致**，可以直接把 Obsidian 里的笔记粘过来。

## 基本写法

`> [!类型]` 必须出现在引用块的**第一行**，标记与 `>` 之间不能有空格：

```markdown
> [!note]
> 不写标题时会自动使用该类型的默认标题。

> [!tip] 自定义标题
> 类型后面可以直接跟标题文本。
```

上面两段分别渲染成：

> [!note]
> 不写标题时会自动使用该类型的默认标题。

> [!tip] 自定义标题
> 类型后面可以直接跟标题文本。

## 支持的类型

共 27 个类型，其中带别名的写法完全等价（例如 `tldr` 就是 `summary`）：

| 分组 | 类型 |
| --- | --- |
| 通用 | `note` |
| 摘要 | `abstract`、`summary`、`tldr` |
| 信息 | `info`、`todo` |
| 提示 | `tip`、`hint`、`important` |
| 成功 | `success`、`check`、`done` |
| 疑问 | `question`、`help`、`faq` |
| 警告 | `warning`、`attention`、`caution` |
| 危险 | `failure`、`missing`、`fail`、`danger`、`error`、`bug` |
| 示例 | `example` |
| 引用 | `quote`、`cite` |

## 折叠写法

在类型后面紧跟 `-` 或 `+`，就会渲染成可折叠的 `<details>`（不需要 JavaScript）：

```markdown
> [!warning]- 默认收起
> 用减号，初始状态是折叠的。

> [!danger]+ 默认展开
> 用加号，初始状态是展开的。
```

> [!warning]- 默认收起
> 用减号，初始状态是折叠的。

> [!danger]+ 默认展开
> 用加号，初始状态是展开的。

## 嵌套

内层引用块多一层 `>` 即可：

```markdown
> [!note] 外层
> 外层内容。
> > [!tip] 内层
> > 内层内容。
```

> [!note] 外层
> 外层内容。
> > [!tip] 内层
> > 内层内容。

## 最容易踩的坑：标记与内容之间不要空行

Markdown 遇到空行会把引用块**拆成两个独立的引用块**，插件只处理紧跟内容的那个，
于是 callout 就退化成普通引用块。对比下面两种写法：

```markdown
<!-- ❌ 错误：空行把引用块切断了 -->
> [!note] 标题
>
> 正文

<!-- ✅ 正确：标题与正文之间不空行，段落之间才空行 -->
> [!note] 标题
> 正文
>
> 第二段
```

其余注意事项：

- `[!note]` 里是**严格小写**的类型名，写成 `[!Note]` 无法识别
- `[!note]` 与 `>` 之间、`[!` 与类型名之间都不能有空格
- callout 里的 Markdown 照常生效（加粗、列表、代码块、公式、图片都可以）

## 相关配置

`src/config/siteConfig.ts`：

```ts
post: {
  rehypeCallouts: {
    theme: "obsidian",                 // github | obsidian | vitepress | docusaurus
    enablePythonMarkdownAdmonitions: false,  // 「!!!」式 Python-Markdown 语法，Obsidian 没有这种写法
  },
},
```

改完主题后**必须重启开发服务器**才会生效。
