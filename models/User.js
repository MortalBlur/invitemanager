const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Define the User schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true }, // User's full name
  email: { type: String, unique: true, required: true }, // User's email address
  password: { type: String }, // Hashed password for email-based signup
  googleId: { type: String, unique: true, sparse: true }, // Google ID for OAuth login
  isVerified: { type: Boolean, default: false }, // Whether the user has verified their email
  otp: { type: String, default: null }, // One-time password for email verification
  otpExpiresAt: { type: Date, default: null }, // Expiry time for the OTP
});

// Index for email to ensure uniqueness
userSchema.index({ email: 1 }, { unique: true });

// Hash the password before saving the user to the database
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Skip hashing if password isn't modified
  const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10; // Use salt rounds from .env
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS); // Hash the password
  next();
});

// Method to compare a candidate password with the stored hashed password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password); // Returns true if passwords match
};

module.exports = mongoose.model('User', userSchema); // Export the User model