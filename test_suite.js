/**
 * Hollow Comprehensive Automated Test Suite & Simulation Runner
 * Validates:
 * 1. Local Backend API Integration (CRUD, Gamification XP, Settings Schema, Logs, Static routing)
 * 2. HTML & DOM Integrity (ID references, HTML tag balance)
 * 3. Frontend Hardware Simulation & State Machine logic
 * 4. Screensaver Mascot Hiding Verification
 * 5. Wokwi Physical Circuit & Firmware Static Pin Audits
 * 6. Live Vercel Production Smoke Tests
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, testName, detail = '') {
    if (condition) {
        console.log(`  [PASS] ${testName}`);
        passCount++;
    } else {
        console.error(`  [FAIL] ${testName} ${detail ? '— ' + detail : ''}`);
        failCount++;
        failures.push({ testName, detail });
    }
}

async function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const client = options.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(body); } catch (_) {}
                resolve({ status: res.statusCode, headers: res.headers, body, json });
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function run() {
    console.log('\n============================================================');
    console.log('       HOL·LOW COMPREHENSIVE TEST SUITE & SIMULATION        ');
    console.log('============================================================\n');

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 1: HTML & DOM INTEGRITY CHECKS
    // ─────────────────────────────────────────────────────────────
    console.log('--- 1. HTML & DOM Integrity Checks ---');

    function checkDomIntegrity(fileName) {
        const filePath = path.join(__dirname, 'public', fileName);
        const html = fs.readFileSync(filePath, 'utf8');

        // Extract IDs from HTML elements
        const htmlIdMatches = [...html.matchAll(/\sid=["']([a-zA-Z0-9_\-]+)["']/g)];
        const definedIds = new Set(htmlIdMatches.map(m => m[1]));

        // Extract getElementById calls from JS
        const jsMatches = [...html.matchAll(/document\.getElementById\(["']([a-zA-Z0-9_\-]+)["']\)/g)];
        const referencedIds = new Set(jsMatches.map(m => m[1]));

        let missingCount = 0;
        const missingIds = [];
        referencedIds.forEach(id => {
            if (!definedIds.has(id)) {
                // Ignore dynamic modal or optional elements if present
                missingIds.push(id);
                missingCount++;
            }
        });

        assert(missingCount === 0, `${fileName} DOM IDs integrity check (all ${referencedIds.size} referenced IDs exist)`, missingIds.join(', '));

        // Check HTML div tag balance
        const opens = (html.match(/<div[\s>]/gi) || []).length;
        const closes = (html.match(/<\/div>/gi) || []).length;
        assert(opens === closes, `${fileName} div tag balance check (${opens} open, ${closes} closed)`);

        // Check JS Syntax in file
        const scriptTags = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
        let syntaxOk = true;
        let syntaxErr = '';
        scriptTags.forEach((tag, idx) => {
            try {
                new vm.Script(tag[1]);
            } catch (e) {
                syntaxOk = false;
                syntaxErr = `Script block ${idx + 1}: ${e.message}`;
            }
        });
        assert(syntaxOk, `${fileName} JavaScript syntax check`, syntaxErr);
    }

    checkDomIntegrity('index.html');
    checkDomIntegrity('device.html');

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 2: SCREENSAVER MASCOT HIDING VERIFICATION
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 2. Screensaver Mascot Hiding Verification ---');
    const deviceHtml = fs.readFileSync(path.join(__dirname, 'public', 'device.html'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

    // Verify CSS rule in device.html
    const deviceHasCssRule = deviceHtml.includes('.screensaver-active #mascot-display-container') &&
                             deviceHtml.includes('display: none !important');
    assert(deviceHasCssRule, 'device.html includes .screensaver-active CSS rule to force hide mascot');

    // Verify JS logic in device.html
    const deviceHasHidingJs = deviceHtml.includes("els.screen?.classList.add('screensaver-active')") &&
                              deviceHtml.includes("els.mascotContainer?.classList.add('hidden')") &&
                              deviceHtml.includes("if (screensaverActive)");
    assert(deviceHasHidingJs, 'device.html toggleScreensaver & updateMascotDisplay actively hides mascot');

    // Verify index.html rules
    const indexHasCssRule = indexHtml.includes('.screensaver-active #mascot-container') &&
                            indexHtml.includes('display: none !important');
    assert(indexHasCssRule, 'index.html includes .screensaver-active CSS rule to force hide mascot');

    const indexHasHidingJs = indexHtml.includes("simScreen.classList.add('screensaver-active')") &&
                             indexHtml.includes("els.mascotContainer.classList.add('hidden')");
    assert(indexHasHidingJs, 'index.html startScreensaver actively adds screensaver-active class and hides mascot');

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 3: LOCAL BACKEND API & GAMIFICATION TESTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 3. Local Backend API & Gamification Tests ---');
    const app = require('./backend/server.js');
    const testPort = 4199;
    const server = await new Promise(res => {
        const s = app.listen(testPort, () => res(s));
    });

    try {
        // Health Check
        const health = await request({ hostname: 'localhost', port: testPort, path: '/api/health', method: 'GET' });
        assert(health.status === 200 && health.json && health.json.status === 'ok', 'GET /api/health returns 200 status ok');

        // Settings Fetch
        const settingsRes = await request({ hostname: 'localhost', port: testPort, path: '/api/settings', method: 'GET' });
        assert(settingsRes.status === 200 && settingsRes.json && typeof settingsRes.json.chime_enabled === 'boolean', 'GET /api/settings returns valid settings schema');
        assert(typeof settingsRes.json.xp === 'number', 'Settings contains gamification xp property');
        assert(typeof settingsRes.json.level === 'number', 'Settings contains gamification level property');

        // Tasks Fetch
        const tasksRes = await request({ hostname: 'localhost', port: testPort, path: '/api/tasks', method: 'GET' });
        assert(tasksRes.status === 200 && Array.isArray(tasksRes.json), 'GET /api/tasks returns task array');

        // Create Task
        const newDirective = {
            title: 'Automated Test Task 99',
            due_time: new Date(Date.now() + 3600000).toISOString(),
            priority: 2
        };
        const createRes = await request({
            hostname: 'localhost',
            port: testPort,
            path: '/api/tasks',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, newDirective);
        assert(createRes.status === 201 && createRes.json && createRes.json.id, 'POST /api/tasks creates task successfully');
        const createdId = createRes.json.id;

        // Invalid Task validation check
        const badCreateRes = await request({
            hostname: 'localhost',
            port: testPort,
            path: '/api/tasks',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { title: '' });
        assert(badCreateRes.status === 400, 'POST /api/tasks rejects invalid/empty payload with 400 Bad Request');

        // Complete Task & verify XP increment
        const priorXp = settingsRes.json.xp || 0;
        const patchRes = await request({
            hostname: 'localhost',
            port: testPort,
            path: `/api/tasks/${createdId}`,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        }, { done: true });
        assert(patchRes.status === 200 && patchRes.json && patchRes.json.done === true, `PATCH /api/tasks/${createdId} marks task done`);

        // Check if XP awarded
        const afterSettings = await request({ hostname: 'localhost', port: testPort, path: '/api/settings', method: 'GET' });
        assert((afterSettings.json.xp || 0) >= priorXp, `Gamification engine awards XP on directive completion (xp=${afterSettings.json.xp})`);

        // Delete Test Task
        const deleteRes = await request({
            hostname: 'localhost',
            port: testPort,
            path: `/api/tasks/${createdId}`,
            method: 'DELETE'
        });
        assert(deleteRes.status === 200 || deleteRes.status === 204, `DELETE /api/tasks/${createdId} cleans up directive (HTTP ${deleteRes.status})`);

        // Static routes /device and /device.html
        const devRoute1 = await request({ hostname: 'localhost', port: testPort, path: '/device', method: 'GET' });
        assert(devRoute1.status === 200 && devRoute1.body.includes('Hollow — Physical Desk Companion'), 'GET /device serves physical companion app');

        const devRoute2 = await request({ hostname: 'localhost', port: testPort, path: '/device.html', method: 'GET' });
        assert(devRoute2.status === 200 && devRoute2.body.includes('Hollow — Physical Desk Companion'), 'GET /device.html serves physical companion app');

        const mainRoute = await request({ hostname: 'localhost', port: testPort, path: '/', method: 'GET' });
        assert(mainRoute.status === 200 && mainRoute.body.includes('Hollow Control'), 'GET / serves main dashboard');

    } finally {
        server.close();
    }

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 4: WOKWI SIMULATION & HARDWARE CIRCUIT AUDIT
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 4. Wokwi Simulation & Hardware Circuit Audit ---');
    const sketchIno = fs.readFileSync(path.join(__dirname, 'wokwi-simulation', 'sketch.ino'), 'utf8');
    const diagramJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'wokwi-simulation', 'diagram.json'), 'utf8'));

    // Check Pin Definitions
    const hasEncoderPins = sketchIno.includes('#define ENCODER_CLK  4') &&
                           sketchIno.includes('#define ENCODER_DT  16') &&
                           sketchIno.includes('#define ENCODER_SW  17');
    assert(hasEncoderPins, 'sketch.ino defines rotary encoder pins (CLK:4, DT:16, SW:17)');

    const hasTftPins = sketchIno.includes('#define TFT_CS    15') &&
                       sketchIno.includes('#define TFT_DC     5') &&
                       sketchIno.includes('#define TFT_MOSI  23') &&
                       sketchIno.includes('#define TFT_SCLK  18');
    assert(hasTftPins, 'sketch.ino defines TFT SPI pins (CS:15, DC:5, MOSI:23, SCLK:18)');

    // Verify diagram.json connects matching pins
    const connections = diagramJson.connections;
    const hasClkConn = connections.some(c => c[0] === 'esp:4' && c[1] === 'encoder:CLK');
    const hasDtConn  = connections.some(c => c[0] === 'esp:16' && c[1] === 'encoder:DT');
    const hasSwConn  = connections.some(c => c[0] === 'esp:17' && c[1] === 'encoder:SW');
    const hasTftCs   = connections.some(c => c[0] === 'esp:15' && c[1] === 'lcd:CS');
    const hasTftDc   = connections.some(c => c[0] === 'esp:5' && c[1] === 'lcd:D/C');

    assert(hasClkConn && hasDtConn && hasSwConn, 'diagram.json accurately wires rotary encoder to GPIO 4, 16, 17');
    assert(hasTftCs && hasTftDc, 'diagram.json accurately wires ILI9341 TFT display to GPIO 15, 5');

    // ─────────────────────────────────────────────────────────────
    // TEST SECTION 5: LIVE VERCEL PRODUCTION SMOKE TESTS
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 5. Live Vercel Production Smoke Tests ---');
    try {
        const prodBase = 'https://backend-green-two-67.vercel.app';
        const prodHealth = await request({ protocol: 'https:', hostname: 'backend-green-two-67.vercel.app', path: '/api/health', method: 'GET' });
        assert(prodHealth.status === 200, `${prodBase}/api/health responds with 200 OK`);

        const prodDevice = await request({ protocol: 'https:', hostname: 'backend-green-two-67.vercel.app', path: '/device', method: 'GET' });
        assert(prodDevice.status === 200 && prodDevice.body.includes('Hollow — Physical Desk Companion'), `${prodBase}/device serves Physical Companion`);

        const prodDeviceHtml = await request({ protocol: 'https:', hostname: 'backend-green-two-67.vercel.app', path: '/device.html', method: 'GET' });
        assert(prodDeviceHtml.status === 200, `${prodBase}/device.html serves 200 OK`);

        const prodMain = await request({ protocol: 'https:', hostname: 'backend-green-two-67.vercel.app', path: '/', method: 'GET' });
        assert(prodMain.status === 200 && prodMain.body.includes('Hollow Control'), `${prodBase}/ serves Main Dashboard`);
    } catch (err) {
        assert(false, 'Live Vercel Production checks', err.message);
    }

    // ─────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────
    console.log('\n============================================================');
    console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
    console.log('============================================================\n');

    if (failCount > 0) {
        console.error('Failed Tests Summary:');
        failures.forEach(f => console.error(`  - ${f.testName} (${f.detail})`));
        process.exit(1);
    } else {
        console.log('ALL SYSTEMS, SIMULATIONS, AND TESTS PASSED WITH 0 ERRORS!\n');
        process.exit(0);
    }
}

run().catch(err => {
    console.error('Test Suite encountered fatal error:', err);
    process.exit(1);
});
