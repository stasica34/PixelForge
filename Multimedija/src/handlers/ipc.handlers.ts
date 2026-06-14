import { dialog, ipcMain } from "electron";
import { ApplicationState } from "../classes/ApplicationState";
import path from "path";
import fs from "fs";
import { applyDownsampling420 } from "../helpers/compressionformats";
import { 
    rgbToYCbCr, 
    applyShannonFano, 
    createBinaryMeta, 
    createMSIHeader, 
    calculateCRC32 
} from '../helpers/compressionformats';
import * as filtersLib from "../helpers/imagefilters";
import { decodeMSI } from "../helpers/decompressionformat";
const { app } = require('electron');
//izmena
const ipcSessionCache = new Map<string, { pixels: Buffer, width: number, height: number, lastUsed: number }>();
const IPC_TTL = 10 * 60 * 1000;


// function clearOldSessions() {
//     if (ipcSessionCache.size > 20) {
//         ipcSessionCache.clear();
//         console.log("[CACHE] Previse sessiona, obrisan ceo cache.");
//     }
// }

setInterval(() => {
    const now = Date.now();
    for (const [id, data] of ipcSessionCache.entries()) {
        if (now - data.lastUsed > IPC_TTL) {
            // console.log(`[CACHE] Brisanje zastalog sessiona: ${id}`);
            ipcSessionCache.delete(id);
        }
    }
}, 60 * 1000);

