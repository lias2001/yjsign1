const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('✅ 开始执行任务');

    // 从环境变量读取cookie字符串
    const cookieRaw = process.env.PC_BETA_COOKIES;
    if (!cookieRaw) {
      throw new Error('环境变量 PC_BETA_COOKIES 为空，请检查仓库Secrets');
    }
    const cookies = JSON.parse(cookieRaw);

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();

    const taskUrl = 'https://i.pcbeta.com/home.php?mod=task&item=new';
    console.log('🌐 打开任务页面', taskUrl);
    await page.goto(taskUrl, { timeout: 30000 });

    // ===== 调试：打开页面立刻截图，排查登录状态 =====
    console.log('***DEBUG*** 页面加载完成，输出页面信息');
    console.log('当前URL:', page.url());
    console.log('页面标题:', await page.title());
    await page.screenshot({
      path: `debug_loaded_page.png`,
      fullPage: true
    });
    console.log('***DEBUG*** 已保存调试截图 debug_loaded_page.png');

    // 等待【打卡专用】链接，超时30秒
    const signLocator = page.locator('a:has-text("打卡专用")').first();
    console.log('⏳ 等待打卡专用元素出现（30s超时）');
    await signLocator.waitFor({ timeout: 30000 });
    await signLocator.click();
    console.log('✅ 点击打卡专用链接成功');

    // 等待页面加载，可按需增加后续打卡逻辑
    await page.waitForTimeout(3000);

    // 任务完成截图
    await page.screenshot({
      path: `screenshot_success.png`,
      fullPage: true
    });
    console.log('✅ 任务执行成功，截图已保存');

  } catch (err) {
    console.log('❌ 任务全局异常：', err.message);
    // 异常时截图，修复截图传参
    if (browser) {
      try {
        const page = browser.contexts()[0]?.pages()[0];
        if (page) {
          console.log('***DEBUG*** 进入截图函数，截图序号=1');
          await page.screenshot({
            path: `screenshot_error_1.png`,
            fullPage: true
          });
          console.log('✅ 异常截图保存成功');
        }
      } catch (snapErr) {
        console.log('***截图函数异常***', snapErr.message);
      }
    }
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      console.log('✅ 浏览器关闭，任务结束');
    }
  }
})();
