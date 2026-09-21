const express = require('express');
const { query } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const studentOnly = [requireAuth, requireRole('student')];
const lecturerOnly = [requireAuth, requireRole('lecturer')];
const staffOnly = [requireAuth, requireRole('staff')];

const TIMEZONE = 'Asia/Bangkok';

// 'en-CA' formats as YYYY-MM-DD, which is what the date inputs and the DATE
// columns both use.
function todayInTimezone() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function currentTimeInTimezone() {
  return new Date().toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour12: false });
}

function formatTimeRange(start, end) {
  return `${String(start).slice(0, 5)} - ${String(end).slice(0, 5)}`;
}

router.get('/api/currentdate', (req, res) => {
  res.json({ today: todayInTimezone() });
});

// Create a booking request. The booking is always filed against the signed-in
// student: the user id is read from the session, never from the request body.
router.post('/api/student/book', studentOnly, async (req, res, next) => {
  const user_id = req.session.user_id;
  const { room_id, time, booking_date, objective } = req.body || {};

  if (!room_id || !time || !booking_date || !objective) {
    return res.status(400).json({ message: 'Missing booking data' });
  }

  const [start_time, end_time] = String(time).split(' - ');
  if (!start_time || !end_time) {
    return res.status(400).json({ message: 'Invalid time slot format' });
  }

  try {
    const today = todayInTimezone();
    if (booking_date < today) {
      return res.status(400).json({ message: 'Cannot book for past dates.' });
    }
    if (booking_date === today && start_time <= currentTimeInTimezone()) {
      return res.status(400).json({ message: 'This time slot has already started or passed.' });
    }

    const slots = await query(
      'SELECT slot_id FROM time_slot WHERE start_time = ? AND end_time = ? LIMIT 1',
      [start_time, end_time]
    );
    if (slots.length === 0) {
      return res.status(400).json({ message: 'Unknown time slot' });
    }
    const slot_id = slots[0].slot_id;

    const rooms = await query('SELECT room_status FROM room WHERE room_id = ? LIMIT 1', [room_id]);
    if (rooms.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }
    if (rooms[0].room_status !== 1) {
      return res.status(409).json({ message: 'This room is currently unavailable.' });
    }

    const ownBookings = await query(
      `SELECT booking_id FROM booking
       WHERE user_id = ? AND booking_date = ?
         AND booking_status IN ('Waiting', 'Approved')
       LIMIT 1`,
      [user_id, booking_date]
    );
    if (ownBookings.length > 0) {
      return res.status(409).json({ message: 'You have already booked a slot for this day.' });
    }

    const slotTaken = await query(
      `SELECT booking_id FROM booking
       WHERE room_id = ? AND slot_id = ? AND booking_date = ?
         AND booking_status IN ('Waiting', 'Approved')
       LIMIT 1`,
      [room_id, slot_id, booking_date]
    );
    if (slotTaken.length > 0) {
      return res.status(409).json({ message: 'This time slot is already booked.' });
    }

    await query(
      `INSERT INTO booking (user_id, room_id, slot_id, booking_date, objective, booking_status, created_time)
       VALUES (?, ?, ?, ?, ?, 'Waiting', NOW())`,
      [user_id, room_id, slot_id, booking_date, objective]
    );

    return res.status(201).json({ message: 'Booking submitted successfully' });
  } catch (err) {
    return next(err);
  }
});

// Today's requests for the signed-in student.
router.get('/api/student/bookings', studentOnly, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT
         r.room_name, r.capacity, r.location, r.image,
         b.objective, b.booking_date, b.booking_status,
         ts.start_time, ts.end_time
       FROM booking b
       JOIN room r ON b.room_id = r.room_id
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       WHERE b.user_id = ? AND b.booking_date = CURDATE()
       ORDER BY b.created_time DESC`,
      [req.session.user_id]
    );
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
});

router.get('/api/student/history', studentOnly, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT
         r.room_name, b.booking_date, ts.start_time, ts.end_time,
         b.objective, b.booking_status
       FROM booking b
       JOIN room r ON b.room_id = r.room_id
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       WHERE b.user_id = ?
         AND b.booking_status IN ('Approved', 'Rejected')
         AND b.booking_date <= CURDATE()
       ORDER BY b.booking_date DESC, ts.start_time`,
      [req.session.user_id]
    );
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
});

