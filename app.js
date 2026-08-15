// app.js
import { S, RANK_BASE } from './state.js';
import {
  esc, htmlToPlain, audioUrl, getCorrectLetter, formatTime, maskPhone,
  parseDuration, parseSubs, collectOptions, copyText, extractQuestionNumber,
  sleep
} from './utils.js';
import {
  loginWithPassword, getLoginKey, buildCaptchaUrl, sendSmsCode, loginWithSms,
  getClassInfo, getTaskList, getTaskCatalog, getTaskTest, getTaskHistory,
  submitError, submitSync, kingUpload, getKingRank, saveNumberData, getUserInfo
} from './api.js';
import {
  toast, showLoading, hideLoading, syncFieldLabels, bindFieldLabels,
  updateTimer, startTimer, stopTimer, resetTimer, pauseTimer, resumeTimer, setTimerSeconds, openTimerEdit, closeTimerEdit, applyTimerEdit,
  openDetail, closeDetail, openSubmitDialog, closeSubmitDialog, closeKingRank,
  detailMainQ  // 导入共享变量
} from './ui.js';

// ================= 常量 =================
const PAGE_SIZE = 10;
const AUTO_COLORS = ['#e53935', '#1e88e5', '#8e24aa', '#ec407a'];
const KING_RANGES = [['0', '全国'], ['1', '省'], ['2', '市'], ['3', '学校'], ['4', '班级']];
const LEVELS = [
  { lv: 1, title: '白身', min: 0, max: 499 },
  { lv: 2, title: '童生', min: 500, max: 999 },
  { lv: 3, title: '秀才', min: 1000, max: 1999 },
  { lv: 4, title: '举人', min: 2000, max: 5999 },
  { lv: 5, title: '贡生', min: 6000, max: 17999 },
  { lv: 6, title: '进士', min: 18000, max: 53999 },
  { lv: 7, title: '探花', min: 54000, max: 107999 },
  { lv: 8, title: '榜眼', min: 108000, max: 215999 },
  { lv: 9, title: '状元', min: 216000, max: Infinity }
];

// ================= DOM 快捷 =================
const $ = id => document.getElementById(id);
const $val = id => { const e = $(id); return e ? e.value.trim() : ''; };

// ================= 日志缓冲区 =================
let autoLogBuf = [];

function alog(msg, cls) {
  autoLogBuf.push(cls ? `<span class="${cls}">${msg}</span>` : msg);
  if (autoLogBuf.length >= 20) flushLog();
}

function flushLog() {
  const el = $('autoLog');
  el.innerHTML = autoLogBuf.join('<br/>');
  el.scrollTop = el.scrollHeight;
}

function klog(msg, cls) {
  const el = $('kingLog');
  el.innerHTML += (cls ? `<span class="${cls}">${msg}</span>` : msg) + '<br/>';
  el.scrollTop = el.scrollHeight;
}

// ================= 辅助函数（用于手动答题） =================
function mainSoundPath(mainQ) {
  const si = mainQ.sound_info;
  if (si && si.length && si[0].sound) return si[0].sound;
  return mainQ.subject || '';
}
function mainSoundName(mainQ) {
  const si = mainQ.sound_info;
  if (si && si.length && si[0].sound_name) return si[0].sound_name;
  return '';
}
function globalQuestionIndex(mainQ) {
  const m = S.manual.test.indexOf(mainQ);
  let idx = 0;
  for (let i = 0; i < m && i < S.manual.test.length; i++) {
    idx += Math.max(1, parseSubs(S.manual.test[i]).length);
  }
  return idx + 1;
}

// ================= 登录 & 初始化 =================
async function loadUserData() {
  try {
    showLoading();
    if (!S.classId) {
      S.classId = await getClassInfo(S.phone, S.session);
      localStorage.setItem('wz_classId', S.classId);
    }
    $('autoClassId').value = S.classId || '';
    S.tasks = await getTaskList(S.phone, S.session);
    fillTaskSelect();
    renderAutoTasks();
    $("kingClassId").value = S.classId || "";
    syncFieldLabels();
  } catch (e) {
    console.warn('加载用户数据失败:', e);
  } finally {
    hideLoading();
  }
}

