import mongoose from 'mongoose';

const extraSchema = new mongoose.Schema({
  name: String,
  price: String,          // EGP price (existing — do not change)
  priceAED: { type: String, default: null }, // AED price (optional)
  hiddenInUAE: { type: Boolean, default: false },
});

const collectionSchema = new mongoose.Schema({
  collectionName: { type: String, required: true },
  price: { type: String, required: true }, // EGP price (existing — do not change)
  priceAED: { type: String, default: null }, // AED price (optional)
  hiddenInUAE: { type: Boolean, default: false },
  duration: String,
  description: String,
  features: [String],
});

const packageSchema = new mongoose.Schema({
  packageName: { type: String, required: true },      // e.g. "cinematography"
  displayName: { type: String, required: true },      // e.g. "Cinematography Packages"
  collections: [collectionSchema],                    // Array of packages in that category
  extras: [extraSchema],                            // Optional extras
});

export default mongoose.model('Packages', packageSchema);

