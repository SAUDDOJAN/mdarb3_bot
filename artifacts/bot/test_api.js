import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("AIzaSyFakeKeyJustForTestingEndpointGeneration");

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello");
    console.log(result.response.text());
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}

test();
