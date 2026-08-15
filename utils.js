// utils.js
import { SALT, AES_KEY, AUDIO_BASE } from './state.js';

export function md5(s) {
  return CryptoJS.MD5(s).toString();
}

export function aesEncrypt(pt) {
  const key = CryptoJS.enc.Utf8.parse(AES_KEY);
  const e = CryptoJS.AES.encrypt(pt, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
  return e.ciphertext.toString(CryptoJS.enc.Hex);
}

export function urlEncode(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) p.append(k, String(v));
  }
  return p.toString();
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function htmlToPlain(html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim().replace(/\s+/g, ' ');
}

export function audioUrl(sound) {
  if (!sound) return '';
  if (/^https?:\/\//i.test(sound)) return sound;
  return AUDIO_BASE + (sound.charAt(0) === '/' ? '' : '/') + sound;
}

export function getOptionLetter(optText) {
  const t = String(optText || '').trim();
  return t.charAt(0);
}

export function getCorrectLetter(ans) { return getOptionLetter(ans); }

export function extractQuestionNumber(subject) {
  const m = String(subject || '').match(/^(\d+)\s*\./);
  return m ? parseInt(m[1]) : -1;
}

export function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  const p = n => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function maskPhone(p) {
  if (!p) return '';
  if (p.length < 7) return p;
  return p.slice(0, 3) + '****' + p.slice(-4);
}

export function parseDuration(input) {
  if (!input || input.trim() === '') return 1;
  let c = input.trim().replace(/，/g, ',').split(/[\s,]+/).filter(s => s !== '').join(',');
  if (!c) return 1;
  if (!c.includes(',')) {
    const s = parseInt(c); return isNaN(s) ? 1 : Math.max(s, 1);
  }
  const parts = c.split(',').map(x => parseInt(x.trim()));
  if (parts.length === 2) { if (isNaN(parts[0]) || isNaN(parts[1])) return 1; return Math.max(parts[0] * 60 + parts[1], 1); }
  if (parts.length === 3) { if (parts.some(isNaN)) return 1; return Math.max(parts[0] * 3600 + parts[1] * 60 + parts[2], 1); }
  return 1;
}

export function parseSubs(mainQ) {
  try { const a = JSON.parse(mainQ.sub || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

export function collectOptions(sub) {
  const opts = [];
  for (const k of ['answer_a', 'answer_b', 'answer_c', 'answer_d']) {
    const v = sub[k];
    if (v && !opts.includes(v)) opts.push(v);
  }
  const c = sub.answer;
  if (c && !opts.includes(c)) opts.push(c);
  return opts;
}

export function copyText(text, tip) {
  // 使用 window.toast 避免循环依赖
  const done = (ok) => {
    if (window.toast) window.toast(ok ? (tip || '已复制到剪贴板') : '复制失败，请手动复制');
    else alert(ok ? '已复制' : '复制失败');
  };
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ok) { done(true); return; }
  } catch (e) {}
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      let settled = false;
      const finish = (ok) => { if (!settled) { settled = true; done(ok); } };
      const p = navigator.clipboard.writeText(text);
      if (p && p.then) { p.then(() => finish(true)).catch(() => finish(false)); } else { done(false); return; }
      setTimeout(() => finish(false), 400);
      return;
    }
  } catch (e) {}
  done(false);
}