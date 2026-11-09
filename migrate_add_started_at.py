
from sqlalchemy import inspect, text
from backend.app.database import engine

inspector = inspect(engine)

columns = [
    column["name"]
    for column in inspector.get_columns("assessment_assignments")
]

if "started_at" not in columns:
    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE assessment_assignments "
                "ADD COLUMN started_at DATETIME NULL"
            )
        )

    print("SUCCESS: started_at column added.")
else:
    print("INFO: started_at column already exists.")
