import mongoose from 'mongoose';
const { Schema } = mongoose;

const pricingPackageSchema = new Schema({
  packageId: { type: Schema.Types.ObjectId, ref: 'Packages' },
  packageName: { type: String },
  packageDisplayName: { type: String },
}, { _id: false });

const pricingCollectionSchema = new Schema({
  packageId: { type: Schema.Types.ObjectId, ref: 'Packages' },
  packageName: { type: String },
  packageDisplayName: { type: String },
  collectionId: { type: Schema.Types.ObjectId },
  collectionName: { type: String },
  priceLabel: { type: String },
  priceValue: { type: Number },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const pricingExtraSchema = new Schema({
  packageId: { type: Schema.Types.ObjectId, ref: 'Packages' },
  packageName: { type: String },
  packageDisplayName: { type: String },
  extraId: { type: Schema.Types.ObjectId },
  extraName: { type: String },
  priceLabel: { type: String },
  priceValue: { type: Number },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const OrderFormSchema = new Schema({
  brideAndGroomNames: { type: String },
  assignedPhotographers: [{ type: String }],
  eventDate: { type: Date },
  eventType: [{ type: String }], // wedding, engagement, etc.
  eventVenue: { type: String },
  coupleDescription: { type: String },
  moodBoardLinks: [{ type: String }],
  favoriteSongs: [{ type: String }],
  specialMoments: { type: String },
  excludeShots: { type: String },
  vendors: {
    photographers: [{ type: String }],
    cinematographers: [{ type: String }],
    makeupArtist: { type: String },
    hairStylist: { type: String },
    dressDesigner: { type: String },
    eventPlanner: { type: String },
    dj: { type: String },
    lighting: { type: String },
    entertainment: { type: String },
    others: { type: String },
  },
  filmEditing: {
    includeAccessoriesShots: { type: Boolean },
    editSequence: { type: String, enum: ['chronological', 'random', 'no-preference'] },
    stylePreference: [{ type: String }], // romantic, fun, vintage, etc.
    highlightPreference: [{ type: String }], // family, friends, party shots...
    teaserStyleLinks: [{ type: String }],
  },
  socialMediaInspiration: [{ type: String }],
  pricing: {
    currency: { type: String, enum: ['EGP', 'AED', 'USD'], default: 'EGP' }, // currency at time of order
    packages: [pricingPackageSchema],
    collections: [pricingCollectionSchema],
    extras: [pricingExtraSchema],
    promoCode: { type: String },
    subtotal: { type: Number },
    discount: { type: Number },
    total: { type: Number },
    depositPaid: { type: Number },
    remainingBalance: { type: Number },
  },
});

export default OrderFormSchema;
