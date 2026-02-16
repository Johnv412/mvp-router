require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { ExecutionsClient } = require('@google-cloud/workflows');
const { Firestore } = require('@google-cloud/firestore');
const axios = require('axios');

// Initialize Logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'mvp-router' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const app = express();
const PORT = process.env.PORT || 8080;
const GOVERNOR_KEY = process.env.GOVERNOR_KEY || 'dev-governor-key';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const FIRESTORE_COLLECTION = process.env.FIRESTORE_COLLECTION || 'executions';
const USE_MOCK_GCP = process.env.MOCK_GCP_SERVICES === 'true';

// --- Google Cloud Client Initialization ---
let workflowsClient;
let firestore;

if (USE_MOCK_GCP) {
  logger.warn('⚠️  Running with MOCK GCP SERVICES');

  // Mock Workflows Client
  workflowsClient = {
    createExecution: async ({ parent, execution }) => {
      const executionId = `mock_exec_${uuidv4()}`;
      return [{
        name: `${parent}/executions/${executionId}`,
        state: 'ACTIVE',
        result: null
      }];
    }
  };

  // Mock Firestore
  const mockDb = new Map();
  firestore = {
    collection: (colName) => ({
      doc: (docId) => ({
        set: async (data) => {
          mockDb.set(`${colName}/${docId}`, data);
          logger.info(`[MockFirestore] Set ${colName}/${docId}`, data);
        },
        get: async () => {
          const data = mockDb.get(`${colName}/${docId}`);
          return {
            exists: !!data,
            data: () => data
          };
        }
      })
    })
  };

} else {
  // Real Clients
  logger.info('Initializing Real Google Cloud Clients');
  workflowsClient = new ExecutionsClient();
  firestore = new Firestore({
    projectId: PROJECT_ID,
  });
}
// ------------------------------------------

// Middleware
app.use(express.json());

// Load registry
let registry = {};
try {
  const registryPath = path.join(__dirname, 'registry.json');
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  logger.info(`Registry loaded with ${Object.keys(registry).length} slots`);
} catch (err) {
  logger.error('Failed to load registry.json', { error: err.message });
  process.exit(1);
}

