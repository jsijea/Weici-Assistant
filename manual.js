// manual.js
// 手动答题模块：加载、渲染、提交、详情辅助

import { S } from './state.js';
import {
  esc, htmlToPlain, audioUrl, getCorrectLetter,
  parseDuration, parseSubs, collectOptions, extractQuestionNumber,
  sleep
} from './utils.js';
import {
  getTaskCatalog, getTaskTest, submitError, submitSync, ensureSessionValid
} from './api.js';
import {
  toast, showLoading, hideLoading, openDetail, closeSubmitDialog
} from './ui.js';
import {
  PAGE_SIZE, $, $val, alog,
  mainSoundPath, mainSoundName   // 关键补充导入
} from './common.js';

// ================= 手动答题 =================
export async function loadDay(dayId, title, source) {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const m = S.manual;
  m.dayId = dayId; m.dayName = title; m.page = 0; m.selections = {};
  m.showAnswer = false;
  const btn = $('manualShowAnswer');
  if (btn) btn.textContent = '🔎 显示答案';
  renderCatalogChips();
  try {
    showLoading();
    m.test = await getTaskTest(dayId, S.phone, S.session, source);
    renderManual();
  } catch (e) {
    toast('加载题目失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

export async function loadManualTask(taskId, taskName) {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const m = S.manual;
  m.taskId = parseInt(taskId); m.taskName = taskName || ('任务 ' + taskId);
  m.dayId = null; m.test = []; m.page = 0; m.selections = {};
  // 重置计时器（动态导入避免循环依赖）
  const { resetTimer, startTimer } = await import('./ui.js');
  resetTimer(); startTimer();
  const timerBtn = $('timerPauseBtn');
  if (timerBtn) timerBtn.textContent = S.timer.running ? '⏸' : '▶';
  $('manualCurrent').textContent = '';
  try {
    showLoading();
    m.catalogs = await getTaskCatalog(m.taskId, S.phone, S.session);
    renderCatalogChips();
    if (m.catalogs.length) {
      await loadDay(m.catalogs[0].id, m.catalogs[0].title || '', m.catalogs[0].source || 0);
    } else {
      $('manualList').innerHTML = '<div class="empty">该任务没有听力目录</div>';
      $('manualPager').classList.add('hidden');
    }
  } catch (e) {
    toast('加载任务失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

export function renderCatalogChips() {
  const box = $('manualCatalog');
  if (!box) return;
  box.innerHTML = '';
  const m = S.manual;
  if (!m.catalogs || !m.catalogs.length) {
    box.innerHTML = '<span class="muted">请先加载任务，选择试卷/听力单元</span>';
    return;
  }
  for (const c of m.catalogs) {
    const chip = document.createElement('div');
    chip.className = 'chip' + (c.id === m.dayId ? ' active' : '');
    chip.textContent = `${c.title || ('单元 ' + c.id)}`;
    chip.onclick = () => loadDay(c.id, c.title || '', c.source || 0);
    box.appendChild(chip);
  }
}

export function renderManual() {
  const m = S.manual;
  const list = $('manualList');
  const pager = $('manualPager');
  if (!list || !pager) return;
  if (!m.test || !m.test.length) {
    list.innerHTML = '<div class="empty">暂无题目，请先选择任务并加载单元</div>';
    pager.classList.add('hidden');
    const showBtn = $('manualShowAnswer');
    if (showBtn) showBtn.disabled = true;
    return;
  }
  const showBtn = $('manualShowAnswer');
  if (showBtn) showBtn.disabled = false;
  const totalPages = Math.ceil(m.test.length / PAGE_SIZE);
  if (m.page < 0) m.page = 0;
  if (m.page >= totalPages) m.page = totalPages - 1;
  const start = m.page * PAGE_SIZE;
  const pageItems = m.test.slice(start, start + PAGE_SIZE);

  $('manualCurrent').textContent = `${m.taskName||''} · ${m.dayName||''} · 共 ${m.test.length} 道大题`;
  $('manualPageInfo').textContent = `第 ${m.page+1} / ${totalPages} 页`;
  pager.classList.toggle('hidden', totalPages <= 1);
  $('manualPrev').disabled = (m.page === 0);
  $('manualNext').disabled = (m.page >= totalPages - 1);

  let html = '';
  pageItems.forEach((mainQ, i) => {
    const abs = start + i + 1;
    const subs = parseSubs(mainQ);
    const soundPath = mainSoundPath(mainQ);      // 使用导入的函数
    const soundName = mainSoundName(mainQ);      // 使用导入的函数
    const audio = audioUrl(soundPath);
    const originalText = mainQ.original_text || '';
    const analysis = mainQ.analysis_html || mainQ.analysis || '';

    html += `<div class="card q-card">
      <div class="q-header">
        <span class="q-index">第 ${abs} 组</span>
        <span class="q-name">${esc(soundPath)}${soundName?' · '+esc(soundName):''}</span>
      </div>`;
    if (audio) {
      html += `<div class="audio-wrap">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg>
        <audio controls preload="none" src="${esc(audio)}"></audio>
      </div>`;
    }
    subs.forEach(sub => {
      const no = extractQuestionNumber(sub.subject);
      html += `<div class="sub-q" data-correct="${esc(sub.answer)}">
        <div class="sub-subject">${no>0?no+'. ':''}${esc(sub.subject)}</div>
        <div class="opt-list">${buildOptionHTML(sub)}</div>
      </div>`;
    });
    html += `<div class="q-actions">
      <button class="btn tonal small" data-toggle-orig="${mainQ.id}">🧾 查看原文</button>
      <button class="btn outlined small" data-detail="${mainQ.id}">📋 详情 / 复制</button>
    </div>`;
    if (originalText) {
      html += `<div class="q-original-box hidden" data-orig="${mainQ.id}">${originalText}</div>`;
    }
    if (analysis) {
      html += `<div class="q-analysis-box hidden" data-anal="${mainQ.id}">📌 ${analysis}</div>`;
    }
    html += '</div>';
  });
  list.innerHTML = html;

  // 事件绑定
  list.querySelectorAll('.opt').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const cid = parseInt(el.dataset.cid);
      const opt = el.dataset.opt;
      S.manual.selections[cid] = (S.manual.selections[cid] === opt) ? null : opt;
      const parent = el.closest('.sub-q');
      parent.querySelectorAll('.opt').forEach(o => {
        o.classList.remove('selected', 'correct', 'wrong');
        if (!S.manual.showAnswer && o.dataset.opt === S.manual.selections[cid]) o.classList.add('selected');
        if (S.manual.showAnswer) {
          const correct = parent.dataset.correct;
          if (o.dataset.opt === correct) o.classList.add('correct');
          else if (o.dataset.opt === S.manual.selections[cid]) o.classList.add('wrong');
        }
      });
    };
  });
  list.querySelectorAll('[data-toggle-orig]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.toggleOrig;
      const box = list.querySelector(`[data-orig="${id}"]`);
      const anal = list.querySelector(`[data-anal="${id}"]`);
      if (box) { box.classList.toggle('hidden'); btn.textContent = box.classList.contains('hidden') ? '🧾 查看原文' : '🙈 隐藏原文'; }
      if (anal && !anal.classList.contains('hidden')) anal.classList.add('hidden');
    };
  });
  list.querySelectorAll('[data-detail]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.detail);
      const mainQ = m.test.find(x => x.id === id);
      if (mainQ) openDetail(mainQ);
    };
  });
}

