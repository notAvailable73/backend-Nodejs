class ApiResponse {
  constructor(statusCode, data, message = "success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message; 
  }

  send(res) {
    res.status(this.statusCode).json({
      message: this.message,
      data: this.data,
    });
  }
}

export { ApiResponse };