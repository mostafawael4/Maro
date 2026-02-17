import mongoose from 'mongoose';

const gallerySchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  thumbnail: { type: String },
  medium: { type: String },
  hero: { type: String },
  uploadedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Gallery', gallerySchema);
