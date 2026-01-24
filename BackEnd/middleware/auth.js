export const requireAdminAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
};

export const requireEditorAuth = (req, res, next) => {
  if (req.session && req.session.isEditor) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
};

export const requireAdminOrEditorAuth = (req, res, next) => {
  if (req.session && (req.session.isAdmin || req.session.isEditor)) return next();
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
};
