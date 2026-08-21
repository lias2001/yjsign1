const { chromium } = require('playwright');
const fs = require('fs');

let snapCounter = 1;

async function screenshotWithMouseMarker(page) {
    await page.mouse.move(960, 540);
    const pos = await page.mouse.position();
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const filename = `snap_${String(snapCounter).padStart(3, '0')}.png`;
    snapCounter++;

    await page.evaluate((mx, my) => {
        const oldDot = document.getElementById('__mouse_red_dot');
        if (oldDot) oldDot.remove();
        const dot = document.createElement('div');
        dot.id = '__mouse_red_dot';
        dot.style.position = 'fixed';
        dot.style.left = `${mx - 8}px`;
        dot.style.top = `${my - 8}px`;
        dot.style.width = '16px';
        dot.style.height = '16px';
        dot.style.borderRadius = '50%';
        dot.style.backgroundColor = 'red';
        dot.style.zIndex = '999999';
        dot.style.pointerEvents = 'none';
        document.body.appendChild(dot);
    }, x, y);

    await page.waitForTimeout(300);
    await page.screenshot({ path: filename, fullPage: false });
    console.log(`📸 已保存截图: ${filename}`);

    await page.evaluate(() => {
        const d = document.getElementById('__mouse_red_dot');
        if (d) d?.remove();
    });
}

async function runTask() {
    snapCounter = 1;
    try {
        const allFiles = fs.readdirSync('.');
        const oldScreenshots = allFiles.filter(f => f.startsWith('snap_') && f.endsWith('.png'));
        for (const f of oldScreenshots) fs.unlinkSync(f);
        if (oldScreenshots.length > 0) console.log(`🧹 清理历史截图 ${oldScreenshots.length} 个`);
    } catch (e) { console.log('ℹ️ 无旧截图可清理'); }

    console.log('✅ 开始执行 PCBeta 每日打卡任务...');
    const cookieEnv = process.env.PC_BETA_COOKIES;
    if (!cookieEnv) {
        console.error('❌ 未设置 PC_BETA_COOKIES 环境变量 ');
        process.exit(1);
    }
    let cookies = [];
    try {
        const parsed = JSON.parse(cookieEnv);
        cookies = parsed.cookies || parsed;
    } catch (e) {
        console.error('❌ Cookie 解析失败 ');
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

        for (let round = 1; round <= 2; round++) {
            console.log(`\n========== 第 ${round} 轮开始 ==========`);
            console.log('📌 打开任务1页面 ');
            // waitUntil 等待网络空闲，处理302重定向
            await page.goto('https://i.pcbeta.com/home.php?mod=task&item=new', {
                timeout: 60000,
                waitUntil: 'networkidle'
            });
            // 【关键】页面加载完成立刻截图，放在sleep前面，就算发生重定向，先截图
            await screenshotWithMouseMarker(page);
            await page.waitForTimeout(8000);

            const task1Btns = page.locator('a.taskbtn[href*="do=apply&id="]');
            const task1Count = await task1Btns.count();
            if (task1Count > 0) {
                console.log(`👉 任务1：找到 ${task1Count} 个【立即申请】，逐个点击`);
                for (let i = 0; i < task1Count; i++) {
                    const btn = task1Btns.nth(i);
                    const href = await btn.getAttribute('href') || '';
                    console.log(`   第 ${i+1} 个：${href}`);
                    await btn.click({ timeout: 5000 }).catch(() => { });
                    await page.waitForTimeout(1500);
                }
            } else {
                console.log('ℹ️ 任务 1：全部已完成，跳过 ');
            }

            console.log('📌 进入任务进行中页面 ');
            await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing', {
                timeout: 60000,
                waitUntil: 'networkidle'
            });
            await page.waitForTimeout(3000);

            // 使用 getByText，忽略前后空白
            const linkLocator = page.getByText('回帖打卡福利', { exact: false });
            try {
                console.log('👉 等待【回帖打卡福利】元素');
                await linkLocator.waitFor({ timeout: 15000, state: 'visible' });
                console.log('👉 点击【回帖打卡福利】');
                await linkLocator.click({ timeout: 15000 });
            } catch(err) {
                // 找不到链接时也截图，保存现场，不直接崩溃退出整轮
                console.error('⚠️ 找不到【回帖打卡福利】链接，本轮继续，保存现场截图', err.message);
                await screenshotWithMouseMarker(page);
                continue;
            }

            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(4000);
            console.log('🌐 任务2页面 URL:', page.url());
            await screenshotWithMouseMarker(page);

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
                console.log('⚠️ 未找到打卡专用链接，跳过本轮 ');
                await screenshotWithMouseMarker(page);
                continue;
            }

            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(4000);
            console.log('🌐 已进入打卡帖子页面 URL:', page.url());

            console.log('👉 滚动到页面最底部 ');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);

            console.log('✍️ 输入打卡内容：每日打卡签到 ');
            await page.locator('#fastpostmessage').fill('每日打卡签到');
            await page.waitForTimeout(1500);

            console.log('🚀 点击【发表回复】');
            await page.locator('#fastpostsubmit').click({ force: true, timeout:10000 });
            await page.waitForTimeout(6000);

            console.log('📌 返回任务页面 ');
            await page.goto('https://i.pcbeta.com/home.php?mod=task&item=doing', {
                timeout:60000,
                waitUntil:'networkidle'
            });
            await page.waitForTimeout(2000);
            console.log('🌐 返回后 URL:', page.url());

            console.log('🎁 点击【领取奖励】');
            await page.click('a:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
                console.log('ℹ️ 奖励已领取或无需领取 ');
            });

            console.log(`✅ 第 ${round} 轮完成`);
            if (round < 2) {
                console.log('⏳ 休息 3 秒后开始下一轮...');
                await page.waitForTimeout(3000);
            }
        }
        console.log('\n🎉 全部 2 轮任务执行完成！');
    } catch (error) {
        console.error('❌ 执行失败:', error.message);
        // 全局异常也要尝试截图保存现场
        try { await screenshotWithMouseMarker(page); } catch(e) {}
    } finally {
        await browser.close();
    }
}
runTask();
