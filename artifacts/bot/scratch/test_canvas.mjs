const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const canvas = createCanvas(800, 300);
const ctx = canvas.getContext('2d');
ctx.font = 'bold 45px "TajawalCustom", sans-serif';
ctx.fillText('مقاتل جديد في قيلد GW2!', 300, 100);
console.log('success');
