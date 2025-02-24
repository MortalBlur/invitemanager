const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate users using JWT
module.exports = async (req, res, next) => {
  try {
    // Extract the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    // Get the token from the header
    const token = authHeader.split(' ')[1];

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user by ID
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    // Attach the user ID to the request object for further use
    req.userId = user._id;

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};