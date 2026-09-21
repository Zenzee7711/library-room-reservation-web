const path = require('path');

// Session-based access control.
//
// Every guard below reads the role from the server-side session. Nothing trusts
// a role, user id or approver id sent by the browser.

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user_id) {
    return res.status(401).json({ message: 'Not logged in' });
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user_id) {
      return res.status(401).json({ message: 'Not logged in' });
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    return next();
  };
}

// Page equivalent of requireRole: redirects to the login screen instead of
// returning JSON, so a signed-out visitor lands somewhere useful.
function requirePageRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user_id) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.role)) {
      return res
        .status(403)
        .sendFile(path.join(__dirname, '..', '..', 'public', 'view', '403.html'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, requirePageRole };
