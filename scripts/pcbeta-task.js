const { chromium } = require('playwright');
const fs = require('fs');

let snapCounter = 1;

// 截图工具：自动清理旧红点，鼠标移动到指定坐标，输出【第n次截图_X_xx_Y_xx.png】
async function screenshotWithMouseMarker(page, targetX, targetY) {
    try {
        console.log(`[DEBUG] 进入截图函数 snapCounter=${snapCounter}`);
        // 清除页面上遗留的旧红点
        await page.evaluate(() => {
            const oldDot = document.getElementById('__mouse_red_dot');
            if (oldDot) oldDot.remove();
        });

        // 移动鼠标到目标坐标
        await page.mouse.move(targetX, targetY);
        const pos = await page.mouse.position();
        const x = Math.round(pos.x);
        const y = Math.round(pos.y);

        const filename = `第${snapCounter}次截图_X_${x}_Y_${y}.png`;
        snapCounter++;

        // 在鼠标位置绘制红点
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
            dot.style.zIndex = '999999';
            dot.style.pointerEvents = 'none';
            document.body.appendChild(dot);
        }, x, y);

        await page.waitForTimeout(300);
        await page.screenshot({ path: filename, fullPage: false });
        console.log(`📸 已保存截图: ${filename}`);

        // 截图完成移除红点
        await page.evaluate(() => {
            const d = document.getElementById('__mouse_red_dot');
            if (d) d?.remove();
        });
    } catch (err) {
        console.error('[截图函数异常]', err.message);
    }
}

