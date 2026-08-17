// app.js
// 入口模块：初始化、事件绑定、导航控制

import { S, RANK_BASE, initState } from './state.js';
import {
  esc, maskPhone, parseDuration, parseSubs, getCorrectLetter, copyText
} from './utils.js';
import {
  $, $val, alog, klog, resetAutoLog
} from './common.js';
import {
  toast, showLoading, hideLoading, syncFieldLabels, bindFieldLabels,
  openTimerEdit, closeTimerEdit, applyTimerEdit,
  openDetail, closeDetail, openSubmitDialog, closeSubmitDialog, closeKingRank,
  detailMainQ, startTimer, pauseTimer, resetTimer
} from './ui.js';
import {
  loginWithPassword, getLoginKey, buildCaptchaUrl, sendSmsCode, loginWithSms,
  getClassInfo, getTaskList
} from './api.js';
import {
  runAutoTask, loadAutoTasks, renderAutoTasks
} from './auto.js';
import {
  loadManualTask, renderManual, buildDetailAllText, buildDetailCorrectText, doSubmitManual
} from './manual.js';
import {
  loadHistory
} from './history.js';
import {
  runKingUpload, showKingRank, runSaveNumber, loadAccountInfo, fetchHearing, fetchTodayDayIds
} from './king.js';

// ================= 全局函数挂载（供其他模块回调） =================
function fillTaskSelect() {
  const sel = $('manualTaskSel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— 从任务列表选择 —</option>';
  for (const t of (S.tasks || [])) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.task_name || '未命名'} (#${t.id})`;
    sel.appendChild(opt);
  }
}
window.fillTaskSelect = fillTaskSelect;

function goTab(tab) {
  document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  const pageId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1);
  document.querySelectorAll('.tab-page').forEach(x => x.classList.toggle('active', x.id === pageId));
  if (tab === 'history' && !S.history.length) loadHistory();
  if (tab === 'manual' && !S.timer.running) startTimer();
  const timerBtn = $('timerPauseBtn');
  if (timerBtn) timerBtn.textContent = S.timer.running ? '⏸' : '▶';
}
window.goTab = goTab;

// ================= Session 有效性校验 =================
/**
 * 校验当前 session 是否有效（供所有业务模块调用）
 * @param {string} phone 
 * @param {string} session 
 * @returns {Promise<boolean>}
 */
async function checkSessionValid(phone, session) {
  if (!phone || !session) return false;
  try {
    // 使用 getClassInfo 作为轻量校验接口，失败即认为 session 无效
    await getClassInfo(phone, session);
    return true;
  } catch (e) {
    return false;
  }
}
// 挂载到 window，方便其他模块直接调用
window.checkSessionValid = checkSessionValid;

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
    await getTaskList(S.phone, S.session);
    return true;
  } catch (e) { }
  return false;
}

