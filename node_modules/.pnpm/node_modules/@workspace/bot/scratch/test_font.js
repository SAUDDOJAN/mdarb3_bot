import { GlobalFonts } from "@napi-rs/canvas";
import path from "path";

const fontPath = path.join(process.cwd(), "assets", "Tajawal-Bold.ttf");
console.log("Registering:", fontPath);
const result = GlobalFonts.registerFromPath(fontPath, "TajawalCustom");
console.log("Result:", result);
const isRegistered = GlobalFonts.has("TajawalCustom");
console.log("Is Registered (TajawalCustom):", isRegistered);
