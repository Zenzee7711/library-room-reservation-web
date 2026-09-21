const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Uploads are kept out of public/images so that user-supplied files never mix
// with the images committed to the repository.
const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG and WebP images are allowed'));
    }
    return cb(null, true);
  },
});

module.exports = { upload, uploadsDir };
