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

    // 1. 任务首页
    console.log('📌 打开任务页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task', { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 任务1：有“立即申请”就点，没有就跳过
    const task1Btn = page.locator('a.taskbtn[href*="do=apply&id=149"]');
    if (await task1Btn.count() > 0) {
      console.log('👉 任务1：找到【立即申请】，点击');
      await task1Btn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } else {
      console.log('ℹ️ 任务1：已申请过，跳过');
    }

    // 2. 进入进行中任务
    console.log('📌 进入任务进行中页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
    await page.waitForTimeout(2000);

    // ---------- 任务2：点击【回帖打卡福利】并打印URL ----------
    console.log('👉 任务2：点击【回帖打卡福利】');
    await page.click('a:has-text("回帖打卡福利")');
    await page.waitForTimeout(3000);
    console.log('🌐 任务2跳转后URL:', page.url()); // 打印跳转后的网址

    // 第2个打卡专用
    console.log('👉 点击第2个【打卡专用】');
    const dakaList = page.locator('a:has-text("打卡专用")');
    if (await dakaList.count() >= 2) {
      await dakaList.nth(1).click();
    }
    await page.waitForTimeout(4000);
    console.log('🌐 进入打卡专用页URL:', page.url()); // 打印打卡帖URL

    // 第4个回复按钮（弹出窗口）
    console.log('👉 点击第4个【回复】按钮（打开弹窗）');
    const replyBtns = page.locator('a:has-text("回复")');
    if (await replyBtns.count() >= 4) {
      await replyBtns.nth(3).click();
    }
    await page.waitForTimeout(3000);

    // 回复弹窗（精准定位 .dialog）
    console.log('✅ 等待回复弹窗出现');
    await page.waitForSelector('.dialog', { timeout: 10000 });
    const dialogTextarea = page.locator('.dialog textarea');
    await dialogTextarea.waitFor({ state: 'visible', timeout: 10000 });

    console.log('✍️ 输入：每日打卡签到');
    await dialogTextarea.fill('每日打卡签到');
    await page.waitForTimeout(1500);

    console.log('🚀 点击【参与/回复主题】');
    const dialogSubmit = page.locator('.dialog input[value="参与/回复主题"]');
    await dialogSubmit.click();
    await page.waitForTimeout(5000);
    // -------------------------------------------------------------------

    // ---------- 任务3：返回任务页、点击领取奖励并打印URL ----------
    console.log('📌 返回任务进行中页面');
    await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
    await page.waitForTimeout(2000);
    console.log('🌐 任务3当前页面URL:', page.url()); // 打印任务页URL

    console.log('🎁 任务3：点击【领取奖励】');
    await page.click('a:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
      console.log('ℹ️ 奖励已领取或不存在');
    });
    await page.waitForTimeout(2000);
    console.log('🌐 领取奖励后URL:', page.url()); // 打印领奖后URL

    console.log('🎉 全部任务执行完成！');

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
  } finally {
    await browser.close();
  }
}

runTask();
