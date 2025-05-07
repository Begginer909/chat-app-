import express from 'express';
import db from '../config/config.js';

const router = express.Router();

router.get('/search', async (req, res) => {
    try {
        const { value, convoID, chatType } = req.query;

        let querySearch;

        if (!value || !convoID) {
            return res.status(400).json({ error: "Missing query or convoID" });
        }

        if (chatType === 'private') {
            querySearch = `SELECT * FROM private WHERE messageID = ? AND message LIKE ? 
                            ORDER BY sentAt ASC`;
        } else {
            querySearch = `SELECT * FROM messages WHERE groupID =? AND message LIKE ? 
                     ORDER BY sentAt ASC`;
        }

        db.query(querySearch, [convoID, `%${value}%`], async (err, result) => {
            if (err) {
                return res.status(500).json({ message: 'Database error' });
            }

            const enhancedResult = result.map(msg => {
                const lowerText = msg.message.toLowerCase();
                const lowerValue = value.toLowerCase();

                //Find all matches within this message
                const matches = [];
                let startIndex = 0;
                let matchIndex;

                while ((matchIndex = lowerText.indexOf(lowerValue, startIndex)) !== -1) {
                    matches.push({
                        startIndex: matchIndex,
                        endIndex: matchIndex + value.length
                    })
                    startIndex = matchIndex + 1;
                }

                return {
                    ...msg,
                    id: msg.messageID,
                    matches
                };
            })

            res.json(enhancedResult);
        });

    } catch (err) {
        console.error('Error searching messages:', err);
        res.status(500).json({ message: 'Failed to search messages' });
    }
});

export default router;