/**
 * checkin.js  ---  PCbeta 自动打卡（文本定位 -> 偏移坐标 -> 红点截图 -> 点击，全流程）
 *
 * 完整流程（最多 5 张截图）：
 *   1. 打开 https://i.pcbeta.com/home.php?mod=task&item=new ，视口固定 2560 x 10055
 *   2. 识别「打卡专用」-> 坐标 (X, Y)
 *      ※ 找不到就跳过第 3~5 步（下面那两次偏移截图和点击），直接跳到第 6 步；
 *        多半是今天已申请过、任务已经转入 doing 了。
 *   3. 鼠标移到 (X+530, Y+60) -> 红点截图 -> 点击
 *   4. 重新打开 item=new
 *   5. 鼠标移到 (X+530, Y-10) -> 红点截图 -> 点击
 *   6. 打开 item=doing，识别「回帖打卡福利」-> 坐标
 *      ※ 找不到就终止整个流程（退出码 2）——这一步是必经的。
 *   7. 鼠标移到该坐标 -> 红点截图 -> 点击
 *      （点击后进入任务页 https://i.pcbeta.com/home.php?mod=task&do=view&id=n）
 *   8. 在任务页识别「回复主题」-> 坐标 (Xr, Yr)
 *   9. 鼠标移到 (Xr-150, Yr) -> 红点截图 -> 点击
 *  10. 进入打卡页，在最下面的回复框里填写「每日打卡签到」，点击【发表回复】
 *  11. 重新打开 item=doing，识别「领取奖励」-> 坐标
 *  12. 鼠标移到该坐标 -> 红点截图 -> 点击
 *
 *   截图命名：第n次截图-坐标X-坐标Y.png（坐标为鼠标所在位置，从 1 开始顺次编号）
 *     - 走完整流程（item=new 上有「打卡专用」）：5 张，第1~5次
 *     - 跳过了前两步（item=new 上没有）：3 张，第1~3次
 *   红点尺寸默认按 50% 缩放（DOT_SCALE=0.5）
 *
 * 可用环境变量：
 *   PCBETA_COOKIES   登录态（base64 或原始 JSON）
 *   TARGET_URL       默认 ...?mod=task&item=new
 *   DOING_URL        默认 ...?mod=task&item=doing
 *   KEYWORD          默认「打卡专用」
 *   KEYWORD_DOING    默认「回帖打卡福利」
 *   KEYWORD_REPLY    默认「回复主题」
 *   KEYWORD_REWARD   默认「领取奖励」
 *   OFFSET1_X/Y      第一次点击偏移，默认 530 / 60
 *   OFFSET2_X/Y      第二次点击偏移，默认 530 / -10
 *   REPLY_OFFSET_X/Y 「回复主题」的偏移，默认 -150 / 0
 *   REPLY_TEXT       回复内容，默认「每日打卡签到」
 *   REPLY_BUTTON     发表按钮文案，默认「发表回复」
 *   DOT_SCALE        红点缩放比例，默认 0.5
 *   VIEWPORT_WIDTH / VIEWPORT_HEIGHT   默认 2560 / 10055
 *   SHOT_INDEX_START 截图起始序号 n，默认 1
 *   DO_CLICK         默认 1（点击）；设 0 则只截图不点击
 *   FULL_PAGE        默认 0；设 1 截整页
 *   CHROMIUM_EXECUTABLE  指向本机已有的 Chromium（可选）
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * Playwright 找不到浏览器时给出可操作的指引，并以退出码 3 结束
 * （bat / 工作流靠这个退出码判断是否要自动下载浏览器）。
 *
 * 说明：这段逻辑是**刻意内联**在这里的，没有抽成公共模块。
 * 因为本项目的文件是通过 GitHub 网页版编辑器逐个上传维护的，
 * 少传一个文件就会导致 CI 报 "Cannot find module"。
 * 保持单文件自包含，改一个文件就能整体生效。
 */
