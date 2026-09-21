const path = require('path');
const express = require('express');
const { requirePageRole } = require('../middleware/auth');

const router = express.Router();
const viewDir = path.join(__dirname, '..', '..', 'public', 'view');

function page(file) {
  return (req, res) => res.sendFile(path.join(viewDir, file));
}

// Public
router.get('/', page('login.html'));
router.get('/login', page('login.html'));
router.get('/register', page('register.html'));

// Student
router.get('/browseroomStudent', requirePageRole('student'), page('browse-room-student.html'));
router.get('/browseroomStudent/book', requirePageRole('student'), page('request-booking-student.html'));
router.get('/browseroomStudent/bookings', requirePageRole('student'), page('check-request-status-student.html'));
router.get('/historyStudent', requirePageRole('student'), page('history-student.html'));

// Lecturer
router.get('/dashboard/lecturer', requirePageRole('lecturer'), page('dashboard-lecturer.html'));
router.get('/browseroomLecturer', requirePageRole('lecturer'), page('browse-room-lecturer.html'));
router.get('/browseroomLecturer/checkapprovals', requirePageRole('lecturer'), page('booking-request-approvals-lecturer.html'));
router.get('/historyLecturer', requirePageRole('lecturer'), page('history-lecturer.html'));

// Staff
router.get('/dashboard/staff', requirePageRole('staff'), page('dashboard-staff.html'));
router.get('/browseroomStaff', requirePageRole('staff'), page('browse-room-staff.html'));
router.get('/browseroomStaff/edits', requirePageRole('staff'), page('manage-rooms-staff.html'));
router.get('/browseroomStaff/editroom', requirePageRole('staff'), page('editing-room-staff.html'));
router.get('/browseroomStaff/add', requirePageRole('staff'), page('add-new-room-staff.html'));
router.get('/historyStaff', requirePageRole('staff'), page('history-staff.html'));

module.exports = router;
