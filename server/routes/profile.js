import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import db from '../config/config.js';

const API_BASE_URL = 'http://localhost:3000';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a specific directory for profile pictures
const profilePicsDir = path.join(__dirname, '../uploadProfiles');

// Create directory if it doesn't exist
if (!fs.existsSync(profilePicsDir)) {
    fs.mkdirSync(profilePicsDir, { recursive: true });
}

// Configure storage for profile pictures
const storageProfile = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profilePicsDir);
    },
    filename: (req, file, cb) => {
        const userId = req.body.userID || 'unknown';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const newFileName = `profile_${userId}_${timestamp}${ext}`;
        cb(null, newFileName);
    },
});

// Set up multer for profile pictures with limits
const uploadProfile = multer({
    storage: storageProfile,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit for profile pictures
    },
    fileFilter: (req, file, cb) => {
        // Only allow image files
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed for profile pictures'), false);
        }
        cb(null, true);
    }
});

// Route to upload/update profile picture
router.post('/upload', uploadProfile.single('profilePicture'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No profile picture uploaded' });
        }

        const { userID } = req.body;

        console.log("User ID: ", userID);
        
        if (!userID) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const profileImage = `/uploadProfiles/${req.file.filename}`;
        
        // First check if user already has a profile picture
        db.query('SELECT profileImage FROM user_profiles WHERE userID = ?', [userID], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            let oldProfileImage = null;
            
            if (results.length > 0) {
                // User already has a profile, update it
                oldProfileImage = results[0].profileImage;
                
                db.query(
                    'UPDATE user_profiles SET profileImage = ?, originalFileName = ? WHERE userID = ?',
                    [profileImage, req.file.originalname, userID],
                    (err, result) => {
                        if (err) {
                            console.error('Database error:', err);
                            return res.status(500).json({ error: 'Failed to update profile picture' });
                        }
                        
                        // Delete old profile picture if it exists
                        if (oldProfileImage && oldProfileImage !== profileImage) {
                            const oldFilePath = path.join(__dirname, '..', oldProfileImage);
                            if (fs.existsSync(oldFilePath)) {
                                fs.unlinkSync(oldFilePath);
                            }
                        }
                        
                        res.json({ 
                            message: 'Profile picture updated successfully', 
                            profileImage: profileImage 
                        });
                    }
                );
            } else {
                // No profile yet, insert new record
                db.query(
                    'INSERT INTO user_profiles (userID, profileImage, originalFileName) VALUES (?, ?, ?)',
                    [userID, profileImage, req.file.originalname],
                    (err, result) => {
                        if (err) {
                            console.error('Database error:', err);
                            return res.status(500).json({ error: 'Failed to save profile picture' });
                        }
                        
                        res.json({ 
                            message: 'Profile picture uploaded successfully', 
                            profileImage: profileImage 
                        });
                    }
                );
            }
        });
        
    } catch (err) {
        console.error('Error in profile picture upload:', err);
        
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: 'File size limit exceeded. Maximum file size is 5MB.' 
                });
            }
            return res.status(400).json({ error: err.message });
        }
        
        res.status(500).json({ error: 'Server error during profile picture upload' });
    }
});

// Route to remove profile picture
router.delete('/remove', (req, res) => {
    const { userID } = req.body;
    
    if (!userID) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get current profile image
    db.query('SELECT profileImage FROM user_profiles WHERE userID = ?', [userID], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        
        const profileImage = results[0].profileImage;
        
        // Update database to remove profile image reference
        db.query(
            'UPDATE user_profiles SET profileImage = NULL, originalFileName = NULL WHERE userID = ?',
            [userID],
            (err, result) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to remove profile picture reference' });
                }
                
                // Delete the file if it exists
                if (profileImage) {
                    const filePath = path.join(__dirname, '..', profileImage);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
                
                res.json({ message: 'Profile picture removed successfully' });
            }
        );
    });
});

// Route to get user profile picture
router.get('/:userID', (req, res) => {
    const { userID } = req.params;
    
    db.query('SELECT profileImage FROM user_profiles WHERE userID = ?', [userID], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0 || !results[0].profileImage) {
            // Return default image path based on user gender
            db.query('SELECT gender FROM users WHERE id = ?', [userID], (err, userResults) => {
                if (err || userResults.length === 0) {
                    // If error or user not found, return generic default
                    return res.json({ profileImage: `${API_BASE_URL}/assets/default_profile.png` });
                }
                
                const gender = userResults[0].gender;
                const defaultImage = gender === 'female' 
                    ? '/assets/default_female.png' 
                    : '/assets/default_male.png';
                
                res.json({ profileImage: defaultImage });
            });
        } else {
            res.json({ profileImage: results[0].profileImage });
        }
    });
});

export default router;