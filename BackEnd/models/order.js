import mongoose from 'mongoose';
import OrderFormSchema from './orderForm.js'
import FeedbackSchema from './orderFeedback.js'

const OrderSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  // optional metadata fields for order form (client name, notes, date etc)
  clientName: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['pending','in-progress','done'], default: 'pending' },
  orderBackground: {
    image: { type: String, default: null }, // Background image URL for order
    filename: { type: String, default: null }, // Background image filename
    selectedAt: { type: Date, default: Date.now },
  },
  media: [{ 
    foldername:{ type: String },
    filename: String, 
    originalName: { type: String }, // Original filename before upload
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

export default mongoose.model('Order', OrderSchema);