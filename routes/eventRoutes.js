const express = require('express');
const Event = require('../models/Event');
const authMiddleware = require('../middleware/authMiddleware');
const Joi = require('joi');
const ical = require('ical-generator');
const router = express.Router();

router.use(authMiddleware); // Apply authentication middleware to all routes

// Validation schema for event creation
const eventSchemaValidation = Joi.object({
  type: Joi.string().required(), // Type of event
  startTime: Joi.date().required(), // Start time of the event
  duration: Joi.number().min(1), // Duration of the event in hours
  endTime: Joi.date(), // End time of the event
  location: Joi.object({
    latitude: Joi.number().required(), // Latitude of the event location
    longitude: Joi.number().required(), // Longitude of the event location
  }).required(),
  additionalDetails: Joi.string().allow('').optional(), // Additional details about the event
}).xor('duration', 'endTime'); // Either duration or endTime must be provided

// Route to create an event
router.post('/create', async (req, res) => {
  try {
    // Validate input
    const { error } = eventSchemaValidation.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { type, startTime, duration, endTime, location, additionalDetails } = req.body;

    // Calculate end time if duration is provided
    let utcEndTime;
    if (duration) {
      utcEndTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000); // Add duration in milliseconds
    } else {
      utcEndTime = new Date(endTime);
    }

    // Validate that the event time is in the future
    if (new Date(startTime) <= new Date()) {
      return res.status(400).json({ error: 'Event start time must be in the future' });
    }

    // Create the event
    const event = new Event({
      host: req.userId,
      type,
      startTime: new Date(startTime),
      endTime: utcEndTime,
      location,
      additionalDetails,
    });
    await event.save();
    res.status(201).json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// Route to download an iCAL file for the event
router.get('/:eventId/ical', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Generate iCAL content
    const cal = ical({ domain: 'yourdomain.com', name: 'Event Details' });

    cal.createEvent({
      start: event.startTime,
      end: event.endTime,
      summary: event.type,
      description: event.additionalDetails || 'No additional details provided.',
      location: `${event.location.latitude}, ${event.location.longitude}`,
    });

    // Send the iCAL file as a response
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', `attachment; filename=event_${eventId}.ics`);
    res.send(cal.toString());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

module.exports = router; // Export the event routes