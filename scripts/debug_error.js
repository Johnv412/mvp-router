const { Firestore } = require('@google-cloud/firestore');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'ediporaclev3';
const firestore = new Firestore({ projectId });

async function run() {
    const docId = 'http_4eef46bf-055a-434d-b351-a4cebcb3289a';
    console.log(`Fetching ${docId} from ${projectId}...`);
    try {
        const doc = await firestore.collection('executions').doc(docId).get();
        if (!doc.exists) {
            console.log('Doc not found');
        } else {
            console.log(doc.data());
        }
    } catch (e) { console.error(e); }
}
run();
