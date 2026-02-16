
const { Firestore } = require('@google-cloud/firestore');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'ediporaclev3';
const firestore = new Firestore({ projectId });

async function loadData() {
    console.log(`🚀 Loading data into Firestore project: ${projectId}`);

    const projects = [
        { slot: 1, id: 'proj_1', name: 'Audit Project', kw: 'audit' },
        { slot: 2, id: 'proj_2', name: 'Forge Project', kw: 'forge' },
        { slot: 3, id: 'proj_3', name: 'Register Project', kw: 'register' },
        { slot: 4, id: 'proj_4', name: 'Report Project', kw: 'report' },
        { slot: 5, id: 'proj_5', name: 'Status Project', kw: 'status' }
    ];

    try {
        // 1. router_projects
        console.log('📦 Writing router_projects...');
        for (const p of projects) {
            const docRef = firestore.collection('router_projects').doc(p.id);
            await docRef.set({
                slot: p.slot,
                project_id: p.id,
                name: p.name,
                description: `Auto-generated config for ${p.name}`,
                default_mode: "async",
                oracle: {
                    execute_path: "/api/oracle_execute",
                    registry_collection: "system_registry"
                },
                enabled: true
            });
            console.log(`   - Wrote ${docRef.path}`);
        }

        // 2. router_routes
        console.log('🛣️  Writing router_routes...');
        for (const p of projects) {
            const docRef = firestore.collection('router_routes').doc(p.kw);
            await docRef.set({
                keyword: p.kw,
                target_slot: p.slot,
                target_project_id: p.id
            });
            console.log(`   - Wrote ${docRef.path} -> Slot ${p.slot}`);
        }

        // 3. router_runs (Stub schema check)
        // No write required per instructions: "no writes required now unless dispatch does it"

        console.log('✅ Data load complete!');

    } catch (err) {
        console.error('❌ Failed to load data:', err);
        process.exit(1);
    }
}

if (process.env.MOCK_GCP_SERVICES === 'true') {
    console.warn('⚠️  Cannot load persistent data in MOCK MODE. Please set MOCK_GCP_SERVICES=false.');
    // We exit 0 so as not to break CI, but warn.
    process.exit(0);
}

loadData();
