"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const PORT = 8080;
const allowedFilters = ["grayscale", "contrast", "flip", "laplacian", "swirl", "colorizegrayscale", "edge_detector", "flip_vertical", "jarvis"];
// const logStream = fs.createWriteStream("server.log", { flags: "w" });
const logStream = fs.createWriteStream("server.log", { flags: "a" });
const sessionCache = new Map();
const SESSION_TTL = 10 * 60 * 1000;
// const logStream = fs.createWriteStream("server.log", { flags: "w" });


function logToFile(message) {
    console.log(message);
    logStream.write(message + "\n");
}

setInterval(() => {
    const now = Date.now();
    for (const [id, data] of sessionCache.entries()) {
        if (now - data.lastUsed > SESSION_TTL) {
            sessionCache.delete(id);
            logToFile(`[INFO] Session cache expired: ${id}`);
        }
    }
}, 60 * 1000);

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    // res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.method === "POST" && req.url === "/apply-filters") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            const requestTime = new Date().toISOString();
            // if (body.length > 5 * 1024 * 1024)
            if (body.length > 20 * 1024 * 1024) {
                logToFile(`[ERROR] ${requestTime} | Fajl prevelik: ${body.length} B`);
                res.writeHead(413);
                res.end(JSON.stringify({ success: false, error: "Fajl je prevelik (max 20MB)" }));
                return;
            }
            let parsed;
            try {
                parsed = JSON.parse(body);
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: "Neispravan JSON" }));
                return;
            }
            const { filters, imageData, width, height, intensity, sessionId } = parsed;
            let pixels;
            if (sessionId && !imageData && sessionCache.has(sessionId)) {
                const cached = sessionCache.get(sessionId);
                pixels = Buffer.from(cached.pixels);
                logToFile(`[INFO] ${requestTime} | Session cache hit: ${sessionId}`);
            } else {
                if (!filters || !imageData || !Array.isArray(imageData) || !width || !height) {
                    logToFile(`[ERROR] ${requestTime} | Nedostaju obavezna polja`);
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "Nedostaju obavezna polja" }));
                    return;
                }
                // const expectedSize = width * height * 3;
                const expectedSize = width * height * 4;
                if (imageData.length !== expectedSize) {
                    logToFile(`[ERROR] ${requestTime} | Image data size mismatch: ocekivano ${expectedSize}, dobijeno ${imageData.length}`);
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "Image data size mismatch" }));
                    return;
                }
                pixels = Buffer.from(imageData);
            }
            for (const filter of filters) {
                if (!allowedFilters.includes(filter)) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: `Nepoznat filter: ${filter}` }));
                    return;
                }
            }
            const startTime = Date.now();
            const { filterIntensities } = parsed;
            const worker = new Worker(path.join(__dirname, "worker.js"), {
                workerData: {
                    filters,
                    // imageData: pixels,
                    imageData: Array.from(pixels),
                    width,
                    height,
                    intensity,
                    filterIntensities
                }
            });
            worker.on("message", (result) => {
                if (!result.success) {
                    logToFile(`[ERROR] ${requestTime} | Worker grecka: ${result.error}`);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    // res.end(JSON.stringify({ success: true, data: result.data }));
                    res.end(JSON.stringify({ success: false, error: result.error }));
                    return;
                }

                const totalTime = Date.now() - startTime;
                if (filters && filters.length > 0) {
                logToFile(`[INFO] ${requestTime} | filteri: ${filters.join("+")} | vreme: ${totalTime}ms`);
                }

                if (sessionId && sessionId !== "ping") {
                    sessionCache.set(sessionId, { pixels: result.data, width, height, lastUsed: Date.now() });
                    logToFile(`[INFO] ${requestTime} | Session cache saved: ${sessionId}`);
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, data: result.data, processingTime: totalTime }));
            });
            worker.on("error", (err) => {
                logToFile(`[ERROR] ${requestTime} | Worker crash: ${err.message}`);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        });
    } else {
        // res.writeHead(405);
        res.writeHead(404);
        res.end();
    }
});
server.listen(PORT, () => {
    logToFile("[SERVER] Radi na http://localhost:" + PORT);
});