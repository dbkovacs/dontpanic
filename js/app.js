/* /js/app.js */
document.addEventListener('DOMContentLoaded', () => {
    // This is the core function to initialize the application.
    // For now, it only sets the build timestamp.
    function initializeApp() {
        setBuildTimestamp();
    }

    // Finds the timestamp element and populates it with the current date and time.
    function setBuildTimestamp() {
        const timestampElement = document.getElementById('build-timestamp');
        if (timestampElement) {
            const now = new Date();
            const timestampString = `Build: ${now.toLocaleString()}`;
            timestampElement.textContent = timestampString;
        } else {
            console.error('Timestamp element with ID "build-timestamp" was not found.');
        }
    }

    // Run the app initialization.
    initializeApp();
});
/* Build Timestamp: Wed, 24 Sep 2025 16:53:57 GMT */