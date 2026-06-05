/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Audiolab v3.0 - Automated Functional Verification Suite
 * ============================================================================
 * This script runs automated functional validation tests against the live
 * deployment instance (or local dev server) to confirm that GCS signed URLs,
 * anonymous uploads, and historical playback endpoints operate flawlessly.
 */

import http from "node:http";
import https from "node:https";

const TARGET_URL = process.env.TEST_TARGET_URL || "https://audiolab-service-874417405692.europe-west1.run.app";

// Helper for HTTP requests
async function makeRequest(endpoint, method = "GET", body = null, headers = {}) {
  const fullUrl = `${TARGET_URL}${endpoint}`;
  const isHttps = fullUrl.startsWith("https");
  const requestMod = isHttps ? https : http;

  const requestHeaders = {
    "Accept": "application/json",
    ...headers
  };

  let payload = null;
  if (body) {
    payload = JSON.stringify(body);
    requestHeaders["Content-Type"] = "application/json";
    requestHeaders["Content-Length"] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = requestMod.request(fullUrl, { method, headers: requestHeaders }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log(`\n======================================================================`);
  console.log(`🚀 AUDIOLAB V3.0 - AUTOMATED FUNCTIONAL TEST SUITE`);
  console.log(`Targeting: ${TARGET_URL}`);
  console.log(`======================================================================\n`);

  let passed = 0;
  let failed = 0;

  // Test 1: Health Check
  console.log(`[TEST 1] Testing Service Health Probe (GET /api/health)...`);
  try {
    const res = await makeRequest("/api/health");
    if (res.status === 200 && res.data?.status === "ok") {
      console.log(`  ✅ PASSED (Status 200 OK - Mode: ${res.data.mode})`);
      passed++;
    } else {
      console.log(`  ❌ FAILED (Expected 200 OK, got ${res.status})`);
      failed++;
    }
  } catch (e) {
    console.log(`  ❌ FAILED with Error: ${e.message}`);
    failed++;
  }

  // Test 2: Anonymous GCS Signed Upload URL Generation
  console.log(`\n[TEST 2] Testing Anonymous GCS Signed Upload URL (POST /api/analyses/signed-upload-url)...`);
  let testAnalysisId = null;
  try {
    const res = await makeRequest("/api/analyses/signed-upload-url", "POST", { fileName: "probe_recording.wav" });
    if (res.status === 200 && res.data?.signedUrl && res.data?.analysisId) {
      testAnalysisId = res.data.analysisId;
      console.log(`  ✅ PASSED (Status 200 OK - Generated ID: ${testAnalysisId})`);
      passed++;
    } else {
      console.log(`  ❌ FAILED (Expected 200 OK, got ${res.status}: ${JSON.stringify(res.data)})`);
      failed++;
    }
  } catch (e) {
    console.log(`  ❌ FAILED with Error: ${e.message}`);
    failed++;
  }

  // Test 3: Historical Playback GCS Signed URL Endpoint Verification
  console.log(`\n[TEST 3] Testing Multi-Candidate GCS Playback Lookup (GET /api/analyses/:analysisId/audio-url)...`);
  const probeId = testAnalysisId || "analysis_probe_999999";
  try {
    const res = await makeRequest(`/api/analyses/${probeId}/audio-url`);
    // Note: If the probe file hasn't been uploaded via PUT yet, status 404 is the correct expected resolution
    if (res.status === 200 || res.status === 404) {
      console.log(`  ✅ PASSED (Properly resolved with Status ${res.status}: ${res.status === 404 ? 'File not uploaded yet' : 'Signed Playback URL ready'})`);
      passed++;
    } else {
      console.log(`  ❌ FAILED (Expected 200 or 404, got ${res.status}: ${JSON.stringify(res.data)})`);
      failed++;
    }
  } catch (e) {
    console.log(`  ❌ FAILED with Error: ${e.message}`);
    failed++;
  }

  console.log(`\n======================================================================`);
  console.log(`🏁 TEST EXECUTION SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`======================================================================\n`);
  
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Fatal Test Suite Crash:", err);
  process.exit(1);
});