function buildOptionHTML(sub) {
  const opts = collectOptions(sub);
  const selected = S.manual.selections[sub.id];
  const showAns = S.manual.showAnswer;
  const correct = sub.answer;
  const letters = ['A', 'B', 'C', 'D'];
  return opts.map((o, i) => {
    let cls = 'opt';
    if (showAns) {
      if (o === correct) cls += ' correct';
      else if (selected === o) cls += ' wrong';
    } else if (selected === o) cls += ' selected';
    return `<div class="${cls}" data-cid="${sub.id}" data-opt="${esc(o)}">
      <span class="letter">${letters[i] || '?'}</span>
      <span>${esc(o)}</span>
    </div>`;
  }).join('');
}

// ================= 详情弹窗辅助 =================
export function buildDetailAllText(mainQ) {
  const subs = parseSubs(mainQ);
  const letters = ['A', 'B', 'C', 'D'];
  const lines = [];
  const soundPath = mainSoundPath(mainQ);
  lines.push('【听力文件】' + (soundPath || '（无）'));
  lines.push('【听力原文】');
  lines.push(htmlToPlain(mainQ.original_text) || '（无）');
  lines.push('');
  subs.forEach((sub, si) => {
    lines.push(`【第 ${si+1} 题】${sub.subject||''}`);
    const opts = collectOptions(sub);
    opts.forEach((o, i) => { lines.push(`${letters[i]||'?'}. ${o}`); });
    lines.push(`正确答案：${sub.answer||''}`);
    lines.push('');
  });
  const analysis = htmlToPlain(mainQ.analysis_html || mainQ.analysis || '');
  if (analysis) lines.push('【解析】' + analysis);
  return lines.join('\n');
}

export function buildDetailCorrectText(mainQ) {
  const subs = parseSubs(mainQ);
  const parts = [];
  subs.forEach((sub, si) => {
    const optText = sub.answer || '';
    parts.push(`${si+1}. ${getCorrectLetter(optText)}`);
  });
  return parts.join('  ');
}

// ================= 手动提交 =================
export async function doSubmitManual() {
  const m = S.manual;
  const btn = $('submitOk');
  if (!m.taskId || !m.test.length) { toast('无内容可提交'); return; }
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) { toast('Session 已失效，请重新登录'); return; }

  const duration = parseDuration($val('submitTime'));
  const correctMap = {};
  m.test.forEach(mainQ => { parseSubs(mainQ).forEach(sub => { if (sub.id) correctMap[sub.id] = sub.answer; }); });
  const userAnswers = {};
  m.test.forEach(mainQ => { parseSubs(mainQ).forEach(sub => { const ch = S.manual.selections[sub.id]; if (ch) userAnswers[sub.id] = ch; }); });
  if (!Object.keys(userAnswers).length) { toast('请先作答至少一题'); return; }
  btn.disabled = true; btn.textContent = '提交中...';
  try {
    showLoading();
    let okCnt = 0;
    for (const mainQ of m.test) {
      const answerArray = [];
      parseSubs(mainQ).forEach(sub => {
        const ch = userAnswers[sub.id];
        if (ch) answerArray.push({ content_id: sub.id, right: (ch === correctMap[sub.id]) ? 1 : 0, answer: ch });
      });
      if (!answerArray.length) continue;
      try { if (await submitError(mainQ.id, answerArray, S.phone, S.session)) okCnt++; } catch (e) { }
      await sleep(300);
    }
    let syncOk = false;
    try { syncOk = await submitSync(m.taskId, m.dayId, userAnswers, correctMap, S.phone, S.session, duration); } catch (e) { }
    closeSubmitDialog();
    if (syncOk) {
      const { resetTimer } = await import('./ui.js');
      resetTimer();
      toast('提交成功，用时 ' + duration + ' 秒');
    }
    else toast('错题已提交 ' + okCnt + ' 组，但任务同步失败');
  } catch (e) {
    toast('提交异常: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '确认提交';
    hideLoading();
  }
}