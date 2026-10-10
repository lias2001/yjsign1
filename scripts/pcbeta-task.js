const { chromium } = require('playwright');
const fs = require('fs');

let snapCounter = 1;

async function screenshotWithMouseMarker(page, targetX, targetY) {
    try {
        console.log(`[DEBUG] 进入截图函数，截图序号=${snapCounter}`);
        // 清除旧红点
        await page.evaluate(() => {
            const oldDot = document.getElementById('__mouse_red_dot');
            if (oldDot) oldDot.remove();
        });

        await page.mouse.move(targetX, targetY);
        const x = Math.round(targetX);
        const y = Math.round(targetY);
        const fileName = `第${snapCounter}次截图_X_${x}_Y_${y}.png`;
        snapCounter++;

        // 绘制红点
        await page.evaluate((mx, my) => {
            const dot = document.createElement('div');
            dot.id = '__mouse_red_dot';
            dot.style.position = 'fixed';
            dot.style.left = `${mx - 8}px`;
            dot.style.top = `${my - 8}px`;
            dot.style.width = '16px';
            dot.style.height = '16px';
            dot.style.borderRadius = '50%';
            dot.style.backgroundColor = 'red';
            dot.style.zIndex = '99999999';
            dot.style.pointerEvents = 'none';
            document.body.appendChild(dot);
        }, x, y);

        await page.waitForTimeout(300);
        await page.screenshot({ path: fileName, fullPage: false });
        console.log(`📸 截图保存成功：${fileName}`);

        await page.evaluate(() => {
            const dot = document.getElementById('__mouse_red_dot');
            if (dot) dot.remove();
        });
    } catch (err) {
        console.error('[截图函数异常]', err.message);
    }
}

async function runTask() {
    try {
        const fileList = fs.readdirSync('.');
        const oldPng = fileList.filter(name => name.startsWith('第') && name.endsWith('.png'));
        for (const f of oldPng) fs.unlinkSync(f);
        if(oldPng.length>0) console.log(`🧹 清理历史截图，共${oldPng.length}张`);
    } catch (e) {
        console.log('ℹ️ 无历史截图可清理');
    }

    console.log('✅ 开始执行任务');
    const cookieEnv = process.env.PC_BETA_COOKIES;
    if (!cookieEnv) {
        console.error('❌ 环境变量 PC_BETA_COOKIES 未配置');
        process.exit(1);
    }
    let cookies = [];
    try {
        const parsedCookie = JSON.parse(cookieEnv);
        cookies = parsedCookie.cookies || parsedCookie;
    } catch (err) {
        console.error('❌ Cookie解析失败');
        process.exit(1);
    }

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=2560,10055'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 2560, height: 10055 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    });
    await context.addCookies(cookies);
    const page = await context.newPage();

    try {
        console.log('🌐 打开任务页面 https://i.pcbeta.com/home.php?mod=task&item=new');
        await page.goto('https://i.pcbeta.com/home.php?mod=task&item=new', {
            timeout: 60000,
            waitUntil: 'networkidle'
        });
        await page.waitForTimeout(3000);

        // 找到打卡帖子链接
        const postLink = page.locator('a:has-text("打卡专用")').first();
        await postLink.waitFor({timeout:15000, state:'visible'});
        console.log('✅ 找到打卡帖子链接，点击进入帖子详情页');
        await postLink.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(4000);

        // 定位p.xg2
        const targetLocator = page.locator('p.xg2:has-text("打卡专用")').first();
        await targetLocator.waitFor({ timeout: 15000, state: 'visible' });
        const box = await targetLocator.boundingBox();
        if (!box) throw new Error('无法获取元素包围盒坐标');
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;
        console.log(`✅ 识别到【打卡专用】文本，元素中心点坐标：X=${targetX.toFixed(2)} Y=${targetY.toFixed(2)}`);

        await screenshotWithMouseMarker(page, targetX, targetY);

    } catch (globalErr) {
        console.error('❌ 任务全局异常：', globalErr.message);
        try {
            await screenshotWithMouseMarker(page,1280,5027);
        } catch(e){}
    } finally {
        await browser.close();
        console.log('✅ 浏览器关闭，任务结束');
    }
}

runTask();
