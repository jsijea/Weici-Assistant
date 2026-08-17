// common.js
// 公共常量、DOM 快捷函数、日志函数、题目辅助函数

import { S } from './state.js';
import { esc, parseSubs } from './utils.js';

// ================= 常量 =================
export const PAGE_SIZE = 10;
export const AUTO_COLORS = ['#e53935', '#1e88e5', '#8e24aa', '#ec407a'];
export const KING_RANGES = [['0', '全国'], ['1', '省'], ['2', '市'], ['3', '学校'], ['4', '班级']];
export const LEVELS = [
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
export const $ = id => document.getElementById(id);
export const $val = id => { const e = $(id); return e ? e.value.trim() : ''; };

// ================= 日志缓冲区 =================
let autoLogBuf = [];

export function alog(msg, cls, rawHtml = false) {
  const content = rawHtml ? msg : esc(msg);
  autoLogBuf.push(cls ? `<span class="${cls}">${content}</span>` : content);
  if (autoLogBuf.length >= 20) flushLog();
}

export function flushLog() {
  const el = $('autoLog');
  if (!el) return;
  el.innerHTML = autoLogBuf.join('<br/>');
  el.scrollTop = el.scrollHeight;
}

export function resetAutoLog() {
  autoLogBuf = [];
  const el = $('autoLog');
  if (el) el.innerHTML = '';
}

export function klog(msg, cls, rawHtml = false) {
  const el = $('kingLog');
  if (!el) return;
  const content = rawHtml ? msg : esc(msg);
  el.innerHTML += (cls ? `<span class="${cls}">${content}</span>` : content) + '<br/>';
  el.scrollTop = el.scrollHeight;
}

// ================= 题目辅助函数 =================
export function mainSoundPath(mainQ) {
  const si = mainQ.sound_info;
  if (si && si.length && si[0].sound) return si[0].sound;
  return mainQ.subject || '';
}

export function mainSoundName(mainQ) {
  const si = mainQ.sound_info;
  if (si && si.length && si[0].sound_name) return si[0].sound_name;
  return '';
}

export function globalQuestionIndex(mainQ) {
  const m = S.manual.test.indexOf(mainQ);
  let idx = 0;
  for (let i = 0; i < m && i < S.manual.test.length; i++) {
    idx += Math.max(1, parseSubs(S.manual.test[i]).length);
  }
  return idx + 1;
}