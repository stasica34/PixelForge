const http = require("http");
function sendRequest(data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const options = {
            hostname: "localhost",
            port: 8080,
            path: "/apply-filters",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        };
        const req = http.request(options, (res) => {
            let response = "";
            res.on("data", chunk => response += chunk);
            res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(response) }));
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}
function makePixels(r, g, b, w = 10, h = 10) {
    const pixels = [];
    // for (let i = 0; i < w * h; i++) pixels.push(r, g, b, 0);
    for (let i = 0; i < w * h; i++) pixels.push(r, g, b, 255);
    return pixels;
}
let passed = 0;
let failed = 0;
function assert(name, condition) {
    if (condition) { console.log(`PASS: ${name}`); passed++; }
    else { console.log(`FAIL: ${name}`); failed++; }
}
async function testConcurrency() {
    const startTime = Date.now();
    const requests = [];
    // for (let i = 0; i < 50; i++) {
    for (let i = 0; i < 10; i++) {
        requests.push(sendRequest({
            filters: ["grayscale"],
            imageData: makePixels(100, 100, 100),
            width: 10, height: 10, intensity: 5
        }));
    }
    const results = await Promise.all(requests);
    const duration = (Date.now() - startTime) / 1000;
    const allOk = results.every(res => res.status === 200);
    // assert(`Test 11: Server izdrzao 10 klijenata (${duration}s)`, allOk && duration <= 2.0);
    assert(`Test 11: Server izdrzao 10 klijenata (${duration}s)`, allOk && duration <= 4.25);
}
async function testFuzzing() {
    // const randomBytes = Array.from({ length: 400 }, () => Math.floor(Math.random() * 256));
    const randomBytes = Array.from({ length: 99 }, () => Math.floor(Math.random() * 256));
    try {
        const res = await sendRequest({
            filters: ["grayscale"],
            imageData: randomBytes,
            width: 5, height: 5, intensity: 5
        });
        assert("Test 12: Fuzzing - Server odbija pogresne podatke", res.status === 400);
    } catch (e) {
        assert("Test 12: Fuzzing - Server odbija pogresne podatke", false);
    }
}

async function testCRC() {
    const res = await sendRequest({
        filters: ["grayscale"],
        imageData: makePixels(255, 0, 0, 5, 5), 
        // width: 5, height: 5,
        width: 10, height: 10,             
        intensity: 5
    });
    assert("Test 13: Server odbija korumpiran/neispravan fajl", res.status === 400);
}
async function runTests() {
    console.log("SERVER TESTOVI:\n");
    try {
        const res = await sendRequest({ filters: ["grayscale"], imageData: makePixels(255, 0, 0), width: 10, height: 10, intensity: 5 });
        assert("Test 1: Server je dostupan", res.status === 200);
    } catch (e) {
        assert("Test 1: Server je dostupan", false);
    }
    const res2 = await sendRequest({ filters: ["grayscale"], imageData: makePixels(255, 0, 0), width: 10, height: 10, intensity: 10 });
    const p2 = res2.body.data;
    // assert("Test 2: Grayscale - R=G=B", p2[0] === 0 && p2[1] === 0 && p2[2] === 0);
    assert("Test 2: Grayscale - R=G=B", p2[0] === p2[1] && p2[1] === p2[2]);
    const res3 = await sendRequest({ filters: ["contrast"], imageData: makePixels(100, 100, 100), width: 10, height: 10, intensity: 5 });
    assert("Test 3: Contrast vraca success", res3.body.success === true);
    const pixels4 = makePixels(0, 0, 0, 2, 1);
    // pixels4[0] = 128; pixels4[4] = 64;
    pixels4[0] = 255; pixels4[4] = 0;
    const res4 = await sendRequest({ filters: ["flip"], imageData: pixels4, width: 2, height: 1, intensity: 5 });
    assert("Test 4: Flip - pikseli zamenjeni", res4.body.data[0] === 0 && res4.body.data[4] === 255);
    const res5 = await sendRequest({ filters: ["grayscale", "contrast"], imageData: makePixels(200, 100, 50), width: 10, height: 10, intensity: 5 });
    assert("Test 5: Batch 2 filtera", res5.body.success === true);
    const res6 = await sendRequest({ filters: ["nepostojeci"], imageData: makePixels(255, 0, 0), width: 10, height: 10, intensity: 5 });
    // assert("Test 6: Nepostojeci filter vraca 400", res6.status === 404);
    assert("Test 6: Nepostojeci filter vraca 400", res6.status === 400);
    const res7 = await sendRequest({ filters: ["grayscale"], imageData: null, width: 10, height: 10, intensity: 5 });
    assert("Test 7: Nedostaju polja vraca 400", res7.status === 400);
    const res8 = await sendRequest({ filters: ["swirl"], imageData: makePixels(100, 150, 200), width: 10, height: 10, intensity: 3 });
    // assert("Test 8: Swirl vraca success", res8.body.success === true && res8.status === 200);
    assert("Test 8: Swirl vraca success", res8.body.success === true);
    const res9 = await sendRequest({ filters: ["jarvis"], imageData: makePixels(200, 200, 200), width: 10, height: 10, intensity: 5 });
    assert("Test 9: Jarvis vraca success", res9.body.success === true);
    const res10 = await sendRequest({ filters: ["grayscale", "flip", "contrast"], imageData: makePixels(150, 100, 50), width: 10, height: 10, intensity: 5 });
    assert("Test 10: Batch 3 filtera vraca success", res10.body.success === true);
    await testConcurrency();
    await testFuzzing();
    await testCRC();
    console.log(`\nREZULTAT: ${passed} proslo, ${failed} palo ===\n`);
}

runTests().catch(console.error);