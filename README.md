MVP Router - Developer Guide
Overview
The MVP Router is a lightweight Express server that routes agent requests to workflow stubs. It supports 9 project slots, each containing multiple agents with enable/disable controls.

Quick Start
1. Install Dependencies
npm install
2. Start the Server
npm start
The server will start on http://localhost:8080.

3. Run Smoke Tests
chmod +x scripts/smoke_mvp_router.sh
./scripts/smoke_mvp_router.sh
Configuration
Dev Key
The default development key is: dev-governor-key

To change it, modify the DEV_GOVERNOR_KEY constant in server.js:

const DEV_GOVERNOR_KEY = 'your-new-key-here';
For production, use an environment variable:

const DEV_GOVERNOR_KEY = process.env.GOVERNOR_KEY || 'dev-governor-key';
Registry Configuration
The registry.json file defines all 9 project slots and their agents. Each agent has:

enabled: Boolean kill switch
workflow_stub: Stub workflow path (for MVP)
Adding Slot 10+ (No Code Changes Required)
To add more slots, simply edit registry.json:

{
  "1": { ... },
  "2": { ... },
  ...
  "9": { ... },
  "10": {
    "new-agent": {
      "enabled": true,
      "workflow_stub": "stub://new-workflow"
    }
  }
}
Then update the validation in server.js to allow higher slot numbers:

if (!Number.isInteger(project_slot) || project_slot < 1 || project_slot > 10) {
API Endpoints
1. GET /healthz
Health check endpoint.

Response:

{ "ok": true }
2. OPTIONS /v1/route
CORS preflight for /v1/route.

Headers:

Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-GOVERNOR-KEY
3. POST /v1/route
Main routing endpoint. Requires X-GOVERNOR-KEY header.

Request:

{
  "project_slot": 1,
  "agent_id": "mvp-agent",
  "mode": "async",
  "payload": { "any": "data" }
}
Response (200):

{
  "ok": true,
  "request_id": "uuid",
  "execution_id": "exec_uuid",
  "project_slot": 1,
  "agent_id": "mvp-agent",
  "firestore_path": "executions/exec_uuid",
  "status_url": "/v1/status/exec_uuid"
}
Error Codes:

401: Missing or invalid X-GOVERNOR-KEY
400: Invalid project_slot (must be 1-9) or mode (must be async)
404: Unknown agent_id in the specified slot
403: Agent is disabled
4. GET /v1/registry
Returns all enabled agents across all slots. Requires X-GOVERNOR-KEY header.

Response:

{
  "ok": true,
  "request_id": "uuid",
  "registry": {
    "1": {
      "mvp-agent": {
        "enabled": true,
        "workflow_stub": "stub://mvp-workflow"
      }
    }
  }
}
5. GET /v1/status/:execution_id
Check execution status. Requires X-GOVERNOR-KEY header.

Response:

{
  "ok": true,
  "request_id": "uuid",
  "execution_id": "exec_uuid",
  "status": "queued|running|success|error",
  "progress": 0-100
}
What's Stubbed (MVP)
Workflow Trigger
The workflow trigger is stubbed. When a route request is received:

An execution_id is generated
The execution is stored in-memory with status queued
After 100ms, status changes to running (progress: 50)
After 500ms, status changes to success (progress: 100)
To replace with real workflow execution:

Replace the stub logic in server.js around line 110:

// Replace this stub:
setTimeout(() => { ... }, 100);

// With real workflow trigger:
const workflowClient = new WorkflowsClient();
await workflowClient.createExecution({
  parent: agent.workflow_stub,
  execution: { argument: JSON.stringify(payload) }
});
Firestore Path
The firestore_path is a string stub: executions/<execution_id>.

To replace with real Firestore:

Install Firestore: npm install @google-cloud/firestore
Initialize client:
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();
Replace the stub path generation with actual document creation:
const docRef = db.collection('executions').doc(execution_id);
await docRef.set({ project_slot, agent_id, status: 'queued', ... });
const firestore_path = docRef.path;
Observability
All requests generate a unique request_id (UUID) that appears in:

Console logs
JSON responses
Logs include the request ID and key actions, but never log payload content by default.

Testing
The smoke test script (scripts/smoke_mvp_router.sh) validates:

✅ Health check returns 200
✅ Missing auth key returns 401
✅ Wrong auth key returns 401
✅ Invalid project_slot returns 400
✅ Unknown agent_id returns 404
✅ Registry endpoint returns mvp-agent
✅ Valid route request returns execution_id, firestore_path, status_url
✅ OPTIONS returns CORS headers
Run with: ./scripts/smoke_mvp_router.sh

Project Structure
mvp-router/
├── server.js              # Main Express server
├── registry.json          # 9-slot agent registry
├── package.json           # Dependencies
├── scripts/
│   └── smoke_mvp_router.sh  # Smoke tests
└── README_DEV.md          # This file
Next Steps
Replace workflow stub with real Google Cloud Workflows client
Replace Firestore path stub with real Firestore writes
Add environment-based configuration (dev/staging/prod keys)
Add structured logging (e.g., Winston, Bunyan)
Add request/response validation middleware
Deploy to Cloud Run or similar platform
