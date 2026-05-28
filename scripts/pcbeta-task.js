const { chromium } = require('playwright');

async function runTask() {
  console.log('✅ 开始执行 PCBeta 每日打卡任务...');

  // 从环境变量读取 Cookie
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
    // 加载 Cookie
    await context.addCookies(cookies);
    const page = await context.newPage();

    // ==============================================
    // 1. 打开任务页面
    // ==============================================
    console.log('📌 打开任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task', { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // ==============================================
    // 【智能判断】任务1：检查【立即申请】是否存在，不存在直接跳过
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
    // 2. 进入任务进行中页面（任务2）
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
    await page.waitForTimeout(3000);

    // ==============================================
    // 4. 点击第4个【回复】
    // ==============================================
    console.log('👉 点击第4个【回复】按钮');
    const replyBtns = page.locator('a:has-text("回复"), button:has-text("回复")');
    if (await replyBtns.count() >= 4) {
      await replyBtns.nth(3).click();
    }
    await page.waitForTimeout(2000);

    // ==============================================
    // 5. 输入内容并提交回复
    // ==============================================
    console.log('✍️ 输入打卡内容：每日打卡签到');
    await page.locator('textarea').first().fill('每日打卡签到');
    await page.waitForTimeout(1000);

    console.log('🚀 提交回复');
    await page.click('input[value="参与/回复主题"], input[value="回复"], button:has-text("回复")', { timeout: 10000 });
    await page.waitForTimeout(4000);

    // ==============================================
    // 6. 回到任务页面领取奖励
    // ==============================================
    console.log('📌 返回任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('🎁 点击【领取奖励】');
    await page.click('a:has-text("领取奖励"), button:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
      console.log('ℹ️ 无需领取或已领取');
    });
    await page.waitForTimeout(3000);

    console.log('🎉 全部任务执行完成！');

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
  } finally {
    await browser.close();
  }
}

runTask();
