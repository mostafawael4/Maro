import { MulterError } from "multer";

// Custom error handling middleware for Multer errors
export const handleMulterErrors = (error, req, res, next) => {
  console.log(req.body)
  if (error instanceof MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(413).json({ message: "File size limit exceeded" });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({ message: "Too many files" });
      case "LIMIT_FIELD_COUNT":
        return res.status(400).json({ message: "Too many fields" });
      case "LIMIT_UNEXPECTED_FILE":
        return res
          .status(400)
          .json({
            message: "expect a field called media, but found something else",
          });
      default:
        return res.status(500).json({ message: "Internal server error" });
    }
  }
  next(error); // Pass any other errors to the next middleware function
};
