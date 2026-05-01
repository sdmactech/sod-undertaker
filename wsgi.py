from app import app, db, seed_database

with app.app_context():
    db.create_all()
    seed_database()

if __name__ == '__main__':
    app.run()