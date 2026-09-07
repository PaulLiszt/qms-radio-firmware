// countries.js — ISO 3166-1 alpha-2 ↔ 国家/地区名（中/英）
// 用途：
//   1) 呼号库（RadioID）只给英文国家名、不给 ISO 码 → 由名字反查 ISO 码，才能取到国旗图片；
//   2) 界面按当前语言显示国家/地区名（中文界面显示中文名）。
// 仅收录业余无线电活跃地区，够用即可；未命中时回退显示原始字符串。

import { getLang } from './i18n.js';

// code: [中文名, English name]
const C = {
  AD: ['安道尔', 'Andorra'], AE: ['阿联酋', 'United Arab Emirates'], AF: ['阿富汗', 'Afghanistan'],
  AL: ['阿尔巴尼亚', 'Albania'], AM: ['亚美尼亚', 'Armenia'], AR: ['阿根廷', 'Argentina'],
  AT: ['奥地利', 'Austria'], AU: ['澳大利亚', 'Australia'], AZ: ['阿塞拜疆', 'Azerbaijan'],
  BA: ['波黑', 'Bosnia and Herzegovina'], BD: ['孟加拉国', 'Bangladesh'], BE: ['比利时', 'Belgium'],
  BG: ['保加利亚', 'Bulgaria'], BH: ['巴林', 'Bahrain'], BN: ['文莱', 'Brunei'],
  BO: ['玻利维亚', 'Bolivia'], BR: ['巴西', 'Brazil'], BY: ['白俄罗斯', 'Belarus'],
  CA: ['加拿大', 'Canada'], CH: ['瑞士', 'Switzerland'], CL: ['智利', 'Chile'],
  CN: ['中国', 'China'], CO: ['哥伦比亚', 'Colombia'], CR: ['哥斯达黎加', 'Costa Rica'],
  CU: ['古巴', 'Cuba'], CY: ['塞浦路斯', 'Cyprus'], CZ: ['捷克', 'Czechia'],
  DE: ['德国', 'Germany'], DK: ['丹麦', 'Denmark'], DO: ['多米尼加', 'Dominican Republic'],
  DZ: ['阿尔及利亚', 'Algeria'], EC: ['厄瓜多尔', 'Ecuador'], EE: ['爱沙尼亚', 'Estonia'],
  EG: ['埃及', 'Egypt'], ES: ['西班牙', 'Spain'], ET: ['埃塞俄比亚', 'Ethiopia'],
  FI: ['芬兰', 'Finland'], FR: ['法国', 'France'], GB: ['英国', 'United Kingdom'],
  GE: ['格鲁吉亚', 'Georgia'], GH: ['加纳', 'Ghana'], GR: ['希腊', 'Greece'],
  GT: ['危地马拉', 'Guatemala'], HK: ['中国香港', 'Hong Kong, China'], HN: ['洪都拉斯', 'Honduras'],
  HR: ['克罗地亚', 'Croatia'], HU: ['匈牙利', 'Hungary'], ID: ['印度尼西亚', 'Indonesia'],
  IE: ['爱尔兰', 'Ireland'], IL: ['以色列', 'Israel'], IN: ['印度', 'India'],
  IQ: ['伊拉克', 'Iraq'], IR: ['伊朗', 'Iran'], IS: ['冰岛', 'Iceland'],
  IT: ['意大利', 'Italy'], JO: ['约旦', 'Jordan'], JP: ['日本', 'Japan'],
  KE: ['肯尼亚', 'Kenya'], KG: ['吉尔吉斯斯坦', 'Kyrgyzstan'], KH: ['柬埔寨', 'Cambodia'],
  KP: ['朝鲜', 'North Korea'], KR: ['韩国', 'South Korea'], KW: ['科威特', 'Kuwait'],
  KZ: ['哈萨克斯坦', 'Kazakhstan'], LA: ['老挝', 'Laos'], LB: ['黎巴嫩', 'Lebanon'],
  LK: ['斯里兰卡', 'Sri Lanka'], LT: ['立陶宛', 'Lithuania'], LU: ['卢森堡', 'Luxembourg'],
  LV: ['拉脱维亚', 'Latvia'], LY: ['利比亚', 'Libya'], MA: ['摩洛哥', 'Morocco'],
  MC: ['摩纳哥', 'Monaco'], MD: ['摩尔多瓦', 'Moldova'], ME: ['黑山', 'Montenegro'],
  MK: ['北马其顿', 'North Macedonia'], MM: ['缅甸', 'Myanmar'], MN: ['蒙古', 'Mongolia'],
  MO: ['中国澳门', 'Macao, China'], MT: ['马耳他', 'Malta'], MU: ['毛里求斯', 'Mauritius'],
  MV: ['马尔代夫', 'Maldives'], MX: ['墨西哥', 'Mexico'], MY: ['马来西亚', 'Malaysia'],
  NG: ['尼日利亚', 'Nigeria'], NL: ['荷兰', 'Netherlands'], NO: ['挪威', 'Norway'],
  NP: ['尼泊尔', 'Nepal'], NZ: ['新西兰', 'New Zealand'], OM: ['阿曼', 'Oman'],
  PA: ['巴拿马', 'Panama'], PE: ['秘鲁', 'Peru'], PH: ['菲律宾', 'Philippines'],
  PK: ['巴基斯坦', 'Pakistan'], PL: ['波兰', 'Poland'], PR: ['波多黎各', 'Puerto Rico'],
  PT: ['葡萄牙', 'Portugal'], PY: ['巴拉圭', 'Paraguay'], QA: ['卡塔尔', 'Qatar'],
  RO: ['罗马尼亚', 'Romania'], RS: ['塞尔维亚', 'Serbia'], RU: ['俄罗斯', 'Russia'],
  SA: ['沙特阿拉伯', 'Saudi Arabia'], SE: ['瑞典', 'Sweden'], SG: ['新加坡', 'Singapore'],
  SI: ['斯洛文尼亚', 'Slovenia'], SK: ['斯洛伐克', 'Slovakia'], SM: ['圣马力诺', 'San Marino'],
  SN: ['塞内加尔', 'Senegal'], SY: ['叙利亚', 'Syria'], TH: ['泰国', 'Thailand'],
  TJ: ['塔吉克斯坦', 'Tajikistan'], TM: ['土库曼斯坦', 'Turkmenistan'], TN: ['突尼斯', 'Tunisia'],
  TR: ['土耳其', 'Türkiye'], TW: ['中国台湾', 'Taiwan, China'], TZ: ['坦桑尼亚', 'Tanzania'],
  UA: ['乌克兰', 'Ukraine'], UG: ['乌干达', 'Uganda'], US: ['美国', 'United States'],
  UY: ['乌拉圭', 'Uruguay'], UZ: ['乌兹别克斯坦', 'Uzbekistan'], VE: ['委内瑞拉', 'Venezuela'],
  VN: ['越南', 'Vietnam'], YE: ['也门', 'Yemen'], ZA: ['南非', 'South Africa'],
  ZW: ['津巴布韦', 'Zimbabwe'],
};

