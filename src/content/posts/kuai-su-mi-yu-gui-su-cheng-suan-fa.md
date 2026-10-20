---
title: "快速幂与龟速乘算法"
published: 2026-10-20
description: "起因是笔者初中同学的同学发给了他一个题目，内容是："
image: ""
tags: []
category: "算法"
draft: false
---
## 前言

起因是笔者初中同学的同学发给了他一个题目，内容是：

![a67b0a3dcbedf96ec53e24b0ed240b35](/assets/images/posts/kuai-su-mi-yu-gui-su-cheng-suan-fa/01-a67b0a3dcbedf96ec53e24b0ed240b35.jpg)

本来笔者以为是一个普通的一道 C++ 题目，但是后来发现数据范围有一些不太对劲 —— $1\le a,b,m\le 2^{63}$ ？这个范围对于常规的 O(n) 循环算法来说已经无法在一秒内计算出结果了，稍微查询一下，一个熟悉的概念映入眼帘 —— 快速幂算法！然而打开 devc++ 后，笔者悲催地发现自己已经忘记了快速幂的核心要义，遂开始重新复习并且记录于此。

由于笔者学的是 C ，以下代码以 C 为主， C++ 同理。

## 快速幂

首先来看最基础的乘方计算：

```c
#include<stdio.h>
#define LL long long
LL spow(LL a,LL b,LL m){
	LL res=1%m;
	a%=m;
	while(b--)	res=(res*a)%m;
	return res;
}
int main(){
	// 后面快速幂部分主函数内容不变，仅 spow() -> qpow() ，故不重复展示
	LL a,b,m;
	scanf("%lld %lld %lld",&a,&b,&m);
	printf("%lld",spow(a,b,m));
	return 0;
}
```

注意到这边用到了一个很常见的关于取模的性质，<s>读者自证不难</s>（其实是笔者还不会证明），利用它分步取模，相比先求出完整幂值最后再取模，能在一定程度上避免中间结果过大而溢出。（但仅靠这一点对本题仍不够，极端情况的处理见后文）

$$
(a\cdot b)\bmod m=\bigl((a\bmod m)\cdot(b\bmod m)\bigr)\bmod m
$$

观察原来的代码我们可以发现，我们几乎是完全照搬了乘方的原始定义即 $a^n=\underbrace{a\cdot a\cdots a}_{n个a}$ ，这样直白的实现让时间复杂度达到了 O(n) ，极其不利于大幂指数的计算，要想要改善这个复杂度，我们只需要知道两个简单的知识：其一为 $a^{x+y}=a^x\cdot a^y$，其二为任何非负整数都可以按照其二进制拆分成多个二的幂次之和来表示，如 $6=(110)_2=0\times2^0+1\times2^1+1\times2^2$ 。二者结合我们就可以按照以下的方式来优化求解幂：

$$
1919^{810}=1919^{(1100101010)_2}
=1919^{0\cdot2^0}\cdot1919^{1\cdot2^1}\cdot1919^{0\cdot2^2}\cdot1919^{1\cdot2^3}\cdot1919^{0\cdot2^4}\cdot1919^{1\cdot2^5}\cdot1919^{0\cdot2^6}\cdot1919^{0\cdot2^7}\cdot1919^{1\cdot2^8}\cdot1919^{1\cdot2^9}
$$

或许渲染的有点小？没事，我们可以在代码中看看逻辑：

```c
LL qpow(LL a,LL b,LL m){
	LL res=1%m;
	a%=m;
	while(b){
		if(b&1)	res=(res*a)%m;
		b>>=1;
		a*=a,a%=m;
	}
	return res;
}
```

在这个代码中，我们的核心就是去判断指数的二进制下的每一位，如果为 1 ，则乘上 $a^{2^n}$ ，其中 $n$ 为当前位数，**位数从 0 开始算起**。这里的 `a*=a` 的原理为 $a^{2^n}\times a^{2^n}=a^{2^n+2^n}=a^{2^{n+1}}$ 即将我们用于乘进去的 a 再次往后推进一位。之所以选择将数字转换为二进制的其中一个原因正是 $a^{2^n}$ 平方以后非常自然地就使得 $2^n$ 能够再次乘以二变为我们想要的 $2^{n+1}$ 。

总结起来便是以下公式：

$$
a^b\bmod m=\prod_{i}{a^{(2^i)}\bmod m}\ \ \ \ \ (\text{当 } b \text{ 的第 } i \text{ 位为 } 1)
$$

到了这里这个快速幂倒是没问题了，但是一看原题，我们现在的解法还有一个致命的漏洞：大数溢出。因为原题的 $a,b$ 范围极大，达到了惊人的 $2^{63}$ ，要知道我们的 `long long` 最大值也才 $2^{63}-1$ ，当 $a=2^{63}$ 或 $b,m=2^{63}$ 的时候我们的 `long long` 压根存不下，所以我们得采用 `unsigned long long` 来存储输入值。

但是仍然有一个问题，即使我们几乎做到每步都取模了，但是在极端情况下，$a=2^{63}-1,b=2^{63}-1,m=2^{63}$ ，不可避免地我们会面对 $(2^{63}-1)\cdot(2^{63}-1)$ 这种情况，导致在计算的时候溢出。对于这个问题，笔者进行了一番查询，发现了两条常见的解决方案。

法一是在中间计算的时候，将其中一个变量显式类型转化为 `__int128` ，其可表示的最大值高达 $2^{127}-1$ ，对于我们这个情况 $(2^{63}-1)\cdot(2^{63}-1)<2^{126}<2^{127}-1$ ，很显然是足够了。但是如果看到标题便会知晓，这种方法肯定是有限制的，具体来说：`__int128` 是 GCC/Clang 的编译器扩展，通常在 64 位目标平台上可用；它不是标准 C/C++，MSVC 不支持，而且甚至没有标准的输入输出（虽然这个跟本题无关），这个限制导致了笔者的 devc++ 并不能在正常配置的情况下使用它。于是，便有了法二 —— 龟速乘。

## 龟速乘

所谓龟速乘与快速幂的思想极其相像，区别是前者是加，后者是乘。可以理解为乘法分配律 + 二进制拆分转换：

$$
a×b\bmod m=\sum_{i}{(a⋅2^i)\bmod m}\ \ \ \ \ (\text{当 } b \text{ 的第 } i \text{ 位为 } 1)
$$

```c
ULL stimes(ULL a,ULL b,ULL m){
	ULL res=0;
	a%=m;
	while(b){
		if(b&1)	res+=a,res%=m;
		b>>=1;
		a*=2,a%=m;
	}
	return res;
}
```

这样子我们就可以处理掉棘手的极端情况了，最终整合起所有的代码我们便可以得到这道题的最终解：

```c
#include<stdio.h>
#define ULL unsigned long long
ULL stimes(ULL a,ULL b,ULL m){
	// 龟速乘
	ULL res=0;
	a%=m;
	while(b){
		if(b&1)	res+=a,res%=m;
		b>>=1;
		a*=2,a%=m;
	}
	return res;
}
ULL qpow(ULL a,ULL b,ULL m){
	// 快速幂
	ULL res=1%m;
	a%=m;
	while(b){
		if(b&1)	res=stimes(res,a,m);
		b>>=1;
		a=stimes(a,a,m);
	}
	return res;
}
int main(){
	ULL a,b,m;
	scanf("%llu %llu %llu",&a,&b,&m);
	printf("%llu",qpow(a,b,m));
	return 0;
}
```
