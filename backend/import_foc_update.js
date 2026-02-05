const fs = require('fs');
const path = require('path');

// CSV data from Google Sheet
const csvData = `LADEN,,,,,,,,,,,,
"Ship  Speed
 (Knots)",A-GL-Type,B-GL-Type,C-GL-Type,D-GL-Type,E-GL-Type,F-GL-Type,A-FL-Type,B-FL-Type,C-FL-Type,D-FL-Type,E-FL-Type,F-FL-Type
19.50,3.53,3.60,3.77,3.97,4.08,4.43,3.37,3.45,3.62,3.86,3.86,4.28
19.00,3.33,3.33,3.49,3.67,3.78,4.10,3.09,3.17,3.33,3.54,3.54,3.93
18.50,3.08,3.10,3.25,3.41,3.53,3.81,2.86,2.92,3.07,3.27,3.27,3.63
18.00,2.84,2.92,3.06,3.21,3.32,3.59,2.61,2.69,2.82,3.00,3.00,3.33
17.50,2.63,2.76,2.89,3.03,3.14,3.39,2.40,2.46,2.59,2.75,2.75,3.06
17.00,2.46,2.60,2.73,2.86,2.97,3.20,2.23,2.29,2.40,2.56,2.56,2.84
16.50,2.32,2.45,2.57,2.69,2.80,3.01,2.08,2.14,2.25,2.39,2.39,2.65
16.00,2.19,2.31,2.42,2.53,2.64,2.84,1.93,1.99,2.08,2.22,2.22,2.46
15.50,2.06,2.18,2.29,2.39,2.50,2.68,1.79,1.85,1.94,2.07,2.07,2.29
15.00,2.02,2.06,2.17,2.25,2.37,2.53,1.67,1.73,1.81,1.93,1.93,2.14
14.50,1.90,1.95,2.05,2.13,2.24,2.39,1.54,1.61,1.69,1.79,1.79,1.99
14.00,1.79,1.84,1.93,2.01,2.12,2.25,1.43,1.49,1.57,1.67,1.67,1.85
13.50,1.70,1.74,1.82,1.89,2.01,2.13,1.34,1.40,1.48,1.57,1.57,1.74
13.00,1.61,1.65,1.73,1.79,1.91,2.02,1.25,1.32,1.38,1.47,1.47,1.63
,,,,,,,,,,,,
,,,,,,,,,,,,
BALLAST,,,,,,,,,,,,
"Ship  Speed
 (Knots)",A-GB-Type,B-GB-Type,C-GB-Type,D-GBType,E-GB-Type,F-GBType,A-FB-Type,B-FB-Type,C-FB-Type,D-FB-Type,E-FB-Type,F-FB-Type
19.50,3.29,3.33,3.50,3.68,3.68,4.01,3.28,3.38,3.55,3.78,3.78,4.20
19.00,3.04,3.09,3.24,3.41,3.41,3.72,3.04,3.14,3.30,3.51,3.51,3.90
18.50,2.80,2.90,3.04,3.19,3.19,3.48,2.84,2.92,3.07,3.27,3.27,3.63
18.00,2.60,2.73,2.87,3.01,3.01,3.27,2.60,2.70,2.84,3.02,3.02,3.36
17.50,2.43,2.58,2.70,2.84,2.84,3.08,2.41,2.50,2.63,2.80,2.80,3.10
17.00,2.29,2.42,2.54,2.66,2.66,2.88,2.25,2.34,2.45,2.61,2.61,2.90
16.50,2.15,2.28,2.39,2.50,2.50,2.71,2.11,2.19,2.30,2.45,2.45,2.72
16.00,2.01,2.13,2.23,2.34,2.34,2.53,1.96,2.04,2.14,2.28,2.28,2.54
15.50,1.88,1.99,2.09,2.19,2.19,2.36,1.83,1.90,2.00,2.13,2.13,2.36
15.00,1.75,1.87,1.96,2.05,2.05,2.21,1.70,1.77,1.86,1.98,1.98,2.20
14.50,1.63,1.73,1.82,1.90,1.90,2.04,1.57,1.64,1.73,1.84,1.84,2.04
14.00,1.52,1.62,1.70,1.77,1.77,1.90,1.45,1.52,1.60,1.70,1.70,1.89
13.50,1.42,1.52,1.59,1.66,1.66,1.77,1.35,1.43,1.50,1.59,1.59,1.77
13.00,1.33,1.42,1.48,1.54,1.54,1.65,1.26,0.94,0.99,1.05,1.05,1.17`;

function parseCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentMode = null;
    let headers = [];
    const profiles = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for mode headers
        if (line.startsWith('LADEN')) {
            currentMode = 'laden';
            continue;
        } else if (line.startsWith('BALLAST')) {
            currentMode = 'ballast';
            continue;
        }

        // Parse header row (contains type names)
        if (line.includes('-Type') || line.includes('Type')) {
            const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
            headers = parts.slice(1); // Skip first column (Speed)
            continue;
        }

        // Skip if no mode set or no headers
        if (!currentMode || headers.length === 0) continue;

        // Parse data rows
        const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
        if (parts.length > 1 && parts[0] && !isNaN(parseFloat(parts[0]))) {
            const speed = parseFloat(parts[0]);

            // Process each column (type)
            for (let j = 1; j < parts.length && j <= headers.length; j++) {
                const typeName = headers[j - 1];
                const focValue = parseFloat(parts[j]);

                if (typeName && !isNaN(focValue)) {
                    // Find or create profile for this type and mode
                    let profile = profiles.find(p => p.type === typeName && p.mode === currentMode);
                    if (!profile) {
                        profile = {
                            id: `foc-${currentMode}-${typeName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                            mode: currentMode,
                            type: typeName,
                            data: []
                        };
                        profiles.push(profile);
                    }

                    // Add data point
                    profile.data.push({
                        speed: speed,
                        foc: focValue,
                        rpm: 0 // Default RPM, can be updated later
                    });
                }
            }
        }
    }

    return profiles;
}

function updateShipData() {
    const shipsPath = path.join(__dirname, 'data', 'ships.json');
    const ships = JSON.parse(fs.readFileSync(shipsPath, 'utf8'));

    // Find HLS CARTAGENA
    const ship = ships.find(s => s.code === 'HCT');
    if (!ship) {
        console.error('HLS CARTAGENA not found!');
        return;
    }

    // Parse new profiles
    const newProfiles = parseCSV(csvData);

    // Initialize focManagement if it doesn't exist
    if (!ship.focManagement) {
        ship.focManagement = [];
    }

    // Remove existing profiles and add new ones (complete replacement)
    ship.focManagement = newProfiles;

    // Write back to file
    fs.writeFileSync(shipsPath, JSON.stringify(ships, null, 2), 'utf8');

    console.log(`Successfully updated FOC data for HLS CARTAGENA.`);
    console.log(`Total profiles: ${newProfiles.length}`);
    console.log(`LADEN profiles: ${newProfiles.filter(p => p.mode === 'laden').length}`);
    console.log(`BALLAST profiles: ${newProfiles.filter(p => p.mode === 'ballast').length}`);
}

updateShipData();
