// state.js
// 全局状态与常量

export const SALT = "w*#%7@$&c";
export const AES_KEY = "ac14c13680bdf7a0";
export const BASE_PARAMS = { app_version: "457", bound_id: "795c275ac8704417a0bbca97c15bd67e1", app_id: "8", device: "0", platform: "1", is_wifi: "1" };
export const API_BASE = "https://api.weicistudy.com";
export const AUDIO_BASE = "https://bsource.weicistudy.com";
export const RANK_BASE = "https://ashare.weicistudy.com/group/task_rank.html?debug=0&app_id=7";
export const PAGE_SIZE = 10;

export const KING_RANGES = [['0','全国'],['1','省'],['2','市'],['3','学校'],['4','班级']];

export const LEVELS = [
  {lv:1, title:'白身', min:0, max:499},
  {lv:2, title:'童生', min:500, max:999},
  {lv:3, title:'秀才', min:1000, max:1999},
  {lv:4, title:'举人', min:2000, max:5999},
  {lv:5, title:'贡生', min:6000, max:17999},
  {lv:6, title:'进士', min:18000, max:53999},
  {lv:7, title:'探花', min:54000, max:107999},
  {lv:8, title:'榜眼', min:108000, max:215999},
  {lv:9, title:'状元', min:216000, max:Infinity}
];

// 初始状态不直接读取 localStorage，改为通过 initState 初始化
export const S = {
  session: '',
  phone: '',
  classId: '',
  tasks: [],
  loginKey: null,
  manual: { taskId: null, taskName: '', catalogs: [], dayId: null, dayName: '', test: [], page: 0, showAnswer: false, selections: {} },
  history: [],
  timer: { start: null, id: null, running: false, acc: 0 }
};

/**
 * 从 localStorage 恢复登录状态，应在应用启动时调用
 */
export function initState() {
  S.session = localStorage.getItem('wz_session') || '';
  S.phone = localStorage.getItem('wz_phone') || '';
  S.classId = localStorage.getItem('wz_classId') || '';
}