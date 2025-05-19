const socket = io('http://localhost:3000');
const API_BASE_URL = 'http://localhost:3000';
const BASE_URL = 'http://localhost/chat-app/server';
const messageInput = document.getElementById('messageInput');
const messages = document.getElementById('messages');
const chatName = document.getElementById('name');
const fullname = document.getElementById('username');
const searchInputChat = document.getElementById('search-input');
const searchInfo = document.getElementById('search-info');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const serverSearchToggle = document.getElementById('server-search');


let userId = null;
let lastSenderId = null;
let currentChatGroupID = null;
let currentChatUserID = null;
let messageID = null; 
let chatType;

//Variables for searching chat history
let searchResultsChat = [];
let currentResultIndex = -1;

//Lazy loading variables
let messagesPage = 1;
const messagesPerPage = 20;
let isLoadingMoreMessages = false;
let hasMoreMessages = true;

// Typing Indicator
let typingTimer;
const typingDelay = 1000; // Delay in ms (1 second)
let isTyping = false;
let typingUsers = new Map(); // To track who's typing in group chats

const onlineUsers = new Set(); // To store online user IDs
const onlineGroups = new Map(); // To store group online status (groupID -> boolean)

// Global variables for emoji functionality
let emojiPicker = null;
let currentReactionTarget = null;

// Add this function inside the setupChat function after setting up other socket listeners
function setupTypingIndicator() {
	console.log("Typing indicator working");
	// Create typing indicator element if it doesn't exist
	if (!document.getElementById('typingIndicator')) {
		console.log("Createad a indicator");
		const typingIndicator = document.createElement('div');
		typingIndicator.id = 'typingIndicator';
		typingIndicator.classList.add('typing-indicator');
		typingIndicator.style.display = 'none';
		typingIndicator.style.fontStyle = 'italic';
		typingIndicator.style.color = '#666';
		typingIndicator.style.padding = '5px 10px';
		typingIndicator.textContent = 'Someone is typing...';

		messages.appendChild(typingIndicator);
		typingIndicator.scrollIntoView({ behavior: 'smooth' });
	}

	// Listen for typing event from server
	socket.on('userTyping', ({ userID, username, chatType, groupID }) => {
		const typingIndicator = document.getElementById('typingIndicator');

		// Only show typing indicator if we're in the correct chat
		if (chatType === 'private' && userID === currentChatUserID) {
			typingIndicator.textContent = `${username} is typing...`;
			typingIndicator.style.display = 'inline-block';
		} else if (chatType === 'group' && groupID === currentChatGroupID) {
			// Add this user to the list of typing users
			typingUsers.set(userID, username);

			if (typingUsers.size === 1) {
				typingIndicator.textContent = `${username} is typing...`;
			} else {
				typingIndicator.textContent = `Someone is typing...`;
			}	
			typingIndicator.style.display = 'inline-block';
		}

		// Make sure typing indicator is visible
		messages.scrollTop = messages.scrollHeight;
	});

	// Listen for stopped typing event
	socket.on('userStoppedTyping', ({ userID, chatType, groupID }) => {
		const typingIndicator = document.getElementById('typingIndicator');

		if (chatType === 'private' && userID === currentChatUserID) {
			typingIndicator.style.display = 'none';
		} else if (chatType === 'group' && groupID === currentChatGroupID) {
			// Remove user from typing users
			typingUsers.delete(userID);

			if (typingUsers.size === 0) {
				typingIndicator.style.display = 'none';
			} else if (typingUsers.size === 1) {
				// Get the first (and only) username
				const [username] = [...typingUsers.values()];
				typingIndicator.textContent = `${username} is typing...`;
			} else {
				typingIndicator.textContent = `Several people are typing...`;
			}
		}
	});

	// Add input event listener to message input
	messageInput.addEventListener('input', function () {
		if (!isTyping) {
			isTyping = true;

			// Determine current chat type and target
			const currentChatType = currentChatGroupID ? 'group' : 'private';
			const targetID = currentChatType === 'private' ? currentChatUserID : currentChatGroupID;

			// Only emit if we're in an active chat
			if (targetID) {
				socket.emit('typing', {
					userID: userId,
					username: fullname.textContent,
					chatType: currentChatType,
					receiverID: currentChatType === 'private' ? targetID : null,
					groupID: currentChatType === 'group' ? targetID : null,
				});
			}
		}

		// Clear existing timer
		clearTimeout(typingTimer);

		// Set new timer
		typingTimer = setTimeout(() => {
			isTyping = false;

			const currentChatType = currentChatGroupID ? 'group' : 'private';
			const targetID = currentChatType === 'private' ? currentChatUserID : currentChatGroupID;

			if (targetID) {
				socket.emit('stopTyping', {
					userID: userId,
					chatType: currentChatType,
					receiverID: currentChatType === 'private' ? targetID : null,
					groupID: currentChatType === 'group' ? targetID : null,
				});
			}
		}, typingDelay);
	});
}

function setupImageLazyLoading(imgElement, placeholder, container) {
	// Set up Intersection Observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // If the image is in view
            if (entry.isIntersecting) {
                const image = entry.target;
                // Load the image
                image.src = image.dataset.src;
                
                // When the image loads, show it and remove the placeholder
                image.onload = function() {
                    image.style.opacity = '1';
				if (placeholder) {
					placeholder.style.display = 'none';
				}
                };
                
                // Stop observing the image
                observer.unobserve(image);
            }
        });
    }, {
        // Options: trigger when at least 10% of the image is in view
        threshold: 0.1,
        rootMargin: '100px' // Load images 100px before they come into view
    });
    
    // Start observing the image
    observer.observe(imgElement);
}

function setupFileLazyLoading(fileLink) {
	// Set up Intersection Observer
	const observer = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			// If the file link is in view
			if (entry.isIntersecting) {
				const link = entry.target;
                
				// Set the actual href when in view
				if (link.dataset.href) {
					link.href = link.dataset.href;
				}
                
				// Stop observing the link
				observer.unobserve(link);
			}
		});
	}, {
		// Options: trigger when at least 10% of the link is in view
		threshold: 0.1,
		rootMargin: '100px' // Load files 100px before they come into view
	});
    
	// Start observing the file link
	observer.observe(fileLink);
}

document.addEventListener('DOMContentLoaded', async () => {
	try {
		const response = await fetch(`${API_BASE_URL}/cookie/protected`, {
			method: 'GET',
			credentials: 'include',
		});

		if (!response.ok) {
			throw new Error('Failed to fetch user information');
		}
		const data = await response.json();

		setupChat(data.user);
	} catch (err) {
		console.log('Something went wrong: ', err);
	}
});