// Requests still waiting on a lecturer decision.
router.get('/api/lecturer/approvals', lecturerOnly, async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT
        b.booking_id,
        CONCAT(u.first_name, ' ', u.last_name) AS student_name,
        r.room_name, r.location,
        b.booking_date, ts.start_time, ts.end_time, b.objective
      FROM booking b
      JOIN users u ON b.user_id = u.user_id
      JOIN room r ON b.room_id = r.room_id
      JOIN time_slot ts ON b.slot_id = ts.slot_id
      WHERE b.booking_status = 'Waiting'
        AND b.booking_date = CURDATE()
      ORDER BY b.created_time ASC
    `);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
});

router.post('/api/lecturer/approval-action', lecturerOnly, async (req, res, next) => {
  const { booking_id, action } = req.body || {};
  if (!booking_id || !['Approved', 'Rejected'].includes(action)) {
    return res.status(400).json({ message: 'Invalid approval data' });
  }

  try {
    // Scoped to Waiting so the same request cannot be decided twice, and so a
    // decision already made by another lecturer is not silently overwritten.
    const result = await query(
      `UPDATE booking
       SET booking_status = ?, approver_id = ?
       WHERE booking_id = ? AND booking_status = 'Waiting'`,
      [action, req.session.user_id, booking_id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ message: 'This request has already been handled.' });
    }

    return res.status(200).json({ message: `Booking ${action.toLowerCase()} successfully` });
  } catch (err) {
    return next(err);
  }
});

router.get('/api/lecturer/history', lecturerOnly, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT
         b.booking_date, b.objective, b.booking_status,
         r.room_name, ts.start_time, ts.end_time,
         u.first_name, u.last_name
       FROM booking b
       JOIN room r ON b.room_id = r.room_id
       JOIN users u ON b.user_id = u.user_id
       JOIN time_slot ts ON b.slot_id = ts.slot_id
       WHERE b.booking_status IN ('Approved', 'Rejected')
         AND b.approver_id = ?
       ORDER BY b.booking_date DESC`,
      [req.session.user_id]
    );

    const history = rows.map((row) => ({
      student_name: `${row.first_name} ${row.last_name}`,
      room_name: row.room_name,
      booking_date: row.booking_date,
      time: formatTimeRange(row.start_time, row.end_time),
      objective: row.objective,
      status: row.booking_status,
    }));

    return res.status(200).json(history);
  } catch (err) {
    return next(err);
  }
});

// Every decided request across the library, for the staff audit view.
router.get('/api/staff/history', staffOnly, async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT
        b.booking_date, b.objective, b.booking_status,
        ts.start_time, ts.end_time, r.room_name,
        u.first_name AS lecturer_first, u.last_name AS lecturer_last
      FROM booking b
      JOIN time_slot ts ON b.slot_id = ts.slot_id
      JOIN room r ON b.room_id = r.room_id
      LEFT JOIN users u ON b.approver_id = u.user_id
      WHERE b.booking_status IN ('Approved', 'Rejected')
      ORDER BY b.booking_date DESC, ts.start_time DESC
    `);

    const history = rows.map((row) => ({
      room_name: row.room_name,
      objective: row.objective,
      booking_status: row.booking_status,
      booking_date: row.booking_date,
      start_time: row.start_time,
      end_time: row.end_time,
      lecturer_name: row.lecturer_first
        ? `${row.lecturer_first} ${row.lecturer_last}`
        : 'Unknown',
    }));

    return res.status(200).json(history);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
