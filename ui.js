// ui.js
import { S } from './state.js';
import {
  esc, htmlToPlain, audioUrl, getCorrectLetter,
  parseSubs, collectOptions, extractQuestionNumber
} from './utils.js';

// ================= Toast =================
let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
// 挂载到 window，供 utils.copyText 使用
window.toast = toast;

// ================= Loading =================
let loadingCount = 0;
export function showLoading() { loadingCount++; document.getElementById('loadingBar').classList.remove('hidden'); }
export function hideLoading() { loadingCount = Math.max(0, loadingCount - 1); if (loadingCount === 0) document.getElementById('loadingBar').classList.add('hidden'); }

// ================= 表单标签同步 =================
export function syncFieldLabels() {
  document.querySelectorAll('.field input, .field select').forEach(el => {
    el.parentElement.classList.toggle('filled', !!el.value);
  });
}

export function bindFieldLabels() {
  document.querySelectorAll('.field input, .field select').forEach(el => {
    el.addEventListener('input', syncFieldLabels);
    el.addEventListener('change', syncFieldLabels);
  });
  syncFieldLabels();
}

// ================= 计时器 =================
export function updateTimer() {
  const el = document.getElementById('topTimer');
  if (el) el.textContent = fmtClock(elapsedSec());
}
function elapsedSec() {
  return S.timer.acc + (S.timer.running && S.timer.start ? Math.floor((Date.now() - S.timer.start) / 1000) : 0);
}
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => (n < 10 ? '0' : '') + n;
  return (h > 0 ? h + ':' : '') + p(m) + ':' + p(s);
}
export function startTimer() {
  if (S.timer.running) return;
  S.timer.running = true;
  S.timer.start = Date.now();
  S.timer.id = setInterval(updateTimer, 1000);
  updateTimer();
}
export function stopTimer() {
  if (S.timer.id) { clearInterval(S.timer.id); S.timer.id = null; }
  if (S.timer.running && S.timer.start) S.timer.acc += Math.floor((Date.now() - S.timer.start) / 1000);
  S.timer.running = false;
  updateTimer();
}
export function resetTimer() {
  stopTimer();
  S.timer.acc = 0;
  S.timer.start = null;
  updateTimer();
}
export function pauseTimer() { stopTimer(); }
export function resumeTimer() { startTimer(); }
export function setTimerSeconds(sec) {
  S.timer.acc = Math.max(0, Math.floor(sec));
  S.timer.start = S.timer.running ? Date.now() : null;
  updateTimer();
}
function parseTimerInput(str) {
  str = String(str || '').trim().replace(/：/g, ':');
  if (str === '') return null;
  let parts;
  if (str.indexOf(',') >= 0) parts = str.split(',').map(x => parseInt(x.trim()));
  else if (str.indexOf(':') >= 0) parts = str.split(':').map(x => parseInt(x.trim()));
  else { const n = parseInt(str); if (isNaN(n)) return null; return Math.max(0, n); }
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}
export function openTimerEdit() {
  const input = document.getElementById('timerEditInput');
  const sec = elapsedSec();
  input.value = (sec >= 60) ? (Math.floor(sec / 60) + ',' + (sec % 60)) : String(sec);
  document.getElementById('timerEditOverlay').classList.remove('hidden');
}
export function closeTimerEdit() {
  document.getElementById('timerEditOverlay').classList.add('hidden');
}
export function applyTimerEdit() {
  const sec = parseTimerInput(document.getElementById('timerEditInput').value);
  if (sec !== null && sec >= 0) setTimerSeconds(sec);
  closeTimerEdit();
}

// ================= 详情弹窗 =================
export let detailMainQ = null;

function mainSoundPath(mainQ) {
  const si = mainQ.sound_info;
  if (si && si.length && si[0].sound) return si[0].sound;
  return mainQ.subject || '';
}

export function openDetail(mainQ) {
  detailMainQ = mainQ;
  const subs = parseSubs(mainQ);
  const soundPath = mainSoundPath(mainQ);
  const audio = audioUrl(soundPath);
  const letters = ['A', 'B', 'C', 'D'];

  let html = '';
  html += `<div class="detail-section"><h4>听力音频</h4>`;
  if (audio) html += `<audio controls preload="none" src="${esc(audio)}" style="width:100%;height:40px"></audio>`;
  else html += `<div class="detail-text muted">（无音频）</div>`;
  html += `</div>`;

  subs.forEach((sub, si) => {
    const no = extractQuestionNumber(sub.subject);
    const opts = collectOptions(sub);
    html += `<div class="detail-section"><h4>第 ${si+1} 题${no>0?' · 题号 '+no:''}</h4>
      <div class="detail-text" style="font-weight:600;margin-bottom:6px">${esc(sub.subject)}</div>`;
    opts.forEach((o, i) => {
      const isC = o === sub.answer;
      html += `<div class="opt ${isC?'correct':''}" style="cursor:default">
        <span class="letter">${letters[i]||'?'}</span><span>${esc(o)}${isC?' · 正确答案':''}</span>
      </div>`;
    });
    html += `</div>`;
  });

  if (mainQ.original_text) {
    html += `<div class="detail-section"><h4>听力原文</h4><div class="detail-text">${mainQ.original_text}</div></div>`;
  }
  const analysis = mainQ.analysis_html || mainQ.analysis || '';
  if (analysis) {
    html += `<div class="detail-section"><h4>解析</h4><div class="detail-text">${analysis}</div></div>`;
  }
  if (mainQ.image_url) {
    html += `<div class="detail-section"><h4>参考文件</h4><div class="detail-text muted">${esc(mainQ.image_url)}</div></div>`;
  }

  document.getElementById('detailBody').innerHTML = html;
  document.getElementById('detailOverlay').classList.remove('hidden');
  document.getElementById('detailOverlay').querySelector('.sheet-body').scrollTop = 0;
}

export function closeDetail() {
  document.getElementById('detailOverlay').classList.add('hidden');
  detailMainQ = null;
}

// ================= 提交弹窗 =================
export function openSubmitDialog() {
  const m = S.manual;
  if (!m.taskId || !m.test.length) { toast('请先加载任务'); return; }
  let total = 0, answered = 0;
  m.test.forEach(mainQ => { parseSubs(mainQ).forEach(sub => { total++; if (S.manual.selections[sub.id]) answered++; }); });
  const sec = elapsedSec();
  const pre = (sec >= 60) ? (Math.floor(sec / 60) + ',' + (sec % 60)) : String(sec);
  let info = '任务ID ' + m.taskId + ' · ' + (m.dayName || '');
  info += '<br/>已作答 <b>' + answered + '</b> / ' + total + ' 题';
  if (answered < total) info += '<br/><span style="color:var(--error)">有未作答题目，将只提交已作答部分</span>';
  document.getElementById('submitInfo').innerHTML = info;
  document.getElementById('submitTime').value = pre;
  document.getElementById('submitOverlay').classList.remove('hidden');
}

export function closeSubmitDialog() {
  document.getElementById('submitOverlay').classList.add('hidden');
}

// ================= 万词王排名弹窗 =================
export function closeKingRank() {
  document.getElementById('rankOverlay').classList.add('hidden');
}