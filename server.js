const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const BUSINESS_SHORT_CODE = process.env.MPESA_SHORTCODE;
const PASSKEY = process.env.MPESA_PASSKEY;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL;

// Database connection configured for Render PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Root Route (Prevents 'Cannot GET /' error)
app.get('/', (req, res) => {
    res.send('Mwea East JSS Welfare API Service is active.');
});

// Initialize database table automatically on startup
pool.query(`
    CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        school VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).catch(err => console.error('Table creation error:', err));

// M-Pesa Access Token Middleware
async function getAccessToken(req, res, next) {
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    try {
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            { headers: { Authorization: `Basic ${auth}` } }
        );
        req.accessToken = response.data.access_token;
        next();
    } catch (error) {
        console.error('Auth Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to authenticate with M-Pesa' });
    }
}

// STK Push Route
app.post('/api/stkpush', getAccessToken, async (req, res) => {
    const { phone, amount, accountReference } = req.body; 
    
    if (!phone || !amount) {
        return res.status(400).json({ success: false, error: 'Phone number and amount are required' });
    }

    let formattedPhone = phone.toString().replace(/^0/, '254');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${BUSINESS_SHORT_CODE}${PASSKEY}${timestamp}`).toString('base64');

    const payload = {
        BusinessShortCode: BUSINESS_SHORT_CODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: BUSINESS_SHORT_CODE,
        PhoneNumber: formattedPhone,
        CallBackURL: CALLBACK_URL,
        AccountReference: accountReference || "MweaEastWelfare",
        TransactionDesc: "Teacher Welfare Contribution"
    };

    try {
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            payload,
            { headers: { Authorization: `Bearer ${req.accessToken}` } }
        );
        res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error('STK Push Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// Get all members for the directory
app.get('/api/members', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM members ORDER BY id DESC');
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Fetch Members Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Register a new member
app.post('/api/register', async (req, res) => {
    const { name, school, phone } = req.body;
    if (!name || !school || !phone) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    try {
        const query = 'INSERT INTO members (name, school, phone, status) VALUES ($1, $2, $3, $4) RETURNING *';
        const values = [name, school, phone, 'Active'];
        const result = await pool.query(query, values);
        res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// M-Pesa Callback Route
app.post('/api/mpesa-callback', (req, res) => {
    const callbackData = req.body.Body?.stkCallback;
    if (callbackData && callbackData.ResultCode === 0) {
        const metadata = callbackData.CallbackMetadata.Item;
        const amountPaid = metadata.find(o => o.Name === 'Amount')?.Value;
        const mpesaReceiptNumber = metadata.find(o => o.Name === 'MpesaReceiptNumber')?.Value;
        console.log(`SUCCESS: Receipt ${mpesaReceiptNumber} of KES ${amountPaid}`);
    }
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// Start server
app.listen(PORT, () => {
    console.log(`Welfare Backend running on port ${PORT}`);
});
