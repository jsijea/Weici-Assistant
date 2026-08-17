// king.js
// 万词王、账号信息、听力抓取模块

import { S } from './state.js';
import {
  esc, htmlToPlain, getCorrectLetter, parseSubs, copyText, sleep
} from './utils.js';
import {
  getTaskTest, getTaskCatalog, getTaskList, kingUpload, getKingRank,
  saveNumberData, getUserInfo, ensureSessionValid
} from './api.js';
import {
  toast, showLoading, hideLoading
} from './ui.js';
import {
  $, $val, klog, LEVELS
} from './common.js';

// ================= 万词王上传 =================
export async function runKingUpload() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const btn = $('kingUploadBtn');
  const classId = $val('kingClassId') || S.classId;
  const count = $val('kingCount');
  if (!count) { toast('请输入完成数 count'); return; }
  btn.disabled = true;
  $('kingLog').innerHTML = '';
  try {
    showLoading();
    klog('⏳ 正在上传到维词竞技场 King...');
    const resp = await kingUpload(S.phone, S.session, classId, count);
    if (resp && resp.result_code === 200) {
      klog('✅ 上传成功！', 'green');
      klog(JSON.stringify(resp, null, 2));
    } else {
      klog('⚠️ 服务器响应：' + JSON.stringify(resp || {}), 'orange');
    }
  } catch (e) {
    klog('❌ 上传异常: ' + e.message, 'red');
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

// ================= 万词王排名 =================
export async function showKingRank() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const chipsBox = $('rankRangeChips');
  if (!chipsBox) return;
  chipsBox.innerHTML = '';
  let current = '0';
  const ranges = [['0', '全国'], ['1', '省'], ['2', '市'], ['3', '学校'], ['4', '班级']];
  ranges.forEach(pair => {
    const v = pair[0], label = pair[1];
    const chip = document.createElement('span');
    chip.className = 'chip' + (v === current ? ' active' : '');
    chip.textContent = label;
    chip.onclick = async function () {
      current = v;
      chipsBox.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
      await loadKingRank(v);
    };
    chipsBox.appendChild(chip);
  });
  $('rankOverlay').classList.remove('hidden');
  await loadKingRank('0');
}

export async function loadKingRank(range) {
  const list = $('rankList');
  if (!list) return;
  list.innerHTML = '加载中...';
  try {
    showLoading();
    const data = await getKingRank(S.phone, S.session, parseInt(range));
    if (!data.length) { list.innerHTML = '暂无排名数据'; return; }
    list.innerHTML = data.map((d, i) => {
      return (d.rank || (i + 1)) + '. ' + (d.student_name || '') + ' [' + (d.user_title || '') + '] ' + (d.school || '') + (d.class_name ? '/' + d.class_name : '') + ' · 周词量 ' + (d.king_week != null ? d.king_week : '-');
    }).join('<br/>');
  } catch (e) {
    list.innerHTML = '获取失败: ' + esc(e.message);
  } finally {
    hideLoading();
  }
}

// ================= 账号数据修改 =================
export async function runSaveNumber() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const kw = parseInt($val('nkKnowWell'));
  const lr = parseInt($val('nkLearn'));
  const ud = parseInt($val('nkUseDay'));
  if (isNaN(kw) || isNaN(lr) || isNaN(ud)) { toast('请填写有效的数字'); return; }
  const btn = $('nkSaveBtn');
  btn.disabled = true;
  try {
    showLoading();
    const resp = await saveNumberData(S.phone, S.session, kw, lr, ud);
    if (resp && resp.result_code === 200) {
      localStorage.setItem('nkKnowWell', String(kw));
      localStorage.setItem('nkLearn', String(lr));
      localStorage.setItem('nkUseDay', String(ud));
      toast('✅ 账号数据已保存');
      klog('✅ 账号数据保存成功<br/>' + JSON.stringify(resp, null, 2) + '<br/>', undefined, true);
    } else {
      toast('保存失败: ' + ((resp && resp.description) || '未知错误'));
    }
  } catch (e) {
    toast('保存异常: ' + e.message);
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

// ================= 账号信息 =================
function levelInfo(kw) {
  kw = Math.max(0, parseInt(kw) || 0);
  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    if (kw <= L.max) {
      let pct;
      if (L.max === Infinity) { pct = 100; } else { pct = Math.round((kw - L.min) / (L.max - L.min) * 100); pct = Math.max(3, Math.min(100, pct)); }
      return { level: L, pct: pct, next: LEVELS[i + 1] || null };
    }
  }
  const L = LEVELS[LEVELS.length - 1];
  return { level: L, pct: 100, next: null };
}

function accRow(label, value) {
  return '<div class="acc-row"><span class="acc-label">' + esc(label) + '</span><span class="acc-value">' + value + '</span></div>';
}

export async function loadAccountInfo() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const btn = $('accInfoBtn');
  btn.disabled = true; btn.textContent = '获取中...';
  try {
    showLoading();
    const info = await getUserInfo(S.phone, S.session);
    const kw = parseInt(info.know_well) || 0;
    const li = levelInfo(kw);
    const title = info.title || (li.level ? li.level.title : '-');
    const useDay = (info.use_day != null) ? info.use_day : '-';
    const learn = (info.learn != null) ? info.learn : '-';
    const rank = (info.rank != null) ? info.rank : '-';
    let html = '';
    html += accRow('称号', esc(title));
    html += accRow('坚持天数', useDay + ' 天');
    html += '<div class="acc-row" style="flex-direction:column;align-items:stretch">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><span class="acc-label">学习力</span><span class="acc-value">' + kw + '</span></div>' +
      '<div class="acc-progress"><div class="acc-progress-bar" style="width:' + li.pct + '%"></div></div>' +
      '<div class="acc-level">' + (li.level ? ('Lv.' + li.level.lv + ' ' + li.level.title) : '') + (li.next ? (' · 距 Lv.' + li.next.lv + ' ' + li.next.title + ' 还差 ' + Math.max(0, li.next.min - kw)) : ' · 已满级') + '</div>' +
      '</div>';
    html += accRow('已掌握词', learn);
    html += accRow('等级 rank', rank);
    $('accInfoBody').innerHTML = html;
    $('accInfoBody').classList.remove('hidden');
  } catch (e) {
    toast('获取失败: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '获取账号信息';
    hideLoading();
  }
}

