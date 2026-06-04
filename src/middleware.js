const jwt = require('jsonwebtoken');

function verify(req, res, next, roles) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    if (roles && !roles.includes(payload.role)) return res.status(403).json({ error: 'Sem permissão' });
    req.user = payload;
    if (payload.role === 'admin') req.admin = payload;
    next();
  } catch { return res.status(401).json({ error: 'Token inválido ou expirado' }); }
}

const authAdmin = (req, res, next) => verify(req, res, next, ['admin']);
const authPrestador = (req, res, next) => verify(req, res, next, ['prestador']);
const authAny = (req, res, next) => verify(req, res, next, null);

module.exports = { authAdmin, authPrestador, authAny };
