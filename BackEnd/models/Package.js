const mongoose = require('mongoose');

const extraSchema = new mongoose.Schema({
  name: String,
  price: String,
});

const collectionSchema = new mongoose.Schema({
  collectionName: { type: String, required: true },
  price: { type: String, required: true },
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

module.exports = mongoose.model('Packages', packageSchema);
