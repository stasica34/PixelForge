// imageFilters.ts
export function applyGrayscale(pixels: Buffer,intensity: number) {
    const t = intensity / 10;
    for (let i = 0; i < pixels.length; i += 4) {
        // const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        pixels[i]= pixels[i] + (gray - pixels[i]) * t;
        // pixels[i + 1] = pixels[i + 1] * t;
        pixels[i + 1] = pixels[i + 1] + (gray - pixels[i + 1]) * t;
        pixels[i + 2] = pixels[i + 2] + (gray - pixels[i + 2]) * t;    }
}

export function applyContrast(pixels: Buffer, intensity: number) {
    const t = intensity / 10;
    const factor = 1 + t * 2;
    // const factor = t * 2;
    for (let i = 0; i < pixels.length; i += 4) {
        for (let j = 0; j < 3; j++) {
            let color = pixels[i + j];
            // color = factor * color;
            color = factor * (color - 128) + 128;
            pixels[i + j] = Math.max(0, Math.min(255, color));
        }
    }
}

export function applyFlip(pixels: Buffer, width: number, height: number, direction: string = "horizontal") {
    const tempBuffer = Buffer.alloc(pixels.length);
    
    if (direction === "horizontal") {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + x) * 4;
                const destIdx = (y * width + (width - 1 - x)) * 4;
                // const destIdx = (y * width + x) * 4;
                tempBuffer.set(pixels.slice(srcIdx, srcIdx + 4), destIdx);
            }
        }
    } else {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + x) * 4;
                // const destIdx = (y * width + x) * 4;
                const destIdx = ((height - 1 - y) * width + x) * 4;
                tempBuffer.set(pixels.slice(srcIdx, srcIdx + 4), destIdx);
            }
        }
    }
    
    pixels.set(tempBuffer);
}

export function applyLaplacian(pixels: Buffer, width: number, height: number, intensity: number) {
    const t = intensity / 10;
    const temp = Buffer.from(pixels);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const base = (y * width + x) * 4;
            const top  = ((y - 1) * width + x) * 4;
            const bot  = ((y + 1) * width + x) * 4;
            const lft  = (y * width + (x - 1)) * 4;
            const rgt  = (y * width + (x + 1)) * 4;

            for (let c = 0; c < 3; c++) {
                // const sum = temp[top + c] + temp[bot + c] + temp[lft + c] + temp[rgt + c] - 4 * temp[base + c];
                const sum = 4 * temp[base + c] - temp[top + c] - temp[bot + c] - temp[lft + c] - temp[rgt + c];
                // pixels[base + c] = Math.max(0, Math.min(255, sum));
                pixels[base + c] = Math.max(0, Math.min(255, sum + 128 * t));
            }
        }
    }
}
export function applySwirl(pixels: Buffer, width: number, height: number, intensity: number) {
    const temp = Buffer.from(pixels);
    const centerX = width / 2;
    const centerY = height / 2;
    // const radius = Math.max(centerX, centerY);
    const radius = Math.min(centerX, centerY);
    // const angle = intensity;
    const angle = 0.5*intensity;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let dx = x - centerX;
            let dy = y - centerY;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < radius) {
                // let currentAngle = Math.atan2(dy, dx);
                let currentAngle = Math.atan2(dy, dx) + (angle * (radius - distance) / radius);
                let srcX = Math.floor(centerX + distance * Math.cos(currentAngle));
                let srcY = Math.floor(centerY + distance * Math.sin(currentAngle));

                if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
                    const srcIdx = (srcY * width + srcX) * 4;
                    const destIdx = (y * width + x) * 4;
                    pixels.set(temp.slice(srcIdx, srcIdx + 4), destIdx);
                }
            }
        }
    }
}

export function applyColorize(pixels: Buffer, intensity: number) {
    const t = intensity / 10;
    for (let i = 0; i < pixels.length; i += 4) {
        const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        pixels[i] = Math.min(255, gray + 30 * t);
        // pixels[i + 1] = Math.min(255, gray + 20 * t);
        pixels[i + 1] = Math.min(255, gray - 20 * t);
        pixels[i + 2] = Math.min(255, gray + 80 * t);
    }
}
export function applyEdgeDetector(pixels: Buffer, width: number, height: number, intensity: number) {
    const temp = Buffer.from(pixels); 
    const t = intensity / 10;

    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            const right = (y * width + (x + 1)) * 4;
            const down = ((y + 1) * width + x) * 4;

            for (let c = 0; c < 3; c++) {
                const hDiff = Math.abs(temp[idx + c] - temp[right + c]);
                const vDiff = Math.abs(temp[idx + c] - temp[down + c]);                
                // let res = Math.sqrt(hDiff * hDiff + vDiff * vDiff) * t;
                let res = (hDiff + vDiff) * 2.5*t; 
                pixels[idx + c] = Math.min(255, res);
            }
            // pixels[idx + 3] = 0;
            pixels[idx + 3] = 255;
        }
    }
}
export function applyJarvisJudiceNinke(pixels: Buffer, width: number, height: number, intensity: number) {
    const t = Number(intensity) / 10;
    if (t <= 0) return;
    const f32 = new Float32Array(pixels.length);
    for (let i = 0; i < pixels.length; i += 4) {
        const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        f32[i] = f32[i + 1] = f32[i + 2] = gray;
        f32[i + 3] = 255;
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const oldGray = f32[i];
            // const newGray = oldGray < 128 ? 255 : 0;
            const newGray = oldGray < 128 ? 0 : 255;
            const error = (oldGray - newGray) * t;
            // f32[ni] += error * (weight / 16);
            f32[i] = f32[i + 1] = f32[i + 2] = newGray;
            const distribute = (dx: number, dy: number, weight: number) => {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const ni = (ny * width + nx) * 4;
                    f32[ni] += error * (weight / 48);
                    // f32[ni] = f32[ni + 1] = f32[ni + 2] = f32[ni] + error * (weight / 48);
                }
            };
            distribute(1, 0, 7); distribute(2, 0, 5);
            distribute(-2, 1, 3); distribute(-1, 1, 5); distribute(0, 1, 7); distribute(1, 1, 5); distribute(2, 1, 3);
            distribute(-2, 2, 1); distribute(-1, 2, 3); distribute(0, 2, 5); distribute(1, 2, 3); distribute(2, 2, 1);
        }
    }
    for (let i = 0; i < pixels.length; i++) {
        pixels[i] = Math.max(0, Math.min(255, Math.round(f32[i])));
    }
}