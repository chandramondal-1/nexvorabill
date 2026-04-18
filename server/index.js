const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const admin = require('firebase-admin');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Initialize Firebase Admin
if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
    console.log('Firebase Admin initialized');
} else {
    console.warn('WARNING: Firebase credentials not set in .env. Authentication will be bypassed!');
}

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
    address: String,
    isRecurring: { type: Boolean, default: false },
    recurringAmount: { type: Number, default: 500 }
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
    signatureText: String,
    paymentTermsDays: { type: Number, default: 7 },
    serviceTemplates: { type: Array, default: [] }
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', InvoiceSchema);
const Client = mongoose.model('Client', ClientSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// ================= MIDDLEWARE =================

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!process.env.FIREBASE_PROJECT_ID) {
        return next(); // Bypass if not configured
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// ================= API ROUTES =================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USER || 'Chandra';
    const adminPass = process.env.ADMIN_PASS || '123456789';

    if (username === adminUser && password === adminPass) {
        return res.json({ 
            success: true, 
            user: { email: adminUser, uid: 'admin-' + adminUser.toLowerCase(), isLocal: true } 
        });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
});

// ----- Invoices -----
app.get('/api/invoices', authenticate, async (req, res) => {
    if(!MONGODB_URI) return res.json([]);
    try {
        const invoices = await Invoice.find().sort({ createdAt: -1 });
        res.json(invoices);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/invoices', authenticate, async (req, res) => {
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
app.get('/api/clients', authenticate, async (req, res) => {
    if(!MONGODB_URI) return res.json([]);
    try {
        const clients = await Client.find().sort({ createdAt: -1 });
        res.json(clients);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/clients', authenticate, async (req, res) => {
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
app.get('/api/settings', authenticate, async (req, res) => {
    if(!MONGODB_URI) return res.json({});
    try {
        const settings = await Settings.findOne({ singletonId: 'default' });
        res.json(settings || {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/settings', authenticate, async (req, res) => {
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

const nodemailer = require('nodemailer');

app.post('/api/send-email', async (req, res) => {
    const { to, subject, text, pdfBase64, filename } = req.body;
    
    if(!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return res.status(500).json({ error: 'SMTP credentials not configured on the server. Please add SMTP_USER and SMTP_PASS to .env' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_PORT == 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to,
            subject,
            text,
            attachments: [
                {
                    filename: filename || 'invoice.pdf',
                    content: pdfBase64.split('base64,')[1] || pdfBase64,
                    encoding: 'base64'
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error("Email sending error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
