import mongoose from 'mongoose';

const ZipJobSchema = new mongoose.Schema({
  _id: { type: String }, // jobId used as primary key
  status: {
    type: String,
    enum: ['pending', 'building', 'ready', 'error'],
    default: 'pending',
  },
  folderName: { type: String, required: true },
  totalFiles: { type: Number, default: 0 },
  filesProcessed: { type: Number, default: 0 },
  progress: { type: Number, default: 0 }, // 0–100 percent
  downloadUrl: { type: String, default: null },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

// Auto-delete documents 2 hours after createdAt
ZipJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

export default mongoose.model('ZipJob', ZipJobSchema);
