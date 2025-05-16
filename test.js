import db from './config/config.js';

export function initializeSocket(io) {
	io.on('connection', (socket) => {
		console.log('A user connected', socket.id);

		// Fetch chat history for both group and private messages
		socket.on('requestChatHistory', (userId) => {
			// Query for group messages
			const groupChatHistory = `
                SELECT 
                    m.messageID, 
                    m.senderID, 
                    m.message, 
                    m.messageType, 
                    m.fileUrl, 
                    m.sentAt, 
                    u.username, 
                    g.groupName,
                    'group' as chatType
                FROM messages m 
                JOIN users u ON m.senderID = u.userID
                JOIN groups g ON m.groupID = g.groupID
                WHERE m.groupID IN (
                    SELECT groupID FROM group_members WHERE userID = 1
                )
            `;

			// Query for private messages
			const privateChatHistory = `
                SELECT 
                    p.messageID, 
                    p.senderID, 
                    p.receiverID, 
                    p.message, 
                    p.messageType, 
                    p.fileUrl, 
                    p.sentAt, 
                    u.username,
                    'private' as chatType
                FROM private p
                JOIN users u ON p.senderID = u.userID
                WHERE p.senderID = ? OR p.receiverID = ?
            `;

			// Execute both queries
			db.query(groupChatHistory, [userId], (groupErr, groupResults) => {
				if (groupErr) {
					console.error('Error fetching group chat history', groupErr);
					return;
				}

				db.query(privateChatHistory, [userId, userId], (privateErr, privateResults) => {
					if (privateErr) {
						console.error('Error fetching private chat history', privateErr);
						return;
					}

					// Combine and emit results
					socket.emit('chat history', {
						groupMessages: groupResults,
						privateMessages: privateResults,
					});
				});
			});
		});

		// Handle sending messages (both group and private)
		socket.on('sendMessage', (messageData) => {
			const { senderID, receiverID, groupID, message, messageType, fileUrl, chatType } = messageData;

			// Validate message data
			if (!senderID || !message || !messageType || !chatType) {
				console.error('Invalid message data');
				return;
			}

			// Get sender's username
			db.query('SELECT username FROM users WHERE userID = ?', [senderID], (err, userResults) => {
				if (err || userResults.length === 0) {
					console.error('User not found', err);
					return;
				}

				const username = userResults[0].username;

				if (chatType === 'group') {
					// Insert group message
					const groupQuery = 'INSERT INTO messages (senderID, groupID, message, messageType, fileUrl) VALUES (?, ?, ?, ?, ?)';
					db.query(groupQuery, [senderID, groupID, message, messageType, fileUrl], (insertErr, result) => {
						if (insertErr) {
							console.error('Error inserting group message', insertErr);
							return;
						}

						// Broadcast to group members
						io.emit('newMessage', {
							messageID: result.insertId,
							senderID,
							username,
							groupID,
							message,
							messageType,
							fileUrl,
							chatType: 'group',
						});
					});
				} else if (chatType === 'private') {
					// Insert private message
					const privateQuery = 'INSERT INTO private (senderID, receiverID, message, messageType, fileUrl) VALUES (?, ?, ?, ?, ?)';
					db.query(privateQuery, [senderID, receiverID, message, messageType, fileUrl], (insertErr, result) => {
						if (insertErr) {
							console.error('Error inserting private message', insertErr);
							return;
						}

						// Emit to specific users
						io.emit('newMessage', {
							messageID: result.insertId,
							senderID,
							receiverID,
							username,
							message,
							messageType,
							fileUrl,
							chatType: 'private',
						});
					});
				}
			});
		});

		socket.on('disconnect', () => {
			console.log('User disconnected:', socket.id);
		});
	});
}
