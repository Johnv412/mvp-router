const axios = require('axios');
const BASE_URL = 'http://localhost:8080';
const KEY = 'dev-governor-key';

async function run() {
    try {
        console.log('🚀 Dispatching Phase 5 Test (Slot 2 -> Real Oracle)...');
        const res = await axios.post(`${BASE_URL}/v1/route`, {
            project_slot: 2,
            agent_id: 'oracle-agent',
            mode: 'async',
            payload: { task: 'phase_5_verification' }
        }, { headers: { 'X-GOVERNOR-KEY': KEY } });

        const { execution_id } = res.data;
        console.log(`✅ Dispatched! Execution ID: ${execution_id}`);

        // Poll status
        console.log('⏳ Polling for completion...');
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const statusRes = await axios.get(`${BASE_URL}/v1/status/${execution_id}`, {
                headers: { 'X-GOVERNOR-KEY': KEY }
            });
            const status = statusRes.data.status;
            console.log(`   Status: ${status}`);

            if (status === 'complete') {
                console.log('🎉 SUCCESS: Execution Complete!');
                console.log('Result:', JSON.stringify(statusRes.data, null, 2)); // Use statusRes.data here
                return;
            }
            if (status === 'oracle_error') {
                console.error('❌ FAIL: Oracle Error');
                console.error(statusRes.data);
                return;
            }
        }
        console.error('⚠️  Timeout waiting for completion');
    } catch (err) {
        console.error('❌ Failed:', err.message);
        if (err.response) console.error(err.response.data);
    }
}

run();
