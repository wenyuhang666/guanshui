#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""从书籍原文构建前端数据：六十四卦（含卦辞爻辞）+ 十本书全文检索库"""
import re, json, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
BOOKS = os.path.join(BASE, 'books')
OUT = os.path.join(BASE, 'site', 'data')
os.makedirs(OUT, exist_ok=True)

# 八卦 -> 自下而上三爻（1 阳 0 阴）
BAGUA = {
    '乾': [1, 1, 1], '兑': [1, 1, 0], '离': [1, 0, 1], '震': [1, 0, 0],
    '巽': [0, 1, 1], '坎': [0, 1, 0], '艮': [0, 0, 1], '坤': [0, 0, 0],
}
YAO_NAMES = ['初', '二', '三', '四', '五', '上']
POS_NAME = {1: '初', 2: '二', 3: '三', 4: '四', 5: '五', 6: '上'}


# 大象以「君子以/先王以/后以/上以/大人以」起论，截到该句句末
DAXIANG_KW = ('君子以', '先王以', '后以', '上以', '大人以')


def take_daxiang(v):
    pos = -1
    for kw in DAXIANG_KW:
        i = v.find(kw)
        if i >= 0 and (pos < 0 or i < pos):
            pos = i
    if pos < 0:
        return v, ''
    j = v.find('。', pos)
    if j < 0:
        return v, ''
    return v[:j + 1].strip(), v[j + 1:].strip()


def parse_zhouyi():
    path = os.path.join(BOOKS, '周易.md')
    raw = open(path, encoding='utf-8').read().split('\n')
    lines = [l.replace('\u3000', '').strip() for l in raw]

    heads = []
    pat = re.compile(r'^(\d{2})[.．]\s*(\S+?)（卦(.+?)）$')
    for i, l in enumerate(lines):
        m = pat.match(l)
        # 正文特征：下一行是卦符行，且再下一行含"（X下X上）"
        if m and i + 2 < len(lines) and '下' in lines[i + 2] and '上' in lines[i + 2]:
            heads.append((i, int(m.group(1)), m.group(2), lines[i + 2]))

    guas = []
    for k, (idx, no, name, sym) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        m = re.search(r'（(\S)下(\S)上）', sym)
        low, up = m.group(1), m.group(2)
        binary = BAGUA[low] + BAGUA[up]

        body = lines[idx + 3:end]

        # 第一步：把版面折行接回同一段（续行不以《…》或爻题开头）
        yao_re = re.compile(r'^(初九|初六|九二|六二|九三|六三|九四|六四|九五|六五|上九|上六|用九|用六)[：，,](.*)$')
        paras = []
        for l in body:
            if not l:
                continue
            if l.startswith('《') or yao_re.match(l):
                paras.append(l)
            else:
                if paras:
                    paras[-1] += l
                else:
                    paras.append(l)
        # 卦辞与彖传挤在同一段时拆开（如蒙卦）
        split = []
        for l in paras:
            if '《彖》' in l and not l.startswith('《彖》'):
                a, b = l.split('《彖》', 1)
                split.append(a.strip())
                split.append('《彖》' + b)
            else:
                split.append(l)
        paras = split

        guaci, yao_texts, yong = '', [], ''
        tuan, xiang, xiao = '', '', []
        seen_yao = False
        for l in paras:
            if l.startswith('《文言》'):
                continue
            if l.startswith('《彖》'):
                if not tuan:
                    v = l.split('曰', 1)[1] if '曰' in l else l[3:]
                    tuan = v.lstrip('：: 　').strip()
                continue
            if l.startswith('《象》'):
                v = l.split('曰', 1)[1] if '曰' in l else l[3:]
                v = v.lstrip('：: 　').strip()
                if not seen_yao and not xiang:          # 彖后首象即大象（先王以/后以/大人以 皆属之）
                    xiang, rest = take_daxiang(v)
                    if rest:
                        for piece in rest.split('“'):
                            piece = piece.strip()
                            if piece and len(xiao) < 6:
                                xiao.append(piece)
                elif not xiang and any(k in v for k in DAXIANG_KW):   # 乾卦：大象与小象同段，且排在六爻之后
                    xiang, rest = take_daxiang(v)
                    xiao = []
                    for piece in rest.split('“'):
                        piece = piece.strip()
                        if piece and len(xiao) < 6:
                            xiao.append(piece)
                elif len(xiao) < 6:
                    xiao.append(v)
                continue
            mm = yao_re.match(l)
            if mm:
                tag, txt = mm.group(1), mm.group(2).strip()
                if tag in ('用九', '用六'):
                    if not yong:
                        yong = txt
                    continue
                if len(yao_texts) < 6:
                    yao_texts.append(txt)
                seen_yao = True
                continue
            if not guaci:
                g = re.match(r'^《.+?》[：:](.+)$', l) or re.match(r'^' + name + r'[：:](.+)$', l)
                if g:
                    guaci = g.group(1).strip()
                    continue
        if not guaci or len(yao_texts) < 6:
            continue

        yao_list = []
        for pos in range(1, 7):
            yin_yang = binary[pos - 1]
            if pos == 1:
                tag = '初九' if yin_yang else '初六'
            elif pos == 6:
                tag = '上九' if yin_yang else '上六'
            else:
                tag = ('九' if yin_yang else '六') + POS_NAME[pos]
            yao_list.append({
                'pos': pos, 'tag': tag, 'yang': bool(yin_yang),
                'text': yao_texts[pos - 1],
                'xs': xiao[pos - 1] if pos - 1 < len(xiao) else '',
            })

        extra = yong
        guas.append({
            'no': no, 'name': name, 'upper': up, 'lower': low,
            'binary': binary, 'guaci': guaci, 'yaos': yao_list,
            'tuan': tuan, 'xiang': xiang, 'yong': extra,
        })
    return guas


