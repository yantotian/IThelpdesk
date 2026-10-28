import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sql } from '../db/index.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import { loginLimiter, passwordChangeLimiter } from '../middleware/rateLimit.js';
const router = Router();
// Login
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        const users = await sql `
      SELECT id, username, email, password_hash, full_name, role, office, contact, is_active, is_approved
      FROM users WHERE username = ${username.toLowerCase()} LIMIT 1
    `;
        if (users.length === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const user = users[0];
        if (!user.is_active) {
            res.status(401).json({ error: 'Account is deactivated. Contact your administrator.' });
            return;
        }
        if (!user.is_approved) {
            res.status(403).json({ error: 'Your registration is pending administrator approval. Contact your administrator.' });
            return;
        }
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const token = generateToken({ id: user.id, username: user.username, role: user.role });
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                office: user.office,
                contact: user.contact,
            },
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Register
router.post('/register', loginLimiter, async (req, res) => {
    try {
        const { username, password, full_name, office, contact, email } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        if (!email || !String(email).trim()) {
            res.status(400).json({ error: 'Email Address is required' });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
            res.status(400).json({ error: 'Please enter a valid email address' });
            return;
        }
        if (!office || !String(office).trim()) {
            res.status(400).json({ error: 'Office is required' });
            return;
        }
        if (!contact || !String(contact).trim()) {
            res.status(400).json({ error: 'Contact is required' });
            return;
        }
        const existing = await sql `SELECT id FROM users WHERE username = ${username.toLowerCase()} LIMIT 1`;
        if (existing.length > 0) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        const emailTaken = await sql `SELECT id FROM users WHERE email = ${String(email).trim().toLowerCase()} LIMIT 1`;
        if (emailTaken.length > 0) {
            res.status(409).json({ error: 'Email already registered' });
            return;
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const normalizedEmail = String(email).trim().toLowerCase();
        await sql `
      INSERT INTO users (username, email, password_hash, full_name, office, contact, role, is_approved)
      VALUES (${username.toLowerCase()}, ${normalizedEmail}, ${passwordHash}, ${full_name || username.toLowerCase()}, ${String(office).trim()}, ${String(contact).trim()}, 'requester', false)
    `;
        // Tell every active System Admin that an account is waiting. A failure here
        // must not undo the registration — the admin sees the pending row in
        // User Management anyway.
        try {
            await sql `
        INSERT INTO notifications (user_id, type, title, body)
        SELECT id, 'system', 'New registration pending approval', ${username.toLowerCase()}
        FROM users WHERE role = 'sysadmin' AND is_active = true
      `;
        }
        catch (notifyError) {
            console.error('Registration notification error:', notifyError);
        }
        // No token: the account cannot be used until a System Admin approves it.
        res.status(201).json({
            message: 'Registration submitted. An administrator must approve your account before you can sign in.',
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get current user
router.get('/me', loginLimiter, authMiddleware, async (req, res) => {
    res.json({ user: req.user });
});
// Change password
router.post('/change-password', passwordChangeLimiter, authMiddleware, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            res.status(400).json({ error: 'Current and new password are required' });
            return;
        }
        const users = await sql `SELECT password_hash FROM users WHERE id = ${req.user.id} LIMIT 1`;
        if (users.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const validPassword = await bcrypt.compare(current_password, users[0].password_hash);
        if (!validPassword) {
            res.status(401).json({ error: 'Current password is incorrect' });
            return;
        }
        const newHash = await bcrypt.hash(new_password, 10);
        await sql `UPDATE users SET password_hash = ${newHash} WHERE id = ${req.user.id}`;
        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
