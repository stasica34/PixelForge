"use strict";
const { ipcRenderer } = require("electron");
const Swal = require("sweetalert2");
const { parseGIF, decompressFrames } = require('gifuct-js');
// UI Elements
const logElement = document.getElementById("log");
const chooseFileButton = document.getElementById("chooseFile");
const chooseFileText = document.getElementById("chooseFileText");
const clearDirsBtn = document.getElementById("clearDirs");
const resetView = document.getElementById("resetView");
const recentList = document.getElementById('recentList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const STORAGE_KEY = 'crypto_history';
const CURRENT_USER = "Staša Kostić 19184";
const redoBtn = document.getElementById("selectRedodDir");
const filterIntensities = {};
const MAX_UNDO = 3;
const saveMsiBtn = document.getElementById("saveAsMSI");
const compressionSelect = document.getElementById("msiCompressionType");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomLevelDisplay = document.getElementById("zoomLevel");
const intensitySlider = document.getElementById("filterParameter");
const intensityValue = document.getElementById("intensityValue");
const holdBtn = document.getElementById("holdCompare"); 
const downloadBtn = document.getElementById("downloadResult");

let selectedFile = null;
let originalImageData = null; 
let lastFilteredImageData = null;
let undoStack = []; 
let redoStack = [];
let originalFileExtension = "png";
let gifAnimationId = null;
let sliderTimeout;
let gifFrames = [];
let filteredGifFrames = []

//zoom
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

//translacija
let imgX = 0;
let imgY = 0;
let dragging = false;
let startMouseX = 0;
let startMouseY = 0;

//SERVER
async function checkServer() {
    try {
        const response = await fetch("http://localhost:8080/apply-filters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                filters: [], 
                imageData: [0, 0, 0, 0], 
                width: 1, 
                height: 1, 
                intensity: 1, 
                sessionId: "ping" 
            })
        });
        return true;
    } catch (e) {
        return false;
    }
}
async function waitForServer() {
    const overlay = document.createElement("div");
    overlay.id = "serverOverlay";
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85); z-index: 9999;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 16px;
    `;
    overlay.innerHTML = `
        <div style="color: #d2b8a3; font-size: 18px; font-family: Orbitron">⚠ Server nije pokrenut</div>
        <div id="serverStatus" style="color: #888; font-size: 13px;">Pokusavam da se poveyem...</div>
        <div style="color: #666; font-size: 11px;">Pokreni: <code style="color:#d2b8a3">node src/gui/server.js</code></div>
    `;
    document.body.appendChild(overlay);
    while (true) {
        const ok = await checkServer();
        if (ok) {
            overlay.remove();
            log(`Server je dostupan! | Korisnik: ${CURRENT_USER}`, "success");
            return;
        }
        document.getElementById("serverStatus").textContent = `cekam server... (${new Date().toLocaleTimeString()})`;
        await new Promise(r => setTimeout(r, 2000));
    }
}
waitForServer().then(() => {
    startServerHealthCheck();
});
function startServerHealthCheck() {
    setInterval(async () => {
        const ok = await checkServer();
        if (!ok) {
            log("[ERROR] Server je pao! Zatvaranje aplikacije za 3 sekunde...", "error");
            document.getElementById("requestStatus").textContent = "Server pao!";
            setTimeout(() => {
                ipcRenderer.invoke("quit-app");
            }, 3000);
        }
    }, 5000);
}
if (resetView) {
    resetView.addEventListener("click", () => {
        scale = 1;
        offsetX = 0;
        offsetY = 0;        
        redrawCanvas();
        updateZoomDisplay()
        log("Prikaz slike je resetovan na pocetnu poziciju.", "info");
    });
}

// UI Status Update Functions
function ChooseFiles(file) {
    if (file) {
        chooseFileText.textContent = file.name;
        chooseFileText.parentElement?.classList.add("has-file");
    } else {
        chooseFileText.textContent = "Click to choose file...";
        chooseFileText.parentElement?.classList.remove("has-file");
    }
}
chooseFileButton.addEventListener("click", async () => {
    try {
        const result = await ipcRenderer.invoke("choose-file");
        if (!result) {
            document.getElementById("metaSize").textContent = "-";
            document.getElementById("metaCRC").textContent = "-";
            document.getElementById("metaDim").textContent = "0x0";
            document.getElementById("metaType").textContent = "-";
            log("File selection cancelled", "info");
            return;
        }

        selectedFile = result;
        ChooseFiles(selectedFile);
        document.getElementById("metaMagic").textContent = result.magic || "MSI0";
        document.getElementById("metaSize").textContent = result.size;
        document.getElementById("metaType").textContent = result.type;
        document.getElementById("metaCRC").textContent = result.crc || "0x0";
        document.getElementById("metaVersion").textContent = "0x0001";
        if (result.type === "MSI") {
            log("MSI detektovan. Dekompresujem...", "info");
            canvas.width = result.width;
            canvas.height = result.height;
            const rgbaBuffer = await ipcRenderer.invoke("decompress-msi", {
                buffer: result.data,
                width: result.width,
                height: result.height
            });
            if (rgbaBuffer) {
                const pixelArray = new Uint8ClampedArray(rgbaBuffer);
                const imageData = new ImageData(pixelArray, result.width, result.height);            
                ctx.putImageData(imageData, 0, 0);
                originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                log("MSI slika prikazana!", "success");
                addToHistory("UCITAN MSI", result.name);
            }
        }
        else {
            const img = new Image();
            img.onload = async function() {
                hardReset();
                if (gifAnimationId) cancelAnimationFrame(gifAnimationId);
                originalFileExtension = selectedFile.name.split('.').pop().toLowerCase();
                document.getElementById("metaType").textContent = originalFileExtension.toUpperCase();
                document.getElementById("metaDim").textContent = `${this.naturalWidth}x${this.naturalHeight}`;
                const sessionId = "SID-" + Math.random().toString(36).substr(2, 9).toUpperCase();
                document.getElementById("sessionId").textContent = sessionId;
                scale = 1;
                offsetX = 0;
                offsetY = 0;
                clearChart()
                resetBenchmarkUI();
                undoStack = [];
                redoStack = [];
                intensitySlider.value = 0;
                intensityValue.textContent = "0";
                intensitySlider.style.background = "#374151";
                if (originalFileExtension === "gif") {
                    log("Detektovan animirani format. Pokrecem preview...", "info");
                    canvas.width = this.naturalWidth;
                    canvas.height = this.naturalHeight;
                    await playGifPreview(result.path);
                    originalImageData = imageCtx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
                } else {
                    canvas.width = this.naturalWidth;
                    canvas.height = this.naturalHeight;
                    drawStaticImage(this);
                    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                }
                undoStack.push({
                    image: ctx.getImageData(0, 0, canvas.width, canvas.height),
                    filters: [],
                    intensity: 0
                });
                log(`Uxitan format: ${originalFileExtension.toUpperCase()}`, "info");
                addToHistory("UCITANA SLIKA", result.name);
            };
            img.src = `file://${result.path}`;
            log("Pocetno stanje sacuvano.", "info");
        }
    } catch (error) {
        log(`[ERROR] Kriticna greska na serveru: ${error.message} | Korisnik: ${CURRENT_USER}`, "error");
        if (error.message.includes("CRC32 mismatch")) {
            Swal.fire({
                title: "Security Violation!",
                text: "Detektovana je neovlascena izmena bajtova (CRC mismatch). Fajl je korumpiran i odbacen.",
                icon: "error",
                background: '#2a1f1a', 
                color: '#d2b8a3',    
                confirmButtonColor: '#5a4638'
            });
        } else {
            Swal.fire({
                title: "Greska!",
                text: error.message,
                icon: "warning",
                background: '#2a1f1a',
                color: '#d2b8a3'
            });
        }
    }
});
//gif
async function playGifPreview(filePath) {
    if (gifAnimationId) cancelAnimationFrame(gifAnimationId);
    const fs = require('fs');
    const buffer = fs.readFileSync(filePath).buffer;
    const gif = parseGIF(buffer);
    const frames = decompressFrames(gif, true);
    gifFrames = frames;
    console.log("Broj frejmova:", frames.length);
    console.log("Delays:", frames.map(f => f.delay));
    console.log("Delays u ms:", frames.map(f => f.delay * 10));
    if (!frames || frames.length === 0) {
        log("GIF nema frejmova.", "error");
        return;
    }
    const gifWidth = frames[0].dims.width;
    const gifHeight = frames[0].dims.height;
    imageCanvas.width = gifWidth;
    imageCanvas.height = gifHeight;
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = gifWidth;
    frameCanvas.height = gifHeight;
    const frameCtx = frameCanvas.getContext('2d');
    let frameIndex = 0;
    let lastFrameTime = null;
    function renderFrame(timestamp) {
        if (!gifAnimationId) return;        
        if (!lastFrameTime) lastFrameTime = timestamp;
        const frame = frames[frameIndex];
        let delay = frame.delay * 10;
        if (delay <= 0 || delay < 20) delay = 20;
        delay = delay / 8; 
        if (timestamp - lastFrameTime >= delay) {
            const { dims, patch } = frame;
            const imageData = new ImageData(
                new Uint8ClampedArray(patch),
                dims.width,
                dims.height
            );
            frameCtx.putImageData(imageData, dims.left, dims.top);
            imageCtx.clearRect(0, 0, gifWidth, gifHeight);
            imageCtx.drawImage(frameCanvas, 0, 0);
            redrawCanvas();
            frameIndex = (frameIndex + 1) % frames.length;
            lastFrameTime += delay;
        }
        gifAnimationId = requestAnimationFrame(renderFrame);
    }
    const firstFrame = frames[0];
    const firstImageData = new ImageData(
        new Uint8ClampedArray(firstFrame.patch),
        firstFrame.dims.width,
        firstFrame.dims.height
    );
    frameCtx.putImageData(firstImageData, firstFrame.dims.left, firstFrame.dims.top);
    imageCtx.clearRect(0, 0, gifWidth, gifHeight);
    imageCtx.drawImage(frameCanvas, 0, 0);
    redrawCanvas();
    gifAnimationId = requestAnimationFrame(renderFrame);
    log(`GIF animacija pokrenuta (${frames.length} frejmova).`, "success");
}
function stopGif() {
    if (gifAnimationId) {
        cancelAnimationFrame(gifAnimationId);
        gifAnimationId = null;
    }
}
//canvas

