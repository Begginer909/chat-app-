import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import db from '../config/config.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const userId = req.body.senderID || 'unknown';
		const timestamp = Date.now();
		const ext = path.extname(file.originalname);
		const originalName = path.basename(file.originalname, ext); // Get filename without extension
		const newFileName = `${userId}_${timestamp}${ext}`; // Rename file for storage
		file.newFileName = newFileName; // Attach new filename to file object
		file.originalName = file.originalname; // Attach original filename
		cb(null, newFileName);
	},
});

const upload = multer({
	storage,
	limits: {
		fileSize: 10 * 1024 * 1024,
	},
	fileFilter: (req, file, cb) => {
		cb(null, true);
	}
});
  
const fileFilter = (req, file, cb) => {
	if (file.mimetype.startsWith('image/')) {
	  cb(null, true);
	} else {
	  cb(new Error('Only image files are allowed!'), false);
	}
};

// Route for multiple file uploads in message
router.post('/upload', (req, res, next) => {

	upload.array('files', 10)(req, res, function (err) {
		if (err instanceof multer.MulterError) {
			// A Multer error occurred
			if (err.code === 'LIMIT_FILE_SIZE') {
				return res.status(400).json({
					error: 'File size limit exceeded. Maximum file size is 10MB.'
				});
			}
			return res.status(400).json({ error: err.message });
		} else if (err) {
			return res.status(500).json({ error: 'Server error during upload' });
		}
		
		const { senderID, receiverID, message, chatType, groupID } = req.body;
		// Allows up to 10 files
		if (!req.files || req.files.length === 0) {
			if (req.body.message) {
				return res.json({ message: 'Text-only message' });
			}
			return res.status(400).json({ error: 'No files uploads' });
		}

		const filesData = req.files.map((file) => ({
			originalName: file.originalName, // Store original filename
			storedFileName: file.newFileName, // Store renamed file
			url: `/uploads/${file.newFileName}`,
		}));

		//Convert file Urls to a JSON string for storage in MySQL
		const filesDataJSON = JSON.stringify(filesData);
		const messageToSave = message && message.trim() !== '' ? message : '';
		// Assuming only one file type is uploaded per request
		const messageType = req.files[0].mimetype.startsWith('image') ? 'image' : 'file';

		let sql;
		let params;

		if (chatType == 'group') {
			sql = 'INSERT INTO messages (senderID, groupID, message, messageType, fileUrl) VALUES (?, ?, ?, ?, ?)';
			params = [senderID, groupID, messageToSave, messageType, filesDataJSON];
		} else if (chatType == 'private') {
			sql = 'INSERT INTO private (senderID, receiverID, message, messageType, fileUrl) VALUES (?, ?, ?, ?, ?)';
			params = [senderID, receiverID, messageToSave, messageType, filesDataJSON];
		} else {
			return res.status(400).json({ error: 'Invalid chatType' });
		}

		db.query(sql, params, (err, result) => {
			if (err) {
				console.error('Database error', err);
				return res.status(500).json({ error: 'Database error' });
			}
			res.json({ message: 'File uploaded successfully', fileUrl: filesDataJSON });
		});
	});
});


export default router;
