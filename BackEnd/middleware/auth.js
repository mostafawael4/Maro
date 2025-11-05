const requireAdminAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
};

module.exports = { requireAdminAuth };  