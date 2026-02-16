const { Firestore } = require('@google-cloud/firestore');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'ediporaclev3';
const firestore = new Firestore({ projectId });

async function run() {
    const docId = 'current';
    console.log(`Fetching commander_state/${docId} from ${projectId}...`);
    try {
        const doc = await firestore.collection('commander_state').doc(docId).get();
        if (!doc.exists) {
            console.log('Doc not found');
        } else {
            console.log(JSON.stringify(doc.data(), null, 2));
        }
    } catch (e) { console.error(e); }
}
run();
