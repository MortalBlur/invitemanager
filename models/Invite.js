const mongoose = require('mongoose');
const crypto = require('crypto');
const ical = require('ical-generator');

// Define the Invite schema
const inviteSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true }, // Associated event ID
  type: { type: String, enum: ['bulk', 'individual'], required: true }, // Invite type (bulk or individual)
  guestsAllowed: { type: Number, default: null }, // Number of guests allowed (for bulk invites)
  inviteeDetails: {
    name: { type: String, default: '' }, // Invitee's name
    email: { type: String, default: '' }, // Invitee's email
    whatsappNumber: { type: String, default: '' }, // Invitee's WhatsApp number
    phoneNumber: { type: String, default: '' }, // Invitee's phone number
    age: { type: Number, default: null }, // Invitee's age
    houseAddress: { type: String, default: '' }, // Invitee's address
  },
  rsvpStatus: {
    attending: { type: Boolean, default: false }, // Whether the invitee is attending
    startTime: { type: Date, default: null }, // Start time chosen by the invitee
    endTime: { type: Date, default: null }, // End time chosen by the invitee
  },
  ticketLink: { type: String, default: '' }, // Unique ticket link for the invite
  qrCode: { type: String, default: '' }, // QR code for the ticket link
  ticketLinkExpiry: { type: Date, default: null }, // Expiry time for the ticket link
});

// Method to generate a secure ticket link
inviteSchema.methods.generateTicketLink = function () {
  const randomString = crypto.randomBytes(16).toString('hex'); // Generate a random string
  return `http://yourdomain.com/ticket/${randomString}`; // Return the ticket link
};

// Method to generate an iCAL file for the guest based on their RSVP
inviteSchema.methods.generateICalForGuest = function (event) {
  const cal = ical({ domain: 'yourdomain.com', name: 'Event Invitation' });

  cal.createEvent({
    start: this.rsvpStatus.startTime || event.startTime, // Use RSVP start time or event start time
    end: this.rsvpStatus.endTime || event.endTime, // Use RSVP end time or event end time
    summary: event.type, // Event type (e.g., Birthday, Wedding)
    description: event.additionalDetails || 'No additional details provided.', // Event description
    location: `${event.location.latitude}, ${event.location.longitude}`, // Event location
    url: this.ticketLink, // Ticket link for the guest
  });

  return cal.toString(); // Return the iCAL content as a string
};

module.exports = mongoose.model('Invite', inviteSchema); // Export the Invite model