// ================= 获取听力 =================
export async function fetchHearing() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const start = parseInt($val('hdStart'));
  const end = parseInt($val('hdEnd'));
  if (isNaN(start) || isNaN(end)) { toast('请输入有效的 day_id 范围'); return; }
  if (start > end) { toast('起始应小于等于结束'); return; }
  const btn = $('hdFetchBtn');
  const list = $('hdList');
  btn.disabled = true;
  list.innerHTML = '<div class="empty">抓取中...</div>';
  const results = [];
  try {
    showLoading();
    for (let d = start; d <= end; d++) {
      try {
        const test = await getTaskTest(d, S.phone, S.session, 0, 8);
        if (test && test.length) {
          results.push({ dayId: d, title: (test[0].subject || ('day_id ' + d)), test: test });
        }
      } catch (e) { /* 跳过 */ }
      await sleep(120);
    }
    renderHearingList(results);
  } catch (e) {
    list.innerHTML = '<div class="empty">抓取失败: ' + esc(e.message) + '</div>';
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

function renderHearingList(results) {
  const list = $('hdList');
  if (!list) return;
  if (!results.length) { list.innerHTML = '<div class="empty">该范围没有获取到听力</div>'; return; }
  list.innerHTML = '';
  results.forEach(r => {
    const subCount = r.test.reduce((n, mq) => n + parseSubs(mq).length, 0);
    const item = document.createElement('div');
    item.className = 'card';
    item.innerHTML = `
      <div class="primary" style="font-weight:600;font-size:14px">${esc(r.title)}</div>
      <div class="muted" style="margin-top:2px">day_id ${r.dayId} · 大题 ${r.test.length} · 小题 ${subCount}</div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn tonal small grow" data-hall="${r.dayId}">复制听力原文</button>
        <button class="btn small grow" data-hans="${r.dayId}">只复制答案</button>
      </div>`;
    list.appendChild(item);
  });
  list.querySelectorAll('[data-hall]').forEach(b => {
    b.onclick = () => {
      const r = results.find(x => String(x.dayId) === b.dataset.hall);
      if (r) copyHearingAll(r);
    };
  });
  list.querySelectorAll('[data-hans]').forEach(b => {
    b.onclick = () => {
      const r = results.find(x => String(x.dayId) === b.dataset.hans);
      if (r) copyHearingAnswers(r);
    };
  });
}

function copyHearingAll(r) {
  const lines = [];
  r.test.forEach((mq, i) => {
    lines.push('【' + (mq.subject || ('Text ' + (i + 1))) + '】');
    lines.push(htmlToPlain(mq.original_text) || '（无原文）');
    lines.push('');
  });
  copyText(lines.join('\n'), '已复制听力原文');
}

function copyHearingAnswers(r) {
  const letters = [];
  r.test.forEach(mq => parseSubs(mq).forEach(sub => letters.push(getCorrectLetter(sub.answer))));
  const lines = [];
  lines.push('【' + (r.title || '听力') + '】');
  for (let s = 0; s < letters.length; s += 5) {
    const e = Math.min(s + 5, letters.length);
    lines.push((s + 1) + '-' + e + ' ' + letters.slice(s, e).join(''));
  }
  copyText(lines.join('\n'), '已复制答案');
}

// ================= 获取今日 day_id =================
function isTodayTs(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export async function fetchTodayDayIds() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const btn = $('hdTodayBtn');
  const box = $('hdTodayList');
  btn.disabled = true;
  box.innerHTML = '<span class="muted">查询中...</span>';
  try {
    showLoading();
    let tasks = S.tasks && S.tasks.length ? S.tasks : await getTaskList(S.phone, S.session);
    if (!tasks || !tasks.length) { box.innerHTML = '<span class="muted">暂无任务</span>'; return; }
    const found = [];
    for (const t of tasks) {
      try {
        const catalogs = await getTaskCatalog(t.id, S.phone, S.session, 8);
        if (catalogs && catalogs.length) {
          catalogs.forEach(c => {
            if (c.create_time && isTodayTs(c.create_time)) {
              found.push({ taskId: t.id, dayId: c.id, title: c.title || ('day_id ' + c.id) });
            }
          });
        }
      } catch (e) { /* 跳过 */ }
      await sleep(120);
    }
    renderTodayDayIds(found);
  } catch (e) {
    box.innerHTML = '<span class="muted">查询失败: ' + esc(e.message) + '</span>';
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

function renderTodayDayIds(found) {
  const box = $('hdTodayList');
  if (!box) return;
  if (!found.length) { box.innerHTML = '<span class="muted">今日未找到 day_id</span>'; return; }
  box.innerHTML = '';
  found.forEach(f => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = f.dayId + ' · ' + (f.title || '');
    chip.onclick = function () {
      $('hdStart').value = f.dayId;
      $('hdEnd').value = f.dayId;
      toast('已填入 day_id ' + f.dayId);
    };
    box.appendChild(chip);
  });
}