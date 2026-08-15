// api.js
import { urlEncode, aesEncrypt, md5 } from './utils.js';
import { BASE_PARAMS, API_BASE, SALT } from './state.js';

export async function apiGet(path, params) {
  const url = API_BASE + path + '?' + urlEncode(params);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.json();
}

export async function apiPostForm(path, data) {
  const resp = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: urlEncode(data)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.json();
}

export async function loginWithPassword(phone, password) {
  const data = await apiGet('/account/login', {
    access_token: '', password: md5(SALT + password + SALT), user_code: phone, login_type: '1', auth_code: '', session: '', ...BASE_PARAMS
  });
  if (data.result_code === 200 && data.session) return data.session;
  throw new Error(data.description || '密码登录失败');
}

export async function getLoginKey(phone) {
  const data = await apiGet('/account/login/key', { ...BASE_PARAMS, user_code: phone, session: '' });
  if (data.result_code === 200 && data.login_key) return data.login_key;
  throw new Error(data.description || '获取 login_key 失败');
}

export function buildCaptchaUrl(loginKey, phone) {
  return API_BASE + '/account/verifycode?' + urlEncode({ login_key: loginKey, ...BASE_PARAMS, user_code: phone, session: '' });
}

export async function sendSmsCode(phone, loginKey, validateCode) {
  const data = await apiGet('/account/v2/authcode', { login_key: loginKey, validate_code: validateCode, phone: phone, ...BASE_PARAMS, user_code: '', session: '' });
  if (data.result_code === 200) return true;
  throw new Error(data.description || '发送短信验证码失败');
}

export async function loginWithSms(phone, code) {
  const data = await apiGet('/account/login', { access_token: '', password: '', user_code: phone, login_type: '0', auth_code: code, ...BASE_PARAMS, session: '' });
  if (data.result_code === 200 && data.session) return data.session;
  throw new Error(data.description || '短信验证码登录失败');
}

export async function getClassInfo(phone, session) {
  const data = await apiGet('/gaozhong/weici/group/student/has/class', { ...BASE_PARAMS, user_code: phone, session });
  if (data.result_code === 200) return data.class_id;
  throw new Error(data.description || '获取班课失败');
}

export async function getTaskList(phone, session) {
  const data = await apiGet('/gaozhong/weici/group/student/v31/tasklist', { ...BASE_PARAMS, user_code: phone, session, task_ids: '' });
  if (data.result_code === 200) return data.tasks || [];
  throw new Error(data.description || '获取任务列表失败');
}

export async function getTaskCatalog(taskId, phone, session, taskType = 8) {
  const data = await apiGet('/gaozhong/weici/group/task/hearing/catalog', { ...BASE_PARAMS, user_code: phone, session, task_id: taskId, task_type: taskType });
  if (data.result_code === 200) return data.task_catalog || [];
  throw new Error(data.description || '获取目录失败');
}

export async function getTaskTest(dayId, phone, session, source = 0, taskType = 8) {
  const data = await apiGet('/gaozhong/weici/group/task/hearing/test', { ...BASE_PARAMS, user_code: phone, session, day_id: dayId, task_type: taskType, source });
  if (data.result_code === 200) return data.task_test || [];
  throw new Error(data.description || '获取题目失败');
}

export async function getTaskHistory(phone, session) {
  const data = await apiGet('/gaozhong/weici/group/student/task/history', { ...BASE_PARAMS, user_code: phone, session, page_index: 0, page_size: 100000 });
  if (data.result_code === 200) return (data.data && data.data.data) || [];
  throw new Error(data.description || '获取历史失败');
}

export async function submitError(mainId, answerArray, phone, session) {
  const item = { test_id: mainId, word_id: 0, answer: JSON.stringify(answerArray), flag: 1, time: Math.floor(Date.now() / 1000), extra: '', from: 12, json: '', type: 2 };
  const data = await apiPostForm('/gaozhong/weici/sync/v2/word/error', { error: JSON.stringify([item]), user_code: phone, session, ...BASE_PARAMS });
  return data.result_code === 200;
}