function reportMissingBrowser(err) {
  const msg = String((err && err.message) || err);
  if (!/Executable doesn't exist|playwright install/i.test(msg)) return false;

  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  let found = [];
  try {
    if (fs.existsSync(root)) {
      found = fs
        .readdirSync(root)
        .filter((n) => /^chromium-\d+$/.test(n))
        .map((n) => {
          for (const sub of ['chrome-win64', 'chrome-win']) {
            const exe = path.join(root, n, sub, 'chrome.exe');
            if (fs.existsSync(exe)) return exe;
          }
          return null;
        })
        .filter(Boolean);
    }
  } catch (_) {
    /* 枚举失败不影响主流程 */
  }

  console.error('');
  console.error('[错误] 本机没有 Playwright 当前版本需要的 Chromium 浏览器。');
  console.error('       缺失的路径：');
  console.error('       ' + msg.split('\n')[0].trim());
  console.error('');
  console.error('       任选其一解决：');
  console.error('');
  console.error('       A) 下载浏览器（约 200MB，只需一次）：');
  console.error('            npx playwright install chromium');
  console.error('');
  console.error('       B) 复用本机已有的 Chromium，先设置环境变量再运行：');
  if (found.length) {
    console.error('            本机已检测到以下 Chromium，复制其中一条即可：');
    for (const exe of found) console.error('              set CHROMIUM_EXECUTABLE=' + exe);
  } else {
    console.error('            set CHROMIUM_EXECUTABLE=<本机 Chromium 的 chrome.exe 完整路径>');
    console.error('            （未在 ' + root + ' 下找到已安装的 Chromium）');
  }
  console.error('');

  process.exit(3);
  return true;
}

const TASK_BASE = 'https://i.pcbeta.com/home.php?mod=task&item=';
const TARGET_URL = process.env.TARGET_URL || TASK_BASE + 'new';
const DOING_URL = process.env.DOING_URL || TASK_BASE + 'doing';

const KEYWORD = process.env.KEYWORD || '\u6253\u5361\u4e13\u7528';                       // 打卡专用
const KEYWORD_DOING = process.env.KEYWORD_DOING || '\u56de\u5e16\u6253\u5361\u798f\u5229'; // 回帖打卡福利
const KEYWORD_REPLY = process.env.KEYWORD_REPLY || '\u56de\u590d\u4e3b\u9898';             // 回复主题
const KEYWORD_REWARD = process.env.KEYWORD_REWARD || '\u9886\u53d6\u5956\u52b1';           // 领取奖励

const VIEWPORT_WIDTH = parseInt(process.env.VIEWPORT_WIDTH || '2560', 10);
const VIEWPORT_HEIGHT = parseInt(process.env.VIEWPORT_HEIGHT || '10055', 10);

const OFF1_X = parseInt(process.env.OFFSET1_X || '530', 10);
const OFF1_Y = parseInt(process.env.OFFSET1_Y || '60', 10);
const OFF2_X = parseInt(process.env.OFFSET2_X || '530', 10);
const OFF2_Y = parseInt(process.env.OFFSET2_Y || '-10', 10);
const REPLY_OFF_X = parseInt(process.env.REPLY_OFFSET_X || '-150', 10);
const REPLY_OFF_Y = parseInt(process.env.REPLY_OFFSET_Y || '0', 10);

const REPLY_TEXT = process.env.REPLY_TEXT || '\u6bcf\u65e5\u6253\u5361\u7b7e\u5230';       // 每日打卡签到
const REPLY_BUTTON = process.env.REPLY_BUTTON || '\u53d1\u8868\u56de\u590d';               // 发表回复

const DOT_SCALE = parseFloat(process.env.DOT_SCALE || '0.5');
const DOT_SIZE = Math.max(4, Math.round(26 * DOT_SCALE)); // 26 * 0.5 = 13
const DOT_BORDER = Math.max(1, 3 * DOT_SCALE);

const SHOT_INDEX_START = parseInt(process.env.SHOT_INDEX_START || '1', 10);
const DO_CLICK = !/^(0|false|no)$/i.test((process.env.DO_CLICK || '1').trim());
const FULL_PAGE = /^(1|true|yes)$/i.test(process.env.FULL_PAGE || '');
const CHROMIUM_EXECUTABLE = (process.env.CHROMIUM_EXECUTABLE || '').trim();

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');
const AUTH_FILE = path.join(ROOT, 'auth.json');

/** 读取登录态：环境变量优先，其次本地 auth.json */
function loadStorageState() {
  const env = (process.env.PCBETA_COOKIES || '').trim();
  if (env) {
    const raw = env.startsWith('{') ? env : Buffer.from(env, 'base64').toString('utf8');
    try {
      const state = JSON.parse(raw);
      console.log('[info] 使用环境变量 PCBETA_COOKIES 中的登录态');
      return state;
    } catch (e) {
      throw new Error('PCBETA_COOKIES 不是合法的 JSON / base64(JSON)：' + e.message);
    }
  }
  if (fs.existsSync(AUTH_FILE)) {
    console.log('[info] 使用本地 auth.json 中的登录态');
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  }
  console.warn('[warn] 未找到任何登录态，将以游客身份访问（可能被跳转到登录页）');
  return undefined;
}

/**
 * 扫描页面，返回所有含关键字的「最深」元素的中心视口坐标。
 * 用 textContent 判断，所以 HTML 里文本被标签拆开也能命中。
 * 同时尽量给出元素对应链接的绝对地址，供点击没跳转时兜底。
 */
async function findKeywordPositions(page, kw) {
  return page.evaluate((keyword) => {
    const out = [];
    const seen = new Set();
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const own = el.textContent || '';
      if (own.indexOf(keyword) === -1) continue;
      let childHas = false;
      for (const c of el.children) {
        if ((c.textContent || '').indexOf(keyword) !== -1) {
          childHas = true;
          break;
        }
      }
      if (childHas) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;

      let href = '';
      const anc = el.closest ? el.closest('a[href]') : null;
      if (anc) href = anc.href;
      else {
        const inner = el.querySelector ? el.querySelector('a[href]') : null;
        if (inner) href = inner.href;
      }

      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x: x, y: y, tag: el.tagName, text: own.trim().slice(0, 60), href: href });
    }
    out.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    return out;
  }, kw);
}

