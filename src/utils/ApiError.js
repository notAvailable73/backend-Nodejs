class ApiError extends Error {
    constructor(
        statusCode, 
        errors =[], 
        message = 'An error occurred'
    ) {
        super(message);
        this.statusCode = statusCode;
        this.success = false;
        this.errors = errors;
        this.message = message;
    }
    send(res){
        res.status(this.statusCode).json({
            success: this.success,
            message: this.message,
            errors: this.errors
        })
    }
}

export { ApiError };