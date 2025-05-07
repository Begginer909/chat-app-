const searchInput = document.getElementById('search');
const searchResults = document.getElementById('searchResults');
const recentChat = document.getElementById('recentchats');

//Function for debounce to create a delay stop when searching
function debounce(func, delay) {
	let timeoutId;
	return function(...args) {
	  clearTimeout(timeoutId);
	  timeoutId = setTimeout(() => {
		func.apply(this, args);
	  }, delay);
	};
}
  
document.addEventListener('DOMContentLoaded', () => {
	function fetchSearchResults(searchValue) {
		if (!searchValue.trim()) return Promise.resolve([]); // Prevent empty search requests
	
		return fetch(`${API_BASE_URL}/search/recent`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ search: searchValue }),
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status}`);
				}
				return response.json();
			})
			.catch((error) => {
				console.error('Error fetching search results:', error);
				return []; // Return empty array if there's an error
			});
	}
	
	let lastSearchValue = ''; // Store the last search value
	
	// Create a debounced search function
	const performSearch = async (searchValue) => {
		if (searchValue === lastSearchValue) {
			return; // Prevent duplicate search requests
		}
	
		lastSearchValue = searchValue;
	
		console.log("hello");
		
		if (searchValue === '') {
			// If search is empty, show recent chats again
			searchResults.innerHTML = '';
			searchResults.style.display = 'none';
			recentChat.style.display = 'block'; // Show recent chats
			return; // Exit function
		}
		
		searchResults.style.display = 'block';
		recentChat.style.display = 'none';
	
		// Fetch search results and display them
		const data = await fetchSearchResults(searchValue);
		displaySearchResults(data);
	};
	
	// Create the debounced version of the search function (300ms delay)
	const debouncedSearch = debounce((value) => performSearch(value), 300);
	
	// Detect typing in the search bar
	searchInput.addEventListener('input', () => {
		const searchValue = searchInput.value.trim();
		debouncedSearch(searchValue);
	});
	
	function displaySearchResults(data) {
		searchResults.innerHTML = ''; // Clear previous results
		chatType = 'private';
	
		if (data.length === 0) {
			searchResults.innerHTML = '<p class="text-muted">No results found</p>';
			return;
		}
		data.forEach((user) => {
			const userDiv = document.createElement('div');
			userDiv.classList.add('search-item', 'p-2', 'border-bottom');
			const button = document.createElement('button');
			button.type = 'button';
			button.classList.add('btn', 'btn-light', 'mb-0', 'w-100', 'p-3', 'mb-2');
			button.textContent = `${user.firstname} ${user.lastname} ${user.userID}`;
	
			// Fetch all messages for this user on click
			button.addEventListener('click', () => {
				fetchChatHistory(user.userID, chatType);
				searchResults.style.display = 'none';
				recentChat.style.display = 'block';
				chatName.textContent = `${user.firstname} ${user.lastname}`;
			});
			userDiv.appendChild(button);
			searchResults.appendChild(userDiv);
		});
		searchResults.scrollTop = searchResults.scrollHeight;
	}
});
