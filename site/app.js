/* 观水 · 断易 — 前端逻辑
   排盘：lunar-javascript（本地 vendor）
   卦爻：data/gua.js（自《周易》原文解析）
   引文：data/books.js（十种古籍全文） */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ══════════ 背景水纹 ══════════ */
  (function waves() {
    function make(g, ys, amp, step) {
      if (!g) return;
      var d = '';
      ys.forEach(function (y, i) {
        var ph = i % 2 ? 1 : -1;
        d += '<path d="M-20 ' + y + ' Q' + (100 + i * 3) + ' ' + (y + ph * amp) + ' 200 ' + y +
          ' T420 ' + (y + ph * amp * .6) + ' T640 ' + y + ' T860 ' + (y + ph * amp * .5) +
          ' T1080 ' + y + ' T1300 ' + (y + ph * amp * .7) + ' T1520 ' + y + '"/>';
      });
      g.innerHTML = d;
    }
    var far = [], mid = [], near = [];
    for (var y = 300; y < 470; y += 11) far.push(y);
    for (var y2 = 470; y2 < 640; y2 += 17) mid.push(y2);
    for (var y3 = 640; y3 < 920; y3 += 28) near.push(y3);
    make($('#wave-far'), far, 3, 0);
    make($('#wave-mid'), mid, 6, 1);
    make($('#wave-near'), near, 10, 2);
  })();

  /* ══════════ 典籍检索 ══════════ */
  var BOOKS = window.BOOK_DATA || [];

  var BOOK_W = { '滴天髓': 1.16, '穷通宝鉴': 1.14, '千里命稿': 1.1, '子平真诠': 1.06, '三命通会': 1.04, '渊海子平': 1.0, '周易': 1.02, '梅花易数': .96, '增删卜易': .94, '卜筮正宗': .94 };

  // 长句拆成 2~3 字片段，提高召回
  function expand(kws) {
    var out = [];
    kws.forEach(function (k) {
      k = k.replace(/[，。；、？！,.;?!\s]/g, '');
      if (!k) return;
      if (k.length <= 3) { out.push(k); return; }
      for (var i = 0; i + 2 <= k.length; i += 2) out.push(k.substr(i, 2));
      if (k.length % 2) out.push(k.substr(k.length - 2, 2));
    });
    var seen = {}, uniq = [];
    out.forEach(function (k) { if (!seen[k]) { seen[k] = 1; uniq.push(k); } });
    return uniq;
  }

  function searchBooks(kws, limit, opts) {
    opts = opts || {};
    kws = expand(kws.filter(Boolean));
    if (!kws.length) return [];
    var res = [];
    for (var bi = 0; bi < BOOKS.length; bi++) {
      var b = BOOKS[bi], lines = b.lines;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.length < 5 || line.length > 300) continue;
        if (opts.skipHead && i < 4) continue;
        var hit = 0, score = 0;
        for (var k = 0; k < kws.length; k++) {
          var p = line.indexOf(kws[k]);
          if (p >= 0) { hit++; score += 12 + Math.min(kws[k].length, 5) * 3; }
        }
        if (!hit) continue;
        if (hit === kws.length && kws.length > 1) score += 26;
        score += hit / kws.length * 30;
        if (line.length < 70) score += 7;
        if (line.length > 150) score -= 10;
        score = score * (BOOK_W[b.name] || 1);
        res.push({ book: b.name, line: line, score: score, idx: i });
      }
    }
    res.sort(function (a, b2) { return b2.score - a.score; });
    var out = [], seen = {};
    for (var j = 0; j < res.length && out.length < limit; j++) {
      var key = res[j].book + '|' + res[j].line.slice(0, 12);
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(res[j]);
    }
    return out;
  }

  function citeHtml(list) {
    if (!list.length) return '';
    return list.map(function (x) {
      var t = x.line.length > 132 ? x.line.slice(0, 132) + '……' : x.line;
      return '<blockquote class="cite"><q>' + esc(t) +
        '</q><span class="src">' + esc(x.book) + '</span></blockquote>';
    }).join('');
  }

  var P = window.PLAIN || { terms: {}, gua: {}, strength: {}, shishen: {}, wuxing: {}, yaoImg: {}, marks: [], advice: {} };

  // 三层断语的第一、二层：一句话结论 + 该干嘛
  function leadHtml(one, acts, cap) {
    if (!one) return '';
    var h = '<div class="lead"><p class="lead-one">' + esc(one) + '</p>';
    if (acts && acts.length) {
      h += '<div class="lead-hd">该干嘛</div><ol class="lead-acts">' +
        acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol>';
    }
    if (cap) h += '<p class="lead-cap">' + esc(cap) + '</p>';
    return h + '</div>';
  }

  // 爻辞今译：抽意象 + 定吉凶落点，全程只用原文里有的信息
  function yaoPlain(text) {
    var t = String(text || '');
    var imgs = [];
    Object.keys(P.yaoImg || {}).forEach(function (k) { if (t.indexOf(k) >= 0) imgs.push(k); });
    imgs.sort(function (a, b) { return t.indexOf(a) - t.indexOf(b); });
    imgs = imgs.filter(function (k) {
      return !imgs.some(function (o) { return o !== k && o.indexOf(k) >= 0; });
    });
    var best = 0;
    (P.marks || []).forEach(function (m) {
      if (t.indexOf(m[0]) >= 0 && Math.abs(m[1]) > Math.abs(best)) best = m[1];
    });

    // 一句话里吉凶两说的（如「征凶，居贞吉」），分开讲，不能笼统判凶
    function clauseWith(marks) {
      var parts = t.split(/[，。；、]/), i, j;
      for (i = 0; i < parts.length; i++) {
        for (j = 0; j < marks.length; j++) {
          if (parts[i].indexOf(marks[j]) >= 0) return parts[i].trim();
        }
      }
      return '';
    }
    var nc = clauseWith(['凶', '厉', '吝', '不利']);
    var pc = clauseWith(['元吉', '大吉', '贞吉', '吉']);
    var twoWay = nc && pc && nc !== pc;

    var parts = [];
    if (imgs.length) parts.push('说的是「' + imgs.map(function (k) { return P.yaoImg[k]; }).join('；') + '」');

    var adv;
    if (twoWay) {
      adv = '这一爻是分开说的：「' + nc + '」不吉，「' + pc + '」才吉 —— 差别就在动还是不动。';
      if (t.indexOf('征') >= 0 && t.indexOf('居') >= 0) {
        adv += '（「征」是往外冲、出远门；「居」是守在原地）';
      }
    } else {
      adv = P.advice[String(best)] || P.advice['0'];
    }
    return (parts.length ? parts[0] + '。' : '') + adv;
  }

  function termsHtml(keys) {
    var items = (keys || []).filter(function (k) { return P.terms[k]; }).map(function (k) {
      return '<div class="term"><b>' + esc(k) + '</b><span>' + esc(P.terms[k]) + '</span></div>';
    });
    if (!items.length) return '';
    return '<details class="terms"><summary>看不懂的词，展开看解释</summary>' + items.join('') + '</details>';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pick(kwList, n) {
    var out = [], seen = {};
    for (var i = 0; i < kwList.length && out.length < n; i++) {
      var r = searchBooks([kwList[i]], 5);
      for (var j = 0; j < r.length && out.length < n; j++) {
        var k = r[j].line.slice(0, 12);
        if (seen[k]) continue;
        seen[k] = 1;
        out.push(r[j]);
      }
    }
    return out;
  }

  /* ══════════ 五行 / 十神 ══════════ */
  var GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  var ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  var WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  var WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  var ZHI_CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
  var ZHI_HE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };

  function cls(wx) { return 'wx-' + wx; }
  function ganOf(gz) { return gz ? gz.charAt(0) : ''; }
  function zhiOf(gz) { return gz ? gz.charAt(1) : ''; }

  /* ══════════ 视图切换 ══════════ */
  var VIEWS = ['home', 'bazi', 'liuyao', 'today', 'books'];
  var current = 'home';

  function show(name) {
    if (current === name) return;
    VIEWS.forEach(function (v) {
      var el = $('#v-' + v);
      if (el) el.classList.toggle('on', v === name);
    });
    var sp = $('#spring');
    if (sp) sp.style.display = name === 'home' ? '' : 'none';
    current = name;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function transit(name, fromEl) {
    var r = $('#ripple');
    var rect = fromEl ? fromEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    var radius = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    var size = radius * 2.4;
    r.style.width = r.style.height = size + 'px';
    r.style.left = cx + 'px';
    r.style.top = cy + 'px';
    r.classList.remove('go');
    void r.offsetWidth;
    r.classList.add('go');
    var v = $('#veil');
    v.style.transition = 'opacity .3s';
    v.classList.add('on');
    setTimeout(function () { show(name); }, 200);
    setTimeout(function () { v.classList.remove('on'); }, 460);
  }

  $$('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { transit(b.dataset.view, b); });
  });
  $$('[data-home]').forEach(function (b) {
    b.addEventListener('click', function () { transit('home', b); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current !== 'home') transit('home', $('.back'));
  });

  /* ══════════ 八字 ══════════ */
  var sex = 1;

  $$('#sex-seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#sex-seg button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      sex = +b.dataset.sex;
    });
  });

  function baziCalc(dateStr, hour, gender) {
    var p = dateStr.split('-').map(Number);
    var solar = Solar.fromYmdHms(p[0], p[1], p[2], hour, 0, 0);
    var lunar = solar.getLunar();
    var ec = lunar.getEightChar();
    var pillars = [
      { role: '年柱', gz: ec.getYear(), ss: ec.getYearShiShenGan(), hide: ec.getYearHideGan(), hss: ec.getYearShiShenZhi(), ny: ec.getYearNaYin() },
      { role: '月柱', gz: ec.getMonth(), ss: ec.getMonthShiShenGan(), hide: ec.getMonthHideGan(), hss: ec.getMonthShiShenZhi(), ny: ec.getMonthNaYin() },
      { role: '日柱', gz: ec.getDay(), ss: '日主', hide: ec.getDayHideGan(), hss: ec.getDayShiShenZhi(), ny: ec.getDayNaYin() },
      { role: '时柱', gz: ec.getTime(), ss: ec.getTimeShiShenGan(), hide: ec.getTimeHideGan(), hss: ec.getTimeShiShenZhi(), ny: ec.getTimeNaYin() }
    ];
    var dayGan = ganOf(ec.getDay());
    var dayWx = GAN_WX[dayGan];

    // 五行权重
    var w = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
    pillars.forEach(function (pl, i) {
      var g = ganOf(pl.gz), z = zhiOf(pl.gz);
      w[GAN_WX[g]] += 1;
      var mult = i === 1 ? 1.7 : 1.2;              // 月令加重
      var hide = pl.hide || [];
      hide.forEach(function (h, k) {
        var ww = GAN_WX[h] || '土';
        w[ww] += k === 0 ? mult : mult * 0.42;
      });
      if (!hide.length) w[ZHI_WX[z]] += mult;
    });

    var total = 0; for (var k in w) total += w[k];
    var shengMe = null;
    for (var a in WX_SHENG) if (WX_SHENG[a] === dayWx) shengMe = a;
    var ally = w[dayWx] + w[shengMe];
    var ratio = ally / total;

    // 大运
    var yun = ec.getYun(gender);
    var dys = yun.getDaYun().filter(function (d) { return d.getGanZhi(); }).slice(0, 9);
    var nowYear = new Date().getFullYear();

    return {
      solar: solar, lunar: lunar, ec: ec, pillars: pillars,
      dayGan: dayGan, dayWx: dayWx, shengMe: shengMe,
      wuxing: w, total: total, ratio: ratio,
      strength: ratio > 0.56 ? '偏旺' : ratio > 0.46 ? '中和' : ratio > 0.36 ? '偏弱' : '极弱',
      dayun: dys, nowYear: nowYear, yunStart: yun.getStartYear() + '年' + yun.getStartMonth() + '月',
      bazi: ec.getYear() + ' ' + ec.getMonth() + ' ' + ec.getDay() + ' ' + ec.getTime()
    };
  }

  function renderBazi(r) {
    var wx = r.wuxing;
    var order = ['木', '火', '土', '金', '水'];

    var pillarsHtml = r.pillars.map(function (pl) {
      var g = ganOf(pl.gz), z = zhiOf(pl.gz);
      var hideTxt = (pl.hide || []).join(' ') || ZHI_WX[z];
      return '<div class="pillar">' +
        '<div class="role">' + pl.role + '</div>' +
        '<div class="ss"' + (P.shishen[pl.ss] ? ' title="' + esc(P.shishen[pl.ss]) + '"' : '') + '>' + esc(pl.ss || '') + '</div>' +
        '<span class="gan ' + cls(GAN_WX[g]) + '">' + g + '</span>' +
        '<span class="zhi ' + cls(ZHI_WX[z]) + '">' + z + '</span>' +
        '<div class="hide">' + esc(hideTxt) + '</div>' +
        '<div class="nayin">' + esc(pl.ny || '') + '</div>' +
        '</div>';
    }).join('');

    var wxMax = Math.max.apply(null, order.map(function (o) { return wx[o]; }));
    var wxHtml = order.map(function (o) {
      var v = wx[o], pct = Math.round(v / r.total * 100);
      return '<div class="wx-row ' + cls(o) + '"><span>' + o + '</span>' +
        '<span class="wx-bar"><i style="width:' + Math.max(2, v / wxMax * 100) + '%"></i></span>' +
        '<span style="text-align:right">' + pct + '%</span></div>';
    }).join('');

    var dyHtml = r.dayun.map(function (d) {
      var gz = d.getGanZhi(), y0 = d.getStartYear(), y1 = d.getEndYear();
      var on = r.nowYear >= y0 && r.nowYear <= y1;
      return '<div class="dy' + (on ? ' now' : '') + '"><div class="gz">' + gz + '</div>' +
        '<div class="yr">' + y0 + '</div></div>';
    }).join('');

    // 断语
    var gan = r.dayGan, dw = r.dayWx;
    var monthZhi = zhiOf(r.pillars[1].gz);
    var monthWx = ZHI_WX[monthZhi];
    var shishen = r.pillars.map(function (p) { return p.ss; }).filter(function (s) { return s && s !== '日主'; });
    var topWx = order.slice().sort(function (a, b) { return wx[b] - wx[a]; })[0];
    var weakWx = order.slice().sort(function (a, b) { return wx[a] - wx[b]; })[0];

    var p1 = '日主 <b>' + gan + '</b>，' + dw + '也。生于<b>' + monthZhi + '月</b>，月令' + monthWx +
      '地，' + (monthWx === dw ? '同气相求，得令有根' :
        WX_SHENG[monthWx] === dw ? '月令生我，源头不竭' :
          WX_KE[monthWx] === dw ? '月令克我，出身受制' :
            WX_SHENG[dw] === monthWx ? '我生月令，泄气于外' : '我克月令，力有我出') +
      '。通盘计之，同党（比劫与印）约占 <b>' + Math.round(r.ratio * 100) + '%</b>，' +
      '四柱呈<b>' + r.strength + '</b>之象。';

    var p2 = {
      '偏旺': '身旺者，气足而能任财官，宜泄宜克，不宜再助。行运见食伤、财、官，皆为我用；再见比劫印绶，则如满水更溢，反成壅塞。',
      '中和': '中和者，四柱无大偏枯，是最难得的底子。运来则动，运去则静，吉凶多由行运定，不在原局。此类命最忌自己折腾，宜守常而待时。',
      '偏弱': '身弱者，气不足以任财官，宜生宜扶。行运见印绶、比劫则如得援兵；若再行财官食伤之地，恐力不从心，事多劳而少成。',
      '极弱': '身极弱者，四柱克泄交加，根气单薄。宜专意扶身，忌多方分力；与其广开财路，不如守一而深，借势借力，方为长久。'
    }[r.strength];

    var p3 = '五行之中，<b>' + topWx + '</b>最盛（' + Math.round(wx[topWx] / r.total * 100) + '%），<b>' +
      weakWx + '</b>最寡（' + Math.round(wx[weakWx] / r.total * 100) + '%）。' +
      (wx[weakWx] / r.total < 0.08
        ? '一处几近于无，是全局缺口所在——凡所缺者，多为一生所求；求之不得则郁，求之有度则成。'
        : '五气尚能流转，无明显缺绝，格局偏于平稳。') +
      '十神见 ' + shishen.join('、') + '，以月干为纲，可作取用之一端。';

    var cites = pick([
      gan + dw,
      monthZhi + '月',
      '用神',
      shishen[0] || '格局',
      dw + '旺'
    ], 3);

    return {
      html: '<div class="sec"><p class="sec-t">四柱</p>' +
        '<p class="sec-note">' + esc(r.solar.toYmd()) + '　农历' + esc(r.lunar.toString()) +
        '　' + (sex ? '乾造' : '坤造') + '　起运 ' + esc(r.yunStart) + '</p>' +
        '<div class="pillars">' + pillarsHtml + '</div></div>' +

        '<div class="sec">' + (function () {
          var sp = P.strength[r.strength];
          return sp ? leadHtml(sp[0], sp[1], '盘面为「' + r.strength + '」，下面五行、大运是它的来由') : '';
        })() + '</div>' +

        '<div class="sec"><p class="sec-t">五行</p>' +
        '<div class="wuxing">' + wxHtml + '</div></div>' +

        '<div class="sec"><p class="sec-t">大运</p>' +
        '<p class="sec-note">一步十年，朱色者为当下所行</p>' +
        '<div class="dayun">' + dyHtml + '</div></div>' +

        '<div class="sec"><p class="sec-t">依据</p>' +
        '<div class="read"><p>' + p1 + '</p><p>' + p2 + '</p><p>' + p3 + '</p></div>' +
        citeHtml(cites) + '</div>' +
        termsHtml(['四柱', '日主', '月令', '十神', '藏干', '纳音', '大运', '流年', '起运',
          '身旺', '身弱', '用神', '忌神', '比劫', '印绶', '食伤', '财', '官杀', '格局', '调候']) +

        '<div class="seal">命</div>',
      bazi: r.bazi
    };
  }

  $('#bazi-go').addEventListener('click', function () {
    var dateStr = $('#birth').value, hour = +$('#hour').value || 12;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) dateStr = '1995-08-16';
    var btn = this;
    btn.textContent = '落墨…';
    setTimeout(function () {
      try {
        var r = baziCalc(dateStr, hour, sex);
        var out = renderBazi(r);
        $('#bazi-out').innerHTML = out.html;
        $('#bazi-form').style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        var back = document.createElement('button');
        back.className = 'btn ghost';
        back.textContent = '重排';
        back.style.marginTop = '28px';
        back.addEventListener('click', function () {
          $('#bazi-out').innerHTML = '';
          $('#bazi-form').style.display = '';
        });
        $('#bazi-out').appendChild(back);
        btn.textContent = '落墨';
      } catch (e) {
        btn.textContent = '落墨';
        $('#bazi-out').innerHTML = '<p class="hint" style="margin-top:24px;color:#C4735E">排盘出错：' + esc(e.message) + '</p>';
        console.error(e);
      }
    }, 380);
  });

  /* ══════════ 六爻 ══════════ */
  var GUAS = window.GUA_DATA || [];
  var byBin = {};
  GUAS.forEach(function (g) { byBin[g.binary.join('')] = g; });

  function tossOnce() {
    var sum = 0, vals = [];
    for (var i = 0; i < 3; i++) { var v = Math.random() < 0.5 ? 2 : 3; vals.push(v); sum += v; }
    // 6 老阴(动) 7 少阳 8 少阴 9 老阳(动)
    return { sum: sum, vals: vals };
  }

  function lineInfo(sum) {
    if (sum === 6) return { yang: 0, moving: true, name: '老阴' };
    if (sum === 7) return { yang: 1, moving: false, name: '少阳' };
    if (sum === 8) return { yang: 0, moving: false, name: '少阴' };
    return { yang: 1, moving: true, name: '老阳' };
  }

  function drawGua(binary, movingSet, showTag) {
    var html = '<div class="lines">';
    for (var pos = 1; pos <= 6; pos++) {
      var yang = binary[pos - 1];
      var mv = movingSet && movingSet.indexOf(pos) >= 0;
      html += '<div class="line ' + (yang ? 'yang' : 'yin') + (mv ? ' moving' : '') + '">' +
        '<span class="mark">' + (yang ? '○' : '×') + '</span>' +
        '<span class="bar"><i></i><i></i></span>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function yaoName(pos, yang) {
    var POS = ['', '初', '二', '三', '四', '五', '上'];
    if (pos === 1) return yang ? '初九' : '初六';
    if (pos === 6) return yang ? '上九' : '上六';
    return (yang ? '九' : '六') + POS[pos];
  }

  // 朱熹《周易本义》变占法
  function judge(ben, bian, movings) {
    var n = movings.length;
    var out = { lines: [], note: '' };
    if (n === 0) {
      out.lines.push({ src: '本卦卦辞', gua: ben, text: ben.guaci });
      out.note = '六爻皆静，以本卦卦辞断之。事态已定，观其大体即可。';
    } else if (n === 1) {
      var p = movings[0];
      out.lines.push({ src: '本卦 ' + ben.yaos[p - 1].tag, gua: ben, text: ben.yaos[p - 1].text });
      out.note = '一爻独动，以此一爻为断。此事有一个明确的转折点，就在这一爻所指。';
    } else if (n === 2) {
      movings.forEach(function (p, i) {
        out.lines.push({ src: '本卦 ' + ben.yaos[p - 1].tag, gua: ben, text: ben.yaos[p - 1].text, main: i === 1 });
      });
      out.note = '两爻俱动，以两爻爻辞并观，上爻为主。两个因素同时在推，上面那个更重。';
    } else if (n === 3) {
      out.lines.push({ src: '本卦卦辞', gua: ben, text: ben.guaci, main: true });
      out.lines.push({ src: '变卦卦辞', gua: bian, text: bian.guaci });
      out.note = '三爻动，本卦与变卦并看，以本卦为主。贞（现状）悔（变局）同参。';
    } else if (n === 4) {
      var still = [1, 2, 3, 4, 5, 6].filter(function (p) { return movings.indexOf(p) < 0; });
      out.lines.push({ src: '变卦 ' + bian.yaos[still[1] - 1].tag, gua: bian, text: bian.yaos[still[1] - 1].text, main: true });
      out.lines.push({ src: '变卦 ' + bian.yaos[still[0] - 1].tag, gua: bian, text: bian.yaos[still[0] - 1].text });
      out.note = '四爻动，看变卦中两不变之爻，以下爻为主。大局已翻，唯余两点未定。';
    } else if (n === 5) {
      var one = [1, 2, 3, 4, 5, 6].filter(function (p) { return movings.indexOf(p) < 0; })[0];
      out.lines.push({ src: '变卦 ' + bian.yaos[one - 1].tag, gua: bian, text: bian.yaos[one - 1].text });
      out.note = '五爻动，以变卦中唯一不动之爻为断。众皆动而一不动，此不动者即定盘之星。';
    } else {
      if (ben.name === '乾') {
        out.lines.push({ src: '乾 · 用九', gua: ben, text: ben.yong });
        out.note = '六爻皆动而卦为乾，用九断之：见群龙无首，吉。不争首，反成其大。';
      } else if (ben.name === '坤') {
        out.lines.push({ src: '坤 · 用六', gua: ben, text: ben.yong });
        out.note = '六爻皆动而卦为坤，用六断之：利永贞。守正而久，是其道。';
      } else {
        out.lines.push({ src: '变卦卦辞', gua: bian, text: bian.guaci });
        out.note = '六爻尽动，以变卦卦辞断之。全盘皆变，旧局不复，直看新局。';
      }
    }
    return out;
  }

  var tossing = false;

  $('#toss-go').addEventListener('click', function () {
    if (tossing) return;
    tossing = true;
    var ask = ($('#ask').value || '').trim();
    var out = $('#liuyao-out');
    var form = $('#liuyao-form');
    form.style.display = 'none';

    var results = [];
    var step = 0;

    out.innerHTML = '<div class="toss" id="toss-stage">' +
      '<div class="coins"><span class="coin">乾</span><span class="coin">坤</span><span class="coin">易</span></div>' +
      '<div class="cnt" id="toss-cnt">第一爻</div>' +
      '<div id="toss-lines"><div class="lines" id="live-lines"></div></div>' +
      '</div>';

    var liveLines = [];

    function nextToss() {
      if (step >= 6) { finish(); return; }
      step++;
      var stage = $('#toss-stage');
      var cnt = $('#toss-cnt');
      if (!stage) return;
      cnt.textContent = '第' + '一二三四五六'.charAt(step - 1) + '爻';
      $$('.coin', stage).forEach(function (c) {
        c.classList.remove('fly');
        void c.offsetWidth;
        c.classList.add('fly');
      });
      var info = tossOnce();
      var li = lineInfo(info.sum);
      liveLines.push({ yang: li.yang, moving: li.moving, sum: info.sum });

      setTimeout(function () {
        var box = $('#live-lines');
        if (box) {
          box.innerHTML = liveLines.map(function (l, i) {
            return '<div class="line ' + (l.yang ? 'yang' : 'yin') + (l.moving ? ' moving' : '') + '">' +
              '<span class="mark">' + (l.yang ? '○' : '×') + '</span><span class="bar"><i></i><i></i></span></div>';
          }).join('');
        }
        setTimeout(nextToss, 260);
      }, 780);
    }

    function finish() {
      var benBin = liveLines.map(function (l) { return l.yang; });
      var bianBin = liveLines.map(function (l) { return l.moving ? (l.yang ? 0 : 1) : l.yang; });
      var movings = [];
      liveLines.forEach(function (l, i) { if (l.moving) movings.push(i + 1); });

      var ben = byBin[benBin.join('')];
      var bian = byBin[bianBin.join('')];
      if (!ben || !bian) { out.innerHTML = '<p class="hint">卦象数据缺失</p>'; tossing = false; return; }

      var j = judge(ben, bian, movings);
      var hasBian = movings.length > 0;

      // 动爻补《小象》原文
      j.lines.forEach(function (l) {
        var mm = /(初九|初六|九二|六二|九三|六三|九四|六四|九五|六五|上九|上六)/.exec(l.src || '');
        if (!mm || !l.gua || !l.gua.yaos) return;
        l.gua.yaos.forEach(function (y) { if (y.tag === mm[1] && y.xs) l.xs = y.xs; });
      });

      var html = '<div class="sec">' +
        (ask ? '<p class="sec-note">所问：' + esc(ask) + '</p>' : '') +
        '<div class="yao-wrap">' +
        '<div class="gua-col"><div class="cap">本卦</div>' + drawGua(ben.binary, movings) +
        '<div class="gua-name">' + ben.name + '</div><div class="gua-sym">' + ben.upper + '上' + ben.lower + '下</div></div>' +
        (hasBian ? '<div class="gua-col"><div class="cap">变卦</div>' + drawGua(bian.binary, null) +
          '<div class="gua-name">' + bian.name + '</div><div class="gua-sym">' + bian.upper + '上' + bian.lower + '下</div></div>' : '') +
        '</div></div>';

      var gp = P.gua[ben.name];
      if (gp) {
        html += '<div class="sec">' + leadHtml(gp[0], gp[1],
          '此卦为「' + ben.name + '」' + (hasBian ? '，之「' + bian.name + '」' : '') + '；下面原文是它的来由') + '</div>';
      }

      html += '<div class="sec"><p class="sec-t">卦辞</p>' +
        '<div class="read"><p><b>' + ben.name + '</b>：' + esc(ben.guaci) + '</p></div></div>';

      if (ben.tuan) {
        html += '<div class="sec"><p class="sec-t">彖</p>' +
          '<div class="read"><p>' + esc(ben.tuan) + '</p></div></div>';
      }
      if (ben.xiang) {
        html += '<div class="sec"><p class="sec-t">象</p><div class="read"><p>' + esc(ben.xiang) + '</p></div>';
        if (hasBian && bian.xiang) {
          html += '<blockquote class="cite"><q>' + esc(bian.xiang) +
            '</q><span class="src">变卦 ' + esc(bian.name) + '</span></blockquote>';
        }
        html += '</div>';
      }

      html += '<div class="sec"><p class="sec-t">断</p>' +
        '<div class="read"><p>' + j.note + '</p></div>' +
        j.lines.map(function (l) {
          return '<div class="cite" style="' + (l.main ? 'border-left-color:rgba(166,53,44,.6)' : '') + '">' +
            '<q>' + esc(l.src) + '：' + esc(l.text) + '</q>' +
            (l.xs ? '<q class="xs">象曰：' + esc(l.xs) + '</q>' : '') +
            '<q class="yi">今译：' + esc(yaoPlain(l.text)) + '</q>' +
            '<span class="src">' + l.gua.name + '</span></div>';
        }).join('') +
        '</div>';

      html += termsHtml(['本卦', '变卦', '之卦', '动爻', '静爻', '卦辞', '爻辞', '彖', '象',
        '小象', '世应', '六亲', '旬空', '贞', '悔亡', '无咎', '吝', '厉']);

      html += '<div class="seal">卦</div>';

      out.innerHTML = html;
      tossing = false;

      var again = document.createElement('button');
      again.className = 'btn ghost';
      again.textContent = '再问一卦';
      again.style.marginTop = '28px';
      again.addEventListener('click', function () {
        $('#ask').value = '';
        out.innerHTML = '';
        form.style.display = '';
      });
      out.appendChild(again);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setTimeout(nextToss, 300);
  });

  /* ══════════ 今日 ══════════ */
  function renderToday() {
    var now = new Date();
    var solar = Solar.fromDate(now);
    var lunar = solar.getLunar();
    var dayGZ = lunar.getDayInGanZhi();
    var monthGZ = lunar.getMonthInGanZhi();
    var yearGZ = lunar.getYearInGanZhi();
    var dayZhi = zhiOf(dayGZ);

    var yi = [], ji = [];
    try { yi = lunar.getDayYi() || []; } catch (e) { }
    try { ji = lunar.getDayJi() || []; } catch (e) { }

    var jq = '';
    try { jq = lunar.getJieQi() || ''; } catch (e) { }

    var ZHIS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    var TIME = ['23-1', '1-3', '3-5', '5-7', '7-9', '9-11', '11-13', '13-15', '15-17', '17-19', '19-21', '21-23'];
    var shichen = ZHIS.map(function (z, i) {
      var cls2 = 'sh';
      var mark = '';
      if (ZHI_CHONG[dayZhi] === z) { cls2 += ' bad'; mark = '冲'; }
      else if (ZHI_HE[dayZhi] === z) { cls2 += ' good'; mark = '合'; }
      else if (z === dayZhi) { cls2 += ' good'; mark = '同'; }
      return '<div class="' + cls2 + '"><b>' + z + '</b>' + TIME[i] + '<br>' + mark + '</div>';
    }).join('');

    var html = '<div class="sec">' +
      '<div class="today-hero">' +
      '<div class="big">' + dayGZ + '</div>' +
      '<div class="meta">' +
      '<div><span>公历</span>' + solar.toYmd() + '</div>' +
      '<div><span>农历</span>' + lunar.getYearInChinese() + '年 ' + lunar.getMonthInChinese() + '月' + lunar.getDayInChinese() + '</div>' +
      '<div><span>干支</span>' + yearGZ + '年 ' + monthGZ + '月 ' + dayGZ + '日</div>' +
      (jq ? '<div><span>节气</span>' + jq + '</div>' : '') +
      '</div></div></div>';

    html += '<div class="sec"><p class="sec-t">宜忌</p>' +
      '<p class="sec-note">依《协纪辨方书》择日之法，仅取大意</p>' +
      '<div class="yiji">' +
      '<div class="row"><span>宜</span><span>' + (yi.length ? esc(yi.slice(0, 10).join(' · ')) : '诸事平常') + '</span></div>' +
      '<div class="row"><span>忌</span><span>' + (ji.length ? esc(ji.slice(0, 10).join(' · ')) : '无大忌') + '</span></div>' +
      '</div></div>';

    html += '<div class="sec"><p class="sec-t">十二时</p>' +
      '<p class="sec-note">与日支相冲者凶，相合相同者吉</p>' +
      '<div class="shichen">' + shichen + '</div></div>';

    var cites = pick([dayGZ + '日', dayZhi + '日', '择日'], 2);
    if (cites.length) html += '<div class="sec"><p class="sec-t">参</p>' + citeHtml(cites) + '</div>';

    html += '<div class="seal">日</div>';
    $('#today-out').innerHTML = html;
  }

  /* ══════════ 藏书检索 ══════════ */
  function doSearch() {
    var q = ($('#q').value || '').trim();
    var box = $('#hits');
    if (!q) { box.innerHTML = '<p class="hint" style="margin-top:24px">输入一个词、一句原文，或一个卦名。</p>'; return; }
    var t0 = performance.now();
    var kws = q.split(/\s+/).filter(Boolean);
    var r = searchBooks(kws, 30);
    var dt = Math.round(performance.now() - t0);
    if (!r.length) {
      box.innerHTML = '<p class="hint" style="margin-top:24px">十种书里未见此语。换个说法试试，如「身弱」「用神」「潜龙」。</p>';
      return;
    }
    box.innerHTML = r.map(function (x) {
      var line = esc(x.line);
      kws.forEach(function (k) {
        line = line.split(esc(k)).join('<mark>' + esc(k) + '</mark>');
      });
      return '<div class="hit"><div class="hl">' + line + '</div>' +
        '<div class="hm">' + esc(x.book) + '</div></div>';
    }).join('') + '<p class="hint" style="margin-top:20px">' + r.length + ' 条　用时 ' + dt + 'ms</p>';
  }

  $('#q-go').addEventListener('click', doSearch);
  $('#q').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

  /* ══════════ 初始化 ══════════ */
  renderToday();
  var cnt = $('#bk-count');
  if (cnt) cnt.textContent = BOOKS.length + ' 种 · ' + BOOKS.reduce(function (s, b) { return s + b.lines.length; }, 0) + ' 条';

  // 首页点水滴时的那一圈额外涟漪
  $$('.drop').forEach(function (d) {
    d.addEventListener('pointerenter', function () {
      var r = $('#ripple');
      if (!r) return;
    });
  });

  // hash 直达
  function fromHash() {
    var h = (location.hash || '').replace('#', '');
    if (VIEWS.indexOf(h) > -1) show(h);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();

  // 参数直达（调试 / 分享预置）
  var qs = new URLSearchParams(location.search);
  if (qs.get('auto')) {
    setTimeout(function () {
      var a = qs.get('auto');
      if (a === 'bazi' && $('#bazi-go')) { $('#birth').value = qs.get('d') || '1995-08-16'; $('#bazi-go').click(); }
      if (a === 'liuyao' && $('#toss-go')) $('#toss-go').click();
      if (a === 'books') { $('#q').value = qs.get('q') || '甲木'; doSearch(); }
    }, 500);
  }

  if (!window.Solar) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="position:fixed;bottom:12px;left:12px;z-index:99;font-size:12px;color:#C4735E">排盘库未能加载，八字功能不可用</div>');
  }
})();
