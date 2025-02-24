const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const jsonfile = require('jsonfile');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const Invite = require('../models/Invite');
const Event = require('../models/Event');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(authMiddleware); // Apply authentication middleware to all routes

// Helper function to validate and process rows for bulk invites
function processRows(rows) {
  const rowsWithMissingGuests = rows.filter(row => !row.number_of_guests || row.number_of_guests.trim() === '');

  if (rowsWithMissingGuests.length > 0) {
    console.log(`Found ${rowsWithMissingGuests.length} rows with missing 'number_of_guests'.`);
    return { rows, rowsWithMissingGuests };
  }

  return { rows, rowsWithMissingGuests: [] };
}

// Bulk invite endpoint
router.post('/bulk', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  try {
    const filePath = file.path;
    let rows = [];

    // Parse file based on its extension
    switch (path.extname(file.originalname).toLowerCase()) {
      case '.csv':
        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (row) => rows.push(row))
            .on('end', resolve)
            .on('error', reject);
        });
        break;

      case '.json':
        rows = jsonfile.readFileSync(filePath);
        break;

      case '.xlsx':
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        break;

      default:
        return res.status(400).json({ message: 'Unsupported file format. Please upload CSV, JSON, or XLSX.' });
    }

    // Process rows to find missing number_of_guests
    const { rows: processedRows, rowsWithMissingGuests } = processRows(rows);

    // If there are rows with missing guests, prompt the user
    if (rowsWithMissingGuests.length > 0) {
      return res.status(400).json({
        message: 'Some rows have missing or empty "number_of_guests".',
        rowsWithMissingGuests,
        action: 'Please provide the missing values or confirm to default them to 1.',
      });
    }

    // Proceed to create invites
    const errors = [];
    for (const row of processedRows) {
      try {
        const event = await Event.findById(req.body.eventId); // Fetch the event ID from the request body
        if (!event) throw new Error('Event not found.');

        const invite = new Invite({
          eventId: event._id,
          type: 'bulk',
          guestsAllowed: parseInt(row.number_of_guests, 10),
          inviteeDetails: {
            name: row.name || null,
            email: row.email || null,
            whatsappNumber: row.phone || null,
          },
        });

        // Generate ticket link and QR code
        invite.ticketLink = invite.generateTicketLink();
        invite.qrCode = await QRCode.toDataURL(invite.ticketLink, { errorCorrectionLevel: 'H' });

        await invite.save();
      } catch (err) {
        errors.push(`Row failed: ${JSON.stringify(row)} - ${err.message}`);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Some rows failed validation.', errors });
    }

    res.status(200).json({ message: 'Bulk invites created successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'An error occurred while processing the file.' });
  }
});

// Route to create an individual invite
router.post('/create', async (req, res) => {
  try {
    const { eventId, type, guestsAllowed, inviteeDetails, ticketLinkExpiry } = req.body;

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Validate ticket link expiry
    if (
      !ticketLinkExpiry ||
      new Date(ticketLinkExpiry) <= new Date() ||
      new Date(ticketLinkExpiry) >= event.startTime
    ) {
      return res.status(400).json({
        error: 'Ticket link expiry must be after the current time and before the event start time',
      });
    }

    const invite = new Invite({
      eventId,
      type,
      guestsAllowed,
      inviteeDetails,
      ticketLinkExpiry,
    });

    // Generate ticket link and QR code
    invite.ticketLink = invite.generateTicketLink();
    invite.qrCode = await QRCode.toDataURL(invite.ticketLink, { errorCorrectionLevel: 'H' });

    await invite.save();
    res.status(201).json(invite);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// Route to RSVP for an invite
router.post('/rsvp/:inviteId', async (req, res) => {
  try {
    const { inviteId } = req.params;
    const { attending, startTime, duration, endTime } = req.body;

    // Find the invite and associated event
    const invite = await Invite.findById(inviteId).populate('eventId');
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    const event = invite.eventId;

    // Validate RSVP time range
    let rsvpStartTime, rsvpEndTime;
    if (attending === 'full') {
      rsvpStartTime = event.startTime;
      rsvpEndTime = event.endTime;
    } else if (startTime && duration) {
      rsvpStartTime = new Date(startTime);
      rsvpEndTime = new Date(rsvpStartTime.getTime() + duration * 60 * 60 * 1000);
    } else if (startTime && endTime) {
      rsvpStartTime = new Date(startTime);
      rsvpEndTime = new Date(endTime);
    } else {
      return res.status(400).json({ error: 'Invalid RSVP time range' });
    }

    // Ensure the RSVP time range is within the event duration
    if (rsvpStartTime < event.startTime || rsvpEndTime > event.endTime) {
      return res.status(400).json({ error: 'RSVP time range must be within the event duration' });
    }

    // Update RSVP status
    invite.rsvpStatus = {
      attending: true,
      startTime: rsvpStartTime,
      endTime: rsvpEndTime,
    };

    await invite.save();
    res.status(200).json(invite);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// Route to download an iCAL file for the guest
router.get('/:inviteId/ical', async (req, res) => {
  try {
    const { inviteId } = req.params;

    // Find the invite and associated event
    const invite = await Invite.findById(inviteId).populate('eventId');
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    // Generate iCAL content for the guest
    const icalContent = invite.generateICalForGuest(invite.eventId);

    // Send the iCAL file as a response
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', `attachment; filename=invite_${inviteId}.ics`);
    res.send(icalContent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// Route to share the iCAL file via email or WhatsApp
router.post('/:inviteId/share-ical', async (req, res) => {
  try {
    const { inviteId } = req.params;
    const { method } = req.body; // method: 'email' or 'whatsapp'

    // Find the invite and associated event
    const invite = await Invite.findById(inviteId).populate('eventId');
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    // Generate iCAL content for the guest
    const icalContent = invite.generateICalForGuest(invite.eventId);

    // Configure Twilio client for WhatsApp
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    if (method === 'email' && invite.inviteeDetails.email) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: invite.inviteeDetails.email,
        subject: 'Your Event iCAL File',
        text: 'Please find attached your personalized iCAL file for the event.',
        attachments: [
          {
            filename: `invite_${inviteId}.ics`,
            content: icalContent,
          },
        ],
      };

      try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'iCAL file sent via email successfully!' });
      } catch (error) {
        console.error(`Failed to send email to ${invite.inviteeDetails.email}:`, error.message);
        res.status(500).json({ error: 'Failed to send iCAL file via email.' });
      }
    }

    if (method === 'whatsapp' && invite.inviteeDetails.whatsappNumber) {
      const whatsappMessage = `Here is your personalized iCAL file for the event: ${invite.ticketLink}`;

      try {
        await twilioClient.messages.create({
          body: whatsappMessage,
          from: process.env.TWILIO_WHATSAPP_NUMBER, // Your Twilio WhatsApp number
          to: `whatsapp:${invite.inviteeDetails.whatsappNumber}`, // Recipient's WhatsApp number
        });
        res.status(200).json({ message: 'iCAL file link sent via WhatsApp successfully!' });
      } catch (error) {
        console.error(`Failed to send WhatsApp message to ${invite.inviteeDetails.whatsappNumber}:`, error.message);
        res.status(500).json({ error: 'Failed to send iCAL file link via WhatsApp.' });
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

module.exports = router; // Export the invite routes 