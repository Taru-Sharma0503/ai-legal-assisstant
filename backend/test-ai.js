import assert from "assert";
import { detectLanguage } from "./src/modules/ai/language.js";
import { askService } from "./src/modules/ai/ai.service.js";
import { detectService, filterChunksByService, retrieve } from "./src/modules/ai/rag.service.js";
import { askSchema } from "./src/modules/ai/ai.schema.js";

async function runTests() {
  console.log("=== RUNNING RAG AI MODULE TEST SUITE ===");
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Test 1: Language Detection
  test("1. Language Detection - English", () => {
    assert.strictEqual(detectLanguage("What documents are required for income certificate?"), "en");
  });

  test("2. Language Detection - Hindi (Devanagari)", () => {
    assert.strictEqual(detectLanguage("आय प्रमाण पत्र के लिए क्या दस्तावेज़ चाहिए?"), "hi");
  });

  test("3. Language Detection - Hinglish (Roman Hindi)", () => {
    assert.strictEqual(detectLanguage("domicile certificate bnwane ke liye kaun se documents chahiy"), "hinglish");
  });

  // Test 2: Service Detection & Topic Isolation
  test("4. Service Detection - Domicile Certificate", () => {
    assert.strictEqual(detectService("domicile certificate bnwane ke liye kaun se documents chahiy"), "up_domicile_certificate");
  });

  test("5. Service Detection - Income Certificate", () => {
    assert.strictEqual(detectService("income certificate ke liye eligibility kya hai"), "up_income_certificate");
  });

  test("6. Service Topic Isolation - Filter Chunks", () => {
    const dummyChunks = [
      { service_id: "up_income_certificate", topic: "documents" },
      { service_id: "up_domicile_certificate", topic: "documents" }
    ];
    const filtered = filterChunksByService(dummyChunks, "up_domicile_certificate");
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].service_id, "up_domicile_certificate");
  });

  // Test 3: Grounding / Unknown Field Guardrail
  await asyncTest("7. Grounding Guardrail - Unknown processing time query", async () => {
    const res = await askService({
      question: "domicile certificate aane mein kitne din lagte hain",
      language: "auto"
    });
    assert.strictEqual(res.needs_human, true);
    assert.strictEqual(res.generation_status, "guardrail");
  });

  // Test 4: Schema Validation
  test("8. Request Schema Validation", () => {
    const validReq = askSchema.parse({
      question: "domicile certificate documents",
      state: "Uttar Pradesh",
      language: "hinglish"
    });
    assert.strictEqual(validReq.language, "hinglish");
  });

  // Test 5: Integration RAG Ask - Hinglish Document Query
  await asyncTest("9. Integration Test - /ai/ask Hinglish Domicile Document Query", async () => {
    const res = await askService({
      question: "domicile certificate bnwane ke liye kaun se documents chahiy",
      language: "auto"
    });

    assert.ok(res.answer, "Answer should not be empty");
    assert.strictEqual(res.language_used, "hinglish");
    assert.ok(["gemini", "groq", "fallback"].includes(res.generation_status), `Status was ${res.generation_status}`);
    assert.ok(res.confidence > 0, "Confidence should be > 0");
    assert.ok(Array.isArray(res.sources), "Sources should be an array");
    console.log("   --> Generation Status:", res.generation_status);
    console.log("   --> Confidence Score:", res.confidence);
    console.log("   --> Sources Count:", res.sources.length);
    console.log("   --> Answer Preview:", res.answer.slice(0, 120) + "...");
  });

  console.log(`\n=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) process.exit(1);
}

runTests();
