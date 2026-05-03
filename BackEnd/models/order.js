import mongoose from 'mongoose';
import OrderFormSchema from './orderForm.js'
import FeedbackSchema from './orderFeedback.js'

const OrderSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  // optional metadata fields for order form (client name, notes, date etc)
  clientName: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['pending', 'in-progress', 'done'], default: 'pending' },
  orderBackground: {
    image: { type: String, default: null }, // Background image URL for order (original)
    thumbnail: { type: String, default: null }, // Background image thumbnail URL (400w)
    filename: { type: String, default: null }, // Background image filename
    selectedAt: { type: Date, default: Date.now },
  },
  media: [{
    foldername: { type: String },
    filename: String,
    originalName: { type: String }, // Original filename before upload
    url: String,
    size: { type: Number, default: 0 }, // File size in bytes
    uploadedAt: Date,
    thumbnail: { type: String, default: null }, // Thumbnail URL (400w)
    thumbnailFilename: { type: String, default: null }, // Thumbnail filename
    medium: { type: String, default: null }, // Medium URL (1200w)
    hero: { type: String, default: null }, // Hero URL (2000w)
  }],
  feedbacks: [FeedbackSchema],
  selectedMedia: [{ type: mongoose.Schema.Types.ObjectId }],
  mediaPassword: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  orderForm: OrderFormSchema,
});

OrderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Order', OrderSchema);