function fillTaskSelect() {
  const sel = $('manualTaskSel');
  sel.innerHTML = '<option value="">— 从任务列表选择 —</option>';
  for (const t of (S.tasks || [])) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.task_name || '未命名'} (#${t.id})`;
    sel.appendChild(opt);
  }
}

function enterApp() {
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('userChip').textContent = maskPhone(S.phone) + (S.classId ? ' · 班级 ' + S.classId : '');
  loadUserData();
}

function logout() {
  S.session = ''; S.phone = ''; S.classId = ''; S.tasks = [];
  localStorage.removeItem('wz_session'); localStorage.removeItem('wz_classId');
  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  toast('已退出登录');
}

async function verifySession() {
  try {
    S.classId = await getClassInfo(S.phone, S.session);
    localStorage.setItem('wz_classId', S.classId || '');
    return true;
  } catch (e) { }
  try {
    const t = await getTaskList(S.phone, S.session);
    S.tasks = t; fillTaskSelect(); renderAutoTasks();
    return true;
  } catch (e) { }
  try {
    await getTaskHistory(S.phone, S.session);
    return true;
  } catch (e) { }
  return false;
}

// ================= 自动答题 =================
async function runAutoTask() {
  const phone = S.phone, session = S.session;
  const taskIdStr = $val('autoTaskId');
  const classIdStr = $val('autoClassId');
  const duration = parseDuration($val('autoDuration'));
  const selfSelect = $('autoSelfSelect').checked;
  const outputLog = $('autoOutputLog').checked;
  const btn = $('autoStartBtn');

  if (!phone || !session) { alog('❌ 请先登录', 'red'); return; }

  let customTaskId = -1;
  if (taskIdStr) {
    customTaskId = parseInt(taskIdStr);
    if (isNaN(customTaskId)) { alog('❌ 任务ID必须是数字', 'red'); return; }
  }
  let customClassId = -1;
  if (classIdStr) {
    customClassId = parseInt(classIdStr);
    if (isNaN(customClassId)) { alog('❌ 班课ID必须是数字', 'red'); return; }
  }

  let wrongCount = 0;
  const customWrongIds = new Set();
  if (selfSelect) {
    const idsStr = $val('autoWrongIds');
    if (idsStr) {
      for (const idStr of idsStr.replace(/，/g, ',').split(/[\s,]+/).filter(s => s !== '')) {
        const id = parseInt(idStr);
        if (!isNaN(id) && id > 0) customWrongIds.add(id);
      }
    }
  } else {
    const cntStr = $val('autoWrongCount');
    if (cntStr) { const cnt = parseInt(cntStr); if (!isNaN(cnt) && cnt >= 0) wrongCount = cnt; }
  }

  btn.disabled = true; btn.textContent = '运行中...';
  autoLogBuf = []; $('autoLog').innerHTML = '';
  try {
    let classId = customClassId;
    if (classId < 0) {
      if (S.classId) classId = S.classId;
      else { classId = await getClassInfo(phone, session); S.classId = classId; localStorage.setItem('wz_classId', classId); }
    }
    alog('📋 班课ID: ' + classId, 'blue');

    let tasks = S.tasks && S.tasks.length ? S.tasks : await getTaskList(phone, session);
    if (!tasks || !tasks.length) { alog('⚠️ 没有任务', 'orange'); return; }
    S.tasks = tasks; fillTaskSelect();

    let taskIds = [];
    if (customTaskId > 0) { taskIds.push(customTaskId); }
    else if (tasks.length === 1) { taskIds.push(tasks[0].id); }
    else if (tasks.length > 1) {
      alog(`⚠️ 检测到 ${tasks.length} 个任务，请从以下选择任务ID填入上方输入框：`, 'orange');
      tasks.forEach((t, i) => alog(`  📌 任务${i+1}: ID=${t.id}，名称=${t.task_name||'未命名'}`));
      return;
    }
    if (!taskIds.length) { alog('⚠️ 没有有效的任务ID', 'orange'); return; }
    $('autoTaskId').value = taskIds[0];

    for (const taskId of taskIds) {
      alog(`🚀 开始处理任务 ${taskId}`, 'blue');
      const catalogs = await getTaskCatalog(taskId, phone, session);
      if (!catalogs || !catalogs.length) { alog(`⚠️ 任务 ${taskId} 无目录，跳过`, 'orange'); continue; }

      for (const catalog of catalogs) {
        const dayId = catalog.id, source = catalog.source || 0;
        alog(`📂 处理 day_id=${dayId} (${catalog.title||''}) source=${source}`);
        const taskTest = await getTaskTest(dayId, phone, session, source);
        if (!taskTest || !taskTest.length) { alog(`⚠️ day_id=${dayId} 无题目`, 'orange'); continue; }

        // 解析
        const mainHtmlMap = {}, mainHighlights = {}, correctMap = {}, optionsMap = {}, subjectMap = {}, subToMain = {}, subQNum = {}, mainSubIds = {};
        for (const mainQ of taskTest) {
          const mainId = mainQ.id;
          const html = mainQ.original_text || '';
          mainHtmlMap[mainId] = html;
          mainHighlights[mainId] = parseHighlights(html);
          const subs = parseSubs(mainQ);
          const subList = [];
          for (const sub of subs) {
            const cid = sub.id; if (!cid) continue;
            const correct = sub.answer; if (!correct) continue;
            correctMap[cid] = correct;
            subjectMap[cid] = sub.subject || '';
            subToMain[cid] = mainId;
            subQNum[cid] = extractQuestionNumber(sub.subject);
            subList.push(cid);
            optionsMap[cid] = collectOptions(sub);
          }
          mainSubIds[mainId] = subList;
        }

        const allIds = [];
        for (const mainQ of taskTest) { allIds.push(...(mainSubIds[mainQ.id] || [])); }
        const subIndexMap = {};
        allIds.forEach((cid, i) => subIndexMap[cid] = i + 1);

        const wrongIds = new Set();
        if (selfSelect) {
          for (const uid of customWrongIds) { if (uid >= 1 && uid <= allIds.length) wrongIds.add(allIds[uid - 1]); }
          if (!wrongIds.size) alog('⚠️ 自选错题无有效题号，将全部答对', 'orange');
        } else {
          const total = allIds.length;
          const real = Math.min(wrongCount, total);
          const shuffled = [...allIds];
          for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
          for (let i = 0; i < real; i++) wrongIds.add(shuffled[i]);
        }

        const userAnswers = {};
        for (const cid of allIds) {
          const correct = correctMap[cid];
          if (wrongIds.has(cid)) {
            const wo = optionsMap[cid].filter(o => o !== correct);
            userAnswers[cid] = wo.length ? wo[Math.floor(Math.random() * wo.length)] : correct;
          } else userAnswers[cid] = correct;
        }

        // 输出错题原文
        if (outputLog && wrongIds.size) {
          const sorted = [...wrongIds].sort((a, b) => subIndexMap[a] - subIndexMap[b]);
          const byMain = {};
          for (const cid of sorted) { const mid = subToMain[cid]; (byMain[mid] = byMain[mid] || []).push(cid); }
          for (const [mid, wrongInMain] of Object.entries(byMain)) {
            let plain = htmlToPlain(mainHtmlMap[mid]);
            if (!plain) plain = '（无听力原文）';
            const colorMap = {};
            wrongInMain.forEach((sid, i) => { if (i < AUTO_COLORS.length) colorMap[sid] = AUTO_COLORS[i]; });
            let annotated = plain;
            const hMap = mainHighlights[mid];
            if (hMap) {
              for (const sid of wrongInMain) {
                const qn = subQNum[sid];
                if (qn !== -1 && hMap[qn]) {
                  for (const s of hMap[qn]) { if (annotated.includes(s)) annotated = annotated.replace(s, `<span style="color:${colorMap[sid]||'#e53935'}">${s}</span>`); }
                }
              }
            }
            annotated = highlightSpeakers(annotated);
            alog('【听力原文】<br/>' + annotated + '<br/>');
            for (const sid of wrongInMain) {
              const idx = subIndexMap[sid];
              let d = `📝 第 ${idx} 题 (ID: ${sid})<br/>题干: ${subjectMap[sid]}<br/>`;
              const opts = optionsMap[sid];
              const letters = ['A', 'B', 'C', 'D'];
              opts.forEach((o, i) => { d += `   ${letters[i]||'?'}. ${o}<br/>`; });
              d += `正确答案: ${correctMap[sid]}<br/>用户选择: ${userAnswers[sid]}${userAnswers[sid]===correctMap[sid]?'（正确）':'（错误）'}`;
              alog(d);
            }
          }
        }

        // 答案汇总
        const correctLetters = allIds.map(cid => getCorrectLetter(correctMap[cid]));
        let csb = '✅ 正确答案汇总:<br/>';
        for (let s = 0; s < correctLetters.length; s += 5) { csb += `${s+1}-${Math.min(s+5,correctLetters.length)} <span class="green">${correctLetters.slice(s,s+5).join('')}</span><br/>`; }
        alog(csb);
        const submitLetters = allIds.map(cid => wrongIds.has(cid) ? getCorrectLetter(userAnswers[cid]) : getCorrectLetter(correctMap[cid]));
        let ssb = '📤 提交答案汇总:<br/>';
        for (let s = 0; s < submitLetters.length; s += 5) { ssb += `${s+1}-${Math.min(s+5,submitLetters.length)} <span class="blue">${submitLetters.slice(s,s+5).join('')}</span><br/>`; }
        alog(ssb);

        let right = 0, wrong = 0;
        allIds.forEach(cid => { userAnswers[cid] === correctMap[cid] ? right++ : wrong++; });
        alog(`📊 day_id=${dayId} 共 ${allIds.length} 题，正确 ${right}，错误 ${wrong}`);

        // 提交错题
        for (const mainQ of taskTest) {
          const mainId = mainQ.id;
          const answerArray = [];
          for (const sub of parseSubs(mainQ)) {
            const cid = sub.id; if (!cid) continue;
            const chosen = userAnswers[cid]; if (chosen === undefined) continue;
            answerArray.push({ content_id: cid, right: (chosen === correctMap[cid]) ? 1 : 0, answer: chosen });
          }
          try {
            const ok = await submitError(mainId, answerArray, phone, session);
            alog(`  ${ok?'✅':'❌'} 大题 ${mainId} 提交${ok?'成功':'失败'}`, ok ? 'green' : 'red');
          } catch (e) { alog(`  ❌ 大题 ${mainId} 提交异常: ${e.message}`, 'red'); }
          await sleep(300);
        }

        // 同步
        try {
          const ok = await submitSync(taskId, dayId, userAnswers, correctMap, phone, session, duration);
          alog(`  ${ok?'✅':'❌'} 任务 ${taskId} 同步${ok?'成功':'失败'}（day_id=${dayId}，耗时${duration}秒）`, ok ? 'green' : 'red');
        } catch (e) { alog(`  ❌ 任务 ${taskId} 同步异常: ${e.message}`, 'red'); }
      }
    }
    alog('✅ 所有任务处理完成！', 'green');
  } catch (e) {
    alog('❌ 发生异常: ' + e.message, 'red');
    console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = '开始运行';
    flushLog();
  }
}

