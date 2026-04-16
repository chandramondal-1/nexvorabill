const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => console.error('MongoDB connection error:', err));
} else {
    console.warn('WARNING: MONGODB_URI is not set in server/.env. Data will not be saved permanently!');
}

// ================= SCHEMAS =================
const InvoiceSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    invoiceNo: String,
    invoiceDate: String,
    dueDate: String,
    status: String,
    clientName: String,
    clientEmail: String,
    businessName: String,
    clientAddress: String,
    clientPhone: String,
    services: Array,
    includeGst: Boolean,
    discount: Number,
    advance: Number,
    subtotal: Number,
    total: Number,
    balanceDue: Number
}, { timestamps: true });

const ClientSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: String,
    business: String,
    email: String,
    phone: String,
    address: String
}, { timestamps: true });

const SettingsSchema = new mongoose.Schema({
    singletonId: { type: String, default: 'default', unique: true },
    companyName: String,
    tagline: String,
    udyam: String,
    phone: String,
    email: String,
    website: String,
    gstPercent: Number,
    terms: String,
    logoUrl: String,
    signatureText: String
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', InvoiceSchema);
const Client = mongoose.model('Client', ClientSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// ================= API ROUTES =================

// ----- Invoices -----
app.get('/api/invoices', async (req, res) => {
    if(!MONGODB_URI) return res.json([]);
    try {
        const invoices = await Invoice.find().sort({ createdAt: -1 });
        res.json(invoices);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/invoices', async (req, res) => {
    if(!MONGODB_URI) return res.json({ success: true, invoice: req.body });
    const newInvoice = req.body;
    
    try {
        await Invoice.findOneAndUpdate(
            { id: newInvoice.id },
            newInvoice,
            { upsert: true, new: true }
        );
        res.json({ success: true, invoice: newInvoice });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----- Clients -----
app.get('/api/clients', async (req, res) => {
    if(!MONGODB_URI) return res.json([]);
    try {
        const clients = await Client.find().sort({ createdAt: -1 });
        res.json(clients);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/clients', async (req, res) => {
    if(!MONGODB_URI) return res.json({ success: true, client: req.body });
    const newClient = req.body;
    try {
        await Client.findOneAndUpdate(
            { id: newClient.id },
            newClient,
            { upsert: true, new: true }
        );
        res.json({ success: true, client: newClient });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ----- Settings -----
app.get('/api/settings', async (req, res) => {
    if(!MONGODB_URI) return res.json({});
    try {
        const settings = await Settings.findOne({ singletonId: 'default' });
        res.json(settings || {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/settings', async (req, res) => {
    if(!MONGODB_URI) return res.json({ success: true, settings: req.body });
    try {
        const settings = await Settings.findOneAndUpdate(
            { singletonId: 'default' },
            req.body,
            { upsert: true, new: true }
        );
        res.json({ success: true, settings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
