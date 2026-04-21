import express from 'express';
const router = express.Router();

import Feedbacks from '../models/Feedbacks.js';
import Order from '../models/order.js';

// Create a new feedback
router.post('/', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback) {
      return res.status(400).json({ error: 'Feedback is required.' });
    }
    const newFeedback = new Feedbacks({ feedback });
    await newFeedback.save();
    res.status(201).json(newFeedback);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create feedback.', details: err.message });
  }
});

// Delete a feedback by ID
router.delete('/:id', async (req, res) => {
  try {
    const feedbackId = req.params.id;
    const deletedFeedback = await Feedbacks.findByIdAndDelete(feedbackId);
    if (!deletedFeedback) {
      return res.status(404).json({ error: 'Feedback not found.' });
    }
    res.json({ message: 'Feedback deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete feedback.', details: err.message });
  }
});

// Get all feedbacks from Feedbacks and all feedbacks from all Orders
router.get('/all', async (req, res) => {
  try {
    // Get from Feedbacks collection
    const generalFeedbacks = await Feedbacks.find({}).lean();

    // Get feedbacks embedded in each order (include background + names)
    const orders = await Order.find(
      {},
      { feedbacks: 1, _id: 1, orderBackground: 1, 'orderForm.brideAndGroomNames': 1 }
    ).lean();
    const orderFeedbacks = [];
    orders.forEach(order => {
      if (order.feedbacks && Array.isArray(order.feedbacks)) {
        order.feedbacks.forEach(fb => {
          orderFeedbacks.push({
            ...fb,
            orderId: order._id,
            backgroundImage: order.orderBackground?.thumbnail || order.orderBackground?.image || null,
            brideAndGroomNames: order.orderForm?.brideAndGroomNames || null
          });
        });
      }
    });

    res.json({
      generalFeedbacks,
      orderFeedbacks
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feedbacks.', details: err.message });
  }
});

export default router;
