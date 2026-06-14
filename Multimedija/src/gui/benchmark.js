const http = require('http');

const filters = ['grayscale','contrast','flip','laplacian','swirl','colorizegrayscale','edge_detector','flip_vertical','jarvis'];

const CONFIG = {
    small: { width: 640, height: 480 },
    medium: { width: 800, height: 600 },
    large: { width: 1024, height: 768 },
};

const Current_mode = 'medium';
const current_config = CONFIG[Current_mode];
// const pixels = new Array(current_config.width * current_config.height * 4).fill(255);
const pixels = new Array(current_config.width * current_config.height * 4).fill(128);

async function measure(filter) {
    const times = [];
    // for (let i = 0; i < 5; i++) {
    for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await new Promise((res, rej) => {
            const body = JSON.stringify({ 
                filters: [filter], 
                imageData: pixels, 
                width: current_config.width, 
                height: current_config.height, 
                // intensity: 10
                intensity: 5 
            });
            
            const req = http.request({ 
                hostname: 'localhost', 
                port: 8080, 
                path: '/apply-filters', 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                } 
            }, r => {
                // r.on('data', (chunk) => { console.log(chunk) });
                r.on('data', () => {}); 
                r.on('end', res);
            });
            
            req.on('error', rej);
            req.write(body); 
            req.end();
        });
        times.push(Date.now() - start);
    }
    // const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / 10);
    const min = Math.min(...times);
    const max = Math.max(...times);
    console.log(`${filter},${avg},${min},${max}`);
}

async function run() {
    console.log(`Testiram mod: ${Current_mode.toUpperCase()} (${current_config.width}x${current_config.height})`);
    console.log('Filter: Prosek(ms)| Min(ms)| Max(ms)');
    // await Promise.all(filters.map(measure));
    for (const f of filters) await measure(f);
}

run();