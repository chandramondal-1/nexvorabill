const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Helper to read data
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data file:', error);
        return { invoices: [], clients: [], settings: {} };
    }
}

// Helper to write data
async function writeData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing data file:', error);
    }
}

// ================= API ROUTES =================

// ----- Invoices -----
app.get('/api/invoices', async (req, res) => {
    const data = await readData();
    res.json(data.invoices || []);
});

app.post('/api/invoices', async (req, res) => {
    const data = await readData();
    const newInvoice = req.body;
    
    // Check if invoice already exists (by id), update it if so
    const idx = data.invoices.findIndex(inv => inv.id === newInvoice.id);
    if (idx >= 0) {
        data.invoices[idx] = newInvoice;
    } else {
        data.invoices.unshift(newInvoice); // Add to beginning
    }
    
    await writeData(data);
    res.json({ success: true, invoice: newInvoice });
});

// ----- Clients -----
app.get('/api/clients', async (req, res) => {
    const data = await readData();
    res.json(data.clients || []);
});

app.post('/api/clients', async (req, res) => {
    const data = await readData();
    const newClient = req.body;
    
    data.clients.unshift(newClient);
    
    await writeData(data);
    res.json({ success: true, client: newClient });
});

// ----- Settings -----
app.get('/api/settings', async (req, res) => {
    const data = await readData();
    res.json(data.settings || {});
});

app.put('/api/settings', async (req, res) => {
    const data = await readData();
    data.settings = { ...data.settings, ...req.body };
    
    await writeData(data);
    res.json({ success: true, settings: data.settings });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
