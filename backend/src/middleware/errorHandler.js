/**
 * Custom Error Class for Application Errors
 */
class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log error details
    console.error('❌ Error:', {
        message: err.message,
        status: err.statusCode,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method
    });

    // Development error response
    if (process.env.NODE_ENV === 'development') {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
            error: err,
            stack: err.stack
        });
    }

    // Production error response
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    }

    // Programming or unknown error: don't leak error details
    console.error('💥 CRITICAL ERROR:', err);
    return res.status(500).json({
        status: 'error',
        message: 'Something went wrong on the server'
    });
};

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(`Cannot find ${req.originalUrl} on this server`, 404);
    next(error);
};

module.exports = {
    AppError,
    errorHandler,
    asyncHandler,
    notFoundHandler
};
