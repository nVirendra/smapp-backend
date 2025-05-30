const cloudinary = require('cloudinary').v2;
const { ENV } = require('../config/env');

cloudinary.config({
  cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
  api_key: ENV.CLOUDINARY_API_KEY,
  api_secret: ENV.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
