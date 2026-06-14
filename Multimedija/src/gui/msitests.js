const path = require('path');
const { rgbToYCbCr, createMSIHeader, calculateCRC32 } = require(path.join(__dirname, '../../dist/src/helpers/compressionformats'));
const { decodeMSI } = require(path.join(__dirname, '../../dist/src/helpers/decompressionformat'));

let passed = 0;
let failed = 0;

function assert(name, condition) {
    if (condition) { console.log(`PASS: ${name}`); passed++; }
    else { console.log(`FAIL: ${name}`); failed++; }
}

function encodeRawMSI(rgbaPixels, width, height) {
    const ycbcrArray = [];
    for (let i = 0; i < rgbaPixels.length; i += 4) {
        const { y, cb, cr } = rgbToYCbCr(rgbaPixels[i], rgbaPixels[i+1], rgbaPixels[i+2]);
        // ycbcrArray.push(y, cb, cr, 255);
        ycbcrArray.push(y, cb, cr);
    }
    const pixelBuffer = Buffer.from(ycbcrArray);
    const metaBuffer = Buffer.alloc(0);
    // const metaBuffer = Buffer.alloc(8);
    // const header = createMSIHeader(width, height, pixelBuffer.length, metaBuffer.length, 0);
    const header = createMSIHeader(width, height, pixelBuffer.length, 0, 0);
    const combined = Buffer.concat([header, metaBuffer, pixelBuffer]);
    const crc = calculateCRC32(combined);
    const crcBuf = Buffer.alloc(4);
    // crcBuf.writeUInt32BE(crc, 0);
    crcBuf.writeUInt32LE(crc, 0);
    // return Uint8Array.from(pixels);
    return Buffer.concat([combined, crcBuf]);
}

function makePixels(r, g, b, w, h) {
    const pixels = [];
    // for (let i = 0; i < w * h; i++) pixels.push(r, g, b, 0);
    for (let i = 0; i < w * h; i++) pixels.push(r, g, b, 255);
    return Buffer.from(pixels);
}

async function runTests() {
    console.log("MSI ENKODER/DEKODER TESTOVI:\n");

    // const W = 1, H = 1;
    // const W = 100, H = 100;
    const W = 10, H = 10;
    // const original = makePixels(0, 0, 0, W, H);
    // const original = makePixels(255, 255, 255, W, H);
    const original = makePixels(200, 100, 50, W, H);
    const msiFile = encodeRawMSI(original, W, H);

    // assert("Test MSI 1: Magic bytes su MSI0", msiFile.slice(0, 4).toString('hex') === '4d534930');
    assert("Test MSI 1: Magic bytes su MSI0", msiFile.slice(0, 4).toString() === 'MSI0');
    // assert("Test MSI 2: VERSION je 0x0001", msiFile.readUInt16BE(4) === 1);
    assert("Test MSI 2: VERSION je 0x0001", msiFile.readUInt16LE(4) === 1);
    assert("Test MSI 3: WIDTH je ispravan", msiFile.readUInt32LE(8) === W);
    assert("Test MSI 4: HEIGHT je ispravan", msiFile.readUInt32LE(12) === H);
    // assert("Test MSI 5: COMPRESSION je 0 (None)", msiFile[19] === 0);
    assert("Test MSI 5: COMPRESSION je 0 (None)", msiFile[18] === 0);

    const decoded = decodeMSI(msiFile, W, H);
    assert("Test MSI 6: Dekodovani niz ima ispravan broj piksela", decoded.length === W * H * 4);
    // assert("Test MSI 7: Alpha kanal je 255", decoded[3] === 0);
    assert("Test MSI 7: Alpha kanal je 255", decoded[3] === 255);

    const corrupted = Buffer.from(msiFile);
    // corrupted[15] = 0x00;
    // corrupted[corrupted.length - 1] = 0xFF;
    corrupted[15] = 0xFF;
    // corrupted[15] = 0x00;
    let threw = false;
    try { decodeMSI(corrupted, W, H); } catch(e) { threw = true; }
    assert("Test MSI 8: Korumpiran fajl baca gresku", threw);

    // const tooShort = Buffer.alloc(0);
    const tooShort = Buffer.alloc(10);
    let threw2 = false;
    try { decodeMSI(tooShort, W, H); } catch(e) { threw2 = true; }
    assert("Test MSI 9: Prekratak fajl baca gresku", threw2);

    const wrongMagic = Buffer.from(msiFile);
    wrongMagic[0] = 0x00;
    let threw3 = false;
    try { decodeMSI(wrongMagic, W, H); } catch(e) { threw3 = true; }
    assert("Test MSI 10: Pogresan magic odbijen", threw3);

    console.log(`\nREZULTAT: ${passed} proslo, ${failed} palo\n`);
}

runTests().catch(console.error);