/** 在页面里画一个红点（模拟鼠标指针），坐标是视口坐标 */
async function drawDot(page, x, y) {
  const half = DOT_SIZE / 2;
  await page.evaluate(
    ([px, py, size, border, halfSize]) => {
      const old = document.getElementById('__mouse_dot__');
      if (old) old.remove();
      const dot = document.createElement('div');
      dot.id = '__mouse_dot__';
      dot.style.cssText = [
        'position:fixed',
        'left:' + px + 'px',
        'top:' + py + 'px',
        'width:' + size + 'px',
        'height:' + size + 'px',
        'margin:' + -halfSize + 'px 0 0 ' + -halfSize + 'px',
        'border-radius:50%',
        'background:#ff0000',
        'border:' + border + 'px solid #ffffff',
        'box-shadow:0 0 5px rgba(0,0,0,.65)',
        'z-index:2147483647',
        'pointer-events:none',
      ].join(';');
      document.documentElement.appendChild(dot);
    },
    [x, y, DOT_SIZE, DOT_BORDER, half]
  );
}

async function clearDot(page) {
  await page.evaluate(() => {
    const old = document.getElementById('__mouse_dot__');
    if (old) old.remove();
  });
}

/** 打开页面并等它稳定，滚动归零（保证视口坐标 == 页面坐标） */
async function openPage(page, url) {
  console.log('\n[step] 打开页面：' + url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await page.waitForLoadState('networkidle', { timeout: 20000 });
  } catch (_) {
    /* 论坛可能有长连接，超时不致命 */
  }
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  console.log('[info] 页面标题：' + await page.title());
}

