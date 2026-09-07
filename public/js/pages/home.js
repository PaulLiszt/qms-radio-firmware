// pages/home.js — 首页：项目介绍 + 设备要求 + 快速上手 + 常见问题 + 相关链接（i18n）
import { t } from '../i18n.js';
import { core } from '../core.js';

// 与本项目相关的数字对讲 / DMR 资源站点（标题保留原文，不作翻译）
const FRIENDLY_LINKS = [
  { href: 'https://hamptt.com', label: 'HAMPTT' },
  { href: 'https://nrlptt.com', label: 'NRLPTT' },
  { href: 'https://brandmeister.network', label: 'BrandMeister' },
  { href: 'https://radioid.net', label: 'RadioID' },
  { href: 'https://www.dmr-marc.net', label: 'DMR-MARC' },
  { href: 'https://www.dmrusa.net', label: 'DMR USA' },
  { href: 'https://wiki.radioid.net', label: 'RadioID Wiki' },
  { href: 'https://github.com/g4klx/MMDVM', label: 'MMDVM (g4klx)' },
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function renderHome(view) {
  const linksHtml = FRIENDLY_LINKS.map(l =>
    `<a class="flink" href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`
  ).join('');

  // FAQ 渲染为可折叠问答（<details>），内容经转义并按换行分段。
  const faqHtml = `<section class="card">
      <h2>${t('home.faqTitle')}</h2>
      <div id="faqList" class="faq"><p class="sub">${t('home.faqEmpty')}</p></div>
    </section>`;

  view.innerHTML = `
    <section class="hero">
      <h1>${t('home.title')}</h1>
      <p class="lede">${t('home.lede')}</p>
      <p class="hero-actions"><a class="btn-github" href="https://github.com/PaulLiszt/qms-radio-firmware" target="_blank" rel="noopener noreferrer">${t('home.repoLink')} ↗</a></p>
    </section>

    <section class="card">
      <h2>${t('home.hwTitle')}</h2>
      <ul class="feat">
        <li>${t('home.hw1')}</li>
        <li>${t('home.hw2')}</li>
        <li>${t('home.hw3')}</li>
        <li>${t('home.hw4')}</li>
        <li>${t('home.hw5')}</li>
      </ul>
    </section>

    <section class="card">
      <h2>${t('home.stepTitle')}</h2>
      <ol class="steps">
        <li>${t('home.s1')}</li>
        <li>${t('home.s5')}</li>
        <li>${t('home.s2')}</li>
        <li>${t('home.s3')}</li>
        <li>${t('home.s4')}</li>
        <li>${t('home.s6')}</li>
      </ol>
    </section>

    ${faqHtml}

    <section class="card">
      <h2>${t('home.linksTitle')}</h2>
      <p class="sub">${t('home.linksHint')}</p>
      <div class="flinks">${linksHtml}</div>
    </section>`;

  // 异步加载 FAQ（公开接口，无需登录）
  try {
    const r = await core.api('/api/faq');
    const box = view.querySelector('#faqList');
    if (!box) return null;
    const faq = (r && r.faq) || [];
    if (!faq.length) { box.innerHTML = `<p class="sub">${t('home.faqEmpty')}</p>`; return null; }
    box.innerHTML = faq.map(f => `
      <details class="faq-item">
        <summary>${esc(f.q)}</summary>
        <div class="faq-a">${esc(f.a).replace(/\n/g, '<br>')}</div>
      </details>`).join('');
  } catch (_) {}

  return null;
}