export async function submitSync(taskId, dayId, userAnswers, correctMap, phone, session, duration) {
  const dataList = [];
  for (const [cid, chosen] of Object.entries(userAnswers)) {
    const correct = correctMap[cid];
    dataList.push({ test_id: parseInt(cid), answer: chosen, duration: 0, result: (chosen === correct ? 0 : 1), repeat_points: 0, revise_num: 0, sound_type: 3 });
  }
  const syncRecord = { user_code: phone, task_id: taskId, push_id: 0, day: dayId, finish_word: 1, finish_time: Math.floor(Date.now() / 1000), duration: duration, data: JSON.stringify(dataList) };
  const jsonData = JSON.stringify([syncRecord]);
  const formItems = [['json_data', jsonData], ['is_wifi', BASE_PARAMS.is_wifi], ['app_version', BASE_PARAMS.app_version], ['user_code', phone], ['bound_id', BASE_PARAMS.bound_id], ['session', session], ['app_id', BASE_PARAMS.app_id], ['device', BASE_PARAMS.device], ['platform', BASE_PARAMS.platform]];
  const bodyToEncrypt = formItems.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const param = aesEncrypt(bodyToEncrypt);
  const finalData = { param, json_data: jsonData, is_wifi: BASE_PARAMS.is_wifi, app_version: BASE_PARAMS.app_version, user_code: phone, bound_id: BASE_PARAMS.bound_id, session, app_id: BASE_PARAMS.app_id, device: BASE_PARAMS.device, platform: BASE_PARAMS.platform };
  const data = await apiPostForm('/gaozhong/weici/group/v30/student/task/sync', finalData);
  return data.result_code === 200;
}

export async function kingUpload(phone, session, classId, count) {
  const jsonData = JSON.stringify([{ user_code: phone, class_id: parseInt(classId), app_id: 8, count: parseInt(count), finish_time: Math.floor(Date.now() / 1000) }]);
  const formItems = [['json_data', jsonData], ['is_wifi', BASE_PARAMS.is_wifi], ['app_version', BASE_PARAMS.app_version], ['user_code', phone], ['bound_id', BASE_PARAMS.bound_id], ['session', session], ['app_id', BASE_PARAMS.app_id], ['device', BASE_PARAMS.device], ['platform', BASE_PARAMS.platform]];
  const bodyToEncrypt = formItems.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const param = aesEncrypt(bodyToEncrypt);
  const finalData = { param, json_data: jsonData, is_wifi: BASE_PARAMS.is_wifi, app_version: BASE_PARAMS.app_version, user_code: phone, bound_id: BASE_PARAMS.bound_id, session, app_id: BASE_PARAMS.app_id, device: BASE_PARAMS.device, platform: BASE_PARAMS.platform };
  return await apiPostForm('/gaozhong/weici/group/v30/arena/king/upload', finalData);
}

export async function getKingRank(phone, session, range) {
  const data = await apiGet('/gaozhong/weici/group/arena/king/student/rank', { range: range, ...BASE_PARAMS, user_code: phone, session: session });
  if (data.result_code === 200) return data.data || [];
  throw new Error(data.description || '获取排名失败');
}

export async function saveNumberData(phone, session, knowWell, learn, useDay) {
  const formItems = [
    ['know_well', String(knowWell)],
    ['learn', String(learn)],
    ['use_day', String(useDay)],
    ['is_wifi', BASE_PARAMS.is_wifi],
    ['app_version', BASE_PARAMS.app_version],
    ['user_code', phone],
    ['bound_id', BASE_PARAMS.bound_id],
    ['session', session],
    ['app_id', BASE_PARAMS.app_id],
    ['device', BASE_PARAMS.device],
    ['platform', BASE_PARAMS.platform]
  ];
  const bodyToEncrypt = formItems.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const param = aesEncrypt(bodyToEncrypt);
  const finalData = { param, know_well: String(knowWell), learn: String(learn), use_day: String(useDay), is_wifi: BASE_PARAMS.is_wifi, app_version: BASE_PARAMS.app_version, user_code: phone, bound_id: BASE_PARAMS.bound_id, session: session, app_id: BASE_PARAMS.app_id, device: BASE_PARAMS.device, platform: BASE_PARAMS.platform };
  return await apiPostForm('/gaozhong/weici/sync/v2/number/save', finalData);
}

export async function getUserInfo(phone, session) {
  const data = await apiGet('/gaozhong/weici/sync/user/info', { medal_time_stamp: 0, ...BASE_PARAMS, user_code: phone, session: session });
  if (data.result_code === 200) return data.user_info || {};
  throw new Error(data.description || '获取账号信息失败');
}