function checkInViewport(x, y) {
  if (x < 0 || y < 0 || x > VIEWPORT_WIDTH || y > VIEWPORT_HEIGHT) {
    console.warn('[warn] 坐标 (' + x + ', ' + y + ') 超出视口 ' + VIEWPORT_WIDTH + 'x' + VIEWPORT_HEIGHT + '，红点可能不在图里');
  }
}

const shots = [];

/**
 * 鼠标移动 -> 叠加红点截图 -> （可选）点击。
 * 点击后如果打开了新标签页会自动切过去，并把当前页面返回给调用方。
 */
async function moveShotClick(ctx, page, x, y, label, doClick) {
  const n = SHOT_INDEX_START + shots.length;
  checkInViewport(x, y);

  await page.mouse.move(x, y, { steps: 12 });
  await page.waitForTimeout(400);

  await drawDot(page, x, y);
  const fileName = '第' + n + '次截图-' + x + '-' + y + '.png';
  await page.screenshot({ path: path.join(OUT_DIR, fileName), fullPage: FULL_PAGE });
  await clearDot(page);

  shots.push(fileName);
  console.log('[ok] 第' + n + '次截图 -> ' + fileName + '    ' + label);

  if (!doClick) return page;

  console.log('     -> 点击 (' + x + ', ' + y + ')');
  const before = ctx.pages().slice();
  await page.mouse.click(x, y);
  await page.waitForTimeout(2500);

  const fresh = ctx.pages().filter((p) => before.indexOf(p) === -1);
  if (fresh.length) {
    const np = fresh[fresh.length - 1];
    try {
      await np.waitForLoadState('domcontentloaded', { timeout: 20000 });
    } catch (_) {
      /* ignore */
    }
    console.log('     -> 点击打开了新标签页，已切换：' + np.url());
    return np;
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (_) {
    /* 没跳转也正常 */
  }
  return page;
}

/** 等待进入任务页 do=view&id=n；没跳转就用链接地址兜底 */
async function waitForTaskView(page, hrefFallback) {
  try {
    await page.waitForURL(/do=view/, { timeout: 20000 });
    console.log('[info] 已进入任务页面：' + page.url());
    return;
  } catch (_) {
    if (hrefFallback) {
      console.warn('[warn] 点击后没有跳转，改用链接地址直接打开：' + hrefFallback);
      await openPage(page, hrefFallback);
      return;
    }
    console.warn('[warn] 点击后没有跳转到任务页，继续在当前页面操作');
  }
}

/** 按文案点击按钮，多种选择器兜底 */
async function clickByText(page, text) {
  const selectors = [
    'button:has-text("' + text + '")',
    'a:has-text("' + text + '")',
    'input[type="submit"][value*="' + text + '"]',
    'input[type="button"][value*="' + text + '"]',
    '[id*="submit"]:has-text("' + text + '")',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel);
    const cnt = await loc.count();
    if (cnt > 0) {
      const target = loc.nth(cnt - 1);
      try {
        await target.scrollIntoViewIfNeeded();
        await target.click({ timeout: 15000 });
        console.log('[ok] 已点击「' + text + '」（选择器：' + sel + '）');
        return true;
      } catch (_) {
        /* 换下一个选择器 */
      }
    }
  }
  const byText = page.getByText(text, { exact: false });
  const cnt = await byText.count();
  for (let i = cnt - 1; i >= 0; i--) {
    try {
      await byText.nth(i).click({ timeout: 10000 });
      console.log('[ok] 已点击「' + text + '」（按文本匹配）');
      return true;
    } catch (_) {
      /* 继续试 */
    }
  }
  return false;
}

