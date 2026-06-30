const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 截图保存目录
const SCREENSHOT_DIR = path.join(__dirname, '../screenshots');
let screenshotIndex = 0;

// 初始化截图目录
function initScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

// 在鼠标位置画红点 + 截图
async function clickWithRedDot(page, locator, stepName) {
  screenshotIndex++;
  const indexStr = String(screenshotIndex).padStart(2, '0');

  // 获取元素位置
  const box = await locator.boundingBox();
  if (!box) {
    console.log(`⚠️  ${stepName}：元素不可见，跳过截图`);
    await locator.click({ force: true });
    return;
  }

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // 1. 鼠标移动到元素中心
  await page.mouse.move(centerX, centerY);
  await page.waitForTimeout(300);

  // 2. 在页面上插入红色圆点（临时）
  await page.evaluate(({ x, y }) => {
    const dot = document.createElement('div');
    dot.id = '__mouse_red_dot__';
    dot.style.cssText = `
      position: fixed;
      left: ${x - 8}px;
      top: ${y - 8}px;
      width: 16px;
      height: 16px;
      background: #ff0000;
      border: 2px solid #ffffff;
      border-radius: 50%;
      z-index: 999999;
      pointer-events: none;
      box-shadow: 0 0 8px rgba(255,0,0,0.8);
    `;
    document.body.appendChild(dot);
  }, { x: centerX, y: centerY });

  // 3. 截图（带红点）
  const screenshotPath = path.join(SCREENSHOT_DIR, `${indexStr}_${stepName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`📸 截图已保存：${indexStr}_${stepName}.png`);

  // 4. 移除红点
  await page.evaluate(() => {
    const dot = document.getElementById('__mouse_red_dot__');
    if (dot) dot.remove();
  });

  // 5. 执行点击
  await locator.click({ force: true });
}

async function runTask() {
  console.log('✅ 开始执行 PCBeta 每日打卡任务...');
  initScreenshotDir();

  const cookieEnv = process.env.PC_BETA_COOKIES;
  if (!cookieEnv) {
    console.error('❌ 未设置 PC_BETA_COOKIES 环境变量');
    process.exit(1);
  }

  let cookies = [];
  try {
    const parsed = JSON.parse(cookieEnv);
    cookies = parsed.cookies || parsed;
  } catch (e) {
    console.error('❌ Cookie 解析失败');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  // ==============================================
  // ✅ 分辨率改为 1250 x 10488
  // ==============================================
  const context = await browser.newContext({
    viewport: { width: 1250, height: 10488 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });

  try {
    await context.addCookies(cookies);
    const page = await context.newPage();

    // 1. 打开任务页面
    console.log('📌 打开任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task', { timeout: 60000 });
    await page.waitForTimeout(2000);

    // ==============================================
    // ✅ 任务1：兼容 id=1~1000 的所有立即申请
    // ==============================================
    console.log('👉 任务1：查找【立即申请】按钮...');
    // 匹配所有 a.taskbtn，href 包含 do=apply 且 id 为 1-1000 的数字
    const task1Btns = page.locator('a.taskbtn[href*="do=apply"]');
    const task1Count = await task1Btns.count();
    console.log(`ℹ️ 找到 ${task1Count} 个立即申请按钮`);

    if (task1Count > 0) {
      for (let i = 0; i < task1Count; i++) {
        const btn = task1Btns.nth(i);
        const href = await btn.getAttribute('href') || '';
        // 提取 id 数字，判断是否在 1~1000 之间
        const idMatch = href.match(/id=(\d+)/);
        if (idMatch) {
          const id = parseInt(idMatch[1]);
          if (id >= 1 && id <= 1000) {
            console.log(`👉 任务1：点击 id=${id} 的【立即申请】`);
            await btn.scrollIntoViewIfNeeded();
            await clickWithRedDot(page, btn, `任务1_立即申请_id${id}`);
            await page.waitForTimeout(2000);
            // 点击后回到任务页继续找下一个
            await page.goto('https://i.pcbeta.com/home.php?mod=task', { timeout: 60000 });
            await page.waitForTimeout(2000);
          }
        }
      }
    } else {
      console.log('ℹ️ 任务1：全部已完成，跳过');
    }

    // 2. 进入任务进行中
    console.log('📌 进入任务进行中页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
    await page.waitForTimeout(2000);

    // 3. 点击回帖打卡福利
    console.log('👉 任务2：点击【回帖打卡福利】');
    const task2Link = page.locator('a:has-text("回帖打卡福利")');
    await task2Link.scrollIntoViewIfNeeded();
    await clickWithRedDot(page, task2Link, '任务2_回帖打卡福利');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    console.log('🌐 任务2页面URL:', page.url());

    // 4. 定位第2个【加粗打卡专用】链接
    console.log('👉 定位第2个【加粗打卡专用】链接...');
    const dakaItems = page.locator('a:has(strong:has-text("打卡专用"))');
    const count = await dakaItems.count();
    console.log(`ℹ️ 页面找到打卡专用链接数量：${count}`);

    let dakaTarget;
    if (count >= 2) {
      dakaTarget = dakaItems.nth(1);
    } else {
      dakaTarget = dakaItems.first();
    }
    await dakaTarget.waitFor({ state: 'visible', timeout: 10000 });
    await dakaTarget.scrollIntoViewIfNeeded();
    await clickWithRedDot(page, dakaTarget, '任务3_打卡专用帖');

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    console.log('🌐 已进入打卡帖子页面URL:', page.url());

    // 滚动到底部
    console.log('👉 滚动到页面最底部');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // 5. 快速回复框输入
    console.log('✍️ 输入打卡内容：每日打卡签到');
    const textarea = page.locator('#fastpostmessage');
    await textarea.scrollIntoViewIfNeeded();
    await clickWithRedDot(page, textarea, '任务4_点击回复框');
    await textarea.fill('每日打卡签到');
    await page.waitForTimeout(1500);

    // 6. 发表回复
    console.log('🚀 点击【发表回复】');
    const submitBtn = page.locator('#fastpostsubmit');
    await submitBtn.scrollIntoViewIfNeeded();
    await clickWithRedDot(page, submitBtn, '任务5_发表回复');
    await page.waitForTimeout(6000);

    // 7. 返回任务页领取奖励
    console.log('📌 返回任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
    await page.waitForTimeout(2000);
    console.log('🌐 返回后URL:', page.url());

    console.log('🎁 点击【领取奖励】');
    const rewardBtn = page.locator('a:has-text("领取奖励")');
    if (await rewardBtn.count() > 0) {
      await rewardBtn.scrollIntoViewIfNeeded();
      await clickWithRedDot(page, rewardBtn, '任务6_领取奖励');
    } else {
      console.log('ℹ️ 奖励已领取或无需领取');
    }

    console.log('🎉 全部任务执行完成！');

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
  } finally {
    await browser.close();
  }
}

runTask();
