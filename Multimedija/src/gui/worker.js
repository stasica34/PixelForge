"use strict";
const { parentPort, workerData } = require('worker_threads');
const path = require('path');

const filtersLib = require(path.join(__dirname, '..', '..', 'dist', 'src', 'helpers', 'imagefilters'));

const { filters, imageData, width, height, intensity, filterIntensities } = workerData;

try {
    // let pixels = new Uint8ClampedArray(imageData);
    let pixels = Buffer.from(imageData);
    
    for (const filter of filters) {
        const currentIntensity = (filterIntensities && filterIntensities[filter] !== undefined) 
                                 ? filterIntensities[filter] 
                                 : intensity;
                                 
        switch (filter) {
            case "grayscale":         filtersLib.applyGrayscale(pixels, currentIntensity); break;
            case "contrast":          filtersLib.applyContrast(pixels, currentIntensity); break;
            // case "flip":           filtersLib.applyFlip(pixels, width, height, "vertical"); break;
            case "flip":              filtersLib.applyFlip(pixels, width, height, "horizontal"); break;
            case "laplacian":         filtersLib.applyLaplacian(pixels, width, height, currentIntensity); break;
            case "swirl":             filtersLib.applySwirl(pixels, width, height, currentIntensity); break;
            case "colorizegrayscale": filtersLib.applyColorize(pixels, currentIntensity); break;
            case "edge_detector":     filtersLib.applyEdgeDetector(pixels, width, height, currentIntensity); break;
            case "flip_vertical":     filtersLib.applyFlip(pixels, width, height, "vertical"); break;
            case "jarvis":            filtersLib.applyJarvisJudiceNinke(pixels, width, height, currentIntensity); break;
            // default:               console.log(`nepoznat filter: ${filter}`); break;

        }
    }
    // parentPort.postMessage({ success: true, data: pixels });
    parentPort.postMessage({ success: true, data: Array.from(pixels) });
    
} catch (err) {
    // parentPort.postMessage({ success: false, error: err.message, stack: err.stack });
    parentPort.postMessage({ success: false, error: err.message });
}