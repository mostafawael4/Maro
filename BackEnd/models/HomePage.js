const mongoose = require('mongoose');

const homePageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HomePage', homePageSchema);
