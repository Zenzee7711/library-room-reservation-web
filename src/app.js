const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const { session: sessionConfig } = require('./config/env');
const { uploadsDir } = require('./middleware/upload');
const pageRoutes = require('./routes/pages.routes');
const authRoutes = require('./routes/auth.routes');
const roomRoutes = require('./routes/rooms.routes');
const bookingRoutes = require('./routes/bookings.routes');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: sessionConfig.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: sessionConfig.cookieSecure,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Room photos come from two places: images committed with the repository and
// photos staff upload at runtime. Both are served under /images so that a
// stored filename resolves either way, while staying separate on disk. The
// uploads directory is git-ignored and must not mix with tracked assets.
app.use('/images', express.static(path.join(publicDir, 'images')));
app.use('/images', express.static(uploadsDir));

// The HTML in public/view is deliberately not mounted as static files: every
// page goes through pages.routes.js so that the role check cannot be skipped
// by requesting the file directly.

app.use('/', pageRoutes);
app.use('/', authRoutes);
app.use('/', roomRoutes);
app.use('/', bookingRoutes);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not found' });
  }
  return res.status(404).sendFile(path.join(publicDir, 'view', '404.html'));
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || String(err.message).startsWith('Only JPEG')) {
    return res.status(400).json({ message: err.message });
  }

  // Logged in full for the operator; the client only ever sees a generic
  // message, so internal details are not leaked in a response.
  console.error(err);
  return res.status(500).json({ message: 'Server error' });
});

module.exports = app;