def build_books():
    meta = [
        ('周易', '周易', '卜筮之祖，六十四卦卦辞爻辞'),
        ('梅花易数', '梅花易数', '邵雍·宋，起卦与断卦'),
        ('增删卜易', '增删卜易', '野鹤老人·清，六爻实战'),
        ('卜筮正宗', '卜筮正宗', '王洪绪·清，六爻体系'),
        ('渊海子平', '渊海子平', '徐子平·宋，八字奠基'),
        ('三命通会', '三命通会', '万民英·明，命理百科'),
        ('子平真诠评注', '子平真诠', '沈孝瞻·清，格局论'),
        ('滴天髓阐微', '滴天髓', '任铁樵·清，旺衰五行'),
        ('穷通宝鉴', '穷通宝鉴', '余春台·清，调候用神'),
        ('千里命稿', '千里命稿', '韦千里·民国，白话命理'),
    ]
    out = []
    for fn, name, desc in meta:
        p = os.path.join(BOOKS, fn + '.md')
        if not os.path.exists(p):
            print('missing', fn); continue
        txt = open(p, encoding='utf-8').read()
        txt = txt.replace('\u3000', ' ').replace('\r', '')
        lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in txt.split('\n')]
        lines = [l for l in lines if l]
        out.append({'name': name, 'desc': desc, 'lines': lines})
    return out


if __name__ == '__main__':
    guas = parse_zhouyi()
    print('卦数:', len(guas))
    miss = [g['name'] for g in guas if any(not y['text'] for y in g['yaos'])]
    print('缺爻辞的卦:', miss)
    print('例:', guas[0]['name'], guas[0]['upper'], guas[0]['lower'], guas[0]['binary'])
    print('   卦辞:', guas[0]['guaci'][:40])
    print('   初爻:', guas[0]['yaos'][0]['text'][:30])

    with open(os.path.join(OUT, 'gua.js'), 'w', encoding='utf-8') as f:
        f.write('window.GUA_DATA=')
        json.dump(guas, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    books = build_books()
    with open(os.path.join(OUT, 'books.js'), 'w', encoding='utf-8') as f:
        f.write('window.BOOK_DATA=')
        json.dump(books, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('books:', [(b['name'], len(b['lines'])) for b in books])
    print('size gua.js %.0fKB books.js %.0fKB' % (
        os.path.getsize(os.path.join(OUT, 'gua.js')) / 1024,
        os.path.getsize(os.path.join(OUT, 'books.js')) / 1024))
