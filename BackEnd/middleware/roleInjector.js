// Injects req.session.isAdmin/isEditor into every JSON response (if session exists)
module.exports = function roleInjector(req, res, next) {
  const oldJson = res.json;
  res.json = function (body) {
    if (req.session) {
      body = body || {};
      body.session = body.session || {};
      if (typeof req.session.isAdmin !== 'undefined') {
        body.session.isAdmin = req.session.isAdmin;
      }
      if (typeof req.session.isEditor !== 'undefined') {
        body.session.isEditor = req.session.isEditor;
      }
    }
    return oldJson.call(this, body);
  };
  next();
};
