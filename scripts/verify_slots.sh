#!/bin/bash
set -e

BASE_URL="http://localhost:8080"
DEV_KEY="dev-governor-key"

echo "🧪 Verifying Slots 1-5 Dispatch"
echo "Target Agent: oracle-agent"
echo "--------------------------------"

for i in {1..5}; do
  echo -n "Slot $i: "
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/v1/route" \
    -H "Content-Type: application/json" \
    -H "X-GOVERNOR-KEY: $DEV_KEY" \
    -d "{\"project_slot\":$i,\"agent_id\":\"oracle-agent\",\"mode\":\"async\",\"payload\":{\"test\":\"slot_$i\"}}")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n1)

  if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ PASS (200 OK)"
    # Extract execution_id for proof
    EXEC_ID=$(echo "$BODY" | grep -o '"execution_id":"[^"]*"' | cut -d'"' -f4)
    echo "   -> Created Execution: $EXEC_ID"
  else
    echo "❌ FAIL ($HTTP_CODE)"
    echo "   -> Body: $BODY"
    exit 1
  fi
done

echo "--------------------------------"
echo "🎉 All 5 slots verified!"
