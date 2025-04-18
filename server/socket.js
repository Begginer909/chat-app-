import db from './config/config.js';

const users = new Map(); // Stores userID -> socketID

export function initializeSocket(io) {
	io.on('connection', (socket) => {
		console.log('A user connected', socket.id);

		// Register user and store their socket ID
		socket.on('register', (userID) => {
			users.set(userID, socket.id);
			console.log(`User ${userID} registered with socket ${socket.id}`);

			socket.join(`private_${userID}`);

			// Join all group rooms this user is a member of
			db.query('SELECT groupID FROM group_members WHERE userID = ?', [userID], (err, groups) => {
				if (err) {
					console.error('Error fetching user groups:', err);
					return;
				}

				groups.forEach((group) => {
					socket.join(`group_${group.groupID}`);
					console.log(`User ${userID} joined group_${group.groupID} room`);
				});
			});
		});

		//Query to show recent chat for users and receiver
		const recentChatQuery = `
							(SELECT
								u.userID, 
								u.username,
								u.firstname,
								u.lastname,
								p.sentAt,
								'private' AS chatType
							FROM users u
							JOIN private p ON (p.senderID = u.userID OR p.receiverID = u.userID)
							WHERE (p.senderID = ? OR p.receiverID = ?) AND u.userID != ?
							)

							UNION

							(SELECT 
								g.groupID AS userID, 
								g.groupName AS username,  
								NULL AS firstname, 
								NULL AS lastname,
								m.sentAt,
								'group' AS chatType
							FROM groups g JOIN messages m ON g.groupID = m.groupID
							JOIN group_members gm ON gm.groupID = g.groupID
							WHERE gm.userID = ?
							)
							ORDER BY sentAt DESC
						`;

		socket.on('sendmessage', ({ senderID, receiverID, message, messageType, fileUrl, groupID, chatType, messageID }) => {
			// Always get fresh socket references
			const senderSocket = () => users.get(senderID);
			const receiverSocket = () => users.get(receiverID);

			db.query('SELECT username FROM users WHERE userID = ?', [senderID], (err, results) => {
				if (err) {
					console.error('Database error:', err);
					return;
				}

				if (results.length === 0) {
					console.error('User not found');
					return;
				}

				const username = results[0].username;
				let query;
				let params;

				if (chatType === 'private') {
					query = 'INSERT INTO private (senderID, receiverID, message, messageType, fileUrl) VALUES (?, ?, ?, ?, ?)';
					params = [senderID, receiverID, message, messageType, fileUrl];

					if (messageType === 'text') {
						db.query(query, params, (err, result) => {
							if (!err) {
								const messageID = result.insertId;

								db.query('INSERT INTO private_message_receipts (messageID, status) VALUES (?, ?)', [messageID, 'sent'], (err) => {
									if (err) {
										console.error('Error creating receipt record: ', err);
									}

									const messageData = {
										senderID,
										receiverID,
										username,
										message,
										messageType,
										fileUrl,
										groupID,
										chatType,
										messageID,
									};

									// Always emit to sender's room
									io.to(`private_${senderID}`).emit('newMessage', messageData);

									console.log('Emitting newMessage:', { senderID, receiverID, username, message, messageType, fileUrl, groupID, chatType, messageID });

									// Update recent chat for sender
									db.query(recentChatQuery, [senderID, senderID, senderID, senderID], (err, senderResult) => {
										if (!err && senderSocket) {
											io.to(senderSocket).emit('recentChatResult', senderResult);
										}
									});

									const receiverSocketId = receiverSocket();

									if (receiverSocketId) {
										// Update for receiver
										db.query(recentChatQuery, [receiverID, receiverID, receiverID, receiverID], (err, receiverResult) => {
											if (!err && receiverSocketId) {
												// Send message to receiver
												io.to(`private_${receiverID}`).emit('newMessage', messageData);
												io.to(`private_${receiverID}`).emit('recentChatResult', receiverResult);

												db.query('UPDATE private_message_receipts SET status = ?, statusChangedAt = NOW() WHERE messageID = ?', ['delivered', messageID], (err) => {
													if (err) {
														console.error('Error updating receipt status');
														return;
													}

													// Notify sender that message was delivered
													io.to(`private_${senderID}`).emit('messageStatus', {
														messageID,
														status: 'delivered',
														receiverID,
													});

													console.log(`Message ${messageID} marked as delivered to ${receiverID}`);
												});
											}
										});
									} else {
										console.log(`Receiver ${receiverID} is offline, message remains as 'sent'`);
									}
								});

								//console.log(` scokeesease: ${socket.id}`);
							} else {
								console.error('Error inserting message:', err);
							}
						});
					} else {
						// For file messages, just broadcast to all clients since DB insert was done in the upload endpoint
						//io.emit('newMessage', { senderID, receiverID, username, message, messageType, fileUrl, groupID, chatType, messageID });
						// For file messages, broadcast to relevant users
						const messageData = {
							senderID,
							receiverID,
							username,
							message,
							messageType,
							fileUrl,
							groupID,
							chatType,
							messageID,
						};

						io.to(`private_${senderID}`).emit('newMessage', messageData);
						io.to(`private_${receiverID}`).emit('newMessage', messageData);
					}
				} else if (chatType === 'group') {
					query = 'INSERT INTO messages (senderID, message, messageType, fileUrl, groupID) VALUES (?, ?, ?, ?, ?)';
					params = [senderID, message, messageType, fileUrl, groupID];

					console.log(`Group id is: ${groupID}`);

					if (messageType === 'text') {
						db.query(query, params, (err, result) => {
							if (!err) {
								const messageID = result.insertId;

								// Get all group members except sender
								db.query('SELECT userID FROM group_members WHERE groupID = ? AND userID != ?', [groupID, senderID], (err, members) => {
									if (err) {
										console.error('Error fetching group members:', err);
										return;
									}
									//Create receipt records for all members
									members.forEach((member) => {
										db.query('INSERT INTO group_message_receipts (messageID, userID, status) VALUES (?, ?, ?)', [messageID, member.userID, 'sent'], (err) => {
											if (err) console.error('Error creating group receipt record: ', err);

											//If member is online. mark as delivered
											const memberSocket = users.get(member.userID);
											if (memberSocket) {
												db.query('UPDATE group_message_receipts SET status = ?, statusChangedAt = NOW() WHERE messageID = ? AND userID = ?', ['delivered', messageID, member.userID], (err) => {
													if (err) console.error('Error updating group receipt status', err);
													else {
														// Notify sender about delivery status
														const senderSocketId = users.get(senderID);
														if (senderSocketId) {
															io.to(`group_${groupID}`).emit('messageStatus', {
																messageID,
																status: 'delivered',
																userID: member.userID,
																groupID,
															});
														}
													}
												});
												console.log('Delivered success');
											}
										});
									});
									// Emit new message to sender and all group members
									io.to(`group_${groupID}`).emit('newMessage', {
										senderID,
										username,
										message,
										messageType,
										fileUrl,
										chatType,
										groupID,
										messageID,
									});
								});
							} else {
								console.error('Error inserting message:', err);
							}
						});
					} else {
						// For file messages in group chats
						// Get all group members except sender
						db.query('SELECT userID FROM group_members WHERE groupID = ? AND userID != ?', [groupID, senderID], (err, members) => {
							if (err) {
								console.error('Error fetching group members:', err);
								return;
							}

							// First, get the messageID that was created during file upload
							db.query('SELECT messageID FROM messages WHERE senderID = ? AND fileUrl = ? AND groupID = ? ORDER BY sentAt DESC LIMIT 1', [senderID, fileUrl, groupID], (err, messageResults) => {
								if (err || messageResults.length === 0) {
									console.error('Error finding message ID for file:', err);
									return;
								}

								const messageID = messageResults[0].messageID;

								// Create receipt records for all members
								members.forEach((member) => {
									db.query('INSERT INTO group_message_receipts (messageID, userID, status) VALUES (?, ?, ?)', [messageID, member.userID, 'sent'], (err) => {
										if (err) console.error('Error creating group receipt record: ', err);

										// If member is online, mark as delivered
										const memberSocket = users.get(member.userID);
										if (memberSocket) {
											db.query('UPDATE group_message_receipts SET status = ?, statusChangedAt = NOW() WHERE messageID = ? AND userID = ?', ['delivered', messageID, member.userID], (err) => {
												if (err) console.error('Error updating group receipt status', err);
												else {
													// Notify sender about delivery status
													io.to(`group_${groupID}`).emit('messageStatus', {
														messageID,
														status: 'delivered',
														userID: member.userID,
														groupID,
													});
												}
											});
										}
									});
								});

								// Emit message with the messageID included
								io.to(`group_${groupID}`).emit('newMessage', {
									senderID,
									username,
									message,
									messageType,
									fileUrl,
									chatType,
									groupID,
									messageID,
								});
							});
						});
					}
				}
			});
		});

		socket.on('recentChat', (userID) => {
			console.log('user id is: ', userID);

			db.query(recentChatQuery, [userID, userID, userID, userID], (err, result) => {
				if (err) {
					console.error('Error fetching recent chat', err);
				} else {
					socket.emit('recentChatResult', result);
				}
			});
		});

		// In the server-side socket.js file
		socket.on('seenMessage', (data) => {
			const { messageID, senderID, userID, username, groupID, chatType } = data;

			if (chatType === 'group') {
				// First update the DB
				db.query('UPDATE group_message_receipts SET status = ?, statusChangedAt = NOW() WHERE messageID = ? AND userID = ?', ['seen', messageID, userID], (err) => {
					if (err) console.error('Error updating group receipt status to seen:', err);
					else {
						// Get ALL users who have seen this message
						db.query(
							'SELECT u.userID, u.username FROM group_message_receipts gmr JOIN users u ON gmr.userID = u.userID WHERE gmr.messageID = ? AND gmr.status = "seen"',
							[messageID],
							(err, seenResults) => {
								if (err) {
									console.error('Error getting seen users:', err);
									return;
								}

								// Create a string of all usernames who've seen the message
								const seenByUsers = seenResults.map((user) => user.username).join(', ');

								// Get message sender ID
								db.query('SELECT senderID FROM messages WHERE messageID = ?', [messageID], (err, result) => {
									if (err || !result.length) {
										console.error('Error getting message sender:', err);
										return;
									}

									const messageSenderID = result[0].senderID;
									const senderSocket = users.get(messageSenderID);

									// Emit to sender with complete list of who has seen the message
									if (senderSocket) {
										io.to(senderSocket).emit('messageStatus', {
											messageID,
											status: 'seen',
											userID,
											username,
											groupID,
											seenByUsers, // Send complete list of users who've seen the message
										});
									}

									// Also broadcast to all group members with complete list
									io.to(`group_${groupID}`).emit('messageStatus', {
										messageID,
										status: 'seen',
										userID,
										username,
										groupID,
										seenByUsers,
									});
								});
							}
						);
					}
				});
			} else if (chatType === 'private') {
				// Fix for private messages
				db.query('UPDATE private_message_receipts SET status = ?, statusChangedAt = NOW() WHERE messageID = ?', ['seen', messageID], (err) => {
					if (err) console.error('Error updating private receipt status to seen:', err);
					else {
						// Notify sender that message was seen
						const senderSocket = users.get(senderID);
						if (senderSocket) {
							console.log(`${senderID} and ${senderSocket}`);
							io.to(`private_${senderID}`).emit('messageStatus', {
								messageID,
								status: 'seen',
								receiverID: userID,
							});
						}
					}
				});
			}
		});

		socket.on('activateChat', ({ userID, chatType, groupID, otherUserID }) => {
			// Leave all active chat rooms
			for (const room of socket.rooms) {
				if (room.startsWith('active_')) {
					socket.leave(room);
				}
			}

			// Join new active chat room
			if (chatType === 'group' && groupID) {
				socket.join(`active_group_${groupID}`);
				console.log(`User ${userID} activated group chat ${groupID}`);
			} else if (chatType === 'private' && otherUserID) {
				socket.join(`active_private_${userID}_${otherUserID}`);
				console.log(`User ${userID} activated private chat with ${otherUserID}`);

				// Similar logic for private chats if needed
			}
		});

		socket.on('disconnect', () => {
			for (const [userID, socketID] of users.entries()) {
				if (socketID === socket.id) {
					console.log(`User ${userID} disconnected`);
					users.delete(userID);
					break;
				}
			}
		});
	});
}
