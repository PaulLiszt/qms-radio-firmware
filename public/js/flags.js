// flags.js — 国旗显示助手
// 为什么不用 emoji：Windows 不内置旗帜 emoji 字体，🇨🇳 会退化成白旗。
// 因此用 /flags/<iso小写>.svg 图片（flag-icons 4x3 集合）。
// 稳健性：图片一旦 404 / 被拦截，onerror 直接隐藏该 <img>，**文字国名始终可见**，
// 所以即使旗帜资源没部署上，界面也不会出现破图或空白。

import { nameFromCode } from './countries.js';

export function flagImg(code, cls) {
  const cc = String(code || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return '';
  return `<img class="flag ${cls || ''}" src="/flags/${cc}.svg" alt="" aria-hidden="true" loading="lazy" onerror="this.style.display='none'" />`;
}

// 旗帜 + 国家/地区名（文字为主、旗帜为辅）。code 无效时只返回 fallback 文字。
export function flagLabel(code, fallbackText, cls) {
  const name = code ? nameFromCode(code) : '';
  const text = name || fallbackText || '';
  if (!text) return '';
  return `<span class="flag-label">${flagImg(code, cls)}<span class="cname">${text}</span></span>`;
}