const canvas = document.getElementById("mainCanvas");
const ctx = canvas.getContext("2d", {
    willReadFrequently: true
});
canvas.style.cursor = "grab";
const imageCanvas = document.createElement("canvas");
const imageCtx = imageCanvas.getContext("2d", {
    willReadFrequently: true
});
function drawStaticImage(imgElement) {
    imageCanvas.width = imgElement.width;
    imageCanvas.height = imgElement.height;
    imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    imageCtx.drawImage(imgElement, 0, 0);
    redrawCanvas();
}
let exportPath = "";
const exportBtn = document.getElementById("selectExportDir");
const undoBtn = document.getElementById("selectUndoDir");
document.addEventListener("DOMContentLoaded", () => {
    //EXPO
    if (exportBtn) {
        exportBtn.addEventListener("click", async () => {
            const path = await ipcRenderer.invoke("choose-directory");
            if (path) {
                exportPath = path; 
                log(`Export folder: ${path}`, "success");
                await ipcRenderer.invoke("open-folder", path);
            } else {
                console.log("Korisnik je otkazao biranje foldera.");
            }
        });
    }
    // UNDO 
    if (undoBtn) {
        undoBtn.addEventListener("click", () => {
            if (undoStack.length > 0) {
                const current = {
                    image: ctx.getImageData(0, 0, canvas.width, canvas.height),
                    filters: Array.from(document.querySelectorAll('.filter-check:checked')).map(cb => cb.value),
                    intensity: parseFloat(intensitySlider.value)
                };
                redoStack.push(current);
                const previous = undoStack.pop();
                imageCanvas.width = previous.image.width;
                imageCanvas.height = previous.image.height;
                imageCtx.putImageData(previous.image, 0, 0);
                redrawCanvas();
                applyStateToUI(previous);
                lastFilteredImageData = previous.image;
                log("Undo: Vraceno stanje slike i filtera.", "info");
            } else {
                log("Nema koraka za Undo.", "warning");
            }
        });
    }
    // REDO
    if (redoBtn) {
        redoBtn.addEventListener("click", () => {
            if (redoStack.length > 0) {
                const next = redoStack.pop();
                undoStack.push({
                    image: ctx.getImageData(0, 0, canvas.width, canvas.height),
                    filters: Array.from(document.querySelectorAll('.filter-check:checked')).map(cb => cb.value),
                    intensity: parseFloat(intensitySlider.value)
                });
                imageCanvas.width = next.image.width;
                imageCanvas.height = next.image.height;
                imageCtx.putImageData(next.image, 0, 0);
                redrawCanvas();
                applyStateToUI(next);
                lastFilteredImageData = next.image;
                log("Redo: Vraceno stanje slike i filtera.", "info");
            }
        });
    }
});
//filer parts
function applyStateToUI(state) {
    if (!state) return;
    const checkboxes = document.querySelectorAll('.filter-check');
    checkboxes.forEach(cb => {
        cb.checked = state.filters.includes(cb.value);
    });
    if (intensitySlider) {
        intensitySlider.value = state.intensity;
        intensityValue.textContent = state.intensity;
        const lightness = 75 - (state.intensity * 4);
        const saturation = 40 + (state.intensity * 2);
        const colorString = `hsl(30, ${saturation}%, ${lightness}%)`;
        intensityValue.style.color = colorString;
        const percentage = (state.intensity - intensitySlider.min) / (intensitySlider.max - intensitySlider.min) * 100;
        intensitySlider.style.background = `linear-gradient(to right, ${colorString} ${percentage}%, #374151 ${percentage}%)`;
    }
    updateFilterOrderUI();
}
//slider
intensitySlider.addEventListener("input", (event) => {
    const val = event.target.value;
    intensityValue.textContent = val;
    const checkedFilters = Array.from(document.querySelectorAll('.filter-check:checked'))
                                .map(cb => cb.value);
    const lastFilter = checkedFilters[checkedFilters.length - 1];
    if (lastFilter) {
        filterIntensities[lastFilter] = parseFloat(val);
    }
    const lightness = 75 - (val * 4); 
    const saturation = 40 + (val * 2);
    const colorString = `hsl(30, ${saturation}%, ${lightness}%)`;
    intensityValue.style.color = colorString;
    const percentage = (val - intensitySlider.min) / (intensitySlider.max - intensitySlider.min) * 100;
    intensitySlider.style.background = `linear-gradient(to right, ${colorString} ${percentage}%, #374151 ${percentage}%)`;
    
    clearTimeout(sliderTimeout);
    sliderTimeout = setTimeout(() => {
        processFilters();
    }, 150);
});
saveMsiBtn.addEventListener("click", async () => {
    if (!selectedFile || !exportPath) {
        Swal.fire({
            title: "Nedostaju podaci!",
            text: "Morate prvo izabrati sliku i odrediti export direktorijum pre cuvanja.",
            icon: "warning",
            background: '#2a1f1a', 
            color: '#d2b8a3',      
            confirmButtonColor: '#5a4638',
            confirmButtonText: "Razumem"
        });
        return;
    }
    const imageDataObj = imageCtx.getImageData(0, 0, imageCanvas.width, imageCanvas.height);
    const pixelArray = Array.from(imageDataObj.data);
    const compressionType = parseInt(compressionSelect.value);
    const fileName = selectedFile.name.split('.')[0] + ".msi";
    const fullPath = `${exportPath}\\${fileName}`;
    log("Priprema binarnog fajla...", "info");
    const outputSize = (pixelArray.length / 1024).toFixed(2); 
    log(`[INFO] Izvoz zapocet. Korisnik: ${CURRENT_USER} | Velicina niza: ${outputSize}KB`, "info");
    const success = await ipcRenderer.invoke("export-msi", {
        filePath: fullPath,
        width: imageCanvas.width,
        height: imageCanvas.height,
        compression: compressionType,
        imageData: pixelArray
    });
    if (success) {
        log(`[INFO] USPEH: MSI fajl kreiran na lokaciji: ${fullPath}`, "success");
        await ipcRenderer.invoke("open-folder", exportPath);
        Swal.fire({
            title: "Uspesno sacuvano!",
            text: `MSI fajl je kreiran u: ${exportPath}`,
            icon: "success",
            background: '#2a1f1a',
            color: '#d2b8a3',
            confirmButtonColor: '#5a4638'
        });
    }
});
//precrtaj
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    const canvasAspect = canvas.width / canvas.height;
    const imgAspect = imageCanvas.width / imageCanvas.height;
    let drawWidth, drawHeight, drawX, drawY;
    if (imgAspect > canvasAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgAspect;
    } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgAspect;
    }
    drawX = (canvas.width - drawWidth) / 2;
    drawY = (canvas.height - drawHeight) / 2;
    ctx.drawImage(imageCanvas, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
}
function saveCanvasState() {
    redoStack = [];    
    if (undoStack.length >= MAX_UNDO) {
        undoStack.shift(); 
    }
    const currentFilters = Array.from(document.querySelectorAll('.filter-check:checked')).map(cb => cb.value);
    const currentIntensity = parseFloat(intensitySlider.value);
    const rawData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const copy = new ImageData(
        new Uint8ClampedArray(rawData.data),
        rawData.width,
        rawData.height
    );
    undoStack.push({
        image: copy,
        filters: currentFilters,
        intensity: currentIntensity
    });
}
document.getElementById("clearDirs").addEventListener("click", () => {
    hardReset();
    undoStack = []; 
    redoStack = []; 
    for (const key in filterIntensities) delete filterIntensities[key];
    document.querySelectorAll('.filter-check').forEach(cb => {
        cb.checked = false;
    });
    stopGif();
    imageCanvas.width = 1;
    imageCanvas.height = 1;
    imageCtx.clearRect(0, 0, 1, 1);
    const chooseFileText = document.getElementById("chooseFileText");
    if (chooseFileText) {
        chooseFileText.textContent = "Choose File";
    }
    selectedFile = null;
    originalImageData = null;
    lastFilteredImageData = null;
    if (typeof undoStack !== 'undefined') undoStack = []; 
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const metaElements = {
        "metaDim": "0x0",
        "metaSize": "-",
        "metaType": "-",
        "metaCRC": "-",
        "metaMagic": "MSI0",
        "metaVersion": "0x0001"
    };
    for (const [id, val] of Object.entries(metaElements)) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
    document.getElementById("latencyDisplay").textContent = "0 ms";
    document.getElementById("requestStatus").textContent = "Idle";
    document.getElementById("processingTime").textContent = "0 ms";
    document.getElementById("sessionId").textContent = "-";
    const intensitySlider = document.getElementById("filterParameter");
    const intensityValue = document.getElementById("intensityValue");
    if (intensitySlider) {
        intensitySlider.value = 5;
        if (intensityValue) {
            intensityValue.textContent = "5";
            intensityValue.style.color = "";
        }
        intensitySlider.style.background = "#374151";
    }
    const orderList = document.getElementById("filterOrder");
    if (orderList) {
        orderList.innerHTML = "<li>No filters selected</li>";
    }
    log("Sve je resetovano na pocetno stanje.", "info");
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    updateZoomDisplay()
    clearChart(); 
    resetBenchmarkUI();
    log("Sva polja i grafik su resetovani.", "info");
});