// Auth middleware
function requireAuth(req, res, next) {
  const key = req.get('X-GOVERNOR-KEY');
  if (key !== GOVERNOR_KEY) {
    logger.warn('Unauthorized access attempt');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// 1. GET /healthz
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

// 2. OPTIONS /v1/route (CORS preflight)
app.options('/v1/route', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-GOVERNOR-KEY');
  res.status(204).send();
});

// 3. POST /v1/route
app.post('/v1/route', requireAuth, async (req, res) => {
  const request_id = uuidv4();
  logger.info('Incoming route request', { request_id });

  const { project_slot, agent_id, mode, payload } = req.body;

  // Validation
  if (!project_slot || !agent_id || !mode || payload === undefined) {
    logger.warn('Missing required fields', { request_id });
    return res.status(400).json({
      ok: false,
      error: 'Missing required fields: project_slot, agent_id, mode, payload',
      request_id
    });
  }

  if (!Number.isInteger(project_slot) || project_slot < 1 || project_slot > 9) {
    logger.warn('Invalid project_slot', { request_id, project_slot });
    return res.status(400).json({
      ok: false,
      error: 'project_slot must be an integer between 1 and 9',
      request_id
    });
  }

  if (mode !== 'async') {
    logger.warn('Invalid mode', { request_id, mode });
    return res.status(400).json({
      ok: false,
      error: 'Only async mode is supported',
      request_id
    });
  }

  // Check slot exists
  const slot = registry[String(project_slot)];
  if (!slot) {
    logger.warn('Slot not found', { request_id, project_slot });
    return res.status(404).json({
      ok: false,
      error: `Project slot ${project_slot} not found`,
      request_id
    });
  }

  // Check agent exists
  const agent = slot[agent_id];
  if (!agent) {
    logger.warn('Agent not found', { request_id, agent_id });
    return res.status(404).json({
      ok: false,
      error: `Agent '${agent_id}' not found in project slot ${project_slot}`,
      request_id
    });
  }

  // Check agent enabled
  if (!agent.enabled) {
    logger.warn('Agent disabled', { request_id, agent_id });
    return res.status(403).json({
      ok: false,
      error: `Agent '${agent_id}' is disabled`,
      request_id
    });
  }

  // Execute Workflow
  try {
    const workflowPath = agent.workflow_stub;
    logger.info(`Triggering workflow: ${workflowPath}`, { request_id });

    // Handle "stub://" protocol
    if (workflowPath.startsWith('stub://')) {
      const execution_id = `stub_${uuidv4()}`;
      const firestore_path = `${FIRESTORE_COLLECTION}/${execution_id}`;

      await firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).set({
        project_slot,
        agent_id,
        status: 'queued',
        progress: 0,
        created_at: new Date().toISOString(),
        request_id,
        mode
      });

      logger.info(`Stub execution created: ${execution_id}`, { request_id });

      return res.status(200).json({
        ok: true,
        request_id,
        execution_id,
        project_slot,
        agent_id,
        firestore_path,
        status_url: `/v1/status/${execution_id}`
      });
    }

    // Handle "http(s)://" protocol (Oracle functions/Cloud Run)
    if (workflowPath.startsWith('http')) {
      const execution_id = `http_${uuidv4()}`;
      const firestore_path = `${FIRESTORE_COLLECTION}/${execution_id}`;

      // 1. Write initial status (Queued)
      await firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).set({
        project_slot,
        agent_id,
        status: 'queued',
        progress: 0,
        created_at: new Date().toISOString(),
        request_id,
        mode,
        workflow_stub: workflowPath
      });
      logger.info(`HTTP execution queued: ${execution_id}`, { request_id });

      // 2. Trigger HTTP Call (Async)
      axios.post(workflowPath, payload, {
        headers: { 'X-GOVERNOR-KEY': GOVERNOR_KEY }
      })
        .then(response => {
          logger.info(`HTTP execution success: ${execution_id}`);
          firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).update({
            status: 'complete',
            result: response.data,
            completed_at: new Date().toISOString()
          }).catch(err => logger.error(`Failed to update HTTP status (complete): ${execution_id}`, { error: err.message }));
        })
        .catch(err => {
          logger.error(`HTTP execution failed: ${execution_id}`, { error: err.message });
          firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).update({
            status: 'oracle_error',
            error: err.message,
            completed_at: new Date().toISOString()
          }).catch(fsErr => logger.error(`Failed to update HTTP status (error): ${execution_id}`, { error: fsErr.message }));
        });

      return res.status(200).json({
        ok: true,
        request_id,
        execution_id,
        project_slot,
        agent_id,
        firestore_path,
        status_url: `/v1/status/${execution_id}`
      });
    }

    // Handle "internal://" protocol (Commander Boot / System Tasks)
    if (workflowPath.startsWith('internal://')) {
      const execution_id = `cmd_${uuidv4()}`;
      const firestore_path = `${FIRESTORE_COLLECTION}/${execution_id}`;

      // 1. Initial Status (Queued)
      await firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).set({
        project_slot,
        agent_id,
        status: 'queued',
        progress: 0,
        created_at: new Date().toISOString(),
        request_id,
        mode,
        workflow_stub: workflowPath
      });

      if (workflowPath === 'internal://commander_boot') {
        try {
          // 2. Build Registry Summary
          const summary = {};
          for (const [s, agents] of Object.entries(registry)) {
            for (const [aId, conf] of Object.entries(agents)) {
              if (conf.enabled) {
                if (!summary[s]) summary[s] = [];
                summary[s].push(aId);
              }
            }
          }
          const commands = ['boot', 'status', 'list_agents', 'dispatch'];

          // 3. Write Commander State
          await firestore.collection('commander_state').doc('current').set({
            updated_at: new Date().toISOString(),
            boot_time: new Date().toISOString(),
            registry_summary: summary,
            available_commands: commands,
            status: 'online'
          });
          logger.info('Commander state updated: commander_state/current');

          // 4. Complete Execution
          await firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).update({
            status: 'complete',
            result: {
              registry: summary,
              commands: commands,
              message: 'Commander Booted Successfully'
            },
            completed_at: new Date().toISOString()
          });

        } catch (err) {
          logger.error('Commander boot failed', { error: err.message });
          await firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).update({
            status: 'internal_error',
            error: err.message
          });
        }
      }

      return res.status(200).json({
        ok: true,
        request_id,
        execution_id,
        project_slot,
        agent_id,
        firestore_path,
        status_url: `/v1/status/${execution_id}`
      });
    }

    // Workflows Execution Logic (Resilient Pattern)
    // 1. Generate ID and Write to Firestore (QUEUED)
    const uniqueId = uuidv4();
    const executionId = `exec_${uniqueId}`; // Local ID for tracking
    const firestorePath = `${FIRESTORE_COLLECTION}/${executionId}`;

    logger.info(`Creating initial execution record: ${executionId}`, { request_id });

    try {
      await firestore.collection(FIRESTORE_COLLECTION).doc(executionId).set({
        project_slot,
        agent_id,
        status: 'queued',
        progress: 0,
        created_at: new Date().toISOString(),
        request_id,
        mode,
        workflow_execution_name: null // Will be updated if workflow starts
      });
    } catch (fsErr) {
      logger.error('Failed to write initial record to Firestore', { error: fsErr.message });
      throw fsErr; // If we can't write to DB, we should fail the request
    }

    // 2. Attempt Workflow Execution
    try {
      const createExecutionRequest = {
        parent: workflowPath,
        execution: {
          argument: JSON.stringify(payload),
        },
      };

      const [execution] = await workflowsClient.createExecution(createExecutionRequest);
      const executionName = execution.name;

      // Update Firestore with real Workflow ID
      await firestore.collection(FIRESTORE_COLLECTION).doc(executionId).update({
        status: execution.state || 'ACTIVE',
        workflow_execution_name: executionName
      });

      logger.info(`Workflow execution started: ${executionName}`, { request_id });

    } catch (wfErr) {
      logger.error('Workflow execution failed (config or permissions)', { error: wfErr.message });

      // Update status to error but return success to user (since record exists)
      await firestore.collection(FIRESTORE_COLLECTION).doc(executionId).update({
        status: 'workflow_error',
        error_details: wfErr.message
      });

      // We still return 200 because the "request" was accepted and logged
    }

    res.status(200).json({
      ok: true,
      request_id,
      execution_id: executionId,
      project_slot,
      agent_id,
      firestore_path: firestorePath,
      status_url: `/v1/status/${executionId}`
    });

  } catch (err) {
    logger.error('Failed to execute workflow', { request_id, error: err.message });
    res.status(500).json({
      ok: false,
      error: `Internal Server Error: ${err.message}`,
      request_id
    });
  }
});

