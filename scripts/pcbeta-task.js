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
    // 🔥 执行 2 轮
    // ==============================================
    for (let round = 1; round <= 2; round++) {
      console.log(`\n========== 第 ${round} 轮开始 ==========`);

      // 1. 打开任务页面
      console.log('📌 打开任务页面');
      await page.goto('https://i.pcbeta.com/home.php?mod=task', { timeout: 60000 });
      await page.waitForTimeout(2000);

      // ==============================================
      // ✅ 任务1：兼容 id=1~1000 的所有立即申请
      // ==============================================
      const task1Btns = page.locator('a.taskbtn[href*="do=apply&id="]');
      const task1Count = await task1Btns.count();
      
      if (task1Count > 0) {
        console.log(`👉 任务1：找到 ${task1Count} 个【立即申请】，逐个点击`);
        for (let i = 0; i < task1Count; i++) {
          const btn = task1Btns.nth(i);
          const href = await btn.getAttribute('href') || '';
          console.log(`   第 ${i+1} 个：${href}`);
          await btn.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(1500);
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
      } else if (count >= 1) {
        const target = dakaItems.first();
        await target.waitFor({ state: 'visible', timeout: 10000 });
        await target.scrollIntoViewIfNeeded();
        await target.click({ force: true });
      } else {
        console.log('⚠️ 未找到打卡专用链接，跳过本轮');
        continue;
      }

      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(4000);
      console.log('🌐 已进入打卡帖子页面URL:', page.url());

      // 滚动到底部，快速回复
      console.log('👉 滚动到页面最底部');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);

      console.log('✍️ 输入打卡内容：每日打卡签到');
      await page.locator('#fastpostmessage').fill('每日打卡签到');
      await page.waitForTimeout(1500);

      console.log('🚀 点击【发表回复】');
      await page.locator('#fastpostsubmit').click({ force: true });
      await page.waitForTimeout(6000);

      // 返回任务页领取奖励
      console.log('📌 返回任务页面');
      await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing');
      await page.waitForTimeout(2000);
      console.log('🌐 返回后URL:', page.url());

      console.log('🎁 点击【领取奖励】');
      await page.click('a:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
        console.log('ℹ️ 奖励已领取或无需领取');
      });

      console.log(`✅ 第 ${round} 轮完成`);
      
      // 两轮之间休息一下
      if (round < 2) {
        console.log('⏳ 休息 3 秒后开始下一轮...');
        await page.waitForTimeout(3000);
      }
    }

    console.log('\n🎉 全部 2 轮任务执行完成！');

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
  } finally {
    await browser.close();
  }
}

runTask();