export function registerIpcHandlers() {
     console.log("IPC handlers registered");
     ipcMain.handle("decompress-msi", async (event, { buffer, width, height }) => {
        try {
             const nodeBuffer = Buffer.from(buffer);
             const rgbaArray = decodeMSI(nodeBuffer, width, height);
             return Buffer.from(rgbaArray.buffer); 
            // return rgbaArray;
            // return new Uint8ClampedArray(rgbaArray.buffer);
            // const result = Buffer.allocUnsafe(rgbaArray.length);
            // rgbaArray.forEach((val, i) => result[i] = val);
            // return result;
            } catch (err) {
                console.error("Greska pri dekompresiji na bekendu:", err);
                throw err;
            }
});
ipcMain.handle("choose-file", async () => {
    if (!ApplicationState.mainWindow) return null;
    const result = await dialog.showOpenDialog(ApplicationState.mainWindow, {
        properties: ["openFile"],
        filters: [{ name: "Image Files", extensions: ["jpg", "jpeg", "png", "gif", "msi", "bmp"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
    return { success: false, error: "Neispravno ime fajla" };
}
const fileBuffer = fs.readFileSync(filePath); 
const ext = path.extname(fileName).toUpperCase().replace('.', '');
const magic = ext === "MSI" ? fileBuffer.slice(0, 4).toString() : ext;
 // const magicHex = fileBuffer.slice(0, 4).toString('hex').toUpperCase();
 // const isMsi = magicHex === "4d534930"; 
let width = 0;
let height = 0;
let crcValue = "0x0";
if (magic === "MSI0") {
    width = fileBuffer.readUInt32LE(8); 
    height = fileBuffer.readUInt32LE(12);
    // width = fileBuffer.readUInt32BE(8);
    // height = fileBuffer.readUInt32BE(12);

    const realCrc = calculateCRC32(fileBuffer);
    crcValue = "0x" + realCrc.toString(16).toUpperCase();
}
return {
    path: filePath,
    name: fileName,
    size: (fileBuffer.length / 1024).toFixed(2) + " KB",
    type: magic === "MSI0" ? "MSI" : path.extname(fileName).toUpperCase().replace('.', ''),
    magic: magic === "MSI0" ? "MSI0" : ext,
    width: width,
    height: height,
    crc: crcValue,
    data: fileBuffer
    };
});
ipcMain.handle("choose-directory", async () => {
  if (!ApplicationState.mainWindow) return null;
  const result = await dialog.showOpenDialog(ApplicationState.mainWindow, {
    properties: ["openDirectory"], 
    title: "Odaberi direktorijum",
    buttonLabel: "Odaberi"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0]; 
});
ipcMain.handle("export-msi", async (event, { filePath, width, height, compression, imageData }) => {
    try {
        const ycbcrArray: number[] = [];
        for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            const { y, cb, cr } = rgbToYCbCr(r, g, b);
            ycbcrArray.push(y, cb, cr);
        }
        const ycbcrBuffer = Buffer.from(ycbcrArray);
        // const ycbcrBuffer = Buffer.allocUnsafe((imageData.length / 4) * 3);
        // for (let i = 0, j = 0; i < imageData.length; i += 4, j += 3) {
        // const { y, cb, cr } = rgbToYCbCr(imageData[i], imageData[i+1], imageData[i+2]);
        // ycbcrBuffer[j] = y;
        // ycbcrBuffer[j+1] = cb;
        // ycbcrBuffer[j+2] = cr;
        // }

        let finalPixelData: any; 
        let metaBuffer: any = Buffer.alloc(0);
        let dataToProcess: Buffer;
        // const tempBufferClone = Buffer.from(ycbcrBuffer);
        // dataToProcess = tempBufferClone;
        if(compression==3 || compression==1){
          dataToProcess = applyDownsampling420(ycbcrBuffer, width, height);
        }
        else
        {
          dataToProcess = ycbcrBuffer;
        }
        if(compression === 1) {
          const{compressedData, frequencies} = applyShannonFano(dataToProcess);
          finalPixelData = compressedData;
          metaBuffer = createBinaryMeta(frequencies);
        }
        else
        {
          finalPixelData = dataToProcess;
          metaBuffer = Buffer.alloc(0);
        }
        const header = createMSIHeader(width, height, finalPixelData.length, metaBuffer.length, compression);
        const combinedContent = Buffer.concat([header, metaBuffer, finalPixelData]);
        const crcValue = calculateCRC32(combinedContent);
        const crcBuffer = Buffer.alloc(4);
        crcBuffer.writeUInt32LE(crcValue, 0);
        const finalFileBuffer = Buffer.concat([combinedContent, crcBuffer]);
        // const tmpPath = filePath + ".tmp";
        // fs.writeFileSync(tmpPath, finalFileBuffer);
        // fs.renameSync(tmpPath, filePath);
        // await fs.promises.writeFile(filePath, finalFileBuffer);
        fs.writeFileSync(filePath, finalFileBuffer);
        console.log(`Uspesan export! Velicina: ${(finalFileBuffer.length / 1024).toFixed(2)} KB`);
        return { success: true, path: filePath };
    } catch (error) {
        console.error("Greska prilikom exporta u MSI:", error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
ipcMain.handle("filters-apply-batch", async (event, { filters, imageData, width, height,intensity,sessionId }) => {
    const startTime = Date.now(); 
    let pixels: Buffer; //izmena
    if (sessionId && !imageData && ipcSessionCache.has(sessionId)) {
        pixels = Buffer.from(ipcSessionCache.get(sessionId)!.pixels);
    } else {
        // console.log("Debug: imageData tip je:");
        // pixels = Buffer.from(imageData);
        pixels = Buffer.from(imageData.buffer || imageData);
        // pixels = imageData instanceof Buffer ? imageData : Buffer.from(imageData);

    }
    // await Promise.all(filters.map(async (filter: string) => {
    //     switch(filter) { ... }
    // }));

    for (const filter of filters) {
        switch (filter) {
            case "grayscale":
                filtersLib.applyGrayscale(pixels, intensity);
                break;
            case "contrast":
                filtersLib.applyContrast(pixels, intensity);
                break;
            case "flip":
                filtersLib.applyFlip(pixels, width, height);
                break;
            case "laplacian":
                filtersLib.applyLaplacian(pixels, width, height, intensity);
                break;
            case "swirl":
                filtersLib.applySwirl(pixels, width, height, intensity);
                break;
            case "colorizegrayscale":
                filtersLib.applyColorize(pixels, intensity);
                break;
            case "edge_detector":
                filtersLib.applyEdgeDetector(pixels, width, height, intensity); 
                break;
            case "flip_vertical":
                filtersLib.applyFlip(pixels, width, height, "vertical");
                break;
            case "jarvis":
                filtersLib.applyJarvisJudiceNinke(pixels, width, height, Number(intensity));
                break;
            default:
                console.warn(`Nepoznat filter: ${filter}`);
        }
    }
    if (sessionId && sessionId !== "ping") {
        ipcSessionCache.set(sessionId, { pixels, width, height, lastUsed: Date.now() });
        // ipcSessionCache.set(sessionId, {
        // pixels: zlib.deflateSync(pixels),
        // width, height, lastUsed: Date.now(), compressed: true
        // });
    }
    const elapsed = Date.now() - startTime;
    console.log(`[INFO] IPC batch filter | session: ${sessionId} | filteri: ${filters.join("+")} | vreme: ${elapsed}ms`);
    return { success: true, data: pixels };
});
ipcMain.handle('quit-app', () => {
    app.quit(); 
});
ipcMain.handle("open-folder", async (_, folderPath: string) => {
    const { shell } = require("electron");
    shell.openPath(folderPath);
});
ipcMain.handle("save-file-dialog", async (_, { defaultName, base64Data }) => {
    const { shell } = require("electron");
    const result = await dialog.showSaveDialog(ApplicationState.mainWindow!, {
        defaultPath: defaultName,
        filters: [{ name: "PNG Images", extensions: ["png"] }]
    });
    if (result.canceled || !result.filePath) return null;
    // const binaryStr = atob(base64Data);
    // const bytes = new Uint8Array(binaryStr.length);
    // for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    // fs.writeFileSync(result.filePath, bytes);
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(result.filePath, buffer);
    return result.filePath;
});
}