/** 在页面最下面的回复框里填入内容并点击发表 */
async function fillReplyAndSubmit(page, text) {
  console.log('\n[step] 在回复框里填写：' + text);

  const selectors = [
    '#fastpostmessage',
    'textarea[name="message"]',
    'textarea#e_textarea',
    'textarea',
  ];
  let box = null;
  for (const sel of selectors) {
    const loc = page.locator(sel);
    const cnt = await loc.count();
    if (cnt > 0) {
      box = loc.nth(cnt - 1); // 取最下面那个
      console.log('[info] 命中回复框选择器：' + sel + '（共 ' + cnt + ' 个，取最后一个）');
      break;
    }
  }
  if (!box) {
    const ce = page.locator('[contenteditable="true"]');
    const cnt = await ce.count();
    if (cnt > 0) {
      box = ce.nth(cnt - 1);
      console.log('[info] 回复框是 contenteditable 编辑器');
    }
  }
  if (!box) {
    console.warn('[warn] 没有找到回复框，跳过填写与发表步骤');
    return false;
  }

  try {
    await box.scrollIntoViewIfNeeded();
  } catch (_) {
    /* ignore */
  }
  try {
    await box.click({ timeout: 15000 });
  } catch (_) {
    /* 有些编辑器不需要先点击 */
  }
  await box.fill(text);
  await page.waitForTimeout(600);
  console.log('[ok] 已填入回复内容');

  const clicked = await clickByText(page, REPLY_BUTTON);
  if (!clicked) {
    console.warn('[warn] 没有找到「' + REPLY_BUTTON + '」按钮，回复可能没有提交');
    return false;
  }
  await page.waitForTimeout(4000);
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (_) {
    /* ignore */
  }
  console.log('[ok] 回复已提交');
  return true;
}

