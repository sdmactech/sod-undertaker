# ⚰️ SoD Undertaker Database
### Slimm Brinkman — Saint Denis Undertaker
**State of Deliverance · RedM · Red Dead Redemption II**

---

A professional web-based database for managing the Undertaker job in the State of Deliverance RedM server. Track burial items, ingredients, stock levels, payout values, and ROI — all in one place.

## Features

- **📦 Item Registry** — All burial items with payout values, craft costs, ingredients, and notes
- **⭐ Best Value Sort** — Ranks items by ROI % (Payout − Cost) ÷ Cost × 100
- **🗃️ Stock Tracking** — Live inventory for both finished burial items and raw ingredients
- **💰 Payout Calculator** — Select items + quantities to preview total payout and profit
- **🌿 Ingredient Storage** — Track raw material quantities with inline notes

## Tech Stack

- **Backend:** Python 3 / Flask / SQLAlchemy
- **Database:** SQLite (local) 
- **Frontend:** Vanilla JS / CSS — no frameworks
- **Font:** Cinzel + Crimson Text (Western/gothic aesthetic)

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
python app.py
# Visit http://localhost:5050
```

## Deploy to Railway (Recommended — Free & 24/7)

1. Fork or push this repo to your GitHub account
2. Go to [railway.app](https://railway.app) and sign in with GitHub
3. Click **New Project → Deploy from GitHub repo**
4. Select this repo — Railway auto-detects the `Procfile` and deploys
5. Your app will be live at a `*.railway.app` URL within ~2 minutes

## Deploy to Render (Alternative — Free)

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New → Web Service** and connect this repo
3. Set:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn wsgi:app`
4. Deploy — live at a `*.onrender.com` URL

## Environment Variables (Optional)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5050` | Port to run on |
| `SECRET_KEY` | built-in | Flask secret key — change for production |
| `DATABASE_URL` | `sqlite:///undertaker.db` | Database URI |

---

*"Every soul deserves a proper farewell."*