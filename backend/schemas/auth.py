"""Request and response shapes for sign-up and login."""

import re

from pydantic import BaseModel, Field, field_validator

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class _EmailMixin(BaseModel):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not _EMAIL.match(value):
            raise ValueError("Enter a valid email address.")
        return value


class SignupRequest(_EmailMixin):
    name: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter your name.")
        return value.strip()


class LoginRequest(_EmailMixin):
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    email_verified: bool = True


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class VerifyEmailRequest(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class ForgotPasswordRequest(_EmailMixin):
    pass


class ResetPasswordRequest(_EmailMixin):
    code: str = Field(min_length=4, max_length=12)
    new_password: str = Field(min_length=8, max_length=128)


class MessageResponse(BaseModel):
    message: str
