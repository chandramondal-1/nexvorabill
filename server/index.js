const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Initialize Firebase Admin
let db;
if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
    db = admin.firestore();
    console.log('Firebase Admin and Firestore initialized');
} else {
    console.warn('WARNING: Firebase credentials not set in .env. Authentication will be bypassed and data will NOT be saved permanently!');
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
    balanceDue: Number,
    userId: { type: String, required: true, index: true }
}, { timestamps: true });

const ClientSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: String,
    business: String,
    email: String,
    phone: String,
    address: String,
    isRecurring: { type: Boolean, default: false },
    recurringAmount: { type: Number, default: 500 },
    userId: { type: String, required: true, index: true }
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
    serviceTemplates: { type: Array, default: [] },
    userId: { type: String, required: true, index: true }
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', InvoiceSchema);
const Client = mongoose.model('Client', ClientSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// ================= MIDDLEWARE =================

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // 1. Try Firebase Auth first
    if (process.env.FIREBASE_PROJECT_ID) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            return next();
        } catch (error) {
            // If Firebase fails, we fall through to try JWT
        }
    }

    // 2. Try JWT for Local Admin
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nexvora_fallback_secret');
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Authentication Error:', error.message);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// ================= API ROUTES =================

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USER || 'Chandra';
    const adminPass = process.env.ADMIN_PASS || '123456789';

    if (username === adminUser && password === adminPass) {
        const user = { email: adminUser, uid: 'admin-' + adminUser.toLowerCase(), isLocal: true };
        const token = jwt.sign(user, process.env.JWT_SECRET || 'nexvora_fallback_secret', { expiresIn: '7d' });
        return res.json({ success: true, user, token });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        dbConnected: !!db, 
        message: db ? 'Cloud Database Connected' : 'DATABASE NOT CONFIGURED ON SERVER' 
    });
});

// ----- Invoices -----
app.get('/api/invoices', authenticate, async (req, res) => {
    if(!db) return res.status(503).json({ error: 'Database not configured on server. Check Render environment variables.' });
    try {
        const snapshot = await db.collection('invoices')
            .where('userId', '==', req.user.uid)
            .orderBy('createdAt', 'desc')
            .get();
        const invoices = snapshot.docs.map(doc => ({ ...doc.data(), _id: doc.id }));
        res.json(invoices);
    } catch (e) {
        console.error("Firestore GET error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/invoices', authenticate, async (req, res) => {
    if(!db) return res.status(503).json({ error: 'Database not configured on server. Data was NOT saved to cloud.' });
    const invoice = { ...req.body, userId: req.user.uid, updatedAt: new Date(), createdAt: new Date() };
    
    try {
        const docRef = db.collection('invoices').doc(String(invoice.id));
        await docRef.set(invoice, { merge: true });
        res.json({ success: true, invoice });
    } catch (e) {
        console.error("Firestore POST error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ----- Clients -----
app.get('/api/clients', authenticate, async (req, res) => {
    if(!db) return res.status(503).json({ error: 'Database not configured on server.' });
    try {
        const snapshot = await db.collection('clients')
            .where('userId', '==', req.user.uid)
            .orderBy('createdAt', 'desc')
            .get();
        const clients = snapshot.docs.map(doc => ({ ...doc.data(), _id: doc.id }));
        res.json(clients);
    } catch (e) {
        console.error("Firestore GET error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/clients', authenticate, async (req, res) => {
    if(!db) return res.status(503).json({ error: 'Database not configured on server. Data was NOT saved to cloud.' });
    const client = { ...req.body, userId: req.user.uid, updatedAt: new Date(), createdAt: new Date() };
    try {
        const docRef = db.collection('clients').doc(String(client.id));
        await docRef.set(client, { merge: true });
        res.json({ success: true, client });
    } catch (e) {
        console.error("Firestore POST error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ----- Settings -----
app.get('/api/settings', authenticate, async (req, res) => {
    if(!db) return res.status(503).json({ error: 'Database not configured on server.' });
    try {
        const doc = await db.collection('settings').doc(req.user.uid).get();
        res.json(doc.exists ? doc.data() : {});
    } catch (e) {
        console.error("Firestore GET error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/settings', authenticate, async (req, res) => {
    if(!db) return res.status(503).json({ error: 'Database not configured on server. Settings NOT saved to cloud.' });
    try {
        const settings = { ...req.body, userId: req.user.uid, updatedAt: new Date() };
        await db.collection('settings').doc(req.user.uid).set(settings, { merge: true });
        res.json({ success: true, settings });
    } catch (e) {
        console.error("Firestore PUT error:", e);
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
