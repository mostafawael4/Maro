import mongoose from 'mongoose';

async function connectDB(uri) {
  mongoose.set('strictQuery', false);
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('MongoDB connected');
}

export default connectDB;
