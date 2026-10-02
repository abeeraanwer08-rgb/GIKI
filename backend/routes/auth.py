"""Sign-up, login, email verification, password reset, and the dependencies that protect every other route."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    SignupRequest,
    UserOut,
    VerifyEmailRequest,
)
from services.auth import (
    AuthService,
    EmailTakenError,
    InvalidCodeError,
    InvalidCredentialsError,
    PendingCode,
    Session,
    is_verified,
    normalize_email,
)
from services.auth_limits import AuthLimits, client_ip, get_auth_limits
from services.email_sender import EmailSender, build_sender, code_email, send_safely
from services.supabase_client import SupabaseConfigurationError, SupabaseConnectionError
from services.tokens import AuthConfigurationError, InvalidTokenError, TokenUser, verify_token

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

_bearer = HTTPBearer(auto_error=False)
_auth_service = AuthService()
_email_sender = build_sender()

FORGOT_MESSAGE = "If an account exists for that email, we've sent a reset code."


def get_auth_service() -> AuthService:
    return _auth_service


def get_email_sender() -> EmailSender:
    return _email_sender


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": message},
        headers={"WWW-Authenticate": "Bearer"},
    )


def _too_many(seconds: int, what: str = "attempts") -> HTTPException:
    minutes = max(1, -(-seconds // 60))
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "error": f"Too many {what}. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
            "retry_after": seconds,
        },
        headers={"Retry-After": str(seconds)},
    )


def get_current_account(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    service: AuthService = Depends(get_auth_service),
) -> TokenUser:
    """The signed-in account, verified or not. Used only by the verification endpoints."""
    if credentials is None:
        raise _unauthorized("Sign in to continue.")
    try:
        token_user = verify_token(credentials.credentials)
        # The token proves who signed in; the database says whether it is still good
        # (account still exists, password not reset since).
        row = service.get_account(token_user.id)
    except InvalidTokenError as exc:
        raise _unauthorized("Your session has expired. Please sign in again.") from exc
    except AuthConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Sign-in is not configured on the server."},
        ) from exc
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    if row is None or int(row.get("token_version") or 0) != token_user.token_version:
        raise _unauthorized("Your session has expired. Please sign in again.")
    return token_user


def get_current_user(
    account: TokenUser = Depends(get_current_account),
    service: AuthService = Depends(get_auth_service),
) -> TokenUser:
    """The signed-in, email-verified user, or 401 / 403. Protects every data route."""
    row = service.get_account(account.id)
    if row is None or not is_verified(row):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "email_not_verified", "message": "Verify your email address to continue."},
        )
    return account


def _user_out(user: TokenUser, verified: bool) -> UserOut:
    return UserOut(id=user.id, email=user.email, name=user.name, email_verified=verified)


def _response(session: Session) -> AuthResponse:
    return AuthResponse(token=session.token, user=_user_out(session.user, session.email_verified))


def _unavailable(exc: Exception) -> HTTPException:
    message = (
        "Sign-in is not configured on the server."
        if isinstance(exc, (AuthConfigurationError, SupabaseConfigurationError))
        else "Sign-in is temporarily unavailable."
    )
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"error": message})


def _queue_code_email(background: BackgroundTasks, sender: EmailSender, pending: PendingCode) -> None:
    from services.auth import CODE_TTL_SECONDS

    subject, text, html = code_email(pending.purpose, pending.name, pending.code, CODE_TTL_SECONDS // 60)
    # Sent after the response so how long it takes cannot reveal whether an account exists.
    background.add_task(send_safely, sender, pending.email, subject, text, html)


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account (a verification code is emailed)",
)
def signup(
    request: SignupRequest,
    http: Request,
    background: BackgroundTasks,
    service: AuthService = Depends(get_auth_service),
    sender: EmailSender = Depends(get_email_sender),
    limits: AuthLimits = Depends(get_auth_limits),
) -> AuthResponse:
    ip = client_ip(http)
    wait = limits.signup_by_ip.retry_after(ip)
    if wait:
        raise _too_many(wait, "sign-ups from this network")
    limits.signup_by_ip.record(ip)
    try:
        session, pending = service.signup(name=request.name, email=request.email, password=request.password)
    except EmailTakenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "An account with this email already exists."},
        ) from exc
    except (AuthConfigurationError, SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    _queue_code_email(background, sender, pending)
    return _response(session)


@router.post("/login", response_model=AuthResponse, summary="Sign in (rate limited)")
def login(
    request: LoginRequest,
    http: Request,
    service: AuthService = Depends(get_auth_service),
    limits: AuthLimits = Depends(get_auth_limits),
) -> AuthResponse:
    ip, email = client_ip(http), normalize_email(request.email)
    # Checked before the password so a locked account cannot be guessed at, and keyed
    # on the submitted email (not the account) so lockouts reveal nothing.
    wait = max(limits.login_by_email.retry_after(email), limits.login_by_ip.retry_after(ip))
    if wait:
        raise _too_many(wait, "sign-in attempts")
    try:
        session = service.login(email=request.email, password=request.password)
    except InvalidCredentialsError as exc:
        limits.login_by_email.record(email)
        limits.login_by_ip.record(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Incorrect email or password."},
        ) from exc
    except (AuthConfigurationError, SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    limits.login_by_email.reset(email)
    return _response(session)


@router.get("/me", response_model=UserOut, summary="The signed-in user")
def me(
    account: TokenUser = Depends(get_current_account),
    service: AuthService = Depends(get_auth_service),
) -> UserOut:
    row = service.get_account(account.id) or {}
    return _user_out(account, is_verified(row))


@router.post("/verify-email", response_model=UserOut, summary="Confirm your email with the emailed code")
def verify_email(
    request: VerifyEmailRequest,
    http: Request,
    account: TokenUser = Depends(get_current_account),
    service: AuthService = Depends(get_auth_service),
    limits: AuthLimits = Depends(get_auth_limits),
) -> UserOut:
    ip = client_ip(http)
    wait = limits.code_by_ip.retry_after(ip)
    if wait:
        raise _too_many(wait)
    limits.code_by_ip.record(ip)
    try:
        service.verify_email(account.id, request.code)
    except InvalidCodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": InvalidCodeError.MESSAGE}) from exc
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    return _user_out(account, True)


@router.post(
    "/resend-verification",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Email a new verification code (at most one a minute)",
)
def resend_verification(
    background: BackgroundTasks,
    account: TokenUser = Depends(get_current_account),
    service: AuthService = Depends(get_auth_service),
    sender: EmailSender = Depends(get_email_sender),
    limits: AuthLimits = Depends(get_auth_limits),
) -> MessageResponse:
    wait = limits.resend_by_user.retry_after(account.id)
    if wait:
        raise _too_many(wait, "requests")
    limits.resend_by_user.record(account.id)
    try:
        pending = service.resend_verification(account.id)
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    if pending:
        _queue_code_email(background, sender, pending)
    return MessageResponse(message="We've sent a new code.")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Email a password reset code (same answer whether or not the account exists)",
)
def forgot_password(
    request: ForgotPasswordRequest,
    http: Request,
    background: BackgroundTasks,
    service: AuthService = Depends(get_auth_service),
    sender: EmailSender = Depends(get_email_sender),
    limits: AuthLimits = Depends(get_auth_limits),
) -> MessageResponse:
    ip, email = client_ip(http), normalize_email(request.email)
    wait = max(limits.forgot_by_email.retry_after(email), limits.forgot_by_ip.retry_after(ip))
    if wait:
        raise _too_many(wait, "reset requests")
    limits.forgot_by_email.record(email)
    limits.forgot_by_ip.record(ip)
    try:
        pending = service.request_password_reset(request.email)
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    if pending:
        _queue_code_email(background, sender, pending)
    return MessageResponse(message=FORGOT_MESSAGE)


@router.post("/reset-password", response_model=MessageResponse, summary="Set a new password with the emailed code")
def reset_password(
    request: ResetPasswordRequest,
    http: Request,
    service: AuthService = Depends(get_auth_service),
    limits: AuthLimits = Depends(get_auth_limits),
) -> MessageResponse:
    ip = client_ip(http)
    wait = limits.code_by_ip.retry_after(ip)
    if wait:
        raise _too_many(wait)
    limits.code_by_ip.record(ip)
    try:
        service.reset_password(email=request.email, code=request.code, new_password=request.new_password)
    except InvalidCodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": InvalidCodeError.MESSAGE}) from exc
    except (SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    return MessageResponse(message="Your password has been reset. Sign in with the new password.")