function parseHighlights(html) {
  const result = {};
  if (!html) return result;
  const regex = /<(strong|span\s+style=["']color:#[0-9a-fA-F]{6}["'])>(.*?)<\/\1>/gis;
  const texts = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const inner = m[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().replace(/\s+/g, ' ');
    if (inner) texts.push(inner);
  }
  for (const text of texts) {
    const parts = text.split(/([\u2460-\u2473])/);
    let i = 0;
    while (i < parts.length) {
      if (parts[i] && /[\u2460-\u2473]/.test(parts[i])) {
        const num = parts[i].charCodeAt(0) - 0x2460 + 1;
        if (num >= 1 && num <= 20) {
          if (!result[num]) result[num] = [];
          let s = parts[i];
          if (i + 1 < parts.length) s += parts[i + 1];
          result[num].push(s);
          i += 2;
        } else i++;
      } else i++;
    }
  }
  return result;
}

function highlightSpeakers(text) {
  return text.replace(/\b(M:)/g, '<span style="color:#e8890c;">$1</span>')
             .replace(/\b(W:)/g, '<span style="color:#4368e0;">$1</span>');
}

async function loadAutoTasks() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
  const btn = $('autoLoadTasksBtn');
  btn.disabled = true;
  try {
    showLoading();
    S.tasks = await getTaskList(S.phone, S.session);
    fillTaskSelect();
    renderAutoTasks();
    toast('已加载 ' + S.tasks.length + ' 个任务');
  } catch (e) {
    toast('加载失败: ' + e.message);
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

// ================= 手动答题 =================
async function loadDay(dayId, title, source) {
  const m = S.manual;
  m.dayId = dayId; m.dayName = title; m.page = 0; m.selections = {};
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

async function loadManualTask(taskId, taskName) {
  const m = S.manual;
  m.taskId = parseInt(taskId); m.taskName = taskName || ('任务 ' + taskId);
  m.dayId = null; m.test = []; m.page = 0; m.selections = {};
  resetTimer(); startTimer();
  syncTimerBtn();
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

function renderCatalogChips() {
  const box = $('manualCatalog');
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

function renderManual() {
  const m = S.manual;
  const list = $('manualList');
  const pager = $('manualPager');
  if (!m.test || !m.test.length) {
    list.innerHTML = '<div class="empty">暂无题目，请先选择任务并加载单元</div>';
    pager.classList.add('hidden');
    $('manualShowAnswer').disabled = true;
    return;
  }
  $('manualShowAnswer').disabled = false;
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
    const soundPath = mainSoundPath(mainQ);
    const soundName = mainSoundName(mainQ);
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

// ================= 历史 =================
async function loadHistory() {
  const box = $('historyList');
  box.innerHTML = '<div class="empty">加载中...</div>';
  try {
    showLoading();
    S.history = await getTaskHistory(S.phone, S.session);
    renderHistory();
  } catch (e) {
    box.innerHTML = `<div class="empty">加载历史失败：${esc(e.message)}</div>`;
  } finally {
    hideLoading();
  }
}

function renderHistory() {
  const box = $('historyList');
  if (!S.history.length) {
    box.innerHTML = '<div class="empty">暂无历史作业</div>';
    return;
  }
  box.innerHTML = '';
  S.history.forEach(h => {
    const item = document.createElement('div');
    item.className = 'card';
    const rate = h.right_rate;
    const rateCls = rate >= 90 ? 'ok' : (rate >= 70 ? 'info' : 'warn');
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div>
          <div class="primary" style="font-weight:600;font-size:15px">${esc(h.task_name || '未命名任务')}</div>
          <div class="muted" style="margin-top:4px">任务ID ${h.task_id} · ${formatTime(h.end_time)}</div>
        </div>
        <span class="badge ${rateCls}">${rate != null ? rate + '%' : '—'}</span>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn tonal small grow" data-hredo="${h.task_id}">重做</button>
      </div>`;
    box.appendChild(item);
  });
  box.querySelectorAll('[data-hredo]').forEach(b => {
    b.onclick = () => { goTab('manual'); loadManualTask(b.dataset.hredo, ''); toast('已进入重做流程'); };
  });
}

// ================= 万词王 =================
async function runKingUpload() {
  const btn = $('kingUploadBtn');
  const classId = $val('kingClassId') || S.classId;
  const count = $val('kingCount');
  if (!count) { toast('请输入完成数 count'); return; }
  if (!S.phone || !S.session) { toast('请先登录'); return; }
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

async function showKingRank() {
  const chipsBox = $('rankRangeChips');
  chipsBox.innerHTML = '';
  let current = '0';
  KING_RANGES.forEach(pair => {
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

async function loadKingRank(range) {
  const list = $('rankList');
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
async function runSaveNumber() {
  const kw = parseInt($val('nkKnowWell'));
  const lr = parseInt($val('nkLearn'));
  const ud = parseInt($val('nkUseDay'));
  if (!S.phone || !S.session) { toast('请先登录'); return; }
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
      klog('✅ 账号数据保存成功<br/>' + JSON.stringify(resp, null, 2) + '<br/>');
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

async function loadAccountInfo() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
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

// ================= 手动答题 - 提交 =================
async function doSubmitManual() {
  const m = S.manual;
  const btn = $('submitOk');
  if (!m.taskId || !m.test.length) { toast('无内容可提交'); return; }
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
    if (syncOk) { resetTimer(); toast('提交成功，用时 ' + duration + ' 秒'); }
    else toast('错题已提交 ' + okCnt + ' 组，但任务同步失败');
  } catch (e) {
    toast('提交异常: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '确认提交';
    hideLoading();
  }
}

// ================= 导航 =================
function goTab(tab) {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  const pageId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1);
  document.querySelectorAll('.tab-page').forEach(x => x.classList.toggle('active', x.id === pageId));
  if (tab === 'history' && !S.history.length) loadHistory();
  if (tab === 'manual' && !S.timer.running) startTimer();
  syncTimerBtn();
}
function syncTimerBtn() {
  const b = $('timerPauseBtn');
  if (b) b.textContent = S.timer.running ? '⏸' : '▶';
}

// ================= 渲染任务列表 =================
function renderAutoTasks() {
  const box = $('autoTasks');
  if (!box) return;
  if (!S.tasks || !S.tasks.length) {
    box.innerHTML = '<span class="muted">暂无任务，点击上方"加载任务列表"获取</span>';
    return;
  }
  box.innerHTML = '';
  S.tasks.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = (t.task_name || '未命名') + ' #' + t.id;
    chip.onclick = function () {
      $('autoTaskId').value = t.id;
      toast('已填入任务ID: ' + t.id);
    };
    box.appendChild(chip);
  });
}

// ================= 详情弹窗辅助 =================
function buildDetailAllText(mainQ) {
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

function buildDetailCorrectText(mainQ) {
  const subs = parseSubs(mainQ);
  const parts = [];
  subs.forEach((sub, si) => {
    const optText = sub.answer || '';
    parts.push(`${si+1}. ${getCorrectLetter(optText)}`);
  });
  return parts.join('  ');
}


// ================= 获取听力 =================
async function fetchHearing() {
  const start = parseInt($val('hdStart'));
  const end = parseInt($val('hdEnd'));
  if (isNaN(start) || isNaN(end)) { toast('请输入有效的 day_id 范围'); return; }
  if (start > end) { toast('起始应小于等于结束'); return; }
  if (!S.phone || !S.session) { toast('请先登录'); return; }
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
async function fetchTodayDayIds() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }
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
// ================= 事件绑定与初始化 =================
function init() {
  // 登录切换
  document.querySelectorAll('#loginSeg .seg-item').forEach(el => {
    el.onclick = () => {
      document.querySelectorAll('#loginSeg .seg-item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      const mode = el.dataset.mode;
      $('passwordLogin').classList.toggle('hidden', mode !== 'password');
      $('smsLogin').classList.toggle('hidden', mode !== 'sms');
    };
  });

  $('tipPassword').onclick = () => { document.querySelector('#loginSeg .seg-item[data-mode="sms"]').click(); };
  $('showPass').onchange = function () { $('password').type = this.checked ? 'text' : 'password'; };
  ['phone', 'phoneSms'].forEach(id => {
    $(id).addEventListener('input', function () { const other = id === 'phone' ? 'phoneSms' : 'phone'; $(other).value = this.value; });
  });

  // 密码登录
  $('passwordLoginBtn').onclick = async function () {
    const phone = $val('phone'), password = $val('password');
    if (!phone || !password) { toast('请输入手机号和密码'); return; }
    this.disabled = true;
    try {
      showLoading();
      const session = await loginWithPassword(phone, password);
      if (password) localStorage.setItem('wz_password', password);
      S.phone = phone; S.session = session;
      localStorage.setItem('wz_phone', phone); localStorage.setItem('wz_session', session);
      enterApp(); toast('登录成功');
    } catch (e) { toast('登录失败: ' + e.message); }
    finally { this.disabled = false; hideLoading(); }
  };

  // 短信登录
  let smsCountdown = null;
  $('getCaptchaBtn').onclick = async function () {
    const phone = $val('phoneSms') || $val('phone');
    if (!phone) { toast('请先输入手机号'); return; }
    this.disabled = true; this.textContent = '获取中...';
    try {
      showLoading();
      S.loginKey = await getLoginKey(phone);
      $('captchaImg').src = buildCaptchaUrl(S.loginKey, phone) + '&t=' + Date.now();
      $('captchaHint').textContent = '请在下方输入图中验证码';
      toast('图形验证码已更新');
    } catch (e) { toast('获取失败: ' + e.message); }
    finally { this.disabled = false; this.textContent = '获取图片'; hideLoading(); }
  };
  $('getSmsBtn').onclick = async function () {
    const phone = $val('phoneSms') || $val('phone');
    const code = $val('imgCaptcha');
    if (!phone) { toast('请先输入手机号'); return; }
    if (!code) { toast('请输入图形验证码'); return; }
    if (!S.loginKey) { toast('请先获取图形验证码图片'); return; }
    this.disabled = true;
    try {
      showLoading();
      await sendSmsCode(phone, S.loginKey, code);
      toast('短信验证码已发送');
      let n = 60; this.textContent = n + 's';
      clearInterval(smsCountdown);
      smsCountdown = setInterval(() => {
        n--;
        if (n <= 0) { clearInterval(smsCountdown); this.disabled = false; this.textContent = '获取验证码'; }
        else this.textContent = n + 's';
      }, 1000);
    } catch (e) { toast('发送失败: ' + e.message); this.disabled = false; this.textContent = '获取验证码'; }
    finally { hideLoading(); }
  };
  $('smsLoginBtn').onclick = async function () {
    const phone = $val('phoneSms') || $val('phone');
    const code = $val('smsCode');
    if (!phone || !code) { toast('请输入手机号和短信验证码'); return; }
    this.disabled = true;
    try {
      showLoading();
      const session = await loginWithSms(phone, code);
      S.phone = phone; S.session = session;
      localStorage.setItem('wz_phone', phone); localStorage.setItem('wz_session', session);
      enterApp(); toast('登录成功');
    } catch (e) { toast('登录失败: ' + e.message); }
    finally { this.disabled = false; hideLoading(); }
  };

  // 登出
  $('logoutBtn').onclick = () => { if (confirm('确定退出登录？')) logout(); };

  // 底部导航
  document.querySelectorAll('.nav-item').forEach(el => el.onclick = () => goTab(el.dataset.tab));

  // 自动答题
  $('autoStartBtn').onclick = function () {
    ['autoDuration', 'autoWrongCount', 'autoWrongIds', 'autoTaskId', 'autoClassId'].forEach(id => {
      localStorage.setItem(id, $val(id));
    });
    localStorage.setItem('autoSelfSelect', $('autoSelfSelect').checked ? '1' : '');
    localStorage.setItem('autoOutputLog', $('autoOutputLog').checked ? '1' : '');
    runAutoTask();
  };
  $('autoLoadTasksBtn').onclick = loadAutoTasks;
  $('autoRankBtn').onclick = function () {
    const taskId = $val('autoTaskId'), classId = $val('autoClassId') || S.classId;
    if (!taskId || !classId) { toast('请先填写任务ID和班课ID'); return; }
    window.open(RANK_BASE + '&tid=' + encodeURIComponent(taskId) + '&cid=' + encodeURIComponent(classId), '_blank');
  };
  $('autoCopyLogBtn').onclick = () => copyText($('autoLog').textContent, '日志已复制');
  $('autoClearLogBtn').onclick = () => { autoLogBuf = []; $('autoLog').textContent = '日志已清空'; };

  // 手动答题
  $('manualLoadBtn').onclick = function () {
    const val = $('manualTaskSel').value;
    if (!val) { toast('请先选择任务'); return; }
    const opt = $('manualTaskSel').selectedOptions[0];
    loadManualTask(val, opt ? opt.textContent.split(' (')[0] : '');
  };
  $('manualLoadByIdBtn').onclick = function () {
    const id = $val('manualTaskInput');
    if (!id || isNaN(parseInt(id))) { toast('请输入有效的任务ID'); return; }
    loadManualTask(id, '任务 ' + id);
  };
  $('manualPrev').onclick = () => { S.manual.page--; renderManual(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('manualNext').onclick = () => { S.manual.page++; renderManual(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('manualShowAnswer').onclick = function () {
    S.manual.showAnswer = !S.manual.showAnswer;
    this.textContent = S.manual.showAnswer ? '🙈 隐藏答案' : '🔎 显示答案';
    renderManual();
  };
  $('manualCopyCorrectAll').onclick = function () {
    const m = S.manual;
    const start = m.page * PAGE_SIZE;
    const items = m.test.slice(start, start + PAGE_SIZE);
    let g = 0;
    for (let i = 0; i < start && i < m.test.length; i++) { g += parseSubs(m.test[i]).length; }
    const letters = [];
    items.forEach(mainQ => {
      parseSubs(mainQ).forEach(function (sub) { g++; letters.push(getCorrectLetter(sub.answer)); });
    });
    const first = g - letters.length + 1;
    const lines = [];
    for (let s = 0; s < letters.length; s += 5) {
      const e = Math.min(s + 5, letters.length);
      lines.push((first + s) + '-' + (first + e - 1) + ' ' + letters.slice(s, e).join(''));
    }
    copyText(lines.join('\n'), '本页正确答案已复制');
  };
  $('manualSubmitBtn').onclick = openSubmitDialog;

  // 弹窗
  $('detailClose').onclick = closeDetail;
  $('rankClose').onclick = closeKingRank;
  $('rankOverlay').addEventListener('click', function (e) { if (e.target.id === 'rankOverlay') closeKingRank(); });
  $('detailOverlay').addEventListener('click', e => { if (e.target.id === 'detailOverlay') closeDetail(); });
  $('detailCopyAll').onclick = () => { if (detailMainQ) copyText(buildDetailAllText(detailMainQ), '已复制全部内容'); };
  $('detailCopyCorrect').onclick = () => { if (detailMainQ) copyText(buildDetailCorrectText(detailMainQ), '已复制正确答案'); };

  // 提交弹窗
  $('submitClose').onclick = closeSubmitDialog;
  $('submitCancel').onclick = closeSubmitDialog;
  $('submitOverlay').addEventListener('click', function (e) { if (e.target.id === 'submitOverlay') closeSubmitDialog(); });
  $('submitOk').onclick = doSubmitManual;

  // 历史
  $('historyRefreshBtn').onclick = loadHistory;

  // 万词王
  $('kingUploadBtn').onclick = runKingUpload;
  $('kingRankBtn').onclick = showKingRank;
  $('accInfoBtn').onclick = loadAccountInfo;
  $('nkSaveBtn').onclick = runSaveNumber;
  // 计时器控制
  $('topTimer').onclick = openTimerEdit;
  $('timerPauseBtn').onclick = function () {
    if (S.timer.running) { pauseTimer(); this.textContent = '▶'; }
    else { startTimer(); this.textContent = '⏸'; }
  };
  $('timerResetBtn').onclick = function () { resetTimer(); $('timerPauseBtn').textContent = '⏸'; };
  $('timerEditClose').onclick = closeTimerEdit;
  $('timerEditCancel').onclick = closeTimerEdit;
  $('timerEditOverlay').addEventListener('click', function (e) { if (e.target.id === 'timerEditOverlay') closeTimerEdit(); });
  $('timerEditOk').onclick = applyTimerEdit;
  // 获取听力
  $('hdFetchBtn').onclick = fetchHearing;
  $('hdTodayBtn').onclick = fetchTodayDayIds;

  // 初始化状态
  bindFieldLabels();
  ['autoDuration', 'autoWrongCount', 'autoWrongIds', 'autoTaskId', 'autoClassId'].forEach(function (id) {
    const v = localStorage.getItem(id);
    if (v !== null && $(id)) $(id).value = v;
  });
  if (localStorage.getItem('autoSelfSelect') === '1') $('autoSelfSelect').checked = true;
  if (localStorage.getItem('autoOutputLog') === '1') $('autoOutputLog').checked = true;

  ['nkKnowWell', 'nkLearn', 'nkUseDay'].forEach(id => {
    const v = localStorage.getItem(id);
    if (v !== null && $(id)) $(id).value = v;
  });

  if (S.session && S.phone) {
    verifySession().then(ok => {
      if (ok) enterApp();
      else { logout(); toast('会话已过期，请重新登录'); }
    });
  } else {
    const savedPhone = localStorage.getItem('wz_phone') || '';
    if (savedPhone) { $('phone').value = savedPhone; $('phoneSms').value = savedPhone; }
    const savedPass = localStorage.getItem('wz_password') || '';
    if (savedPass) $('password').value = savedPass;
  }
  syncFieldLabels();
}

// 导出供 ui.js 或其他模块使用（如果需要）
export { goTab, loadManualTask, renderManual, renderAutoTasks };

// 启动
document.addEventListener('DOMContentLoaded', init);