if (holdBtn) {
    holdBtn.addEventListener("mousedown", () => {
        if (originalImageData) {
            imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            imageCtx.putImageData(originalImageData, 0, 0);
            redrawCanvas();
        }
    });
    holdBtn.addEventListener("mouseup", () => {
        if (lastFilteredImageData) {
            imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            imageCtx.putImageData(lastFilteredImageData, 0, 0);
            redrawCanvas();
        } else if (originalImageData) {
            imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            imageCtx.putImageData(originalImageData, 0, 0);
            redrawCanvas();
        }
    });
    holdBtn.addEventListener("mouseleave", () => {
        if (lastFilteredImageData) {
            imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            imageCtx.putImageData(lastFilteredImageData, 0, 0);
            redrawCanvas();
        }
    });
}

async function processFilters() {
    // console.log("canvas:", canvas.width, canvas.height);
    // console.log("originalImageData:", originalImageData?.width, originalImageData?.height);
    // console.log("imageCanvas:", imageCanvas.width, imageCanvas.height);
    const startTime = performance.now();
    const checkedFilters = Array.from(document.querySelectorAll('.filter-check:checked')).map(cb => cb.value);
    const intensity = parseFloat(intensitySlider.value);
   if (checkedFilters.length > 0) {
        const konzolniZahtev = {
            filters: checkedFilters,
            filterIntensities: filterIntensities,
            imageData: originalImageData ? Array.from(originalImageData.data.slice(0, 8)).concat(["... i tako jos 3 miliona piksela ..."]) : [],
            width: canvas.width,
            height: canvas.height,
            intensity: intensity,
            sessionId: document.getElementById("sessionId").textContent
        };
        console.log("%c STRUKTURA ZAHTEVA (JSON Body)", "color: #ffff00; font-weight: bold;");
        console.log(JSON.stringify(konzolniZahtev, null, 2));
    }
    if (checkedFilters.length === 0) {
        lastFilteredImageData = null;
        if (originalFileExtension === "gif" && selectedFile) {
            playGifPreview(selectedFile.path);
        } else if (originalImageData) {
            imageCanvas.width = canvas.width;
            imageCanvas.height = canvas.height;
            imageCtx.putImageData(originalImageData, 0, 0);
            redrawCanvas();
        }
        return;
    }
    document.getElementById("requestStatus").textContent = "Processing...";
    document.getElementById("loadingBar").classList.remove("hidden");
    saveCanvasState();
    try {
        if (originalFileExtension === "gif" && gifFrames && gifFrames.length > 0) {
            const totalGifData = ((gifFrames.length * canvas.width * canvas.height * 4) / 1024).toFixed(2);
            log(`[INFO] Korisnik: ${CURRENT_USER} | Batch obrada GIF-a | Ukupno podataka: ${totalGifData} KB`, "info");
            const filteredFrames = [];
            for (let i = 0; i < gifFrames.length; i++) {
                const frame = gifFrames[i];
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                const frameImageData = new ImageData(
                    new Uint8ClampedArray(frame.patch),
                    frame.dims.width,
                    frame.dims.height
                );
                tempCtx.putImageData(frameImageData, frame.dims.left, frame.dims.top);
                const fullFrameData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
                const response = await fetch("http://localhost:8080/apply-filters", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filters: checkedFilters,
                        filterIntensities: filterIntensities,
                        imageData: Array.from(fullFrameData.data),
                        width: canvas.width,
                        height: canvas.height,
                        intensity: intensity,
                        sessionId: document.getElementById("sessionId").textContent
                    })
                });
                const result = await response.json();
                if (result.success) {
                    filteredFrames.push({
                        data: result.data,
                        delay: frame.delay
                    });
                }
                if (i % 10 === 0) {
                    log(`Obradjujem frejm ${i + 1}/${gifFrames.length}...`, "info");
                }
                filteredGifFrames = filteredFrames;
            }
            stopGif();
            let frameIndex = 0;
            let lastFrameTime = null;
            function renderFilteredFrame(timestamp) {
                if (!gifAnimationId) return;
                if (!lastFrameTime) lastFrameTime = timestamp;
                const frame = filteredFrames[frameIndex];
                let delay = frame.delay * 10;
                if (delay <= 0 || delay < 20) delay = 20;
                delay = delay / 8; 
                if (timestamp - lastFrameTime >= delay) {
                    const newImgData = new ImageData(
                        new Uint8ClampedArray(frame.data),
                        canvas.width, canvas.height
                    );
                    imageCanvas.width = canvas.width;
                    imageCanvas.height = canvas.height;
                    imageCtx.putImageData(newImgData, 0, 0);
                    redrawCanvas();
                    lastFilteredImageData = newImgData;
                    frameIndex = (frameIndex + 1) % filteredFrames.length;
                    lastFrameTime += delay;
                }
                gifAnimationId = requestAnimationFrame(renderFilteredFrame);
            }
            gifAnimationId = requestAnimationFrame(renderFilteredFrame);
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            log(`GIF filter primenjen na ${filteredFrames.length} frejmova!`, "success");
            document.getElementById("processingTime").textContent = `${duration} ms`;
            document.getElementById("latencyDisplay").textContent = `${Math.round(duration * 0.1)} ms`;
            document.getElementById("requestStatus").textContent = "Idle";
        } else {
            const inputSize = (originalImageData.data.length / 1024).toFixed(2); 
            const result = await ipcRenderer.invoke("filters-apply-batch", {
                filters: checkedFilters,
                imageData: Buffer.from(originalImageData.data.buffer),
                width: canvas.width,
                height: canvas.height,
                intensity: intensity,
                sessionId: document.getElementById("sessionId").textContent
            });
            console.log("%c STRUKTURA ODGOVORA :", "color: #00ffff; font-weight: bold;");
            console.log(JSON.stringify({
                success: result.success,
                processingTime: result.processingTime || `${Math.round(performance.now() - startTime)}ms`,
                data: result.data ? `[Uint8Array(${result.data.length || result.data.byteLength}) ... ${Array.from(new Uint8Array(result.data).slice(0, 8)).join(', ')} ...]` : "null"
            }, null, 2));
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);
            if (result.success) {
                stopGif();
                const newImgData = new ImageData(
                    new Uint8ClampedArray(result.data),
                    canvas.width, canvas.height
                );
                imageCanvas.width = canvas.width;
                imageCanvas.height = canvas.height;
                imageCtx.putImageData(newImgData, 0, 0);
                redrawCanvas();
                lastFilteredImageData = newImgData;
                document.getElementById("processingTime").textContent = `${duration} ms`;
                document.getElementById("latencyDisplay").textContent = `${Math.round(duration * 0.1)} ms`;
                document.getElementById("requestStatus").textContent = "Idle";
                log(`[INFO] Korisnik: ${CURRENT_USER} | I/O: ${inputSize}KB | Filteri: ${checkedFilters.join("+")} | Vreme: ${duration}ms`, "success");            }
        }
    } catch (err) {
        log(`[ERROR] Kriticna greska na serveru: ${err.message} | Korisnik: ${CURRENT_USER}`, "error");
        document.getElementById("requestStatus").textContent = "Error";
    }
    document.getElementById("loadingBar").classList.add("hidden");
}

