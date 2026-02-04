const fs = require('fs');
const path = require('path');

const SHIPS_FILE = path.join(__dirname, 'data', 'ships.json');
const TARGET_SHIP_CODE = 'HCT';

const csvData = `"Ship Speed (Knots)",A-GL-Type,B-GL-Type,C-GL-Type,D-GL-Type,E-GL-Type,F-GL-Type,A-FL-Type,B-FL-Type,C-FL-Type,D-FL-Type,E-FL-Type,F-FL-Type
19.5,35.27,35.98,37.74,39.68,40.83,44.41,33.69,34.5,36.23,38.6,38.6,38.6
19,33.28,33.28,34.9,36.68,37.83,41.11,30.91,31.68,33.27,35.44,35.44,35.44
18.5,30.79,31.03,32.54,34.13,35.28,38.31,28.57,29.25,30.71,32.71,32.71,32.71
18,28.44,29.18,30.61,32.08,33.23,36.07,26.09,26.86,28.2,30.02,30.02,30.02
17.5,26.35,27.58,28.93,30.28,31.43,34.09,23.95,24.64,25.87,27.54,27.54,27.54
17,24.65,26.04,27.31,28.59,29.74,32.23,22.29,22.89,24.03,25.58,25.58,25.58
16.5,23.21,24.54,25.74,26.89,28.04,30.36,20.75,21.39,22.46,23.91,23.91,23.91
16,21.86,23.1,24.22,25.3,26.45,28.61,19.3,19.86,20.85,22.2,22.2,22.2
15.5,20.56,21.85,22.91,23.9,25.05,27.07,17.93,18.49,19.41,20.67,20.67,20.67
15,20.2,20.65,21.65,22.55,23.7,25.59,16.65,17.25,18.11,19.3,19.3,19.3
14.5,19,19.51,20.45,21.26,22.41,24.17,15.41,16.06,16.86,17.93,17.93,17.93
14,17.86,18.41,19.3,20.06,21.21,22.85,14.3,14.95,15.69,16.7,16.7,16.7
13.5,16.96,17.41,18.25,18.91,20.06,21.58,13.41,14.05,14.75,15.71,15.71,15.71
13,16.06,16.51,17.31,17.91,19.06,20.49,12.51,13.15,13.81,14.69,14.69,14.69`;

const rows = csvData.trim().split('\n');
const headers = rows.shift().split(',').map(h => h.trim());

// Indices
// 0: Speed
// 1-6: GL Types (Laden)
// 7-12: FL Types (Ballast)

const glHeaders = headers.slice(1, 7);
const flHeaders = headers.slice(7, 13);

const ladenProfiles = {};
const ballastProfiles = {};

// Initialize profiles
glHeaders.forEach(type => {
    ladenProfiles[type] = {
        id: 'L_' + type + '_' + Date.now(),
        mode: 'laden',
        type: type,
        data: []
    };
});

flHeaders.forEach(type => {
    ballastProfiles[type] = {
        id: 'B_' + type + '_' + Date.now(),
        mode: 'ballast',
        type: type,
        data: []
    };
});

rows.forEach(rowStr => {
    const cols = rowStr.split(',').map(c => parseFloat(c.trim()));
    const speed = cols[0];

    // GL Data
    glHeaders.forEach((type, idx) => {
        const foc = cols[1 + idx]; // 1-6
        if (!isNaN(foc)) {
            ladenProfiles[type].data.push({ speed, foc, rpm: 0 });
        }
    });

    // FL Data
    flHeaders.forEach((type, idx) => {
        const foc = cols[7 + idx]; // 7-12
        if (!isNaN(foc)) {
            ballastProfiles[type].data.push({ speed, foc, rpm: 0 });
        }
    });
});

const newFocManagement = [
    ...Object.values(ladenProfiles),
    ...Object.values(ballastProfiles)
];

// Helper to sort data by speed descending
newFocManagement.forEach(p => {
    p.data.sort((a, b) => b.speed - a.speed);
});

// Update ships.json
try {
    const ships = JSON.parse(fs.readFileSync(SHIPS_FILE, 'utf8'));
    const shipIndex = ships.findIndex(s => s.code === TARGET_SHIP_CODE);

    if (shipIndex === -1) {
        console.error('Ship HCT not found!');
        process.exit(1);
    }

    ships[shipIndex].focManagement = newFocManagement;

    fs.writeFileSync(SHIPS_FILE, JSON.stringify(ships, null, 2), 'utf8');
    console.log('Successfully imported FOC data for HLS CARTAGENA.');
} catch (error) {
    console.error('Error updating ships.json:', error);
    process.exit(1);
}
