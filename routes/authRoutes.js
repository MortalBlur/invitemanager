const express = require('express');
const passport = require('passport');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Configure email transporter for sending OTPs
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Rate limiter to prevent abuse of OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  message: 'Too many OTP requests. Please try again later.',
});

// Route to sign up a user via email
router.post('/signup/email', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ error: 'User already exists' });

    user = new User({ name, email, password });
    await user.save();

    const otp = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: false });
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email',
      text: `Your OTP is: ${otp}`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'OTP sent to your email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// Route to verify the OTP sent to the user's email
router.post('/verify-otp', otpLimiter, async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.otp !== otp || Date.now() > user.otpExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ message: 'Email verified successfully', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// Route to resend the OTP if it expires or is not received
router.post('/resend-otp', otpLimiter, async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Allow resend after a cooldown period (e.g., 1 minute)
    if (user.otpExpiresAt && Date.now() < user.otpExpiresAt - 9 * 60 * 1000) {
      return res.status(400).json({ error: 'Please wait before requesting a new OTP.' });
    }

    const otp = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: false });
    user.otp = otp;
    user.otpExpiresAt = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify Your Email',
      text: `Your new OTP is: ${otp}`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'New OTP sent to your email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// Configure Google OAuth strategy
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            isVerified: true,
          });
          await user.save();
        }
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Route to initiate Google OAuth login
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Route to handle Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const token = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.redirect(`/dashboard?token=${token}`);
  }
);

module.exports = router; // Export the authentication routes