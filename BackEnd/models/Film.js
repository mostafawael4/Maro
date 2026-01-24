import mongoose from 'mongoose';

const filmSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  description: { type: String },
  thumbnail: { type: String, default: null }, // Thumbnail URL for videos
  thumbnailFilename: { type: String, default: null }, // Thumbnail filename for videos
  uploadedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Film', filmSchema);
