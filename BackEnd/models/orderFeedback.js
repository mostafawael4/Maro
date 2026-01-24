import mongoose from 'mongoose';

const FeedbackSchema = new mongoose.Schema({
  feedback: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

export default FeedbackSchema;
