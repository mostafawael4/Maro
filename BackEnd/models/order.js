const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  // optional metadata fields for order form (client name, notes, date etc)
  clientName: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['pending','in-progress','done'], default: 'pending' },
  images: [{ filename: String, url: String, uploadedAt: Date }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

OrderSchema.pre('save', function(next){
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', OrderSchema);