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

    // 1. 打开任务页面
    console.log('📌 打开任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task', { timeout: 60000 });
    await page.waitForTimeout(2000);

    // 任务1：有立即申请就点，没有跳过
    const task1Btn = page.locator('a.taskbtn[href*="do=apply&id=149"]');
    if (await task1Btn.count() > 0) {
      console.log('👉 任务1：点击【立即申请】');
      await task1Btn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } else {
      console.log('ℹ️ 任务1：已完成，跳过');
    }

    // 2. 进入任务进行中
    console.log('📌 进入任务进行中页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
    await page.waitForTimeout(2000);

    // 3. 点击回帖打卡福利
    console.log('👉 任务2：点击【回帖打卡福利】');
    await page.click('a:has-text("回帖打卡福利")', { timeout: 10000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    console.log('🌐 任务2页面URL:', page.url());

    // 4. 定位第2个【加粗打卡专用】链接
    console.log('👉 定位第2个【加粗打卡专用】链接...');
    const dakaItems = page.locator('a:has(strong:has-text("打卡专用"))');
    const count = await dakaItems.count();
    console.log(`ℹ️ 页面找到打卡专用链接数量：${count}`);

    if (count >= 2) {
      const target = dakaItems.nth(1);
      await target.waitFor({ state: 'visible', timeout: 10000 });
      await target.scrollIntoViewIfNeeded();
      await target.click({ force: true });
    } else {
      const target = dakaItems.first();
      await target.waitFor({ state: 'visible', timeout: 10000 });
      await target.scrollIntoViewIfNeeded();
      await target.click({ force: true });
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    console.log('🌐 已进入打卡帖子页面URL:', page.url());

    // ==============================================
    // ✅ 任务4、5：底部快速回复框（你给的HTML精准定位）
    // ==============================================
    console.log('👉 滚动到页面最底部');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // 输入框：#fastpostmessage
    console.log('✍️ 输入打卡内容：每日打卡签到');
    await page.locator('#fastpostmessage').fill('每日打卡签到');
    await page.waitForTimeout(1500);

    // 发表按钮：#fastpostsubmit
    console.log('🚀 点击【发表回复】');
    await page.locator('#fastpostsubmit').click({ force: true });
    await page.waitForTimeout(6000);

    // ==============================================
    // 6. 返回任务页领取奖励
    console.log('📌 返回任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
    await page.waitForTimeout(2000);
    console.log('🌐 返回后URL:', page.url());

    console.log('🎁 点击【领取奖励】');
    await page.click('a:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
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
