const fs = require('fs');
const path = require('path');

const MOJIBAKE_PATTERN = /[ÃÂØÙâð]/;
let hasError = false;

function walkSync(dir, callback) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        const stats = fs.statSync(filepath);
        if (stats.isDirectory()) {
            walkSync(filepath, callback);
        } else if (stats.isFile()) {
            callback(filepath);
        }
    }
}

console.log('[EncodingCheck] Scanning for mojibake...');
walkSync(path.join(__dirname, 'src'), (filepath) => {
    if (!filepath.endsWith('.js') && !filepath.endsWith('.json')) return;
    
    const content = fs.readFileSync(filepath, 'utf8');
    if (MOJIBAKE_PATTERN.test(content)) {
        console.error(`[EncodingCheck] ❌ ERROR: Suspicious mojibake detected in: ${filepath}`);
        const lines = content.split('\\n');
        lines.forEach((line, index) => {
            if (MOJIBAKE_PATTERN.test(line)) {
                console.error(`  Line ${index + 1}: ${line.trim().substring(0, 80)}`);
            }
        });
        hasError = true;
    }
});

if (hasError) {
    console.error('[EncodingCheck] ❌ FAILED: Encoding corruption found. Deployment blocked.');
    process.exit(1);
} else {
    console.log('[EncodingCheck] ✅ PASSED: No encoding corruption detected.');
    process.exit(0);
}
