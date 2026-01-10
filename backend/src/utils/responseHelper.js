/**
 * Standardized API Response Utilities
 */

/**
 * Success Response
 */
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        status: 'success',
        message,
        data,
        timestamp: new Date().toISOString()
    });
};

/**
 * Error Response
 */
const errorResponse = (res, message, statusCode = 500, errors = null) => {
    const response = {
        status: 'error',
        message,
        timestamp: new Date().toISOString()
    };
    
    if (errors) {
        response.errors = errors;
    }
    
    return res.status(statusCode).json(response);
};

/**
 * Pagination Helper
 */
const getPaginationParams = (req) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    
    return { page, limit, skip };
};

/**
 * Paginated Response
 */
const paginatedResponse = (res, data, page, limit, total, message = 'Success') => {
    const totalPages = Math.ceil(total / limit);
    
    return res.status(200).json({
        status: 'success',
        message,
        data,
        pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        },
        timestamp: new Date().toISOString()
    });
};

module.exports = {
    successResponse,
    errorResponse,
    getPaginationParams,
    paginatedResponse
};
