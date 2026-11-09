from getpass import getpass
from sqlalchemy.orm import Session
from backend.app.database import Base, engine, SessionLocal
from backend.app.models import User
from backend.app.security import hash_password

def main():
    Base.metadata.create_all(bind=engine)
    name = input("Admin name: ").strip()
    email = input("Admin email: ").strip().lower()
    password = getpass("Admin password (8-72 characters): ")
    if len(password) < 8 or len(password) > 72:
        raise SystemExit("Password must contain 8 to 72 characters.")
    db: Session = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            raise SystemExit("That email already exists. Use a different email.")
        user = User(name=name, email=email, password_hash=hash_password(password),
                    role="admin", is_active=True)
        db.add(user); db.commit()
        print(f"Administrator account created for {email}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
