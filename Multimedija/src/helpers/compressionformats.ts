import { Buffer } from 'buffer';

export function rgbToYCbCr(r: number, g: number, b: number) {
    // const y = (r + g + b) / 3;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
    // const cr = 0.5 * (b - y) + 128;
    const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
    return { y: Math.round(y), cb: Math.round(cb), cr: Math.round(cr) };
}
export function applyDownsampling420(ycbcrData: Buffer, width: number, height: number): Buffer {
    const ySize = width * height;
    const chromaWidth = Math.floor((width + 1) / 2);
    const chromaHeight = Math.floor((height + 1) / 2);
    // const chromaSize = chromaWidth * chromaHeight * 2;
    const chromaSize = chromaWidth * chromaHeight;
    const output = Buffer.alloc(ySize + (chromaSize * 2));
    for (let i = 0; i < ySize; i++) {
        // output[i] = ycbcrData[i];
        output[i] = ycbcrData[i * 3];
    }
    let cIdx = 0;
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            const pixelIdx = (y * width + x) * 3;
            // const avgCb = (ycbcrData[pixelIdx+1] + ycbcrData[(pixelIdx+3)+1] + ycbcrData[(pixelIdx+width*3)+1] + ycbcrData[(pixelIdx+width*3+3)+1]) / 4;
            // const avgCr = (ycbcrData[pixelIdx+2] + ycbcrData[(pixelIdx+3)+2] + ycbcrData[(pixelIdx+width*3)+2] + ycbcrData[(pixelIdx+width*3+3)+2]) / 4;
            output[ySize + cIdx] = ycbcrData[pixelIdx + 1];
            output[ySize + chromaSize + cIdx] = ycbcrData[pixelIdx + 2];
            // output[ySize + cIdx * 2] = avgCb;
            // output[ySize + cIdx * 2 + 1] = avgCr;
            cIdx++;
        }
    }
    return output;
}
export function applyShannonFano(data: Buffer) {
    const frequencies: { [key: number]: number } = {};
    data.forEach(byte => { frequencies[byte] = (frequencies[byte] || 0) + 1; });
    const symbols = Object.keys(frequencies).map(Number).sort((a, b) => frequencies[b] - frequencies[a]);
    const codes: { [key: number]: string } = {};
    function generateCodes(items: number[], prefix: string) {
        if (items.length === 1) { codes[items[0]] = prefix || "0"; return; }
        // let total = items.length;
        let total = items.reduce((sum, s) => sum + frequencies[s], 0);
        let leftSum = 0, splitPoint = 0, minDiff = total;
        for (let i = 0; i < items.length - 1; i++) {
            leftSum += frequencies[items[i]];
            // let diff = Math.abs(items.length / 2 - i);
            let diff = Math.abs((total - leftSum) - leftSum);
            if (diff < minDiff) { minDiff = diff; splitPoint = i; }
        }
        generateCodes(items.slice(0, splitPoint + 1), prefix + "0");
        generateCodes(items.slice(splitPoint + 1), prefix + "1");
    }
    if (symbols.length > 0) generateCodes(symbols, "");
    let bitString = "";
    data.forEach(byte => { bitString += codes[byte]; });
    const compressedArr = [];
    for (let i = 0; i < bitString.length; i += 8) {
        let segment = bitString.substr(i, 8);
        // if(segment.length < 8) segment = segment.padStart(8, "0");
        if(segment.length < 8) segment = segment.padEnd(8, "0");
        compressedArr.push(parseInt(segment, 2));
    }
    return { compressedData: Buffer.from(compressedArr), frequencies };
}
export function calculateCRC32(buffer: Buffer): number {
    // let crc = 0x00000000;
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
        // crc ^= buffer[i] << 24;
        crc ^= buffer[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
export function createMSIHeader(width: number, height: number, pixelLen: number, metaLen: number, comp: number) {
    const header = Buffer.alloc(28);
    header.write("MSI0", 0);
    header.writeUInt16LE(0x0001, 4);
    header.writeUInt16LE(28, 6);
    header.writeUInt32LE(width, 8);
    header.writeUInt32LE(height, 12); 
    header.writeUInt8(3, 16);
    header.writeUInt8(2, 17); 
    header.writeUInt8(comp, 18);
    header.writeUInt8(0, 19);
    // header.writeUInt32LE(pixelLen, 20);
    // header.writeUInt32LE(metaLen, 24);
    header.writeUInt32LE(metaLen, 20);
    header.writeUInt32LE(pixelLen, 24);
    return header;
}
export function createBinaryMeta(frequencies: { [key: number]: number }): Buffer {
    const buffer = Buffer.alloc(256 * 5);
    for (let i = 0; i < 256; i++) {
        buffer.writeUInt8(i, i * 5);
        // buffer.writeUInt32LE(frequencies[i], (i * 5) + 1);
        buffer.writeUInt32LE(frequencies[i] || 0, (i * 5) + 1);
    }
    return buffer;
}