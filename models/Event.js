const mongoose = require('mongoose');

// Define the Event schema
const eventSchema = new mongoose.Schema({
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // User who created the event
  type: { type: String, required: true }, // Type of event (e.g., Birthday, Wedding)
  startTime: { type: Date, required: true }, // Start time of the event in UTC
  endTime: { type: Date, required: true }, // End time of the event in UTC
  location: {
    latitude: { type: Number, required: true }, // Latitude of the event location
    longitude: { type: Number, required: true }, // Longitude of the event location
  },
  additionalDetails: { type: String, default: '' }, // Additional details about the event
});

// Index for host to optimize queries by host ID
eventSchema.index({ host: 1 });

module.exports = mongoose.model('Event', eventSchema); // Export the Event model