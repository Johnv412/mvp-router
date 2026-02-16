const axios = require('axios');
const BASE_URL = 'http://localhost:8080';
const KEY = 'dev-governor-key';

async function run() {
    try {
        console.log('🚀 Booting Commander (Slot 9)...');
        const res = await axios.post(`${BASE_URL}/v1/route`, {
            project_slot: 9,
            agent_id: 'commander-agent',
            mode: 'async',
            payload: { command: 'boot' }
        }, { headers: { 'X-GOVERNOR-KEY': KEY } });

        const { execution_id } = res.data;
        console.log(`✅ Dispatched! Execution ID: ${execution_id}`);

        // Poll status
        console.log('⏳ Polling for completion...');
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const statusRes = await axios.get(`${BASE_URL}/v1/status/${execution_id}`, {
                headers: { 'X-GOVERNOR-KEY': KEY }
            });
            const status = statusRes.data.status;
            console.log(`   Status: ${status}`);

            if (status === 'complete') {
                console.log('🎉 SUCCESS: Commander Booted!');
                // Log Result (Registry Summary)
                // Wait, v1/status doesn't return result.
                // I need to use debug script to see the result or just trust "complete".
                // Or I can update v1/status to return result if complete?
                // But NO REFACTOR rule.
                return;
            }
        }
    } catch (err) {
        console.error('❌ Failed:', err.message);
    }
}

run();
