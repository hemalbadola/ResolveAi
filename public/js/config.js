// Global Configuration - Dynamically resolved based on host
window.API_BASE_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:3000/api' 
    : window.location.origin + '/api';
