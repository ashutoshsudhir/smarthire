from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit import Event, record
from ..database import get_db
from ..deps import current_user
from ..models import Candidate, User
from ..schemas import LoginRequest, LoginResponse, UserOut
from ..security import create_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(db: Session, user: User) -> UserOut:
    cand = db.query(Candidate).filter(Candidate.user_id == user.id).first()
    return UserOut(id=user.id, username=user.username, role=user.role, display_name=user.display_name,
                   email=user.email, candidate_id=cand.id if cand else None)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username.strip()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        record(db, Event.LOGIN_FAILED, None, username=body.username.strip()[:64])
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    if body.role and body.role != user.role:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"This account is not a{'n' if user.role[0] in 'aeiou' else ''} {body.role} account")
    record(db, Event.LOGIN, user)
    db.commit()
    return LoginResponse(access_token=create_token(user.id, user.username, user.role), user=user_out(db, user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_out(db, user)
