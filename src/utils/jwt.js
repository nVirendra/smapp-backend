const jwt = require('jsonwebtoken');
const { ENV } = require('../config/env');

const generateToken = (userId) => {
  return jwt.sign({ userId }, ENV.JWT_SECRET, { expiresIn: '1d' });
};

const decodeToken = (token) => {
  try {
    return jwt.verify(token, ENV.JWT_SECRET);
  } catch (err) {
    console.error('Invalid token:', err);
    return null;
  }
};

module.exports = {
  generateToken,
  decodeToken,
};
