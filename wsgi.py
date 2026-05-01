import os
from app import app, db, seed_database

with app.app_context():
    try:
        db.create_all()
        seed_database()
        print("✅ Database initialized successfully.")
    except Exception as e:
        print(f"⚠️ DB init warning: {e}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    app.run(host='0.0.0.0', port=port)