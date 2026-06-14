import { Buffer } from 'buffer';
import { calculateCRC32 } from './compressionformats';

function ycbcrToRgb(y: number, cb: number, cr: number) {
    // const r = y + 1.402 * cr;
    let r = y + 1.402 * (cr - 128);
    // const r = y + 1.402 * cr;
    let g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
    let b = y + 1.772 * (cb - 128);

    return {
        r: Math.max(0, Math.min(255, Math.round(r))),
        // g: Math.min(255, Math.round(g)),
        g: Math.max(0, Math.min(255, Math.round(g))),
        b: Math.max(0, Math.min(255, Math.round(b)))
    };
}

function decodeShannonFano(compressedBuffer: Buffer, frequencies: { [key: number]: number }) {
    const symbols = Object.keys(frequencies)
        .map(Number)
        .filter(s => frequencies[s] > 0)
        .sort((a, b) => frequencies[b] - frequencies[a]);
    const codes: { [key: string]: number } = {};
    function generateCodes(items: number[], prefix: string) {
        if (items.length === 1) {
            // codes[prefix || "1"] = items[0];
            codes[prefix || "0"] = items[0];
            return;
        }
        let total = items.reduce((sum, s) => sum + frequencies[s], 0);
        let leftSum = 0, splitPoint = 0, minDiff = total;
        for (let i = 0; i < items.length - 1; i++) {
            leftSum += frequencies[items[i]];
            let diff = Math.abs((total - leftSum) - leftSum);
            if (diff < minDiff) { minDiff = diff; splitPoint = i; }
        }
        generateCodes(items.slice(0, splitPoint + 1), prefix + "0");
        generateCodes(items.slice(splitPoint + 1), prefix + "1");
    }

    if (symbols.length > 0) generateCodes(symbols, "");
    const decoded: number[] = [];
    let currentCode = "";
    // const totalBytesNeeded = Object.keys(frequencies).length;
    const totalBytesNeeded = Object.values(frequencies).reduce((a, b) => a + b, 0);
    for (let byte of compressedBuffer) {
         // for (let i = 0; i <= 7; i++) {
        for (let i = 7; i >= 0; i--) {
            const bit = (byte >> i) & 1;
            currentCode += bit;
            if (codes[currentCode] !== undefined) {
                decoded.push(codes[currentCode]);
                currentCode = "";
                if (decoded.length === totalBytesNeeded) return decoded;
            }
        }
    }
    return decoded;
}
export function decodeMSI(buffer: Buffer, width: number, height: number): Uint8ClampedArray {
    const storedCrc = buffer.readUInt32LE(buffer.length - 4);
    // const dataToVerify = buffer.slice(0, buffer.length);
    const dataToVerify = buffer.slice(0, buffer.length - 4);
    const calculatedCrc = calculateCRC32(dataToVerify);
    if (storedCrc !== calculatedCrc) {
        throw new Error("Integrity check failed: CRC32 mismatch. File is corrupted.");
    }
    const compression = buffer.readUInt8(18);
    const metaLen = buffer.readUInt32LE(20);
    const pixelLen = buffer.readUInt32LE(24);
    let rawData: number[] | Buffer;
    if (compression === 1) {
        const frequencies: { [key: number]: number } = {};
        for (let i = 0; i < 256; i++) {
            const offset = 28 + (i * 5);
            frequencies[buffer.readUInt8(offset)] = buffer.readUInt32LE(offset + 1);
        }
         // const compressedData = buffer.slice(28, 28 + pixelLen);
        const compressedData = buffer.slice(28 + metaLen, 28 + metaLen + pixelLen);
        rawData = decodeShannonFano(compressedData, frequencies);
    } else {
        rawData = buffer.slice(28 + metaLen, 28 + metaLen + pixelLen);
    }
    const rgba = new Uint8ClampedArray(width * height * 4);
    const ySize = width * height;
    const cW = Math.floor((width + 1) / 2);
    const cH = Math.floor((height + 1) / 2);
    const cSize = cW * cH;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const yVal = rawData[y * width + x];
            // let cb = 0, cr = 0;
            let cb = 128, cr = 128;
            if (compression === 1 || compression === 3) {
                const cx = Math.floor(x / 2);
                const cy = Math.floor(y / 2);
                const cIdx = cy * cW + cx;                
                if (ySize + cSize + cIdx < rawData.length) {
                    cb = rawData[ySize + cIdx];
                    cr = rawData[ySize + cSize + cIdx];
                    // cb = rawData[ySize + cSize + cIdx];
                    // cr = rawData[ySize + cIdx];
                }
            } else if (compression === 0) { 
                const base = (y * width + x) * 3;
                cb = rawData[base + 1];
                cr = rawData[base + 2];
            }
            const rgb = ycbcrToRgb(yVal, cb, cr);
            const idx = (y * width + x) * 4;
            rgba[idx] = rgb.r;
            rgba[idx + 1] = rgb.g;
            rgba[idx + 2] = rgb.b;
             // rgba[idx + 3] = 0;
            rgba[idx + 3] = 255; 
        }
    }
    return rgba;
}