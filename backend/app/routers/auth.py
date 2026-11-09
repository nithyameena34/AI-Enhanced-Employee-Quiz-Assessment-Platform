from fastapi import APIRouter, Depends, HTTPException
from hmac import compare_digest
from backend.app.config import settings
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas import RegisterIn, LoginIn
from backend.app.security import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if data.role == "admin":
        if not settings.admin_registration_code:
            raise HTTPException(status_code=403, detail="Admin self-registration is disabled. Ask the system owner to configure ADMIN_REGISTRATION_CODE or create the admin from the terminal.")
        if not compare_digest(data.admin_code, settings.admin_registration_code):
            raise HTTPException(status_code=403, detail="The admin setup code is incorrect")
    user = User(name=data.name.strip(), email=email, password_hash=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Registration successful. You can now sign in.", "user_id": user.id}

@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Your account is inactive")
    if user.role != data.role:
        raise HTTPException(status_code=403, detail=f"This account is registered as {user.role}. Choose {user.role.title()} on the sign-in page.")
    return {"access_token": create_access_token(user), "token_type": "bearer",
            "user": {"id": user.id, "name": user.name, "email": user.email, "role": user.role}}

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
