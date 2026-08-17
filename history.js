// history.js
// 历史记录模块

import { S } from './state.js';
import {
  esc, formatTime
} from './utils.js';
import {
  getTaskHistory, ensureSessionValid
} from './api.js';
import {
  toast, showLoading, hideLoading
} from './ui.js';
import {
  $, $val
} from './common.js';

// ================= 历史 =================
export async function loadHistory() {
  const box = $('historyList');
  if (!box) return;
  if (!S.phone || !S.session) { toast('请先登录'); return; }

  box.innerHTML = '<div class="empty">加载中...</div>';
  try {
    showLoading();

    // 校验 session 有效性
    const isValid = await ensureSessionValid(S.phone, S.session);
    if (!isValid) {
      box.innerHTML = '<div class="empty">Session 已失效，请重新登录</div>';
      toast('Session 已失效，请重新登录');
      return;
    }

    S.history = await getTaskHistory(S.phone, S.session);
    renderHistory();
  } catch (e) {
    box.innerHTML = `<div class="empty">加载历史失败：${esc(e.message)}</div>`;
  } finally {
    hideLoading();
  }
}

export function renderHistory() {
  const box = $('historyList');
  if (!box) return;
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
    b.onclick = () => {
      // 导航到手动答题 tab 并加载该任务
      if (typeof window.goTab === 'function') window.goTab('manual');
      // 加载任务
      import('./manual.js').then(({ loadManualTask }) => {
        loadManualTask(b.dataset.hredo, '');
        toast('已进入重做流程');
      });
    };
  });
}