/** 找不到关键字时的兜底：存现场图并以退出码 2 结束（终止本次流程） */
async function notFound(page, keyword, hint) {
  const safe = keyword.replace(/[\\/:*?"<>|]/g, '_');
  const file = path.join(OUT_DIR, '未识别到关键字-' + safe + '-0-0.png');
  await page.screenshot({ path: file, fullPage: FULL_PAGE });
  console.error('\n[error] 页面上没有识别到「' + keyword + '」，终止本次流程');
  console.error('        当前地址：' + page.url());
  console.error('        已保存现场截图：' + file);
  if (hint) console.error('        ' + hint);
  console.error('        常见原因：登录态失效 / 该步骤已完成过 / 关键字文案变了');
  process.exit(2);
}

/** 识别关键字：找到返回第一个命中项；找不到返回 null（不退出），交给调用方决定 */
async function tryLocate(page, keyword) {
  const hits = await findKeywordPositions(page, keyword);
  console.log('[info] 命中「' + keyword + '」共 ' + hits.length + ' 处');
  if (!hits.length) return null;
  const hit = hits[0];
  console.log('[info] 「' + keyword + '」坐标：(' + hit.x + ', ' + hit.y + ')  <' + hit.tag + '> ' + hit.text);
  return hit;
}

/** 识别关键字：找不到就终止流程（退出码 2） */
async function locate(page, keyword, hint) {
  const hit = await tryLocate(page, keyword);
  if (!hit) await notFound(page, keyword, hint);
  return hit;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const storageState = loadStorageState();
  let browser;
  try {
    browser = await chromium.launch(
      CHROMIUM_EXECUTABLE ? { headless: true, executablePath: CHROMIUM_EXECUTABLE } : { headless: true }
    );
  } catch (err) {
    if (reportMissingBrowser(err)) return;
    throw err;
  }

  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    storageState: storageState,
  });
  let page = await context.newPage();
  page.setDefaultTimeout(60000);

  console.log('[info] 视口尺寸：' + VIEWPORT_WIDTH + ' x ' + VIEWPORT_HEIGHT + '   红点尺寸：' + DOT_SIZE + 'px');
  console.log('[info] 点击：' + (DO_CLICK ? '开启' : '关闭（仅截图）'));

  // ===== 1~2. item=new，识别「打卡专用」 =====
  await openPage(page, TARGET_URL);
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (pageHeight > VIEWPORT_HEIGHT) {
    console.warn('[warn] 页面高度 ' + pageHeight + ' 超过视口高度 ' + VIEWPORT_HEIGHT + '，超出部分不会被截进图里');
  }
  const base = await tryLocate(page, KEYWORD);

  if (base) {
    const X = base.x, Y = base.y;

    // ===== 3. (X+530, Y+60) 截图 + 点击 =====
    page = await moveShotClick(
      context, page, X + OFF1_X, Y + OFF1_Y,
      '[' + KEYWORD + ' +(' + OFF1_X + ', ' + OFF1_Y + ')]', DO_CLICK
    );

    // ===== 4. 重新打开 item=new =====
    await openPage(page, TARGET_URL);
    const rehits = await findKeywordPositions(page, KEYWORD);
    if (!rehits.length) {
      console.warn('[warn] 重新打开后页面上已经没有「' + KEYWORD + '」（多半是刚才点击后转入 doing 了），沿用首次坐标');
    } else {
      console.log('[info] 重新打开后仍能识别到「' + KEYWORD + '」，坐标 (' + rehits[0].x + ', ' + rehits[0].y + ')，按流程沿用首次坐标');
    }

    // ===== 5. (X+530, Y-10) 截图 + 点击 =====
    page = await moveShotClick(
      context, page, X + OFF2_X, Y + OFF2_Y,
      '[' + KEYWORD + ' +(' + OFF2_X + ', ' + OFF2_Y + ')]', DO_CLICK
    );
  } else {
    console.warn('');
    console.warn('[warn] item=new 上没有识别到「' + KEYWORD + '」，跳过前两次偏移截图与点击，');
    console.warn('       直接打开 item=doing 继续后面的流程（多半是今天已申请过、任务已转入 doing）');
  }

  // ===== 6~7. item=doing，识别「回帖打卡福利」-> 截图 + 点击 =====
  await openPage(page, DOING_URL);
  const doingHit = await locate(
    page, KEYWORD_DOING,
    '按流程要求：doing 页识别不到「' + KEYWORD_DOING + '」即终止，这里是必经步骤。'
  );
  page = await moveShotClick(
    context, page, doingHit.x, doingHit.y,
    '[' + KEYWORD_DOING + ' 原坐标]', DO_CLICK
  );

  // ===== 8. 等待进入任务页 do=view&id=n =====
  await waitForTaskView(page, doingHit.href);

  // ===== 9. 任务页识别「回复主题」，移到 (Xr-150, Yr) 截图 + 点击 =====
  const replyHit = await locate(page, KEYWORD_REPLY);
  const urlBeforeReply = page.url();
  page = await moveShotClick(
    context, page, replyHit.x + REPLY_OFF_X, replyHit.y + REPLY_OFF_Y,
    '[' + KEYWORD_REPLY + ' +(' + REPLY_OFF_X + ', ' + REPLY_OFF_Y + ')]', DO_CLICK
  );

  // ===== 10. 打卡页：填回复框 + 发表回复 =====
  if (DO_CLICK) {
    if (page.url() === urlBeforeReply && replyHit.href) {
      console.warn('[warn] 点击后没有跳转到打卡页，改用链接地址直接打开：' + replyHit.href);
      await openPage(page, replyHit.href);
    } else {
      await page.waitForTimeout(2500);
      try {
        await page.waitForLoadState('networkidle', { timeout: 20000 });
      } catch (_) {
        /* ignore */
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await fillReplyAndSubmit(page, REPLY_TEXT);
  } else {
    console.log('\n[info] DO_CLICK=0（干跑模式），跳过回复框填写与发表');
  }

  // ===== 11~12. 重新打开 item=doing，识别「领取奖励」-> 截图 + 点击 =====
  await openPage(page, DOING_URL);
  const rewardHit = await locate(page, KEYWORD_REWARD);
  page = await moveShotClick(
    context, page, rewardHit.x, rewardHit.y,
    '[' + KEYWORD_REWARD + ' 原坐标]', DO_CLICK
  );

  console.log('\n[ok] 本次共生成 ' + shots.length + ' 张截图：');
  for (const s of shots) console.log('     ' + s);
  console.log('     目录：' + OUT_DIR);

  await browser.close();
}

main().catch((err) => {
  console.error('[error] 执行失败：', err);
  process.exit(1);
});
