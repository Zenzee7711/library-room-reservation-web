const express = require('express');
const { query } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();
const staffOnly = [requireAuth, requireRole('staff')];

function slotStatus(roomStatus, bookingStatus) {
  if (roomStatus === 0) return 'Disabled';
  if (bookingStatus === 'Waiting') return 'Pending';
  if (bookingStatus === 'Approved') return 'Reserved';
  return 'Free';
}

// Room grid with today's per-slot status, shared by all three roles.
router.get('/api/rooms/availability', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT
        r.room_id, r.room_name, r.room_status, r.location, r.capacity, r.description, r.image,
        ts.slot_id, ts.start_time, ts.end_time,
        (
          SELECT b.booking_status
          FROM booking b
          WHERE b.room_id = r.room_id
            AND b.slot_id = ts.slot_id
            AND b.booking_date = CURDATE()
          ORDER BY b.created_time DESC
          LIMIT 1
        ) AS booking_status
      FROM room r
      CROSS JOIN time_slot ts
      ORDER BY r.room_name, ts.slot_id
    `);

    const roomsById = new Map();
    for (const row of rows) {
      if (!roomsById.has(row.room_id)) {
        roomsById.set(row.room_id, {
          room_id: row.room_id,
          name: row.room_name,
          capacity: row.capacity,
          location: row.location,
          description: row.description,
          image: row.image,
          slots: [],
        });
      }

      roomsById.get(row.room_id).slots.push({
        slot_id: row.slot_id,
        time: `${String(row.start_time).slice(0, 5)} - ${String(row.end_time).slice(0, 5)}`,
        status: slotStatus(row.room_status, row.booking_status),
      });
    }

    return res.status(200).json([...roomsById.values()]);
  } catch (err) {
    return next(err);
  }
});

// Slot counts for the staff and lecturer dashboards.
router.get(
  '/api/dashboard/slots',
  requireAuth,
  requireRole('staff', 'lecturer'),
  async (req, res, next) => {
    try {
      const rows = await query(`
        SELECT
          ts.slot_id, r.room_id, r.room_status,
          (
            SELECT b.booking_status
            FROM booking b
            WHERE b.room_id = r.room_id
              AND b.slot_id = ts.slot_id
              AND b.booking_date = CURDATE()
            ORDER BY b.created_time DESC
            LIMIT 1
          ) AS booking_status
        FROM room r
        CROSS JOIN time_slot ts
      `);

      const totals = { free: 0, pending: 0, reserved: 0, disabled: 0 };
      for (const row of rows) {
        if (row.room_status === 0) totals.disabled += 1;
        else if (row.booking_status === 'Waiting') totals.pending += 1;
        else if (row.booking_status === 'Approved') totals.reserved += 1;
        else totals.free += 1;
      }

      return res.status(200).json(totals);
    } catch (err) {
      return next(err);
    }
  }
);

// Room detail shown on the student booking form.
router.get(
  '/api/student/room/:room_id',
  requireAuth,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const rows = await query(
        'SELECT room_name, location, capacity, description, image FROM room WHERE room_id = ?',
        [req.params.room_id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Room not found' });
      }
      return res.status(200).json(rows[0]);
    } catch (err) {
      return next(err);
    }
  }
);

router.get('/api/staff/rooms', staffOnly, async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT room_id, room_name, capacity, location, room_status FROM room ORDER BY room_name'
    );
    const rooms = rows.map((room) => ({
      ...room,
      status: room.room_status === 1 ? 'Active' : 'Disable',
    }));
    return res.status(200).json(rooms);
  } catch (err) {
    return next(err);
  }
});

router.get('/api/staff/rooms/:room_id', staffOnly, async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM room WHERE room_id = ?', [req.params.room_id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (err) {
    return next(err);
  }
});

router.post('/api/staff/addroom', staffOnly, upload.single('image'), async (req, res, next) => {
  const { room_name, capacity, location, description } = req.body || {};
  const image = req.file ? req.file.filename : null;

  if (!room_name || !capacity || !location || !image) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const capacityValue = Number.parseInt(capacity, 10);
  if (!Number.isInteger(capacityValue) || capacityValue <= 0) {
    return res.status(400).json({ message: 'Capacity must be a positive whole number' });
  }

  try {
    const duplicate = await query('SELECT room_id FROM room WHERE BINARY room_name = ? LIMIT 1', [
      room_name,
    ]);
    if (duplicate.length > 0) {
      return res
        .status(409)
        .json({ message: 'Room name already exists. Please choose another name.' });
    }

    await query(
      `INSERT INTO room (room_name, capacity, location, description, image, room_status)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [room_name, capacityValue, location, description || '', image]
    );

    return res.status(201).json({ message: 'Room added successfully' });
  } catch (err) {
    return next(err);
  }
});

router.put('/api/staff/rooms/:room_id', staffOnly, async (req, res, next) => {
  const { room_name, capacity, description } = req.body || {};
  if (!room_name || !capacity || !description) {
    return res.status(400).json({ message: 'Missing data for update' });
  }

  const capacityValue = Number.parseInt(capacity, 10);
  if (!Number.isInteger(capacityValue) || capacityValue <= 0) {
    return res.status(400).json({ message: 'Capacity must be a positive whole number' });
  }

  try {
    const result = await query(
      'UPDATE room SET room_name = ?, capacity = ?, description = ? WHERE room_id = ?',
      [room_name, capacityValue, description, req.params.room_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }
    return res.status(200).json({ message: 'Room updated successfully' });
  } catch (err) {
    return next(err);
  }
});

router.put(
  '/api/staff/rooms/:room_id/image',
  staffOnly,
  upload.single('image'),
  async (req, res, next) => {
    const image = req.file ? req.file.filename : null;
    if (!image) {
      return res.status(400).json({ message: 'No image uploaded' });
    }

    try {
      const result = await query('UPDATE room SET image = ? WHERE room_id = ?', [
        image,
        req.params.room_id,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Room not found' });
      }
      return res.status(200).json({ message: 'Image updated successfully', image });
    } catch (err) {
      return next(err);
    }
  }
);

router.post('/api/staff/rooms/status', staffOnly, async (req, res, next) => {
  const { room_id, current_status } = req.body || {};
  if (!room_id || current_status === undefined) {
    return res.status(400).json({ message: 'Missing room ID or current status' });
  }

  const status = Number(current_status);
  if (status !== 0 && status !== 1) {
    return res.status(400).json({ message: 'Status must be 0 or 1' });
  }

  try {
    // A room cannot be taken offline while people still hold bookings for it.
    if (status === 0) {
      const active = await query(
        `SELECT booking_id FROM booking
         WHERE room_id = ?
           AND booking_status IN ('Waiting', 'Approved')
           AND booking_date >= CURDATE()
         LIMIT 1`,
        [room_id]
      );
      if (active.length > 0) {
        return res
          .status(409)
          .json({ message: 'Cannot disable this room while it has active bookings.' });
      }
    }

    const result = await query('UPDATE room SET room_status = ? WHERE room_id = ?', [
      status,
      room_id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    return res
      .status(200)
      .json({ message: `Room ${status === 1 ? 'enabled' : 'disabled'} successfully` });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