async function runTask() {
    snapCounter = 1;
    // 清理旧截图
    try {
        const allFiles = fs.readdirSync('.');
        const oldScreenshots = allFiles.filter(f => f.startsWith('第') && f.endsWith('.png'));
        for (const f of oldScreenshots) fs.unlinkSync(f);
        if (oldScreenshots.length > 0) console.log(`🧹 清理历史截图 ${oldScreenshots.length} 个`);
    } catch (e) { console.log('ℹ️ 无旧截图可清理'); }

    console.log('✅ 开始执行 PCBeta 打卡任务...');
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
            '--window-size=2560,10055' // 新分辨率 2560 × 10055
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 2560, height: 10055 }, // 同步viewport
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    });
    await context.addCookies(cookies);

    let mainPage = await context.newPage();

    try {
        for (let round = 1; round <= 2; round++) {
            console.log(`\n========== 第 ${round} 轮开始 ==========`);
            console.log('📌 打开任务1页面（独立页面用于截图）');

            // 独立页面截图任务1页面
            const snapPage = await context.newPage();
            await snapPage.goto('https://i.pcbeta.com/home.php?mod=task&item=new', {
                timeout: 60000,
                waitUntil: 'domcontentloaded'
            });
            await snapPage.waitForTimeout(3000);
            // 默认鼠标放在页面中心
            await screenshotWithMouseMarker(snapPage, 1280, 5027);
            await snapPage.close();

            // 主页面业务流程
            await mainPage.goto('https://i.pcbeta.com/home.php?mod=task&item=new', {
                timeout: 60000,
                waitUntil: 'networkidle'
            });
            await mainPage.waitForTimeout(8000);

            const task1Btns = mainPage.locator('a.taskbtn[href*="do=apply&id="]');
            const task1Count = await task1Btns.count();
            if (task1Count > 0) {
                console.log(`👉 任务1：找到 ${task1Count} 个【立即申请】，逐个点击`);
                for (let i = 0; i < task1Count; i++) {
                    const btn = task1Btns.nth(i);
                    const href = await btn.getAttribute('href') || '';
                    console.log(`   第 ${i+1} 个：${href}`);
                    await btn.click({ timeout: 5000 }).catch(() => { });
                    await mainPage.waitForTimeout(1500);
                }
            } else {
                console.log('ℹ️ 任务 1：全部已完成，跳过 ');
            }

            console.log('📌 进入任务进行中页面 ');
            await mainPage.goto('https://i.pcbeta.com/home.php?mod=task&item=doing', {
                timeout: 60000,
                waitUntil: 'networkidle'
            });
            await mainPage.waitForTimeout(3000);
            await screenshotWithMouseMarker(mainPage,1280,5027);

            const linkLocator = mainPage.getByText('回帖打卡福利', { exact: false });
            try {
                console.log('👉 等待【回帖打卡福利】元素');
                await linkLocator.waitFor({ timeout: 15000, state: 'visible' });
                console.log('👉 点击【回帖打卡福利】');
                await linkLocator.click({ timeout: 15000 });
            } catch(err) {
                console.error('⚠️ 找不到【回帖打卡福利】链接，保存现场截图', err.message);
                await screenshotWithMouseMarker(mainPage,1280,5027);
                continue;
            }

            await mainPage.waitForLoadState('domcontentloaded');
            await mainPage.waitForTimeout(4000);
            console.log('🌐 任务2页面 URL:', mainPage.url());

            // ========== 新增：定位 <p class="xg2"> 打卡专用段落 ==========
            console.log('🔍 查找【打卡专用】段落元素 p.xg2');
            const dakaTextLocator = mainPage.locator('p.xg2:has-text("打卡专用")').first();
            try {
                await dakaTextLocator.waitFor({timeout:15000, state:'visible'});
                // 获取元素边界坐标
                const box = await dakaTextLocator.boundingBox();
                if(!box) throw new Error('无法获取元素boundingBox');
                // 取元素中心点坐标
                const elemCenterX = box.x + box.width / 2;
                const elemCenterY = box.y + box.height / 2;
                console.log(`✅【打卡专用】元素坐标：X=${elemCenterX.toFixed(2)}, Y=${elemCenterY.toFixed(2)}`);
                // 鼠标移动到该元素中心，带红点截图
                await screenshotWithMouseMarker(mainPage, elemCenterX, elemCenterY);
            }catch(err){
                console.error('⚠️ 未找到【打卡专用】段落，使用页面中心截图', err.message);
                await screenshotWithMouseMarker(mainPage,1280,5027);
            }
            // ======================================================

            const dakaItems = mainPage.locator('a:has(strong:has-text("打卡专用"))');
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
                await screenshotWithMouseMarker(mainPage,1280,5027);
                continue;
            }

            await mainPage.waitForLoadState('domcontentloaded');
            await mainPage.waitForTimeout(4000);
            console.log('🌐 已进入打卡帖子页面 URL:', mainPage.url());

            console.log('👉 滚动到页面最底部 ');
            await mainPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await mainPage.waitForTimeout(2000);

            console.log('✍️ 输入打卡内容：每日打卡签到 ');
            await mainPage.locator('#fastpostmessage').fill('每日打卡签到');
            await mainPage.waitForTimeout(1500);

            console.log('🚀 点击【发表回复】');
            await mainPage.locator('#fastpostsubmit').click({ force: true, timeout:10000 });
            await mainPage.waitForTimeout(6000);

            console.log('📌 返回任务页面 ');
            await mainPage.goto('https://i.pcbeta.com/home.php?mod=task&item=doing', {
                timeout:60000,
                waitUntil:'networkidle'
            });
            await mainPage.waitForTimeout(2000);
            console.log('🌐 返回后 URL:', mainPage.url());

            console.log('🎁 点击【领取奖励】');
            await mainPage.click('a:has-text("领取奖励")', { timeout: 10000 }).catch(() => {
                console.log('ℹ️ 奖励已领取或无需领取 ');
            });

            console.log(`✅ 第 ${round} 轮完成`);
            if (round < 2) {
                console.log('⏳ 休息 3 秒后开始下一轮...');
                await mainPage.waitForTimeout(3000);
            }
        }
        console.log('\n🎉 全部 2 轮任务执行完成！');
    } catch (error) {
        console.error('❌ 顶层捕获执行失败:', error.message);
        try { await screenshotWithMouseMarker(mainPage,1280,5027); } catch(e) {console.error('兜底截图失败',e);}
    } finally {
        await browser.close();
    }
}
runTask();