// 呼号库里出现过的别名/旧称 → ISO 码（小写比较）
const ALIAS = {
  'united states of america': 'US', 'usa': 'US', 'u.s.a.': 'US', 'united states': 'US',
  'korea republic of': 'KR', 'republic of korea': 'KR', 'south korea': 'KR', 'korea, republic of': 'KR',
  'korea democratic people\'s republic of': 'KP',
  'russian federation': 'RU', 'russia': 'RU',
  'taiwan': 'TW', 'chinese taipei': 'TW', 'taiwan province of china': 'TW', 'taiwan, province of china': 'TW',
  'hong kong': 'HK', 'hong kong sar': 'HK', 'macau': 'MO', 'macao': 'MO',
  'viet nam': 'VN', 'vietnam': 'VN',
  'iran islamic republic of': 'IR', 'iran, islamic republic of': 'IR',
  'syrian arab republic': 'SY', 'lao people\'s democratic republic': 'LA',
  'czech republic': 'CZ', 'slovak republic': 'SK', 'republic of moldova': 'MD',
  'macedonia': 'MK', 'north macedonia': 'MK', 'the former yugoslav republic of macedonia': 'MK',
  'bolivia plurinational state of': 'BO', 'venezuela bolivarian republic of': 'VE',
  'tanzania united republic of': 'TZ', 'brunei darussalam': 'BN',
  'united kingdom': 'GB', 'great britain': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'northern ireland': 'GB', 'turkey': 'TR', 'turkiye': 'TR',
  'people\'s republic of china': 'CN', 'china': 'CN', 'mainland china': 'CN',
  'netherlands the': 'NL', 'holland': 'NL', 'republic of south africa': 'ZA',
};

// 反查索引：英文名/中文名/别名（全部小写）→ ISO 码
const REV = (() => {
  const m = new Map();
  for (const [code, [zh, en]] of Object.entries(C)) {
    m.set(en.toLowerCase(), code);
    m.set(zh, code);
  }
  for (const [k, v] of Object.entries(ALIAS)) m.set(k, v);
  return m;
})();

// 国家名（任意语言/别名）→ ISO alpha-2；识别不出返回 null
export function codeFromName(name) {
  if (!name) return null;
  const s = String(name).trim();
  if (/^[A-Za-z]{2}$/.test(s) && C[s.toUpperCase()]) return s.toUpperCase();
  const key = s.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  return REV.get(key) || REV.get(s) || null;
}

// ISO alpha-2 → 当前界面语言的国家/地区名；未收录时回退返回原码
export function nameFromCode(code) {
  if (!code) return '';
  const e = C[String(code).toUpperCase()];
  if (!e) return String(code).toUpperCase();
  return getLang() === 'zh' ? e[0] : e[1];
}

export function hasCode(code) { return !!C[String(code || '').toUpperCase()]; }
