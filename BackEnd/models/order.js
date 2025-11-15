const mongoose = require('mongoose');
const OrderFormSchema = require('./orderForm')
const FeedbackSchema = require('./feedback')

const OrderSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  // optional metadata fields for order form (client name, notes, date etc)
  clientName: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['pending','in-progress','done'], default: 'pending' },
  media: [{ 
    filename: String, 
    url: String, 
    uploadedAt: Date,
    thumbnail: { type: String, default: null }, // Thumbnail URL for videos
    thumbnailFilename: { type: String, default: null } // Thumbnail filename for videos
  }],
  feedbacks: [FeedbackSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  orderForm: OrderFormSchema,
});

OrderSchema.pre('save', function(next){
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', OrderSchema);