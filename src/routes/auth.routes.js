const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../config/db');

const router = express.Router();

const BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const DASHBOARD_BY_ROLE = {
  staff: '/dashboard/staff',
  lecturer: '/dashboard/lecturer',
  student: '/browseroomStudent',
};

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const rows = await query(
      'SELECT user_id, email, password, first_name, last_name, role FROM users WHERE email = ? LIMIT 1',
      [username]
    );

    // One message for both cases, so the response cannot be used to find out
    // which email addresses are registered.
    const invalid = { message: 'Incorrect email or password' };
    if (rows.length === 0) {
      return res.status(401).json(invalid);
    }

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json(invalid);
    }

    const dashboardUrl = DASHBOARD_BY_ROLE[user.role];
    if (!dashboardUrl) {
      return res.status(403).json({ message: 'Role not recognized' });
    }

    // Issue a fresh session id on login so a pre-existing cookie cannot be
    // reused to ride on the new session.
    return req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.user_id = user.user_id;
      req.session.username = `${user.first_name} ${user.last_name}`;
      req.session.role = user.role;

      return res.status(200).json({
        message: 'Login successful',
        dashboardUrl,
        username: `${user.first_name} ${user.last_name}`,
        user_id: user.user_id,
      });
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/register/create', async (req, res, next) => {
  const { email, password, firstName, lastName, phone, role } = req.body || {};

  if (!firstName || !lastName || !phone || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  // Self-registration creates students only. Lecturer and staff accounts are
  // provisioned by an administrator.
  if (role !== 'student') {
    return res.status(400).json({ message: 'Only student accounts can be self-registered' });
  }

  try {
    const existing = await query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'That email address is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query(
      'INSERT INTO users (email, password, first_name, last_name, phone_number, role) VALUES (?, ?, ?, ?, ?, ?)',
      [email, hashedPassword, firstName, lastName, phone, role]
    );

    return res.status(201).json({ message: 'Registration successful' });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    return res.status(200).json({ message: 'Logged out successfully' });
  });
});

module.exports = router;
