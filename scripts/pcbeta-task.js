const { chromium } = require('playwright');

async function runTask() {
  console.log('✅ 开始执行 PCBeta 每日打卡任务...');

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
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  });

  try {
    await context.addCookies(cookies);
    const page = await context.newPage();

    // ==============================================
    // 1. 打开任务页面
    // ==============================================
    console.log('📌 打开任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task', { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // ==============================================
    // 任务1：检查立即申请
    // ==============================================
    const task1Btn = page.locator('a.taskbtn[href*="do=apply&id=149"]');
    if (await task1Btn.count() > 0) {
      console.log('👉 任务1：找到【立即申请】，开始执行');
      await task1Btn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } else {
      console.log('ℹ️ 任务1：已申请过 / 无需申请，直接跳过');
    }

    // ==============================================
    // 2. 进入任务进行中
    // ==============================================
    console.log('📌 进入任务进行中页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('👉 点击【回帖打卡福利】');
    await page.click('a:has-text("回帖打卡福利")', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // ==============================================
    // 3. 点击第2个【打卡专用】
    // ==============================================
    console.log('👉 点击第2个【打卡专用】');
    const dakaList = page.locator('a:has-text("打卡专用")');
    if (await dakaList.count() >= 2) {
      await dakaList.nth(1).click();
    }
    await page.waitForTimeout(4000);

    // ==============================================
    // 4. 滚动到页面底部 → 找到回复框（最稳方案）
    // ==============================================
    console.log('👉 定位底部快速回复框');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // ==============================================
    // 5. 输入回复内容（修复版）
    // ==============================================
    console.log('✍️ 输入打卡内容：每日打卡签到');
    await page.locator('#message').fill('每日打卡签到');
    await page.waitForTimeout(1500);

    // ==============================================
    // 6. 提交回复（论坛最稳按钮）
    // ==============================================
    console.log('🚀 提交回复');
    await page.click('button[type="submit"]:has-text("回复")');
    await page.waitForTimeout(5000);

    // ==============================================
    // 7. 返回任务页领取奖励
    // ==============================================
    console.log('📌 返回任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('🎁 点击【领取奖励】');
    await page.click('a:has-text("领取奖励"), button:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
      console.log('ℹ️ 奖励已领取或无需领取');
    });

    console.log('🎉 全部任务执行完成！');

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
  } finally {
    await browser.close();
  }
}

runTask();
