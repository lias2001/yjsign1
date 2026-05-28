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

    // ==============================================
    // 🔥 终极修复：确保一定点到第2个【打卡专用】
    // ==============================================
    console.log('👉 开始定位第2个【打卡专用】...');
    
    // 等待链接出现
    const dakaTarget = page.locator('a:has-text("打卡专用")').nth(1);
    await dakaTarget.waitFor({ state: 'visible', timeout: 10000 });
    
    // 滚动到元素位置
    await dakaTarget.scrollIntoViewIfNeeded();
    
    // 强制点击
    await dakaTarget.click({ force: true, timeout: 10000 });
    
    // 等待页面跳转
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    
    console.log('🌐 已进入打卡帖子页面URL:', page.url());
    // ==============================================

    // 4. 点击第4个【回复】
    console.log('👉 点击第4个【回复】按钮');
    const replyBtns = page.locator('a:has-text("回复"), button:has-text("回复")');
    await replyBtns.nth(3).waitFor({ state: 'visible', timeout: 10000 });
    await replyBtns.nth(3).click({ force: true });
    await page.waitForTimeout(3000);

    // 5. 弹窗回复
    console.log('✅ 等待回复弹窗');
    await page.waitForSelector('.dialog', { timeout: 15000 });
    
    console.log('✍️ 输入打卡内容');
    await page.locator('.dialog textarea').fill('每日打卡签到');
    await page.waitForTimeout(1500);

    console.log('🚀 提交回复');
    await page.click('.dialog input[value="参与/回复主题"]', { force: true });
    await page.waitForTimeout(5000);

    // 6. 返回任务页领取奖励
    console.log('📌 返回任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
    await page.waitForTimeout(2000);
    console.log('🌐 返回后URL:', page.url());

    console.log('🎁 点击【领取奖励】');
    await page.click('a:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
      console.log('ℹ️ 奖励已领取');
    });

    console.log('🎉 全部任务执行完成！');

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
  } finally {
    await browser.close();
  }
}

runTask();
