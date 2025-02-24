const axios = require('axios');

// Helper function to get the timezone for given coordinates
async function getTimezoneFromLocation(longitude, latitude) {
  try {
    const apiKey = process.env.TIMEZONE_DB_API_KEY; // Use the TimeZoneDB API key from .env
    const response = await axios.get(
      `https://api.timezonedb.com/v2.1/get-time-zone?key=${apiKey}&format=json&by=position&lat=${latitude}&lng=${longitude}`
    );

    const data = response.data;

    if (data.status === 'OK') {
      return data.zoneName; // Returns the timezone (e.g., "Asia/Kolkata")
    } else {
      console.error('Error fetching timezone:', data.message);
      return null;
    }
  } catch (error) {
    console.error('Error fetching timezone:', error.message);
    return null;
  }
}

module.exports = { getTimezoneFromLocation };