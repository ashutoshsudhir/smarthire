from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from .database import get_db
from .models import Candidate, Interview, Role, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(creds.credentials)
    except InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"This action requires role: {', '.join(roles)}")
        return user
    return checker


require_admin = require_roles(Role.ADMIN)


def get_candidate_or_404(db: Session, candidate_id: str) -> Candidate:
    cand = db.get(Candidate, candidate_id)
    if cand is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
    return cand


def active_interview(db: Session, candidate_id: str) -> Interview | None:
    return (
        db.query(Interview)
        .filter(Interview.candidate_id == candidate_id, Interview.status != "CANCELLED")
        .order_by(Interview.id.desc())
        .first()
    )


def ensure_can_view_candidate(db: Session, user: User, cand: Candidate) -> None:
    """Admin: any. Candidate: only self. Interviewer: only if assigned."""
    if user.role == Role.ADMIN:
        return
    if user.role == Role.CANDIDATE and cand.user_id == user.id:
        return
    if user.role == Role.INTERVIEWER:
        iv = active_interview(db, cand.id)
        if iv and iv.interviewer_id == user.id:
            return
    # 404 (not 403) so users can't probe for other candidates' existence
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate not found")
