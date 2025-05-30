const jwt = require('jsonwebtoken');
const { ENV } = require('../config/env');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    console.log('1:', 1);
    const decoded = jwt.verify(token, ENV.JWT_SECRET);
    console.log('2:', 2, decoded.userId);
    const user = await User.findById(decoded.userId).select('-password');
    console.log('3:', 3);
    if (!user) {
      res.status(401).json({ message: 'User  not found' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = authenticate;
