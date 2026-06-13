// Dev helper: copy the locally-downloaded embedding model into the Mneme cache
// layout so `mneme.exe` finds it under `npm start` — no network download.
//
// Source (the local dev copy, gitignored):
//   temp/mneme-model/onnx/model_int8.onnx
//   temp/mneme-model/tokenizer.json
// Target (Mneme's cache layout, per mneme/src/model/mod.rs):
//   <config-dir>/persephone/data/mneme/models/gte-multilingual-base-int8-v1/model.onnx
//   <config-dir>/persephone/data/mneme/models/gte-multilingual-base-int8-v1/tokenizer.json
//
// Idempotent: skips files that already exist at the target.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(repoRoot, "temp", "mneme-model");

// Mirror dirs::config_dir() across platforms (Windows: %APPDATA%/Roaming).
function configDir() {
    if (process.platform === "win32") {
        return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    }
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support");
    }
    return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

const modelDirName = "gte-multilingual-base-int8-v1";
const targetDir = path.join(configDir(), "persephone", "data", "mneme", "models", modelDirName);

const files = [
    { from: path.join(srcDir, "onnx", "model_int8.onnx"), to: path.join(targetDir, "model.onnx") },
    { from: path.join(srcDir, "tokenizer.json"), to: path.join(targetDir, "tokenizer.json") },
];

if (!fs.existsSync(srcDir)) {
    console.error(`[mneme:model] Local dev model not found at ${srcDir}`);
    console.error("[mneme:model] Download gte-multilingual-base (int8 ONNX) + tokenizer there first, or run `mneme.exe model-update`.");
    process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

let copied = 0;
let skipped = 0;
for (const { from, to } of files) {
    if (!fs.existsSync(from)) {
        console.error(`[mneme:model] Missing source file: ${from}`);
        process.exit(1);
    }
    if (fs.existsSync(to)) {
        console.log(`[mneme:model] Already present, skipping: ${to}`);
        skipped++;
        continue;
    }
    fs.copyFileSync(from, to);
    console.log(`[mneme:model] Copied ${from} -> ${to}`);
    copied++;
}

console.log(`[mneme:model] Done. Copied ${copied}, skipped ${skipped}. Model cache: ${targetDir}`);
