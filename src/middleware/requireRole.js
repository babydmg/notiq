const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.member) return next();

    if (!roles.includes(req.member.role)) {
      return res.status(403).json({
        error: "You don't have permission to do this.",
      });
    }

    next();
  };

export default requireRole;
