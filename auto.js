// auto.js
// 自动答题模块

import { S } from './state.js';
import {
  esc, htmlToPlain, getCorrectLetter,
  parseDuration, parseSubs, collectOptions, extractQuestionNumber,
  sleep
} from './utils.js';
import {
  getClassInfo, getTaskList, getTaskCatalog, getTaskTest,
  submitError, submitSync, ensureSessionValid
} from './api.js';
import {
  toast, showLoading, hideLoading
} from './ui.js';
import {
  $, $val, alog, flushLog, resetAutoLog, AUTO_COLORS
} from './common.js';

// ================= 自动答题 =================
export async function runAutoTask() {
  const phone = S.phone, session = S.session;
  const taskIdStr = $val('autoTaskId');
  const classIdStr = $val('autoClassId');
  const duration = parseDuration($val('autoDuration'));
  const selfSelect = $('autoSelfSelect').checked;
  const outputLog = $('autoOutputLog').checked;
  const btn = $('autoStartBtn');

  if (!phone || !session) {
    toast('请先登录');
    alog('❌ 请先登录', 'red');
    return;
  }

  // 校验 session 有效性
  const isValid = await ensureSessionValid(phone, session);
  if (!isValid) {
    toast('Session 已失效，请重新登录');
    alog('❌ Session 已失效，请重新登录', 'red');
    return;
  }

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
  resetAutoLog(); // 清空日志
  try {
    let classId = customClassId;
    if (classId < 0) {
      if (S.classId) classId = S.classId;
      else { classId = await getClassInfo(phone, session); S.classId = classId; localStorage.setItem('wz_classId', classId); }
    }
    alog('📋 班课ID: ' + classId, 'blue');

    let tasks = S.tasks && S.tasks.length ? S.tasks : await getTaskList(phone, session);
    if (!tasks || !tasks.length) { alog('⚠️ 没有任务', 'orange'); return; }
    S.tasks = tasks;
    if (typeof window.fillTaskSelect === 'function') window.fillTaskSelect(); // 刷新手动任务下拉

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

        // 解析题目
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
            alog('【听力原文】<br/>' + annotated + '<br/>', undefined, true);
            for (const sid of wrongInMain) {
              const idx = subIndexMap[sid];
              let d = `📝 第 ${idx} 题 (ID: ${sid})<br/>题干: ${esc(subjectMap[sid])}<br/>`;
              const opts = optionsMap[sid];
              const letters = ['A', 'B', 'C', 'D'];
              opts.forEach((o, i) => { d += `   ${letters[i]||'?'}. ${esc(o)}<br/>`; });
              d += `正确答案: ${esc(correctMap[sid])}<br/>用户选择: ${esc(userAnswers[sid])}${userAnswers[sid]===correctMap[sid]?'（正确）':'（错误）'}`;
              alog(d, undefined, true);
            }
          }
        }

        // 答案汇总
        const correctLetters = allIds.map(cid => getCorrectLetter(correctMap[cid]));
        let csb = '✅ 正确答案汇总:<br/>';
        for (let s = 0; s < correctLetters.length; s += 5) { csb += `${s+1}-${Math.min(s+5,correctLetters.length)} <span class="green">${correctLetters.slice(s,s+5).join('')}</span><br/>`; }
        alog(csb, undefined, true);
        const submitLetters = allIds.map(cid => wrongIds.has(cid) ? getCorrectLetter(userAnswers[cid]) : getCorrectLetter(correctMap[cid]));
        let ssb = '📤 提交答案汇总:<br/>';
        for (let s = 0; s < submitLetters.length; s += 5) { ssb += `${s+1}-${Math.min(s+5,submitLetters.length)} <span class="blue">${submitLetters.slice(s,s+5).join('')}</span><br/>`; }
        alog(ssb, undefined, true);

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
  const regex = /<(strong|span)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
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

export async function loadAutoTasks() {
  if (!S.phone || !S.session) { toast('请先登录'); return; }

  // 校验 session 有效性
  const isValid = await ensureSessionValid(S.phone, S.session);
  if (!isValid) {
    toast('Session 已失效，请重新登录');
    return;
  }

  const btn = $('autoLoadTasksBtn');
  btn.disabled = true;
  try {
    showLoading();
    S.tasks = await getTaskList(S.phone, S.session);
    if (typeof window.fillTaskSelect === 'function') window.fillTaskSelect();
    renderAutoTasks();
    toast('已加载 ' + S.tasks.length + ' 个任务');
  } catch (e) {
    toast('加载失败: ' + e.message);
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

export function renderAutoTasks() {
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