//zoom
function updateZoomDisplay() {
    zoomLevelDisplay.textContent = `${Math.round(scale * 100)}%`;
}
zoomInBtn.addEventListener("click", () => {
    scale = Math.min(scale + 0.1, 3);
    redrawCanvas();
    updateZoomDisplay();
});

zoomOutBtn.addEventListener("click", () => {
    scale = Math.max(scale - 0.1, 0.2);
    redrawCanvas();
    updateZoomDisplay();
});
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomIntensity = 0.1;

    if (e.deltaY < 0) {
        scale += zoomIntensity;
    } else {
        scale -= zoomIntensity;
    }
    scale = Math.max(0.2, Math.min(scale, 3));
    redrawCanvas();
    updateZoomDisplay();
});
canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX - offsetX;
    startY = e.clientY - offsetY;

    canvas.style.cursor = "grabbing";
});
canvas.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    offsetX = e.clientX - startX;
    offsetY = e.clientY - startY;
    redrawCanvas();
});
canvas.addEventListener("mouseup", () => {
    isDragging = false;

    canvas.style.cursor = "grab";
});
canvas.addEventListener("mouseleave", () => {
    isDragging = false;
});
document.querySelectorAll('.filter-check').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        updateFilterOrderUI();
        const checkedFilters = Array.from(document.querySelectorAll('.filter-check:checked')).map(cb => cb.value);
        const filtersWithoutSlider = ["flip", "flip_vertical"];
        const hasOnlyNoSliderFilters = checkedFilters.length > 0 && checkedFilters.every(f => filtersWithoutSlider.includes(f));
        const noFilters = checkedFilters.length === 0;
        const sliderWrapper = intensitySlider.closest(".flex-col");
        if (sliderWrapper) {
            sliderWrapper.style.display = (hasOnlyNoSliderFilters || noFilters) ? "none" : "";
        }
        processFilters();
    });
});
function updateFilterOrderUI() {
    const orderList = document.getElementById("filterOrder");
    if (!orderList) return;
    const selectedNames = Array.from(document.querySelectorAll('.filter-check:checked')).map(cb => cb.parentNode.querySelector('span').textContent);
    if (selectedNames.length > 0) {
        orderList.innerHTML = selectedNames.map(name => `<li>• ${name}</li>`).join("");
    } else {
        orderList.innerHTML = "<li>No filters selected</li>";
    }
}
if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
        if (!originalImageData) {
            Swal.fire({ icon: 'error', title: 'Greska', text: 'Canvas je prazan!', background: '#1a1a1a', color: '#ffffff' });
            return;
        }
        if (originalFileExtension === "gif" && filteredGifFrames.length > 0) {
            log("Enkodovanje GIF-a...", "info");
            const omggif = require('omggif');
            const width = canvas.width;
            const height = canvas.height;
            const bufferSize = width * height * filteredGifFrames.length * 5 + 1024;
            const buf = Buffer.alloc(bufferSize);
            const writer = new omggif.GifWriter(buf, width, height, { loop: 0 });
            for (const frame of filteredGifFrames) {
                const rgba = new Uint8Array(frame.data);
                const indexed = new Uint8Array(width * height);
                const colorMap = new Map();
                const palette = [];
               for (let i = 0; i < width * height; i++) {
                    const r = rgba[i * 4];
                    const g = rgba[i * 4 + 1];
                    const b = rgba[i * 4 + 2];
                    const key = (r << 16) | (g << 8) | b;
                    if (!colorMap.has(key) && colorMap.size < 256) {
                        colorMap.set(key, colorMap.size);
                        palette.push((r << 16) | (g << 8) | b);
                    }
                    indexed[i] = colorMap.has(key) ? colorMap.get(key) : 0;
                }
                while (palette.length < 256) palette.push(0);
                const delay = frame.delay > 0 ? Math.round(frame.delay / 10) : 1;
                console.log("delay koji se salje omggif-u:", delay);
                console.log("originalni frame.delay:", frame.delay);
                writer.addFrame(0, 0, width, height, indexed, {
                    palette: palette,
                    delay: delay
                });
                
            }
            const gifData = buf.slice(0, writer.end());
            const base64Data = gifData.toString('base64');
            const originalName = selectedFile ? selectedFile.name.split('.')[0] : "result";
            const savedPath = await ipcRenderer.invoke("save-file-dialog", {
                defaultName: `${originalName}_filtered.gif`,
                base64Data: base64Data
            });
            if (savedPath) {
                log(`GIF sacuvan: ${savedPath}`, "success");
                await ipcRenderer.invoke("open-folder", require("path").dirname(savedPath));
            }
        }
        else {
            try {
                let mimeType = "image/png";
                if (["jpg", "jpeg"].includes(originalFileExtension)) mimeType = "image/jpeg";
                else if (originalFileExtension === "webp") mimeType = "image/webp";
                else if (originalFileExtension === "bmp") mimeType = "image/bmp";
                const imageDataUrl = imageCanvas.toDataURL(mimeType, 0.9);
                const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
                const originalName = selectedFile ? selectedFile.name.split('.')[0] : "result";
                const savedPath = await ipcRenderer.invoke("save-file-dialog", {
                    defaultName: `${originalName}_filtered.${originalFileExtension}`,
                    base64Data: base64Data
                });
                if (savedPath) {
                    log(`Slika sauvana: ${savedPath}`, "success");
                    await ipcRenderer.invoke("open-folder", require("path").dirname(savedPath));
                }
            } catch (error) {
                log(`[ERROR] Kriticna greska na serveru: ${error.message} | Korisnik: ${CURRENT_USER}`, "error");
            }
        }
    });
}
//log
function log(message, type = "info") {
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logElement.appendChild(entry);
    logElement.scrollTop = logElement.scrollHeight;
}
window.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  const themeText = document.getElementById("themeText");
  const root = document.documentElement;
  const sunIconUrl = "slike/day-and-night.png";
  const moonIconUrl = "slike/dark.png";
  const updateToggleButton = (isDark) => {
    if (isDark) {
      themeIcon.src = sunIconUrl;
      themeText.textContent = "Light Mode";
    } else {
      themeIcon.src = moonIconUrl;
      themeText.textContent = "Dark Mode";
    }
  };
  if (localStorage.theme === "dark") {
    root.classList.add("dark");
    updateToggleButton(true);
  } else {
    updateToggleButton(false);
  }
  toggle.addEventListener("click", () => {
    root.classList.toggle("dark");
    const isDark = root.classList.contains("dark");
    if (isDark) {
      localStorage.theme = "dark";
      updateToggleButton(true);
    } else {
      localStorage.theme = "light";
      updateToggleButton(false);
    }
  });
});
async function testCrcMismatch() {
    if (!selectedFile || selectedFile.type !== "MSI") {
        log("Prvo ucitaj MSI fajl za test!", "warning");
        return;
    }
    log("Zapocinjem test integriteta...", "info");
    let corruptBuffer = Buffer.from(selectedFile.data);
    corruptBuffer[50] = corruptBuffer[50] ^ 0xFF; 
    log("Bajt na poziciji 50 je nasumicno izmenjen.", "warning");
    try {
        const rgbaBuffer = await ipcRenderer.invoke("decompress-msi", {
            buffer: corruptBuffer,
            width: selectedFile.width,
            height: selectedFile.height
        });
        
        log("TEST NEUSPESAN: Sistem je prihvatio korumpiran fajl!", "error");
    } catch (err) {
        log(`TEST USPESAN: Detektovan mismatch! Greska: ${err.message} | Korisnik: ${CURRENT_USER}`, "success");     
        Swal.fire({
            title: "Security: Integrity Violation",
            text: "CRC32 se ne poklapa! Obrada je zaustavljena radi bezbednosti.",
            icon: "shield",
            background: '#1a1a1a',
            color: '#d2b8a3'
        });
    }
}
let myChart = null; 
function clearChart() {
    if (myChart) {
        myChart.destroy();
        myChart = null;
    }
    const ctx = document.getElementById('latencyChart').getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
async function runLatencyBenchmark() {
    if (!originalImageData) {
        log("Greska: Morate prvo ucitati sliku!", "error");
        return;
    }
    const chartContainer = document.getElementById('chartContainer');
    chartContainer.classList.remove('hidden');
    const filtersToTest = [
        "grayscale", "contrast", "flip", "laplacian", 
        "swirl", "colorizegrayscale", "edge_detector", 
        "flip_vertical", "jarvis"
    ];
    const iterations = 10;
    let results = {};
    const labels = [];
    const dataValues = [];
    log("Zapocinjem Benchmark...", "info");
    for (let filter of filtersToTest) {
        let totalTime = 0;
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            await ipcRenderer.invoke("filters-apply-batch", {
                filters: [filter],
                imageData: Buffer.from(originalImageData.data.buffer),
                width: canvas.width,
                height: canvas.height,
                intensity: 5
            });

            const end = performance.now();
            totalTime += (end - start);
        }
        const averageTime = (totalTime / iterations).toFixed(2);
        results[filter] = averageTime;        
        labels.push(filter);
        dataValues.push(averageTime);
    }
    console.table(results);
    log("Benchmark zavrsen. Generisem grafikon...", "success");
    renderLatencyChart(labels, dataValues);
}
function renderLatencyChart(labels, dataValues) {
    const ctx = document.getElementById('latencyChart').getContext('2d');
    if (myChart) {
        myChart.destroy();
    }
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Prosecno vreme (ms)',
                data: dataValues,
                backgroundColor: 'rgba(99, 102, 241, 0.5)', 
                borderColor: '#6366f1',
                borderWidth: 2,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#cbd5e1' } 
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#cbd5e1' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#ffffff', font: { family: 'Orbitron' } } 
                }
            }
        }
    });
}
function resetBenchmarkUI() {
    const chartContainer = document.getElementById('chartContainer');
    if (chartContainer) {
        chartContainer.classList.add('hidden'); 
    }
    if (myChart) {
        myChart.destroy(); 
        myChart = null;
    }
}
//History
function initHistory() {
    const savedHistory = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    renderHistory(savedHistory);
}
function hardReset() {
    undoStack = [];
    redoStack = [];
        Object.keys(filterIntensities).forEach(key => delete filterIntensities[key]);
        document.querySelectorAll('.filter-check').forEach(cb => {
        cb.checked = false;
    });
    const orderList = document.getElementById("filterOrder");
    if (orderList) orderList.innerHTML = "<li>No filters selected</li>";
    intensitySlider.value = 5;
    intensityValue.textContent = "5";
    intensitySlider.style.background = "#374151";
    stopGif(); 
    log("Sistem resetovan za novi fajl.", "info");
}
function renderHistory(history) {
    recentList.innerHTML = history.length === 0 
        ? '<li class="py-2 text-center text-gray-500 opacity-50 italic">No recent activity</li>' 
        : '';
    history.forEach(item => {
        let colorClass = "text-primary-500"; 
        if (item.action.includes("MSI")) colorClass = "text-blue-400";
        if (item.action.includes("SLIKA")) colorClass = "text-green-400";
        const li = document.createElement('li');
        li.className = 'py-2 flex justify-between items-center border-b border-primary-500/10 last:border-0 hover:bg-white/5 transition-colors px-2 rounded group';
        li.innerHTML = `
            <div class="flex flex-col overflow-hidden">
                <span class="text-[10px] font-bold ${colorClass} tracking-tighter">${item.action}</span>
                <span class="truncate max-w-[140px] text-xs opacity-80 group-hover:opacity-100 transition-opacity">${item.fileName}</span>
            </div>
            <span class="text-[9px] text-gray-500 font-sans">${item.timestamp}</span>
        `;
        recentList.appendChild(li);
    });
}
function addToHistory(action, fileName) {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
     const newItem = {
        action: action.toUpperCase(), 
        fileName: fileName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    history.unshift(newItem);
    const limitedHistory = history.slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedHistory));
    renderHistory(limitedHistory);
}
clearHistoryBtn.addEventListener('click', () => {
    Swal.fire({
        title: 'Da li ste sigurni da zelite da izbrisete istoriju?',
        text: "Ovo ce zauvek obrisati vase logove",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#2b0f45', 
        cancelButtonColor: '#ff2fdc',
        confirmButtonText: 'Da!' 
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem(STORAGE_KEY);
            renderHistory([]);
            Swal.fire({
                title: 'Ocisceno!',
                text: 'Vasa istorija je uspesno obrisana.',
                icon: 'success',
                timer: 1500
            });
        }
    });
});
initHistory();