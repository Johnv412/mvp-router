#!/bin/bash
set -e

BASE_URL="http://localhost:8080"
DEV_KEY="dev-governor-key"
WRONG_KEY="wrong-key"

echo "🧪 MVP Router Smoke Tests"
echo "=========================="

# Test 1: GET /healthz
echo -n "Test 1: GET /healthz → 200 ... "
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/healthz")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED (HTTP $HTTP_CODE)"
  exit 1
fi
if ! echo "$BODY" | grep -q '"ok":true'; then
  echo "❌ FAILED (body: $BODY)"
  exit 1
fi
echo "✅ PASSED"

# Test 2: POST /v1/route missing X-GOVERNOR-KEY
echo -n "Test 2: POST /v1/route missing key → 401 ... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/route" \
  -H "Content-Type: application/json" \
  -d '{"project_slot":1,"agent_id":"mvp-agent","mode":"async","payload":{}}')
if [ "$HTTP_CODE" != "401" ]; then
  echo "❌ FAILED (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✅ PASSED"

# Test 3: POST /v1/route wrong key
echo -n "Test 3: POST /v1/route wrong key → 401 ... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/route" \
  -H "Content-Type: application/json" \
  -H "X-GOVERNOR-KEY: $WRONG_KEY" \
  -d '{"project_slot":1,"agent_id":"mvp-agent","mode":"async","payload":{}}')
if [ "$HTTP_CODE" != "401" ]; then
  echo "❌ FAILED (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✅ PASSED"

# Test 4: POST /v1/route invalid project_slot
echo -n "Test 4: POST /v1/route invalid slot (0) → 400 ... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/route" \
  -H "Content-Type: application/json" \
  -H "X-GOVERNOR-KEY: $DEV_KEY" \
  -d '{"project_slot":0,"agent_id":"mvp-agent","mode":"async","payload":{}}')
if [ "$HTTP_CODE" != "400" ]; then
  echo "❌ FAILED (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✅ PASSED"

# Test 5: POST /v1/route unknown agent_id
echo -n "Test 5: POST /v1/route unknown agent → 404 ... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/route" \
  -H "Content-Type: application/json" \
  -H "X-GOVERNOR-KEY: $DEV_KEY" \
  -d '{"project_slot":1,"agent_id":"unknown-agent","mode":"async","payload":{}}')
if [ "$HTTP_CODE" != "404" ]; then
  echo "❌ FAILED (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✅ PASSED"

# Test 6: GET /v1/registry with key
echo -n "Test 6: GET /v1/registry → 200, contains mvp-agent ... "
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/v1/registry" \
  -H "X-GOVERNOR-KEY: $DEV_KEY")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED (HTTP $HTTP_CODE)"
  exit 1
fi
if ! echo "$BODY" | grep -q 'mvp-agent'; then
  echo "❌ FAILED (body missing mvp-agent: $BODY)"
  exit 1
fi
echo "✅ PASSED"

# Test 7: POST /v1/route with mvp-agent
echo -n "Test 7: POST /v1/route mvp-agent → 200, has execution_id ... "
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/route" \
  -H "Content-Type: application/json" \
  -H "X-GOVERNOR-KEY: $DEV_KEY" \
  -d '{"project_slot":1,"agent_id":"mvp-agent","mode":"async","payload":{"test":true}}')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAILED (HTTP $HTTP_CODE, body: $BODY)"
  exit 1
fi
if ! echo "$BODY" | grep -q 'execution_id'; then
  echo "❌ FAILED (missing execution_id: $BODY)"
  exit 1
fi
if ! echo "$BODY" | grep -q 'firestore_path'; then
  echo "❌ FAILED (missing firestore_path: $BODY)"
  exit 1
fi
if ! echo "$BODY" | grep -q 'status_url'; then
  echo "❌ FAILED (missing status_url: $BODY)"
  exit 1
fi
echo "✅ PASSED"

# Test 8: OPTIONS /v1/route
echo -n "Test 8: OPTIONS /v1/route → CORS headers ... "
RESPONSE=$(curl -s -i -X OPTIONS "$BASE_URL/v1/route")
if ! echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin"; then
  echo "❌ FAILED (missing CORS headers)"
  exit 1
fi
if ! echo "$RESPONSE" | grep -qi "Access-Control-Allow-Methods"; then
  echo "❌ FAILED (missing Allow-Methods)"
  exit 1
fi
if ! echo "$RESPONSE" | grep -qi "Access-Control-Allow-Headers"; then
  echo "❌ FAILED (missing Allow-Headers)"
  exit 1
fi
echo "✅ PASSED"

echo ""
echo "🎉 All smoke tests passed!"
exit 0
