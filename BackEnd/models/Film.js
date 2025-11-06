const mongoose = require('mongoose');

const filmSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  description: { type: String },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Film', filmSchema);
