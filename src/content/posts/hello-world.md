---
title: 你好，世界
published: 2026-10-15
description: 站点已经跑起来了，这篇文章说明接下来该改哪里。
tags: ["开始", "Firefly", "Astro"]
category: 站点说明
draft: false
---

这是你的第一篇文章，也是这套博客的起点。它由 **Astro** 与 [Firefly](https://github.com/CuteLeaf/Firefly) 主题驱动，源码就在本机，改完即可发布。

## 现在就能做的三件事

1. 把个人资料换成你自己的：编辑 `src/config/profileConfig.ts`，改 `name`、`bio`、`avatar` 与社交链接。
2. 改站点信息：编辑 `src/config/siteConfig.ts`，把标题、副标题、站点 URL、描述、关键词里的占位符替换掉。
3. 写一篇新文章：`src/content/posts/` 下新建 `我的文章.md`，或者在仓库里执行 `pnpm new-post 我的文章`。

## 文章 front-matter 速查

```yaml
---
title: 文章标题
published: 2026-10-15        # 必填，发布日期
description: 首页卡片上显示的一句话简介
tags: ["标签A", "标签B"]
category: 分类名
draft: false                # true 则只在开发模式可见
pinned: false               # true 则置顶在首页
---
```

更完整的字段说明（封面图、加密、系列、更新日期等）见主题自带的参考示例：`src/content/reference/guide/index.md`。
那份文档连同其他演示文章一起被归档在 `src/content/reference/`，不会出现在站点上，随时可以当作写作手册来查。

## 部署在哪里

本站已按 **GitHub Pages 项目站点**配置，也就是发布在 `https://<用户名>.github.io/blogs/` 这个子路径下。
推送 `master` 分支后，`.github/workflows/deploy.yml` 会自动构建并发布。

:::note
如果之后换成自定义域名或用户站点（`<用户名>.github.io` 仓库），需要把 `astro.config.mjs` 里的 `base` 改回 `"/"`，
并同步修改 `src/config/siteConfig.ts` 的 `site_url`。
:::

祝你写得开心。