// ================= 初始化 =================
function init() {
  // 恢复状态
  initState();

  // ----- 动态添加 Session 登录入口 -----
  const loginSeg = document.getElementById('loginSeg');
  if (loginSeg && !document.querySelector('#loginSeg .seg-item[data-mode="session"]')) {
    const sessionSeg = document.createElement('div');
    sessionSeg.className = 'seg-item';
    sessionSeg.dataset.mode = 'session';
    sessionSeg.textContent = 'Session登录';
    loginSeg.appendChild(sessionSeg);
  }

  // 动态添加 session 登录表单区域
  if (!document.getElementById('sessionLogin')) {
    const sessionLoginDiv = document.createElement('div');
    sessionLoginDiv.id = 'sessionLogin';
    sessionLoginDiv.className = 'hidden';
    sessionLoginDiv.innerHTML = `
      <div class="field"><input type="tel" id="sessionPhone" inputmode="numeric" placeholder=" " autocomplete="tel"><label>手机号</label></div>
      <div class="field"><input type="text" id="sessionInput" placeholder=" " autocomplete="off"><label>Session 字符串</label></div>
      <button class="btn block" id="sessionLoginBtn">Session 登录</button>
    `;
    // 插入到短信登录区域之后
    const smsLogin = document.getElementById('smsLogin');
    if (smsLogin && smsLogin.parentNode) {
      smsLogin.parentNode.insertBefore(sessionLoginDiv, smsLogin.nextSibling);
    }
  }

  // ----- 顶部栏添加复制 Session 按钮 -----
  const userChip = document.getElementById('userChip');
  if (userChip && !document.getElementById('copySessionBtn')) {
    const copyBtn = document.createElement('button');
    copyBtn.id = 'copySessionBtn';
    copyBtn.className = 'timer-ctrl';
    copyBtn.style.width = 'auto';
    copyBtn.style.padding = '0 8px';
    copyBtn.style.borderRadius = '12px';
    copyBtn.style.background = 'var(--secondary-container)';
    copyBtn.style.color = 'var(--on-secondary-container)';
    copyBtn.style.fontSize = '12px';
    copyBtn.style.fontWeight = '600';
    copyBtn.style.cursor = 'pointer';
    copyBtn.title = '复制 Session';
    copyBtn.textContent = '复制Session';
    // 插入到 userChip 旁边
    userChip.parentNode.insertBefore(copyBtn, userChip.nextSibling);
  }

  // ----- 自动答题卡片上方添加 GitHub 信息 -----
  const tabAuto = document.getElementById('tabAuto');
  if (tabAuto && !document.getElementById('projectInfo')) {
    const infoDiv = document.createElement('div');
    infoDiv.id = 'projectInfo';
    infoDiv.style.cssText = 'text-align:center; margin-bottom:14px; font-size:13px; color:var(--on-surface-variant);';
    infoDiv.innerHTML = `
      <span>github: <a href="https://github.com/jsijea/Weici-Assistant" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none;">https://github.com/jsijea/Weici-Assistant</a></span><br>
      <span>问题反馈: <a href="mailto:jsijea@163.com" style="color:var(--primary); text-decoration:none;">jsijea@163.com</a></span>
    `;
    tabAuto.insertBefore(infoDiv, tabAuto.firstChild);
  }

  // 登录切换（支持三个模式）
  document.querySelectorAll('#loginSeg .seg-item').forEach(el => {
    el.onclick = () => {
      document.querySelectorAll('#loginSeg .seg-item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      const mode = el.dataset.mode;
      $('passwordLogin').classList.toggle('hidden', mode !== 'password');
      $('smsLogin').classList.toggle('hidden', mode !== 'sms');
      const sessionLogin = $('sessionLogin');
      if (sessionLogin) sessionLogin.classList.toggle('hidden', mode !== 'session');
    };
  });

  // Session 登录按钮事件
  $('sessionLoginBtn').onclick = async function () {
    const phone = $val('sessionPhone');
    const session = $val('sessionInput');
    if (!phone || !session) { toast('请输入手机号和 Session'); return; }
    this.disabled = true;
    try {
      showLoading();
      // 校验 session 有效性
      const valid = await checkSessionValid(phone, session);
      if (!valid) {
        toast('Session 无效或已过期，请重新获取');
        return;
      }
      S.phone = phone;
      S.session = session;
      localStorage.setItem('wz_phone', phone);
      localStorage.setItem('wz_session', session);
      enterApp();
      toast('登录成功');
    } catch (e) {
      toast('登录失败: ' + e.message);
    } finally {
      this.disabled = false;
      hideLoading();
    }
  };

  // 复制 Session 按钮事件
  $('copySessionBtn').onclick = function () {
    if (!S.session) { toast('未登录或 Session 为空'); return; }
    copyText(S.session, 'Session 已复制');
  };

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
    resetAutoLog();          // 清空日志
    runAutoTask();
  };
  $('autoLoadTasksBtn').onclick = loadAutoTasks;
  $('autoRankBtn').onclick = function () {
    const taskId = $val('autoTaskId'), classId = $val('autoClassId') || S.classId;
    if (!taskId || !classId) { toast('请先填写任务ID和班课ID'); return; }
    window.open(RANK_BASE + '&tid=' + encodeURIComponent(taskId) + '&cid=' + encodeURIComponent(classId), '_blank');
  };
  $('autoCopyLogBtn').onclick = () => copyText($('autoLog').textContent, '日志已复制');
  $('autoClearLogBtn').onclick = () => resetAutoLog();

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
    const start = m.page * 10; // PAGE_SIZE 固定为 10
    const items = m.test.slice(start, start + 10);
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

  // 万词王及其他功能
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
    if (savedPhone) { $('phone').value = savedPhone; $('phoneSms').value = savedPhone; const sessionPhone = $('sessionPhone'); if (sessionPhone) sessionPhone.value = savedPhone; }
    const savedPass = localStorage.getItem('wz_password') || '';
    if (savedPass) $('password').value = savedPass;
  }
  syncFieldLabels();
}

// 启动
document.addEventListener('DOMContentLoaded', init);