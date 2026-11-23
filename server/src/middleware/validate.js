import { HttpError } from '../utils/HttpError.js';

// Validates req.body against a zod schema and replaces it with the parsed
// (trimmed / coerced) result.
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw new HttpError(400, details[0]?.message ?? 'Invalid request', details);
  }
  req.body = result.data;
  next();
};
