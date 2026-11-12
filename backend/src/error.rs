use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: ErrorBody,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub code: &'static str,
    pub message: &'static str,
}

#[derive(Debug)]
pub enum AppError {
    NotFound,
    InvalidInput,
    InvalidCredentials,
    Forbidden,
    Conflict,
    Unavailable,
    Internal,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            Self::NotFound => (
                StatusCode::NOT_FOUND,
                ErrorResponse {
                    error: ErrorBody {
                        code: "not_found",
                        message: "The requested resource was not found.",
                    },
                },
            ),
            Self::InvalidInput => (
                StatusCode::BAD_REQUEST,
                ErrorResponse {
                    error: ErrorBody {
                        code: "invalid_input",
                        message: "The request is invalid.",
                    },
                },
            ),
            Self::InvalidCredentials => (
                StatusCode::UNAUTHORIZED,
                ErrorResponse {
                    error: ErrorBody {
                        code: "invalid_credentials",
                        message: "The email or password is invalid.",
                    },
                },
            ),
            Self::Forbidden => (
                StatusCode::FORBIDDEN,
                ErrorResponse {
                    error: ErrorBody {
                        code: "forbidden",
                        message: "This action is not allowed for this account.",
                    },
                },
            ),
            Self::Conflict => (
                StatusCode::CONFLICT,
                ErrorResponse {
                    error: ErrorBody {
                        code: "conflict",
                        message: "The request conflicts with existing data.",
                    },
                },
            ),
            Self::Unavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                ErrorResponse {
                    error: ErrorBody {
                        code: "unavailable",
                        message: "The service is temporarily unavailable.",
                    },
                },
            ),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorResponse {
                    error: ErrorBody {
                        code: "internal_error",
                        message: "An internal error occurred.",
                    },
                },
            ),
        };

        (status, Json(body)).into_response()
    }
}
