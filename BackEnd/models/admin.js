import mongoose from 'mongoose';

const AdminSchema = new mongoose.Schema({
  username: { type: String, default: 'admin', unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Admin', AdminSchema);