// 4. GET /v1/registry
app.get('/v1/registry', requireAuth, (req, res) => {
  const request_id = uuidv4();
  logger.info('Registry request', { request_id });

  const enabledAgents = {};
  for (const [slot, agents] of Object.entries(registry)) {
    enabledAgents[slot] = {};
    for (const [agentId, agentConfig] of Object.entries(agents)) {
      if (agentConfig.enabled) {
        enabledAgents[slot][agentId] = agentConfig;
      }
    }
  }

  res.status(200).json({
    ok: true,
    request_id,
    registry: enabledAgents
  });
});

// 5. GET /v1/status/:execution_id
app.get('/v1/status/:execution_id', requireAuth, async (req, res) => {
  const request_id = uuidv4();
  const { execution_id } = req.params;

  logger.info('Status check', { request_id, execution_id });

  try {
    const doc = await firestore.collection(FIRESTORE_COLLECTION).doc(execution_id).get();

    if (!doc.exists) {
      return res.status(404).json({
        ok: false,
        error: 'Execution not found',
        request_id
      });
    }

    const data = doc.data();
    res.status(200).json({
      ok: true,
      request_id,
      execution_id,
      status: data.status,
      progress: data.progress || 0
    });

  } catch (err) {
    logger.error('Failed to get status', { request_id, error: err.message });
    res.status(500).json({
      ok: false,
      error: `Internal Server Error: ${err.message}`,
      request_id
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`MVP Router Server listening on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  if (USE_MOCK_GCP) {
    logger.info('Running with MOCK GCP SERVICES');
  } else {
    logger.info(`Project: ${PROJECT_ID}`);
  }
});