function setupChat(data) {
	userId = data.userID;

	const event = new CustomEvent('userIdReady', { detail: { userId } });
	window.dispatchEvent(event);

	fullname.textContent = `${data.username}`;

	// Call the scroll lister for setup
	setupMessagesScrollListener();

	// Call the Typing indicator function
	setupTypingIndicator();

	socket.on('connect', () => {
		socket.emit('register', userId);
		console.log(`Reconnected! Registering userID ${userId} with new socket ID.`);
	});

	// Receive new messages
	socket.on('newMessage', handleNewMessage);

	//Function to process the incomming messages to show for both sender and receiver
	function handleNewMessage({ senderID, receiverID, username, message, messageType, fileUrl, groupID, chatType, messageID }) {
		//console.log(`Received message: chatType=${chatType}, from=${senderID}, to=${receiverID}, group=${groupID}`);

		//Check if the chat type to determine what to display
		if (chatType === 'private') {
			// For private messages, check if this chat is currently active
			if (senderID === currentChatUserID || (receiverID === currentChatUserID && senderID === userId)) {
				displayMessage({ senderID, receiverID, username, message, messageType, fileUrl, messageID });
				console.log(`Sender: ${senderID} currentChatUserID ${currentChatUserID} receiverID ${receiverID} userId ${userId} messageID ${messageID}`);
				console.log(typeof senderID, typeof currentChatUserID, typeof receiverID, typeof userId);

				
				// Only mark as seen if this is an incoming message AND the group chat is active
				if (senderID !== userId && !currentChatGroupID) {
					socket.emit('seenMessage', {
						messageID: messageID,
						senderID: senderID,
						userID: userId,
						chatType: 'private',
					});

					console.log("Works fines here", messageID);
				}
			}
		} else if (chatType === 'group') {
			// For group messages, check if this is for the current group
			if (groupID === currentChatGroupID) {
				displayMessage({ senderID, username, message, messageType, fileUrl, groupID, messageID });
				//console.log(`groupID: ${groupID} currentchatGroupID ${currentChatGroupID}`);
				//console.log('Works fine here before emitting');
				// Only mark as seen if this is an incoming message AND the group chat is active
				//console.log(`senderID: ${senderID} userID: ${userId} messageID: ${messageID} groupID: ${groupID} currentGroupID: ${currentChatGroupID}`);
				if (senderID !== userId && messageID && groupID === currentChatGroupID) {
					//console.log('Works fine here');
					socket.emit('seenMessage', {
						messageID: messageID,
						senderID: senderID,
						userID: userId,
						username: fullname.textContent,
						chatType: 'group',
						groupID: currentChatGroupID,
					});
				}
			}
		}

		// Always refresh recent chats when receiving any message
		socket.emit('recentChat', userId);
	}

	// Check Status of users
	socket.on('messageStatus', handleMessageStatus);

	function handleMessageStatus({ messageID, status, userID, username, seenByOthers }) {
		// Find the message element by messageID
		const messageElement = document.querySelector(`[data-message-id="${messageID}"]`);
		if (!messageElement) return;

		//console.log('Status update received:', messageID, status);

		// Update the status indicator
		const statusIndicator = messageElement.querySelector('.message-status');

		if (!statusIndicator) {
			const statusContainer = messageElement.querySelector('.message-status-container');
			if (statusContainer) {
				statusIndicator = statusContainer.querySelector('.message-status');
			}
		}

		if (!statusIndicator && messageElement.classList.contains('message-status-container')) {
			statusIndicator = messageElement.querySelector('.message-status');
		}

		if (!statusIndicator) return;

		//console.log(`Status: ${status}`);

		// Update status text and icon
		if (status === 'sent') {
			statusIndicator.innerHTML = '<i class="fas fa-check"></i>';
			statusIndicator.title = 'Sent';
			console.log('here');
		} else if (status === 'delivered') {
			statusIndicator.innerHTML = '<i class="fas fa-check-double"></i>';
			statusIndicator.title = 'Delivered';
			console.log('hair');
		} else if (status === 'seen') {
			statusIndicator.innerHTML = '<i class="fas fa-check-double seen-icon"></i>';
			console.log('hair1111');
			// For group chats, show who has seen the message
			if (currentChatGroupID) {
				const currentTitle = statusIndicator.title || '';
				// Parse existing seen users if any
				let seenUsers = [];

				if (currentTitle.startsWith('Seen by')) {
					seenUsers = currentTitle
						.replace('Seen by ', '')
						.split(', ')
						.filter((name) => name.trim() !== '');
				}

				// Only add username if not already in the list and not the current user
				if (username && !seenUsers.includes(username) && userID !== userId) {
					seenUsers.push(username);
				}

				// If we have seenByOthers from the database, use that instead
				if (seenByOthers && seenByOthers.trim()) {
					// This may already include duplicates, so we'll parse and deduplicate
					const otherUsers = seenByOthers.split(', ').filter((name) => name.trim() !== '');

					// Create a Set for deduplication
					const uniqueUsers = new Set([...seenUsers, ...otherUsers]);
					seenUsers = Array.from(uniqueUsers);
				}

				if (seenUsers.length > 0) {
					statusIndicator.title = `Seen by ${seenUsers.join(', ')}`;
				} else {
					statusIndicator.title = 'Seen';
				}
			} else {
				// Private message
				statusIndicator.title = 'Seen';
			}
		}
	}

	// Handle incoming reaction updates
	socket.on('reactionUpdate', handleReactionUpdate);
	socket.on('reactionRemoved', handleReactionRemoved);
	socket.on('messageReactions', handleMessageReactions);

	function handleReactionUpdate({ messageID, userID, username, emoji, chatType }) {
		const messageElement = document.querySelector(`[data-message-id="${messageID}"]`);
		if (!messageElement) return;
		
		// Get the reaction container
		const reactionContainer = messageElement.querySelector('.reaction-container');
		if (!reactionContainer) return;
		
		// Get current reactions from data attribute
		let reactions = {};
		try {
			reactions = JSON.parse(messageElement.getAttribute('data-reactions') || '{}');
		} catch (e) {
			reactions = {};
		}
		
		// Update reactions
		if (!reactions[emoji]) {
			reactions[emoji] = [];
			console.log("Hello there");
		}
		
		// Check if user already reacted with this emoji
		const userIndex = reactions[emoji].findIndex(r => r.userID === userID);
		if (userIndex === -1) {
			reactions[emoji].push({ userID, username });
			console.log("Hello there 2");
		}
		
		// Remove user from all existing emoji reactions
		for (const [em, users] of Object.entries(reactions)) {
			reactions[em] = users.filter(r => r.userID !== userID);
			}
			
		// Add user to new emoji reaction
		if (!reactions[emoji]) {
			reactions[emoji] = [];
		}
		reactions[emoji].push({ userID, username });

		// Update data attribute
		messageElement.setAttribute('data-reactions', JSON.stringify(reactions));
		
		// Update the UI
		updateReactionDisplay(reactionContainer, reactions);
	}

	setupEmojiPicker();
  
	// Add emoji button next to the message input
	const emojiButton = document.getElementById('emojiButton');
	
	// Set up emoji button click handler
	emojiButton.addEventListener('click', function() {
		const messageInput = document.getElementById('messageInput');
		
		// Create a separate picker for inserting emojis into messages
		if (!window.messageEmojiPicker) {
		window.messageEmojiPicker = new EmojiButton({
			position: 'top-start',
			theme: 'auto',
			autoHide: true
		});
		
		window.messageEmojiPicker.on('emoji', emoji => {
			// Insert emoji at cursor position
			const cursorPos = messageInput.selectionStart;
			const textBeforeCursor = messageInput.value.substring(0, cursorPos);
			const textAfterCursor = messageInput.value.substring(cursorPos);
			
			messageInput.value = textBeforeCursor + emoji + textAfterCursor;
			
			// Move cursor position after the inserted emoji
			messageInput.selectionStart = cursorPos + emoji.length;
			messageInput.selectionEnd = cursorPos + emoji.length;
			messageInput.focus();
		});
		}
		
		window.messageEmojiPicker.togglePicker(emojiButton);
	});

	function sendMessage(message, file) {
		if (!message.trim() && !file) return;

		chatType = currentChatGroupID ? 'group' : 'private';
		const receiverID = currentChatGroupID || currentChatUserID;

		//console.log(`Send message to ${receiverID}`);

		//console.log('Chat Type: ' + chatType);

		const receiver = chatType === 'private' ? currentChatUserID : null;
		const groupID = chatType === 'group' ? currentChatGroupID : null;

		const payload = {
			senderID: userId,
			receiverID: receiver,
			groupID: groupID,
			chatType: chatType,
			message: message,
			messageType: file ? (file.type.startsWith('image') ? 'image' : 'file') : 'text',
			fileUrl: null,
		};

		if (!file) {
			socket.emit('sendmessage', payload);
			return;
		}

		const formData = new FormData();
		formData.append('senderID', userId);
		formData.append('receiverID', currentChatUserID);
		formData.append('chatType', chatType);
		formData.append('message', message || '');
		formData.append('files', file);
		formData.append('groupID', groupID);

		//console.log(`Chat Type is ${chatType}`);
		//console.log(`GROUP ID IS ${groupID}`);

		fetch(`${API_BASE_URL}/api/upload`, {
			method: 'POST',
			body: formData,
		})
			.then((res) => res.json())
			.then((data) => {
				//console.log('Upload response:', data);
				payload.fileUrl = data.fileUrl || null;
				//console.log(`payload: ${payload}`);
				socket.emit('sendmessage', payload);
				socket.emit('recentChat', userId);
			})
			.catch((err) => console.error('Upload error:', err));
	}

	function displayMessage(msg) {
		const messageWrapper = document.createElement('div');
		messageWrapper.classList.add('message-wrapper');

		const isNewSender = lastSenderId !== msg.senderID;

		if (isNewSender) {
			const nameElement = document.createElement('p');
			nameElement.textContent = msg.senderID === userId ? '' : msg.username;
			nameElement.classList.add('message-name');
			messageWrapper.appendChild(nameElement);
		}

		const messageElement = document.createElement('div');
		messageElement.textContent = msg.message;
		messageElement.classList.add('message-box');

		// Check if the message was sent by the current user
		if (msg.senderID === userId) {
			messageWrapper.classList.add('my-message'); // Align right
		} else {
			messageWrapper.classList.add('other-message'); // Align left
		}

		// Create a separate container for the status indicator
		const statusContainer = document.createElement('div');
		statusContainer.classList.add('message-status-container');

		// Create the status indicator
		const statusIndicator = document.createElement('span');
		statusIndicator.classList.add('message-status');

		if (msg.messageType === 'image' && msg.fileUrl) {
			try {
				const fileUrls = JSON.parse(msg.fileUrl);
				fileUrls.forEach((file) => {
					const imgContainer = document.createElement('div');
					imgContainer.classList.add('image-container');
					
					// Create a placeholder with the same aspect ratio
					const placeholder = document.createElement('div');
					placeholder.classList.add('image-placeholder');
					placeholder.style.backgroundColor = '#e9ecef';
					placeholder.style.width = '100%';
					placeholder.style.paddingBottom = '75%'; // 4:3 aspect ratio placeholder
					placeholder.style.position = 'relative';
					
					// Add loading spinner
					const spinner = document.createElement('div');
					spinner.classList.add('spinner-border', 'text-primary');
					spinner.style.position = 'absolute';
					spinner.style.top = '50%';
					spinner.style.left = '50%';
					spinner.style.transform = 'translate(-50%, -50%)';
					placeholder.appendChild(spinner);
					
					imgContainer.appendChild(placeholder);
					messageElement.appendChild(imgContainer);
					
					// Create the actual image element
					const imgElement = document.createElement('img');
					imgElement.classList.add('chat-image', 'img-fluid', 'lazy-image');
					imgElement.dataset.src = `http://localhost/chat-app/server${file.url}`;
					
					// Hide the image initially
					imgElement.style.opacity = 0;
					
					// Event listener for when clicked
					imgElement.addEventListener('click', function () {
						openImageModal(this.src);
					});
					
					// Add the hidden image to the container
					imgContainer.appendChild(imgElement);

					// Set up intersection observer for this image
					setupImageLazyLoading(imgElement, placeholder, imgContainer);
					
				});
			} catch (e) {
				console.error('Invalid image URL format:', msg.fileUrl);
			}
		} else if (msg.messageType === 'file' && msg.fileUrl) {
			try {
				const fileUrls = JSON.parse(msg.fileUrl);
				fileUrls.forEach((file) => {
					const displayname = ` ${file.originalName}`;
					const fileContainer = document.createElement('div');
					fileContainer.classList.add('file-container');
					
					// Create lazy-loaded file link
					const iconspan = document.createElement('span');
					iconspan.classList.add('file-icon');
					iconspan.innerHTML = '<i class="fas fa-file-alt"></i>';
		
					const fileLink = document.createElement('a');
					fileLink.append(iconspan);
					fileLink.href = `http://localhost/chat-app/server${file.url}`;
					fileLink.append(displayname);
					fileLink.target = '_blank';
					fileLink.classList.add('file-link');
					
					if (msg.senderID === userId) {
						fileLink.classList.add('my-file-link');
					} else {
						fileLink.classList.add('other-file-link');
					}
		
					fileLink.setAttribute('download', displayname.trim());
					
					// Add lazy loading behavior - only fetch the actual link when visible
					fileLink.dataset.href = fileLink.href;
					fileLink.removeAttribute('href'); // Remove the href temporarily
					
					// Set up intersection observer for this file link
					setupFileLazyLoading(fileLink);
					
					fileContainer.appendChild(fileLink);
					messageElement.appendChild(fileContainer);
				});
			} catch (e) {
				console.error('Invalid file URL format:', msg.fileUrl);
			}
		} else if (msg.messageType === 'text' && msg.message) {
			messageElement.textContent = msg.message;
		}

		if (msg.messageID) {
			messageWrapper.setAttribute('data-message-id', msg.messageID);
		} 

		// Add the reaction button
		const reactionButton = document.createElement('button');
		reactionButton.classList.add('reaction-button');
		reactionButton.innerHTML = '<i class="far fa-smile"></i>';
		reactionButton.title = "Add reaction";
		// Event listener for the reaction button
		reactionButton.addEventListener('click', function(e) {
			e.preventDefault();
			e.stopPropagation();
				
			currentReactionTarget = this;

			console.log("Works here", emojiPicker);
				
			// Show the emoji picker
			if (emojiPicker) {
				console.log("Works here", emojiPicker);
				emojiPicker.togglePicker(reactionButton);
			}
		});

		// Add reaction container (will contain all reactions)
		const reactionContainer = document.createElement('div');
		reactionContainer.classList.add('reaction-container');
		messageWrapper.setAttribute('data-reactions', '{}'); // Initialize empty reactions

		const messageContentWrapper = document.createElement('div');
		messageContentWrapper.classList.add('message-content-wrapper');

		//For profile picture of users in chatbox 
		const profileContainer = document.createElement('div');
		profileContainer.classList.add('profile-container');

		const profile = document.createElement('img');
		profile.classList.add('profile-picture');
		profile.alt = `${msg.username}'s profile`;

		profile.src = `${API_BASE_URL}/assets/default_profile.png`;

		// Fetch the profile picture
		fetch(`http://localhost:3000/api/profile/${msg.senderID}`)
		.then(res => res.json())
		.then(data => {
			profile.src = data.profileImage.startsWith('http') 
			? data.profileImage 
			: `${BASE_URL}${data.profileImage}`;
		})
		.catch((err) => {
			console.error('Error loading profile picture:', err);
		});

		profileContainer.appendChild(profile);

			
		if (msg.senderID === userId) {
			statusIndicator.innerHTML = '<i class="fas fa-check"></i>'; // Initial "sent" status
			statusIndicator.title = 'Sent';

			messageContentWrapper.classList.add('sender-layout'); // Align right

			// Append the status container to the message
			statusContainer.appendChild(statusIndicator);
			messageContentWrapper.appendChild(reactionButton);
			messageContentWrapper.appendChild(messageElement);
			messageElement.appendChild(statusContainer);
			messageWrapper.appendChild(reactionContainer);
			messageWrapper.appendChild(messageContentWrapper);
			//messageWrapper.appendChild(statusContainer);
		} else {
			messageContentWrapper.classList.add('receiver-layout'); // Align left
			// For messages received, don't add status indicators
			statusContainer.appendChild(statusIndicator);
			messageContentWrapper.appendChild(profileContainer);
			messageContentWrapper.appendChild(messageElement);
			messageContentWrapper.appendChild(reactionButton);
			messageElement.appendChild(statusContainer);
			messageWrapper.appendChild(reactionContainer);
			messageWrapper.appendChild(messageContentWrapper);
			//messageWrapper.appendChild(statusContainer);
		}
		messages.appendChild(messageWrapper);

		lastSenderId = msg.senderID;

		// Fetch reactions for this message
		if (msg.messageID) {
			socket.emit('getMessageReactions', {
			  messageID: msg.messageID,
			  chatType: currentChatGroupID ? 'group' : 'private'
			});
		}
		
		messages.scrollTop = messages.scrollHeight;
	}

	//Show recent chat on the left of window
	function recent(chats) {
		const chatlist = document.getElementById('recentchats');

		chatlist.innerHTML = ''; // Clear previous list
		const addedUsers = new Set(); // Track unique users

		//Create a list of button for the recent users
		chats.forEach((chat, index) => {
			let chatNameUsers;
			if (!addedUsers.has(chat.userID)) {
				addedUsers.add(chat.userID); // Prevent duplicates

				// Create chatItem list
				const chatItem = document.createElement('div');
				chatItem.classList.add('chat-item', 'd-flex', 'align-items-center');

				// Create status indicator
				const statusIndicator = document.createElement('span');
				statusIndicator.classList.add('status-indicator', 'mr-2');

				// Set appropriate data attribute for status tracking
				if (chat.chatType === 'private') {
					statusIndicator.setAttribute('data-user-id', chat.userID);
					// Set initial status
					statusIndicator.classList.add(onlineUsers.has(chat.userID) ? 'online' : 'offline');
				} else {
					statusIndicator.setAttribute('data-group-id', chat.userID);
					// Set initial status for group
					statusIndicator.classList.add(onlineGroups.get(chat.userID) ? 'online' : 'offline');
				}

				const button = document.createElement('button');
				button.type = 'button';
				button.classList.add('btn', 'btn-light', 'mb-0', 'w-100', 'p-3', 'mb-2', 'text-left');

				// Text wrapper for the username
				const textSpan = document.createElement('span');
				textSpan.classList.add('ms-2', 'flex-grow-1');
				chatName.classList.add('fw-bold');
				if (chat.chatType === 'private') {
					textSpan.textContent = `${chat.firstname} ${chat.lastname}`;
					chatNameUsers = `${chat.firstname} ${chat.lastname}`;
				} else {
					textSpan.textContent = `${chat.username} (Group)`;
					chatNameUsers = `${chat.username} (Group)`;
				}

				// Append status indicator and text to button
				button.appendChild(statusIndicator);
				button.appendChild(textSpan);

				// Fetch all messages for this user on click
				button.addEventListener('click', () => {
					fetchChatHistory(chat.userID, chat.chatType);
					document.getElementById("sidebar").classList.remove("active");
					chatName.textContent = `${chatNameUsers}`;

					// Remove hover-effect class from all buttons
					document.querySelectorAll('.chat-item button').forEach((btn) => {
						btn.classList.remove('hover-effect');
					});

					// Add hover effect class to the clicked button
					button.classList.add('hover-effect');
				});

				chatItem.appendChild(button);
				chatlist.append(chatItem);
			}
		});
		// Call status update after rendering the chat list
		updateUserStatusIndicators();
	}

	function fetchChatHistory(otherUserID, chatType, resetPagination = true) {
		if (currentChatUserID === otherUserID && chatType === 'private' && !resetPagination) {
			// Same private chat, don't reset if not requested
		} else if (currentChatGroupID === otherUserID && chatType === 'group' && !resetPagination) {
			// Same group chat, don't reset if not requested
		} else {
			// New chat, reset everything
			if (chatType === 'group') {
				currentChatGroupID = otherUserID;
				currentChatUserID = null;
				updateGroupHeader(currentChatGroupID);
			} else {
				currentChatUserID = otherUserID;
				currentChatGroupID = null;
				updateHeaderStatus();
			}
	
			// Reset pagination and UI
			messagesPage = 1;
			hasMoreMessages = true;
			messages.innerHTML = '';
			
			// Reset typing indicator and tracking
			const typingIndicator = document.getElementById('typingIndicator');
			if (typingIndicator) {
				typingIndicator.style.display = 'none';
			}
			typingUsers.clear();
		}

		socket.emit('activateChat', {
			userID: userId,
			chatType,
			groupID: chatType === 'group' ? otherUserID : null,
			otherUserID: chatType === 'private' ? otherUserID : null,
		});
	
		loadMessages(chatType);
	}

	
	function loadMessages(chatType, scrollToBottom = true) {
		if (isLoadingMoreMessages || !hasMoreMessages) return;
		
		isLoadingMoreMessages = true;
		
		// Show loading indicator at the top of messages
		const loadingIndicator = document.createElement('div');
		loadingIndicator.id = 'message-loading';
		loadingIndicator.className = 'text-center p-2';
		loadingIndicator.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div>';
		
		if (messagesPage > 1) {
			messages.prepend(loadingIndicator);
		}
	
		const payload = {
			userID: userId,
			otherUserID: chatType === 'private' ? currentChatUserID : null,
			groupID: chatType === 'group' ? currentChatGroupID : null,
			chatType,
			page: messagesPage,
			limit: messagesPerPage
		};
	
		fetch(`${API_BASE_URL}/search/getMessages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		})
		.then((response) => response.json())
		.then((fetchedMessages) => {
			// Remove loading indicator
			const loadingElement = document.getElementById('message-loading');
			if (loadingElement) loadingElement.remove();
			
			// Check if we have more messages to load
			hasMoreMessages = fetchedMessages.length === messagesPerPage;
			
			// Keep track of scroll position before adding new content
			const oldScrollHeight = messages.scrollHeight;
			
			// Save current first element to maintain scroll position
			const firstElement = messages.firstChild;
			
			if (fetchedMessages.length === 0) {
				hasMoreMessages = false;
				isLoadingMoreMessages = false;
				return;
			}
	
			// Keep track of last sender for grouping messages
			if (messagesPage === 1) {
				lastSenderId = null;
			}
	
			// Store current scroll position
			const scrollTop = messages.scrollTop;
			
			// Add messages to the DOM
			fetchedMessages.forEach((msg) => {
				if (messagesPage > 1) {
					// If loading older messages, insert at the top
					const tempDiv = document.createElement('div');
					
					// Store the current firstChild
					const currentFirst = messages.firstChild;
					
					// Need to add to DOM temporarily to display the message properly
					messages.prepend(tempDiv);
					
					// Keep track of original lastSenderId
					const originalLastSenderId = lastSenderId;
					
					// Reset lastSenderId for proper grouping of prepended messages
					lastSenderId = null;
					
					// Display the message in our temporary container
					displayMessage(msg);
					
					// Move the displayed message to the top of the list
					if (tempDiv.nextSibling) {
						messages.insertBefore(tempDiv.nextSibling, currentFirst);
					}
					
					// Remove the temporary container
					tempDiv.remove();
					
					// Restore original lastSenderId
					lastSenderId = originalLastSenderId;
				} else {
					// If initial load, just append as usual
					displayMessage(msg);
				}
	
				handleMessageStatus({
					messageID: msg.messageID,
					status: msg.status,
					userID: msg.userID,
					username: msg.username,
					seenByOthers: msg.seenByUsers,
				});
	
				// Mark message as seen if it's from someone else
				if (msg.senderID !== userId && msg.messageID) {
					socket.emit('seenMessage', {
						messageID: msg.messageID,
						senderID: msg.senderID,
						userID: userId,
						username: fullname.textContent,
						chatType: chatType,
						groupID: chatType === 'group' ? currentChatGroupID : null,
					});
				}
			});
	
			// If loading older messages (page > 1), maintain scroll position
			if (messagesPage > 1) {
				// Calculate how much the content height has increased
				const newScrollHeight = messages.scrollHeight;
				const scrollHeightDiff = newScrollHeight - oldScrollHeight;
				
				// Adjust scroll position to maintain relative position
				messages.scrollTop = scrollTop + scrollHeightDiff;
			} else if (scrollToBottom) {
				// If it's the first page, scroll to bottom
				messages.scrollTop = messages.scrollHeight;
			}
	
			messagesPage++;
			isLoadingMoreMessages = false;
		})
		.catch((error) => {
			console.error('Error fetching chat history:', error);
			const loadingElement = document.getElementById('message-loading');
			if (loadingElement) {
				loadingElement.innerHTML = 'Error loading messages. <button class="btn btn-sm btn-link" onclick="retryLoadMessages(\'' + chatType + '\')">Retry</button>';
			}
			isLoadingMoreMessages = false;
		});
	}

	// Add scroll event listener to the messages container for infinite scrolling
	function setupMessagesScrollListener() {
		const messagesContainer = document.getElementById('messages');
		messagesContainer.addEventListener('scroll', function() {
			// If we're near the top (100px) and not currently loading, load more messages
			if (messagesContainer.scrollTop < 100 && !isLoadingMoreMessages && hasMoreMessages) {
				const chatType = currentChatGroupID ? 'group' : 'private';
				loadMessages(chatType, false);
			}
		});
	}

	// Helper function to retry loading messages if there was an error
	function retryLoadMessages(chatType) {
		const loadingElement = document.getElementById('message-loading');
		if (loadingElement) {
			loadingElement.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div>';
		}
		loadMessages(chatType, false);
	}
	
	let isLoadingMoreMessages = false;

	//console.log('It start to run this socket.emit');
	socket.emit('recentChat', userId);

	let initialChatLoaded = false;

	socket.on('recentChatResult', (data) => {
		//console.log('Recent Data: ', data);
		recent(data);

		// Automatically open the first/most recent chat only on initial load
		if (data && data.length > 0 && !initialChatLoaded) {
			// Get the first chat (most recent)
			const recentChat = data[0];

			// Set the chat name in the header
			let chatNameUsers;
			if (recentChat.chatType === 'private') {
				chatNameUsers = `${recentChat.firstname} ${recentChat.lastname}`;
			} else {
				chatNameUsers = `${recentChat.username} (Group)`;
			}
			chatName.textContent = chatNameUsers;

			// Fetch the chat history for this user/group
			fetchChatHistory(recentChat.userID, recentChat.chatType);

			// Highlight the button
			setTimeout(() => {
				const firstChatButton = document.querySelector('.chat-item button');
				if (firstChatButton) {
					firstChatButton.classList.add('hover-effect');
				}
			}, 100);

			// Set the flag to true so we don't automatically open chats again
			initialChatLoaded = true;
		}
	});

	//Able to show the users when creating a group
	async function fetchUsers() {
		try {
			const response = await fetch(`${API_BASE_URL}/search/users?userId=${userId}`);
			if (!response.ok) throw new Error('Failed to fetch users');

			const users = await response.json();
			const selectElement = document.getElementById('groupMembers');

			selectElement.innerHTML = ''; // Clear previous options

			users.forEach((user) => {
				const div = document.createElement('div');
				div.classList.add('form-check');

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.value = user.userID;
				checkbox.id = `user-${user.userID}`;
				checkbox.classList.add('form-check-input');

				const label = document.createElement('label');
				label.htmlFor = `user-${user.userID}`;
				label.classList.add('form-check-label');
				label.textContent = `${user.firstname} ${user.lastname}`;

				div.appendChild(checkbox);
				div.appendChild(label);
				selectElement.appendChild(div);
			});
		} catch (error) {
			console.error('Error loading users:', error);
		}
	}

	//Create group when the modal submitted
	document.getElementById('groupForm').addEventListener('submit', async (e) => {
		e.preventDefault();

		const groupNameInput = document.getElementById('groupName');
		const groupName = groupNameInput.value;
		const members = Array.from(document.querySelectorAll('#groupMembers input[type="checkbox"]:checked')).map((checkbox) => checkbox.value);
		const creatorID = userId;
		//console.log(creatorID);

		if (!groupName.trim() || members.length === 0) {
			alert('Please enter a group name and select at least one member.');
			return;
		}

		try {
			const response = await fetch(`${API_BASE_URL}/search/createGroup`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupName, members, creatorID }),
			});

			if (!response.ok) throw new Error('Failed to create group');

			const data = await response.json();

			alert('Group created successfully!');

			groupNameInput.value = '';

			fetchUsers();
			socket.emit('recentChat', userId);
			const modal = bootstrap.Modal.getInstance(document.getElementById('groupModal'));
			modal.hide();
		} catch (error) {
			console.error('Error creating group:', error);
		}
	});

	document.getElementById('createGroup').addEventListener('click', fetchUsers);

	// Add these handlers in your setupChat function
	socket.on('onlineUsers', (users) => {
		// Clear and refill the set
		onlineUsers.clear();
		users.forEach((userID) => {
			onlineUsers.add(userID.toString());
		});

		// Update UI
		updateUserStatusIndicators();
	});

	socket.on('groupStatusUpdate', ({ groupID, hasOnlineMembers }) => {
		// Update group status
		onlineGroups.set(parseInt(groupID), hasOnlineMembers);

		// Update UI
		updateUserStatusIndicators();

		// Update header if relevant
		if (currentChatGroupID === parseInt(groupID)) {
			updateGroupHeader(currentChatGroupID);
		}
	});

	socket.on('statusUpdate', ({ userID, status }) => {
		// Update individual user status
		const userIdString = String(userID);

		if (status === 'online') {
			onlineUsers.add(userIdString);
		} else {
			onlineUsers.delete(userIdString);
		}
		
		console.log('Hello World ');
		// Update UI
		updateUserStatusIndicators();

		// If we're in a group chat, update group header
		if (currentChatGroupID) {
			updateGroupHeader(currentChatGroupID);
		}
	});

	socket.on('groupOnlineStatus', (groupStatuses) => {
		// Parse and update group statuses
		Object.entries(groupStatuses).forEach(([groupID, isOnline]) => {
			onlineGroups.set(groupID, isOnline);
		});

		// Update UI
		updateUserStatusIndicators();
	});

	// Add this function to display online members count in the header
	function updateGroupHeader(groupID) {
		if (!groupID) return;

		// Fetch online members count for this group
		fetch(`${API_BASE_URL}/search/groupMembers?groupID=${groupID}`, {
			method: 'GET',
			credentials: 'include',
		})
			.then((response) => response.json())
			.then((members) => {
				// Ensure all IDs are strings before comparison
				const onlineCount = members.filter((member) => 
					onlineUsers.has(String(member.userID))
				).length;
				const totalCount = members.length;

				/*
				console.log(`Online Count: ${onlineCount} groupID: ${groupID}`);
				console.log('onlineUsers Set:', Array.from(onlineUsers));
				console.log(
					'member IDs:',
					members.map((m) => String(m.userID))
				);
				*/

				// Create status elements if they don't exist
				let statusText = document.getElementById('group-status-text');
				if (!statusText) {
					statusText = document.createElement('span');
					statusText.id = 'group-status-text';
					statusText.className = 'ms-2';
					document.querySelector('.chat-header').appendChild(statusText);
				}
	
				let statusIndicator = document.getElementById('chat-status-indicator');
				if (!statusIndicator) {
					statusIndicator = document.createElement('span');
					statusIndicator.id = 'chat-status-indicator';
					statusIndicator.className = 'status-indicator ms-2';
					document.querySelector('.chat-header').appendChild(statusIndicator);
				}
	
				// Update the status text
				statusText.textContent = `${onlineCount} of ${totalCount} online`;
				statusText.style.display = 'inline-block';
	
				// Update the status indicator
				statusIndicator.classList.remove('online', 'offline');
				statusIndicator.classList.add(onlineCount > 0 ? 'online': 'offline');
				statusIndicator.style.display = 'inline-block';
				statusIndicator.title = onlineCount > 0 ? 'Online' : 'Offline';

				//console.log(statusIndicator.classList);
			})
			.catch((error) => console.error('Error fetching group members:', error));
	}

	// Enhance the updateUserStatusIndicators function with tooltips
	function updateUserStatusIndicators() {
		// console.log('Updating status indicators...');
		// console.log('Online users:', Array.from(onlineUsers));
		// console.log('Online groups:', Array.from(onlineGroups.entries()));
		
		// Update private chat indicators
		document.querySelectorAll('.status-indicator[data-user-id]').forEach((indicator) => {
			const userID = indicator.dataset.userId;
			// Convert to string to ensure proper comparison
			const isOnline = onlineUsers.has(String(userID));
	
			indicator.classList.remove('online', 'offline');
			indicator.classList.add(isOnline ? 'online' : 'offline');
			indicator.setAttribute('title', isOnline ? 'Online' : 'Offline');
	
			// console.log(`Updating user ${userID} status to ${isOnline ? 'online' : 'offline'}`);
		});
	
		// Update group chat indicators
		document.querySelectorAll('.status-indicator[data-group-id]').forEach((indicator) => {
			const groupID = parseInt(indicator.dataset.groupId);
			// Ensure consistent comparison
			const hasOnlineMembers = Boolean(onlineGroups.get(groupID));
	
			indicator.classList.remove('online', 'offline');
			indicator.classList.add(hasOnlineMembers ? 'online' : 'offline');
			indicator.setAttribute('title', hasOnlineMembers ? 'Members online' : 'No members online');
	
			// console.log(`Updating group ${groupID} status to ${hasOnlineMembers ? 'online' : 'offline'}`);
		});
	
		// Update header status indicator
		updateHeaderStatus();
	}
	// Enhanced updateHeaderStatus function with tooltips
	function updateHeaderStatus() {
		const statusIndicator = document.getElementById('chat-status-indicator');
		const groupStatusText = document.getElementById('group-status-text');
		// Create elements if they don't exist 
		if (!statusIndicator) {
			const headerElement = document.querySelector('.chat-header');
			if (!headerElement) return;
			
			const newStatusIndicator = document.createElement('span');
			newStatusIndicator.id = 'chat-status-indicator';
			newStatusIndicator.className = 'status-indicator ms-2';
			headerElement.appendChild(newStatusIndicator);
		}

		if (!groupStatusText && currentChatGroupID) {
			const headerElement = document.querySelector('.chat-header');
			if (!headerElement) return;
			
			const newStatusText = document.createElement('span');
			newStatusText.id = 'group-status-text';
			newStatusText.className = 'ms-2';
			headerElement.appendChild(newStatusText);
		}

		// Get fresh references after possibly creating elements
		const updatedStatusIndicator = document.getElementById('chat-status-indicator');
		const updatedGroupStatusText = document.getElementById('group-status-text');
		
		if (!updatedStatusIndicator) return;
	
		// console.log('Updating header status:', {
		// 	currentChatUserID,
		// 	currentChatGroupID,
		// 	chatType: currentChatGroupID ? 'group' : 'private',
		// });
	
		// Hide both elements initially
		updatedStatusIndicator.style.display = 'none';
		if (updatedGroupStatusText) updatedGroupStatusText.style.display = 'none';

		if (currentChatUserID) {
			console.log(`current: ${currentChatUserID}`);
			// Private chat
			const isOnline = onlineUsers.has(String(currentChatUserID));
	
			updatedStatusIndicator.style.display = 'inline-block';
			updatedStatusIndicator.classList.remove('online', 'offline');
			updatedStatusIndicator.classList.add(isOnline ? 'online' : 'offline');

			groupStatusText.textContent = isOnline ? 'Online' : 'Offline';
			groupStatusText.style.display = 'inline-block';

		} else if (currentChatGroupID) {
			// Group chat
			const hasOnlineMembers = Boolean(onlineGroups.get(currentChatGroupID));

			console.log(`Has online members: ${ hasOnlineMembers }`);
	
			updatedStatusIndicator.style.display = 'inline-block';
			updatedStatusIndicator.classList.remove('online', 'offline');
			updatedStatusIndicator.classList.add(hasOnlineMembers ? 'online' : 'offline');
	
			// Show group status text if it exists
			if (updatedGroupStatusText) {
				updatedGroupStatusText.style.display = 'inline-block';
			}
		} else {
			// No chat selected
			updatedStatusIndicator.style.display = 'none';
		}
	}

	async function searchMessages(query) {
		const chatType = currentChatGroupID ? 'group' : 'private';
		console.log("Message ID:",currentChatGroupID, chatType);
		try {
			const response = await fetch(
				`${API_BASE_URL}/chatHistory/search?value=${encodeURIComponent(query)}&convoID=${currentChatGroupID}&chatType=${chatType}`
			);
			
			if (!response.ok) {
				throw new Error(`Server returned ${response.status}`);
			}
			
			const results = await response.json();
			return results;
		} catch (error) {
			console.error("Error searching messages:", error);
			return [];
		}
	}
	
	function performServerSearch(query) {
		clearHighlights();
		searchResultsChat = [];
		currentResultIndex = -1;
		
		// Show loading state
		searchInfo.textContent = "Searching...";
		
		// Call the API search function
		searchMessages(query)
			.then(matchingMessages => {
				console.log(matchingMessages.length, '');
				if (matchingMessages.length === 0) {
					searchInfo.textContent = "No matches found";
					return;
				}
				
				// Process each matching message from server
				matchingMessages.forEach(message => {
					const element = document.querySelector(`.message-box[data-id="${message.id}"]`);
					
					// If element doesn't exist in DOM, we might need to fetch/render it
					if (!element) {
						console.log(`Message ${message.id} not in current view`);
						// Here you could add code to render this message if needed
						return;
					}
					
					// Process each match within this message
					message.matches.forEach(match => {
						searchResultsChat.push({
							messageId: message.id,
							element,
							startIndex: match.startIndex,
							endIndex: match.endIndex
						});
					});
				});
				
				// Highlight all matches
				highlightMatches(query);
				updateSearchInfo();
				
				// Navigate to first result
				if (searchResultsChat.length > 0) {
					navigateToResult(0);
				}
			})
			.catch(error => {
				console.error("Search error:", error);
				searchInfo.textContent = "Error performing search";
			});
	}
	
	function performClientSearch(query) {
		clearHighlights();
		searchResultsChat = [];
		currentResultIndex = -1;
		
		const messageElements = messages.querySelectorAll('.message-box');
		
		messageElements.forEach(element => {
			const messageText = element.textContent;
			const messageId = element.dataset.id;
			
			// Find all occurrences of the query in the message
			let startIndex = 0;
			let index;
			while ((index = messageText.toLowerCase().indexOf(query, startIndex)) !== -1) {
				searchResultsChat.push({
					messageId,
					element,
					startIndex: index,
					endIndex: index + query.length
				});
				startIndex = index + 1; // Move to next potential match
			}
		});
		
		// Highlight all matches
		highlightMatches(query);
		updateSearchInfo();
		
		// Navigate to first result
		if (searchResultsChat.length > 0) {
			navigateToResult(0);
		}
	}
	
	function performSearch() {
		const query = searchInputChat.value.trim().toLowerCase();
		
		if (!query) {
			clearSearch();
			return;
		}
		
		if (serverSearchToggle.checked) {
			// Server-side search
			performServerSearch(query);
		} else {
			// Client-side search
			performClientSearch(query);
		}
	}
	
	function highlightMatches(query) {
		searchResultsChat.forEach((result, index) => {
			const element = result.element;
			const text = element.textContent;
			const beforeMatch = text.substring(0, result.startIndex);
			const match = text.substring(result.startIndex, result.endIndex);
			const afterMatch = text.substring(result.endIndex);
			
			// Create highlight span with unique data-result-index
			element.innerHTML = `${beforeMatch}<span class="highlight" data-result-index="${index}">${match}</span>${afterMatch}`;
		});
	}
	
	// Navigate to a specific search result
	function navigateToResult(index) {
		if (searchResultsChat.length === 0) return;
		
		// Ensure index is within bounds
		if (index < 0) index = searchResultsChat.length - 1;
		if (index >= searchResultsChat.length) index = 0;
		
		// Update current index
		currentResultIndex = index;
		
		// Remove active highlight class from all highlights
		document.querySelectorAll('.highlight').forEach(el => {
			el.classList.remove('active-highlight');
		});
		
		// Add active class to current highlight
		const currentHighlight = document.querySelector(`.highlight[data-result-index="${index}"]`);
		if (currentHighlight) {
			currentHighlight.classList.add('active-highlight');
			
			// Scroll the highlight into view with some padding
			currentHighlight.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		}
		
		updateSearchInfo();
	}
	
	// Update search info display
	function updateSearchInfo() {
		if (searchResultsChat.length === 0) {
			searchInfo.textContent = "No matches found";
		} else {
			searchInfo.textContent = `${currentResultIndex + 1} of ${searchResultsChat.length} matches`;
		}
	}
	
	// Clear all highlights
	function clearHighlights() {
		const messageElements = messages.querySelectorAll('.message-box');
		messageElements.forEach(element => {
			element.innerHTML = element.textContent;
		});
	}
	
	// Clear search results
	function clearSearch() {
		clearHighlights();
		searchResultsChat = [];
		currentResultIndex = -1;
		searchInfo.textContent = "";
	}

	// Event listeners for search
	searchInputChat.addEventListener('keypress', e => {
		if (e.key === 'Enter') {
			if (searchResultsChat.length > 0 && currentResultIndex >= 0) {
				// If we already have results, go to next result
				navigateToResult(currentResultIndex + 1);
			} else {
				// Otherwise perform a new search
				performSearch();
			}
		}
	});

	// Navigation buttons
	prevBtn.addEventListener('click', () => {
		if (searchResultsChat.length > 0) {
			navigateToResult(currentResultIndex - 1);
		}
	});
			
	nextBtn.addEventListener('click', () => {
		if (searchResultsChat.length > 0) {
			navigateToResult(currentResultIndex + 1);
		} else {
			performSearch(); // If no search performed yet, do it
		}
	});
			
	// Clear search when input is cleared
	searchInputChat.addEventListener('input', () => {
		if (searchInputChat.value.trim() === '') {
			clearSearch();
		}
	});
			
	// Toggle between client and server search
	serverSearchToggle.addEventListener('change', () => {
		if (searchInputChat.value.trim()) {
			performSearch(); // Re-run search with new mode
		}
	});


	//Checking the file size, should be maximum of 10MB 
	function validateFileSize(file) {
		const maxSize = 10 * 1024 * 1024; // 10MB in bytes
		if (file.size > maxSize) {
		  alert(`File "${file.name}" exceeds the 10MB size limit.`);
		  return false;
		}
		return true;
	}
	
	//Jquery for previewing the images or files when user selects it
	let selectedFiles = []; // Stores selected files or images

	// Function to add files to array and update preview
	function addFiles(files) {
		Array.from(files).forEach((file) => {
			if (validateFileSize(file)) {
				selectedFiles.push(file);
				displayPreview(file);
			}
		});
	}

	// Function to display file previews
	function displayPreview(file) {
		$('#previewContainer').addClass('active');

		updateChatBodyFlex();

		const reader = new FileReader();
		reader.onload = function (e) {
			let previewItem = $("<div class='preview-item'></div>");

			if (file.type.startsWith('image/')) {
				previewItem.append(`<img src="${e.target.result}" class="preview-image">`);
			} else {
				previewItem.append(`<p class="preview-text"> <i class="fas fa-file-alt"></i> ${file.name}</p>`);
			}

			const removeBtn = $('<button>')
				.addClass('remove-file')
				.html('<i class="fas fa-times"></i>')
				.click(function () {
					previewItem.remove();
					if ($('#previewContent').children().length === 0) {
						$('#previewContainer').removeClass('active');
						updateChatBodyFlex();
					}
				});

			previewItem.append(removeBtn);
			$('#previewContent').append(previewItem);
		};
		reader.readAsDataURL(file);
	}

	// Clear preview after sending
	function clearPreview() {
		selectedFiles = [];
		$('#previewContent').html('');
		$('#previewContainer').removeClass('active');
		updateChatBodyFlex();
	}

	$(document).ready(function () {

		// Define the drop zone (your message input area)
		const dropZone = $('.chat-panel');
  
		// Prevent default behaviors for drag events
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		  dropZone[0].addEventListener(eventName, preventDefaults, false);
		});
		
		function preventDefaults(e) {
		  e.preventDefault();
		  e.stopPropagation();
		}
		
		// Highlight drop zone when dragging over it
		['dragenter', 'dragover'].forEach(eventName => {
		  dropZone[0].addEventListener(eventName, highlight, false);
		});
		
		['dragleave', 'drop'].forEach(eventName => {
		  dropZone[0].addEventListener(eventName, unhighlight, false);
		});
		
		function highlight() {
		  dropZone.addClass('drag-highlight');
		}
		
		function unhighlight() {
		  dropZone.removeClass('drag-highlight');
		}
		
		// Handle dropped files
		dropZone[0].addEventListener('drop', handleDrop, false);
		
		function handleDrop(e) {
		  const dt = e.dataTransfer;
		  const files = dt.files;
		  
		  if (files.length > 0) {
			addFiles(files);
		  }
		}
		
		// Add this CSS to your stylesheet
		$('<style>')
		  .text(`
			.drag-highlight {
			  border: 2px dashed #007bff;
			  background-color: rgba(0, 123, 255, 0.1);
			}
		  `)
			.appendTo('head');
		
		// Open file manager when clicking icons
		$('#fileIcon').click(() => $('#fileInput').click());
		$('#imageIcon').click(() => $('#imageInput').click());

		// Enable multiple file selection
		$('#fileInput, #imageInput').attr('multiple', true);

		// Handle file selection
		$('#fileInput, #imageInput').change(function (event) {
			addFiles(event.target.files);
		});

		// Send button logic (sends message with or without files)
		$('#sendButton').click(function () {
			const message = $('#messageInput').val().trim();

			// Send each selected file individually
			if (selectedFiles.length > 0) {
				selectedFiles.forEach((file) => {
					sendMessage('', file);
				});

				if (message) {
					sendMessage(message); // Send text-only message after files
				}

				clearPreview();
			} else {
				sendMessage(message);
			}

			$('#messageInput').val(''); // Clear input after sending
		});
	});

	//Keypress so when the user hit enter it will automatically sends a message, because it ables to call a fucntion
	messageInput.addEventListener('keypress', function (e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault(); // Prevent default Enter behavior
			const message = $('#messageInput').val().trim();
			// Send each selected file individually
			if (selectedFiles.length > 0) {
				selectedFiles.forEach((file) => {
					sendMessage('', file); // Send files with empty text
				});

				// Then send the text message separately if it exists
				if (message) {
					sendMessage(message); // Send text-only message after files
				}
				clearPreview();
			} else {
				sendMessage(message);
			}

			$('#messageInput').val(''); // Clear input after sending
		}
	});
}

// Setup emoji library when the document is ready
function setupEmojiPicker() {
	// We'll use the picker-emoji library which is CDN available
	if (typeof EmojiButton !== 'undefined') {
	  // Initialize global emoji picker
	  emojiPicker = new EmojiButton({
		position: 'top-start',
		theme: 'auto',
		autoHide: true,
		emojiSize: '1.5rem'
	  });

		console.log("Emoji container here");
  
	  // Handle emoji selection
	  emojiPicker.on('emoji', emoji => {
		if (currentReactionTarget) {
		  const messageElement = currentReactionTarget.closest('[data-message-id]');
		  const messageID = messageElement.getAttribute('data-message-id');
		  
		  // Determine if this is a group or private chat
		  const chatType = currentChatGroupID ? 'group' : 'private';
		  
		  // Send the reaction to the server
		  socket.emit('addReaction', {
			messageID,
			userID: userId,
			emoji: emoji,
			chatType,
			groupID: currentChatGroupID,
			receiverID: currentChatUserID
		  });
		}
		currentReactionTarget = null;
	  });
	}
}

function handleReactionRemoved({ messageID, userID, emoji, chatType }) {
	const messageElement = document.querySelector(`[data-message-id="${messageID}"]`);
	if (!messageElement) return;
	
	// Get the reaction container
	const reactionContainer = messageElement.querySelector('.reaction-container');
	if (!reactionContainer) return;
	
	// Get current reactions
	let reactions = {};
	try {
	  reactions = JSON.parse(messageElement.getAttribute('data-reactions') || '{}');
	} catch (e) {
	  reactions = {};
	}
	
	// Remove this reaction
	if (reactions[emoji]) {
	  reactions[emoji] = reactions[emoji].filter(r => r.userID !== userID);
	  if (reactions[emoji].length === 0) {
		delete reactions[emoji];
	  }
	}
	
	// Update data attribute
	messageElement.setAttribute('data-reactions', JSON.stringify(reactions));
	
	// Update the UI
	updateReactionDisplay(reactionContainer, reactions);
}
  
function handleMessageReactions({ messageID, reactions }) {
	const messageElement = document.querySelector(`[data-message-id="${messageID}"]`);
	if (!messageElement) return;
	
	// Get the reaction container
	const reactionContainer = messageElement.querySelector('.reaction-container');
	if (!reactionContainer) return;
	
	// Transform reactions into the format we use
	let formattedReactions = {};
	reactions.forEach(r => {
	  if (!formattedReactions[r.emoji]) {
		formattedReactions[r.emoji] = [];
	  }
	  formattedReactions[r.emoji].push({ userID: r.userID, username: r.username });
	});
	
	// Update data attribute
	messageElement.setAttribute('data-reactions', JSON.stringify(formattedReactions));
	
	// Update the UI
	updateReactionDisplay(reactionContainer, formattedReactions);
}
  
function updateReactionDisplay(container, reactions) {
	// Clear the container
	container.innerHTML = '';
	
	// Add each emoji reaction
	Object.keys(reactions).forEach(emoji => {
	  if (reactions[emoji].length > 0) {
		const reactionBubble = document.createElement('div');
		reactionBubble.classList.add('reaction-bubble');
		
		// Emoji + count
		reactionBubble.innerHTML = `${emoji} <span class="reaction-count">${reactions[emoji].length}</span>`;
		
		// Add title with names of reactors
		const reactorNames = reactions[emoji].map(r => r.username).join(', ');
		reactionBubble.title = reactorNames;
		
		// Allow toggling your own reactions
		reactionBubble.addEventListener('click', function() {
		  const messageElement = container.closest('[data-message-id]');
		  const messageID = messageElement.getAttribute('data-message-id');
		  const chatType = currentChatGroupID ? 'group' : 'private';
		  
		  // Check if the current user has already reacted with this emoji
		  const userReacted = reactions[emoji].some(r => r.userID === userId);
		  
		  if (userReacted) {
			// Remove reaction
			socket.emit('removeReaction', {
			  messageID,
			  userID: userId,
			  emoji,
			  chatType,
			  groupID: currentChatGroupID,
			  receiverID: currentChatUserID
			});
		  } else {
			// Add reaction
			socket.emit('addReaction', {
			  messageID,
			  userID: userId,
			  emoji,
			  chatType,
			  groupID: currentChatGroupID,
			  receiverID: currentChatUserID
			});
		  }
		});
		
		container.appendChild(reactionBubble);
	  }
	});
}
  
  
function openImageModal(src) {
	const modal = document.getElementById('imageModal');
	const expandedImg = document.getElementById('expandedImage');

	expandedImg.style.backgroundColor = 'transparent';

	modal.style.display = 'block';

	expandedImg.src = src;

	// Add event listener to close button
	document.querySelector('.close-modal').addEventListener('click', function () {
		modal.style.display = 'none';
	});

	// Close modal when clicking outside the image
	modal.addEventListener('click', function (event) {
		if (event.target === modal) {
			modal.style.display = 'none';
		}
	});
}

//Close the Modal when esc button clicked
document.addEventListener('keydown', function (event) {
	if (event.key === 'Escape') {
		document.getElementById('imageModal').style.display = 'none';
	}
});
