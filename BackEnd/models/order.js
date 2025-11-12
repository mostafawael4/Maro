const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  // optional metadata fields for order form (client name, notes, date etc)
  clientName: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['pending','in-progress','done'], default: 'pending' },
  media: [{ filename: String, url: String, uploadedAt: Date }],
  feedbacks: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  orderForm: {
    brideAndGroomNames: { type: String },
    eventDate: { type: Date },
    eventType: [{ type: String }], // wedding, engagement, etc.
    eventVenue: { type: String },
    timelineOfDay: { type: String },
    shootersStartTime: { type: String },
    shootersEndTime: { type: String },
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
    tiktokIdeas: [{ type: String }],
  },

});

OrderSchema.pre('save', function(next){
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', OrderSchema);