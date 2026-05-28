const { chromium } = require('playwright');

const TARGET_URL = 'https://i.pcbeta.com/home.php?mod=task';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCookies(cookieString) {
  try {
    return JSON.parse(cookieString);
  } catch (e) {
    console.log('Cookie JSON 解析失败，尝试解析字符串格式');
    return cookieString.split(';').map(item => {
      const [name, ...valueParts] = item.trim().split('=');
      return {
        name: name.trim(),
        value: valueParts.join('=').trim(),
        domain: '.pcbeta.com',
        path: '/'
      };
    }).filter(cookie => cookie.name && cookie.value);
  }
}

async function runTask(retryCount = 0) {
  console.log(`========================================`);
  console.log(`[${new Date().toISOString()}] 开始执行 PCBeta 任务`);
  console.log(`重试次数: ${retryCount}/${MAX_RETRIES}`);
  console.log(`========================================`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  try {
    // 注入 Cookie
    const cookiesString = process.env.PC_BETA_COOKIES;
    if (!cookiesString) {
      throw new Error('未配置 PC_BETA_COOKIES 环境变量，请在 GitHub Secrets 中设置');
    }

    const cookies = parseCookies(cookiesString);
    console.log(`解析到 ${cookies.length} 个 Cookie`);
    
    await context.addCookies(cookies);
    console.log('Cookie 已注入');

    const page = await context.newPage();

    // 启用控制台日志
    page.on('console', msg => {
      console.log(`[页面日志] ${msg.type()}: ${msg.text()}`);
    });

    // 访问目标页面
    console.log(`正在访问: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    console.log(`页面加载完成，标题: ${await page.title()}`);
    console.log(`当前 URL: ${page.url()}`);

    // 检查是否已登录
    const pageContent = await page.content();
    if (pageContent.includes('登录') && pageContent.includes('注册')) {
      console.log('警告：页面检测到登录按钮，Cookie 可能已失效！');
    } else {
      console.log('登录状态验证通过');
    }

    // 等待任务按钮出现
    console.log('正在查找任务按钮...');
    
    // 选择器：class="taskbtn" 且 href 包含 task&do=apply
    const buttonSelector = 'a.taskbtn[href*="task&do=apply"]';
    
    try {
      await page.waitForSelector(buttonSelector, { timeout: 10000 });
      console.log('找到"立即申请"按钮');
    } catch (e) {
      console.log('未找到标准选择器的按钮，尝试仅通过 class 查找...');
      await page.waitForSelector('a.taskbtn', { timeout: 10000 });
      console.log('通过 class 找到任务按钮');
    }

    // 获取所有任务按钮
    const buttons = await page.$$('a.taskbtn');
    console.log(`找到 ${buttons.length} 个任务按钮`);

    // 遍历按钮并点击
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const href = await button.getAttribute('href');
      const text = await button.textContent();
      
      console.log(`按钮 ${i + 1}: 文本="${text.trim()}", href=${href}`);
      
      if (href && href.includes('task&do=apply')) {
        console.log(`正在点击按钮: ${text.trim()}`);
        
        // 点击按钮
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}),
          button.click({ force: true })
        ]);
        
        console.log('按钮点击完成');
        await sleep(2000);
        
        // 返回任务列表页
        if (!page.url().includes('mod=task')) {
          console.log('返回任务列表页');
          await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
        }
      }
    }

    console.log('========================================');
    console.log('任务执行完成！');
    console.log('========================================');

  } catch (error) {
    console.error('========================================');
    console.error('任务执行出错:', error.message);
    console.error('========================================');
    
    if (retryCount < MAX_RETRIES) {
      console.log(`${RETRY_DELAY / 1000}秒后进行第 ${retryCount + 1} 次重试...`);
      await browser.close();
      await sleep(RETRY_DELAY);
      return runTask(retryCount + 1);
    } else {
      console.log('已达最大重试次数，任务失败');
      // 保存失败截图和追踪
      if (context.pages().length > 0) {
        const page = context.pages()[0];
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        await context.trace({ path: 'trace.zip' });
      }
      throw error;
    }
  } finally {
    await browser.close();
  }
}

// 执行任务
runTask().catch(error => {
  console.error('程序异常退出:', error);
  process.exit(1);
});
