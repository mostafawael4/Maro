const requireAdminAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
};

const requireEditorAuth = (req, res, next) => {
  if (req.session && req.session.isEditor) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
};

const requireAdminOrEditorAuth = (req, res, next) => {
  if (req.session && (req.session.isAdmin || req.session.isEditor)) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
};


module.exports = { requireAdminAuth, requireEditorAuth, requireAdminOrEditorAuth };  