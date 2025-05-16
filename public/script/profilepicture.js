// Profile Picture Management
window.addEventListener('userIdReady', (e) => {
    const userId = e.detail.userId;    
    if (userId) {
        document.getElementById('userID').value = userId;

        // Load current profile picture
        loadProfilePicture(userId);
        console.log("ssdd22323d");
    }
    
    // Profile picture click handler - opens the modal
    const profilePicture = document.getElementById('profile-picture');
    if (profilePicture) {
        profilePicture.addEventListener('click', function() {
            const modal = new bootstrap.Modal(document.getElementById('profilePictureModal'));
            modal.show();
            console.log(userId, "hh");
        });
    }
    
    // File input change handler - preview the selected image
    const profilePictureInput = document.getElementById('profilePicture');
    if (profilePictureInput) {
        profilePictureInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // Check file type
                if (!file.type.startsWith('image/')) {
                    showError('Please select an image file');
                    profilePictureInput.value = '';
                    return;
                }
                
                // Check file size (5MB limit)
                if (file.size > 5 * 1024 * 1024) {
                    showError('File size exceeds 5MB limit');
                    profilePictureInput.value = '';
                    return;
                }
                
                // Preview image
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('preview-profile-image').src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Form submit handler - upload profile picture
    const profilePictureForm = document.getElementById('profilePictureForm');
    if (profilePictureForm) {
        profilePictureForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const fileInput = document.getElementById('profilePicture');
            if (fileInput.files.length === 0) {
                showError('Please select an image file');
                return;
            }
            
            const formData = new FormData(profilePictureForm); 

            // Upload profile picture
            fetch(`${API_BASE_URL}/api/profile/upload`, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showError(data.error);
                    return;
                }
                
                // Update profile picture in UI
                document.getElementById('user-profile-image').src = `${BASE_URL}${data.profileImage}`;
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('profilePictureModal'));
                modal.hide();
                
                // Show success message
                showToast('Profile picture updated successfully');
            })
            .catch(error => {
                console.error('Error uploading profile picture:', error);
                showError('Failed to upload profile picture. Please try again.');
            });
        });
    }
    
    // Remove profile picture button handler
    const removeProfileBtn = document.getElementById('removeProfileBtn');
    if (removeProfileBtn) {
        removeProfileBtn.addEventListener('click', function() {
            if (!confirm('Are you sure you want to remove your profile picture?')) {
                return;
            }
            
            const userID = document.getElementById('userID').value;
            
            fetch(`${API_BASE_URL}/api/profile/remove`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userID })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showError(data.error);
                    return;
                }
                
                // Reset profile pictures in UI
                loadProfilePicture(userID); // This will load the default image
                
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('profilePictureModal'));
                modal.hide();
                
                // Show success message
                showToast('Profile picture removed successfully');
            })
            .catch(error => {
                console.error('Error removing profile picture:', error);
                showError('Failed to remove profile picture. Please try again.');
            });
        });
    }
});

// Function to load profile picture
function loadProfilePicture(userID) {
    fetch(`${API_BASE_URL}/api/profile/${userID}`)
        .then(response => response.json())
        .then(data => {
            const profileImage = data.profileImage;

            const imgsource = `${BASE_URL}${profileImage}`;
            
            // Update all instances of the user's profile picture
            const profileImages = document.querySelectorAll(`[data-user-profile="${userID}"]`);
            profileImages.forEach(img => {
                img.src = imgsource;
            });
            
            // Update the main profile picture and preview
            document.getElementById('user-profile-image').src = imgsource;
            document.getElementById('preview-profile-image').src = imgsource;
        })
        .catch(error => {
            console.error('Error loading profile picture:', error);
            // Use default image on error
            const defaultImage = `${API_BASE_URL}/assets/default_profile.png`;
            document.getElementById('user-profile-image').src = defultImage;
            document.getElementById('preview-profile-image').src = defaultImage;
        });
}

// Helper function to show error message
function showError(message) {
    const errorElement = document.getElementById('upload-error');
    errorElement.textContent = message;
    errorElement.classList.remove('d-none');
    
    // Hide error after 5 seconds
    setTimeout(() => {
        errorElement.classList.add('d-none');
    }, 5000);
}

// Helper function to show toast notification
function showToast(message) {
    // Check if you have a toast component
    if (typeof showNotification === 'function') {
        showNotification(message, 'success');
    } else {
        // Simple alert fallback
        alert(message);
    }
}