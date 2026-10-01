"""Sign-up, login, and the dependency that protects every other route."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserOut
from services.auth import AuthService, EmailTakenError, InvalidCredentialsError
from services.supabase_client import SupabaseConfigurationError, SupabaseConnectionError
from services.tokens import AuthConfigurationError, InvalidTokenError, TokenUser, verify_token

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

_bearer = HTTPBearer(auto_error=False)
_auth_service = AuthService()


def get_auth_service() -> AuthService:
    return _auth_service


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> TokenUser:
    """Resolve the signed-in user from the Authorization header, or answer 401."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Sign in to continue."},
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_token(credentials.credentials)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Your session has expired. Please sign in again."},
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except AuthConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Sign-in is not configured on the server."},
        ) from exc


def _response(user: TokenUser, token: str) -> AuthResponse:
    return AuthResponse(token=token, user=UserOut(id=user.id, email=user.email, name=user.name))


def _unavailable(exc: Exception) -> HTTPException:
    message = (
        "Sign-in is not configured on the server."
        if isinstance(exc, (AuthConfigurationError, SupabaseConfigurationError))
        else "Sign-in is temporarily unavailable."
    )
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"error": message})


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
def signup(request: SignupRequest, service: AuthService = Depends(get_auth_service)) -> AuthResponse:
    try:
        user, token = service.signup(name=request.name, email=request.email, password=request.password)
    except EmailTakenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "An account with this email already exists."},
        ) from exc
    except (AuthConfigurationError, SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    return _response(user, token)


@router.post("/login", response_model=AuthResponse, summary="Sign in")
def login(request: LoginRequest, service: AuthService = Depends(get_auth_service)) -> AuthResponse:
    try:
        user, token = service.login(email=request.email, password=request.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Incorrect email or password."},
        ) from exc
    except (AuthConfigurationError, SupabaseConfigurationError, SupabaseConnectionError) as exc:
        raise _unavailable(exc) from exc
    return _response(user, token)


@router.get("/me", response_model=UserOut, summary="The signed-in user")
def me(user: TokenUser = Depends(get_current_user)) -> UserOut:
    return UserOut(id=user.id, email=user.email, name=user.name)
